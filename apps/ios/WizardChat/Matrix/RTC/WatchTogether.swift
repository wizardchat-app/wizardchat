import Foundation

struct WatchState: Equatable {
    var videoId: String
    var startedBy: String
    var playing: Bool
    var position: Double
    var at: Double

    func expectedPosition(now: Double = WatchTogether.now) -> Double {
        playing ? position + (now - at) / 1000 : position
    }

    var json: [String: Any] {
        ["videoId": videoId, "startedBy": startedBy, "playing": playing, "position": position, "at": at]
    }
}

@MainActor
final class WatchTogether: ObservableObject {
    static let topic = "org.wizardchat.watch"
    private static let heartbeatSeconds = 10.0
    private static let lateJoinRequestDelay = 1.5
    private static let offsetSamples = 10

    @Published private(set) var state: WatchState?
    /// The video you agreed to load. YouTube only sees you once you choose to watch.
    @Published var watchingVideoId: String?
    @Published var consent: Bool { didSet { UserDefaults.standard.set(consent, forKey: "youtubeConsent") } }

    private let ownUserId: String
    private let send: ([String: Any]) -> Void
    private let participants: () -> [(identity: String, userId: String, isLocal: Bool)]
    private var offsets: [String: [Double]] = [:]
    private var stoppedAt: Double = 0
    private var heartbeat: Timer?

    nonisolated static var now: Double { Date().timeIntervalSince1970 * 1000 }

    init(ownUserId: String, send: @escaping ([String: Any]) -> Void,
         participants: @escaping () -> [(identity: String, userId: String, isLocal: Bool)]) {
        self.ownUserId = ownUserId
        self.send = send
        self.participants = participants
        consent = UserDefaults.standard.bool(forKey: "youtubeConsent")
        heartbeat = Timer.scheduledTimer(withTimeInterval: Self.heartbeatSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.beat() }
        }
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.lateJoinRequestDelay))
            guard let self, self.state == nil else { return }
            self.send(["t": "request"])
        }
    }

    func close() {
        heartbeat?.invalidate()
        heartbeat = nil
    }

    func start(videoId: String) {
        consent = true
        watchingVideoId = videoId
        CallSounds.play("watch_together_start")
        publish(WatchState(videoId: videoId, startedBy: ownUserId, playing: true, position: 0, at: Self.now))
    }

    func update(playing: Bool, position: Double) {
        guard var current = state else { return }
        current.playing = playing
        current.position = max(0, position)
        current.at = Self.now
        publish(current)
    }

    func stop() {
        stoppedAt = Self.now
        state = nil
        watchingVideoId = nil
        send(["t": "stop", "sentAt": Self.now])
    }

    private func publish(_ next: WatchState) {
        state = next
        send(["t": "state", "state": next.json, "sentAt": Self.now])
    }

    private func beat() {
        guard let current = state else { return }
        let present = participants().sorted { $0.identity < $1.identity }
        let leader = present.first { $0.userId == current.startedBy } ?? present.first
        guard leader?.isLocal == true else { return }
        var next = current
        next.position = current.expectedPosition()
        next.at = Self.now
        publish(next)
    }

    func receive(_ data: Data, from identity: String) {
        guard let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        switch message["t"] as? String {
        case "request":
            if let state { send(["t": "state", "state": state.json, "sentAt": Self.now]) }
        case "stop":
            guard message["sentAt"] is NSNumber else { return }
            stoppedAt = Self.now
            state = nil
            watchingVideoId = nil
        case "state":
            guard let sentAt = (message["sentAt"] as? NSNumber)?.doubleValue,
                  let raw = message["state"] as? [String: Any],
                  let videoId = raw["videoId"] as? String, Self.isVideoId(videoId),
                  let startedBy = raw["startedBy"] as? String,
                  let playing = raw["playing"] as? Bool,
                  let position = (raw["position"] as? NSNumber)?.doubleValue, position.isFinite,
                  let at = (raw["at"] as? NSNumber)?.doubleValue else { return }
            var samples = offsets[identity, default: []]
            samples.append(Self.now - sentAt)
            samples = Array(samples.suffix(Self.offsetSamples))
            offsets[identity] = samples
            let incoming = WatchState(videoId: videoId, startedBy: startedBy, playing: playing,
                                      position: max(0, position), at: at + (samples.min() ?? 0))
            guard incoming.at > stoppedAt else { return }
            if let current = state, incoming.at < current.at { return }
            if state?.videoId != incoming.videoId {
                CallSounds.play("watch_together_start")
            }
            state = incoming
        default:
            return
        }
    }

    static func isVideoId(_ text: String) -> Bool {
        text.range(of: #"^[\w-]{11}$"#, options: .regularExpression) != nil
    }

    static func parseVideoId(_ input: String) -> String? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if isVideoId(text) { return text }
        guard let url = URL(string: text.hasPrefix("http") ? text : "https://\(text)"),
              let rawHost = url.host?.lowercased() else { return nil }
        let host = rawHost.replacingOccurrences(of: #"^(www\.|m\.|music\.)"#, with: "", options: .regularExpression)
        var id: String?
        if host == "youtu.be" {
            id = url.pathComponents.dropFirst().first
        } else if host == "youtube.com" || host == "youtube-nocookie.com" {
            id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "v" }?.value
            if id == nil {
                let parts = url.pathComponents
                if parts.count >= 3, ["embed", "shorts", "live", "v"].contains(parts[1]) { id = parts[2] }
            }
        }
        guard let id, isVideoId(id) else { return nil }
        return id
    }

    static func watchURL(_ videoId: String, seconds: Double = 0) -> URL {
        let t = Int(seconds)
        return URL(string: "https://www.youtube.com/watch?v=\(videoId)\(t > 0 ? "&t=\(t)s" : "")")!
    }
}
