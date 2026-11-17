package org.wizardchat.android.ui.voice

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.CallParticipantInfo
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.tokens.WZ

const val PIP_PREF = "call.pictureInPicture"

// The call stage leaves the Watch Together player to the picture-in-picture window, so only one plays
val LocalInPip = compositionLocalOf { false }

internal fun pipWatching(calls: CallManager): Boolean {
    val watch = calls.watch ?: return false
    val state = watch.state ?: return false
    return watch.watchingVideoId == state.videoId
}

internal data class PipFeatured(val participant: CallParticipantInfo, val screen: Boolean)

internal fun pipFeatured(participants: List<CallParticipantInfo>, lastSpeaker: String? = null): PipFeatured? {
    val others = participants.filter { !it.isLocal && it.connected }
    others.firstOrNull { it.screenShared && it.screenTrack != null }?.let { return PipFeatured(it, screen = true) }
    val person = others.firstOrNull { it.speaking }
        ?: others.firstOrNull { it.identity == lastSpeaker }
        ?: others.firstOrNull { it.cameraTrack != null }
        ?: others.firstOrNull()
        ?: participants.firstOrNull { it.isLocal }
    return person?.let { PipFeatured(it, screen = false) }
}

@Composable
fun CallPipContent(modifier: Modifier = Modifier) {
    val calls = CallManager.shared
    var lastSpeaker by remember { mutableStateOf<String?>(null) }
    val speaker = calls.participants.firstOrNull { !it.isLocal && it.speaking }?.identity
    LaunchedEffect(speaker) { if (speaker != null) lastSpeaker = speaker }
    val featured = pipFeatured(calls.participants, lastSpeaker)
    val watch = calls.watch
    val watchState = watch?.state

    Box(modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) {
        if (watch != null && watchState != null && pipWatching(calls)) {
            WatchPlayer(watch, watchState, compact = true, onFocus = {}, roomId = calls.room?.id ?: "")
            return@Box
        }
        val participant = featured?.participant ?: return@Box
        val profile = rememberMemberProfile(participant.userId, calls.room?.id)
        val name = participant.displayName ?: profile.name ?: participant.userId
        val avatarUrl = participant.avatarUrl ?: profile.avatarUrl
        val track = if (featured.screen) participant.screenTrack else participant.cameraTrack

        Backdrop(name, avatarUrl)
        if (track != null) {
            CallVideoView(
                track,
                participant.connection,
                fill = !featured.screen,
                mirror = participant.isLocal && !calls.cameraBack,
                Modifier.fillMaxSize(),
            )
        } else {
            Box(
                Modifier
                    .border(WZ.BorderWidth.thick, if (participant.speaking) theme.success else Color.Transparent, CircleShape)
                    .padding(WZ.Space.space2),
            ) {
                Avatar(name, avatarUrl, WZ.SizeAvatar.lg)
            }
        }
        AnimatedContent(
            participant.soundboard?.let { it.emoji to it.key } ?: participant.reaction?.let { it to 0 },
            transitionSpec = { (scaleIn(spring()) + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
            label = "pipReaction",
        ) { flash ->
            if (flash != null) Text(flash.first, fontSize = WZ.SizeIcon.xxl.value.sp)
        }
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .padding(WZ.Space.space3)
                .background(theme.bgSecondary.copy(alpha = 0.8f), RoundedCornerShape(WZ.Radius.pill))
                .padding(horizontal = WZ.Space.space3, vertical = WZ.Space.space1),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (participant.micMuted) PhIcon("microphone-slash", PhWeight.regular, size = WZ.SizeIcon.xs, tint = theme.danger)
            Text(name, style = wizardFont(WZ.FontSize.xs, FontWeight.SemiBold), color = theme.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
