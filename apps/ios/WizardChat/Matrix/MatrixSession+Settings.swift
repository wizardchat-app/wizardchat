import Foundation
import Security
import WizardChatCore

extension MatrixSession {
    var isOAuthAccount: Bool { client?.session.oauthClientId != nil }
    var deviceId: String? { client?.session.deviceId }

    func accountManagementUrl() async -> URL? {
        guard let string = try? await client?.accountManagementUrl() else { return nil }
        return URL(string: string)
    }

    func setDisplayName(_ name: String) async throws {
        try await requireClient.setDisplayName(name: name)
        displayName = name
    }

    func setAvatar(_ data: Data, mimeType: String) async throws {
        avatarUrl = try await requireClient.setAvatar(bytes: data, mimetype: mimeType)
    }

    func removeAvatar() async throws {
        try await requireClient.removeAvatar()
        avatarUrl = nil
    }

    /// Runs an account operation protected by user-interactive auth: first without, then with the
    /// password the screen already asked for, if the server wants confirmation.
    private func withPassword(_ password: String?, _ run: (UiaAuth?) async throws -> UiaOutcome) async throws {
        guard case .authRequired(let challenge) = try await run(nil) else { return }
        guard let password, !password.isEmpty else {
            throw WizardError(code: "passwordRequired", message: String(localized: "settings.account.authMethodUnsupported"))
        }
        if case .authRequired = try await run(.password(UiaAuth.Password(password: password, session: challenge.session))) {
            throw WizardError(code: "invalidCredentials", message: String(localized: "auth.errors.credentials"))
        }
    }

    func changePassword(current: String, new: String) async throws {
        let client = try requireClient
        try await withPassword(current) { try await client.changePasswordWithAuth(newPassword: new, auth: $0) }
    }

    func emailAddresses() async throws -> [String] {
        try await requireClient.emailAddresses().filter { $0.medium == "email" }.map(\.address)
    }

    func requestEmailToken(_ email: String) async throws -> (sid: String, secret: String) {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let secret = bytes.map { String(format: "%02x", $0) }.joined()
        let sid = try await requireClient.requestEmailToken(email: email, secret: secret, attempt: 1)
        return (sid, secret)
    }

    func addEmail(sid: String, secret: String, password: String?) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.addEmailWithAuth(secret: secret, sid: sid, auth: $0) }
    }

    func removeEmail(_ email: String) async throws {
        try await requireClient.removeEmail(address: email)
    }

    func deactivateAccount(password: String, eraseData: Bool) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.deactivateAccountWithAuth(erase: eraseData, auth: $0) }
        await logout()
    }

    func deleteDevices(_ deviceIds: [String], password: String?) async throws {
        let client = try requireClient
        try await withPassword(password) { try await client.deleteDevicesWithAuth(deviceIds: deviceIds, auth: $0) }
    }

    func uploadMedia(_ data: Data, mimeType: String) async throws -> String {
        try await requireClient.uploadMedia(data: data, mimetype: mimeType)
    }

    func recover(with recoveryKey: String) async throws {
        try await requireClient.recover(recoveryKey: recoveryKey.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func hasEncryptionIdentity() async -> Bool? {
        guard let client, let userId else { return nil }
        return try? await client.userTrust(userId: userId).hasIdentity
    }

    /// A new encryption identity; OAuth accounts approve it on their account page (`approve`),
    /// others confirm with their password
    func resetIdentity(password: String?, approve: @escaping @Sendable (URL) -> Void) async throws {
        let client = try requireClient
        try await withPassword(password) { auth in
            try await client.resetIdentityWithAuth(auth: auth) { url in
                if let url = URL(string: url) { approve(url) }
            }
        }
    }

    func canLinkDevices() async -> Bool {
        guard isOAuthAccount, let server = client?.session.homeserverUrl else { return false }
        return (try? await WizardClient.discover(server: server).qrLogin) ?? false
    }

    func linkDevice(scanned: Data?, control: QrLoginControl, listener: @escaping @Sendable (QrLoginStatus) -> Void) async throws {
        try await requireClient.grantLoginWithQr(scanned: scanned, control: control, listener: listener)
    }

    func cancelIdentityReset() async {
        try? await client?.cancelIdentityReset()
    }

    func enableRecovery() async throws -> String {
        try await requireClient.enableRecovery()
    }

    func resetRecoveryKey() async throws -> String {
        try await requireClient.resetRecoveryKey()
    }

    func createRoom(name: String, topic: String?, isPublic: Bool, encrypted: Bool, isVoice: Bool,
                    alias: String?, spaceId: String?, federate: Bool = true, spaceMembers: Bool = false,
                    founders: [String] = [], roomVersion: String? = nil, isSpace: Bool = false) async throws -> String {
        try await requireClient.createRoom(options: CreateRoomOptions(
            name: name, topic: topic, isPublic: isPublic, alias: isPublic ? alias : nil,
            isSpace: isSpace, isVoice: isVoice, parentSpaceId: spaceId, invite: founders, encrypted: encrypted && !isPublic && !isSpace,
            federate: federate, access: spaceMembers && spaceId != nil ? "restricted" : nil,
            founders: founders, roomVersion: founders.isEmpty ? nil : roomVersion
        ))
    }

    func foundersRoomVersion() async -> String? {
        guard let capabilities = try? await client?.serverCapabilities() else { return nil }
        if Int(capabilities.defaultRoomVersion) ?? 0 >= 12 { return capabilities.defaultRoomVersion }
        return capabilities.roomVersions.contains { $0.first == "12" } ? "12" : nil
    }

    func startDirectMessage(with userId: String) async throws -> String {
        try await requireClient.startDm(userId: userId)
    }

    func join(_ idOrAliasOrLink: String, via servers: [String] = []) async throws -> String {
        var target = idOrAliasOrLink.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = target.range(of: "matrix.to/#/") {
            target = String(target[range.upperBound...])
        }
        var via = servers
        if let query = target.firstIndex(of: "?") {
            let params = URLComponents(string: "x:/" + target[query...])?.queryItems ?? []
            via += params.filter { $0.name == "via" }.compactMap(\.value)
            target = String(target[..<query])
        }
        target = target.removingPercentEncoding ?? target
        return try await requireClient.join(idOrAlias: target, via: via)
    }

    func addChild(_ roomId: String, to spaceId: String) async throws {
        try await requireClient.addToSpace(spaceId: spaceId, childId: roomId, suggested: false)
    }

    func searchUsers(_ term: String) async -> [UserResult] {
        guard let client, !term.isEmpty else { return [] }
        return (try? await client.searchUsers(query: term, limit: 20)) ?? []
    }

    func profile(of userId: String) async -> UserProfile? {
        try? await client?.userProfile(userId: userId)
    }

    func pronouns(of userId: String) async -> String? {
        guard let client else { return nil }
        for key in [Pronouns.unstableKey, Pronouns.key] {
            if let value = Pronouns.parse(try? await client.profileField(userId: userId, field: key)) { return value }
        }
        return nil
    }

    func canSetPronouns() async -> Bool {
        (try? await client?.canSetProfileField(field: Pronouns.unstableKey)) ?? false
    }

    func setPronouns(_ text: String) async throws {
        let summary = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Pronouns.maxLength))
        if summary.isEmpty {
            try await requireClient.deleteProfileField(field: Pronouns.unstableKey)
        } else {
            let language = Locale.current.language.languageCode?.identifier ?? "en"
            try await requireClient.setProfileField(
                field: Pronouns.unstableKey,
                value: .array([.object(["language": .string(language), "summary": .string(summary)])])
            )
        }
    }

    func ignore(_ userId: String) async throws {
        try await requireClient.ignoreUser(userId: userId)
    }
}

