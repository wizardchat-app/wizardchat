import WizardChatCore
import SwiftUI

struct HighlightedText: View {
    let text: String
    let query: String
    var font: Font = .wizard(WZ.FontSize.md)
    @Environment(\.theme) private var theme

    var body: some View {
        Text(attributed).font(font)
    }

    private var attributed: AttributedString {
        var result = AttributedString(text)
        let needle = query.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return result }
        var start = result.startIndex
        while start < result.endIndex,
              let range = result[start...].range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) {
            result[range].foregroundColor = theme.accent
            result[range].inlinePresentationIntent = .stronglyEmphasized
            start = range.upperBound
        }
        return result
    }
}

extension String {
    func snippet(around query: String, radius: Int = 60) -> String {
        guard let range = self.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return String(prefix(radius * 2))
        }
        let start = index(range.lowerBound, offsetBy: -radius, limitedBy: startIndex) ?? startIndex
        let end = index(range.upperBound, offsetBy: radius, limitedBy: endIndex) ?? endIndex
        var piece = String(self[start..<end]).replacingOccurrences(of: "\n", with: " ")
        if start > startIndex { piece = "..." + piece }
        if end < endIndex { piece += "..." }
        return piece
    }
}

struct RoomSearchView: View {
    @Environment(\.timeFormat) private var timeFormat
    let room: RoomSummary
    let onJump: (String) -> Void

    @StateObject private var model: TimelineModel
    @Environment(\.theme) private var theme
    @State private var query = ""

    init(room: RoomSummary, client: WizardClient, onJump: @escaping (String) -> Void) {
        self.room = room
        self.onJump = onJump
        _model = StateObject(wrappedValue: TimelineModel(
            client: client, roomId: room.id, onlyTypes: [.text, .notice, .emote, .file, .image, .video, .audio, .location]))
    }

    private var needle: String { query.trimmingCharacters(in: .whitespaces) }

    private var results: [ChatEntry] {
        guard !needle.isEmpty else { return [] }
        return model.entries.reversed().filter { entry in
            guard entry.eventId != nil else { return false }
            return entry.summary.localizedCaseInsensitiveContains(needle)
                || entry.senderName.localizedCaseInsensitiveContains(needle)
        }
    }

