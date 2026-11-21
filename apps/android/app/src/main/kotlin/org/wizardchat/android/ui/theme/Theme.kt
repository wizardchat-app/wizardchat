package org.wizardchat.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import org.wizardchat.android.LocalPrefs
import org.wizardchat.tokens.WZ

/** Whether the app follows the system's light and dark mode or forces one */
enum class ThemeMode {
    system, light, dark;

    fun isDark(systemDark: Boolean) = when (this) {
        system -> systemDark
        light -> false
        dark -> true
    }
}

val themeOrder = listOf(
    WZ.Theme.CARBON, WZ.Theme.PEWTER, WZ.Theme.UMBRA, WZ.Theme.ECLIPSE, WZ.Theme.PRISM, WZ.Theme.PARROT,
    WZ.Theme.HALLOW, WZ.Theme.GARNET, WZ.Theme.ETHEREAL, WZ.Theme.BLOSSOM, WZ.Theme.OPALINE,
)

fun themeOptions(dark: Boolean) = themeOrder.filter { it.isDark == dark }

fun fallbackTheme(dark: Boolean) = if (dark) WZ.Theme.CARBON else WZ.Theme.ETHEREAL

fun themeFrom(raw: String?) = WZ.Theme.entries.firstOrNull { it.name.equals(raw, ignoreCase = true) }

sealed interface ThemeChoice {
    data class Builtin(val theme: WZ.Theme) : ThemeChoice
    data class Custom(val id: String) : ThemeChoice

    val rawValue: String
        get() = when (this) {
            is Builtin -> theme.name.lowercase()
            is Custom -> "custom:$id"
        }

    companion object {
        fun from(raw: String?): ThemeChoice? = when {
            raw == null -> null
            raw.startsWith("custom:") -> Custom(raw.removePrefix("custom:"))
            else -> themeFrom(raw)?.let(::Builtin)
        }
    }
}

