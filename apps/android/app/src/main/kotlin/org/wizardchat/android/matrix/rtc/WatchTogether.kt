package org.wizardchat.android.matrix.rtc

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URI
import java.net.URLDecoder
import kotlin.math.max
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.wizardchat.android.WizardApplication

/** Orders changes to the shared state: a higher version wins, ties go to the larger user ID */
data class WatchClock(val version: Int, val by: String) {
    fun isNewerThan(other: WatchClock?): Boolean =
        other == null || version > other.version || (version == other.version && by > other.by)
}

/** What everyone in the call is watching, and where in the video they are */
data class WatchState(
    val videoId: String,
    val startedBy: String,
    val playing: Boolean,
    val position: Double,
    val at: Double,
    val rate: Double = 1.0,
    val version: Int = 0,
    val by: String = startedBy,
    val waitingFor: String? = null,
) {
    val clock: WatchClock get() = WatchClock(version, by)

    fun expectedPosition(now: Double = WatchTogether.now): Double =
        if (playing) position + (now - at) / 1000 * rate else position

    val json: JsonObject
        get() = buildJsonObject {
            put("videoId", videoId)
            put("startedBy", startedBy)
            put("playing", playing)
            put("position", position)
            put("at", at)
            put("rate", rate)
            put("version", version)
            put("by", by)
            put("waitingFor", waitingFor)
        }
}

/** A participant as Watch Together sees it */
data class WatchParticipant(val identity: String, val userId: String, val isLocal: Boolean)

