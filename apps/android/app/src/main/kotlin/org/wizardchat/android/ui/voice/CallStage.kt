package org.wizardchat.android.ui.voice

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.track.VideoTrack
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import livekit.org.webrtc.RendererCommon
import livekit.org.webrtc.VideoSink
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.CallParticipantInfo
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.Spinner
import org.wizardchat.android.ui.WizardMenu
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ
import io.livekit.android.room.Room as LiveKitRoom

internal sealed interface StageTile {
    val key: String
    val isStage: Boolean get() = this !is Person

    data class Person(val participant: CallParticipantInfo) : StageTile {
        override val key: String get() = participant.identity
    }

    data class Screen(val participant: CallParticipantInfo) : StageTile {
        override val key: String get() = "${participant.identity}:screen"
    }

    data object Watch : StageTile {
        override val key: String get() = "watch-together"
    }
}

private enum class StageLayout { Calling, OneOnOne, Grid, Spotlight }

private enum class PipCorner { TopStart, TopEnd, BottomStart, BottomEnd }

internal enum class TileStyle { Full, Pip, Tile, Focused, Strip }

private data class StageInsets(val top: Dp, val bottom: Dp, val start: Dp, val end: Dp)

private val Gap = WZ.Space.space4
private const val AUTO_HIDE_MILLIS = 5000L

/**
 * The call itself: one other person full screen with you in a corner, a grid, or one tile in
 * focus with the rest in a strip; screen shares and Watch Together only once you choose to watch
 */
