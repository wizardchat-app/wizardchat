import AVFoundation
import LiveKit
import UIKit
import WizardChatCore

struct CallParticipantInfo: Identifiable, Equatable {
    var id: String { identity }
    let identity: String
    let userId: String
    let deviceId: String
    let isLocal: Bool
    var isOwnOtherDevice = false
    var connected = false
    var speaking = false
    var micMuted = true
    var cameraTrack: VideoTrack?
    var screenTrack: VideoTrack?
    var handRaised = false
    var reaction: String?
    var volume: Double = 1
    var locallyMuted = false
    var screenWatchers: [String] = []

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.identity == rhs.identity && lhs.connected == rhs.connected && lhs.speaking == rhs.speaking
            && lhs.micMuted == rhs.micMuted && lhs.cameraTrack === rhs.cameraTrack
            && lhs.screenTrack === rhs.screenTrack && lhs.handRaised == rhs.handRaised
            && lhs.reaction == rhs.reaction && lhs.volume == rhs.volume && lhs.locallyMuted == rhs.locallyMuted
            && lhs.screenWatchers == rhs.screenWatchers
    }
}

@MainActor
final class CallManager: NSObject, ObservableObject {
    enum State: Equatable { case idle, joining, joined, failed(String) }

    private static let reactionVisibleSeconds = 3.0
    private static let joinTimeout = Duration.seconds(30)
    private static let remoteRetryDelay = Duration.seconds(2)

    @Published private(set) var state = State.idle {
        // Calls keep the screen on
        didSet { UIApplication.shared.isIdleTimerDisabled = state == .joining || state == .joined }
    }
    @Published private(set) var room: RoomSummary?
    @Published private(set) var participants: [CallParticipantInfo] = []
    @Published private(set) var cameraOn = false
    @Published private(set) var screenSharing = false
    @Published private(set) var handRaised = false
    @Published private(set) var reconnecting = false
    @Published private(set) var watch: WatchTogether?

    enum RingState: Equatable { case ringing, declined, unanswered }
    @Published private(set) var ring: RingState?
    @Published private(set) var incoming: RingingCall?
    @Published private(set) var incomingCallId: UUID?
    private let callKit = CallKitController()
    private var callId: UUID?
    private var callIsOutgoing = false
    private weak var appSession: MatrixSession?
    @Published var showCallScreen = false
    /// A failed DM or group call; voice rooms show their failure in the lobby
    @Published var alert: String?
    private var ringback: CallSounds.Loop?
    private var ringtone: CallSounds.Loop?
    private var onMissedCall: ((IncomingCall) -> Void)?
    private var attempt = 0
    private var joinTimer: Task<Void, Never>?
    private var knownOthers: Set<String> = []
    private let liveActivity = CallLiveActivityController()
    private var displayNames: [String: String] = [:]
    @Published var micMuted: Bool { didSet { UserDefaults.standard.set(micMuted, forKey: "voice.micMuted") } }
    @Published var deafened: Bool { didSet { UserDefaults.standard.set(deafened, forKey: "voice.deafened") } }
    @Published private(set) var talking = false
    var pushToTalk: Bool { UserDefaults.standard.bool(forKey: "pushToTalk") }
    private var micTesting = false
    private var micTask: Task<Void, Never>?
    private var micEnabled: Bool { !micTesting && (pushToTalk ? talking && !deafened : !micMuted && !deafened) }
    private var micPublished: Bool { pushToTalk ? !micTesting && !deafened : micEnabled }
    private var outputVolume: Double { UserDefaults.standard.object(forKey: "voice.outputVolume") as? Double ?? 1 }
    private var cameraOptions: CameraCaptureOptions {
        let back = UserDefaults.standard.string(forKey: "voice.cameraPosition") == "back"
        return CameraCaptureOptions(position: back ? .back : .front, dimensions: .h720_169, fps: 30)
    }

    private var session: CallSession?
    private var run: Subscription?
    private var incomingWatch: Subscription?
    private var members: [CallMember] = []
    private var mutedBeforeDeafen = false
    private var client: WizardClient?
    private var keyProvider: BaseKeyProvider?
    private var connections: [String: LiveKit.Room] = [:]
    private var pendingServices: Set<String> = []
    private var refreshTimer: Timer?
    private var userVolumes: [String: Double] = [:]
    private var mutedUsers: Set<String> = []
    private var appliedVolumes: [String: Double] = [:]
    private var reactions: [String: String] = [:]
    private var raisedHands: Set<String> = []
    private static let streamWatchTopic = "org.wizardchat.stream-watch"
    private var watchedScreens: Set<String> = []
    private var streamWatchers: Set<String> = []

