package org.wizardchat.android.ui.room

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.ChatEntry
import org.wizardchat.android.matrix.Emoji
import org.wizardchat.android.matrix.MessageLayout
import org.wizardchat.android.matrix.MessageMention
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.PacksStore
import org.wizardchat.android.matrix.PendingUpload
import org.wizardchat.android.matrix.RecentEmoji
import org.wizardchat.android.matrix.TimelineModel
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.matrix.mentionCount
import org.wizardchat.android.matrix.unreadCount
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.CopyToast
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.LocalBottomBarInset
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardTextField
import org.wizardchat.android.ui.composer.ComposerView
import org.wizardchat.android.ui.composer.MediaPicker
import org.wizardchat.android.ui.composer.MediaPickerTab
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.android.ui.home.LocalCalls
import org.wizardchat.android.ui.home.LocalNavigator
import org.wizardchat.android.ui.home.Route
import org.wizardchat.android.ui.people.RoomInfoSheet
import org.wizardchat.android.ui.people.UserProfileSheet
import org.wizardchat.android.ui.theme.nameColor
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.withNameColors
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.voice.JoinCallBar
import org.wizardchat.core.CallHistoryView
import org.wizardchat.core.CallOutcome
import org.wizardchat.core.RichBlock
import org.wizardchat.core.RichSpan
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ
import java.time.Instant
import org.wizardchat.android.ui.voice.rememberMemberProfile

/** What a message row can do; null actions (settings preview, pinned list) make it read-only */
class MessageActions(
    val reply: (ChatEntry) -> Unit,
    val react: (String, ChatEntry) -> Unit,
    val moreReactions: (ChatEntry) -> Unit,
    val edit: (ChatEntry) -> Unit,
    val delete: (ChatEntry) -> Unit,
    val vote: (String, ChatEntry) -> Unit,
    val endPoll: (ChatEntry) -> Unit,
    val roomId: String,
    val openProfile: (String) -> Unit,
    val openRoomLink: ((String) -> Unit)? = null,
    val pinnedIds: Set<String> = emptySet(),
    val canPin: Boolean = false,
    val canRedactOthers: Boolean = false,
    val togglePin: (ChatEntry) -> Unit = {},
    val report: (ChatEntry) -> Unit = {},
    val viewSource: (ChatEntry) -> Unit = {},
    val openThread: ((ChatEntry) -> Unit)? = null,
    /** Set only in unencrypted rooms */
    val linkPreviews: LinkPreviewLoader? = null,
    val retry: () -> Unit = {},
)

