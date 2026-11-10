import Foundation
import Intents
import UserNotifications
import WizardChatCore

enum NotificationContent {
    static let messageCategory = "message"

    static func fill(_ content: UNMutableNotificationContent, with notification: WizardChatCore.Notification,
                     userId: String?) {
        let sender = notification.senderName ?? notification.sender
        content.title = notification.roomName ?? sender
        let text = notification.body.isEmpty ? String(localized: "common.newMessage") : notification.body
        content.body = notification.isDirect || notification.roomName == nil ? text : "\(sender): \(text)"
        content.threadIdentifier = notification.roomId
        content.categoryIdentifier = messageCategory
        var info = ["roomId": notification.roomId, "eventId": notification.eventId]
        if let userId { info["userId"] = userId }
        content.userInfo = info
        if notification.highlight { content.interruptionLevel = .timeSensitive }
    }

    /// A message notification as a conversation, so iOS shows a picture. iOS shows the sender's picture,
    /// so the room itself is the sender: its avatar and name, like Android, with "Name: text" as the body
    static func asMessage(_ content: UNMutableNotificationContent, from notification: WizardChatCore.Notification,
                          senderAvatar: Data?, roomAvatar: Data?) async -> UNNotificationContent {
        let text = notification.body.isEmpty ? String(localized: "common.newMessage") : notification.body
        let senderName = notification.senderName ?? notification.sender
        let isRoom = !notification.isDirect && notification.roomName != nil
        content.body = isRoom ? "\(senderName): \(text)" : text
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
