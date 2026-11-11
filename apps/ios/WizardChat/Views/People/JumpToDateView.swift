import SwiftUI
import WizardChatCore

struct JumpToDateView: View {
    let room: RoomSummary
    let client: WizardClient
    let onJump: (String) -> Void
    @Environment(\.theme) private var theme
    @State private var date = Date()
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                DatePicker(String(localized: "room.jumpToDate.date"), selection: $date, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(theme.accent)
            } footer: {
                if let error { Text(error).foregroundStyle(theme.danger) }
            }
            .listRowBackground(theme.groupedRow)
        }
        .scrollContentBackground(.hidden)
        .background(theme.groupedBackground)
        .navigationTitle(String(localized: "room.jumpToDate.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(String(localized: "room.jumpToDate.jump")) { Task { await jump() } }
                    .disabled(busy)
            }
        }
    }

    private func jump() async {
        busy = true
        error = nil
        defer { busy = false }
        let start = Int(Calendar.current.startOfDay(for: date).timeIntervalSince1970 * 1000)
        do {
            guard let eventId = try await client.eventAtTime(roomId: room.id, timestamp: start) else {
                error = String(localized: "room.jumpToDate.notFound")
                return
            }
            onJump(eventId)
        } catch {
            self.error = L10n.format("room.jumpToDate.failed", "\(error)")
        }
    }
}
