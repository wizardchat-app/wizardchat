import Foundation

enum Emoticons {
    private static let map: [String: String] = [
        ">:-(": "😠", ">:(": "😠", ":'(": "😢", ":')": "🥲", "</3": "💔", "<3": "❤️",
        ":-)": "🙂", ":)": "🙂", ":-(": "🙁", ":(": "🙁", ":-D": "😄", ":D": "😄",
        "xD": "😆", "XD": "😆", ";-)": "😉", ";)": "😉",
        ":-P": "😛", ":P": "😛", ":-p": "😛", ":p": "😛",
        ":-O": "😮", ":O": "😮", ":-o": "😮", ":o": "😮",
        ":-|": "😐", ":|": "😐", ":-/": "😕", ":/": "😕", ":-*": "😘", ":*": "😘",
        "B-)": "😎", "^_^": "😊",
    ]

    private static let pattern = try! NSRegularExpression(
        pattern: "(^|\\s)(" + map.keys.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern).joined(separator: "|")
            + ")(?=$|\\s|[.,!?])",
        options: [.anchorsMatchLines]
    )
    private static let code = try! NSRegularExpression(pattern: "```[\\s\\S]*?```|`[^`\\n]*`")

    static func replace(_ text: String) -> String {
        let ns = text as NSString
        var out = ""
        var last = 0
        for match in code.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += convert(ns.substring(with: NSRange(location: last, length: match.range.location - last)))
            out += ns.substring(with: match.range)
            last = match.range.location + match.range.length
        }
        return out + convert(ns.substring(from: last))
    }

    private static func convert(_ text: String) -> String {
        let ns = text as NSString
        var out = ""
        var last = 0
        for match in pattern.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            out += ns.substring(with: match.range(at: 1)) + (map[ns.substring(with: match.range(at: 2))] ?? "")
            last = match.range.location + match.range.length
        }
        return out + ns.substring(from: last)
    }
}
