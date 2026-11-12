import AVFoundation
import AVKit
import SwiftUI

struct VoiceVideoSettings: View {
    static let soundToggles: [(key: String, label: LocalizedStringKey)] = [
        ("mute", "settings.voiceVideo.sound.mute"), ("deafen", "settings.voiceVideo.sound.deafen"),
        ("camera", "settings.voiceVideo.sound.camera"), ("screenshare", "settings.voiceVideo.sound.screenshare"),
        ("join", "settings.voiceVideo.sound.join"), ("leave", "settings.voiceVideo.sound.leave"),
        ("ringtone", "settings.voiceVideo.sound.ringtone"), ("ringback", "settings.voiceVideo.sound.ringback"),
        ("callEnded", "settings.voiceVideo.sound.callEnded"), ("raiseHand", "settings.voiceVideo.sound.raiseHand"),
        ("reaction", "settings.voiceVideo.sound.reaction"), ("watchTogether", "settings.voiceVideo.sound.watchTogether"),
    ]

    @EnvironmentObject private var prefs: AppPreferences
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @AppStorage("voice.inputUID") private var inputUID = ""
    @AppStorage("voice.outputVolume") private var outputVolume = 1.0
    @AppStorage("voice.cameraPosition") private var cameraPosition = "front"
    @State private var inputs: [AVAudioSessionPortDescription] = []
    @State private var output = Self.currentOutput()
    @State private var routePicker = RoutePickerTrigger()
    @State private var previewing = false
    @State private var sounds: [String: Bool] = [:]

    var body: some View {
        SettingsPage(title: "settings.voiceVideo.title") {
            SettingsSection(title: "settings.voiceVideo.voice") {
                Picker(selection: $inputUID) {
                    Text(String(localized: "call.systemDefault")).tag("")
                    ForEach(inputs, id: \.uid) { Text(verbatim: $0.portName).tag($0.uid) }
                } label: {
                    Text(String(localized: "call.inputDevice")).foregroundStyle(theme.textPrimary)
                }
                .pickerStyle(.menu)
                .tint(theme.textMuted)
                Button { routePicker.present() } label: {
                    HStack(spacing: WZ.Space.space3) {
                        Text(String(localized: "call.outputDevice")).foregroundStyle(theme.textPrimary)
                        Spacer()
                        Text(verbatim: output).foregroundStyle(theme.textMuted).lineLimit(1)
                        Image(systemName: "airplay.audio")
                            .font(.system(size: WZ.SizeIcon.md))
                            .foregroundStyle(theme.accent)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(RoutePicker(trigger: routePicker).frame(width: 1, height: 1).opacity(0.01))
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    Text(String(localized: "call.outputVolume")).foregroundStyle(theme.textPrimary)
                    Slider(value: $outputVolume, in: 0...1)
                        .accessibilityLabel(String(localized: "call.outputVolume"))
                }
                MicTest()
            }
            SettingsSection(title: "settings.voiceVideo.inputMode") {
                ToggleRow(label: "settings.keybinds.pushToTalk", note: "settings.voiceVideo.pushToTalkNote", isOn: $prefs.pushToTalk)
            }
            SettingsSection(title: "settings.voiceVideo.video") {
                Picker(selection: $cameraPosition) {
                    Text(String(localized: "call.frontCamera")).tag("front")
                    Text(String(localized: "call.backCamera")).tag("back")
                } label: {
                    Text(String(localized: "call.camera")).foregroundStyle(theme.textPrimary)
                }
                .pickerStyle(.menu)
                .tint(theme.textMuted)
                if previewing {
                    CameraPreview(position: cameraPosition == "back" ? .back : .front)
                        .aspectRatio(3 / 4, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .listRowInsets(EdgeInsets(top: WZ.Space.space4, leading: WZ.Space.space4,
                                                  bottom: WZ.Space.space4, trailing: WZ.Space.space4))
                }
                SettingsActionButton(title: previewing ? "settings.voiceVideo.stopPreview" : "settings.voiceVideo.previewCamera",
                                     primary: !previewing) {
                    Task {
                        if !previewing, await AVCaptureDevice.requestAccess(for: .video) == false { return }
                        previewing.toggle()
                    }
                }
            }
            SettingsSection(title: "settings.voiceVideo.sounds") {
                ForEach(Self.soundToggles, id: \.key) { toggle in
                    CheckRow(label: toggle.label, isOn: Binding(
                        get: { sounds[toggle.key] ?? CallSounds.isOn(toggle.key) },
                        set: { on in
                            sounds[toggle.key] = on
                            UserDefaults.standard.set(on, forKey: CallSounds.defaultsKey(toggle.key))
                        }))
                }
            }
            SoundboardSettingsSection()
        }
        .onAppear { inputs = Self.availableInputs() }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification).receive(on: RunLoop.main)) { _ in
            output = Self.currentOutput()
        }
        .onChange(of: prefs.pushToTalk) { calls.applyMic() }
        .onChange(of: inputUID) { CallManager.applyPreferredInput() }
        .onChange(of: outputVolume) { calls.applyOutputVolume() }
    }
}

