package org.wizardchat.android.ui.room

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.people.FormList
import org.wizardchat.android.ui.people.SheetBar
import org.wizardchat.android.ui.people.SheetPage
import org.wizardchat.android.ui.people.errorText
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** Picks a room or DM to forward a message to */
@Composable
internal fun ForwardSheet(fromRoomId: String, eventId: String, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var sendingTo by remember { mutableStateOf<String?>(null) }
    val query = search.trim()
    val eligible = session.roomList?.joinedRooms.orEmpty()
        .filter { !it.isInvite && !it.isSpace && (it.isDirect || !it.isVoice) }
        .filter { query.isEmpty() || it.displayName.contains(query, ignoreCase = true) }
    val rooms = if (query.isEmpty()) {
        eligible.sortedWith(
            compareByDescending<RoomSummary> { it.unreadMentions > 0 }
                .thenByDescending { it.unreadMessages }
                .thenByDescending { it.latestEventTs ?: it.lastActivity ?: 0 },
        )
    } else {
        eligible.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })
    }

    fun forward(toRoomId: String) {
        if (sendingTo != null) return
        val client = session.client ?: return
        sendingTo = toRoomId
        scope.launch {
            try {
                client.forwardEvent(fromRoomId, eventId, toRoomId)
                onDismiss()
            } catch (e: Exception) {
                CopyToast.show(L10n.format("timeline.forwardFailed", errorText(e)))
            } finally {
                sendingTo = null
            }
        }
    }

    WizardSheet(onDismiss) {
        SheetPage {
            SheetBar(tr("timeline.forwardPickerTitle"), leading = { BarTextButton(tr("common.cancel"), onDismiss) })
            WizardTextField(
                search,
                { search = it },
                tr("timeline.forwardSearchPlaceholder"),
                Modifier.padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
            )
            FormList(Modifier.weight(1f)) {
                item {
                    GroupedSection {
                        rooms.forEachIndexed { index, room ->
                            if (index > 0) RowDivider()
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = sendingTo == null) { forward(room.id) }
                                    .heightIn(min = WZ.Space.space11)
                                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
                            ) {
                                Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.sm, initial = !room.isDirect)
                                Text(
                                    room.displayName,
                                    Modifier.weight(1f),
                                    style = wizardFont(WZ.FontSize.lg),
                                    color = theme.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (sendingTo == room.id) Spinner()
                            }
                        }
                    }
                }
            }
        }
    }
}
