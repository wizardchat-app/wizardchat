package org.wizardchat.android.ui.settings

import androidx.compose.runtime.LaunchedEffect
import org.wizardchat.android.matrix.SessionStore
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.login.LoginScreen
import org.wizardchat.android.ui.room.FullScreenDialog
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** The settings pages */
internal enum class SettingsPageId(val titleKey: String, val icon: String) {
    account("settings.account.title", "user"),
    privacy("settings.privacy.title", "shield"),
    emojis("room.settings.emojis.title", "smiley-sticker"),
    soundboard("settings.soundboard.title", "vinyl-record"),
    notifications("settings.notifications.title", "bell"),
    voiceVideo("settings.voiceVideo.title", "microphone"),
    appearance("settings.appearance.title", "palette"),
    accessibility("settings.accessibility.title", "person-simple-circle"),
    language("settings.language.title", "globe-simple"),
    sessions("settings.sessions.title", "devices"),
    encryption("settings.encryption.title", "lock-key"),
    developer("developer.title", "wrench"),
    about("settings.about.title", "info"),
}

private val stackSaver = Saver<List<SettingsPageId>, ArrayList<String>>(
    save = { ArrayList(it.map(SettingsPageId::name)) },
    restore = { saved -> saved.mapNotNull { name -> SettingsPageId.entries.firstOrNull { it.name == name } } },
)

/**
 * The You tab: the profile, the settings pages and signing out. Pages push inside the tab; outside
 * the tab (`isTab = false`) a Done button calls `onDismiss`.
 */
@Composable
fun SettingsScreen(isTab: Boolean, onDismiss: (() -> Unit)? = null) {
    // Saveable so a language switch (which recreates the activity) stays on its page
    var stack by rememberSaveable(stateSaver = stackSaver) { mutableStateOf(listOf<SettingsPageId>()) }
    BackHandler(enabled = stack.isNotEmpty()) { stack = stack.dropLast(1) }
    val pop = { stack = stack.dropLast(1) }

    AnimatedContent(
        targetState = stack,
        transitionSpec = {
            if (targetState.size >= initialState.size) {
                slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 3 }
            } else {
                slideInHorizontally { -it / 3 } togetherWith slideOutHorizontally { it }
            }
        },
        contentKey = { it.size to it.lastOrNull() },
        label = "settings",
    ) { path ->
        when (path.lastOrNull()) {
            null -> SettingsRoot(isTab, onDismiss) { stack = stack + it }
            SettingsPageId.account -> AccountSettings(pop)
            SettingsPageId.privacy -> PrivacySettings(pop)
            SettingsPageId.emojis -> EmojisSettings(pop)
            SettingsPageId.soundboard -> org.wizardchat.android.ui.voice.SoundboardSettings(pop)
            SettingsPageId.notifications -> NotificationSettingsPage(pop)
            SettingsPageId.voiceVideo -> VoiceVideoSettings(pop)
            SettingsPageId.appearance -> AppearanceSettings(pop)
            SettingsPageId.accessibility -> AccessibilitySettings(pop)
            SettingsPageId.language -> LanguageSettings(pop)
            SettingsPageId.sessions -> SessionsSettings(pop)
            SettingsPageId.encryption -> EncryptionSettings(pop)
            SettingsPageId.developer -> DeveloperSettings(pop)
            SettingsPageId.about -> AboutSettings(pop)
        }
    }
}

