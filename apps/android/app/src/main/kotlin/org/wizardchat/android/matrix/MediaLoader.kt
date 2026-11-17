package org.wizardchat.android.matrix

import android.graphics.Bitmap
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.LruCache
import java.io.File
import java.net.URLEncoder
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.MediaSource
import org.wizardchat.core.WizardClient

/** Downloads (and decrypts) media through the core and keeps decoded images in memory */
class MediaLoader(val client: WizardClient) {
    private val cache = object : LruCache<String, Bitmap>(64 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val animatedData = object : LruCache<String, ByteArray>(32 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray) = value.size
    }
    private val inFlight = HashMap<String, CompletableDeferred<Bitmap?>>()
    private val files = File(WizardApplication.instance.cacheDir, "media")

    fun cachedThumbnail(key: String): Bitmap? = cache.get(key)

    fun store(image: Bitmap, key: String) {
        cache.put(key, image)
    }

    private val thumbnailSizes = HashMap<String, Int>()

    suspend fun thumbnail(url: String, size: Int = 96): Bitmap? {
        val pixels = standardSize(size)
        val cached = cache.get(url)
        if (cached != null && (thumbnailSizes[url] ?: 0) >= pixels) return cached
        val image = load("$url|$pixels", pixels) { it.thumbnail(url, pixels.toLong(), pixels.toLong(), if (pixels == 96) true else null) }
        if (image != null && (thumbnailSizes[url] ?: 0) < pixels) {
            store(image, url)
            thumbnailSizes[url] = pixels
        }
        return image ?: cache.get(url)
    }

    suspend fun image(source: MediaSource, size: Int?, serverThumbnail: Boolean = true): Bitmap? =
        load("${key(source)}|${size ?: 0}", size) {
            val thumbnail = size?.takeIf { serverThumbnail }?.toLong()
            it.media(source, thumbnail, thumbnail)
        }

    /** A playing GIF/WebP (Android 9+); null if the image isn't animated */
    suspend fun animated(source: MediaSource): Drawable? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        val key = key(source)
        val data = animatedData.get(key) ?: runCatching { client.media(source) }.getOrNull() ?: return null
        // Each view gets its own drawable: one shared instance only animates in the view that took it last
        val drawable = withContext(Dispatchers.Default) {
            MediaMetadata.decodeDrawable(data)
        } ?: return null
        if (drawable !is AnimatedImageDrawable) return null
        animatedData.put(key, data)
        return drawable
    }

    /** The decrypted file on disk, e.g. to share or open in another app */
    suspend fun file(source: MediaSource, filename: String): File {
        val folder = File(files, URLEncoder.encode(key(source), "UTF-8"))
        val file = File(folder, filename.replace('/', '-').trim().ifEmpty { "file" })
        if (file.exists()) return file
        val data = client.media(source)
        withContext(Dispatchers.IO) {
            folder.mkdirs()
            file.writeBytes(data)
        }
        return file
    }

    private suspend fun load(key: String, size: Int?, fetch: suspend (WizardClient) -> ByteArray): Bitmap? {
        cache.get(key)?.let { return it }
        inFlight[key]?.let { return it.await() }
        val deferred = CompletableDeferred<Bitmap?>()
        inFlight[key] = deferred
        val image = runCatching { fetch(client) }.getOrNull()?.let { data ->
            withContext(Dispatchers.Default) { MediaMetadata.decodeImage(data, size) }
        }
        inFlight.remove(key)
        if (image != null) store(image, key)
        deferred.complete(image)
        return image
    }

    companion object {
        fun standardSize(size: Int): Int = listOf(96, 320, 640, 800).firstOrNull { it >= size } ?: 800

        fun key(source: MediaSource): String {
            val obj = source as? JsonObject ?: return source.toString()
            return obj["url"]?.jsonPrimitive?.content
                ?: (obj["file"] as? JsonObject)?.get("url")?.jsonPrimitive?.content
                ?: source.toString()
        }
    }
}
