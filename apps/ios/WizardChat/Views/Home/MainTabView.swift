import SwiftUI
import WizardChatCore

struct MainTabView: View {
    enum Tab: String, CaseIterable { case home, dms, spaces, me }

    @ObservedObject var roomList: RoomListModel
    @EnvironmentObject private var notifier: MessageNotifier
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.theme) private var theme

    @State private var tab: Tab = .home
    @State private var paths: [Tab: [Route]] = [:]
    @State private var profileIcon: UIImage?
    @State private var settingsPopToRoot = 0
    @State private var showCreateSpace = false
    @State private var showInbox = false
    @State private var showExplore = false
    @State private var whatsNew: WhatsNew.Entry?
    @StateObject private var encryptionSetup = EncryptionSetupModel()
    @AppStorage(EncryptionSetupScreen.skippedKey) private var skippedVerificationDevice = ""

    var body: some View {
        TabView(selection: Binding(get: { tab }, set: select)) {
            tabItem(.home, title: "nav.home", icon: "house", unread: roomList.unreadState(of: .home))
            tabItem(.dms, title: "search.switcher.prefixDms", icon: "chat-circle", unread: roomList.unreadState(of: .dms))
            tabItem(.spaces, title: "room.settings.permissions.groups.spaces", icon: "stack", unread: spacesUnread)
            SwiftUI.Tab(value: Tab.me) {
                tabContent(.me).tint(theme.control)
            } label: {
                Group {
                    if let profileIcon { Image(uiImage: profileIcon) } else { Image.ph("user", .fill) }
                }
                .accessibilityLabel(String(localized: "nav.you"))
            }
        }
        .tint(theme.accent)
        .modifier(MinimizeTabBarOnScroll())
        .modifier(CallAccessoryModifier(show: showsCallBar(in: tab), onOpen: openCall))
        .task(id: "\(session.avatarUrl ?? "")|\(session.displayName ?? session.userId ?? "")") {
            profileIcon = await AvatarImage.circular(session.avatarUrl, name: session.displayName ?? session.userId ?? "",
                                                     media: session.media, theme: theme, side: WZ.SizeIcon.xl)
            // Saved for the account switcher, which can't always reach this account's server
            if let userId = session.userId {
                if let url = session.avatarUrl {
                    if let own = await session.media?.thumbnail(url) { SessionStore.saveAvatar(own, for: userId) }
                } else {
                    SessionStore.saveAvatar(nil, for: userId)
                }
            }
        }
        .overlay(alignment: .top) {
            CopyToastView().padding(.top, WZ.Space.space2)
        }
        .overlay(alignment: .top) {
            ConnectionBanner().padding(.top, WZ.Space.space1)
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: session.connectionLost)
        .overlay(alignment: .top) {
            if let call = calls.incoming, calls.incomingCallId == nil {
                IncomingCallBanner(call: call)
                    .padding(.top, WZ.Space.space2)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: WZ.MotionDuration.slow), value: calls.incoming)
        .fullScreenCover(isPresented: $calls.showCallScreen) { DMCallScreen() }
        .alert(calls.alert ?? "", isPresented: Binding(get: { calls.alert != nil && !calls.showCallScreen },
                                                       set: { if !$0 { calls.alert = nil } })) {
            Button(String(localized: "common.ok"), role: .cancel) {}
        }
        .onChange(of: totalUnread, initial: true) { _, count in notifier.updateBadge(count) }
        .onChange(of: readRooms, initial: true) { _, _ in notifier.clearRead(roomList.joinedRooms) }
        .onChange(of: roomList.joinedRooms.map(\.id), initial: true) { _, _ in ShareSender.publishRooms(roomList) }
        .fullScreenCover(isPresented: Binding(get: {
            session.needsEncryptionSetup || encryptionSetup.recoveryKey != nil
                || (session.needsVerification && skippedVerificationDevice != (session.deviceId ?? ""))
        },
                                              set: { _ in })) {
            EncryptionSetupScreen(model: encryptionSetup)
        }
        .environment(\.roomOpener, RoomOpener { id, isSpace in
            if isSpace { showSpace(id) } else { show(id) }
        })
        .onOpenURL { url in
            guard url.scheme == "wizardchat" else { return }
            Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            notifier.clearRead(roomList.joinedRooms)
            Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) }
        }
        .onChange(of: roomList.isLoaded, initial: true) { _, loaded in
            if loaded { Task { await ShareSender.sendPending(roomList: roomList, notifier: notifier) } }
        }
        .animation(.easeOut(duration: WZ.MotionDuration.normal), value: calls.isInCall)
        .onChange(of: notifier.roomToOpen) { _, _ in openNotificationRoom() }
        .onAppear(perform: openNotificationRoom)
        .onChange(of: roomList.isLoaded) { _, _ in openNotificationRoom() }
        .sheet(item: $whatsNew) { entry in
            WhatsNewSheet(entry: entry)
        }
        .onChange(of: roomList.isLoaded, initial: true) { _, loaded in
            if loaded, whatsNew == nil { whatsNew = WhatsNew.unseen }
        }
        .sheet(isPresented: $showInbox) {
            InboxView(roomList: roomList, onOpenRoom: show, onOpenSpace: showSpace, onOpenThread: showThread)
        }
        .sheet(isPresented: $showCreateSpace) {
            CreateSpaceView { spaceId in showSpace(spaceId) }
        }
        .sheet(isPresented: $showExplore) {
            ExploreView(roomList: roomList) { roomId in
                if roomList.room(id: roomId) != nil { show(roomId) } else { showSpace(roomId) }
            }
        }
    }

    private func tabItem(_ item: Tab, title: LocalizedStringKey, icon: String, unread: UnreadState) -> some TabContent<Tab> {
        SwiftUI.Tab(value: item) {
            tabContent(item).tint(theme.control)
        } label: {
            // One icon for both states, like Apple's tab bars: swapping outline for fill while the
            // selection lens slides over makes the icon jump in size
            Label { Text(title) } icon: { Image.ph(icon, .fill) }
        }
        // The tab bar only shows counts; this counts the rooms with something new
        .badge(unreadRooms(item))
    }

    private func unreadRooms(_ item: Tab) -> Int {
        let rooms: [RoomSummary]
        switch item {
        case .home: rooms = roomList.rooms(for: .home)
        case .dms: rooms = roomList.rooms(for: .dms)
        case .spaces: rooms = roomList.spaces.flatMap { roomList.rooms(for: .space($0.id)) }
        case .me: return 0
        }
        return Set(rooms.filter { $0.unreadCount > 0 || $0.mentionCount > 0 }.map(\.id)).count
    }

    private var spacesUnread: UnreadState {
        roomList.spaces.reduce(into: UnreadState()) { state, space in
            let unread = roomList.unreadState(of: .space(space.id))
            state.unread = state.unread || unread.unread
            state.mention = state.mention || unread.mention
        }
    }

    /// The tab bar takes only an image and tints it, so the avatar is drawn round and kept in colour
    /// The avatar as a tab bar image (tab items only take images): the picture, or the same
    /// coloured fallback avatars show everywhere else
    @MainActor
    private var totalUnread: Int {
        roomList.joinedRooms.reduce(0) { $0 + Int($1.unreadCount) }
    }

    @MainActor
    private var readRooms: [String] {
        roomList.joinedRooms.filter { $0.unreadCount == 0 && $0.mentionCount == 0 }
            .map { "\($0.id)|\($0.lastActivity ?? 0)" }
    }

    @ViewBuilder
    private func tabContent(_ item: Tab) -> some View {
        switch item {
        case .me:
            SettingsView(isTab: true, popToRoot: settingsPopToRoot)
                .safeAreaInset(edge: .bottom) { callBar(in: item) }
        default:
            NavigationStack(path: binding(for: item)) {
                Group {
                    switch item {
                    case .home: RoomListScreen(roomList: roomList, selection: .home) { showInbox = true }
                    case .dms: RoomListScreen(roomList: roomList, selection: .dms) { showInbox = true }
                    default: SpacesScreen(roomList: roomList, onCreateSpace: { showCreateSpace = true },
                                          onExplore: { showExplore = true })
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .room(let id), .chat(let id):
                        Group {
                            if let room = roomList.room(id: id) {
                                if room.isVoice, case .room = route {
                                    VoiceRoomView(room: room, client: roomList.client) { paths[item, default: []].append(.chat(id)) }
                                } else {
                                    RoomView(room: room, client: roomList.client).id(room.id)
                                }
                            } else {
                                ProgressView().tint(theme.accent)
                            }
                        }
                        .toolbar(.hidden, for: .tabBar)
                    case .space(let id):
                        RoomListScreen(roomList: roomList, selection: .space(id))
                    case .thread(let id, let root):
                        Group {
                            if let room = roomList.room(id: id) {
                                RoomView(room: room, client: roomList.client, threadRoot: root).id("\(id)|\(root)")
                            } else {
                                ProgressView().tint(theme.accent)
                            }
                        }
                        .toolbar(.hidden, for: .tabBar)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) { callBar(in: item) }
        }
    }

    private func openCall() {
        if calls.room?.isDirect == true { calls.showCallScreen = true }
        else if let id = calls.room?.id { show(id) }
    }

    @ViewBuilder
    private func callBar(in item: Tab) -> some View {
        if !CallAccessoryModifier.supported, showsCallBar(in: item) {
            CallBar(onOpen: openCall)
            .padding(.horizontal, WZ.Space.space6)
            .padding(.bottom, WZ.Space.space2)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func showsCallBar(in item: Tab) -> Bool {
        guard calls.isInCall, calls.room?.id != nil else { return false }
        switch paths[item]?.last {
        case .room?, .chat?, .thread?: return false
        default: return true
        }
    }

    private func binding(for item: Tab) -> Binding<[Route]> {
        Binding(get: { paths[item] ?? [] }, set: { paths[item] = $0 })
    }

    private func select(_ item: Tab) {
        guard item == tab else { tab = item; return }
        paths[item] = []
        if item == .me { settingsPopToRoot += 1 }
    }

    private func show(_ roomId: String) {
        let room = roomList.room(id: roomId)
        if room?.isDirect == true {
            tab = .dms
            paths[.dms] = [.room(roomId)]
        } else if let space = roomList.space(containing: roomId) {
            tab = .spaces
            paths[.spaces] = [.space(space.id), .room(roomId)]
        } else {
            tab = .home
            paths[.home] = [.room(roomId)]
        }
    }

    private func showThread(_ roomId: String, root: String) {
        show(roomId)
        paths[tab, default: []].append(.thread(roomId, root))
    }

    private func showSpace(_ spaceId: String) {
        tab = .spaces
        paths[.spaces] = [.space(spaceId)]
    }

    private func openNotificationRoom() {
        guard let roomId = notifier.roomToOpen, notifier.accountToOpen == nil, roomList.isLoaded else { return }
        notifier.roomToOpen = nil
        showInbox = false; showCreateSpace = false; showExplore = false
        show(roomId)
    }
}

private struct CallAccessoryModifier: ViewModifier {
    let show: Bool
    let onOpen: () -> Void

    static var supported: Bool {
        if #available(iOS 26.1, *) { return true }
        return false
    }

    func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: show) { CallAccessory(onOpen: onOpen) }
        } else {
            content
        }
    }
}

private struct MinimizeTabBarOnScroll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}
