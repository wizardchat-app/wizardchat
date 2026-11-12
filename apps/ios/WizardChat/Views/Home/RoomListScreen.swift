import WizardChatCore
import SwiftUI

enum Route: Hashable {
    case room(String)
    case space(String)
    case chat(String)
    case thread(String, String)
}

struct RoomListScreen: View {
    @ObservedObject var roomList: RoomListModel
    let selection: SidebarSelection
    var onOpenInbox: (() -> Void)?

    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var search = ""
    @State private var leaving: RoomSummary?
    @State private var showNewRoom = false
    @State private var showNewMessage = false
    @State private var showSpaceSettings = false
    @State private var reordering = false
    @State private var newSectionFor: String?
    @State private var renaming: RoomSection?
    @State private var deleting: RoomSection?
    @State private var sectionName = ""
    @State private var sectionError: String?
    @State private var collapsed = Set(UserDefaults.standard.stringArray(forKey: "roomList.collapsed") ?? [])

    private var title: String {
        switch selection {
        case .home: return String(localized: "nav.home")
        case .dms: return String(localized: "room.dm.directMessages")
        case .space(let id): return roomList.space(id: id)?.name ?? String(localized: "explore.typeSpace")
        }
    }

    private var spaceId: String? {
        if case .space(let id) = selection { return id }
        return nil
    }

    private var rooms: [RoomSummary] {
        guard roomList.isLoaded else { return [] }
        let rooms = roomList.rooms(for: selection)
        guard !search.isEmpty else { return rooms }
        return rooms.filter { $0.displayName.localizedCaseInsensitiveContains(search) }
    }

    private var groups: [RoomGroup] {
        guard roomList.isLoaded else { return [] }
        let groups = roomList.groups(for: selection)
        guard !search.isEmpty else { return groups }
        return groups.map { RoomGroup(kind: $0.kind, rooms: $0.rooms.filter { $0.displayName.localizedCaseInsensitiveContains(search) }) }
    }

