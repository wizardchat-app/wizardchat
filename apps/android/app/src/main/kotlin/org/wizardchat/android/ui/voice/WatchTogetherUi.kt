package org.wizardchat.android.ui.voice

import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import org.wizardchat.android.matrix.rtc.WatchState
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.ui.BarTextButton
import org.wizardchat.android.ui.ConfirmDialog
import org.wizardchat.android.ui.GroupedRow
import org.wizardchat.android.ui.GroupedSection
import org.wizardchat.android.ui.PhIcon
import org.wizardchat.android.ui.PhWeight
import org.wizardchat.android.ui.RowDivider
import org.wizardchat.android.ui.WizardSheet
import org.wizardchat.android.ui.theme.theme
import org.wizardchat.android.ui.theme.wizardFont
import org.wizardchat.android.ui.tr
import org.wizardchat.android.ui.trPlural
import org.wizardchat.core.RoomSummary
import org.wizardchat.tokens.WZ

/** The YouTube IFrame player in a WebView, kept in sync with the shared state */
@Composable
private fun YouTubeSyncPlayer(watch: WatchTogether, state: WatchState, onFailed: () -> Unit, modifier: Modifier = Modifier) {
    val coordinator = remember { YouTubeCoordinator(watch) }
    SideEffect {
        coordinator.onFailed = onFailed
        if (coordinator.state != null && coordinator.state != state) {
            coordinator.state = state
            coordinator.apply()
        }
    }
    LaunchedEffect(coordinator) {
        while (isActive) {
            delay(TICK_MS)
            coordinator.tick()
        }
    }
    AndroidView(
        factory = { context ->
            coordinator.state = state
            coordinator.makeView(context, state)
        },
        onRelease = { view ->
            coordinator.webView = null
            view.removeJavascriptInterface("ytAndroid")
            view.destroy()
        },
        modifier = modifier,
    )
}

private const val TICK_MS = 500L

/** Mirrors the web player: holds everyone while you buffer, nudges the speed to catch up, seeks only when far off */
private class YouTubeCoordinator(private val watch: WatchTogether) {
    private enum class YT(val raw: Int) {
        unstarted(-1), ended(0), playing(1), paused(2), buffering(3), cued(5);

        companion object {
            fun of(raw: Int?): YT? = entries.firstOrNull { it.raw == raw }
        }
    }

    private data class Sample(val time: Double, val at: Long, val playing: Boolean)
    private data class Command(val playing: Boolean, val seekTo: Double?, val until: Long)

