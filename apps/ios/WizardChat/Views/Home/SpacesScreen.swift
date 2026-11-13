import WizardChatCore
import SwiftUI

struct SpacesScreen: View {
    @ObservedObject var roomList: RoomListModel
    let onCreateSpace: () -> Void
    let onExplore: () -> Void

    @Environment(\.theme) private var theme
    @State private var search = ""

    private var spaces: [SpaceSummary] {
        guard !search.isEmpty else { return roomList.spaces }
        return roomList.spaces.filter { $0.name.localizedCaseInsensitiveContains(search) }
    }

    private let columns = [GridItem(.adaptive(minimum: 92, maximum: 120), spacing: WZ.Space.space6, alignment: .top)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: WZ.Space.space7) {
                ForEach(spaces) { space in
                    NavigationLink(value: Route.space(space.id)) {
                        SpaceTile(name: space.name, unread: roomList.unreadState(of: .space(space.id))) {
                            AvatarView(name: space.name, url: space.avatarUrl, size: WZ.SizeAvatar.xl, cornerRadius: WZ.Radius.xl)
                        }
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        if roomList.unreadState(of: .space(space.id)).unread {
                            Button { Task { await roomList.markAsRead(roomList.rooms(for: .space(space.id))) } } label: {
                                Label(menu: String(localized: "common.markRead"), icon: "ph-envelope-simple-open-regular")
                            }
                        }
                        Button { copyToClipboard("https://matrix.to/#/\(space.id)", message: String(localized: "timeline.linkCopied")) } label: {
                            Label(menu: String(localized: "common.copyLink"), icon: "ph-link-simple-regular")
                        }
                    }
                }
            }
            .padding(.horizontal, WZ.Space.space6)
            .padding(.top, WZ.Space.space4)
        }
        .background(theme.bgPrimary.ignoresSafeArea())
        .tabTitle(String(localized: "room.settings.permissions.groups.spaces"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: onCreateSpace) { Image("ph-plus-regular") }
                    .accessibilityLabel(String(localized: "nav.createOrJoin"))
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: onExplore) { Image("ph-compass-regular") }
                    .accessibilityLabel(String(localized: "explore.title"))
            }
        }
        // Under the title: iOS 26 would otherwise put it at the bottom, next to the tab bar.
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: Text(String(localized: "common.search")))
    }
}

private struct SpaceTile<Icon: View>: View {
    let name: String
    let unread: UnreadState
    @ViewBuilder let icon: () -> Icon
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: WZ.Space.space4) {
            icon()
                .overlay(alignment: .topTrailing) {
                    if unread.unread {
                        Circle()
                            .fill(unread.mention ? theme.mention : theme.accent)
                            .frame(width: WZ.Space.space6, height: WZ.Space.space6)
                            .overlay(Circle().stroke(theme.bgPrimary, lineWidth: WZ.BorderWidth.thick))
                            .offset(x: WZ.Space.space2, y: -WZ.Space.space2)
                    }
                }
            Text(name)
                .font(.wizard(WZ.FontSize.sm, .medium))
                .foregroundStyle(theme.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }
}
