import SwiftUI

struct CreateSpaceView: View {
    let onDone: (String) -> Void
    var onJoined: ((String, Bool) -> Void)?
    var onCreateRoom: (() -> Void)?

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Mode { case choose, create, join }

    @State private var mode: Mode
    private let startsInJoin: Bool
    @State private var joinTarget = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    init(startInJoin: Bool = false, onDone: @escaping (String) -> Void,
         onJoined: ((String, Bool) -> Void)? = nil, onCreateRoom: (() -> Void)? = nil) {
        self.onDone = onDone
        self.onJoined = onJoined
        self.onCreateRoom = onCreateRoom
        startsInJoin = startInJoin
        _mode = State(initialValue: startInJoin ? .join : .choose)
    }

    var body: some View {
        if mode == .create {
            CreateRoomView(onSpaceCreated: onDone) { mode = .choose }
        } else {
            NavigationStack {
                ThemedForm {
                    switch mode {
                    case .join: joinForm
                    default: chooser
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                    }
                }
                .navigationTitle(mode == .join ? String(localized: "space.join.title") : String(localized: "space.addSpace"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        if mode == .choose || startsInJoin {
                            Button(String(localized: "common.cancel")) { dismiss() }
                        } else {
                            Button(String(localized: "common.back")) {
                                errorMessage = nil
                                mode = .choose
                            }
                        }
                    }
                    if mode == .join {
                        ToolbarItem(placement: .confirmationAction) {
                            if isWorking { ProgressView() } else {
                                Button(String(localized: "common.join")) { Task { await join() } }
                                    .disabled(joinTarget.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                        }
                    }
                }
                .tint(theme.control)
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var chooser: some View {
        Section {
            choice(icon: "ph-plus-circle-regular", title: String(localized: "space.create.title"),
                   note: String(localized: "space.addSpaceHint")) { mode = .create }
            choice(icon: "ph-link-simple-regular", title: String(localized: "space.join.title"),
                   note: String(localized: "space.joinHint")) { mode = .join }
        } footer: {
            if let onCreateRoom {
                Button {
                    onCreateRoom()
                    dismiss()
                } label: {
                    Text(String(localized: "space.join.createRoomInstead"))
                        .underline()
                        .foregroundStyle(theme.accent)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func choice(icon: String, title: String, note: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: WZ.Space.space5) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: WZ.SizeIcon.lg)
                VStack(alignment: .leading, spacing: WZ.Space.space0) {
                    Text(title).foregroundStyle(theme.textPrimary)
                    Text(note).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
                Spacer(minLength: WZ.Space.space4)
                Image("ph-caret-right-bold")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var joinForm: some View {
        Section {
            TextField(String(localized: "space.join.spaceIdPlaceholder"), text: $joinTarget)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await join() } }
        } header: {
            Text(String(localized: "space.join.spaceId"))
        } footer: {
            Text(String(localized: "space.joinHint"))
        }
    }

    private func join() async {
        guard !joinTarget.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let roomId = try await session.join(joinTarget)
            if let onJoined {
                let isSpace = (try? await session.requireClient.roomDetails(roomId: roomId))?.isSpace
                    ?? (session.roomList?.allSpaces.contains { $0.id == roomId } == true)
                onJoined(roomId, isSpace)
            } else {
                onDone(roomId)
            }
            dismiss()
        } catch {
            errorMessage = L10n.format("common.joinFailed", "\(error)")
        }
    }
}
