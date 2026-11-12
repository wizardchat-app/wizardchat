import SwiftUI

struct SettingsView: View {
    var isTab = false
    /// Changes when the You tab is tapped again, to go back to the list
    var popToRoot = 0
    @State private var path: [Page] = []
    @State private var search = ""
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    enum Page: Hashable, CaseIterable {
        case account, privacy, emojis, soundboard, notifications, voiceVideo, appearance, accessibility, language, sessions, encryption, developer, about

        var title: LocalizedStringKey { LocalizedStringKey(titleKey) }
        var name: String { NSLocalizedString(titleKey, comment: "") }

        var titleKey: String {
            switch self {
            case .account: return "settings.account.title"
            case .privacy: return "settings.privacy.title"
            case .emojis: return "room.settings.emojis.title"
            case .soundboard: return "settings.soundboard.title"
            case .notifications: return "settings.notifications.title"
            case .voiceVideo: return "settings.voiceVideo.title"
            case .appearance: return "settings.appearance.title"
            case .accessibility: return "settings.accessibility.title"
            case .language: return "settings.language.title"
            case .sessions: return "settings.sessions.title"
            case .encryption: return "settings.encryption.title"
            case .developer: return "developer.title"
            case .about: return "settings.about.title"
            }
        }

        var icon: String {
            switch self {
            case .account: return "ph-user-regular"
            case .privacy: return "ph-shield-regular"
            case .emojis: return "ph-smiley-sticker-regular"
            case .soundboard: return "ph-vinyl-record-regular"
            case .notifications: return "ph-bell-regular"
            case .voiceVideo: return "ph-microphone-regular"
            case .appearance: return "ph-palette-regular"
            case .accessibility: return "ph-person-simple-circle-regular"
            case .language: return "ph-globe-simple-regular"
            case .sessions: return "ph-devices-regular"
            case .encryption: return "ph-lock-key-regular"
            case .developer: return "ph-wrench-regular"
            case .about: return "ph-info-regular"
            }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !search.trimmingCharacters(in: .whitespaces).isEmpty {
                    let matches = Page.allCases.filter { $0.name.localizedCaseInsensitiveContains(search.trimmingCharacters(in: .whitespaces)) }
                    Section {
                        if matches.isEmpty {
                            Text(String(localized: "nav.noMatches")).foregroundStyle(theme.textMuted)
                        }
                        ForEach(matches) { pageRow($0) }
                    }
                    .listRowBackground(theme.groupedRow)
                } else {
                Section {
                    NavigationLink(value: Page.account) {
                        HStack(spacing: WZ.Space.space5) {
                            let name = session.displayName ?? session.userId ?? ""
                            AvatarView(name: name, url: session.avatarUrl, size: WZ.SizeAvatar.lg)
                            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                Text(name)
                                    .font(.wizard(WZ.FontSize.xxl, .semibold))
                                    .foregroundStyle(theme.textPrimary)
                                if let status = session.customStatus?.text {
                                    Text(status)
                                        .font(.wizard(WZ.FontSize.sm))
                                        .foregroundStyle(theme.textSecondary)
                                }
                            }
                            .lineLimit(1)
                        }
                        .padding(.vertical, WZ.Space.space2)
                    }
                    AccountSwitcher(onLogout: { if !isTab { dismiss() } })
                }
                .listRowBackground(theme.groupedRow)

                Section {
                    ForEach([Page.privacy, .notifications, .emojis, .soundboard]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.voiceVideo, .appearance, .accessibility, .language]) { pageRow($0) }
                }
                Section {
                    ForEach([Page.sessions, .encryption, .developer, .about]) { pageRow($0) }
                }
                }

            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .listRowBackground(theme.groupedRow)
            .background(theme.groupedBackground.ignoresSafeArea())
            .modifier(SettingsTitle(isTab: isTab))
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic),
                        prompt: Text(String(localized: "settings.search")))
            .toolbar {
                if !isTab {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.done")) { dismiss() }
                            .fontWeight(.semibold)
                    }
                }
            }
            .navigationDestination(for: Page.self) { page in
                switch page {
                case .account: AccountSettings()
                case .privacy: PrivacySettings()
                case .emojis: EmojisSettings()
                case .soundboard: SoundboardSettings()
                case .notifications: NotificationSettingsPage()
                case .voiceVideo: VoiceVideoSettings()
                case .appearance: AppearanceSettings()
                case .accessibility: AccessibilitySettings()
                case .language: LanguageSettings()
                case .sessions: SessionsSettings()
                case .encryption: EncryptionSettings()
                case .developer: DeveloperSettings()
                case .about: AboutSettings()
                }
            }
            .tint(theme.control)
        }
        .onChange(of: popToRoot) { _, _ in path = [] }
    }

    private func pageRow(_ page: Page) -> some View {
        NavigationLink(value: page) {
            Label {
                Text(page.title)
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
            } icon: {
                Image(page.icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .listRowBackground(theme.groupedRow)
    }
}

private struct AccountSwitcher: View {
    let onLogout: () -> Void
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var avatars: [String: UIImage] = [:]

    var body: some View {
        Menu {
            Section {
                ForEach(session.accounts) { account in
                    Button {
                        Task { await session.switchAccount(to: account.userId) }
                    } label: {
                        Text(account.displayName ?? account.userId)
                        Text(account.userId)
                        if let avatar = avatars[account.userId] { Image(uiImage: avatar) }
                    }
                }
            }
            Button { session.isAddingAccount = true } label: {
                Label(menu: String(localized: "settings.accounts.add"), icon: "ph-plus-regular")
            }
            Divider()
            Button(role: .destructive) {
                onLogout()
                Task { await session.logout() }
            } label: {
                Label(menu: L10n.format("settings.accounts.logoutOf", session.displayName ?? session.userId ?? ""), icon: "ph-sign-out-regular", destructive: true)
            }
        } label: {
            HStack(spacing: WZ.Space.space5) {
                Image("ph-user-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                Text(String(localized: "settings.accounts.switch"))
                    .font(.wizard(WZ.FontSize.lg))
                    .foregroundStyle(theme.textPrimary)
                Spacer()
                Image("ph-caret-up-down-regular")
                    .font(.system(size: WZ.SizeIcon.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .contentShape(Rectangle())
        }
        .listRowBackground(theme.groupedRow)
        .task { await session.refreshAccountProfiles() }
        .task(id: "\(session.userId ?? "")|\(session.accounts.map { "\($0.userId)\($0.avatarUrl ?? "")" })") { await loadAvatars() }
    }

    private func loadAvatars() async {
        var first: [String: UIImage] = [:]
        for account in session.accounts {
            if let image = await AvatarImage.circular(nil, name: account.displayName ?? account.userId, media: nil,
                                                      theme: theme, side: WZ.SizeAvatar.sm,
                                                      fallback: SessionStore.savedAvatar(account.userId)) {
                first[account.userId] = mark(image, for: account.userId)
            }
        }
        avatars = first
        // Another account's server isn't always reachable from this one, so its saved copy stays
        // unless a fresh picture arrives
        await withTaskGroup(of: Void.self) { group in
            for account in session.accounts {
                guard let url = account.avatarUrl else { continue }
                group.addTask { @MainActor in
                    guard let picture = await session.media?.thumbnail(url), !Task.isCancelled else { return }
                    if account.userId == session.userId { SessionStore.saveAvatar(picture, for: account.userId) }
                    avatars[account.userId] = mark(AvatarImage.circle(picture, side: WZ.SizeAvatar.sm), for: account.userId)
                }
            }
        }
    }

    private func mark(_ image: UIImage, for userId: String) -> UIImage {
        userId == session.userId ? checked(image) : image
    }

    private func checked(_ avatar: UIImage) -> UIImage {
        let side = avatar.size.width
        let badge = side * 0.5
        let rect = CGRect(x: side - badge, y: side - badge, width: badge, height: badge)
        return UIGraphicsImageRenderer(size: avatar.size).image { _ in
            avatar.draw(at: .zero)
            UIColor(theme.accent).setFill()
            UIBezierPath(ovalIn: rect).fill()
            let config = UIImage.SymbolConfiguration(pointSize: badge * 0.55, weight: .bold)
            if let mark = UIImage(systemName: "checkmark", withConfiguration: config)?
                .withTintColor(UIColor(theme.textOnAccent), renderingMode: .alwaysOriginal) {
                mark.draw(at: CGPoint(x: rect.midX - mark.size.width / 2, y: rect.midY - mark.size.height / 2))
            }
        }.withRenderingMode(.alwaysOriginal)
    }
}

struct AddAccountSheet: View {
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        NavigationStack {
            LoginView()
                .navigationTitle(String(localized: "auth.addAccountTitle"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "common.cancel")) { session.isAddingAccount = false }
                    }
                }
        }
    }
}

extension SettingsView.Page: Identifiable {
    var id: Self { self }
}

struct SettingsPage<Content: View>: View {
    let title: LocalizedStringKey
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        Form {
            content()
                .listRowBackground(theme.groupedRow)
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(theme.groupedBackground.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .font(.wizard(WZ.FontSize.lg))
        .foregroundStyle(theme.textPrimary)
    }
}

struct SettingsSection<Content: View>: View {
    var title: LocalizedStringKey?
    var note: LocalizedStringKey?
    @ViewBuilder let content: () -> Content
    @Environment(\.theme) private var theme

    var body: some View {
        Section {
            content()
        } header: {
            if let title {
                Text(title).foregroundStyle(theme.textMuted)
            }
        } footer: {
            if let note {
                Text(note).foregroundStyle(theme.textMuted)
            }
        }
        .listRowBackground(theme.groupedRow)
    }
}

struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        SettingsSection(content: content)
    }
}

extension View {
    func settingsCard() -> some View { self }
}

struct SettingsDivider: View {
    var body: some View { EmptyView() }
}

struct SettingRow<Control: View>: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @ViewBuilder let control: () -> Control
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space5) {
            RowLabel(label: label, note: note)
            Spacer(minLength: 8)
            control()
        }
    }
}

