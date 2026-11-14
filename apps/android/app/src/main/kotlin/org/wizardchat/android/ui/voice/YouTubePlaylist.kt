package org.wizardchat.android.ui.voice

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.matrix.rtc.YouTubeLink

class PlaylistUnavailable : Exception()

private const val PLAYLIST_TIMEOUT_MS = 20_000L
private val listIdPattern = Regex("^[A-Za-z0-9_-]{10,64}$")

suspend fun loadYouTubePlaylist(context: Context, listId: String): List<String> {
    if (!listIdPattern.matches(listId)) throw PlaylistUnavailable()
    return withContext(Dispatchers.Main) {
        withTimeoutOrNull(PLAYLIST_TIMEOUT_MS) { listPlaylist(context, listId) }
    } ?: throw PlaylistUnavailable()
}

suspend fun loadYouTubePlaylist(context: Context, link: YouTubeLink): List<String> {
    val ids = loadYouTubePlaylist(context, link.listId ?: throw PlaylistUnavailable())
    val from = link.videoId?.let(ids::indexOf) ?: -1
    return if (from > 0) ids.drop(from) + ids.take(from) else ids
}

@SuppressLint("SetJavaScriptEnabled")
private suspend fun listPlaylist(context: Context, listId: String): List<String> = suspendCancellableCoroutine { continuation ->
    val main = Handler(Looper.getMainLooper())
    val webView = WebView(context)
    var finished = false
    fun cleanup() {
        if (finished) return
        finished = true
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeJavascriptInterface("ytAndroid")
        webView.destroy()
    }
    val bridge = PlaylistBridge { message ->
        main.post {
            if (finished) return@post
            when ((message["type"] as? JsonPrimitive)?.content) {
                "playlist" -> {
                    val ids = (message["ids"] as? JsonArray)
                        ?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
                        ?.filter(WatchTogether::isVideoId)
                        .orEmpty()
                    cleanup()
                    if (ids.isNotEmpty()) continuation.resume(ids) else continuation.resumeWithException(PlaylistUnavailable())
                }
                "error" -> {
                    cleanup()
                    continuation.resumeWithException(PlaylistUnavailable())
                }
            }
        }
    }
    continuation.invokeOnCancellation { main.post { cleanup() } }
    webView.apply {
        layoutParams = FrameLayout.LayoutParams(PLAYER_WIDTH, PLAYER_HEIGHT)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = true
        isFocusable = false
        isClickable = false
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        addJavascriptInterface(bridge, "ytAndroid")
    }
    val host = context.findActivity()?.window?.decorView as? ViewGroup
    if (host != null) {
        webView.translationX = -10_000f
        host.addView(webView)
    } else {
        webView.measure(
            View.MeasureSpec.makeMeasureSpec(PLAYER_WIDTH, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(PLAYER_HEIGHT, View.MeasureSpec.EXACTLY),
        )
        webView.layout(0, 0, PLAYER_WIDTH, PLAYER_HEIGHT)
    }
    webView.loadDataWithBaseURL("https://app.wizardchat.org/", playlistHtml(listId), "text/html", "utf-8", null)
}

private class PlaylistBridge(private val onMessage: (JsonObject) -> Unit) {
    @JavascriptInterface
    fun postMessage(json: String) {
        runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull()?.let(onMessage)
    }
}

private const val PLAYER_WIDTH = 320
private const val PLAYER_HEIGHT = 180

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun playlistHtml(listId: String): String = """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>html,body,#player{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
    </head><body><div id="player"></div><script>
    (function(){
      function post(m){ try{ window.ytAndroid.postMessage(JSON.stringify(m)); }catch(e){} }
      window.onYouTubeIframeAPIReady=function(){
        var tries=0;
        var lister=new YT.Player('player',{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
          playerVars:{listType:'playlist',list:'$listId',autoplay:0},
          events:{
            onReady:function(){
              var poll=setInterval(function(){
                var ids=lister.getPlaylist?lister.getPlaylist():null;
                tries++;
                if((ids&&ids.length)||tries>40){ clearInterval(poll); post({type:'playlist',ids:ids||[]}); }
              },250);
            },
            onError:function(e){ post({type:'error',code:e.data}); }
          }});
      };
      var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api';
      s.onerror=function(){ post({type:'error',code:-1}); };
      document.head.appendChild(s);
    })();
    </script></body></html>
""".trimIndent()