/** A room's timeline and composer, or with `threadRoot` one of its threads */
@Composable
fun RoomScreen(room: RoomSummary, client: WizardClient, onBack: () -> Unit, threadRoot: String? = null) {
    val prefs = LocalPrefs.current
    val session = LocalSession.current
    val calls = LocalCalls.current
    val notifier = MessageNotifier.shared
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val timeline = remember(room.id, threadRoot) { TimelineModel(client, room.id, threadRoot) }
    LaunchedEffect(timeline, prefs.groupImages) { timeline.groupImages = prefs.groupImages }
    val navigator = LocalNavigator.current
    var showThreads by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    var replyTo by remember { mutableStateOf<ChatEntry?>(null) }
    var editing by remember { mutableStateOf<ChatEntry?>(null) }
    var reactingTo by remember { mutableStateOf<ChatEntry?>(null) }
    val reactionPacks = remember { PacksStore() }
    var showInfo by remember { mutableStateOf(false) }
    var canPin by remember { mutableStateOf(false) }
    var canRedactOthers by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf<ChatEntry?>(null) }
    var sourceText by remember { mutableStateOf<String?>(null) }
    var linkPreviews by remember { mutableStateOf<LinkPreviewLoader?>(null) }
    var profileUserId by remember { mutableStateOf<String?>(null) }
    var highlightedId by remember { mutableStateOf<String?>(null) }
    var unreadDividerId by remember { mutableStateOf<String?>(null) }

    var positioned by remember { mutableStateOf(false) }
    var userScrolledAway by remember { mutableStateOf(false) }
    var newWhileAway by remember { mutableIntStateOf(0) }
    var farFromBottom by remember { mutableStateOf(false) }
    var loadingOlder by remember { mutableStateOf(false) }
    val isDragged by listState.interactionSource.collectIsDraggedAsState()
    val nearTopPx = with(density) { 240.dp.toPx() }

    // Distance from the newest message, estimated from the visible rows (item 0 is the bottom anchor)
    val bottomGap by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val visible = info.visibleItemsInfo
            if (listState.firstVisibleItemIndex == 0) {
                listState.firstVisibleItemScrollOffset.toFloat()
            } else {
                val average = if (visible.isEmpty()) 0f else visible.sumOf { it.size }.toFloat() / visible.size
                listState.firstVisibleItemIndex * average + listState.firstVisibleItemScrollOffset
            }
        }
    }
    val viewport by remember { derivedStateOf { listState.layoutInfo.viewportSize.height.toFloat() } }
    val isAtBottom by remember { derivedStateOf { bottomGap < 80 * density.density } }
    val nearTop by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf false
            last.index >= info.totalItemsCount - 1 ||
                (last.index >= info.totalItemsCount - 3 && info.viewportEndOffset - (last.offset + last.size) > -nearTopPx)
        }
    }
    val fillsScreen by remember { derivedStateOf { listState.canScrollForward || listState.canScrollBackward } }

    /** Index in the reversed list of an entry (0 is the bottom anchor) */
    fun listIndex(id: String): Int? {
        val index = timeline.entries.indexOfFirst { it.id == id }
        return if (index < 0) null else 1 + timeline.entries.size - 1 - index
    }

    suspend fun scrollToNewest(animated: Boolean = true) {
        if (animated) listState.animateScrollToItem(0) else listState.scrollToItem(0)
    }

    /** Loads one page of older messages, and keeps going only while the chat is too short to fill the screen */
    fun loadOlder() {
        if (loadingOlder || timeline.reachedStart) return
        loadingOlder = true
        scope.launch {
            try {
                do {
                    timeline.paginateBackwards()
                    delay(80)
                } while (!fillsScreen && !timeline.reachedStart)
            } finally {
                loadingOlder = false
            }
        }
    }

    suspend fun openAtFirstUnread() {
        val id = timeline.loadUntilReadMarker() ?: return
        val index = timeline.entries.indexOfFirst { it.id == id }
        if (index < 0) return
        unreadDividerId = id
        // A few new messages are visible from the bottom anyway; only jump for more
        if (timeline.entries.size - index <= 6) return
        userScrolledAway = true
        delay(80)
        val target = listIndex(id) ?: return
        listState.scrollToItem(target)
        // Put it at the top of the screen
        val item = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == target }
        if (item != null) listState.scrollBy(-(viewport - item.size - 16 * density.density).coerceAtLeast(0f))
    }

    suspend fun jump(eventId: String) {
        timeline.start()
        val found = timeline.loadUntil(eventId)
        val entry = timeline.entries.firstOrNull { e -> e.eventId == eventId || e.galleryItems.any { it.eventId == eventId } }
        if (!found || entry == null) {
            CopyToast.show(L10n.format("timeline.messageNotFound"))
            return
        }
        userScrolledAway = true
        delay(100)
        val target = listIndex(entry.id) ?: return
        listState.scrollToItem(target)
        val item = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == target }
        if (item != null) listState.animateScrollBy(-(viewport / 2 - item.size / 2f).coerceAtLeast(0f))
        highlightedId = entry.id
        delay(2000)
        highlightedId = null
    }

    DisposableEffect(timeline) {
        if (threadRoot == null) notifier.activeRoomId = room.id
        onDispose {
            if (threadRoot == null && notifier.activeRoomId == room.id) notifier.activeRoomId = null
            timeline.setTyping(false)
            timeline.close()
        }
    }
    LaunchedEffect(timeline) { timeline.start() }
    LaunchedEffect(timeline) {
        val details = runCatching { client.roomDetails(room.id) }.getOrNull()
        if (details?.isEncrypted == false) linkPreviews = LinkPreviewLoader(client)
        details?.permissions?.let {
            canPin = it.pin
            canRedactOthers = it.redactOthers
        }
    }
    LaunchedEffect(notifier.eventToFocus) {
        val (roomId, eventId) = notifier.eventToFocus ?: return@LaunchedEffect
        if (threadRoot != null || roomId != room.id) return@LaunchedEffect
        notifier.eventToFocus = null
        jump(eventId)
    }
    LaunchedEffect(timeline.entries.isEmpty()) {
        if (timeline.entries.isEmpty() || positioned) return@LaunchedEffect
        positioned = true
        if (threadRoot == null && (room.unreadCount > 0 || room.mentionCount > 0)) openAtFirstUnread()
        timeline.markAsRead(prefs.sendReadReceipts)
    }
    LaunchedEffect(timeline.entries.lastOrNull()?.id) {
        if (timeline.entries.isEmpty() || !positioned) return@LaunchedEffect
        // Unless you scrolled up to read, follow new messages; your own always bring you back down
        if (!userScrolledAway || timeline.entries.lastOrNull()?.isOwn == true) {
            newWhileAway = 0
            scrollToNewest()
        } else {
            newWhileAway += 1
        }
        timeline.markAsRead(prefs.sendReadReceipts)
    }
    LaunchedEffect(listState) {
        var dragStartGap: Float? = null
        snapshotFlow { listOf(bottomGap, if (isDragged) 1f else 0f, if (listState.isScrollInProgress) 1f else 0f) }.collect {
            val scrolling = isDragged || listState.isScrollInProgress
            if (isDragged && dragStartGap == null) dragStartGap = bottomGap
            if (!scrolling) dragStartGap = null
            farFromBottom = bottomGap > viewport
            if (isAtBottom || (!scrolling && bottomGap < 150 * density.density)) {
                newWhileAway = 0
                userScrolledAway = false
            } else if (scrolling) {
                val start = dragStartGap
                if (start != null && bottomGap - start > 150 * density.density) userScrolledAway = true
            }
            // Load history only while you're scrolling up to it (or the chat is too short to scroll)
            if (positioned && nearTop && (scrolling || !fillsScreen)) loadOlder()
        }
    }
    LaunchedEffect(positioned, fillsScreen, timeline.reachedStart) {
        if (positioned && !fillsScreen && !timeline.reachedStart && nearTop) loadOlder()
    }

    val actions = MessageActions(
        reply = {
            replyTo = it
            editing = null
        },
        react = { key, entry -> scope.launch { timeline.toggleReaction(key, entry) } },
        moreReactions = { reactingTo = it },
        edit = {
            editing = it
            replyTo = null
        },
        delete = { entry -> scope.launch { timeline.redact(entry) } },
        vote = { answer, entry -> scope.launch { timeline.vote(answer, entry) } },
        endPoll = { entry -> scope.launch { timeline.endPoll(entry) } },
        roomId = room.id,
        openProfile = { profileUserId = it },
        openRoomLink = { url -> scope.launch { RoomLinks.open(url, session, session.roomList, navigator) } },
        pinnedIds = timeline.pinnedIds,
        canPin = canPin,
        canRedactOthers = canRedactOthers,
        togglePin = { entry -> scope.launch { timeline.togglePin(entry) } },
        report = { reporting = it },
        viewSource = { entry -> scope.launch { sourceText = timeline.source(entry) } },
        openThread = if (threadRoot != null) null else ({ entry -> entry.eventId?.let { navigator.push(Route.Thread(room.id, it)) } }),
        linkPreviews = linkPreviews,
        retry = { timeline.retrySending() },
    )

    fun startCall(video: Boolean) {
        calls.showCallScreen = true
        if (calls.isInCall(room.id)) return
        calls.launchJoin(room, session, if (video) "video" else "audio", ring = true)
    }

    val joinCall: (() -> Unit)? = if (room.inCall || calls.isInCall(room.id)) {
        null
    } else {
        {
            if (!room.isVoice) calls.showCallScreen = true
            calls.launchJoin(room, session, intent = "audio")
        }
    }

    Column(Modifier.fillMaxSize().background(theme.bgSecondary)) {
        RoomTopBar(room, onBack, onShowInfo = { showInfo = true }, onCall = ::startCall,
            inCall = room.inCall || calls.isInCall(room.id),
            inThread = threadRoot != null, onShowThreads = { showThreads = true })
        Box(Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(
                Modifier.fillMaxSize(),
                state = listState,
                reverseLayout = true,
                contentPadding = PaddingValues(top = WZ.Space.space4, bottom = WZ.Space.space4),
            ) {
                item(key = BOTTOM_ID) { Spacer(Modifier.height(0.dp)) }
                items(timeline.uploads.asReversed(), key = { "upload${it.id}" }) { UploadingRow(it) }
                items(timeline.entries.asReversed(), key = { it.id }) { entry ->
                    val highlight by animateColorAsState(
                        if (highlightedId == entry.id) theme.accent.copy(alpha = 0.18f) else Color.Transparent,
                        tween(if (highlightedId == entry.id) WZ.MotionDuration.normal else 600),
                        label = "highlight",
                    )
                    Column(Modifier.fillMaxWidth()) {
                        if (entry.id == unreadDividerId) NewMessagesDivider { unreadDividerId = null }
                        Box(Modifier.background(highlight)) {
                            TimelineRow(entry, actions, room.isDirect, joinCall)
                        }
                    }
                }
                item(key = TOP_ID) {
                    if (timeline.reachedStart && threadRoot != null) {
                        Spacer(Modifier.height(0.dp))
                    } else if (timeline.reachedStart) {
                        TimelineStart(room)
                    } else {
                        // Skeleton rows; history loads as they scroll into view
                        TimelinePlaceholder()
                    }
                }
            }
            val callElsewhere = room.inCallElsewhere || room.callParticipants.any { it != session.userId }
            if (threadRoot == null && !calls.isInCall(room.id) && !room.inCall && callElsewhere) {
                JoinCallBar(room, Modifier.align(Alignment.TopCenter).padding(top = WZ.Space.space3))
            }
            androidx.compose.animation.AnimatedVisibility(
                userScrolledAway && !isAtBottom && (farFromBottom || newWhileAway > 0),
                Modifier.align(Alignment.BottomEnd).padding(end = WZ.Space.space5, bottom = WZ.Space.space4),
                enter = scaleIn(initialScale = 0.6f) + fadeIn(),
                exit = scaleOut(targetScale = 0.6f) + fadeOut(),
            ) {
                JumpToNewestButton(newWhileAway) {
                    newWhileAway = 0
                    scope.launch { scrollToNewest() }
                }
            }
        }
        Column(
            Modifier.fillMaxWidth().padding(bottom = LocalBottomBarInset.current).navigationBarsPadding().imePadding(),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        ) {
            if (threadRoot != null && timeline.reachedStart && timeline.entries.count { it.isContent } <= 1) {
                Text(
                    tr("timeline.threadEmpty"),
                    Modifier.fillMaxWidth(),
                    style = wizardFont(WZ.FontSize.sm),
                    color = theme.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
            org.wizardchat.android.ui.composer.IdentityWarning(room.id, client, room.isEncrypted)
            if (LocalSession.current.connectionLost) {
                OfflineStatus()
            } else if (prefs.typingIndicators && timeline.typingNames.isNotEmpty()) {
                TypingIndicator(timeline.typingNames, timeline.typingIds)
            }
            ComposerView(
                timeline = timeline,
                room = room,
                replyTo = replyTo,
                onReplyToChange = { replyTo = it },
                editing = editing,
                onEditingChange = { editing = it },
                onTyping = { typing -> if (prefs.typingIndicators) timeline.setTyping(typing) },
                threadRoot = threadRoot,
            )
        }
    }

    if (showInfo) {
        RoomInfoSheet(
            room,
            client,
            onDismiss = {
                showInfo = false
                scope.launch { timeline.loadPinned() }
            },
            onJump = { eventId ->
                showInfo = false
                scope.launch { timeline.loadPinned() }
                notifier.eventToFocus = room.id to eventId
            },
        )
    }
    if (showThreads) {
        ThreadListSheet(room, client, onDismiss = { showThreads = false }) { root ->
            showThreads = false
            navigator.push(Route.Thread(room.id, root))
        }
    }
    sourceText?.let { SourceSheet(it) { sourceText = null } }
    reporting?.let { entry -> ReportDialog(onDismiss = { reporting = null }) { reason ->
        scope.launch { if (timeline.reportMessage(entry, reason)) CopyToast.show(L10n.format("timeline.reported")) }
    } }
    profileUserId?.let { UserProfileSheet(it, room.id, onDismiss = { profileUserId = null }) }
    reactingTo?.let { entry ->
        LaunchedEffect(entry.id) { reactionPacks.load(session, room.id) }
        MediaPicker(
            tab = MediaPickerTab.emoji,
            store = reactionPacks,
            onEmoji = { emoji, image -> scope.launch { timeline.toggleReaction(image?.url ?: emoji, entry) } },
            onSticker = {},
            onGif = {},
            onDismiss = { reactingTo = null },
            emojiOnly = true,
        )
    }
}

private const val BOTTOM_ID = "timeline-bottom"
private const val TOP_ID = "timeline-top"

/** The room's title capsule (opens the room info) and, in DMs, the call buttons */
@Composable
private fun RoomTopBar(
    room: RoomSummary,
    onBack: () -> Unit,
    onShowInfo: () -> Unit,
    onCall: (Boolean) -> Unit,
    inCall: Boolean,
    inThread: Boolean,
    onShowThreads: () -> Unit,
) {
    RoomHeader(
        room,
        onBack,
        onShowInfo = if (inThread) null else onShowInfo,
        buttons = if (inThread) 0 else 2,
        title = { if (inThread) ThreadTitle(room) else RoomTitle(room) },
    ) {
        if (!inThread) {
            BarButton("chat-dots", tr("timeline.threads"), onShowThreads, tint = theme.textPrimary)
            Box {
                var callMenu by remember { mutableStateOf(false) }
                BarButton("phone", tr("call.startCall"), { callMenu = true }, enabled = !inCall)
                WizardMenu(
                    callMenu,
                    { callMenu = false },
                    listOf(
                        MenuItem(tr("timeline.voiceCall"), "phone") { onCall(false) },
                        MenuItem(tr("timeline.videoCall"), "video-camera") { onCall(true) },
                    ),
                )
            }
        }
    }
}

/** Back, the room's title capsule (opens the room info when `onShowInfo` is set) and `buttons` bar buttons on the right */
@Composable
internal fun RoomHeader(
    room: RoomSummary,
    onBack: () -> Unit,
    onShowInfo: (() -> Unit)?,
    buttons: Int,
    title: @Composable () -> Unit = { RoomTitle(room) },
    actions: @Composable RowScope.() -> Unit,
) {
    val hint = tr("timeline.showsRoomInfoMembers")
    Box(Modifier.fillMaxWidth().background(theme.bgSecondary).statusBarsPadding().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
        Box(Modifier.align(Alignment.CenterStart)) {
            BarButton("caret-left", tr("common.back"), onBack, weight = PhWeight.bold)
        }
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .padding(start = WZ.Space.space11 + WZ.Space.space2, end = WZ.Space.space11 * buttons)
                .defaultMinSize(minHeight = WZ.Space.space10)
                .shadow(2.dp, CircleShape)
                .clip(CircleShape)
                .background(theme.bgTertiary)
                .clickable(enabled = onShowInfo != null, onClick = { onShowInfo?.invoke() })
                .semantics { contentDescription = "${room.displayName}. $hint" }
                .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space2),
            contentAlignment = Alignment.Center,
        ) {
            title()
        }
        Row(Modifier.align(Alignment.CenterEnd), verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

@Composable
private fun ThreadTitle(room: RoomSummary) {
    Column(Modifier.widthIn(max = WZ.Size.sidebar), horizontalAlignment = Alignment.Start) {
        Text(tr("timeline.threadPanel"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1)
        Text(
            room.displayName,
            style = wizardFont(WZ.FontSize.xs),
            color = theme.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
internal fun RoomTitle(room: RoomSummary) {
    val prefs = LocalPrefs.current
    Column(Modifier.widthIn(max = WZ.Size.sidebar), horizontalAlignment = Alignment.Start) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (prefs.showRoomAvatars) WZ.Space.space3 else WZ.Space.space1),
        ) {
            if (prefs.showRoomAvatars) {
                Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.xs)
            } else if (!room.isDirect) {
                PhIcon(if (room.isVoice) "speaker-high" else "hash-straight", size = WZ.SizeIcon.xs, tint = theme.textMuted)
            }
            Text(
                room.displayName,
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (prefs.developerMode) {
            Text(
                room.id,
                Modifier.clickable { copyToClipboard(room.id) },
                style = wizardFont(WZ.SizeIcon.xs.value.sp).copy(fontFamily = FontFamily.Monospace),
                color = theme.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun NewMessagesDivider(onDismiss: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        HorizontalDivider(Modifier.weight(1f), thickness = 1.dp, color = theme.accent)
        Text(
            tr("timeline.unreadMessages").uppercase(),
            style = wizardFont(WZ.FontSize.xs, FontWeight.Bold).copy(letterSpacing = 0.4.sp),
            color = theme.accent,
            maxLines = 1,
        )
        HorizontalDivider(Modifier.weight(1f), thickness = 1.dp, color = theme.accent)
        Box(
            Modifier
                .size(16.dp)
                .clip(CircleShape)
                .background(theme.accent.copy(alpha = 0.8f))
                .clickable(onClick = onDismiss)
                .semantics { contentDescription = L10n.format("common.dismiss") },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("x", PhWeight.bold, size = 9.dp, tint = Color.White)
        }
    }
}

@Composable
private fun JumpToNewestButton(newCount: Int, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(newCount) { if (newCount > 0) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    val label = if (newCount > 0) L10n.format("timeline.jumpToNewestNew", newCount) else tr("timeline.jumpToNewest")
    Box(Modifier.padding(top = WZ.Space.space4)) {
        Box(
            Modifier
                .size(WZ.Space.space10)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(theme.bgTertiary)
                .clickable(onClick = onClick)
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            PhIcon("caret-down", size = WZ.SizeIcon.sm, tint = theme.textPrimary)
        }
        if (newCount > 0) {
            Text(
                if (newCount > 99) "99+" else "$newCount",
                Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = -WZ.Space.space4)
                    .defaultMinSize(minWidth = WZ.Space.space7, minHeight = WZ.Space.space7)
                    .background(theme.accent, CircleShape)
                    .padding(horizontal = WZ.Space.space2, vertical = WZ.Space.space1),
                style = wizardFont(WZ.FontSize.xs, FontWeight.Bold),
                color = theme.textOnAccent,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun TimelinePlaceholder() {
    val transition = rememberInfiniteTransition(label = "placeholder")
    val pulse by transition.animateFloat(0.5f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "pulse")
    val label = tr("timeline.loadingOlderMessages")
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space5)
            .alpha(pulse)
            .semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
    ) {
        PlaceholderRow(0.55f, 0.35f)
        PlaceholderRow(0.7f, 0.5f)
        PlaceholderRow(0.45f, 0.6f)
    }
}

@Composable
private fun PlaceholderRow(first: Float, second: Float) {
    Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
        Box(Modifier.size(WZ.Space.space9).background(theme.fill, CircleShape))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Box(Modifier.fillMaxWidth(first).height(WZ.Space.space5).background(theme.fill, CircleShape))
            Box(Modifier.fillMaxWidth(second).height(WZ.Space.space5).background(theme.fill, CircleShape))
        }
    }
}

@Composable
private fun TimelineStart(room: RoomSummary) {
    Column(
        Modifier.fillMaxWidth().padding(start = WZ.Space.space6, end = WZ.Space.space6, top = WZ.Space.space9, bottom = WZ.Space.space5),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
    ) {
        Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.xl, modifier = Modifier.padding(bottom = WZ.Space.space2))
        Text(room.displayName, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
        Text(tr("timeline.thisIsTheStart"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
    }
}

@Composable
private fun TimelineRow(entry: ChatEntry, actions: MessageActions, isPrivateRoom: Boolean, joinCall: (() -> Unit)?) {
    when (val kind = entry.kind) {
        is ChatEntry.Kind.DateDivider -> Text(
            when {
                Formats.isToday(kind.date) -> tr("timeline.dateToday")
                Formats.isYesterday(kind.date) -> tr("timeline.dateYesterday")
                else -> Formats.longDate(kind.date)
            },
            Modifier.fillMaxWidth().padding(top = WZ.Space.space6, bottom = WZ.Space.space3),
            style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textMuted,
            textAlign = TextAlign.Center,
        )
        is ChatEntry.Kind.System -> Text(
            kind.text,
            Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space9, vertical = WZ.Space.space1),
            style = wizardFont(WZ.FontSize.sm),
            color = theme.textMuted,
            textAlign = TextAlign.Center,
        )
        is ChatEntry.Kind.Call -> CallRow(kind.call, actions.roomId, joinCall, actions.openProfile)
        else -> MessageRow(entry, actions, isPrivateRoom)
    }
}

private fun callDuration(milliseconds: Long): String {
    val minutes = Math.round(milliseconds / 60_000.0).toInt()
    return when {
        minutes < 1 -> L10n.format("call.event.fewSeconds")
        minutes < 60 -> L10n.plural("call.event.minutes", minutes, minutes)
        else -> Math.round(minutes / 60.0).toInt().let { L10n.plural("call.event.hours", it, it) }
    }
}

@Composable
private fun CallRow(call: CallHistoryView, roomId: String, joinCall: (() -> Unit)?, openProfile: (String) -> Unit) {
    val me = LocalSession.current.userId
    val profile = rememberMemberProfile(call.startedBy, roomId)
    val name = profile.name ?: call.participants.firstOrNull { it.userId == call.startedBy }?.displayName ?: call.startedBy
    val mine = call.startedBy == me
    val answered = call.outcome == CallOutcome.ongoing || call.outcome == CallOutcome.ended
    val endedAt = call.endedAt
    val line = when (call.outcome) {
        CallOutcome.ongoing -> if (mine) tr("call.event.startedYou") else tr("call.event.started", name)
        CallOutcome.ended -> if (call.partial || endedAt == null) {
            if (mine) tr("call.event.startedYou") else tr("call.event.started", name)
        } else {
            val duration = callDuration(endedAt - call.startedAt)
            if (mine) tr("call.event.lastedYou", duration) else tr("call.event.lasted", name, duration)
        }
        CallOutcome.missed -> tr("call.event.missedFrom", name)
        CallOutcome.declined -> when {
            mine -> tr("call.event.declinedYours")
            me != null && me in call.declinedBy -> tr("call.event.declinedByYou", name)
            else -> tr("call.event.declinedOther", name)
        }
        CallOutcome.unanswered -> if (mine) tr("call.event.unansweredYours") else tr("call.event.unansweredOther", name)
    }.replace(Regex("</?name>"), "")
    val starterColor = nameColor(call.startedBy)
    val text = buildAnnotatedString {
        val start = if (mine) -1 else line.indexOf(name)
        if (start < 0) {
            append(line)
        } else {
            append(line.substring(0, start))
            val link = LinkAnnotation.Clickable(
                "profile",
                TextLinkStyles(SpanStyle(color = starterColor, fontWeight = FontWeight.SemiBold)),
            ) { openProfile(call.startedBy) }
            withLink(link) { append(name) }
            append(line.substring(start + name.length))
        }
        withStyle(SpanStyle(fontSize = WZ.FontSize.xs.value.sp)) {
            append("  ")
            append(Formats.time(Instant.ofEpochMilli(call.startedAt)))
        }
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(WZ.SizeAvatar.md), contentAlignment = Alignment.Center) {
            PhIcon(
                if (!answered) "phone-x" else if (call.video) "video-camera" else "phone",
                if (answered) PhWeight.fill else PhWeight.regular,
                size = WZ.SizeIcon.md,
                tint = if (answered) theme.success else theme.danger,
            )
        }
        Text(text, Modifier.weight(1f), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
        if (call.outcome == CallOutcome.ongoing && joinCall != null) {
            Text(
                tr("common.join"),
                Modifier
                    .clip(CircleShape)
                    .background(theme.success)
                    .clickable(onClick = joinCall)
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space2),
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textOnAccent,
                maxLines = 1,
            )
        }
    }
}

/** One message: avatar, name and time, content, link preview, reactions and read receipts */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageRow(entry: ChatEntry, actions: MessageActions? = null, isPrivateRoom: Boolean = true, modifier: Modifier = Modifier) {
    val prefs = LocalPrefs.current
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val scale = prefs.chatScale
    val spacing = prefs.chatSpacing
    val isCompact = prefs.messageLayout == MessageLayout.compact
    var showFailed by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    var swipe by remember { mutableFloatStateOf(0f) }
    val replyThreshold = 64f
    val animatedSwipe by animateFloatAsState(swipe, spring(), label = "swipe")
    val isText = entry.kind is ChatEntry.Kind.Message || entry.kind is ChatEntry.Kind.Redacted || entry.kind is ChatEntry.Kind.Undecryptable
    // Only timeline rows have the menu
    val longPress: (() -> Unit)? = if (actions != null && entry.isContent && entry.allowsActions) {
        {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            showMenu = true
        }
    } else {
        null
    }
    val canSwipe = actions != null && entry.canBeRepliedTo && entry.itemKey != null
    var crossed by remember { mutableStateOf(false) }

    CompositionLocalProvider(LocalMessageLongPress provides longPress) {
        Box(modifier.fillMaxWidth()) {
            if (animatedSwipe > 8f) {
                Box(
                    Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = WZ.Space.space5)
                        .size(WZ.Space.space9)
                        .scale(minOf(animatedSwipe / replyThreshold, 1f))
                        .background(theme.fill, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon(
                        "arrow-bend-up-left",
                        size = WZ.SizeIcon.sm,
                        tint = if (animatedSwipe >= replyThreshold) theme.accent else theme.textMuted,
                    )
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .offset { IntOffset((animatedSwipe * density.density).roundToInt(), 0) }
                    .then(
                        if (canSwipe) {
                            Modifier.draggable(
                                rememberDraggableState { delta ->
                                    val dx = delta / density.density
                                    swipe = (swipe + dx * 0.6f).coerceIn(0f, replyThreshold + 20f)
                                    val over = swipe >= replyThreshold
                                    if (over && !crossed) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    crossed = over
                                },
                                Orientation.Horizontal,
                                onDragStopped = {
                                    if (swipe >= replyThreshold) actions?.reply?.invoke(entry)
                                    swipe = 0f
                                    crossed = false
                                },
                            )
                        } else {
                            Modifier
                        },
                    )
                    .combinedClickable(
                        interactionSource = null,
                        indication = null,
                        enabled = longPress != null,
                        onLongClick = longPress,
                        onClick = {},
                    )
                    .padding(horizontal = WZ.Space.space6)
                    .padding(
                        top = (if (entry.isGrouped || isCompact) 1 else 6).dp * spacing,
                        bottom = (if (entry.isGrouped || isCompact) 1 else 2).dp * spacing,
                    ),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            ) {
                if (!isCompact && entry.isGrouped) {
                    Spacer(Modifier.width(WZ.SizeAvatar.md))
                } else if (!isCompact) {
                    Avatar(
                        entry.senderName,
                        entry.senderAvatarUrl,
                        WZ.SizeAvatar.md,
                        modifier = Modifier.padding(top = WZ.Space.space1).clickable(enabled = actions != null) { actions?.openProfile?.invoke(entry.sender) },
                    )
                }
                Column(Modifier.weight(1f).padding(end = WZ.Space.space5)) {
                    if (isCompact) {
                        if (entry.kind !is ChatEntry.Kind.Message) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                                Text(Formats.time(entry.timestamp), style = wizardFont(WZ.FontSize.xs * scale), color = theme.textMuted)
                                Text(
                                    entry.senderName,
                                    Modifier.clickable(enabled = actions != null) { actions?.openProfile?.invoke(entry.sender) },
                                    style = wizardFont(WZ.FontSize.md * scale, FontWeight.SemiBold),
                                    color = nameColor(entry.sender),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    } else if (!entry.isGrouped) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                            Text(
                                entry.senderName,
                                Modifier.weight(1f, fill = false).clickable(enabled = actions != null) { actions?.openProfile?.invoke(entry.sender) },
                                style = wizardFont(WZ.FontSize.md * scale, FontWeight.SemiBold),
                                color = nameColor(entry.sender),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(Formats.time(entry.timestamp), style = wizardFont(WZ.FontSize.sm * scale), color = theme.textMuted)
                            val eventId = entry.eventId
                            if (eventId != null && actions?.pinnedIds?.contains(eventId) == true) {
                                PhIcon(
                                    "push-pin",
                                    size = WZ.SizeIcon.xs * scale,
                                    tint = theme.textMuted,
                                    contentDescription = tr("timeline.pinned"),
                                )
                            }
                        }
                    }
                    entry.replyTo?.let { ReplyQuoteView(it) }
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                        val sending = entry.isSending && !entry.sendFailed
                        Box(Modifier.weight(1f, fill = false).alpha(if (sending && isText) 0.5f else 1f), contentAlignment = Alignment.Center) {
                            MessageContent(entry, actions, isPrivateRoom, isText)
                            if (sending && !isText) UploadProgressRing(null)
                        }
                        if (entry.sendFailed) {
                            Box {
                                Box(Modifier.clip(CircleShape).clickable { showFailed = true }) {
                                    PhIcon("warning-circle", size = WZ.SizeIcon.md, tint = theme.danger, contentDescription = tr("timeline.notSent"))
                                }
                                if (showFailed) {
                                    MenuDialog(
                                        title = tr("timeline.notSentTitle"),
                                        onDismiss = { showFailed = false },
                                        options = listOf(
                                            tr("composer.voice.retry") to { actions?.retry?.invoke(); Unit },
                                        ),
                                        destructive = tr("common.delete") to { actions?.delete?.invoke(entry); Unit },
                                    )
                                }
                            }
                        }
                    }
                    val loader = actions?.linkPreviews
                    val body = (entry.kind as? ChatEntry.Kind.Message)?.body
                    if (loader != null && body != null) {
                        MessageText.firstPreviewURL(body)?.let { LinkPreviewCard(it, loader) }
                    }
                    if (entry.reactions.isNotEmpty() && entry.allowsActions) {
                        ReactionsBar(entry.reactions) { key -> actions?.react?.invoke(key, entry) }
                    }
                    val thread = entry.thread
                    val openThread = actions?.openThread
                    if (thread != null && thread.replies > 0 && actions != null && openThread != null) {
                        ThreadSummaryBadge(thread, actions.roomId) { openThread(entry) }
                    }
                    val roomId = actions?.roomId
                    if (entry.readBy.isNotEmpty() && roomId != null) {
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                            ReadReceiptsView(roomId, entry.readBy, entry.readAt)
                        }
                    }
                }
            }
            if (showMenu) {
                MessageMenu(entry, actions, onDismiss = { showMenu = false })
            }
        }
    }
}

@Composable
private fun MessageContent(entry: ChatEntry, actions: MessageActions?, isPrivateRoom: Boolean, isText: Boolean) {
    val prefs = LocalPrefs.current
    val scale = prefs.chatScale
    if (isText) {
        val isClassic = prefs.messageLayout == MessageLayout.classic
        Box(
            if (isClassic) {
                Modifier
                    .background(if (entry.isOwn) theme.msgMineBg else theme.msgOtherBg, RoundedCornerShape(WZ.Radius.xl))
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4)
            } else {
                Modifier
            },
        ) {
            TextContent(
                entry,
                linkOnAccent = isClassic && entry.isOwn && theme.isDark,
                onMention = actions?.openProfile,
                onRoomLink = actions?.openRoomLink,
            )
        }
        return
    }
    val captionStyle = wizardFont(WZ.FontSize.lg * scale)
    when (val kind = entry.kind) {
        is ChatEntry.Kind.Image -> Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
            if (entry.galleryItems.size >= 2) {
                GalleryGridView(entry.galleryItems, isPrivateRoom)
            } else {
                ImageMessageView(kind.media, isPrivateRoom = isPrivateRoom, spoiler = entry.mediaSpoiler)
            }
            kind.media.caption?.let { Text(it, style = captionStyle, color = theme.textPrimary) }
        }
        is ChatEntry.Kind.Sticker -> ImageMessageView(kind.media, isSticker = true, isPrivateRoom = isPrivateRoom)
        is ChatEntry.Kind.Video -> Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
            VideoMessageView(kind.media, entry.mediaSpoiler)
            kind.media.caption?.let { Text(it, style = captionStyle, color = theme.textPrimary) }
        }
        is ChatEntry.Kind.Audio -> AudioMessageView(kind.media, kind.isVoice, kind.waveform)
        is ChatEntry.Kind.File -> FileMessageView(kind.media)
        is ChatEntry.Kind.Location -> LocationMessageView(kind.geoUri, kind.description)
        is ChatEntry.Kind.Poll -> PollMessageView(
            kind.poll,
            entry.isOwn,
            onVote = { actions?.vote?.invoke(it, entry) },
            onEnd = { actions?.endPoll?.invoke(entry) },
        )
        else -> {}
    }
}

@Composable
private fun TextContent(
    entry: ChatEntry,
    linkOnAccent: Boolean,
    onMention: ((String) -> Unit)?,
    onRoomLink: ((String) -> Unit)? = null,
) {
    val session = LocalSession.current
    val prefs = LocalPrefs.current
    val scale = prefs.chatScale
    var spoilersRevealed by remember { mutableStateOf(false) }
    val kindBody = (entry.kind as? ChatEntry.Kind.Message)?.takeIf { !it.isEmote }?.body
    val size = WZ.FontSize.lg * scale * (if (kindBody != null && MessageText.isEmojiOnly(kindBody)) 2.5f else 1f)
    val style = wizardFont(size).copy(lineHeight = (size.value + 3 * scale + 4).sp)
    val rich = entry.rich
    val message = entry.kind as? ChatEntry.Kind.Message
    if (rich != null && message != null && !message.isEmote) {
        val kind = message
        val hint = if (entry.spoilers.isEmpty() || spoilersRevealed) null else tr("timeline.containsASpoilerTap")
        Column(
            Modifier
                .then(if (entry.spoilers.isNotEmpty()) Modifier.messageTap { spoilersRevealed = !spoilersRevealed } else Modifier)
                .then(if (hint != null) Modifier.semantics { contentDescription = "${kind.body} $hint" } else Modifier),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        ) {
            if (prefs.messageLayout == MessageLayout.compact) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontSize = WZ.FontSize.xs * scale, color = theme.textMuted)) { append(Formats.time(entry.timestamp)) }
                        append("  ")
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = nameColor(entry.sender))) { append(entry.senderName) }
                    },
                    style = style,
                )
            }
            RichBlocks(
                rich,
                RichStyle(
                    text = style,
                    color = if (kind.isNotice) theme.textMuted else theme.textPrimary,
                    linkColor = if (linkOnAccent) theme.textOnAccent else theme.linkColor,
                    mentionColors = MentionColors(theme.mention, if (linkOnAccent) theme.textOnAccent else theme.accent),
                    mentions = entry.mentions,
                    revealSpoilers = spoilersRevealed || entry.spoilers.isEmpty(),
                    prettifyLinks = prefs.prettifyLinks,
                    scale = scale,
                    onMention = onMention,
                    onRoomLink = onRoomLink,
                    roomName = { RoomLinks.knownName(it, session.roomList) },
                    codeBackground = theme.fill,
                    cover = theme.textMuted,
                ),
            )
            if (entry.isEdited) {
                Text(tr("timeline.edited"), style = wizardFont(WZ.FontSize.xs * scale), color = theme.textMuted)
            }
        }
        return
    }
    when (val kind = entry.kind) {
        is ChatEntry.Kind.Message -> {
            val linkColor = if (linkOnAccent) theme.textOnAccent else theme.linkColor
            val body = if (kind.isEmote) "* ${entry.senderName} ${kind.body}" else kind.body
            val text = MessageText.attributed(
                body,
                prefs.prettifyLinks,
                linkColor,
                if (spoilersRevealed) emptyList() else entry.spoilers,
                theme.textMuted,
                entry.mentions,
                MentionColors(theme.mention, if (linkOnAccent) theme.textOnAccent else theme.accent),
                onMention,
            )
            val edited = tr("timeline.edited")
            val hint = if (entry.spoilers.isEmpty() || spoilersRevealed) null else tr("timeline.containsASpoilerTap")
            val compact = prefs.messageLayout == MessageLayout.compact
            val full = buildAnnotatedString {
                if (compact) {
                    withStyle(SpanStyle(fontSize = WZ.FontSize.xs * scale, color = theme.textMuted)) { append(Formats.time(entry.timestamp)) }
                    append("  ")
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = nameColor(entry.sender))) { append(entry.senderName) }
                    append("  ")
                }
                withStyle(SpanStyle(fontStyle = if (kind.isEmote) FontStyle.Italic else FontStyle.Normal)) { append(text) }
                if (entry.isEdited) {
                    append(" ")
                    withStyle(SpanStyle(fontSize = WZ.FontSize.xs * scale, color = theme.textMuted)) { append(edited) }
                }
            }
            Text(
                full,
                Modifier
                    .then(if (entry.spoilers.isNotEmpty()) Modifier.messageTap { spoilersRevealed = !spoilersRevealed } else Modifier)
                    .then(if (hint != null) Modifier.semantics { contentDescription = "${text.text} $hint" } else Modifier),
                style = style,
                color = if (kind.isNotice) theme.textMuted else theme.textPrimary,
            )
        }
        is ChatEntry.Kind.Redacted -> DeletedLabel("trash", tr("timeline.messageDeleted"), style)
        is ChatEntry.Kind.Undecryptable -> DeletedLabel("lock", tr("timeline.waitingForThisMessage"), style)
        else -> {}
    }
}

