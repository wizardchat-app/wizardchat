import Foundation
import WizardChatCore

@MainActor
final class MemberDirectory {
    static let shared = MemberDirectory()

    struct Profile {
        let name: String?
        let avatarUrl: String?
    }

    private var rooms: [String: Task<[String: Member], Never>] = [:]
    private var users: [String: Task<Profile, Never>] = [:]

    func profile(_ userId: String, in roomId: String?, client: WizardClient) async -> Profile {
        if let roomId {
            let task = rooms[roomId] ?? Task {
                let members = (try? await client.members(roomId: roomId)) ?? []
                return Dictionary(members.map { ($0.userId, $0) }, uniquingKeysWith: { a, _ in a })
            }
            rooms[roomId] = task
            if let member = await task.value[userId] {
                return Profile(name: member.displayName, avatarUrl: member.avatarUrl)
            }
        }
        let task = users[userId] ?? Task {
            let profile = try? await client.userProfile(userId: userId)
            return Profile(name: profile?.displayName, avatarUrl: profile?.avatarUrl)
        }
        users[userId] = task
        return await task.value
    }

    func forget(roomId: String) {
        rooms[roomId] = nil
    }

    func reset() {
        rooms = [:]
        users = [:]
    }
}

extension MatrixSession {
    func memberProfile(_ userId: String, in roomId: String?) async -> MemberDirectory.Profile {
        guard let client else { return .init(name: nil, avatarUrl: nil) }
        return await MemberDirectory.shared.profile(userId, in: roomId, client: client)
    }
}

@MainActor
final class StatusDirectory {
    static let shared = StatusDirectory()
    private static let maxAge: TimeInterval = 5 * 60

    private var entries: [String: (status: CustomStatus?, at: Date)] = [:]
    private var pending: [String: Task<CustomStatus?, Never>] = [:]

    func status(of userId: String, client: WizardClient) async -> CustomStatus? {
        if let entry = entries[userId], Date.now.timeIntervalSince(entry.at) < Self.maxAge {
            return entry.status.flatMap(Self.live)
        }
        let task = pending[userId] ?? Task { (try? await client.customStatus(userId: userId)) ?? nil }
        pending[userId] = task
        let status = await task.value
        pending[userId] = nil
        entries[userId] = (status, .now)
        return Self.live(status)
    }

    private static func live(_ status: CustomStatus?) -> CustomStatus? {
        guard let status else { return nil }
        if let expiresAt = status.expiresAt, Double(expiresAt) / 1000 <= Date.now.timeIntervalSince1970 { return nil }
        return status
    }
}
