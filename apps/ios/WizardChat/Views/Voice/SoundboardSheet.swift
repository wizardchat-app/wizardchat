import SwiftUI
import WizardChatCore

struct SoundboardSheet: View {
    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @State private var packs: [SoundPack]?
    static var cached: [String: [SoundPack]] = [:]
    @State private var failed = false
    @State private var coolingDown = false
    @State private var pulsing = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: WZ.Space.space4), count: 4)

    @State private var search = ""
    @State private var showVolume = false
    @AppStorage(Soundboard.volumeKey) private var volume = 0.5

    private struct Entry: Identifiable {
        let id: String
        let title: String
        let pack: SoundPack?
    }

    private var entries: [Entry]? {
        guard let packs else { return nil }
        var list = packs.map { Entry(id: $0.id, title: Soundboard.title($0), pack: $0) }
        if !packs.contains(where: { $0.source == .room }) {
            let at = (packs.firstIndex { $0.source == .builtIn } ?? -1) + 1
            list.insert(Entry(id: "room", title: calls.room?.name ?? "", pack: nil), at: at)
        }
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return list }
        return list.compactMap { entry in
            guard var pack = entry.pack, pack.source != .frequent else { return nil }
            let titleMatches = entry.title.localizedCaseInsensitiveContains(query)
            pack.sounds = pack.sounds.filter {
                titleMatches || Soundboard.label($0).localizedCaseInsensitiveContains(query)
                    || $0.shortcode.localizedCaseInsensitiveContains(query)
            }
            return pack.sounds.isEmpty ? nil : Entry(id: entry.id, title: entry.title, pack: pack)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: WZ.Space.space0) {
                HStack(spacing: WZ.Space.space0) {
                    SearchBar(text: $search, prompt: "call.soundboard.search")
                    Button { showVolume = true } label: {
                        Image(volume > 0 ? "ph-speaker-high-regular" : "ph-speaker-slash-regular")
                            .font(.system(size: WZ.SizeIcon.md))
                            .foregroundStyle(showVolume ? theme.accent : theme.textMuted)
                            .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "call.soundboard.volume"))
                    .padding(.leading, -WZ.Space.space3)
                    .padding(.trailing, WZ.Space.space3)
                    .popover(isPresented: $showVolume, arrowEdge: .top) {
                        VStack(alignment: .leading, spacing: WZ.Space.space3) {
                            Text(String(localized: "call.soundboard.volume"))
                                .font(.wizard(WZ.FontSize.md, .semibold))
                                .foregroundStyle(theme.textPrimary)
                            HStack(spacing: WZ.Space.space3) {
                                Image("ph-speaker-none-regular").foregroundStyle(theme.textMuted)
                                Slider(value: $volume, in: 0...1)
                                    .tint(theme.accent)
                                    .accessibilityLabel(String(localized: "call.soundboard.volume"))
                                Image("ph-speaker-high-regular").foregroundStyle(theme.textMuted)
                            }
                        }
                        .padding(WZ.Space.space5)
                        .frame(width: 260)
                        .presentationCompactAdaptation(.popover)
                    }
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: WZ.Space.space3) {
                            if let entries {
                                if entries.isEmpty {
                                    Text(String(localized: "call.soundboard.noResults"))
                                        .foregroundStyle(theme.textMuted)
                                        .frame(maxWidth: .infinity)
                                        .padding(.top, WZ.Space.space8)
                                }
                                ForEach(entries) { entry in
                                    Section {
                                        if let pack = entry.pack {
                                            LazyVGrid(columns: columns, spacing: WZ.Space.space4) {
                                                ForEach(pack.sounds, id: \.url) { sound in
                                                    button(sound, in: pack)
                                                }
                                            }
                                        } else {
                                            emptyRoom
                                        }
                                    } header: {
                                        header(entry.title)
                                    }
                                    .id(entry.id)
                                }
                            } else if failed {
                                Text(String(localized: "call.soundboard.failed"))
                                    .foregroundStyle(theme.textMuted)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, WZ.Space.space6)
                            } else {
                                skeleton
                            }
                            footer
                        }
                        .padding(.horizontal, WZ.Space.space5)
                        .padding(.bottom, WZ.Space.space12)
                    }
                    .safeAreaInset(edge: .bottom) {
                        if search.isEmpty, let entries, entries.count > 1 {
                            nav(entries, proxy: proxy)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "call.soundboard.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
        }
        .presentationDetents([.height(520), .large])
        .task { await load() }
    }

    private func header(_ title: String) -> some View {
        Text(title)
            .font(.wizard(WZ.FontSize.sm, .semibold))
            .foregroundStyle(theme.textMuted)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, WZ.Space.space4)
            .padding(.horizontal, WZ.Space.space2)
    }

    private var emptyRoom: some View {
        VStack(alignment: .leading, spacing: WZ.Space.space2) {
            Text(String(localized: "call.soundboard.noRoomSounds"))
                .font(.wizard(WZ.FontSize.sm))
                .foregroundStyle(theme.textMuted)
            if let roomId = calls.room?.id {
                NavigationLink { RoomSoundPacksView(roomId: roomId) } label: {
                    Text(String(localized: "room.settings.sounds.title"))
                        .font(.wizard(WZ.FontSize.sm))
                        .underline()
                        .foregroundStyle(theme.accent)
                }
            }
        }
    }

    private var skeleton: some View {
        LazyVGrid(columns: columns, spacing: WZ.Space.space4) {
            ForEach(0..<8, id: \.self) { _ in
                RoundedRectangle(cornerRadius: WZ.Radius.md).fill(theme.fill).frame(height: 76)
            }
        }
        .padding(.top, WZ.Space.space3)
        .opacity(pulsing ? 0.4 : 1)
        .animation(.easeInOut(duration: 0.7).repeatForever(), value: pulsing)
        .onAppear { pulsing = true }
        .accessibilityLabel(String(localized: "call.soundboard.loading"))
    }

    private var footer: some View {
        Text(String(localized: "call.soundboard.note"))
            .font(.wizard(WZ.FontSize.sm))
            .foregroundStyle(theme.textMuted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        .padding(.top, WZ.Space.space4)
    }

    private func nav(_ entries: [Entry], proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WZ.Space.space2) {
                ForEach(entries) { entry in
                    Button {
                        withAnimation { proxy.scrollTo(entry.id, anchor: .top) }
                    } label: {
                        Group {
                            if entry.pack?.source == .frequent {
                                Image("ph-clock-regular").font(.system(size: WZ.SizeIcon.md))
                            } else if let first = entry.pack?.sounds.first {
                                Text(Soundboard.emoji(first.shortcode, first.emoji)).font(.system(size: WZ.FontSize.lg))
                            } else {
                                Image("ph-hash-regular").font(.system(size: WZ.SizeIcon.md))
                            }
                        }
                        .frame(width: WZ.Space.space10, height: WZ.Space.space9)
                    }
                    .foregroundStyle(theme.textMuted)
                    .accessibilityLabel(entry.title)
                }
            }
            .padding(.horizontal, WZ.Space.space4)
        }
        .fixedSize(horizontal: false, vertical: true)
        .floatingGlass(in: Capsule())
        .padding(.horizontal, WZ.Space.space5)
        .padding(.bottom, WZ.Space.space2)
    }

    private func button(_ sound: SoundboardSound, in pack: SoundPack) -> some View {
        Button {
            play(sound)
        } label: {
            VStack(spacing: WZ.Space.space2) {
                Text(Soundboard.emoji(sound.shortcode, sound.emoji)).font(.system(size: WZ.FontSize.xxl))
                Text(Soundboard.label(sound))
                    .font(.wizard(WZ.FontSize.xs))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 76)
            .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.md))
        }
        .buttonStyle(.plain)
        .disabled(coolingDown)
        .opacity(coolingDown ? 0.5 : 1)
    }

    private func load() async {
        if packs == nil { packs = Self.cached[calls.room?.id ?? ""] }
        guard let client = session.client else { return }
        do {
            let list = try await client.soundboardPacks(roomId: calls.room?.id)
            packs = list
            Self.cached[calls.room?.id ?? ""] = list
            list.first { $0.source == .frequent }?.sounds.forEach { calls.soundboard?.prefetch($0.url) }
        } catch {
            if packs == nil { failed = true }
        }
    }

    private func play(_ sound: SoundboardSound) {
        calls.playSound(sound)
        let client = session.client
        Task { try? await client?.recordSoundPlayed(url: sound.url) }
        coolingDown = true
        Task {
            try? await Task.sleep(for: Soundboard.cooldown)
            coolingDown = false
        }
    }
}
