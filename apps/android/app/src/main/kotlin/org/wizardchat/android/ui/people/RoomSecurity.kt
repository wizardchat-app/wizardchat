package org.wizardchat.android.ui.people

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.settings.PickerRow
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

/** Who can join, who can read history and encryption, for a room, DM or space */
@Composable
internal fun RoomSecurityScreen(roomId: String, space: Boolean, direct: Boolean, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var access by remember { mutableStateOf("invite") }
    var history by remember { mutableStateOf("joined") }
    var allowedSpaces by remember { mutableStateOf<List<String>>(emptyList()) }
    var parentSpace by remember { mutableStateOf<String?>(null) }
    var encrypted by remember { mutableStateOf(false) }
    var canSetJoinRules by remember { mutableStateOf(false) }
    var canSetHistory by remember { mutableStateOf(false) }
    var canEnableEncryption by remember { mutableStateOf(false) }
    var confirmEncryption by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(roomId) {
        val client = session.client ?: return@LaunchedEffect
        val info = runCatching { client.roomDetails(roomId) }.getOrNull()
        encrypted = info?.isEncrypted ?: false
        canEnableEncryption = info?.permissions?.enableEncryption ?: false
        runCatching { client.localRoomSettings(roomId) }.getOrNull()?.let { settings ->
            access = joinRuleToAccess(settings.joinRule)
            history = settings.historyVisibility
            allowedSpaces = settings.joinAllowedSpaces
        }
        if (!direct) {
            if (!space) {
                parentSpace = runCatching { client.spaceGraph() }.getOrNull()
                    ?.firstOrNull { node -> node.children.any { it.roomId == roomId } }?.spaceId
                canSetHistory = session.canSendState("m.room.history_visibility", roomId)
            }
            canSetJoinRules = session.canSendState("m.room.join_rules", roomId)
        }
    }

    fun run(action: suspend () -> Unit) {
        if (saving) return
        scope.launch {
            saving = true
            try {
                action()
                error = null
            } catch (e: Exception) {
                error = L10n.format("common.saveFailed", errorText(e))
            } finally {
                saving = false
            }
        }
    }

    fun changeAccess(value: String) {
        if (value == access) return
        run {
            val allowed = if (value == "restricted") parentSpace?.let { listOf(it) } ?: allowedSpaces else emptyList()
            session.requireClient.setJoinRule(roomId, value, allowed)
            access = value
            if (value == "restricted") allowedSpaces = allowed
        }
    }

    fun changeHistory(value: String) {
        if (value == history) return
        run {
            session.requireClient.setHistoryVisibility(roomId, value)
            history = value
        }
    }

    SheetPage {
        WizardTopBar(tr("room.settings.security.title"), onBack = onBack)
        FormList(Modifier.weight(1f)) {
            item {
                GroupedSection {
                    if (!direct) {
                        PickerRow(
                            tr(if (space) "space.create.access" else "room.settings.security.access"),
                            access,
                            buildList {
                                add("invite" to tr(if (space) "room.settings.security.accessInviteSpace" else "room.settings.security.accessInvite"))
                                if (access == "restricted" || parentSpace != null) {
                                    add("restricted" to tr("room.settings.security.accessSpaceMembers"))
                                }
                                add("knock" to tr("room.settings.security.accessKnock"))
                                add("public" to tr("room.settings.security.accessPublic"))
                            },
                            ::changeAccess,
                            enabled = canSetJoinRules && !saving,
                        )
                    }
                    if (!direct && !space) {
                        RowDivider()
                        PickerRow(
                            tr("room.settings.security.messageHistory"),
                            history,
                            listOf(
                                "world_readable" to tr("room.settings.security.historyAnyone"),
                                "shared" to tr("room.settings.security.historyShared"),
                                "invited" to tr("room.settings.security.historyInvited"),
                                "joined" to tr("room.settings.security.historyMembersSinceJoin"),
                            ),
                            ::changeHistory,
                            note = tr("room.settings.security.historyNote"),
                            enabled = canSetHistory && !saving,
                        )
                    }
                    if (!space) {
                        if (!direct) RowDivider()
                        GroupedRow(
                            tr("room.settings.general.e2ee"),
                            Modifier.alpha(if (encrypted || canEnableEncryption) 1f else WZ.Opacity.disabled),
                            subtitle = tr(if (encrypted) "room.settings.general.encryptionEnabledNote" else "room.settings.general.encryptionNote"),
                        ) {
                            WizardSwitch(encrypted, { if (it && canEnableEncryption && !saving) confirmEncryption = true })
                        }
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    if (confirmEncryption) {
        val confirm = tr("room.settings.general.encryptionConfirm")
        ConfirmDialog(
            title = tr("room.settings.general.e2ee"),
            confirmLabel = tr("common.confirm"),
            message = if (access == "public") tr("room.settings.general.encryptionPublicRoomWarning") + "\n\n" + confirm else confirm,
            onConfirm = {
                scope.launch {
                    saving = true
                    try {
                        session.requireClient.enableEncryption(roomId)
                        encrypted = true
                    } catch (e: Exception) {
                        error = L10n.format("room.settings.general.encryptionEnableFailed", errorText(e))
                    } finally {
                        saving = false
                    }
                }
            },
            onDismiss = { confirmEncryption = false },
        )
    }
}

private fun joinRuleToAccess(rule: String): String = when (rule) {
    "public" -> "public"
    "knock", "knock_restricted" -> "knock"
    "restricted" -> "restricted"
    else -> "invite"
}
