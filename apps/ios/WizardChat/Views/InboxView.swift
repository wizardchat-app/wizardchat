import WizardChatCore
import SwiftUI

struct InboxView: View {
    @ObservedObject var roomList: RoomListModel
    let onOpenRoom: (String) -> Void
    let onOpenSpace: (String) -> Void
    let onOpenThread: (String, String) -> Void

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    private enum Tab { case invites, mentions, threads }

    @State private var tab = Tab.invites
    @State private var busyId: String?
    @State private var errorMessage: String?
    @State private var inviters: [String: String] = [:]
    @State private var threads: [(room: RoomSummary, thread: UnreadThread)] = []
    @EnvironmentObject private var session: MatrixSession

    var body: some View {
        NavigationStack {
            ThemedForm {
                Section {
                    tabs
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                if let errorMessage {
                    Text(errorMessage)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.error)
                        .listRowBackground(Color.clear)
                }
                switch tab {
                case .invites:
                    if roomList.invites.isEmpty {
                        empty(String(localized: "inbox.emptyInvites"), icon: "ph-tray-regular")
                    } else {
                        Section {
                            ForEach(roomList.invites) { invite in inviteRow(invite) }
                        }
                    }
                case .threads:
                    if threads.isEmpty {
                        empty(String(localized: "inbox.emptyThreads"), icon: "ph-chat-dots-regular")
                    } else {
                        Section {
                            ForEach(threads, id: \.thread.rootEventId) { item in threadRow(item.room, item.thread) }
                        }
                    }
                case .mentions:
                    if roomList.mentionRooms.isEmpty {
                        empty(String(localized: "inbox.emptyMentions"), icon: "ph-bell-regular")
                    } else {
                        Section {
                            ForEach(roomList.mentionRooms) { room in mentionRow(room) }
                        }
                        Section {
                            Button {
                                Task { await roomList.markAsRead(roomList.mentionRooms) }
                            } label: {
                                Label(String(localized: "common.markAllRead"), image: "ph-check-circle-fill")
                                    .foregroundStyle(theme.control)
                            }
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "inbox.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
            .tint(theme.control)
        }
        .task(id: roomList.threadRooms.map { "\($0.id)|\($0.unreadThreads)|\($0.lastActivity ?? 0)" }) {
            await loadThreads()
        }
        .presentationDetents([.medium, .large])
    }

    /// Two equal halves, the active one raised, each with its count
    private var tabs: some View {
        HStack(spacing: WZ.Space.space1) {
            tabButton(String(localized: "inbox.tabInvites"), count: roomList.invites.count, tab: .invites)
            tabButton(String(localized: "inbox.tabMentions"), count: roomList.mentionRooms.count, tab: .mentions)
            tabButton(String(localized: "inbox.tabThreads"), count: threads.count, tab: .threads)
        }
        .padding(WZ.Space.space1)
        .background(theme.fill, in: Capsule())
    }

    private func tabButton(_ title: String, count: Int, tab: Tab) -> some View {
        let isActive = self.tab == tab
        return Button {
            self.tab = tab
        } label: {
            HStack(spacing: WZ.Space.space3) {
                Text(title)
                    .font(.wizard(WZ.FontSize.md, isActive ? .semibold : .regular))
                if count > 0 {
                    Text(count > 99 ? "99+" : "\(count)")
                        .font(.wizard(WZ.FontSize.xs, .bold))
                        .foregroundStyle(theme.textOnAccent)
                        .padding(.horizontal, WZ.Space.space3)
                        .background(isActive ? theme.accent : theme.textMuted, in: Capsule())
                }
            }
            .foregroundStyle(isActive ? theme.textPrimary : theme.textMuted)
            .frame(maxWidth: .infinity)
            .frame(height: WZ.Space.space10)
            .background(isActive ? theme.bgTertiary : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func empty(_ text: String, icon: String) -> some View {
        VStack(spacing: WZ.Space.space4) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.xl))
                .foregroundStyle(theme.textMuted)
            Text(text)
                .font(.wizard(WZ.FontSize.md))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, WZ.Space.space10)
        .listRowBackground(Color.clear)
    }

    /// The room's avatar with the same type badge the room list shows
    private func avatar(_ room: RoomSummary) -> some View {
        AvatarView(name: room.displayName, url: room.avatarUrl, size: WZ.SizeAvatar.md)
            .overlay(alignment: .bottomTrailing) {
                if !room.isDirect {
                    Image(room.isSpace ? "ph-stack-regular" : room.isVoice ? "ph-speaker-high-regular" : "ph-hash-straight-bold")
                        .font(.system(size: WZ.SizeIcon.xs))
                        .foregroundStyle(theme.textMuted)
                        .frame(width: WZ.Space.space7, height: WZ.Space.space7)
                        .background(theme.bgPrimary, in: Circle())
                        .overlay(Circle().stroke(theme.border, lineWidth: WZ.BorderWidth.thin))
                        .offset(x: WZ.Space.space2, y: WZ.Space.space2)
                }
            }
    }

    private func roundButton(_ icon: String, label: String, background: Color, foreground: Color,
                             action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                .foregroundStyle(foreground)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .background(background, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func inviteRow(_ invite: RoomSummary) -> some View {
        HStack(spacing: WZ.Space.space5) {
            avatar(invite)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(invite.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                if let inviter = inviters[invite.id] {
                    Text(L10n.format("inbox.invitedBy", inviter))
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .lineLimit(1)
            Spacer(minLength: WZ.Space.space4)
            roundButton("ph-x-bold", label: String(localized: "common.decline"), background: theme.fill,
                        foreground: theme.textPrimary) { Task { await decline(invite) } }
            roundButton("ph-check-bold", label: String(localized: "common.accept"), background: theme.accent,
                        foreground: theme.textOnAccent) { Task { await accept(invite) } }
        }
        .task(id: invite.id) {
            if let info = try? await session.client?.inviteInfo(roomId: invite.id) {
                inviters[invite.id] = info.inviterName ?? info.inviterId
            }
        }
        .disabled(busyId == invite.id)
        .opacity(busyId == invite.id ? 0.5 : 1)
    }

    private func mentionRow(_ room: RoomSummary) -> some View {
        HStack(spacing: WZ.Space.space5) {
            avatar(room)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(room.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(room.mentionCount == 1 ? String(localized: "inbox.youWereMentioned") : L10n.format("inbox.youWereMentionedTimes", room.mentionCount))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: WZ.Space.space4)
            UnreadBadge(count: room.mentionCount, isMention: true)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onOpenRoom(room.id)
            dismiss()
        }
        .swipeActions(edge: .trailing) {
            Button { Task { await roomList.markAsRead([room]) } } label: {
                Label(String(localized: "common.markRead"), image: "ph-envelope-open-regular")
            }
            .tint(theme.textMuted)
        }
    }

    private func threadRow(_ room: RoomSummary, _ thread: UnreadThread) -> some View {
        let sender = thread.latestSenderName ?? thread.latestSender
        return HStack(spacing: WZ.Space.space5) {
            avatar(room)
            VStack(alignment: .leading, spacing: WZ.Space.space0) {
                Text(thread.rootBody.map { "\(room.displayName) · \($0)" } ?? room.displayName)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.textPrimary)
                Text(thread.latestBody.map { L10n.format("inbox.threadReply", sender, $0) }
                     ?? L10n.format("inbox.threadReplied", sender))
                    .font(.wizard(WZ.FontSize.sm))
                    .foregroundStyle(theme.textMuted)
            }
            .lineLimit(1)
            Spacer(minLength: WZ.Space.space4)
            UnreadBadge(count: thread.unread, isMention: false)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onOpenThread(room.id, thread.rootEventId)
            dismiss()
        }
    }

    private func loadThreads() async {
        guard let client = session.client else { return }
        var found: [(room: RoomSummary, thread: UnreadThread)] = []
        for room in roomList.threadRooms {
            guard let unread = try? await client.unreadThreads(roomId: room.id) else { continue }
            found += unread.map { (room: room, thread: $0) }
        }
        threads = found.sorted { $0.thread.latestTimestamp > $1.thread.latestTimestamp }
    }

    private func accept(_ invite: RoomSummary) async {
        busyId = invite.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await roomList.accept(invite)
            if roomList.spaces.contains(where: { $0.id == invite.id }) { onOpenSpace(invite.id) } else { onOpenRoom(invite.id) }
            dismiss()
        } catch {
            errorMessage = L10n.format("inbox.failedToAcceptInvite", "\(error)")
        }
    }

    private func decline(_ invite: RoomSummary) async {
        busyId = invite.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await roomList.decline(invite)
        } catch {
            errorMessage = L10n.format("inbox.failedToDeclineInvite", "\(error)")
        }
    }
}
