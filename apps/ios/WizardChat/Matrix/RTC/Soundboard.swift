import AVFoundation
import WizardChatCore

struct SoundboardFlash: Equatable {
    let emoji: String
    let key: Int
}

@MainActor
final class Soundboard {
    static let topic = "moe.crafty.soundboard"
    static let cooldown: Duration = .milliseconds(1500)
    private static let maxMessageBytes = 1024
    private static let maxShortcodeBytes = 100
    private static let maxDuration: TimeInterval = 15
    private static let minInterval: TimeInterval = 0.4
    private static let maxPlaying = 3
    private static let emojis = [
        "applause": "👏", "laugh": "😂", "rimshot": "🥁", "drumroll": "🪘",
        "tada": "🎉", "airhorn": "📯", "crickets": "🦗", "sad_trombone": "🎺",
    ]
    static let volumeKey = "voice.soundboardVolume"

    static var volume: Double { UserDefaults.standard.object(forKey: volumeKey) as? Double ?? 0.5 }

    static let emojiKey = "org.wizardchat.emoji"
    private static let maxEmojiBytes = 32

    static func emoji(_ shortcode: String?, _ emoji: String? = nil) -> String {
        if let emoji, !emoji.isEmpty { return emoji }
        return shortcode.flatMap { emojis[$0] } ?? "🔊"
    }

    struct Play {
        let url: String
        let shortcode: String?
        let emoji: String?
    }

    private let client: WizardClient
    private var sounds: [String: Task<Data, Error>] = [:]
    private var lastPlayed: [String: Date] = [:]
    private var playing: [String: [AVAudioPlayer]] = [:]

    init(client: WizardClient) {
        self.client = client
    }

    static func parse(_ data: Data) -> Play? {
        guard data.count <= maxMessageBytes,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = object["url"] as? String, url.hasPrefix("mxc://") else { return nil }
        let shortcode = (object["shortcode"] as? String).flatMap { $0.utf8.count <= maxShortcodeBytes ? $0 : nil }
        let emoji = (object[emojiKey] as? String).flatMap { $0.utf8.count <= maxEmojiBytes ? $0 : nil }
        return Play(url: url, shortcode: shortcode, emoji: emoji)
    }

    static func message(_ sound: SoundboardSound) -> [String: Any] {
        var message: [String: Any] = ["url": sound.url, "shortcode": sound.shortcode]
        if let emoji = sound.emoji, !emoji.isEmpty { message[emojiKey] = emoji }
        return message
    }

    private func data(_ url: String) -> Task<Data, Error> {
        if let task = sounds[url] { return task }
        let client = client
        let task = Task { try await client.soundboardSound(url: url) }
        sounds[url] = task
        return task
    }

    func prefetch(_ url: String) {
        _ = data(url)
    }

    func play(_ url: String, from sender: String, volume: Double, onStart: @escaping (TimeInterval) -> Void) {
        let now = Date()
        if let last = lastPlayed[sender], now.timeIntervalSince(last) < Self.minInterval { return }
        playing[sender]?.removeAll { !$0.isPlaying }
        guard (playing[sender]?.count ?? 0) < Self.maxPlaying else { return }
        lastPlayed[sender] = now
        let task = data(url)
        Task {
            guard let data = try? await task.value else {
                sounds[url] = nil
                return
            }
            guard let player = try? AVAudioPlayer(data: data), player.duration <= Self.maxDuration else { return }
            player.volume = Float(volume)
            playing[sender, default: []].append(player)
            if player.play() { onStart(player.duration) }
        }
    }

    func stop() {
        for players in playing.values { players.forEach { $0.stop() } }
        playing = [:]
        sounds.values.forEach { $0.cancel() }
        sounds = [:]
    }
}