@Composable
fun InCallView(
    room: RoomSummary,
    modifier: Modifier = Modifier,
    title: String? = null,
    onMinimize: (() -> Unit)? = null,
    onOpenChat: (() -> Unit)? = null,
) {
    val calls = CallManager.shared
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    var pinned by rememberSaveable { mutableStateOf<String?>(null) }
    var preferred by rememberSaveable { mutableStateOf<StageLayout?>(null) }
    var lastSpeaker by remember { mutableStateOf<String?>(null) }
    var swapped by rememberSaveable { mutableStateOf(false) }
    var corner by rememberSaveable { mutableStateOf(PipCorner.BottomEnd) }
    var chromeVisible by remember { mutableStateOf(true) }
    var chromeTouches by remember { mutableIntStateOf(0) }
    var headerHeight by remember { mutableStateOf(0.dp) }
    var controlsHeight by remember { mutableStateOf(0.dp) }
    var volumeFor by remember { mutableStateOf<String?>(null) }

    val local = calls.participants.firstOrNull { it.isLocal }
    val others = calls.participants.filter { !it.isLocal }
    val watch = calls.watch
    val watchState = watch?.state
    val watchingNow = watchState != null && watch.watchingVideoId == watchState.videoId
    val tiles = buildList {
        if (watchState != null) add(StageTile.Watch)
        calls.participants.forEach { add(StageTile.Person(it)) }
        calls.participants.filter { it.screenShared }.forEach { add(StageTile.Screen(it)) }
    }
    val hasStage = tiles.any { it.isStage }
    val layout = when {
        others.isEmpty() && !hasStage && !room.isVoice -> StageLayout.Calling
        preferred == StageLayout.Grid -> StageLayout.Grid
        preferred == StageLayout.Spotlight -> StageLayout.Spotlight
        others.size == 1 && !hasStage && pinned == null -> StageLayout.OneOnOne
        pinned != null || hasStage -> StageLayout.Spotlight
        else -> StageLayout.Grid
    }
    val focused = focusedTile(tiles, pinned, watchingNow, lastSpeaker)
    val canHide = layout == StageLayout.OneOnOne && (if (swapped) local?.cameraTrack else others.firstOrNull()?.cameraTrack) != null
    val chrome = chromeVisible || !canHide
    val showToggle = (layout == StageLayout.Grid || layout == StageLayout.Spotlight) && tiles.size > 1
    val speaker = others.firstOrNull { it.speaking }?.identity

    LaunchedEffect(chromeVisible, canHide, chromeTouches) {
        if (!canHide || !chromeVisible) return@LaunchedEffect
        delay(AUTO_HIDE_MILLIS)
        chromeVisible = false
    }
    LaunchedEffect(canHide) { if (!canHide) chromeVisible = true }
    LaunchedEffect(speaker) { if (speaker != null) lastSpeaker = speaker }
    LaunchedEffect(hasStage) {
        if (!hasStage) {
            preferred = null
            if (pinned?.endsWith(":screen") == true || pinned == StageTile.Watch.key) pinned = null
        }
    }
    LaunchedEffect(watchingNow) { if (watchingNow) pinned = StageTile.Watch.key }
    val keys = tiles.map { it.key }
    LaunchedEffect(keys) { if (pinned != null && pinned !in keys) pinned = null }

    val safe = (if (onMinimize != null) WindowInsets.safeDrawing else WindowInsets.navigationBars).asPaddingValues()
    val insets = StageInsets(
        top = safe.calculateTopPadding() + if (chrome) headerHeight else 0.dp,
        bottom = safe.calculateBottomPadding() + if (chrome) controlsHeight else 0.dp,
        start = safe.calculateStartPadding(direction),
        end = safe.calculateEndPadding(direction),
    )

    fun select(tile: StageTile) {
        pinned = tile.key
        preferred = null
    }

    val tileContent: @Composable (StageTile, TileStyle, Modifier, () -> Unit) -> Unit = { tile, style, tileModifier, onTap ->
        when (tile) {
            is StageTile.Person -> PersonTile(
                room.id,
                tile.participant,
                style,
                tileModifier,
                onTap = onTap,
                onVolume = { volumeFor = tile.participant.userId },
            )
            is StageTile.Screen -> ScreenTile(
                room.id,
                tile.participant,
                compact = style == TileStyle.Strip,
                modifier = tileModifier,
                onTap = if (style == TileStyle.Focused) ({}) else onTap,
                onWatch = {
                    calls.setWatchingScreen(tile.participant.identity, true)
                    pinned = tile.key
                    preferred = null
                },
            )
            StageTile.Watch -> if (watch != null) {
                WatchTogetherTile(watch, room, compact = style == TileStyle.Strip, modifier = tileModifier, onFocus = onTap)
            }
        }
    }

    BoxWithConstraints(modifier.fillMaxSize().background(theme.bgSecondary)) {
        val size = maxWidth to maxHeight
        when (layout) {
            StageLayout.Calling -> CallingView(room, local, insets)
            StageLayout.OneOnOne -> {
                val remote = others.firstOrNull()
                val main = if (swapped) local else remote
                val pip = if (swapped) remote else local
                Box(Modifier.fillMaxSize()) {
                    if (main != null) {
                        key(main.identity) {
                            PersonTile(
                                room.id,
                                main,
                                TileStyle.Full,
                                Modifier.fillMaxSize(),
                                insets = insets,
                                onTap = { chromeVisible = !chromeVisible },
                                onVolume = { volumeFor = main.userId },
                            )
                        }
                    }
                    AnimatedVisibility(pip != null, enter = fadeIn() + scaleIn(initialScale = 0.6f), exit = fadeOut() + scaleOut(targetScale = 0.6f)) {
                        var last by remember { mutableStateOf(pip) }
                        if (pip != null) last = pip
                        last?.let { shown ->
                            FloatingPip(size.first, size.second, insets, corner, onCorner = { corner = it }) {
                                key(shown.identity) {
                                    PersonTile(room.id, shown, TileStyle.Pip, Modifier.fillMaxSize(), onTap = { swapped = !swapped }, onVolume = {})
                                }
                            }
                        }
                    }
                }
            }
            StageLayout.Grid -> StageGrid(tiles, size.first, size.second, insets, tileContent, ::select)
            StageLayout.Spotlight -> StageSpotlight(
                tiles,
                focused,
                size.first,
                size.second,
                insets,
                tileContent,
                onSelect = ::select,
                onUnfocus = {
                    pinned = null
                    preferred = StageLayout.Grid
                },
            )
        }
        if (calls.state == CallManager.State.Joining && layout != StageLayout.Calling) {
            Column(
                Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(WZ.Radius.xl))
                    .background(theme.bgTertiary)
                    .padding(WZ.Space.space7),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            ) {
                Spinner()
                Text(tr("call.statusConnecting"), style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
            }
        }

        AnimatedVisibility(
            chrome,
            Modifier.align(Alignment.TopCenter),
            enter = fadeIn() + slideInVertically { -it / 3 },
            exit = fadeOut() + slideOutVertically { -it / 3 },
        ) {
            StageHeader(
                title = title.takeIf { layout != StageLayout.Calling },
                onMinimize = onMinimize,
                toggle = if (showToggle) layout == StageLayout.Spotlight else null,
                onToggle = {
                    if (layout == StageLayout.Spotlight) {
                        pinned = null
                        preferred = StageLayout.Grid
                    } else {
                        preferred = StageLayout.Spotlight
                    }
                },
                shadow = layout == StageLayout.OneOnOne,
                modifier = Modifier
                    .padding(top = safe.calculateTopPadding(), start = insets.start, end = insets.end)
                    .onSizeChanged { headerHeight = with(density) { it.height.toDp() } },
            )
        }
        AnimatedVisibility(
            chrome,
            Modifier.align(Alignment.BottomCenter),
            enter = fadeIn() + slideInVertically { it / 3 },
            exit = fadeOut() + slideOutVertically { it / 3 },
        ) {
            CallControls(
                onOpenChat = onOpenChat,
                onInteraction = { chromeTouches++ },
                modifier = Modifier
                    .padding(bottom = safe.calculateBottomPadding())
                    .onSizeChanged { controlsHeight = with(density) { it.height.toDp() } }
                    .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4),
            )
        }
    }
    volumeFor?.let { userId ->
        WizardSheet(onDismiss = { volumeFor = null }) { VolumeSheet(room.id, userId) }
    }
}

