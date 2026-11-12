package org.wizardchat.android.matrix.rtc

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaDataSource
import android.media.MediaPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.wizardchat.android.WizardApplication
import org.wizardchat.core.SoundboardSound
import org.wizardchat.core.WizardClient

data class SoundboardFlash(val emoji: String, val key: Int)

class Soundboard(private val client: WizardClient, private val scope: CoroutineScope) {
    data class Play(val url: String, val shortcode: String?, val emoji: String?)

    companion object {
        const val TOPIC = "moe.crafty.soundboard"
        const val COOLDOWN_MS = 1500L
        private const val MAX_MESSAGE_BYTES = 1024
        private const val MAX_SHORTCODE_BYTES = 100
        private const val MAX_DURATION_MS = 15_000
        private const val MIN_INTERVAL_MS = 400L
        private const val MAX_PLAYING = 3
        private const val VOLUME_KEY = "voice.soundboardVolume"
        private val EMOJI = mapOf(
            "applause" to "👏", "laugh" to "😂", "rimshot" to "🥁", "drumroll" to "🪘",
            "tada" to "🎉", "airhorn" to "📯", "crickets" to "🦗", "sad_trombone" to "🎺",
        )
        private val defaults get() = WizardApplication.instance.getSharedPreferences("calls", Context.MODE_PRIVATE)

        var volume: Float
            get() = defaults.getFloat(VOLUME_KEY, 0.5f)
            set(value) = defaults.edit().putFloat(VOLUME_KEY, value).apply()

        private const val EMOJI_KEY = "org.wizardchat.emoji"
        private const val MAX_EMOJI_BYTES = 32

        fun emoji(shortcode: String?, emoji: String? = null): String =
            emoji?.takeIf { it.isNotEmpty() } ?: shortcode?.let { EMOJI[it] } ?: "🔊"

        fun parse(data: ByteArray): Play? {
            if (data.size > MAX_MESSAGE_BYTES) return null
            val message = runCatching { Json.parseToJsonElement(data.decodeToString()).jsonObject }.getOrNull() ?: return null
            val url = runCatching { message["url"]?.jsonPrimitive?.contentOrNull }.getOrNull()
            if (url == null || !url.startsWith("mxc://")) return null
            val shortcode = runCatching { message["shortcode"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                ?.takeIf { it.encodeToByteArray().size <= MAX_SHORTCODE_BYTES }
            val emoji = runCatching { message[EMOJI_KEY]?.jsonPrimitive?.contentOrNull }.getOrNull()
                ?.takeIf { it.encodeToByteArray().size <= MAX_EMOJI_BYTES }
            return Play(url, shortcode, emoji)
        }

        fun message(sound: SoundboardSound): JsonObject = buildJsonObject {
            put("url", sound.url)
            put("shortcode", sound.shortcode)
            sound.emoji?.takeIf { it.isNotEmpty() }?.let { put(EMOJI_KEY, it) }
        }
    }

    private val sounds = mutableMapOf<String, Deferred<ByteArray>>()
    private val lastPlayed = mutableMapOf<String, Long>()
    private val playing = mutableMapOf<String, MutableList<MediaPlayer>>()

    private fun data(url: String): Deferred<ByteArray> =
        sounds.getOrPut(url) { scope.async { client.soundboardSound(url) } }

    fun prefetch(url: String) {
        data(url)
    }

    fun play(url: String, sender: String, volume: Float, onStart: (durationMs: Long) -> Unit) {
        val now = System.currentTimeMillis()
        if (now - (lastPlayed[sender] ?: 0L) < MIN_INTERVAL_MS) return
        if ((playing[sender]?.size ?: 0) >= MAX_PLAYING) return
        lastPlayed[sender] = now
        val task = data(url)
        scope.launch {
            val bytes = runCatching { task.await() }.getOrElse {
                sounds.remove(url)
                return@launch
            }
            val player = runCatching {
                MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    setDataSource(ByteSource(bytes))
                    prepare()
                }
            }.getOrNull() ?: return@launch
            if (player.duration > MAX_DURATION_MS) {
                player.release()
                return@launch
            }
            player.setVolume(volume, volume)
            val list = playing.getOrPut(sender) { mutableListOf() }
            list.add(player)
            val done = { it: MediaPlayer ->
                list.remove(it)
                if (list.isEmpty()) playing.remove(sender)
                it.release()
            }
            player.setOnCompletionListener { done(it) }
            player.setOnErrorListener { p, _, _ ->
                done(p)
                true
            }
            player.start()
            onStart(player.duration.toLong())
        }
    }

    fun stop() {
        playing.values.flatten().forEach { runCatching { it.stop() }; it.release() }
        playing.clear()
        sounds.values.forEach { it.cancel() }
        sounds.clear()
    }

    internal class ByteSource(private val bytes: ByteArray) : MediaDataSource() {
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
            if (position >= bytes.size) return -1
            val count = minOf(size, bytes.size - position.toInt())
            System.arraycopy(bytes, position.toInt(), buffer, offset, count)
            return count
        }

        override fun getSize(): Long = bytes.size.toLong()

        override fun close() = Unit
    }
}
