package org.wizardchat.android.ui.settings

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ManagedRule
import org.wizardchat.android.matrix.NotifLevel
import org.wizardchat.android.matrix.PushRuleSets
import org.wizardchat.android.matrix.PushRules
import org.wizardchat.android.push.Push
import org.wizardchat.android.push.PushProvider
import org.wizardchat.android.push.PushSetup
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

private fun notificationsAllowed(context: Context): Boolean {
    val permitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    return permitted && NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/** Device notification switches and the account's push rules */
@Composable
internal fun NotificationSettingsPage(onBack: () -> Unit) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var rules by remember { mutableStateOf<PushRules?>(null) }
    var busy by remember { mutableStateOf(false) }
    var keyword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var bannersDenied by remember { mutableStateOf(false) }
    var pushSetup by remember { mutableStateOf(PushProvider.setup()) }

    LifecycleResumeEffect(Unit) {
        pushSetup = PushProvider.setup()
        val registering = if (pushSetup is PushSetup.OpenDistributor) {
            scope.launch {
                Push.register()
                delay(2_000)
                pushSetup = PushProvider.setup()
            }
        } else {
            null
        }
        onPauseOrDispose { registering?.cancel() }
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        bannersDenied = !granted || !notificationsAllowed(context)
    }

    fun requestAuthorization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsAllowed(context)) {
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            bannersDenied = !notificationsAllowed(context)
        }
    }

    suspend fun reload() {
        try {
            rules = PushRules(session.requireClient.pushRules())
        } catch (failure: Exception) {
            error = failure.text
        }
    }

    suspend fun run(work: suspend () -> Unit) {
        busy = true
        error = null
        try {
            work()
            reload()
        } catch (failure: Exception) {
            error = failure.text
        } finally {
            busy = false
        }
    }

    fun addKeyword() {
        val word = keyword.trim()
        if (word.isEmpty()) return
        if (rules?.keywords?.contains(word) == true) {
            error = L10n.format("settings.notifications.keywordExists")
            return
        }
        keyword = ""
        scope.launch { run { session.requireClient.addNotificationKeyword(word) } }
    }

    LaunchedEffect(Unit) { reload() }

    @Composable
    fun LevelRow(label: String, managed: List<ManagedRule>, rules: PushRules) {
        PickerRow(
            label,
            rules.level(managed),
            NotifLevel.entries.map { it to it.title },
            { level -> scope.launch { run { rules.setLevel(level, managed, session.requireClient) } } },
            enabled = !busy,
        )
    }

    @Composable
    fun Unavailable() {
        SettingsItem {
            Text(tr("settings.notifications.ruleUnavailable"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
    }

    SettingsPage(tr("room.notifications.title"), onBack) {
        SettingsSection(tr("settings.notifications.deviceLabel")) {
            ToggleRow(
                tr("settings.notifications.notificationSounds"),
                prefs.notificationSounds,
                {
                    prefs.notificationSounds = it
                    if (it) requestAuthorization()
                },
                note = tr("settings.notifications.notificationSoundsNote"),
            )
            SettingsDivider()
            ToggleRow(
                tr("settings.notifications.notificationBanners"),
                prefs.notificationBanners,
                {
                    prefs.notificationBanners = it
                    if (it) requestAuthorization()
                },
                note = tr("settings.notifications.bannerNote"),
            )
        }
        if (bannersDenied) {
            StatusText(tr("settings.notifications.systemDisabledAndroid"))
            // The app's notification settings in Android
            LinkRow(tr("common.settings")) {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(intent) }
            }
        }
        when (val setup = pushSetup) {
            PushSetup.Ready -> {}
            PushSetup.NoDistributor -> {
                StatusText(tr("settings.notifications.pushNoDistributor"))
                LinkRow(tr("settings.notifications.pushGetNtfy"), PushProvider::openDistributor)
            }
            is PushSetup.OpenDistributor -> {
                StatusText(tr("settings.notifications.pushOpenDistributor", setup.name))
                LinkRow(tr("settings.notifications.pushOpenApp", setup.name), PushProvider::openDistributor)
            }
        }

        val current = rules
        if (current != null) {
            SettingsSection(tr("room.settings.permissions.groups.messages"), tr("settings.notifications.levelHint")) {
                LevelRow(tr("room.dm.directMessages"), PushRuleSets.dms, current)
                SettingsDivider()
                LevelRow(tr("settings.notifications.rooms"), PushRuleSets.rooms, current)
            }
            SettingsSection(tr("settings.notifications.otherEventsLabel")) {
                val userMention = current.present(PushRuleSets.userMention)
                val roomMention = current.present(PushRuleSets.roomMention)
                if (userMention.isEmpty()) Unavailable() else LevelRow(tr("settings.notifications.userMention"), userMention, current)
                SettingsDivider()
                if (roomMention.isEmpty()) Unavailable() else LevelRow(tr("settings.notifications.roomMention"), roomMention, current)
            }
            SettingsSection(tr("settings.notifications.keywordsLabel"), tr("settings.notifications.keywordsNote")) {
                SettingsItem {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                        WizardTextField(
                            keyword,
                            { keyword = it },
                            tr("settings.notifications.keywordPlaceholder"),
                            Modifier.weight(1f),
                            onSubmit = ::addKeyword,
                        )
                        PrimaryButton(
                            tr("common.add"),
                            ::addKeyword,
                            Modifier.width(WZ.SizeAvatar.xl),
                            enabled = !busy && keyword.isNotBlank(),
                        )
                    }
                    if (current.keywords.isEmpty()) {
                        Text(tr("settings.notifications.noKeywords"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                    }
                    FlowChips(current.keywords) { word ->
                        scope.launch { run { session.requireClient.removeNotificationKeyword(word) } }
                    }
                }
            }
        } else {
            Box(Modifier.fillMaxWidth().padding(WZ.Space.space6), contentAlignment = Alignment.Center) { Spinner() }
        }
        error?.let { StatusText(it) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowChips(items: List<String>, onRemove: (String) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        items.forEach { item ->
            Row(
                Modifier
                    .height(WZ.Space.space8)
                    .clip(CircleShape)
                    .background(theme.bgTertiary)
                    .padding(horizontal = WZ.Space.space4),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            ) {
                Text(item, style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.textPrimary)
                Box(Modifier.clip(CircleShape).clickable { onRemove(item) }) {
                    PhIcon("x", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textPrimary, contentDescription = tr("common.remove"))
                }
            }
        }
    }
}

@Composable
private fun LinkRow(text: String, onClick: () -> Unit) {
    SettingsSection {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = WZ.Space.space11)
                .clickable(onClick = onClick)
                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.accent)
            PhIcon("arrow-square-out", size = WZ.SizeIcon.sm, tint = theme.accent)
        }
    }
}