@Serializable
data class CustomTheme(
    val id: String,
    val name: String,
    val mode: String,
    val colors: List<String>,
    val angle: Double,
    val intensity: Double,
) {
    val isDark get() = mode == "dark"

    val gradient: Brush
        get() {
            val stops = colors.mapNotNull { Rgb.of(it)?.color() }.let { if (it.size > 1) it else it + it }
            val radians = Math.toRadians(angle - 90)
            val dx = cos(radians).toFloat() / 2
            val dy = sin(radians).toFloat() / 2
            return object : ShaderBrush() {
                override fun createShader(size: Size): Shader = LinearGradientShader(
                    from = Offset(size.width * (0.5f - dx), size.height * (0.5f - dy)),
                    to = Offset(size.width * (0.5f + dx), size.height * (0.5f + dy)),
                    colors = stops,
                )
            }
        }

    val palette: WZ.ThemeColors
        get() {
            val light = !isDark
            val base = (if (light) WZ.Theme.ETHEREAL else WZ.Theme.CARBON).colors
            val defaultLogo = WZ.Theme.default.colors
            val app0 = if (light) Rgb(0xE9, 0xEB, 0xEF) else Rgb(0x0D, 0x0E, 0x12)
            val surface0 = if (light) Rgb(0xFF, 0xFF, 0xFF) else Rgb(0x16, 0x17, 0x1C)
            val raised0 = if (light) Rgb(0xF1, 0xF2, 0xF5) else Rgb(0x20, 0x21, 0x27)
            val text0 = if (light) Rgb(0x15, 0x16, 0x1B) else Rgb(0xEC, 0xEE, 0xF3)
            val rgbs = colors.mapNotNull(Rgb::of)
            val tint = Rgb.average(rgbs)
            val show = 1 - (0.88 - intensity.coerceIn(0.0, 100.0) / 100 * 0.6)
            val app = app0.mix(tint, show)
            val surface = surface0.mix(tint, show * 0.85)
            val raised = raised0.mix(tint, show * 0.7)
            val toward = if (light) Rgb.BLACK else Rgb.WHITE
            fun text(amount: Double) = text0.mix(if (light) Rgb.WHITE else Rgb.BLACK, amount).color()
            var accent = rgbs.reduce { best, c -> if (c.saturation > best.saturation) c else best }
            repeat(10) {
                val l = accent.luminance
                if (if (light) l <= 0.22 else l >= 0.16) return@repeat
                accent = accent.mix(if (light) Rgb.BLACK else Rgb.WHITE, 0.15)
            }
            return base.copy(
                bgApp = app.color(),
                bgSurface = surface.color(),
                bgRaised = raised.color(),
                bgInput = surface.mix(toward, if (light) 0.02 else 0.04).color(),
                bgHover = (if (light) Rgb.BLACK else Rgb.WHITE).color(if (light) 0.05 else 0.06),
                bgActive = accent.color(if (light) 0.16 else 0.24),
                bgOverlay = if (light) Rgb(0x1A, 0x1A, 0x2E).color(0x66 / 255.0) else Rgb.BLACK.color(0xA6 / 255.0),
                textPrimary = text(0.0),
                textSecondary = text(0.2),
                textMuted = text(0.38),
                textDisabled = text(0.52),
                textOnAccent = if (accent.luminance > 0.5) Rgb(0x11, 0x11, 0x18).color() else Rgb.WHITE.color(),
                accentDefault = accent.color(),
                accentHover = accent.mix(toward, 0.15).color(),
                accentSoft = accent.color(if (light) 0.14 else 0.18),
                accentGlow1 = accent.color(0.08),
                accentGlow2 = accent.color(0.05),
                borderDefault = surface.mix(toward, 0.1).color(),
                borderStrong = surface.mix(toward, 0.22).color(),
                borderFocus = if (light) accent.color() else accent.mix(Rgb.WHITE, 0.35).color(),
                messageMine = accent.mix(surface, if (light) 0.78 else 0.5).color(),
                messageOther = raised.color(),
                logoP0 = defaultLogo.logoP0,
                logoP1 = defaultLogo.logoP1,
                logoP2 = defaultLogo.logoP2,
                logoP3 = defaultLogo.logoP3,
                logoP4 = defaultLogo.logoP4,
                logoP5 = defaultLogo.logoP5,
                logoHover = defaultLogo.logoHover,
                logoHoverGlow = defaultLogo.logoHoverGlow,
            )
        }

    companion object {
        fun from(json: JsonElement): CustomTheme? {
            val o = json as? JsonObject ?: return null
            fun str(key: String) = (o[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val mode = str("mode")?.takeIf { it == "light" || it == "dark" } ?: return null
            val raw = (o["colors"] as? JsonArray)?.takeIf { it.size in 1..5 } ?: return null
            val colors = raw.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content?.takeIf { c -> Rgb.of(c) != null } }
            if (colors.size != raw.size) return null
            return CustomTheme(
                id = str("id") ?: return null,
                name = str("name") ?: return null,
                mode = mode,
                colors = colors.map { it.lowercase() },
                angle = (o["angle"] as? JsonPrimitive)?.doubleOrNull ?: return null,
                intensity = (o["intensity"] as? JsonPrimitive)?.doubleOrNull ?: return null,
            )
        }
    }
}

private class Rgb(r: Double, g: Double, b: Double) {
    constructor(r: Int, g: Int, b: Int) : this(r.toDouble(), g.toDouble(), b.toDouble())

    val r = Math.round(r.coerceIn(0.0, 255.0)).toDouble()
    val g = Math.round(g.coerceIn(0.0, 255.0)).toDouble()
    val b = Math.round(b.coerceIn(0.0, 255.0)).toDouble()

    fun mix(other: Rgb, amount: Double) = Rgb(r + (other.r - r) * amount, g + (other.g - g) * amount, b + (other.b - b) * amount)

    val luminance: Double
        get() {
            val lin = listOf(r, g, b).map { val s = it / 255; if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4) }
            return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
        }

    val saturation: Double
        get() {
            val high = maxOf(r, g, b) / 255
            val low = minOf(r, g, b) / 255
            return if (high == 0.0) 0.0 else (high - low) / high
        }

    fun color(alpha: Double = 1.0) =
        Color(r.toFloat() / 255, g.toFloat() / 255, b.toFloat() / 255, Math.round(alpha * 255).toFloat() / 255)

    companion object {
        val BLACK = Rgb(0, 0, 0)
        val WHITE = Rgb(255, 255, 255)
        private val HEX = Regex("^#[0-9a-fA-F]{6}$")

        fun of(hex: String): Rgb? {
            if (!HEX.matches(hex)) return null
            val v = hex.substring(1).toInt(16)
            return Rgb(v shr 16 and 0xFF, v shr 8 and 0xFF, v and 0xFF)
        }

        fun average(colors: List<Rgb>) = Rgb(colors.sumOf { it.r } / colors.size, colors.sumOf { it.g } / colors.size, colors.sumOf { it.b } / colors.size)
    }
}

@Immutable
class WizardTheme(val id: WZ.Theme, val custom: CustomTheme? = null) {
    constructor(custom: CustomTheme) : this(if (custom.isDark) WZ.Theme.CARBON else WZ.Theme.ETHEREAL, custom)

    private val colors = custom?.palette ?: id.colors

