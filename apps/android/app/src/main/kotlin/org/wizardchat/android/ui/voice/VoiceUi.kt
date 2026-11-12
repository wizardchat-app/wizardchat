package org.wizardchat.android.ui.voice

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.CallReaction
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.RingingCall
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.BarButton
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.people.RoomInfoSheet
import org.wizardchat.android.ui.room.RoomHeader
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.core.CallStatus
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** A voice room: the lobby with who's in it, or the call stage once you're in */
@Composable
fun VoiceRoomScreen(room: RoomSummary, onBack: () -> Unit, onOpenChat: () -> Unit) {
    val calls = CallManager.shared
    val session = LocalSession.current
    val live = session.roomList?.room(room.id) ?: room
    val inThisCall = calls.isInCall(room.id)
    var showInfo by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(theme.bgSecondary)) {
        RoomHeader(live, onBack, onShowInfo = { showInfo = true }, buttons = 1) {
            BarButton("chat-text", tr("room.openChat"), onOpenChat)
        }
        if (inThisCall) {
            InCallView(live, Modifier.weight(1f), onOpenChat = onOpenChat)
        } else {
            Lobby(live, onOpenChat, Modifier.weight(1f))
        }
    }
    val client = session.client
    if (showInfo && client != null) {
        RoomInfoSheet(live, client, onDismiss = { showInfo = false }) { eventId ->
            showInfo = false
            MessageNotifier.shared.eventToFocus = room.id to eventId
            onOpenChat()
        }
    }
}

@Composable
private fun Lobby(room: RoomSummary, onOpenChat: () -> Unit, modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    val session = LocalSession.current
    Column(
        modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            Modifier.widthIn(max = WZ.SizeDialog.md).fillMaxWidth().padding(WZ.Space.space8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(WZ.Space.space6),
        ) {
            Box {
                val active = room.callParticipants.isNotEmpty()
                Avatar(room.displayName, room.avatarUrl, WZ.SizeAvatar.xl)
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .size(WZ.Space.space9)
                        .clip(CircleShape)
                        .background(theme.bgSecondary)
                        .border(WZ.BorderWidth.thin, if (active) theme.success else theme.border, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    PhIcon("speaker-high", PhWeight.regular, size = WZ.SizeIcon.sm, tint = if (active) theme.success else theme.textMuted)
                }
            }
            Text(room.displayName, style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary, textAlign = TextAlign.Center)
            Text(
                if (room.callParticipants.isEmpty()) tr("call.empty") else tr("call.inVoice", room.callParticipants.size),
                style = wizardFont(WZ.FontSize.md),
                color = theme.textMuted,
            )

            if (room.callParticipants.isNotEmpty()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(WZ.Radius.xl))
                        .background(theme.fill)
                        .padding(vertical = WZ.Space.space2),
                ) {
                    room.callParticipants.forEach { userId -> ParticipantRow(room.id, userId) }
                }
            }

            val failed = calls.state as? CallManager.State.Failed
            if (failed != null && (failed.roomId == room.id || failed.roomId == null)) {
                Text(failed.message, style = wizardFont(WZ.FontSize.sm), color = theme.error, textAlign = TextAlign.Center)
            }

            LabelButton(tr("call.joinVoice"), "speaker-high", { calls.launchJoin(room, session) })
            LabelButton(tr("room.openChat"), "chat-text", onOpenChat, primary = false)
        }
    }
}