    override init() {
        micMuted = UserDefaults.standard.bool(forKey: "voice.micMuted")
        deafened = UserDefaults.standard.bool(forKey: "voice.deafened")
        super.init()
        CallActivityActions.toggleMic = { [weak self] in self?.toggleMic() }
        CallActivityActions.toggleDeafen = { [weak self] in self?.toggleDeafen() }
        CallActivityActions.leave = { [weak self] in self?.leave() }
        callKit.onAnswer = { [weak self] id in self?.answerFromSystem(id) }
        callKit.onEnd = { [weak self] id in self?.endFromSystem(id) }
        callKit.onMute = { [weak self] id, muted in self?.muteFromSystem(id, muted) }
        liveActivity.end()
    }

    var isInCall: Bool { state == .joining || state == .joined }
    func isInCall(roomId: String) -> Bool { isInCall && room?.id == roomId }

    func join(_ room: RoomSummary, session app: MatrixSession, intent: String? = nil, ring: Bool = false,
              answering answeredId: UUID? = nil) async {
        if isInCall(roomId: room.id) { return }
        if incoming?.roomId == room.id { dismissIncoming() }
        if isInCall { await leaveAndWait() }
        alert = nil
        attempt += 1
        let current = attempt
        guard await AVAudioApplication.requestRecordPermission() else {
            await fail(String(localized: "call.micPermission"), room: room)
            return
        }
        guard attempt == current, let client = app.client else { return }
        self.room = room
        self.client = client
        appSession = app
        state = .joining
        if let answeredId {
            callId = answeredId
            callIsOutgoing = false
        } else {
            let id = UUID()
            callId = id
            callIsOutgoing = true
            callKit.start(id, name: room.displayName, video: intent == "video")
        }
        joinTimer = Task { [weak self] in
            try? await Task.sleep(for: Self.joinTimeout)
            guard !Task.isCancelled, let self, self.attempt == current, self.state == .joining else { return }
            self.joinTimer = nil
            await self.fail(String(localized: "call.joinTimeout"), room: room)
        }
        do {
            guard try await client.rtcServiceUrl() != nil else { throw JoinFailure.noSfu }
            guard attempt == current else { return }
            let session = try await client.joinCall(roomId: room.id, video: intent == "video", ring: ring)
            guard attempt == current else {
                try? await session.leave()
                return
            }
            self.session = session
            // The ringback waits for LiveKit's audio session, but the state is set now so an
            // early decline or answer isn't missed
            if session.rang { self.ring = .ringing }
            if try await session.encrypted() {
                keyProvider = BaseKeyProvider(options: KeyProviderOptions(
                    sharedKey: false, ratchetWindowSize: 10, keyRingSize: 256, keyDerivationAlgorithm: .hkdf))
            }
            guard attempt == current else { return }
            run = session.run { [weak self] event in
                MainActor.assumeIsolated { self?.handle(event) }
            }
            let publisher = try await connect(service: session.serviceUrl, publisher: true)
            guard attempt == current else { return }
            joinTimer?.cancel()
            joinTimer = nil
            state = .joined
            if let callId, callIsOutgoing { callKit.connected(callId) }
            watch = WatchTogether(
                ownUserId: client.userId ?? "",
                send: { [weak self] message in self?.sendData(message, topic: WatchTogether.topic) },
                participants: { [weak self] in
                    (self?.participants ?? []).filter(\.connected).map { ($0.identity, $0.userId, $0.isLocal) }
                })
            Self.applyPreferredInput()
            if pushToTalk { micMuted = false }
            _ = try? await publisher.localParticipant.setMicrophone(enabled: micPublished)
            AudioManager.shared.isMicrophoneMuted = pushToTalk && !micEnabled
            CallSounds.play("call_join")
            if self.ring == .ringing { ringback = CallSounds.loop("ringback") }
            liveActivity.start(roomName: room.displayName, isDirect: room.isDirect, state: activityState)
            if intent == "video" { toggleCamera() }
            syncRemoteConnections()
            startRefreshing()
        } catch {
            guard attempt == current else { return }
            switch error {
            case is CancellationError: await fail(nil, room: room)
            case JoinFailure.noSfu: await fail(String(localized: "call.noSfu"), room: room)
            default: await fail(L10n.format("call.failed", error.localizedDescription), room: room)
            }
        }
    }