    var webView: WebView? = null
    var state: WatchState? = null
    var onFailed: (() -> Unit)? = null
    private var ready = false
    private var lastState = YT.unstarted
    private var time = 0.0
    private var duration = 0.0
    private var rate = 1.0
    private var reportsRate = false
    private var loaded: Double? = null
    private var playerState = YT.unstarted
    private var videoId: String? = null
    private var command: Command? = null
    private var steady: Sample? = null
    private var inSync = false
    private var requestedRate = 1.0
    private var bufferingSince: Long? = null
    private var holdCooldownUntil = 0L
    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    fun makeView(context: Context, state: WatchState): WebView = WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        settings.javaScriptEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.domStorageEnabled = true
        setBackgroundColor(android.graphics.Color.BLACK)
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        addJavascriptInterface(Bridge(), "ytAndroid")
        webView = this
        loadDataWithBaseURL(
            "https://app.wizardchat.org/",
            html(state.videoId, state.playing, state.expectedPosition()),
            "text/html",
            "utf-8",
            null,
        )
    }

    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(json: String) {
            val message = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull() ?: return
            main.post { received(message) }
        }
    }

    private fun run(command: String) {
        webView?.evaluateJavascript("window.wz && wz.$command", null)
    }

    private fun command(playing: Boolean, seekTo: Double?) {
        command = Command(playing, seekTo, System.currentTimeMillis() + COMMAND_TIMEOUT_MS)
        steady = null
    }

    private fun pending(now: Long = System.currentTimeMillis()): Command? = command?.takeIf { now < it.until }

    private fun setRate(next: Double) {
        if (requestedRate == next) return
        requestedRate = next
        run("rate($next)")
    }

    private fun seek(seconds: Double) {
        time = seconds
        run("seek($seconds)")
    }

    fun apply() {
        val s = state ?: return
        if (!ready) return
        val target = s.expectedPosition()
        val current = videoId
        if (current != null && current != s.videoId) {
            command(s.playing, target)
            videoId = s.videoId
            time = target
            run(if (s.playing) "load('${s.videoId}', $target)" else "cue('${s.videoId}', $target)")
            return
        }
        val running = playerState == YT.playing || playerState == YT.buffering
        val seekTo = if (abs(time - target) > SEEK_FALLBACK) target else null
        if (seekTo != null || s.playing != running) command(s.playing, seekTo)
        if (seekTo != null) seek(seekTo)
        if (s.playing && !running) run("play()")
        if (!s.playing && running) run("pause()")
        setRate(s.rate)
    }

    private fun received(message: JsonObject) {
        when (message.text("type")) {
            "ready" -> {
                ready = true
                apply()
            }
            "status" -> {
                time = message.number("time") ?: time
                duration = message.number("duration") ?: duration
                playerState = YT.of(message.number("state")?.toInt()) ?: playerState
                videoId = message.text("videoId") ?: videoId
                message.number("rate")?.let {
                    rate = it
                    reportsRate = true
                }
                loaded = message.number("loaded") ?: loaded
            }
            "state" -> {
                val newState = YT.of((message["state"] as? JsonPrimitive)?.intOrNull) ?: YT.unstarted
                message.number("time")?.let { time = it }
                playerState = newState
                handle(newState)
            }
            "rate" -> message.number("rate")?.let { rateChanged(it) }
            "error" -> onFailed?.invoke()
        }
    }

    /** Your own play/pause in the player becomes the shared state (unless it's us applying someone else's change) */
    private fun handle(newState: YT) {
        val previous = lastState
        lastState = newState
        val s = state ?: return
        if (newState == YT.buffering) {
            if (bufferingSince == null) bufferingSince = System.currentTimeMillis()
            return
        }
        bufferingSince = null
        val pending = pending()
        when (newState) {
            YT.playing -> {
                if (pending?.playing == true) command = null
                val firstStart = previous == YT.unstarted || previous == YT.cued
                if (firstStart && abs(time - s.expectedPosition()) > SEEK_FALLBACK) {
                    command(s.playing, s.expectedPosition())
                    seek(s.expectedPosition())
                    if (!s.playing) run("pause()")
                    return
                }
                if (!s.playing && pending == null) watch.update(true, time)
            }
            YT.paused -> {
                if (pending != null && !pending.playing) command = null
                if (s.playing && pending == null) watch.update(false, time)
            }
            YT.ended -> if (s.playing) watch.update(false, duration)
            else -> {}
        }
    }

    private fun rateChanged(next: Double) {
        rate = next
        val s = state ?: return
        if (next == requestedRate || requestedRate != s.rate) return
        requestedRate = next
        watch.updateRate(next, time)
    }

    fun tick() {
        val s = state ?: return
        if (!ready) return
        val now = System.currentTimeMillis()
        val myId = watch.ownId
        val pending = pending(now)

        val bufferingFor = bufferingSince?.let { now - it } ?: 0L
        if (s.playing && s.waitingFor == null && bufferingFor > BUFFER_WAIT_MS && now > holdCooldownUntil) {
            holdCooldownUntil = now + HOLD_COOLDOWN_MS
            watch.update(false, time, waitingFor = myId)
            return
        }
        if (!s.playing && s.waitingFor == myId && playerState != YT.buffering) {
            val fraction = loaded
            val isReady = fraction == null || duration <= 0 || fraction >= 0.99 || fraction * duration >= s.position + BUFFER_AHEAD
            if (isReady) {
                holdCooldownUntil = now + HOLD_COOLDOWN_MS
                watch.update(true, s.position)
            }
            return
        }

        val isSteady = playerState == YT.playing || playerState == YT.paused
        if (pending != null && isSteady && pending.playing == (playerState == YT.playing) &&
            (pending.seekTo == null || abs(time - pending.seekTo) <= SEEK_FALLBACK)
        ) {
            command = null
        }
        if (command != null || !isSteady) {
            steady = null
            return
        }

        val target = s.expectedPosition()
        val offBy = time - target
        val base = steady
        steady = Sample(time, now, playerState == YT.playing)
        if (base != null && inSync) {
            val maxAdvance = if (base.playing) (now - base.at) / 1000.0 * rate else 0.0
            if (time < base.time - SEEK_JUMP || time > base.time + maxAdvance + SEEK_JUMP) {
                inSync = true
                watch.update(playerState == YT.playing, time)
                return
            }
        }
        inSync = abs(offBy) <= SEEK_FALLBACK

        if (s.playing && playerState == YT.playing) {
            val canNudge = reportsRate && s.rate == 1.0
            when {
                abs(offBy) <= IN_SYNC -> setRate(s.rate)
                canNudge && abs(offBy) <= NUDGE_MAX -> setRate(if (offBy < 0) 1 + NUDGE_FACTOR else 1 - NUDGE_FACTOR)
                abs(offBy) > (if (canNudge) NUDGE_MAX else SEEK_FALLBACK) -> {
                    setRate(s.rate)
                    command(true, target)
                    seek(target)
                }
            }
        } else if (!s.playing && playerState == YT.paused && abs(offBy) > IN_SYNC) {
            command(false, target)
            seek(target)
        }
    }

    companion object {
        private const val IN_SYNC = 0.3
        private const val NUDGE_MAX = 3.0
        private const val SEEK_FALLBACK = 1.5
        private const val NUDGE_FACTOR = 0.25
        private const val SEEK_JUMP = 1.5
        private const val COMMAND_TIMEOUT_MS = 8000L
        private const val BUFFER_WAIT_MS = 2000L
        private const val BUFFER_AHEAD = 4.0
        private const val HOLD_COOLDOWN_MS = 8000L

        fun html(videoId: String, autoplay: Boolean, start: Double): String = """
            <!doctype html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
            <meta name="referrer" content="strict-origin-when-cross-origin">
            <style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
            </head><body><div id="player"></div><script>
            (function(){
              var player=null, ready=false;
              function post(m){ try{ window.ytAndroid.postMessage(JSON.stringify(m)); }catch(e){} }
              function status(){ if(!ready) return; var d=player.getVideoData?player.getVideoData():{};
                post({type:'status',time:player.getCurrentTime(),state:player.getPlayerState(),
                      duration:player.getDuration(),videoId:d&&d.video_id,
                      rate:player.getPlaybackRate?player.getPlaybackRate():1,
                      loaded:player.getVideoLoadedFraction?player.getVideoLoadedFraction():null}); }
              window.wz={
                play:function(){ player.playVideo(); },
                pause:function(){ player.pauseVideo(); },
                seek:function(s){ player.seekTo(s,true); },
                rate:function(r){ player.setPlaybackRate(r); },
                load:function(id,s){ player.loadVideoById({videoId:id,startSeconds:s}); },
                cue:function(id,s){ player.cueVideoById({videoId:id,startSeconds:s}); }
              };
              var ccOff=null; function captionsOff(){ var d=player.getVideoData?player.getVideoData():null, id=d&&d.video_id; if(!id||id===ccOff) return; ccOff=id; try{ player.unloadModule('captions'); player.unloadModule('cc'); }catch(e){} }
              window.onYouTubeIframeAPIReady=function(){
                player=new YT.Player('player',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
                  videoId:'$videoId',
                  playerVars:{autoplay:${if (autoplay) 1 else 0},start:${start.toInt()},playsinline:1,rel:0,cc_load_policy:0},
                  events:{
                    onReady:function(){ ready=true; status(); post({type:'ready'}); },
                    onStateChange:function(e){ if(e.data===1) captionsOff(); post({type:'state',state:e.data,time:player.getCurrentTime()}); status(); },
                    onPlaybackRateChange:function(e){ status(); post({type:'rate',rate:e.data}); },
                    onError:function(e){ post({type:'error',code:e.data}); }
                  }});
              };
              var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api';
              s.onerror=function(){ post({type:'error',code:-1}); };
              document.head.appendChild(s);
              setInterval(status,250);
            })();
            </script></body></html>
        """.trimIndent()
    }
}

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.number(key: String): Double? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull

