import Foundation
import UIKit
import UniformTypeIdentifiers
import WizardChatCore

struct PendingUpload: Identifiable {
    let id = UUID()
    let preview: UIImage?
    let isVideo: Bool
    let filename: String
    var progress: Double?
}

struct MessageMention: Hashable {
    let label: String
    let userId: String
    let isOwn: Bool
}

struct ChatEntry: Identifiable {
    enum Kind {
        case message(body: String, isEmote: Bool, isNotice: Bool)
        case image(MediaContent)
        case sticker(MediaContent)
        case video(MediaContent)
        case audio(MediaContent, isVoice: Bool, waveform: [Float])
        case file(MediaContent)
        case location(body: String, geoUri: String, description: String?)
        case poll(PollContent)
        case redacted
        case undecryptable(String)
        case system(String)
        case call(CallHistoryView)
        case dateDivider(Date)
    }

    var editableMedia: MediaContent? {
        switch kind {
        case .image(let media), .video(let media), .file(let media): return media
        case .audio(let media, let isVoice, _): return isVoice ? nil : media
        default: return nil
        }
    }

    var editableText: String? {
        if case .message(let body, _, _) = kind { return body }
        guard let media = editableMedia else { return nil }
        guard let caption = media.caption, !caption.trimmingCharacters(in: .whitespaces).isEmpty,
              caption != media.filename else { return "" }
        return caption
    }

    enum ContentType: Hashable {
        case text, notice, emote, image, video, audio, file, location
    }

    struct MediaContent {
        let source: MediaSource
        let body: String
        let caption: String?
        let filename: String
        let mimetype: String?
        let width: CGFloat?
        let height: CGFloat?
        let size: Int?
        let duration: TimeInterval?
        let thumbnail: MediaSource?
        let isAnimated: Bool

        init(_ media: MediaInfo, body: String? = nil) {
            source = media.source
            self.body = body ?? media.caption ?? media.filename
            caption = media.caption
            filename = media.filename
            mimetype = media.mimetype
            width = media.width.map { CGFloat($0) }
            height = media.height.map { CGFloat($0) }
            size = media.size
            duration = media.durationMs.map { TimeInterval($0) / 1000 }
            thumbnail = media.thumbnailSource
            isAnimated = media.isAnimated || media.mimetype == "image/gif"
        }
    }

    struct PollContent {
        struct Answer: Identifiable {
            let id: String
            let text: String
            let votes: Int
            let votedByMe: Bool
        }
        let question: String
        let answers: [Answer]
        let maxSelections: Int
        let isDisclosed: Bool
        let hasEnded: Bool
        let totalVotes: Int
    }

    struct ReactionGroup: Identifiable {
        var id: String { key }
        let key: String
        let count: Int
        let reactedByMe: Bool
        let senders: [String]
    }

    struct ReplyQuote {
        let eventId: String
        let senderName: String
        let text: String
        var sender = ""
    }

    let id: String
    let kind: Kind
    let sender: String
    let senderName: String
    let senderAvatarUrl: String?
    let isOwn: Bool
    let timestamp: Date
    let isSending: Bool
    let isEdited: Bool
    var itemKey: String?
    var eventId: String?
    var contentType: ContentType?
    var reactions: [ReactionGroup] = []
    var readBy: [String] = []
    var readAt: [String: Date] = [:]
    var sendFailed = false
    var replyTo: ReplyQuote?
    var isEditable = false
    var allowsActions: Bool {
        switch kind {
        case .redacted, .undecryptable: false
        default: true
        }
    }
    var canBeRepliedTo: Bool { eventId != nil && allowsActions }
    var isGrouped = false
    var spoilers: [String] = []
    var mentions: [MessageMention] = []
    var rich: [RichBlock]?
    var mediaSpoiler: String?
    var galleryItems: [ChatEntry] = []
    var thread: ThreadSummaryView?

