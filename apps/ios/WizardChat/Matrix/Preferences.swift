import Foundation
import SwiftUI
import WizardChatCore

enum MessageLayout: String, CaseIterable { case modern, classic, compact }
enum Density: String, CaseIterable { case compact, `default`, spacious }
enum ReducedMotion: String, CaseIterable { case system, on, off }
enum MediaVisibility: String, CaseIterable { case always, `private`, never }

@MainActor
final class AppPreferences: ObservableObject {
    static let chatFontSizes: [Double] = [12, 14, 15, 16, 18, 20, 24]
    static let defaultChatFontSize: Double = 15
    static let syncedAccountDataType = "org.wizardchat.settings"
    static let languages: [String] = Bundle.main.localizations
        .filter { $0 != "Base" }
        .sorted { $0 != $1 && ($0 == "en" || ($1 != "en" && $0 < $1)) }

    private let defaults = UserDefaults.standard

    // Per device like the system's light and dark mode, so not synced with the web
    @Published var themeMode: ThemeMode { didSet { save("themeMode", themeMode.rawValue) } }
    @Published var lightTheme: ThemeChoice { didSet { save("theme.light", lightTheme.rawValue) } }
    @Published var darkTheme: ThemeChoice { didSet { save("theme.dark", darkTheme.rawValue) } }
    @Published private(set) var customThemes: [CustomTheme] {
        didSet { defaults.set(try? JSONEncoder().encode(customThemes), forKey: "customThemes") }
    }
    @Published var messageLayout: MessageLayout { didSet { save("messageLayout", messageLayout.rawValue) } }
    @Published var chatFontSize: Double { didSet { save("chatFontSize", chatFontSize) } }
    @Published var chatDensity: Density { didSet { save("chatDensity", chatDensity.rawValue) } }
    @Published var uiDensity: Density { didSet { save("uiDensity", uiDensity.rawValue) } }
    @Published var prettifyLinks: Bool { didSet { save("prettifyLinks", prettifyLinks) } }
    @Published var colorUsernames: Bool { didSet { save("colorUsernames", colorUsernames); syncIfNeeded() } }
    @Published var groupImages: Bool { didSet { save("groupImages", groupImages); syncIfNeeded() } }
    @Published var largeEmoji: Bool { didSet { save("largeEmoji", largeEmoji); syncIfNeeded() } }
    @Published var emoticonsToEmoji: Bool { didSet { save("emoticonsToEmoji", emoticonsToEmoji); syncIfNeeded() } }
    @Published var showJoinLeave: Bool { didSet { save("showJoinLeave", showJoinLeave); syncIfNeeded() } }
    @Published var showProfileChanges: Bool { didSet { save("showProfileChanges", showProfileChanges); syncIfNeeded() } }
    @Published var themedAppIcon: Bool { didSet { save("themedAppIcon", themedAppIcon) } }
    @Published var showRoomAvatars: Bool { didSet { save("showRoomAvatars", showRoomAvatars) } }
    @Published var showLastMessage: Bool { didSet { save("showLastMessage", showLastMessage) } }
    @Published var mergeHomeAndDms: Bool { didSet { save("mergeHomeAndDms", mergeHomeAndDms); syncIfNeeded() } }
    @Published var reducedMotion: ReducedMotion { didSet { save("reducedMotion", reducedMotion.rawValue) } }
    @Published var autoplayGifs: Bool { didSet { save("autoplayGifs", autoplayGifs) } }
    @Published var typingIndicators: Bool { didSet { save("typingIndicators", typingIndicators); syncIfNeeded() } }
    @Published var sendReadReceipts: Bool { didSet { save("sendReadReceipts", sendReadReceipts); syncIfNeeded() } }
    @Published var mediaVisibility: MediaVisibility { didSet { save("mediaVisibility", mediaVisibility.rawValue) } }
    @Published var showPresence: Bool { didSet { save("showPresence", showPresence) } }
    @Published var notificationSounds: Bool { didSet { save("notificationSounds", notificationSounds); syncIfNeeded() } }
    @Published var notificationBanners: Bool { didSet { save("notificationBanners", notificationBanners) } }
    @Published var language: String { didSet { save("language", language); applyLanguage(); syncIfNeeded() } }
    @Published var developerMode: Bool { didSet { save("developerMode", developerMode) } }
    @Published var pushToTalk: Bool { didSet { save("pushToTalk", pushToTalk) } }

