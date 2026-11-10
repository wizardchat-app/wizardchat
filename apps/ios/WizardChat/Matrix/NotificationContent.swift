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

    static func asMessage(_ content: UNMutableNotificationContent, from notification: WizardChatCore.Notification,
                          senderAvatar: Data?, roomAvatar: Data?) async -> UNNotificationContent {
        let senderImage = (senderAvatar ?? (notification.isDirect ? roomAvatar : nil)).map { INImage(imageData: $0) }
        content.body = notification.body.isEmpty ? String(localized: "common.newMessage") : notification.body
        let sender = INPerson(personHandle: INPersonHandle(value: notification.sender, type: .unknown),
                              nameComponents: nil, displayName: notification.senderName ?? notification.sender,
                              image: senderImage, contactIdentifier: nil,
                              customIdentifier: notification.sender)
        let group = notification.isDirect ? nil : notification.roomName.map { INSpeakableString(spokenPhrase: $0) }
        let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
                                         content: content.body, speakableGroupName: group,
                                         conversationIdentifier: notification.roomId, serviceName: nil, sender: sender,
                                         attachments: nil)
        if group != nil, let roomAvatar {
            intent.setImage(INImage(imageData: roomAvatar), forParameterNamed: \.speakableGroupName)
        }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        try? await interaction.donate()
        guard let updated = try? content.updating(from: intent) else { return content }
        return updated
    }
}
