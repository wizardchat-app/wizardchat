package org.wizardchat.android.ui.settings

import android.text.format.DateUtils
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.accountManagementUrl
import org.wizardchat.android.matrix.deleteDevices
import org.wizardchat.android.matrix.deviceId
import org.wizardchat.android.matrix.enableRecovery
import org.wizardchat.android.matrix.isOAuthAccount
import org.wizardchat.android.matrix.recover
import org.wizardchat.android.matrix.resetRecoveryKey
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.SecondaryButton
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.DeviceInfo
import org.wizardchat.tokens.WZ

private val DeviceInfo.name: String? get() = displayName

/** Devices, verification and the recovery key */
@Composable
internal fun SessionsSettings(onBack: (() -> Unit)?, onDone: (() -> Unit)? = null) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var devices by remember { mutableStateOf(listOf<DeviceInfo>()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showRecoveryKeyEntry by remember { mutableStateOf(false) }
    var verification by remember { mutableStateOf<VerificationModel?>(null) }
    var newRecoveryKey by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf<DeviceInfo?>(null) }
    val isVerified = session.encryption?.deviceVerified == true
    val recoveryDisabled = session.encryption?.recovery == "disabled"

    suspend fun reload() {
        loading = true
        try {
            devices = session.requireClient.devices().sortedByDescending { it.lastSeenTs ?: Long.MIN_VALUE }
            error = null
        } catch (failure: Exception) {
            error = L10n.format("settings.sessions.loadSessionsFailed", failure.text)
        } finally {
            loading = false
        }
    }

    fun rename(device: DeviceInfo, name: String) {
        scope.launch {
            try {
                session.requireClient.renameDevice(device.deviceId, name)
                reload()
            } catch (failure: Exception) {
                error = L10n.format("settings.sessions.renameSessionFailed", failure.text)
            }
        }
    }

    fun setUpRecovery(reset: Boolean) = scope.launch {
        try {
            newRecoveryKey = if (reset) session.resetRecoveryKey() else session.enableRecovery()
        } catch (failure: Exception) {
            error = L10n.format("settings.keyBackup.setupFailed", failure.text)
        }
    }

    LaunchedEffect(Unit) { reload() }

    SettingsPage(tr("settings.sessions.title"), onBack, onDone) {
        SettingsCard {
            Text(tr("settings.sessions.devicesDescription"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }

        SettingsSection(tr("settings.encryption.title")) {
            SettingsItem {
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    PhIcon(
                        if (isVerified) "shield-check" else "shield-warning",
                        size = WZ.SizeIcon.md,
                        tint = if (isVerified) theme.success else theme.danger,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                        Text(
                            if (isVerified) tr("common.verified") else tr("settings.sessions.unverified"),
                            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                            color = theme.textPrimary,
                        )
                        if (!isVerified) {
                            Text(tr("settings.encryption.enterRecoveryKeyNote"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                        }
                    }
                }
            }
            SettingsDivider()
            SettingsItem {
                if (!isVerified) {
                    LabelButton(tr("settings.encryption.verifyWithDevice"), "devices", { verification = VerificationModel(VerificationModel.Start.OwnDevice) }, primary = true)
                }
                if (recoveryDisabled) {
                    LabelButton(tr("settings.encryption.setUpRecoveryKey"), "key", { setUpRecovery(reset = false) })
                } else {
                    LabelButton(tr("settings.keyBackup.enterRecoveryKeyTitle"), "lock-open", { showRecoveryKeyEntry = true })
                    if (isVerified) {
                        LabelButton(tr("settings.encryption.resetKeys"), "arrow-counter-clockwise", { setUpRecovery(reset = true) })
                    }
                }
            }
        }

        if (loading) {
            SettingsCard {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Spinner() }
            }
        }
        devices.firstOrNull { it.deviceId == session.deviceId }?.let { current ->
            SettingsSection(tr("settings.sessions.currentDevice")) {
                DeviceRow(current, verified = isVerified, onRename = ::rename, onRemove = null)
            }
        }
        val others = devices.filter { it.deviceId != session.deviceId }
        if (others.isNotEmpty()) {
            SettingsSection(tr("settings.sessions.yourDevices")) {
                others.forEachIndexed { index, device ->
                    if (index > 0) SettingsDivider()
                    DeviceRow(
                        device,
                        verified = device.isVerified,
                        onRename = ::rename,
                        onRemove = { removing = it },
                        onVerify = if (device.isVerified) null else { other -> verification = VerificationModel(VerificationModel.Start.Device(other.deviceId)) },
                    )
                }
            }
        } else if (!loading && devices.isEmpty()) {
            SettingsCard {
                Text(tr("settings.sessions.noSessionsFound"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }
        error?.let { StatusText(it) }
    }

    if (showRecoveryKeyEntry) RecoveryKeyEntrySheet { showRecoveryKeyEntry = false }
    verification?.let { model ->
        VerificationSheet(model) {
            verification = null
            scope.launch { reload() }
        }
    }
    removing?.let { device ->
        RemoveDeviceSheet(device, onRemoved = { reload() }) { removing = null }
    }
    newRecoveryKey?.let { key ->
        AlertDialog(
            onDismissRequest = { newRecoveryKey = null },
            containerColor = theme.bgTertiary,
            title = { Text(tr("settings.encryption.setUpRecoveryKey"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
            text = {
                SelectionContainer {
                    Text(tr("settings.encryption.recoveryKeySaveHint", key), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    copyToClipboard(key)
                    newRecoveryKey = null
                }) { Text(tr("common.copy"), color = theme.accent, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold)) }
            },
            dismissButton = {
                TextButton(onClick = { newRecoveryKey = null }) {
                    Text(tr("common.done"), color = theme.accent, style = wizardFont(WZ.FontSize.lg))
                }
            },
        )
    }
}

@Composable
private fun DeviceRow(
    device: DeviceInfo,
    verified: Boolean?,
    onRename: (DeviceInfo, String) -> Unit,
    onRemove: ((DeviceInfo) -> Unit)?,
    onVerify: ((DeviceInfo) -> Unit)? = null,
) {
    var showDetails by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    val icon = run {
        val name = (device.name ?: "").lowercase()
        when {
            "ios" in name || "iphone" in name || "android" in name -> "device-mobile"
            "web" in name || "browser" in name -> "globe-simple"
            else -> "desktop"
        }
    }

    SettingsItem(Modifier.animateContentSize()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Box(Modifier.width(WZ.Space.space8), contentAlignment = Alignment.Center) {
                PhIcon(icon, size = WZ.SizeIcon.md, tint = theme.textMuted)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    Text(
                        device.name ?: device.deviceId,
                        Modifier.weight(1f, fill = false),
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = theme.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (verified != null) {
                        val label = if (verified) tr("common.verified") else tr("settings.sessions.unverified")
                        Box(
                            Modifier
                                .size(WZ.Space.space4)
                                .clip(CircleShape)
                                .background(if (verified) theme.success else theme.danger)
                                .semantics { contentDescription = label },
                        )
                    }
                }
                device.lastSeenTs?.let { ts ->
                    val relative = DateUtils.getRelativeTimeSpanString(ts, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
                    Text(
                        tr("settings.sessions.lastActivity") + " " + relative,
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                    )
                }
            }
            Box {
                Box(
                    Modifier.size(WZ.Space.space9).clip(CircleShape).clickable { menuOpen = true },
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("dots-three", PhWeight.bold, tint = theme.textMuted, contentDescription = tr("common.menu"))
                }
                WizardMenu(
                    menuOpen,
                    { menuOpen = false },
                    buildList {
                        add(
                            MenuItem(tr("common.rename"), "pencil-simple") {
                                newName = device.name ?: ""
                                renaming = true
                            },
                        )
                        if (onRemove != null) add(MenuItem(tr("common.remove"), "trash", destructive = true) { onRemove(device) })
                    },
                )
            }
        }
        onVerify?.let { verify ->
            SecondaryButton(tr("settings.sessions.verify"), { verify(device) })
        }
        if (renaming) {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                    WizardTextField(newName, { newName = it }, "", Modifier.weight(1f))
                    PrimaryButton(tr("common.save"), {
                        onRename(device, newName)
                        renaming = false
                    }, Modifier.width(WZ.SizeAvatar.xl))
                    SecondaryButton(tr("common.cancel"), { renaming = false }, Modifier.width(WZ.SizeAvatar.xl))
                }
                Text(tr("settings.sessions.renameSessionHint"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            }
        }
        Text(
            if (showDetails) tr("settings.sessions.hideDetails") else tr("settings.sessions.showDetails"),
            Modifier.clickable { showDetails = !showDetails },
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.accent,
        )
        if (showDetails) {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
                Detail(tr("settings.sessions.deviceId"), device.deviceId)
                device.lastSeenIp?.let { Detail(tr("settings.sessions.ipAddress"), it) }
            }
        }
    }
}

@Composable
private fun Detail(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        Text(label, style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        SelectionContainer { Text(value, style = wizardFont(WZ.FontSize.sm), color = theme.textPrimary) }
    }
}

/** The body of a small sheet: title bar with Cancel, then padded content */
@Composable
private fun SmallSheet(title: String, onDismiss: () -> Unit, onCancel: () -> Unit = onDismiss, content: @Composable () -> Unit) {
    WizardSheet(onDismiss) {
        SheetTopBar("", leading = { BarTextButton(tr("common.cancel"), onCancel) })
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
                .padding(WZ.Space.space6),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            Text(title, style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary)
            content()
        }
    }
}

@Composable
private fun RemoveDeviceSheet(device: DeviceInfo, onRemoved: suspend () -> Unit, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    SmallSheet(tr("settings.sessions.removeSession"), onDismiss) {
        Text(tr("settings.sessions.removeConfirm", device.name ?: device.deviceId), style = wizardFont(WZ.FontSize.md), color = theme.textPrimary)
        if (session.isOAuthAccount) {
            Text(tr("settings.sessions.sessionNotSupported"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
            PrimaryButton(tr("settings.account.manageAccount"), {
                scope.launch {
                    session.accountManagementUrl()?.let(uriHandler::openUri)
                    onDismiss()
                }
            })
        } else {
            WizardTextField(password, { password = it }, tr("settings.sessions.passwordPlaceholder"), password = true)
            DangerButton(
                tr("settings.sessions.confirmRemove"),
                {
                    scope.launch {
                        busy = true
                        try {
                            session.deleteDevices(listOf(device.deviceId), password)
                            onRemoved()
                            onDismiss()
                        } catch (_: Exception) {
                            error = L10n.format("settings.sessions.incorrectPassword")
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy && password.isNotEmpty(),
            )
        }
        error?.let { InlineStatus(it) }
    }
}

@Composable
internal fun RecoveryKeyEntrySheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var key by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    SmallSheet(tr("settings.keyBackup.enterRecoveryKeyTitle"), onDismiss) {
        Text(tr("settings.encryption.enterRecoveryKeyNote"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
        androidx.compose.material3.TextField(
            value = key,
            onValueChange = { key = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("EsTc ...", color = theme.textMuted, style = TextStyle(fontFamily = FontFamily.Monospace)) },
            textStyle = TextStyle(fontSize = WZ.FontSize.md, fontFamily = FontFamily.Monospace, color = theme.textPrimary),
            minLines = 2,
            maxLines = 4,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                autoCorrectEnabled = false,
                capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.None,
            ),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(WZ.Radius.lg),
            colors = androidx.compose.material3.TextFieldDefaults.colors(
                focusedContainerColor = theme.fill,
                unfocusedContainerColor = theme.fill,
                focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                cursorColor = theme.accent,
            ),
        )
        PrimaryButton(
            if (busy) "..." else tr("settings.keyBackup.restoreBtn"),
            {
                scope.launch {
                    busy = true
                    try {
                        session.recover(key)
                        onDismiss()
                    } catch (_: Exception) {
                        error = L10n.format("settings.encryption.wrongKey")
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && key.isNotBlank(),
        )
        error?.let { InlineStatus(it) }
    }
}
