package org.wizardchat.android

import org.wizardchat.android.matrix.deviceId
import android.app.PictureInPictureParams
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.ui.settings.AddAccountScreen
import org.wizardchat.android.ui.settings.EncryptionSetupScreen
import org.wizardchat.android.ui.settings.EncryptionSetupState
import org.wizardchat.android.ui.PrimaryButton
import org.wizardchat.android.ui.WizardLogo
import org.wizardchat.android.ui.home.MainScreen
import org.wizardchat.android.ui.login.LoginScreen
import org.wizardchat.android.ui.theme.WizardThemeRoot
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.voice.CallPipContent
import org.wizardchat.android.ui.voice.LocalInPip
import org.wizardchat.android.ui.voice.PIP_PREF
import org.wizardchat.android.ui.voice.pipWatching
import org.wizardchat.android.ui.voice.pipFeatured
import org.wizardchat.tokens.WZ

class MainActivity : AppCompatActivity() {
    private val app get() = application as WizardApplication
    private var inPip by mutableStateOf(false)
    private var pipEnabled by mutableStateOf(false)
    private val pipPrefs by lazy { getSharedPreferences("calls", MODE_PRIVATE) }
    private val pipListener = SharedPreferences.OnSharedPreferenceChangeListener { prefs, key ->
        if (key == PIP_PREF) pipEnabled = prefs.getBoolean(PIP_PREF, false)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pipEnabled = pipPrefs.getBoolean(PIP_PREF, false)
        pipPrefs.registerOnSharedPreferenceChangeListener(pipListener)
        enableEdgeToEdge()
        handle(intent)
        setContent {
            // Status and navigation bar icons follow the app's theme, not the system's
            val dark = app.prefs.theme.resolved(isSystemInDarkTheme()).isDark
            LaunchedEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                }
                enableEdgeToEdge(style, style)
            }
            val inCall = CallManager.shared.isInCall
            LaunchedEffect(inCall) {
                if (inCall) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            val calls = CallManager.shared
            val joined = calls.state == CallManager.State.Joined
            val screen = pipWatching(calls) || pipFeatured(calls.participants)?.screen == true
            LaunchedEffect(joined, screen, pipEnabled) { setPictureInPictureParams(pipParams(joined, screen)) }
            CompositionLocalProvider(LocalSession provides app.session, LocalPrefs provides app.prefs, LocalInPip provides inPip) {
                WizardThemeRoot(app.prefs.theme) {
                    Box(Modifier.fillMaxSize()) {
                        Root()
                        if (inPip && inCall) CallPipContent()
                    }
                }
            }
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                lifecycleScope.launch { app.session.pauseSync(keepRunning = CallManager.shared.isInCall) }
            }

            override fun onStart(owner: LifecycleOwner) {
                lifecycleScope.launch { app.session.resumeSync() }
            }
        })
    }

    private fun pipParams(joined: Boolean, landscape: Boolean): PictureInPictureParams =
        PictureInPictureParams.Builder()
            .setAspectRatio(if (landscape) Rational(16, 9) else Rational(9, 16))
            .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setAutoEnterEnabled(joined && pipEnabled) }
            .build()

    // Android 12+ enters picture-in-picture by itself (setAutoEnterEnabled); older versions need the leave hint
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        val calls = CallManager.shared
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && calls.state == CallManager.State.Joined && pipEnabled) {
            enterPictureInPictureMode(pipParams(true, pipWatching(calls) || pipFeatured(calls.participants)?.screen == true))
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPip = isInPictureInPictureMode
        if (!isInPictureInPictureMode && CallManager.shared.isInCall) CallManager.shared.showCallScreen = true
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onDestroy() {
        pipPrefs.unregisterOnSharedPreferenceChangeListener(pipListener)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        BrowserLogin.resumed()
    }

    private fun handle(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == MatrixSession.CALLBACK_SCHEME) BrowserLogin.callback(uri)
    }
}

/** The server's sign-in page in a Custom Tab: `open` returns the redirect, or null if the tab was closed */
object BrowserLogin {
    private var waiting: CompletableDeferred<Uri?>? = null
    private var leftAt = 0L

    suspend fun open(context: android.content.Context, url: String): Uri? {
        waiting?.complete(null)
        val result = CompletableDeferred<Uri?>()
        waiting = result
        leftAt = System.currentTimeMillis()
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url))
        return result.await()
    }

    fun callback(uri: Uri) {
        waiting?.complete(uri)
        waiting = null
    }

    /** Back in the app without a redirect: the tab was closed */
    fun resumed() {
        val pending = waiting ?: return
        if (System.currentTimeMillis() - leftAt < 1000) return
        kotlinx.coroutines.MainScope().launch {
            // The redirect intent arrives just before or after onResume
            delay(600)
            if (waiting === pending) {
                pending.complete(null)
                waiting = null
            }
        }
    }
}

@Composable
private fun Root() {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    when (val state = session.state) {
        MatrixSession.State.Restoring -> {
            Box(Modifier.fillMaxSize().background(theme.bgPrimary), contentAlignment = Alignment.Center) {
                WizardLogo(WZ.SizeAvatar.xl)
            }
            LaunchedEffect(Unit) { session.restore() }
        }
        MatrixSession.State.LoggedOut -> LoginScreen()
        is MatrixSession.State.RestoreFailed -> {
            Column(
                Modifier.fillMaxSize().background(theme.bgPrimary).padding(WZ.Space.space9),
                verticalArrangement = Arrangement.spacedBy(WZ.Space.space6, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                WizardLogo(WZ.SizeAvatar.xl)
                Text(tr("auth.sessionLoadFailed"), style = wizardFont(WZ.FontSize.xxl, FontWeight.Bold), color = theme.textPrimary)
                Text(state.message, style = wizardFont(WZ.FontSize.md), color = theme.textMuted, textAlign = TextAlign.Center)
                PrimaryButton(tr("common.retry"), { scope.launch { session.retryRestore() } }, Modifier.widthIn(max = WZ.Size.sidebar))
            }
        }
        MatrixSession.State.LoggedIn -> {
            val roomList = session.roomList
            if (roomList != null) {
                CompositionLocalProvider(LocalMedia provides session.media) {
                    key(session.userId) { MainScreen(roomList) }
                }
            }
            val encryptionSetup = remember(session.userId) { EncryptionSetupState() }
            val prefs = LocalPrefs.current
            val verifyPending = session.needsVerification && prefs.verifySkippedDevice != session.deviceId
            if (session.needsEncryptionSetup || encryptionSetup.recoveryKey != null || verifyPending) {
                EncryptionSetupScreen(encryptionSetup)
            }
            if (session.isAddingAccount) AddAccountScreen()
        }
    }
    val notifier = MessageNotifier.shared
    LaunchedEffect(notifier.accountToOpen, session.state, session.userId) {
        val userId = notifier.accountToOpen ?: return@LaunchedEffect
        if (session.state != MatrixSession.State.LoggedIn || session.userId == null) return@LaunchedEffect
        if (session.userId == userId || session.accounts.none { it.userId == userId }) {
            notifier.accountToOpen = null
        } else {
            scope.launch { session.switchAccount(userId) }
        }
    }
}
