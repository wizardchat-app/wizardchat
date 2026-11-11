import WizardChatCore
import PhotosUI
import SwiftUI

struct AccountSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    @State private var displayName = ""
    @State private var savingName = false
    @State private var canSetPronouns = false
    @State private var savedPronouns = ""
    @State private var pronouns = ""
    @State private var savingPronouns = false
    @State private var photo: PhotosPickerItem?
    @State private var status: (String, Bool)?
    @State private var showDeactivate = false
    @State private var editingStatus = false

    var body: some View {
        SettingsPage(title: "settings.account.title") {
            SettingsSection {
                HStack(spacing: WZ.Space.space5) {
                    let name = session.displayName ?? session.userId ?? ""
                    AvatarView(name: name, url: session.avatarUrl, size: WZ.SizeAvatar.lg)
                    VStack(alignment: .leading, spacing: WZ.Space.space4) {
                        PhotosPicker(selection: $photo, matching: .images) {
                            Text(String(localized: "settings.emojisStickers.upload")).font(.wizard(WZ.FontSize.md, .semibold))
                        }
                        if session.avatarUrl != nil {
                            Button(String(localized: "common.remove"), role: .destructive) {
                                Task { await run { try await session.removeAvatar() } }
                            }
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.error)
                        }
                    }
                    Spacer()
                }
                SettingsDivider()
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    Text(String(localized: "settings.account.displayName"))
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.textMuted)
                    HStack(spacing: WZ.Space.space4) {
                        TextField("", text: $displayName,
                                  prompt: Text(String(localized: "settings.account.displayNamePlaceholder")).foregroundColor(theme.textMuted))
                            .wizardField()
                        Button(savingName ? "..." : String(localized: "common.save")) {
                            Task {
                                savingName = true
                                await run { try await session.setDisplayName(displayName.trimmingCharacters(in: .whitespaces)) }
                                savingName = false
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .frame(width: WZ.SizeAvatar.xl)
                        .disabled(savingName || displayName.trimmingCharacters(in: .whitespaces).isEmpty
                                  || displayName == session.displayName)
                    }
                }
                if canSetPronouns {
                    SettingsDivider()
                    VStack(alignment: .leading, spacing: WZ.Space.space4) {
                        Text(String(localized: "profile.pronouns"))
                            .font(.wizard(WZ.FontSize.sm, .semibold))
                            .foregroundStyle(theme.textMuted)
                        HStack(spacing: WZ.Space.space4) {
                            TextField("", text: $pronouns,
                                      prompt: Text(String(localized: "profile.pronounsPlaceholder")).foregroundColor(theme.textMuted))
                                .wizardField()
                                .onChange(of: pronouns) { _, value in
                                    if value.count > Pronouns.maxLength { pronouns = String(value.prefix(Pronouns.maxLength)) }
                                }
                            Button(savingPronouns ? "..." : String(localized: "common.save")) {
                                Task {
                                    savingPronouns = true
                                    await run {
                                        try await session.setPronouns(pronouns)
                                        savedPronouns = pronouns.trimmingCharacters(in: .whitespacesAndNewlines)
                                        pronouns = savedPronouns
                                    }
                                    savingPronouns = false
                                }
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .frame(width: WZ.SizeAvatar.xl)
                            .disabled(savingPronouns || pronouns.trimmingCharacters(in: .whitespacesAndNewlines) == savedPronouns)
                        }
                    }
                }
                SettingsDivider()
                CopyRow(label: "auth.username", value: session.userId ?? "")
            }

            SettingsSection(title: "status.title") {
                HStack(spacing: WZ.Space.space4) {
                    VStack(alignment: .leading, spacing: WZ.Space.space1) {
                        Text(String(localized: "status.customStatus")).font(.wizard(WZ.FontSize.md))
                        Text(session.customStatus?.text ?? String(localized: "status.none"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                    Spacer()
                    Button(String(localized: session.customStatus == nil ? "status.setCustomStatus" : "status.editCustomStatus")) {
                        editingStatus = true
                    }
                    .font(.wizard(WZ.FontSize.md, .semibold))
                }
                if session.customStatus != nil {
                    SettingsDivider()
                    actionRow("status.clearStatus", icon: "ph-x-regular", destructive: true) {
                        await run { try await session.setCustomStatus("", expiresAt: nil) }
                    }
                }
            }
            .sheet(isPresented: $editingStatus) { CustomStatusSheet() }

            if let status { StatusText(text: status.0, isError: status.1) }

            if session.isOAuthAccount {
                SettingsSection(note: "settings.account.externalManagement") {
                    actionRow("settings.account.manageAccount", icon: "ph-arrow-square-out-regular") {
                        await open()
                    }
                    SettingsDivider()
                    actionRow("settings.account.deactivateAccount", icon: "ph-user-minus-regular", destructive: true) {
                        await open()
                    }
                }
            } else {
                PasswordSection()
                EmailSection()
                SettingsSection {
                    actionRow("settings.account.deactivateAccount", icon: "ph-user-minus-regular", destructive: true) {
                        showDeactivate = true
                    }
                }
            }
        }
        .onAppear { displayName = session.displayName ?? "" }
        .task {
            guard let userId = session.userId else { return }
            canSetPronouns = await session.canSetPronouns()
            savedPronouns = await session.pronouns(of: userId) ?? ""
            pronouns = savedPronouns
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                await run {
                    guard let data = try await item.loadTransferable(type: Data.self),
                          let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.85) else { return }
                    try await session.setAvatar(jpeg, mimeType: "image/jpeg")
                }
                photo = nil
            }
        }
        .sheet(isPresented: $showDeactivate) { DeactivateSheet() }
    }

    private func actionRow(_ title: LocalizedStringKey, icon: String, destructive: Bool = false,
                           action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack {
                Text(title).font(.wizard(WZ.FontSize.md))
                Spacer()
                Image(icon).font(.system(size: WZ.SizeIcon.sm))
            }
            .foregroundStyle(destructive ? theme.error : theme.textPrimary)
            .frame(minHeight: WZ.Space.space11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func open() async {
        if let url = await session.accountManagementUrl() {
            openURL(url)
        } else {
            status = (String(localized: "settings.account.authMethodUnsupported"), true)
        }
    }

    private func run(_ work: () async throws -> Void) async {
        status = nil
        do {
            try await work()
        } catch {
            status = ("\(error.localizedDescription)", true)
        }
    }
}

private struct PasswordSection: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var current = ""
    @State private var new = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var status: (String, Bool)?

    var body: some View {
        SettingsSection(title: "auth.password") {
            VStack(spacing: WZ.Space.space4) {
                SecureField("", text: $current, prompt: Text(String(localized: "auth.password")).foregroundColor(theme.textMuted))
                    .textContentType(.password).wizardField()
                SecureField("", text: $new, prompt: Text(String(localized: "settings.account.newPassword")).foregroundColor(theme.textMuted))
                    .textContentType(.newPassword).wizardField()
                SecureField("", text: $confirm, prompt: Text(String(localized: "settings.account.confirmNewPassword")).foregroundColor(theme.textMuted))
                    .textContentType(.newPassword).wizardField()
                Button(String(localized: "settings.account.changePassword")) { Task { await change() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || current.isEmpty || new.isEmpty || confirm.isEmpty)
                if let status { StatusText(text: status.0, isError: status.1) }
            }
        }
    }

    private func change() async {
        guard new.count >= 8 else {
            status = (String(localized: "settings.account.passwordTooShort"), true); return
        }
        guard new == confirm else {
            status = (String(localized: "common.passwordMismatch"), true); return
        }
        busy = true
        defer { busy = false }
        do {
            try await session.changePassword(current: current, new: new)
            current = ""; new = ""; confirm = ""
            status = (String(localized: "settings.account.passwordChanged"), false)
        } catch {
            status = (error.localizedDescription, true)
        }
    }
}

private struct EmailSection: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var emails: [String] = []
    @State private var newEmail = ""
    @State private var pending: (sid: String, secret: String)?
    @State private var password = ""
    @State private var busy = false
    @State private var status: (String, Bool)?

    var body: some View {
        SettingsSection(title: "settings.account.emailTitle") {
            VStack(alignment: .leading, spacing: WZ.Space.space4) {
                if emails.isEmpty {
                    Text(String(localized: "settings.account.noEmails"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
                ForEach(emails, id: \.self) { email in
                    HStack {
                        Text(email).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textPrimary)
                        Spacer()
                        Button(String(localized: "settings.account.removeEmail"), role: .destructive) {
                            Task { await remove(email) }
                        }
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.error)
                    }
                }
                if pending == nil {
                    HStack(spacing: WZ.Space.space4) {
                        TextField("", text: $newEmail, prompt: Text(String(localized: "settings.account.emailPlaceholder")).foregroundColor(theme.textMuted))
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .wizardField()
                        Button(String(localized: "settings.account.addEmail")) { Task { await requestToken() } }
                            .buttonStyle(PrimaryButtonStyle())
                            .frame(width: WZ.SizeAvatar.xxl)
                            .disabled(busy || !newEmail.contains("@"))
                    }
                } else {
                    Text(String(localized: "settings.account.checkEmail"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                    Text(String(localized: "settings.account.emailLinkHint"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                    SecureField("", text: $password, prompt: Text(String(localized: "auth.password")).foregroundColor(theme.textMuted))
                        .wizardField()
                    Button(String(localized: "settings.account.verify")) { Task { await finish() } }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(busy)
                }
                if let status { StatusText(text: status.0, isError: status.1) }
            }
        }
        .task { emails = (try? await session.emailAddresses()) ?? [] }
    }

    private func requestToken() async {
        busy = true; defer { busy = false }
        do {
            pending = try await session.requestEmailToken(newEmail)
            status = nil
        } catch { status = (error.localizedDescription, true) }
    }

    private func finish() async {
        guard let pending else { return }
        busy = true; defer { busy = false }
        do {
            try await session.addEmail(sid: pending.sid, secret: pending.secret, password: password)
            self.pending = nil; newEmail = ""; password = ""
            emails = (try? await session.emailAddresses()) ?? emails
            status = (String(localized: "settings.account.emailAdded"), false)
        } catch { status = (error.localizedDescription, true) }
    }

    private func remove(_ email: String) async {
        do {
            try await session.removeEmail(email)
            emails.removeAll { $0 == email }
            status = (String(localized: "settings.account.emailRemoved"), false)
        } catch { status = (error.localizedDescription, true) }
    }
}

private struct DeactivateSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var erase = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: WZ.Space.space5) {
                Text(String(localized: "settings.account.deactivateConfirm"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                Toggle(String(localized: "settings.account.eraseData"), isOn: $erase)
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textPrimary)
                    .tint(theme.danger)
                SecureField("", text: $password, prompt: Text(String(localized: "auth.password")).foregroundColor(theme.textMuted))
                    .wizardField()
                Button(String(localized: "settings.account.deactivateAccount")) {
                    Task {
                        busy = true; defer { busy = false }
                        do { try await session.deactivateAccount(password: password, eraseData: erase) }
                        catch let failure { error = failure.localizedDescription }
                    }
                }
                .font(.wizard(WZ.FontSize.md, .semibold))
                .foregroundStyle(theme.textOnAccent)
                .frame(maxWidth: .infinity, minHeight: WZ.Space.space10)
                .background(theme.danger, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
                .disabled(busy || password.isEmpty)
                if let error { StatusText(text: error) }
                Spacer()
            }
            .padding(WZ.Space.space6)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "settings.account.deactivateAccount"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
            }
        }
        .presentationDetents([.medium])
    }
}

struct CustomStatusSheet: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var clearAfter = ClearAfter.today
    @State private var saving = false
    @State private var error: String?
    @State private var pickingEmoji = false
    @State private var emoji = ""

    enum ClearAfter: CaseIterable, Hashable {
        case today, fourHours, oneHour, thirtyMinutes, never

        var label: String {
            switch self {
            case .today: String(localized: "status.clearToday")
            case .fourHours: L10n.format("status.clearHours", 4)
            case .oneHour: L10n.format("status.clearHours", 1)
            case .thirtyMinutes: L10n.format("status.clearMinutes", 30)
            case .never: String(localized: "status.clearNever")
            }
        }

        var expiry: Date? {
            switch self {
            case .today: Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: .now))
            case .fourHours: .now.addingTimeInterval(4 * 3600)
            case .oneHour: .now.addingTimeInterval(3600)
            case .thirtyMinutes: .now.addingTimeInterval(30 * 60)
            case .never: nil
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: WZ.Space.space4) {
                        Button {
                            pickingEmoji = true
                        } label: {
                            Group {
                                if emoji.isEmpty {
                                    Image("ph-smiley-regular")
                                        .font(.system(size: WZ.SizeIcon.md))
                                        .foregroundStyle(theme.textMuted)
                                } else {
                                    Text(emoji).font(.system(size: 24))
                                }
                            }
                            .frame(width: 32, height: 32)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: emoji.isEmpty ? "status.addEmoji" : "status.changeEmoji"))
                        .overlay(alignment: .topTrailing) {
                            if !emoji.isEmpty {
                                Button {
                                    emoji = ""
                                } label: {
                                    Image("ph-x-bold")
                                        .font(.system(size: 8))
                                        .foregroundStyle(theme.textMuted)
                                        .frame(width: 16, height: 16)
                                        .background(Circle().fill(theme.bgTertiary))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(String(localized: "status.removeEmoji"))
                                .offset(x: 6, y: -6)
                            }
                        }
                        TextField("", text: $text, prompt: Text(String(localized: "status.placeholder")).foregroundColor(theme.textMuted))
                            .font(.wizard(WZ.FontSize.lg))
                            .onChange(of: text) { _, value in
                                let limit = 128 - (emoji.isEmpty ? 0 : emoji.count + 1)
                                if value.count > limit { text = String(value.prefix(limit)) }
                            }
                    }
                } header: {
                    Text(String(localized: "status.whatsUp")).foregroundStyle(theme.textMuted)
                }
                .listRowBackground(theme.groupedRow)
                Section {
                    Picker(String(localized: "status.clearAfter"), selection: $clearAfter) {
                        ForEach(ClearAfter.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .tint(theme.textMuted)
                }
                .listRowBackground(theme.groupedRow)
                if let error {
                    StatusText(text: error).listRowBackground(Color.clear)
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.groupedBackground.ignoresSafeArea())
            .navigationTitle(String(localized: "status.setCustomStatus"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save")) { save() }
                        .fontWeight(.semibold)
                        .disabled(saving)
                }
            }
            .tint(theme.control)
        }
        .presentationDetents([.medium])
        .sheet(isPresented: $pickingEmoji) {
            EmojiGrid(packs: [], unicodeOnly: true) { picked, image in
                if image == nil { emoji = picked }
                pickingEmoji = false
            }
            .padding(.top, WZ.Space.space4)
            .background(theme.bgSecondary.ignoresSafeArea())
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .onAppear {
            let parts = StatusEmoji.split(session.customStatus?.text ?? "")
            emoji = parts.emoji
            text = parts.rest
            clearAfter = session.customStatus == nil || session.customStatus?.expiresAt != nil ? .today : .never
        }
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                try await session.setCustomStatus(StatusEmoji.join(emoji, text), expiresAt: clearAfter.expiry)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
