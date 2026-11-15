import WizardChatCore
import PhotosUI
import SwiftUI

struct ProfileSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme

    @State private var displayName = ""
    @State private var savingName = false
    @State private var canSetPronouns = false
    @State private var savedPronouns = ""
    @State private var pronouns = ""
    @State private var savingPronouns = false
    @State private var banner: String?
    @State private var pickingAvatar = false
    @State private var pickingBanner = false
    @State private var avatarPhoto: PhotosPickerItem?
    @State private var bannerPhoto: PhotosPickerItem?
    @State private var confirmRemoveAvatar = false
    @State private var confirmRemoveBanner = false
    @State private var status: (String, Bool)?
    @State private var editingStatus = false

    var body: some View {
        SettingsPage(title: "settings.profile.title") {
            Section {
                ProfileCard(
                    banner: banner,
                    pronouns: savedPronouns,
                    onAvatar: { pickingAvatar = true },
                    onRemoveAvatar: session.avatarUrl == nil ? nil : { confirmRemoveAvatar = true },
                    onBanner: { pickingBanner = true },
                    onRemoveBanner: banner == nil ? nil : { confirmRemoveBanner = true },
                    onStatus: { editingStatus = true }
                )
                .listRowInsets(EdgeInsets())
            }

            SettingsSection {
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
            }

            if let status { StatusText(text: status.0, isError: status.1) }
        }
        .sheet(isPresented: $editingStatus) { CustomStatusSheet() }
        .photosPicker(isPresented: $pickingAvatar, selection: $avatarPhoto, matching: .images)
        .photosPicker(isPresented: $pickingBanner, selection: $bannerPhoto, matching: .images)
        .confirmationDialog(String(localized: "common.removeAvatarConfirm"), isPresented: $confirmRemoveAvatar, titleVisibility: .visible) {
            Button(String(localized: "common.removeAvatar"), role: .destructive) {
                Task { await run { try await session.removeAvatar() } }
            }
        }
        .confirmationDialog(String(localized: "profile.removeBannerConfirm"), isPresented: $confirmRemoveBanner, titleVisibility: .visible) {
            Button(String(localized: "profile.removeBanner"), role: .destructive) {
                Task {
                    await run {
                        try await session.client?.setBanner()
                        banner = nil
                    }
                }
            }
        }
        .onAppear { displayName = session.displayName ?? "" }
        .task {
            guard let userId = session.userId else { return }
            banner = (try? await session.client?.banner(userId: userId)) ?? nil
            canSetPronouns = await session.canSetPronouns()
            savedPronouns = await session.pronouns(of: userId) ?? ""
            pronouns = savedPronouns
        }
        .onChange(of: avatarPhoto) { _, item in
            guard let item else { return }
            Task {
                await run {
                    guard let jpeg = try await Self.jpeg(item) else { return }
                    try await session.setAvatar(jpeg, mimeType: "image/jpeg")
                }
                avatarPhoto = nil
            }
        }
        .onChange(of: bannerPhoto) { _, item in
            guard let item, let client = session.client, let userId = session.userId else { return }
            Task {
                await run {
                    guard let jpeg = try await Self.jpeg(item) else { return }
                    try await client.setBanner(data: jpeg, mimetype: "image/jpeg")
                    banner = try await client.banner(userId: userId)
                }
                bannerPhoto = nil
            }
        }
    }

    private static func jpeg(_ item: PhotosPickerItem) async throws -> Data? {
        guard let data = try await item.loadTransferable(type: Data.self) else { return nil }
        return UIImage(data: data)?.jpegData(compressionQuality: 0.85)
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

private struct ProfileCard: View {
    let banner: String?
    let pronouns: String
    let onAvatar: () -> Void
    let onRemoveAvatar: (() -> Void)?
    let onBanner: () -> Void
    let onRemoveBanner: (() -> Void)?
    let onStatus: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @State private var bannerImage: UIImage?

    private let bannerHeight: CGFloat = 112
    private let avatarSize = WZ.SizeAvatar.xxl
    private let ring: CGFloat = 5

    var body: some View {
        let name = session.displayName ?? session.userId ?? ""
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                bannerView
                Menu {
                    Button(action: onBanner) { Label(menu: String(localized: "settings.profile.changeBanner"), icon: "ph-image-regular") }
                    if let onRemoveBanner {
                        Button(role: .destructive, action: onRemoveBanner) { Label(menu: String(localized: "profile.removeBanner"), icon: "ph-trash-regular", destructive: true) }
                    }
                } label: {
                    editBadge
                }
                .accessibilityLabel(String(localized: "settings.profile.editBanner"))
                .padding(WZ.Space.space4)
            }
            .frame(height: bannerHeight)
            .clipped()

            HStack(alignment: .top, spacing: WZ.Space.space3) {
                Menu {
                    Button(action: onAvatar) { Label(menu: String(localized: "settings.profile.changeAvatar"), icon: "ph-image-regular") }
                    if let onRemoveAvatar {
                        Button(role: .destructive, action: onRemoveAvatar) { Label(menu: String(localized: "common.removeAvatar"), icon: "ph-trash-regular", destructive: true) }
                    }
                } label: {
                    AvatarView(name: name, url: session.avatarUrl, size: avatarSize)
                        .padding(ring)
                        .background(theme.groupedRow, in: Circle())
                        .overlay(alignment: .bottomTrailing) { editBadge.scaleEffect(0.8).offset(x: -ring, y: -ring) }
                }
                .accessibilityLabel(String(localized: "settings.profile.editAvatar"))
                .padding(.top, -(avatarSize / 2 + ring))
                statusBubble
                    .padding(.top, WZ.Space.space3)
            }
            .padding(.horizontal, WZ.Space.space6 - ring)
            .padding(.top, WZ.Space.space0)

            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(name)
                    .font(.wizard(WZ.FontSize.xxl, .semibold))
                    .foregroundStyle(theme.textPrimary)
                if !pronouns.isEmpty {
                    Text(pronouns).font(.wizard(WZ.FontSize.md)).foregroundStyle(theme.textSecondary)
                }
                HStack(spacing: WZ.Space.space3) {
                    Text(session.userId ?? "")
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .truncationMode(.middle)
                    Button {
                        UIPasteboard.general.string = session.userId
                    } label: {
                        Image("ph-copy-regular").font(.system(size: WZ.SizeIcon.xs))
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(theme.control)
                    .accessibilityLabel(String(localized: "common.copy"))
                }
            }
            .lineLimit(1)
            .padding(.horizontal, WZ.Space.space6)
            .padding(.top, WZ.Space.space4)
            .padding(.bottom, WZ.Space.space6)
        }
        .task(id: banner) {
            guard let banner, let mediaLoader else {
                bannerImage = nil
                return
            }
            bannerImage = await mediaLoader.thumbnail(banner, size: 1200)
        }
    }

    @ViewBuilder
    private var bannerView: some View {
        if let bannerImage {
            Image(uiImage: bannerImage)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: bannerHeight)
        } else {
            LinearGradient(colors: [theme.accent, theme.accent.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    private var editBadge: some View {
        Image("ph-pencil-simple-fill")
            .font(.system(size: WZ.SizeIcon.xs))
            .foregroundStyle(.white)
            .frame(width: WZ.Space.space9, height: WZ.Space.space9)
            .background(Color.black.opacity(0.55), in: Circle())
    }

    private var statusBubble: some View {
        let text = session.customStatus?.text
        let parts = StatusEmoji.split(text ?? "")
        let emojiOnly = !parts.emoji.isEmpty && parts.rest.isEmpty
        return Button(action: onStatus) {
            Group {
                if let text {
                    Text(text)
                        .font(emojiOnly ? .system(size: 26) : .wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                } else {
                    HStack(spacing: WZ.Space.space2) {
                        Image("ph-plus-circle-fill").font(.system(size: WZ.SizeIcon.xs))
                        Text(String(localized: "status.addStatus")).italic()
                    }
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                }
            }
            .padding(.leading, StatusBubble.tail + WZ.Space.space4)
            .padding(.trailing, WZ.Space.space5)
            .padding(.vertical, emojiOnly ? WZ.Space.space1 : WZ.Space.space3)
            .background {
                StatusBubble().fill(theme.bgSecondary)
                StatusBubble().stroke(theme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct StatusBubble: Shape {
    static let tail: CGFloat = 5

    func path(in rect: CGRect) -> Path {
        let tail = Self.tail
        let body = CGRect(x: rect.minX + tail, y: rect.minY, width: rect.width - tail, height: rect.height)
        let left = min(10, body.height / 2)
        let right = min(16, body.height / 2)
        let half: CGFloat = 4.5
        var path = Path()
        path.move(to: CGPoint(x: body.minX + left, y: body.minY))
        path.addLine(to: CGPoint(x: body.maxX - right, y: body.minY))
        path.addArc(tangent1End: CGPoint(x: body.maxX, y: body.minY), tangent2End: CGPoint(x: body.maxX, y: body.minY + right), radius: right)
        path.addLine(to: CGPoint(x: body.maxX, y: body.maxY - right))
        path.addArc(tangent1End: CGPoint(x: body.maxX, y: body.maxY), tangent2End: CGPoint(x: body.maxX - right, y: body.maxY), radius: right)
        path.addLine(to: CGPoint(x: body.minX + left, y: body.maxY))
        path.addArc(tangent1End: CGPoint(x: body.minX, y: body.maxY), tangent2End: CGPoint(x: body.minX, y: body.maxY - left), radius: left)
        path.addLine(to: CGPoint(x: body.minX, y: body.midY + half))
        path.addLine(to: CGPoint(x: rect.minX, y: body.midY))
        path.addLine(to: CGPoint(x: body.minX, y: body.midY - half))
        path.addLine(to: CGPoint(x: body.minX, y: body.minY + left))
        path.addArc(tangent1End: CGPoint(x: body.minX, y: body.minY), tangent2End: CGPoint(x: body.minX + left, y: body.minY), radius: left)
        path.closeSubpath()
        return path
    }
}

struct AccountSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    @State private var status: (String, Bool)?
    @State private var showDeactivate = false

    var body: some View {
        SettingsPage(title: "settings.account.title") {
            if session.isOAuthAccount {
                SettingsSection {
                    Text(String(localized: "settings.account.externalManagement"))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                        .padding(.vertical, WZ.Space.space2)
                    actionRow("settings.account.manageAccount", icon: "ph-arrow-square-out-regular") {
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
            if let status { StatusText(text: status.0, isError: status.1) }
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
                if session.customStatus != nil {
                    Section {
                        Button(String(localized: "status.clearStatus"), role: .destructive) { clear() }
                            .foregroundStyle(theme.error)
                            .frame(maxWidth: .infinity)
                            .disabled(saving)
                    }
                    .listRowBackground(theme.groupedRow)
                }
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

    private func clear() {
        saving = true
        Task {
            defer { saving = false }
            do {
                try await session.setCustomStatus("", expiresAt: nil)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
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
