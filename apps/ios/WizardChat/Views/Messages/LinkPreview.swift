import WizardChatCore
import SwiftUI

struct LinkPreviewData {
    let url: URL
    let title: String
    let description: String?
    let siteName: String
    let imageUrl: String?
}

/// Fetches and caches link previews from the homeserver through the core. Only used in
/// unencrypted rooms, so the server never sees links from encrypted chats.
@MainActor
final class LinkPreviewLoader {
    private static var cache: [String: LinkPreviewData?] = [:]
    private static var inFlight: [String: Task<LinkPreviewData?, Never>] = [:]
    let client: WizardClient

    init(client: WizardClient) { self.client = client }

    func preview(for url: URL) async -> LinkPreviewData? {
        let key = url.absoluteString
        if let cached = Self.cache[key] { return cached }
        if let running = Self.inFlight[key] { return await running.value }
        let client = client
        let task = Task<LinkPreviewData?, Never> {
            guard let preview = try? await client.urlPreview(url: key),
                  let title = preview.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty
            else { return nil }
            let pageUrl = URL(string: preview.url) ?? url
            let host = (pageUrl.host ?? url.host ?? "").replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
            return LinkPreviewData(
                url: url,
                title: title,
                description: preview.description?.trimmingCharacters(in: .whitespacesAndNewlines),
                siteName: preview.siteName ?? host,
                imageUrl: preview.imageUrl)
        }
        Self.inFlight[key] = task
        let result = await task.value
        Self.inFlight[key] = nil
        Self.cache[key] = result
        return result
    }
}

struct LinkPreviewCard: View {
    let url: URL
    let loader: LinkPreviewLoader

    @Environment(\.mediaLoader) private var mediaLoader
    @Environment(\.openURL) private var openURL
    @Environment(\.theme) private var theme
    @State private var data: LinkPreviewData?
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let data {
                Button { openURL(data.url) } label: { card(data) }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(String(localized: "timeline.opensTheLink"))
            }
        }
        .task(id: url) {
            data = await loader.preview(for: url)
            guard let imageUrl = data?.imageUrl else { return }
            if imageUrl.hasPrefix("mxc://") {
                image = await mediaLoader?.thumbnail(imageUrl, size: 400)
            } else if let remote = URL(string: imageUrl),
                      let (bytes, _) = try? await URLSession.shared.data(from: remote) {
                image = AnimatedImage.image(from: bytes, animated: false)
            }
        }
    }

    private func card(_ data: LinkPreviewData) -> some View {
        HStack(alignment: .top, spacing: WZ.Space.space4) {
            RoundedRectangle(cornerRadius: WZ.Radius.xs).fill(theme.linkColor).frame(width: WZ.Space.space1)
            VStack(alignment: .leading, spacing: WZ.Space.space1) {
                Text(data.siteName)
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textMuted)
                Text(data.title)
                    .font(.wizard(WZ.FontSize.md, .semibold))
                    .foregroundStyle(theme.linkColor)
                    .lineLimit(2)
                if let description = data.description, !description.isEmpty {
                    Text(description)
                        .font(.wizard(WZ.FontSize.sm))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(3)
                }
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: WZ.Size.sidebar, maxHeight: WZ.SizeAvatar.xxl)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
                        .padding(.top, WZ.Space.space2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(WZ.Space.space4)
        .frame(maxWidth: WZ.Size.panel, alignment: .leading)
        .background(theme.fill, in: RoundedRectangle(cornerRadius: WZ.Radius.lg, style: .continuous))
        .padding(.top, WZ.Space.space2)
    }
}

extension MessageText {
    static func firstPreviewURL(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let ns = text as NSString
        for match in detector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host?.lowercased() != "matrix.to" else { continue }
            return url
        }
        return nil
    }
}
