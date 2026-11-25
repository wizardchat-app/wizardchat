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
import org.wizardchat.android.R
import org.wizardchat.android.ui.theme.ThemeMode
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.wizardchat.android.ui.theme.CustomTheme
import org.wizardchat.android.ui.theme.ThemeChoice
import org.wizardchat.android.ui.theme.WizardTheme
import org.wizardchat.android.ui.theme.fallbackTheme
import org.wizardchat.android.ui.theme.themeFrom
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

enum class MessageLayout { modern, classic, compact }
enum class Density { compact, default, spacious }
enum class ReducedMotion { system, on, off }
enum class MediaVisibility { always, private, never }

/** Settings on this device, plus the few that sync with the web through account data */
class AppPreferences(context: Context) {
    private val defaults = context.getSharedPreferences("preferences", Context.MODE_PRIVATE)
    val languages: List<String> = context.resources.getStringArray(R.array.app_languages).toList()

    // Per device like the system's light and dark mode, so not synced with the web
    private val legacyTheme = themeFrom(defaults.getString("theme.device", null))
    var themeMode by pref(enumPref("themeMode", legacyTheme?.let { if (it.isDark) ThemeMode.dark else ThemeMode.light } ?: ThemeMode.system)) {
        putString("themeMode", it.name)
    }
    var lightTheme by pref(themeSlot("theme.light", dark = false)) { putString("theme.light", it.rawValue) }
    var darkTheme by pref(themeSlot("theme.dark", dark = true)) { putString("theme.dark", it.rawValue) }
    var customThemes by pref(
        runCatching { Json.decodeFromString<List<CustomTheme>>(defaults.getString("customThemes", null) ?: "[]") }.getOrDefault(emptyList()),
    ) { putString("customThemes", Json.encodeToString(it)) }
        private set
    var messageLayout by pref(enumPref("messageLayout", MessageLayout.modern)) { putString("messageLayout", it.name) }
    var chatFontSize by pref(defaults.getFloat("chatFontSize", DEFAULT_CHAT_FONT_SIZE)) { putFloat("chatFontSize", it) }
    var chatDensity by pref(enumPref("chatDensity", Density.default)) { putString("chatDensity", it.name) }
    var uiDensity by pref(enumPref("uiDensity", Density.default)) { putString("uiDensity", it.name) }
    var groupImages by pref(defaults.getBoolean("groupImages", true), synced = true) { putBoolean("groupImages", it) }
    var colorUsernames by pref(defaults.getBoolean("colorUsernames", true), synced = true) { putBoolean("colorUsernames", it) }
    var largeEmoji by pref(defaults.getBoolean("largeEmoji", true), synced = true) { putBoolean("largeEmoji", it) }
    var emoticonsToEmoji by pref(defaults.getBoolean("emoticonsToEmoji", false), synced = true) { putBoolean("emoticonsToEmoji", it) }
    var showJoinLeave by pref(defaults.getBoolean("showJoinLeave", true), synced = true) { putBoolean("showJoinLeave", it) }
    var showProfileChanges by pref(defaults.getBoolean("showProfileChanges", false), synced = true) { putBoolean("showProfileChanges", it) }
    var prettifyLinks by pref(defaults.getBoolean("prettifyLinks", true)) { putBoolean("prettifyLinks", it) }
    var themedAppIcon by pref(defaults.getBoolean("themedAppIcon", false)) { putBoolean("themedAppIcon", it) }
    var showRoomAvatars by pref(defaults.getBoolean("showRoomAvatars", true)) { putBoolean("showRoomAvatars", it) }
    var showLastMessage by pref(defaults.getBoolean("showLastMessage", false)) { putBoolean("showLastMessage", it) }
    var mergeHomeAndDms by pref(defaults.getBoolean("mergeHomeAndDms", false), synced = true) { putBoolean("mergeHomeAndDms", it) }
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

    init {
        if (!defaults.contains("themeMode")) {
            defaults.edit()
                .putString("themeMode", themeMode.name)
                .putString("theme.light", lightTheme.rawValue)
                .putString("theme.dark", darkTheme.rawValue)
                .remove("theme.device")
                .apply()
        }
    }