/** The shared video in the call, or the invitation to watch it */
@Composable
internal fun WatchTogetherTile(watch: WatchTogether, room: RoomSummary, compact: Boolean, modifier: Modifier = Modifier, onFocus: () -> Unit) {
    val state = watch.state ?: return
    val starterName = rememberMemberProfile(state.startedBy, room.id).name ?: state.startedBy
    Box(modifier.clip(RoundedCornerShape(WZ.Radius.xl))) {
        if (watch.watchingVideoId == state.videoId) {
            WatchPlayer(watch, state, compact, onFocus, room.id)
        } else {
            WatchInvite(watch, state, starterName, compact)
            if (!compact) WatchViewers(watch, room.id, Modifier.align(Alignment.TopStart).padding(WZ.Space.space4))
        }
    }
}

@Composable
private fun WatchPlayer(watch: WatchTogether, state: WatchState, compact: Boolean, onFocus: () -> Unit, roomId: String) {
    val uriHandler = LocalUriHandler.current
    var failed by remember(state.videoId) { mutableStateOf(false) }
    var confirmStop by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        YouTubeSyncPlayer(
            watch,
            state,
            onFailed = { failed = true },
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        )
        if (failed) {
            Text(
                tr("call.watchTogether.videoUnplayable"),
                Modifier.padding(WZ.Space.space6),
                style = wizardFont(if (compact) WZ.FontSize.xs else WZ.FontSize.md, FontWeight.SemiBold),
                color = Color.White,
                textAlign = TextAlign.Center,
            )
        }
        val waitingFor = state.waitingFor?.takeIf { it != watch.ownId }
        val waitingName = rememberMemberProfile(waitingFor, roomId).name ?: waitingFor
        if (waitingName != null && !failed) {
            Text(
                tr("call.watchTogether.waitingFor", waitingName),
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(WZ.Space.space6)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.7f))
                    .padding(horizontal = WZ.Space.space5, vertical = WZ.Space.space3),
                style = wizardFont(if (compact) WZ.FontSize.xs else WZ.FontSize.sm),
                color = Color.White,
                maxLines = 1,
            )
        }
        if (compact) {
            Box(Modifier.fillMaxSize().clickable(onClick = onFocus))
        } else {
            Row(
                Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(WZ.Space.space4),
                horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconLabel(
                        tr("call.watchTogether.badge"),
                        "youtube-logo",
                        color = Color.White,
                        size = WZ.FontSize.sm,
                        weight = FontWeight.SemiBold,
                        iconWeight = PhWeight.fill,
                        modifier = Modifier
                            .weight(1f, fill = false)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.45f))
                            .padding(horizontal = WZ.Space.space4, vertical = WZ.Space.space2),
                    )
                    WatchViewers(watch, roomId)
                }
                SmallButton("arrow-square-out", tr("call.watchTogether.openOnYouTube")) {
                    runCatching { uriHandler.openUri(WatchTogether.watchUrl(state.videoId, state.expectedPosition())) }
                }
                SmallButton("eye-slash", tr("call.watchTogether.stopJustMe")) { watch.watchingVideoId = null }
                SmallButton("x", tr("call.watchTogether.stopForEveryone"), tint = theme.danger) { confirmStop = true }
            }
        }
    }
    if (confirmStop) {
        ConfirmDialog(
            title = tr("call.watchTogether.stopConfirm"),
            confirmLabel = tr("call.watchTogether.stopForEveryone"),
            onConfirm = { watch.stop() },
            onDismiss = { confirmStop = false },
        )
    }
}

