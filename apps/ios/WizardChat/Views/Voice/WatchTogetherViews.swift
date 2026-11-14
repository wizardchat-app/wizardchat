import WizardChatCore
import SwiftUI
import WebKit

struct YouTubeSyncPlayer: UIViewRepresentable {
    let watch: WatchTogether
    let state: WatchState
    var onFailed: (() -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator(watch: watch) }

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
        context.coordinator.onFailed = onFailed
        webView.loadHTMLString(Coordinator.html(videoId: state.videoId, autoplay: state.playing,
                                                start: state.expectedPosition()),
                               baseURL: URL(string: "https://app.wizardchat.org/"))
        context.coordinator.startTicking()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
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

    /// Mirrors the web player: holds everyone while you buffer, nudges the speed to catch up,
    /// seeks only when far off.
    @MainActor
    final class Coordinator: NSObject {
        enum YT: Int { case unstarted = -1, ended = 0, playing = 1, paused = 2, buffering = 3, cued = 5 }
        private static let inSync = 0.3
        private static let nudgeMax = 3.0
        private static let seekFallback = 1.5
        private static let nudgeFactor = 0.25
        private static let seekJump = 1.5
        private static let commandTimeout = 8.0
        private static let bufferWait = 2.0
        private static let bufferAhead = 4.0
        private static let holdCooldown = 8.0

        private struct Command {
            let playing: Bool
            let seekTo: Double?
            let until: Date
        }

        private let watch: WatchTogether
        weak var webView: WKWebView?
        var state: WatchState?
        var onFailed: (() -> Void)?
        private var ready = false
        private var lastState = YT.unstarted
        private var time: Double = 0
        private var duration: Double = 0
        private var rate: Double = 1
        private var reportsRate = false
        private var loaded: Double?
        private var playerState = YT.unstarted
        private var videoId: String?
        private var command: Command?
        private var steady: (time: Double, at: Date, playing: Bool)?
        private var inSync = false
        private var requestedRate: Double = 1
        private var bufferingSince: Date?
        private var holdCooldownUntil: Date = .distantPast
        private var timer: Timer?

        init(watch: WatchTogether) {
            self.watch = watch
        }

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

        private func command(playing: Bool, seekTo: Double?) {
            command = Command(playing: playing, seekTo: seekTo, until: Date().addingTimeInterval(Self.commandTimeout))
            steady = nil
        }

        private func pending(_ now: Date = Date()) -> Command? {
            guard let command, now < command.until else { return nil }
            return command
        }

        private func setRate(_ next: Double) {
            guard requestedRate != next else { return }
            requestedRate = next
            run("rate(\(next))")
        }

        private func seek(_ seconds: Double) {
            time = seconds
            run("seek(\(seconds))")
        }

        func apply() {
            guard ready, let s = state else { return }
            let target = s.expectedPosition()
            if let videoId, videoId != s.videoId {
                command(playing: s.playing, seekTo: target)
                self.videoId = s.videoId
                time = target
                run(s.playing ? "load('\(s.videoId)', \(target))" : "cue('\(s.videoId)', \(target))")
                return
            }
            let running = playerState == .playing || playerState == .buffering
            let seekTo: Double? = abs(time - target) > Self.seekFallback ? target : nil
            if seekTo != nil || s.playing != running { command(playing: s.playing, seekTo: seekTo) }
            if let seekTo { seek(seekTo) }
            if s.playing && !running { run("play()") }
            if !s.playing && running { run("pause()") }
            setRate(s.rate)
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
                if let rate = (message["rate"] as? NSNumber)?.doubleValue {
                    self.rate = rate
                    reportsRate = true
                }
                loaded = (message["loaded"] as? NSNumber)?.doubleValue ?? loaded
            case "state":
                let newState = YT(rawValue: (message["state"] as? NSNumber)?.intValue ?? -1) ?? .unstarted
                if let time = (message["time"] as? NSNumber)?.doubleValue { self.time = time }
                playerState = newState
                handle(newState)
            case "rate":
                if let rate = (message["rate"] as? NSNumber)?.doubleValue { rateChanged(rate) }
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
            guard let s = state else { return }
            if newState == .buffering {
                if bufferingSince == nil { bufferingSince = Date() }
                return
            }
            bufferingSince = nil
            let pending = pending()
            switch newState {
            case .playing:
                if pending?.playing == true { command = nil }
                let firstStart = previous == .unstarted || previous == .cued
                if firstStart && abs(time - s.expectedPosition()) > Self.seekFallback {
                    command(playing: s.playing, seekTo: s.expectedPosition())
                    seek(s.expectedPosition())
                    if !s.playing { run("pause()") }
                    return
                }
                if !s.playing && pending == nil { watch.update(playing: true, position: time) }
            case .paused:
                if let pending, !pending.playing { command = nil }
                if s.playing && pending == nil { watch.update(playing: false, position: time) }
            case .ended:
                if s.playing { watch.update(playing: false, position: duration) }
            default:
                break
            }
        }

