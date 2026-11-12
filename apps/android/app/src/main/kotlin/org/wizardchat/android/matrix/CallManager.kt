package org.wizardchat.android.matrix

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import io.livekit.android.AudioOptions
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.audio.NoAudioHandler
import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.E2EEOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room as LiveKitRoom
import io.livekit.android.room.participant.AudioTrackPublishDefaults
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.participant.VideoTrackPublishDefaults
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.DataPublishReliability
import io.livekit.android.room.track.LocalAudioTrackOptions
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.RemoteAudioTrack
import io.livekit.android.room.track.RemoteTrackPublication
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCodec
import io.livekit.android.room.track.VideoEncoding
import io.livekit.android.room.track.VideoPreset169
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import livekit.org.webrtc.FrameCryptorKeyDerivationAlgorithm
import livekit.org.webrtc.RtpParameters
import org.wizardchat.android.WizardApplication
import org.wizardchat.android.matrix.rtc.CallActivityState
import org.wizardchat.android.matrix.rtc.CallNotificationController
import org.wizardchat.android.matrix.rtc.CallSounds
import org.wizardchat.android.matrix.rtc.WatchParticipant
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.ui.L10n
import org.wizardchat.android.ui.copyToClipboard
import org.wizardchat.core.CallErrorKind
import org.wizardchat.core.CallEvent
import org.wizardchat.core.CallMember
import org.wizardchat.core.CallSession
import org.wizardchat.core.CallStatus
import org.wizardchat.core.MediaState
import org.wizardchat.core.IncomingCall
import org.wizardchat.core.IncomingCallEvent
import org.wizardchat.core.RingEnd
import org.wizardchat.core.RoomSummary
import org.wizardchat.core.Subscription
import org.wizardchat.core.WizardClient

/** One device in the call, with its media state */
data class CallParticipantInfo(
    val identity: String,
    val userId: String,
    val deviceId: String,
    val isLocal: Boolean,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    /** The user's own account on another of their devices */
    val isOwnOtherDevice: Boolean = false,
    val connected: Boolean = false,
    val speaking: Boolean = false,
    val micMuted: Boolean = true,
    val cameraTrack: VideoTrack? = null,
    val screenTrack: VideoTrack? = null,
    val screenShared: Boolean = false,
    val watchingScreen: Boolean = false,
    /** The LiveKit room the tracks come from (video views render with its EGL context) */
    val connection: LiveKitRoom? = null,
    val handRaised: Boolean = false,
    val reaction: String? = null,
    val volume: Double = 1.0,
    val locallyMuted: Boolean = false,
    val screenWatchers: List<String> = emptyList(),
) {
    val id: String get() = identity
}

/** Someone ringing you */
data class RingingCall(
    val roomId: String,
    val eventId: String,
    val callerId: String,
    val callerName: String?,
    val voiceOnly: Boolean,
    /** Rings audibly (DMs and small rooms), or only tells of a call in a larger room */
    val ring: Boolean,
)

/** An emoji you can send into a call */
data class CallReaction(val emoji: String, val name: String) {
    val id: String get() = name

    companion object {
        val all = listOf(
            CallReaction("👍", "thumbsup"), CallReaction("👎", "thumbsdown"),
            CallReaction("👏", "clap"), CallReaction("😂", "laugh"),
            CallReaction("😮", "wow"), CallReaction("❤️", "heart"),
            CallReaction("🎉", "party"), CallReaction("🔥", "fire"),
        )
    }
}

/**
 * Calls: MatrixRTC membership and media keys through the core, media through LiveKit (one
 * connection per call server in use).
 */
class CallManager {
    sealed interface State {
        data object Idle : State
        data object Joining : State
        data object Joined : State
        data class Failed(val message: String, val roomId: String? = null) : State
    }

    enum class RingState { ringing, declined, unanswered }

    var state by mutableStateOf<State>(State.Idle)
        private set
    var room by mutableStateOf<RoomSummary?>(null)
        private set
    var participants by mutableStateOf<List<CallParticipantInfo>>(emptyList())
        private set
    var cameraOn by mutableStateOf(false)
        private set
    var screenSharing by mutableStateOf(false)
        private set
    var handRaised by mutableStateOf(false)
        private set
    var status by mutableStateOf(CallStatus.joiningMedia)
        private set
    val reconnecting: Boolean get() = status == CallStatus.reconnecting
    var watch by mutableStateOf<WatchTogether?>(null)
        private set
    var ring by mutableStateOf<RingState?>(null)
        private set
    var incoming by mutableStateOf<RingingCall?>(null)
        private set
    var showCallScreen by mutableStateOf(false)

    private val context: Context get() = WizardApplication.instance
    private val defaults = WizardApplication.instance.getSharedPreferences("calls", Context.MODE_PRIVATE)

