package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.SheetTopBar
import org.wizardchat.android.ui.UnreadBadge
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.UnreadThread
import org.wizardchat.tokens.WZ

private enum class InboxTab { invites, mentions, threads }

/** Invites and rooms that mention you */
@Composable
fun InboxSheet(
    roomList: RoomListModel,
    onDismiss: () -> Unit,
    onOpenRoom: (String) -> Unit,
    onOpenSpace: (String) -> Unit,
    onOpenThread: (String, String) -> Unit,
) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(InboxTab.invites) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val inviters = remember { mutableStateMapOf<String, String>() }
    var threads by remember { mutableStateOf(listOf<Pair<RoomSummary, UnreadThread>>()) }
    LaunchedEffect(roomList.threadRooms.map { Triple(it.id, it.unreadThreads, it.lastActivity) }) {
        val client = session.client ?: return@LaunchedEffect
        threads = roomList.threadRooms
            .flatMap { room -> runCatching { client.unreadThreads(room.id) }.getOrDefault(emptyList()).map { room to it } }
            .sortedByDescending { it.second.latestTimestamp }
    }

    fun accept(invite: RoomSummary) {
        scope.launch {
            busyId = invite.id
            errorMessage = null
            try {
                roomList.accept(invite)
                if (roomList.spaces.any { it.id == invite.id }) onOpenSpace(invite.id) else onOpenRoom(invite.id)
                onDismiss()
            } catch (e: Exception) {
                errorMessage = L10n.format("inbox.failedToAcceptInvite", e.message ?: e.toString())
            } finally {
                busyId = null
            }
        }
    }

    fun decline(invite: RoomSummary) {
        scope.launch {
            busyId = invite.id
            errorMessage = null
            try {
                roomList.decline(invite)
            } catch (e: Exception) {
                errorMessage = L10n.format("inbox.failedToDeclineInvite", e.message ?: e.toString())
            } finally {
                busyId = null
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetTopBar(
            tr("inbox.title"),
            trailing = { BarTextButton(tr("common.done"), onDismiss, bold = true) },
        )
        Column(Modifier.fillMaxWidth().background(theme.bgSecondary)) {
            Tabs(tab, roomList.invites.size, roomList.mentionRooms.size, threads.size) { tab = it }
            errorMessage?.let {
                Text(it, Modifier.padding(horizontal = WZ.Space.space8, vertical = WZ.Space.space3), style = wizardFont(WZ.FontSize.sm), color = theme.error)
            }
            LazyColumn(
                Modifier.weight(1f, fill = false),
                contentPadding = PaddingValues(vertical = WZ.Space.space3),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
            ) {
                when (tab) {
                    InboxTab.invites -> item(key = "invites") {
                        if (roomList.invites.isEmpty()) {
                            Empty(tr("inbox.emptyInvites"), "tray")
                        } else {
                            GroupedSection {
                                roomList.invites.forEachIndexed { index, invite ->
                                    if (index > 0) RowDivider()
                                    LaunchedEffect(invite.id) {
                                        val info = runCatching { session.client?.inviteInfo(invite.id) }.getOrNull()
                                        if (info != null) inviters[invite.id] = info.inviterName ?: info.inviterId
                                    }
                                    InviteRow(invite, inviters[invite.id], busyId == invite.id, { accept(invite) }, { decline(invite) })
                                }
                            }
                        }
                    }
                    InboxTab.threads -> item(key = "threads") {
                        if (threads.isEmpty()) {
                            Empty(tr("inbox.emptyThreads"), "chat-dots")
                        } else {
                            GroupedSection {
                                threads.forEachIndexed { index, (room, thread) ->
                                    if (index > 0) RowDivider()
                                    ThreadRow(room, thread) {
                                        onOpenThread(room.id, thread.rootEventId)
                                        onDismiss()
                                    }
                                }
                            }
                        }
                    }
                    InboxTab.mentions -> item(key = "mentions") {
                        if (roomList.mentionRooms.isEmpty()) {
                            Empty(tr("inbox.emptyMentions"), "bell")
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space6)) {
                                GroupedSection {
                                    roomList.mentionRooms.forEachIndexed { index, room ->
                                        if (index > 0) RowDivider()
                                        MentionRow(
                                            room,
                                            onOpen = {
                                                onOpenRoom(room.id)
                                                onDismiss()
                                            },
                                            onMarkRead = { scope.launch { roomList.markAsRead(listOf(room)) } },
                                        )
                                    }
                                }
                                GroupedSection {
                                    GroupedRow(tr("common.markAllRead"), icon = "check-circle", onClick = {
                                        scope.launch { roomList.markAsRead(roomList.mentionRooms) }
                                    })
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.navigationBarsPadding())
        }
    }
}

/** Two equal halves, the active one raised, each with its count */
@Composable
private fun Tabs(selected: InboxTab, invites: Int, mentions: Int, threads: Int, onSelect: (InboxTab) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3)
            .clip(CircleShape)
            .background(theme.fill)
            .padding(WZ.Space.space1),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        TabButton(tr("inbox.tabInvites"), invites, selected == InboxTab.invites) { onSelect(InboxTab.invites) }
        TabButton(tr("inbox.tabMentions"), mentions, selected == InboxTab.mentions) { onSelect(InboxTab.mentions) }
        TabButton(tr("inbox.tabThreads"), threads, selected == InboxTab.threads) { onSelect(InboxTab.threads) }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabButton(title: String, count: Int, isActive: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .weight(1f)
            .height(WZ.Space.space10)
            .clip(CircleShape)
            .background(if (isActive) theme.bgTertiary else Color.Transparent)
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3, Alignment.CenterHorizontally),
    ) {
        Text(
            title,
            style = wizardFont(WZ.FontSize.md, if (isActive) FontWeight.SemiBold else FontWeight.Normal),
            color = if (isActive) theme.textPrimary else theme.textMuted,
        )
        if (count > 0) {
            Text(
                if (count > 99) "99+" else "$count",
                Modifier
                    .clip(CircleShape)
                    .background(if (isActive) theme.accent else theme.textMuted)
                    .padding(horizontal = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.xs, FontWeight.Bold),
                color = theme.textOnAccent,
            )
        }
    }
}

@Composable
private fun Empty(text: String, icon: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = WZ.Space.space10),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        PhIcon(icon, size = WZ.SizeIcon.xl, tint = theme.textMuted)
        Text(text, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
    }
}

/** The room's avatar with the same type badge the room list shows */
@Composable
private fun RoomAvatar(room: RoomSummary) {
    Box {
        Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.md)
        if (!room.isDirect) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(WZ.Space.space2, WZ.Space.space2)
                    .size(WZ.Space.space7)
                    .clip(CircleShape)
                    .background(theme.bgPrimary)
                    .border(WZ.BorderWidth.thin, theme.border, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon(
                    if (room.isSpace) "stack" else if (room.isVoice) "speaker-high" else "hash-straight",
                    if (room.isSpace || room.isVoice) PhWeight.regular else PhWeight.bold,
                    size = WZ.SizeIcon.xs,
                    tint = theme.textMuted,
                )
            }
        }
    }
}