        private func rateChanged(_ next: Double) {
            rate = next
            guard let s = state, next != requestedRate, requestedRate == s.rate else { return }
            requestedRate = next
            watch.updateRate(next, position: time)
        }

        private func tick() {
            guard ready, let s = state else { return }
            let now = Date()
            let myId = watch.ownUserId
            let pending = pending(now)

            let bufferingFor = bufferingSince.map { now.timeIntervalSince($0) } ?? 0
            if s.playing && s.waitingFor == nil && bufferingFor > Self.bufferWait && now > holdCooldownUntil {
                holdCooldownUntil = now.addingTimeInterval(Self.holdCooldown)
                watch.update(playing: false, position: time, waitingFor: myId)
                return
            }
            if !s.playing && s.waitingFor == myId && playerState != .buffering {
                let isReady = loaded.map { $0 >= 0.99 || duration <= 0 || $0 * duration >= s.position + Self.bufferAhead } ?? true
                if isReady {
                    holdCooldownUntil = now.addingTimeInterval(Self.holdCooldown)
                    watch.update(playing: true, position: s.position)
                }
                return
            }

            let isSteady = playerState == .playing || playerState == .paused
            if let pending, isSteady, pending.playing == (playerState == .playing),
               pending.seekTo.map({ abs(time - $0) <= Self.seekFallback }) ?? true {
                command = nil
            }
            if command != nil || !isSteady {
                steady = nil
                return
            }

            let target = s.expectedPosition()
            let offBy = time - target
            let base = steady
            steady = (time, now, playerState == .playing)
            if let base, inSync {
                let maxAdvance = base.playing ? now.timeIntervalSince(base.at) * rate : 0
                if time < base.time - Self.seekJump || time > base.time + maxAdvance + Self.seekJump {
                    inSync = true
                    watch.update(playing: playerState == .playing, position: time)
                    return
                }
            }
            inSync = abs(offBy) <= Self.seekFallback

            if s.playing && playerState == .playing {
                let canNudge = reportsRate && s.rate == 1
                if abs(offBy) <= Self.inSync {
                    setRate(s.rate)
                } else if canNudge && abs(offBy) <= Self.nudgeMax {
                    setRate(offBy < 0 ? 1 + Self.nudgeFactor : 1 - Self.nudgeFactor)
                } else if abs(offBy) > (canNudge ? Self.nudgeMax : Self.seekFallback) {
                    setRate(s.rate)
                    command(playing: true, seekTo: target)
                    seek(target)
                }
            } else if !s.playing && playerState == .paused && abs(offBy) > Self.inSync {
                command(playing: false, seekTo: target)
                seek(target)
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
                      duration:player.getDuration(),videoId:d&&d.video_id,
                      rate:player.getPlaybackRate?player.getPlaybackRate():1,
                      loaded:player.getVideoLoadedFraction?player.getVideoLoadedFraction():null}); }
              window.wz={
                play:function(){ player.playVideo(); },
                pause:function(){ player.pauseVideo(); },
                seek:function(s){ player.seekTo(s,true); },
                rate:function(r){ player.setPlaybackRate(r); },
                load:function(id,s){ player.loadVideoById({videoId:id,startSeconds:s}); },
                cue:function(id,s){ player.cueVideoById({videoId:id,startSeconds:s}); }
              };
              var ccOff=null; function captionsOff(){ var d=player.getVideoData?player.getVideoData():null, id=d&&d.video_id; if(!id||id===ccOff) return; ccOff=id; try{ player.unloadModule('captions'); player.unloadModule('cc'); }catch(e){} }
              window.onYouTubeIframeAPIReady=function(){
                player=new YT.Player('player',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
                  videoId:'\(videoId)',
                  playerVars:{autoplay:\(autoplay ? 1 : 0),start:\(Int(start)),playsinline:1,rel:0,cc_load_policy:0},
                  events:{
                    onReady:function(){ ready=true; status(); post({type:'ready'}); },
                    onStateChange:function(e){ if(e.data===1) captionsOff(); post({type:'state',state:e.data,time:player.getCurrentTime()}); status(); },
                    onPlaybackRateChange:function(e){ status(); post({type:'rate',rate:e.data}); },
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
    @State private var waitingName: String?
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
            .task(id: state.waitingFor) {
                guard let waitingFor = state.waitingFor else { return }
                waitingName = await session.memberProfile(waitingFor, in: room.id).name
            }
        }
    }

    private func player(_ state: WatchState) -> some View {
        ZStack {
            Color.black
            YouTubeSyncPlayer(watch: watch, state: state, onFailed: { failed = true })
                .aspectRatio(16 / 9, contentMode: .fit)
                .allowsHitTesting(!compact)
            if failed {
                Text(String(localized: "call.watchTogether.videoUnplayable"))
                    .font(.wizard(compact ? WZ.FontSize.xs : WZ.FontSize.md, .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding()
            }
            if let waitingFor = state.waitingFor, waitingFor != watch.ownUserId, !failed {
                Text(L10n.format("call.watchTogether.waitingFor", waitingName ?? waitingFor))
                    .font(.wizard(compact ? WZ.FontSize.xs : WZ.FontSize.sm))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .padding(.horizontal, WZ.Space.space5)
                    .padding(.vertical, WZ.Space.space3)
                    .background(.black.opacity(0.7), in: Capsule())
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(WZ.Space.space6)
                    .allowsHitTesting(false)
            }
            if compact {
                Color.clear.contentShape(Rectangle()).onTapGesture(perform: onFocus)
            }
        }
        .overlay(alignment: .top) {
            if !compact {
                HStack(spacing: WZ.Space.space3) {
                    Label(String(localized: "call.watchTogether.badge"), image: "ph-youtube-logo-fill")
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, WZ.Space.space4)
                        .padding(.vertical, WZ.Space.space2)
                        .background(.black.opacity(0.45), in: Capsule())
                    WatchViewersChip(viewers: watch.viewers, roomId: room.id)
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
        .overlay(alignment: .topLeading) {
            if !compact {
                WatchViewersChip(viewers: watch.viewers, roomId: room.id)
                    .padding(WZ.Space.space4)
            }
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

private struct WatchViewersChip: View {
    let viewers: [String]
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @State private var names: [String: String] = [:]

    var body: some View {
        if !viewers.isEmpty {
            Menu {
                ForEach(viewers, id: \.self) { userId in
                    Label(names[userId] ?? userId, image: "ph-eye-regular")
                }
            } label: {
                HStack(spacing: 4) {
                    Image("ph-eye-regular").font(.system(size: 14, weight: .bold))
                    Text(verbatim: "\(viewers.count)")
                }
                .font(.wizard(WZ.FontSize.sm, .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, WZ.Space.space4)
                .frame(height: 28)
                .background(.black.opacity(0.6), in: Capsule())
            }
            .id(viewers.map { names[$0] ?? $0 })
            .accessibilityLabel(L10n.format("call.streamViewers", viewers.count))
            .task(id: viewers) {
                for userId in viewers where names[userId] == nil {
                    names[userId] = await session.memberProfile(userId, in: roomId).name
                }
            }
        }
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
