import AVFoundation
import SwiftUI
import UniformTypeIdentifiers
import WizardChatCore

extension Soundboard {
    static func title(_ pack: SoundPack) -> String {
        switch pack.source {
        case .frequent: String(localized: "call.soundboard.packs.frequent")
        case .builtIn: String(localized: "call.soundboard.packs.builtIn")
        case .mine: String(localized: "call.soundboard.packs.mine")
        default: pack.name ?? ""
        }
    }

    static func label(_ sound: SoundboardSound) -> String {
        if let body = sound.body { return body }
        let key = "call.soundboard.sounds.\(sound.shortcode)"
        let text = Bundle.main.localizedString(forKey: key, value: nil, table: nil)
        return text == key ? sound.shortcode : text
    }

    static func shortcode(from name: String) -> String {
        let mapped = name.lowercased().map { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") ? $0 : "_" }
        let collapsed = String(mapped).split(separator: "_", omittingEmptySubsequences: true).joined(separator: "_")
        return collapsed.isEmpty ? "sound" : String(collapsed.prefix(96))
    }

    static func errorMessage(_ error: Error) -> String {
        guard let error = error as? WizardError, error.code == "invalidSound" else {
            return error.localizedDescription
        }
        let key = "call.soundboard.errors.\(error.message)"
        let text = Bundle.main.localizedString(forKey: key, value: nil, table: nil)
        return text == key ? String(localized: "call.soundboard.errors.unsupported") : text
    }
}

private struct PickedSound {
    let data: Data
    let mimetype: String
    let durationMs: Int
}

private func readSound(_ url: URL) -> PickedSound? {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? Data(contentsOf: url) else { return nil }
    let duration = (try? AVAudioPlayer(data: data))?.duration ?? 0
    let mimetype = switch url.pathExtension.lowercased() {
    case "mp3": "audio/mpeg"
    case "wav": "audio/wav"
    case "aac": "audio/aac"
    default: "audio/mp4"
    }
    return PickedSound(data: data, mimetype: mimetype, durationMs: Int((duration * 1000).rounded()))
}

struct SoundPackEditorView: View {
    let roomId: String?
    let stateKey: String
    let canEdit: Bool
    let onChange: () async -> Void
    var onDelete: (() async -> Void)? = nil

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var name: String
    @State private var attribution: String
    @State private var sounds: [SoundboardSound]
    @State private var importing = false
    @State private var uploading = false
    @State private var saving = false
    @State private var error: String?
    @State private var preview: AVAudioPlayer?
    @State private var previewing: String?
    @State private var emojiFor: Int?
    @State private var emojiText = ""
    @State private var confirmDelete = false
    private let title: String

    init(roomId: String?, pack: SoundPack, canEdit: Bool, onChange: @escaping () async -> Void, onDelete: (() async -> Void)? = nil) {
        self.roomId = roomId
        stateKey = pack.stateKey ?? ""
        self.canEdit = canEdit
        self.onChange = onChange
        self.onDelete = onDelete
        title = Soundboard.title(pack)
        _name = State(initialValue: pack.name ?? "")
        _attribution = State(initialValue: pack.attribution ?? "")
        _sounds = State(initialValue: pack.sounds)
    }

