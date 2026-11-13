import Foundation
import Intents
import UserNotifications
import WizardChatCore

enum Badge {
    private static let key = "badges"
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: Bundle.main.object(forInfoDictionaryKey: "WZAppGroup") as? String
            ?? "group.org.wizardchat.ios")
    }

    static func set(_ count: Int, for userId: String) -> Int {
        var counts = defaults?.dictionary(forKey: key) as? [String: Int] ?? [:]
        counts[userId] = count
        defaults?.set(counts, forKey: key)
        return counts.values.reduce(0, +)
    }

    static func forget(_ userId: String) -> Int {
        var counts = defaults?.dictionary(forKey: key) as? [String: Int] ?? [:]
        counts[userId] = nil
        defaults?.set(counts, forKey: key)
        return counts.values.reduce(0, +)
    }
}

enum NotificationContent {
    static let messageCategory = "message"

    static func fill(_ content: UNMutableNotificationContent, with notification: WizardChatCore.Notification,
                     userId: String?) {
        let sender = notification.senderName ?? notification.sender
        content.title = notification.roomName ?? sender
        content.body = body(of: notification)
        content.threadIdentifier = notification.roomId
        content.categoryIdentifier = messageCategory
        var info = ["roomId": notification.roomId, "eventId": notification.eventId, "ts": String(notification.ts)]
        if let userId { info["userId"] = userId }
        content.userInfo = info
        if notification.highlight { content.interruptionLevel = .timeSensitive }
    }

    static func body(of notification: WizardChatCore.Notification) -> String {
        let sender = notification.senderName ?? notification.sender
        let text: String
        switch notification.kind {
        case .invite: return L10n.format("common.inviteNotification", sender)
        case .poll: text = L10n.format("common.pollNotification", notification.body)
        case .image, .video, .audio, .voice, .file, .location, .sticker:
            text = L10n.format("common.\(notification.kind.rawValue)Notification")
        case .message:
            if notification.spoiler {
                text = String(localized: "common.spoilerNotification")
            } else {
                text = notification.body.isEmpty ? String(localized: "common.newMessage") : notification.body
            }
        }
        return notification.isDirect || notification.roomName == nil ? text : "\(sender): \(text)"
    }

    /// A message notification as a conversation, so iOS shows a picture. iOS shows the sender's picture,
    /// so the room itself is the sender: its avatar and name, like Android, with "Name: text" as the body
    static func asMessage(_ content: UNMutableNotificationContent, from notification: WizardChatCore.Notification,
                          senderAvatar: Data?, roomAvatar: Data?) async -> UNNotificationContent {
        let senderName = notification.senderName ?? notification.sender
        let isRoom = !notification.isDirect && notification.roomName != nil
        content.body = body(of: notification)
        let image = (roomAvatar ?? senderAvatar).map { INImage(imageData: $0) }
        let id = isRoom ? notification.roomId : notification.sender
        let sender = INPerson(personHandle: INPersonHandle(value: id, type: .unknown), nameComponents: nil,
                              displayName: isRoom ? notification.roomName : senderName, image: image,
                              contactIdentifier: nil, customIdentifier: id)
        let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
                                         content: content.body, speakableGroupName: nil,
                                         conversationIdentifier: notification.roomId, serviceName: nil, sender: sender,
                                         attachments: nil)
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        try? await interaction.donate()
        guard let updated = try? content.updating(from: intent) else { return content }
        return updated
    }
}