/** Mute, deafen, camera, more (reactions, hand, screen, Watch Together) and leave */
@Composable
fun CallControls(onOpenChat: (() -> Unit)? = null, onInteraction: () -> Unit = {}, modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    val session = LocalSession.current
    val haptics = LocalHapticFeedback.current
    var showMenu by remember { mutableStateOf(false) }
    var showWatchSheet by remember { mutableStateOf(false) }
    var showSoundboard by remember { mutableStateOf(false) }
    val moreHighlighted = calls.handRaised || calls.screenSharing

    fun light() = haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)

    Row(
        modifier
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    onInteraction()
                }
            }
            .floatingGlass()
            .padding(WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (LocalPrefs.current.pushToTalk) {
            PushToTalkButton(WZ.Space.space11, WZ.SizeIcon.md)
        } else {
            Control(
                if (calls.micMuted) "microphone-slash" else "microphone",
                active = calls.micMuted,
                label = tr(if (calls.micMuted) "call.unmute" else "call.mute"),
            ) {
                light()
                calls.toggleMic()
            }
        }
        Control(
            if (calls.deafened) "speaker-slash" else "speaker-high",
            active = calls.deafened,
                        label = tr(if (calls.deafened) "call.undeafen" else "call.deafen"),
        ) {
            light()
            calls.toggleDeafen()
        }
        Control(
            if (calls.cameraOn) "video-camera" else "video-camera-slash",
            active = false,
            highlighted = calls.cameraOn,
            weight = PhWeight.regular,
            label = tr(if (calls.cameraOn) "call.turnCameraOff" else "call.turnCameraOn"),
        ) { calls.toggleCamera() }
        if (calls.soundboard != null) {
            Control("vinyl-record", active = false, label = tr("call.soundboard.title")) { showSoundboard = true }
        }
        Box {
            RoundIconButton(
                if (calls.handRaised) "hand" else "dots-three",
                tr("call.moreActionsHint"),
                background = if (moreHighlighted) theme.accent else theme.fill,
                tint = if (moreHighlighted) theme.textOnAccent else theme.textPrimary,
                onClick = { showMenu = true },
                active = moreHighlighted,
                weight = if (calls.handRaised) PhWeight.regular else PhWeight.bold,
            )
            DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }, containerColor = theme.bgTertiary) {
                Row(
                    Modifier.padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
                ) {
                    CallReaction.all.take(6).forEach { reaction ->
                        Box(
                            Modifier
                                .size(WZ.Space.space10)
                                .clip(CircleShape)
                                .clickable {
                                    showMenu = false
                                    calls.sendReaction(reaction)
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(reaction.emoji, style = wizardFont(WZ.FontSize.xl))
                        }
                    }
                }
                HorizontalDivider(color = theme.border)
                MenuRow(tr(if (calls.handRaised) "call.lowerHand" else "call.raiseHand"), "hand") {
                    showMenu = false
                    light()
                    calls.toggleHand()
                }
                MenuRow(
                    tr(if (calls.screenSharing) "call.stopSharingScreen" else "call.shareScreen"),
                    if (calls.screenSharing) "monitor" else "monitor-arrow-up",
                ) {
                    showMenu = false
                    calls.toggleScreenShare()
                }
                val watch = calls.watch
                if (watch != null) {
                    if (watch.state != null) {
                        MenuRow(tr("call.watchTogether.stopTogether"), "stop", PhWeight.fill, color = theme.danger) {
                            showMenu = false
                            watch.stop()
                        }
                    } else {
                        MenuRow(tr("call.watchTogether.menuBeta"), "youtube-logo", PhWeight.fill) {
                            showMenu = false
                            showWatchSheet = true
                        }
                    }
                }
                if (onOpenChat != null) {
                    HorizontalDivider(color = theme.border)
                    MenuRow(tr("room.openChat"), "chat-text") {
                        showMenu = false
                        onOpenChat()
                    }
                }
                session.client?.let { client ->
                    MenuRow(tr("call.copyLog"), "clipboard-text") {
                        showMenu = false
                        calls.copyCallLog(client)
                    }
                }
            }
        }
        RoundIconButton("phone-x", tr("common.leave"), background = theme.danger, tint = theme.textOnAccent, onClick = { calls.leave() }, width = WZ.Space.space12 + WZ.Space.space4)
    }
    if (showWatchSheet) {
        calls.watch?.let { WatchTogetherStartSheet(it, onDismiss = { showWatchSheet = false }) }
    }
    if (showSoundboard) SoundboardSheet(onDismiss = { showSoundboard = false })
}

