import Foundation
import WizardChatCore

extension RoomSummary: @retroactive Identifiable {
    var displayName: String { name ?? canonicalAlias ?? id }
    /// Messages that notify under the room's notification setting (as on the web), or 1 when marked unread
    var unreadCount: Int { unreadNotifications > 0 ? unreadNotifications : markedUnread ? 1 : 0 }
    var mentionCount: Int { unreadMentions }
}

extension SpaceSummary: @retroactive Identifiable {}

enum SidebarSelection: Hashable {
    case home
    case dms
    case space(String)
}

struct RoomGroup: Identifiable {
    enum Kind {
        case favourites
        case section(RoomSection)
        case rooms
    }

    let kind: Kind
    let rooms: [RoomSummary]

    var isSection: Bool { if case .section = kind { true } else { false } }

    var id: String {
        switch kind {
        case .favourites: "favourites"
        case .section(let section): section.tag
        case .rooms: RoomListModel.roomsAnchor
        }
    }
}

struct UnreadState {
    var unread = false
    var mention = false
}

@MainActor
final class RoomListModel: ObservableObject {
    @Published private(set) var joinedRooms: [RoomSummary] = []
    @Published private(set) var invites: [RoomSummary] = []
    @Published private(set) var mentionRooms: [RoomSummary] = []
    @Published private(set) var threadRooms: [RoomSummary] = []
    /// Notification settings just picked here, shown until the room list catches up (as on the web)
    @Published private var notificationOverrides: [String: NotificationMode?] = [:]
    @Published private(set) var spaces: [SpaceSummary] = []
    /// Every joined space, subspaces included
    @Published private(set) var allSpaces: [SpaceSummary] = []
    @Published private(set) var spaceRooms: [String: Set<String>] = [:]
    @Published private(set) var isLoaded = false
    @Published private(set) var sections: [RoomSection] = []
    @Published private(set) var roomTags: [String: Set<String>] = [:]
    @Published private(set) var favouriteOrder: [String: Double] = [:]
    @Published private(set) var homeOrder: [String] = []
    weak var prefs: AppPreferences?

    static let roomsAnchor = "chats"
    static let homeSpace = "home-space"
    private static let homeOrderEvent = "org.wizardchat.home_order"

    let client: WizardClient
    private var rooms: [RoomSummary] = []
    private var subscriptions: [Subscription] = []
    private var graphTask: Task<Void, Never>?
    private var roomsReceived = false
    private var spacesReceived = false

    init(client: WizardClient) {
        self.client = client
    }