    var summary: String {
        switch kind {
        case .message(let body, _, _): return body
        case .image(let media): return media.caption ?? String(localized: "timeline.summary.image")
        case .sticker(let media): return media.body
        case .video: return String(localized: "timeline.summary.video")
        case .audio(_, let isVoice, _): return isVoice ? String(localized: "composer.voice.record") : String(localized: "timeline.audioFile")
        case .file(let media): return media.filename
        case .location: return String(localized: "timeline.locationShared")
        case .poll(let poll): return poll.question
        default: return ""
        }
    }

    /// Adds read receipts (yours aren't shown), newest first
    mutating func addReceipts(_ receipts: [ReadReceiptView], ownUserId: String) {
        var readAt: [String: Date] = [:]
        let others = receipts.filter { $0.userId != ownUserId }
        for receipt in others {
            if let ts = receipt.timestamp { readAt[receipt.userId] = Date(timeIntervalSince1970: TimeInterval(ts) / 1000) }
        }
        mergeReceipts(readBy: others.map(\.userId), readAt: readAt)
    }

    mutating func mergeReceipts(readBy users: [String], readAt dates: [String: Date]) {
        readAt.merge(dates) { a, b in max(a, b) }
        readBy = Array(Set(readBy + users))
            .sorted { (readAt[$0] ?? .distantPast) > (readAt[$1] ?? .distantPast) }
    }

    var isContent: Bool {
        switch kind {
        case .system, .call, .dateDivider: return false
        default: return true
        }
    }
}

@MainActor
final class TimelineModel: ObservableObject {
    @Published private(set) var entries: [ChatEntry] = []
    @Published private(set) var isPaginating = false
    @Published private(set) var reachedStart = false
    @Published private(set) var typingNames: [String] = []
    @Published private(set) var typingIds: [String] = []
    @Published var sendError: String?
    @Published var loadFailed = false
    @Published private(set) var firstUnreadId: String?
    @Published private(set) var pinnedIds: Set<String> = []
    @Published private(set) var uploads: [PendingUpload] = []

    let client: WizardClient
    let roomId: String
    private let kind: TimelineKind
    var isThread: Bool { if case .thread = kind { true } else { false } }
    private let onlyTypes: Set<ChatEntry.ContentType>?
    private var timeline: RoomTimeline?
    private var items: [TimelineEntry] = []
    private var converted: [ChatEntry?] = []
    private var subscriptions: [Subscription] = []
    private var requestedReplies: Set<String> = []
    private var isTyping = false
    private var ownUserId: String { client.userId ?? "" }

    private static let groupingInterval: TimeInterval = 5 * 60

    init(client: WizardClient, roomId: String, threadRoot: String? = nil, pinnedOnly: Bool = false,
         onlyTypes: Set<ChatEntry.ContentType>? = nil) {
        self.client = client
        self.roomId = roomId
        self.kind = threadRoot.map { .thread(.init(rootEventId: $0)) } ?? (pinnedOnly ? .pinned : .main)
        self.onlyTypes = onlyTypes
    }

    deinit {
        subscriptions.forEach { $0.cancel() }
    }

    func start() async {
        guard timeline == nil else { return }
        await loadPinned()
        do {
            let timeline = kind == .main
                ? try await client.timeline(roomId: roomId)
                : try await client.timelineOf(roomId: roomId, kind: kind)
            self.timeline = timeline
            subscriptions.append(timeline.watch { [weak self] diffs in
                MainActor.assumeIsolated { self?.apply(diffs) }
            })
            if kind == .main {
                subscriptions.append(timeline.watchTyping { [weak self] users in
                    MainActor.assumeIsolated {
                        self?.typingNames = users.map { $0.displayName ?? Self.localpart($0.userId) }
                        self?.typingIds = users.map(\.userId)
                    }
                })
            }
        } catch {
            sendError = readableError(error)
        }
    }

    func loadPinned() async {
        pinnedIds = Set((try? await client.roomDetails(roomId: roomId))?.pinnedEventIds ?? [])
    }