@Composable
private fun SettingsRoot(isTab: Boolean, onDismiss: (() -> Unit)?, open: (SettingsPageId) -> Unit) {
    val session = LocalSession.current
    var search by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(theme.groupedBackground)) {
        WizardTopBar(tr("common.settings"), large = true, titleInRow = isTab) {
            if (!isTab && onDismiss != null) BarTextButton(tr("common.done"), onDismiss, bold = true)
        }
        WizardTextField(
            search,
            { search = it },
            tr("settings.search"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
            val query = search.trim()
            if (query.isNotEmpty()) {
                val matches = SettingsPageId.entries.filter { L10n.format(it.titleKey).contains(query, ignoreCase = true) }
                if (matches.isEmpty()) {
                    Text(tr("nav.noMatches"), Modifier.fillMaxWidth().padding(WZ.Space.space9), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                } else {
                    PageRows(matches, open)
                }
            } else {
            SettingsSection {
                val name = session.displayName ?: session.userId ?: ""
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { open(SettingsPageId.account) }
                        .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4 + WZ.Space.space2),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                ) {
                    Avatar(name, session.avatarUrl, size = WZ.SizeAvatar.lg)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(
                            name,
                            style = wizardFont(WZ.FontSize.xxl, FontWeight.SemiBold),
                            color = theme.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        session.customStatus?.text?.let {
                            Text(it, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Chevron()
                }
                SettingsDivider()
                AccountSwitcher(onLogout = { if (!isTab) onDismiss?.invoke() })
            }
            PageRows(listOf(SettingsPageId.privacy, SettingsPageId.notifications, SettingsPageId.emojis, SettingsPageId.soundboard), open)
            PageRows(listOf(SettingsPageId.voiceVideo, SettingsPageId.appearance, SettingsPageId.accessibility, SettingsPageId.language), open)
            PageRows(listOf(SettingsPageId.sessions, SettingsPageId.encryption, SettingsPageId.developer, SettingsPageId.about), open)
            }
            Spacer(Modifier.height(LocalBottomBarInset.current + WZ.Space.space8))
        }
    }
}

@Composable
private fun AccountSwitcher(onLogout: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { session.refreshAccountProfiles() }
    Box {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = WZ.Space.space11)
                .clickable { open = true }
                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            PhIcon("user", size = WZ.SizeIcon.md, tint = theme.textMuted)
            Text(tr("settings.accounts.switch"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
            PhIcon("caret-up-down", size = WZ.SizeIcon.sm, tint = theme.textMuted)
        }
        DropdownMenu(open, { open = false }, containerColor = theme.bgTertiary) {
            session.accounts.forEach { account ->
                val isOpen = account.userId == session.userId
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(account.displayName ?: account.userId, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                            Text(account.userId, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                        }
                    },
                    leadingIcon = {
                        val saved = remember(account.userId) { SessionStore.savedAvatar(account.userId) }
                        Avatar(account.displayName ?: account.userId, account.avatarUrl, size = WZ.SizeAvatar.sm, fallback = saved)
                    },
                    trailingIcon = if (isOpen) {
                        { PhIcon("check", tint = theme.accent) }
                    } else {
                        null
                    },
                    onClick = {
                        open = false
                        if (!isOpen) scope.launch { session.switchAccount(account.userId) }
                    },
                )
            }
            DropdownMenuItem(
                text = { Text(tr("settings.accounts.add"), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
                leadingIcon = { PhIcon("plus", tint = theme.textPrimary) },
                onClick = {
                    open = false
                    session.isAddingAccount = true
                },
            )
            HorizontalDivider(color = theme.border)
            DropdownMenuItem(
                text = {
                    Text(
                        tr("settings.accounts.logoutOf", session.displayName ?: session.userId ?: ""),
                        style = wizardFont(WZ.FontSize.lg),
                        color = theme.danger,
                    )
                },
                leadingIcon = { PhIcon("sign-out", tint = theme.danger) },
                onClick = {
                    open = false
                    onLogout()
                    scope.launch { session.logout() }
                },
            )
        }
    }
}

@Composable
fun AddAccountScreen() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val close = {
        session.isAddingAccount = false
        scope.launch { session.cancelBrowserLogin() }
        Unit
    }
    FullScreenDialog(close) {
        Column(Modifier.fillMaxSize().background(theme.bgPrimary)) {
            WizardTopBar(tr("auth.addAccountTitle")) {
                BarTextButton(tr("common.cancel"), close)
            }
            Box(Modifier.weight(1f)) { LoginScreen() }
        }
    }
}

@Composable
private fun PageRows(pages: List<SettingsPageId>, open: (SettingsPageId) -> Unit) {
    SettingsSection {
        pages.forEachIndexed { index, page ->
            if (index > 0) SettingsDivider()
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = WZ.Space.space11)
                    .clickable { open(page) }
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            ) {
                PhIcon(page.icon, size = WZ.SizeIcon.md, tint = theme.textMuted)
                Text(tr(page.titleKey), Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary)
                Chevron()
            }
        }
    }
}

@Composable
internal fun Chevron() {
    PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted.copy(alpha = 0.6f))
}

/** Sessions and verification in a sheet, opened from the verification banner */
@Composable
fun SessionsSheet(onDismiss: () -> Unit) {
    WizardSheet(onDismiss) {
        Box(Modifier.fillMaxWidth().fillMaxHeight(0.92f)) {
            CompositionLocalProvider(LocalBottomBarInset provides WZ.Space.space0) {
                SessionsSettings(onBack = null, onDone = onDismiss)
            }
        }
    }
}
