import SwiftUI
import UserNotifications
import WizardChatCore

struct NotificationSettingsPage: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    @State private var rules: NotificationRules?
    @State private var busy = false
    @State private var keyword = ""
    @State private var error: String?
    @State private var bannersDenied = false

    var body: some View {
        SettingsPage(title: "room.notifications.title") {
            SettingsSection(title: "settings.notifications.deviceLabel") {
                ToggleRow(label: "settings.notifications.notificationSounds", note: "settings.notifications.notificationSoundsNote",
                          isOn: $prefs.notificationSounds)
                SettingsDivider()
                ToggleRow(label: "settings.notifications.notificationBanners", note: "settings.notifications.bannerNote",
                          isOn: $prefs.notificationBanners)
            }
            if bannersDenied {
                StatusText(text: String(localized: "settings.notifications.systemDisabledIos"))
            }

            if let rules {
                SettingsSection(title: "room.settings.permissions.groups.messages", note: "settings.notifications.levelHint") {
                    levelRow("room.dm.directMessages", .directChats, rules.directChats)
                    SettingsDivider()
                    levelRow("settings.notifications.rooms", .groupChats, rules.groupChats)
                }
                SettingsSection(title: "settings.notifications.otherEventsLabel") {
                    if let level = rules.userMentions {
                        levelRow("settings.notifications.userMention", .userMentions, level)
                    } else {
                        unavailable
                    }
                    SettingsDivider()
                    if let level = rules.roomMentions {
                        levelRow("settings.notifications.roomMention", .roomMentions, level)
                    } else {
                        unavailable
                    }
                }
                SettingsSection(title: "settings.notifications.keywordsLabel",
                                note: "settings.notifications.keywordsNote") {
                    VStack(alignment: .leading, spacing: WZ.Space.space4) {
                        HStack(spacing: WZ.Space.space4) {
                            TextField("", text: $keyword, prompt: Text(String(localized: "settings.notifications.keywordPlaceholder")).foregroundColor(theme.textMuted))
                                .textInputAutocapitalization(.never)
                                .wizardField()
                                .onSubmit { Task { await addKeyword() } }
                            Button(String(localized: "common.add")) { Task { await addKeyword() } }
                                .buttonStyle(PrimaryButtonStyle())
                                .frame(width: WZ.SizeAvatar.xl)
                                .disabled(busy || keyword.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        if rules.keywords.isEmpty {
                            Text(String(localized: "settings.notifications.noKeywords"))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        FlowChips(items: rules.keywords) { word in
                            Task { await run { try await session.requireClient.removeNotificationKeyword(keyword: word) } }
                        }
                    }
                }
            } else {
                ProgressView().tint(theme.accent).frame(maxWidth: .infinity).padding()
            }
            if let error { StatusText(text: error) }
        }
        .task { await reload() }
        .onChange(of: prefs.notificationBanners) { _, on in
            guard on else { return }
            Task { await requestAuthorization() }
        }
        .onChange(of: prefs.notificationSounds) { _, on in
            guard on else { return }
            Task { await requestAuthorization() }
        }
    }

    private var unavailable: some View {
        Text(String(localized: "settings.notifications.ruleUnavailable"))
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
    }

    private func levelRow(_ label: LocalizedStringKey, _ group: NotificationGroup, _ level: NotificationLevel) -> some View {
        PickerRow(
            label: label,
            selection: Binding(
                get: { level },
                set: { level in setLevel(level, group) }
            ),
            options: NotificationLevel.allCases.map { ($0, LocalizedStringKey("settings.notifications.level." + $0.rawValue)) }
        )
        .disabled(busy)
    }

    private func setLevel(_ level: NotificationLevel, _ group: NotificationGroup) {
        Task {
            await run { try await session.requireClient.setNotificationLevel(group: group, level: level) }
        }
    }

    private func addKeyword() async {
        let word = keyword.trimmingCharacters(in: .whitespaces)
        guard !word.isEmpty else { return }
        if rules?.keywords.contains(word) == true {
            error = String(localized: "settings.notifications.keywordExists")
            return
        }
        keyword = ""
        await run { try await session.requireClient.addNotificationKeyword(keyword: word) }
    }

    private func reload() async {
        do {
            rules = try await session.requireClient.notificationRules()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func run(_ work: () async throws -> Void) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await work()
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        bannersDenied = !granted
    }
}

private struct FlowChips: View {
    let items: [String]
    let onRemove: (String) -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        WrapLayout(spacing: WZ.Space.space3) {
            ForEach(items, id: \.self) { item in
                HStack(spacing: WZ.Space.space2) {
                    Text(item).font(.wizard(WZ.FontSize.sm, .medium))
                    Button {
                        onRemove(item)
                    } label: {
                        Image("ph-x-regular").font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                    }
                    .accessibilityLabel(String(localized: "common.remove"))
                }
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, WZ.Space.space4)
                .frame(height: WZ.Space.space8)
                .background(theme.bgTertiary, in: Capsule())
            }
        }
    }
}

struct WrapLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0; y += rowHeight + spacing; rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxX, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX; y += rowHeight + spacing; rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
