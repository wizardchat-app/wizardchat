import WizardChatCore
import SwiftUI

@MainActor
func openRoom(_ roomId: String, notifier: MessageNotifier) {
    notifier.roomToOpen = roomId
}

struct MembersView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var members: [Member] = []
    @State private var loaded = false
    @State private var search = ""
    @State private var selected: String?
    @State private var showInvite = false
    @State private var canInvite = false

    private struct Group: Identifiable {
        let id: String
        let title: LocalizedStringKey
        let members: [Member]
    }

    private var groups: [Group] {
        let filtered = search.isEmpty ? members : members.filter {
            ($0.displayName ?? "").localizedCaseInsensitiveContains(search) || $0.userId.localizedCaseInsensitiveContains(search)
        }
        let joined = filtered.filter { !$0.isInvite }
        func role(_ member: Member) -> Int {
            member.level >= 100 ? 0 : member.level >= 50 ? 1 : 2
        }
        let sorted = { (list: [Member]) in
            list.sorted { ($0.displayName ?? $0.userId).localizedCaseInsensitiveCompare($1.displayName ?? $1.userId) == .orderedAscending }
        }
        return [
            Group(id: "admins", title: "room.members.admins", members: sorted(joined.filter { role($0) == 0 })),
            Group(id: "mods", title: "room.members.moderators", members: sorted(joined.filter { role($0) == 1 })),
            Group(id: "members", title: "common.members", members: sorted(joined.filter { role($0) == 2 })),
            Group(id: "invited", title: "room.members.invited", members: sorted(filtered.filter(\.isInvite))),
        ].filter { !$0.members.isEmpty }
    }

    var body: some View {
        ThemedList {
            if canInvite {
                Button { showInvite = true } label: {
                    Label(String(localized: "room.members.invite"), image: "ph-user-plus-regular").foregroundStyle(theme.control)
                }
            }
            ForEach(groups) { group in
                Section {
                    ForEach(group.members, id: \.userId) { member in
                        Button { selected = member.userId } label: { MemberRow(member: member) }
                            .buttonStyle(.plain)
                    }
                } header: {
                    Text(group.title) + Text("  \(group.members.count)").foregroundStyle(theme.textMuted.opacity(0.7))
                }
            }
        }
        .overlay { if !loaded { ProgressView().tint(theme.accent) } }
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "room.settings.members.searchMembers"))
        .navigationTitle(String(localized: "common.members"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: Binding(get: { selected.map(IdentifiedString.init) }, set: { selected = $0?.id })) { item in
            UserProfileSheet(userId: item.id, roomId: roomId) { Task { await load() } }
        }
        .sheet(isPresented: $showInvite) {
            UserPickerView(mode: .invite(roomId)) { Task { await load() } }
        }
    }

    private func load() async {
        guard let client = session.client else { return }
        MemberDirectory.shared.forget(roomId: roomId)
        members = (try? await client.members(roomId: roomId)) ?? []
        canInvite = (try? await client.roomDetails(roomId: roomId))?.permissions.invite ?? false
        loaded = true
    }
}

struct IdentifiedString: Identifiable, Hashable { let id: String }

private struct MemberRow: View {
    let member: Member
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: member.displayName ?? member.userId, url: member.avatarUrl, size: WZ.SizeAvatar.md)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(member.displayName ?? member.userId)
                    .font(.wizard(WZ.FontSize.lg, .medium))
                    .foregroundStyle(theme.textPrimary)
                if member.displayName != nil {
                    Text(member.userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
            }
            .lineLimit(1)
            Spacer()
            RoleBadge(level: member.level)
        }
        .contentShape(Rectangle())
    }
}

/// The member's role, tinted in its colour as on the web
struct RoleBadge: View {
    let level: Int64
    @Environment(\.theme) private var theme

    private var role: (text: LocalizedStringKey, color: Color) {
        switch level {
        case .max: ("room.members.founder", theme.roleFounder)
        case 100...: ("room.members.admin", theme.roleAdmin)
        case 50..<100: ("room.members.moderator", theme.roleModerator)
        default: ("room.members.member", theme.roleMember)
        }
    }

