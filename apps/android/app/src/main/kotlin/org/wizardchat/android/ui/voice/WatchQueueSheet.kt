package org.wizardchat.android.ui.voice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.launch
import org.wizardchat.android.matrix.rtc.QueueItem
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.tokens.WZ

private data class QueueNotice(val text: String, val error: Boolean)

@Composable
internal fun WatchQueueSheet(watch: WatchTogether, roomId: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var link by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<QueueNotice?>(null) }
    var historyOpen by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    var draggingId by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val order = remember { mutableStateListOf<String>() }
    val heights = remember { mutableStateMapOf<String, Int>() }

    val state = watch.state ?: return
    val queue = state.queue
    val history = state.history
    val full = queue.size >= WatchTogether.QUEUE_LIMIT
    val byId = queue.associateBy { it.id }
    val shown = if (draggingId != null) order.mapNotNull { byId[it] } else queue

    fun add() {
        if (link.isBlank() || adding || full) return
        val parsed = WatchTogether.parseLink(link)
        if (parsed == null) {
            notice = QueueNotice(L10n.format("call.watchTogether.invalidLink"), true)
            return
        }
        val videoId = parsed.videoId
        if (parsed.listId == null && videoId != null) {
            watch.enqueue(listOf(videoId))
            link = ""
            notice = null
            return
        }
        adding = true
        notice = null
        scope.launch {
            try {
                val ids = loadYouTubePlaylist(context, parsed)
                val dropped = watch.enqueue(ids)
                link = ""
                notice = QueueNotice(
                    if (dropped > 0) {
                        L10n.plural("call.watchTogether.queue.addedSome", ids.size - dropped, ids.size - dropped, dropped)
                    } else {
                        L10n.plural("call.watchTogether.queue.addedPlaylist", ids.size, ids.size)
                    },
                    false,
                )
            } catch (_: PlaylistUnavailable) {
                if (videoId != null) {
                    watch.enqueue(listOf(videoId))
                    link = ""
                } else {
                    notice = QueueNotice(L10n.format("call.watchTogether.queue.playlistFailed"), true)
                }
            } finally {
                adding = false
            }
        }
    }

    fun drag(dy: Float) {
        val id = draggingId ?: return
        dragOffset += dy
        val index = order.indexOf(id)
        if (index < 0) return
        val own = heights[id] ?: return
        if (dragOffset > 0 && index < order.lastIndex) {
            val next = heights[order[index + 1]] ?: own
            if (dragOffset > next / 2f) {
                order.add(index + 1, order.removeAt(index))
                dragOffset -= next
            }
        } else if (dragOffset < 0 && index > 0) {
            val previous = heights[order[index - 1]] ?: own
            if (-dragOffset > previous / 2f) {
                order.add(index - 1, order.removeAt(index))
                dragOffset += previous
            }
        }
    }

    fun endDrag() {
        if (draggingId == null) return
        val ids = order.toList()
        draggingId = null
        dragOffset = 0f
        if (ids != watch.state?.queue?.map { it.id }) watch.reorder(ids)
    }

    WizardSheet(onDismiss) {
        Row(
            Modifier.fillMaxWidth().padding(start = WZ.Space.space6, end = WZ.Space.space4, top = WZ.Space.space2, bottom = WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            Text(tr("call.watchTogether.queue.title"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary)
            Text(
                "${queue.size}/${WatchTogether.QUEUE_LIMIT}",
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.sm),
                color = theme.textMuted,
            )
            QueueAction("x", tr("common.close"), tint = theme.textMuted, onClick = onDismiss)
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        ) {
            TextField(
                value = link,
                onValueChange = {
                    link = it
                    notice = null
                },
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(WZ.Radius.md)),
                enabled = !adding && !full,
                placeholder = {
                    Text(
                        tr("call.watchTogether.queue.addPlaceholder"),
                        color = theme.textMuted,
                        style = wizardFont(WZ.FontSize.md),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                textStyle = wizardFont(WZ.FontSize.md).copy(color = theme.textPrimary),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { add() }),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = theme.bgInput,
                    unfocusedContainerColor = theme.bgInput,
                    disabledContainerColor = theme.bgInput,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = theme.accent,
                ),
            )
            val canAdd = link.isNotBlank() && !adding && !full
            Box(
                Modifier
                    .heightIn(min = WZ.Space.space11)
                    .clip(RoundedCornerShape(WZ.Radius.md))
                    .background(if (canAdd || adding) theme.accent else theme.fill)
                    .clickable(enabled = canAdd) { add() }
                    .padding(horizontal = WZ.Space.space6),
                contentAlignment = Alignment.Center,
            ) {
                if (adding) {
                    Spinner(size = WZ.SizeIcon.sm, color = theme.textOnAccent)
                } else {
                    Text(
                        tr("call.watchTogether.queue.add"),
                        style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                        color = if (canAdd) theme.textOnAccent else theme.textMuted,
                    )
                }
            }
        }
        val noticeText = notice?.text ?: if (full) tr("call.watchTogether.queue.full") else null
        if (noticeText != null) {
            Text(
                noticeText,
                Modifier.padding(horizontal = WZ.Space.space6).padding(top = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.sm),
                color = if (notice?.error == true) theme.error else theme.textMuted,
            )
        }
        LazyColumn(
            Modifier.fillMaxWidth().imePadding(),
            contentPadding = PaddingValues(bottom = WZ.Space.space8),
        ) {
            item(key = "now-label") { SectionLabel(tr("call.watchTogether.queue.nowPlaying")) }
            item(key = "now") {
                VideoRow(
                    videoId = state.videoId,
                    addedBy = state.addedBy,
                    roomId = roomId,
                    current = true,
                    modifier = Modifier
                        .padding(horizontal = WZ.Space.space4)
                        .clip(RoundedCornerShape(WZ.Radius.md))
                        .background(theme.accent.copy(alpha = 0.12f)),
                )
            }
            item(key = "up-next") {
                Row(
                    Modifier.fillMaxWidth().padding(end = WZ.Space.space4),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SectionLabel(tr("call.watchTogether.queue.upNext"), Modifier.weight(1f))
                    if (queue.size > 1) {
                        QueueAction("shuffle", tr("call.watchTogether.queue.shuffle")) { watch.shuffle() }
                    }
                    if (queue.isNotEmpty()) {
                        QueueAction("trash", tr("call.watchTogether.queue.clear"), tint = theme.danger) { confirmClear = true }
                    }
                }
            }
            if (queue.isEmpty()) {
                item(key = "empty") {
                    Text(
                        tr("call.watchTogether.queue.empty"),
                        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space5),
                        style = wizardFont(WZ.FontSize.sm),
                        color = theme.textMuted,
                    )
                }
            } else {
                items(shown, key = { it.id }) { item ->
                    val dragging = item.id == draggingId
                    val index = shown.indexOf(item)
                    VideoRow(
                        videoId = item.videoId,
                        addedBy = item.addedBy,
                        roomId = roomId,
                        modifier = (if (dragging) Modifier.zIndex(1f).graphicsLayer { translationY = dragOffset } else Modifier.animateItem())
                            .padding(horizontal = WZ.Space.space4)
                            .clip(RoundedCornerShape(WZ.Radius.md))
                            .background(if (dragging) theme.bgTertiary else Color.Transparent)
                            .onSizeChanged { heights[item.id] = it.height },
                        handle = {
                            Box(
                                Modifier
                                    .size(WZ.Space.space9)
                                    .semantics { contentDescription = L10n.format("call.watchTogether.queue.reorder") }
                                    .pointerInput(item.id) {
                                        detectVerticalDragGestures(
                                            onDragStart = {
                                                order.clear()
                                                order.addAll(watch.state?.queue.orEmpty().map { it.id })
                                                dragOffset = 0f
                                                draggingId = item.id
                                            },
                                            onDragEnd = { endDrag() },
                                            onDragCancel = { endDrag() },
                                            onVerticalDrag = { change, dy ->
                                                change.consume()
                                                drag(dy)
                                            },
                                        )
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                PhIcon("dots-six-vertical", PhWeight.bold, size = WZ.SizeIcon.sm, tint = theme.textMuted)
                            }
                        },
                    ) {
                        QueueAction("play", tr("call.watchTogether.queue.playNow"), weight = PhWeight.fill) { watch.playNow(item) }
                        if (index > 0) {
                            QueueAction("arrow-line-up", tr("call.watchTogether.queue.playNext")) { watch.playNext(item.id) }
                        }
                        QueueAction("x", tr("call.watchTogether.queue.remove"), tint = theme.danger.copy(alpha = 0.8f)) { watch.remove(item.id) }
                    }
                }
            }
            if (history.isNotEmpty()) {
                item(key = "history-toggle") {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = WZ.Space.space4)
                            .clickable { historyOpen = !historyOpen }
                            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    ) {
                        if (historyOpen) {
                            PhIcon("caret-down", size = WZ.SizeIcon.xs, tint = theme.textMuted)
                        } else {
                            PhIcon("caret-right", PhWeight.bold, size = WZ.SizeIcon.xs, tint = theme.textMuted)
                        }
                        Text(
                            tr("call.watchTogether.queue.history", history.size),
                            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                            color = theme.textMuted,
                        )
                    }
                }
                if (historyOpen) {
                    items(history, key = { "history-${it.id}" }) { item ->
                        VideoRow(
                            videoId = item.videoId,
                            addedBy = item.addedBy,
                            roomId = roomId,
                            modifier = Modifier.padding(horizontal = WZ.Space.space4).graphicsLayer { alpha = 0.75f },
                        ) {
                            QueueAction("play", tr("call.watchTogether.queue.playAgain"), weight = PhWeight.fill) { watch.playNow(item) }
                        }
                    }
                }
            }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
    }

    if (confirmClear) {
        ConfirmDialog(
            title = tr("call.watchTogether.queue.clearConfirm"),
            message = trPlural("call.watchTogether.queue.clearMessage", queue.size, queue.size),
            confirmLabel = tr("call.watchTogether.queue.clear"),
            onConfirm = { watch.clear() },
            onDismiss = { confirmClear = false },
        )
    }
}

