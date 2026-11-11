import SwiftUI
import UIKit

struct AppearanceSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var iconError: String?

    private var themeHasIcon: Bool { prefs.theme.appIcon != nil }

    private static func swatch(for setting: ThemeSetting) -> LinearGradient {
        let first: Color
        let second: Color
        switch setting {
        case .system:
            first = WizardTheme(setting.resolved(.light)).bgSecondary
            second = WizardTheme(setting.resolved(.dark)).bgSecondary
        case .fixed(let fixed):
            let theme = WizardTheme(fixed)
            first = theme.bgSecondary
            second = theme.accent
        }
        return LinearGradient(stops: [.init(color: first, location: 0.5), .init(color: second, location: 0.5)],
                              startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var body: some View {
        SettingsPage(title: "settings.appearance.title") {
            ChatPreview()
                .settingsCard()

            SettingsSection {
                // Ten themes don't fit beside the label, so it sits above them
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    Text(String(localized: "settings.appearance.theme"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textPrimary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: WZ.Space.space4) {
                            ForEach(ThemeSetting.allCases) { name in
                                Button {
                                    prefs.theme = name
                                } label: {
                                    Circle()
                                        .fill(Self.swatch(for: name))
                                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                        .overlay(Circle().stroke(prefs.theme == name ? theme.accent : theme.border,
                                                                 lineWidth: prefs.theme == name ? 2.5 : 1))
                                        .padding(WZ.Space.space1)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(name.label)
                                .accessibilityAddTraits(prefs.theme == name ? .isSelected : [])
                            }
                        }
                    }
                }
                .padding(.vertical, WZ.Space.space4)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.themedAppIcon",
                          isOn: Binding(get: { themeHasIcon && prefs.themedAppIcon },
                                        set: { prefs.themedAppIcon = $0 }),
                          disabled: !themeHasIcon)
            }
            if let iconError { StatusText(text: iconError) }

            SettingsSection(title: "settings.appearance.chat") {
                PickerRow(label: "settings.appearance.messageLayout", selection: $prefs.messageLayout,
                          options: [(.modern, "settings.appearance.modern"), (.classic, "settings.appearance.classic"),
                                    (.compact, "settings.appearance.compact")])
                SettingsDivider()
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    HStack {
                        Text(String(localized: "settings.appearance.textSize"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                        Spacer()
                        Text(L10n.format("settings.appearance.textSizePx", "\(Int(prefs.chatFontSize))"))
                            .font(.wizard(WZ.FontSize.sm, .medium))
                            .foregroundStyle(theme.textMuted)
                    }
                    Slider(
                        value: Binding(
                            get: { Double(AppPreferences.chatFontSizes.firstIndex(of: prefs.chatFontSize) ?? 2) },
                            set: { prefs.chatFontSize = AppPreferences.chatFontSizes[Int($0.rounded())] }
                        ),
                        in: 0...Double(AppPreferences.chatFontSizes.count - 1),
                        step: 1
                    )
                    .tint(theme.accent)
                    .onTapGesture(count: 2) { prefs.chatFontSize = AppPreferences.defaultChatFontSize }
                }
                .padding(.vertical, WZ.Space.space4)
                SettingsDivider()
                PickerRow(label: "settings.appearance.density", selection: $prefs.chatDensity,
                          options: [(.compact, "settings.appearance.densityCompact"), (.default, "settings.appearance.densityDefault"), (.spacious, "settings.appearance.densitySpacious")])
                SettingsDivider()
                ToggleRow(label: "settings.appearance.colorUsernames", isOn: $prefs.colorUsernames)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.groupImages", note: "settings.appearance.groupImagesNote",
                          isOn: $prefs.groupImages)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.largeEmoji", note: "settings.appearance.largeEmojiNote",
                          isOn: $prefs.largeEmoji)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.showJoinLeave", isOn: $prefs.showJoinLeave)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.showProfileChanges", isOn: $prefs.showProfileChanges)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.emoticonsToEmoji", note: "settings.appearance.emoticonsToEmojiNote",
                          isOn: $prefs.emoticonsToEmoji)
                SettingsDivider()
                ToggleRow(label: "settings.appearance.prettifyLinks",
                          note: "settings.appearance.prettifyLinksNote",
                          isOn: $prefs.prettifyLinks)
            }

            SettingsSection {
                PickerRow(label: "settings.appearance.uiDensity",
                          note: "settings.appearance.uiDensityNote",
                          selection: $prefs.uiDensity,
                          options: [(.compact, "settings.appearance.densityCompact"), (.default, "settings.appearance.densityDefault"), (.spacious, "settings.appearance.densitySpacious")])
                SettingsDivider()
                ToggleRow(label: "settings.appearance.showRoomAvatars", isOn: $prefs.showRoomAvatars)
            }
        }
    }
}