    fun choice(dark: Boolean) = if (dark) darkTheme else lightTheme

    fun setChoice(choice: ThemeChoice, dark: Boolean) {
        if (dark) darkTheme = choice else lightTheme = choice
    }

    fun customThemes(dark: Boolean) = customThemes.filter { it.isDark == dark }

    fun theme(dark: Boolean): WizardTheme = when (val choice = choice(dark)) {
        is ThemeChoice.Builtin -> WizardTheme(choice.theme)
        is ThemeChoice.Custom -> customThemes(dark).firstOrNull { it.id == choice.id }?.let { WizardTheme(it) }
            ?: WizardTheme(fallbackTheme(dark))
    }

    fun watchSynced(client: WizardClient) {
        syncedSubscription?.cancel()
        syncedSubscription = client.watchAccountData(SYNCED_ACCOUNT_DATA_TYPE) { content ->
            scope.launch { (content as? JsonObject)?.let(::applySynced) }
        }
    }

    fun stopWatchingSynced() {
        syncedSubscription?.cancel()
        syncedSubscription = null
    }

    private fun themeSlot(key: String, dark: Boolean): ThemeChoice =
        ThemeChoice.from(defaults.getString(key, null))
            ?: ThemeChoice.Builtin(legacyTheme?.takeIf { it.isDark == dark } ?: fallbackTheme(dark))

    var onSyncedSettingsChange: ((Map<String, JsonElement>) -> Unit)? = null
    private var isApplyingRemote = false
    private val scope = MainScope()
    private var syncedSubscription: Subscription? = null

    val chatScale: Float get() = chatFontSize / DEFAULT_CHAT_FONT_SIZE

    val chatSpacing: Float
        get() = when (chatDensity) {
            Density.compact -> 0.35f
            Density.default -> 1f
            Density.spacious -> 1.8f
        }

    val roomAvatarSize: Dp get() = when (uiDensity) { Density.compact -> 32.dp; Density.default -> 44.dp; Density.spacious -> 52.dp }
    val roomRowPadding: Dp get() = when (uiDensity) { Density.compact -> 6.dp; Density.default -> 9.dp; Density.spacious -> 12.dp }

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
            "largeEmoji" to JsonPrimitive(largeEmoji),
            "emoticonsToEmoji" to JsonPrimitive(emoticonsToEmoji),
            "showJoinLeave" to JsonPrimitive(showJoinLeave),
            "showProfileChanges" to JsonPrimitive(showProfileChanges),
            "mergeHomeAndDms" to JsonPrimitive(mergeHomeAndDms),
        )

    fun applySynced(json: Map<String, JsonElement>) {
        isApplyingRemote = true
        try {
            (json["language"] as? JsonPrimitive)?.contentOrNull?.let { value ->
                val language = if (value == "system") "" else value
                if (language != this.language && (language.isEmpty() || language in languages)) this.language = language
            }
            (json["sendReadReceipts"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != sendReadReceipts) sendReadReceipts = it }
            (json["sendTyping"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != typingIndicators) typingIndicators = it }
            (json["notificationSound"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != notificationSounds) notificationSounds = it }
            (json["colorUsernames"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != colorUsernames) colorUsernames = it }
            (json["groupImages"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != groupImages) groupImages = it }
            (json["largeEmoji"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != largeEmoji) largeEmoji = it }
            (json["emoticonsToEmoji"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != emoticonsToEmoji) emoticonsToEmoji = it }
            (json["showJoinLeave"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != showJoinLeave) showJoinLeave = it }
            (json["showProfileChanges"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != showProfileChanges) showProfileChanges = it }
            (json["mergeHomeAndDms"] as? JsonPrimitive)?.booleanOrNull?.let { if (it != mergeHomeAndDms) mergeHomeAndDms = it }
            (json["customThemes"] as? JsonArray)?.mapNotNull(CustomTheme::from)?.let { if (it != customThemes) customThemes = it }
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
