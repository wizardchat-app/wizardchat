import Foundation
import UIKit
import Security
import WizardChatCore

struct StoredSession: Codable {
    var session: Session
    var storeFolder: String
    var passphrase: String
    var excludeInsecureDevices: Bool?
    var displayName: String?
    var avatarUrl: String?

    var store: StoreConfig { store(process: SessionStore.appProcess) }

    func store(process: String) -> StoreConfig {
        StoreConfig(location: SessionStore.storePath(for: storeFolder).path, passphrase: passphrase,
                    excludeInsecureDevices: excludeInsecureDevices, manualEncryptionSetup: true,
                    processName: process)
    }

    static func newStore() -> (folder: String, config: StoreConfig) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let folder = UUID().uuidString
        let path = SessionStore.storePath(for: folder)
        try? FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        return (folder, StoreConfig(location: path.path, passphrase: Data(bytes).base64EncodedString(),
                                    manualEncryptionSetup: true, processName: SessionStore.appProcess))
    }
}

private struct StoredAccounts: Codable {
    var active: String?
    var accounts: [StoredSession]
}

enum SessionStore {
    private static let service = "org.wizardchat.ios.session"
    private static let accountsKey = "accounts"
    private static let legacyKey = "core"
    private static let group = Bundle.main.object(forInfoDictionaryKey: "WZAppGroup") as? String ?? "group.org.wizardchat.ios"
    static let appProcess = "main"
    static let extensionProcess = "nse"
    static let pushProcess = "push"

    static func all() -> [StoredSession] { read().accounts }

    static func active() -> StoredSession? {
        let state = read()
        return state.accounts.first { $0.session.userId == state.active } ?? state.accounts.first
    }

    static func save(_ stored: StoredSession) {
        var state = read()
        if let index = state.accounts.firstIndex(where: { $0.session.userId == stored.session.userId }) {
            state.accounts[index] = stored
        } else {
            state.accounts.append(stored)
        }
        if state.active == nil { state.active = stored.session.userId }
        write(state)
    }

    static func updateProfile(_ userId: String, displayName: String?, avatarUrl: String?) {
        var state = read()
        guard let index = state.accounts.firstIndex(where: { $0.session.userId == userId }),
              state.accounts[index].displayName != displayName || state.accounts[index].avatarUrl != avatarUrl
        else { return }
        state.accounts[index].displayName = displayName
        state.accounts[index].avatarUrl = avatarUrl
        write(state)
    }

    static func setActive(_ userId: String) {
        var state = read()
        guard state.accounts.contains(where: { $0.session.userId == userId }) else { return }
        state.active = userId
        write(state)
    }

    static func remove(_ userId: String) {
        var state = read()
        for stored in state.accounts where stored.session.userId == userId { removeStore(stored.storeFolder) }
        state.accounts.removeAll { $0.session.userId == userId }
        if state.active == userId { state.active = state.accounts.first?.session.userId }
        write(state)
    }

    private static func read() -> StoredAccounts {
        if let data = item(accountsKey), let state = try? JSONDecoder().decode(StoredAccounts.self, from: data) {
            return state
        }
        if let data = item(legacyKey), let legacy = try? JSONDecoder().decode(StoredSession.self, from: data) {
            let migrated = StoredAccounts(active: legacy.session.userId, accounts: [legacy])
            write(migrated)
            if item(accountsKey) != nil { deleteItem(legacyKey) }
            return migrated
        }
        return StoredAccounts(active: nil, accounts: [])
    }

    private static func write(_ state: StoredAccounts) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: accountsKey,
            kSecAttrAccessGroup as String: group,
        ]
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecItemNotFound {
            var item = query
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            item[kSecValueData as String] = data
            SecItemAdd(item as CFDictionary, nil)
        }
    }

    private static func item(_ account: String) -> Data? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: group,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess { return result as? Data }
        query.removeValue(forKey: kSecAttrAccessGroup as String)
        query[kSecReturnAttributes as String] = true
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let found = result as? [String: Any], let data = found[kSecValueData as String] as? Data
        else { return nil }
        guard Bundle.main.bundleURL.pathExtension == "app" else { return data }
        let moved: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: group,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data,
        ]
        if SecItemAdd(moved as CFDictionary, nil) == errSecSuccess, let old = found[kSecAttrAccessGroup as String] {
            SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecAttrAccessGroup as String: old,
            ] as CFDictionary)
        }
        return data
    }

    private static func deleteItem(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: group,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// A copy of the account's own avatar, saved while it's active: the switcher can't always reach
    /// another account's server, and it's removed with the account's store
    private static func avatarFile(_ userId: String) -> URL? {
        guard let folder = all().first(where: { $0.session.userId == userId })?.storeFolder else { return nil }
        return storePath(for: folder).appendingPathComponent("account-avatar.png")
    }

    static func savedAvatar(_ userId: String) -> UIImage? {
        avatarFile(userId).flatMap { UIImage(contentsOfFile: $0.path) }
    }

    static func saveAvatar(_ image: UIImage?, for userId: String) {
        guard let file = avatarFile(userId) else { return }
        if let data = image?.pngData() {
            try? data.write(to: file, options: .atomic)
        } else {
            try? FileManager.default.removeItem(at: file)
        }
    }

    static func storePath(for folder: String) -> URL {
        _ = movedToGroup
        return accountsFolder.appendingPathComponent(folder, isDirectory: true)
    }

    private static var accountsFolder: URL {
        let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("accounts", isDirectory: true)
    }

    private static let movedToGroup: Void = {
        guard Bundle.main.bundleURL.pathExtension == "app" else { return }
        let old = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("accounts", isDirectory: true)
        let new = accountsFolder
        guard new != old, FileManager.default.fileExists(atPath: old.path),
              !FileManager.default.fileExists(atPath: new.path) else { return }
        try? FileManager.default.moveItem(at: old, to: new)
    }()

    static func removeStore(_ folder: String) {
        try? FileManager.default.removeItem(at: storePath(for: folder))
    }
}
