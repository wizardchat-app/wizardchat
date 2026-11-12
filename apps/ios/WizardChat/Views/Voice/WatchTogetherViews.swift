import WizardChatCore
import SwiftUI
import WebKit

struct YouTubeSyncPlayer: UIViewRepresentable {
    let state: WatchState
    let onUpdate: (Bool, Double) -> Void
    var onFailed: (() -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(WeakHandler(context.coordinator), name: "yt")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        context.coordinator.webView = webView
        context.coordinator.state = state
        context.coordinator.onUpdate = onUpdate
        context.coordinator.onFailed = onFailed
        webView.loadHTMLString(Coordinator.html(videoId: state.videoId, autoplay: state.playing,
                                                start: state.expectedPosition()),
                               baseURL: URL(string: "https://app.wizardchat.org/"))
        context.coordinator.startTicking()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onUpdate = onUpdate
        context.coordinator.onFailed = onFailed
        if context.coordinator.state != state {
            context.coordinator.state = state
            context.coordinator.apply()
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stop()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "yt")
    }

    @MainActor
    final class Coordinator: NSObject {
        enum YT: Int { case unstarted = -1, ended = 0, playing = 1, paused = 2, buffering = 3, cued = 5 }
        private static let driftTolerance = 1.5
        private static let seekJump = 1.5
        private static let echoWindow = 1.5

        weak var webView: WKWebView?
        var state: WatchState?
        var onUpdate: ((Bool, Double) -> Void)?
        var onFailed: (() -> Void)?
        private var ready = false
        private var echoUntil: Date = .distantPast
        private var lastState = YT.unstarted
        private var time: Double = 0
        private var duration: Double = 0
        private var playerState = YT.unstarted
        private var videoId: String?
        private var steady: (time: Double, at: Date, playing: Bool)?
        private var timer: Timer?

