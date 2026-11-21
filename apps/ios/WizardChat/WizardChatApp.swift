import SwiftUI
import UIKit

@main
struct WizardChatApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = MatrixSession()
    @StateObject private var prefs = AppPreferences()
    @StateObject private var notifier = MessageNotifier()
    @StateObject private var calls = CallManager()
    @StateObject private var recentEmoji = RecentEmoji()
    @StateObject private var verificationRequests = VerificationRequests()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase


    init() {
        FontRegistry.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ThemedRoot(prefs: prefs) { theme in
            Group {
                switch session.state {
                case .restoring:
                    ZStack {
                        theme.bgPrimary.ignoresSafeArea()
                        WizardLogo(size: WZ.SizeAvatar.xl)
                    }
                    .task { await session.restore() }
                case .loggedOut:
                    LoginView()
                case .restoreFailed(let message):
                    VStack(spacing: WZ.Space.space6) {
                        WizardLogo(size: WZ.SizeAvatar.xl)
                        Text("auth.sessionLoadFailed")
                            .font(.wizard(WZ.FontSize.xxl, .bold))
                            .foregroundStyle(theme.textPrimary)
                        Text(message)
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.center)
                        Button("common.retry") { Task { await session.retryRestore() } }
                            .buttonStyle(PrimaryButtonStyle())
                            .frame(maxWidth: WZ.Size.sidebar)
                    }
                    .padding(WZ.Space.space9)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(theme.bgPrimary.ignoresSafeArea())
                case .loggedIn:
                    if let roomList = session.roomList {
                        MainTabView(roomList: roomList)
                            .id(session.userId)
                            .background(CallPictureInPictureSource())
                            .sheet(item: $verificationRequests.presented) { VerificationSheet(model: $0) }
                            .sheet(isPresented: $session.isAddingAccount, onDismiss: {
                                Task { await session.cancelBrowserLogin() }
                            }) { AddAccountSheet() }
                    }
                }
            }
            .font(.wizard(WZ.FontSize.lg))
            .textCase(nil)
            .id(dynamicTypeSize)
            .environmentObject(session)
            .environmentObject(prefs)
            .environmentObject(notifier)
            .environmentObject(calls)
            .environmentObject(recentEmoji)
            .environment(\.mediaLoader, session.media)
            }
            .transaction { transaction in
                if prefs.reducesMotion(systemSetting: systemReduceMotion) {
                    transaction.animation = nil
                    transaction.disablesAnimations = true
                }
            }
            .task(id: session.state == .loggedIn ? session.userId : nil) { await onLoginChanged() }
            .onChange(of: notifier.accountToOpen) { _, _ in openNotificationAccount() }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                UIApplication.shared.ignoreSnapshotOnNextApplicationLaunch()
                Task { await session.pauseSync(keepRunning: calls.isInCall) }
            case .active:
                Task { await session.resumeSync() }
            default:
                break
            }
        }
    }

    private func onLoginChanged() async {
        notifier.stop()
        calls.stopWatchingIncoming()
        calls.leave()
        recentEmoji.stop()
        verificationRequests.stop()
        MemberDirectory.shared.reset()
        prefs.onSyncedSettingsChange = nil
        prefs.stopWatchingSynced()
        guard session.state == .loggedIn, session.client != nil else { return }
        if openNotificationAccount() { return }
        if let synced = await session.loadSyncedSettings() {
            prefs.applySynced(synced)
        }
        prefs.onSyncedSettingsChange = { [weak session] settings in
            Task { await session?.saveSyncedSettings(settings) }
        }
        if let client = session.client { prefs.watchSynced(client) }
        await session.applyPresence(prefs.showPresence)
        if let roomList = session.roomList {
            roomList.prefs = prefs
            notifier.start(roomList: roomList, prefs: prefs)
        }
        if let client = session.client {
            let notifier = notifier
            calls.watchIncoming(client, session: session) { [weak notifier] call in notifier?.notifyMissedCall(call) }
            recentEmoji.start(client: client)
            verificationRequests.start(client: client)
        }
    }

    @discardableResult
    private func openNotificationAccount() -> Bool {
        guard let userId = notifier.accountToOpen else { return false }
        guard session.state == .loggedIn, session.userId != userId else {
            if session.userId == userId { notifier.accountToOpen = nil }
            return false
        }
        guard session.accounts.contains(where: { $0.userId == userId }) else {
            notifier.accountToOpen = nil
            return false
        }
        Task { await session.switchAccount(to: userId) }
        return true
    }
}

private struct ThemedRoot<Content: View>: View {
    @ObservedObject var prefs: AppPreferences
    @ViewBuilder let content: (WizardTheme) -> Content
    @Environment(\.colorScheme) private var systemScheme

    var body: some View {
        let theme = prefs.theme(for: prefs.themeMode.forcedScheme ?? systemScheme)
        content(theme)
            .environment(\.theme, theme)
            .tint(theme.control)
            .toggleStyle(SwitchToggleStyle(tint: theme.accent))
            .preferredColorScheme(prefs.themeMode.forcedScheme)
            .background(theme.bgPrimary.ignoresSafeArea())
            .onChange(of: theme.id, initial: true) { _, id in ShareInbox.saveTheme(id.rawValue) }
            .onChange(of: prefs.themedAppIcon && theme.custom == nil ? theme.id.appIcon : nil, initial: true) { _, name in
                guard UIApplication.shared.supportsAlternateIcons,
                      UIApplication.shared.alternateIconName != name else { return }
                UIApplication.shared.setAlternateIconName(name)
            }
    }
}
