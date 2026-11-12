import WizardChatCore
import SwiftUI

struct VoiceRoomView: View {
    let room: RoomSummary
    let client: WizardClient
    let onOpenChat: () -> Void

    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.theme) private var theme
    @State private var showInfo = false
    @State private var barWidth: CGFloat = 0

    private var inThisCall: Bool { calls.isInCall(roomId: room.id) }

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            if inThisCall {
                InCallView(room: room, onOpenChat: onOpenChat)
            } else {
                lobby
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { barWidth = $0 }
        .background(theme.bgSecondary.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(theme.bgSecondary, for: .navigationBar)
        .toolbarBackgroundVisibility(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showInfo = true } label: {
                    RoomTitle(room: room, maxWidth: RoomTitle.maxWidth(barWidth: barWidth, buttons: 1))
                        .fixedSize()
                        .padding(.horizontal, WZ.Space.space6)
                        .padding(.vertical, WZ.Space.space2)
                        .frame(minHeight: WZ.Space.space10)
                        .floatingGlass(in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityHint(String(localized: "timeline.showsRoomInfoMembers"))
            }
            .glassBackgroundHidden()
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: onOpenChat) { Image("ph-chat-text-regular") }
                    .accessibilityLabel(String(localized: "room.openChat"))
            }
        }
        .sheet(isPresented: $showInfo) {
            RoomInfoView(room: room, client: client) { eventId in
                showInfo = false
                notifier.eventToFocus = (room.id, eventId)
                onOpenChat()
            }
        }
    }

    private var lobby: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space6) {
                AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.xl)
                    .overlay(alignment: .bottomTrailing) {
                        Image("ph-speaker-high-regular")
                            .font(.system(size: WZ.SizeIcon.sm))
                            .foregroundStyle(room.callParticipants.isEmpty ? theme.textMuted : theme.success)
                            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                            .background(theme.bgSecondary, in: Circle())
                            .overlay(Circle().stroke(room.callParticipants.isEmpty ? theme.border : theme.success,
                                                     lineWidth: WZ.BorderWidth.thin))
                    }
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(room.callParticipants.isEmpty
                     ? String(localized: "call.empty")
                     : L10n.format("call.inVoice", room.callParticipants.count))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)

                if !room.callParticipants.isEmpty {
                    VStack(spacing: WZ.Space.space0) {
                        ForEach(room.callParticipants, id: \.self) { userId in
                            ParticipantRow(roomId: room.id, userId: userId)
                        }
                    }
                    .padding(.vertical, WZ.Space.space2)
                    .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                }

                if case .failed(let message) = calls.state, calls.room?.id == room.id || calls.room == nil {
                    Text(message).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error).multilineTextAlignment(.center)
                }

                if room.inCallElsewhere {
                    Text(String(localized: "call.inCallElsewhere"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .multilineTextAlignment(.center)
                }

                Button {
                    Task { await calls.join(room, session: session) }
                } label: {
                    Label(room.inCallElsewhere ? String(localized: "call.joinHere") : String(localized: "call.joinVoice"),
                          image: "ph-speaker-high-regular")
                }
                .buttonStyle(PrimaryButtonStyle())
                Button(action: onOpenChat) {
                    Label(String(localized: "room.openChat"), image: "ph-chat-text-regular")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(WZ.Space.space8)
            .frame(maxWidth: WZ.SizeDialog.md)
            .frame(maxWidth: .infinity)
        }
    }
}

