import CoreText
import SwiftUI
import UIKit
import WizardChatCore

enum ThemeMode: String, CaseIterable {
    case system, light, dark

    var forcedScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

extension WZ.Theme {
    static let ordered: [WZ.Theme] = [
        .carbon, .pewter, .umbra, .eclipse, .prism, .parrot, .hallow, .garnet, .ethereal, .blossom, .opaline,
    ]

    static func options(for scheme: ColorScheme) -> [WZ.Theme] { ordered.filter { $0.colorScheme == scheme } }

    static func fallback(for scheme: ColorScheme) -> WZ.Theme { scheme == .light ? .ethereal : .carbon }

    var appIcon: String? { self == .carbon ? nil : "AppIcon-\(name)" }
}

enum ThemeChoice: Hashable {
    case builtin(WZ.Theme)
    case custom(String)

    init?(rawValue: String) {
        if rawValue.hasPrefix("custom:") {
            self = .custom(String(rawValue.dropFirst("custom:".count)))
        } else if let theme = WZ.Theme(rawValue: rawValue) {
            self = .builtin(theme)
        } else {
            return nil
        }
    }

    var rawValue: String {
        switch self {
        case .builtin(let theme): return theme.rawValue
        case .custom(let id): return "custom:\(id)"
        }
    }
}

struct CustomTheme: Hashable, Identifiable, Codable {
    let id: String
    let name: String
    let mode: String
    let colors: [String]
    let angle: Double
    let intensity: Double

    var scheme: ColorScheme { mode == "light" ? .light : .dark }

    init?(json: JSONValue) {
        guard case .object(let object) = json,
              case .string(let id)? = object["id"],
              case .string(let name)? = object["name"],
              case .string(let mode)? = object["mode"], mode == "light" || mode == "dark",
              case .array(let raw)? = object["colors"], (1...5).contains(raw.count),
              case .number(let angle)? = object["angle"],
              case .number(let intensity)? = object["intensity"] else { return nil }
        let colors = raw.compactMap(\.string).filter { RGB(hex: $0) != nil }
        guard colors.count == raw.count else { return nil }
        self.id = id
        self.name = name
        self.mode = mode
        self.colors = colors.map { $0.lowercased() }
        self.angle = angle
        self.intensity = intensity
    }

    var gradient: LinearGradient {
        let stops = colors.compactMap { RGB(hex: $0)?.color() }
        let radians = (angle - 90) * .pi / 180
        let dx = cos(radians) / 2, dy = sin(radians) / 2
        return LinearGradient(colors: stops.count > 1 ? stops : stops + stops,
                              startPoint: UnitPoint(x: 0.5 - dx, y: 0.5 - dy),
                              endPoint: UnitPoint(x: 0.5 + dx, y: 0.5 + dy))
    }

