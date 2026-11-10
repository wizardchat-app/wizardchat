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
        if let unread { fallback.badge = NSNumber(value: unread) }

        lock.withLock {
            self.contentHandler = contentHandler
            self.fallback = fallback
        }
        guard let roomId, let eventId else {
            finish(fallback)
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
            guard let notification = try await client.pushedNotification(roomId: roomId, eventId: eventId) else {
                return nil
            }
            let content = UNMutableNotificationContent()
            NotificationContent.fill(content, with: notification, userId: stored.session.userId)
            if notification.sound { content.sound = .default }
            if let unread { content.badge = NSNumber(value: unread) }
            async let senderAvatar = avatar(try? await client.userProfile(userId: notification.sender).avatarUrl,
                                            client: client)
            async let roomAvatar = avatar(notification.roomAvatarUrl, client: client)
            return await NotificationContent.asMessage(content, from: notification, senderAvatar: senderAvatar,
                                                      roomAvatar: roomAvatar)
        } catch {
            log.error("couldn't fetch the pushed message: \(error)")
            return nil
        }
    }

    private static func avatar(_ mxc: String?, client: WizardClient) async -> Data? {
        guard let mxc else { return nil }
        return try? await client.thumbnail(mxc: mxc, width: 192, height: 192, crop: true)
    }
}
