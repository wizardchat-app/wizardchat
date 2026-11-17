import SwiftUI

struct Zoomable: ViewModifier {
    private static let maxScale: CGFloat = 5
    private static let doubleTapScale: CGFloat = 2.5

    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero

    func body(content: Content) -> some View {
        GeometryReader { geo in
            content
                .scaleEffect(scale)
                .offset(offset)
                .frame(width: geo.size.width, height: geo.size.height)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            offset = clamped(CGSize(width: baseOffset.width + value.translation.width,
                                                    height: baseOffset.height + value.translation.height),
                                             scale: scale, in: geo.size)
                        }
                        .onEnded { _ in baseOffset = offset },
                    including: scale > 1 ? .all : .subviews
                )
                .simultaneousGesture(
                    MagnifyGesture()
                        .onChanged { value in
                            scale = min(max(baseScale * value.magnification, 1), Self.maxScale)
                            offset = clamped(offset, scale: scale, in: geo.size)
                        }
                        .onEnded { _ in
                            if scale < 1.05 { reset() } else {
                                baseScale = scale
                                baseOffset = offset
                            }
                        }
                )
                .onTapGesture(count: 2) { location in
                    withAnimation(.snappy) {
                        if scale > 1 {
                            reset()
                        } else {
                            scale = Self.doubleTapScale
                            baseScale = scale
                            offset = clamped(CGSize(width: (geo.size.width / 2 - location.x) * (scale - 1),
                                                    height: (geo.size.height / 2 - location.y) * (scale - 1)),
                                             scale: scale, in: geo.size)
                            baseOffset = offset
                        }
                    }
                }
        }
    }

    private func reset() {
        scale = 1
        baseScale = 1
        offset = .zero
        baseOffset = .zero
    }

    private func clamped(_ offset: CGSize, scale: CGFloat, in size: CGSize) -> CGSize {
        let maxX = size.width * (scale - 1) / 2
        let maxY = size.height * (scale - 1) / 2
        return CGSize(width: min(max(offset.width, -maxX), maxX), height: min(max(offset.height, -maxY), maxY))
    }
}

extension View {
    func zoomable() -> some View { modifier(Zoomable()) }
}