    func togglePin(_ entry: ChatEntry) async {
        guard let timeline, let eventId = entry.eventId else { return }
        if pinnedIds.contains(eventId) {
            await report { try await timeline.unpin(eventId: eventId) }
            pinnedIds.remove(eventId)
        } else {
            await report { try await timeline.pin(eventId: eventId) }
            pinnedIds.insert(eventId)
        }
    }

    func reportMessage(_ entry: ChatEntry, reason: String?) async -> Bool {
        guard let eventId = entry.eventId else { return false }
        do {
            try await client.reportEvent(roomId: roomId, eventId: eventId, reason: reason)
            return true
        } catch {
            sendError = readableError(error)
            return false
        }
    }

    func source(of entry: ChatEntry) async -> String? {
        guard let eventId = entry.eventId,
              let source = try? await client.eventSource(roomId: roomId, eventId: eventId) else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(source.decrypted ?? source.original) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    func retry(_ entry: ChatEntry) async {
        guard let timeline, let itemKey = entry.itemKey else { return }
        await report { try await timeline.retrySend(itemKey: itemKey) }
    }

    func retrySending() {
        for entry in entries where entry.sendFailed {
            Task { await retry(entry) }
        }
    }

    func loadUntilReadMarker(maxPages: Int = 6) async -> String? {
        for _ in 0..<maxPages {
            if let firstUnreadId { return firstUnreadId }
            guard !reachedStart else { return nil }
            await paginateBackwards()
            try? await Task.sleep(for: .milliseconds(50))
        }
        return firstUnreadId
    }

    func loadUntil(eventId: String, maxPages: Int = 15) async -> Bool {
        for _ in 0..<maxPages {
            if entries.contains(where: { $0.eventId == eventId || $0.galleryItems.contains { $0.eventId == eventId } }) {
                return true
            }
            guard !reachedStart else { return false }
            await paginateBackwards()
            try? await Task.sleep(for: .milliseconds(50))
        }
        return entries.contains { $0.eventId == eventId }
    }

    func paginateBackwards() async {
        guard let timeline, !isPaginating, !reachedStart else { return }
        isPaginating = true
        defer { isPaginating = false }
        let result: Bool? = await withTaskGroup(of: Bool?.self) { group in
            group.addTask { try? await timeline.paginateBack(events: 80) }
            group.addTask { try? await Task.sleep(for: .seconds(25)); return nil }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
        if let result {
            reachedStart = result
            loadFailed = false
        } else {
            loadFailed = true
        }
    }

    func send(_ text: String, html: String? = nil, emote: Bool = false, replyTo: String? = nil, mentions: Mentions? = nil) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let timeline, !trimmed.isEmpty else { return }
        await report {
            try await timeline.sendMessage(kind: emote ? .emote : .text, body: trimmed, html: html, replyTo: replyTo, mentions: mentions)
        }
    }

    func sendNotice(_ text: String, replyTo: String? = nil) async {
        guard let timeline else { return }
        await report { try await timeline.sendMessage(kind: .notice, body: text, replyTo: replyTo) }
    }

    func sendPlain(_ text: String, replyTo: String? = nil) async {
        guard let timeline else { return }
        let escaped = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        await report { try await timeline.sendHtml(body: text, html: escaped, replyTo: replyTo) }
    }

    func edit(_ entry: ChatEntry, newText: String) async {
        guard let timeline, let itemKey = entry.itemKey else { return }
        if entry.editableMedia != nil {
            await report { try await timeline.editCaption(itemKey: itemKey, caption: newText) }
        } else {
            await report { try await timeline.editText(itemKey: itemKey, body: newText) }
        }
    }

    func redact(_ entry: ChatEntry) async {
        guard let timeline, let itemKey = entry.itemKey else { return }
        await report { try await timeline.redact(itemKey: itemKey) }
    }

    func toggleReaction(_ key: String, on entry: ChatEntry) async {
        guard let timeline, let itemKey = entry.itemKey else { return }
        await report { try await timeline.toggleReaction(itemKey: itemKey, key: key) }
    }

    func sendFile(at url: URL, caption: String? = nil, replyTo: String? = nil, spoiler: Bool = false) async {
        await sendFiles([(url, nil)], caption: caption, replyTo: replyTo, spoiler: spoiler)
    }

    /// The caption and reply go with the first file
    func sendFiles(_ files: [(url: URL, preview: UIImage?)], caption: String? = nil, replyTo: String? = nil,
                   spoiler: Bool = false) async {
        guard timeline != nil else { return }
        let pending = files.map { file in
            let type = UTType(filenameExtension: file.url.pathExtension) ?? .data
            return PendingUpload(preview: file.preview ?? (type.conforms(to: .image) ? UIImage(contentsOfFile: file.url.path) : nil),
                                 isVideo: type.conforms(to: .movie), filename: file.url.lastPathComponent)
        }
        uploads.append(contentsOf: pending)
        for (index, (file, item)) in zip(files, pending).enumerated() {
            await upload(file.url, as: item.id, caption: index == 0 ? caption : nil,
                         replyTo: index == 0 ? replyTo : nil, spoiler: spoiler)
            uploads.removeAll { $0.id == item.id }
        }
    }

    private func upload(_ url: URL, as id: UUID, caption: String?, replyTo: String?, spoiler: Bool) async {
        guard let timeline else { return }
        let type = UTType(filenameExtension: url.pathExtension) ?? .data
        let mimetype = type.preferredMIMEType ?? "application/octet-stream"
        var file = UploadedFile(source: .null, size: 0, filename: url.lastPathComponent, mimetype: mimetype,
                                caption: caption, spoiler: spoiler, isAnimated: type.conforms(to: .gif), replyTo: replyTo)
        if type.conforms(to: .image), let size = MediaMetadata.imageSize(at: url) {
            file.width = Int(size.width)
            file.height = Int(size.height)
        } else if type.conforms(to: .movie) {
            let video = await MediaMetadata.video(at: url)
            file.width = video.size.map { Int($0.width) }
            file.height = video.size.map { Int($0.height) }
            file.durationMs = video.duration.map { Int($0 * 1000) }
        } else if type.conforms(to: .audio) {
            file.durationMs = await MediaMetadata.duration(at: url).map { Int($0 * 1000) }
        }
        await report {
            let data = try Data(contentsOf: url)
            file.size = data.count
            file.source = try await timeline.uploadFile(data: data, mimetype: mimetype) { [weak self] progress in
                guard progress.total > 0 else { return }
                let fraction = Double(progress.current) / Double(progress.total)
                Task { @MainActor in
                    guard let self, let index = self.uploads.firstIndex(where: { $0.id == id }) else { return }
                    self.uploads[index].progress = fraction
                }
            }
            if type.conforms(to: .movie), let frame = await MediaMetadata.videoFrame(at: url),
               let source = try? await timeline.uploadFile(data: frame.data, mimetype: "image/jpeg", listener: { _ in }) {
                file.thumbnail = UploadedThumbnail(source: source, mimetype: "image/jpeg", width: frame.width,
                                                   height: frame.height, size: frame.data.count)
            }
            try await timeline.sendUploaded(file: file)
        }
    }

    func sendVoiceMessage(at url: URL, duration: TimeInterval, waveform: [Float], replyTo: String?) async {
        guard let timeline else { return }
        let options = AttachmentOptions(
            filename: url.lastPathComponent,
            mimetype: "audio/mp4",
            voice: true,
            durationMs: Int(duration * 1000),
            waveform: waveform.map { Int(($0 * 1024).rounded()) },
            replyTo: replyTo
        )
        await report {
            let data = try Data(contentsOf: url)
            try await timeline.sendFile(bytes: data, options: options)
        }
    }

    func sendSticker(url: String, body: String, info: JSONValue, replyTo: String?) async {
        await sendSticker(source: ["url": .string(url)], body: body, info: info, replyTo: replyTo)
    }

    /// Encrypted rooms get an encrypted upload (a `file` source), others a plain `url`
    func sendGif(_ data: Data, width: Int, height: Int, replyTo: String?) async -> Bool {
        do {
            let encrypted = (try? await client.roomDetails(roomId: roomId))?.isEncrypted ?? true
            let source: [String: JSONValue] = encrypted
                ? ["file": try await client.uploadEncryptedMedia(data: data)]
                : ["url": .string(try await client.uploadMedia(data: data, mimetype: "image/gif"))]
            let info = JSONValue(any: ["mimetype": "image/gif", "size": data.count, "is_animated": true, "w": width, "h": height])
            await sendSticker(source: source, body: "GIF", info: info, replyTo: replyTo)
            return true
        } catch {
            return false
        }
    }

    private func sendSticker(source: [String: JSONValue], body: String, info: JSONValue, replyTo: String?) async {
        guard let timeline else { return }
        var content: [String: JSONValue] = ["body": .string(body), "info": info]
        content.merge(source) { _, new in new }
        if let replyTo {
            content["m.relates_to"] = .object(["m.in_reply_to": .object(["event_id": .string(replyTo)])])
        }
        await report { try await timeline.sendEvent(eventType: "m.sticker", content: .object(content)) }
    }

    func createPoll(question: String, answers: [String], disclosed: Bool) async {
        guard let timeline else { return }
        await report {
            try await timeline.sendPoll(question: question, answers: answers, maxSelections: 1, undisclosed: !disclosed)
        }
    }

    func vote(_ answerId: String, in entry: ChatEntry) async {
        guard let timeline, let eventId = entry.eventId else { return }
        await report { try await timeline.vote(pollEventId: eventId, answers: [answerId]) }
    }

    func endPoll(_ entry: ChatEntry) async {
        guard let timeline, let eventId = entry.eventId else { return }
        await report { try await timeline.endPoll(pollEventId: eventId) }
    }

    func sendLocation(latitude: Double, longitude: Double, description: String?, replyTo: String?) async {
        guard let timeline else { return }
        let geoUri = "geo:\(latitude),\(longitude)"
        let body = description.map { "\($0) (\(geoUri))" } ?? geoUri
        await report { try await timeline.sendLocation(body: body, geoUri: geoUri, description: description) }
    }

    private func report(_ work: () async throws -> Void) async {
        do {
            try await work()
        } catch {
            sendError = readableError(error)
        }
    }

    /// Public receipts when "Send read receipts" is on, private ones otherwise
    func markAsRead(sendReceipts: Bool) async {
        try? await timeline?.markAsRead(_private: !sendReceipts)
    }

    func setTyping(_ typing: Bool) {
        guard typing != isTyping, let timeline else { return }
        isTyping = typing
        Task { try? await timeline.setTyping(typing: typing) }
    }

    func members() async -> [Member] {
        ((try? await client.members(roomId: roomId)) ?? []).filter { !$0.isInvite }
    }

    private func apply(_ diffs: [ListDiff<TimelineEntry>]) {
        for diff in diffs {
            diff.apply(to: &items)
            converted.apply(diff.map { [ownUserId] in Self.makeEntry($0, ownUserId: ownUserId) })
        }
        loadMissingReplies()
        // The read marker is a virtual item; the first message after it is the first unread
        if let marker = items.firstIndex(where: { if case .readMarker = $0 { return true }; return false }) {
            firstUnreadId = converted[(marker + 1)...].first { $0?.isContent == true }??.id
        } else {
            firstUnreadId = nil
        }
        if items.contains(where: { if case .timelineStart = $0 { return true }; return false }) {
            reachedStart = true
        }
        // Receipts on events that aren't shown move to the message above them
        var entries: [ChatEntry] = []
        for (item, entry) in zip(items, converted) {
            if let entry {
                entries.append(entry)
            } else if case .event(let event) = item, !event.readBy.isEmpty,
                      let last = entries.lastIndex(where: \.isContent) {
                entries[last].addReceipts(event.readBy, ownUserId: ownUserId)
            }
        }
        if let onlyTypes {
            entries = entries.filter { entry in
                guard case .dateDivider = entry.kind else { return entry.contentType.map(onlyTypes.contains) == true }
                return true
            }
        }
        entries = entries.enumerated().filter { index, entry in
            guard case .dateDivider = entry.kind else { return true }
            guard index + 1 < entries.count else { return false }
            if case .dateDivider = entries[index + 1].kind { return false }
            return true
        }.map(\.element)
        for index in entries.indices.dropFirst() {
            let previous = entries[index - 1]
            let current = entries[index]
            guard current.isContent, previous.isContent, current.replyTo == nil else { continue }
            entries[index].isGrouped = previous.sender == current.sender
                && current.timestamp.timeIntervalSince(previous.timestamp) < Self.groupingInterval
        }
        self.entries = kind == .main && onlyTypes == nil ? Self.collapseGalleries(entries) : entries
    }

    private func loadMissingReplies() {
        guard let timeline else { return }
        for case .event(let event) in items {
            guard case .unavailable? = event.inReplyTo, let id = event.eventId,
                  requestedReplies.insert(id).inserted else { continue }
            Task { try? await timeline.loadReplyDetails(eventId: id) }
        }
    }

    private static func makeEntry(_ item: TimelineEntry, ownUserId: String) -> ChatEntry? {
        let event: TimelineEntry.Event
        switch item {
        case .dateDivider(let divider):
            let date = date(divider.timestamp)
            return ChatEntry(id: divider.id, kind: .dateDivider(date), sender: "", senderName: "",
                             senderAvatarUrl: nil, isOwn: false, timestamp: date, isSending: false, isEdited: false)
        case .readMarker, .timelineStart:
            return nil
        case .event(let value):
            event = value
        }

        let kind: ChatEntry.Kind
        var contentType: ChatEntry.ContentType?
        var spoilers: [String] = []
        var mentions: [MessageMention] = []
        var rich: [RichBlock]?
        var mediaSpoiler: String?
        switch event.content {
        case .text(let text):
            rich = text.rich
            let mentioned = Self.mentionText(text.html, ownUserId: ownUserId)
            kind = .message(body: mentioned?.text ?? text.body, isEmote: false, isNotice: false)
            contentType = .text
            spoilers = Self.spoilers(in: text.html)
            mentions = mentioned?.mentions ?? []
        case .notice(let notice):
            rich = notice.rich
            let mentioned = Self.mentionText(notice.html, ownUserId: ownUserId)
            kind = .message(body: mentioned?.text ?? notice.body, isEmote: false, isNotice: true)
            contentType = .notice
            spoilers = Self.spoilers(in: notice.html)
            mentions = mentioned?.mentions ?? []
        case .emote(let emote):
            let mentioned = Self.mentionText(emote.html, ownUserId: ownUserId)
            kind = .message(body: mentioned?.text ?? emote.body, isEmote: true, isNotice: false)
            contentType = .emote
            spoilers = Self.spoilers(in: emote.html)
            mentions = mentioned?.mentions ?? []
        case .image(let image):
            kind = .image(.init(image.media))
            contentType = .image
            mediaSpoiler = image.media.spoiler ? image.media.spoilerReason ?? "" : nil
        case .video(let video):
            kind = .video(.init(video.media))
            contentType = .video
            mediaSpoiler = video.media.spoiler ? video.media.spoilerReason ?? "" : nil
        case .audio(let audio):
            let waveform = (audio.media.waveform ?? []).map { Float($0) / 1024 }
            kind = .audio(.init(audio.media), isVoice: audio.media.voice, waveform: waveform)
            contentType = .audio
        case .file(let file):
            kind = .file(.init(file.media))
            contentType = .file
        case .sticker(let sticker):
            kind = .sticker(.init(sticker.media, body: sticker.body))
        case .location(let location):
            kind = .location(body: location.body, geoUri: location.geoUri, description: location.description)
            contentType = .location
        case .poll(let value):
            let poll = value.poll
            kind = .poll(ChatEntry.PollContent(
                question: poll.question,
                answers: poll.answers.map { .init(id: $0.id, text: $0.text, votes: $0.votes, votedByMe: poll.myVotes.contains($0.id)) },
                maxSelections: poll.maxSelections,
                isDisclosed: !poll.undisclosed,
                hasEnded: poll.ended,
                totalVotes: poll.totalVotes
            ))
        case .redacted:
            kind = .redacted
        case .unableToDecrypt(let utd):
            kind = .undecryptable(Self.decryptionMessage(utd.reason))
        case .membership(let membership):
            guard let text = describe(membership, sender: event.senderName ?? event.sender) else { return nil }
            kind = .system(text)
        case .call(let call):
            kind = .call(call.call)
        default:
            return nil
        }

        var entry = ChatEntry(
            id: event.id,
            kind: kind,
            sender: event.sender,
            senderName: event.senderName ?? event.sender,
            senderAvatarUrl: event.senderAvatar,
            isOwn: event.isOwn,
            timestamp: date(event.timestamp),
            isSending: event.sendState == .sending,
            isEdited: event.edited
        )
        entry.itemKey = event.itemKey
        entry.eventId = event.eventId
        entry.contentType = contentType
        entry.sendFailed = event.sendState == .failed
        entry.spoilers = spoilers
        entry.mentions = mentions
        entry.rich = rich
        entry.mediaSpoiler = mediaSpoiler
        entry.isEditable = event.isEditable
        entry.thread = event.thread
        entry.replyTo = event.inReplyTo.map(Self.quote)
        entry.reactions = event.reactions.map {
            .init(key: $0.key, count: $0.count, reactedByMe: $0.mine, senders: $0.senders)
        }
        entry.addReceipts(event.readBy, ownUserId: ownUserId)
        return entry
    }

    private static func date(_ timestamp: Int) -> Date {
        Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
    }

    static func localpart(_ userId: String) -> String {
        String(userId.dropFirst().prefix { $0 != ":" })
    }

    private static let mentionLink = try? NSRegularExpression(
        pattern: #"<a\s[^>]*href=["']https://matrix\.to/#/((?:@|%40)[^"'?]+)[^"']*["'][^>]*>(.*?)</a>"#,
        options: [.caseInsensitive, .dotMatchesLineSeparators])

    /// The body has only names, so mentions (matrix.to links in the HTML, as Element sends them)
    /// are read from the HTML and shown as "@name" pills
    static func mentionText(_ html: String?, ownUserId: String?) -> (text: String, mentions: [MessageMention])? {
        guard let html, let mentionLink else { return nil }
        var text = html.replacingOccurrences(of: "(?s)<mx-reply>.*?</mx-reply>", with: "",
                                             options: [.regularExpression, .caseInsensitive])
        let matches = mentionLink.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length))
        guard !matches.isEmpty else { return nil }
        var mentions: [MessageMention] = []
        for match in matches.reversed() {
            let ns = text as NSString
            let userId = ns.substring(with: match.range(at: 1)).removingPercentEncoding ?? ns.substring(with: match.range(at: 1))
            let name = decodeEntities(ns.substring(with: match.range(at: 2))
                .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression))
                .trimmingCharacters(in: .whitespaces)
            let label = name.hasPrefix("@") ? name : "@" + (name.isEmpty ? userId : name)
            mentions.insert(MessageMention(label: label, userId: userId, isOwn: userId == ownUserId), at: 0)
            let escaped = label.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            text = ns.replacingCharacters(in: match.range, with: escaped)
        }
        text = text
            .replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "</(p|div|li|h[1-6]|blockquote|pre|tr)>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<li[^>]*>", with: "• ", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"<img[^>]*alt="([^"]*)"[^>]*>"#, with: "$1", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
        return (decodeEntities(text).trimmingCharacters(in: .whitespacesAndNewlines), mentions)
    }

    private static let spoilerPattern = try? NSRegularExpression(
        pattern: #"<span[^>]*data-mx-spoiler[^>]*>(.*?)</span>"#, options: [.caseInsensitive, .dotMatchesLineSeparators])

    private static func spoilers(in html: String?) -> [String] {
        guard let html, html.contains("data-mx-spoiler"), let spoilerPattern else { return [] }
        let ns = html as NSString
        return spoilerPattern.matches(in: html, range: NSRange(location: 0, length: ns.length)).compactMap { match in
            let inner = ns.substring(with: match.range(at: 1))
                .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            let text = Self.decodeEntities(inner).trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        }
    }

    private static func decodeEntities(_ text: String) -> String {
        text.replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"").replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    private static func collapseGalleries(_ entries: [ChatEntry]) -> [ChatEntry] {
        func isCandidate(_ entry: ChatEntry) -> Bool {
            guard entry.replyTo == nil, case .image(let media) = entry.kind else { return false }
            return media.mimetype != "image/svg+xml" && media.caption == nil
        }
        var result: [ChatEntry] = []
        var index = 0
        while index < entries.count {
            var entry = entries[index]
            guard isCandidate(entry) else { result.append(entry); index += 1; continue }
            var group = [entry]
            var next = index + 1
            while next < entries.count, isCandidate(entries[next]),
                  entries[next].sender == entry.sender,
                  entries[next].timestamp.timeIntervalSince(group.last!.timestamp) < groupingInterval,
                  Calendar.current.isDate(entries[next].timestamp, inSameDayAs: entry.timestamp) {
                group.append(entries[next])
                next += 1
            }
            if group.count >= 2 {
                entry.galleryItems = group
                entry.readBy = []
                entry.readAt = [:]
                for image in group {
                    entry.mergeReceipts(readBy: image.readBy, readAt: image.readAt)
                }
            }
            result.append(entry)
            index = group.count >= 2 ? next : index + 1
        }
        return result
    }

    private static func quote(_ reply: ReplyPreview) -> ChatEntry.ReplyQuote {
        switch reply {
        case .ready(let ready):
            return .init(eventId: ready.eventId, senderName: ready.senderName ?? ready.sender, text: ready.summary,
                         sender: ready.sender)
        case .unavailable(let reply):
            return .init(eventId: reply.eventId, senderName: "", text: "")
        case .pending(let reply):
            return .init(eventId: reply.eventId, senderName: "", text: "")
        }
    }

    private static func decryptionMessage(_ reason: UtdReason) -> String {
        switch reason {
        case "sentBeforeWeJoined": return String(localized: "timeline.decryptBeforeJoined")
        case "verificationViolation": return String(localized: "timeline.decryptSenderIdentityReset")
        case "unsignedDevice", "unknownDevice": return String(localized: "timeline.decryptUnverifiedSender")
        case "withheldForUnverifiedOrInsecureDevice", "withheldBySender": return String(localized: "timeline.decryptWithheld")
        case "historicalMessageAndDeviceIsUnverified": return String(localized: "timeline.decryptUnverifiedSession")
        default: return String(localized: "timeline.couldNotDecrypt")
        }
    }

    private static func describe(_ membership: EntryContent.Membership, sender: String) -> String? {
        let name = membership.displayName ?? membership.userId
        // The core passes the SDK's change names through
        switch membership.change {
        case "Joined", "InvitationAccepted": return L10n.plain("timeline.userJoined", name)
        case "Left": return L10n.plain("timeline.userLeft", name)
        case "KickedAndBanned": return L10n.plain("timeline.userBanned", name)
        case "Kicked": return L10n.plain("timeline.userKicked", name, sender)
        default: return nil
        }
    }
}

func readableError(_ error: Error) -> String {
    let message = error.localizedDescription
    if error is URLError || message.localizedCaseInsensitiveContains("error sending request")
        || message.localizedCaseInsensitiveContains("timed out") {
        return String(localized: "common.connectionFailed")
    }
    return message.isEmpty ? String(localized: "common.somethingWentWrong") : message
}
