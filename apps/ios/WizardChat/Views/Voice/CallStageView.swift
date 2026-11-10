import LiveKit
import WizardChatCore
import SwiftUI

struct CallStageView: View {
    let room: RoomSummary

    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var volumeFor: CallParticipantInfo?
    @State private var focusedScreen: String?

    private var screenShares: [CallParticipantInfo] { calls.participants.filter { $0.screenTrack != nil } }

    var body: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space5) {
                if calls.reconnecting {
                    Label(String(localized: "call.statusReconnecting"), image: "ph-wifi-slash-regular")
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.warningColor)
                }
                if let watch = calls.watch {
                    WatchTogetherStage(watch: watch, room: room)
                }
                ForEach(screenShares) { participant in
                    if let track = participant.screenTrack {
                        ScreenShareTile(roomId: room.id, participant: participant, track: track)
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: WZ.Space.space5)], spacing: WZ.Space.space5) {
                    ForEach(calls.participants) { participant in
                        ParticipantTile(roomId: room.id, participant: participant)
                            .onTapGesture { if !participant.isLocal { volumeFor = participant } }
                            .contextMenu { if !participant.isLocal { tileMenu(participant) } }
                    }
                }
            }
            .padding(WZ.Space.space6)
            .animation(.easeOut(duration: WZ.MotionDuration.normal), value: calls.participants)
        }
        .overlay {
            if calls.state == .joining {
                ProgressView(String(localized: "call.statusConnecting"))
                    .tint(theme.accent)
                    .padding(WZ.Space.space7)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            }
        }
        .sheet(item: $volumeFor) { participant in
            VolumeSheet(roomId: room.id, userId: participant.userId)
                .presentationDetents([.height(260)])
        }
    }

    @ViewBuilder
    private func tileMenu(_ participant: CallParticipantInfo) -> some View {
        Button {
            calls.toggleLocalMute(participant.userId)
        } label: {
            participant.locallyMuted
                ? Label(String(localized: "call.unmuteForMe"), image: "ph-speaker-high-regular")
                : Label(String(localized: "call.muteForMe"), image: "ph-speaker-slash-regular")
        }
        Button { volumeFor = participant } label: { Label(String(localized: "call.volume"), image: "ph-sliders-regular") }
    }
}

