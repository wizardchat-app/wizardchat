import WizardChatCore
import SwiftUI
import WebKit

struct WatchQueueSheet: View {
    @ObservedObject var watch: WatchTogether
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var link = ""
    @State private var adding = false
    @State private var notice: (text: String, error: Bool)?
    @State private var historyOpen = false
    @State private var confirmClear = false
    @State private var names: [String: String] = [:]

    var body: some View {
        NavigationStack {
            Group {
                if let state = watch.state {
                    content(state)
                } else {
                    theme.groupedBackground.ignoresSafeArea()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: WZ.Space.space3) {
                        Text(String(localized: "call.watchTogether.queue.title"))
                            .font(.wizard(WZ.FontSize.lg, .semibold))
                            .foregroundStyle(theme.textPrimary)
                        Text(verbatim: "\(watch.state?.queue.count ?? 0)/\(WatchTogether.queueLimit)")
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onChange(of: watch.state == nil) { _, stopped in if stopped { dismiss() } }
        .task(id: userIds) {
            for userId in userIds where names[userId] == nil {
                names[userId] = await session.memberProfile(userId, in: roomId).name
            }
        }
    }

    private var userIds: [String] {
        guard let state = watch.state else { return [] }
        var ids: [String] = []
        for userId in [state.addedBy] + state.queue.map(\.addedBy) + state.history.map(\.addedBy) where !ids.contains(userId) {
            ids.append(userId)
        }
        return ids
    }

    private func name(_ userId: String) -> String { names[userId] ?? userId }

    private func content(_ state: WatchState) -> some View {
        let full = state.queue.count >= WatchTogether.queueLimit
        return ThemedList {
            Section {
                HStack(spacing: WZ.Space.space4) {
                    TextField(String(localized: "call.watchTogether.queue.addPlaceholder"), text: $link)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit(submit)
                        .disabled(adding || full)
                        .onChange(of: link) { _, value in if !value.isEmpty { notice = nil } }
                    if adding {
                        ProgressView()
                    } else {
                        Button(String(localized: "call.watchTogether.queue.add"), action: submit)
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .buttonStyle(.borderless)
                            .disabled(link.trimmingCharacters(in: .whitespaces).isEmpty || full)
                    }
                }
            } footer: {
                if let notice {
                    Text(notice.text).foregroundStyle(notice.error ? theme.error : theme.textMuted)
                } else if full {
                    Text(String(localized: "call.watchTogether.queue.full")).foregroundStyle(theme.textMuted)
                }
            }

            Section {
                WatchQueueRow(item: WatchQueueItem(id: "current", videoId: state.videoId, addedBy: state.addedBy),
                              addedByName: name(state.addedBy), current: true)
            } header: {
                sectionLabel("call.watchTogether.queue.nowPlaying")
            }

            Section {
                if state.queue.isEmpty {
                    Text(String(localized: "call.watchTogether.queue.empty"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                } else {
                    ForEach(Array(state.queue.enumerated()), id: \.element.id) { index, item in
                        WatchQueueRow(item: item, addedByName: name(item.addedBy)) {
                            action("ph-play-fill", label: "call.watchTogether.queue.playNow") { watch.playNow(item) }
                            if index > 0 {
                                action("ph-arrow-line-up-regular", label: "call.watchTogether.queue.playNext") {
                                    watch.playNext(item.id)
                                }
                            }
                            action("ph-x-regular", label: "call.watchTogether.queue.remove", tint: theme.danger) {
                                watch.remove(item.id)
                            }
                        }
                        .accessibilityHint(String(localized: "call.watchTogether.queue.reorder"))
                    }
                    .onMove { from, to in
                        var ids = state.queue.map(\.id)
                        ids.move(fromOffsets: from, toOffset: to)
                        watch.reorder(ids)
                    }
                }
            } header: {
                HStack(spacing: WZ.Space.space5) {
                    sectionLabel("call.watchTogether.queue.upNext")
                    Spacer(minLength: 0)
                    if state.queue.count > 1 {
                        headerButton(Image("ph-shuffle-regular"), label: "call.watchTogether.queue.shuffle",
                                     tint: theme.textSecondary) { watch.shuffle() }
                    }
                    if !state.queue.isEmpty {
                        headerButton(Image("ph-trash-regular"), label: "call.watchTogether.queue.clear",
                                     tint: theme.danger) { confirmClear = true }
                    }
                }
            }

            if !state.history.isEmpty {
                Section {
                    if historyOpen {
                        ForEach(state.history) { item in
                            WatchQueueRow(item: item, addedByName: name(item.addedBy)) {
                                action("ph-play-fill", label: "call.watchTogether.queue.playAgain") { watch.playNow(item) }
                            }
                        }
                    }
                } header: {
                    Button {
                        withAnimation { historyOpen.toggle() }
                    } label: {
                        HStack(spacing: WZ.Space.space3) {
                            Image(historyOpen ? "ph-caret-down-regular" : "ph-caret-right-bold")
                                .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                            Text(L10n.format("call.watchTogether.queue.history", state.history.count))
                                .textCase(nil)
                        }
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .confirmationDialog(String(localized: "call.watchTogether.queue.clearConfirm"), isPresented: $confirmClear,
                            titleVisibility: .visible) {
            Button(String(localized: "call.watchTogether.queue.clear"), role: .destructive) { watch.clear() }
        } message: {
            Text(L10n.format("call.watchTogether.queue.clearMessage", state.queue.count))
        }
    }

    private func sectionLabel(_ key: String) -> some View {
        Text(NSLocalizedString(key, comment: ""))
            .font(.wizard(WZ.FontSize.sm, .semibold))
            .foregroundStyle(theme.textSecondary)
            .textCase(nil)
    }

    private func headerButton(_ image: Image, label: LocalizedStringKey, tint: Color,
                              perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            image
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
    }

    private func action(_ icon: String, label: LocalizedStringKey, tint: Color? = nil,
                        perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(tint ?? theme.textSecondary)
                .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
    }

    private func submit() {
        guard !adding, !link.trimmingCharacters(in: .whitespaces).isEmpty,
              (watch.state?.queue.count ?? 0) < WatchTogether.queueLimit else { return }
        Task { await add() }
    }

    private func add() async {
        guard let parsed = WatchTogether.parseLink(link) else {
            notice = (String(localized: "call.watchTogether.invalidLink"), true)
            return
        }
        guard let listId = parsed.listId else {
            if let videoId = parsed.videoId { watch.enqueue([videoId]) }
            link = ""
            notice = nil
            return
        }
        adding = true
        notice = nil
        defer { adding = false }
        do {
            let ids = try await YouTubePlaylistLoader.videoIds(listId: listId, startingAt: parsed.videoId)
            let dropped = watch.enqueue(ids)
            link = ""
            notice = (dropped > 0
                ? L10n.format("call.watchTogether.queue.addedSome", ids.count - dropped, "\(dropped)")
                : L10n.format("call.watchTogether.queue.addedPlaylist", ids.count), false)
        } catch {
            if let videoId = parsed.videoId {
                watch.enqueue([videoId])
                link = ""
            } else {
                notice = (String(localized: "call.watchTogether.queue.playlistFailed"), true)
            }
        }
    }
}

private struct WatchQueueRow<Actions: View>: View {
    let item: WatchQueueItem
    let addedByName: String
    var current = false
    @ViewBuilder var actions: () -> Actions

    @Environment(\.theme) private var theme
    @State private var title: String?

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            AsyncImage(url: WatchTogether.thumbnailURL(item.videoId)) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                theme.fill
            }
            .frame(width: 64, height: 36)
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(verbatim: title ?? item.videoId)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(current ? theme.accent : theme.textPrimary)
                    .lineLimit(2)
                Text(L10n.format("call.watchTogether.queue.addedBy", addedByName))
                    .font(.wizard(WZ.FontSize.xs))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 0) { actions() }
        }
        .task(id: item.videoId) {
            title = YouTubeVideoInfo.cachedTitle(item.videoId)
            if title == nil { title = await YouTubeVideoInfo.title(item.videoId) }
        }
    }
}

extension WatchQueueRow where Actions == EmptyView {
    init(item: WatchQueueItem, addedByName: String, current: Bool = false) {
        self.init(item: item, addedByName: addedByName, current: current) { EmptyView() }
    }
}

@MainActor
enum YouTubeVideoInfo {
    private static var titles: [String: String] = [:]
    private static let urlSession = URLSession(configuration: .ephemeral)

    static func cachedTitle(_ videoId: String) -> String? { titles[videoId] }

    static func title(_ videoId: String) async -> String? {
        if let title = titles[videoId] { return title }
        guard let watch = WatchTogether.watchURL(videoId).absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let url = URL(string: "https://www.youtube.com/oembed?url=\(watch)&format=json"),
              let (data, response) = try? await urlSession.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let title = json["title"] as? String else { return nil }
        titles[videoId] = title
        return title
    }
}

@MainActor
final class YouTubePlaylistLoader {
    struct Failed: Error {}

    private static let timeout = 20.0

    private var webView: WKWebView?
    private var continuation: CheckedContinuation<[String], Error>?
    private var timer: Task<Void, Never>?

    static func videoIds(listId: String, startingAt videoId: String?) async throws -> [String] {
        let ids = try await fetch(listId)
        guard let videoId, let start = ids.firstIndex(of: videoId), start > 0 else { return ids }
        return Array(ids[start...] + ids[..<start])
    }

    static func fetch(_ listId: String) async throws -> [String] {
        let loader = YouTubePlaylistLoader()
        return try await withCheckedThrowingContinuation { loader.begin(listId, continuation: $0) }
    }

    private func begin(_ listId: String, continuation: CheckedContinuation<[String], Error>) {
        self.continuation = continuation
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(Handler { [self] in received($0) }, name: "ytlist")
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 180), configuration: configuration)
        webView.alpha = 0.01
        webView.isUserInteractionEnabled = false
        webView.accessibilityElementsHidden = true
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).first { $0.isKeyWindow }
        window?.insertSubview(webView, at: 0)
        self.webView = webView
        webView.loadHTMLString(Self.html(listId: listId), baseURL: URL(string: "https://app.wizardchat.org/"))
        timer = Task { [self] in
            try? await Task.sleep(for: .seconds(Self.timeout))
            if !Task.isCancelled { finish(.failure(Failed())) }
        }
    }

    private func received(_ message: [String: Any]) {
        switch message["type"] as? String {
        case "playlist":
            let ids = (message["ids"] as? [Any] ?? []).compactMap { $0 as? String }.filter(WatchTogether.isVideoId)
            finish(ids.isEmpty ? .failure(Failed()) : .success(ids))
        case "error":
            finish(.failure(Failed()))
        default:
            break
        }
    }

    private func finish(_ result: Result<[String], Error>) {
        timer?.cancel()
        timer = nil
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "ytlist")
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        continuation?.resume(with: result)
        continuation = nil
    }

    private static func html(listId: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
        </head><body><div id="player"></div><script>
        (function(){
          function post(m){ try{ window.webkit.messageHandlers.ytlist.postMessage(m); }catch(e){} }
          window.onYouTubeIframeAPIReady=function(){
            var tries=0;
            var lister=new YT.Player('player',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
              playerVars:{listType:'playlist',list:'\(listId)',autoplay:0},
              events:{
                onReady:function(){
                  var poll=setInterval(function(){
                    var ids=lister.getPlaylist?lister.getPlaylist():null;
                    tries++;
                    if((ids&&ids.length)||tries>40){ clearInterval(poll); post({type:'playlist',ids:ids||[]}); }
                  },250);
                },
                onError:function(e){ post({type:'error',code:e.data}); }
              }});
          };
          var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api';
          s.onerror=function(){ post({type:'error',code:-1}); };
          document.head.appendChild(s);
        })();
        </script></body></html>
        """
    }

    private final class Handler: NSObject, WKScriptMessageHandler {
        let onMessage: @MainActor ([String: Any]) -> Void
        init(_ onMessage: @escaping @MainActor ([String: Any]) -> Void) { self.onMessage = onMessage }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            Task { @MainActor in onMessage(body) }
        }
    }
}
