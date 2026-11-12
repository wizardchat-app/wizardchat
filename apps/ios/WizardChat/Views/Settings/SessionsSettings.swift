import WizardChatCore
import SwiftUI

extension DeviceInfo: @retroactive Identifiable {
    public var id: String { deviceId }
    var name: String? { displayName }
    var lastSeen: Date? { lastSeenTs.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) } }
}

struct SessionsSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    @State private var devices: [DeviceInfo] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showRecoveryKeyEntry = false
    @State private var verification: VerificationModel?
    @State private var canLinkDevices = false
    @State private var linkingDevice = false
    @State private var newRecoveryKey: String?
    @State private var removing: DeviceInfo?
    private var isVerified: Bool { session.encryption?.deviceVerified == true }
    private var recoveryDisabled: Bool { session.encryption?.recovery == "disabled" }

    var body: some View {
        SettingsPage(title: "settings.sessions.title") {
            Text(String(localized: "settings.sessions.devicesDescription"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)

            encryptionBox

            if loading {
                ProgressView().tint(theme.accent).frame(maxWidth: .infinity)
            }
            if let current = devices.first(where: { $0.id == session.deviceId }) {
                SettingsSection(title: "settings.sessions.currentDevice") {
                    DeviceRow(device: current, isCurrent: true, verified: isVerified,
                              onRename: rename, onRemove: nil)
                }
            }
            if canLinkDevices && isVerified {
                SettingsSection {
                    Button { linkingDevice = true } label: {
                        Label(String(localized: "auth.qr.linkTitle"), image: "ph-qr-code-regular")
                    }
                    .foregroundStyle(theme.control)
                }
            }
            let others = devices.filter { $0.id != session.deviceId }
            if !others.isEmpty {
                SettingsSection(title: "settings.sessions.yourDevices") {
                    ForEach(Array(others.enumerated()), id: \.element.id) { index, device in
                        if index > 0 { SettingsDivider() }
                        DeviceRow(device: device, isCurrent: false, verified: device.isVerified,
                                  onRename: rename, onRemove: { removing = $0 },
                                  onVerify: device.isVerified ? nil : { verification = VerificationModel(.device($0.id)) })
                    }
                }
            } else if !loading && devices.isEmpty {
                Text(String(localized: "settings.sessions.noSessionsFound")).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
            }
            if let error { StatusText(text: error) }
        }
        .task {
            await reload()
            canLinkDevices = await session.canLinkDevices()
        }
        .sheet(isPresented: $linkingDevice, onDismiss: { Task { await reload() } }) { LinkDeviceSheet() }
        .sheet(isPresented: $showRecoveryKeyEntry, onDismiss: refreshState) { RecoveryKeyEntrySheet() }
        .sheet(item: $verification, onDismiss: { refreshState(); Task { await reload() } }) { model in
            VerificationSheet(model: model)
        }
        .sheet(item: $removing) { device in
            RemoveDeviceSheet(device: device) { await reload() }
        }
        .alert(String(localized: "settings.encryption.setUpRecoveryKey"), isPresented: Binding(get: { newRecoveryKey != nil },
                                                          set: { if !$0 { newRecoveryKey = nil } })) {
            Button(String(localized: "common.copy")) { UIPasteboard.general.string = newRecoveryKey }
            Button(String(localized: "common.done"), role: .cancel) {}
        } message: {
            Text(L10n.format("settings.encryption.recoveryKeySaveHint", newRecoveryKey ?? ""))
        }
    }

    @ViewBuilder
    private var encryptionBox: some View {
        SettingsSection(title: "settings.encryption.title") {
            HStack(spacing: WZ.Space.space4) {
                Image(isVerified ? "ph-shield-check-regular" : "ph-shield-warning-regular")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(isVerified ? theme.success : theme.danger)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(isVerified ? String(localized: "common.verified") : String(localized: "settings.sessions.unverified"))
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                    if !isVerified {
                        Text(String(localized: "settings.encryption.enterRecoveryKeyNote"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            SettingsDivider()
            VStack(spacing: WZ.Space.space4) {
                if !isVerified {
                    Button {
                        verification = VerificationModel(.ownDevice)
                    } label: {
                        Label(String(localized: "settings.encryption.verifyWithDevice"), image: "ph-devices-regular")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                if recoveryDisabled {
                    Button {
                        Task { await setUpRecovery(reset: false) }
                    } label: {
                        Label(String(localized: "settings.encryption.setUpRecoveryKey"), image: "ph-key-regular")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else {
                    Button {
                        showRecoveryKeyEntry = true
                    } label: {
                        Label(String(localized: "settings.keyBackup.enterRecoveryKeyTitle"), image: "ph-lock-open-regular")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    if isVerified {
                        Button {
                            Task { await setUpRecovery(reset: true) }
                        } label: {
                            Label(String(localized: "settings.encryption.resetKeys"), image: "ph-arrow-counter-clockwise-regular")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
        }
    }

    private func refreshState() {}

    private func reload() async {
        refreshState()
        loading = true
        defer { loading = false }
        do {
            devices = try await session.requireClient.devices()
                .sorted { ($0.lastSeen ?? .distantPast) > ($1.lastSeen ?? .distantPast) }
            error = nil
        } catch {
            self.error = L10n.format("settings.sessions.loadSessionsFailed", "\(error.localizedDescription)")
        }
    }

    private func rename(_ device: DeviceInfo, _ name: String) async {
        do {
            try await session.requireClient.renameDevice(deviceId: device.id, name: name)
            await reload()
        } catch {
            self.error = L10n.format("settings.sessions.renameSessionFailed", "\(error.localizedDescription)")
        }
    }

    private func setUpRecovery(reset: Bool) async {
        do {
            newRecoveryKey = reset ? try await session.resetRecoveryKey() : try await session.enableRecovery()
            refreshState()
        } catch {
            self.error = L10n.format("settings.keyBackup.setupFailed", "\(error.localizedDescription)")
        }
    }
}

private struct DeviceRow: View {
    let device: DeviceInfo
    let isCurrent: Bool
    let verified: Bool?
    let onRename: (DeviceInfo, String) async -> Void
    let onRemove: ((DeviceInfo) -> Void)?
    var onVerify: ((DeviceInfo) -> Void)?

    @Environment(\.theme) private var theme
    @State private var showDetails = false
    @State private var renaming = false
    @State private var newName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            HStack(spacing: WZ.Space.space4) {
                Image(icon)
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space8)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    HStack(spacing: WZ.Space.space3) {
                        Text(device.name ?? device.id)
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        if let verified {
                            Circle()
                                .fill(verified ? theme.success : theme.danger)
                                .frame(width: WZ.Space.space4, height: WZ.Space.space4)
                                .accessibilityLabel(verified ? String(localized: "common.verified") : String(localized: "settings.sessions.unverified"))
                        }
                    }
                    if let lastSeen = device.lastSeen {
                        Text(String(localized: "settings.sessions.lastActivity") + " " + lastSeen.formatted(.relative(presentation: .named)))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                Spacer()
                Menu {
                    Button { newName = device.name ?? ""; renaming = true } label: {
                        Label(menu: String(localized: "common.rename"), icon: "ph-pencil-simple-regular")
                    }
                    if let onRemove {
                        Button(role: .destructive) { onRemove(device) } label: {
                            Label(menu: String(localized: "common.remove"), icon: "ph-trash-regular", destructive: true)
                        }
                    }
                } label: {
                    Image("ph-dots-three-bold")
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                }
                .accessibilityLabel(String(localized: "common.menu"))
            }
            if let onVerify {
                Button(String(localized: "settings.sessions.verify")) { onVerify(device) }
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(maxWidth: WZ.Size.sidebar)
            }
            if renaming {
                VStack(alignment: .leading, spacing: WZ.Space.space3) {
                    HStack(spacing: WZ.Space.space4) {
                        TextField("", text: $newName).wizardField()
                        Button(String(localized: "common.save")) {
                            Task { await onRename(device, newName); renaming = false }
                        }
                        .buttonStyle(PrimaryButtonStyle()).frame(width: WZ.SizeAvatar.xl)
                        Button(String(localized: "common.cancel")) { renaming = false }
                            .buttonStyle(SecondaryButtonStyle()).frame(width: WZ.SizeAvatar.xl)
                    }
                    Text(String(localized: "settings.sessions.renameSessionHint"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                }
            }
            Button(showDetails ? String(localized: "settings.sessions.hideDetails") : String(localized: "settings.sessions.showDetails")) {
                withAnimation { showDetails.toggle() }
            }
            .font(.wizard(WZ.FontSize.sm, .semibold))
            .foregroundStyle(theme.control)
            if showDetails {
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    detail("settings.sessions.deviceId", device.id)
                    if let ip = device.lastSeenIp { detail("settings.sessions.ipAddress", ip) }
                }
            }
        }
    }

    private var icon: String {
        let name = (device.name ?? "").lowercased()
        if name.contains("ios") || name.contains("iphone") || name.contains("android") { return "ph-device-mobile-regular" }
        if name.contains("web") || name.contains("browser") { return "ph-globe-simple-regular" }
        return "ph-desktop-regular"
    }

    private func detail(_ label: LocalizedStringKey, _ value: String) -> some View {
        HStack(spacing: WZ.Space.space3) {
            Text(label).foregroundStyle(theme.textMuted)
            Text(value).foregroundStyle(theme.textPrimary).textSelection(.enabled)
        }
        .font(.wizard(WZ.FontSize.sm))
    }
}

private struct RemoveDeviceSheet: View {
    let device: DeviceInfo
    let onRemoved: () async -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(L10n.format("settings.sessions.removeConfirm", "\(device.name ?? device.id)"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                if session.isOAuthAccount {
                    Text(String(localized: "settings.sessions.sessionNotSupported"))
                        .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                    Button(String(localized: "settings.account.manageAccount")) {
                        Task {
                            if let url = await session.accountManagementUrl() {
                                openURL(url)
                            }
                            dismiss()
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    SecureField("", text: $password, prompt: Text(String(localized: "settings.sessions.passwordPlaceholder")).foregroundColor(theme.textMuted))
                        .wizardField()
                    Button(String(localized: "settings.sessions.confirmRemove")) { Task { await remove() } }
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textOnAccent)
                        .frame(maxWidth: .infinity, minHeight: WZ.Space.space10)
                        .background(theme.danger, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
                        .disabled(busy || password.isEmpty)
                }
                if let error { StatusText(text: error) }
                Spacer()
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.sessions.removeSession"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private func remove() async {
        busy = true; defer { busy = false }
        do {
            try await session.deleteDevices([device.id], password: password)
            await onRemoved()
            dismiss()
        } catch {
            self.error = String(localized: "settings.sessions.incorrectPassword")
        }
    }
}

struct RecoveryKeyEntrySheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(String(localized: "settings.keyBackup.enterRecoveryKeyTitle"))
                    .font(.wizard(WZ.FontSize.xl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(String(localized: "settings.encryption.enterRecoveryKeyNote"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                TextField("", text: $key, prompt: Text("EsTc ...").foregroundColor(theme.textMuted), axis: .vertical)
                    .font(.system(size: WZ.SizeIcon.sm, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .lineLimit(2...4)
                    .wizardField()
                Button(busy ? "..." : String(localized: "settings.keyBackup.restoreBtn")) {
                    Task {
                        busy = true; defer { busy = false }
                        do {
                            try await session.recover(with: key)
                            dismiss()
                        } catch {
                            self.error = String(localized: "settings.encryption.wrongKey")
                        }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || key.trimmingCharacters(in: .whitespaces).isEmpty)
                if let error { StatusText(text: error) }
                Spacer()
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}