    var onSyncedSettingsChange: (([String: JSONValue]) -> Void)?
    private var isApplyingRemote = false
    private var syncedSubscription: Subscription?

    init() {
        let d = UserDefaults.standard
        let legacyTheme = d.string(forKey: "theme.device").flatMap(WZ.Theme.init(rawValue:))
        let storedMode = d.string(forKey: "themeMode").flatMap(ThemeMode.init(rawValue:))
        themeMode = storedMode ?? legacyTheme.map { $0.colorScheme == .light ? .light : .dark } ?? .system
        func slot(_ key: String, _ scheme: ColorScheme) -> ThemeChoice {
            d.string(forKey: key).flatMap(ThemeChoice.init(rawValue:))
                ?? .builtin(legacyTheme.flatMap { $0.colorScheme == scheme ? $0 : nil } ?? .fallback(for: scheme))
        }
        lightTheme = slot("theme.light", .light)
        darkTheme = slot("theme.dark", .dark)
        customThemes = d.data(forKey: "customThemes").flatMap { try? JSONDecoder().decode([CustomTheme].self, from: $0) } ?? []
        messageLayout = MessageLayout(rawValue: d.string(forKey: "messageLayout") ?? "") ?? .modern
        chatFontSize = d.object(forKey: "chatFontSize") as? Double ?? Self.defaultChatFontSize
        chatDensity = Density(rawValue: d.string(forKey: "chatDensity") ?? "") ?? .default
        uiDensity = Density(rawValue: d.string(forKey: "uiDensity") ?? "") ?? .default
        prettifyLinks = d.object(forKey: "prettifyLinks") as? Bool ?? true
        colorUsernames = d.object(forKey: "colorUsernames") as? Bool ?? true
        groupImages = d.object(forKey: "groupImages") as? Bool ?? true
        largeEmoji = d.object(forKey: "largeEmoji") as? Bool ?? true
        emoticonsToEmoji = d.object(forKey: "emoticonsToEmoji") as? Bool ?? false
        showJoinLeave = d.object(forKey: "showJoinLeave") as? Bool ?? true
        showProfileChanges = d.object(forKey: "showProfileChanges") as? Bool ?? false
        themedAppIcon = d.bool(forKey: "themedAppIcon")
        showRoomAvatars = d.object(forKey: "showRoomAvatars") as? Bool ?? true
        showLastMessage = d.bool(forKey: "showLastMessage")
        mergeHomeAndDms = d.bool(forKey: "mergeHomeAndDms")
        reducedMotion = ReducedMotion(rawValue: d.string(forKey: "reducedMotion") ?? "") ?? .system
        autoplayGifs = d.object(forKey: "autoplayGifs") as? Bool ?? true
        typingIndicators = d.object(forKey: "typingIndicators") as? Bool ?? true
        sendReadReceipts = d.object(forKey: "sendReadReceipts") as? Bool ?? true
        mediaVisibility = MediaVisibility(rawValue: d.string(forKey: "mediaVisibility") ?? "") ?? .always
        showPresence = d.object(forKey: "showPresence") as? Bool ?? true
        notificationSounds = d.object(forKey: "notificationSounds") as? Bool ?? true
        notificationBanners = d.object(forKey: "notificationBanners") as? Bool ?? true
        language = d.string(forKey: "language") ?? ""
        pushToTalk = d.bool(forKey: "pushToTalk")
        developerMode = d.bool(forKey: "developerMode")
        if storedMode == nil {
            save("themeMode", themeMode.rawValue)
            save("theme.light", lightTheme.rawValue)
            save("theme.dark", darkTheme.rawValue)
            d.removeObject(forKey: "theme.device")
        }
    }

    func choice(for scheme: ColorScheme) -> ThemeChoice { scheme == .light ? lightTheme : darkTheme }

    func setChoice(_ choice: ThemeChoice, for scheme: ColorScheme) {
        if scheme == .light { lightTheme = choice } else { darkTheme = choice }
    }

    func customThemes(for scheme: ColorScheme) -> [CustomTheme] { customThemes.filter { $0.scheme == scheme } }

