package org.wizardchat.android.ui.voice

import org.wizardchat.android.matrix.MediaMetadata
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.wizardchat.android.matrix.rtc.WatchTogether
import org.wizardchat.android.ui.composer.download
import org.wizardchat.android.ui.theme.theme

private val videoTitles = ConcurrentHashMap<String, String>()
private val thumbnails = LruCache<String, ImageBitmap>(120)

private suspend fun fetchVideoTitle(videoId: String): String? {
    videoTitles[videoId]?.let { return it }
    val watch = URLEncoder.encode(WatchTogether.watchUrl(videoId), "UTF-8")
    val data = download("https://www.youtube.com/oembed?url=$watch&format=json") ?: return null
    val title = withContext(Dispatchers.Default) {
        runCatching { Json.parseToJsonElement(data.decodeToString()).jsonObject["title"] as? JsonPrimitive }
            .getOrNull()
            ?.takeIf { it.isString }
            ?.content
    } ?: return null
    videoTitles[videoId] = title
    return title
}

@Composable
internal fun rememberVideoTitle(videoId: String): String? {
    var title by remember(videoId) { mutableStateOf(videoTitles[videoId]) }
    LaunchedEffect(videoId) {
        if (title == null) title = fetchVideoTitle(videoId) ?: fetchVideoTitle(videoId)
    }
    return title
}

@Composable
internal fun VideoThumbnail(videoId: String, modifier: Modifier = Modifier) {
    var image by remember(videoId) { mutableStateOf(thumbnails.get(videoId)) }
    LaunchedEffect(videoId) {
        if (image != null) return@LaunchedEffect
        val data = download(WatchTogether.thumbnailUrl(videoId)) ?: return@LaunchedEffect
        val bitmap = withContext(Dispatchers.Default) {
            MediaMetadata.decodeImage(data, 640)?.asImageBitmap()
        } ?: return@LaunchedEffect
        thumbnails.put(videoId, bitmap)
        image = bitmap
    }
    Box(modifier.background(theme.fill)) {
        image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}
