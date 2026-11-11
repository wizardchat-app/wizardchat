import WizardChatCore
import PhotosUI
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

struct ComposerView: View {
    @ObservedObject var timeline: TimelineModel
    let room: RoomSummary
    @Binding var replyTo: ChatEntry?
    @Binding var editing: ChatEntry?
    var threadRoot: String?
    let onTyping: (Bool) -> Void

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    @State private var draft = ""
    @State private var selection = NSRange(location: 0, length: 0)
    @State private var formatting = false
    @State private var attachments: [PendingAttachment] = []
    @StateObject private var packStore = PacksStore()
    private var packs: [ImagePack] { packStore.packs }
    @State private var usedEmotes: [String: PackImage] = [:]
    @State private var mentions: [String: String] = [:]
    @State private var roomLinks: [String: String] = [:]
    @State private var members: [Member] = []
    @State private var pickerTab: MediaPicker.Tab?
    @State private var showPhotos = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var showPoll = false
    @State private var showLocation = false
    @StateObject private var recorder = VoiceRecorder()
    @State private var sent = 0
    @State private var focused = false

    private var trimmed: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSend: Bool { (!trimmed.isEmpty || !attachments.isEmpty || editing?.editableMedia != nil) && preparing == 0 }
    @State private var preparing = 0
    private var isRecording: Bool { [.recording, .paused].contains(recorder.state) }

    var body: some View {
        VStack(spacing: WZ.Space.space3) {
            if !suggestions.isEmpty { suggestionList }
            if timeline.loadFailed {
                notice(String(localized: "timeline.loadFailed"), action: String(localized: "common.retry")) {
                    Task { await timeline.paginateBackwards() }
                }
            }
            if let error = timeline.sendError {
                notice(error)
                    .onTapGesture { timeline.sendError = nil }
                    .task(id: error) { try? await Task.sleep(for: .seconds(5)); timeline.sendError = nil }
            }
            if isRecording {
                recordingBar
                    .floatingGlass(in: Capsule())
            } else {
                HStack(alignment: .bottom, spacing: WZ.Space.space4) {
                    if editing == nil { plusBubble }
                    VStack(spacing: WZ.Space.space0) {
                        if let replyTo { contextBar(icon: "ph-arrow-bend-up-left-regular",
                                                    title: L10n.format("composer.replyingToName", "\(replyTo.senderName)"), text: replyTo.summary,
                                                    name: (replyTo.senderName, theme.nameColor(replyTo.sender, colored: prefs.colorUsernames))) {
                            self.replyTo = nil
                        } }
                        if let editing { contextBar(icon: "ph-pencil-simple-regular", title: String(localized: "timeline.editing"), text: editing.summary) {
                            self.editing = nil
                            draft = ""
                        } }
                        if !attachments.isEmpty || preparing > 0 { attachmentTray }
                        if formatting || (focused && hasSelection) {
                            formatBar
                                .padding(.horizontal, WZ.Space.space4)
                                .padding(.top, WZ.Space.space2)
                                .transition(.opacity)
                        }
                        inputField
                    }
                    .floatingGlass(in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                    if canSend || editing != nil {
                        sendBubble
                    } else {
                        stickerBubble
                    }
                }
            }
        }
        .padding(.horizontal, WZ.Space.space4)
        .padding(.bottom, WZ.Space.space4)
        .padding(.top, WZ.Space.space2)
        .animation(.spring(duration: WZ.MotionDuration.slow), value: canSend)
        .animation(.easeOut(duration: WZ.MotionDuration.fast), value: formatting || (focused && hasSelection))
        .animation(.spring(duration: WZ.MotionDuration.slow), value: isRecording)
        .sensoryFeedback(.impact(weight: .light), trigger: sent)
        .task { await packStore.load(session: session, roomId: room.id) }
        .onAppear {
            if draft.isEmpty, editing == nil, let saved = UserDefaults.standard.string(forKey: draftKey) { draft = saved }
        }
        .onChange(of: draft) { _, text in
            guard editing == nil else { return }
            if text.isEmpty { UserDefaults.standard.removeObject(forKey: draftKey) }
            else { UserDefaults.standard.set(text, forKey: draftKey) }
        }
        .dropDestination(for: Data.self) { items, _ in
            for data in items { addData(data) }
            return !items.isEmpty
        }
        .task { members = await timeline.members() }
        .onChange(of: editing?.id) { _, _ in
            if let text = editing?.editableText {
                draft = text
                focused = true
            }
        }
        .onChange(of: replyTo?.id) { _, id in if id != nil { focused = true } }
        .sheet(item: $pickerTab) { tab in
            MediaPicker(tab: tab, store: packStore,
                        onEmoji: insertEmoji,
                        onSticker: { sticker in Task { await sendSticker(sticker) } },
                        onGif: sendGif)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { result in
                showCamera = false
                switch result {
                case .photo(let image): if let data = image.jpegData(compressionQuality: 0.9) { addData(data, ext: "jpg") }
                case .video(let url): addCapturedVideo(url)
                case nil: break
                }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 10,
                      matching: .any(of: [.images, .videos]))
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            preparing += items.count
            Task { await addPhotos(items) }
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { addFiles(urls) }
        }
        .sheet(isPresented: $showPoll) {
            PollCreatorSheet { question, answers, disclosed in
                await timeline.createPoll(question: question, answers: answers, disclosed: disclosed)
            }
        }
        .sheet(isPresented: $showLocation) {
            LocationShareSheet { lat, lon, note in
                await timeline.sendLocation(latitude: lat, longitude: lon, description: note,
                                            replyTo: replyTo?.eventId)
                replyTo = nil
            }
        }
    }

    private func bubble(_ image: String, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(image)
                .font(.system(size: WZ.SizeIcon.md, weight: .medium))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .floatingGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .transition(.scale.combined(with: .opacity))
    }

    private var stickerBubble: some View {
        Button { pickerTab = .stickers } label: {
            Image("Sticker")
                .resizable()
                .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .floatingGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "room.settings.widgets.stickers"))
        .transition(.scale.combined(with: .opacity))
    }