@Composable
private fun WatchInvite(watch: WatchTogether, state: WatchState, starterName: String, compact: Boolean) {
    Column(
        Modifier
            .fillMaxSize()
            .background(theme.bgTertiary)
            .padding(if (compact) WZ.Space.space3 else WZ.Space.space6),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(if (compact) WZ.Space.space3 else WZ.Space.space5, Alignment.CenterVertically),
    ) {
        PhIcon("youtube-logo", PhWeight.fill, size = if (compact) WZ.SizeIcon.lg else WZ.SizeIcon.xxl, tint = theme.textPrimary)
        if (!compact) {
            Text(
                tr("call.watchTogether.isWatching", starterName),
                style = wizardFont(WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textPrimary,
                textAlign = TextAlign.Center,
            )
            if (!watch.consent) {
                Text(tr("call.watchTogether.consentNote"), style = wizardFont(WZ.FontSize.sm), color = theme.textMuted, textAlign = TextAlign.Center)
            }
        }
        Row(
            Modifier
                .clip(CircleShape)
                .background(theme.accent)
                .clickable {
                    watch.consent = true
                    watch.watchingVideoId = state.videoId
                }
                .padding(
                    horizontal = if (compact) WZ.Space.space4 else WZ.Space.space6,
                    vertical = if (compact) WZ.Space.space2 else WZ.Space.space4,
                ),
            horizontalArrangement = Arrangement.spacedBy(WZ.Space.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PhIcon("play", PhWeight.fill, size = WZ.SizeIcon.sm, tint = theme.textOnAccent)
            Text(
                tr("call.watchTogether.watch"),
                style = wizardFont(if (compact) WZ.FontSize.xs else WZ.FontSize.md, FontWeight.SemiBold),
                color = theme.textOnAccent,
            )
        }
    }
}

@Composable
private fun WatchViewers(watch: WatchTogether, roomId: String, modifier: Modifier = Modifier) {
    val viewers = watch.viewers
    if (viewers.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    val label = trPlural("call.streamViewers", viewers.size, viewers.size)
    Box(modifier) {
        Row(
            Modifier
                .height(28.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable { open = true }
                .padding(horizontal = WZ.Space.space4)
                .clearAndSetSemantics { contentDescription = label },
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PhIcon("eye", size = 14.dp, tint = Color.White)
            Text("${viewers.size}", style = wizardFont(WZ.FontSize.sm, FontWeight.Bold), color = Color.White)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = theme.bgTertiary) {
            viewers.forEach { userId ->
                val name = rememberMemberProfile(userId, roomId).name ?: userId
                DropdownMenuItem(
                    text = { Text(name, style = wizardFont(WZ.FontSize.lg), color = theme.textPrimary) },
                    leadingIcon = { PhIcon("eye", tint = theme.textMuted) },
                    onClick = { open = false },
                )
            }
        }
    }
}

@Composable
private fun SmallButton(icon: String, label: String, tint: Color = Color.White, onClick: () -> Unit) {
    Box(
        Modifier
            .size(WZ.Space.space9)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon(icon, PhWeight.regular, size = WZ.SizeIcon.sm, tint = tint)
    }
}

/** Asks for a YouTube link to watch together */
@Composable
internal fun WatchTogetherStartSheet(watch: WatchTogether, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var link by remember { mutableStateOf("") }
    var invalid by remember { mutableStateOf(false) }
    val clipboard = remember { context.getSystemService(ClipboardManager::class.java) }
    val canPaste = clipboard?.hasPrimaryClip() == true

    fun start() {
        val id = WatchTogether.parseVideoId(link)
        if (id == null) {
            invalid = true
            return
        }
        watch.start(id)
        onDismiss()
    }

    WizardSheet(onDismiss) {
        Box(Modifier.fillMaxWidth().height(WZ.Space.space11).padding(horizontal = WZ.Space.space3)) {
            Box(Modifier.align(Alignment.CenterStart)) { BarTextButton(tr("common.cancel"), onDismiss) }
            Text(
                tr("call.watchTogether.watch"),
                Modifier.align(Alignment.Center),
                style = wizardFont(WZ.FontSize.lg, FontWeight.SemiBold),
                color = theme.textPrimary,
            )
            Box(Modifier.align(Alignment.CenterEnd)) {
                BarTextButton(tr("call.watchTogether.start"), ::start, enabled = link.isNotBlank(), bold = true)
            }
        }
        Column(Modifier.fillMaxWidth().background(theme.groupedBackground).imePadding().navigationBarsPadding().padding(bottom = WZ.Space.space8)) {
            GroupedSection(header = tr("call.watchTogether.linkLabel")) {
                TextField(
                    value = link,
                    onValueChange = {
                        link = it
                        invalid = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("https://www.youtube.com/watch?v=...", color = theme.textMuted, style = wizardFont(WZ.FontSize.lg)) },
                    textStyle = wizardFont(WZ.FontSize.lg).copy(color = theme.textPrimary),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { start() }),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        cursorColor = theme.accent,
                    ),
                )
                if (canPaste) {
                    RowDivider()
                    GroupedRow(
                        tr("call.watchTogether.pasteLink"),
                        icon = "clipboard-text",
                        iconTint = theme.accent,
                        titleColor = theme.accent,
                        onClick = {
                            clipboard?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()?.let {
                                link = it
                                invalid = false
                            }
                        },
                    )
                }
            }
            Text(
                if (invalid) tr("call.watchTogether.invalidLink") else tr("call.watchTogether.joinNote"),
                Modifier.padding(start = WZ.Space.space6 + WZ.Space.space5, end = WZ.Space.space6 + WZ.Space.space5, top = WZ.Space.space3),
                style = wizardFont(WZ.FontSize.sm),
                color = if (invalid) theme.error else theme.textMuted,
            )
        }
    }
}