private struct ChatPreview: View {
    @EnvironmentObject private var session: MatrixSession

    private static let otherId = "@merlin:wizardchat.org"
    private static let otherName = "Merlin"

    var body: some View {
        let now = Date()
        let myId = session.userId ?? "@you:wizardchat.org"
        let myName = session.displayName ?? session.userId ?? "You"
        VStack(spacing: WZ.Space.space0) {
            MessageRow(entry: entry(
                id: "preview-1", text: "settings.appearance.previewOtherMessage",
                mention: MessageMention(label: Self.label(myName), userId: myId, isOwn: true),
                sender: Self.otherId, senderName: Self.otherName, avatarUrl: nil, isOwn: false,
                timestamp: now.addingTimeInterval(-120)))
            MessageRow(entry: entry(
                id: "preview-2", text: "settings.appearance.previewOwnMessage",
                mention: MessageMention(label: Self.label(Self.otherName), userId: Self.otherId, isOwn: false),
                sender: myId, senderName: myName, avatarUrl: session.avatarUrl, isOwn: true,
                timestamp: now.addingTimeInterval(-60)))
        }
        .padding(.vertical, WZ.Space.space4)
        .allowsHitTesting(false)
    }

    private static func label(_ name: String) -> String {
        name.hasPrefix("@") ? name : "@" + name
    }

    private func entry(id: String, text: String, mention: MessageMention, sender: String, senderName: String,
                       avatarUrl: String?, isOwn: Bool, timestamp: Date) -> ChatEntry {
        var entry = ChatEntry(
            id: id, kind: .message(body: L10n.format(text, mention.label), isEmote: false, isNotice: false),
            sender: sender, senderName: senderName, senderAvatarUrl: avatarUrl, isOwn: isOwn,
            timestamp: timestamp, isSending: false, isEdited: false)
        entry.mentions = [mention]
        return entry
    }
}

struct AccessibilitySettings: View {
    @EnvironmentObject private var prefs: AppPreferences

    var body: some View {
        SettingsPage(title: "settings.accessibility.title") {
            SettingsSection {
                PickerRow(label: "settings.accessibility.reducedMotion", note: "settings.accessibility.reducedMotionNote",
                          selection: $prefs.reducedMotion,
                          options: [(.system, "settings.accessibility.reducedMotionSystem"), (.on, "settings.accessibility.reducedMotionOn"), (.off, "settings.accessibility.reducedMotionOff")])
                SettingsDivider()
                ToggleRow(label: "settings.accessibility.autoplayGifs",
                          note: "settings.accessibility.autoplayGifsNote",
                          isOn: $prefs.autoplayGifs)
            }
        }
    }
}

struct PrivacySettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        SettingsPage(title: "settings.privacy.title") {
            SettingsSection(title: "settings.privacy.chat") {
                ToggleRow(label: "settings.privacy.typingIndicators",
                          note: "settings.privacy.typingIndicatorsNote",
                          isOn: $prefs.typingIndicators)
                SettingsDivider()
                ToggleRow(label: "settings.privacy.readReceipts",
                          note: "settings.privacy.readReceiptsNote",
                          isOn: $prefs.sendReadReceipts)
            }
            SettingsSection(title: "settings.privacy.media") {
                PickerRow(label: "settings.privacy.mediaVisibility", selection: $prefs.mediaVisibility,
                          options: [(.always, "settings.privacy.mediaVisibilityAlways"), (.private, "settings.privacy.mediaVisibilityPrivate"), (.never, "settings.privacy.mediaVisibilityNever")])
            }
            SettingsSection(title: "settings.privacy.other") {
                ToggleRow(label: "settings.privacy.presence",
                          note: "settings.privacy.presenceNote",
                          isOn: $prefs.showPresence)
            }
        }
        .onChange(of: prefs.showPresence) { _, visible in
            Task { await session.applyPresence(visible) }
        }
    }
}

