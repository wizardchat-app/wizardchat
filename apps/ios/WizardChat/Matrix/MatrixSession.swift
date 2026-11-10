import Foundation
import Network
import UIKit
import WizardChatCore

@MainActor
final class MatrixSession: ObservableObject {
    enum State: Equatable {
        case restoring
        case loggedOut
        case loggedIn
        case restoreFailed(String)
    }

    @Published private(set) var state: State = .restoring
    @Published private(set) var userId: String?
    @Published var displayName: String? { didSet { rememberProfile() } }
    @Published var avatarUrl: String? { didSet { rememberProfile() } }
    @Published private(set) var customStatus: CustomStatus?
    private var presenceVisible = true
    private var statusExpiry: Task<Void, Never>?
    @Published private(set) var syncState: SyncState = .idle
    @Published private(set) var connectionLost = false
    private var networkAvailable = true
    private var lostTimer: Task<Void, Never>?
    private let pathMonitor = NWPathMonitor()
    @Published private(set) var encryption: EncryptionStatus?
    @Published private(set) var needsEncryptionSetup = false
    @Published private(set) var needsVerification = false
    @Published private(set) var accounts: [Account] = []
    @Published var isAddingAccount = false

    struct Account: Identifiable, Equatable {
        let userId: String
        let displayName: String?
        let avatarUrl: String?
        var id: String { userId }
    }

    private(set) var client: WizardClient?
    private(set) var roomList: RoomListModel?
    private(set) var media: MediaLoader?
    private var stored: StoredSession?
    private var isRestoring = false
    private var subscriptions: [Subscription] = []
    private var pendingLogin: (login: PendingLogin, folder: String, store: StoreConfig)?

    static let deviceName = "WizardChat iOS"
    static let callbackScheme = "org.wizardchat"
    static let app = AppInfo(name: "WizardChat", clientUri: "https://wizardchat.org")

    var requireClient: WizardClient {
        get throws {
            guard let client else { throw WizardError.notSignedIn }
            return client
        }
    }

    func restore() async {
        // The screen and a background refresh can both ask; only restore once
        guard client == nil, !isRestoring else {
            while isRestoring { try? await Task.sleep(for: .milliseconds(100)) }
            return
        }
        isRestoring = true
        defer { isRestoring = false }
        reloadAccounts()
        while let stored = SessionStore.active() {
            do {
                let client = try await WizardClient.restore(session: stored.session, store: stored.store)
                SessionStore.setActive(stored.session.userId)
                start(client, stored: stored)
                return
            } catch let error as WizardError where error.errcode == "M_UNKNOWN_TOKEN" {
                // Only forget the account when the server says it's gone; anything else (offline,
                // a bug) keeps it so the user isn't signed out
                SessionStore.remove(stored.session.userId)
                Push.forget(stored.session.userId)
                MessageNotifier.removeDelivered(userId: stored.session.userId)
                reloadAccounts()
            } catch {
                state = .restoreFailed(error.localizedDescription)
                return
            }
        }
        state = .loggedOut
    }

    private func reloadAccounts() {
        accounts = SessionStore.all().map {
            Account(userId: $0.session.userId, displayName: $0.displayName, avatarUrl: $0.avatarUrl)
        }
    }

    func refreshAccountProfiles() async {
        guard let client else { return }
        for account in accounts where account.userId != userId {
            guard let profile = try? await client.userProfile(userId: account.userId) else { continue }
            SessionStore.updateProfile(account.userId, displayName: profile.displayName, avatarUrl: profile.avatarUrl)
        }
        reloadAccounts()
    }

    func switchAccount(to userId: String) async {
        guard userId != self.userId, !isRestoring, accounts.contains(where: { $0.userId == userId }) else { return }
        await close()
        SessionStore.setActive(userId)
        state = .restoring
        await restore()
    }

    func retryRestore() async {
        state = .restoring
        await restore()
    }

    func discover(_ server: String) async throws -> ServerInfo {
        try await WizardClient.discover(server: server)
    }