    var body: some View {
        List {
            if onOpenInbox != nil {
                VerificationBanner()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if selection == .home, search.isEmpty, roomList.isLoaded {
                ActiveNowSection(roomList: roomList)
            }
            if !roomList.isLoaded {
                ForEach(0..<8, id: \.self) { _ in
                    SkeletonRow().listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            } else if rooms.isEmpty {
                Text(search.isEmpty ? emptyText : "nav.noMatches")
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, WZ.Space.space9)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            let groups = groups
            if selection == .dms, groups.count == 1, case .rooms = groups[0].kind {
                ForEach(groups[0].rooms) { roomRow($0) }
                    .onMove(perform: selection == .home && reordering ? { moveRooms(groups[0], from: $0, to: $1) } : nil)
            } else {
                ForEach(groups) { group in
                    Section {
                        if !isCollapsed(group) || reordering {
                            ForEach(group.rooms) { roomRow($0) }
                                .onMove(perform: canReorder(group) ? { moveRooms(group, from: $0, to: $1) } : nil)
                        }
                    } header: {
                        groupHeader(group, in: groups)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 8))
                    }
                }
            }
        }
        .environment(\.editMode, .constant(reordering ? .active : .inactive))
        .listStyle(.plain)
        .listSectionSpacing(0)
        .environment(\.defaultMinListHeaderHeight, 0)
        .scrollContentBackground(.hidden)
        .background(theme.bgPrimary.ignoresSafeArea())
        .modifier(RootTitle(title: title, isRoot: spaceId == nil))
        // Under the title: iOS 26 would otherwise put it at the bottom, behind the tab island.
        // Typing searches everything, not just this list.
        .overlay {
            if !search.trimmingCharacters(in: .whitespaces).isEmpty {
                GlobalSearchResults(roomList: roomList, query: search)
            }
        }
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic),
                    prompt: Text(String(localized: "nav.searchPlaceholder")))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showNewMessage = true } label: { Label(menu: String(localized: "common.newDm"), icon: "ph-chat-circle-regular") }
                    if selection != .dms {
                        Button { showNewRoom = true } label: { Label(menu: String(localized: "nav.newRoom"), icon: "ph-hash-straight-regular") }
                    }
                    if selection != .dms {
                        Button { startNewSection(for: nil) } label: { Label(menu: String(localized: "room.sections.new"), icon: "ph-list-bullets-regular") }
                        Button { reordering = true } label: { Label(menu: String(localized: "nav.reorderRooms"), icon: "ph-caret-up-down-regular") }
                    }
                    if spaceId != nil {
                        Divider()
                        Button { showSpaceSettings = true } label: { Label(menu: String(localized: "space.settingsTitle"), icon: "ph-gear-regular") }
                    }
                } label: {
                    Image("ph-plus-regular")
                }
                .accessibilityLabel(String(localized: "nav.new"))
            }
            if reordering {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { reordering = false }.fontWeight(.semibold)
                }
            }
            if let onOpenInbox {
                ToolbarItem(placement: .topBarTrailing) {
                    InboxButton(roomList: roomList, action: onOpenInbox)
                }
            }
        }
        .sheet(isPresented: $showNewMessage) { UserPickerView(mode: .directMessage) }
        .sheet(isPresented: $showNewRoom) { CreateRoomView(spaceId: spaceId) }
        .sheet(isPresented: $showSpaceSettings) {
            if let spaceId, let space = roomList.space(id: spaceId) {
                SpaceSettingsView(space: space, roomList: roomList)
            }
        }
        .alert(String(localized: renaming == nil ? "room.sections.newTitle" : "room.sections.renameTitle"),
               isPresented: Binding(get: { newSectionFor != nil || renaming != nil },
                                    set: { if !$0 { newSectionFor = nil; renaming = nil } })) {
            TextField("", text: $sectionName)
            Button(String(localized: "common.save")) { Task { await saveSectionName() } }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        }
        .confirmationDialog(L10n.format("room.sections.deleteTitle", deleting?.name ?? ""),
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button(String(localized: "room.sections.delete"), role: .destructive) {
                guard let section = deleting else { return }
                sectionTask { try await roomList.client.deleteRoomSection(tag: section.tag) }
            }
        } message: {
            Text(String(localized: "room.sections.deleteMessage"))
        }
        .alert(sectionError ?? "", isPresented: Binding(get: { sectionError != nil }, set: { if !$0 { sectionError = nil } })) {
            Button(String(localized: "common.close"), role: .cancel) {}
        }
        .confirmationDialog(
            L10n.format("room.info.leaveConfirm", leaving?.displayName ?? ""),
            isPresented: Binding(get: { leaving != nil }, set: { if !$0 { leaving = nil } }),
            titleVisibility: .visible
        ) {
            Button(String(localized: "common.leave"), role: .destructive) {
                if let room = leaving { Task { await roomList.leave(room) } }
            }
        }
    }

    private func roomRow(_ room: RoomSummary) -> some View {
        NavigationLink(value: Route.room(room.id)) {
            RoomRow(room: room, showsHashIcon: !prefs.showRoomAvatars && !room.isDirect,
                    muted: roomList.notificationMode(of: room) == .mute)
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        .listRowBackground(theme.bgPrimary)
        .listRowSeparator(.hidden)
        .swipeActions(edge: .leading) {
            let unread = room.unreadCount > 0 || room.mentionCount > 0
            Button {
                Task { await roomList.setRead(room, read: unread) }
            } label: {
                Label(unread ? String(localized: "common.markRead") : String(localized: "nav.markAsUnread"),
                      image: unread ? "ph-envelope-open-regular" : "ph-envelope-simple-regular")
            }
            // Swipe actions always draw their icon white, so this needs a darker neutral
            .tint(theme.textMuted)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { leaving = room } label: {
                Label(String(localized: "common.leave"), image: "ph-sign-out-regular")
            }
            .tint(theme.danger)
        }
        .contextMenu {
            Button { Task { await roomList.setRead(room, read: true) } } label: {
                Label(menu: String(localized: "common.markRead"), icon: "ph-envelope-open-regular")
            }
            Menu {
                Picker(selection: Binding(get: { roomList.notificationMode(of: room) },
                                          set: { mode in Task { await roomList.setNotificationMode(room, mode) } })) {
                    Label(menu: String(localized: "room.notifications.default"), icon: "ph-bell-regular").tag(NotificationMode?.none)
                    Label(menu: String(localized: "room.notifications.all"), icon: "ph-bell-ringing-regular").tag(NotificationMode?.some(.all))
                    Label(menu: String(localized: "room.notifications.mentions"), icon: "ph-bell-simple-regular").tag(NotificationMode?.some(.mentions))
                    Label(menu: String(localized: "room.notifications.mute"), icon: "ph-bell-slash-regular").tag(NotificationMode?.some(.mute))
                } label: {
                    EmptyView()
                }
                .pickerStyle(.inline)
            } label: {
                Label(menu: String(localized: "room.notifications.title"), icon: "ph-bell-regular")
            }
            Button {
                sectionTask { try await roomList.client.setFavourite(roomId: room.id, favourite: !room.isFavourite) }
            } label: {
                Label(menu: String(localized: room.isFavourite ? "room.removeFavourite" : "room.addFavourite"),
                      icon: room.isFavourite ? "ph-star-fill" : "ph-star-regular")
            }
            if selection != .dms { sectionMenu(for: room) }
            Button { copyToClipboard("https://matrix.to/#/\(room.id)", message: String(localized: "timeline.linkCopied")) } label: {
                Label(menu: String(localized: "common.copyLink"), icon: "ph-link-simple-regular")
            }
            Divider()
            Button(role: .destructive) { leaving = room } label: {
                Label(menu: String(localized: "common.leave"), icon: "ph-sign-out-regular", destructive: true)
            }
        }
    }

    @ViewBuilder
    private func sectionMenu(for room: RoomSummary) -> some View {
        let context = roomList.sectionContext(selection)
        let current = roomList.sectionTag(of: room.id)
        Menu {
            ForEach(roomList.sections.filter { $0.spaceId == context || $0.tag == current }, id: \.tag) { section in
                Button {
                    sectionTask { try await roomList.client.setRoomSection(roomId: room.id, tag: section.tag) }
                } label: {
                    if section.tag == current { Label(section.name, image: "ph-check-bold") } else { Text(section.name) }
                }
            }
            Button { startNewSection(for: room.id) } label: {
                Label(menu: String(localized: "room.sections.new"), icon: "ph-plus-regular")
            }
            if current != nil {
                Divider()
                Button {
                    sectionTask { try await roomList.client.setRoomSection(roomId: room.id, tag: nil) }
                } label: {
                    Label(menu: String(localized: "room.sections.remove"), icon: "ph-x-regular")
                }
            }
        } label: {
            Label(menu: String(localized: "room.sections.moveTo"), icon: "ph-list-bullets-regular")
        }
    }

    @ViewBuilder
    private func groupHeader(_ group: RoomGroup, in groups: [RoomGroup]) -> some View {
        let anchors = groups.filter { if case .favourites = $0.kind { false } else { true } }.map(\.id)
        let index = anchors.firstIndex(of: group.id)
        let closed = isCollapsed(group) && !reordering
        HStack(spacing: WZ.Space.space0) {
            HStack(spacing: WZ.Space.space3) {
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs))
                    .foregroundStyle(theme.textMuted)
                    .rotationEffect(.degrees(closed ? 0 : 90))
                    .frame(width: WZ.SizeIcon.md)
                Text(groupTitle(group))
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(1)
                if closed { collapsedBadge(group) }
                Spacer(minLength: WZ.Space.space4)
            }
            .frame(maxWidth: .infinity, minHeight: WZ.SizeControl.sm + WZ.Space.space1, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { if !reordering { toggle(group) } }
            .sensoryFeedback(.selection, trigger: closed)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(groupTitle(group))
            .accessibilityHint(String(localized: closed ? "common.expand" : "common.collapse"))
            .accessibilityAddTraits([.isHeader, .isButton])
            .accessibilityAction { if !reordering { toggle(group) } }
            if let index, anchors.count > 1 || group.isSection {
                Menu {
                    if case .section(let section) = group.kind {
                        Button { renaming = section; sectionName = section.name } label: {
                            Label(menu: String(localized: "common.rename"), icon: "ph-pencil-simple-regular")
                        }
                    }
                    Button { moveGroup(group, by: -1, in: groups) } label: {
                        Label(menu: String(localized: "room.sections.moveUp"), icon: "ph-caret-up-down-regular")
                    }
                    .disabled(index == 0)
                    Button { moveGroup(group, by: 1, in: groups) } label: {
                        Label(menu: String(localized: "room.sections.moveDown"), icon: "ph-caret-up-down-regular")
                    }
                    .disabled(index == anchors.count - 1)
                    if case .section(let section) = group.kind {
                        Divider()
                        Button(role: .destructive) { deleting = section } label: {
                            Label(menu: String(localized: "room.sections.delete"), icon: "ph-trash-regular", destructive: true)
                        }
                    }
                } label: {
                    Image("ph-dots-three-bold")
                        .font(.system(size: WZ.SizeIcon.sm))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Size.touchTarget, height: WZ.SizeControl.sm + WZ.Space.space1)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(String(localized: "room.sections.options"))
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func collapsedBadge(_ group: RoomGroup) -> some View {
        let unread = group.rooms.reduce(0) { $0 + max($1.unreadCount, $1.mentionCount) }
        if unread > 0 {
            UnreadBadge(count: unread, isMention: group.rooms.contains { $0.mentionCount > 0 })
        }
    }

    private func collapseKey(_ group: RoomGroup) -> String {
        "\(roomList.sectionContext(selection))::\(group.id)"
    }

    private func isCollapsed(_ group: RoomGroup) -> Bool { collapsed.contains(collapseKey(group)) }

    private func toggle(_ group: RoomGroup) {
        let key = collapseKey(group)
        withAnimation(.snappy(duration: WZ.MotionDuration.normal)) {
            if collapsed.contains(key) { collapsed.remove(key) } else { collapsed.insert(key) }
        }
        UserDefaults.standard.set(Array(collapsed), forKey: "roomList.collapsed")
    }

    private func groupTitle(_ group: RoomGroup) -> String {
        switch group.kind {
        case .favourites: String(localized: "nav.favourites")
        case .section(let section): section.name
        case .rooms: String(localized: "nav.rooms")
        }
    }

    private func canReorder(_ group: RoomGroup) -> Bool {
        guard reordering else { return false }
        switch group.kind {
        case .favourites: return true
        case .rooms: return selection == .home
        case .section: return false
        }
    }

    private func moveRooms(_ group: RoomGroup, from source: IndexSet, to destination: Int) {
        var ids = group.rooms.map(\.id)
        ids.move(fromOffsets: source, toOffset: destination)
        Task {
            if case .favourites = group.kind {
                await roomList.saveFavouriteOrder(ids)
            } else {
                await roomList.saveHomeOrder(ids)
            }
        }
    }

    private func moveGroup(_ group: RoomGroup, by offset: Int, in groups: [RoomGroup]) {
        sectionTask { try await roomList.moveGroup(group.id, by: offset, in: groups) }
    }

    private func startNewSection(for roomId: String?) {
        sectionName = ""
        renaming = nil
        newSectionFor = roomId ?? ""
    }

    private func saveSectionName() async {
        let name = sectionName.trimmingCharacters(in: .whitespaces)
        let section = renaming
        let roomId = newSectionFor
        newSectionFor = nil
        renaming = nil
        guard !name.isEmpty else { return }
        sectionTask {
            if let section {
                try await roomList.client.renameRoomSection(tag: section.tag, name: name)
            } else {
                let tag = try await roomList.client.createRoomSection(name: name, spaceId: roomList.sectionContext(selection))
                if let roomId, !roomId.isEmpty {
                    try await roomList.client.setRoomSection(roomId: roomId, tag: tag)
                }
            }
        }
    }

    private func sectionTask(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch {
                sectionError = L10n.format("room.sections.failed", error.localizedDescription)
            }
        }
    }

    private var emptyText: LocalizedStringKey {
        switch selection {
        case .dms: return "nav.noDirectMessagesYet"
        default: return "nav.noRoomsHereYet"
        }
    }
}

private struct InboxButton: View {
    @ObservedObject var roomList: RoomListModel
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        let mentions = !roomList.mentionRooms.isEmpty
        let badge = mentions || !roomList.invites.isEmpty || !roomList.threadRooms.isEmpty
        Button(action: action) {
            Image("ph-tray-regular")
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(mentions ? theme.mention : theme.accent)
                            .frame(width: WZ.Space.space4, height: WZ.Space.space4)
                            .offset(x: WZ.Space.space2, y: -WZ.Space.space1)
                    }
                }
        }
        .accessibilityLabel(String(localized: "inbox.title"))
    }
}

