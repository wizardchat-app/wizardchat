package org.wizardchat.android.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ignore
import org.wizardchat.android.matrix.profile
import org.wizardchat.android.matrix.startDirectMessage
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.Member
import org.wizardchat.core.MutualRoom
import org.wizardchat.tokens.WZ

/** A room's members grouped by role (a page inside room info or space settings) */
@Composable
internal fun MembersScreen(roomId: String, onBack: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var members by remember { mutableStateOf(listOf<Member>()) }
    var loaded by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<String?>(null) }
    var showInvite by remember { mutableStateOf(false) }
    var canInvite by remember { mutableStateOf(false) }

    suspend fun load() {
        val client = session.client ?: return
        members = runCatching { client.members(roomId) }.getOrDefault(emptyList())
        canInvite = runCatching { client.roomDetails(roomId) }.getOrNull()?.permissions?.invite ?: false
        loaded = true
    }
    LaunchedEffect(roomId) { load() }

    val filtered = if (search.isEmpty()) {
        members
    } else {
        members.filter { (it.displayName ?: "").contains(search, ignoreCase = true) || it.userId.contains(search, ignoreCase = true) }
    }
    val joined = filtered.filter { !it.isInvite }
    fun role(member: Member) = if (member.level >= 100) 0 else if (member.level >= 50) 1 else 2
    fun sorted(list: List<Member>) = list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
    val groups = listOf(
        "room.members.admins" to sorted(joined.filter { role(it) == 0 }),
        "room.members.moderators" to sorted(joined.filter { role(it) == 1 }),
        "common.members" to sorted(joined.filter { role(it) == 2 }),
        "room.members.invited" to sorted(filtered.filter { it.isInvite }),
    ).filter { it.second.isNotEmpty() }

    SheetPage {
        WizardTopBar(tr("common.members"), onBack = onBack)
        WizardTextField(
            search,
            { search = it },
            tr("room.settings.members.searchMembers"),
            Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        )
        Box(Modifier.weight(1f)) {
            FormList {
                if (canInvite) {
                    item {
                        GroupedSection {
                            ActionRow(tr("room.members.invite"), "user-plus", { showInvite = true })
                        }
                    }
                }
                groups.forEach { (title, list) ->
                    item(key = title) {
                        GroupedSection(header = "${tr(title)}  ${list.size}") {
                            list.forEachIndexed { index, member ->
                                if (index > 0) RowDivider()
                                MemberRow(member) { selected = member.userId }
                            }
                        }
                    }
                }
            }
            if (!loaded) Spinner(Modifier.align(Alignment.Center))
        }
    }

    selected?.let { userId ->
        UserProfileSheet(userId, roomId, onDismiss = { selected = null }, onChanged = { scope.launch { load() } })
    }
    if (showInvite) {
        UserPickerSheet(UserPickerMode.Invite, { showInvite = false }, roomId, onDone = { scope.launch { load() } })
    }
}

@Composable
private fun MemberRow(member: Member, onClick: () -> Unit) {
    PersonRow(member.displayName, member.userId, member.avatarUrl, onClick) {
        RoleBadge(member.level)
    }
}

private enum class ProfileAction { Kick, Ban, Ignore }