/** What a formatted message's text needs besides its blocks */
private data class RichStyle(
    val text: androidx.compose.ui.text.TextStyle,
    val color: Color,
    val linkColor: Color,
    val mentionColors: MentionColors,
    val mentions: List<MessageMention>,
    val revealSpoilers: Boolean,
    val prettifyLinks: Boolean,
    val scale: Float,
    val onMention: ((String) -> Unit)?,
    val onRoomLink: ((String) -> Unit)? = null,
    val roomName: (String) -> String? = { null },
    val codeBackground: Color,
    val cover: Color,
)

/** A formatted message as the web shows it: paragraphs, headings, quotes, lists and code blocks */
@Composable
private fun RichBlocks(blocks: List<RichBlock>, style: RichStyle) {
    Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        blocks.forEach { RichBlockView(it, style) }
    }
}

@Composable
private fun RichBlockView(block: RichBlock, style: RichStyle) {
    when (block) {
        is RichBlock.Paragraph -> Text(richText(block.spans, style), style = style.text, color = style.color)
        is RichBlock.Heading -> {
            val size = when (block.level) {
                1L -> WZ.FontSize.xxl
                2L -> WZ.FontSize.xl
                else -> WZ.FontSize.lg
            } * style.scale
            Text(
                richText(block.spans, style),
                style = style.text.copy(fontSize = size, lineHeight = size * 1.3f, fontWeight = FontWeight.Bold),
                color = style.color,
            )
        }
        is RichBlock.Quote -> Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
            Box(Modifier.width(WZ.Space.space1).fillMaxHeight().clip(RoundedCornerShape(WZ.Radius.xs)).background(theme.border))
            RichBlocks(block.blocks, style.copy(color = theme.textSecondary))
        }
        is RichBlock.ItemList -> Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space2)) {
            block.items.forEachIndexed { index, item ->
                Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
                    Text(if (block.ordered) "${block.start + index}." else "•", style = style.text, color = theme.textMuted)
                    Box(Modifier.weight(1f)) { RichBlocks(item, style) }
                }
            }
        }
        is RichBlock.Code -> Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(WZ.Radius.md))
                .background(theme.fill)
                .horizontalScroll(rememberScrollState())
                .padding(WZ.Space.space4),
        ) {
            Text(
                block.text,
                style = style.text.copy(fontFamily = FontFamily.Monospace, fontSize = WZ.FontSize.md * style.scale),
                color = style.color,
                softWrap = false,
            )
        }
        RichBlock.Rule -> Box(Modifier.fillMaxWidth().height(WZ.BorderWidth.thin).background(theme.border))
    }
}

