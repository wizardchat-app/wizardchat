package org.wizardchat.core

import com.sun.jna.Native
import com.sun.jna.Pointer
import java.nio.Buffer

class Denoiser(scale: Float) : AutoCloseable {
    private var handle: Pointer? = DenoiseLib.wz_denoise_new(scale)

    fun process(samples: Buffer, count: Int): Float =
        handle?.let { DenoiseLib.wz_denoise_process(it, samples, count.toLong()) } ?: 0f

    override fun close() {
        handle?.let(DenoiseLib::wz_denoise_free)
        handle = null
    }

    companion object {
        const val SAMPLE_RATE = 48_000
    }
}

internal object DenoiseLib {
    init {
        Native.register(DenoiseLib::class.java, "wizardchat_core_ffi")
    }

    external fun wz_denoise_new(scale: Float): Pointer
    external fun wz_denoise_process(denoiser: Pointer, samples: Buffer, len: Long): Float
    external fun wz_denoise_free(denoiser: Pointer)
}