@Composable
private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier.padding(start = WZ.Space.space6, end = WZ.Space.space6, top = WZ.Space.space6, bottom = WZ.Space.space3),
        style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold),
        color = theme.textMuted,
    )
}

@Composable
private fun VideoRow(
    videoId: String,
    addedBy: String,
    roomId: String,
    modifier: Modifier = Modifier,
    current: Boolean = false,
    handle: (@Composable () -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val title = rememberVideoTitle(videoId) ?: videoId
    val name = rememberMemberProfile(addedBy, roomId).name ?: addedBy
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = if (handle == null) WZ.Space.space4 else 0.dp, end = WZ.Space.space2, top = WZ.Space.space3, bottom = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        handle?.invoke()
        VideoThumbnail(videoId, Modifier.size(64.dp, 36.dp).clip(RoundedCornerShape(WZ.Radius.sm)))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = wizardFont(WZ.FontSize.md, if (current) FontWeight.SemiBold else FontWeight.Normal),
                color = if (current) theme.accent else theme.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                tr("call.watchTogether.queue.addedBy", name),
                style = wizardFont(WZ.FontSize.xs),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        actions()
    }
}

@Composable
private fun QueueAction(icon: String, label: String, tint: Color = theme.textSecondary, weight: PhWeight = PhWeight.regular, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space9)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, weight, size = WZ.SizeIcon.sm, tint = tint)
    }
}