/** A user's profile and actions */
@Composable
fun UserProfileSheet(userId: String, roomId: String?, onDismiss: () -> Unit, onChanged: () -> Unit = {}) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val closeParents = LocalCloseParents.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf<String?>(null) }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var statusText by remember { mutableStateOf<String?>(null) }
    var rights by remember { mutableStateOf(RoleRights(0, false)) }
    var level by remember { mutableStateOf(0L) }
    var isMember by remember { mutableStateOf(false) }
    var canKick by remember { mutableStateOf(false) }
    var canBan by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<ProfileAction?>(null) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloads by remember { mutableIntStateOf(0) }
    var mutualRooms by remember { mutableStateOf<List<MutualRoom>>(emptyList()) }
    var mutualOpen by remember { mutableStateOf(false) }
    val isMe = userId == session.userId

    LaunchedEffect(userId) {
        if (!isMe) mutualRooms = runCatching { session.client?.mutualRooms(userId) }.getOrNull().orEmpty()
    }

    LaunchedEffect(userId, roomId, reloads) {
        val client = session.client
        val member = if (roomId != null && client != null) {
            runCatching { client.members(roomId) }.getOrNull()?.firstOrNull { it.userId == userId }
        } else {
            null
        }
        if (roomId != null && client != null && member != null) {
            name = member.displayName
            avatarUrl = member.avatarUrl
            level = member.level
            isMember = true
            rights = RoleRights.load(client, roomId)
            if (!isMe) {
                runCatching { client.roomDetails(roomId) }.getOrNull()?.permissions?.let { permissions ->
                    canKick = permissions.kick && level < rights.ownLevel
                    canBan = permissions.ban && level < rights.ownLevel
                }
            }
        }
        run {
            session.profile(userId)?.let { profile ->
                name = name ?: profile.displayName
                avatarUrl = avatarUrl ?: profile.avatarUrl
                statusText = profile.customStatus?.takeIf { (it.expiresAt ?: Long.MAX_VALUE) > System.currentTimeMillis() }?.text
            }
        }
    }

    fun message() {
        scope.launch {
            busy = true
            try {
                val room = session.startDirectMessage(userId)
                onDismiss()
                closeParents()
                navigator.openRoom(room)
            } catch (e: Exception) {
                error = errorText(e)
            } finally {
                busy = false
            }
        }
    }

    fun perform(action: ProfileAction) {
        val why = reason.ifEmpty { null }
        reason = ""
        scope.launch {
            try {
                when (action) {
                    ProfileAction.Kick -> if (roomId != null) session.requireClient.kick(roomId, userId, why)
                    ProfileAction.Ban -> if (roomId != null) session.requireClient.ban(roomId, userId, why)
                    ProfileAction.Ignore -> session.ignore(userId)
                }
                onChanged()
                onDismiss()
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetBar("", trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) })
        FormList {
            item {
                Column(
                    Modifier.fillMaxWidth().padding(top = WZ.Space.space4, start = WZ.Space.space6, end = WZ.Space.space6),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    Avatar(name ?: userId, avatarUrl, WZ.SizeAvatar.xl)
                    Text(
                        name ?: userId,
                        style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold),
                        color = theme.textPrimary,
                        textAlign = TextAlign.Center,
                    )
                    SelectionContainer {
                        Text(userId, style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                    }
                    statusText?.let {
                        Text(it, style = wizardFont(WZ.FontSize.md), color = theme.textSecondary, textAlign = TextAlign.Center)
                    }
                    if (isMember) RoleBadge(level)
                }
            }
            if (roomId != null && isMember && rights.canChange(level, isMe)) {
                item {
                    GroupedSection {
                        RoleMenu(roomId, userId, level, rights) {
                            reloads++
                            onChanged()
                        }
                    }
                }
            }
            if (mutualRooms.isNotEmpty()) {
                item {
                    GroupedSection {
                        GroupedRow(
                            L10n.plural("profile.mutualRooms", mutualRooms.size, mutualRooms.size),
                            icon = "users-three",
                            iconTint = theme.accent,
                            onClick = { mutualOpen = !mutualOpen },
                        ) {
                            PhIcon(
                                "caret-down",
                                size = WZ.SizeIcon.sm,
                                tint = theme.textMuted,
                                modifier = Modifier.rotate(if (mutualOpen) 180f else 0f),
                            )
                        }
                        if (mutualOpen) {
                            listOf(
                                tr("nav.spaces") to mutualRooms.filter { it.isSpace },
                                tr("nav.rooms") to mutualRooms.filter { !it.isSpace && !it.isDirect },
                                tr("room.dm.directMessages") to mutualRooms.filter { !it.isSpace && it.isDirect },
                            ).filter { it.second.isNotEmpty() }.forEach { (title, rooms) ->
                                RowDivider()
                                Text(
                                    title,
                                    Modifier.padding(start = WZ.Space.space5, top = WZ.Space.space3, bottom = WZ.Space.space1),
                                    style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                                    color = theme.textMuted,
                                )
                                rooms.forEach { room ->
                                    MutualRoomRow(room) {
                                        onDismiss()
                                        closeParents()
                                        if (room.isSpace) navigator.openSpace(room.roomId) else navigator.openRoom(room.roomId)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!isMe) {
                item {
                    GroupedSection {
                        ActionRow(tr("composer.messageInput"), "chat-circle", ::message, enabled = !busy)
                    }
                }
            }
            item {
                GroupedSection {
                    CopyRow(tr("profile.copyId"), "copy", userId)
                    RowDivider()
                    CopyRow(tr("common.copyLink"), "link-simple", "https://matrix.to/#/$userId")
                }
            }
            if (!isMe) {
                item {
                    GroupedSection(footer = tr("room.members.ignoreHint")) {
                        if (canKick) {
                            ActionRow(tr("profile.kick"), "user-minus", { confirm = ProfileAction.Kick }, theme.danger)
                            RowDivider()
                        }
                        if (canBan) {
                            ActionRow(tr("room.members.ban"), "prohibit", { confirm = ProfileAction.Ban }, theme.danger)
                            RowDivider()
                        }
                        ActionRow(tr("profile.ignoreUser"), "eye-slash", { confirm = ProfileAction.Ignore }, theme.danger)
                    }
                }
            }
            item { ErrorText(error) }
        }
    }

    confirm?.let { action ->
        val who = name ?: userId
        val title = when (action) {
            ProfileAction.Kick -> L10n.format("room.members.removeConfirm", who)
            ProfileAction.Ban -> L10n.format("room.members.banConfirm", who)
            ProfileAction.Ignore -> L10n.format("room.members.ignoreConfirm", who)
        }
        val label = when (action) {
            ProfileAction.Kick -> tr("common.remove")
            ProfileAction.Ban -> tr("room.members.ban")
            ProfileAction.Ignore -> tr("profile.ignoreUser")
        }
        TextFieldDialog(
            title,
            reason,
            { reason = it },
            tr("common.reasonOptional"),
            label,
            onConfirm = { perform(action) },
            onDismiss = { confirm = null },
            destructive = true,
            showField = action != ProfileAction.Ignore,
        )
    }
}

/** What the signed-in user may do with roles in a room */
internal data class RoleRights(val ownLevel: Long, val canEditLevels: Boolean) {
    fun canChange(targetLevel: Long, isSelf: Boolean) = canEditLevels && (isSelf || targetLevel < ownLevel)

    fun canAssign(level: Long) = canEditLevels && level <= ownLevel

    companion object {
        suspend fun load(client: org.wizardchat.core.WizardClient?, roomId: String): RoleRights {
            val details = runCatching { client?.roomDetails(roomId) }.getOrNull() ?: return RoleRights(0, false)
            return RoleRights(details.ownPowerLevel ?: Long.MAX_VALUE, details.permissions.changePermissions)
        }
    }
}

internal enum class RoleLevel(val value: Long, val titleKey: String, val whoKey: String) {
    Member(0, "room.members.member", "room.members.everyone"),
    Moderator(50, "room.members.moderator", "room.members.moderators"),
    Admin(100, "room.members.admin", "room.members.admins"),
    ;

    companion object {
        fun closest(level: Long) = if (level >= 100) Admin else if (level >= 50) Moderator else Member
    }
}

/** The name of a power level: creator, admin, moderator, member or a custom number */
internal fun roleName(level: Long): String = when {
    level == Long.MAX_VALUE -> L10n.format("room.members.owner")
    level >= 100 -> L10n.format("room.members.admin")
    level >= 50 -> L10n.format("room.members.moderator")
    level == 0L -> L10n.format("room.members.member")
    else -> L10n.format("room.members.customLevel", "$level")
}

/** The role row in a profile; picking a level that can't be undone asks first */
@Composable
private fun RoleMenu(roomId: String, userId: String, currentLevel: Long, rights: RoleRights, onChanged: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var expanded by remember { mutableStateOf(false) }
    var confirmLevel by remember { mutableStateOf<RoleLevel?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val isSelf = userId == session.userId

    fun set(level: RoleLevel) {
        scope.launch {
            try {
                session.requireClient.setPowerLevel(roomId, userId, level.value.toDouble())
                error = null
                onChanged()
            } catch (e: Exception) {
                error = errorText(e)
            }
        }
    }

    Box {
        GroupedRow(tr("room.members.role"), icon = "shield-check", iconTint = theme.accent, onClick = { expanded = true }) {
            Text(roleName(currentLevel), style = wizardFont(WZ.FontSize.lg), color = theme.textMuted)
        }
        PickMenu(
            expanded,
            { expanded = false },
            RoleLevel.entries.map { level ->
                PickItem(tr(level.titleKey), checked = currentLevel == level.value, enabled = rights.canAssign(level.value)) {
                    // Making someone your equal, or lowering yourself, can't be undone by you
                    if ((level.value >= rights.ownLevel && !isSelf) || (isSelf && level.value < currentLevel)) {
                        confirmLevel = level
                    } else {
                        set(level)
                    }
                }
            },
        )
    }
    ErrorText(error)
    confirmLevel?.let { level ->
        ConfirmDialog(
            title = tr(if (isSelf) "room.members.selfDemoteTitle" else "room.members.equalLevelTitle"),
            confirmLabel = tr("room.members.changeRole"),
            onConfirm = { set(level) },
            onDismiss = { confirmLevel = null },
            message = tr(if (isSelf) "room.members.selfDemoteWarning" else "room.members.equalLevelWarning"),
        )
    }
}

@Composable
private fun MutualRoomRow(room: MutualRoom, onClick: () -> Unit) {
    val name = room.name ?: room.roomId
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(name, room.avatarUrl, WZ.SizeAvatar.sm)
        Text(
            name,
            Modifier.weight(1f),
            style = wizardFont(WZ.FontSize.md),
            color = theme.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