    var body: some View {
        ThemedForm {
            if canEdit {
                Section(String(localized: "room.settings.emojis.pack")) {
                    TextField(String(localized: "room.settings.emojis.packName"), text: $name,
                              prompt: Text(String(localized: "room.settings.sounds.packNamePlaceholder")))
                    TextField(String(localized: "room.settings.emojis.attribution"), text: $attribution,
                              prompt: Text(String(localized: "room.settings.emojis.attributionPlaceholder")))
                }
            }
            Section {
                if sounds.isEmpty {
                    Text(String(localized: "room.settings.sounds.noSounds")).foregroundStyle(theme.textMuted)
                }
                ForEach(Array(sounds.enumerated()), id: \.element.url) { index, sound in
                    row(index, sound)
                }
                .onDelete(perform: canEdit ? { sounds.remove(atOffsets: $0) } : nil)
                if canEdit {
                    Button { importing = true } label: {
                        HStack {
                            Label(String(localized: "room.settings.sounds.addSounds"), image: "ph-plus-regular")
                            if uploading { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(uploading)
                }
            } header: {
                Text("\(String(localized: "room.settings.sounds.sounds")) (\(sounds.count))")
            } footer: {
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    if canEdit { Text(String(localized: "call.soundboard.limits")) }
                    if let error { Text(error).foregroundStyle(theme.error) }
                }
            }
            if canEdit, onDelete != nil {
                Section {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label(String(localized: "room.settings.sounds.deletePack"), image: "ph-trash-regular").foregroundStyle(theme.danger)
                    }
                }
            }
        }
        .tint(theme.control)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button(String(localized: "common.save")) { save() }.disabled(uploading).fontWeight(.semibold)
                    }
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.mp3, .mpeg4Audio, .wav, .audio], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { upload(urls) }
        }
        .alert(String(localized: "room.settings.sounds.emoji"),
               isPresented: Binding(get: { emojiFor != nil }, set: { if !$0 { emojiFor = nil } })) {
            TextField(String(localized: "room.settings.sounds.emoji"), text: $emojiText)
            Button(String(localized: "common.save")) {
                if let index = emojiFor, sounds.indices.contains(index) {
                    let value = emojiText.trimmingCharacters(in: .whitespaces)
                    sounds[index].emoji = value.isEmpty ? nil : String(value.prefix(8))
                }
            }
            Button(String(localized: "common.cancel"), role: .cancel) {}
        }
        .confirmationDialog(L10n.format("room.settings.sounds.deletePackConfirm", name.isEmpty ? title : name),
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(String(localized: "room.settings.sounds.deletePack"), role: .destructive) {
                Task {
                    await onDelete?()
                    dismiss()
                }
            }
        }
        .onDisappear { preview?.stop() }
    }

    private func row(_ index: Int, _ sound: SoundboardSound) -> some View {
        HStack(spacing: WZ.Space.space4) {
            Button {
                emojiText = sound.emoji ?? ""
                emojiFor = index
            } label: {
                Text(Soundboard.emoji(sound.shortcode, sound.emoji))
                    .font(.system(size: WZ.FontSize.xl))
                    .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                    .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.md))
            }
            .buttonStyle(.plain)
            .disabled(!canEdit)
            .accessibilityLabel(String(localized: "room.settings.sounds.emoji"))
            VStack(alignment: .leading, spacing: 2) {
                TextField(String(localized: "room.settings.sounds.name"), text: Binding(
                    get: { sounds[safe: index]?.body ?? "" },
                    set: { value in if sounds.indices.contains(index) { sounds[index].body = value } }),
                          prompt: Text(String(localized: "room.settings.sounds.name")))
                    .foregroundStyle(theme.textPrimary)
                    .disabled(!canEdit)
            }
            Button { toggle(sound) } label: {
                Image(previewing == sound.url ? "ph-stop-fill" : "ph-play-fill")
                    .foregroundStyle(theme.textMuted)
                    .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: previewing == sound.url ? "call.soundboard.stopPreview" : "call.soundboard.preview"))
        }
    }

    private func toggle(_ sound: SoundboardSound) {
        let same = previewing == sound.url
        preview?.stop()
        preview = nil
        previewing = nil
        guard !same, let client = session.client else { return }
        previewing = sound.url
        Task {
            guard let data = try? await client.soundboardSound(url: sound.url),
                  let player = try? AVAudioPlayer(data: data), previewing == sound.url else {
                previewing = nil
                return
            }
            preview = player
            player.play()
            try? await Task.sleep(for: .seconds(player.duration))
            if preview === player { previewing = nil }
        }
    }

    private func upload(_ urls: [URL]) {
        guard let client = session.client else { return }
        uploading = true
        error = nil
        Task {
            defer { uploading = false }
            for url in urls {
                guard let picked = readSound(url) else {
                    error = String(localized: "call.soundboard.errors.unsupported")
                    continue
                }
                do {
                    var sound = try await client.uploadSound(data: picked.data, mimetype: picked.mimetype, durationMs: picked.durationMs)
                    let body = url.deletingPathExtension().lastPathComponent
                    sound.shortcode = Soundboard.shortcode(from: body)
                    sound.body = body
                    sounds.append(sound)
                } catch {
                    self.error = Soundboard.errorMessage(error)
                }
            }
        }
    }

    private func save() {
        guard let client = session.client else { return }
        saving = true
        error = nil
        let attribution = attribution.trimmingCharacters(in: .whitespaces)
        var used = Set<String>()
        let named = sounds.map { sound in
            var sound = sound
            let body = sound.body?.trimmingCharacters(in: .whitespaces) ?? ""
            let base = body.isEmpty ? sound.shortcode : Soundboard.shortcode(from: body)
            var shortcode = base
            var n = 2
            while used.contains(shortcode) {
                shortcode = "\(base)_\(n)"
                n += 1
            }
            used.insert(shortcode)
            sound.shortcode = shortcode
            sound.body = body.isEmpty ? nil : body
            return sound
        }
        Task {
            defer { saving = false }
            do {
                try await client.saveSoundPack(roomId: roomId, stateKey: stateKey, name: name.trimmingCharacters(in: .whitespaces),
                                               attribution: attribution.isEmpty ? nil : attribution, sounds: named)
                await onChange()
                dismiss()
            } catch {
                self.error = Soundboard.errorMessage(error)
            }
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

struct SoundboardSettings: View {
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var mine: SoundPack?
    @State private var packs: [SoundPack]?
    @State private var allPacks: [SoundPack]?
    @State private var showSelectPacks = false

    var body: some View {
        Form {
            Section {
                if let mine {
                    NavigationLink {
                        SoundPackEditorView(roomId: nil, pack: mine, canEdit: true) { await loadMine() }
                    } label: {
                        HStack(spacing: WZ.Space.space4) {
                            Text(mine.sounds.first.map { Soundboard.emoji($0.shortcode, $0.emoji) } ?? "🔊")
                                .font(.system(size: WZ.FontSize.xl))
                            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                Text(mine.name ?? String(localized: "call.soundboard.packs.mine")).foregroundStyle(theme.textPrimary)
                                Text(L10n.format("room.settings.sounds.soundCount", mine.sounds.count))
                                    .font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                            }
                        }
                    }
                }
            } header: {
                Text(String(localized: "settings.soundboard.defaultPack")).foregroundStyle(theme.textMuted)
            } footer: {
                Text(String(localized: "settings.soundboard.defaultPackNote")).foregroundStyle(theme.textMuted)
            }
            .listRowBackground(theme.groupedRow)
            Section {
                let favorites = packs ?? []
                if packs == nil {
                    ProgressView().frame(maxWidth: .infinity)
                } else if favorites.isEmpty {
                    Text(String(localized: "settings.emojisStickers.noFavoritePacks")).foregroundStyle(theme.textMuted)
                }
                ForEach(favorites, id: \.id) { pack in
                    HStack {
                        VStack(alignment: .leading, spacing: WZ.Space.space1) {
                            Text(pack.name ?? "").foregroundStyle(theme.textPrimary)
                            Text(pack.roomName ?? pack.roomId ?? "").font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                        }
                        .lineLimit(1)
                        Spacer()
                        Button { toggle(pack) } label: { Image("ph-star-fill") }
                            .foregroundStyle(theme.accent)
                            .accessibilityLabel(String(localized: "settings.emojisStickers.removeFavorite"))
                    }
                }
                Button { showSelectPacks = true } label: {
                    Label(String(localized: "settings.emojisStickers.selectPacks"), image: "ph-plus-regular")
                }
            } header: {
                Text(String(localized: "settings.soundboard.favoritePacks")).foregroundStyle(theme.textMuted)
            } footer: {
                Text(String(localized: "settings.soundboard.favoritePacksNote")).foregroundStyle(theme.textMuted)
            }
            .listRowBackground(theme.groupedRow)
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(theme.groupedBackground.ignoresSafeArea())
        .navigationTitle(String(localized: "settings.soundboard.title"))
        .navigationBarTitleDisplayMode(.inline)
        .tint(theme.control)
        .task {
            await loadMine()
            packs = (try? await session.client?.favoriteSoundPacks()) ?? []
        }
        .sheet(isPresented: $showSelectPacks) {
            NavigationStack {
                List {
                    if allPacks == nil {
                        ProgressView().tint(theme.accent).frame(maxWidth: .infinity)
                    } else if allPacks?.isEmpty == true {
                        Text(String(localized: "settings.emojisStickers.noPacksFound")).foregroundStyle(theme.textMuted)
                    }
                    ForEach(allPacks ?? [], id: \.id) { listed in
                        let pack = SoundPack(id: listed.id, source: listed.source, roomId: listed.roomId, stateKey: listed.stateKey,
                                             name: listed.name, roomName: listed.roomName,
                                             everywhere: packs?.contains { $0.id == listed.id } ?? false,
                                             canEdit: listed.canEdit, sounds: listed.sounds)
                        Button { toggle(pack) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: WZ.Space.space1) {
                                    Text(pack.name ?? "").foregroundStyle(theme.textPrimary)
                                    Text(pack.roomName ?? pack.roomId ?? "").font(.wizard(WZ.FontSize.sm)).foregroundStyle(theme.textMuted)
                                }
                                Spacer()
                                Image(pack.everywhere ? "ph-star-fill" : "ph-star-regular")
                                    .foregroundStyle(pack.everywhere ? theme.accent : theme.textMuted)
                            }
                        }
                        .listRowBackground(theme.bgPrimary)
                    }
                }
                .scrollContentBackground(.hidden)
                .background(theme.bgSecondary)
                .task { allPacks = (try? await session.client?.allSoundPacks()) ?? [] }
                .navigationTitle(String(localized: "settings.emojisStickers.selectPacks"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { showSelectPacks = false } }
                }
            }
        }
    }

    private func loadMine() async {
        mine = try? await session.client?.mySounds()
    }

    private func toggle(_ pack: SoundPack) {
        guard let roomId = pack.roomId, let stateKey = pack.stateKey else { return }
        let everywhere = !pack.everywhere
        func set(_ on: Bool) {
            var list = (packs ?? []).filter { $0.id != pack.id }
            if on {
                var favorite = pack
                favorite.everywhere = true
                list.append(favorite)
            }
            packs = list
        }
        set(everywhere)
        Task {
            do {
                try await session.client?.setSoundPackEverywhere(roomId: roomId, stateKey: stateKey, everywhere: everywhere)
            } catch {
                set(!everywhere)
            }
        }
    }
}