@Composable
private fun MenuRow(text: String, icon: String, weight: PhWeight = PhWeight.regular, color: Color = theme.textPrimary, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(text, style = wizardFont(WZ.FontSize.lg), color = color) },
        leadingIcon = { PhIcon(icon, weight, tint = color) },
        onClick = onClick,
    )
}

@Composable
private fun Control(
    icon: String,
    active: Boolean,
    label: String,
    highlighted: Boolean = false,
    weight: PhWeight = PhWeight.regular,
    onClick: () -> Unit,
) {
    RoundIconButton(
        icon,
        label,
        background = if (active) theme.danger else if (highlighted) theme.accent else theme.fill,
        tint = if (active || highlighted) theme.textOnAccent else theme.textPrimary,
        onClick = onClick,
        weight = weight,
        active = active || highlighted,
    )
}

/** The bar above the tab island while you're in a call */
@Composable
fun CallBar(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    val room = calls.room ?: return
    if (!calls.isInCall) return
    val joined = calls.state == CallManager.State.Joined
    val returnLabel = tr("call.returnToCall")
    Row(
        modifier
            .fillMaxWidth()
            .height(WZ.Space.space11)
            .floatingGlass()
            .padding(start = WZ.Space.space4, end = WZ.Space.space3),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f)
                .clickable(onClick = onClick)
                .semantics { contentDescription = returnLabel },
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(WZ.Space.space9).clip(CircleShape).background(theme.success), contentAlignment = Alignment.Center) {
                PhIcon("speaker-high", PhWeight.regular, size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
            }
            Column {
                Text(
                    room.displayName,
                    style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                    color = theme.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    tr(
                        when {
                            calls.reconnecting -> "call.statusReconnecting"
                            calls.status == CallStatus.joiningSlow -> "call.joiningSlow"
                            calls.status == CallStatus.connected -> "call.statusConnected"
                            else -> "call.statusConnecting"
                        },
                    ),
                    style = wizardFont(WZ.FontSize.sm),
                    color = if (calls.reconnecting) theme.warningColor else if (calls.status == CallStatus.connected) theme.success else theme.textMuted,
                    maxLines = 1,
                )
            }
        }
        if (LocalPrefs.current.pushToTalk) {
            PushToTalkButton()
        } else {
            BarControl(if (calls.micMuted) "microphone-slash" else "microphone", calls.micMuted, tr(if (calls.micMuted) "call.unmute" else "call.mute")) {
                calls.toggleMic()
            }
        }
        BarControl(
            if (calls.deafened) "speaker-slash" else "speaker-high",
            calls.deafened,
            tr(if (calls.deafened) "call.undeafen" else "call.deafen"),
                    ) { calls.toggleDeafen() }
        RoundIconButton(
            "phone-x",
            tr("common.leave"),
            background = theme.danger,
            tint = theme.textOnAccent,
            onClick = { calls.leave() },
            size = WZ.Space.space10,
            iconSize = WZ.SizeIcon.sm,
        )
    }
}

@Composable
private fun BarControl(icon: String, active: Boolean, label: String, weight: PhWeight = PhWeight.regular, onClick: () -> Unit) {
    RoundIconButton(
        icon,
        label,
        background = if (active) theme.danger else theme.fill,
        tint = if (active) theme.textOnAccent else theme.textPrimary,
        onClick = onClick,
        active = active,
        size = WZ.Space.space10,
        iconSize = WZ.SizeIcon.sm,
        weight = weight,
    )
}

