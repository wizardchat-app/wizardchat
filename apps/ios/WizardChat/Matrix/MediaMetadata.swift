import AVFoundation
import ImageIO
import SwiftUI
import UIKit

enum MediaMetadata {
    static func imageSize(at url: URL) -> CGSize? {
        CGImageSourceCreateWithURL(url as CFURL, nil).flatMap(imageSize)
    }

    static func imageSize(of data: Data) -> CGSize? {
        CGImageSourceCreateWithData(data as CFData, nil).flatMap(imageSize)
    }

    static func webImageType(of data: Data) -> (mimetype: String, ext: String)? {
        let bytes = [UInt8](data.prefix(12))
        if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return ("image/jpeg", "jpg") }
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("image/png", "png") }
        if bytes.starts(with: [0x47, 0x49, 0x46]) { return ("image/gif", "gif") }
        if bytes.count == 12, Array(bytes[0..<4]) == [0x52, 0x49, 0x46, 0x46], Array(bytes[8..<12]) == [0x57, 0x45, 0x42, 0x50] {
            return ("image/webp", "webp")
        }
        return nil
    }

    static func shareableImage(_ data: Data) -> (data: Data, mimetype: String, ext: String)? {
        if let type = webImageType(of: data) { return (data, type.mimetype, type.ext) }
        guard let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.9) else { return nil }
        return (jpeg, "image/jpeg", "jpg")
    }

    private static func imageSize(_ source: CGImageSource) -> CGSize? {
        guard let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = props[kCGImagePropertyPixelHeight] as? CGFloat else { return nil }
        let orientation = props[kCGImagePropertyOrientation] as? UInt32 ?? 1
        return (5...8).contains(orientation) ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
    }

    static func video(at url: URL) async -> (duration: TimeInterval?, size: CGSize?) {
        let asset = AVURLAsset(url: url)
        let duration = try? await asset.load(.duration).seconds
        var size: CGSize?
        if let track = try? await asset.loadTracks(withMediaType: .video).first,
           let natural = try? await track.load(.naturalSize),
           let transform = try? await track.load(.preferredTransform) {
            let rect = CGRect(origin: .zero, size: natural).applying(transform)
            size = CGSize(width: abs(rect.width), height: abs(rect.height))
        }
        return (duration, size)
    }

    static func videoFrame(at url: URL, maxSize: CGFloat = 800) async -> (data: Data, width: Int, height: Int)? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: maxSize, height: maxSize)
        guard let frame = try? await generator.image(at: .zero).image,
              let data = UIImage(cgImage: frame).jpegData(compressionQuality: 0.8) else { return nil }
        return (data, frame.width, frame.height)
    }

    static func duration(at url: URL) async -> TimeInterval? {
        try? await AVURLAsset(url: url).load(.duration).seconds
    }

    static func temporaryCopy(of data: Data, filename: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(filename)
        try data.write(to: url)
        return url
    }
}

enum AnimatedImage {
    static func image(from data: Data, animated: Bool) -> UIImage? {
        guard animated, let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return UIImage(data: data)
        }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return UIImage(data: data) }
        var frames: [UIImage] = []
        var duration: TimeInterval = 0
        for index in 0..<count {
            guard let cgImage = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
            frames.append(UIImage(cgImage: cgImage))
            let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
            let frame = (props?[kCGImagePropertyGIFDictionary] ?? props?[kCGImagePropertyWebPDictionary]
                ?? props?[kCGImagePropertyPNGDictionary]) as? [CFString: Any]
            let delay = (frame?[kCGImagePropertyGIFUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyGIFDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyWebPUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyWebPDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyAPNGUnclampedDelayTime] as? Double)
                ?? (frame?[kCGImagePropertyAPNGDelayTime] as? Double) ?? 0.1
            duration += max(delay, 0.02)
        }
        return UIImage.animatedImage(with: frames, duration: duration)
    }
}


/// Shows a UIImage and plays it when it's animated. SwiftUI's Image only draws the first
/// frame of an animated UIImage, so GIFs and animated stickers need a UIImageView. The frames
/// run as a layer animation: unlike UIImageView's own, replacing it always restarts it.
struct AnimatedImageView: UIViewRepresentable {
    let image: UIImage
    var contentMode: UIView.ContentMode = .scaleAspectFill
    var loops = 0

    final class Coordinator {
        var shown: (image: UIImage, loops: Int)?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.clipsToBounds = true
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        view.contentMode = contentMode
        if let shown = context.coordinator.shown, shown.image === image, shown.loops == loops { return }
        context.coordinator.shown = (image, loops)
        guard let frames = image.images else {
            view.layer.removeAnimation(forKey: Self.animationKey)
            view.image = image
            return
        }
        view.image = frames.first
        let animation = CAKeyframeAnimation(keyPath: "contents")
        animation.values = frames.compactMap(\.cgImage)
        animation.calculationMode = .discrete
        animation.duration = image.duration
        animation.repeatCount = loops == 0 ? .infinity : Float(loops)
        view.layer.add(animation, forKey: Self.animationKey)
    }

    private static let animationKey = "frames"
}

private struct AnimatesMediaKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var animatesMedia: Bool {
        get { self[AnimatesMediaKey.self] }
        set { self[AnimatesMediaKey.self] = newValue }
    }
}
