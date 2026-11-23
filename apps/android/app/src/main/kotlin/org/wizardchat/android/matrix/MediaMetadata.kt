package org.wizardchat.android.matrix

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import androidx.annotation.RequiresApi
import android.graphics.drawable.Drawable
import android.graphics.Matrix
import android.os.Build
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.ByteBuffer
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.WizardClient

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

    suspend fun imageThumbnail(data: ByteArray, maxSize: Int = 800): Frame? = withContext(Dispatchers.Default) {
        val image = decodeImage(data, maxSize) ?: return@withContext null
        val scale = maxSize.toFloat() / maxOf(image.width, image.height)
        if (scale >= 1f) return@withContext null
        val scaled = Bitmap.createScaledBitmap(image, (image.width * scale).toInt(), (image.height * scale).toInt(), true)
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        Frame(out.toByteArray(), scaled.width, scaled.height)
    }

    suspend fun blurhash(data: ByteArray): String? {
        val pixels = withContext(Dispatchers.Default) {
            val image = decodeImage(data, BLURHASH_SIZE) ?: return@withContext null
            val scale = minOf(1f, BLURHASH_SIZE.toFloat() / maxOf(image.width, image.height))
            val small = Bitmap.createScaledBitmap(
                image.copy(Bitmap.Config.ARGB_8888, false),
                maxOf(1, (image.width * scale).toInt()),
                maxOf(1, (image.height * scale).toInt()),
                true,
            )
            val argb = IntArray(small.width * small.height).also { small.getPixels(it, 0, small.width, 0, 0, small.width, small.height) }
            val rgba = ByteArray(argb.size * 4)
            argb.forEachIndexed { i, c ->
                rgba[i * 4] = (c shr 16).toByte()
                rgba[i * 4 + 1] = (c shr 8).toByte()
                rgba[i * 4 + 2] = c.toByte()
                rgba[i * 4 + 3] = (c ushr 24).toByte()
            }
            Triple(rgba, small.width, small.height)
        } ?: return null
        return runCatching {
            WizardClient.encodeBlurhash(pixels.first, pixels.second.toLong(), pixels.third.toLong())
        }.getOrNull()
    }

    private const val BLURHASH_SIZE = 32
    private val blurhashes = LruCache<String, Bitmap>(200)

    suspend fun blurhashImage(hash: String): Bitmap? {
        blurhashes.get(hash)?.let { return it }
        val rgba = runCatching {
            WizardClient.decodeBlurhash(hash, BLURHASH_SIZE.toLong(), BLURHASH_SIZE.toLong())
        }.getOrNull()?.takeIf { it.size == BLURHASH_SIZE * BLURHASH_SIZE * 4 } ?: return null
        val argb = IntArray(BLURHASH_SIZE * BLURHASH_SIZE) { i ->
            val r = rgba[i * 4].toInt() and 0xFF
            val g = rgba[i * 4 + 1].toInt() and 0xFF
            val b = rgba[i * 4 + 2].toInt() and 0xFF
            (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        val bitmap = Bitmap.createBitmap(argb, BLURHASH_SIZE, BLURHASH_SIZE, Bitmap.Config.ARGB_8888)
        blurhashes.put(hash, bitmap)
        return bitmap
    }

    fun decodeImage(data: ByteArray, size: Int?): Bitmap? = runCatching {
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(data))) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val longest = maxOf(info.size.width, info.size.height)
                if (size != null && longest > size) {
                    val scale = size.toFloat() / longest
                    decoder.setTargetSize(maxOf(1, (info.size.width * scale).toInt()), maxOf(1, (info.size.height * scale).toInt()))
                } else {
                    decoder.setTargetSampleSize(sampleSize(longest, size))
                }
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(maxOf(bounds.outWidth, bounds.outHeight), size) }
            BitmapFactory.decodeByteArray(data, 0, data.size, options)?.let { upright(it, data) }
        }
    }.getOrNull()

    @RequiresApi(Build.VERSION_CODES.P)
    fun decodeDrawable(data: ByteArray, size: Int? = null): Drawable? = runCatching {
        ImageDecoder.decodeDrawable(ImageDecoder.createSource(ByteBuffer.wrap(data))) { decoder, info, _ ->
            decoder.setTargetSampleSize(sampleSize(maxOf(info.size.width, info.size.height), size))
        }
    }.getOrNull()

    private const val MAX_DECODED_SIZE = 2560

    private fun sampleSize(longest: Int, size: Int?): Int {
        val target = minOf(size ?: MAX_DECODED_SIZE, MAX_DECODED_SIZE)
        var sample = 1
        while (longest / (sample * 2) >= target) sample *= 2
        while (longest / sample > MAX_DECODED_SIZE) sample *= 2
        return sample
    }

    private fun upright(bitmap: Bitmap, data: ByteArray): Bitmap {
        val orientation = runCatching {
            ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> matrix.apply { setRotate(90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> matrix.apply { setRotate(-90f); postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
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
