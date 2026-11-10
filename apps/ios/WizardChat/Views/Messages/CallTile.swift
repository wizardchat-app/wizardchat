import SwiftUI
import WizardChatCore

struct CallTile: View {
    let call: CallHistoryView
    let roomId: String
    var openProfile: (String) -> Void = { _ in }

    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var starterName: String?

    private var answered: Bool { call.outcome == .ongoing || call.outcome == .ended }

    private var icon: String {
        if !answered { return "ph-phone-x-regular" }
        return call.video ? "ph-video-camera-fill" : "ph-phone-fill"
    }

    private var canJoin: Bool { call.outcome == .ongoing && !calls.isInCall(roomId: roomId) }

    private var name: String {
        starterName ?? call.participants.first { $0.userId == call.startedBy }?.displayName ?? call.startedBy
    }

    private var line: String {
        let mine = call.startedBy == session.userId
        switch call.outcome {
        case .ongoing:
            return mine ? L10n.plain("call.event.startedYou") : L10n.plain("call.event.started", name)
        case .ended:
            guard !call.partial, let endedAt = call.endedAt else {
                return mine ? L10n.plain("call.event.startedYou") : L10n.plain("call.event.started", name)
            }
            let duration = Self.duration(milliseconds: endedAt - call.startedAt)
            return mine ? L10n.plain("call.event.lastedYou", duration) : L10n.plain("call.event.lasted", name, duration)
        case .missed:
            return L10n.plain("call.event.missedFrom", name)
        case .declined:
            if mine { return L10n.plain("call.event.declinedYours") }
            if let me = session.userId, call.declinedBy.contains(me) {
                return L10n.plain("call.event.declinedByYou", name)
            }
            return L10n.plain("call.event.declinedOther", name)
        case .unanswered:
            return mine ? L10n.plain("call.event.unansweredYours") : L10n.plain("call.event.unansweredOther", name)
        }
    }

    static func duration(milliseconds: Int) -> String {
        let minutes = Int((Double(milliseconds) / 60_000).rounded())
        if minutes < 1 { return String(localized: "call.event.fewSeconds") }
        if minutes < 60 { return L10n.format("call.event.minutes", minutes) }
        let hours = Int((Double(minutes) / 60).rounded())
        return L10n.format("call.event.hours", hours)
    }

    private var text: AttributedString {
        var text = AttributedString(line)
        text.foregroundColor = theme.textMuted
        if call.startedBy != session.userId, let range = text.range(of: name) {
            text[range].foregroundColor = theme.nameColor(call.startedBy, colored: prefs.colorUsernames)
            text[range].font = .wizard(WZ.FontSize.md, .semibold)
            text[range].link = URL(string: "wizardchat-profile:open")
        }
        let start = Date(timeIntervalSince1970: TimeInterval(call.startedAt) / 1000)
        var time = AttributedString("  " + start.formatted(date: .omitted, time: .shortened))
        time.font = .wizard(WZ.FontSize.xs)
        time.foregroundColor = theme.textMuted
        return text + time
    }

    var body: some View {
        HStack(alignment: .center, spacing: WZ.Space.space5) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                .foregroundStyle(answered ? theme.success : theme.danger)
                .frame(width: WZ.SizeAvatar.md)
            Text(text)
                .font(.wizard(WZ.FontSize.md))
                .tint(theme.nameColor(call.startedBy, colored: prefs.colorUsernames))
                .environment(\.openURL, OpenURLAction { _ in
                    openProfile(call.startedBy)
                    return .handled
                })
                .frame(maxWidth: .infinity, alignment: .leading)
            if canJoin {
                Button(String(localized: "common.join"), action: join)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(theme.success)
            }
        }
        .accessibilityElement(children: .combine)
        .task(id: call.startedBy) {
            starterName = await session.memberProfile(call.startedBy, in: roomId).name
        }
    }

    private func join() {
        guard let room = session.roomList?.room(id: roomId) else { return }
        calls.showCallScreen = !room.isVoice
        Task { await calls.join(room, session: session, intent: "audio") }
    }
}