struct LanguageSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @Environment(\.theme) private var theme
    @State private var changed = false

    var body: some View {
        SettingsPage(title: "settings.language.title") {
            SettingsSection {
                PickerRow(label: "settings.language.languageDisplay", selection: $prefs.language,
                          options: [("", "settings.language.languageSystem"), ("en", "settings.language.languageEn"), ("de", "settings.language.languageDe")])
            }
            if changed {
                StatusText(text: String(localized: "settings.language.restartHint"), isError: false)
            }
        }
        .onChange(of: prefs.language) { _, _ in changed = true }
    }
}

struct DeveloperSettings: View {
    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var tokenExpanded = false

    var body: some View {
        SettingsPage(title: "developer.title") {
            SettingsSection {
                ToggleRow(label: "developer.enable",
                          note: "developer.enableDescription",
                          isOn: $prefs.developerMode)
            }
            if prefs.developerMode {
                SettingsSection {
                    DisclosureGroup(isExpanded: $tokenExpanded) {
                        VStack(alignment: .leading, spacing: WZ.Space.space4) {
                            Label(String(localized: "developer.accessTokenWarning"),
                                  image: "ph-warning-regular")
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.warningColor)
                            CopyRow(label: "developer.accessToken", value: session.client?.session.accessToken ?? "", secret: true)
                        }
                        .padding(.top, WZ.Space.space4)
                    } label: {
                        Text(String(localized: "developer.accessToken"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                    }
                    SettingsDivider()
                    CopyRow(label: "developer.homeserverUrl", value: session.client?.session.homeserverUrl ?? "")
                    if let deviceId = session.deviceId {
                        SettingsDivider()
                        CopyRow(label: "settings.sessions.deviceId", value: deviceId)
                    }
                }
                SettingsSection {
                    NavigationLink {
                        AccountDataExplorer()
                    } label: {
                        Text(String(localized: "developer.accountData.title"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                    }
                }
            }
        }
    }
}

extension WizardTheme {
}

struct AboutSettings: View {
    @Environment(\.theme) private var theme
    @State private var showWhatsNew = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        return "v\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }

    var body: some View {
        SettingsPage(title: "settings.about.title") {
            VStack(spacing: WZ.Space.space4) {
                WizardLogo(size: WZ.Space.space12)
                Text(String(localized: "app.name"))
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(String(localized: "auth.tagline"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                Text(version)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WZ.Space.space4)
            .listRowSeparator(.hidden)

            Link(destination: URL(string: "https://gitlab.com/wizardchat/wizardchat")!) {
                Label(String(localized: "settings.about.viewSourceOnGitLab"), image: "ph-code-regular")
            }
            .buttonStyle(SecondaryButtonStyle())
            .listRowSeparator(.hidden)

            SettingsSection(title: "settings.about.credits") {
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    credit("matrix-rust-sdk", url: "https://github.com/matrix-org/matrix-rust-sdk",
                           text: String(localized: "settings.about.creditMatrix"))
                    credit("Roboto", url: "https://fonts.google.com/specimen/Roboto",
                           text: String(localized: "settings.about.creditRoboto"))
                }
            }

            HStack(spacing: WZ.Space.space7) {
                if let entry = WhatsNew.latest() {
                    Button { showWhatsNew = true } label: {
                        Label(String(localized: "whatsNew.title"), image: "ph-sparkle-regular")
                    }
                    .sheet(isPresented: $showWhatsNew) { WhatsNewSheet(entry: entry) }
                }
                Link(destination: URL(string: "https://wizardchat.org/privacy/")!) {
                    Label(String(localized: "settings.about.privacyPolicy"), image: "ph-shield-check-regular")
                }
            }
            .labelStyle(FooterLinkLabelStyle())
            .buttonStyle(.borderless)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, WZ.Space.space7)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private struct FooterLinkLabelStyle: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: WZ.Space.space3) {
                configuration.icon
                configuration.title
            }
        }
    }

    private func credit(_ name: String, url: String, text: String) -> some View {
        (Text(.init("[\(name)](\(url))")).foregroundColor(theme.accent)
         + Text(" ") + Text(LocalizedStringKey(text)).foregroundColor(theme.textMuted))
            .font(.wizard(WZ.FontSize.sm))
    }
}
