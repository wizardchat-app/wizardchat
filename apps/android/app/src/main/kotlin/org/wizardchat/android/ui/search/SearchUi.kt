package org.wizardchat.android.ui.search

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import java.text.DateFormat
import java.text.Normalizer
import java.time.Instant
import java.util.Date
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.RoomListModel
import org.wizardchat.android.matrix.applyTo
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.WizardTopBar
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.home.Route
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.room.Formats
import org.wizardchat.core.EntryContent
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.RoomTimeline
import org.wizardchat.core.SpaceSummary
import org.wizardchat.core.Subscription
import org.wizardchat.core.TimelineEntry
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** Folds case and accents one character at a time, so indices match the original text */
private fun fold(text: String): String = buildString(text.length) {
    for (c in text) append(Normalizer.normalize(c.toString(), Normalizer.Form.NFD).first().lowercaseChar())
}

/** `text` with every match of `query` in the accent colour and bold */
@Composable
fun highlighted(text: String, query: String): AnnotatedString {
    val needle = fold(query.trim())
    val accent = theme.accent
    if (needle.isEmpty()) return AnnotatedString(text)
    val haystack = fold(text)
    return buildAnnotatedString {
        append(text)
        var start = haystack.indexOf(needle)
        while (start >= 0) {
            addStyle(SpanStyle(color = accent, fontWeight = FontWeight.Bold), start, start + needle.length)
            start = haystack.indexOf(needle, start + needle.length)
        }
    }
}

