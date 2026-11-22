package org.wizardchat.android.matrix.rtc

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.wizardchat.android.R
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.CallManager
import org.wizardchat.android.matrix.RingingCall
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.voice.IncomingCallActivity

object IncomingCallNotifier {
    internal const val NOTIFICATION_ID = 0x0ca12
    internal const val CHANNEL_ID = "incoming_calls"
    private const val TAG = "WZCALL"
    private val context: Context get() = WizardApplication.instance

    internal var ringing: Pair<RingingCall, Long>? = null
        private set
    /** Answered: the notification stays as the call's until the ongoing call's replaces it */
    private var answered = false
    private var ringtone: CallSounds.Loop? = null
    private var vibrating = false

    fun canUseFullScreen(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() != false

    fun ring(call: RingingCall, expiresAt: Long) {
        ringing = call to expiresAt
        answered = false
        val started = runCatching {
            ContextCompat.startForegroundService(context, Intent(context, RingService::class.java))
        }
        if (started.isFailure) {
            // Not allowed to start a foreground service from here: the notification rings on its own
            Log.w(TAG, "couldn't start the ring service", started.exceptionOrNull())
            build()?.let { notification ->
                runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
            }
            alert()
        }
    }

    fun answered() {
        val call = ringing ?: return
        answered = true
        ringing = call
        silence()
        build()?.let { notification ->
            runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
        }
    }

    fun stop() {
        answered = false
        ringing = null
        silence()
        context.stopService(Intent(context, RingService::class.java))
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    internal fun alert() {
        if (ringtone == null) ringtone = CallSounds.loop("ringtone")
        val audio = context.getSystemService(AudioManager::class.java)
        val vibrate = when (audio?.ringerMode) {
            AudioManager.RINGER_MODE_SILENT -> false
            AudioManager.RINGER_MODE_VIBRATE -> true
            else -> Settings.System.getInt(context.contentResolver, "vibrate_when_ringing", 1) != 0
        }
        if (vibrate && !vibrating) {
            vibrating = true
            vibrator()?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 1000, 1000), 0))
        }
    }

    private fun silence() {
        ringtone?.stop()
        ringtone = null
        if (vibrating) {
            vibrating = false
            vibrator()?.cancel()
        }
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }

    internal fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, L10n.format("call.incomingCallsChannel"), NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(false)
            },
        )
    }

    internal fun build(): Notification? {
        val (call, expiresAt) = ringing ?: return null
        ensureChannel()
        val name = call.callerName ?: call.callerId
        val person = Person.Builder().setName(name).setImportant(true).build()
        val screen = PendingIntent.getActivity(
            context,
            0,
            IncomingCallActivity.intent(context, answer = false),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val answer = PendingIntent.getActivity(
            context,
            1,
            IncomingCallActivity.intent(context, answer = true),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val decline = PendingIntent.getBroadcast(
            context,
            2,
            Intent(context, DeclineCallReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        if (answered) {
            val hangUp = PendingIntent.getService(
                context,
                3,
                Intent(context, CallService::class.java).setAction(CallService.ACTION_LEAVE),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(name)
                .setContentText(L10n.format("call.callingShort"))
                .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangUp))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(screen)
                .build()
        }
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(name)
            .setContentText(L10n.format(if (call.voiceOnly) "call.incomingVoiceCall" else "call.incomingVideoCall"))
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer).setIsVideo(!call.voiceOnly))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(screen)
            .setFullScreenIntent(screen, true)
            .setTimeoutAfter((expiresAt - System.currentTimeMillis()).coerceAtLeast(1000))
            .build()
    }
}

class RingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = IncomingCallNotifier.build()
        if (notification == null) {
            IncomingCallNotifier.ensureChannel()
            val placeholder = NotificationCompat.Builder(this, IncomingCallNotifier.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .build()
            runCatching { ServiceCompat.startForeground(this, IncomingCallNotifier.NOTIFICATION_ID, placeholder, type()) }
            stopSelf()
            return START_NOT_STICKY
        }
        runCatching { ServiceCompat.startForeground(this, IncomingCallNotifier.NOTIFICATION_ID, notification, type()) }
            .recoverCatching { ServiceCompat.startForeground(this, IncomingCallNotifier.NOTIFICATION_ID, notification, 0) }
            .onFailure { Log.w("WZCALL", "couldn't ring in the foreground", it) }
        IncomingCallNotifier.alert()
        return START_NOT_STICKY
    }

    private fun type() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL else 0
}

class DeclineCallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        CallManager.shared.declineRinging()
    }
}