    func login(server: String, username: String, password: String) async throws {
        let (folder, store) = StoredSession.newStore()
        do {
            let client = try await WizardClient.loginPassword(
                server: server, username: username, password: password,
                deviceName: Self.deviceName, store: store
            )
            await remember(client, folder: folder, store: store)
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func register(server: String, username: String, password: String) async throws {
        let (folder, store) = StoredSession.newStore()
        do {
            let client = try await WizardClient.register(
                server: server, username: username, password: password,
                deviceName: Self.deviceName, token: nil, store: store
            )
            await remember(client, folder: folder, store: store)
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func loginWithQr(server: String, scanned: Data? = nil, control: QrLoginControl,
                     listener: @escaping @Sendable (QrLoginStatus) -> Void) async throws {
        let (folder, store) = StoredSession.newStore()
        do {
            let client = try await WizardClient.loginWithQr(server: server, store: store, app: Self.app, scanned: scanned,
                                                            control: control, listener: listener)
            await remember(client, folder: folder, store: store)
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func startBrowserLogin(server: String, sso: IdentityProvider? = nil, createAccount: Bool = false) async throws -> URL {
        await cancelBrowserLogin()
        let (folder, store) = StoredSession.newStore()
        let redirect = "\(Self.callbackScheme):/callback"
        do {
            let login: PendingLogin
            if let sso {
                login = try await WizardClient.startSsoLogin(server: server, store: store, redirectUri: redirect, idpId: sso.id)
            } else {
                login = try await WizardClient.startOAuthLogin(
                    server: server, store: store, redirectUri: redirect, app: Self.app, createAccount: createAccount
                )
            }
            guard let url = URL(string: login.url) else { throw WizardError.invalidLoginUrl }
            pendingLogin = (login, folder, store)
            return url
        } catch {
            SessionStore.removeStore(folder)
            throw error
        }
    }

    func finishBrowserLogin(callbackUrl: URL) async throws {
        guard let pending = pendingLogin else { throw WizardError.noPendingLogin }
        pendingLogin = nil
        do {
            let client = try await pending.login.finish(callbackUrl: callbackUrl.absoluteString, deviceName: Self.deviceName)
            await remember(client, folder: pending.folder, store: pending.store)
        } catch {
            SessionStore.removeStore(pending.folder)
            throw error
        }
    }

    func cancelBrowserLogin() async {
        guard let pending = pendingLogin else { return }
        pendingLogin = nil
        try? await pending.login.abort()
        SessionStore.removeStore(pending.folder)
    }

    /// Leaving the app: stop syncing so coming back starts a fresh connection (iOS freezes the
    /// app and its open connection goes stale). Calls keep syncing, they need room events.
    func pauseSync(keepRunning: Bool) async {
        guard !keepRunning, let client, syncState == .running else { return }
        try? await client.stopSync()
    }

    func resumeSync() async {
        guard let client, syncState != .running else { return }
        await adoptRefreshedSession(client)
        try? await client.startSync()
    }

    private func adoptRefreshedSession(_ client: WizardClient) async {
        guard var stored, let latest = SessionStore.all().first(where: { $0.session.userId == stored.session.userId }),
              latest.session != stored.session else { return }
        try? await client.adoptSession(session: latest.session)
        stored.session = latest.session
        self.stored = stored
    }

    init() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.networkChanged(path.status == .satisfied) }
        }
        pathMonitor.start(queue: .global(qos: .utility))
    }

    private func networkChanged(_ available: Bool) {
        let regained = available && !networkAvailable
        networkAvailable = available
        updateConnection()
        if regained, syncState == .error || syncState == .offline, let client {
            Task { try? await client.startSync() }
        }
    }

    private func updateConnection() {
        let lost = state == .loggedIn && (!networkAvailable || [.offline, .error, .terminated].contains(syncState))
        if lost {
            guard !connectionLost, lostTimer == nil else { return }
            lostTimer = Task {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                connectionLost = true
                lostTimer = nil
            }
        } else if syncState == .running || state != .loggedIn {
            lostTimer?.cancel()
            lostTimer = nil
            connectionLost = false
        }
    }

    /// Sync stops on network errors; try again after a moment
    private func syncStateChanged(_ state: SyncState) {
        syncState = state
        updateConnection()
        guard state == .error || state == .offline, let client else { return }
        guard UIApplication.shared.applicationState != .background else { return }
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.syncState == .error || self.syncState == .offline { try? await client.startSync() }
        }
    }

    private func rememberProfile() {
        guard var stored, stored.displayName != displayName || stored.avatarUrl != avatarUrl else { return }
        stored.displayName = displayName
        stored.avatarUrl = avatarUrl
        self.stored = stored
        SessionStore.save(stored)
        reloadAccounts()
    }

    var excludesInsecureDevices: Bool { stored?.excludeInsecureDevices ?? false }

    /// The client reads this when it's built, so it applies after `restart()`
    func setExcludeInsecureDevices(_ exclude: Bool) {
        guard var stored else { return }
        stored.excludeInsecureDevices = exclude
        self.stored = stored
        SessionStore.save(stored)
    }

    /// Builds the client again from the stored session, like reloading the web app
    func restart() async {
        guard stored != nil else { return }
        await close()
        state = .restoring
        await restore()
    }

    func checkIdentity() {
        guard let client, let userId, let status = encryption, status.recovery != "unknown" else { return }
        Task { [weak self] in
            guard let hasIdentity = try? await client.userTrust(userId: userId).hasIdentity,
                  let self, self.client === client else { return }
            needsEncryptionSetup = !hasIdentity
            needsVerification = hasIdentity && encryption?.deviceVerified == false
        }
    }

    func logout() async {
        try? await client?.logout()
        if let stored { await forget(stored) }
    }

    func loadSyncedSettings() async -> [String: JSONValue]? {
        guard case .object(let content) = try? await client?.accountData(eventType: AppPreferences.syncedAccountDataType)
        else { return nil }
        return content
    }

    func saveSyncedSettings(_ settings: [String: JSONValue]) async {
        guard let client else { return }
        var content = await loadSyncedSettings() ?? [:]
        content.merge(settings) { _, new in new }
        try? await client.setAccountData(eventType: AppPreferences.syncedAccountDataType, content: .object(content))
    }

    func applyPresence(_ visible: Bool) async {
        presenceVisible = visible
        try? await client?.setPresence(presence: visible ? .online : .offline, statusMsg: customStatus?.text)
    }

    func setCustomStatus(_ text: String, expiresAt: Date?) async throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let presence: Presence = presenceVisible ? .online : .offline
        if trimmed.isEmpty {
            try await requireClient.clearCustomStatus(presence: presence)
            showCustomStatus(nil)
        } else {
            let millis = expiresAt.map { ($0.timeIntervalSince1970 * 1000).rounded() }
            try await requireClient.setCustomStatus(text: trimmed, expiresAt: millis, presence: presence)
            showCustomStatus(CustomStatus(text: trimmed, expiresAt: millis.map { Int($0) }))
        }
    }

    private func showCustomStatus(_ status: CustomStatus?) {
        statusExpiry?.cancel()
        let expiry = status?.expiresAt.map { Date(timeIntervalSince1970: Double($0) / 1000) }
        if let expiry, expiry <= .now {
            customStatus = nil
            return
        }
        customStatus = status
        guard let expiry else { return }
        statusExpiry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(expiry.timeIntervalSinceNow))
            guard !Task.isCancelled else { return }
            try? await self?.setCustomStatus("", expiresAt: nil)
        }
    }

    func refreshProfile() async {
        guard let profile = try? await client?.ownProfile() else { return }
        displayName = profile.displayName
        avatarUrl = profile.avatarUrl
        showCustomStatus(profile.customStatus)
    }

    private func remember(_ client: WizardClient, folder: String, store: StoreConfig) async {
        let stored = StoredSession(session: client.session, storeFolder: folder, passphrase: store.passphrase ?? "")
        await close()
        let replaced = SessionStore.all().first { $0.session.userId == stored.session.userId }
        if let replaced, replaced.storeFolder != folder { SessionStore.removeStore(replaced.storeFolder) }
        SessionStore.save(stored)
        SessionStore.setActive(stored.session.userId)
        reloadAccounts()
        isAddingAccount = false
        start(client, stored: stored)
    }

    private func close() async {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        roomList?.stop()
        roomList = nil
        media = nil
        let client = self.client
        self.client = nil
        stored = nil
        userId = nil
        displayName = nil
        avatarUrl = nil
        statusExpiry?.cancel()
        customStatus = nil
        encryption = nil
        needsEncryptionSetup = false
        needsVerification = false
        syncState = .idle
        try? await client?.stopSync()
    }

    private func start(_ client: WizardClient, stored: StoredSession) {
        self.client = client
        self.stored = stored
        userId = client.userId
        displayName = stored.displayName
        avatarUrl = stored.avatarUrl
        roomList = RoomListModel(client: client)
        media = MediaLoader(client: client)
        Push.activeClient = client
        Push.start()
        Task { await Push.registerAll() }
        subscriptions = [
            client.watchSession { [weak self] event in
                MainActor.assumeIsolated { self?.sessionChanged(event) }
            },
            client.watchEncryptionStatus { [weak self] status in
                MainActor.assumeIsolated {
                    self?.encryption = status
                    self?.checkIdentity()
                }
            },
        ]
        Task { [weak self] in
            guard let self else { return }
            // The sync state and room list come from the sync service, so start it first;
            // offline at launch, keep trying until it starts
            while (try? await client.startSync()) == nil {
                guard self.client === client else { return }
                syncState = .offline
                try? await Task.sleep(for: .seconds(3))
            }
            guard self.client === client else { return }
            subscriptions.append(client.watchSyncState { [weak self] state in
                MainActor.assumeIsolated { self?.syncStateChanged(state) }
            })
            roomList?.start()
            encryption = try? await client.encryptionStatus()
            checkIdentity()
            await refreshProfile()
        }
        Task { [weak self] in await self?.refreshProfile() }
        state = .loggedIn
    }

    private func sessionChanged(_ event: SessionEvent) {
        switch event {
        case .refreshed(let refreshed):
            guard var stored else { return }
            stored.session = refreshed.session
            self.stored = stored
            SessionStore.save(stored)
        case .invalid:
            if let stored { Task { await forget(stored) } }
        }
    }

    private func forget(_ stored: StoredSession) async {
        await close()
        SessionStore.remove(stored.session.userId)
        Push.forget(stored.session.userId)
        MessageNotifier.removeDelivered(userId: stored.session.userId)
        reloadAccounts()
        state = .restoring
        await restore()
    }
}

extension WizardError {
    static let notSignedIn = WizardError(code: "notSignedIn", message: String(localized: "common.somethingWentWrong"))
    static let invalidLoginUrl = WizardError(code: "homeserver", message: String(localized: "auth.oidcLoginFailed"))
    static let noPendingLogin = WizardError(code: "expired", message: String(localized: "auth.popupClosed"))
}
