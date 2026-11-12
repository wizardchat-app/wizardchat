package org.wizardchat.android.ui.voice

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.async
import org.wizardchat.android.LocalSession
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.MemberDirectory
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.expressiveClickable
import org.wizardchat.android.ui.rememberMorphShape
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.core.Member
import org.wizardchat.core.WizardClient
import org.wizardchat.tokens.WZ

/** A room member's name and avatar */
internal data class CallProfile(val name: String?, val avatarUrl: String?)

/** The member's profile in a room, loaded when the user changes */
@Composable
internal fun rememberMemberProfile(userId: String?, roomId: String?): CallProfile {
    val session = LocalSession.current
    var profile by remember(userId, roomId) { mutableStateOf(CallProfile(null, null)) }
    LaunchedEffect(userId, roomId, session.client) {
        val client = session.client ?: return@LaunchedEffect
        if (userId == null) return@LaunchedEffect
        val found = MemberDirectory.profile(userId, roomId, client)
        profile = CallProfile(found.name, found.avatarUrl)
    }
    return profile
}

/**
 * Lets CallManager ask for the microphone, camera and notification permissions and for screen
 * capture, which need an activity.
 */
@Composable
internal fun CallPermissionBridge() {
    val calls = CallManager.shared
    val context = LocalContext.current
    val pending = remember { arrayOfNulls<CompletableDeferred<Unit>>(1) }
    val pendingCapture = remember { arrayOfNulls<CompletableDeferred<Intent?>>(1) }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        pending[0]?.complete(Unit)
    }
    val capture = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pendingCapture[0]?.complete(if (result.resultCode == Activity.RESULT_OK) result.data else null)
    }
    DisposableEffect(calls) {
        val ask: suspend (Array<String>) -> Unit = { wanted ->
            val done = CompletableDeferred<Unit>()
            pending[0]?.complete(Unit)
            pending[0] = done
            permissions.launch(wanted)
            done.await()
        }
        val askCapture: suspend () -> Intent? = {
            val done = CompletableDeferred<Intent?>()
            pendingCapture[0]?.complete(null)
            pendingCapture[0] = done
            val manager = context.getSystemService(MediaProjectionManager::class.java)
            if (manager == null) done.complete(null) else capture.launch(manager.createScreenCaptureIntent())
            done.await()
        }
        calls.permissionRequester = ask
        calls.screenCaptureRequester = askCapture
        onDispose {
            if (calls.permissionRequester === ask) calls.permissionRequester = null
            if (calls.screenCaptureRequester === askCapture) calls.screenCaptureRequester = null
            pending[0]?.complete(Unit)
            pendingCapture[0]?.complete(null)
        }
    }
}

/** The floating "glass" look of the call bar and controls */
internal fun Modifier.floatingGlass(shape: Shape, background: Color): Modifier =
    shadow(8.dp, shape).clip(shape).background(background)

@Composable
internal fun Modifier.floatingGlass(shape: Shape = CircleShape): Modifier = floatingGlass(shape, theme.bgTertiary.copy(alpha = 0.96f))

/** A round icon button: the call controls, the bar buttons, accept and decline */
@Composable
internal fun RoundIconButton(
    icon: String,
    label: String,
    background: Color,
    tint: Color,
    onClick: () -> Unit,
    size: Dp = WZ.Space.space11,
    iconSize: Dp = WZ.SizeIcon.md,
    weight: PhWeight = PhWeight.regular,
    active: Boolean = false,
    width: Dp = size,
    modifier: Modifier = Modifier,
) {
    val color by animateColorAsState(background, spring(stiffness = Spring.StiffnessMediumLow), label = "button")
    val shape = rememberMorphShape(active)
    Box(
        modifier
            .size(width, size)
            .expressiveClickable(onClick)
            .clip(shape)
            .background(color)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, weight, size = iconSize, tint = tint)
    }
}

/** PrimaryButton / SecondaryButton with an icon before the text */
@Composable
internal fun LabelButton(
    text: String,
    icon: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    iconWeight: PhWeight = PhWeight.regular,
    color: Color = theme.accent,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val background = when {
        primary && pressed && color == theme.accent -> theme.accentHover
        primary -> color
        else -> color.copy(alpha = if (pressed) 0.24f else 0.14f)
    }
    val foreground = if (primary) theme.textOnAccent else color
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = WZ.Space.space11)
            .scale(if (primary && pressed) 0.98f else 1f)
            .clip(CircleShape)
            .background(background)
            .clickable(interaction, null, onClick = onClick)
            .padding(horizontal = WZ.Space.space6),
        horizontalArrangement = Arrangement.spacedBy(WZ.Space.space4, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PhIcon(icon, iconWeight, size = WZ.SizeIcon.md, tint = foreground)
        Text(text, style = wizardFont(WZ.FontSize.lg, if (primary) FontWeight.SemiBold else FontWeight.Medium), color = foreground)
    }
}

/** An icon and a text in a row */
@Composable
internal fun IconLabel(
    text: String,
    icon: String,
    color: Color,
    size: androidx.compose.ui.unit.TextUnit,
    weight: FontWeight = FontWeight.Normal,
    iconWeight: PhWeight = PhWeight.regular,
    iconTint: Color = color,
    modifier: Modifier = Modifier,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3), verticalAlignment = Alignment.CenterVertically) {
        PhIcon(icon, iconWeight, size = WZ.SizeIcon.sm, tint = iconTint)
        Text(text, style = wizardFont(size, weight), color = color, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}