/** Styled runs as one annotated string: bold, italic, strikethrough, code, links, mention pills and hidden spoilers */
private fun richText(spans: List<RichSpan>, style: RichStyle): AnnotatedString = buildAnnotatedString {
    for (span in spans) {
        val decorations = listOfNotNull(
            if (span.strike) TextDecoration.LineThrough else null,
            if (span.underline) TextDecoration.Underline else null,
        )
        var spanStyle = SpanStyle(
            fontWeight = if (span.bold) FontWeight.Bold else null,
            fontStyle = if (span.italic) FontStyle.Italic else null,
            textDecoration = if (decorations.isEmpty()) null else TextDecoration.combine(decorations),
            fontFamily = if (span.code) FontFamily.Monospace else null,
            background = if (span.code) style.codeBackground else Color.Unspecified,
        )
        val hidden = span.spoiler && !style.revealSpoilers
        if (hidden) spanStyle = spanStyle.copy(color = Color.Transparent, background = style.cover)
        val mention = span.mention
        val link = span.link
        when {
            hidden -> withStyle(spanStyle) { append(span.text) }
            mention != null -> {
                val pill = TextLinkStyles(style.mentionColors.pill(style.mentions.any { it.userId == mention && it.isOwn }))
                val onMention = style.onMention
                pushLink(
                    if (onMention != null) {
                        LinkAnnotation.Clickable(mention, pill) { onMention(mention) }
                    } else {
                        LinkAnnotation.Url("https://matrix.to/#/$mention", pill)
                    },
                )
                append(span.text)
                pop()
            }
            link != null && RoomLinks.target(link) != null -> {
                val pill = TextLinkStyles(style.mentionColors.pill(isOwn = false))
                val onRoomLink = style.onRoomLink
                pushLink(if (onRoomLink != null) LinkAnnotation.Clickable(link, pill) { onRoomLink(link) } else LinkAnnotation.Url(link, pill))
                val name = style.roomName(link)
                append(if (name != null) "#$name" else if (span.text.startsWith("#") || span.text.startsWith("!")) span.text else "#${span.text}")
                pop()
            }
            link != null -> {
                pushLink(LinkAnnotation.Url(link, TextLinkStyles(SpanStyle(color = style.linkColor))))
                withStyle(spanStyle) { append(span.text) }
                pop()
            }
            span.code -> withStyle(spanStyle) { append(span.text) }
            else -> withStyle(spanStyle) { append(MessageText.attributed(span.text, style.prettifyLinks, style.linkColor)) }
        }
    }
}

