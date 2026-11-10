import SwiftUI

struct GiphyGif: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let url: String
    let previewUrl: String
    let width: Int
    let height: Int
}

struct GifPicker: View {
    let onPick: (GiphyGif) async -> Void

    private static let api = "https://gifs.wizardchat.org/v1/gifs"

    @Environment(\.theme) private var theme
    @AppStorage("gifConsent") private var consented = false
    @AppStorage("gifFavourites") private var favouritesData = Data()
    @State private var search = ""
    @State private var showFavourites = false
    @State private var results: [GiphyGif] = []
    @State private var loading = false
    @State private var sending = false

    private var favourites: [GiphyGif] {
        (try? JSONDecoder().decode([GiphyGif].self, from: favouritesData)) ?? []
    }

    var body: some View {
        if !consented {
            VStack(spacing: WZ.Space.space5) {
                Image("ph-images-regular").font(.system(size: WZ.SizeIcon.xxl)).foregroundStyle(theme.accent)
                Text(String(localized: "composer.gifConsentTitle"))
                    .font(.wizard(WZ.FontSize.xl, .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(String(localized: "composer.gifConsentBody"))
                    .font(.wizard(WZ.FontSize.md))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
                Button(String(localized: "composer.gifConsentEnable")) { consented = true }
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(maxWidth: WZ.Size.sidebar)
            }
            .padding(WZ.Space.space8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            VStack(spacing: WZ.Space.space0) {
                HStack(spacing: WZ.Space.space0) {
                    SearchBar(text: $search, prompt: "composer.searchGifs")
                    Button {
                        showFavourites.toggle()
                    } label: {
                        Image(showFavourites ? "ph-star-fill" : "ph-star-regular")
                            .font(.system(size: WZ.SizeIcon.md))
                            .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    }
                    .foregroundStyle(showFavourites ? theme.accent : theme.textMuted)
                    .padding(.trailing, WZ.Space.space3)
                    .accessibilityLabel(String(localized: "nav.favourites"))
                }
                ZStack {
                    grid(showFavourites ? favourites : results)
                    if showFavourites && favourites.isEmpty {
                        Text(String(localized: "composer.noFavourites"))
                            .font(.wizard(WZ.FontSize.md))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(WZ.Space.space9)
                    } else if loading && results.isEmpty {
                        ProgressView().tint(theme.accent)
                    }
                    if sending {
                        ProgressView(String(localized: "composer.sendingGif"))
                            .padding(WZ.Space.space7)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                    }
                }
                Text(String(localized: "composer.poweredByGiphy"))
                    .font(.wizard(WZ.FontSize.xs, .semibold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.vertical, WZ.Space.space3)
            }
            .task(id: search) {
                if !search.isEmpty { try? await Task.sleep(for: .milliseconds(350)) }
                guard !Task.isCancelled else { return }
                await load()
            }
        }
    }

    private func grid(_ gifs: [GiphyGif]) -> some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: WZ.Space.space3), GridItem(.flexible(), spacing: WZ.Space.space3)], spacing: WZ.Space.space3) {
                ForEach(gifs) { gif in
                    RemoteAnimatedImage(url: gif.previewUrl)
                        .aspectRatio(CGFloat(gif.width) / CGFloat(max(gif.height, 1)), contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        // A Button around the UIKit image view misses taps, so the cell takes them
                        .allowsHitTesting(false)
                        .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
                        .onTapGesture {
                            guard !sending else { return }
                            Task {
                                sending = true
                                await onPick(gif)
                                sending = false
                            }
                        }
                        .accessibilityAddTraits(.isButton)
                        .overlay(alignment: .topTrailing) {
                            let isFavourite = favourites.contains(gif)
                            Button {
                                toggleFavourite(gif)
                            } label: {
                                Image(isFavourite ? "ph-star-fill" : "ph-star-regular")
                                    .font(.system(size: WZ.SizeIcon.xs, weight: .semibold))
                                    .foregroundStyle(isFavourite ? theme.warningColor : theme.textOnAccent)
                                    .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                                    .background(theme.overlay, in: Circle())
                            }
                            .padding(WZ.Space.space2)
                            .accessibilityLabel(isFavourite ? String(localized: "room.removeFavourite") : String(localized: "room.addFavourite"))
                        }
                        .accessibilityLabel(gif.title)
                }
            }
            .padding(.horizontal, WZ.Space.space5)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let query = search.trimmingCharacters(in: .whitespaces)
        let endpoint = query.isEmpty
            ? "\(Self.api)/trending?limit=30"
            : "\(Self.api)/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&limit=30"
        guard let url = URL(string: endpoint),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["data"] as? [[String: Any]] else { return }
        results = items.compactMap { item in
            guard let id = item["id"] as? String, let images = item["images"] as? [String: [String: Any]] else { return nil }
            let full = images["downsized"] ?? images["original"]
            let preview = images["fixed_width"] ?? full
            guard let url = full?["url"] as? String, let previewUrl = preview?["url"] as? String else { return nil }
            return GiphyGif(id: id, title: item["title"] as? String ?? String(localized: "composer.gif"), url: url, previewUrl: previewUrl,
                            width: Int(full?["width"] as? String ?? "") ?? 200,
                            height: Int(full?["height"] as? String ?? "") ?? 200)
        }
    }

    private func toggleFavourite(_ gif: GiphyGif) {
        var list = favourites
        if let index = list.firstIndex(of: gif) { list.remove(at: index) } else { list.insert(gif, at: 0) }
        favouritesData = (try? JSONEncoder().encode(Array(list.prefix(50)))) ?? Data()
    }
}

struct RemoteAnimatedImage: View {
    let url: String
    @Environment(\.theme) private var theme
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image { AnimatedImageView(image: image) } else { theme.fill }
        }
        .task(id: url) {
            guard let url = URL(string: url), let (data, _) = try? await URLSession.shared.data(from: url) else { return }
            image = AnimatedImage.image(from: data, animated: true)
        }
    }
}