private fun focusedTile(tiles: List<StageTile>, pinned: String?, watchingNow: Boolean, lastSpeaker: String?): StageTile? {
    tiles.firstOrNull { it.key == pinned }?.let { return it }
    if (watchingNow && StageTile.Watch in tiles) return StageTile.Watch
    val screens = tiles.filterIsInstance<StageTile.Screen>()
    (screens.firstOrNull { !it.participant.isLocal && it.participant.watchingScreen }
        ?: screens.firstOrNull { !it.participant.isLocal }
        ?: screens.firstOrNull())?.let { return it }
    if (StageTile.Watch in tiles) return StageTile.Watch
    val people = tiles.filterIsInstance<StageTile.Person>()
    return people.firstOrNull { !it.participant.isLocal && it.participant.identity == lastSpeaker }
        ?: people.firstOrNull { !it.participant.isLocal }
        ?: tiles.firstOrNull()
}

@Composable
private fun StageHeader(
    title: String?,
    onMinimize: (() -> Unit)?,
    toggle: Boolean?,
    onToggle: () -> Unit,
    shadow: Boolean,
    modifier: Modifier = Modifier,
) {
    val calls = CallManager.shared
    Box(modifier.fillMaxWidth().padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space4)) {
        if (onMinimize != null) {
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .size(WZ.Space.space10)
                    .floatingGlass()
                    .clickable(onClick = onMinimize),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("caret-down", size = WZ.SizeIcon.sm, tint = theme.textPrimary, contentDescription = tr("call.minimize"))
            }
        }
        Column(
            Modifier.align(Alignment.Center).padding(horizontal = WZ.Space.space11 + WZ.Space.space4),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (title != null) {
                Text(
                    title,
                    style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold).let {
                        if (shadow) it.copy(shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.4f), blurRadius = 12f)) else it
                    },
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
            if (calls.reconnecting) {
                IconLabel(tr("call.statusReconnecting"), "wifi-slash", color = theme.warningColor, size = WZ.FontSize.sm, weight = FontWeight.SemiBold)
            }
        }
        if (toggle != null) {
            val label = tr(if (toggle) "call.switchToGrid" else "call.switchToSpotlight")
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .size(WZ.Space.space10)
                    .floatingGlass()
                    .clickable(onClick = onToggle),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon(if (toggle) "squares-four" else "presentation", size = WZ.SizeIcon.sm, tint = theme.textPrimary, contentDescription = label)
            }
        } else if (onMinimize != null) {
            Spacer(Modifier.size(WZ.Space.space10))
        }
    }
}

