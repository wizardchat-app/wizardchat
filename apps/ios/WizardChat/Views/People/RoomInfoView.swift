import WizardChatCore
import PhotosUI
import SwiftUI

struct RoomInfoView: View {
    let room: RoomSummary
    let client: WizardClient
    var onJump: ((String) -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var topic = ""
    @State private var avatarUrl: String?
    @State private var hasCustomAvatar = false
    @State private var confirmResetAvatar = false
    @State private var memberCount = 0
    @State private var encrypted = false
    @State private var isFavourite = false
    @State private var alias: String?
    @State private var canEditName = false
    @State private var canEditTopic = false
    @State private var canEditAvatar = false
    @State private var canInvite = false
    @State private var canPin = false
    @State private var canManageWidgets = false
    @State private var canEnableEncryption = false
    @State private var isPublic = false
    @State private var confirmEncryption = false
    @State private var bridges: [RoomBridge] = []
    @State private var pinnedCount = 0
    @State private var showInvite = false
    @State private var confirmLeave = false
    @State private var photo: PhotosPickerItem?
    @State private var saving = false
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    VStack(spacing: WZ.Space.space4) {
                        avatar
                        if room.isDirect && canEditAvatar && hasCustomAvatar {
                            Button(String(localized: "room.settings.general.resetAvatar")) { confirmResetAvatar = true }
                                .font(.wizard(WZ.FontSize.sm, .semibold))
                                .buttonStyle(.plain)
                                .foregroundStyle(theme.control)
                                .disabled(saving)
                        }
                        Text(name.isEmpty ? room.displayName : name)
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                            .multilineTextAlignment(.center)
                        if let alias { Text(alias).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textMuted) }
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                if canEditName || canEditTopic {
                    Section(String(localized: "settings.about.title")) {
                        if canEditName {
                            labeledField(String(localized: "common.name")) {
                                TextField(String(localized: "common.name"), text: $name)
                            }
                        }
                        if canEditTopic {
                            labeledField(String(localized: "room.topic")) {
                                TextField(String(localized: "room.topicPlaceholder"), text: $topic, axis: .vertical).lineLimit(1...4)
                            }
                        }
                    }
                    if hasChanges {
                        Section {
                            Button { Task { await save() } } label: {
                                Text(String(localized: "common.save"))
                                    .font(.wizard(WZ.FontSize.lg, .semibold))
                                    .foregroundStyle(theme.textOnAccent)
                                    .frame(maxWidth: .infinity, minHeight: WZ.Space.space11)
                                    .background(theme.accent, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .disabled(saving)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                        }
                    }
                } else if !topic.isEmpty {
                    Section(String(localized: "room.topic")) { Text(topic).foregroundStyle(theme.textPrimary) }
                }

                Section {
                    Toggle(isOn: Binding(get: { encrypted }, set: { if $0 { confirmEncryption = true } })) {
                        VStack(alignment: .leading, spacing: WZ.Space.space0) {
                            Text(String(localized: "room.settings.general.e2ee")).foregroundStyle(theme.textPrimary)
                            Text(encrypted ? String(localized: "room.settings.general.encryptionEnabledNote")
                                           : String(localized: "room.settings.general.encryptionNote"))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                    .tint(theme.accent)
                    .disabled(encrypted || !canEnableEncryption || saving)
                }

                Section {
                    NavigationLink {
                        MembersView(roomId: room.id)
                    } label: {
                        LabeledContent { Text("\(memberCount)") } label: { Label(String(localized: "common.members"), image: "ph-users-regular") }
                    }
                    if let onJump {
                        NavigationLink {
                            RoomSearchView(room: room, client: client, onJump: onJump)
                        } label: {
                            Label(String(localized: "search.title"), image: "ph-magnifying-glass-regular")
                        }
                    }
                    NavigationLink {
                        RoomMediaView(room: room, client: client)
                    } label: {
                        Label(String(localized: "timeline.mediaLinksAndDocs"), image: "ph-images-regular")
                    }
                    NavigationLink {
                        PinnedMessagesView(room: room, client: client, canPin: canPin)
                    } label: {
                        LabeledContent { Text("\(pinnedCount)") } label: { Label(String(localized: "room.header.pinnedMessages"), image: "ph-push-pin-regular") }
                    }
                    if let onJump {
                        NavigationLink {
                            JumpToDateView(room: room, client: client, onJump: onJump)
                        } label: {
                            Label(String(localized: "room.header.jumpToDate"), image: "ph-clock-counter-clockwise-regular")
                        }
                    }
                    if !room.isDirect {
                        NavigationLink {
                            RolesPermissionsView(roomId: room.id)
                        } label: {
                            Label(String(localized: "room.settings.permissions.title"), image: "ph-shield-check-regular")
                        }
                        NavigationLink {
                            RoomPacksView(roomId: room.id)
                        } label: {
                            Label(String(localized: "room.settings.emojis.title"), image: "ph-smiley-regular")
                        }
                        NavigationLink {
                            RoomWidgetsView(roomId: room.id, client: client, canManage: canManageWidgets)
                        } label: {
                            Label(String(localized: "room.settings.widgets.title"), image: "ph-puzzle-piece-regular")
                        }
                        if !bridges.isEmpty {
                            NavigationLink {
                                RoomBridgesView(roomId: room.id, bridges: bridges)
                            } label: {
                                LabeledContent { Text("\(bridges.count)") } label: {
                                    Label(String(localized: "room.settings.bridges.title"), image: "ph-plugs-connected-regular")
                                }
                            }
                        }
                    }
                    if canInvite {
                        Button { showInvite = true } label: { Label(String(localized: "room.members.invite"), image: "ph-user-plus-regular") }
                    }
                    CopyButton(title: "room.info.copyLink", image: "ph-link-simple-regular",
                               value: "https://matrix.to/#/\(alias ?? room.id)")
                    Toggle(isOn: Binding(get: { isFavourite }, set: { value in
                        isFavourite = value
                        Task { try? await client.setFavourite(roomId: room.id, favourite: value) }
                    })) {
                        Label(String(localized: "room.favourite"), image: "ph-star-regular")
                    }
                }

                Section {
                    Button(role: .destructive) { confirmLeave = true } label: {
                        Label(room.isDirect ? String(localized: "room.info.leaveConversation") : String(localized: "room.leaveRoom"),
                              image: "ph-sign-out-regular")
                            .foregroundStyle(theme.danger)
                    }
                }

                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(room.isDirect ? String(localized: "room.info.conversation") : String(localized: "room.info.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .confirmationDialog(L10n.format("room.info.leaveConfirm", "\(room.displayName)"), isPresented: $confirmLeave, titleVisibility: .visible) {
                Button(String(localized: "common.leave"), role: .destructive) {
                    Task {
                        try? await client.leave(roomId: room.id)
                        dismiss()
                    }
                }
            }
            .alert(String(localized: "room.settings.general.e2ee"), isPresented: $confirmEncryption) {
                Button(String(localized: "common.cancel"), role: .cancel) {}
                Button(String(localized: "common.confirm"), role: .destructive) {
                    Task { await enableEncryption() }
                }
            } message: {
                Text(isPublic
                     ? String(localized: "room.settings.general.encryptionPublicRoomWarning") + "\n\n" + String(localized: "room.settings.general.encryptionConfirm")
                     : String(localized: "room.settings.general.encryptionConfirm"))
            }
            .confirmationDialog(L10n.format("room.dm.resetAvatarConfirm", room.dmUserName ?? room.displayName),
                                isPresented: $confirmResetAvatar, titleVisibility: .visible) {
                Button(String(localized: "room.settings.general.resetAvatar"), role: .destructive) {
                    Task { await resetAvatar() }
                }
            }
            .sheet(isPresented: $showInvite) {
                UserPickerView(mode: .invite(room.id)) { Task { await load() } }
            }
            .onChange(of: photo) { _, item in
                guard let item else { return }
                Task { await setAvatar(item) }
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var avatar: some View {
        let picture = AvatarView(name: room.displayName, url: avatarUrl, size: WZ.SizeAvatar.xl)
        if canEditAvatar {
            PhotosPicker(selection: $photo, matching: .images) {
                picture.overlay(alignment: .bottomTrailing) {
                    Image(saving ? "ph-hourglass-regular" : "ph-camera-regular")
                        .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                        .foregroundStyle(theme.accent)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                        .background(theme.bgTertiary, in: Circle())
                        .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.BorderWidth.thick))
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "room.info.changePicture"))
        } else {
            picture
        }
    }

    @State private var originalName = ""
    @State private var originalTopic = ""
    private var hasChanges: Bool { name != originalName || topic != originalTopic }

    private func load() async {
        let info = try? await client.roomDetails(roomId: room.id)
        if !loaded {
            name = info?.name ?? room.name ?? ""
            topic = info?.topic ?? ""
            originalName = name
            originalTopic = topic
            loaded = true
        }
        hasCustomAvatar = info?.avatarUrl != nil
        if let custom = info?.avatarUrl {
            avatarUrl = custom
        } else if room.isDirect, let partner = room.dmUserId {
            avatarUrl = await session.memberProfile(partner, in: room.id).avatarUrl ?? room.dmUserAvatar
        } else {
            avatarUrl = info == nil ? room.avatarUrl : nil
        }
        alias = info?.canonicalAlias
        pinnedCount = info?.pinnedEventIds.count ?? 0
        isFavourite = info?.isFavourite ?? room.isFavourite
        memberCount = info?.memberCount ?? room.memberCount
        encrypted = info?.isEncrypted ?? room.isEncrypted
        if let permissions = info?.permissions {
            canEditName = permissions.changeName
            canEditTopic = permissions.changeTopic
            canEditAvatar = permissions.changeAvatar
            canInvite = permissions.invite
            canPin = permissions.pin
            canManageWidgets = permissions.manageWidgets
            canEnableEncryption = permissions.enableEncryption
        }
        isPublic = info?.isPublic ?? false
        bridges = await RoomBridge.load(client: client, roomId: room.id)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            if name != originalName { try await client.setRoomName(roomId: room.id, name: name) }
            if topic != originalTopic { try await client.setRoomTopic(roomId: room.id, topic: topic) }
            originalName = name
            originalTopic = topic
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setAvatar(_ item: PhotosPickerItem) async {
        saving = true
        defer { saving = false; photo = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = image.preparingThumbnail(of: CGSize(width: WZ.SizeDialog.md, height: WZ.SizeDialog.md * image.size.height / max(image.size.width, 1)))?
                .jpegData(compressionQuality: 0.85) else { return }
        do {
            try await client.setRoomAvatar(roomId: room.id, data: jpeg, mimetype: "image/jpeg")
            try? await Task.sleep(for: .milliseconds(500))
            avatarUrl = (try? await client.roomDetails(roomId: room.id))?.avatarUrl
            hasCustomAvatar = avatarUrl != nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func enableEncryption() async {
        saving = true
        defer { saving = false }
        do {
            try await client.enableEncryption(roomId: room.id)
            encrypted = true
        } catch {
            self.error = L10n.format("room.settings.general.encryptionEnableFailed", error.localizedDescription)
        }
    }

    private func labeledField<Field: View>(_ label: String, @ViewBuilder field: () -> Field) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(label).font(.wizard(WZ.FontSize.sm, .medium)).foregroundStyle(theme.textMuted)
            field().foregroundStyle(theme.textPrimary)
        }
        .padding(.vertical, WZ.Space.space1)
    }

    private func resetAvatar() async {
        saving = true
        defer { saving = false }
        do {
            try await client.removeRoomAvatar(roomId: room.id)
            hasCustomAvatar = false
            if let partner = room.dmUserId {
                avatarUrl = await session.memberProfile(partner, in: room.id).avatarUrl ?? room.dmUserAvatar
            } else {
                avatarUrl = nil
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CreateRoomView: View {
    var spaceId: String?
    /// Set to create a space instead of a room; gets the new space
    var onSpaceCreated: ((String) -> Void)?
    /// Replaces Cancel with Back
    var onBack: (() -> Void)?

    enum Access: Hashable { case spaceMembers, invite, `public` }

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var notifier: MessageNotifier
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name = ""
    @State private var topic = ""
    @State private var isVoice = false
    @State private var access: Access
    @State private var encrypted = true
    @State private var federate = true
    @State private var alias = ""
    @State private var foundersVersion: String?
    @State private var founders: [UserResult] = []
    @State private var pickingFounders = false
    @State private var busy = false
    @State private var error: String?

    init(spaceId: String? = nil, onSpaceCreated: ((String) -> Void)? = nil, onBack: (() -> Void)? = nil) {
        self.spaceId = spaceId
        self.onSpaceCreated = onSpaceCreated
        self.onBack = onBack
        _access = State(initialValue: spaceId == nil ? .invite : .spaceMembers)
    }

    private var isSpace: Bool { onSpaceCreated != nil }
    private var accessOptions: [Access] { spaceId == nil ? [.invite, .public] : [.spaceMembers, .invite, .public] }

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    TextField(String(localized: "common.name"), text: $name)
                    TextField(String(localized: "room.create.topicOptional"), text: $topic, axis: .vertical).lineLimit(1...3)
                }
                if !isSpace {
                Section {
                    optionRow(String(localized: "room.create.typeChat"), note: String(localized: "room.create.typeChatNote"),
                              icon: "ph-hash-straight-regular", selected: !isVoice) { isVoice = false }
                    optionRow(String(localized: "room.create.typeVoice"), note: String(localized: "room.create.typeVoiceNote"),
                              icon: "ph-speaker-high-regular", selected: isVoice) { isVoice = true }
                } header: {
                    Text(String(localized: "room.create.type"))
                }
                }
                Section {
                    ForEach(accessOptions, id: \.self) { option in
                        optionRow(label(option), note: hint(option), icon: icon(option), selected: access == option) {
                            access = option
                            encrypted = option != .public
                        }
                    }
                } header: {
                    Text(String(localized: isSpace ? "space.create.access" : "room.create.access"))
                }
                if access == .public {
                    Section {
                        HStack(spacing: WZ.Space.space1) {
                            Text("#").foregroundStyle(theme.textMuted)
                            TextField("address", text: $alias)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Text(":\(server)").foregroundStyle(theme.textMuted).lineLimit(1)
                        }
                    } header: {
                        Text(String(localized: isSpace ? "space.create.roomAddress" : "room.create.roomAddress"))
                    }
                }
                Section {
                    if access != .public && !isSpace {
                        toggleRow(String(localized: "room.create.e2ee"), note: String(localized: "room.create.e2eeNote"), isOn: $encrypted)
                    }
                    toggleRow(String(localized: "room.create.federation"), note: String(localized: "room.create.federationNote"), isOn: $federate)
                }
                if foundersVersion != nil {
                    Section {
                        founderRow(name: session.displayName ?? session.userId ?? "", userId: session.userId ?? "",
                                   avatarUrl: session.avatarUrl, onRemove: nil)
                        ForEach(founders, id: \.userId) { founder in
                            founderRow(name: founder.displayName ?? founder.userId, userId: founder.userId,
                                       avatarUrl: founder.avatarUrl) {
                                founders.removeAll { $0.userId == founder.userId }
                            }
                        }
                        Button { pickingFounders = true } label: {
                            Label(String(localized: "common.add"), image: "ph-user-plus-regular")
                        }
                    } header: {
                        Text(String(localized: "room.create.founders"))
                    } footer: {
                        Text(String(localized: "room.create.foundersNote"))
                    }
                }
                if let error {
                    Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
                }
            }
            .tint(theme.control)
            .navigationTitle(isSpace ? String(localized: "space.create.title")
                             : spaceId == nil ? String(localized: "nav.newRoom") : String(localized: "space.newRoom"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if let onBack {
                        Button(String(localized: "common.back"), action: onBack)
                    } else {
                        Button(String(localized: "common.cancel")) { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button(String(localized: "common.create")) { Task { await create() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .task { foundersVersion = await session.foundersRoomVersion() }
            .sheet(isPresented: $pickingFounders) {
                UserPickerView(mode: .select(title: String(localized: "room.create.founders"),
                                             exclude: [session.userId ?? ""] + founders.map(\.userId)) { picked in
                    founders += picked.filter { new in !founders.contains { $0.userId == new.userId } }
                })
            }
        }
    }

    /// A choice with its explanation right under it, ticked when selected
    private func optionRow(_ title: String, note: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: WZ.Space.space5) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: WZ.SizeIcon.lg)
                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                    Text(title).foregroundStyle(theme.textPrimary)
                    Text(note).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
                Spacer(minLength: WZ.Space.space4)
                if selected {
                    Image("ph-check-bold")
                        .font(.system(size: WZ.SizeIcon.md))
                        .foregroundStyle(theme.accent)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func toggleRow(_ title: String, note: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(title).foregroundStyle(theme.textPrimary)
                Text(note).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
        }
        // The form's tint is the white control colour, meant for its buttons
        .tint(theme.accent)
    }

    private func founderRow(name: String, userId: String, avatarUrl: String?, onRemove: (() -> Void)?) -> some View {
        HStack(spacing: WZ.Space.space5) {
            AvatarView(name: name, url: avatarUrl, size: WZ.SizeAvatar.sm)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(name).foregroundStyle(theme.textPrimary)
                Text(userId).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer()
            if let onRemove {
                Button(action: onRemove) {
                    Image("ph-x-regular")
                        .font(.system(size: WZ.SizeIcon.sm))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Size.touchTarget, height: WZ.Size.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "common.remove"))
            }
        }
    }

    private func label(_ option: Access) -> String {
        switch option {
        case .spaceMembers: String(localized: "room.create.accessStandard")
        case .invite: String(localized: isSpace ? "space.create.accessInvite" : "room.create.accessInvite")
        case .public: String(localized: isSpace ? "space.create.public" : "room.create.accessPublic")
        }
    }

    private func icon(_ option: Access) -> String {
        switch option {
        case .spaceMembers: "ph-users-regular"
        case .invite: "ph-lock-regular"
        case .public: "ph-globe-simple-regular"
        }
    }

    private func hint(_ option: Access) -> String {
        switch option {
        case .spaceMembers: String(localized: "room.create.accessStandardNote")
        case .invite: String(localized: "room.create.accessInviteNote")
        case .public: String(localized: isSpace ? "space.create.accessPublicNote" : "room.create.accessPublicNote")
        }
    }

    private var server: String { String((session.userId ?? "").split(separator: ":", maxSplits: 1).last ?? "") }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let roomId = try await session.createRoom(
                name: name.trimmingCharacters(in: .whitespaces),
                topic: topic.isEmpty ? nil : topic,
                isPublic: access == .public, encrypted: encrypted, isVoice: isVoice,
                alias: alias.isEmpty ? nil : alias, spaceId: spaceId, federate: federate,
                spaceMembers: access == .spaceMembers, founders: founders.map(\.userId), roomVersion: foundersVersion,
                isSpace: isSpace)
            dismiss()
            if let onSpaceCreated { onSpaceCreated(roomId) } else { openRoom(roomId, notifier: notifier) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
