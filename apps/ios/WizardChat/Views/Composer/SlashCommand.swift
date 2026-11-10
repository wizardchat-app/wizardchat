import Foundation
import WizardChatCore

struct SlashCommand {
    let name: String
    let description: String

    enum Result { case handled, unknown }

    static let all: [SlashCommand] = [
        .init(name: "me", description: String(localized: "timeline.commands.me.description")),
        .init(name: "notice", description: String(localized: "timeline.commands.notice.description")),
        .init(name: "spoiler", description: String(localized: "timeline.commands.spoiler.description")),
        .init(name: "join", description: String(localized: "timeline.commands.join.description")),
        .init(name: "part", description: String(localized: "timeline.commands.part.description")),
        .init(name: "invite", description: String(localized: "timeline.commands.invite.description")),
        .init(name: "kick", description: String(localized: "timeline.commands.kick.description")),
        .init(name: "ban", description: String(localized: "timeline.commands.ban.description")),
        .init(name: "unban", description: String(localized: "timeline.commands.unban.description")),
        .init(name: "topic", description: String(localized: "timeline.commands.topic.description")),
        .init(name: "roomname", description: String(localized: "timeline.commands.roomname.description")),
        .init(name: "nick", description: String(localized: "timeline.commands.nick.description")),
    ]

    @MainActor
    static func run(_ text: String, timeline: TimelineModel, session: MatrixSession, replyTo: String?) async -> Result? {
        let body = text.dropFirst()
        let name = body.prefix { !$0.isWhitespace }.lowercased()
        let args = body.dropFirst(name.count).trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        let client = timeline.client
        let roomId = timeline.roomId

        func firstWord() -> (String, String?) {
            let parts = args.split(separator: " ", maxSplits: 1).map(String.init)
            return (parts.first ?? "", parts.count > 1 ? parts[1] : nil)
        }

        do {
            switch name {
            case "me":
                await timeline.send(args, emote: true, replyTo: replyTo)
            case "notice":
                await timeline.sendNotice(args, replyTo: replyTo)
            case "spoiler":
                var reason: String?
                var message = args
                if args.hasPrefix("\""), let end = args.dropFirst().firstIndex(of: "\"") {
                    reason = String(args[args.index(after: args.startIndex)..<end])
                    message = args[args.index(after: end)...].trimmingCharacters(in: .whitespaces)
                }
                let escaped = message.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
                let span = reason.map { "<span data-mx-spoiler=\"\($0)\">\(escaped)</span>" }
                    ?? "<span data-mx-spoiler>\(escaped)</span>"
                await timeline.send(message, html: span, replyTo: replyTo)
            case "join":
                _ = try await session.join(args)
            case "part":
                try await client.leave(roomId: roomId)
            case "invite":
                try await client.invite(roomId: roomId, userId: firstWord().0)
            case "kick":
                let (user, reason) = firstWord()
                try await client.kick(roomId: roomId, userId: user, reason: reason)
            case "ban":
                let (user, reason) = firstWord()
                try await client.ban(roomId: roomId, userId: user, reason: reason)
            case "unban":
                try await client.unban(roomId: roomId, userId: firstWord().0)
            case "topic":
                try await client.setRoomTopic(roomId: roomId, topic: args)
            case "roomname":
                try await client.setRoomName(roomId: roomId, name: args)
            case "nick":
                try await session.setDisplayName(args)
            default:
                return .unknown
            }
        } catch {
            timeline.sendError = readableError(error)
        }
        return .handled
    }
}
