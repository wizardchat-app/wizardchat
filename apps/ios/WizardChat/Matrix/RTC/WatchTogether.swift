import Foundation

/// Orders changes to the shared state: a higher version wins, ties go to the larger user ID
struct WatchClock: Equatable {
    var version: Int
    var by: String

    func isNewer(than other: WatchClock?) -> Bool {
        guard let other else { return true }
        return version > other.version || (version == other.version && by > other.by)
    }
}

struct WatchState: Equatable {
    var videoId: String
    var startedBy: String
    var playing: Bool
    var position: Double
    var at: Double
    var rate: Double = 1
    var version: Int = 0
    var by: String
    var waitingFor: String?

    var clock: WatchClock { WatchClock(version: version, by: by) }

    func expectedPosition(now: Double = WatchTogether.now) -> Double {
        playing ? position + (now - at) / 1000 * rate : position
    }

    var json: [String: Any] {
        ["videoId": videoId, "startedBy": startedBy, "playing": playing, "position": position, "at": at,
         "rate": rate, "version": version, "by": by, "waitingFor": waitingFor.map { $0 as Any } ?? NSNull()]
    }
}

@MainActor
final class WatchTogether: ObservableObject {
    static let topic = "org.wizardchat.watch"
    private static let heartbeatSeconds = 10.0
    private static let lateJoinRequestDelay = 1.5
    private static let offsetSamples = 10
    private static let startSoundWindow = 5.0

    @Published private(set) var state: WatchState?
    /// The video you agreed to load. YouTube only sees you once you choose to watch.
    @Published var watchingVideoId: String? {
        didSet { if watchingVideoId != oldValue { send(viewerMessage(watchingVideoId)) } }
    }
    @Published private var viewerVideos: [String: String] = [:]
    @Published var consent: Bool { didSet { UserDefaults.standard.set(consent, forKey: "youtubeConsent") } }

    /// Who in the call watches the current video (user IDs), you included
    var viewers: [String] {
        guard let videoId = state?.videoId else { return [] }
        var ids: [String] = []
        for p in participants() where (p.isLocal ? watchingVideoId : viewerVideos[p.identity]) == videoId {
            if !ids.contains(p.userId) { ids.append(p.userId) }
        }
        return ids
    }

    let ownUserId: String
    private let send: ([String: Any]) -> Void
    private let participants: () -> [(identity: String, userId: String, isLocal: Bool)]
    private var offsets: [String: [Double]] = [:]
    private var clock: WatchClock?
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
            guard let self else { return }
            if self.state == nil { self.send(["t": "request"]) }
            self.send(["t": "who"])
        }
    }

    func close() {
        heartbeat?.invalidate()
        heartbeat = nil
    }

    private func nextClock() -> WatchClock {
        WatchClock(version: (clock?.version ?? 0) + 1, by: ownUserId)
    }

    func start(videoId: String) {
        consent = true
        watchingVideoId = videoId
        let next = nextClock()
        publish(WatchState(videoId: videoId, startedBy: ownUserId, playing: true, position: 0, at: Self.now,
                           version: next.version, by: next.by))
    }

    /// Play or pause at a position; leaving waitingFor out clears any buffering hold
    func update(playing: Bool, position: Double, waitingFor: String? = nil) {
        guard var next = state else { return }
        next.playing = playing
        next.position = max(0, position)
        next.at = Self.now
        next.waitingFor = waitingFor
        stamp(&next)
        publish(next)
    }

    func updateRate(_ rate: Double, position: Double) {
        guard var next = state else { return }
        next.rate = rate
        next.position = max(0, position)
        next.at = Self.now
        stamp(&next)
        publish(next)
    }

    func stop() {
        let next = nextClock()
        clock = next
        state = nil
        watchingVideoId = nil
        send(["t": "stop", "sentAt": Self.now, "version": next.version, "by": next.by])
    }

    private func stamp(_ state: inout WatchState) {
        let next = nextClock()
        state.version = next.version
        state.by = next.by
    }

    private func publish(_ next: WatchState) {
        clock = next.clock
        apply(next)
        broadcast(next)
    }

    private func apply(_ next: WatchState?) {
        let previous = state
        state = next
        if let next, next.videoId != previous?.videoId, next.expectedPosition() < Self.startSoundWindow {
            CallSounds.play("watch_together_start")
        }
    }

    private func broadcast(_ state: WatchState) {
        send(["t": "state", "state": state.json, "sentAt": Self.now])
    }

    private func fresh(_ state: WatchState) -> WatchState {
        var copy = state
        copy.position = state.expectedPosition()
        copy.at = Self.now
        return copy
    }

    private func viewerMessage(_ videoId: String?) -> [String: Any] {
        ["t": "viewer", "videoId": videoId.map { $0 as Any } ?? NSNull()]
    }

    /// The starter (or else the first person by identity) keeps everyone's clock fresh and lifts stale holds
    private func beat() {
        guard let current = state else { return }
        let present = participants().sorted { $0.identity < $1.identity }
        let leader = present.first { $0.userId == current.startedBy } ?? present.first
        guard leader?.isLocal == true else { return }
        if let waitingFor = current.waitingFor, !present.contains(where: { $0.userId == waitingFor }) {
            var next = current
            next.playing = true
            next.waitingFor = nil
            next.at = Self.now
            stamp(&next)
            publish(next)
            return
        }
        broadcast(fresh(current))
    }

    func receive(_ data: Data, from identity: String) {
        guard let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        switch message["t"] as? String {
        case "request":
            if let state { broadcast(fresh(state)) }
        case "who":
            if let watchingVideoId { send(viewerMessage(watchingVideoId)) }
        case "viewer":
            if let videoId = message["videoId"] as? String, Self.isVideoId(videoId) {
                viewerVideos[identity] = videoId
            } else {
                viewerVideos[identity] = nil
            }
        case "stop":
            guard message["sentAt"] is NSNumber else { return }
            let version = (message["version"] as? NSNumber)?.intValue ?? 0
            let incoming = WatchClock(version: version, by: message["by"] as? String ?? "")
            if version > 0 && !incoming.isNewer(than: clock) { return }
            clock = version > 0 ? incoming : nextClock()
            apply(nil)
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
            let rate = (raw["rate"] as? NSNumber)?.doubleValue ?? 1
            var incoming = WatchState(videoId: videoId, startedBy: startedBy, playing: playing,
                                      position: max(0, position), at: at + (samples.min() ?? 0),
                                      rate: (0.25...2).contains(rate) ? rate : 1,
                                      version: (raw["version"] as? NSNumber)?.intValue ?? 0,
                                      by: raw["by"] as? String ?? startedBy,
                                      waitingFor: raw["waitingFor"] as? String)
            if incoming.version == 0 {
                incoming.version = nextClock().version
            } else if !incoming.clock.isNewer(than: clock) && incoming.clock != clock {
                return
            }
            clock = incoming.clock
            apply(incoming)
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
