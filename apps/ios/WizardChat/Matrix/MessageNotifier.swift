import Foundation
import WizardChatCore
import UserNotifications

@MainActor
final class MessageNotifier: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    var activeRoomId: String?
    @Published var roomToOpen: String?
    @Published var eventToFocus: (roomId: String, eventId: String)?
    @Published var accountToOpen: String?
    private weak var prefs: AppPreferences?
    private weak var roomList: RoomListModel?
    private var subscription: Subscription?

    static let messageCategory = NotificationContent.messageCategory

    override init() {
        super.init()
        // Set from launch, so a notification tapped while the app was closed still opens its room.
        UNUserNotificationCenter.current().delegate = self
        let reply = UNTextInputNotificationAction(identifier: "reply", title: String(localized: "timeline.reply"),
                                                  options: [], textInputButtonTitle: String(localized: "common.send"),
                                                  textInputPlaceholder: String(localized: "composer.typeMessage"))
        let markRead = UNNotificationAction(identifier: "markRead", title: String(localized: "common.markRead"))
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: Self.messageCategory, actions: [reply, markRead], intentIdentifiers: []),
        ])
    }

    func start(roomList: RoomListModel, prefs: AppPreferences) {
        self.roomList = roomList
        self.prefs = prefs
        UNUserNotificationCenter.current().delegate = self
        subscription?.cancel()
        subscription = roomList.client.watchNotifications { [weak self] notification in
            MainActor.assumeIsolated {
                guard let self else { return }
                Task { await self.notify(notification) }
            }
        }
        if prefs.notificationBanners || prefs.notificationSounds {
            Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
        }
    }

    func stop() {
        updateBadge(0)
        subscription?.cancel()
        subscription = nil
        roomList = nil
    }

    private func notify(_ notification: WizardChatCore.Notification) async {
        guard let prefs, prefs.notificationBanners || prefs.notificationSounds,
              notification.roomId != activeRoomId else { return }
        let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
        guard !delivered.contains(where: { $0.request.content.userInfo["eventId"] as? String == notification.eventId })
        else { return }
        let content = UNMutableNotificationContent()
        let userId = roomList?.client.userId
        NotificationContent.fill(content, with: notification, userId: userId)
        if prefs.notificationSounds && notification.sound { content.sound = .default }
        let request = UNNotificationRequest(identifier: "\(userId ?? "")|\(notification.eventId)",
                                            content: await withAvatar(content, for: notification), trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyMissedCall(_ call: IncomingCall) {
        guard let prefs, prefs.notificationBanners || prefs.notificationSounds,
              call.roomId != activeRoomId else { return }
        let content = UNMutableNotificationContent()
        content.title = call.roomName ?? call.senderName ?? call.sender
        content.body = L10n.format("call.missedFrom", call.senderName ?? call.sender)
        content.threadIdentifier = call.roomId
        var info = ["roomId": call.roomId]
        if let userId = roomList?.client.userId { info["userId"] = userId }
        content.userInfo = info
        if prefs.notificationSounds { content.sound = .default }
        let request = UNNotificationRequest(identifier: "\(info["userId"] ?? "")|missed|\(call.eventId)",
                                            content: content, trigger: nil)
        Task { try? await UNUserNotificationCenter.current().add(request) }
    }

    private func withAvatar(_ content: UNMutableNotificationContent,
                            for notification: WizardChatCore.Notification) async -> UNNotificationContent {
        guard let client = roomList?.client else { return content }
        let roomUrl = roomList?.room(id: notification.roomId)?.avatarUrl
        async let senderAvatar = avatar(
            await MemberDirectory.shared.profile(notification.sender, in: notification.roomId, client: client).avatarUrl,
            client: client)
        async let roomAvatar = avatar(roomUrl, client: client)
        return await NotificationContent.asMessage(content, from: notification, senderAvatar: senderAvatar,
                                                  roomAvatar: roomAvatar)
    }

    private func avatar(_ mxc: String?, client: WizardClient) async -> Data? {
        guard let mxc else { return nil }
        return try? await client.thumbnail(mxc: mxc, width: 192, height: 192, crop: true)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let identifier = response.notification.request.identifier
        let text = (response as? UNTextInputNotificationResponse)?.userText
        let done = Unchecked(value: completionHandler)
        Task { @MainActor in
            defer { done.value() }
            guard let roomId = info["roomId"] as? String else { return }
            let current = roomList?.client.userId ?? SessionStore.active()?.session.userId
            if let userId = info["userId"] as? String, userId != current { accountToOpen = userId }
            switch action {
            case "reply":
                guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
                await reply(text, in: roomId)
                if let userId = info["userId"] as? String { await Self.remove(userId: userId, roomId: roomId) }
            case "markRead":
                if let room = await room(roomId) { await roomList?.setRead(room, read: true) }
                if let userId = info["userId"] as? String {
                    await Self.remove(userId: userId, roomId: roomId)
                } else {
                    center.removeDeliveredNotifications(withIdentifiers: [identifier])
                }
            default:
                if let eventId = info["eventId"] as? String { eventToFocus = (roomId, eventId) }
                roomToOpen = roomId
            }
        }
    }

    private func room(_ roomId: String) async -> RoomSummary? {
        for _ in 0..<60 {
            if accountToOpen == nil, let room = roomList?.room(id: roomId) { return room }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return nil
    }

    private func reply(_ text: String, in roomId: String) async {
        guard await room(roomId) != nil, let timeline = try? await roomList?.client.timeline(roomId: roomId) else { return }
        try? await timeline.sendText(body: text)
        try? await timeline.markAsRead(_private: prefs?.sendReadReceipts == false)
        // Give the send queue a moment before iOS suspends the app again.
        try? await Task.sleep(for: .seconds(2))
    }

    static func removeDelivered(userId: String) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = delivered.filter { $0.request.content.userInfo["userId"] as? String == userId }
                .map(\.request.identifier)
            center.removeDeliveredNotifications(withIdentifiers: ids)
        }
    }

    func clear(roomId: String) {
        guard let userId = roomList?.client.userId else { return }
        Task { await Self.remove(userId: userId, roomId: roomId) }
    }

    func clearRead(_ rooms: [RoomSummary]) {
        guard let userId = roomList?.client.userId else { return }
        let seen = Dictionary(rooms.filter { $0.unreadCount == 0 && $0.mentionCount == 0 }
            .map { ($0.id, $0.lastActivity ?? 0) }, uniquingKeysWith: max)
        guard !seen.isEmpty else { return }
        Task {
            await Self.remove(userId: userId) { delivered in
                let info = delivered.request.content.userInfo
                guard let roomId = info["roomId"] as? String, let latest = seen[roomId] else { return false }
                let sent = (info["ts"] as? String).flatMap(Int.init)
                    ?? Int(delivered.date.timeIntervalSince1970 * 1000)
                return latest >= sent
            }
        }
    }

    private static func remove(userId: String, roomId: String) async {
        await remove(userId: userId) { $0.request.content.userInfo["roomId"] as? String == roomId }
    }

    private static func remove(userId: String, where matches: (UNNotification) -> Bool) async {
        let center = UNUserNotificationCenter.current()
        let ids = await center.deliveredNotifications()
            .filter { $0.request.content.userInfo["userId"] as? String == userId && matches($0) }
            .map(\.request.identifier)
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
    }

    func updateBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let done = Unchecked(value: completionHandler)
        let isPush = notification.request.trigger is UNPushNotificationTrigger
        let userId = notification.request.content.userInfo["userId"] as? String
        Task { @MainActor in
            if isPush, userId == nil || userId == roomList?.client.userId {
                done.value([])
                return
            }
            var options: UNNotificationPresentationOptions = []
            if prefs?.notificationBanners == true { options.formUnion([.banner, .list]) }
            if prefs?.notificationSounds == true { options.insert(.sound) }
            done.value(options)
        }
    }
}

private struct Unchecked<Value>: @unchecked Sendable {
    let value: Value
}
