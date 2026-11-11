package org.wizardchat.android.ui.voice

import android.util.Log
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.track.VideoTrack
import livekit.org.webrtc.RendererCommon
import org.wizardchat.android.ui.home.LocalCalls
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.CallParticipantInfo
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.MenuItem
import org.wizardchat.android.ui.PhIcon
import androidx.compose.foundation.clickable
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

/** Everyone in the call as tiles, with screen shares and Watch Together above */
@Composable
fun CallStageView(room: RoomSummary, modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    var volumeFor by remember { mutableStateOf<String?>(null) }
    val screenShares = calls.participants.filter { it.screenTrack != null }
    val full: (androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope.() -> GridItemSpan) = { GridItemSpan(maxLineSpan) }

    Box(modifier.fillMaxWidth()) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(WZ.Space.space6),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        ) {
            if (calls.reconnecting) {
                item(span = full) {
                    Box(contentAlignment = Alignment.Center) {
                        IconLabel(
                            tr("call.statusReconnecting"),
                            "wifi-slash",
                            color = theme.warningColor,
                            size = WZ.FontSize.sm,
                            weight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            calls.watch?.let { watch ->
                if (watch.state != null) item(span = full, key = "watch") { WatchTogetherStage(watch, room) }
            }
            items(screenShares, key = { "screen-${it.id}" }, span = { GridItemSpan(maxLineSpan) }) { participant ->
                participant.screenTrack?.let { ScreenShareTile(room.id, participant, it) }
            }
            items(calls.participants, key = { it.id }) { participant ->
                var showMenu by remember { mutableStateOf(false) }
                Box(Modifier.animateItem()) {
                    ParticipantTile(
                        room.id,
                        participant,
                        onTap = { if (!participant.isLocal && !participant.isOwnOtherDevice) volumeFor = participant.userId },
                        onLongPress = { if (!participant.isLocal && !participant.isOwnOtherDevice) showMenu = true },
                    )
                    WizardMenu(
                        showMenu,
                        { showMenu = false },
                        listOf(
                            if (participant.locallyMuted) {
                                MenuItem(tr("call.unmuteForMe"), "speaker-high") { calls.toggleLocalMute(participant.userId) }
                            } else {
                                MenuItem(tr("call.muteForMe"), "speaker-slash") { calls.toggleLocalMute(participant.userId) }
                            },
                            MenuItem(tr("call.volume"), "sliders") { volumeFor = participant.userId },
                        ),
                    )
                }
            }
        }
        if (calls.state == CallManager.State.Joining) {
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
    }
    volumeFor?.let { userId ->
        WizardSheet(onDismiss = { volumeFor = null }) { VolumeSheet(room.id, userId) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ParticipantTile(roomId: String, participant: CallParticipantInfo, onTap: () -> Unit, onLongPress: () -> Unit) {
    val profile = rememberMemberProfile(participant.userId, roomId)
    val name = participant.displayName ?: profile.name ?: participant.userId
    val avatarUrl = participant.avatarUrl ?: profile.avatarUrl
    val shape = RoundedCornerShape(WZ.Radius.xl)
    val ring by animateColorAsState(
        if (participant.speaking) theme.success else Color.Transparent,
        tween(WZ.MotionDuration.fast),
        label = "speaking",
    )
    val hint = if (participant.isLocal || participant.isOwnOtherDevice) "" else tr("call.volumeHint")
    val label = when {
        participant.isOwnOtherDevice -> tr("call.ownOtherDevice", name)
        else -> name
    }

    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(shape)
            .background(theme.fill)
            .border(WZ.BorderWidth.thick, ring, shape)
            .combinedClickable(onClick = onTap, onLongClick = onLongPress)
            .semantics { contentDescription = listOf(label, hint).filter { it.isNotEmpty() }.joinToString(", ") },
        contentAlignment = Alignment.Center,
    ) {
        val camera = participant.cameraTrack
        if (camera != null) {
            CallVideoView(camera, participant.connection, fill = true, mirror = participant.isLocal && !LocalCalls.current.cameraBack, Modifier.fillMaxSize())
        } else {
            Avatar(name, avatarUrl, WZ.SizeAvatar.lg, modifier = Modifier.alpha(if (participant.connected) 1f else 0.5f))
        }
        AnimatedContent(
            participant.reaction,
            transitionSpec = { (scaleIn(spring()) + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
            label = "reaction",
        ) { reaction ->
            if (reaction != null) Text(reaction, fontSize = WZ.SizeIcon.xxl.value.sp)
        }
        if (participant.isLocal && camera != null) {
            val calls = LocalCalls.current
            val switchLabel = tr("call.switchCamera")
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(WZ.Space.space4)
                    .size(WZ.Space.space9)
                    .clip(CircleShape)
                    .background(theme.bgTertiary.copy(alpha = 0.85f))
                    .clickable { calls.flipCamera() }
                    .semantics { contentDescription = switchLabel },
                contentAlignment = Alignment.Center,
            ) {
                PhIcon("camera-rotate", size = WZ.SizeIcon.md, tint = theme.textPrimary)
            }
        }
        if (participant.handRaised) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(WZ.Space.space4)
                    .size(WZ.Space.space9)
                    .clip(CircleShape)
                    .background(theme.bgTertiary.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center,
            ) {
                Text("🖐️", fontSize = WZ.SizeIcon.md.value.sp)
            }
        }
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .padding(WZ.Space.space4)
                .clip(CircleShape)
                .background(theme.bgTertiary.copy(alpha = 0.85f))
                .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
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
                style = wizardFont(WZ.FontSize.sm, FontWeight.SemiBold),
                color = theme.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!participant.connected) Spinner(size = WZ.SizeIcon.xs)
        }
    }
}

@Composable
private fun ScreenShareTile(roomId: String, participant: CallParticipantInfo, track: VideoTrack) {
    val profile = rememberMemberProfile(participant.userId, roomId)
    val name = participant.displayName ?: profile.name ?: participant.userId
    val shape = RoundedCornerShape(WZ.Radius.xl)
    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(shape).background(theme.bgTertiary)) {
        CallVideoView(track, participant.connection, fill = false, mirror = false, Modifier.fillMaxSize())
        IconLabel(
            tr("call.userScreen", name),
            "monitor-arrow-up",
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
        Row(
            Modifier.align(Alignment.TopStart).padding(WZ.Space.space4),
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