private struct ParticipantTile: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let participant: CallParticipantInfo
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    private var label: String {
        let name = name ?? participant.userId
        if participant.isOwnOtherDevice { return L10n.format("call.ownOtherDevice", name) }
        return name
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous).fill(theme.fill)
            if let track = participant.cameraTrack {
                SwiftUIVideoView(track, layoutMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            } else {
                AvatarView(name: name ?? participant.userId, url: avatarUrl, size: WZ.SizeAvatar.lg)
                    .opacity(participant.connected ? 1 : 0.5)
            }
            if let reaction = participant.reaction {
                Text(reaction)
                    .font(.system(size: WZ.SizeIcon.xxl))
                    .transition(.scale.combined(with: .opacity))
                    .id(reaction)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay {
            RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous)
                .stroke(participant.speaking ? theme.success : .clear, lineWidth: WZ.BorderWidth.thick)
        }
        .overlay(alignment: .topTrailing) {
            if participant.handRaised {
                Text("🖐️")
                    .font(.system(size: WZ.SizeIcon.md))
                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                    .background(.regularMaterial, in: Circle())
                    .padding(WZ.Space.space4)
            }
        }
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: WZ.Space.space2) {
                if participant.micMuted || participant.locallyMuted {
                    Image(participant.locallyMuted ? "ph-speaker-slash-regular" : "ph-microphone-slash-regular")
                        .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                        .foregroundStyle(theme.danger)
                }
                Text(label)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .lineLimit(1)
                if !participant.connected {
                    ProgressView().controlSize(.mini)
                }
            }
            .foregroundStyle(theme.textPrimary)
            .padding(.horizontal, WZ.Space.space4)
            .padding(.vertical, WZ.Space.space2)
            .background(.regularMaterial, in: Capsule())
            .padding(WZ.Space.space4)
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: participant.reaction)
        .animation(.easeOut(duration: WZ.MotionDuration.fast), value: participant.speaking)
        .accessibilityElement(children: .combine)
        .accessibilityHint(participant.isLocal ? "" : String(localized: "call.volumeHint"))
        .task(id: participant.userId) {
            let profile = await session.memberProfile(participant.userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}

private struct ScreenShareTile: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let participant: CallParticipantInfo
    let track: VideoTrack
    @Environment(\.theme) private var theme
    @State private var name: String?

    var body: some View {
        SwiftUIVideoView(track, layoutMode: .fit)
            .aspectRatio(16 / 9, contentMode: .fit)
            .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                Label(L10n.format("call.userScreen", "\(name ?? participant.userId)"), image: "ph-monitor-arrow-up-regular")
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .padding(.horizontal, WZ.Space.space4)
                    .padding(.vertical, WZ.Space.space2)
                    .background(.regularMaterial, in: Capsule())
                    .padding(WZ.Space.space4)
            }
            .overlay(alignment: .topLeading) {
                HStack(spacing: 6) {
                    Text(String(localized: "call.live"))
                        .tracking(0.3)
                        .padding(.horizontal, 7)
                        .frame(height: 18)
                        .background(Color(red: 0x59 / 255, green: 0x36 / 255, blue: 0x95 / 255), in: Capsule())
                    if participant.isLocal, !participant.screenWatchers.isEmpty {
                        HStack(spacing: 4) {
                            Image("ph-eye-regular").font(.system(size: 12, weight: .bold))
                            Text(verbatim: "\(participant.screenWatchers.count)")
                        }
                        .padding(.horizontal, 7)
                        .frame(height: 18)
                        .background(.black.opacity(0.6), in: Capsule())
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(L10n.format("call.streamViewers", participant.screenWatchers.count))
                    }
                }
                .font(.wizard(WZ.FontSize.xs, .bold))
                .foregroundStyle(.white)
                .padding(WZ.Space.space4)
            }
            .task(id: participant.userId) {
                name = await session.memberProfile(participant.userId, in: roomId).name
            }
    }
}

private struct VolumeSheet: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    private var participant: CallParticipantInfo? { calls.participants.first { $0.userId == userId } }

    var body: some View {
        VStack(spacing: WZ.Space.space6) {
            HStack(spacing: WZ.Space.space5) {
                AvatarView(name: name ?? userId, url: avatarUrl, size: WZ.SizeAvatar.md)
                Text(name ?? userId).font(.wizard(WZ.FontSize.lg, .semibold)).foregroundStyle(theme.textPrimary).lineLimit(1)
                Spacer()
            }
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                HStack {
                    Text(String(localized: "call.volume")).font(.wizard(WZ.FontSize.md, .medium))
                    Spacer()
                    Text("\(Int(((participant?.volume ?? 1) * 100).rounded()))%")
                        .font(.wizard(WZ.FontSize.md).monospacedDigit())
                        .foregroundStyle(theme.textMuted)
                }
                HStack(spacing: WZ.Space.space4) {
                    Image("ph-speaker-none-regular").foregroundStyle(theme.textMuted)
                    Slider(value: Binding(get: { participant?.volume ?? 1 },
                                          set: { calls.setVolume($0, for: userId) }), in: 0...2)
                        .tint(theme.accent)
                    Image("ph-speaker-high-regular").foregroundStyle(theme.textMuted)
                }
            }
            Toggle(String(localized: "call.muteForMe"), isOn: Binding(get: { participant?.locallyMuted ?? false },
                                                set: { _ in calls.toggleLocalMute(userId) }))
                .font(.wizard(WZ.FontSize.md, .medium))
                .tint(theme.accent)
        }
        .foregroundStyle(theme.textPrimary)
        .padding(WZ.Space.space8)
        .task {
            let profile = await session.memberProfile(userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}
