import SwiftUI
import WizardChatCore

struct ActiveNowSection: View {
    @ObservedObject var roomList: RoomListModel
    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @Environment(\.roomOpener) private var roomOpener

    private struct Card: Identifiable {
        let room: RoomSummary
        let people: [Person]
        let knownCount: Int
        let includesMe: Bool
        var id: String { room.id }
    }

    private struct Person: Identifiable {
        let userId: String
        let name: String?
        let avatarUrl: String?
        let known: Bool
        var id: String { userId }
    }


    private var cards: [Card] {
        let known = Dictionary(roomList.joinedRooms.filter(\.isDirect).compactMap { room in
            room.dmUserId.map { ($0, room) }
        }, uniquingKeysWith: { first, _ in first })
        let me = session.userId
        return roomList.joinedRooms
            .filter { $0.isVoice && !$0.callParticipants.isEmpty }
            .compactMap { room -> Card? in
                let ids = Array(NSOrderedSet(array: room.callParticipants)) as? [String] ?? room.callParticipants
                let people = ids.map { id in
                    Person(userId: id, name: known[id]?.dmUserName, avatarUrl: known[id]?.dmUserAvatar,
                           known: id != me && known[id] != nil)
                }
                let knownCount = people.filter(\.known).count
                guard knownCount > 0 else { return nil }
                return Card(room: room, people: people.sorted { $0.known && !$1.known }, knownCount: knownCount,
                            includesMe: me.map(ids.contains) ?? false)
            }
            .sorted { $0.knownCount > $1.knownCount }
    }

    var body: some View {
        let cards = cards
        if !cards.isEmpty {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                Text(String(localized: "nav.activeNow"))
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.horizontal, WZ.Space.space6)
                if cards.count == 1 {
                    wideCard(cards[0]).padding(.horizontal, WZ.Space.space6)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: WZ.Space.space4) {
                            ForEach(cards) { card in
                                compactCard(card)
                                    .frame(maxHeight: .infinity, alignment: .top)
                                    .containerRelativeFrame(.horizontal, count: 2, spacing: WZ.Space.space4)
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .scrollTargetLayout()
                    }
                    .contentMargins(.horizontal, WZ.Space.space6, for: .scrollContent)
                    .scrollTargetBehavior(.viewAligned)
                    .scrollDisabled(cards.count == 2)
                }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: WZ.Space.space2, leading: 0, bottom: WZ.Space.space4, trailing: 0))
        }
    }

    private func names(_ card: Card, limit: Int) -> String {
        let known = card.people.filter(\.known).map { $0.name ?? String($0.userId.dropFirst().split(separator: ":").first ?? "") }
        let shown = known.prefix(limit).joined(separator: ", ")
        let rest = card.people.count - min(known.count, limit)
        return rest > 0 ? "\(shown) \(L10n.format("nav.morePeople", rest))" : shown
    }

    private func title(_ card: Card) -> some View {
        HStack(spacing: WZ.Space.space2) {
            Image("ph-speaker-high-regular")
                .font(.system(size: WZ.SizeIcon.xs))
                .foregroundStyle(theme.success)
            Text(card.room.displayName)
                .font(.wizard(WZ.FontSize.md, .semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private func spaceName(_ card: Card) -> some View {
        if let space = roomList.space(containing: card.room.id) {
            Text(space.name)
                .font(.wizard(WZ.FontSize.xs))
                .foregroundStyle(theme.textMuted)
                .lineLimit(1)
        }
    }

    private func faces(_ card: Card, limit: Int, overflow: Bool = false) -> some View {
        let extra = card.people.count - limit
        let shown = card.people.prefix(overflow && extra > 0 ? limit - 1 : limit)
        return HStack(spacing: -WZ.Space.space3) {
            ForEach(shown) { person in
                ActiveFace(person: person.userId, name: person.name, avatarUrl: person.avatarUrl, roomId: card.room.id)
            }
            if overflow, extra > 0 {
                Text("+\(card.people.count - shown.count)")
                    .font(.wizard(WZ.FontSize.xs, .semibold))
                    .foregroundStyle(theme.textSecondary)
                    .frame(width: WZ.SizeAvatar.sm, height: WZ.SizeAvatar.sm)
                    .background(theme.fill, in: Circle())
                    .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.Space.space1))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(names(card, limit: card.people.count))
    }

    private func joinButton(_ card: Card, fill: Bool) -> some View {
        Button {
            if !card.includesMe { Task { await calls.join(card.room, session: session) } }
            roomOpener.open(card.room.id, false)
        } label: {
            Text(String(localized: card.includesMe ? "common.open" : "common.join"))
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(card.includesMe ? theme.textPrimary : theme.textOnAccent)
                .padding(.horizontal, WZ.Space.space7)
                .frame(maxWidth: fill ? .infinity : nil, minHeight: WZ.SizeControl.md)
                .background(card.includesMe ? theme.fill : theme.accent, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.borderless)
    }

    private func wideCard(_ card: Card) -> some View {
        HStack(spacing: WZ.Space.space5) {
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                    title(card)
                    spaceName(card)
                }
                HStack(spacing: WZ.Space.space3) {
                    faces(card, limit: 4)
                    Text(names(card, limit: 2))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            joinButton(card, fill: false)
        }
        .padding(WZ.Space.space5)
        .background(theme.bgSecondary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }

    private func compactCard(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: WZ.Space.space4) {
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                title(card)
                spaceName(card)
            }
            faces(card, limit: 4, overflow: true)
            Spacer(minLength: WZ.Space.space0)
            joinButton(card, fill: true)
        }
        .padding(WZ.Space.space5)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(theme.bgSecondary, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
    }
}

private struct ActiveFace: View {
    let person: String
    let name: String?
    let avatarUrl: String?
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var profile: MemberDirectory.Profile?

    var body: some View {
        AvatarView(name: name ?? profile?.name ?? person, url: avatarUrl ?? profile?.avatarUrl, size: WZ.SizeAvatar.sm)
            .overlay(Circle().stroke(theme.bgSecondary, lineWidth: WZ.Space.space1))
            .task(id: person) {
                guard name == nil else { return }
                profile = await session.memberProfile(person, in: roomId)
            }
    }
}
