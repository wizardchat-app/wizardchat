import AuthenticationServices
import WizardChatCore
import SwiftUI

/// Sign in or create an account. It asks the server what it supports first and only offers
/// that: the server's own page (OIDC), a password form, or single sign-on.
struct LoginView: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @Environment(\.theme) private var theme

    private enum Mode { case login, register }

    private enum UsernameState { case idle, checking, available, taken, reserved, invalid }

    private static let presets = ["https://matrix.org", "https://mozilla.org", "https://unredacted.org"]
    private static let serverListURL = URL(string: "https://servers.joinmatrix.org")!
    private static let custom = "custom"
    private static let localpartCharacters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789._=-/+")

    @State private var mode = Mode.login
    @State private var serverChoice = presets[0]
    @State private var customServer = ""
    @State private var info: ServerInfo?
    @State private var registration: RegistrationInfo?
    @State private var registrationRateLimited = false
    @State private var unreachable = false
    @State private var checking = false
    @State private var username = ""
    @State private var password = ""
    @State private var usernameState = UsernameState.idle
    @State private var busy = false
    @State private var errorMessage: String?
    @State private var showQrSignIn = false

    private var server: String {
        serverChoice == Self.custom ? customServer.trimmingCharacters(in: .whitespaces) : serverChoice
    }

    private var serverName: String {
        let url = server.contains("://") ? server : "https://\(server)"
        return URL(string: url)?.host ?? ""
    }

    var body: some View {
        ScrollView {
            VStack(spacing: WZ.Space.space6) {
                WizardLogo(size: WZ.SizeAvatar.xl)
                VStack(spacing: WZ.Space.space2) {
                    Text(String(localized: "auth.title"))
                        .font(.wizard(WZ.FontSize.display, .bold))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "auth.tagline"))
                        .font(.wizard(WZ.FontSize.md))
                        .foregroundStyle(theme.textMuted)
                }
                .multilineTextAlignment(.center)
                .padding(.bottom, WZ.Space.space4)

                VStack(alignment: .leading, spacing: WZ.Space.space5) {
                    Text(mode == .login ? String(localized: "auth.login") : String(localized: "auth.register"))
                        .font(.wizard(WZ.FontSize.lg, .semibold))
                        .foregroundStyle(theme.textPrimary)

                    serverPicker

                    if mode == .register {
                        Link(String(localized: "auth.whichServer"), destination: Self.serverListURL)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.accent)
                            .frame(maxWidth: .infinity)
                    }

                    if checking {
                        HStack(spacing: WZ.Space.space3) {
                            ProgressView()
                            Text(String(localized: "auth.checkingServer"))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                        .frame(maxWidth: .infinity)
                    } else if unreachable {
                        note(String(localized: "auth.serverUnreachable"))
                    } else if let info {
                        if mode == .login {
                            loginOptions(info)
                        } else {
                            registerOptions(info)
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.error)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }

                    switchMode
                }
            }
            .padding(.horizontal, WZ.Space.space8)
            .padding(.vertical, WZ.Space.space10)
            .frame(maxWidth: WZ.SizeMedia.maxWidth)
            .padding(WZ.Space.space6)
            .frame(maxWidth: .infinity)
            .frame(minHeight: UIScreen.main.bounds.height - 120)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(theme.bgPrimary.ignoresSafeArea())
        .tint(theme.control)
        .task(id: server) { await discover() }
        .task(id: "\(server)|\(username)|\(mode == .register)|\(registration?.enabled == true)") {
            await checkUsername()
        }
    }

    // MARK: Sections

    private var serverPicker: some View {
        VStack(spacing: WZ.Space.space3) {
            Picker(String(localized: "auth.customServer"), selection: $serverChoice) {
                ForEach(Self.presets, id: \.self) { preset in
                    Text(URL(string: preset)?.host ?? preset).tag(preset)
                }
                Text(String(localized: "auth.customServer")).tag(Self.custom)
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .wizardField()

            if serverChoice == Self.custom {
                TextField("", text: $customServer, prompt: Text(String(localized: "auth.serverUrl")).foregroundColor(theme.textMuted))
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .wizardField()
            }
        }
    }

    @ViewBuilder
    private func loginOptions(_ info: ServerInfo) -> some View {
        if info.oauth {
            Button(busy ? String(localized: "auth.redirecting") : String(localized: "auth.oidcLogin")) {
                Task { await signInWithBrowser() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy)
            if info.qrLogin {
                Button { showQrSignIn = true } label: {
                    Label(String(localized: "auth.qr.signInTitle"), image: "ph-qr-code-regular")
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(busy)
                .sheet(isPresented: $showQrSignIn) { QrSignInSheet(server: info.homeserverUrl) }
            }
        }

        if info.password {
            usernameField
            passwordField(submit: { Task { await logInWithPassword() } })
            Button(busy ? String(localized: "auth.loggingIn") : String(localized: "auth.login")) {
                Task { await logInWithPassword() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || username.isEmpty || password.isEmpty)
        }

        ssoButtons(info, afterPassword: info.password)

        if !info.oauth && !info.password && info.sso.isEmpty {
            note(String(localized: "auth.noLoginMethod"))
        }
    }

    @ViewBuilder
    private func registerOptions(_ info: ServerInfo) -> some View {
        let passwordRegister = !info.oauth && registration?.enabled == true

        if info.oauth {
            Button(busy ? String(localized: "auth.redirecting") : String(localized: "auth.oidcRegister")) {
                Task { await signInWithBrowser(createAccount: true) }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy)
        }

        if passwordRegister {
            usernameField
            if let hint = usernameHint {
                Text(hint)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(usernameError ? theme.error : theme.textMuted)
            }
            passwordField(submit: { Task { await register() } })
            if !password.isEmpty && password.count < 8 {
                Text(String(localized: "auth.passwordTooShort"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.error)
            }
            Button(busy ? String(localized: "auth.registering") : String(localized: "auth.registerSubmit")) {
                Task { await register() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || !canRegister)
        }

        if !info.oauth {
            ssoButtons(info, afterPassword: passwordRegister)
        }

        if !info.oauth && !passwordRegister && info.sso.isEmpty {
            note(registrationRateLimited
                ? String(localized: "auth.registrationRateLimited")
                : String(localized: "auth.registrationUnavailable"))
        }
    }

    @ViewBuilder
    private func ssoButtons(_ info: ServerInfo, afterPassword: Bool) -> some View {
        if !info.sso.isEmpty {
            if afterPassword {
                LineDivider(text: String(localized: "common.or"))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            ForEach(info.sso, id: \.self) { provider in
                Button(provider.id == nil
                    ? String(localized: "common.continueWithSso")
                    : L10n.format("auth.continueWithIdp", provider.name)) {
                    Task { await signInWithBrowser(sso: provider) }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(busy)
            }
        }
    }

    private var usernameField: some View {
        TextField("", text: $username, prompt: Text(String(localized: "auth.username")).foregroundColor(theme.textMuted))
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .wizardField()
    }

    private func passwordField(submit: @escaping () -> Void) -> some View {
        SecureField("", text: $password, prompt: Text(String(localized: "auth.password")).foregroundColor(theme.textMuted))
            .textContentType(mode == .login ? .password : .newPassword)
            .wizardField()
            .onSubmit(submit)
    }

    private var switchMode: some View {
        HStack(spacing: WZ.Space.space2) {
            Text(mode == .login ? String(localized: "auth.noAccount") : String(localized: "auth.haveAccount"))
                .foregroundStyle(theme.textMuted)
            Button(mode == .login ? String(localized: "auth.register") : String(localized: "auth.login")) {
                withAnimation {
                    mode = mode == .login ? .register : .login
                    errorMessage = nil
                    password = ""
                }
            }
        }
        .font(.wizard(WZ.FontSize.sm))
        .frame(maxWidth: .infinity)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    // MARK: Username check (registration)

    private var fullId: String { "@\(username):\(serverName)" }

    private var usernameError: Bool {
        usernameState == .taken || usernameState == .reserved || usernameState == .invalid
    }

    private var usernameHint: String? {
        guard !username.isEmpty, !serverName.isEmpty else { return nil }
        switch usernameState {
        case .taken: return String(localized: "auth.usernameTaken")
        case .reserved: return String(localized: "auth.usernameReserved")
        case .invalid: return String(localized: "auth.usernameInvalidChars")
        case .available: return L10n.format("auth.usernameAvailable", fullId)
        case .checking: return L10n.format("auth.usernameChecking", fullId)
        case .idle: return L10n.format("auth.usernameHint", fullId)
        }
    }

    private var canRegister: Bool {
        !username.isEmpty && password.count >= 8 && !usernameError && usernameState != .checking
    }

    private func checkUsername() async {
        guard mode == .register, !username.isEmpty, registration?.enabled == true else {
            usernameState = .idle
            return
        }
        guard username.unicodeScalars.allSatisfy(Self.localpartCharacters.contains) else {
            usernameState = .invalid
            return
        }
        usernameState = .checking
        try? await Task.sleep(for: .milliseconds(500))
        guard !Task.isCancelled else { return }
        do {
            let available = try await WizardClient.usernameAvailable(server: server, username: username)
            guard !Task.isCancelled else { return }
            usernameState = available ? .available : .taken
        } catch let error as WizardError {
            guard !Task.isCancelled else { return }
            switch error.errcode ?? "" {
            case "M_USER_IN_USE": usernameState = .taken
            case "M_INVALID_USERNAME": usernameState = .invalid
            case "M_EXCLUSIVE": usernameState = .reserved
            default: usernameState = .idle
            }
        } catch {
            if !Task.isCancelled { usernameState = .idle }
        }
    }

    // MARK: Actions

    private func discover() async {
        info = nil
        registration = nil
        registrationRateLimited = false
        unreachable = false
        errorMessage = nil
        guard !serverName.isEmpty else { return }
        checking = true
        defer { checking = false }
        // Wait until typing stops
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        do {
            let discovered = try await session.discover(server)
            guard !Task.isCancelled else { return }
            do {
                registration = try await WizardClient.registrationInfo(server: discovered.homeserverUrl)
            } catch let error as WizardError {
                registrationRateLimited = error.errcode == "M_LIMIT_EXCEEDED"
            } catch {}
            guard !Task.isCancelled else { return }
            info = discovered
        } catch {
            if !Task.isCancelled { unreachable = true }
        }
    }

    private func signInWithBrowser(sso: IdentityProvider? = nil, createAccount: Bool = false) async {
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            let url = try await session.startBrowserLogin(server: server, sso: sso, createAccount: createAccount)
            let callbackUrl = try await webAuthenticationSession.authenticate(
                using: url,
                callbackURLScheme: MatrixSession.callbackScheme,
                preferredBrowserSession: .shared
            )
            try await session.finishBrowserLogin(callbackUrl: callbackUrl)
        } catch ASWebAuthenticationSessionError.canceledLogin {
            await session.cancelBrowserLogin()
        } catch {
            await session.cancelBrowserLogin()
            errorMessage = message(for: error)
        }
    }

    private func logInWithPassword() async {
        guard !username.isEmpty, !password.isEmpty else {
            errorMessage = String(localized: "auth.fillAllFields")
            return
        }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            try await session.login(server: server, username: username, password: password)
        } catch {
            errorMessage = message(for: error)
        }
    }

    private func register() async {
        guard canRegister else { return }
        // Only flows without extra steps (dummy, terms) can be completed here
        let flows = registration?.flows ?? []
        let supported: (String) -> Bool = { $0 == "m.login.dummy" || $0 == "m.login.terms" }
        if !flows.isEmpty && !flows.contains(where: { $0.allSatisfy(supported) }) {
            let names = flows.map { $0.joined(separator: " -> ") }.joined(separator: ", ")
            errorMessage = L10n.format("auth.additionalVerification", names)
            return
        }
        busy = true
        errorMessage = nil
        defer { busy = false }
        do {
            try await session.register(server: server, username: username, password: password)
        } catch let error as WizardError {
            switch error.errcode ?? "" {
            case "M_USER_IN_USE": errorMessage = String(localized: "auth.usernameTaken")
            case "M_INVALID_USERNAME": errorMessage = String(localized: "auth.invalidUsername")
            case "M_EXCLUSIVE": errorMessage = String(localized: "auth.usernameReserved")
            case "M_WEAK_PASSWORD": errorMessage = L10n.format("auth.weakPassword", error.message)
            default: errorMessage = L10n.format("auth.registrationFailed", error.message)
            }
        } catch {
            errorMessage = L10n.format("auth.registrationFailed", error.localizedDescription)
        }
    }

    private func message(for error: Error) -> String {
        if let error = error as? WizardError {
            switch error.code {
            case "invalidCredentials": return String(localized: "auth.errors.credentials")
            case "homeserver": return L10n.format("auth.errors.homeserver", server)
            default: return L10n.format("auth.errors.generic", error.message)
            }
        }
        if let error = error as? LocalizedError, let description = error.errorDescription {
            return description
        }
        return L10n.format("auth.loginFailed", "\(error)")
    }
}
