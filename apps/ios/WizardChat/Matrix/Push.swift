import Foundation
import OSLog
import UIKit
import WizardChatCore

@MainActor
enum Push {
    private static let gateway = "https://push.wizardchat.org/_matrix/push/v1/notify"
    private static let registered = UserDefaults(suiteName: "push") ?? .standard
    private static var token: String?
    private static var registering = false
    private static var again = false
    static let log = Logger(subsystem: "org.wizardchat.ios", category: "Push")
    static weak var activeClient: WizardClient?

    static var appId: String { Bundle.main.bundleIdentifier ?? "org.wizardchat.ios" }

    static func start() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    static func received(token data: Data) {
        token = data.base64EncodedString()
        log.info("got a push token")
        Task { await registerAll() }
    }

    static func registerAll() async {
        guard token != nil else { return }
        guard !registering else {
            again = true
            return
        }
        registering = true
        defer { registering = false }
        repeat {
            again = false
            guard let token else { return }
            for stored in SessionStore.all() {
                await register(stored, pushkey: token)
            }
        } while again
    }

    private static func register(_ stored: StoredSession, pushkey: String) async {
        let userId = stored.session.userId
        let current = "\(pushkey)|\(gateway)|\(appId)"
        let previous = registered.string(forKey: userId)
        let active = activeClient.flatMap { $0.userId == userId ? $0 : nil }
        guard previous != current || active != nil else { return }
        if active == nil, SessionStore.active()?.session.userId == userId { return }
        do {
            let client: WizardClient
            if let active {
                client = active
            } else {
                client = try await WizardClient.restore(session: stored.session,
                                                        store: stored.store(process: SessionStore.pushProcess))
            }
            let saving = active != nil ? nil : client.watchSession { event in
                guard case .refreshed(let refreshed) = event,
                      var latest = SessionStore.all().first(where: { $0.session.userId == userId }) else { return }
                latest.session = refreshed.session
                SessionStore.save(latest)
            }
            defer { saving?.cancel() }
            try await client.setPusher(config: PusherConfig(
                appId: appId, pushkey: pushkey, gatewayUrl: gateway, appName: "WizardChat",
                deviceName: MatrixSession.deviceName, lang: Locale.preferredLanguages.first ?? "en",
                alertKey: "common.newMessage"
            ))
            registered.set(current, forKey: userId)
            log.info("registered the pusher for \(userId, privacy: .private)")
            if let oldKey = previous?.components(separatedBy: "|").first, oldKey != pushkey {
                try? await client.removePusher(appId: appId, pushkey: oldKey)
            }
        } catch {
            log.error("couldn't register the pusher for \(userId, privacy: .private): \(error)")
        }
    }

    static func forget(_ userId: String) {
        registered.removeObject(forKey: userId)
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Push.received(token: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Push.log.error("couldn't register for push notifications: \(error)")
    }
}