    func start() {
        subscriptions = [
            client.watchRooms(pageSize: 5000) { [weak self] diffs in
                MainActor.assumeIsolated { self?.apply(diffs) }
            },
            client.watchRoomSections { [weak self] sections in
                MainActor.assumeIsolated { self?.sections = sections }
            },
            client.watchRoomAccountData(eventType: "m.tag") { [weak self] pairs in
                MainActor.assumeIsolated { self?.applyTags(pairs) }
            },
            client.watchAccountData(eventType: Self.homeOrderEvent) { [weak self] content in
                MainActor.assumeIsolated {
                    guard case .object(let fields)? = content, case .array(let rooms)? = fields["rooms"] else {
                        self?.homeOrder = []
                        return
                    }
                    self?.homeOrder = rooms.compactMap { if case .string(let id) = $0 { id } else { nil } }
                }
            },
            client.watchSpaces { [weak self] diffs in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    diffs.forEach { $0.apply(to: &self.spaces) }
                    self.spacesReceived = true
                    self.refreshGraph()
                }
            },
            client.watchAllSpaces { [weak self] diffs in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    diffs.forEach { $0.apply(to: &self.allSpaces) }
                }
            },
        ]
    }

    func stop() {
        subscriptions.forEach { $0.cancel() }
        subscriptions = []
        graphTask?.cancel()
    }

    func room(id: String) -> RoomSummary? {
        joinedRooms.first { $0.id == id }
    }

    func accept(_ invite: RoomSummary) async throws {
        try await client.acceptInvite(roomId: invite.id)
    }

    func decline(_ invite: RoomSummary) async throws {
        try await client.declineInvite(roomId: invite.id)
    }

    func setRead(_ room: RoomSummary, read: Bool) async {
        if read {
            try? await client.timeline(roomId: room.id).markAsRead(_private: prefs?.sendReadReceipts == false)
        }
        try? await client.setMarkedUnread(roomId: room.id, unread: !read)
    }

    func notificationMode(of room: RoomSummary) -> NotificationMode? {
        if let override = notificationOverrides[room.id] { return override }
        return room.notificationMode
    }

    func setNotificationMode(_ room: RoomSummary, _ mode: NotificationMode?) async {
        let previous = notificationOverrides[room.id]
        notificationOverrides[room.id] = .some(mode)
        do {
            try await client.setRoomNotificationMode(roomId: room.id, mode: mode)
        } catch {
            notificationOverrides[room.id] = previous
        }
    }

    func leave(_ room: RoomSummary) async {
        try? await client.leave(roomId: room.id)
    }

    func markAsRead(_ rooms: [RoomSummary]) async {
        for room in rooms { await setRead(room, read: true) }
    }

    var allJoinedRooms: [RoomSummary] { joinedRooms }

    func isJoined(_ roomId: String) -> Bool {
        joinedRooms.contains { $0.id == roomId } || spaces.contains { $0.id == roomId }
    }

    func space(id: String) -> SpaceSummary? {
        spaces.first { $0.id == id }
    }

    func space(containing roomId: String) -> SpaceSummary? {
        spaces.first { spaceRooms[$0.id]?.contains(roomId) == true }
    }

    func unreadState(of selection: SidebarSelection) -> UnreadState {
        rooms(for: selection).reduce(into: UnreadState()) { state, room in
            if room.mentionCount > 0 { state.mention = true }
            if room.unreadCount > 0 || room.mentionCount > 0 { state.unread = true }
        }
    }

    func rooms(for selection: SidebarSelection) -> [RoomSummary] {
        switch selection {
        case .home:
            let inSpaces = spaceRooms.values.reduce(into: Set<String>()) { $0.formUnion($1) }
            return joinedRooms.filter { !$0.isDirect && !inSpaces.contains($0.id) }
        case .dms:
            return joinedRooms.filter(\.isDirect)
        case .space(let id):
            let ids = spaceRooms[id] ?? []
            return joinedRooms.filter { ids.contains($0.id) }
        }
    }

    func groups(for selection: SidebarSelection) -> [RoomGroup] {
        let rooms = rooms(for: selection)
        guard selection != .dms else { return [RoomGroup(kind: .rooms, rooms: rooms)] }
        let context = sectionContext(selection)
        let favourites = rooms.filter(\.isFavourite).sorted { a, b in
            switch (favouriteOrder[a.id], favouriteOrder[b.id]) {
            case let (x?, y?) where x != y: return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.displayName.localizedCompare(b.displayName) == .orderedAscending
            }
        }
        var bySection: [String: [RoomSummary]] = [:]
        var rest: [RoomSummary] = []
        for room in rooms where !room.isFavourite {
            if let tag = sectionTag(of: room.id) { bySection[tag, default: []].append(room) } else { rest.append(room) }
        }
        if selection == .home, !homeOrder.isEmpty {
            let position = Dictionary(homeOrder.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
            rest = rest.enumerated().sorted { a, b in
                switch (position[a.element.id], position[b.element.id]) {
                case let (x?, y?): return x < y
                case (_?, nil): return true
                case (nil, _?): return false
                default: return a.offset < b.offset
                }
            }.map(\.element)
        }
        let visible = sections.filter { bySection[$0.tag] != nil || $0.spaceId == context }
        func block(above: Bool) -> [RoomGroup] {
            visible.filter { $0.aboveRooms == above }.map { RoomGroup(kind: .section($0), rooms: bySection[$0.tag] ?? []) }
        }
        var groups: [RoomGroup] = []
        if !favourites.isEmpty { groups.append(RoomGroup(kind: .favourites, rooms: favourites)) }
        groups += block(above: true)
        groups.append(RoomGroup(kind: .rooms, rooms: rest))
        groups += block(above: false)
        return groups
    }

    func sectionContext(_ selection: SidebarSelection) -> String {
        if case .space(let id) = selection { return id }
        return Self.homeSpace
    }

    func sectionTag(of roomId: String) -> String? {
        guard let tags = roomTags[roomId] else { return nil }
        return sections.first { tags.contains($0.tag) }?.tag
    }

    func moveGroup(_ anchor: String, by offset: Int, in groups: [RoomGroup]) async throws {
        var anchors = groups.compactMap { group -> String? in
            if case .favourites = group.kind { return nil }
            return group.id
        }
        guard let index = anchors.firstIndex(of: anchor), anchors.indices.contains(index + offset) else { return }
        anchors.swapAt(index, index + offset)
        try await client.setRoomSectionOrder(tags: anchors)
    }

    func saveFavouriteOrder(_ roomIds: [String]) async {
        let count = Double(roomIds.count)
        for (index, roomId) in roomIds.enumerated() {
            let order = Double(index + 1) / (count + 1)
            guard favouriteOrder[roomId] != order else { continue }
            favouriteOrder[roomId] = order
            try? await client.setFavouriteOrder(roomId: roomId, order: order)
        }
    }

    func saveHomeOrder(_ roomIds: [String]) async {
        homeOrder = roomIds
        try? await client.setAccountData(eventType: Self.homeOrderEvent,
                                         content: .object(["rooms": .array(roomIds.map { .string($0) })]))
    }

    private func applyTags(_ pairs: [[JSONValue]]) {
        var tags: [String: Set<String>] = [:]
        var orders: [String: Double] = [:]
        for pair in pairs {
            guard pair.count == 2, case .string(let roomId) = pair[0],
                  case .object(let content) = pair[1], case .object(let names)? = content["tags"] else { continue }
            tags[roomId] = Set(names.keys)
            if case .object(let favourite)? = names["m.favourite"], case .number(let order)? = favourite["order"] {
                orders[roomId] = order
            }
        }
        roomTags = tags
        favouriteOrder = orders
    }

    private func apply(_ diffs: [ListDiff<RoomSummary>]) {
        diffs.forEach { $0.apply(to: &rooms) }
        joinedRooms = rooms.filter { !$0.isInvite }
        notificationOverrides = notificationOverrides.filter { id, mode in
            joinedRooms.first { $0.id == id }?.notificationMode != mode
        }
        invites = rooms.filter(\.isInvite)
        mentionRooms = joinedRooms.filter { $0.mentionCount > 0 }
        threadRooms = joinedRooms.filter { $0.unreadThreads > 0 }
        roomsReceived = true
        refreshGraph()
    }

    /// The space graph comes from local state; refresh it shortly after rooms or spaces change
    private func refreshGraph() {
        graphTask?.cancel()
        let delay: Duration = isLoaded ? .milliseconds(150) : .zero
        graphTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard let self, !Task.isCancelled else { return }
            defer { if self.roomsReceived && self.spacesReceived { self.isLoaded = true } }
            guard let graph = try? await self.client.spaceGraph() else { return }
            let children = Dictionary(graph.map { ($0.spaceId, $0.children.map(\.roomId)) }, uniquingKeysWith: { a, _ in a })
            func descendants(of id: String, seen: inout Set<String>) {
                for child in children[id] ?? [] where seen.insert(child).inserted {
                    descendants(of: child, seen: &seen)
                }
            }
            self.spaceRooms = Dictionary(uniqueKeysWithValues: self.spaces.map { space in
                var seen = Set<String>()
                descendants(of: space.id, seen: &seen)
                return (space.id, seen)
            })
        }
    }
}