    private enum JoinFailure: Error { case noSfu }

    func leave() {
        Task { await leaveAndWait() }
    }

    private func leaveAndWait() async {
        attempt += 1
        if state == .joined { CallSounds.play("call_leave") }
        let session = session
        await tearDown()
        try? await session?.leave()
        state = .idle
        room = nil
    }

    /// Ends the call; `message` nil means it was cancelled and ends quietly
    private func fail(_ message: String?, room failedRoom: RoomSummary?, leave: Bool = true) async {
        attempt += 1
        let session = session
        let wasShowingScreen = showCallScreen
        await tearDown()
        if leave { try? await session?.leave() }
        room = nil
        guard let message else {
            state = .idle
            return
        }
        state = .failed(message)
        guard failedRoom?.isVoice != true else { return }
        // The call screen is still animating away; an alert presented now would be dropped
        if wasShowingScreen { try? await Task.sleep(for: .milliseconds(600)) }
        if case .failed(message) = state { alert = message }
    }

    private func tearDown() async {
        micTask = nil
        AudioManager.shared.isMicrophoneMuted = false
        if let id = callId {
            callId = nil
            callKit.end(id)
        }
        joinTimer?.cancel()
        joinTimer = nil
        liveActivity.end()
        displayNames = [:]
        stopRinging()
        ring = nil
        showCallScreen = false
        knownOthers = []
        watch?.close()
        watch = nil
        refreshTimer?.invalidate()
        refreshTimer = nil
        run?.cancel()
        run = nil
        let rooms = Dictionary(connections.values.map { (ObjectIdentifier($0), $0) }, uniquingKeysWith: { a, _ in a }).values
        connections = [:]
        pendingServices = []
        for connection in rooms { await connection.disconnect() }
        session = nil
        members = []
        client = nil
        keyProvider = nil
        participants = []
        reactions = [:]
        raisedHands = []
        watchedScreens = []
        streamWatchers = []
        handRaised = false
        cameraOn = false
        screenSharing = false
        reconnecting = false
        appliedVolumes = [:]
    }

    private func handle(_ event: CallEvent) {
        switch event {
        case .members(let update):
            membersChanged(update.members)
        case .key(let key):
            guard let data = Data(base64Encoded: key.key) else { return }
            keyProvider?.setKey(keyData: data, participantId: key.identity, index: Int32(key.index))
        case .declined:
            if ring == .ringing { endRinging(.declined) }
        case .unanswered:
            if ring == .ringing { endRinging(.unanswered) }
        case .reaction(let reaction):
            show(reaction: reaction.emoji, for: reaction.identity)
        case .handRaised(let hand):
            if hand.raised { raisedHands.insert(hand.identity) } else { raisedHands.remove(hand.identity) }
            refresh()
        case .error(let error):
            NSLog("WZCALL %@", error.message)
            if error.fatal {
                Task { await fail(L10n.format("call.failed", error.message), room: room, leave: false) }
            }
        }
    }

    private func membersChanged(_ members: [CallMember]) {
        self.members = members
        guard let client else { return }
        for userId in Set(members.map(\.userId)) where displayNames[userId] == nil {
            displayNames[userId] = TimelineModel.localpart(userId)
            Task {
                if let name = try? await client.userProfile(userId: userId).displayName { self.displayNames[userId] = name }
            }
        }
        let others = Set(members.filter { $0.userId != client.userId }.map(\.userId))
        if state == .joined {
            if !others.subtracting(knownOthers).isEmpty { CallSounds.play("call_join") }
            else if !knownOthers.subtracting(others).isEmpty { CallSounds.play("call_leave") }
        }
        knownOthers = others
        if !others.isEmpty, ring == .ringing {
            stopRinging()
            ring = nil
        }
        syncRemoteConnections()
        refresh()
    }

