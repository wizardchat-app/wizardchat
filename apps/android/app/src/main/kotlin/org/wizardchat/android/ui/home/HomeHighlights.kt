package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

private const val RECENT_LIMIT = 10

private fun activity(room: RoomSummary): Long? =
    if (room.isVoice) room.lastMessage?.timestamp else room.latestEventTs ?: room.lastActivity

fun recentRooms(rooms: List<RoomSummary>): List<RoomSummary> =
    rooms.filter { !it.isTombstoned }
        .mapNotNull { room -> activity(room)?.let { room to it } }
        .sortedByDescending { it.second }
        .take(RECENT_LIMIT)
        .map { it.first }

@Composable
fun JumpBackInSection(rooms: List<RoomSummary>) {
    val navigator = LocalNavigator.current
    Column(
        Modifier.fillMaxWidth().padding(top = WZ.Space.space2, bottom = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(
            tr("home.jumpBackIn"),
            Modifier.padding(start = WZ.Space.space6),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textMuted,
        )
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = WZ.Space.space6),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            rooms.forEach { room ->
                val unread = room.unreadCount > 0 || room.mentionCount > 0
                Column(
                    Modifier
                        .width(WZ.SizeAvatar.lg + WZ.Space.space6)
                        .clip(RoundedCornerShape(WZ.Radius.md))
                        .clickable(onClickLabel = room.displayName) { navigator.push(Route.Room(room.id)) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    Box {
                        Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.lg)
                        if (unread) {
                            Box(
                                Modifier
                                    .align(Alignment.TopEnd)
                                    .size(WZ.Space.space6)
                                    .clip(CircleShape)
                                    .background(if (room.mentionCount > 0) theme.mention else theme.accent)
                                    .border(WZ.Space.space1, theme.bgPrimary, CircleShape),
                            )
                        }
                    }
                    Text(
                        room.displayName,
                        style = wizardFont(WZ.FontSize.xs, if (unread) FontWeight.SemiBold else FontWeight.Normal),
                        color = if (unread) theme.textPrimary else theme.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
fun StarterActionsSection(onNewMessage: () -> Unit, onCreateSpace: () -> Unit, onExplore: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        StarterTile("chat-circle", tr("common.newDm"), onNewMessage, Modifier.weight(1f))
        StarterTile("stack", tr("nav.createOrJoin"), onCreateSpace, Modifier.weight(1f))
        StarterTile("compass", tr("explore.title"), onExplore, Modifier.weight(1f))
    }
}

@Composable
private fun StarterTile(icon: String, title: String, onClick: () -> Unit, modifier: Modifier) {
    Column(
        modifier
            .heightIn(min = WZ.SizeAvatar.xl)
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .background(theme.bgSecondary)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space5),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3, Alignment.CenterVertically),
    ) {
        PhIcon(icon, PhWeight.regular, WZ.SizeIcon.lg, tint = theme.accent)
        Text(
            title,
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textPrimary,
            maxLines = 2,
            textAlign = TextAlign.Center,
        )
    }
}
