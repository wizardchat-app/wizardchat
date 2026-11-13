import AVFoundation
import AVKit
import MapKit
import WizardChatCore
import QuickLook
import SwiftUI

struct ImageMessageView: View {
    let media: ChatEntry.MediaContent
    var isSticker = false
    var isPrivateRoom = true
    var spoiler: String?

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @Environment(\.animatesMedia) private var animatesMedia
    @State private var image: UIImage?
    @State private var revealed = false
    @State private var holding = false
    @State private var showViewer = false

    private var hidden: Bool {
        guard !revealed else { return false }
        if spoiler != nil { return true }
        switch prefs.mediaVisibility {
        case .always: return false
        case .private: return !isPrivateRoom
        case .never: return true
        }
    }

    private var canAnimate: Bool {
        media.isAnimated || isSticker || ["image/gif", "image/webp", "image/apng"].contains(media.mimetype ?? "")
    }

    private var animate: Bool { canAnimate && (prefs.autoplayGifs || holding || animatesMedia) }

    private var displaySize: CGSize {
        let maxWidth: CGFloat = isSticker ? 160 : 260
        let maxHeight: CGFloat = isSticker ? 160 : 320
        let width = media.width ?? maxWidth, height = media.height ?? maxWidth * 0.75
        let scale = min(maxWidth / max(width, 1), maxHeight / max(height, 1), 1)
        return CGSize(width: max(width * scale, 60), height: max(height * scale, 60))
    }

    var body: some View {
        ZStack {
            if let image {
                if image.images != nil {
                    AnimatedImageView(image: image, contentMode: isSticker ? .scaleAspectFit : .scaleAspectFill)
                } else {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: isSticker ? .fit : .fill)
                }
            } else {
                theme.fill
                ProgressView().tint(theme.textMuted)
            }
            if hidden {
                Rectangle().fill(.thinMaterial)
                if let spoiler {
                    SpoilerCover(reason: spoiler)
                } else {
                    Label(String(localized: "timeline.showMedia"), image: "ph-eye-regular")
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                }
            } else if media.isAnimated && !animate {
                Text(String(localized: "composer.gif"))
                    .font(.wizard(WZ.FontSize.sm, .bold))
                    .foregroundStyle(theme.textOnAccent)
                    .padding(.horizontal, WZ.Space.space4).padding(.vertical, WZ.Space.space2)
                    .background(theme.overlay, in: Capsule())
            }
        }
        .frame(width: displaySize.width, height: displaySize.height)
        .clipShape(RoundedRectangle(cornerRadius: isSticker ? 0 : 14, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            if hidden { revealed = true } else { showViewer = true }
        }
        .gesture(HoldGesture { holding = $0 })
        .task(id: "\(animate)-\(hidden)") {
            guard !hidden, let mediaLoader else { return }
            image = await mediaLoader.image(for: media.source, thumbnailSize: animate ? nil : 800, animated: animate)
        }
        .fullScreenCover(isPresented: $showViewer) {
            ImageViewer(image: image, title: media.caption ?? media.filename,
                        animatedSource: canAnimate ? media.source : nil, loader: mediaLoader)
        }
        .accessibilityLabel(media.body)
    }
}

struct ImageViewer: View {
    @Environment(\.theme) private var theme
    let image: UIImage?
    let title: String
    var animatedSource: MediaSource?
    var loader: MediaLoader?
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var animated: UIImage?