@Composable
private fun StageGrid(
    tiles: List<StageTile>,
    width: Dp,
    height: Dp,
    insets: StageInsets,
    tileContent: @Composable (StageTile, TileStyle, Modifier, () -> Unit) -> Unit,
    onSelect: (StageTile) -> Unit,
) {
    val areaW = (width - insets.start - insets.end - Gap * 2).coerceAtLeast(1.dp)
    val areaH = (height - insets.top - insets.bottom - Gap * 2).coerceAtLeast(1.dp)
    val landscape = areaW > areaH
    var columns = 1
    var bestWidth = 0f
    if (tiles.size > 1) {
        val aspect = if (landscape) 16f / 9f else 3f / 4f
        for (c in 1..tiles.size) {
            val rows = ceil(tiles.size / c.toFloat()).toInt()
            val byWidth = (areaW.value - Gap.value * (c - 1)) / c
            val byHeight = (areaH.value - Gap.value * (rows - 1)) / rows * aspect
            val w = min(byWidth, byHeight)
            if (w > bestWidth) {
                bestWidth = w
                columns = c
            }
        }
    } else {
        bestWidth = areaW.value
    }
    val scroll = bestWidth < 96f
    if (scroll) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(if (landscape) 4 else 2),
            modifier = Modifier.fillMaxSize().padding(start = insets.start, end = insets.end),
            contentPadding = PaddingValues(start = Gap, end = Gap, top = insets.top + Gap, bottom = insets.bottom + Gap),
            horizontalArrangement = Arrangement.spacedBy(Gap),
            verticalArrangement = Arrangement.spacedBy(Gap),
        ) {
            items(tiles, key = { it.key }) { tile ->
                tileContent(tile, TileStyle.Tile, Modifier.fillMaxWidth().aspectRatio(3f / 4f).animateItem()) { onSelect(tile) }
            }
        }
    } else {
        Column(
            Modifier
                .fillMaxSize()
                .padding(top = insets.top, bottom = insets.bottom, start = insets.start, end = insets.end)
                .padding(Gap),
            verticalArrangement = Arrangement.spacedBy(Gap),
        ) {
            tiles.chunked(columns).forEach { row ->
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(Gap)) {
                    row.forEach { tile ->
                        key(tile.key) {
                            tileContent(tile, TileStyle.Tile, Modifier.weight(1f).fillMaxHeight()) { onSelect(tile) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StageSpotlight(
    tiles: List<StageTile>,
    focused: StageTile?,
    width: Dp,
    height: Dp,
    insets: StageInsets,
    tileContent: @Composable (StageTile, TileStyle, Modifier, () -> Unit) -> Unit,
    onSelect: (StageTile) -> Unit,
    onUnfocus: () -> Unit,
) {
    val rest = tiles.filter { it.key != focused?.key }
    val landscape = width - insets.start - insets.end > height - insets.top - insets.bottom
    val outer = Modifier
        .fillMaxSize()
        .padding(top = insets.top, bottom = insets.bottom, start = insets.start, end = insets.end)
        .padding(Gap)
    val main: @Composable (Modifier) -> Unit = { mainModifier ->
        AnimatedContent(
            focused,
            mainModifier,
            contentKey = { it?.key },
            transitionSpec = { fadeIn(tween(WZ.MotionDuration.slow)) togetherWith fadeOut(tween(WZ.MotionDuration.slow)) },
            label = "focus",
        ) { tile ->
            if (tile != null) {
                tileContent(tile, TileStyle.Focused, Modifier.fillMaxSize()) { if (tile is StageTile.Person) onUnfocus() }
            }
        }
    }
    if (landscape) {
        Row(outer, horizontalArrangement = Arrangement.spacedBy(Gap)) {
            main(Modifier.weight(1f).fillMaxHeight())
            if (rest.isNotEmpty()) {
                LazyColumn(Modifier.width(168.dp).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(Gap, Alignment.CenterVertically)) {
                    items(rest, key = { it.key }) { tile ->
                        tileContent(tile, TileStyle.Strip, Modifier.fillMaxWidth().height(96.dp).animateItem()) { onSelect(tile) }
                    }
                }
            }
        }
    } else {
        Column(outer, verticalArrangement = Arrangement.spacedBy(Gap)) {
            main(Modifier.weight(1f).fillMaxWidth())
            if (rest.isNotEmpty()) {
                LazyRow(Modifier.fillMaxWidth().height(128.dp), horizontalArrangement = Arrangement.spacedBy(Gap, Alignment.CenterHorizontally)) {
                    items(rest, key = { it.key }) { tile ->
                        tileContent(tile, TileStyle.Strip, Modifier.width(96.dp).fillMaxHeight().animateItem()) { onSelect(tile) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FloatingPip(
    width: Dp,
    height: Dp,
    insets: StageInsets,
    corner: PipCorner,
    onCorner: (PipCorner) -> Unit,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val short = min(max(width.value, height.value) * 0.17f, 132f).dp
    val long = short * 3 / 2
    val landscape = width > height
    val pipW = if (landscape) long else short
    val pipH = if (landscape) short else long
    val margin = WZ.Space.space5
    fun target(c: PipCorner): Offset = with(density) {
        val start = c == PipCorner.TopStart || c == PipCorner.BottomStart
        val top = c == PipCorner.TopStart || c == PipCorner.TopEnd
        val x = if (start) insets.start + margin else width - insets.end - margin - pipW
        val y = if (top) insets.top + margin else height - insets.bottom - margin - pipH
        Offset(x.toPx(), y.toPx())
    }
    val offset = remember { Animatable(target(corner), Offset.VectorConverter) }
    var dragging by remember { mutableStateOf(false) }
    var lastDelta by remember { mutableStateOf(Offset.Zero) }
    val goal = target(corner)
    LaunchedEffect(goal) {
        if (!dragging) offset.animateTo(goal, spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow))
    }
    Box(
        Modifier
            .offset { IntOffset(offset.value.x.roundToInt(), offset.value.y.roundToInt()) }
            .size(pipW, pipH)
            .shadow(12.dp, RoundedCornerShape(WZ.Radius.xl))
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .pointerInput(width, height, insets) {
                detectDragGestures(
                    onDragStart = { dragging = true },
                    onDrag = { change, amount ->
                        change.consume()
                        lastDelta = amount
                        scope.launch { offset.snapTo(offset.value + amount) }
                    },
                    onDragEnd = {
                        val projected = offset.value + lastDelta * 12f
                        val centerX = projected.x + with(density) { pipW.toPx() } / 2
                        val centerY = projected.y + with(density) { pipH.toPx() } / 2
                        val left = centerX < with(density) { width.toPx() } / 2
                        val up = centerY < with(density) { height.toPx() } / 2
                        val next = if (up) {
                            if (left) PipCorner.TopStart else PipCorner.TopEnd
                        } else {
                            if (left) PipCorner.BottomStart else PipCorner.BottomEnd
                        }
                        dragging = false
                        if (next != corner) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onCorner(next)
                        scope.launch { offset.animateTo(target(next), spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMediumLow)) }
                    },
                    onDragCancel = { dragging = false },
                )
            },
    ) {
        content()
    }
}

@Composable
private fun Backdrop(name: String, avatarUrl: String?, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier.fillMaxSize().background(theme.bgTertiary), contentAlignment = Alignment.Center) {
        Avatar(name, avatarUrl, min(max(maxWidth.value, maxHeight.value), 1200f).dp, modifier = Modifier.blur(60.dp).alpha(0.55f))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PersonTile(
    roomId: String,
    participant: CallParticipantInfo,
    style: TileStyle,
    modifier: Modifier = Modifier,
    insets: StageInsets? = null,
    onTap: () -> Unit,
    onVolume: () -> Unit,
) {
    val calls = CallManager.shared
    val profile = rememberMemberProfile(participant.userId, roomId)
    val name = participant.displayName ?: profile.name ?: participant.userId
    val avatarUrl = participant.avatarUrl ?: profile.avatarUrl
    val label = if (participant.isOwnOtherDevice) tr("call.ownOtherDevice", name) else name
    val shape = RoundedCornerShape(if (style == TileStyle.Full) 0.dp else WZ.Radius.xl)
    val ring by animateColorAsState(
        if (participant.speaking && style != TileStyle.Full && style != TileStyle.Pip) theme.success else Color.Transparent,
        tween(WZ.MotionDuration.fast),
        label = "speaking",
    )
    val remote = !participant.isLocal && !participant.isOwnOtherDevice
    var showMenu by remember { mutableStateOf(false) }
    val camera = participant.cameraTrack
    var lastCamera by remember { mutableStateOf(camera) }
    if (camera != null) lastCamera = camera
    val avatarSize = when (style) {
        TileStyle.Full -> WZ.SizeAvatar.xxl
        TileStyle.Focused -> WZ.SizeAvatar.xl
        TileStyle.Tile -> WZ.SizeAvatar.lg
        TileStyle.Pip, TileStyle.Strip -> WZ.SizeAvatar.md
    }

    Box(
        modifier
            .clip(shape)
            .border(WZ.BorderWidth.thick, ring, shape)
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onTap,
                onLongClick = if (remote && style != TileStyle.Pip) ({ showMenu = true }) else null,
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Backdrop(label, avatarUrl)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            val halo by animateColorAsState(
                if (participant.speaking && style == TileStyle.Full) theme.success else Color.Transparent,
                tween(WZ.MotionDuration.fast),
                label = "halo",
            )
            Box(Modifier.border(WZ.BorderWidth.thick, halo, CircleShape).padding(WZ.Space.space3)) {
                Avatar(label, avatarUrl, avatarSize, modifier = Modifier.alpha(if (participant.connected) 1f else 0.5f))
            }
            if (style == TileStyle.Full) {
                Row(
                    Modifier.padding(horizontal = WZ.Space.space8),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (participant.micMuted) PhIcon("microphone-slash", PhWeight.regular, size = WZ.SizeIcon.sm, tint = theme.danger)
                    Text(label, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        AnimatedVisibility(camera != null, Modifier.fillMaxSize(), enter = fadeIn(tween(WZ.MotionDuration.slow)), exit = fadeOut(tween(WZ.MotionDuration.slow))) {
            lastCamera?.let { track ->
                CallVideoView(track, participant.connection, fill = true, mirror = participant.isLocal && !calls.cameraBack, Modifier.fillMaxSize())
            }
        }
        AnimatedContent(
            participant.reaction,
            transitionSpec = { (scaleIn(spring()) + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
            label = "reaction",
        ) { reaction ->
            if (reaction != null) Text(reaction, fontSize = (if (style == TileStyle.Strip || style == TileStyle.Pip) WZ.SizeIcon.xl else WZ.SizeIcon.xxl).value.sp)
        }
        if (participant.handRaised) {
            val small = style == TileStyle.Strip || style == TileStyle.Pip
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = insets?.top ?: 0.dp, end = insets?.end ?: 0.dp)
                    .padding(if (style == TileStyle.Full) WZ.Space.space6 else WZ.Space.space3)
                    .size(if (small) WZ.Space.space8 else WZ.Space.space9)
                    .clip(CircleShape)
                    .background(theme.bgTertiary.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center,
            ) {
                Text("🖐️", fontSize = (if (small) WZ.SizeIcon.xs else WZ.SizeIcon.md).value.sp)
            }
        }
        if (style == TileStyle.Tile || style == TileStyle.Focused || style == TileStyle.Strip) {
            NameLabel(participant, label, compact = style == TileStyle.Strip, Modifier.align(Alignment.BottomStart))
        } else if (style == TileStyle.Pip && participant.micMuted) {
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(WZ.Space.space3)
                    .size(WZ.Space.space8)
                    .clip(CircleShape)
                    .background(theme.danger),
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("microphone-slash", PhWeight.regular, size = WZ.SizeIcon.xs, tint = Color.White)
            }
        }
        if (participant.isLocal && camera != null && (style == TileStyle.Tile || style == TileStyle.Focused || style == TileStyle.Pip)) {
            val pip = style == TileStyle.Pip
            val switchLabel = tr("call.switchCamera")
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(if (pip) WZ.Space.space3 else WZ.Space.space4)
                    .size(if (pip) WZ.Space.space8 else WZ.Space.space9)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.35f))
                    .clickable { calls.flipCamera() }
                    .semantics { contentDescription = switchLabel },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("camera-rotate", size = if (pip) WZ.SizeIcon.xs else WZ.SizeIcon.md, tint = Color.White)
            }
        }
        WizardMenu(
            showMenu,
            { showMenu = false },
            listOf(
                if (participant.locallyMuted) {
                    MenuItem(tr("call.unmuteForMe"), "speaker-high") { calls.toggleLocalMute(participant.userId) }
                } else {
                    MenuItem(tr("call.muteForMe"), "speaker-slash") { calls.toggleLocalMute(participant.userId) }
                },
                MenuItem(tr("call.volume"), "sliders") { onVolume() },
            ),
        )
    }
}

@Composable
private fun NameLabel(participant: CallParticipantInfo, label: String, compact: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier
            .padding(if (compact) WZ.Space.space3 else WZ.Space.space4)
            .clip(CircleShape)
            .background(theme.bgTertiary.copy(alpha = 0.85f))
            .padding(horizontal = if (compact) WZ.Space.space3 else WZ.Space.space4, vertical = WZ.Space.space2),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (participant.micMuted || participant.locallyMuted) {
            PhIcon(
                if (participant.locallyMuted) "speaker-slash" else "microphone-slash",
                PhWeight.bold,
                size = WZ.SizeIcon.xs,
                tint = theme.danger,
            )
        }
        Text(
            label,
            Modifier.weight(1f, fill = false),
            style = wizardFont(if (compact) WZ.FontSize.xs else WZ.FontSize.sm, FontWeight.SemiBold),
            color = theme.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!participant.connected) Spinner(size = WZ.SizeIcon.xs)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ScreenTile(
    roomId: String,
    participant: CallParticipantInfo,
    compact: Boolean,
    modifier: Modifier = Modifier,
    onTap: () -> Unit,
    onWatch: () -> Unit,
) {
    val calls = CallManager.shared
    val profile = rememberMemberProfile(participant.userId, roomId)
    val name = participant.displayName ?: profile.name ?: participant.userId
    val avatarUrl = participant.avatarUrl ?: profile.avatarUrl
    val watching = !participant.isLocal && participant.watchingScreen
    var showMenu by remember { mutableStateOf(false) }
    Box(
        modifier
            .clip(RoundedCornerShape(WZ.Radius.xl))
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onTap,
                onLongClick = if (watching) ({ showMenu = true }) else null,
            ),
        contentAlignment = Alignment.Center,
    ) {
        when {
            participant.isLocal -> {
                Backdrop(name, avatarUrl)
                Column(
                    Modifier.padding(WZ.Space.space6),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(WZ.Space.space4),
                ) {
                    PhIcon("monitor-arrow-up", size = if (compact) WZ.SizeIcon.md else WZ.SizeIcon.xl, tint = theme.textPrimary)
                    if (!compact) {
                        Text(tr("call.ownScreenHidden"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary, textAlign = TextAlign.Center)
                    }
                }
            }
            !participant.watchingScreen -> {
                Backdrop(name, avatarUrl)
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space5)) {
                    if (!compact) Avatar(name, avatarUrl, WZ.SizeAvatar.lg)
                    val watchLabel = tr("call.watchStream")
                    Row(
                        Modifier
                            .clip(CircleShape)
                            .background(theme.accent)
                            .clickable(onClick = onWatch)
                            .semantics { contentDescription = watchLabel }
                            .padding(
                                horizontal = if (compact) WZ.Space.space4 else WZ.Space.space6,
                                vertical = if (compact) WZ.Space.space3 else WZ.Space.space4,
                            ),
                        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PhIcon("eye", size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
                        if (!compact) Text(watchLabel, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
                    }
                }
            }
            else -> {
                Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                    val track = participant.screenTrack
                    if (track != null) {
                        CallVideoView(track, participant.connection, fill = false, mirror = false, Modifier.fillMaxSize())
                    } else {
                        Spinner(color = Color.White)
                    }
                }
            }
        }
        Row(
            Modifier.align(Alignment.TopStart).padding(if (compact) WZ.Space.space3 else WZ.Space.space4),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val chip = wizardFont(WZ.FontSize.xs, FontWeight.Bold)
            Text(
                tr("call.live"),
                Modifier
                    .height(18.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF593695))
                    .padding(horizontal = 7.dp)
                    .wrapContentHeight(),
                style = chip,
                color = Color.White,
                letterSpacing = 0.3.sp,
            )
            val watchers = participant.screenWatchers.size
            if (participant.isLocal && watchers > 0) {
                val label = trPlural("call.streamViewers", watchers, watchers)
                Row(
                    Modifier
                        .height(18.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.6f))
                        .padding(horizontal = 7.dp)
                        .clearAndSetSemantics { contentDescription = label },
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PhIcon("eye", size = 12.dp, tint = Color.White)
                    Text("$watchers", style = chip, color = Color.White)
                }
            }
        }
        if (!compact) {
            IconLabel(
                tr("call.userScreen", name),
                "monitor",
                color = theme.textPrimary,
                size = WZ.FontSize.sm,
                weight = FontWeight.SemiBold,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(WZ.Space.space4)
                    .clip(CircleShape)
                    .background(theme.bgTertiary.copy(alpha = 0.85f))
                    .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
            )
        }
        if (!compact && watching) {
            val stopLabel = tr("call.stopWatching")
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(WZ.Space.space4)
                    .size(WZ.Space.space9)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f))
                    .clickable { calls.setWatchingScreen(participant.identity, false) }
                    .semantics { contentDescription = stopLabel },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("eye-slash", size = WZ.SizeIcon.sm, tint = Color.White)
            }
        }
        WizardMenu(
            showMenu,
            { showMenu = false },
            listOf(MenuItem(tr("call.stopWatching"), "eye-slash") { calls.setWatchingScreen(participant.identity, false) }),
        )
    }
}

/** Ringing the other person or waiting for them; your camera fills the screen meanwhile */
@Composable
private fun CallingView(room: RoomSummary, local: CallParticipantInfo?, insets: StageInsets) {
    val calls = CallManager.shared
    val other = rememberMemberProfile(room.dmUserId, room.id)
    val name = other.name ?: room.dmUserId ?: room.displayName
    val avatar = other.avatarUrl ?: room.avatarUrl
    val camera = local?.cameraTrack
    var lastCamera by remember { mutableStateOf(camera) }
    if (camera != null) lastCamera = camera
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Backdrop(name, avatar)
        AnimatedVisibility(camera != null, Modifier.fillMaxSize(), enter = fadeIn(), exit = fadeOut()) {
            Box(Modifier.fillMaxSize()) {
                lastCamera?.let { track ->
                    CallVideoView(track, local?.connection, fill = true, mirror = !calls.cameraBack, Modifier.fillMaxSize())
                }
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            }
        }
        val onVideo = camera != null
        Column(
            Modifier
                .padding(top = insets.top, bottom = insets.bottom, start = insets.start, end = insets.end)
                .padding(WZ.Space.space8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Avatar(name, avatar, WZ.SizeAvatar.xxl)
                if (calls.ring == CallManager.RingState.ringing) {
                    val pulse = rememberInfiniteTransition(label = "pulse")
                    val progress by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "ring")
                    Box(
                        Modifier
                            .size(WZ.SizeAvatar.xxl)
                            .scale(1f + 0.35f * progress)
                            .alpha(0.9f * (1f - progress))
                            .border(WZ.BorderWidth.thick, theme.success, CircleShape),
                    )
                }
            }
            Text(name, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = if (onVideo) Color.White else theme.textPrimary, textAlign = TextAlign.Center)
            val status = when (calls.ring) {
                CallManager.RingState.ringing -> tr("call.ringing")
                CallManager.RingState.declined -> tr("call.event.declined")
                CallManager.RingState.unanswered -> tr("call.event.unanswered")
                null -> tr(if (calls.state == CallManager.State.Joining) "call.statusConnecting" else "call.waitingForThem")
            }
            Text(
                status,
                style = wizardFont(WZ.FontSize.lg),
                color = when {
                    calls.ring == CallManager.RingState.declined -> theme.danger
                    onVideo -> Color.White.copy(alpha = 0.85f)
                    else -> theme.textMuted
                },
                textAlign = TextAlign.Center,
            )
            if (calls.ring == CallManager.RingState.declined || calls.ring == CallManager.RingState.unanswered) {
                LabelButton(tr("call.callAgain"), "phone-outgoing", { calls.ringAgain() }, Modifier.widthIn(max = WZ.Size.sidebar))
            }
        }
    }
}

@Composable
private fun VolumeSheet(roomId: String, userId: String) {
    val calls = CallManager.shared
    val profile = rememberMemberProfile(userId, roomId)
    val participant = calls.participants.firstOrNull { it.userId == userId }
    val volume = participant?.volume ?: 1.0

    Column(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(WZ.Space.space8),
        verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5), verticalAlignment = Alignment.CenterVertically) {
            Avatar(profile.name ?: userId, profile.avatarUrl, WZ.SizeAvatar.md)
            Text(
                profile.name ?: userId,
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(WZ.Space.space3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tr("call.volume"), style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
                Spacer(Modifier.weight(1f))
                Text("${Math.round(volume * 100)}%", style = wizardFont(WZ.FontSize.md), color = theme.textMuted)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4), verticalAlignment = Alignment.CenterVertically) {
                PhIcon("speaker-none", tint = theme.textMuted)
                Slider(
                    value = volume.toFloat(),
                    onValueChange = { calls.setVolume(it.toDouble(), userId) },
                    valueRange = 0f..2f,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(thumbColor = theme.accent, activeTrackColor = theme.accent, inactiveTrackColor = theme.fill),
                )
                PhIcon("speaker-high", PhWeight.regular, tint = theme.textMuted)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("call.muteForMe"), Modifier.weight(1f), style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
            Switch(
                checked = participant?.locallyMuted ?: false,
                onCheckedChange = { calls.toggleLocalMute(userId) },
                colors = SwitchDefaults.colors(checkedTrackColor = theme.accent),
            )
        }
    }
}

/** A LiveKit video track */
@Composable
internal fun CallVideoView(track: VideoTrack, connection: LiveKitRoom?, fill: Boolean, mirror: Boolean, modifier: Modifier = Modifier) {
    val room = connection ?: return
    if (fill) {
        VideoSurface(track, room, fill = true, mirror, modifier)
        return
    }
    // A TextureView stretched to its box crops the picture, so a fitted video gets a box of the frame's shape
    var aspect by remember(track) { mutableStateOf<Float?>(null) }
    DisposableEffect(track) {
        val main = Handler(Looper.getMainLooper())
        val sink = VideoSink { frame ->
            val width = frame.rotatedWidth
            val height = frame.rotatedHeight
            if (width > 0 && height > 0) {
                val next = width.toFloat() / height
                main.post { if (aspect != next) aspect = next }
            }
        }
        runCatching { track.addRenderer(sink) }
        onDispose { runCatching { track.removeRenderer(sink) } }
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        VideoSurface(track, room, fill = false, mirror, aspect?.let { Modifier.aspectRatio(it) } ?: Modifier.fillMaxSize())
    }
}

@Composable
private fun VideoSurface(track: VideoTrack, room: LiveKitRoom, fill: Boolean, mirror: Boolean, modifier: Modifier) {
    key(room) {
        val attached = remember { arrayOfNulls<VideoTrack>(1) }
        AndroidView(
            factory = { context ->
                TextureViewRenderer(context).also { view ->
                    runCatching { room.initVideoRenderer(view) }.onFailure { Log.w("WZCALL", "video view setup failed", it) }
                }
            },
            update = { view ->
                view.setScalingType(if (fill) RendererCommon.ScalingType.SCALE_ASPECT_FILL else RendererCommon.ScalingType.SCALE_ASPECT_FIT)
                view.setMirror(mirror)
                if (attached[0] !== track) {
                    runCatching {
                        attached[0]?.removeRenderer(view)
                        track.addRenderer(view)
                    }.onFailure { Log.w("WZCALL", "attaching video failed", it) }
                    attached[0] = track
                }
            },
            onRelease = { view ->
                runCatching {
                    attached[0]?.removeRenderer(view)
                    view.release()
                }
                attached[0] = null
            },
            modifier = modifier,
        )
    }
}
