import Foundation

enum L10n {
    static func format(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
    }

    static func plain(_ key: String, _ args: CVarArg...) -> String {
        String(format: NSLocalizedString(key, comment: ""), locale: .current, arguments: args)
            .replacingOccurrences(of: "</?[a-zA-Z]+>", with: "", options: .regularExpression)
    }
}
