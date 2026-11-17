import Foundation
import LiveKit
import WizardChatCore

enum NoiseFilterMode: String, CaseIterable {
    case off, standard, enhanced

    var titleKey: String { "settings.voiceVideo.noiseFilter.\(rawValue)" }

    static let defaultsKey = "voice.noiseFilter"

    static var current: NoiseFilterMode {
        UserDefaults.standard.string(forKey: defaultsKey).flatMap(NoiseFilterMode.init) ?? .standard
    }
}

final class NoiseFilter: NSObject, AudioCustomProcessingDelegate, @unchecked Sendable {
    static let shared = NoiseFilter()

    private let lock = NSLock()
    private var denoiser: Denoiser?

    static func apply(_ mode: NoiseFilterMode = .current) {
        let enhanced = mode == .enhanced
        guard (AudioManager.shared.capturePostProcessingDelegate != nil) != enhanced else { return }
        AudioManager.shared.capturePostProcessingDelegate = enhanced ? shared : nil
    }

    var audioProcessingName: String { "wizardchat-denoise" }

    func audioProcessingInitialize(sampleRate sampleRateHz: Int, channels: Int) {
        lock.withLock { denoiser = nil }
    }

    func audioProcessingProcess(audioBuffer: LKAudioBuffer) {
        guard audioBuffer.frames * 100 == Denoiser.sampleRate else { return }
        lock.withLock {
            let denoiser = denoiser ?? Denoiser(scale: 1)
            self.denoiser = denoiser
            denoiser.process(audioBuffer.rawBuffer(forChannel: 0), count: audioBuffer.frames)
        }
    }

    func audioProcessingRelease() {
        lock.withLock { denoiser = nil }
    }
}
