import WizardChatCore
import SwiftUI

struct MediaPicker: View {
    enum Tab: Hashable { case emoji, stickers, gif }

    @State var tab: Tab
    @ObservedObject var store: PacksStore
    let onEmoji: (String, PackImage?) -> Void
    let onSticker: (PackImage) -> Void
    let onGif: (GiphyGif) async -> Void
    /// Reactions only take emoji, so the other tabs are hidden.
    var emojiOnly = false

    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch tab {
                case .emoji: EmojiGrid(packs: store.packs) { emoji, image in
                    onEmoji(emoji, image)
                    if emojiOnly { dismiss() }
                }
                case .stickers: StickerGrid(packs: store.packs, loading: store.isLoading) { sticker in
                    onSticker(sticker)
                    dismiss()
                }
                case .gif: GifPicker { gif in
                    await onGif(gif)
                    dismiss()
                }
                }
            }
            .background(theme.bgSecondary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !emojiOnly {
                    ToolbarItem(placement: .principal) {
                        Picker("", selection: $tab) {
                            Text(String(localized: "common.emoji")).tag(Tab.emoji)
                            Text(String(localized: "room.settings.widgets.stickers")).tag(Tab.stickers)
                            Text(String(localized: "composer.gif")).tag(Tab.gif)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: WZ.Size.sidebar)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .tint(theme.control)
    }
}

struct EmojiGrid: View {
    let packs: [ImagePack]
    var unicodeOnly = false
    let onPick: (String, PackImage?) -> Void

    @Environment(\.theme) private var theme
    @EnvironmentObject private var recentEmoji: RecentEmoji
    @State private var search = ""

    private var customEmoji: [PackImage] { packs.flatMap { $0.images.filter(\.isEmoticon) } }
    private var recentEntries: [RecentEmoji.Entry] { recentEmoji.entries.filter { !unicodeOnly || $0.url == nil } }
    private let columns = [GridItem(.adaptive(minimum: 44), spacing: WZ.Space.space2)]

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            SearchBar(text: $search, prompt: "composer.searchEmoji")
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVGrid(columns: columns, spacing: WZ.Space.space2, pinnedViews: .sectionHeaders) {
                        if search.isEmpty {
                            if !recentEntries.isEmpty {
                                section("composer.recentEmoji", id: "recent") {
                                    ForEach(recentEntries, id: \.emoji) { entry in
                                        if let url = entry.url {
                                            customCell(PackImage(shortcode: entry.label ?? entry.emoji.trimmingCharacters(in: [":"]), url: url,
                                                             emoticon: true, sticker: false))
                                        } else {
                                            cell(entry.emoji)
                                        }
                                    }
                                }
                            }
                            if !customEmoji.isEmpty {
                                section("composer.customEmoji", id: "custom") {
                                    ForEach(customEmoji) { image in customCell(image) }
                                }
                            }
                            ForEach(Emoji.groups, id: \.index) { group in
                                section(LocalizedStringKey(group.name), id: "g\(group.index)") {
                                    ForEach(Emoji.all.filter { $0.g == group.index }) { emoji in cell(emoji.u) }
                                }
                            }
                        } else {
                            let custom = customEmoji.filter { $0.shortcode.localizedCaseInsensitiveContains(search) }
                            let results = Emoji.all.filter { $0.matches(search) }
                            ForEach(custom) { image in customCell(image) }
                            ForEach(results) { emoji in cell(emoji.u) }
                            if custom.isEmpty && results.isEmpty {
                                Text(String(localized: "composer.noEmojiFound")).foregroundStyle(theme.textMuted).padding(.top, WZ.Space.space8)
                            }
                        }
                    }
                    .padding(.horizontal, WZ.Space.space4)
                    .padding(.bottom, WZ.Space.space7)
                }
                .safeAreaInset(edge: .bottom) {
                    if search.isEmpty {
                        HStack {
                            ForEach(Emoji.groups, id: \.index) { group in
                                Button {
                                    withAnimation { proxy.scrollTo("g\(group.index)", anchor: .top) }
                                } label: {
                                    Icon(group.icon, size: WZ.SizeIcon.md)
                                        .frame(maxWidth: .infinity, minHeight: WZ.Space.space9)
                                }
                                .foregroundStyle(theme.textMuted)
                                .accessibilityLabel(group.name)
                            }
                        }
                        .padding(.horizontal, WZ.Space.space4)
                        .floatingGlass(in: Capsule())
                        .padding(.horizontal, WZ.Space.space5)
                        .padding(.bottom, WZ.Space.space2)
                    }
                }
            }
        }
    }

    private func section<Content: View>(_ title: LocalizedStringKey, id: String,
                                        @ViewBuilder content: () -> Content) -> some View {
        Section {
            content()
        } header: {
            Text(title)
                .font(.wizard(WZ.FontSize.sm, .semibold))
                .foregroundStyle(theme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, WZ.Space.space3)
                .background(theme.bgSecondary)
                .id(id)
        }
    }

    private func cell(_ emoji: String) -> some View {
        Button {
            recentEmoji.use(emoji, label: Emoji.label(of: emoji))
            onPick(emoji, nil)
        } label: {
            Text(emoji).font(.system(size: WZ.SizeIcon.xl)).frame(width: WZ.Space.space10, height: WZ.Space.space10)
        }
        .buttonStyle(.plain)
    }

    private func customCell(_ image: PackImage) -> some View {
        Button {
            recentEmoji.use(":\(image.shortcode):", label: image.shortcode, url: image.url)
            onPick(":\(image.shortcode):", image)
        } label: {
            PackThumb(url: image.url).frame(width: WZ.Space.space9, height: WZ.Space.space9).frame(width: WZ.Space.space10, height: WZ.Space.space10)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(image.shortcode)
    }
}

