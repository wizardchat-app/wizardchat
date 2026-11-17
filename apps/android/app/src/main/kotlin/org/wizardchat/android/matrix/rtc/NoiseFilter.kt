package org.wizardchat.android.matrix.rtc

import io.livekit.android.audio.AudioProcessorInterface
import java.nio.ByteBuffer
import org.wizardchat.core.Denoiser

enum class NoiseFilterMode(val key: String) {
    OFF("off"),
    STANDARD("standard"),
    ENHANCED("enhanced"),
    ;

    companion object {
        const val PREF = "voice.noiseFilter"

        fun from(key: String?) = entries.firstOrNull { it.key == key } ?: STANDARD
    }
}

class NoiseFilter : AudioProcessorInterface {
    private var denoiser: Denoiser? = null

    override fun isEnabled() = true

    override fun getName() = "wizardchat-denoise"

    override fun initializeAudioProcessing(sampleRateHz: Int, numChannels: Int) = reset()

    override fun resetAudioProcessing(newRate: Int) = reset()

    @Synchronized
    override fun processAudio(numBands: Int, numFrames: Int, buffer: ByteBuffer) {
        if (numFrames * 100 != Denoiser.SAMPLE_RATE) return
        val denoiser = denoiser ?: Denoiser(1f).also { denoiser = it }
        denoiser.process(buffer, numFrames)
    }

    @Synchronized
    private fun reset() {
        denoiser?.close()
        denoiser = null
    }
}
