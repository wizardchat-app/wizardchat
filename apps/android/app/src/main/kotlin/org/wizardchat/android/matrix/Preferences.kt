package org.wizardchat.android.matrix

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import org.wizardchat.android.ui.theme.ThemeSetting

enum class MessageLayout { modern, classic, compact }
enum class Density { compact, default, spacious }
enum class ReducedMotion { system, on, off }
enum class MediaVisibility { always, private, never }

/** Settings on this device, plus the few that sync with the web through account data */
class AppPreferences(context: Context) {
    private val defaults = context.getSharedPreferences("preferences", Context.MODE_PRIVATE)

    // Per device like the system's light and dark mode, so not synced with the web
    var theme by pref(ThemeSetting.from(defaults.getString("theme.device", null))) { putString("theme.device", it.rawValue) }
    var messageLayout by pref(enumPref("messageLayout", MessageLayout.modern)) { putString("messageLayout", it.name) }
    var chatFontSize by pref(defaults.getFloat("chatFontSize", DEFAULT_CHAT_FONT_SIZE)) { putFloat("chatFontSize", it) }
    var chatDensity by pref(enumPref("chatDensity", Density.default)) { putString("chatDensity", it.name) }
    var uiDensity by pref(enumPref("uiDensity", Density.default)) { putString("uiDensity", it.name) }
    var groupImages by pref(defaults.getBoolean("groupImages", true), synced = true) { putBoolean("groupImages", it) }
    var colorUsernames by pref(defaults.getBoolean("colorUsernames", true), synced = true) { putBoolean("colorUsernames", it) }
    var prettifyLinks by pref(defaults.getBoolean("prettifyLinks", true)) { putBoolean("prettifyLinks", it) }
    var themedAppIcon by pref(defaults.getBoolean("themedAppIcon", false)) { putBoolean("themedAppIcon", it) }
    var showRoomAvatars by pref(defaults.getBoolean("showRoomAvatars", true)) { putBoolean("showRoomAvatars", it) }
    var reducedMotion by pref(enumPref("reducedMotion", ReducedMotion.system)) { putString("reducedMotion", it.name) }
    var autoplayGifs by pref(defaults.getBoolean("autoplayGifs", true)) { putBoolean("autoplayGifs", it) }
    var typingIndicators by pref(defaults.getBoolean("typingIndicators", true), synced = true) { putBoolean("typingIndicators", it) }
    var sendReadReceipts by pref(defaults.getBoolean("sendReadReceipts", true), synced = true) { putBoolean("sendReadReceipts", it) }
    var mediaVisibility by pref(enumPref("mediaVisibility", MediaVisibility.always)) { putString("mediaVisibility", it.name) }
    var showPresence by pref(defaults.getBoolean("showPresence", true)) { putBoolean("showPresence", it) }
    var notificationSounds by pref(defaults.getBoolean("notificationSounds", true), synced = true) { putBoolean("notificationSounds", it) }
    var notificationBanners by pref(defaults.getBoolean("notificationBanners", true)) { putBoolean("notificationBanners", it) }
    var language by pref(defaults.getString("language", "") ?: "", synced = true) {
        putString("language", it)
        applyLanguage(it)
    }
    var developerMode by pref(defaults.getBoolean("developerMode", false)) { putBoolean("developerMode", it) }
    var pushToTalk by pref(defaults.getBoolean("pushToTalk", false)) { putBoolean("pushToTalk", it) }
    var verifySkippedDevice by pref(defaults.getString("verifySkippedDevice", "") ?: "") {
        putString("verifySkippedDevice", it)
    }
    var verificationBannerDismissed by pref(defaults.getBoolean("verificationBannerDismissed", false)) {
        putBoolean("verificationBannerDismissed", it)
    }

    var onSyncedSettingsChange: ((Map<String, JsonElement>) -> Unit)? = null
    private var isApplyingRemote = false

    val chatScale: Float get() = chatFontSize / DEFAULT_CHAT_FONT_SIZE

    val chatSpacing: Float
        get() = when (chatDensity) {
            Density.compact -> 0.35f
            Density.default -> 1f
            Density.spacious -> 1.8f
        }

    val roomAvatarSize: Dp get() = when (uiDensity) { Density.compact -> 32.dp; Density.default -> 44.dp; Density.spacious -> 52.dp }
    val roomRowPadding: Dp get() = when (uiDensity) { Density.compact -> 6.dp; Density.default -> 9.dp; Density.spacious -> 12.dp }
    val spaceGap: Dp get() = when (uiDensity) { Density.compact -> 4.dp; Density.default -> 6.dp; Density.spacious -> 10.dp }

    fun reducesMotion(systemSetting: Boolean) = when (reducedMotion) {
        ReducedMotion.system -> systemSetting
        ReducedMotion.on -> true
        ReducedMotion.off -> false
    }

    val syncedSettings: Map<String, JsonElement>
        get() = mapOf(
            "language" to JsonPrimitive(language.ifEmpty { "system" }),
            "sendReadReceipts" to JsonPrimitive(sendReadReceipts),
            "sendTyping" to JsonPrimitive(typingIndicators),
            "notificationSound" to JsonPrimitive(notificationSounds),
            "colorUsernames" to JsonPrimitive(colorUsernames),
            "groupImages" to JsonPrimitive(groupImages),
        )

    fun applySynced(json: Map<String, JsonElement>) {
        isApplyingRemote = true
        try {
            (json["language"] as? JsonPrimitive)?.contentOrNull?.let { value ->
                val language = if (value == "system") "" else value
                if (language != this.language && (language.isEmpty() || language in listOf("en", "de"))) this.language = language
            }
            (json["sendReadReceipts"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != sendReadReceipts) sendReadReceipts = it }
            (json["sendTyping"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != typingIndicators) typingIndicators = it }
            (json["notificationSound"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != notificationSounds) notificationSounds = it }
            (json["colorUsernames"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != colorUsernames) colorUsernames = it }
            (json["groupImages"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != groupImages) groupImages = it }
        } finally {
            isApplyingRemote = false
        }
    }

    private inline fun <reified E : Enum<E>> enumPref(key: String, fallback: E): E =
        defaults.getString(key, null)?.let { raw -> enumValues<E>().firstOrNull { it.name == raw } } ?: fallback

    /** A Compose-observable setting saved on every change */
    private fun <T> pref(initial: T, synced: Boolean = false, write: android.content.SharedPreferences.Editor.(T) -> Unit) =
        object : kotlin.properties.ReadWriteProperty<Any?, T> {
            private val state = mutableStateOf(initial)
            override fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>) = state.value
            override fun setValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>, value: T) {
                state.value = value
                defaults.edit().apply { write(value) }.apply()
                if (synced && !isApplyingRemote) onSyncedSettingsChange?.invoke(syncedSettings)
            }
        }

    /** Android switches the app's language right away (per-app languages) */
    private fun applyLanguage(language: String) {
        AppCompatDelegate.setApplicationLocales(
            if (language.isEmpty()) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(language),
        )
    }

    companion object {
        val CHAT_FONT_SIZES = listOf(12f, 14f, 15f, 16f, 18f, 20f, 24f)
        const val DEFAULT_CHAT_FONT_SIZE = 15f
        const val SYNCED_ACCOUNT_DATA_TYPE = "org.wizardchat.settings"
    }
}
