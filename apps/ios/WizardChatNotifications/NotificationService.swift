import Foundation
import OSLog
import UserNotifications
import WizardChatCore

final class NotificationService: UNNotificationServiceExtension {
    private static let log = Logger(subsystem: "org.wizardchat.ios", category: "Notifications")
    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var fallback: UNNotificationContent?
    private var task: Task<Void, Never>?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        let payload = request.content.userInfo
        let userId = payload["user_id"] as? String
        let roomId = payload["room_id"] as? String
        let eventId = payload["event_id"] as? String
        let unread = payload["unread_count"] as? Int

        let fallback = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        fallback.body = String(localized: "common.newMessage")
        var info: [String: String] = [:]
        if let userId { info["userId"] = userId }
        if let roomId {
            info["roomId"] = roomId
            fallback.threadIdentifier = roomId
        }
        if let eventId { info["eventId"] = eventId }
        fallback.userInfo = info
        if let unread { fallback.badge = NSNumber(value: userId.map { Badge.set(unread, for: $0) } ?? unread) }

        lock.withLock {
            self.contentHandler = contentHandler
            self.fallback = fallback
        }
        guard let roomId, let eventId else {
            task = Task { [weak self] in
                _ = await Self.withClient(userId: userId) { client, ownUserId -> Bool? in
                    await Self.clearRead(client: client, userId: ownUserId, except: nil)
                    return nil
                }
                self?.finish(fallback)
            }
            return
        }
        task = Task { [weak self] in
            let content = await Self.message(userId: userId, roomId: roomId, eventId: eventId, unread: unread)
            self?.finish(content ?? fallback)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        task?.cancel()
        if let fallback = lock.withLock({ fallback }) { finish(fallback) }
    }

    private func finish(_ content: UNNotificationContent) {
        let handler = lock.withLock {
            defer { contentHandler = nil }
            return contentHandler
        }
        handler?(content)
    }

    private static func message(userId: String?, roomId: String, eventId: String,
                                unread: Int?) async -> UNNotificationContent? {
        await withClient(userId: userId) { client, ownUserId in
            async let cleared: Void = clearRead(client: client, userId: ownUserId, except: roomId)
            let content = try await build(client: client, userId: ownUserId, roomId: roomId, eventId: eventId,
                                          unread: unread)
            await cleared
            return content
        }
    }

    private static func build(client: WizardClient, userId: String, roomId: String, eventId: String,
                              unread: Int?) async throws -> UNNotificationContent? {
        guard let notification = try await client.pushedNotification(roomId: roomId, eventId: eventId) else {
            return nil
        }
        let content = UNMutableNotificationContent()
        NotificationContent.fill(content, with: notification, userId: userId)
        if notification.sound { content.sound = .default }
        if let unread { content.badge = NSNumber(value: Badge.set(unread, for: userId)) }
        async let senderAvatar = avatar(try? await client.userProfile(userId: notification.sender).avatarUrl,
                                        client: client)
        async let roomAvatar = avatar(notification.roomAvatarUrl, client: client)
        return await NotificationContent.asMessage(content, from: notification, senderAvatar: senderAvatar,
                                                  roomAvatar: roomAvatar)
    }

    private static func withClient<T>(userId: String?,
                                      _ body: (WizardClient, String) async throws -> T?) async -> T? {
        let accounts = SessionStore.all()
        guard let stored = userId.map({ id in accounts.first { $0.session.userId == id } }) ?? SessionStore.active()
        else { return nil }
        var session = stored.session
        if session.oauthClientId == nil { session.refreshToken = nil }
        do {
            let client = try await WizardClient.restore(session: session,
                                                        store: stored.store(process: SessionStore.extensionProcess))
            let saving = session.oauthClientId == nil ? nil : client.watchSession { event in
                guard case .refreshed(let refreshed) = event,
                      var latest = SessionStore.all().first(where: { $0.session.userId == stored.session.userId })
                else { return }
                latest.session = refreshed.session
                SessionStore.save(latest)
            }
            defer { saving?.cancel() }
            return try await body(client, stored.session.userId)
        } catch {
            log.error("couldn't handle the push: \(error)")
            return nil
        }
    }

    private static func clearRead(client: WizardClient, userId: String, except: String?) async {
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications()
            .filter { $0.request.content.userInfo["userId"] as? String == userId }
        let rooms = Set(delivered.compactMap { $0.request.content.userInfo["roomId"] as? String })
            .subtracting(except.map { [$0] } ?? [])
        guard !rooms.isEmpty, let read = try? await client.readRooms(roomIds: Array(rooms)) else { return }
        let ids = delivered
            .filter { read.contains($0.request.content.userInfo["roomId"] as? String ?? "") }
            .map(\.request.identifier)
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
    }

    private static func avatar(_ mxc: String?, client: WizardClient) async -> Data? {
        guard let mxc else { return nil }
        return try? await client.thumbnail(mxc: mxc, width: 192, height: 192, crop: true)
    }
}