struct RoomRow: View {
    let room: RoomSummary
    let showsHashIcon: Bool
    var muted = false
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme

    private var avatarSize: CGFloat { prefs.roomAvatarSize }
    private var inCall: Bool { !room.callParticipants.isEmpty }

    private func typeIcon(size: CGFloat) -> some View {
        Icon(room.isVoice ? "speaker-high" : inCall ? "phone" : "hash-straight",
             room.isVoice || inCall ? .regular : .bold, size: size)
            .foregroundStyle(inCall ? theme.success : theme.textMuted)
    }
    private var hasUnread: Bool { room.unreadCount > 0 || room.mentionCount > 0 }

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            if showsHashIcon {
                typeIcon(size: avatarSize * 0.45)
                    .frame(width: avatarSize, height: avatarSize)
                    .background(theme.fill, in: Circle())
            } else {
                AvatarView(name: room.displayName, url: room.avatarUrl, size: avatarSize)
                    .overlay(alignment: .bottomTrailing) {
                        if !room.isDirect || inCall {
                            typeIcon(size: WZ.SizeIcon.xs)
                                .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                                .background(theme.bgPrimary, in: Circle())
                                .overlay(Circle().stroke(inCall ? theme.success : theme.border, lineWidth: WZ.BorderWidth.thin))
                                .offset(x: WZ.Space.space2, y: WZ.Space.space2)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.lg, hasUnread ? .semibold : .regular))
                    .foregroundStyle(hasUnread ? theme.textPrimary : theme.textPrimary.opacity(0.85))
                    .lineLimit(1)
                if room.isVoice && inCall {
                    ParticipantStack(roomId: room.id, userIds: room.callParticipants)
                }
            }
            Spacer(minLength: 6)
            if muted {
                Image("ph-bell-slash-regular")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityLabel(String(localized: "room.notifications.mute"))
            }
            if room.mentionCount > 0 {
                UnreadBadge(count: room.mentionCount, isMention: true)
            } else if room.unreadCount > 0 {
                UnreadBadge(count: room.unreadCount, isMention: false)
            }
        }
        .padding(.vertical, prefs.roomRowPadding)
        .contentShape(Rectangle())
    }
}

struct SkeletonRow: View {
    @Environment(\.theme) private var theme
    @State private var pulse = false

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            Circle().fill(theme.fill).frame(width: WZ.Space.space10, height: WZ.Space.space10)
            Capsule().fill(theme.fill).frame(width: WZ.SizeAvatar.xxl, height: WZ.Space.space5)
        }
        .padding(.vertical, WZ.Space.space3)
        .opacity(pulse ? 1 : 0.5)
        .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
        .onAppear { pulse = true }
    }
}

private struct RootTitle: ViewModifier {
    let title: String
    let isRoot: Bool

    func body(content: Content) -> some View {
        if isRoot {
            content.tabTitle(title)
        } else {
            content.navigationTitle(title).navigationBarTitleDisplayMode(.large)
        }
    }
}
