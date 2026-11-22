package org.wizardchat.android.matrix.rtc

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Job
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.plus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.PhIcons
import org.wizardchat.android.ui.PhWeight

/** What the ongoing-call notification shows */
data class CallActivityState(
    val micMuted: Boolean,
    val deafened: Boolean,
    val othersSpeaking: Boolean,
    val speakerName: String?,
    val participantCount: Int,
    val ringing: Boolean,
)

/**
 * The ongoing-call notification and the foreground service behind it, which keeps the call (and
 * the microphone) running in the background.
 */
class CallNotificationController {
    internal var roomName = ""
        private set
    internal var isDirect = false
        private set
    internal var startedAt = 0L
        private set
    internal var state: CallActivityState? = null
        private set

    private var shown: CallActivityState? = null
    private var lastUpdate = 0L
    private var pending: Job? = null
    private val scope = MainScope() + CoroutineExceptionHandler { _, error -> Log.w("WZCALL", "call notification failed", error) }
    private val context: Context get() = WizardApplication.instance

    fun start(roomName: String, isDirect: Boolean, state: CallActivityState) {
        end()
        this.roomName = roomName
        this.isDirect = isDirect
        startedAt = System.currentTimeMillis()
        this.state = state
        shown = state
        lastUpdate = System.currentTimeMillis()
        current = this
        runCatching {
            ContextCompat.startForegroundService(context, Intent(context, CallService::class.java).setAction(CallService.ACTION_START))
        }
    }

    fun update(state: CallActivityState) {
        if (current !== this || state == this.state) return
        this.state = state
        pending?.cancel()
        val wait = (1000 - (System.currentTimeMillis() - lastUpdate)).coerceAtLeast(0)
        val urgent = state.micMuted != shown?.micMuted || state.deafened != shown?.deafened
        pending = scope.launch {
            if (!urgent && wait > 0) delay(wait)
            val latest = this@CallNotificationController.state ?: return@launch
            lastUpdate = System.currentTimeMillis()
            shown = latest
            CallService.notify(context)
        }
    }

    /** The camera needs its own foreground service type while it's on */
    fun cameraChanged() {
        if (current !== this) return
        runCatching { context.startService(Intent(context, CallService::class.java).setAction(CallService.ACTION_START)) }
    }

    fun end() {
        pending?.cancel()
        pending = null
        state = null
        shown = null
        if (current === this) current = null
        context.stopService(Intent(context, CallService::class.java))
        context.getSystemService(NotificationManager::class.java)?.cancel(CallService.NOTIFICATION_ID)
    }

    companion object {
        internal var current: CallNotificationController? = null
            private set
    }
}

/** The foreground service that keeps a call alive while the app is in the background */
class CallService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val calls = CallManager.shared
        when (intent?.action) {
            ACTION_TOGGLE_MIC -> calls.toggleMic()
            ACTION_TOGGLE_DEAFEN -> calls.toggleDeafen()
            ACTION_LEAVE -> calls.leave()
            else -> {
                // Started as a foreground service: it has to show a notification even when the
                // call already ended
                val notification = build(this) ?: placeholder(this)
                var types = 0
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    if (calls.cameraOn && granted(Manifest.permission.CAMERA)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                }
                val withCall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) types or ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL else 0
                runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, withCall) }
                    .recoverCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types) }
                    .recoverCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, 0) }
                IncomingCallNotifier.stop()
                if (CallNotificationController.current?.state == null) stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        CallManager.shared.leave()
        super.onTaskRemoved(rootIntent)
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    companion object {
        const val NOTIFICATION_ID = 0x0ca11
        const val ACTION_START = "org.wizardchat.call.START"
        const val ACTION_TOGGLE_MIC = "org.wizardchat.call.TOGGLE_MIC"
        const val ACTION_TOGGLE_DEAFEN = "org.wizardchat.call.TOGGLE_DEAFEN"
        const val ACTION_LEAVE = "org.wizardchat.call.LEAVE"
        private const val CHANNEL_ID = "calls"

        internal fun notify(context: Context) {
            val notification = build(context) ?: return
            runCatching { context.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification) }
        }

        private fun ensureChannel(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, L10n.format("room.settings.permissions.groups.calls"), NotificationManager.IMPORTANCE_LOW)
                    .apply { setShowBadge(false) },
            )
        }

        private fun placeholder(context: Context): Notification {
            ensureChannel(context)
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(PhIcons.id("phone", PhWeight.regular))
                .setContentTitle(L10n.format("call.wizardchatCall"))
                .setSilent(true)
                .build()
        }

        private fun build(context: Context): Notification? {
            val controller = CallNotificationController.current ?: return null
            val state = controller.state ?: return null
            ensureChannel(context)
            val status = when {
                state.ringing -> L10n.format("call.callingShort")
                state.speakerName != null -> L10n.format("call.isTalking", state.speakerName)
                controller.isDirect -> L10n.format("call.wizardchatCall")
                else -> L10n.format("call.wizardchatVoiceInCall", state.participantCount)
            }
            val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            }
            val person = Person.Builder().setName(controller.roomName.ifEmpty { L10n.format("call.wizardchatCall") }).build()
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(PhIcons.id("phone", PhWeight.regular))
                .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, action(context, ACTION_LEAVE, 3)))
                .setContentTitle(controller.roomName)
                .setContentText(status)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setWhen(controller.startedAt)
                .setShowWhen(!state.ringing)
                .setUsesChronometer(!state.ringing)
                .addAction(
                    PhIcons.id(if (state.micMuted) "microphone-slash" else "microphone"),
                    L10n.format(if (state.micMuted) "call.unmute" else "call.mute"),
                    action(context, ACTION_TOGGLE_MIC, 1),
                )
                .addAction(
                    PhIcons.id(if (state.deafened) "speaker-slash" else "speaker-high", PhWeight.regular),
                    L10n.format(if (state.deafened) "call.undeafen" else "call.deafen"),
                    action(context, ACTION_TOGGLE_DEAFEN, 2),
                )
                .build()
        }

        private fun action(context: Context, action: String, code: Int): PendingIntent =
            PendingIntent.getService(
                context,
                code,
                Intent(context, CallService::class.java).setAction(action),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
    }
}
