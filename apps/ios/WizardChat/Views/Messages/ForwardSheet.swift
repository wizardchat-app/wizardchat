import SwiftUI
import WizardChatCore

/// Picks a room or DM to forward a message to
struct ForwardSheet: View {
    let fromRoomId: String
    let eventId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var search = ""
    @State private var sendingTo: String?

    private var rooms: [RoomSummary] {
        let query = search.trimmingCharacters(in: .whitespaces)
        let eligible = (session.roomList?.allJoinedRooms ?? [])
            .filter { !$0.isInvite && !$0.isSpace && ($0.isDirect || !$0.isVoice) }
            .filter { query.isEmpty || $0.displayName.localizedCaseInsensitiveContains(query) }
        guard query.isEmpty else {
            return eligible.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        }
        return eligible.sorted { a, b in
            if (a.unreadMentions > 0) != (b.unreadMentions > 0) { return a.unreadMentions > 0 }
            if a.unreadMessages != b.unreadMessages { return a.unreadMessages > b.unreadMessages }
            return (a.latestEventTs ?? a.lastActivity ?? 0) > (b.latestEventTs ?? b.lastActivity ?? 0)
        }
    }

    var body: some View {
        NavigationStack {
            ThemedList {
                ForEach(rooms) { room in
                    Button { Task { await forward(to: room.id) } } label: {
                        HStack(spacing: WZ.Space.space5) {
                            AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.sm, initial: !room.isDirect)
                            Text(room.displayName).foregroundStyle(theme.textPrimary).lineLimit(1)
                            Spacer()
                            if sendingTo == room.id { ProgressView() }
                        }
                    }
                    .disabled(sendingTo != nil)
                }
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: Text(String(localized: "timeline.forwardSearchPlaceholder")))
            .navigationTitle(String(localized: "timeline.forwardPickerTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "common.cancel")) { dismiss() } }
            }
            .tint(theme.control)
        }
    }

    private func forward(to roomId: String) async {
        guard sendingTo == nil, let client = session.client else { return }
        sendingTo = roomId
        defer { sendingTo = nil }
        do {
            try await client.forwardEvent(fromRoomId: fromRoomId, eventId: eventId, toRoomId: roomId)
            dismiss()
        } catch {
            CopyToast.shared.show(L10n.format("timeline.forwardFailed", error.localizedDescription))
        }
    }
}