    func theme(for scheme: ColorScheme) -> WizardTheme {
        switch choice(for: scheme) {
        case .builtin(let theme): return WizardTheme(theme)
        case .custom(let id):
            if let custom = customThemes(for: scheme).first(where: { $0.id == id }) { return WizardTheme(custom: custom) }
            return WizardTheme(.fallback(for: scheme))
        }
    }

    func watchSynced(_ client: WizardClient) {
        syncedSubscription?.cancel()
        syncedSubscription = client.watchAccountData(eventType: Self.syncedAccountDataType) { [weak self] content in
            MainActor.assumeIsolated {
                if case .object(let json)? = content { self?.applySynced(json) }
            }
        }
    }

    func stopWatchingSynced() {
        syncedSubscription?.cancel()
        syncedSubscription = nil
    }

    var chatScale: CGFloat { CGFloat(chatFontSize / Self.defaultChatFontSize) }

    var chatSpacing: CGFloat {
        switch chatDensity {
        case .compact: return 0.35
        case .default: return 1
        case .spacious: return 1.8
        }
    }

    var roomAvatarSize: CGFloat { [Density.compact: 32, .default: 44, .spacious: 52][uiDensity]! }
    var roomRowPadding: CGFloat { [Density.compact: 6, .default: 9, .spacious: 12][uiDensity]! }

    func reducesMotion(systemSetting: Bool) -> Bool {
        switch reducedMotion {
        case .system: return systemSetting
        case .on: return true
        case .off: return false
        }
    }

    var syncedSettings: [String: JSONValue] {
        [
            "language": .string(language.isEmpty ? "system" : language),
            "sendReadReceipts": .bool(sendReadReceipts),
            "sendTyping": .bool(typingIndicators),
            "notificationSound": .bool(notificationSounds),
            "colorUsernames": .bool(colorUsernames),
            "groupImages": .bool(groupImages),
            "largeEmoji": .bool(largeEmoji),
            "emoticonsToEmoji": .bool(emoticonsToEmoji),
            "showJoinLeave": .bool(showJoinLeave),
            "showProfileChanges": .bool(showProfileChanges),
            "mergeHomeAndDms": .bool(mergeHomeAndDms),
        ]
    }

    func applySynced(_ json: [String: JSONValue]) {
        isApplyingRemote = true
        defer { isApplyingRemote = false }
        if let value = json["language"]?.string {
            let language = value == "system" ? "" : value
            if language != self.language, language.isEmpty || Self.languages.contains(language) {
                self.language = language
            }
        }
        if case .bool(let value) = json["sendReadReceipts"], value != sendReadReceipts { sendReadReceipts = value }
        if case .bool(let value) = json["sendTyping"], value != typingIndicators { typingIndicators = value }
        if case .bool(let value) = json["notificationSound"], value != notificationSounds { notificationSounds = value }
        if case .bool(let value) = json["colorUsernames"], value != colorUsernames { colorUsernames = value }
        if case .bool(let value) = json["groupImages"], value != groupImages { groupImages = value }
        if case .bool(let value) = json["largeEmoji"], value != largeEmoji { largeEmoji = value }
        if case .bool(let value) = json["emoticonsToEmoji"], value != emoticonsToEmoji { emoticonsToEmoji = value }
        if case .bool(let value) = json["showJoinLeave"], value != showJoinLeave { showJoinLeave = value }
        if case .bool(let value) = json["showProfileChanges"], value != showProfileChanges { showProfileChanges = value }
        if case .bool(let value) = json["mergeHomeAndDms"], value != mergeHomeAndDms { mergeHomeAndDms = value }
        if case .array(let list) = json["customThemes"] {
            let themes = list.compactMap(CustomTheme.init(json:))
            if themes != customThemes { customThemes = themes }
        }
    }

    private func syncIfNeeded() {
        guard !isApplyingRemote else { return }
        onSyncedSettingsChange?(syncedSettings)
    }

    private func save(_ key: String, _ value: Any) {
        defaults.set(value, forKey: key)
    }

    /// iOS picks the app language at launch, so a change applies after reopening the app.
    private func applyLanguage() {
        if language.isEmpty {
            defaults.removeObject(forKey: "AppleLanguages")
        } else {
            defaults.set([language], forKey: "AppleLanguages")
        }
    }
}