        func startTicking() {
            timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.tick() }
            }
        }

        func stop() {
            timer?.invalidate()
            timer = nil
        }

        private func run(_ command: String) {
            webView?.evaluateJavaScript("window.wz && wz.\(command)")
        }

        func apply() {
            guard ready, let state else { return }
            echoUntil = Date().addingTimeInterval(Self.echoWindow)
            let target = state.expectedPosition()
            if let videoId, videoId != state.videoId {
                steady = nil
                run(state.playing ? "load('\(state.videoId)', \(target))" : "cue('\(state.videoId)', \(target))")
                return
            }
            if abs(time - target) > Self.driftTolerance {
                steady = nil
                run("seek(\(target))")
            }
            let running = playerState == .playing || playerState == .buffering
            if state.playing && !running { run("play()") }
            if !state.playing && running { run("pause()") }
        }

        fileprivate func received(_ message: [String: Any]) {
            switch message["type"] as? String {
            case "ready":
                ready = true
                apply()
            case "status":
                time = (message["time"] as? NSNumber)?.doubleValue ?? time
                duration = (message["duration"] as? NSNumber)?.doubleValue ?? duration
                playerState = YT(rawValue: (message["state"] as? NSNumber)?.intValue ?? -1) ?? playerState
                videoId = message["videoId"] as? String ?? videoId
            case "state":
                let newState = YT(rawValue: (message["state"] as? NSNumber)?.intValue ?? -1) ?? .unstarted
                if let time = (message["time"] as? NSNumber)?.doubleValue { self.time = time }
                playerState = newState
                handle(newState)
            case "error":
                onFailed?()
            default:
                break
            }
        }

        /// Your own play/pause in the player becomes the shared state (unless it's us
        /// applying someone else's change).
        private func handle(_ newState: YT) {
            let previous = lastState
            lastState = newState
            guard let state else { return }
            let isEcho = Date() < echoUntil
            switch newState {
            case .playing:
                let firstStart = previous == .unstarted || previous == .cued
                if firstStart && abs(time - state.expectedPosition()) > Self.driftTolerance {
                    echoUntil = Date().addingTimeInterval(Self.echoWindow)
                    steady = nil
                    run("seek(\(state.expectedPosition()))")
                    if !state.playing { run("pause()") }
                    return
                }
                if !isEcho && !state.playing { onUpdate?(true, time) }
            case .paused:
                if !isEcho && state.playing { onUpdate?(false, time) }
            case .ended:
                if state.playing { onUpdate?(false, duration) }
            default:
                break
            }
        }

        private func tick() {
            guard ready, let state else { return }
            let now = Date()
            let isSteady = playerState == .playing || playerState == .paused
            if now < echoUntil { steady = nil; return }
            let base = steady
            if isSteady { steady = (time, now, playerState == .playing) }
            if let base, isSteady {
                let maxAdvance = base.playing ? now.timeIntervalSince(base.at) : 0
                if time < base.time - Self.seekJump || time > base.time + maxAdvance + Self.seekJump {
                    onUpdate?(playerState == .playing, time)
                    return
                }
            }
            let target = state.expectedPosition()
            let offBy = abs(time - target)
            let drifted = (state.playing && playerState == .playing && offBy > Self.driftTolerance)
                || (!state.playing && playerState == .paused && offBy > Self.driftTolerance)
            if drifted {
                echoUntil = now.addingTimeInterval(Self.echoWindow)
                steady = nil
                run("seek(\(target))")
            }
        }

        static func html(videoId: String, autoplay: Bool, start: Double) -> String {
            """
            <!doctype html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
            <meta name="referrer" content="strict-origin-when-cross-origin">
            <style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
            </head><body><div id="player"></div><script>
            (function(){
              var player=null, ready=false;
              function post(m){ try{ window.webkit.messageHandlers.yt.postMessage(m); }catch(e){} }
              function status(){ if(!ready) return; var d=player.getVideoData?player.getVideoData():{};
                post({type:'status',time:player.getCurrentTime(),state:player.getPlayerState(),
                      duration:player.getDuration(),videoId:d&&d.video_id}); }
              window.wz={
                play:function(){ player.playVideo(); },
                pause:function(){ player.pauseVideo(); },
                seek:function(s){ player.seekTo(s,true); },
                load:function(id,s){ player.loadVideoById({videoId:id,startSeconds:s}); },
                cue:function(id,s){ player.cueVideoById({videoId:id,startSeconds:s}); }
              };
              window.onYouTubeIframeAPIReady=function(){
                player=new YT.Player('player',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
                  videoId:'\(videoId)',
                  playerVars:{autoplay:\(autoplay ? 1 : 0),start:\(Int(start)),playsinline:1,rel:0},
                  events:{
                    onReady:function(){ ready=true; status(); post({type:'ready'}); },
                    onStateChange:function(e){ post({type:'state',state:e.data,time:player.getCurrentTime()}); status(); },
                    onError:function(e){ post({type:'error',code:e.data}); }
                  }});
              };
              var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api';
              s.onerror=function(){ post({type:'error',code:-1}); };
              document.head.appendChild(s);
              setInterval(status,250);
            })();
            </script></body></html>
            """
        }
    }

    private final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var coordinator: Coordinator?
        init(_ coordinator: Coordinator) { self.coordinator = coordinator }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            Task { @MainActor in coordinator?.received(body) }
        }
    }
}

struct WatchTogetherTile: View {
    @ObservedObject var watch: WatchTogether
    let room: RoomSummary
    var compact = false
    var onFocus: () -> Void = {}

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var theme
    @State private var starterName: String?
    @State private var failed = false
    @State private var confirmStop = false