/** Watching a YouTube video together in a call: the state goes around as LiveKit data messages */
class WatchTogether(
    private val ownUserId: String,
    private val send: (JsonObject) -> Unit,
    private val participants: () -> List<WatchParticipant>,
) {
    var state by mutableStateOf<WatchState?>(null)
        private set

    private var watchingState by mutableStateOf<String?>(null)

    /** The video you agreed to load. YouTube only sees you once you choose to watch. */
    var watchingVideoId: String?
        get() = watchingState
        set(value) {
            if (value == watchingState) return
            watchingState = value
            send(viewerMessage(value))
        }

    private val viewerVideos = mutableStateMapOf<String, String>()

    /** Who in the call watches the current video (user IDs), you included */
    val viewers: List<String>
        get() {
            val videoId = state?.videoId ?: return emptyList()
            return participants()
                .filter { (if (it.isLocal) watchingState else viewerVideos[it.identity]) == videoId }
                .map { it.userId }
                .distinct()
        }

    val ownId: String get() = ownUserId

    private val defaults = WizardApplication.instance.getSharedPreferences("calls", Context.MODE_PRIVATE)
    private var consentState by mutableStateOf(defaults.getBoolean("youtubeConsent", false))
    var consent: Boolean
        get() = consentState
        set(value) {
            consentState = value
            defaults.edit().putBoolean("youtubeConsent", value).apply()
        }

    private val scope: CoroutineScope = MainScope()
    private val offsets = mutableMapOf<String, List<Double>>()
    private var clock: WatchClock? = null
    private var heartbeat: Job? = null

    init {
        heartbeat = scope.launch {
            while (isActive) {
                delay((HEARTBEAT_SECONDS * 1000).toLong())
                beat()
            }
        }
        scope.launch {
            delay((LATE_JOIN_REQUEST_DELAY * 1000).toLong())
            if (state == null) send(buildJsonObject { put("t", "request") })
            send(buildJsonObject { put("t", "who") })
        }
    }

    fun close() {
        heartbeat?.cancel()
        heartbeat = null
        scope.cancel()
    }

    private fun nextClock() = WatchClock((clock?.version ?: 0) + 1, ownUserId)

    fun start(videoId: String) {
        consent = true
        watchingVideoId = videoId
        val next = nextClock()
        publish(WatchState(videoId, ownUserId, playing = true, position = 0.0, at = now, version = next.version, by = next.by))
    }

    /** Play or pause at a position; leaving waitingFor out clears any buffering hold */
    fun update(playing: Boolean, position: Double, waitingFor: String? = null) {
        val current = state ?: return
        val next = nextClock()
        publish(current.copy(playing = playing, position = max(0.0, position), at = now, waitingFor = waitingFor, version = next.version, by = next.by))
    }

    fun updateRate(rate: Double, position: Double) {
        val current = state ?: return
        val next = nextClock()
        publish(current.copy(rate = rate, position = max(0.0, position), at = now, version = next.version, by = next.by))
    }

    fun stop() {
        val next = nextClock()
        clock = next
        state = null
        watchingVideoId = null
        send(buildJsonObject {
            put("t", "stop")
            put("sentAt", now)
            put("version", next.version)
            put("by", next.by)
        })
    }

    private fun publish(next: WatchState) {
        clock = next.clock
        apply(next)
        broadcast(next)
    }

    private fun apply(next: WatchState?) {
        val previous = state
        state = next
        if (next != null && next.videoId != previous?.videoId && next.expectedPosition() < START_SOUND_WINDOW) {
            CallSounds.play("watch_together_start")
        }
    }

    private fun broadcast(state: WatchState) = send(stateMessage(state))

    private fun stateMessage(state: WatchState) = buildJsonObject {
        put("t", "state")
        put("state", state.json)
        put("sentAt", now)
    }

    private fun viewerMessage(videoId: String?) = buildJsonObject {
        put("t", "viewer")
        put("videoId", videoId)
    }

    /** The starter (or else the first person by identity) keeps everyone's clock fresh and lifts stale holds */
    private fun beat() {
        val current = state ?: return
        val present = participants().sortedBy { it.identity }
        val leader = present.firstOrNull { it.userId == current.startedBy } ?: present.firstOrNull()
        if (leader?.isLocal != true) return
        val waitingFor = current.waitingFor
        if (waitingFor != null && present.none { it.userId == waitingFor }) {
            val next = nextClock()
            publish(current.copy(playing = true, waitingFor = null, at = now, version = next.version, by = next.by))
            return
        }
        broadcast(current.copy(position = current.expectedPosition(), at = now))
    }

    fun receive(data: ByteArray, from: String) {
        val message = runCatching { Json.parseToJsonElement(data.decodeToString()).jsonObject }.getOrNull() ?: return
        when (message.string("t")) {
            "request" -> state?.let { broadcast(it.copy(position = it.expectedPosition(), at = now)) }
            "who" -> watchingState?.let { send(viewerMessage(it)) }
            "viewer" -> {
                val videoId = message.string("videoId")?.takeIf(::isVideoId)
                if (videoId != null) viewerVideos[from] = videoId else viewerVideos.remove(from)
            }
            "stop" -> {
                if (message.number("sentAt") == null) return
                val version = message.number("version")?.toInt() ?: 0
                val incoming = WatchClock(version, message.string("by") ?: "")
                if (version > 0 && !incoming.isNewerThan(clock)) return
                clock = if (version > 0) incoming else nextClock()
                apply(null)
                watchingVideoId = null
            }
            "state" -> {
                val sentAt = message.number("sentAt") ?: return
                val raw = runCatching { message["state"]?.jsonObject }.getOrNull() ?: return
                val videoId = raw.string("videoId")?.takeIf(::isVideoId) ?: return
                val startedBy = raw.string("startedBy") ?: return
                val playing = (raw["playing"] as? JsonPrimitive)?.booleanOrNull ?: return
                val position = raw.number("position")?.takeIf { it.isFinite() } ?: return
                val at = raw.number("at") ?: return
                val samples = ((offsets[from] ?: emptyList()) + (now - sentAt)).takeLast(OFFSET_SAMPLES)
                offsets[from] = samples
                var incoming = WatchState(
                    videoId = videoId,
                    startedBy = startedBy,
                    playing = playing,
                    position = max(0.0, position),
                    at = at + (samples.minOrNull() ?: 0.0),
                    rate = raw.number("rate")?.takeIf { it in 0.25..2.0 } ?: 1.0,
                    version = raw.number("version")?.toInt() ?: 0,
                    by = raw.string("by") ?: startedBy,
                    waitingFor = raw.string("waitingFor"),
                )
                if (incoming.version == 0) {
                    incoming = incoming.copy(version = nextClock().version)
                } else if (!incoming.clock.isNewerThan(clock) && incoming.clock != clock) {
                    return
                }
                clock = incoming.clock
                apply(incoming)
            }
        }
    }

    companion object {
        const val TOPIC = "org.wizardchat.watch"
        private const val HEARTBEAT_SECONDS = 10.0
        private const val LATE_JOIN_REQUEST_DELAY = 1.5
        private const val OFFSET_SAMPLES = 10
        private const val START_SOUND_WINDOW = 5.0
        private val videoIdPattern = Regex("^[A-Za-z0-9_-]{11}$")

        val now: Double get() = System.currentTimeMillis().toDouble()

        fun isVideoId(text: String): Boolean = videoIdPattern.matches(text)

        fun parseVideoId(input: String): String? {
            val text = input.trim()
            if (isVideoId(text)) return text
            val uri = runCatching { URI(if (text.startsWith("http")) text else "https://$text") }.getOrNull() ?: return null
            val host = uri.host?.lowercase()?.replace(Regex("^(www\\.|m\\.|music\\.)"), "") ?: return null
            val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
            var id: String? = null
            if (host == "youtu.be") {
                id = parts.firstOrNull()
            } else if (host == "youtube.com" || host == "youtube-nocookie.com") {
                id = uri.rawQuery?.split('&')
                    ?.map { it.split('=', limit = 2) }
                    ?.firstOrNull { it[0] == "v" }
                    ?.getOrNull(1)
                    ?.let { URLDecoder.decode(it, "UTF-8") }
                if (id == null && parts.size >= 2 && parts[0] in listOf("embed", "shorts", "live", "v")) id = parts[1]
            }
            return id?.takeIf(::isVideoId)
        }

        fun watchUrl(videoId: String, seconds: Double = 0.0): String {
            val t = seconds.toInt()
            return "https://www.youtube.com/watch?v=$videoId${if (t > 0) "&t=${t}s" else ""}"
        }
    }
}

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.number(key: String): Double? =
    (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
