import Foundation
import SwiftUI

enum TimeFormat: String, CaseIterable {
    case automatic
    case twelveHour = "12h"
    case twentyFourHour = "24h"

    fileprivate var hourSkeleton: String {
        switch self {
        case .automatic: return "j"
        case .twelveHour: return "h"
        case .twentyFourHour: return "H"
        }
    }
}

extension EnvironmentValues {
    @Entry var timeFormat: TimeFormat = .automatic
}

private enum TimeFormatters {
    private static let lock = NSLock()
    private static var cache: [String: DateFormatter] = [:]

    static func string(_ date: Date, template: String) -> String {
        let locale = Locale.current
        let key = "\(locale.identifier)|\(locale.hourCycle)|\(template)"
        lock.lock()
        defer { lock.unlock() }
        if let formatter = cache[key] { return formatter.string(from: date) }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate(template)
        cache[key] = formatter
        return formatter.string(from: date)
    }
}

extension Date {
    func timeText(_ format: TimeFormat) -> String {
        TimeFormatters.string(self, template: format.hourSkeleton + "m")
    }

    func dateTimeText(_ format: TimeFormat) -> String {
        TimeFormatters.string(self, template: "yMMMd" + format.hourSkeleton + "m")
    }
}