    var body: some View {
        let results = results
        List {
            ForEach(results) { entry in
                Button { if let id = entry.eventId { onJump(id) } } label: { row(entry) }
                    .buttonStyle(.plain)
                    .listRowBackground(theme.bgSecondary)
            }
            if !needle.isEmpty {
                footer(isEmpty: results.isEmpty)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.bgSecondary)
        .overlay {
            if needle.isEmpty {
                ContentUnavailableView(String(localized: "search.title"), image: "ph-magnifying-glass-regular",
                                       description: Text(String(localized: "search.roomHint")))
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "search.thisRoom"))
        .autocorrectionDisabled()
        .navigationTitle(String(localized: "common.search"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.start() }
    }

    private func row(_ entry: ChatEntry) -> some View {
        HStack(alignment: .top, spacing: WZ.Space.space4) {
            AvatarView(name: entry.senderName, url: entry.senderAvatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                HStack {
                    HighlightedText(text: entry.senderName, query: needle, font: .wizard(WZ.FontSize.md, .semibold))
                    Spacer()
                    Text(entry.timestamp.dateTimeText(timeFormat))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                HighlightedText(text: entry.summary.snippet(around: needle), query: needle)
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, WZ.Space.space1)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func footer(isEmpty: Bool) -> some View {
        if !model.reachedStart {
            HStack(spacing: WZ.Space.space4) {
                ProgressView()
                Text(String(localized: "search.searchingOlder")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(WZ.Space.space6)
            .task(id: needle) {
                while !Task.isCancelled && !model.reachedStart {
                    await model.paginateBackwards()
                    try? await Task.sleep(for: .milliseconds(100))
                }
            }
        } else if isEmpty {
            Text(String(localized: "search.noResults")).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity)
                .padding(WZ.Space.space8)
        }
    }
}

struct GlobalSearchResults: View {
    @ObservedObject var roomList: RoomListModel
    let query: String

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.theme) private var theme
    @State private var messages: [ServerSearchHit] = []
    @State private var searchingMessages = false

    private var prefix: Character? { query.first.flatMap { "#@*".contains($0) ? $0 : nil } }
    private var text: String {
        var trimmed = query.trimmingCharacters(in: .whitespaces)
        if prefix != nil { trimmed.removeFirst() }
        return trimmed.trimmingCharacters(in: .whitespaces)
    }

    private func rank<T>(_ items: [T], name: (T) -> String) -> [T] {
        guard !text.isEmpty else { return items }
        let lower = text.lowercased()
        let matching = items.filter { name($0).lowercased().contains(lower) }
        return matching.filter { name($0).lowercased().hasPrefix(lower) }
            + matching.filter { !name($0).lowercased().hasPrefix(lower) }
    }

    private var rooms: [RoomSummary] {
        let all = roomList.allJoinedRooms
        switch prefix {
        case "#": return rank(all.filter { !$0.isDirect }, name: \.displayName)
        case "@": return rank(all.filter(\.isDirect), name: \.displayName)
        case "*": return []
        default: return rank(all, name: \.displayName)
        }
    }

    private var spaces: [SpaceSummary] {
        guard prefix == nil || prefix == "*" else { return [] }
        return rank(roomList.spaces, name: \.name)
    }

    var body: some View {
        let rooms = Array(rooms.prefix(prefix == nil ? 12 : 40))
        let spaces = Array(spaces.prefix(8))
        List {
            if !rooms.isEmpty {
                Section(String(localized: "search.roomsAndDms")) {
                    ForEach(rooms) { room in
                        Button { openRoom(room.id, notifier: notifier) } label: { roomRow(room) }
                            .buttonStyle(.plain)
                    }
                }
            }
            if !spaces.isEmpty {
                Section(String(localized: "room.settings.permissions.groups.spaces")) {
                    ForEach(spaces) { space in
                        NavigationLink(value: Route.space(space.id)) {
                            row(name: space.name, avatarUrl: space.avatarUrl, isSpace: true, initial: true, icon: "ph-squares-four-regular")
                        }
                    }
                }
            }
            if prefix == nil && text.count >= 3 {
                Section {
                    ForEach(messages) { hit in
                        Button {
                            notifier.eventToFocus = (hit.roomId, hit.eventId)
                            openRoom(hit.roomId, notifier: notifier)
                        } label: { messageRow(hit) }
                            .buttonStyle(.plain)
                    }
                    if searchingMessages {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if messages.isEmpty {
                        Text(String(localized: "search.noResults")).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted)
                    }
                } header: {
                    Text(String(localized: "room.settings.permissions.groups.messages"))
                } footer: {
                    Text(String(localized: "search.encryptedRoomsHint"))
                }
            }
            if rooms.isEmpty && spaces.isEmpty && (prefix != nil || text.count < 3) {
                Text(String(localized: "common.noResults")).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(theme.bgPrimary)
        .task(id: text) {
            guard prefix == nil, text.count >= 3 else { messages = []; return }
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            searchingMessages = true
            messages = await ServerSearch.messages(text, session: session, roomList: roomList)
            searchingMessages = false
        }
    }

    private func roomRow(_ room: RoomSummary) -> some View {
        row(name: room.displayName, avatarUrl: room.avatarUrl, isSpace: false, initial: !room.isDirect,
            icon: room.isDirect ? "ph-user-regular" : room.isVoice ? "ph-speaker-high-regular" : "ph-hash-straight-regular")
    }

    private func row(name: String, avatarUrl: String?, isSpace: Bool, initial: Bool, icon: String) -> some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name, url: avatarUrl, size: WZ.SizeAvatar.md, cornerRadius: isSpace ? 9 : nil, initial: initial)
            HighlightedText(text: name, query: text, font: .wizard(WZ.FontSize.lg, .medium))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
            Spacer()
            Image(icon)
                .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                .foregroundStyle(theme.textMuted)
        }
        .contentShape(Rectangle())
    }

    private func messageRow(_ hit: ServerSearchHit) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            HStack {
                Text(hit.roomName).font(.wizard(WZ.FontSize.sm, .semibold)).foregroundStyle(theme.textMuted)
                Spacer()
                Text(hit.date.formatted(date: .abbreviated, time: .omitted)).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            HighlightedText(text: hit.body.snippet(around: text), query: text)
                .foregroundStyle(theme.textPrimary)
                .lineLimit(3)
        }
        .contentShape(Rectangle())
    }
}

struct ServerSearchHit: Identifiable {
    var id: String { eventId }
    let eventId: String
    let roomId: String
    let roomName: String
    let body: String
    let date: Date
}

enum ServerSearch {
    @MainActor
    static func messages(_ term: String, session: MatrixSession, roomList: RoomListModel) async -> [ServerSearchHit] {
        guard let hits = try? await session.client?.searchMessages(term: term) else { return [] }
        return hits.map { hit in
            ServerSearchHit(eventId: hit.eventId, roomId: hit.roomId,
                            roomName: roomList.room(id: hit.roomId)?.displayName ?? hit.roomId,
                            body: hit.body, date: Date(timeIntervalSince1970: TimeInterval(hit.timestamp) / 1000))
        }
    }
}