    var body: some View {
        NavigationStack {
            ZStack {
                theme.overlay.ignoresSafeArea()
                if let animated {
                    AnimatedImageView(image: animated, contentMode: .scaleAspectFit)
                        .scaleEffect(scale)
                        .gesture(MagnifyGesture().onChanged { scale = max(1, $0.magnification) }
                            .onEnded { _ in withAnimation { scale = 1 } })
                } else if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .gesture(MagnifyGesture().onChanged { scale = max(1, $0.magnification) }
                            .onEnded { _ in withAnimation { scale = 1 } })
                }
            }
            .task {
                guard let animatedSource, let loader else { return }
                if let full = await loader.image(for: animatedSource, thumbnailSize: nil, animated: true),
                   full.images != nil {
                    animated = full
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.done")) { dismiss() } }
                if let image {
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: Image(uiImage: image), preview: SharePreview(title, image: Image(uiImage: image)))
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct VideoMessageView: View {
    let media: ChatEntry.MediaContent
    var spoiler: String?
    @State private var revealed = false
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var thumbnail: UIImage?
    @State private var loading = false

    var body: some View {
        let width: CGFloat = 260
        let ratio = (media.height ?? 9) / max(media.width ?? 16, 1)
        ZStack {
            if let thumbnail {
                Image(uiImage: thumbnail).resizable().scaledToFill()
            } else {
                theme.fill
            }
            if spoiler != nil && !revealed {
                Rectangle().fill(.thinMaterial)
                SpoilerCover(reason: spoiler ?? "")
            } else if loading {
                ProgressView().tint(theme.textOnAccent)
            } else {
                Image("ph-play-fill")
                    .font(.system(size: WZ.SizeIcon.lg, weight: .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(.ultraThinMaterial, in: Circle())
            }
            if let duration = media.duration {
                Text(Duration.seconds(duration).formatted(.time(pattern: .minuteSecond)))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textOnAccent)
                    .padding(.horizontal, WZ.Space.space3).padding(.vertical, WZ.Space.space1)
                    .background(theme.overlay, in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(WZ.Space.space4)
            }
        }
        .frame(width: width, height: min(width * ratio, 340))
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .onTapGesture {
            if spoiler != nil && !revealed { withAnimation { revealed = true } } else { Task { await play() } }
        }
        .task {
            guard let source = media.thumbnail, let mediaLoader else { return }
            thumbnail = await mediaLoader.image(for: source, thumbnailSize: 600, animated: false)
        }
        .accessibilityLabel(String(localized: "timeline.summary.video"))
    }

    private func play() async {
        guard let mediaLoader, !loading else { return }
        loading = true
        defer { loading = false }
        if let url = try? await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype) {
            NativeVideoPlayer.present(url: url)
        }
    }
}

@MainActor
enum NativeVideoPlayer {
    static func present(url: URL) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
              var top = scene.keyWindow?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        // Play sound even in silent mode, but don't touch the audio session during a call.
        let audio = AVAudioSession.sharedInstance()
        if audio.category != .playAndRecord { try? audio.setCategory(.playback, mode: .moviePlayback) }
        let controller = AVPlayerViewController()
        controller.player = AVPlayer(url: url)
        controller.modalPresentationStyle = .fullScreen
        controller.allowsPictureInPicturePlayback = true
        top.present(controller, animated: true) { controller.player?.play() }
    }
}

struct FileMessageView: View {
    let media: ChatEntry.MediaContent
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var previewURL: URL?
    @State private var loading = false

    var body: some View {
        Button {
            Task { await open() }
        } label: {
            HStack(spacing: WZ.Space.space5) {
                Image("ph-file-regular")
                    .font(.system(size: WZ.SizeIcon.lg))
                    .foregroundStyle(theme.accent)
                    .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    .background(theme.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(media.filename)
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    if let size = media.size {
                        Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                Spacer(minLength: 0)
                if loading { ProgressView() } else {
                    Image("ph-download-simple-regular")
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .padding(WZ.Space.space4)
            .frame(maxWidth: WZ.Size.sidebar)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .quickLookPreview($previewURL)
    }

    private func open() async {
        guard let mediaLoader, !loading else { return }
        loading = true
        defer { loading = false }
        previewURL = try? await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype)
    }
}

@MainActor
final class AudioPlayback: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    private var player: AVAudioPlayer?
    private var timer: Timer?

    func toggle(url: URL) {
        if isPlaying { pause(); return }
        if player == nil {
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            player = try? AVAudioPlayer(contentsOf: url)
            player?.delegate = self
        }
        player?.play()
        isPlaying = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player, player.duration > 0 else { return }
                self.progress = player.currentTime / player.duration
            }
        }
    }

    func pause() {
        player?.pause()
        isPlaying = false
        timer?.invalidate()
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.progress = 0
            self.timer?.invalidate()
        }
    }
}

struct AudioMessageView: View {
    let media: ChatEntry.MediaContent
    let isVoice: Bool
    let waveform: [Float]
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @StateObject private var playback = AudioPlayback()
    @State private var url: URL?
    @State private var loading = false

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Button {
                Task { await toggle() }
            } label: {
                Group {
                    if loading { ProgressView().tint(theme.textOnAccent) } else {
                        Image(playback.isPlaying ? "ph-pause-fill" : "ph-play-fill")
                            .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                    }
                }
                .foregroundStyle(theme.textOnAccent)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(theme.accent, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playback.isPlaying ? String(localized: "voiceMessagePlayer.pause") : String(localized: "voiceMessagePlayer.play"))

            if isVoice || !waveform.isEmpty {
                WaveformView(samples: waveform.isEmpty ? Array(repeating: 0.3, count: 32) : waveform,
                             progress: playback.progress)
                    .frame(width: WZ.SizeAvatar.xxl, height: WZ.Space.space8)
            } else {
                Text(media.filename)
                    .font(.wizard(WZ.FontSize.md, .medium))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: WZ.SizeAvatar.xxl, alignment: .leading)
            }
            if let duration = media.duration {
                Text(Duration.seconds(duration).formatted(.time(pattern: .minuteSecond)))
                    .font(.wizard(WZ.FontSize.sm).monospacedDigit())
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(WZ.Space.space4)
        .padding(.trailing, WZ.Space.space3)
        .background(theme.fill, in: Capsule())
    }

    private func toggle() async {
        if url == nil, let mediaLoader {
            loading = true
            url = try? await mediaLoader.file(for: media.source, filename: media.filename, mimetype: media.mimetype)
            loading = false
        }
        if let url { playback.toggle(url: url) }
    }
}

struct WaveformView: View {
    let samples: [Float]
    var progress: Double = 0
    @Environment(\.theme) private var theme

    var body: some View {
        GeometryReader { geometry in
            let bars = Self.resample(samples, to: max(Int(geometry.size.width / 4), 1))
            HStack(alignment: .center, spacing: WZ.Space.space1) {
                ForEach(bars.indices, id: \.self) { index in
                    Capsule()
                        .fill(Double(index) / Double(bars.count) < progress ? theme.accent : theme.textMuted.opacity(0.6))
                        .frame(width: WZ.Space.space1, height: max(3, CGFloat(bars[index]) * geometry.size.height))
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    static func resample(_ samples: [Float], to count: Int) -> [Float] {
        guard !samples.isEmpty else { return Array(repeating: 0.1, count: count) }
        return (0..<count).map { index in
            let start = index * samples.count / count
            let end = max(start + 1, (index + 1) * samples.count / count)
            let slice = samples[start..<min(end, samples.count)]
            return min(1, slice.max() ?? 0)
        }
    }
}

struct LocationMessageView: View {
    let geoUri: String
    let description: String?
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    private var coordinate: CLLocationCoordinate2D? {
        let parts = geoUri.replacingOccurrences(of: "geo:", with: "").split(separator: ";").first?
            .split(separator: ",").compactMap { Double($0) } ?? []
        guard parts.count >= 2 else { return nil }
        return CLLocationCoordinate2D(latitude: parts[0], longitude: parts[1])
    }

    var body: some View {
        if let coordinate {
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 800,
                                                                longitudinalMeters: 800)),
                    interactionModes: []) {
                    Marker(description ?? "", coordinate: coordinate).tint(theme.accent)
                }
                .frame(width: WZ.Size.sidebar, height: WZ.SizeAvatar.xxl)
                HStack {
                    Label(description ?? String(localized: "timeline.location"), image: "ph-map-pin-regular")
                        .font(.wizard(WZ.FontSize.md, .medium))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    Image("ph-arrow-square-out-regular").foregroundStyle(theme.textMuted)
                }
                .padding(WZ.Space.space4)
                .frame(width: WZ.Size.sidebar)
                .background(theme.fill)
            }
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            .onTapGesture {
                let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
                item.name = description
                item.openInMaps()
            }
        } else {
            Label(description ?? geoUri, image: "ph-map-pin-regular")
                .foregroundStyle(theme.textPrimary)
        }
    }
}

struct PollMessageView: View {
    let poll: ChatEntry.PollContent
    let isOwn: Bool
    let onVote: (String) -> Void
    let onEnd: () -> Void
    @Environment(\.theme) private var theme

    private var hasVoted: Bool { poll.answers.contains(where: \.votedByMe) }
    private var showsResults: Bool { poll.hasEnded || (poll.isDisclosed && hasVoted) }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            Label(poll.question, image: "ph-chart-bar-horizontal-regular")
                .font(.wizard(WZ.FontSize.lg, .semibold))
                .foregroundStyle(theme.textPrimary)
            ForEach(poll.answers) { answer in
                Button {
                    onVote(answer.id)
                } label: {
                    VStack(alignment: .leading, spacing: WZ.Space.space3) {
                        HStack {
                            Image(answer.votedByMe ? "ph-check-circle-fill" : "ph-circle-regular")
                                .foregroundStyle(answer.votedByMe ? theme.accent : theme.textMuted)
                            Text(answer.text)
                                .font(.wizard(WZ.FontSize.md))
                                .foregroundStyle(theme.textPrimary)
                            Spacer()
                            if showsResults {
                                Text("\(answer.votes)")
                                    .font(.wizard(WZ.FontSize.sm, .semibold))
                                    .foregroundStyle(theme.textMuted)
                            }
                        }
                        if showsResults {
                            GeometryReader { geometry in
                                Capsule().fill(theme.fill)
                                    .overlay(alignment: .leading) {
                                        Capsule().fill(theme.accent)
                                            .frame(width: geometry.size.width * CGFloat(answer.votes)
                                                / CGFloat(max(poll.totalVotes, 1)))
                                    }
                            }
                            .frame(height: WZ.Space.space3)
                        }
                    }
                    .padding(WZ.Space.space4)
                    .background(theme.fill.opacity(0.6), in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(poll.hasEnded)
            }
            HStack {
                Text(poll.hasEnded ? L10n.format("timeline.finalResultsVotes", "\(poll.totalVotes)")
                     : showsResults || hasVoted ? L10n.format("timeline.votes", "\(poll.totalVotes)")
                     : String(localized: "timeline.tapAnOptionTo"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                Spacer()
                if isOwn && !poll.hasEnded {
                    Button(String(localized: "timeline.poll.end"), action: onEnd)
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.control)
                }
            }
        }
        .padding(WZ.Space.space5)
        .frame(maxWidth: WZ.Size.panel)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }
}

struct ReplyQuoteView: View {
    let quote: ChatEntry.ReplyQuote
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            Capsule().fill(theme.accent).frame(width: WZ.Space.space1)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(quote.senderName)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.nameColor(quote.sender, colored: prefs.colorUsernames))
                EmojiText(text: quote.text.isEmpty ? String(localized: "timeline.originalMessage") : quote.text,
                          emotes: quote.emotes, size: WZ.FontSize.sm * 1.2)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.bottom, WZ.Space.space2)
    }
}

struct ReactionsBar: View {
    let reactions: [ChatEntry.ReactionGroup]
    let onToggle: (String) -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        WrapLayout(spacing: WZ.Space.space3) {
            ForEach(reactions) { reaction in
                Button {
                    onToggle(reaction.key)
                } label: {
                    HStack(spacing: WZ.Space.space2) {
                        if reaction.key.hasPrefix("mxc://") {
                            PackThumb(url: reaction.key).frame(width: WZ.Space.space6, height: WZ.Space.space6)
                        } else {
                            Text(reaction.key).font(.system(size: WZ.SizeIcon.sm))
                        }
                        if reaction.count > 1 {
                            Text("\(reaction.count)")
                                .font(.wizard(WZ.FontSize.sm, .semibold).monospacedDigit())
                                .foregroundStyle(reaction.reactedByMe ? theme.accent : theme.textMuted)
                        }
                    }
                    .padding(.horizontal, WZ.Space.space4)
                    .frame(height: WZ.Space.space8)
                    .background(reaction.reactedByMe ? theme.accent.opacity(0.18) : theme.fill, in: Capsule())
                    .overlay(Capsule().stroke(reaction.reactedByMe ? theme.accent : .clear, lineWidth: WZ.BorderWidth.thin))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(reaction.key) \(reaction.count)")
            }
        }
        .padding(.top, WZ.Space.space2)
    }
}

struct ReadReceiptsView: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userIds: [String]
    var readAt: [String: Date] = [:]
    @Environment(\.theme) private var theme
    @State private var showList = false

    var body: some View {
        Button { showList = true } label: {
            HStack(spacing: -WZ.Space.space2) {
                ForEach(userIds.prefix(4), id: \.self) { userId in
                    ReceiptAvatar(roomId: roomId, userId: userId, size: 16)
                        .overlay(Circle().stroke(theme.bgPrimary, lineWidth: WZ.BorderWidth.thin))
                }
                if userIds.count > 4 {
                    Text("+\(userIds.count - 4)")
                        .font(.wizard(WZ.FontSize.xs, .semibold))
                        .foregroundStyle(theme.textMuted)
                        .padding(.leading, WZ.Space.space4)
                }
            }
            .padding(.vertical, WZ.Space.space1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.format("timeline.seenBy", userIds.count))
        .sheet(isPresented: $showList) {
            NavigationStack {
                ThemedList {
                    ForEach(userIds, id: \.self) { userId in
                        HStack(spacing: WZ.Space.space5) {
                            ReceiptAvatar(roomId: roomId, userId: userId, size: 32)
                            ReceiptName(roomId: roomId, userId: userId)
                            Spacer()
                            if let date = readAt[userId] {
                                Text(Calendar.current.isDateInToday(date)
                                     ? date.formatted(date: .omitted, time: .shortened)
                                     : date.formatted(date: .abbreviated, time: .shortened))
                                    .font(.wizard(WZ.FontSize.sm))
                                    .foregroundStyle(theme.textMuted)
                            }
                        }
                    }
                }
                .navigationTitle(String(localized: "timeline.seenByTitle"))
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium, .large])
        }
    }
}

struct ThreadSummaryBadge: View {
    let thread: ThreadSummaryView
    let roomId: String
    let onOpen: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: WZ.Space.space3) {
                if let sender = thread.latestSender {
                    ReceiptAvatar(roomId: roomId, userId: sender, size: WZ.SizeAvatar.xs)
                }
                Text(L10n.format("timeline.threadReplies", thread.replies))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.accent)
                if let preview {
                    Text(preview)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: WZ.Space.space0)
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.horizontal, WZ.Space.space4)
            .padding(.vertical, WZ.Space.space3)
            .frame(maxWidth: WZ.Size.panel, alignment: .leading)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "timeline.openThread"))
    }

    private var preview: String? {
        if thread.latestRedacted { return String(localized: "timeline.messageDeleted") }
        let line = thread.latestSummary?.split(separator: "\n").first.map { $0.trimmingCharacters(in: .whitespaces) }
        if let line, !line.isEmpty {
            return thread.latestSenderName.map { "\($0): \(line)" } ?? line
        }
        return thread.latestUndecryptable ? String(localized: "timeline.couldNotDecrypt") : nil
    }
}

private struct ReceiptAvatar: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    let size: CGFloat
    @State private var name: String?
    @State private var url: String?

    var body: some View {
        AvatarView(name: name ?? userId, url: url, size: size)
            .task(id: userId) {
                let profile = await session.memberProfile(userId, in: roomId)
                name = profile.name
                url = profile.avatarUrl
            }
    }
}

private struct ReceiptName: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @Environment(\.theme) private var theme
    @State private var name: String?

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space0) {
            Text(name ?? userId).font(.wizard(WZ.FontSize.lg, .medium)).foregroundStyle(theme.textPrimary)
            if name != nil { Text(userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted) }
        }
        .lineLimit(1)
        .task(id: userId) { name = await session.memberProfile(userId, in: roomId).name }
    }
}

private struct HoldGesture: UIGestureRecognizerRepresentable {
    let onChange: (Bool) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let press = UILongPressGestureRecognizer()
        press.minimumPressDuration = 0.2
        press.delegate = context.coordinator
        return press
    }

    func handleUIGestureRecognizerAction(_ recognizer: UILongPressGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .began: onChange(true)
        case .ended, .cancelled, .failed: onChange(false)
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ recognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
