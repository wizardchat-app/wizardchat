import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The composer's text field as a UITextView, so pasting images works: the keyboard's paste
/// button and the edit menu hand images to `onPaste` instead of dropping them (SwiftUI's
/// TextField only takes text). Grows up to `maxLines`, then scrolls.
struct ComposerTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var selection: NSRange
    @Binding var isFocused: Bool
    let placeholder: String
    let font: UIFont
    let textColor: UIColor
    let placeholderColor: UIColor
    let tintColor: UIColor
    var maxLines = 6
    var emotes: [String: UIImage] = [:]
    let onPaste: ([NSItemProvider]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> PastingTextView {
        let view = PastingTextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = false
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.onPasteItems = { providers in context.coordinator.parent.onPaste(providers) }
        view.addSubview(view.placeholderLabel)
        return view
    }

    func updateUIView(_ view: PastingTextView, context: Context) {
        context.coordinator.parent = self
        view.font = font
        view.textColor = textColor
        view.tintColor = tintColor
        view.placeholderLabel.font = font
        view.placeholderLabel.textColor = placeholderColor
        view.placeholderLabel.text = placeholder
        let length = (text as NSString).length
        let shown = Self.plain(view.attributedText)
        let emotesChanged = context.coordinator.shownEmotes != Set(emotes.keys)
        if shown != text || emotesChanged {
            // Text set from outside: keep a cursor the parent set with it (formatting), otherwise
            // (a picked suggestion, an emoji) keep typing at the end, not where the cursor was
            let cursorMoved = selection != Self.plainRange(view.selectedRange, in: view.attributedText)
            let keep = shown == text || cursorMoved
            view.attributedText = Self.attributed(text, emotes: emotes, font: font, color: textColor)
            view.typingAttributes = [.font: font, .foregroundColor: textColor]
            context.coordinator.shownEmotes = Set(emotes.keys)
            view.setNeedsLayout()
            let range = keep && selection.location + selection.length <= length
                ? selection : NSRange(location: length, length: 0)
            view.selectedRange = Self.displayRange(range, in: view.attributedText)
            if range != selection { DispatchQueue.main.async { context.coordinator.parent.selection = range } }
        } else if Self.plainRange(view.selectedRange, in: view.attributedText) != selection,
                  selection.location + selection.length <= length {
            view.selectedRange = Self.displayRange(selection, in: view.attributedText)
        }
        view.placeholderLabel.isHidden = !text.isEmpty
        if isFocused != view.isFirstResponder {
            let wantsFocus = isFocused
            DispatchQueue.main.async {
                if wantsFocus { view.becomeFirstResponder() } else { view.resignFirstResponder() }
            }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView view: PastingTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 300
        let fitting = view.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
        let maxHeight = ceil(font.lineHeight * CGFloat(maxLines))
        let height = min(max(fitting, ceil(font.lineHeight)), maxHeight)
        let scrolls = fitting > maxHeight
        if view.isScrollEnabled != scrolls {
            DispatchQueue.main.async { view.isScrollEnabled = scrolls }
        }
        return CGSize(width: width, height: height)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ComposerTextView
        var shownEmotes: Set<String> = []
        init(_ parent: ComposerTextView) { self.parent = parent }

        func textViewDidChange(_ view: UITextView) {
            parent.text = ComposerTextView.plain(view.attributedText)
            view.setNeedsLayout()
            (view as? PastingTextView)?.placeholderLabel.isHidden = view.attributedText.length > 0
        }

        func textViewDidChangeSelection(_ view: UITextView) {
            let range = ComposerTextView.plainRange(view.selectedRange, in: view.attributedText)
            if parent.selection != range { parent.selection = range }
        }

        func textViewDidBeginEditing(_ view: UITextView) {
            if !parent.isFocused { parent.isFocused = true }
        }

        func textViewDidEndEditing(_ view: UITextView) {
            if parent.isFocused { parent.isFocused = false }
        }
    }
}

final class EmojiAttachment: NSTextAttachment {
    var shortcode = ""
    var animated: UIImage?
}

extension ComposerTextView {
    private static let shortcode = try! NSRegularExpression(pattern: ":([^\\s:]+):")

    static func attributed(_ text: String, emotes: [String: UIImage], font: UIFont, color: UIColor) -> NSAttributedString {
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let result = NSMutableAttributedString(string: text, attributes: attributes)
        guard !emotes.isEmpty else { return result }
        let ns = text as NSString
        for match in shortcode.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
            let code = ns.substring(with: match.range(at: 1))
            guard let image = emotes[code] else { continue }
            let attachment = EmojiAttachment()
            attachment.shortcode = code
            if image.images != nil {
                attachment.animated = image
                attachment.image = UIGraphicsImageRenderer(size: image.size).image { _ in }
            } else {
                attachment.image = image
            }
            attachment.bounds = CGRect(x: 0, y: (font.capHeight - image.size.height) / 2,
                                       width: image.size.width, height: image.size.height)
            let piece = NSMutableAttributedString(attachment: attachment)
            piece.addAttributes(attributes, range: NSRange(location: 0, length: piece.length))
            result.replaceCharacters(in: match.range, with: piece)
        }
        return result
    }

    static func plain(_ attributed: NSAttributedString) -> String {
        var out = ""
        let ns = attributed.string as NSString
        attributed.enumerateAttribute(.attachment, in: NSRange(location: 0, length: attributed.length)) { value, range, _ in
            if let emoji = value as? EmojiAttachment {
                out += String(repeating: ":\(emoji.shortcode):", count: range.length)
            } else if value == nil {
                out += ns.substring(with: range)
            }
        }
        return out
    }

    private static func segments(_ attributed: NSAttributedString) -> [(display: Int, plain: Int)] {
        var result: [(Int, Int)] = []
        attributed.enumerateAttribute(.attachment, in: NSRange(location: 0, length: attributed.length)) { value, range, _ in
            if let emoji = value as? EmojiAttachment {
                let length = (":\(emoji.shortcode):" as NSString).length
                result += Array(repeating: (1, length), count: range.length)
            } else {
                result.append((range.length, value == nil ? range.length : 0))
            }
        }
        return result
    }

    private static func plainOffset(_ offset: Int, in attributed: NSAttributedString) -> Int {
        var display = 0, plain = 0
        for segment in segments(attributed) {
            if offset <= display + segment.display {
                return plain + (segment.display == segment.plain ? offset - display : offset == display ? 0 : segment.plain)
            }
            display += segment.display
            plain += segment.plain
        }
        return plain
    }

    private static func displayOffset(_ offset: Int, in attributed: NSAttributedString) -> Int {
        var display = 0, plain = 0
        for segment in segments(attributed) {
            if offset <= plain + segment.plain {
                return display + (segment.display == segment.plain ? offset - plain : offset == plain ? 0 : segment.display)
            }
            display += segment.display
            plain += segment.plain
        }
        return display
    }

    static func plainRange(_ range: NSRange, in attributed: NSAttributedString) -> NSRange {
        let start = plainOffset(range.location, in: attributed)
        return NSRange(location: start, length: plainOffset(range.location + range.length, in: attributed) - start)
    }

    static func displayRange(_ range: NSRange, in attributed: NSAttributedString) -> NSRange {
        let start = displayOffset(range.location, in: attributed)
        return NSRange(location: start, length: displayOffset(range.location + range.length, in: attributed) - start)
    }
}