struct CallControls: View {
    var onOpenChat: (() -> Void)?
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space3) {
            if prefs.pushToTalk {
                PushToTalkButton(size: WZ.Space.space11, iconSize: WZ.SizeIcon.md)
            } else {
                control(calls.micMuted ? "ph-microphone-slash-regular" : "ph-microphone-regular", active: calls.micMuted,
                        label: calls.micMuted ? "call.unmute" : "call.mute") { calls.toggleMic() }
            }
            control(calls.deafened ? "ph-speaker-slash-regular" : "ph-speaker-high-regular", active: calls.deafened,
                    label: calls.deafened ? "call.undeafen" : "call.deafen") { calls.toggleDeafen() }
            control(calls.cameraOn ? "ph-video-camera-regular" : "ph-video-camera-slash-regular", active: false, highlighted: calls.cameraOn,
                    label: calls.cameraOn ? "call.turnCameraOff" : "call.turnCameraOn") { calls.toggleCamera() }
            Menu {
                ControlGroup {
                    ForEach(CallReaction.all.prefix(6)) { reaction in
                        Button(reaction.emoji) { calls.sendReaction(reaction) }
                    }
                }
                .controlGroupStyle(.palette)
                Button { calls.toggleHand() } label: {
                    calls.handRaised ? Label(menu: String(localized: "call.lowerHand"), icon: "ph-hand-regular")
                        : Label(menu: String(localized: "call.raiseHand"), icon: "ph-hand-regular")
                }
                Button { calls.toggleScreenShare() } label: {
                    calls.screenSharing ? Label(menu: String(localized: "call.stopSharingScreen"), icon: "ph-monitor-regular")
                        : Label(menu: String(localized: "call.shareScreen"), icon: "ph-monitor-arrow-up-regular")
                }
                if let watch = calls.watch {
                    if watch.state != nil {
                        Button(role: .destructive) { watch.stop() } label: {
                            Label(menu: String(localized: "call.watchTogether.stopTogether"), icon: "ph-stop-fill", destructive: true)
                        }
                        .tint(theme.danger)
                    } else {
                        Button { showWatchSheet = true } label: {
                            Label(menu: String(localized: "call.watchTogether.menuBeta"), icon: "ph-youtube-logo-fill")
                        }
                    }
                }
                if let onOpenChat {
                    Divider()
                    Button(action: onOpenChat) { Label(menu: String(localized: "room.openChat"), icon: "ph-chat-text-regular") }
                }
                if let client = session.client {
                    Button { calls.copyCallLog(client) } label: {
                        Label(menu: String(localized: "call.copyLog"), icon: "ph-clipboard-text-regular")
                    }
                }
            } label: {
                Image(calls.handRaised ? "ph-hand-regular" : "ph-dots-three-bold")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(moreHighlighted ? theme.textOnAccent : theme.textPrimary)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(moreHighlighted ? theme.accent : theme.fill, in: Circle())
            }
            .menuOrder(.fixed)
            // Menu icons in the text colour instead of the accent, like the message menu.
            .tint(theme.textPrimary)
            .accessibilityLabel(String(localized: "call.moreActionsHint"))
            Button {
                calls.leave()
            } label: {
                Image("ph-phone-x-regular")
                    .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(theme.danger, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "common.leave"))
        }
        .padding(WZ.Space.space4)
        .floatingGlass(in: Capsule())
        .sensoryFeedback(.impact(weight: .light), trigger: calls.micMuted)
        .sensoryFeedback(.impact(weight: .light), trigger: calls.deafened)
        .sensoryFeedback(.impact(weight: .light), trigger: calls.handRaised)
        .sheet(isPresented: $showWatchSheet) {
            if let watch = calls.watch { WatchTogetherStartSheet(watch: watch) }
        }
    }

    @State private var showWatchSheet = false

    private var moreHighlighted: Bool { calls.handRaised || calls.screenSharing }

    private func control(_ icon: String, active: Bool, highlighted: Bool = false, label: LocalizedStringKey,
                         action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.md, weight: .semibold))
                .foregroundStyle(active || highlighted ? theme.textOnAccent : theme.textPrimary)
                .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                .background(active ? theme.danger : highlighted ? theme.accent : theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct CallBar: View {
    enum Style { case floating, accessory, inline }

    var style: Style = .floating
    let onOpen: () -> Void
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var statusText: String {
        switch calls.status {
        case .reconnecting: String(localized: "call.statusReconnecting")
        case .joiningSlow: String(localized: "call.joiningSlow")
        case .connected: String(localized: "call.statusConnected")
        case .joiningMedia, .joiningMembership: String(localized: "call.statusConnecting")
        }
    }

    var body: some View {
        if let room = calls.room, calls.isInCall {
            HStack(spacing: style == .inline ? WZ.Space.space3 : WZ.Space.space4) {
                Button(action: onOpen) {
                    HStack(spacing: WZ.Space.space4) {
                        Image("ph-speaker-high-regular")
                            .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                            .foregroundStyle(theme.textOnAccent)
                            .frame(width: style == .inline ? WZ.Space.space8 : WZ.Space.space9,
                                   height: style == .inline ? WZ.Space.space8 : WZ.Space.space9)
                            .background(theme.success, in: Circle())
                        VStack(alignment: .leading, spacing: WZ.Space.space0) {
                            Text(room.displayName).font(.wizard(WZ.FontSize.md, .semibold)).foregroundStyle(theme.textPrimary)
                            if style != .inline {
                                Text(statusText)
                                    .font(.wizard(WZ.FontSize.sm))
                                    .foregroundStyle(calls.reconnecting ? theme.warningColor
                                        : calls.status == .connected ? theme.success : theme.textMuted)
                            }
                        }
                        .lineLimit(1)
                        if style != .inline { Spacer(minLength: 0) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "call.returnToCall"))
                if prefs.pushToTalk {
                    PushToTalkButton(size: buttonSize)
                } else {
                    barButton(calls.micMuted ? "ph-microphone-slash-regular" : "ph-microphone-regular", active: calls.micMuted,
                              label: calls.micMuted ? "call.unmute" : "call.mute") { calls.toggleMic() }
                }
                barButton(calls.deafened ? "ph-speaker-slash-regular" : "ph-speaker-high-regular", active: calls.deafened,
                          label: calls.deafened ? "call.undeafen" : "call.deafen") { calls.toggleDeafen() }
                Button { calls.leave() } label: {
                    Image("ph-phone-x-regular")
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(width: buttonSize, height: buttonSize)
                        .background(theme.danger, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "common.leave"))
            }
            .padding(.leading, style == .inline ? WZ.Space.space2 : WZ.Space.space4)
            .padding(.trailing, WZ.Space.space3)
            .frame(height: style == .inline ? nil : WZ.Space.space11)
            .frame(maxWidth: style == .inline ? .infinity : nil)
            .modifier(CallBarBackground(floating: style == .floating))
        }
    }

    private func barButton(_ icon: String, active: Bool, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(active ? theme.textOnAccent : theme.textPrimary)
                .frame(width: buttonSize, height: buttonSize)
                .background(active ? theme.danger : theme.fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var buttonSize: CGFloat { style == .inline ? WZ.Space.space9 : WZ.Space.space10 }
}

private struct CallBarBackground: ViewModifier {
    let floating: Bool

    func body(content: Content) -> some View {
        if floating { content.floatingGlass(in: Capsule()) } else { content }
    }
}

@available(iOS 26.0, *)
struct CallAccessory: View {
    let onOpen: () -> Void
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    var body: some View {
        CallBar(style: placement == .inline ? .inline : .accessory, onOpen: onOpen)
    }
}

struct ParticipantRow: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name ?? userId, url: avatarUrl, size: WZ.SizeAvatar.md)
            Text(name ?? userId)
                .font(.wizard(WZ.FontSize.lg, .medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space4)
        .task(id: userId) {
            let profile = await session.memberProfile(userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}

struct ParticipantStack: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userIds: [String]
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: -WZ.Space.space3) {
            ForEach(userIds.prefix(5), id: \.self) { userId in
                MiniAvatar(roomId: roomId, userId: userId)
                    .overlay(Circle().stroke(theme.bgPrimary, lineWidth: WZ.BorderWidth.thick))
            }
            if userIds.count > 5 {
                Text("+\(userIds.count - 5)")
                    .font(.wizard(WZ.FontSize.xs, .bold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.leading, WZ.Space.space4)
            }
        }
    }
}

private struct MiniAvatar: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @State private var name: String?
    @State private var url: String?

    var body: some View {
        AvatarView(name: name ?? userId, url: url, size: WZ.SizeAvatar.xs)
            .task(id: userId) {
                let profile = await session.memberProfile(userId, in: roomId)
                name = profile.name
                url = profile.avatarUrl
            }
    }
}

struct PushToTalkButton: View {
    var size: CGFloat = WZ.Space.space10
    var iconSize: CGFloat = WZ.SizeIcon.sm
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @GestureState private var pressing = false

    var body: some View {
        let talking = calls.talking
        Image("ph-microphone-regular")
            .font(.system(size: iconSize, weight: .semibold))
            .foregroundStyle(talking ? theme.textOnAccent : theme.textPrimary)
            .frame(width: size, height: size)
            .background(talking ? theme.success : theme.fill, in: Circle())
            .scaleEffect(talking ? 0.92 : 1)
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 0).updating($pressing) { _, state, _ in state = true })
            .onChange(of: pressing) { _, on in calls.setTalking(on) }
            .onDisappear { calls.setTalking(false) }
            .sensoryFeedback(.impact(weight: .light), trigger: talking)
            .animation(.snappy(duration: 0.15), value: talking)
            .accessibilityElement()
            .accessibilityLabel(String(localized: talking ? "call.talking" : "call.holdToTalk"))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { calls.setTalking(!calls.talking) }
    }
}
