import CoreText
import SwiftUI
import UIKit

enum ThemeSetting: Hashable, Identifiable {
    case system
    case fixed(WZ.Theme)

    static let allCases: [ThemeSetting] = [.system] + [
        WZ.Theme.carbon, .pewter, .umbra, .eclipse, .parrot, .hallow, .garnet, .ethereal, .blossom,
    ].map(ThemeSetting.fixed)

    init?(rawValue: String) {
        if rawValue == "system" {
            self = .system
        } else if let theme = WZ.Theme(rawValue: rawValue) {
            self = .fixed(theme)
        } else {
            return nil
        }
    }

    var rawValue: String {
        switch self {
        case .system: return "system"
        case .fixed(let theme): return theme.rawValue
        }
    }

    var id: String { rawValue }

    var appIcon: String? {
        if case .fixed(let theme) = self, theme != .carbon { return "AppIcon-\(theme.name)" }
        return nil
    }

    var label: String {
        switch self {
        case .system: return String(localized: "settings.appearance.themeSystem")
        case .fixed(let theme): return theme.name
        }
    }

    func resolved(_ scheme: ColorScheme) -> WZ.Theme {
        switch self {
        case .fixed(let theme): return theme
        case .system:
            return scheme == .light ? .ethereal : .carbon
        }
    }
}

struct WizardTheme {
    let id: WZ.Theme
    private let colors: WZ.ThemeColors

    init(_ theme: WZ.Theme) {
        id = theme
        colors = theme.colors
    }

    var bgPrimary: Color { colors.bgApp }
    var bgSecondary: Color { colors.bgSurface }
    var bgTertiary: Color { colors.bgRaised }
    var bgInput: Color { colors.bgInput }
    var bgHover: Color { colors.bgHover }
    var bgActive: Color { colors.bgActive }
    var overlay: Color { colors.bgOverlay }
    var accent: Color { colors.accentDefault }
    var accentHover: Color { colors.accentHover }
    var textPrimary: Color { colors.textPrimary }
    var textSecondary: Color { colors.textSecondary }
    var textMuted: Color { colors.textMuted }
    var textOnAccent: Color { colors.textOnAccent }
    var control: Color { colors.textPrimary }
    var border: Color { colors.borderDefault }
    var msgMineBg: Color { colors.messageMine }
    var msgOtherBg: Color { colors.messageOther }
    var mention: Color { colors.statusMention }
    var error: Color { colors.statusDanger }
    var danger: Color { colors.statusDanger }
    var success: Color { colors.statusSuccess }
    var info: Color { colors.statusInfo }
    var warningColor: Color { colors.statusWarning }
    var linkColor: Color { colors.textLink }
    var logo: [Color] { [colors.logoP0, colors.logoP1, colors.logoP2, colors.logoP3, colors.logoP4, colors.logoP5] }
    static var baseLogo: [Color] { WizardTheme(.default).logo }
    var colorScheme: ColorScheme { id.colorScheme }
    var presenceOnline: Color { colors.presenceOnline }
    var presenceAway: Color { colors.presenceAway }
    var presenceBusy: Color { colors.presenceBusy }
    var presenceOffline: Color { colors.presenceOffline }
    var roleFounder: Color { colors.roleFounder }
    var roleAdmin: Color { colors.roleAdmin }
    var roleModerator: Color { colors.roleModerator }
    var roleMember: Color { colors.roleMember }
    var usernameColors: [Color] {
        [colors.usernameC1, colors.usernameC2, colors.usernameC3, colors.usernameC4,
         colors.usernameC5, colors.usernameC6, colors.usernameC7, colors.usernameC8]
    }

    func usernameColor(_ userId: String) -> Color {
        var hash: Int32 = 0
        for unit in userId.utf16 { hash = hash &* 31 &+ Int32(unit) }
        return usernameColors[Int(abs(Int64(hash)) % Int64(usernameColors.count))]
    }

    func nameColor(_ userId: String?, colored: Bool) -> Color {
        guard colored, let userId, !userId.isEmpty else { return textPrimary }
        return usernameColor(userId)
    }

    static let radiusSm = WZ.Radius.sm
    static let radiusMd = WZ.Radius.md
    static let radiusLg = WZ.Radius.xl

    static let `default` = WizardTheme(.default)
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = WizardTheme.default
}

extension EnvironmentValues {
    var theme: WizardTheme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

extension Font {
    static func wizard(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let scaled = UIFontMetrics(forTextStyle: textStyle(for: size)).scaledValue(for: size)
        let name: String
        switch weight {
        case .bold, .heavy, .black: name = "Roboto-Bold"
        case .semibold: name = "Roboto-SemiBold"
        case .medium: name = "Roboto-Medium"
        default: name = "Roboto-Regular"
        }
        return .custom(name, fixedSize: scaled)
    }

    static func wizardUIFont(_ size: CGFloat) -> UIFont {
        let scaled = UIFontMetrics(forTextStyle: textStyle(for: size)).scaledValue(for: size)
        if let roboto = UIFont(name: "Roboto-Regular", size: scaled) { return roboto }
        return .systemFont(ofSize: scaled)
    }

    private static func textStyle(for size: CGFloat) -> UIFont.TextStyle {
        switch size {
        case 30...: return .largeTitle
        case 25..<30: return .title1
        case 21..<25: return .title2
        case 19..<21: return .title3
        case 16.5..<19: return .body
        case 15.5..<16.5: return .callout
        case 14..<15.5: return .subheadline
        case 12.5..<14: return .footnote
        case 11.5..<12.5: return .caption1
        default: return .caption2
        }
    }
}

enum FontRegistry {
    /// Registers the bundled Roboto files (copied from @fontsource/roboto) and
    /// uses them for the navigation bars and their buttons, which SwiftUI draws with UIKit
    static func registerFonts() {
        let urls = Bundle.main.urls(forResourcesWithExtension: "woff2", subdirectory: nil) ?? []
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        func roboto(_ name: String, _ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont {
            let font = UIFont(name: name, size: size) ?? .systemFont(ofSize: size)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: font)
        }
        let bar = UINavigationBar.appearance()
        bar.titleTextAttributes = [.font: roboto("Roboto-SemiBold", 17, .headline)]
        bar.largeTitleTextAttributes = [.font: roboto("Roboto-Bold", 34, .largeTitle)]
        let button = UIBarButtonItem.appearance()
        for state: UIControl.State in [.normal, .highlighted, .disabled] {
            button.setTitleTextAttributes([.font: roboto("Roboto-Regular", 17, .body)], for: state)
        }
    }
}

func withNameColors(_ text: String, _ names: [(String, Color)]) -> AttributedString {
    var result = AttributedString(text)
    var searchStart = result.startIndex
    for (name, color) in names where !name.isEmpty {
        guard let range = result[searchStart...].range(of: name) else { continue }
        result[range].foregroundColor = color
        searchStart = range.upperBound
    }
    return result
}