extension MatrixSession {
    func stateEvents(_ eventType: String, in roomId: String) async -> [(key: String, content: [String: Any])] {
        guard let pairs = try? await client?.stateEventsOfType(roomId: roomId, eventType: eventType) else { return [] }
        return pairs.compactMap { pair in
            guard pair.count == 2, let key = pair[0].string, let content = pair[1].any as? [String: Any] else { return nil }
            return (key, content)
        }
    }

    func setStateEvent(_ eventType: String, key: String, content: [String: Any], in roomId: String) async throws {
        try await requireClient.setStateEvent(roomId: roomId, eventType: eventType, stateKey: key, content: JSONValue(any: content))
    }

    func canSendState(_ eventType: String, in roomId: String) async -> Bool {
        guard let client, let details = try? await client.roomDetails(roomId: roomId) else { return false }
        guard let own = details.ownPowerLevel else { return true }
        let levels = (try? await client.stateEvent(roomId: roomId, eventType: "m.room.power_levels", stateKey: "")) ?? nil
        let needed = levels?["events"]?[eventType]?.number ?? levels?["state_default"]?.number ?? 50
        return Double(own) >= needed
    }
}

extension MatrixSession {
    func accountDataJSON(_ eventType: String) async -> [String: Any]? {
        guard let value = try? await client?.accountData(eventType: eventType) else { return nil }
        return value.any as? [String: Any]
    }

    func setAccountDataJSON(_ eventType: String, _ content: [String: Any]) async throws {
        try await requireClient.setAccountData(eventType: eventType, content: JSONValue(any: content))
    }
}

/// MSC4247 pronouns: the stable key, and the unstable one clients use until it is merged
enum Pronouns {
    static let key = "m.pronouns"
    static let unstableKey = "io.fsky.nyx.pronouns"
    static let maxLength = 40

    static func parse(_ value: JSONValue?) -> String? {
        guard case .array(let entries) = value else { return nil }
        let summaries = entries.compactMap { entry -> String? in
            guard case .object(let fields) = entry, case .string(let summary) = fields["summary"] else { return nil }
            let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : String(trimmed.prefix(maxLength))
        }
        return summaries.isEmpty ? nil : summaries.joined(separator: ", ")
    }
}

enum StatusEmoji {
    static func split(_ text: String) -> (emoji: String, rest: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first, isEmoji(first) else { return ("", trimmed) }
        return (String(first), String(trimmed.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines))
    }

    static func join(_ emoji: String, _ rest: String) -> String {
        [emoji, rest.trimmingCharacters(in: .whitespacesAndNewlines)].filter { !$0.isEmpty }.joined(separator: " ")
    }

    static func isEmojiOnly(_ text: String?) -> Bool {
        guard let text else { return false }
        let parts = split(text)
        return !parts.emoji.isEmpty && parts.rest.isEmpty
    }

    private static func isEmoji(_ character: Character) -> Bool {
        guard let scalar = character.unicodeScalars.first else { return false }
        return scalar.properties.isEmojiPresentation
            || (scalar.properties.isEmoji && character.unicodeScalars.count > 1)
    }
}