private struct RowLabel: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space1) {
            Text(label)
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
            if let note {
                Text(note)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ToggleRow: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Binding var isOn: Bool
    var disabled = false
    @Environment(\.theme) private var theme

    var body: some View {
        Toggle(isOn: $isOn) {
            RowLabel(label: label, note: note)
        }
        .tint(theme.accent)
        .disabled(disabled)
    }
}

struct CheckRow: View {
    let label: LocalizedStringKey
    @Binding var isOn: Bool
    @Environment(\.theme) private var theme

    var body: some View {
        Button { isOn.toggle() } label: {
            HStack {
                RowLabel(label: label)
                Spacer(minLength: WZ.Space.space5)
                Image("ph-check-bold")
                    .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                    .foregroundStyle(theme.accent)
                    .opacity(isOn ? 1 : 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}

struct PickerRow<Value: Hashable>: View {
    let label: LocalizedStringKey
    var note: LocalizedStringKey?
    @Binding var selection: Value
    let options: [(Value, LocalizedStringKey)]
    @Environment(\.theme) private var theme

    var body: some View {
        Picker(selection: $selection) {
            ForEach(options.indices, id: \.self) { index in
                Text(options[index].1).tag(options[index].0)
            }
        } label: {
            RowLabel(label: label, note: note)
        }
        .pickerStyle(.menu)
        .tint(theme.textMuted)
    }
}

struct CopyRow: View {
    let label: LocalizedStringKey
    let value: String
    var secret = false
    @Environment(\.theme) private var theme
    @State private var revealed = false
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(label)
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
            HStack(spacing: WZ.Space.space5) {
                Text(secret && !revealed ? String(repeating: "•", count: 24) : value)
                    .font(.system(size: WZ.SizeIcon.sm, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(secret && revealed ? nil : 1)
                    .truncationMode(.middle)
                Spacer(minLength: 4)
                if secret {
                    Button {
                        revealed.toggle()
                    } label: {
                        Image(revealed ? "ph-eye-slash-regular" : "ph-eye-regular")
                    }
                    .accessibilityLabel(revealed ? String(localized: "common.hide") : String(localized: "common.show"))
                }
                Button {
                    UIPasteboard.general.string = value
                    copied = true
                } label: {
                    Image(copied ? "ph-check-bold" : "ph-copy-regular")
                }
                .accessibilityLabel(String(localized: "common.copy"))
            }
            .font(.system(size: WZ.SizeIcon.sm))
            .foregroundStyle(theme.control)
            .buttonStyle(.borderless)
        }
        .padding(.vertical, WZ.Space.space1)
    }
}

struct StatusText: View {
    let text: String
    var isError = true
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(isError ? theme.error : theme.success)
            .listRowBackground(Color.clear)
    }
}

private struct SettingsTitle: ViewModifier {
    let isTab: Bool

    func body(content: Content) -> some View {
        if isTab {
            content.tabTitle(String(localized: "common.settings"))
        } else {
            content.navigationTitle(String(localized: "common.settings"))
        }
    }
}