    var palette: WZ.ThemeColors {
        let light = scheme == .light
        let base = (light ? WZ.Theme.ethereal : WZ.Theme.carbon).colors
        let defaultLogo = WZ.Theme.default.colors
        let neutral = light
            ? (app: RGB(0xE9, 0xEB, 0xEF), surface: RGB(0xFF, 0xFF, 0xFF), raised: RGB(0xF1, 0xF2, 0xF5), text: RGB(0x15, 0x16, 0x1B))
            : (app: RGB(0x0D, 0x0E, 0x12), surface: RGB(0x16, 0x17, 0x1C), raised: RGB(0x20, 0x21, 0x27), text: RGB(0xEC, 0xEE, 0xF3))
        let rgbs = colors.compactMap(RGB.init(hex:))
        let tint = RGB.average(rgbs)
        let show = 1 - (0.88 - min(100, max(0, intensity)) / 100 * 0.6)
        let app = neutral.app.mix(tint, show)
        let surface = neutral.surface.mix(tint, show * 0.85)
        let raised = neutral.raised.mix(tint, show * 0.7)
        let toward = light ? RGB.black : RGB.white
        func text(_ amount: Double) -> Color { neutral.text.mix(light ? .white : .black, amount).color() }
        var accent = rgbs.reduce(rgbs[0]) { $1.saturation > $0.saturation ? $1 : $0 }
        for _ in 0..<10 {
            let l = accent.luminance
            if light ? l <= 0.22 : l >= 0.16 { break }
            accent = accent.mix(light ? .black : .white, 0.15)
        }
        return WZ.ThemeColors(
            bgApp: app.color(),
            bgSurface: surface.color(),
            bgRaised: raised.color(),
            bgInput: surface.mix(toward, light ? 0.02 : 0.04).color(),
            bgHover: (light ? RGB.black : RGB.white).color(alpha: light ? 0.05 : 0.06),
            bgActive: accent.color(alpha: light ? 0.16 : 0.24),
            bgOverlay: light ? RGB(0x1A, 0x1A, 0x2E).color(alpha: 0x66 / 255) : RGB.black.color(alpha: 0xA6 / 255),
            textPrimary: text(0),
            textSecondary: text(0.2),
            textMuted: text(0.38),
            textDisabled: text(0.52),
            textOnAccent: accent.luminance > 0.5 ? RGB(0x11, 0x11, 0x18).color() : RGB.white.color(),
            textLink: base.textLink,
            accentDefault: accent.color(),
            accentHover: accent.mix(toward, 0.15).color(),
            accentSoft: accent.color(alpha: light ? 0.14 : 0.18),
            accentGlow1: accent.color(alpha: 0.08),
            accentGlow2: accent.color(alpha: 0.05),
            borderDefault: surface.mix(toward, 0.1).color(),
            borderStrong: surface.mix(toward, 0.22).color(),
            borderFocus: light ? accent.color() : accent.mix(.white, 0.35).color(),
            statusDanger: base.statusDanger,
            statusError: base.statusError,
            statusSuccess: base.statusSuccess,
            statusWarning: base.statusWarning,
            statusInfo: base.statusInfo,
            statusMention: base.statusMention,
            presenceOnline: base.presenceOnline,
            presenceAway: base.presenceAway,
            presenceBusy: base.presenceBusy,
            presenceOffline: base.presenceOffline,
            roleFounder: base.roleFounder,
            roleAdmin: base.roleAdmin,
            roleModerator: base.roleModerator,
            roleMember: base.roleMember,
            logoP0: defaultLogo.logoP0,
            logoP1: defaultLogo.logoP1,
            logoP2: defaultLogo.logoP2,
            logoP3: defaultLogo.logoP3,
            logoP4: defaultLogo.logoP4,
            logoP5: defaultLogo.logoP5,
            logoHover: defaultLogo.logoHover,
            logoHoverGlow: defaultLogo.logoHoverGlow,
            messageMine: accent.mix(surface, light ? 0.78 : 0.5).color(),
            messageOther: raised.color(),
            messageHighlight: base.messageHighlight,
            usernameC1: base.usernameC1,
            usernameC2: base.usernameC2,
            usernameC3: base.usernameC3,
            usernameC4: base.usernameC4,
            usernameC5: base.usernameC5,
            usernameC6: base.usernameC6,
            usernameC7: base.usernameC7,
            usernameC8: base.usernameC8
        )
    }
}

private struct RGB {
    let r: Double, g: Double, b: Double

    static let black = RGB(0, 0, 0)
    static let white = RGB(255, 255, 255)

    init(_ r: Double, _ g: Double, _ b: Double) {
        self.r = (min(255, max(0, r))).rounded()
        self.g = (min(255, max(0, g))).rounded()
        self.b = (min(255, max(0, b))).rounded()
    }

    init?(hex: String) {
        guard hex.count == 7, hex.hasPrefix("#"), let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        self.init(Double(value >> 16 & 0xFF), Double(value >> 8 & 0xFF), Double(value & 0xFF))
    }

    static func average(_ colors: [RGB]) -> RGB {
        let n = Double(colors.count)
        return RGB(colors.reduce(0) { $0 + $1.r } / n, colors.reduce(0) { $0 + $1.g } / n, colors.reduce(0) { $0 + $1.b } / n)
    }

    func mix(_ other: RGB, _ amount: Double) -> RGB {
        RGB(r + (other.r - r) * amount, g + (other.g - g) * amount, b + (other.b - b) * amount)
    }

    var luminance: Double {
        let lin = [r, g, b].map { c -> Double in
            let s = c / 255
            return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    }

    var saturation: Double {
        let high = max(r, g, b) / 255, low = min(r, g, b) / 255
        return high == 0 ? 0 : (high - low) / high
    }

    func color(alpha: Double = 1) -> Color {
        Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: (alpha * 255).rounded() / 255)
    }
}

struct WizardTheme {
    let id: WZ.Theme
    let custom: CustomTheme?
    private let colors: WZ.ThemeColors

    init(_ theme: WZ.Theme) {
        id = theme
        custom = nil
        colors = theme.colors
    }

    init(custom theme: CustomTheme) {
        id = theme.scheme == .light ? .ethereal : .carbon
        custom = theme
        colors = theme.palette
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
