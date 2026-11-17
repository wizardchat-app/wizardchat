import WizardChatCore
import SwiftUI

struct ExploreView: View {
    @ObservedObject var roomList: RoomListModel
    let onOpen: (String) -> Void

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Tab: Hashable { case featured, home, other }

    @State private var model: ExploreModel?
    @State private var tab = Tab.featured
    @State private var otherServer = ""
    @State private var search = ""
    @State private var joining: Set<String> = []
    @State private var errorMessage: String?

    private var homeServer: String {
        session.userId?.split(separator: ":", maxSplits: 1).last.map(String.init) ?? "your server"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space5) {
                tabs
                if tab != .featured {
                    HStack(spacing: WZ.Space.space3) {
                        Image("ph-magnifying-glass-regular")
                            .font(.system(size: WZ.SizeIcon.xs, weight: .medium))
                            .foregroundStyle(theme.textMuted)
                        TextField("", text: $search,
                                  prompt: Text(String(localized: "explore.searchPlaceholder")).foregroundColor(theme.textMuted))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textPrimary)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onSubmit(reload)
                    }
                    .wizardField()
                }
                results
            }
            .padding(.horizontal, WZ.Space.space6)
            .padding(.top, WZ.Space.space4)
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "explore.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(theme.bgPrimary, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
        .task {
            guard model == nil, let client = session.client else { return }
            model = ExploreModel(client: client)
            reload()
        }
    }

    private var tabs: some View {
        HStack(spacing: WZ.Space.space2) {
            pill(String(localized: "explore.tabFeatured"), tab: .featured)
            pill(homeServer, tab: .home)
            HStack(spacing: WZ.Space.space2) {
                TextField("", text: $otherServer, prompt: Text(String(localized: "settings.privacy.other")).foregroundColor(theme.textMuted))
                    .font(.wizard(WZ.FontSize.sm, .medium))
                    .foregroundStyle(theme.textPrimary)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .onSubmit(goToOtherServer)
                if !otherServer.isEmpty {
                    Button(action: goToOtherServer) {
                        Image("ph-arrow-right-bold")
                            .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                    }
                    .accessibilityLabel(String(localized: "explore.go"))
                }
            }
            .padding(.horizontal, WZ.Space.space4)
            .frame(height: WZ.Space.space9)
            .background(tab == .other ? theme.bgSecondary : .clear, in: Capsule())
        }
        .padding(WZ.Space.space1)
        .background(theme.bgPrimary, in: Capsule())
        .overlay(Capsule().stroke(theme.border))
    }

    private func pill(_ title: String, tab: Tab) -> some View {
        Button {
            self.tab = tab
            reload()
        } label: {
            Text(title)
                .font(.wizard(WZ.FontSize.sm, .medium))
                .lineLimit(1)
                .foregroundStyle(self.tab == tab ? theme.textPrimary : theme.textMuted)
                .padding(.horizontal, WZ.Space.space5)
                .frame(height: WZ.Space.space9)
                .background(self.tab == tab ? theme.bgSecondary : .clear, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var results: some View {
        if let model {
            ResultsList(
                model: model,
                title: tab == .featured ? String(localized: "explore.featuredSpaces") : L10n.format("explore.publicRoomsOn", "\(currentServer ?? homeServer)"),
                isJoined: { roomList.isJoined($0.id) },
                joining: joining,
                errorMessage: errorMessage,
                onJoin: join
            )
        } else {
            Spacer()
        }
    }

    private var currentServer: String? {
        switch tab {
        case .featured: return "matrix.org"
        case .home: return nil
        case .other: return otherServer.isEmpty ? nil : otherServer
        }
    }

    private func goToOtherServer() {
        guard !otherServer.isEmpty else { return }
        tab = .other
        reload()
    }

    private func reload() {
        model?.load(server: currentServer, filter: tab == .featured ? nil : search)
    }

    private func join(_ room: PublicRoom) {
        if roomList.isJoined(room.id) {
            onOpen(room.id)
            dismiss()
            return
        }
        joining.insert(room.id)
        errorMessage = nil
        Task {
            defer { joining.remove(room.id) }
            do {
                let roomId = try await session.join(room.id, via: [currentServer ?? homeServer])
                onOpen(roomId)
                dismiss()
            } catch {
                errorMessage = L10n.format("common.joinFailed", "\(error)")
            }
        }
    }
}

private struct ResultsList: View {
    @ObservedObject var model: ExploreModel
    let title: String
    let isJoined: (PublicRoom) -> Bool
    let joining: Set<String>
    let errorMessage: String?
    let onJoin: (PublicRoom) -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: WZ.Space.space4) {
                Text(title)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                if let error = errorMessage ?? model.error.map({ L10n.format("explore.fetchError", "\($0)") }) {
                    Text(error)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.error)
                }
                if model.rooms.isEmpty && !model.isLoading && model.error == nil {
                    VStack(spacing: WZ.Space.space2) {
                        Text(String(localized: "explore.noResults"))
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.textPrimary)
                        Text(String(localized: "explore.tryADifferentSearch"))
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, WZ.Space.space9)
                }
                ForEach(model.rooms, id: \.id) { room in
                    RoomCard(room: room, isJoined: isJoined(room),
                             isJoining: joining.contains(room.id)) { onJoin(room) }
                        .onAppear {
                            if room.id == model.rooms.last?.id { model.loadNextPage() }
                        }
                }
                if model.isLoading {
                    ProgressView().tint(theme.accent).frame(maxWidth: .infinity).padding()
                }
            }
            .padding(.bottom, WZ.Space.space6)
        }
        .scrollDismissesKeyboard(.immediately)
    }
}