    private var plusBubble: some View {
        Menu {
            Button { showPhotos = true } label: { Label(menu: String(localized: "composer.photosVideos"), icon: "ph-images-regular") }
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button { showCamera = true } label: { Label(menu: String(localized: "composer.camera"), icon: "ph-camera-regular") }
            }
            Button { showFiles = true } label: { Label(menu: String(localized: "composer.file"), icon: "ph-file-regular") }
            if UIPasteboard.general.hasImages {
                Button { pasteImages() } label: { Label(menu: String(localized: "composer.pasteImage"), icon: "ph-clipboard-text-regular") }
            }
            Divider()
            Button {
                formatting.toggle()
                if formatting { focused = true }
            } label: {
                Label(menu: String(localized: "composer.formatting.toolbar"), icon: "ph-text-aa-regular")
            }
            Button { showPoll = true } label: { Label(menu: String(localized: "composer.poll.create"), icon: "ph-chart-bar-horizontal-regular") }
            Button { showLocation = true } label: { Label(menu: String(localized: "composer.location.share"), icon: "ph-map-pin-regular") }
            Button { Task { await recorder.start() } } label: { Label(menu: String(localized: "composer.voice.record"), icon: "ph-microphone-regular") }
        } label: {
            Image("ph-plus-regular")
                .font(.system(size: WZ.SizeIcon.md, weight: .medium))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .floatingGlass(in: Circle())
        }
        .accessibilityLabel(String(localized: "composer.attach"))
    }

    private var sendBubble: some View {
        Button {
            Task { await submit() }
        } label: {
            Image(editing == nil ? "ph-paper-plane-right-fill" : "ph-check-bold")
                .font(.system(size: WZ.SizeIcon.md, weight: .bold))
                .foregroundStyle(theme.textOnAccent)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(theme.accent, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
        .opacity(canSend ? 1 : 0.5)
        .accessibilityLabel(editing == nil ? String(localized: "composer.send") : String(localized: "composer.saveEdit"))
        .transition(.scale.combined(with: .opacity))
    }

    private var inputField: some View {
        ComposerTextView(
            text: $draft, selection: $selection, isFocused: $focused,
            placeholder: editing != nil ? String(localized: "composer.editMessage")
                : threadRoot != nil ? String(localized: "timeline.threadComposerPlaceholder")
                : L10n.format("composer.messageRoom", "\(room.displayName)"),
            font: Font.wizardUIFont(17),
            textColor: UIColor(theme.textPrimary),
            placeholderColor: UIColor(theme.textMuted),
            tintColor: UIColor(theme.accent),
            onPaste: addPasted)
            .onChange(of: draft) { _, text in onTyping(!text.isEmpty) }
            .padding(.vertical, WZ.Space.space5)
            .padding(.horizontal, WZ.Space.space6)
            .frame(minHeight: WZ.Space.space10)
    }

    private var formatBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WZ.Space.space1) {
                // The same options as the web's toolbar, written as the Markdown sending turns into formatting
                formatButton("ph-text-b-regular", label: "composer.formatting.bold") { wrap("**", "**") }
                formatButton("ph-text-italic-regular", label: "composer.formatting.italic") { wrap("_", "_") }
                formatButton("ph-text-strikethrough-regular", label: "composer.formatting.strikethrough") { wrap("~~", "~~") }
                formatButton("ph-code-regular", label: "composer.formatting.code") {
                    if draft[selectedRange].contains("\n") { wrap("```\n", "\n```", block: true) } else { wrap("`", "`") }
                }
                formatButton("ph-text-h-regular", label: "composer.formatting.heading") { prefixLines("# ") }
                formatButton("ph-list-bullets-regular", label: "composer.formatting.bulletList") { prefixLines("- ") }
                formatButton("ph-list-numbers-regular", label: "composer.formatting.numberedList") { numberLines() }
                formatButton("ph-quotes-regular", label: "composer.formatting.quote") { prefixLines("> ") }
                formatButton("ph-link-regular", label: "composer.formatting.link") { wrap("[", "](https://)") }
                if formatting {
                    formatButton("ph-x-regular", label: "common.close") { formatting = false }
                        .foregroundStyle(theme.textMuted)
                }
            }
        }
        .foregroundStyle(theme.textPrimary)
    }

    private func formatButton(_ icon: String, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .frame(width: WZ.Space.space10, height: WZ.Space.space9)
        }
        .accessibilityLabel(label)
    }

    private var hasSelection: Bool { selection.length > 0 }

    private var selectedRange: Range<String.Index> {
        Range(selection, in: draft) ?? draft.endIndex..<draft.endIndex
    }

    private func setCursor(_ index: String.Index) {
        selection = NSRange(index..<index, in: draft)
    }

    private func wrap(_ open: String, _ close: String, block: Bool = false) {
        let range = selectedRange
        let selected = String(draft[range])
        var before = String(draft[..<range.lowerBound])
        if block, !before.isEmpty, !before.hasSuffix("\n") { before += "\n" }
        let after = String(draft[range.upperBound...])
        draft = before + open + selected + close + after
        let cursorOffset = before.count + open.count + selected.count + (selected.isEmpty ? 0 : close.count)
        setCursor(draft.index(draft.startIndex, offsetBy: cursorOffset))
    }

    private func numberLines() {
        var number = 0
        prefixLines { _ in
            number += 1
            return "\(number). "
        }
    }

    private func prefixLines(_ prefix: String) {
        prefixLines { _ in prefix }
    }

    private func prefixLines(_ prefix: (Substring) -> String) {
        let range = selectedRange
        let lineStart = draft[..<range.lowerBound].lastIndex(of: "\n").map { draft.index(after: $0) } ?? draft.startIndex
        let lineEnd = draft[range.upperBound...].firstIndex(of: "\n") ?? draft.endIndex
        let lines = draft[lineStart..<lineEnd].split(separator: "\n", omittingEmptySubsequences: false)
        let replaced = lines.map { prefix($0) + $0 }.joined(separator: "\n")
        let startOffset = draft.distance(from: draft.startIndex, to: lineStart)
        draft.replaceSubrange(lineStart..<lineEnd, with: replaced)
        setCursor(draft.index(draft.startIndex, offsetBy: startOffset + replaced.count))
    }

    private func contextBar(icon: String, title: String, text: String, name: (String, Color)? = nil,
                            onClose: @escaping () -> Void) -> some View {
        HStack(spacing: WZ.Space.space4) {
            Image(icon).foregroundStyle(theme.accent)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(withNameColors(title, name.map { [$0] } ?? [])).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.accent)
                Text(text).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer()
            Button(action: onClose) {
                Image("ph-x-circle-regular").font(.system(size: WZ.SizeIcon.md))
            }
            .foregroundStyle(theme.textMuted)
            .accessibilityLabel(String(localized: "common.cancel"))
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.top, WZ.Space.space4)
        .padding(.bottom, WZ.Space.space1)
    }

    private var attachmentTray: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WZ.Space.space4) {
                ForEach(attachments) { attachment in
                    ZStack(alignment: .topTrailing) {
                        Group {
                            if let thumbnail = attachment.thumbnail {
                                Image(uiImage: thumbnail).resizable().scaledToFill()
                            } else {
                                VStack(spacing: WZ.Space.space2) {
                                    Image(attachment.isVideo ? "ph-video-camera-regular" : "ph-file-regular")
                                        .font(.system(size: WZ.SizeIcon.md))
                                    Text(attachment.url.lastPathComponent)
                                        .font(.wizard(WZ.FontSize.xs))
                                        .lineLimit(2)
                                }
                                .foregroundStyle(theme.textMuted)
                                .padding(WZ.Space.space3)
                            }
                        }
                        .frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
                        .background(theme.fill)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        Button {
                            attachments.removeAll { $0.id == attachment.id }
                        } label: {
                            Image("ph-x-circle-regular")
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(theme.textOnAccent, theme.overlay)
                                .font(.system(size: WZ.SizeIcon.md))
                        }
                        .offset(x: WZ.Space.space3, y: -WZ.Space.space3)
                        .accessibilityLabel(String(localized: "common.remove"))
                    }
                }
                ForEach(0..<preparing, id: \.self) { _ in
                    ProgressView()
                        .tint(theme.textMuted)
                        .frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
                        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .accessibilityLabel(String(localized: "composer.preparing"))
                }
            }
            .padding(.horizontal, WZ.Space.space5)
            .padding(.top, WZ.Space.space5)
        }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        for item in items {
            defer { preparing = max(preparing - 1, 0) }
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let type = item.supportedContentTypes.first { $0.conforms(to: .image) || $0.conforms(to: .movie) }
                ?? .jpeg
            let ext = type.preferredFilenameExtension ?? "jpg"
            let name = "\(type.conforms(to: .movie) ? "video" : "image")-\(Int(Date().timeIntervalSince1970)).\(ext)"
            guard let url = try? MediaMetadata.temporaryCopy(of: data, filename: name) else { continue }
            attachments.append(PendingAttachment(url: url, thumbnail: type.conforms(to: .image) ? UIImage(data: data) : nil,
                                                 isVideo: type.conforms(to: .movie)))
        }
        photoItems = []
    }

    private var draftKey: String { threadRoot.map { "draft.\(room.id).\($0)" } ?? "draft.\(room.id)" }

    private func addPasted(_ providers: [NSItemProvider]) {
        let media = providers.filter { provider in
            [UTType.image, .movie, .fileURL, .pdf].contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
        }
        guard !media.isEmpty else { return }
        preparing += media.count
        for provider in media {
            Task {
                defer { preparing = max(preparing - 1, 0) }
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
                   let data = await loadData(provider, type: .image) {
                    addData(data)
                } else if let type = [UTType.movie, .pdf, .fileURL].first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }),
                          let url = await loadFile(provider, type: type) {
                    let isVideo = type == .movie
                    attachments.append(PendingAttachment(url: url, thumbnail: nil, isVideo: isVideo))
                }
            }
        }
    }

    private func loadData(_ provider: NSItemProvider, type: UTType) async -> Data? {
        await withCheckedContinuation { continuation in
            provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                continuation.resume(returning: data)
            }
        }
    }

    private func loadFile(_ provider: NSItemProvider, type: UTType) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url, let data = try? Data(contentsOf: url),
                      let copy = try? MediaMetadata.temporaryCopy(of: data, filename: url.lastPathComponent) else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: copy)
            }
        }
    }

    private func pasteImages() {
        for image in UIPasteboard.general.images ?? [] {
            if let data = image.jpegData(compressionQuality: 0.9) { addData(data, ext: "jpg") }
        }
    }

    private func addData(_ data: Data, ext: String? = nil) {
        let isImage = UIImage(data: data) != nil
        let isGif = data.starts(with: [0x47, 0x49, 0x46])
        let fileExt = ext ?? (isGif ? "gif" : isImage ? "jpg" : "bin")
        let name = "\(isImage ? "image" : "file")-\(Int(Date().timeIntervalSince1970 * 1000)).\(fileExt)"
        guard let url = try? MediaMetadata.temporaryCopy(of: data, filename: name) else { return }
        attachments.append(PendingAttachment(url: url, thumbnail: isImage ? UIImage(data: data) : nil, isVideo: false))
    }

    private func addCapturedVideo(_ url: URL) {
        guard let data = try? Data(contentsOf: url),
              let copy = try? MediaMetadata.temporaryCopy(of: data, filename: "video-\(Int(Date().timeIntervalSince1970)).\(url.pathExtension.isEmpty ? "mov" : url.pathExtension)")
        else { return }
        attachments.append(PendingAttachment(url: copy, thumbnail: nil, isVideo: true))
    }

    private func addFiles(_ urls: [URL]) {
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url),
                  let copy = try? MediaMetadata.temporaryCopy(of: data, filename: url.lastPathComponent) else { continue }
            let type = UTType(filenameExtension: url.pathExtension)
            attachments.append(PendingAttachment(url: copy,
                                                 thumbnail: type?.conforms(to: .image) == true ? UIImage(data: data) : nil,
                                                 isVideo: type?.conforms(to: .movie) == true))
        }
    }

    private var recordingBar: some View {
        HStack(spacing: WZ.Space.space4) {
            Button {
                recorder.cancel()
            } label: {
                Image("ph-trash-regular").font(.system(size: WZ.SizeIcon.md)).frame(width: WZ.Space.space10, height: WZ.Space.space10)
            }
            .foregroundStyle(theme.error)
            .accessibilityLabel(String(localized: "composer.voice.cancel"))
            Circle().fill(recorder.state == .recording ? theme.danger : theme.textMuted).frame(width: WZ.Space.space4, height: WZ.Space.space4)
            Text(Duration.seconds(recorder.elapsed).formatted(.time(pattern: .minuteSecond)))
                .font(.wizard(WZ.FontSize.md).monospacedDigit())
                .foregroundStyle(theme.textPrimary)
            WaveformView(samples: Array(recorder.samples.suffix(60)), progress: 1)
                .frame(height: WZ.Space.space8)
            Button {
                recorder.togglePause()
            } label: {
                Image(recorder.state == .recording ? "ph-pause-fill" : "ph-record-regular")
                    .font(.system(size: WZ.SizeIcon.md)).frame(width: WZ.Space.space9, height: WZ.Space.space10)
            }
            .foregroundStyle(theme.textMuted)
            .accessibilityLabel(recorder.state == .recording ? String(localized: "composer.voice.pause") : String(localized: "composer.voice.resume"))
            Button {
                guard let result = recorder.finish() else { return }
                let reply = replyTo?.eventId
                replyTo = nil
                sent += 1
                focused = false
                Task {
                    await timeline.sendVoiceMessage(at: result.url, duration: result.duration,
                                                    waveform: result.waveform, replyTo: reply)
                }
            } label: {
                Image("ph-arrow-circle-up-regular")
                    .font(.system(size: WZ.SizeIcon.xl))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(theme.textOnAccent, theme.accent)
            }
            .accessibilityLabel(String(localized: "composer.voice.send"))
        }
        .padding(.horizontal, WZ.Space.space4)
        .frame(minHeight: WZ.Space.space11)
    }

    private enum Suggestion: Identifiable {
        case member(Member)
        case emoji(Emoji)
        case custom(PackImage)
        case command(String, String)
        case room(name: String, avatarUrl: String?, detail: String?, link: String)

        var id: String {
            switch self {
            case .member(let member): return "m\(member.userId)"
            case .emoji(let emoji): return "e\(emoji.u)"
            case .custom(let image): return "c\(image.id)"
            case .command(let name, _): return "/\(name)"
            case .room(_, _, _, let link): return "r\(link)"
            }
        }
    }

    private var currentToken: String? {
        guard let last = draft.split(separator: " ", omittingEmptySubsequences: false).last,
              !last.isEmpty, !last.contains("\n") else { return nil }
        return String(last)
    }

    private var suggestions: [Suggestion] {
        if draft.hasPrefix("/"), !draft.contains(" ") {
            let query = draft.dropFirst().lowercased()
            return SlashCommand.all.filter { $0.name.hasPrefix(query) }.map { .command($0.name, $0.description) }
        }
        guard let token = currentToken else { return [] }
        if token.hasPrefix("@"), token.count >= 2 {
            let query = token.dropFirst()
            return members.filter {
                ($0.displayName ?? "").localizedCaseInsensitiveContains(query) || $0.userId.localizedCaseInsensitiveContains(query)
            }.prefix(6).map { .member($0) }
        }
        if token.hasPrefix("#"), !token.dropFirst().contains("#") {
            let query = String(token.dropFirst())
            let roomList = session.roomList
            let rooms: [Suggestion] = (roomList?.joinedRooms ?? [])
                .filter { !$0.isDirect && !$0.isInvite && !$0.isTombstoned }
                .map { .room(name: $0.displayName, avatarUrl: $0.avatarUrl,
                             detail: $0.isSpace ? String(localized: "explore.typeSpace") : $0.canonicalAlias,
                             link: RoomLinks.link($0)) }
            let joinedIds = Set((roomList?.joinedRooms ?? []).map(\.id))
            let spaces: [Suggestion] = (roomList?.allSpaces ?? []).filter { !joinedIds.contains($0.id) }
                .map { .room(name: $0.name, avatarUrl: $0.avatarUrl, detail: String(localized: "explore.typeSpace"),
                             link: RoomLinks.link($0)) }
            let matches = (rooms + spaces).filter {
                guard case .room(let name, _, let detail, _) = $0 else { return false }
                return query.isEmpty || name.localizedCaseInsensitiveContains(query)
                    || (detail?.localizedCaseInsensitiveContains(query) ?? false)
            }
            let starting = matches.filter { if case .room(let name, _, _, _) = $0 { return name.lowercased().hasPrefix(query.lowercased()) } else { return false } }
            let rest = matches.filter { item in !starting.contains { $0.id == item.id } }
            return Array((starting + rest).prefix(6))
        }
        if token.hasPrefix(":"), token.count >= 3, !token.dropFirst().contains(":") {
            let query = String(token.dropFirst())
            let custom = packs.flatMap { $0.images.filter { $0.isEmoticon && $0.shortcode.localizedCaseInsensitiveContains(query) } }
                .prefix(4).map { Suggestion.custom($0) }
            let emoji = Emoji.all.filter { $0.s.contains { $0.hasPrefix(query.lowercased()) } }.prefix(6).map { Suggestion.emoji($0) }
            return Array(custom) + Array(emoji)
        }
        return []
    }

    private func notice(_ text: String, action: String? = nil, perform: @escaping () -> Void = {}) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: WZ.Space.space4) {
            Image("ph-warning-circle-regular")
                .font(.system(size: WZ.SizeIcon.sm))
                .foregroundStyle(theme.danger)
            Text(text)
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
            if let action {
                Button(action, action: perform)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.accent)
            }
        }
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space4)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }

    private var suggestionList: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space0) {
            ForEach(suggestions) { suggestion in
                Button {
                    apply(suggestion)
                } label: {
                    HStack(spacing: WZ.Space.space4) {
                        switch suggestion {
                        case .member(let member):
                            AvatarView(name: member.displayName ?? member.userId, url: member.avatarUrl, size: WZ.SizeAvatar.sm)
                            Text(member.displayName ?? member.userId).font(.wizard(WZ.FontSize.md, .medium))
                            Text(member.userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                        case .emoji(let emoji):
                            Text(emoji.u).font(.system(size: WZ.SizeIcon.lg)).frame(width: WZ.Space.space8)
                            Text(":\(emoji.s.first ?? emoji.l):").font(.wizard(WZ.FontSize.md))
                        case .custom(let image):
                            PackThumb(url: image.url).frame(width: WZ.Space.space8, height: WZ.Space.space8)
                            Text(":\(image.shortcode):").font(.wizard(WZ.FontSize.md))
                        case .room(let name, let avatarUrl, let detail, _):
                            AvatarView(name: name, url: avatarUrl, size: WZ.SizeAvatar.sm)
                            Text(name).font(.wizard(WZ.FontSize.md, .medium))
                            if let detail { Text(detail).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted) }
                        case .command(let name, let description):
                            Text("/\(name)").font(.wizard(WZ.FontSize.md, .semibold)).frame(minWidth: WZ.SizeAvatar.xl, alignment: .leading)
                            Text(LocalizedStringKey(description)).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .lineLimit(1)
                    .foregroundStyle(theme.textPrimary)
                    .padding(.horizontal, WZ.Space.space5)
                    .frame(minHeight: WZ.Space.space10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, WZ.Space.space2)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }

    private func apply(_ suggestion: Suggestion) {
        switch suggestion {
        case .command(let name, _):
            draft = "/\(name) "
            return
        default: break
        }
        guard let token = currentToken else { return }
        draft.removeLast(token.count)
        switch suggestion {
        case .member(let member):
            // "@name" in the text, linked to the user in the HTML
            let name = member.displayName.map { "@" + $0 } ?? member.userId
            mentions[name] = member.userId
            draft += name + " "
        case .room(let name, _, _, let link):
            let label = "#" + name
            roomLinks[label] = link
            draft += label + " "
        case .emoji(let emoji):
            draft += emoji.u + " "
        case .custom(let image):
            usedEmotes[image.shortcode] = image
            draft += ":\(image.shortcode): "
        case .command: break
        }
    }

    private func insertEmoji(_ text: String, _ image: PackImage?) {
        if let image { usedEmotes[image.shortcode] = image }
        draft += text
    }

    private func submit() async {
        let text = prefs.emoticonsToEmoji ? Emoticons.replace(trimmed) : trimmed
        let reply = replyTo?.eventId
        sent += 1
        // The keyboard stays up so you can keep typing.

        if let editing {
            self.editing = nil
            draft = ""
            await timeline.edit(editing, newText: text)
            return
        }

        if !attachments.isEmpty {
            let pending = attachments
            attachments = []
            draft = ""
            replyTo = nil
            await timeline.sendFiles(pending.map { ($0.url, $0.thumbnail) }, caption: text.isEmpty ? nil : text,
                                     replyTo: reply)
            return
        }

        draft = ""
        replyTo = nil
        if text.hasPrefix("/"), !text.hasPrefix("//"),
           let result = await SlashCommand.run(text, timeline: timeline, session: session, replyTo: reply) {
            if case .unknown = result { await send(text, replyTo: reply) }
            return
        }
        await send(text.hasPrefix("//") ? String(text.dropFirst()) : text, replyTo: reply)
    }

    private func send(_ message: String, replyTo: String?) async {
        let links = roomLinks.filter { message.contains($0.key) }.sorted { $0.key.count > $1.key.count }
        let text = links.reduce(message) { body, entry in
            body.replacingOccurrences(of: entry.key, with: RoomLinks.target(entry.value) ?? entry.value)
        }
        let html = await Self.richHtml(text, emotes: usedEmotes, mentions: mentions, client: session.client,
                                       roomLinks: Dictionary(links.map { (RoomLinks.target($0.value) ?? $0.value, $0.value) },
                                                             uniquingKeysWith: { first, _ in first }))
        // Always set (even empty) so legacy push rules don't fire
        let userIds = mentions.filter { text.contains($0.key) && $0.value != session.userId }.map(\.value)
        let room = text.range(of: #"(^|\s)@room\b"#, options: .regularExpression) != nil
        usedEmotes = [:]
        mentions = [:]
        roomLinks = [:]
        await timeline.send(text, html: html, replyTo: replyTo,
                            mentions: Mentions(userIds: Array(Set(userIds)).sorted(), room: room ? true : nil))
    }

    /// Builds HTML only when the message has custom emoji or mentions (otherwise the core turns
    /// the Markdown into HTML); its Markdown is rendered first so formatting isn't lost.
    static func richHtml(_ text: String, emotes: [String: PackImage], mentions: [String: String],
                         client: WizardClient?, roomLinks: [String: String] = [:]) async -> String? {
        let usedEmotes = emotes.filter { text.contains(":\($0.key):") }
        let usedMentions = mentions.filter { text.contains($0.key) }
        let usedRooms = roomLinks.filter { text.contains($0.key) }
        guard !usedEmotes.isEmpty || !usedMentions.isEmpty || !usedRooms.isEmpty else { return nil }
        let markdown = (try? await client?.markdownToHtml(body: text)) ?? nil
        var html = markdown ?? text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\n", with: "<br>")
        // Longest first, so "@Ann" doesn't match inside "@Anna"
        for (name, userId) in usedMentions.sorted(by: { $0.key.count > $1.key.count }) {
            let escaped = name.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            html = html.replacingOccurrences(of: escaped, with: "<a href=\"https://matrix.to/#/\(userId)\">\(escaped)</a>")
        }
        for (label, link) in usedRooms.sorted(by: { $0.key.count > $1.key.count }) {
            let escaped = label.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            html = html.replacingOccurrences(of: escaped, with: "<a href=\"\(link)\">\(escaped)</a>")
        }
        for (code, image) in usedEmotes {
            html = html.replacingOccurrences(
                of: ":\(code):",
                with: "<img data-mx-emoticon height=\"32\" src=\"\(image.url)\" alt=\":\(code):\" title=\":\(code):\">")
        }
        return html
    }

    private func sendSticker(_ sticker: PackImage) async {
        var info: [String: JSONValue] = [:]
        let source: MediaSource = .object(["url": .string(sticker.url)])
        if let data = try? await timeline.client.media(source: source),
           let image = AnimatedImage.image(from: data, animated: false) {
            info["w"] = .number(Double(image.size.width * image.scale))
            info["h"] = .number(Double(image.size.height * image.scale))
            info["size"] = .number(Double(data.count))
            let isGif = data.starts(with: [0x47, 0x49, 0x46])
            info["mimetype"] = .string(isGif ? "image/gif" : data.starts(with: [0x89, 0x50]) ? "image/png" : "image/webp")
            if let images = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(images) > 1 {
                info["is_animated"] = .bool(true)
            }
        }
        await timeline.sendSticker(url: sticker.url, body: sticker.text, info: .object(info), replyTo: replyTo?.eventId)
        replyTo = nil
        sent += 1
        focused = false
    }

    private func sendGif(_ gif: GiphyGif) async {
        guard let url = URL(string: gif.url),
              let (data, _) = try? await URLSession.shared.data(from: url),
              await timeline.sendGif(data, width: gif.width, height: gif.height, replyTo: replyTo?.eventId) else {
            timeline.sendError = String(localized: "composer.gifSendFailed")
            return
        }
        replyTo = nil
        sent += 1
        focused = false
    }
}

struct PendingAttachment: Identifiable {
    let id = UUID()
    let url: URL
    let thumbnail: UIImage?
    let isVideo: Bool
}

extension MediaPicker.Tab: Identifiable {
    var id: Self { self }
}

struct CameraPicker: UIViewControllerRepresentable {
    enum Result {
        case photo(UIImage)
        case video(URL)
    }

    let onFinish: (Result?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        picker.videoQuality = .typeHigh
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (Result?) -> Void

        init(onFinish: @escaping (Result?) -> Void) { self.onFinish = onFinish }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let url = info[.mediaURL] as? URL {
                onFinish(.video(url))
            } else if let image = info[.originalImage] as? UIImage {
                onFinish(.photo(image))
            } else {
                onFinish(nil)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onFinish(nil) }
    }
}