@Composable
private fun DeletedLabel(icon: String, text: String, style: androidx.compose.ui.text.TextStyle) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
        PhIcon(icon, size = WZ.SizeIcon.sm, tint = theme.textMuted)
        Text(text, style = style.copy(fontStyle = FontStyle.Italic), color = theme.textMuted)
    }
}

@Composable
private fun UploadingRow(upload: PendingUpload) {
    val preview = upload.preview
    val width = preview?.width?.toFloat() ?: 260f
    val height = preview?.height?.toFloat() ?: 72f
    val scale = minOf(260f / maxOf(width, 1f), 320f / maxOf(height, 1f), 1f)
    val label = L10n.format("timeline.uploading", upload.filename)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space1)
            .semantics(mergeDescendants = true) { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
    ) {
        Spacer(Modifier.width(WZ.SizeAvatar.md))
        Box(
            Modifier
                .size(maxOf(width * scale, 60f).dp, maxOf(height * scale, 60f).dp)
                .clip(RoundedCornerShape(WZ.Radius.lg))
                .background(theme.fill),
            contentAlignment = Alignment.Center,
        ) {
            if (preview != null) {
                Image(preview.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            UploadProgressRing(upload.progress)
        }
    }
}

@Composable
private fun UploadProgressRing(progress: Float?) {
    val label = tr("attachment.uploading")
    Box(
        Modifier.size(WZ.Space.space10).background(theme.overlay, CircleShape).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (progress != null) {
            androidx.compose.material3.CircularProgressIndicator(
                progress = { maxOf(progress, 0.03f) },
                modifier = Modifier.size(WZ.Space.space10),
                color = theme.textOnAccent,
                trackColor = theme.textOnAccent.copy(alpha = 0.3f),
                strokeWidth = WZ.BorderWidth.thick,
            )
        } else {
            androidx.compose.material3.CircularProgressIndicator(
                Modifier.size(WZ.SizeIcon.md),
                color = theme.textOnAccent,
                strokeWidth = WZ.BorderWidth.thick,
            )
        }
    }
}

/** The long-press menu of a message, with quick reactions on top */
@Composable
private fun MessageMenu(entry: ChatEntry, actions: MessageActions?, onDismiss: () -> Unit) {
    val eventId = entry.eventId
    DropdownMenu(expanded = true, onDismissRequest = onDismiss, containerColor = theme.bgTertiary) {
        fun run(action: () -> Unit) {
            onDismiss()
            action()
        }

        @Composable
        fun item(label: String, icon: String, destructive: Boolean = false, action: () -> Unit) {
            val color = if (destructive) theme.danger else theme.textPrimary
            DropdownMenuItem(
                text = { Text(label, style = wizardFont(WZ.FontSize.lg), color = color) },
                leadingIcon = { PhIcon(icon, tint = color) },
                onClick = { run(action) },
            )
        }
        if (actions != null && entry.itemKey != null) {
            Row(
                Modifier.padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space2),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space1),
            ) {
                val recentEmoji = RecentEmoji.shared
                recentEmoji.quickReactions.forEach { emoji ->
                    Box(
                        Modifier.size(WZ.Space.space10).clip(CircleShape).clickable {
                            run {
                                recentEmoji.use(emoji, Emoji.labelOf(emoji))
                                actions.react(emoji, entry)
                            }
                        },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(emoji, fontSize = WZ.SizeIcon.xl.value.sp)
                    }
                }
            }
            HorizontalDivider(color = theme.border)
            item(tr("timeline.addReaction"), "smiley") { actions.moreReactions(entry) }
            if (entry.canBeRepliedTo) item(tr("timeline.reply"), "arrow-bend-up-left") { actions.reply(entry) }
            val openThread = actions.openThread
            if (entry.canBeRepliedTo && openThread != null) item(tr("timeline.replyInThread"), "chat-dots") { openThread(entry) }
            if (entry.isOwn && entry.isEditable && entry.editableText != null) {
                item(tr("common.edit"), "pencil-simple") { actions.edit(entry) }
            }
        }
        if (entry.summary.isNotEmpty() && entry.kind is ChatEntry.Kind.Message) {
            item(tr("common.copy"), "copy") { copyToClipboard(entry.summary) }
        }
        if (actions != null && eventId != null) {
            item(tr("common.copyLink"), "link-simple") {
                copyToClipboard("https://matrix.to/#/${actions.roomId}/$eventId", L10n.format("timeline.linkCopied"))
            }
            if (actions.canPin) {
                val pinned = eventId in actions.pinnedIds
                item(if (pinned) tr("timeline.unpin") else tr("timeline.pin"), if (pinned) "push-pin-slash" else "push-pin") {
                    actions.togglePin(entry)
                }
            }
            item(tr("timeline.viewSource"), "code") { actions.viewSource(entry) }
            HorizontalDivider(color = theme.border)
            if (!entry.isOwn) item(tr("timeline.reportShort"), "flag", destructive = true) { actions.report(entry) }
            if (entry.isOwn || actions.canRedactOthers) item(tr("common.delete"), "trash", destructive = true) { actions.delete(entry) }
        }
    }
}