@Composable
fun HighlightedText(
    text: String,
    query: String,
    modifier: Modifier = Modifier,
    style: TextStyle = wizardFont(WZ.FontSize.md),
    color: Color = theme.textPrimary,
    maxLines: Int = Int.MAX_VALUE,
) {
    Text(highlighted(text, query), modifier, style = style, color = color, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

/** The part of the text around the first match of `query` */
fun String.snippet(query: String, radius: Int = 60): String {
    val index = fold(this).indexOf(fold(query))
    if (query.isEmpty() || index < 0) return take(radius * 2)
    val start = maxOf(0, index - radius)
    val end = minOf(length, index + query.length + radius)
    var piece = substring(start, end).replace("\n", " ")
    if (start > 0) piece = "...$piece"
    if (end < length) piece += "..."
    return piece
}

data class ServerSearchHit(
    val eventId: String,
    val roomId: String,
    val roomName: String,
    val body: String,
    val date: Date,
)

/** Server-side message search (unencrypted rooms only) */
object ServerSearch {
    suspend fun messages(term: String, session: MatrixSession, roomList: RoomListModel): List<ServerSearchHit> {
        val hits = runCatching { session.client?.searchMessages(term) }.getOrNull() ?: return emptyList()
        return hits.map { hit ->
            ServerSearchHit(
                hit.eventId,
                hit.roomId,
                roomList.room(hit.roomId)?.displayName ?: hit.roomId,
                hit.body,
                Date(hit.timestamp),
            )
        }
    }
}

/** Rooms, spaces and messages matching the room list search, shown over the list while searching */
@Composable
fun GlobalSearchResults(roomList: RoomListModel, query: String, onOpenRoom: (String) -> Unit) {
    val session = LocalSession.current
    val navigator = LocalNavigator.current
    val notifier = MessageNotifier.shared
    var messages by remember { mutableStateOf(listOf<ServerSearchHit>()) }
    var searchingMessages by remember { mutableStateOf(false) }

    val prefix = query.firstOrNull()?.takeIf { it in "#@*" }
    val text = query.trim().let { if (prefix != null) it.drop(1) else it }.trim()

    fun <T> rank(items: List<T>, name: (T) -> String): List<T> {
        if (text.isEmpty()) return items
        val lower = text.lowercase()
        val matching = items.filter { name(it).lowercase().contains(lower) }
        return matching.filter { name(it).lowercase().startsWith(lower) } + matching.filter { !name(it).lowercase().startsWith(lower) }
    }

    val all = roomList.joinedRooms
    val rooms = when (prefix) {
        '#' -> rank(all.filter { !it.isDirect }) { it.displayName }
        '@' -> rank(all.filter { it.isDirect }) { it.displayName }
        '*' -> emptyList()
        else -> rank(all) { it.displayName }
    }.take(if (prefix == null) 12 else 40)
    val spaces = if (prefix == null || prefix == '*') rank(roomList.spaces) { it.name }.take(8) else emptyList()
    val searchesMessages = prefix == null && text.length >= 3

    LaunchedEffect(text, prefix) {
        if (prefix != null || text.length < 3) {
            messages = emptyList()
            return@LaunchedEffect
        }
        delay(400)
        searchingMessages = true
        messages = ServerSearch.messages(text, session, roomList)
        searchingMessages = false
    }

    LazyColumn(
        Modifier.fillMaxSize().background(theme.bgPrimary).imePadding(),
        contentPadding = PaddingValues(bottom = LocalBottomBarInset.current + WZ.Space.space6),
    ) {
        if (rooms.isNotEmpty()) {
            item(key = "rooms") {
                GroupedSection(header = tr("search.roomsAndDms")) {
                    rooms.forEachIndexed { index, room ->
                        if (index > 0) RowDivider()
                        ResultRow(room.displayName, room.avatarUrl, isSpace = false, initial = !room.isDirect, icon = roomIcon(room), query = text) { onOpenRoom(room.id) }
                    }
                }
            }
        }
        if (spaces.isNotEmpty()) {
            item(key = "spaces") {
                GroupedSection(header = tr("room.settings.permissions.groups.spaces")) {
                    spaces.forEachIndexed { index, space: SpaceSummary ->
                        if (index > 0) RowDivider()
                        ResultRow(space.name, space.avatarUrl, isSpace = true, initial = true, icon = "squares-four" to PhWeight.regular, query = text) {
                            navigator.push(Route.Space(space.id))
                        }
                    }
                }
            }
        }
        if (searchesMessages) {
            item(key = "messages") {
                GroupedSection(header = tr("room.settings.permissions.groups.messages"), footer = tr("search.encryptedRoomsHint")) {
                    messages.forEachIndexed { index, hit ->
                        if (index > 0) RowDivider()
                        MessageRow(hit, text) {
                            notifier.eventToFocus = hit.roomId to hit.eventId
                            onOpenRoom(hit.roomId)
                        }
                    }
                    if (searchingMessages) {
                        Box(Modifier.fillMaxWidth().padding(WZ.Space.space5), contentAlignment = Alignment.Center) { Spinner() }
                    } else if (messages.isEmpty()) {
                        Text(
                            tr("search.noResults"),
                            Modifier.padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
                            style = wizardFont(WZ.FontSize.md),
                            color = theme.textMuted,
                        )
                    }
                }
            }
        }
        if (rooms.isEmpty() && spaces.isEmpty() && !searchesMessages) {
            item(key = "empty") {
                Text(
                    tr("common.noResults"),
                    Modifier.fillMaxWidth().padding(vertical = WZ.Space.space9),
                    style = wizardFont(WZ.FontSize.md),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private fun roomIcon(room: RoomSummary): Pair<String, PhWeight> = when {
    room.isDirect -> "user" to PhWeight.regular
    room.isVoice -> "speaker-high" to PhWeight.regular
    else -> "hash-straight" to PhWeight.regular
}

@Composable
private fun ResultRow(name: String, avatarUrl: String?, isSpace: Boolean, initial: Boolean, icon: Pair<String, PhWeight>, query: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Avatar(name, avatarUrl, WZ.SizeAvatar.md, cornerRadius = if (isSpace) WZ.Radius.md else null, initial = initial)
        HighlightedText(name, query, Modifier.weight(1f), style = wizardFont(WZ.FontSize.lg, FontWeight.Medium), maxLines = 1)
        PhIcon(icon.first, icon.second, size = WZ.SizeIcon.xs, tint = theme.textMuted)
    }
}

@Composable
private fun MessageRow(hit: ServerSearchHit, query: String, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space1),
    ) {
        Row {
            Text(
                hit.roomName,
                Modifier.weight(1f),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(DateFormat.getDateInstance(DateFormat.MEDIUM).format(hit.date), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
        }
        HighlightedText(hit.body.snippet(query), query, maxLines = 3)
    }
}

/** A message as the room search shows it */
private data class SearchEntry(val event: TimelineEntry.Event, val summary: String) {
    val senderName get() = event.senderName ?: event.sender
}

private fun summary(content: EntryContent): String? = when (content) {
    is EntryContent.Text -> content.body
    is EntryContent.Notice -> content.body
    is EntryContent.Emote -> content.body
    is EntryContent.Image -> content.media.caption ?: L10n.format("timeline.summary.image")
    is EntryContent.Video -> L10n.format("timeline.summary.video")
    is EntryContent.Audio -> if (content.media.voice) L10n.format("composer.voice.record") else L10n.format("timeline.audioFile")
    is EntryContent.File -> content.media.filename
    is EntryContent.Location -> L10n.format("timeline.locationShared")
    else -> null
}

/** The room's messages, loaded backwards for searching */
private class SearchTimeline(private val client: WizardClient, private val roomId: String, private val scope: CoroutineScope) {
    var entries by mutableStateOf(listOf<SearchEntry>())
        private set
    var reachedStart by mutableStateOf(false)
        private set

    private var timeline: RoomTimeline? = null
    private var subscription: Subscription? = null
    private val items = mutableListOf<TimelineEntry>()
    private var isPaginating = false

    fun start() {
        if (timeline != null) return
        scope.launch {
            val timeline = runCatching { client.timeline(roomId) }.getOrNull() ?: return@launch
            this@SearchTimeline.timeline = timeline
            subscription = timeline.watch { diffs ->
                diffs.forEach { it.applyTo(items) }
                entries = items.mapNotNull { entry ->
                    val event = entry as? TimelineEntry.Event ?: return@mapNotNull null
                    summary(event.content)?.let { SearchEntry(event, it) }
                }
                if (items.any { it is TimelineEntry.TimelineStart }) reachedStart = true
            }
        }
    }

    fun stop() {
        subscription?.cancel()
        subscription = null
    }

    suspend fun paginateBackwards() {
        val timeline = timeline ?: return
        if (isPaginating || reachedStart) return
        isPaginating = true
        try {
            reachedStart = timeline.paginateBack(80)
        } catch (_: Exception) {
        } finally {
            isPaginating = false
        }
    }
}

/** Search inside one room; `onJump` gets an event ID */
@Composable
fun RoomSearchScreen(room: RoomSummary, client: WizardClient, onJump: (String) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val model = remember(room.id) { SearchTimeline(client, room.id, scope) }
    var query by remember { mutableStateOf("") }
    val needle = query.trim()
    val folded = fold(needle)
    val results = if (needle.isEmpty()) {
        emptyList()
    } else {
        model.entries.asReversed().filter { entry ->
            entry.event.eventId != null && (fold(entry.summary).contains(folded) || fold(entry.senderName).contains(folded))
        }
    }

    DisposableEffect(model) {
        model.start()
        onDispose { model.stop() }
    }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize().background(theme.bgSecondary)) {
        WizardTopBar(tr("common.search"), onBack = onBack)
        WizardTextField(
            query,
            { query = it },
            tr("search.thisRoom"),
            Modifier.background(theme.bgPrimary).padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
        )
        Box(Modifier.weight(1f).imePadding()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = WZ.Space.space6)) {
                items(results, key = { it.event.id }) { entry ->
                    SearchResultRow(entry, needle) { entry.event.eventId?.let(onJump) }
                    HorizontalDivider(Modifier.padding(start = WZ.Space.space6), color = theme.border.copy(alpha = 0.5f))
                }
                if (needle.isNotEmpty()) {
                    item(key = "footer") {
                        if (!model.reachedStart) {
                            Row(
                                Modifier.fillMaxWidth().padding(WZ.Space.space6),
                                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4, Alignment.CenterHorizontally),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Spinner()
                                Text(tr("search.searchingOlder"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted)
                            }
                            LaunchedEffect(needle) {
                                while (isActive && !model.reachedStart) {
                                    model.paginateBackwards()
                                    delay(100)
                                }
                            }
                        } else if (results.isEmpty()) {
                            Text(
                                tr("search.noResults"),
                                Modifier.fillMaxWidth().padding(WZ.Space.space8),
                                style = wizardFont(WZ.FontSize.md),
                                color = theme.textMuted,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
            if (needle.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(WZ.Space.space9),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space4, Alignment.CenterVertically),
                ) {
                    PhIcon("magnifying-glass", size = WZ.SizeIcon.xxl, tint = theme.textMuted)
                    Text(tr("search.title"), style = wizardFont(WZ.FontSize.xl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
                    Text(tr("search.roomHint"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding())
    }
}

@Composable
private fun SearchResultRow(entry: SearchEntry, needle: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .clickable(onClick = onClick)
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(entry.senderName, entry.event.senderAvatar, WZ.SizeAvatar.sm)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HighlightedText(entry.senderName, needle, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), maxLines = 1)
                Text(
                    Formats.abbreviatedDateTime(Instant.ofEpochMilli(entry.event.timestamp)),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                )
            }
            HighlightedText(entry.summary.snippet(needle), needle, maxLines = 3)
        }
    }
}