    private var micMutedState by mutableStateOf(defaults.getBoolean("voice.micMuted", false))
    var micMuted: Boolean
        get() = micMutedState
        set(value) {
            micMutedState = value
            defaults.edit().putBoolean("voice.micMuted", value).apply()
        }
    var talking by mutableStateOf(false)
        private set
    val pushToTalk: Boolean
        get() = context.getSharedPreferences("preferences", Context.MODE_PRIVATE).getBoolean("pushToTalk", false)
    private var micTesting = false
    private var micJob: Job? = null
    private val micEnabled: Boolean
        get() = !micTesting && (if (pushToTalk) talking && !deafened else !micMuted && !deafened)
    private val micPublished: Boolean
        get() = if (pushToTalk) !micTesting && !deafened else micEnabled
    private val outputVolume: Double get() = defaults.getFloat("voice.outputVolume", 1f).toDouble()
    var cameraBack by mutableStateOf(defaults.getString("voice.cameraPosition", "front") == "back")
        private set
    private val cameraOptions: LocalVideoTrackOptions
        get() = LocalVideoTrackOptions(
            position = if (cameraBack) CameraPosition.BACK else CameraPosition.FRONT,
            captureParams = VideoPreset169.H720.capture,
        )
    private var deafenedState by mutableStateOf(defaults.getBoolean("voice.deafened", false))
    var deafened: Boolean
        get() = deafenedState
        set(value) {
            deafenedState = value
            defaults.edit().putBoolean("voice.deafened", value).apply()
        }

    /** Asks for runtime permissions; set by the UI while an activity is around */
    internal var permissionRequester: (suspend (Array<String>) -> Unit)? = null

    /** Asks to capture the screen: the result data for LiveKit's screen capture, or null */
    internal var screenCaptureRequester: (suspend () -> Intent?)? = null

    // Anything unexpected in the call's work ends the call with its message instead of the app
    private val scope = MainScope() + CoroutineExceptionHandler { _, error ->
        Log.e(TAG, "call failed", error)
        fail(error.message ?: error.javaClass.simpleName, leave = true)
    }
    private var ringback: CallSounds.Loop? = null
    private var ringtone: CallSounds.Loop? = null
    private var knownOthers = setOf<String>()
    private val notification = CallNotificationController()

    private var session: CallSession? = null
    private var run: Subscription? = null
    private var incomingWatch: Subscription? = null
    private var incomingClient: WizardClient? = null
    private var members = listOf<CallMember>()
    private var mutedBeforeDeafen = false
    private var client: WizardClient? = null
    private var keyProvider: BaseKeyProvider? = null
    /** By call service; services leading to the same LiveKit room share one connection */
    private val connections = mutableMapOf<String, LiveKitRoom>()
    private val connectionRooms = mutableMapOf<LiveKitRoom, String>()
    private val connectionJobs = mutableMapOf<LiveKitRoom, Job>()
    private val pendingServices = mutableSetOf<String>()
    private var refreshTimer: Job? = null
    private var publisherJob: Job? = null
    private var joinInFlight = false
    private var pendingLeave: Job? = null
    private val unconnectedSince = mutableMapOf<String, Long>()
    private var subscribeRetry: Job? = null
    /** Bumped on every join and leave, so a join that was left halfway stops */
    private var attempt = 0
    private val userVolumes = mutableMapOf<String, Double>()
    private val mutedUsers = mutableSetOf<String>()
    private val appliedVolumes = mutableMapOf<String, Double>()
    private val reactions = mutableMapOf<String, String>()
    private val raisedHands = mutableSetOf<String>()
    private var watchedScreens = setOf<String>()
    private val streamWatchers = mutableSetOf<String>()
    private val requestedSubscriptions = java.util.IdentityHashMap<RemoteTrackPublication, Boolean>()

    init {
        notification.end()
    }

    val isInCall: Boolean get() = state == State.Joining || state == State.Joined

    fun isInCall(roomId: String): Boolean = isInCall && room?.id == roomId

    suspend fun join(room: RoomSummary, session: MatrixSession, intent: String? = null, ring: Boolean = false) {
        if (isInCall(room.id) || joinInFlight) return
        joinInFlight = true
        try {
            joinNow(room, session, intent, ring)
        } finally {
            joinInFlight = false
        }
    }

