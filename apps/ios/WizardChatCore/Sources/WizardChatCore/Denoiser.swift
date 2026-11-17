import Foundation
#if canImport(wizardchat_core_ffiFFI)
import wizardchat_core_ffiFFI
#endif

public final class Denoiser {
    public static let sampleRate = 48_000
    private let handle: OpaquePointer

    public init(scale: Float) {
        handle = wz_denoise_new(scale)
    }

    deinit {
        wz_denoise_free(handle)
    }

    @discardableResult
    public func process(_ samples: UnsafeMutablePointer<Float>, count: Int) -> Float {
        wz_denoise_process(handle, samples, count)
    }
}
