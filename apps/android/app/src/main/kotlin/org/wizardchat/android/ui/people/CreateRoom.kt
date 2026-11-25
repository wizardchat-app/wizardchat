package org.wizardchat.android.ui.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.createRoom
import org.wizardchat.android.matrix.foundersRoomVersion
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.UserResult
import org.wizardchat.tokens.WZ

private enum class RoomAccess(
    val label: String,
    val icon: String,
    val hint: String,
    val spaceLabel: String? = null,
    val spaceHint: String? = null,
) {
    SpaceMembers("room.create.accessStandard", "users", "room.create.accessStandardNote"),
    Invite("room.create.accessInvite", "lock", "room.create.accessInviteNote", spaceLabel = "space.create.accessInvite"),
    Public(
        "room.create.accessPublic",
        "globe-simple",
        "room.create.accessPublicNote",
        spaceLabel = "space.create.public",
        spaceHint = "space.create.accessPublicNote",
    ),
}

/** A new text or voice room, optionally inside a space; or, with `onSpaceCreated`, a new space */
@Composable
fun CreateRoomSheet(
    spaceId: String?,
    onDismiss: () -> Unit,
    onSpaceCreated: ((String) -> Unit)? = null,
    onBack: (() -> Unit)? = null,
) {
    val isSpace = onSpaceCreated != null
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var isVoice by remember { mutableStateOf(false) }
    var access by remember { mutableStateOf(if (spaceId == null) RoomAccess.Invite else RoomAccess.SpaceMembers) }
    var encrypted by remember { mutableStateOf(true) }
    var federate by remember { mutableStateOf(true) }
    var starterRooms by remember { mutableStateOf(true) }
    var alias by remember { mutableStateOf("") }
    var foundersVersion by remember { mutableStateOf<String?>(null) }
    var founders by remember { mutableStateOf(listOf<UserResult>()) }
    var pickingFounders by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val server = (session.userId ?: "").split(":", limit = 2).last()
    val options = if (spaceId == null) listOf(RoomAccess.Invite, RoomAccess.Public) else RoomAccess.entries
    val isPublic = access == RoomAccess.Public

    LaunchedEffect(Unit) { foundersVersion = session.foundersRoomVersion() }

    fun create() {
        scope.launch {
            busy = true
            try {
                val roomId = session.createRoom(
                    name.trim(),
                    topic.ifEmpty { null },
                    isPublic,
                    encrypted,
                    isVoice,
                    alias.ifEmpty { null },
                    spaceId,
                    federate = federate,
                    spaceMembers = access == RoomAccess.SpaceMembers,
                    founders = founders.map { it.userId },
                    roomVersion = foundersVersion,
                    isSpace = isSpace,
                )
                if (isSpace && starterRooms) {
                    for ((key, voice) in listOf("space.create.starterChat" to false, "space.create.starterVoice" to true)) {
                        runCatching {
                            session.createRoom(L10n.format(key), null, false, true, voice, null, roomId, federate = federate, spaceMembers = true)
                        }
                    }
                }
                onDismiss()
                if (onSpaceCreated != null) {
                    onSpaceCreated(roomId)
                } else {
                    closeParents()
                    navigator.openRoom(roomId)
                }
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                busy = false
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetPage {
            SheetBar(
                tr(if (isSpace) "space.create.title" else if (spaceId == null) "nav.newRoom" else "space.newRoom"),
                leading = { if (onBack != null) BarTextButton(tr("common.back"), onBack) else BarTextButton(tr("common.cancel"), onDismiss) },
                trailing = {
                    if (busy) {
                        Box(Modifier.padding(horizontal = WZ.Space.space6)) { Spinner(size = WZ.SizeIcon.md) }
                    } else {
                        BarTextButton(tr("common.create"), ::create, enabled = name.isNotBlank(), bold = true)
                    }
                },
            )
            FormList(Modifier.weight(1f)) {
                item {
                    GroupedSection {
                        FormField(name, { name = it }, tr("common.name"))
                        RowDivider()
                        FormField(topic, { topic = it }, tr("room.create.topicOptional"), maxLines = 3)
                    }
                }
                if (isSpace) item {
                    GroupedSection {
                        ToggleRow(tr("space.create.starterRooms"), starterRooms, { starterRooms = it }, subtitle = tr("space.create.starterRoomsNote"))
                    }
                }
                if (!isSpace) item {
                    GroupedSection(header = tr("room.create.type")) {
                        GroupedRow(tr("room.create.typeChat"), icon = "hash-straight", subtitle = tr("room.create.typeChatNote"), onClick = { isVoice = false }) {
                            if (!isVoice) SelectedCheck()
                        }
                        RowDivider()
                        GroupedRow(tr("room.create.typeVoice"), icon = "speaker-high", subtitle = tr("room.create.typeVoiceNote"), onClick = { isVoice = true }) {
                            if (isVoice) SelectedCheck()
                        }
                    }
                }
                item {
                    GroupedSection(header = tr(if (isSpace) "space.create.access" else "room.create.access")) {
                        options.forEachIndexed { index, option ->
                            if (index > 0) RowDivider()
                            val label = if (isSpace) option.spaceLabel ?: option.label else option.label
                            val hint = if (isSpace) option.spaceHint ?: option.hint else option.hint
                            GroupedRow(tr(label), icon = option.icon, subtitle = tr(hint), onClick = {
                                access = option
                                encrypted = option != RoomAccess.Public
                            }) {
                                if (option == access) SelectedCheck()
                            }
                        }
                    }
                }
                if (isPublic) {
                    item {
                        GroupedSection(header = tr(if (isSpace) "space.create.roomAddress" else "room.create.roomAddress")) {
                            Row(
                                Modifier.padding(start = WZ.Space.space5, end = WZ.Space.space5),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
                            ) {
                                Text("#", style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
                                Box(Modifier.weight(1f)) {
                                    FormField(alias, { alias = it }, "address", plain = true, horizontalPadding = WZ.Space.space0)
                                }
                                Text(":$server", style = wizardFont(WZ.FontSize.lg), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                item {
                    GroupedSection {
                        if (!isPublic && !isSpace) {
                            ToggleRow(tr("room.create.e2ee"), encrypted, { encrypted = it }, subtitle = tr("room.create.e2eeNote"))
                            RowDivider()
                        }
                        ToggleRow(tr("room.create.federation"), federate, { federate = it }, subtitle = tr("room.create.federationNote"))
                    }
                }
                if (foundersVersion != null) {
                    item {
                        GroupedSection(header = tr("room.create.founders"), footer = tr("room.create.foundersNote")) {
                            PersonRow(session.displayName, session.userId ?: "", session.avatarUrl, null)
                            founders.forEach { founder ->
                                RowDivider()
                                PersonRow(founder.displayName, founder.userId, founder.avatarUrl, null) {
                                    BarButton(
                                        "x",
                                        tr("common.remove"),
                                        { founders = founders.filter { it.userId != founder.userId } },
                                        tint = theme.textMuted,
                                        size = WZ.SizeIcon.sm,
                                    )
                                }
                            }
                            RowDivider()
                            GroupedRow(tr("common.add"), icon = "user-plus", iconTint = theme.accent, onClick = { pickingFounders = true })
                        }
                    }
                }
                item { ErrorText(error) }
            }
        }
    }

    if (pickingFounders) {
        UserPickerSheet(
            UserPickerMode.Select,
            { pickingFounders = false },
            title = tr("room.create.founders"),
            exclude = founders.map { it.userId }.toSet() + listOfNotNull(session.userId),
            onSelect = { picked -> founders = founders + picked.filter { new -> founders.none { it.userId == new.userId } } },
        )
    }
}

@Composable
private fun SelectedCheck() {
    PhIcon("check", PhWeight.bold, size = WZ.SizeIcon.md, tint = theme.accent)
}
