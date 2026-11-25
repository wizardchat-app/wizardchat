package org.wizardchat.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MemberDirectory
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.memberProfile
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.L10n
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

private data class ActivePerson(val userId: String, val name: String?, val avatarUrl: String?, val known: Boolean)

private data class ActiveCard(val room: RoomSummary, val people: List<ActivePerson>, val knownCount: Int, val includesMe: Boolean)

@Composable
fun ActiveNowSection(roomList: RoomListModel) {
    val session = LocalSession.current
    val calls = LocalCalls.current
    val me = session.userId
    val known = roomList.joinedRooms.filter { it.isDirect }.mapNotNull { room -> room.dmUserId?.let { it to room } }.toMap()
    val cards = roomList.joinedRooms
        .filter { it.isVoice && it.callParticipants.isNotEmpty() }
        .mapNotNull { room ->
            val ids = room.callParticipants
            val people = ids.map { id ->
                ActivePerson(id, known[id]?.dmUserName, known[id]?.dmUserAvatar, id != me && known[id] != null)
            }
            val knownCount = people.count { it.known }
            if (knownCount == 0) null else ActiveCard(room, people.sortedByDescending { it.known }, knownCount, room.inCall || calls.isInCall(room.id))
        }
        .sortedByDescending { it.knownCount }
    if (cards.isEmpty()) return

    Column(
        Modifier.fillMaxWidth().padding(top = WZ.Space.space2, bottom = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
    ) {
        Text(
            tr("nav.activeNow"),
            Modifier.padding(start = WZ.Space.space6),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textMuted,
        )
        when (cards.size) {
            1 -> WideCard(cards[0], roomList, Modifier.padding(horizontal = WZ.Space.space6).fillMaxWidth())
            2 -> Row(
                Modifier.padding(horizontal = WZ.Space.space6).height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                cards.forEach { CompactCard(it, roomList, Modifier.weight(1f).fillMaxHeight()) }
            }
            else -> BoxWithConstraints(Modifier.fillMaxWidth()) {
                val width = (maxWidth - WZ.Space.space6 * 2 - WZ.Space.space4) / 2
                Row(
                    Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = WZ.Space.space6)
                        .height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    cards.forEach { CompactCard(it, roomList, Modifier.width(width).fillMaxHeight()) }
                }
            }
        }
    }
}

private fun names(card: ActiveCard, limit: Int, more: (Int) -> String): String {
    val known = card.people.filter { it.known }.map { it.name ?: it.userId.drop(1).substringBefore(':') }
    val rest = card.people.size - minOf(known.size, limit)
    return known.take(limit).joinToString(", ") + if (rest > 0) " " + more(rest) else ""
}

@Composable
private fun CardTitle(card: ActiveCard, roomList: RoomListModel) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
            PhIcon("speaker-high", PhWeight.regular, WZ.SizeIcon.xs, tint = theme.success)
            Text(
                card.room.name ?: card.room.id,
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        roomList.spaceContaining(card.room.id)?.let {
            Text(it.name, style = wizardFont(WZ.FontSize.xs), color = theme.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Faces(card: ActiveCard, limit: Int, overflow: Boolean = false) {
    val extra = card.people.size - limit
    val shown = card.people.take(if (overflow && extra > 0) limit - 1 else limit)
    Row(horizontalArrangement = Arrangement.spacedBy(-WZ.Space.space3)) {
        shown.forEach { FaceAvatar(it, card.room.id) }
        if (overflow && extra > 0) {
            Box(
                Modifier
                    .size(WZ.SizeAvatar.sm)
                    .clip(CircleShape)
                    .background(theme.fill)
                    .border(WZ.Space.space1, theme.bgSecondary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("+${card.people.size - shown.size}", style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = theme.textSecondary)
            }
        }
    }
}

@Composable
private fun JoinButton(card: ActiveCard, modifier: Modifier = Modifier) {
    val session = LocalSession.current
    val calls = LocalCalls.current
    val navigator = LocalNavigator.current
    Box(
        modifier
            .defaultMinSize(minHeight = WZ.SizeControl.md)
            .clip(CircleShape)
            .background(if (card.includesMe) theme.fill else theme.accent)
            .clickable {
                if (!card.includesMe) calls.launchJoin(card.room, session)
                navigator.push(Route.Room(card.room.id))
            }
            .padding(horizontal = WZ.Space.space7),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            tr(if (card.includesMe) "common.open" else "common.join"),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = if (card.includesMe) theme.textPrimary else theme.textOnAccent,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun WideCard(card: ActiveCard, roomList: RoomListModel, modifier: Modifier) {
    val label = names(card, 2) { L10n.plural("nav.morePeople", it, it) }
    Row(
        modifier
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .background(theme.bgSecondary)
            .padding(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            CardTitle(card, roomList)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                Faces(card, 4)
                Text(label, style = wizardFont(WZ.FontSize.sm), color = theme.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        JoinButton(card)
    }
}

@Composable
private fun CompactCard(card: ActiveCard, roomList: RoomListModel, modifier: Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .background(theme.bgSecondary)
            .padding(WZ.Space.space5),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        CardTitle(card, roomList)
        Faces(card, 4, overflow = true)
        Spacer(Modifier.weight(1f))
        JoinButton(card, Modifier.fillMaxWidth())
    }
}

@Composable
private fun FaceAvatar(person: ActivePerson, roomId: String) {
    val session = LocalSession.current
    var profile by remember(person.userId) { mutableStateOf<MemberDirectory.Profile?>(null) }
    LaunchedEffect(person.userId) {
        if (person.name == null) profile = session.memberProfile(person.userId, roomId)
    }
    Box(Modifier.border(WZ.Space.space1, theme.bgSecondary, CircleShape)) {
        Avatar(person.name ?: profile?.name ?: person.userId, person.avatarUrl ?: profile?.avatarUrl, WZ.SizeAvatar.sm)
    }
}