struct RoomSoundPacksView: View {
    let roomId: String

    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var data: RoomSoundPacks?
    @State private var showNewPack = false
    @State private var newPackName = ""
    @State private var error: String?

    var body: some View {
        ThemedList {
            Section {
                ForEach(data?.packs ?? [], id: \.id) { pack in
                    NavigationLink {
                        SoundPackEditorView(roomId: roomId, pack: pack, canEdit: data?.canEdit ?? false) {
                            await load()
                        } onDelete: {
                            try? await session.client?.deleteSoundPack(roomId: roomId, stateKey: pack.stateKey ?? "")
                            await load()
                        }
                    } label: {
                        LabeledContent {
                            Text("\(pack.sounds.count)")
                        } label: {
                            Label(pack.name ?? "", image: "ph-vinyl-record-regular")
                        }
                    }
                }
                if data?.canEdit == true {
                    Button { showNewPack = true } label: {
                        Label(String(localized: "room.settings.sounds.createPack"), image: "ph-plus-regular")
                    }
                }
            } footer: {
                VStack(alignment: .leading, spacing: WZ.Space.space2) {
                    Text(String(localized: "room.settings.sounds.description"))
                    if let error { Text(error).foregroundStyle(theme.error) }
                }
            }
        }
        .overlay {
            if let data, data.packs.isEmpty, !data.canEdit {
                ContentUnavailableView(String(localized: "room.settings.sounds.noPacks"), image: "ph-vinyl-record-regular")
            }
        }
        .navigationTitle(String(localized: "room.settings.sounds.title"))
        .navigationBarTitleDisplayMode(.inline)
        .tint(theme.control)
        .task { await load() }
        .alert(String(localized: "room.settings.sounds.createPack"), isPresented: $showNewPack) {
            TextField(String(localized: "room.settings.sounds.packNamePlaceholder"), text: $newPackName)
            Button(String(localized: "common.create")) { Task { await create() } }
            Button(String(localized: "common.cancel"), role: .cancel) { newPackName = "" }
        }
    }

    private func load() async {
        guard let client = session.client else { return }
        data = (try? await client.roomSoundPacks(roomId: roomId)) ?? RoomSoundPacks(canEdit: false, packs: [])
    }

    private func create() async {
        let name = newPackName.trimmingCharacters(in: .whitespaces)
        newPackName = ""
        guard !name.isEmpty, let client = session.client else { return }
        do {
            _ = try await client.createSoundPack(roomId: roomId, name: name)
            error = nil
        } catch {
            self.error = L10n.format("room.settings.sounds.createFailed", error.localizedDescription)
        }
        await load()
    }
}