    val bgPrimary get() = colors.bgApp
    val bgSecondary get() = colors.bgSurface
    val bgTertiary get() = colors.bgRaised
    val bgInput get() = colors.bgInput
    val bgHover get() = colors.bgHover
    val bgActive get() = colors.bgActive
    val overlay get() = colors.bgOverlay
    val accent get() = colors.accentDefault
    val accentHover get() = colors.accentHover
    val textPrimary get() = colors.textPrimary
    val textSecondary get() = colors.textSecondary
    val textMuted get() = colors.textMuted
    val textOnAccent get() = colors.textOnAccent
    val control get() = colors.textPrimary
    val border get() = colors.borderDefault
    val msgMineBg get() = colors.messageMine
    val msgOtherBg get() = colors.messageOther
    val mention get() = colors.statusMention
    val error get() = colors.statusDanger
    val danger get() = colors.statusDanger
    val success get() = colors.statusSuccess
    val info get() = colors.statusInfo
    val warningColor get() = colors.statusWarning
    val linkColor get() = colors.textLink
    val presenceOnline get() = colors.presenceOnline
    val presenceAway get() = colors.presenceAway
    val presenceBusy get() = colors.presenceBusy
    val presenceOffline get() = colors.presenceOffline
    val roleFounder get() = colors.roleFounder
    val roleAdmin get() = colors.roleAdmin
    val roleModerator get() = colors.roleModerator
    val roleMember get() = colors.roleMember
    val usernameColors
        get() = listOf(
            colors.usernameC1, colors.usernameC2, colors.usernameC3, colors.usernameC4,
            colors.usernameC5, colors.usernameC6, colors.usernameC7, colors.usernameC8,
        )
    fun usernameColor(userId: String): Color {
        var hash = 0
        for (char in userId) hash = 31 * hash + char.code
        return usernameColors[kotlin.math.abs(hash % usernameColors.size)]
    }
    val logo get() = listOf(colors.logoP0, colors.logoP1, colors.logoP2, colors.logoP3, colors.logoP4, colors.logoP5)
    val isDark get() = id.isDark

    val fill get() = bgHover
    val groupedBackground get() = if (isDark) bgPrimary else bgSecondary
    val groupedRow get() = if (isDark) bgSecondary else bgPrimary

    companion object {
        val default = WizardTheme(WZ.Theme.default)
        val baseLogo get() = default.logo
    }
}

val LocalTheme = staticCompositionLocalOf { WizardTheme.default }

/** The current theme */
val theme: WizardTheme
    @Composable get() = LocalTheme.current

@Composable
fun nameColor(userId: String?): Color =
    if (LocalPrefs.current.colorUsernames && !userId.isNullOrEmpty()) theme.usernameColor(userId) else theme.textPrimary

fun withNameColors(text: String, names: List<Pair<String, Color>>): AnnotatedString = buildAnnotatedString {
    append(text)
    var from = 0
    for ((name, color) in names) {
        if (name.isEmpty()) continue
        val start = text.indexOf(name, from).takeIf { it >= 0 } ?: continue
        addStyle(SpanStyle(color = color), start, start + name.length)
        from = start + name.length
    }
}

/** Text in the app font (Roboto, Android's own) at a token size */
fun wizardFont(size: TextUnit, weight: FontWeight = FontWeight.Normal) = TextStyle(fontSize = size, fontWeight = weight)

@Composable
fun WizardThemeRoot(resolved: WizardTheme, content: @Composable () -> Unit) {
    val scheme = if (resolved.isDark) {
        darkColorScheme(
            primary = resolved.accent,
            onPrimary = resolved.textOnAccent,
            background = resolved.bgPrimary,
            onBackground = resolved.textPrimary,
            surface = resolved.bgPrimary,
            onSurface = resolved.textPrimary,
            surfaceVariant = resolved.bgSecondary,
            onSurfaceVariant = resolved.textMuted,
            surfaceContainer = resolved.bgSecondary,
            surfaceContainerHigh = resolved.bgTertiary,
            surfaceContainerLow = resolved.bgSecondary,
            surfaceContainerHighest = resolved.bgTertiary,
            outline = resolved.border,
            outlineVariant = resolved.border,
            error = resolved.error,
        )
    } else {
        lightColorScheme(
            primary = resolved.accent,
            onPrimary = resolved.textOnAccent,
            background = resolved.bgPrimary,
            onBackground = resolved.textPrimary,
            surface = resolved.bgPrimary,
            onSurface = resolved.textPrimary,
            surfaceVariant = resolved.bgSecondary,
            onSurfaceVariant = resolved.textMuted,
            surfaceContainer = resolved.bgSecondary,
            surfaceContainerHigh = resolved.bgTertiary,
            surfaceContainerLow = resolved.bgSecondary,
            surfaceContainerHighest = resolved.bgTertiary,
            outline = resolved.border,
            outlineVariant = resolved.border,
            error = resolved.error,
        )
    }
    CompositionLocalProvider(LocalTheme provides resolved) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** A stable colour per name, like the web's username colours */
fun hueColor(name: String): Color {
    val code = (name.firstOrNull()?.code ?: 63).toDouble()
    val hue = ((code * 137.508) % 360).toFloat()
    return Color.hsv(hue, 0.75f, 0.672f)
}
