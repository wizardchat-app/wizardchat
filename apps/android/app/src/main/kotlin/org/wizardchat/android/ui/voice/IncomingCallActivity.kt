package org.wizardchat.android.ui.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import org.wizardchat.android.LocalMedia
import org.wizardchat.android.LocalPrefs
import org.wizardchat.android.LocalSession
import org.wizardchat.android.MainActivity
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.RingingCall
import org.wizardchat.android.matrix.displayName
import org.wizardchat.android.ui.Avatar
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.theme.WizardThemeRoot
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.tokens.WZ

class IncomingCallActivity : AppCompatActivity() {
    private val app get() = application as WizardApplication
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { answerNow() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        enableEdgeToEdge()
        if (intent.getBooleanExtra(EXTRA_ANSWER, false)) {
            answer()
            return
        }
        setContent {
            val active = app.prefs.theme(app.prefs.themeMode.isDark(isSystemInDarkTheme()))
            CompositionLocalProvider(
                LocalSession provides app.session,
                LocalPrefs provides app.prefs,
                LocalMedia provides app.session.media,
            ) {
                WizardThemeRoot(active) {
                    val call = CallManager.shared.incoming
                    LaunchedEffect(call == null) { if (call == null) finish() }
                    if (call != null) RingingScreen(call, ::answer, ::decline)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_ANSWER, false)) answer()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
    }

    private fun answer() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            answerNow()
        } else {
            microphone.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun answerNow() {
        CallManager.shared.answerRinging()
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    private fun decline() {
        CallManager.shared.declineRinging()
        finish()
    }

    companion object {
        private const val EXTRA_ANSWER = "answer"

        fun intent(context: Context, answer: Boolean): Intent =
            Intent(context, IncomingCallActivity::class.java)
                .putExtra(EXTRA_ANSWER, answer)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
}

@Composable
private fun RingingScreen(call: RingingCall, onAnswer: () -> Unit, onDecline: () -> Unit) {
    val session = LocalSession.current
    val profile = rememberMemberProfile(call.callerId, call.roomId)
    val name = profile.name ?: call.callerName ?: call.callerId
    val room = session.roomList?.room(call.roomId)
    val kind = tr(if (call.voiceOnly) "call.incomingVoiceCall" else "call.incomingVideoCall")
    val pulse = rememberInfiniteTransition(label = "pulse")
    val progress by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart), label = "ring")
    Column(
        Modifier
            .fillMaxSize()
            .background(theme.bgPrimary)
            .safeDrawingPadding()
            .padding(WZ.Space.space9),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Box(contentAlignment = Alignment.Center) {
            Avatar(name, profile.avatarUrl, WZ.SizeAvatar.xxl)
            Box(
                Modifier
                    .size(WZ.SizeAvatar.xxl)
                    .scale(1f + 0.25f * progress)
                    .alpha(1f - progress)
                    .border(WZ.BorderWidth.thick, theme.success, CircleShape),
            )
        }
        Spacer(Modifier.size(WZ.Space.space8))
        Text(
            name,
            style = wizardFont(WZ.FontSize.display, FontWeight.Bold),
            color = theme.textPrimary,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.size(WZ.Space.space3))
        Text(
            if (room == null || room.isDirect) kind else "$kind · ${room.displayName}",
            style = wizardFont(WZ.FontSize.lg),
            color = theme.textMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.weight(2f))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            RingAction("phone-x", tr("common.decline"), PhWeight.regular, onDecline, decline = true)
            RingAction(if (call.voiceOnly) "phone" else "video-camera", tr("common.accept"), PhWeight.fill, onAnswer, decline = false)
        }
    }
}

@Composable
private fun RingAction(icon: String, label: String, weight: PhWeight, onClick: () -> Unit, decline: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WZ.Space.space4)) {
        RoundIconButton(
            icon,
            label,
            background = if (decline) theme.danger else theme.success,
            tint = theme.textOnAccent,
            onClick = onClick,
            size = WZ.SizeAvatar.xl,
            iconSize = WZ.SizeIcon.lg,
            weight = weight,
        )
        Text(label, style = wizardFont(WZ.FontSize.md, FontWeight.Medium), color = theme.textPrimary)
    }
}