final class PastingTextView: UITextView {
    var onPasteItems: (([NSItemProvider]) -> Void)?
    let placeholderLabel = UILabel()

    private static let mediaTypes: [UTType] = [.image, .movie, .fileURL, .pdf]

    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        pasteConfiguration = UIPasteConfiguration(acceptableTypeIdentifiers:
            [UTType.plainText, .text, .url, .image, .movie, .fileURL, .pdf].map(\.identifier))
        placeholderLabel.numberOfLines = 1
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        placeholderLabel.frame = CGRect(x: 0, y: 0, width: bounds.width, height: font?.lineHeight ?? 20)
        placeAnimatedEmoji()
    }

    private var emojiViews: [UIImageView] = []

    private func placeAnimatedEmoji() {
        var used = 0
        attributedText.enumerateAttribute(.attachment, in: NSRange(location: 0, length: attributedText.length)) { value, range, _ in
            guard let image = (value as? EmojiAttachment)?.animated, let frames = image.images else { return }
            for offset in range.location..<(range.location + range.length) {
                guard let start = position(from: beginningOfDocument, offset: offset) else { continue }
                let caret = caretRect(for: start)
                if used == emojiViews.count {
                    let view = UIImageView()
                    view.isUserInteractionEnabled = false
                    view.contentMode = .scaleAspectFit
                    addSubview(view)
                    emojiViews.append(view)
                }
                let view = emojiViews[used]
                used += 1
                view.isHidden = false
                view.frame = CGRect(x: caret.minX, y: caret.midY - image.size.height / 2,
                                    width: image.size.width, height: image.size.height)
                if view.animationImages?.first !== frames.first {
                    view.animationImages = frames
                    view.animationDuration = image.duration
                    view.startAnimating()
                }
            }
        }
        for view in emojiViews[used...] {
            view.stopAnimating()
            view.animationImages = nil
            view.isHidden = true
        }
    }

    private func hasMedia(_ providers: [NSItemProvider]) -> Bool {
        providers.contains { provider in
            Self.mediaTypes.contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
                && !provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }
    }

    override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
        if action == #selector(paste(_:)), UIPasteboard.general.hasImages { return true }
        return super.canPerformAction(action, withSender: sender)
    }

    override func copy(_ sender: Any?) {
        guard selectedRange.length > 0 else { return super.copy(sender) }
        UIPasteboard.general.string = ComposerTextView.plain(attributedText.attributedSubstring(from: selectedRange))
    }

    override func cut(_ sender: Any?) {
        guard selectedRange.length > 0 else { return super.cut(sender) }
        copy(sender)
        if let range = selectedTextRange { replace(range, withText: "") }
    }

    override func paste(_ sender: Any?) {
        let providers = UIPasteboard.general.itemProviders
        if UIPasteboard.general.hasImages || hasMedia(providers) {
            onPasteItems?(providers)
        } else {
            super.paste(sender)
        }
    }

    override func paste(itemProviders: [NSItemProvider]) {
        if hasMedia(itemProviders) {
            onPasteItems?(itemProviders)
        } else {
            super.paste(itemProviders: itemProviders)
        }
    }
}