    @discardableResult
    private func connect(service: String, publisher: Bool) async throws -> LiveKit.Room {
        guard let session else { throw CancellationError() }
        let sfu = try await session.sfuConfig(serviceUrl: service, publisher: publisher)
        guard self.session === session else { throw CancellationError() }
        // Two service URLs can lead to the same SFU; keep it under both so neither asks for tokens again
        if let same = connections.values.first(where: { $0.url == sfu.url }) {
            connections[service] = same
            return same
        }
        let options = RoomOptions(
            defaultCameraCaptureOptions: cameraOptions,
            defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(dimensions: .h1080_169, fps: 30),
            defaultAudioCaptureOptions: AudioCaptureOptions(echoCancellation: true, autoGainControl: true,
                                                            noiseSuppression: true),
            // VP8 is encoded in software on iPhone, so keep the resolution and give it enough
            // bitrate instead of letting WebRTC scale it down under load
            defaultVideoPublishOptions: VideoPublishOptions(encoding: VideoEncoding(maxBitrate: 2_500_000, maxFps: 30),
                                                            simulcastLayers: [.presetH180_169, .presetH360_169],
                                                            preferredCodec: .vp8,
                                                            degradationPreference: .maintainResolution),
            // No RED (redundant audio): browsers can't decrypt RED-wrapped frames
            defaultAudioPublishOptions: AudioPublishOptions(dtx: true, red: false),
            adaptiveStream: true,
            dynacast: true,
            encryptionOptions: keyProvider.map { EncryptionOptions(keyProvider: $0) })
        let livekit = LiveKit.Room(delegate: self, roomOptions: options)
        try await livekit.connect(url: sfu.url, token: sfu.jwt)
        guard self.session === session else {
            await livekit.disconnect()
            throw CancellationError()
        }
        connections[service] = livekit
        return livekit
    }

    private func syncRemoteConnections() {
        guard let session, state == .joined else { return }
        let own = session.serviceUrl
        let wanted = Set(members.compactMap(\.serviceUrl).filter { $0 != own })
        for service in wanted where connections[service] == nil && !pendingServices.contains(service) {
            pendingServices.insert(service)
            Task {
                do { try await connect(service: service, publisher: false) } catch {
                    NSLog("WZCALL could not connect to %@: %@", service, String(describing: error))
                }
                pendingServices.remove(service)
            }
        }
        for (service, connection) in connections where service != own && !wanted.contains(service) {
            connections[service] = nil
            if !connections.values.contains(where: { $0 === connection }) {
                Task { await connection.disconnect() }
            }
        }
    }

    private func remoteDisconnected(_ connection: LiveKit.Room) {
        let services = connections.filter { $0.value === connection }.map(\.key)
        guard !services.isEmpty else { return }
        for service in services { connections[service] = nil }
        let session = session
        Task {
            try? await Task.sleep(for: Self.remoteRetryDelay)
            guard self.session === session else { return }
            syncRemoteConnections()
        }
    }

    private var publisher: LiveKit.Room? { session.flatMap { connections[$0.serviceUrl] } }