/** Someone in a voice room's call, in the lobby list */
@Composable
fun ParticipantRow(roomId: String, userId: String) {
    val profile = rememberMemberProfile(userId, roomId)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(profile.name ?: userId, profile.avatarUrl, WZ.SizeAvatar.md)
        Text(
            profile.name ?: userId,
            Modifier.weight(1f),
            style = wizardFont(WZ.FontSize.lg, FontWeight.Medium),
            color = theme.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Small overlapping avatars of who's in a voice room */
@Composable
fun ParticipantStack(roomId: String, userIds: List<String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(-WZ.Space.space3), verticalAlignment = Alignment.CenterVertically) {
        userIds.take(5).forEach { userId -> MiniAvatar(roomId, userId) }
        if (userIds.size > 5) {
            Text(
                "+${userIds.size - 5}",
                Modifier.padding(start = WZ.Space.space4),
                style = wizardFont(WZ.FontSize.xs, FontWeight.Bold),
                color = theme.textMuted,
            )
        }
    }
}

@Composable
private fun MiniAvatar(roomId: String, userId: String) {
    val profile = rememberMemberProfile(userId, roomId)
    Avatar(
        profile.name ?: userId,
        profile.avatarUrl,
        WZ.SizeAvatar.xs,
        modifier = Modifier.border(WZ.BorderWidth.thick, theme.bgPrimary, CircleShape),
    )
}

/** Someone ringing you, at the top of the screen */
@Composable
fun IncomingCallBanner(modifier: Modifier = Modifier) {
    CallPermissionBridge()
    val calls = CallManager.shared
    val incoming = calls.incoming
    var last by remember { mutableStateOf(incoming) }
    if (incoming != null) last = incoming
    AnimatedVisibility(
        incoming != null,
        modifier,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        last?.let { IncomingCallCard(it) }
    }
}

@Composable
private fun IncomingCallCard(call: RingingCall) {
    val calls = CallManager.shared
    val session = LocalSession.current
    val haptics = LocalHapticFeedback.current
    val profile = rememberMemberProfile(call.callerId, call.roomId)
    val name = profile.name ?: call.callerName ?: call.callerId
    val pulse = rememberInfiniteTransition(label = "pulse")
    val progress by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart), label = "ring")
    LaunchedEffect(call) { haptics.performHapticFeedback(HapticFeedbackType.LongPress) }
    val label = tr("call.incomingFrom", profile.name ?: call.callerId)

    Row(
        Modifier
            .padding(horizontal = WZ.Space.space5)
            .fillMaxWidth()
            .floatingGlass(RoundedCornerShape(WZ.Radius.xl))
            .semantics { contentDescription = label }
            .padding(WZ.Space.space5),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space5),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Avatar(name, profile.avatarUrl, WZ.SizeAvatar.lg)
            Box(
                Modifier
                    .size(WZ.SizeAvatar.lg)
                    .scale(1f + 0.25f * progress)
                    .alpha(1f - progress)
                    .border(WZ.BorderWidth.thick, theme.success, CircleShape),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(WZ.Space.space1)) {
            Text(name, style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val kind = tr(if (call.voiceOnly) "call.incomingVoiceCall" else "call.incomingVideoCall")
            val room = session.roomList?.room(call.roomId)
            IconLabel(
                if (room == null || room.isDirect) kind else "$kind · ${room.displayName}",
                if (call.voiceOnly) "phone" else "video-camera",
                color = theme.textMuted,
                size = WZ.FontSize.sm,
                iconWeight = PhWeight.fill,
            )
        }
        RoundIconButton("phone-x", tr("common.decline"), background = theme.danger, tint = theme.textOnAccent, onClick = {
            calls.declineIncoming(session)
        })
        RoundIconButton(
            if (call.voiceOnly) "phone" else "video-camera",
            tr("common.accept"),
            background = theme.success,
            tint = theme.textOnAccent,
            onClick = { calls.acceptIncoming(session) },
            weight = PhWeight.fill,
        )
    }
}

/** The full-screen 1:1 call */
@Composable
fun DMCallScreen(onDismiss: () -> Unit) {
    val calls = CallManager.shared
    var wasInCall by remember { mutableStateOf(calls.isInCall) }
    LaunchedEffect(calls.isInCall) {
        if (wasInCall && !calls.isInCall) calls.showCallScreen = false
        wasInCall = calls.isInCall
    }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        BackHandler(onBack = onDismiss)
        DMCallContent(onDismiss)
    }
}