@Composable
private fun RoundButton(icon: String, label: String, background: Color, tint: Color, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(WZ.Space.space10).clip(CircleShape).background(background).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, PhWeight.bold, size = WZ.SizeIcon.sm, tint = tint, contentDescription = label)
    }
}

@Composable
private fun InviteRow(invite: RoomSummary, inviterName: String?, busy: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().alpha(if (busy) 0.5f else 1f).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        RoomAvatar(invite)
        Column(Modifier.weight(1f)) {
            Text(
                invite.displayName,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            inviterName?.let {
                Text(
                    tr("inbox.invitedBy", it),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        RoundButton("x", tr("common.decline"), theme.fill, theme.textPrimary, !busy, onDecline)
        RoundButton("check", tr("common.accept"), theme.accent, theme.textOnAccent, !busy, onAccept)
    }
}

@Composable
private fun MentionRow(room: RoomSummary, onOpen: () -> Unit, onMarkRead: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        RoomAvatar(room)
        Column(Modifier.weight(1f)) {
            Text(
                room.displayName,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (room.mentionCount == 1) tr("inbox.youWereMentioned") else tr("inbox.youWereMentionedTimes", room.mentionCount),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
            )
        }
        UnreadBadge(room.mentionCount, isMention = true)
        RoundButton("check", tr("common.markRead"), theme.fill, theme.textMuted, true, onMarkRead)
    }
}

@Composable
private fun ThreadRow(room: RoomSummary, thread: UnreadThread, onOpen: () -> Unit) {
    val sender = thread.latestSenderName ?: thread.latestSender
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        RoomAvatar(room)
        Column(Modifier.weight(1f)) {
            Text(
                thread.rootBody?.let { "${room.displayName} · $it" } ?: room.displayName,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                thread.latestBody?.let { tr("inbox.threadReply", sender, it) } ?: tr("inbox.threadReplied", sender),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        UnreadBadge(thread.unread.toInt(), isMention = false)
    }
}