    private func sendData(_ message: [String: Any], topic: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: message), let publisher else { return }
        Task {
            do {
                try await publisher.localParticipant.publish(data: data, options: DataPublishOptions(topic: topic, reliable: true))
            } catch {
                NSLog("WZCALL data: %@", String(describing: error))
            }
        }
    }

    /// Unmuting while deafened also undeafens you (you can't talk without hearing)
    func toggleMic() {
        if deafened {
            deafened = false
            micMuted = false
        } else {
            micMuted.toggle()
        }
        if let callId { callKit.setMuted(callId, micMuted) }
        if state == .joined { CallSounds.play(micMuted ? "mute" : "unmute") }
        applyMic()
    }

    func toggleDeafen() {
        if deafened {
            deafened = false
            micMuted = mutedBeforeDeafen
        } else {
            mutedBeforeDeafen = micMuted
            deafened = true
            micMuted = true
        }
        if state == .joined { CallSounds.play(deafened ? "deafen" : "undeafen") }
        applyMic()
    }

    func setTalking(_ on: Bool) {
        guard pushToTalk, talking != on else { return }
        talking = on
        applyMic()
    }

    func applyMic() {
        if pushToTalk { micMuted = false } else { talking = false }
        let published = micPublished
        let silenced = pushToTalk && !micEnabled
        let previous = micTask
        micTask = Task { [weak self] in
            await previous?.value
            _ = try? await self?.publisher?.localParticipant.setMicrophone(enabled: published)
            if published { AudioManager.shared.isMicrophoneMuted = silenced }
        }
        refresh()
    }

    func toggleCamera() {
        let enabled = !cameraOn
        Task {
            if enabled, await AVCaptureDevice.requestAccess(for: .video) == false { return }
            do {
                _ = try await publisher?.localParticipant.setCamera(enabled: enabled, captureOptions: cameraOptions)
                cameraOn = enabled
                CallSounds.play(enabled ? "camera_on" : "camera_off")
            } catch {
                NSLog("WZCALL camera: %@", String(describing: error))
            }
            refresh()
        }
    }

    func toggleScreenShare() {
        let enabled = !screenSharing
        Task {
            do {
                let publication = try await publisher?.localParticipant.setScreenShare(enabled: enabled)
                screenSharing = enabled && publication != nil
                CallSounds.play(screenSharing ? "screenshare_start" : "screenshare_stop")
            } catch {
                NSLog("WZCALL screen share: %@", String(describing: error))
                screenSharing = publisher?.localParticipant.isScreenShareEnabled() ?? false
            }
            refresh()
        }
    }

    func applyOutputVolume() {
        appliedVolumes = [:]
        refresh()
    }

    func setMicTesting(_ on: Bool) {
        micTesting = on
        applyMic()
    }

    static func applyPreferredInput() {
        let session = AVAudioSession.sharedInstance()
        guard let uid = UserDefaults.standard.string(forKey: "voice.inputUID"), !uid.isEmpty,
              let port = session.availableInputs?.first(where: { $0.uid == uid }) else { return }
        try? session.setPreferredInput(port)
    }

    func setVolume(_ volume: Double, for userId: String) {
        userVolumes[userId] = volume
        refresh()
    }

    func toggleLocalMute(_ userId: String) {
        if mutedUsers.contains(userId) { mutedUsers.remove(userId) } else { mutedUsers.insert(userId) }
        refresh()
    }

    func sendReaction(_ reaction: CallReaction) {
        guard let session else { return }
        show(reaction: reaction.emoji, for: session.identity)
        Task {
            do {
                try await session.sendReaction(emoji: reaction.emoji, name: reaction.name)
            } catch {
                NSLog("WZCALL reaction: %@", String(describing: error))
            }
        }
    }

    func toggleHand() {
        guard let session else { return }
        handRaised.toggle()
        let raise = handRaised
        if raise { raisedHands.insert(session.identity) } else { raisedHands.remove(session.identity) }
        if raise { CallSounds.play("raise_hand") }
        refresh()
        Task { try? await session.setHandRaised(raised: raise) }
    }

    private func show(reaction emoji: String, for identity: String) {
        reactions[identity] = emoji
        CallSounds.play("reaction")
        refresh()
        Task {
            try? await Task.sleep(for: .seconds(Self.reactionVisibleSeconds))
            if reactions[identity] == emoji { reactions[identity] = nil; refresh() }
        }
    }

    private func startRefreshing() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func announceWatchedScreens(_ list: [CallParticipantInfo]) {
        let shown = Set(list.filter { !$0.isLocal && $0.screenTrack != nil }.map(\.identity))
        guard shown != watchedScreens else { return }
        for owner in shown.subtracting(watchedScreens) { sendData(["owner": owner, "watching": true], topic: Self.streamWatchTopic) }
        for owner in watchedScreens.subtracting(shown) { sendData(["owner": owner, "watching": false], topic: Self.streamWatchTopic) }
        watchedScreens = shown
    }

    private func receiveStreamWatch(_ data: Data, from: String) {
        guard !from.isEmpty, let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let owner = message["owner"] as? String, owner == publisher?.localParticipant.identity?.stringValue else { return }
        if message["watching"] as? Bool == true { streamWatchers.insert(from) } else { streamWatchers.remove(from) }
        refresh()
    }

    private func refresh() {
        guard session != nil else { if !participants.isEmpty { participants = [] }; return }
        var remotes: [String: RemoteParticipant] = [:]
        for connection in connections.values {
            for (identity, participant) in connection.remoteParticipants { remotes[identity.stringValue] = participant }
        }
        let local = publisher?.localParticipant
        if let local, screenSharing, !local.isScreenShareEnabled() { screenSharing = false }
        if screenSharing { streamWatchers.formIntersection(remotes.keys) } else { streamWatchers = [] }
        var list: [CallParticipantInfo] = []
        var seen = Set<String>()
        for member in members where seen.insert(member.identity).inserted {
            let isLocal = member.isOwnDevice
            var info = CallParticipantInfo(identity: member.identity, userId: member.userId,
                                           deviceId: member.deviceId, isLocal: isLocal)
            info.isOwnOtherDevice = !isLocal && member.userId == client?.userId
            let participant: Participant? = isLocal ? local : remotes[member.identity]
            if let participant {
                info.connected = true
                info.speaking = participant.isSpeaking
                info.micMuted = !participant.isMicrophoneEnabled()
                info.cameraTrack = participant.videoTracks
                    .first { $0.source == .camera && !$0.isMuted }?.track as? VideoTrack
                info.screenTrack = participant.videoTracks
                    .first { $0.source == .screenShareVideo && !$0.isMuted }?.track as? VideoTrack
            }
            if isLocal { info.micMuted = !micPublished; info.connected = state == .joined }
            info.handRaised = raisedHands.contains(member.identity)
            info.reaction = reactions[member.identity]
            info.volume = userVolumes[member.userId] ?? 1
            info.locallyMuted = mutedUsers.contains(member.userId)
            if isLocal {
                var seenWatchers = Set<String>()
                info.screenWatchers = members.filter { streamWatchers.contains($0.identity) }.map(\.userId)
                    .filter { seenWatchers.insert($0).inserted }
            }
            list.append(info)

            // Deafen and per-person volume, applied only when they change
            if let remote = participant as? RemoteParticipant {
                let target = deafened || info.locallyMuted ? 0 : info.volume * outputVolume
                for publication in remote.audioTracks {
                    guard let track = publication.track as? RemoteAudioTrack else { continue }
                    let key = "\(member.identity)|\(publication.sid)"
                    if appliedVolumes[key] != target {
                        appliedVolumes[key] = target
                        track.volume = target
                    }
                }
            }
        }
        if list != participants { participants = list }
        announceWatchedScreens(list)
        liveActivity.update(activityState)
    }
}