private struct StickerGrid: View {
    let packs: [ImagePack]
    let loading: Bool
    let onPick: (PackImage) -> Void
    @Environment(\.theme) private var theme
    @State private var search = ""

    private var stickerPacks: [ImagePack] {
        packs.compactMap { pack in
            let images = pack.images.filter {
                $0.isSticker && (search.isEmpty || $0.shortcode.localizedCaseInsensitiveContains(search)
                                 || $0.text.localizedCaseInsensitiveContains(search))
            }
            return images.isEmpty ? nil : ImagePack(id: pack.id, name: pack.name, images: images)
        }
    }

    var body: some View {
        VStack(spacing: WZ.Space.space0) {
            SearchBar(text: $search, prompt: "composer.searchStickers")
            if stickerPacks.isEmpty && loading {
                ProgressView(String(localized: "composer.loadingStickers"))
                    .tint(theme.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if stickerPacks.isEmpty {
                ContentUnavailableView(String(localized: "composer.noStickers"), image: "ph-smiley-regular",
                                       description: Text(String(localized: "composer.addImagesToYour")))
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: WZ.Space.space4)], spacing: WZ.Space.space4,
                              pinnedViews: .sectionHeaders) {
                        ForEach(stickerPacks) { pack in
                            Section {
                                ForEach(pack.images) { sticker in
                                    Button { onPick(sticker) } label: {
                                        PackThumb(url: sticker.url, animated: true).frame(width: WZ.SizeAvatar.xl, height: WZ.SizeAvatar.xl)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(sticker.text)
                                }
                            } header: {
                                Text(pack.name)
                                    .font(.wizard(WZ.FontSize.sm, .semibold))
                                    .foregroundStyle(theme.textMuted)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, WZ.Space.space3)
                                    .background(theme.bgSecondary)
                            }
                        }
                    }
                    .padding(.horizontal, WZ.Space.space5)
                }
            }
        }
    }
}

struct PackThumb: View {
    let url: String
    var animated = false
    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.theme) private var theme
    @EnvironmentObject private var prefs: AppPreferences
    @State private var image: UIImage?

    private var animates: Bool { animated || prefs.autoplayGifs }

    var body: some View {
        Group {
            if let image, image.images != nil {
                AnimatedImageView(image: image, contentMode: .scaleAspectFit)
                    .allowsHitTesting(false)
            } else if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                theme.fill
            }
        }
        .contentShape(Rectangle())
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
        .task(id: "\(url)|\(animates)") {
            image = await mediaLoader?.thumbnail(url, size: 160)
            guard animates, let full = await mediaLoader?.image(for: .object(["url": .string(url)]), thumbnailSize: nil, animated: true),
                  full.images != nil else { return }
            image = full
        }
    }
}

struct SearchBar: View {
    @Binding var text: String
    let prompt: LocalizedStringKey
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: WZ.Space.space3) {
            Image("ph-magnifying-glass-regular").foregroundStyle(theme.textMuted)
            TextField("", text: $text, prompt: Text(prompt).foregroundColor(theme.textMuted))
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(theme.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !text.isEmpty {
                Button { text = "" } label: { Image("ph-x-circle-regular") }
                    .foregroundStyle(theme.textMuted)
                    .accessibilityLabel(String(localized: "common.clear"))
            }
        }
        .padding(.horizontal, WZ.Space.space4)
        .frame(height: WZ.Space.space10)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.horizontal, WZ.Space.space5)
        .padding(.vertical, WZ.Space.space4)
    }
}