    var body: some View {
        if let state = watch.state {
            Group {
                if watch.watchingVideoId == state.videoId {
                    player(state)
                } else {
                    invite(state)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .task(id: state.startedBy) {
                starterName = await session.memberProfile(state.startedBy, in: room.id).name
            }
        }
    }

    private func player(_ state: WatchState) -> some View {
        ZStack {
            Color.black
            YouTubeSyncPlayer(state: state,
                              onUpdate: { playing, position in watch.update(playing: playing, position: position) },
                              onFailed: { failed = true })
                .aspectRatio(16 / 9, contentMode: .fit)
                .allowsHitTesting(!compact)
            if failed {
                Text(String(localized: "call.watchTogether.videoUnplayable"))
                    .font(.wizard(compact ? WZ.FontSize.xs : WZ.FontSize.md, .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding()
            }
            if compact {
                Color.clear.contentShape(Rectangle()).onTapGesture(perform: onFocus)
            }
        }
        .overlay(alignment: .top) {
            if !compact {
                HStack(spacing: WZ.Space.space3) {
                    Label(L10n.format("call.watchTogether.startedBy", "\(starterName ?? state.startedBy)"), image: "ph-youtube-logo-fill")
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, WZ.Space.space4)
                        .padding(.vertical, WZ.Space.space2)
                        .background(.black.opacity(0.45), in: Capsule())
                    Spacer(minLength: 0)
                    smallButton("ph-arrow-square-out-regular", label: "call.watchTogether.openOnYouTube") {
                        openURL(WatchTogether.watchURL(state.videoId, seconds: state.expectedPosition()))
                    }
                    smallButton("ph-eye-slash-regular", label: "call.watchTogether.stopJustMe") { watch.watchingVideoId = nil }
                    smallButton("ph-x-regular", label: "call.watchTogether.stopForEveryone", tint: theme.danger) { confirmStop = true }
                }
                .padding(WZ.Space.space4)
            }
        }
        .confirmationDialog(String(localized: "call.watchTogether.stopConfirm"), isPresented: $confirmStop, titleVisibility: .visible) {
            Button(String(localized: "call.watchTogether.stopForEveryone"), role: .destructive) { watch.stop() }
        }
        .onChange(of: state.videoId) { _, _ in failed = false }
    }

    private func invite(_ state: WatchState) -> some View {
        ZStack {
            theme.bgTertiary
            VStack(spacing: compact ? WZ.Space.space3 : WZ.Space.space5) {
                Image("ph-youtube-logo-fill")
                    .font(.system(size: compact ? WZ.SizeIcon.lg : WZ.SizeIcon.xxl))
                    .foregroundStyle(theme.textPrimary)
                if !compact {
                    Text(L10n.format("call.watchTogether.isWatching", "\(starterName ?? state.startedBy)"))
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .multilineTextAlignment(.center)
                    if !watch.consent {
                        Text(String(localized: "call.watchTogether.consentNote"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.center)
                    }
                }
                Button {
                    watch.consent = true
                    watch.watchingVideoId = state.videoId
                } label: {
                    Label(String(localized: "call.watchTogether.watch"), image: "ph-play-fill")
                        .font(.wizard(compact ? WZ.FontSize.xs : WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .padding(.horizontal, compact ? WZ.Space.space4 : WZ.Space.space6)
                        .padding(.vertical, compact ? WZ.Space.space2 : WZ.Space.space4)
                        .background(theme.accent, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(compact ? WZ.Space.space3 : WZ.Space.space6)
        }
    }

    private func smallButton(_ icon: String, label: LocalizedStringKey, tint: Color = .white,
                             action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .background(.black.opacity(0.45), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct WatchTogetherStartSheet: View {
    let watch: WatchTogether
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var link = ""
    @State private var invalid = false

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    TextField("https://www.youtube.com/watch?v=...", text: $link)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(start)
                    if UIPasteboard.general.hasURLs || UIPasteboard.general.hasStrings {
                        Button { link = UIPasteboard.general.string ?? link } label: {
                            Label(String(localized: "call.watchTogether.pasteLink"), image: "ph-clipboard-text-regular")
                        }
                    }
                } header: {
                    Text(String(localized: "call.watchTogether.linkLabel"))
                } footer: {
                    if invalid {
                        Text(String(localized: "call.watchTogether.invalidLink")).foregroundStyle(theme.error)
                    } else {
                        Text(String(localized: "call.watchTogether.joinNote"))
                    }
                }
            }
            .tint(theme.control)
            .navigationTitle(String(localized: "call.watchTogether.watch"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "call.watchTogether.start"), action: start).disabled(link.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func start() {
        guard let id = WatchTogether.parseVideoId(link) else { invalid = true; return }
        watch.start(videoId: id)
        dismiss()
    }
}