struct RingingCall: Equatable {
    let roomId: String
    let eventId: String
    let callerId: String
    let callerName: String?
    let voiceOnly: Bool
    /// Rings audibly (DMs and small rooms), or only tells of a call in a larger room
    let ring: Bool
}

extension CallManager {
    var activityState: CallActivityAttributes.ContentState {
        let speaker = participants.first { $0.speaking && !$0.isLocal }
        return CallActivityAttributes.ContentState(
            micMuted: micMuted, deafened: deafened,
            othersSpeaking: speaker != nil,
            speakerName: speaker.map { displayNames[$0.userId] ?? $0.userId },
            participantCount: max(Set(participants.map(\.userId)).count, 1),
            ringing: ring == .ringing)
    }

    fileprivate func startRinging() {
        ring = .ringing
        ringback = CallSounds.loop("ringback")
    }

    func ringAgain() {
        guard ring != .ringing, let session else { return }
        Task {
            if (try? await session.ringAgain()) == true { startRinging() }
        }
    }

    fileprivate func endRinging(_ result: RingState) {
        stopRinging()
        ring = result
        CallSounds.play(result == .declined ? "call_declined" : "call_no_answer")
    }

    fileprivate func stopRinging() {
        ringback?.stop()
        ringback = nil
    }

    func watchIncoming(_ client: WizardClient, session: MatrixSession, onMissedCall: @escaping (IncomingCall) -> Void) {
        appSession = session
        self.onMissedCall = onMissedCall
        incomingWatch?.cancel()
        incomingWatch = client.watchIncomingCalls { [weak self] event in
            MainActor.assumeIsolated { self?.handleIncoming(event) }
        }
    }

    func stopWatchingIncoming() {
        incomingWatch?.cancel()
        incomingWatch = nil
        onMissedCall = nil
        dismissIncoming()
    }

    private func handleIncoming(_ event: IncomingCallEvent) {
        switch event {
        case .ringing(let ringing):
            ringIn(ringing.call)
        case .ended(let ended):
            if incoming?.roomId == ended.call.roomId { dismissIncoming() }
            if ended.call.ring, ended.reason == .callerLeft || ended.reason == .expired {
                onMissedCall?(ended.call)
            }
        }
    }

