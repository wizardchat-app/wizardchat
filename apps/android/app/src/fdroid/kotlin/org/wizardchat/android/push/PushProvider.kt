package org.wizardchat.android.push

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import org.wizardchat.android.WizardApplication

internal object PushProvider {
    private const val TAG = "UnifiedPush"
    private const val FALLBACK_GATEWAY = "https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify"
    private val prefs get() = WizardApplication.instance.getSharedPreferences("unifiedpush", Context.MODE_PRIVATE)

    var endpoint: String?
        get() = prefs.getString("endpoint", null)
        set(value) = prefs.edit().putString("endpoint", value).apply()

    private fun distributor(context: Context): String? =
        UnifiedPush.getAckDistributor(context) ?: UnifiedPush.getSavedDistributor(context)
            ?: UnifiedPush.getDistributors(context).firstOrNull()

    fun setup(): PushSetup {
        val context = WizardApplication.instance
        val distributor = distributor(context) ?: return PushSetup.NoDistributor
        if (endpoint != null) return PushSetup.Ready
        val name = runCatching {
            context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(distributor, 0)).toString()
        }.getOrDefault(distributor)
        return PushSetup.OpenDistributor(name)
    }

    fun openDistributor() {
        val context = WizardApplication.instance
        val intent = distributor(context)?.let { context.packageManager.getLaunchIntentForPackage(it) }
            ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/io.heckel.ntfy/"))
        runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    suspend fun token(): String? {
        val context = WizardApplication.instance
        val found = suspendCancellableCoroutine { continuation ->
            UnifiedPush.tryUseCurrentOrDefaultDistributor(context) { continuation.resume(it) }
        }
        if (!found) {
            Log.i(TAG, "no UnifiedPush distributor; notifications arrive while the app syncs")
            return null
        }
        UnifiedPush.register(context)
        return endpoint
    }

    suspend fun gateway(pushkey: String): String = withContext(Dispatchers.IO) {
        runCatching {
            val endpoint = URL(pushkey)
            val candidate = URL(endpoint.protocol, endpoint.host, endpoint.port, "/_matrix/push/v1/notify")
            val connection = candidate.openConnection() as HttpURLConnection
            connection.connectTimeout = 5_000
            connection.readTimeout = 5_000
            try {
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                val kind = JSONObject(body).optJSONObject("unifiedpush")?.optString("gateway")
                if (kind == "matrix") candidate.toString() else null
            } finally {
                connection.disconnect()
            }
        }.getOrNull() ?: FALLBACK_GATEWAY
    }

    fun data(message: ByteArray): Map<String, String> {
        val notification = JSONObject(String(message)).optJSONObject("notification") ?: return emptyMap()
        val data = mutableMapOf<String, String>()
        notification.optString("room_id").takeIf { it.isNotEmpty() }?.let { data["room_id"] = it }
        notification.optString("event_id").takeIf { it.isNotEmpty() }?.let { data["event_id"] = it }
        notification.optJSONObject("counts")?.takeIf { it.has("unread") }?.let { data["unread"] = it.optInt("unread").toString() }
        notification.optJSONArray("devices")?.optJSONObject(0)
            ?.optJSONObject("data")?.optJSONObject("default_payload")
            ?.optString("user_id")?.takeIf { it.isNotEmpty() }
            ?.let { data["user_id"] = it }
        return data
    }
}

class UnifiedPushService : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        if (PushProvider.endpoint == endpoint.url) return
        PushProvider.endpoint = endpoint.url
        MainScope().launch { Push.register(endpoint.url) }
    }

    override fun onMessage(message: PushMessage, instance: String) {
        val data = runCatching { PushProvider.data(message.content) }.getOrNull() ?: return
        runBlocking { Push.handle(data) }
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        Log.w("UnifiedPush", "registration failed: $reason")
    }

    override fun onUnregistered(instance: String) {
        PushProvider.endpoint = null
    }
}