/** A titled list of choices */
@Composable
private fun MenuDialog(title: String, onDismiss: () -> Unit, options: List<Pair<String, () -> Unit>>, destructive: Pair<String, () -> Unit>? = null) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(title, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            Column {
                options.forEach { (label, action) ->
                    TextButton(onClick = {
                        onDismiss()
                        action()
                    }, Modifier.fillMaxWidth()) {
                        Text(label, style = wizardFont(WZ.FontSize.lg), color = theme.accent)
                    }
                }
                destructive?.let { (label, action) ->
                    TextButton(onClick = {
                        onDismiss()
                        action()
                    }, Modifier.fillMaxWidth()) {
                        Text(label, style = wizardFont(WZ.FontSize.lg), color = theme.danger)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(tr("common.cancel"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.accent) }
        },
    )
}

/** "Report message" with an optional reason */
@Composable
private fun ReportDialog(onDismiss: () -> Unit, onReport: (String?) -> Unit) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = theme.bgTertiary,
        title = { Text(tr("timeline.reportMessage"), style = wizardFont(WZ.FontSize.xl, FontWeight.SemiBold), color = theme.textPrimary) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
                Text(tr("timeline.yourHomeserverSAdmins"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
                WizardTextField(reason, { reason = it }, tr("common.reasonOptional"))
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onReport(reason.ifEmpty { null })
            }) {
                Text(tr("timeline.reportShort"), style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.danger)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(tr("common.cancel"), style = wizardFont(WZ.FontSize.lg), color = theme.accent) }
        },
    )
}

@Composable
private fun OfflineStatus() {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space8),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spinner(size = WZ.SizeIcon.xs, color = theme.warningColor)
        Text(tr("banner.offline"), style = wizardFont(WZ.FontSize.sm, FontWeight.Medium), color = theme.warningColor, maxLines = 1)
    }
}

@Composable
private fun TypingIndicator(names: List<String>, ids: List<String>) {
    val colored = names.zip(ids).map { (name, id) -> name to nameColor(id) }
    Text(
        withNameColors(
            when (names.size) {
                1 -> tr("timeline.oneTyping", names[0])
                2 -> tr("timeline.twoTyping", names[0], names[1])
                else -> tr("timeline.typingMany")
            },
            colored,
        ),
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space8),
        style = wizardFont(WZ.FontSize.sm, FontWeight.Medium),
        color = theme.textMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}