    var body: some View {
        Text(role.text)
            .font(.wizard(WZ.FontSize.xs, .semibold))
            .foregroundStyle(role.color)
            .padding(.horizontal, WZ.Space.space3)
            .padding(.vertical, WZ.Space.space1)
            .background(role.color.opacity(0.15), in: Capsule())
    }
}

struct UserProfileSheet: View {
    let userId: String
    var roomId: String?
    var onChange: (() -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @Environment(\.roomOpener) private var roomOpener
    @State private var name: String?
    @State private var avatarUrl: String?
    @State private var statusText: String?
    @State private var pronouns: String?
    @State private var mutualRooms: [MutualRoom] = []
    @State private var rights = RoleRights(ownLevel: 0, canEditLevels: false)
    @State private var level: Int64 = 0
    @State private var isMember = false
    @State private var canKick = false
    @State private var canBan = false
    @State private var confirm: Action?
    @State private var reason = ""
    @State private var busy = false
    @State private var error: String?

    enum Action: Identifiable { case kick, ban, ignore; var id: Self { self } }

    private var isMe: Bool { userId == session.userId }

    private var mutualGroups: [(title: String, rooms: [MutualRoom])] {
        [
            (String(localized: "nav.spaces"), mutualRooms.filter { $0.isSpace }),
            (String(localized: "nav.rooms"), mutualRooms.filter { !$0.isSpace && !$0.isDirect }),
            (String(localized: "room.dm.directMessages"), mutualRooms.filter { !$0.isSpace && $0.isDirect }),
        ].filter { !$0.rooms.isEmpty }
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                Section {
                    VStack(spacing: WZ.Space.space4) {
                        AvatarView(name: name ?? userId, url: avatarUrl, size: WZ.SizeAvatar.xl)
                        Text(name ?? userId)
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                            .multilineTextAlignment(.center)
                        Text(userId)
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .textSelection(.enabled)
                        if let pronouns {
                            Text(pronouns)
                                .font(.wizard(WZ.FontSize.md))
                                .foregroundStyle(theme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                        if let statusText {
                            Text(statusText)
                                .font(StatusEmoji.isEmojiOnly(statusText) ? .system(size: 32) : .wizard(WZ.FontSize.md))
                                .foregroundStyle(theme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                        if isMember { RoleBadge(level: level) }
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }
                if let roomId, isMember, rights.canChange(targetLevel: level, isSelf: isMe) {
                    Section {
                        RoleMenu(roomId: roomId, userId: userId, currentLevel: level, rights: rights) {
                            Task { await load(); onChange?() }
                        }
                    }
                }
                if !mutualRooms.isEmpty {
                    Section {
                        NavigationLink {
                            MutualRoomsList(groups: mutualGroups) { room in
                                dismiss()
                                roomOpener.open(room.roomId, room.isSpace)
                            }
                            .navigationTitle(L10n.format("profile.mutualRooms", mutualRooms.count))
                        } label: {
                            Label(L10n.format("profile.mutualRooms", mutualRooms.count), image: "ph-users-three-regular")
                        }
                    }
                }
                if !isMe {
                    Section {
                        Button { Task { await message() } } label: {
                            Label(String(localized: "composer.messageInput"), image: "ph-chat-circle-regular")
                        }
                        .disabled(busy)
                    }
                }
                Section {
                    CopyButton(title: "profile.copyId", image: "ph-copy-regular", value: userId)
                    CopyButton(title: "common.copyLink", image: "ph-link-simple-regular", value: "https://matrix.to/#/\(userId)")
                }
                if !isMe {
                    Section {
                        if canKick {
                            Button(role: .destructive) { confirm = .kick } label: {
                                Label(String(localized: "profile.kick"), image: "ph-user-minus-regular").foregroundStyle(theme.danger)
                            }
                        }
                        if canBan {
                            Button(role: .destructive) { confirm = .ban } label: {
                                Label(String(localized: "room.members.ban"), image: "ph-prohibit-regular").foregroundStyle(theme.danger)
                            }
                        }
                        Button(role: .destructive) { confirm = .ignore } label: {
                            Label(String(localized: "profile.ignoreUser"), image: "ph-eye-slash-regular").foregroundStyle(theme.danger)
                        }
                    } footer: {
                        Text(String(localized: "room.members.ignoreHint"))
                    }
                    .tint(theme.danger)
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .alert(alertTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }),
                   presenting: confirm) { action in
                if action != .ignore { TextField(String(localized: "common.reasonOptional"), text: $reason) }
                Button(actionTitle(action), role: .destructive) { Task { await perform(action) } }
                Button(String(localized: "common.cancel"), role: .cancel) {}
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
    }

    private var alertTitle: String {
        let who = name ?? userId
        switch confirm {
        case .kick: return L10n.format("room.members.removeConfirm", "\(who)")
        case .ban: return L10n.format("room.members.banConfirm", "\(who)")
        case .ignore: return L10n.format("room.members.ignoreConfirm", "\(who)")
        case nil: return ""
        }
    }

    private func actionTitle(_ action: Action) -> LocalizedStringKey {
        switch action {
        case .kick: return "common.remove"
        case .ban: return "room.members.ban"
        case .ignore: return "profile.ignoreUser"
        }
    }

    private func load() async {
        if let roomId, let client = session.client,
           let member = (try? await client.members(roomId: roomId))?.first(where: { $0.userId == userId }) {
            name = member.displayName
            avatarUrl = member.avatarUrl
            level = member.level
            isMember = true
            rights = await RoleRights.load(client: client, roomId: roomId)
            if !isMe, let permissions = (try? await client.roomDetails(roomId: roomId))?.permissions {
                canKick = permissions.kick && level < rights.ownLevel
                canBan = permissions.ban && level < rights.ownLevel
            }
        }
        pronouns = await session.pronouns(of: userId)
        if !isMe, let rooms = try? await session.client?.mutualRooms(userId: userId) {
            mutualRooms = rooms
        }
        if let profile = await session.profile(of: userId) {
            name = name ?? profile.displayName
            avatarUrl = avatarUrl ?? profile.avatarUrl
            let expired = profile.customStatus?.expiresAt.map { Double($0) / 1000 < Date.now.timeIntervalSince1970 } ?? false
            statusText = expired ? nil : profile.customStatus?.text
        }
    }

    private func message() async {
        busy = true
        defer { busy = false }
        do {
            let roomId = try await session.startDirectMessage(with: userId)
            dismiss()
            openRoom(roomId, notifier: notifier)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func perform(_ action: Action) async {
        let reason = reason.isEmpty ? nil : reason
        self.reason = ""
        do {
            switch action {
            case .kick: if let roomId { try await session.requireClient.kick(roomId: roomId, userId: userId, reason: reason) }
            case .ban: if let roomId { try await session.requireClient.ban(roomId: roomId, userId: userId, reason: reason) }
            case .ignore: try await session.ignore(userId)
            }
            onChange?()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct MutualRoomsList: View {
    let groups: [(title: String, rooms: [MutualRoom])]
    let open: (MutualRoom) -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        ThemedList {
            ForEach(groups, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.rooms, id: \.roomId) { room in
                        Button { open(room) } label: {
                            HStack(spacing: WZ.Space.space4) {
                                AvatarView(name: room.name ?? room.roomId, url: room.avatarUrl, size: WZ.SizeAvatar.sm)
                                Text(room.name ?? room.roomId)
                                    .font(.wizard(WZ.FontSize.lg))
                                    .foregroundStyle(theme.textPrimary)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
            }
        }
    }
}

struct UserPickerView: View {
    enum Mode {
        case invite(String)
        case directMessage
        case select(title: String, exclude: [String], onSelect: ([UserResult]) -> Void)
    }

    let mode: Mode
    var onDone: (() -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var query = ""
    @State private var results: [UserResult] = []
    @State private var selected: [UserResult] = []
    @State private var searching = false
    @State private var busy = false
    @State private var error: String?

    private var isInvite: Bool {
        switch mode {
        case .invite, .select: true
        case .directMessage: false
        }
    }

    private var excluded: Set<String> {
        if case .select(_, let exclude, _) = mode { return Set(exclude) }
        return []
    }

    private var title: String {
        switch mode {
        case .invite: String(localized: "room.members.invite")
        case .directMessage: String(localized: "common.newDm")
        case .select(let title, _, _): title
        }
    }

    private var typedId: UserResult? {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("@"), trimmed.contains(":"), !results.contains(where: { $0.userId == trimmed })
        else { return nil }
        return UserResult(userId: trimmed, displayName: nil, avatarUrl: nil)
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                if !selected.isEmpty {
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: WZ.Space.space4) {
                                ForEach(selected, id: \.userId) { user in
                                    Button { toggle(user) } label: {
                                        HStack(spacing: WZ.Space.space3) {
                                            AvatarView(name: user.displayName ?? user.userId, url: user.avatarUrl, size: WZ.SizeAvatar.xs)
                                            Text(user.displayName ?? user.userId).font(.wizard(WZ.FontSize.md, .medium))
                                            Image("ph-x-regular").font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                                        }
                                        .foregroundStyle(theme.textPrimary)
                                        .padding(.leading, WZ.Space.space2).padding(.trailing, WZ.Space.space4).padding(.vertical, WZ.Space.space2)
                                        .background(theme.fill, in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                Section {
                    ForEach((([typedId].compactMap { $0 }) + results).filter { !excluded.contains($0.userId) }, id: \.userId) { user in
                        Button { pick(user) } label: {
                            HStack(spacing: WZ.Space.space5) {
                                AvatarView(name: user.displayName ?? user.userId, url: user.avatarUrl, size: WZ.SizeAvatar.md)
                                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                                    Text(user.displayName ?? user.userId)
                                        .font(.wizard(WZ.FontSize.lg, .medium)).foregroundStyle(theme.textPrimary)
                                    if user.displayName != nil {
                                        Text(user.userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                                    }
                                }
                                .lineLimit(1)
                                Spacer()
                                if isInvite {
                                    Image(selected.contains { $0.userId == user.userId }
                                          ? "ph-check-circle-fill" : "ph-circle-regular")
                                        .foregroundStyle(theme.accent)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(busy)
                    }
                } footer: {
                    if query.isEmpty {
                        Text(String(localized: "room.members.searchHint"))
                    } else if results.isEmpty && typedId == nil && !searching {
                        Text(String(localized: "room.members.noOneFound"))
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: String(localized: "room.members.searchPlaceholder"))
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                searching = true
                results = await session.searchUsers(query).filter { $0.userId != session.userId }
                searching = false
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
                if case .select(_, _, let onSelect) = mode {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.add")) {
                            onSelect(selected)
                            dismiss()
                        }
                        .disabled(selected.isEmpty)
                    }
                } else if isInvite {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.invite")) { Task { await invite() } }
                            .disabled(selected.isEmpty || busy)
                    }
                }
            }
            .tint(theme.control)
        }
    }

    private func toggle(_ user: UserResult) {
        if let index = selected.firstIndex(where: { $0.userId == user.userId }) {
            selected.remove(at: index)
        } else {
            selected.append(user)
        }
    }

    private func pick(_ user: UserResult) {
        if isInvite { toggle(user); return }
        Task {
            busy = true
            defer { busy = false }
            do {
                let roomId = try await session.startDirectMessage(with: user.userId)
                dismiss()
                openRoom(roomId, notifier: notifier)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func invite() async {
        guard case .invite(let roomId) = mode, let client = session.client else { return }
        busy = true
        defer { busy = false }
        var failed: [String] = []
        for user in selected {
            do { try await client.invite(roomId: roomId, userId: user.userId) } catch { failed.append(user.userId) }
        }
        onDone?()
        if failed.isEmpty {
            dismiss()
        } else {
            error = L10n.format("invite.inviteFailed", failed.joined(separator: ", "))
            selected.removeAll { !failed.contains($0.userId) }
        }
    }
}