    private func ringIn(_ call: IncomingCall) {
        guard !isInCall(roomId: call.roomId) else { return }
        if let incoming, incoming.roomId != call.roomId { return }
        incoming = RingingCall(roomId: call.roomId, eventId: call.eventId, callerId: call.sender,
                               callerName: call.senderName, voiceOnly: call.intent != "video", ring: call.ring)
        if call.ring {
            guard incomingCallId == nil, ringtone == nil else { return }
            let id = UUID()
            incomingCallId = id
            let caller = call.senderName ?? call.sender
            Task {
                guard await !callKit.reportIncoming(id, caller: caller, video: call.intent == "video"),
                      incomingCallId == id else { return }
                incomingCallId = nil
                if incoming?.roomId == call.roomId, ringtone == nil { ringtone = CallSounds.ringtone() }
            }
        } else {
            ringtone?.stop()
            ringtone = nil
        }
    }

    private func answerFromSystem(_ id: UUID) {
        guard id == incomingCallId, let call = incoming, let session = appSession,
              let room = session.roomList?.room(id: call.roomId) else { return }
        incomingCallId = nil
        dismissIncoming()
        showCallScreen = !room.isVoice
        Task { await join(room, session: session, intent: call.voiceOnly ? "audio" : "video", answering: id) }
    }

    private func endFromSystem(_ id: UUID) {
        if id == incomingCallId {
            incomingCallId = nil
            guard let call = incoming else { return }
            dismissIncoming()
            if call.ring, let client = appSession?.client {
                Task { try? await client.declineCall(roomId: call.roomId, eventId: call.eventId) }
            }
        } else if id == callId {
            callId = nil
            leave()
        }
    }

    private func muteFromSystem(_ id: UUID, _ muted: Bool) {
        guard id == callId, !pushToTalk, muted != micMuted else { return }
        toggleMic()
    }

    func acceptIncoming(session: MatrixSession) {
        if let id = incomingCallId {
            callKit.answer(id)
            return
        }
        guard let call = incoming, let room = session.roomList?.room(id: call.roomId) else { return }
        dismissIncoming()
        showCallScreen = true
        Task { await join(room, session: session, intent: call.voiceOnly ? "audio" : "video", ring: false) }
    }

    func declineIncoming(session: MatrixSession) {
        if let id = incomingCallId {
            callKit.end(id)
            return
        }
        guard let call = incoming else { return }
        dismissIncoming()
        guard call.ring else { return }
        Task { try? await session.client?.declineCall(roomId: call.roomId, eventId: call.eventId) }
    }

    func dismissIncoming() {
        if let id = incomingCallId {
            incomingCallId = nil
            callKit.reportEnded(id, reason: .remoteEnded)
        }
        ringtone?.stop()
        ringtone = nil
        incoming = nil
    }
}

extension CallManager: RoomDelegate {
    nonisolated func room(_ room: LiveKit.Room, didUpdateConnectionState connectionState: ConnectionState,
                          from oldConnectionState: ConnectionState) {
        Task { @MainActor in
            if room === self.publisher { self.reconnecting = connectionState == .reconnecting }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, participant: RemoteParticipant?, didReceiveData data: Data,
                          forTopic topic: String, encryptionType: EncryptionType) {
        let from = participant?.identity?.stringValue ?? ""
        Task { @MainActor in
            if topic == WatchTogether.topic { self.watch?.receive(data, from: from) }
            if topic == Self.streamWatchTopic { self.receiveStreamWatch(data, from: from) }
        }
    }

    nonisolated func room(_ room: LiveKit.Room, didDisconnectWithError error: LiveKitError?) {
        Task { @MainActor in
            guard self.state == .joined else { return }
            if room === self.publisher {
                await self.fail(String(localized: "call.disconnected"), room: self.room)
            } else {
                self.remoteDisconnected(room)
            }
        }
    }
}

struct CallReaction: Identifiable, Hashable {
    var id: String { name }
    let emoji: String
    let name: String

    static let all: [CallReaction] = [
        .init(emoji: "👍", name: "thumbsup"), .init(emoji: "👎", name: "thumbsdown"),
        .init(emoji: "👏", name: "clap"), .init(emoji: "😂", name: "laugh"),
        .init(emoji: "😮", name: "wow"), .init(emoji: "❤️", name: "heart"),
        .init(emoji: "🎉", name: "party"), .init(emoji: "🔥", name: "fire"),
    ]
}