private struct RoomCard: View {
    let room: PublicRoom
    let isJoined: Bool
    let isJoining: Bool
    let onJoin: () -> Void
    @Environment(\.theme) private var theme

    private var name: String { room.name ?? room.alias ?? room.id }

    var body: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            HStack(alignment: .top, spacing: WZ.Space.space4) {
                AvatarView(name: name, url: room.avatarUrl, size: WZ.SizeAvatar.md, cornerRadius: WizardTheme.radiusSm)
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    Text(name)
                        .font(.wizard(WZ.FontSize.md, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                    if let alias = room.alias {
                        Text(alias)
                            .font(.wizard(WZ.FontSize.sm))
                            .foregroundStyle(theme.textMuted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            if let topic = room.topic, !topic.isEmpty {
                Text(topic)
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(3)
            }
            HStack {
                Label(Self.memberCountText(room.memberCount), image: "ph-users-regular")
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
                Spacer()
                Button(action: onJoin) {
                    Text(isJoined ? String(localized: "common.open") : isJoining ? String(localized: "explore.joining") : String(localized: "common.join"))
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(isJoined ? theme.textPrimary : theme.textOnAccent)
                        .padding(.horizontal, WZ.Space.space5)
                        .frame(height: WZ.Space.space9)
                        .background(isJoined ? theme.bgTertiary : theme.accent,
                                    in: RoundedRectangle(cornerRadius: WizardTheme.radiusSm))
                }
                .buttonStyle(.plain)
                .disabled(isJoining)
            }
        }
        .padding(WZ.Space.space5)
        .background(theme.bgPrimary, in: RoundedRectangle(cornerRadius: WizardTheme.radiusMd))
        .overlay(RoundedRectangle(cornerRadius: WizardTheme.radiusMd).stroke(theme.border))
    }

    private static func memberCountText(_ count: Int) -> String {
        if count < 1000 { return L10n.format("explore.memberCount", count) }
        let marker = 987654321
        let short = String(format: "%.1fk", locale: .current, Double(count) / 1000)
        return L10n.format("explore.memberCount", marker)
            .replacingOccurrences(of: String(format: "%lld", locale: .current, marker), with: short)
    }
}
