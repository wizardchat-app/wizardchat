package org.wizardchat.android.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.ByteBuffer
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication

/** Pixel sizes and durations of local files before they're sent */
object MediaMetadata {
    data class Video(val duration: Double?, val size: Pair<Int, Int>?)

    suspend fun imageSize(uri: Uri): Pair<Int, Int>? = withContext(Dispatchers.IO) {
        runCatching {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            WizardApplication.instance.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return@runCatching null
            val rotated = WizardApplication.instance.contentResolver.openInputStream(uri)?.use(::isRotated) ?: false
            if (rotated) options.outHeight to options.outWidth else options.outWidth to options.outHeight
        }.getOrNull()
    }

    class ShareableImage(val data: ByteArray, val mimetype: String, val ext: String, val size: Pair<Int, Int>?)

    fun webImageType(data: ByteArray): Pair<String, String>? {
        fun at(index: Int, vararg bytes: Int) = data.size >= index + bytes.size && bytes.indices.all { data[index + it] == bytes[it].toByte() }
        return when {
            at(0, 0xFF, 0xD8, 0xFF) -> "image/jpeg" to "jpg"
            at(0, 0x89, 0x50, 0x4E, 0x47) -> "image/png" to "png"
            at(0, 0x47, 0x49, 0x46) -> "image/gif" to "gif"
            at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50) -> "image/webp" to "webp"
            else -> null
        }
    }

    suspend fun shareableImage(data: ByteArray): ShareableImage? = withContext(Dispatchers.Default) {
        webImageType(data)?.let { (mimetype, ext) -> return@withContext ShareableImage(data, mimetype, ext, null) }
        runCatching {
            val bitmap = if (Build.VERSION.SDK_INT >= 28) {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(data))) { decoder, _, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                }
            } else {
                BitmapFactory.decodeByteArray(data, 0, data.size)
            } ?: return@runCatching null
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            ShareableImage(out.toByteArray(), "image/jpeg", "jpg", bitmap.width to bitmap.height)
        }.getOrNull()
    }

    fun isRotated(stream: InputStream): Boolean = runCatching {
        ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) in 5..8
    }.getOrDefault(false)

    class Frame(val data: ByteArray, val width: Int, val height: Int)

    suspend fun videoFrame(uri: Uri, maxSize: Int = 800): Frame? = withContext(Dispatchers.IO) {
        retrieve(uri) { r ->
            val frame = r.getFrameAtTime(0) ?: return@retrieve null
            val scale = minOf(1f, maxSize.toFloat() / maxOf(frame.width, frame.height))
            val scaled = Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt(), (frame.height * scale).toInt(), true)
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
            Frame(out.toByteArray(), scaled.width, scaled.height)
        }
    }

    suspend fun video(uri: Uri): Video = withContext(Dispatchers.IO) {
        retrieve(uri) { r ->
            val duration = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { it / 1000.0 }
            val width = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            val size = if (width != null && height != null) {
                if (rotation % 180 != 0) height to width else width to height
            } else {
                null
            }
            Video(duration, size)
        } ?: Video(null, null)
    }

    suspend fun duration(uri: Uri): Double? = withContext(Dispatchers.IO) {
        retrieve(uri) { it.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { ms -> ms / 1000.0 } }
    }

    suspend fun temporaryCopy(data: ByteArray, filename: String): File = withContext(Dispatchers.IO) {
        val dir = File(WizardApplication.instance.cacheDir, UUID.randomUUID().toString())
        dir.mkdirs()
        File(dir, filename).also { it.writeBytes(data) }
    }

    private fun <T> retrieve(uri: Uri, read: (MediaMetadataRetriever) -> T): T? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(WizardApplication.instance, uri)
            read(retriever)
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }
}