    private suspend fun joinNow(room: RoomSummary, session: MatrixSession, intent: String?, ring: Boolean) {
        if (incoming?.roomId == room.id) dismissIncoming()
        if (isInCall) leaveAndWait("switch")
        pendingLeave?.let { leaving -> withTimeoutOrNull(LEAVE_WAIT_MILLIS) { leaving.join() } }
        val wanted = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions(wanted)
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            state = State.Failed(L10n.format("call.micPermission"), room.id)
            return
        }
        val client = session.client ?: return
        val current = ++attempt
        this.room = room
        this.client = client
        status = CallStatus.joiningMedia
        state = State.Joining
        var call: CallSession? = null
        try {
            val joined = client.joinCall(room.id, video = intent == "video", ring = ring)
            call = joined
            if (attempt != current) {
                runCatching { joined.leave() }
                return
            }
            this.session = joined
            log("client", "android ${Build.MANUFACTURER} ${Build.MODEL} sdk=${Build.VERSION.SDK_INT}")
            if (joined.encrypted()) {
                // The key provider calls into WebRTC, which only LiveKit.init or the first connection loads
                LiveKit.init(context)
                keyProvider = BaseKeyProvider(
                    ratchetWindowSize = 10,
                    enableSharedKey = false,
                    keyRingSize = 256,
                    keyDerivationAlgorithm = FrameCryptorKeyDerivationAlgorithm.HKDF,
                )
            }
            run = joined.run { handle(it) }
            val publisher = connectPublisher() ?: return
            if (attempt != current) return
            state = State.Joined
            applyAudioDevice()
            watch = WatchTogether(
                ownUserId = client.userId ?: "",
                send = { sendData(it, WatchTogether.TOPIC) },
                participants = {
                    participants.filter { it.connected }.map { WatchParticipant(it.identity, it.userId, it.isLocal) }
                },
            )
            if (pushToTalk) micMuted = false
            CallSounds.play("call_join")
            notification.start(room.displayName, room.isDirect, activityState)
            if (intent == "video") toggleCamera()
            // Someone may have answered before the media connected
            if (joined.rang && knownOthers.isEmpty()) startRinging()
            syncRemoteConnections()
            startRefreshing()
        } catch (error: CancellationException) {
            // Left while joining: leaving already cleaned up
            if (attempt == current && this.session === call) failJoin(current, call, null)
        } catch (error: Throwable) {
            Log.e(TAG, "join failed", error)
            failJoin(current, call, error.message ?: error.javaClass.simpleName)
        }
    }

    private suspend fun failJoin(current: Int, call: CallSession?, message: String?) {
        if (attempt != current) return
        val roomId = room?.id
        if (message != null) log("failed", message)
        tearDown()
        runCatching { call?.leave() }
        room = null
        state = if (message == null) State.Idle else State.Failed(message, roomId)
    }

    private fun log(event: String, detail: String = "") {
        val session = session
        if (session == null) {
            Log.i(TAG, "$event $detail")
            return
        }
        scope.launch { runCatching { session.log(event, detail) } }
    }

    fun copyCallLog(client: WizardClient) {
        scope.launch {
            runCatching { client.callLog() }.onSuccess { copyToClipboard(it, L10n.format("call.logCopied")) }
        }
    }

    private suspend fun connectPublisher(): LiveKitRoom? {
        val session = session ?: return null
        publisherJob?.let { running ->
            running.join()
            return publisher
        }
        var result: LiveKitRoom? = null
        val job = scope.launch {
            var backoff = 1000L
            var tries = 0
            while (isActive && this@CallManager.session === session) {
                tries += 1
                val started = System.currentTimeMillis()
                try {
                    val publisher = withTimeout(CONNECT_TIMEOUT_MILLIS) { connect(session.serviceUrl, publisher = true) }
                    log("media.connect", "ok attempt=$tries ${System.currentTimeMillis() - started}ms")
                    runCatching { session.reportMedia(MediaState.connected) }
                    val mic = runCatching { publisher.localParticipant.setMicrophoneEnabled(micPublished) }
                    mic.exceptionOrNull()?.let { log("mic", "failed: $it") }
                    silenceMic(publisher, pushToTalk && !micEnabled)
                    if (cameraOn) runCatching { publisher.localParticipant.setCameraEnabled(true) }
                    screenSharing = false
                    result = publisher
                    return@launch
                } catch (error: CancellationException) {
                    if (error !is TimeoutCancellationException) throw error
                    log("media.connect", "timed out attempt=$tries, retry in ${backoff}ms")
                } catch (error: Exception) {
                    log("media.connect", "failed attempt=$tries, retry in ${backoff}ms: $error")
                }
                runCatching { session.reportMedia(MediaState.reconnecting) }
                delay(backoff)
                backoff = (backoff * 2).coerceAtMost(10_000L)
            }
        }
        publisherJob = job
        try {
            job.join()
        } finally {
            if (publisherJob === job) publisherJob = null
        }
        return result
    }

    /** [join] in the background, so it goes on when the screen that started it goes away */
    fun launchJoin(room: RoomSummary, session: MatrixSession, intent: String? = null, ring: Boolean = false) {
        scope.launch { join(room, session, intent, ring) }
    }

    fun leave(reason: String = "hangup") {
        scope.launch { leaveAndWait(reason) }
    }

    private suspend fun leaveAndWait(reason: String) {
        if (state == State.Joined) CallSounds.play("call_leave")
        val call = session
        log("leave", reason)
        tearDown()
        state = State.Idle
        room = null
        runCatching { call?.leave() }
    }

    /** The core already left (fatal error) or the call can't go on: show why */
    private fun fail(message: String, leave: Boolean) {
        val call = session ?: return
        val roomId = room?.id
        log("failed", message)
        tearDown()
        if (leave) pendingLeave = scope.launch { runCatching { call.leave() } }
        room = null
        state = State.Failed(message, roomId)
    }

    /** Hides a shown call error, unless something newer replaced it */
    fun dismissFailure(failed: State.Failed) {
        if (state === failed) state = State.Idle
    }

    /** Signed out or switched accounts: nothing of this client's calls goes on */
    fun signedOut() {
        stopWatchingIncoming()
        leave("signedOut")
    }

    private fun tearDown() {
        attempt++
        notification.end()
        stopRinging()
        ring = null
        showCallScreen = false
        knownOthers = emptySet()
        watch?.close()
        watch = null
        refreshTimer?.cancel()
        refreshTimer = null
        publisherJob?.cancel()
        publisherJob = null
        unconnectedSince.clear()
        subscribeRetry?.cancel()
        subscribeRetry = null
        run?.cancel()
        run = null
        val rooms = connections.values.toSet()
        connections.clear()
        pendingServices.clear()
        rooms.forEach(::close)
        session = null
        members = emptyList()
        client = null
        keyProvider = null
        participants = emptyList()
        reactions.clear()
        raisedHands.clear()
        watchedScreens = emptySet()
        streamWatchers.clear()
        requestedSubscriptions.clear()
        handRaised = false
        cameraOn = false
        screenSharing = false
        status = CallStatus.joiningMedia
        appliedVolumes.clear()
    }

    private fun close(connection: LiveKitRoom) {
        connectionJobs.remove(connection)?.cancel()
        connectionRooms.remove(connection)
        connection.disconnect()
        connection.release()
    }

    /** Forgets the connection under every service that used it, and closes it */
    private fun drop(connection: LiveKitRoom) {
        connections.entries.removeAll { it.value === connection }
        close(connection)
    }

    private fun handle(event: CallEvent) {
        when (event) {
            is CallEvent.Members -> membersChanged(event.members)
            is CallEvent.Key -> {
                val data = runCatching { Base64.decode(event.key, Base64.DEFAULT) }.getOrNull() ?: return
                // The provider's own setKey takes text; the core hands out raw key bytes
                keyProvider?.rtcKeyProvider?.setKey(event.identity, event.index.toInt(), data)
            }
            is CallEvent.Declined -> if (ring == RingState.ringing) endRinging(RingState.declined)
            CallEvent.Unanswered -> if (ring == RingState.ringing) endRinging(RingState.unanswered)
            is CallEvent.Reaction -> show(event.emoji, event.identity)
            is CallEvent.HandRaised -> {
                if (event.raised) raisedHands.add(event.identity) else raisedHands.remove(event.identity)
                refresh()
            }
            is CallEvent.Error -> if (event.fatal) fail(errorMessage(event), leave = false) else Log.w(TAG, event.message)
            is CallEvent.Status -> status = event.status
            is CallEvent.Log -> Log.i(TAG, event.line)
        }
    }

    private fun errorMessage(error: CallEvent.Error): String = when (error.kind) {
        CallErrorKind.timeout -> L10n.format("call.joinTimeout")
        CallErrorKind.disconnected -> L10n.format("call.disconnected")
        CallErrorKind.replaced -> L10n.format("call.replaced")
        CallErrorKind.removed -> L10n.format("call.removed")
        CallErrorKind.membership -> L10n.format("call.failed", error.message)
    }

    private fun membersChanged(members: List<CallMember>) {
        this.members = members
        val client = client ?: return
        val others = members.filter { it.userId != client.userId }.map { it.userId }.toSet()
        if (state == State.Joined) {
            if ((others - knownOthers).isNotEmpty()) {
                CallSounds.play("call_join")
            } else if ((knownOthers - others).isNotEmpty()) {
                CallSounds.play("call_leave")
            }
        }
        knownOthers = others
        if (others.isNotEmpty() && ring == RingState.ringing) {
            stopRinging()
            ring = null
        }
        syncRemoteConnections()
        refresh()
    }

    private suspend fun connect(service: String, publisher: Boolean): LiveKitRoom {
        val session = session ?: throw CancellationException()
        val sfu = session.sfuConfig(service, publisher)
        if (this.session !== session) throw CancellationException()
        val sfuRoom = "${sfu.url.trimEnd('/')}|${sfu.alias}"
        if (!publisher) {
            val shared = connectionRooms.entries.firstOrNull { it.value == sfuRoom && it.key in connections.values }?.key
            if (shared != null) {
                connections[service] = shared
                return shared
            }
        }
        val options = RoomOptions(
            adaptiveStream = true,
            dynacast = true,
            e2eeOptions = keyProvider?.let { E2EEOptions(keyProvider = it) },
            audioTrackCaptureDefaults = LocalAudioTrackOptions(noiseSuppression = true, echoCancellation = true, autoGainControl = true),
            videoTrackCaptureDefaults = cameraOptions,
            screenShareTrackCaptureDefaults = LocalVideoTrackOptions(isScreencast = true, captureParams = VideoPreset169.H1080.capture),
            // No RED (redundant audio): browsers can't decrypt RED-wrapped frames
            audioTrackPublishDefaults = AudioTrackPublishDefaults(dtx = true, red = false),
            videoTrackPublishDefaults = VideoTrackPublishDefaults(
                videoEncoding = VideoEncoding(2_500_000, 30),
                simulcastLayers = listOf(VideoPreset169.H180, VideoPreset169.H360),
                videoCodec = VideoCodec.VP8.codecName,
                degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION,
            ),
        )
        // Only the publishing connection manages audio routing and focus, so another call
        // server's connection going away doesn't reset it
        val overrides = if (publisher) {
            LiveKitOverrides()
        } else {
            LiveKitOverrides(audioOptions = AudioOptions(audioHandler = NoAudioHandler(), disableCommunicationModeWorkaround = true))
        }
        val livekit = LiveKit.create(context, options, overrides)
        connectionRooms[livekit] = sfuRoom
        connectionJobs[livekit] = scope.launch { livekit.events.collect { roomEvent(livekit, it) } }
        try {
            // Screen shares are only subscribed once you choose to watch them, like on the web
            livekit.connect(sfu.url, sfu.jwt, ConnectOptions(autoSubscribe = false))
        } catch (error: Throwable) {
            close(livekit)
            throw error
        }
        if (this.session !== session) {
            close(livekit)
            throw CancellationException()
        }
        connections[service] = livekit
        return livekit
    }

    private fun syncRemoteConnections() {
        val session = session ?: return
        if (state != State.Joined || publisherJob != null) return
        val own = session.serviceUrl
        val wanted = members.mapNotNull { it.serviceUrl }.filter { it != own }.toSet()
        for (service in wanted) {
            if (connections[service] != null || service in pendingServices) continue
            pendingServices.add(service)
            scope.launch {
                try {
                    withTimeout(CONNECT_TIMEOUT_MILLIS) { connect(service, publisher = false) }
                } catch (error: TimeoutCancellationException) {
                    Log.w(TAG, "could not connect to $service: timed out")
                    retrySubscribeSoon()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    Log.w(TAG, "could not connect to $service: $error")
                    retrySubscribeSoon()
                } finally {
                    pendingServices.remove(service)
                }
            }
        }
        for ((service, connection) in connections.toMap()) {
            if (service == own || service in wanted) continue
            connections.remove(service)
            if (connection !in connections.values) close(connection)
        }
    }

    private fun retrySubscribeSoon() {
        if (session == null || subscribeRetry != null) return
        subscribeRetry = scope.launch {
            delay(SUBSCRIBE_RETRY_MILLIS)
            subscribeRetry = null
            syncRemoteConnections()
        }
    }

    /** The publishing connection dropped: connect again (the core decides when to give up) */
    private fun reconnect() {
        if (publisherJob != null || state != State.Joined) return
        scope.launch {
            if (connectPublisher() != null) {
                syncRemoteConnections()
                refresh()
            }
        }
    }

    private val publisher: LiveKitRoom? get() = session?.let { connections[it.serviceUrl] }

    private fun sendData(message: JsonObject, topic: String) {
        val publisher = publisher ?: return
        val data = message.toString().encodeToByteArray()
        scope.launch {
            publisher.localParticipant.publishData(data, DataPublishReliability.RELIABLE, topic)
                .onFailure { Log.w(TAG, "data: $it") }
        }
    }

    /** Unmuting while deafened also undeafens you (you can't talk without hearing) */
    fun toggleMic() {
        if (deafened) {
            deafened = false
            micMuted = false
        } else {
            micMuted = !micMuted
        }
        if (state == State.Joined) CallSounds.play(if (micMuted) "mute" else "unmute")
        applyMic()
    }

    fun toggleDeafen() {
        if (deafened) {
            deafened = false
            micMuted = mutedBeforeDeafen
        } else {
            mutedBeforeDeafen = micMuted
            deafened = true
            micMuted = true
        }
        if (state == State.Joined) CallSounds.play(if (deafened) "deafen" else "undeafen")
        applyMic()
    }

    private fun silenceMic(publisher: LiveKitRoom, silenced: Boolean) {
        publisher.localParticipant.getTrackPublication(Track.Source.MICROPHONE)?.track?.enabled = !silenced
    }

    fun holdToTalk(on: Boolean) {
        if (!pushToTalk || talking == on) return
        talking = on
        applyMic()
    }

    fun applyMic() {
        if (pushToTalk) micMuted = false else talking = false
        val published = micPublished
        val silenced = pushToTalk && !micEnabled
        val publisher = publisher
        val previous = micJob
        micJob = scope.launch {
            previous?.join()
            runCatching { publisher?.localParticipant?.setMicrophoneEnabled(published) }
            if (published && publisher != null) silenceMic(publisher, silenced)
        }
        refresh()
    }

    fun flipCamera() {
        val back = !cameraBack
        val track = publisher?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack ?: return
        try {
            track.switchCamera(position = if (back) CameraPosition.BACK else CameraPosition.FRONT)
            cameraBack = back
            defaults.edit().putString("voice.cameraPosition", if (back) "back" else "front").apply()
        } catch (error: Exception) {
            Log.w(TAG, "switching the camera: $error")
        }
    }

    fun toggleCamera() {
        cameraBack = defaults.getString("voice.cameraPosition", "front") == "back"
        val enabled = !cameraOn
        scope.launch {
            if (enabled) {
                requestPermissions(listOf(Manifest.permission.CAMERA))
                if (!hasPermission(Manifest.permission.CAMERA)) return@launch
            }
            try {
                publisher?.videoTrackCaptureDefaults = cameraOptions
                publisher?.localParticipant?.setCameraEnabled(enabled)
                cameraOn = enabled
                CallSounds.play(if (enabled) "camera_on" else "camera_off")
                notification.cameraChanged()
            } catch (error: Exception) {
                Log.w(TAG, "camera: $error")
            }
            refresh()
        }
    }

    fun toggleScreenShare() {
        val enabled = !screenSharing
        scope.launch {
            val local = publisher?.localParticipant
            try {
                if (enabled) {
                    val data = screenCaptureRequester?.invoke() ?: return@launch
                    screenSharing = local?.setScreenShareEnabled(
                        true,
                        ScreenCaptureParams(data, onStop = { scope.launch { refresh() } }),
                    ) == true
                } else {
                    local?.setScreenShareEnabled(false)
                    screenSharing = false
                }
                CallSounds.play(if (screenSharing) "screenshare_start" else "screenshare_stop")
            } catch (error: Exception) {
                Log.w(TAG, "screen share: $error")
                screenSharing = local?.isScreenShareEnabled ?: false
            }
            refresh()
        }
    }

    fun setOutputVolume(volume: Double) {
        defaults.edit().putFloat("voice.outputVolume", volume.toFloat()).apply()
        appliedVolumes.clear()
        refresh()
    }

    fun applyAudioDevice() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val manager = context.getSystemService(AudioManager::class.java) ?: return
        val id = defaults.getInt("voice.outputDevice", -1)
        val device = manager.availableCommunicationDevices.firstOrNull { it.id == id }
        if (device != null) manager.setCommunicationDevice(device) else if (id != -1) manager.clearCommunicationDevice()
    }

    fun setMicTesting(on: Boolean) {
        micTesting = on
        applyMic()
    }

    fun setVolume(volume: Double, userId: String) {
        userVolumes[userId] = volume
        refresh()
    }

    fun toggleLocalMute(userId: String) {
        if (!mutedUsers.remove(userId)) mutedUsers.add(userId)
        refresh()
    }

    fun sendReaction(reaction: CallReaction) {
        val session = session ?: return
        show(reaction.emoji, session.identity)
        scope.launch {
            try {
                session.sendReaction(reaction.emoji, reaction.name)
            } catch (error: Exception) {
                Log.w(TAG, "reaction: $error")
            }
        }
    }

    fun toggleHand() {
        val session = session ?: return
        handRaised = !handRaised
        val raise = handRaised
        if (raise) raisedHands.add(session.identity) else raisedHands.remove(session.identity)
        if (raise) CallSounds.play("raise_hand")
        refresh()
        scope.launch { runCatching { session.setHandRaised(raise) } }
    }

    private fun show(emoji: String, identity: String) {
        reactions[identity] = emoji
        CallSounds.play("reaction")
        refresh()
        scope.launch {
            delay(REACTION_VISIBLE_MILLIS)
            if (reactions[identity] == emoji) {
                reactions.remove(identity)
                refresh()
            }
        }
    }

    private fun startRefreshing() {
        refreshTimer?.cancel()
        refreshTimer = scope.launch {
            while (isActive) {
                delay(250)
                refresh()
            }
        }
    }

    fun setWatchingScreen(identity: String, watching: Boolean) {
        watchedScreens = if (watching) watchedScreens + identity else watchedScreens - identity
        sendData(buildJsonObject { put("owner", identity); put("watching", watching) }, STREAM_WATCH_TOPIC)
        refresh()
    }

    private fun applySubscriptions(remotes: Map<String, Pair<RemoteParticipant, LiveKitRoom>>) {
        val seen = mutableSetOf<RemoteTrackPublication>()
        for ((identity, remote) in remotes) {
            for (publication in remote.first.trackPublications.values) {
                if (publication !is RemoteTrackPublication) continue
                seen.add(publication)
                val screen = publication.source == Track.Source.SCREEN_SHARE || publication.source == Track.Source.SCREEN_SHARE_AUDIO
                val want = !screen || identity in watchedScreens
                if (requestedSubscriptions[publication] == want) continue
                requestedSubscriptions[publication] = want
                runCatching { publication.setSubscribed(want) }.onFailure {
                    Log.w(TAG, "subscribing: $it")
                    requestedSubscriptions.remove(publication)
                }
            }
        }
        requestedSubscriptions.keys.retainAll(seen)
    }

    private fun receiveStreamWatch(data: ByteArray, from: String) {
        val message = runCatching { Json.parseToJsonElement(data.decodeToString()).jsonObject }.getOrNull() ?: return
        val own = publisher?.localParticipant?.identity?.value
        if (from.isEmpty() || own == null || message["owner"]?.jsonPrimitive?.contentOrNull != own) return
        if (message["watching"]?.jsonPrimitive?.booleanOrNull == true) streamWatchers.add(from) else streamWatchers.remove(from)
        refresh()
    }

    private fun refresh() {
        if (session == null) {
            if (participants.isNotEmpty()) participants = emptyList()
            return
        }
        val remotes = mutableMapOf<String, Pair<RemoteParticipant, LiveKitRoom>>()
        for (connection in connections.values.toSet()) {
            for ((identity, participant) in connection.remoteParticipants) remotes[identity.value] = participant to connection
        }
        val publisher = publisher
        val local = publisher?.localParticipant
        if (local != null && screenSharing && !local.isScreenShareEnabled) screenSharing = false
        if (screenSharing) streamWatchers.retainAll(remotes.keys) else streamWatchers.clear()
        applySubscriptions(remotes)
        val list = mutableListOf<CallParticipantInfo>()
        val seen = mutableSetOf<String>()
        val mediaUp = publisher?.state == LiveKitRoom.State.CONNECTED
        val before = participants.associateBy { it.identity }
        val now = System.currentTimeMillis()
        for (member in members) {
            if (!seen.add(member.identity)) continue
            val isLocal = member.isOwnDevice
            val remote = if (isLocal) null else remotes[member.identity]
            val participant: Participant? = if (isLocal) local else remote?.first
            if (isLocal || participant != null || !mediaUp) {
                if (participant != null) unconnectedSince.remove(member.identity)
            } else {
                val since = unconnectedSince.getOrPut(member.identity) { now }
                if (now - since >= STALE_MEMBER_MILLIS) continue
            }
            var info = CallParticipantInfo(
                member.identity,
                member.userId,
                member.deviceId,
                isLocal,
                displayName = member.displayName,
                avatarUrl = member.avatarUrl,
                isOwnOtherDevice = !isLocal && member.userId == client?.userId,
            )
            if (participant != null) {
                val videos = participant.trackPublications.values.filter { it.kind == Track.Kind.VIDEO && !it.muted }
                val screen = videos.firstOrNull { it.source == Track.Source.SCREEN_SHARE }
                info = info.copy(
                    connected = true,
                    speaking = participant.isSpeaking,
                    micMuted = !participant.isMicrophoneEnabled,
                    cameraTrack = videos.firstOrNull { it.source == Track.Source.CAMERA }?.track as? VideoTrack,
                    screenTrack = screen?.track as? VideoTrack,
                    screenShared = screen != null,
                    connection = if (isLocal) publisher else remote?.second,
                )
            }
            if (isLocal) info = info.copy(micMuted = !micPublished, connected = state == State.Joined)
            if (info.micMuted || (isLocal && !micEnabled)) info = info.copy(speaking = false)
            if (!isLocal && participant == null && !mediaUp) info = info.copy(connected = before[member.identity]?.connected == true)
            info = info.copy(
                handRaised = member.identity in raisedHands,
                reaction = reactions[member.identity],
                volume = userVolumes[member.userId] ?: 1.0,
                locallyMuted = member.userId in mutedUsers,
                watchingScreen = isLocal || member.identity in watchedScreens,
            )
            if (isLocal) info = info.copy(screenWatchers = members.filter { it.identity in streamWatchers }.map { it.userId }.distinct())
            list.add(info)

            // Deafen and per-person volume, applied only when they change
            if (participant is RemoteParticipant) {
                val target = if (deafened || info.locallyMuted) 0.0 else info.volume * outputVolume
                for (publication in participant.trackPublications.values) {
                    val track = publication.track as? RemoteAudioTrack ?: continue
                    val key = "${member.identity}|${publication.sid}"
                    if (appliedVolumes[key] != target) {
                        appliedVolumes[key] = target
                        track.setVolume(target)
                    }
                }
            }
        }
        unconnectedSince.keys.retainAll(seen)
        if (list != participants) participants = list
        notification.update(activityState)
    }

    private fun roomEvent(livekit: LiveKitRoom, event: RoomEvent) {
        when (event) {
            is RoomEvent.Reconnecting -> if (livekit === publisher) reportMedia(MediaState.reconnecting)
            is RoomEvent.Reconnected -> if (livekit === publisher) reportMedia(MediaState.connected)
            is RoomEvent.DataReceived -> {
                val from = event.participant?.identity?.value ?: ""
                if (event.topic == WatchTogether.TOPIC) watch?.receive(event.data, from)
                if (event.topic == STREAM_WATCH_TOPIC) receiveStreamWatch(event.data, from)
            }
            is RoomEvent.Disconnected -> {
                if (livekit !in connections.values) return
                val wasPublisher = livekit === publisher
                drop(livekit)
                val reason = event.reason.name
                if (wasPublisher) {
                    val session = session ?: return
                    scope.launch {
                        val again = runCatching { session.reportMedia(MediaState.disconnected, reason) }.getOrDefault(true)
                        if (again && this@CallManager.session === session) reconnect()
                    }
                } else {
                    log("media.subscriber", "disconnected reason=$reason")
                    syncRemoteConnections()
                }
                refresh()
            }
            else -> {}
        }
    }

    private fun reportMedia(media: MediaState) {
        val session = session ?: return
        scope.launch { runCatching { session.reportMedia(media) } }
    }

    /** What the ongoing-call notification shows */
    val activityState: CallActivityState
        get() {
            val speaker = participants.firstOrNull { it.speaking && !it.isLocal }
            return CallActivityState(
                micMuted = micMuted,
                deafened = deafened,
                othersSpeaking = speaker != null,
                speakerName = speaker?.let { it.displayName ?: it.userId },
                participantCount = participants.map { it.userId }.toSet().size.coerceAtLeast(1),
                ringing = ring == RingState.ringing,
            )
        }

    private fun startRinging() {
        ring = RingState.ringing
        ringback = CallSounds.loop("ringback")
    }

    fun ringAgain() {
        val session = session ?: return
        if (ring == RingState.ringing) return
        scope.launch {
            if (runCatching { session.ringAgain() }.getOrNull() == true) startRinging()
        }
    }

    private fun endRinging(result: RingState) {
        stopRinging()
        ring = result
        CallSounds.play(if (result == RingState.declined) "call_declined" else "call_no_answer")
    }

    private fun stopRinging() {
        ringback?.stop()
        ringback = null
    }

    /** Starts once per client, so the activity being recreated doesn't drop or repeat it */
    fun watchIncoming(client: WizardClient) {
        if (incomingClient === client && incomingWatch != null) return
        incomingWatch?.cancel()
        incomingClient = client
        incomingWatch = client.watchIncomingCalls { incomingEvent(it) }
    }

    fun stopWatchingIncoming() {
        incomingWatch?.cancel()
        incomingWatch = null
        incomingClient = null
        dismissIncoming()
    }

    private fun incomingEvent(event: IncomingCallEvent) {
        when (event) {
            is IncomingCallEvent.Ringing -> ringIn(event.call)
            is IncomingCallEvent.Ended -> ringEnded(event.call, event.reason)
        }
    }

    /** A ring in the room already showing replaces it; one in another room is ignored meanwhile */
    private fun ringIn(call: IncomingCall) {
        val shown = incoming
        if ((shown != null && shown.roomId != call.roomId) || isInCall(call.roomId)) return
        incoming = RingingCall(
            call.roomId,
            call.eventId,
            call.sender,
            call.senderName,
            voiceOnly = call.intent != "video",
            ring = call.ring,
        )
        if (call.ring) {
            if (ringtone == null) ringtone = CallSounds.loop("ringtone")
        } else {
            ringtone?.stop()
            ringtone = null
        }
    }

    private fun ringEnded(call: IncomingCall, reason: RingEnd) {
        if (incoming?.roomId == call.roomId) dismissIncoming()
        val missed = reason == RingEnd.callerLeft || reason == RingEnd.expired
        if (missed && call.ring) {
            MessageNotifier.shared.missedCall(call.roomId, call.senderName ?: call.sender, call.roomName)
        }
    }

    fun acceptIncoming(session: MatrixSession) {
        val call = incoming ?: return
        val room = session.roomList?.room(call.roomId) ?: return
        dismissIncoming()
        showCallScreen = true
        scope.launch { join(room, session, intent = if (call.voiceOnly) "audio" else "video", ring = false) }
    }

    fun declineIncoming(session: MatrixSession) {
        val call = incoming ?: return
        dismissIncoming()
        if (!call.ring) return
        scope.launch { runCatching { session.client?.declineCall(call.roomId, call.eventId) } }
    }

    fun dismissIncoming() {
        ringtone?.stop()
        ringtone = null
        incoming = null
    }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private suspend fun requestPermissions(permissions: List<String>) {
        val missing = permissions.filterNot(::hasPermission)
        if (missing.isEmpty()) return
        runCatching { permissionRequester?.invoke(missing.toTypedArray()) }
    }

    companion object {
        private const val TAG = "WZCALL"
        private const val STREAM_WATCH_TOPIC = "org.wizardchat.stream-watch"
        private const val REACTION_VISIBLE_MILLIS = 3000L
        private const val CONNECT_TIMEOUT_MILLIS = 30_000L
        private const val LEAVE_WAIT_MILLIS = 5000L
        private const val STALE_MEMBER_MILLIS = 20_000L
        private const val SUBSCRIBE_RETRY_MILLIS = 5000L

        val shared = CallManager()
    }
}
