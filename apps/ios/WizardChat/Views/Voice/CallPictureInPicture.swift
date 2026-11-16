import AVKit
import LiveKit
import SwiftUI

struct CallPictureInPictureSource: UIViewRepresentable {
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.scenePhase) private var scenePhase

    func makeCoordinator() -> CallPictureInPicture { CallPictureInPicture() }

    func makeUIView(context: Context) -> UIView {
        let source = UIView()
        source.isUserInteractionEnabled = false
        context.coordinator.setUp(source: source, calls: calls)
        return source
    }

    func updateUIView(_ source: UIView, context: Context) {
        let content = CallPictureInPictureContent()
            .environmentObject(calls)
            .environmentObject(session)
            .environmentObject(prefs)
            .environment(\.theme, theme)
            .environment(\.mediaLoader, mediaLoader)
        context.coordinator.update(content: AnyView(content), enabled: calls.state == .joined,
                                   active: scenePhase == .active,
                                   landscape: CallPictureInPicture.watching(calls) != nil
                                       || CallPictureInPicture.featured(calls.participants)?.screen == true)
    }
}

@MainActor
final class CallPictureInPicture: NSObject, AVPictureInPictureControllerDelegate {
    struct Featured {
        let participant: CallParticipantInfo
        let screen: Bool
        var track: VideoTrack? { screen ? participant.screenTrack : participant.cameraTrack }
    }

    private var controller: AVPictureInPictureController?
    private let window = AVPictureInPictureVideoCallViewController()
    private let host = UIHostingController(rootView: AnyView(EmptyView()))
    private weak var calls: CallManager?

    static func watching(_ calls: CallManager) -> WatchState? {
        guard let watch = calls.watch, let state = watch.state, watch.watchingVideoId == state.videoId else { return nil }
        return state
    }

    static func featured(_ participants: [CallParticipantInfo], lastSpeaker: String? = nil) -> Featured? {
        let others = participants.filter { !$0.isLocal && $0.connected }
        if let sharing = others.first(where: { $0.screenShared && $0.screenTrack != nil }) {
            return Featured(participant: sharing, screen: true)
        }
        let person = others.first(where: \.speaking) ?? others.first { $0.identity == lastSpeaker }
            ?? others.first { $0.cameraTrack != nil } ?? others.first ?? participants.first(where: \.isLocal)
        return person.map { Featured(participant: $0, screen: false) }
    }

    func setUp(source: UIView, calls: CallManager) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        self.calls = calls
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        window.addChild(host)
        window.view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: window.view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: window.view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: window.view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: window.view.bottomAnchor),
        ])
        host.didMove(toParent: window)
        let controller = AVPictureInPictureController(
            contentSource: .init(activeVideoCallSourceView: source, contentViewController: window))
        controller.delegate = self
        self.controller = controller
    }

    func update(content: AnyView, enabled: Bool, active: Bool, landscape: Bool) {
        guard let controller else { return }
        host.rootView = content
        window.preferredContentSize = landscape ? CGSize(width: 1920, height: 1080) : CGSize(width: 1080, height: 1920)
        controller.canStartPictureInPictureAutomaticallyFromInline = enabled
        if controller.isPictureInPictureActive, !enabled || active {
            controller.stopPictureInPicture()
        }
    }

    nonisolated func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        Task { @MainActor in
            calls?.showCallScreen = true
            completionHandler(true)
        }
    }
}

private struct CallPictureInPictureContent: View {
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var lastSpeaker: String?
    @State private var name: String?
    @State private var avatarUrl: String?

    var body: some View {
        let featured = CallPictureInPicture.featured(calls.participants, lastSpeaker: lastSpeaker)
        let participant = featured?.participant
        ZStack {
            theme.bgPrimary
            if let watch = calls.watch {
                PictureInPictureWatch(watch: watch)
            }
            if CallPictureInPicture.watching(calls) == nil, let featured, let participant {
                let label = name ?? participant.userId
                CallBackdrop(name: label, url: avatarUrl)
                if let track = featured.track {
                    SwiftUIVideoView(track, layoutMode: featured.screen ? .fit : .fill, renderMode: .sampleBuffer)
                        .transition(.opacity)
                } else {
                    AvatarView(name: label, url: avatarUrl, size: WZ.SizeAvatar.xl)
                        .overlay {
                            Circle()
                                .stroke(participant.speaking ? theme.success : .clear, lineWidth: WZ.BorderWidth.thick)
                                .padding(-WZ.Space.space3)
                        }
                }
                if let flash = participant.soundboard?.emoji ?? participant.reaction {
                    Text(flash)
                        .font(.system(size: WZ.SizeIcon.xxl))
                        .transition(.scale.combined(with: .opacity))
                        .id(flash)
                }
            }
        }
        .overlay(alignment: .bottomLeading) {
            if CallPictureInPicture.watching(calls) == nil, let participant {
                HStack(spacing: WZ.Space.space2) {
                    if participant.micMuted {
                        Image("ph-microphone-slash-regular")
                            .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                            .foregroundStyle(theme.danger)
                    }
                    Text(name ?? participant.userId)
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                }
                .padding(.horizontal, WZ.Space.space4)
                .padding(.vertical, WZ.Space.space2)
                .background(.regularMaterial, in: Capsule())
                .padding(WZ.Space.space4)
            }
        }
        .animation(.default, value: participant?.identity)
        .ignoresSafeArea()
        .onChange(of: calls.participants.first { !$0.isLocal && $0.speaking }?.identity) { _, speaker in
            if let speaker { lastSpeaker = speaker }
        }
        .task(id: participant?.userId) {
            guard let userId = participant?.userId else { return }
            let profile = await session.memberProfile(userId, in: calls.room?.id)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}

// The YouTube player can't run in the picture-in-picture window, so it shows what's playing
private struct PictureInPictureWatch: View {
    @ObservedObject var watch: WatchTogether
    @Environment(\.theme) private var theme

    var body: some View {
        if let state = watch.state, watch.watchingVideoId == state.videoId {
            AsyncImage(url: WatchTogether.thumbnailURL(state.videoId)) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Color.black
            }
            .overlay(alignment: .topLeading) {
                Label(String(localized: "call.watchTogether.name"), image: "ph-youtube-logo-fill")
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, WZ.Space.space4)
                    .padding(.vertical, WZ.Space.space2)
                    .background(theme.accent, in: Capsule())
                    .padding(WZ.Space.space4)
            }
        }
    }
}
