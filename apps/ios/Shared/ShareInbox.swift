import Foundation

enum ShareInbox {
    // Per build (Config/Signing.xcconfig), since app groups belong to one Apple team
    static let group = Bundle.main.object(forInfoDictionaryKey: "WZAppGroup") as? String ?? "group.org.wizardchat.app"

    struct RoomEntry: Codable, Identifiable, Hashable {
        let id: String
        let name: String
        let isDirect: Bool
    }

    struct Item: Codable, Identifiable {
        let id: UUID
        let roomId: String
        let text: String?
        let files: [String]
    }

    static func saveTheme(_ name: String) {
        UserDefaults(suiteName: group)?.set(name, forKey: "theme")
    }

    static var theme: WZ.Theme {
        UserDefaults(suiteName: group)?.string(forKey: "theme").flatMap(WZ.Theme.init(rawValue:)) ?? .default
    }

    private static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    }

    private static var outbox: URL? { container?.appendingPathComponent("Outbox", isDirectory: true) }


    static func saveRooms(_ rooms: [RoomEntry]) {
        guard let url = container?.appendingPathComponent("rooms.json"),
              let data = try? JSONEncoder().encode(rooms) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func loadRooms() -> [RoomEntry] {
        guard let url = container?.appendingPathComponent("rooms.json"),
              let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([RoomEntry].self, from: data)) ?? []
    }


    @discardableResult
    static func enqueue(roomId: String, text: String?, files: [URL]) throws -> Item {
        guard let outbox else { throw CocoaError(.fileNoSuchFile) }
        let id = UUID()
        let folder = outbox.appendingPathComponent(id.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var names: [String] = []
        for (index, file) in files.enumerated() {
            let name = "\(index)-\(file.lastPathComponent)"
            try FileManager.default.copyItem(at: file, to: folder.appendingPathComponent(name))
            names.append(name)
        }
        let item = Item(id: id, roomId: roomId, text: text, files: names)
        try JSONEncoder().encode(item).write(to: folder.appendingPathComponent("item.json"), options: .atomic)
        return item
    }

    static func pending() -> [Item] {
        guard let outbox, let folders = try? FileManager.default.contentsOfDirectory(
            at: outbox, includingPropertiesForKeys: [.creationDateKey]) else { return [] }
        return folders.compactMap { folder in
            guard let data = try? Data(contentsOf: folder.appendingPathComponent("item.json")) else { return nil }
            return try? JSONDecoder().decode(Item.self, from: data)
        }
    }

    static func fileURL(_ name: String, in item: Item) -> URL? {
        outbox?.appendingPathComponent(item.id.uuidString).appendingPathComponent(name)
    }

    static func remove(_ item: Item) {
        guard let folder = outbox?.appendingPathComponent(item.id.uuidString) else { return }
        try? FileManager.default.removeItem(at: folder)
    }
}
