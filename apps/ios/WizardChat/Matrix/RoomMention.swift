import Foundation

enum RoomMention {
    nonisolated(unsafe) static let pattern = /(?:^|[\s(])(@(?:room|everyone|all))(?=[\s).,!?;:]|$)/.ignoresCase()

    static func isIn(_ text: String) -> Bool {
        text.contains(pattern)
    }
}
