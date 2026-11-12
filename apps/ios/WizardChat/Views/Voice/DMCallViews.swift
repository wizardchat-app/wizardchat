import WizardChatCore
import SwiftUI

struct IncomingCallBanner: View {
    let call: RingingCall
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?
    @State private var pulse = false

    private var kindLabel: String {
        let kind = call.voiceOnly ? String(localized: "call.incomingVoiceCall") : String(localized: "call.incomingVideoCall")
        guard let room = session.roomList?.room(id: call.roomId), !room.isDirect else { return kind }
        return "\(kind) · \(room.displayName)"
    }

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name ?? call.callerName ?? call.callerId, url: avatarUrl, size: WZ.SizeAvatar.lg)
                .overlay(Circle().stroke(theme.success, lineWidth: WZ.BorderWidth.thick).scaleEffect(pulse ? 1.25 : 1).opacity(pulse ? 0 : 1))
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(name ?? call.callerName ?? call.callerId)
                    .font(.wizard(WZ.FontSize.lg, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                Label(kindLabel, image: call.voiceOnly ? "ph-phone-regular" : "ph-video-camera-regular")
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            Spacer(minLength: 4)
            round("ph-phone-x-regular", color: theme.danger, label: "common.decline") { calls.declineIncoming(session: session) }
            round(call.voiceOnly ? "ph-phone-regular" : "ph-video-camera-regular", color: theme.success, label: "common.accept") {
                calls.acceptIncoming(session: session)
            }
        }
        .padding(WZ.Space.space5)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
        .padding(.horizontal, WZ.Space.space5)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.format("call.incomingFrom", "\(name ?? call.callerId)"))
        .task(id: call.callerId) {
            let profile = await session.memberProfile(call.callerId, in: call.roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) { pulse = true }
        }
        .sensoryFeedback(.impact(weight: .heavy), trigger: pulse)
    }

    private func round(_ icon: String, color: Color, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                .foregroundStyle(theme.textOnAccent)
                .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                .background(color, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct DMCallScreen: View {
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var otherName: String?

    var body: some View {
        Group {
            if let room = calls.room {
                InCallView(room: room, title: room.isDirect ? otherName ?? room.displayName : room.displayName,
                           onMinimize: { calls.showCallScreen = false })
            } else {
                theme.bgSecondary.ignoresSafeArea()
            }
        }
        .task(id: calls.room?.id) {
            guard let room = calls.room, let other = room.dmUserId else { return }
            otherName = await session.memberProfile(other, in: room.id).name ?? other
        }
        .onChange(of: calls.isInCall) { _, inCall in if !inCall { calls.showCallScreen = false } }
    }
}

struct JoinCallBar: View {
    let room: RoomSummary
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Image("ph-phone-regular")
                .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                .foregroundStyle(theme.textOnAccent)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .background(theme.success, in: Circle())
            Text(room.inCallElsewhere ? String(localized: "call.inCallElsewhere") : String(localized: "call.inProgress"))
                .font(.wizard(WZ.FontSize.md, .semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(2)
            Spacer()
            Button(room.inCallElsewhere ? String(localized: "call.joinHere") : String(localized: "common.join")) {
                calls.showCallScreen = true
                Task { await calls.join(room, session: session, intent: "audio") }
            }
            .font(.wizard(WZ.FontSize.md, .semibold))
            .buttonStyle(.borderedProminent)
            .tint(theme.success)
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space4)
        .floatingGlass(in: Capsule())
        .padding(.horizontal, WZ.Space.space5)
    }
}
