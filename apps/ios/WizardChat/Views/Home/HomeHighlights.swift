import SwiftUI
import WizardChatCore

struct JumpBackInSection: View {
    let rooms: [RoomSummary]
    @Environment(\.theme) private var theme

    static let limit = 10

    private static func activity(_ room: RoomSummary) -> Int? {
        room.isVoice ? room.lastMessage?.timestamp : room.latestEventTs ?? room.lastActivity
    }

    static func recent(_ rooms: [RoomSummary]) -> [RoomSummary] {
        rooms.filter { !$0.isTombstoned }
            .compactMap { room in activity(room).map { (room, $0) } }
            .sorted { $0.1 > $1.1 }
            .prefix(limit)
            .map(\.0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space3) {
            Text(String(localized: "home.jumpBackIn"))
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: WZ.Space.space5) {
                    ForEach(rooms) { item($0) }
                }
                .padding(.trailing, WZ.Space.space6)
            }
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: WZ.Space.space2, leading: WZ.Space.space6, bottom: WZ.Space.space4, trailing: 0))
    }

    private func item(_ room: RoomSummary) -> some View {
        let unread = room.unreadCount > 0 || room.mentionCount > 0
        return NavigationLink(value: Route.room(room.id)) {
            VStack(spacing: WZ.Space.space2) {
                AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.lg, initial: !room.isDirect)
                    .overlay(alignment: .topTrailing) {
                        if unread {
                            Circle()
                                .fill(room.mentionCount > 0 ? theme.mention : theme.accent)
                                .frame(width: WZ.Space.space6, height: WZ.Space.space6)
                                .overlay(Circle().stroke(theme.bgPrimary, lineWidth: WZ.Space.space1))
                        }
                    }
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.xs, unread ? .semibold : .regular))
                    .foregroundStyle(unread ? theme.textPrimary : theme.textSecondary)
                    .lineLimit(1)
                    .frame(width: WZ.SizeAvatar.lg + WZ.Space.space6)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(room.displayName)
    }
}

struct StarterActionsSection: View {
    let onNewMessage: () -> Void
    let onJoin: () -> Void
    let onExplore: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space4) {
            tile("chat-circle", "common.newDm", onNewMessage)
            tile("link-simple", "space.join.title", onJoin)
            tile("compass", "explore.title", onExplore)
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: WZ.Space.space2, leading: WZ.Space.space6, bottom: WZ.Space.space4, trailing: WZ.Space.space6))
    }

    private func tile(_ icon: String, _ title: String.LocalizationValue, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: WZ.Space.space3) {
                Icon(icon, .regular, size: WZ.SizeIcon.lg)
                    .foregroundStyle(theme.accent)
                Text(String(localized: title))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: WZ.SizeAvatar.xl)
            .padding(.horizontal, WZ.Space.space3)
            .background(theme.bgSecondary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
