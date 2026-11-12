package org.wizardchat.android.push

import android.content.Context
import android.util.Log
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.wizardchat.android.BuildConfig
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.MatrixSession
import org.wizardchat.android.matrix.MessageNotifier
import org.wizardchat.android.matrix.SessionClients
import org.wizardchat.android.matrix.SessionStore
import org.wizardchat.android.matrix.StoredSession
import org.wizardchat.core.PusherConfig
import org.wizardchat.core.SyncState

sealed interface PushSetup {
    data object Ready : PushSetup
    data object NoDistributor : PushSetup
    data class OpenDistributor(val name: String) : PushSetup
}

object Push {
    private const val FETCH_TIMEOUT_MS = 15_000L
    private const val REGISTER_TIMEOUT_MS = 30_000L
    private const val TAG = "Push"

    private val mutex = Mutex()
    private val registered
        get() = WizardApplication.instance.getSharedPreferences("push", Context.MODE_PRIVATE)

    /** Points every signed-in account's pusher at this device's current token */
    suspend fun register(token: String? = null) {
        val pushkey = token ?: PushProvider.token() ?: return
        val gateway = PushProvider.gateway(pushkey)
        mutex.withLock {
            coroutineScope {
                SessionStore.all().forEach { stored ->
                    launch {
                        val userId = stored.session.userId
                        val done = withTimeoutOrNull(REGISTER_TIMEOUT_MS) { register(stored, pushkey, gateway) }
                        if (done == null) Log.w(TAG, "registering the pusher for $userId timed out")
                    }
                }
            }
        }
    }

    private suspend fun register(stored: StoredSession, pushkey: String, gateway: String) {
        val userId = stored.session.userId
        val current = "$pushkey|$gateway"
        val previous = registered.getString(userId, null)
        if (previous == current) return
        try {
            val client = SessionClients.restore(stored)
            client.setPusher(
                PusherConfig(
                    appId = BuildConfig.APPLICATION_ID,
                    pushkey = pushkey,
                    gatewayUrl = gateway,
                    appName = "WizardChat",
                    deviceName = MatrixSession.DEVICE_NAME,
                    lang = Locale.getDefault().toLanguageTag(),
                ),
            )
            registered.edit().putString(userId, current).apply()
            val oldKey = previous?.substringBefore('|')
            if (oldKey != null && oldKey != pushkey) {
                runCatching { client.removePusher(BuildConfig.APPLICATION_ID, oldKey) }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w(TAG, "couldn't register the pusher for $userId", error)
        }
    }

    fun forget(userId: String) {
        registered.edit().remove(userId).apply()
    }

    suspend fun handle(data: Map<String, String>) {
        val userId = data["user_id"] ?: SessionStore.active()?.session?.userId ?: return
        val stored = SessionStore.all().firstOrNull { it.session.userId == userId } ?: return
        val roomId = data["room_id"]
        val eventId = data["event_id"]
        if (roomId == null || eventId == null) {
            if (data["unread"] == "0") MessageNotifier.shared.removeDelivered(userId)
            return
        }
        val session = WizardApplication.instance.session
        if (session.userId == userId && session.syncState == SyncState.running) return
        try {
            val client = SessionClients.restore(stored)
            val notification = withTimeout(FETCH_TIMEOUT_MS) { client.pushedNotification(roomId, eventId) }
            if (notification != null) MessageNotifier.shared.show(notification, client)
        } catch (_: Exception) {
            MessageNotifier.shared.showPlaceholder(userId, roomId, eventId)
        }
    }
}
