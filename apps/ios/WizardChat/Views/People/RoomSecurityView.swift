import SwiftUI
import WizardChatCore

/// Who can join, who can read history and encryption, for a room, DM or space
struct RoomSecurityView: View {
    let roomId: String
    var space = false
    var direct = false

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var access = "invite"
    @State private var history = "joined"
    @State private var allowedSpaces: [String] = []
    @State private var parentSpace: String?
    @State private var encrypted = false
    @State private var canSetJoinRules = false
    @State private var canSetHistory = false
    @State private var canEnableEncryption = false
    @State private var confirmEncryption = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        ThemedForm {
            Section {
                if !direct {
                    PickerRow(
                        label: space ? "space.create.access" : "room.settings.security.access",
                        selection: Binding(get: { access }, set: { value in Task { await changeAccess(value) } }),
                        options: accessOptions
                    )
                    .disabled(!canSetJoinRules || saving)
                }
                if !direct && !space {
                    PickerRow(
                        label: "room.settings.security.messageHistory",
                        note: "room.settings.security.historyNote",
                        selection: Binding(get: { history }, set: { value in Task { await changeHistory(value) } }),
                        options: [
                            ("world_readable", "room.settings.security.historyAnyone"),
                            ("shared", "room.settings.security.historyShared"),
                            ("invited", "room.settings.security.historyInvited"),
                            ("joined", "room.settings.security.historyMembersSinceJoin"),
                        ]
                    )
                    .disabled(!canSetHistory || saving)
                }
                if !space {
                    Toggle(isOn: Binding(get: { encrypted }, set: { if $0 { confirmEncryption = true } })) {
                        VStack(alignment: .leading, spacing: WZ.Space.space0) {
                            Text(String(localized: "room.settings.general.e2ee")).foregroundStyle(theme.textPrimary)
                            Text(encrypted ? String(localized: "room.settings.general.encryptionEnabledNote")
                                           : String(localized: "room.settings.general.encryptionNote"))
                                .font(.wizard(WZ.FontSize.sm))
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                    .tint(theme.accent)
                    .disabled(encrypted || !canEnableEncryption || saving)
                }
            }
            if let error {
                Text(error).font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.error)
            }
        }
        .tint(theme.control)
        .navigationTitle(String(localized: "room.settings.security.title"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(String(localized: "room.settings.general.e2ee"), isPresented: $confirmEncryption) {
            Button(String(localized: "common.cancel"), role: .cancel) {}
            Button(String(localized: "common.confirm"), role: .destructive) {
                Task { await enableEncryption() }
            }
        } message: {
            Text(access == "public"
                 ? String(localized: "room.settings.general.encryptionPublicRoomWarning") + "\n\n" + String(localized: "room.settings.general.encryptionConfirm")
                 : String(localized: "room.settings.general.encryptionConfirm"))
        }
        .task { await load() }
    }

    private var accessOptions: [(String, LocalizedStringKey)] {
        var options: [(String, LocalizedStringKey)] = [
            ("invite", space ? "room.settings.security.accessInviteSpace" : "room.settings.security.accessInvite"),
        ]
        if access == "restricted" || parentSpace != nil { options.append(("restricted", "room.settings.security.accessSpaceMembers")) }
        options.append(("knock", "room.settings.security.accessKnock"))
        options.append(("public", "room.settings.security.accessPublic"))
        return options
    }

    private func load() async {
        guard let client = session.client else { return }
        let info = try? await client.roomDetails(roomId: roomId)
        encrypted = info?.isEncrypted ?? false
        canEnableEncryption = info?.permissions.enableEncryption ?? false
        if let settings = try? await client.localRoomSettings(roomId: roomId) {
            access = Self.access(for: settings.joinRule)
            history = settings.historyVisibility
            allowedSpaces = settings.joinAllowedSpaces
        }
        guard !direct else { return }
        if !space {
            parentSpace = (try? await client.spaceGraph())?.first { $0.children.contains { $0.roomId == roomId } }?.spaceId
            canSetHistory = await session.canSendState("m.room.history_visibility", in: roomId)
        }
        canSetJoinRules = await session.canSendState("m.room.join_rules", in: roomId)
    }

    private static func access(for rule: String) -> String {
        switch rule {
        case "public": "public"
        case "knock", "knock_restricted": "knock"
        case "restricted": "restricted"
        default: "invite"
        }
    }

    private func run(_ action: () async throws -> Void) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            try await action()
            error = nil
        } catch {
            self.error = L10n.format("common.saveFailed", error.localizedDescription)
        }
    }

    private func changeAccess(_ value: String) async {
        guard value != access, let client = session.client else { return }
        await run {
            let allowed = value == "restricted" ? (parentSpace.map { [$0] } ?? allowedSpaces) : []
            try await client.setJoinRule(roomId: roomId, rule: value, allowedSpaces: allowed)
            access = value
            if value == "restricted" { allowedSpaces = allowed }
        }
    }

    private func changeHistory(_ value: String) async {
        guard value != history, let client = session.client else { return }
        await run {
            try await client.setHistoryVisibility(roomId: roomId, visibility: value)
            history = value
        }
    }

    private func enableEncryption() async {
        guard let client = session.client else { return }
        saving = true
        defer { saving = false }
        do {
            try await client.enableEncryption(roomId: roomId)
            encrypted = true
        } catch {
            self.error = L10n.format("room.settings.general.encryptionEnableFailed", error.localizedDescription)
        }
    }
}
