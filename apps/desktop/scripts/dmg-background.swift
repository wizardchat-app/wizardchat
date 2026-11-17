import AppKit

let width: CGFloat = 660
let height: CGFloat = 420
let app = CGPoint(x: 170, y: 200)
let folder = CGPoint(x: 490, y: 200)
let scale: CGFloat = 2

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}

struct Random {
    var state: UInt64
    mutating func next() -> CGFloat {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat(state >> 33) / CGFloat(1 << 31)
    }
}

let pixelsWide = Int(width * scale)
let pixelsHigh = Int(height * scale)
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: pixelsWide, height: pixelsHigh, bitsPerComponent: 8, bytesPerRow: 0,
                    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: scale, y: scale)
ctx.translateBy(x: 0, y: height)
ctx.scaleBy(x: 1, y: -1)

ctx.setFillColor(color(0x0f0d1c))
ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

func nebula(_ center: CGPoint, _ radius: CGFloat, _ hex: UInt32, _ alpha: CGFloat) {
    let g = CGGradient(colorsSpace: space, colors: [color(hex, alpha), color(hex, 0)] as CFArray, locations: [0, 1])!
    ctx.drawRadialGradient(g, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: [])
}
nebula(CGPoint(x: 60, y: 10), 380, 0x6d28d9, 0.26)
nebula(CGPoint(x: 660, y: 430), 360, 0x1e3a8a, 0.38)
nebula(CGPoint(x: 330, y: 470), 260, 0x5b21b6, 0.16)

var random = Random(state: 0x5eed)
for _ in 0..<90 {
    let p = CGPoint(x: random.next() * width, y: random.next() * height)
    let r = 0.35 + random.next() * 0.85
    ctx.setFillColor(color(0xffffff, 0.08 + random.next() * 0.3))
    ctx.fillEllipse(in: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2))
}

for p in [app, folder] {
    nebula(p, 100, 0x8b5cf6, 0.2)
    ctx.saveGState()
    ctx.translateBy(x: p.x, y: p.y + 78)
    ctx.scaleBy(x: 1, y: 0.32)
    nebula(.zero, 90, 0x9d8cf0, 0.8)
    ctx.restoreGState()
}

func lavenderSparkle(_ p: CGPoint, _ size: CGFloat) {
    ctx.saveGState()
    ctx.beginPath()
    ctx.move(to: CGPoint(x: p.x, y: p.y - size))
    ctx.addQuadCurve(to: CGPoint(x: p.x + size, y: p.y), control: p)
    ctx.addQuadCurve(to: CGPoint(x: p.x, y: p.y + size), control: p)
    ctx.addQuadCurve(to: CGPoint(x: p.x - size, y: p.y), control: p)
    ctx.addQuadCurve(to: CGPoint(x: p.x, y: p.y - size), control: p)
    ctx.clip()
    let g = CGGradient(colorsSpace: space, colors: [color(0xe9e3ff), color(0xa78bfa), color(0x7c3aed)] as CFArray,
                       locations: [0, 0.5, 1])!
    ctx.drawLinearGradient(g, start: CGPoint(x: p.x - size, y: p.y - size), end: CGPoint(x: p.x + size, y: p.y + size), options: [])
    ctx.restoreGState()
    nebula(p, size * 2, 0xa78bfa, 0.12)
}

func gem(_ c: CGPoint, _ w: CGFloat) {
    let h = w * 1.25
    let top = CGPoint(x: c.x, y: c.y - h / 2), bottom = CGPoint(x: c.x, y: c.y + h / 2)
    let left = CGPoint(x: c.x - w / 2, y: c.y - h * 0.08), right = CGPoint(x: c.x + w / 2, y: c.y - h * 0.08)
    let mid = CGPoint(x: c.x, y: c.y - h * 0.02)
    for (points, hex) in [([top, left, mid], 0xc4b5fd), ([top, mid, right], 0x8b5cf6),
                          ([left, mid, bottom], 0x7c3aed), ([mid, right, bottom], 0x5b21b6)] as [([CGPoint], UInt32)] {
        ctx.setFillColor(color(hex))
        ctx.beginPath()
        ctx.addLines(between: points)
        ctx.closePath()
        ctx.fillPath()
    }
    nebula(c, w * 1.5, 0x8b5cf6, 0.15)
}

lavenderSparkle(CGPoint(x: 72, y: 78), 8)
lavenderSparkle(CGPoint(x: 600, y: 340), 6)
gem(CGPoint(x: 600, y: 84), 15)

let start = CGPoint(x: app.x + 82, y: app.y - 6)
let end = CGPoint(x: folder.x - 86, y: folder.y - 6)
let control = CGPoint(x: (start.x + end.x) / 2, y: app.y - 78)
let trail = CGMutablePath()
trail.move(to: start)
trail.addQuadCurve(to: end, control: control)
let tangent = CGPoint(x: end.x - control.x, y: end.y - control.y)
let angle = atan2(tangent.y, tangent.x)
for side in [-1.0, 1.0] {
    let a = angle + .pi + side * 0.6
    trail.move(to: end)
    trail.addLine(to: CGPoint(x: end.x + cos(a) * 13, y: end.y + sin(a) * 13))
}
ctx.saveGState()
ctx.addPath(trail.copy(strokingWithWidth: 3.5, lineCap: .round, lineJoin: .round, miterLimit: 1))
ctx.clip()
let stroke = CGGradient(colorsSpace: space, colors: [color(0x7c3aed), color(0xa78bfa), color(0xc4b5fd)] as CFArray,
                        locations: [0, 0.5, 1])!
ctx.drawLinearGradient(stroke, start: start, end: end, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
ctx.restoreGState()


let text = "Drag WizardChat to Applications to install"
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 13, weight: .medium),
    .foregroundColor: NSColor(srgbRed: 0.85, green: 0.83, blue: 0.95, alpha: 0.9),
]
let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
let bounds = CTLineGetImageBounds(line, ctx)
ctx.saveGState()
ctx.translateBy(x: (width - bounds.width) / 2, y: 362)
ctx.scaleBy(x: 1, y: -1)
ctx.textPosition = .zero
CTLineDraw(line, ctx)
ctx.restoreGState()

let output = URL(fileURLWithPath: CommandLine.arguments[1])
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
rep.size = NSSize(width: width, height: height)
try! rep.representation(using: .png, properties: [:])!.write(to: output)
