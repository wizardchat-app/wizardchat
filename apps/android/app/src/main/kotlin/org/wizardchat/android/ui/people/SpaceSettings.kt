package org.wizardchat.android.ui.people

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.addChild
import org.wizardchat.android.matrix.canSendState
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.SpaceSummary
import org.wizardchat.tokens.WZ

/** A space's details, rooms and settings */
@Composable
fun SpaceSettingsSheet(space: SpaceSummary, roomList: RoomListModel, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var stack by remember { mutableStateOf(listOf<PeoplePage>()) }
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var original by remember { mutableStateOf<Pair<String, String>?>(null) }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var canEdit by remember { mutableStateOf(false) }
    var canManageRooms by remember { mutableStateOf(false) }
    var childIds by remember { mutableStateOf(listOf<String>()) }
    var hierarchy by remember { mutableStateOf(mapOf<String, Pair<String, String?>>()) }
    var showAddRooms by remember { mutableStateOf(false) }
    var showCreateRoom by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloads by remember { mutableIntStateOf(0) }

    LaunchedEffect(reloads) {
        val client = session.client ?: return@LaunchedEffect
        val info = runCatching { client.roomDetails(space.id) }.getOrNull()
        if (original == null) {
            name = info?.name ?: space.name
            topic = info?.topic ?: ""
            original = name to topic
        }
        avatarUrl = info?.avatarUrl ?: space.avatarUrl
        canEdit = info?.permissions?.changeName ?: false
        canManageRooms = session.canSendState("m.space.child", space.id)
        val children = runCatching { client.spaceChildren(space.id) }.getOrDefault(emptyList())
        hierarchy = hierarchy + children.associate { it.id to (it.name to it.avatarUrl) }
        childIds = children.map { it.id }
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { roomList.room(it)?.displayName ?: it })
    }

    fun save() {
        scope.launch {
            saving = true
            try {
                if (name != original?.first) session.requireClient.setRoomName(space.id, name)
                if (topic != original?.second) session.requireClient.setRoomTopic(space.id, topic)
                original = name to topic
                error = null
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                saving = false
            }
        }
    }

    fun remove(roomId: String) {
        scope.launch {
            try {
                session.requireClient.removeFromSpace(space.id, roomId)
                childIds = childIds.filter { it != roomId }
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    val pickAvatar = rememberImagePicker { uri ->
        scope.launch {
            saving = true
            try {
                val jpeg = avatarJpeg(context, uri) ?: return@launch
                session.requireClient.setRoomAvatar(space.id, jpeg, "image/jpeg")
                delay(500)
                avatarUrl = runCatching { session.client?.roomDetails(space.id) }.getOrNull()?.avatarUrl
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                saving = false
            }
        }
    }

    val push = { page: PeoplePage -> stack = stack + page }
    val pop = { stack = stack.dropLast(1) }

    WizardSheet(onDismiss) {
        CompositionLocalProvider(LocalCloseParents provides onDismiss) {
            BackHandler(enabled = stack.isNotEmpty()) { pop() }
            val page = stack.lastOrNull()
            if (page != null) {
                SharedPage(page, push, pop)
            } else {
                SheetPage {
                    SheetBar(tr("space.settingsTitle"), trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
                    FormList(Modifier.weight(1f)) {
                        item {
                            Column(
                                Modifier.fillMaxWidth().padding(top = WZ.Space.space6, start = WZ.Space.space6, end = WZ.Space.space6),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                            ) {
                                AvatarWithBadge(
                                    space.name,
                                    avatarUrl,
                                    canEdit,
                                    saving,
                                    pickAvatar,
                                    cornerRadius = WZ.Radius.xl,
                                    badgeSize = WZ.Space.space8,
                                    bordered = false,
                                )
                                Text(name.ifEmpty { space.name }, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary)
                            }
                        }

                        if (canEdit) {
                            item {
                                GroupedSection(header = tr("settings.about.title")) {
                                    FormField(name, { name = it }, tr("common.name"))
                                    RowDivider()
                                    FormField(topic, { topic = it }, tr("room.topic"), maxLines = 4)
                                    RowDivider()
                                    ActionRow(tr("common.save"), null, ::save, enabled = !saving && (name to topic) != original)
                                }
                            }
                        }

                        item {
                            GroupedSection(header = tr("nav.rooms"), footer = if (canManageRooms) tr("space.swipeToRemoveHint") else null) {
                                childIds.forEachIndexed { index, roomId ->
                                    if (index > 0) RowDivider()
                                    if (canManageRooms) {
                                        RemovableRow(onRemove = { remove(roomId) }) { ChildRow(roomId, roomList, hierarchy) }
                                    } else {
                                        ChildRow(roomId, roomList, hierarchy)
                                    }
                                }
                                if (canManageRooms) {
                                    if (childIds.isNotEmpty()) RowDivider()
                                    ActionRow(tr("room.create.title"), "plus", { showCreateRoom = true })
                                    RowDivider()
                                    ActionRow(tr("space.addExistingRooms"), "stack-plus", { showAddRooms = true })
                                }
                            }
                        }

                        item {
                            GroupedSection {
                                NavRow(tr("common.members"), "users", { push(PeoplePage.Members(space.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.permissions.title"), "shield-check", { push(PeoplePage.Roles(space.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.emojis.title"), "smiley", { push(PeoplePage.Packs(space.id)) })
                                RowDivider()
                                NavRow(tr("room.settings.sounds.title"), "vinyl-record", { push(PeoplePage.SoundPacks(space.id)) })
                                RowDivider()
                                CopyRow(tr("space.copyLink"), "link-simple", "https://matrix.to/#/${space.id}")
                            }
                        }

                        item {
                            GroupedSection {
                                ActionRow(tr("space.leave"), "sign-out", { confirmLeave = true }, theme.danger)
                            }
                        }
                        item { ErrorText(error) }
                    }
                }

                if (confirmLeave) {
                    ConfirmDialog(
                        title = L10n.format("room.info.leaveConfirm", space.name),
                        confirmLabel = tr("common.leave"),
                        onConfirm = {
                            scope.launch {
                                runCatching { session.client?.leave(space.id) }
                                onDismiss()
                            }
                        },
                        onDismiss = { confirmLeave = false },
                    )
                }
                if (showAddRooms) {
                    AddRoomsToSpaceSheet(space, roomList, childIds.toSet()) {
                        showAddRooms = false
                        reloads++
                    }
                }
                if (showCreateRoom) {
                    CreateRoomSheet(space.id, onDismiss = {
                        showCreateRoom = false
                        reloads++
                    })
                }
            }
        }
    }
}

@Composable
private fun ChildRow(roomId: String, roomList: RoomListModel, hierarchy: Map<String, Pair<String, String?>>) {
    val room = roomList.room(roomId)
    val name = room?.displayName ?: hierarchy[roomId]?.first ?: roomId
    Row(
        Modifier
            .fillMaxWidth()
            .background(theme.groupedRow)
            .heightIn(min = WZ.Space.space11)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Avatar(name, room?.avatarUrl ?: hierarchy[roomId]?.second, WZ.SizeAvatar.sm)
        Text(name, Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (room == null) Text(tr("space.notJoined"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
    }
}

/** A row with a trailing swipe action that removes it */
@Composable
private fun RemovableRow(onRemove: () -> Unit, content: @Composable () -> Unit) {
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) onRemove()
            false
        },
    )
    SwipeToDismissBox(
        state,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Row(
                Modifier.fillMaxSize().background(theme.danger).padding(horizontal = WZ.Space.space8),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(tr("common.remove"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
            }
        },
    ) {
        content()
    }
}

/** Picks joined rooms to add to a space */
@Composable
private fun AddRoomsToSpaceSheet(space: SpaceSummary, roomList: RoomListModel, existing: Set<String>, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf(setOf<String>()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val candidates = roomList.joinedRooms
        .filter { !it.isDirect && it.id !in existing }
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })

    fun add() {
        scope.launch {
            busy = true
            try {
                for (roomId in selected) session.addChild(roomId, space.id)
                onDismiss()
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
                tr("space.addRooms"),
                leading = { BarTextButton(tr("common.cancel"), onDismiss) },
                trailing = { BarTextButton(tr("common.add"), ::add, enabled = selected.isNotEmpty() && !busy, bold = true) },
            )
            Box(Modifier.weight(1f)) {
                FormList {
                    if (candidates.isNotEmpty()) {
                        item {
                            GroupedSection {
                                candidates.forEachIndexed { index, room ->
                                    if (index > 0) RowDivider()
                                    val on = room.id in selected
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable { selected = if (on) selected - room.id else selected + room.id }
                                            .heightIn(min = WZ.Space.space11)
                                            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                                    ) {
                                        Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.sm)
                                        Text(
                                            room.displayName,
                                            Modifier.weight(1f),
                                            style = wizardFont(WZ.FontSize.lg),
                                            color = theme.textPrimary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        PhIcon(
                                            if (on) "check-circle" else "circle",
                                            if (on) PhWeight.fill else PhWeight.regular,
                                            size = WZ.SizeIcon.lg,
                                            tint = theme.accent,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    item { ErrorText(error) }
                }
                if (candidates.isEmpty()) {
                    EmptyState(tr("space.noOtherRooms"), "hash-straight", Modifier.align(Alignment.Center))
                }
            }
        }
    }
}