extension VoiceVideoSettings {
    static func currentOutput() -> String {
        AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName ?? UIDevice.current.model
    }

    static func availableInputs() -> [AVAudioSessionPortDescription] {
        let session = AVAudioSession.sharedInstance()
        guard session.category != .playAndRecord else { return session.availableInputs ?? [] }
        let previous = (session.category, session.mode, session.categoryOptions)
        try? session.setCategory(.playAndRecord, options: [.mixWithOthers, .allowBluetoothHFP])
        let inputs = session.availableInputs ?? []
        try? session.setCategory(previous.0, mode: previous.1, options: previous.2)
        return inputs
    }
}

private struct MicTest: View {
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var recorder: AVAudioRecorder?
    @State private var level: Double = 0
    @State private var failed = false
    @State private var ownsSession = false

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(String(localized: "settings.voiceVideo.inputLevel")).foregroundStyle(theme.textPrimary)
            GeometryReader { geometry in
                Capsule().fill(theme.fill)
                    .overlay(alignment: .leading) {
                        Capsule().fill(theme.success).frame(width: geometry.size.width * level)
                    }
            }
            .frame(height: WZ.Space.space3)
            .accessibilityHidden(true)
            SettingsActionButton(title: recorder == nil ? "settings.voiceVideo.startTest" : "settings.voiceVideo.stopTest",
                                 primary: recorder == nil) {
                Task { recorder == nil ? await start() : stop() }
            }
            Text(String(localized: failed ? "settings.voiceVideo.testFailed" : "settings.voiceVideo.testNote"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(failed ? theme.danger : theme.textMuted)
        }
        .padding(.vertical, WZ.Space.space2)
        .onDisappear { stop() }
    }

    private func start() async {
        failed = false
        guard await AVAudioApplication.requestRecordPermission() else { failed = true; return }
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            ownsSession = true
            try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try? session.setActive(true)
            CallManager.applyPreferredInput()
        }
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatAppleLossless, AVSampleRateKey: 44_100,
                                       AVNumberOfChannelsKey: 1]
        guard let recorder = try? AVAudioRecorder(url: URL(fileURLWithPath: "/dev/null"), settings: settings) else {
            failed = true
            return
        }
        recorder.isMeteringEnabled = true
        recorder.record()
        self.recorder = recorder
        calls.setMicTesting(true)
        while self.recorder === recorder {
            recorder.updateMeters()
            let power = Double(recorder.averagePower(forChannel: 0))
            withAnimation(.linear(duration: 0.05)) { level = min(max((power + 50) / 50, 0), 1) }
            try? await Task.sleep(for: .milliseconds(50))
        }
    }

    private func stop() {
        guard let recorder else { return }
        recorder.stop()
        self.recorder = nil
        level = 0
        calls.setMicTesting(false)
        if ownsSession {
            ownsSession = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

private struct SettingsActionButton: View {
    let title: String
    let primary: Bool
    let action: () -> Void

    var body: some View {
        Group {
            if primary {
                Button(String(localized: String.LocalizationValue(title)), action: action).buttonStyle(PrimaryButtonStyle())
            } else {
                Button(String(localized: String.LocalizationValue(title)), action: action).buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(.vertical, WZ.Space.space2)
    }
}

final class RoutePickerTrigger {
    fileprivate weak var view: AVRoutePickerView?

    func present() {
        view?.subviews.compactMap { $0 as? UIButton }.first?.sendActions(for: .touchUpInside)
    }
}

private struct RoutePicker: UIViewRepresentable {
    let trigger: RoutePickerTrigger

    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.prioritizesVideoDevices = false
        trigger.view = view
        return view
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {
        trigger.view = view
    }
}

private struct CameraPreview: UIViewRepresentable {
    let position: AVCaptureDevice.Position

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        let session = AVCaptureSession()
        var position: AVCaptureDevice.Position?

        func show(_ position: AVCaptureDevice.Position) {
            guard self.position != position else { return }
            self.position = position
            let session = session
            preview.session = session
            preview.videoGravity = .resizeAspectFill
            DispatchQueue.global(qos: .userInitiated).async {
                session.beginConfiguration()
                session.inputs.forEach(session.removeInput)
                if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
                   let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
                    session.addInput(input)
                }
                session.commitConfiguration()
                if !session.isRunning { session.startRunning() }
            }
        }

        deinit {
            let session = session
            DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
        }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.show(position)
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        view.show(position)
    }
}

struct SoundboardSettingsSection: View {
    @AppStorage(Soundboard.volumeKey) private var volume = 0.5
    @Environment(\.theme) private var theme

    var body: some View {
        SettingsSection(title: "settings.voiceVideo.soundboard.title") {
            VStack(alignment: .leading, spacing: WZ.Space.space2) {
                Text(String(localized: "settings.voiceVideo.soundboard.volume")).foregroundStyle(theme.textPrimary)
                Slider(value: $volume, in: 0...1)
                    .accessibilityLabel(String(localized: "settings.voiceVideo.soundboard.volume"))
            }
        }
    }
}