@Composable
private fun DMCallContent(onDismiss: () -> Unit) {
    val calls = CallManager.shared
    val room = calls.room
    val other = rememberMemberProfile(room?.dmUserId, room?.id)
    if (room == null) {
        Box(Modifier.fillMaxSize().background(theme.bgSecondary))
        return
    }
    InCallView(
        room,
        title = if (room.isDirect) other.name ?: room.dmUserId ?: room.displayName else room.displayName,
        onMinimize = onDismiss,
    )
}

/**
 * "Call in progress · Join" at the top of a room with an active call, or "You're in this call on
 * another device · Join here"
 */
@Composable
fun JoinCallBar(room: RoomSummary, modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    val session = LocalSession.current
    val elsewhere = room.inCallElsewhere
    Row(
        modifier
            .padding(horizontal = WZ.Space.space5)
            .fillMaxWidth()
            .floatingGlass()
            .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(WZ.Space.space9).clip(CircleShape).background(theme.success), contentAlignment = Alignment.Center) {
            PhIcon("phone", PhWeight.regular, size = WZ.SizeIcon.xs, tint = theme.textOnAccent)
        }
        Text(
            tr(if (elsewhere) "call.inCallElsewhere" else "call.inProgress"),
            Modifier.weight(1f),
            style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
            color = theme.textPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            Modifier
                .clip(CircleShape)
                .background(theme.success)
                .clickable {
                    calls.showCallScreen = true
                    calls.launchJoin(room, session, intent = "audio")
                }
                .padding(horizontal = WZ.Space.space6, vertical = WZ.Space.space3),
        ) {
            Text(tr(if (elsewhere) "call.joinHere" else "common.join"), style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textOnAccent)
        }
    }
}

/** Why a call (not a voice room's, whose lobby shows it) failed or ended, for a few seconds */
@Composable
fun CallErrorBanner(modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    val session = LocalSession.current
    val failed = calls.state as? CallManager.State.Failed
    val inVoiceRoom = failed?.roomId?.let { session.roomList?.room(it)?.isVoice } == true
    val shown = if (inVoiceRoom) null else failed
    var last by remember { mutableStateOf(shown) }
    if (shown != null) last = shown
    LaunchedEffect(shown) {
        if (shown == null) return@LaunchedEffect
        delay(ERROR_VISIBLE_MILLIS)
        calls.dismissFailure(shown)
    }
    AnimatedVisibility(
        shown != null,
        modifier,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        val message = last?.message ?: ""
        Row(
            Modifier
                .padding(horizontal = WZ.Space.space5)
                .floatingGlass(RoundedCornerShape(WZ.Radius.xl))
                .clickable { last?.let(calls::dismissFailure) }
                .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space4),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PhIcon("warning", size = WZ.SizeIcon.sm, tint = theme.error)
            Text(message, style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold), color = theme.textPrimary)
        }
    }
}

private const val ERROR_VISIBLE_MILLIS = 6000L

@Composable
fun PushToTalkButton(size: Dp = WZ.Space.space10, iconSize: Dp = WZ.SizeIcon.sm) {
    val calls = CallManager.shared
    val haptics = LocalHapticFeedback.current
    val talking = calls.talking
    val label = tr(if (talking) "call.talking" else "call.holdToTalk")
    val scale by animateFloatAsState(if (talking) 0.92f else 1f, label = "talk")
    DisposableEffect(Unit) { onDispose { calls.holdToTalk(false) } }
    Box(
        Modifier
            .scale(scale)
            .size(size)
            .clip(CircleShape)
            .background(if (talking) theme.success else theme.fill)
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    calls.holdToTalk(true)
                    tryAwaitRelease()
                    calls.holdToTalk(false)
                })
            }
            .semantics { contentDescription = label; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon("microphone", size = iconSize, tint = if (talking) theme.textOnAccent else theme.textPrimary)
    }
}
