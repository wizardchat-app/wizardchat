import SwiftUI

struct MessageMenuTarget: Identifiable {
    let entry: ChatEntry
    let frame: CGRect
    let drag: MessageMenuDrag
    var id: String { entry.id }
}

/// The finger of the long-press that opened the menu, so it can slide straight onto an option
@Observable
final class MessageMenuDrag {
    let start: CGPoint
    var location: CGPoint?
    var released = false

    init(start: CGPoint) { self.start = start }
}

private struct MessageMenuItem: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    var destructive = false
    let action: () -> Void
}

/// Apple's context menu can't show anything outside its box, so this one puts the quick reactions
/// in their own capsule above the message
struct MessageMenuOverlay: View {
    let target: MessageMenuTarget
    let actions: MessageActions
    let isPrivateRoom: Bool
    /// Runs after the menu has closed, so actions that open a sheet can present it
    let onDismiss: (_ then: (() -> Void)?) -> Void

    @EnvironmentObject private var recentEmoji: RecentEmoji
    @Environment(\.theme) private var theme
    @State private var shown = false
    @State private var capsuleHeight: CGFloat = 0
    @State private var contentHeight: CGFloat = 0
    @State private var previewHeight: CGFloat = 0
    @State private var rowFrames: [Int: CGRect] = [:]
    @State private var hoveredRow: Int?
    @State private var optionsOrigin: CGPoint = .zero
    @State private var pressMoved = false

    private var entry: ChatEntry { target.entry }
    private var canReact: Bool { entry.itemKey != nil }

    var body: some View {
        GeometryReader { geo in
            let origin = geo.frame(in: .global).origin
            // Keep the message where it was, with the capsule above it, unless that runs off screen
            let wanted = target.frame.minY - origin.y - (canReact ? capsuleHeight + WZ.Space.space4 : 0)
            let top = min(max(wanted, WZ.Space.space4), max(geo.size.height - contentHeight - WZ.Space.space4, WZ.Space.space4))
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(theme.overlay)
                    .ignoresSafeArea()
                    .opacity(shown ? 1 : 0)
                    .onTapGesture { close() }
                VStack(alignment: .leading, spacing: WZ.Space.space4) {
                    if canReact {
                        reactions
                            .padding(.leading, WZ.Space.space6)
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { capsuleHeight = $0 }
                    }
                    MessageRow(entry: preview, isPrivateRoom: isPrivateRoom)
                        .environment(\.animatesMedia, true)
                        .allowsHitTesting(false)
                        .padding(.vertical, WZ.Space.space4)
                        .frame(width: target.frame.width - WZ.Space.space6 * 2, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { previewHeight = $0 }
                        // A long message is cut off so the options still fit on screen
                        .frame(height: min(previewHeight, geo.size.height * 0.45), alignment: .top)
                        .background(theme.bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                        .padding(.leading, WZ.Space.space6)
                    options
                        .padding(.leading, WZ.Space.space6)
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                .offset(x: target.frame.minX - origin.x, y: top)
                .scaleEffect(shown ? 1 : 0.92, anchor: .top)
                .opacity(shown ? 1 : 0)
            }
        }
        .onChange(of: target.drag.location) { _, location in
            guard let location else { return }
            if !pressMoved, hypot(location.x - target.drag.start.x, location.y - target.drag.start.y) < WZ.Space.space5 { return }
            pressMoved = true
            hover(at: local(location))
        }
        .onChange(of: target.drag.released) { _, released in
            guard released, pressMoved, let location = target.drag.location else { return }
            choose(at: local(location))
        }
        .onAppear {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(duration: WZ.MotionDuration.slow)) { shown = true }
        }
    }

    private var reactions: some View {
        HStack(spacing: WZ.Space.space1) {
            ForEach(recentEmoji.quickReactions, id: \.self) { emoji in
                Button {
                    recentEmoji.use(emoji, label: Emoji.label(of: emoji))
                    close { actions.react(emoji, entry) }
                } label: {
                    Text(emoji)
                        .font(.system(size: WZ.SizeIcon.xl))
                        .frame(width: WZ.Space.space11, height: WZ.Space.space11)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Emoji.label(of: emoji))
            }
            Button { close { actions.moreReactions(entry) } } label: {
                Image("ph-plus-bold")
                    .font(.system(size: WZ.SizeIcon.md))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                    .background(theme.fill, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "timeline.addReaction"))
        }
        .padding(.horizontal, WZ.Space.space3)
        .padding(.vertical, WZ.Space.space2)
        .floatingGlass(in: Capsule())
    }

    private var options: some View {
        let sections = sections
        return VStack(spacing: WZ.Space.space0) {
            ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                if index > 0 { Divider().padding(.vertical, WZ.Space.space2).padding(.horizontal, WZ.Space.space4) }
                let offset = sections[..<index].reduce(0) { $0 + $1.count }
                ForEach(Array(section.enumerated()), id: \.offset) { position, item in
                    let row = offset + position
                    Button { close(then: item.action) } label: {
                        HStack(spacing: WZ.Space.space5) {
                            Image(item.icon)
                                .font(.system(size: WZ.SizeIcon.md))
                                .frame(width: WZ.SizeIcon.lg)
                            Text(item.title).font(.wizard(WZ.FontSize.lg))
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(item.destructive ? theme.danger : theme.textPrimary)
                        .padding(.horizontal, WZ.Space.space4)
                        .frame(height: WZ.Size.touchTarget)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.optionsSpace)) } action: { rowFrames[row] = $0 }
                }
            }
        }
        .background(alignment: .topLeading) {
            if let hoveredRow, let frame = rowFrames[hoveredRow] {
                Capsule()
                    .fill(theme.fill)
                    .frame(width: frame.width, height: frame.height)
                    .offset(x: frame.minX, y: frame.minY)
            }
        }
        .animation(.spring(duration: WZ.MotionDuration.fast), value: hoveredRow)
        .contentShape(Rectangle())
        .highPriorityGesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.optionsSpace))
                .onChanged { hover(at: $0.location) }
                .onEnded { choose(at: $0.location) }
        )
        .coordinateSpace(.named(Self.optionsSpace))
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { optionsOrigin = $0 }
        .padding(WZ.Space.space4)
        .frame(width: WZ.Size.sidebar)
        .floatingGlass(in: RoundedRectangle(cornerRadius: WZ.Size.touchTarget / 2 + WZ.Space.space4, style: .continuous))
    }

    private static let optionsSpace = "messageMenuOptions"

    private func local(_ global: CGPoint) -> CGPoint {
        CGPoint(x: global.x - optionsOrigin.x, y: global.y - optionsOrigin.y)
    }

    private func row(at point: CGPoint) -> Int? {
        rowFrames.first { $0.value.contains(point) }?.key
    }

    private func hover(at point: CGPoint) {
        let row = row(at: point)
        guard row != hoveredRow else { return }
        if row != nil { UISelectionFeedbackGenerator().selectionChanged() }
        hoveredRow = row
    }

    private func choose(at point: CGPoint) {
        let items = sections.flatMap { $0 }
        hoveredRow = nil
        if let row = row(at: point), items.indices.contains(row) { close(then: items[row].action) }
    }

    private var sections: [[MessageMenuItem]] {
        var main: [MessageMenuItem] = []
        if canReact, entry.canBeRepliedTo {
            main.append(.init(title: String(localized: "timeline.reply"), icon: "ph-arrow-bend-up-left-regular") { actions.reply(entry) })
        }
        if canReact, entry.canBeRepliedTo, let openThread = actions.openThread {
            main.append(.init(title: String(localized: "timeline.replyInThread"), icon: "ph-chat-dots-regular") { openThread(entry) })
        }
        if canReact, entry.isOwn, entry.isEditable, entry.editableText != nil {
            main.append(.init(title: String(localized: "common.edit"), icon: "ph-pencil-simple-regular") { actions.edit(entry) })
        }
        if !entry.summary.isEmpty, case .message = entry.kind {
            let text = entry.summary
            main.append(.init(title: String(localized: "common.copy"), icon: "ph-copy-regular") { copyToClipboard(text) })
            main.append(.init(title: String(localized: "timeline.selectText"), icon: "ph-text-aa-regular") { actions.selectText(entry) })
        }
        var danger: [MessageMenuItem] = []
        if let eventId = entry.eventId {
            let link = "https://matrix.to/#/\(actions.roomId)/\(eventId)"
            main.append(.init(title: String(localized: "common.copyLink"), icon: "ph-link-simple-regular") {
                copyToClipboard(link, message: String(localized: "timeline.linkCopied"))
            })
            if actions.canPin {
                let pinned = actions.pinnedIds.contains(eventId)
                main.append(.init(title: pinned ? String(localized: "timeline.unpin") : String(localized: "timeline.pin"),
                                  icon: pinned ? "ph-push-pin-slash-regular" : "ph-push-pin-regular") { actions.togglePin(entry) })
            }
            if entry.isEdited {
                main.append(.init(title: String(localized: "timeline.editHistory"), icon: "ph-clock-counter-clockwise-regular") {
                    actions.editHistory(entry)
                })
            }
            main.append(.init(title: String(localized: "timeline.viewSource"), icon: "ph-code-regular") { actions.viewSource(entry) })
            if !entry.isOwn {
                danger.append(.init(title: String(localized: "timeline.reportShort"), icon: "ph-flag-regular", destructive: true) { actions.report(entry) })
            }
            if entry.isOwn || actions.canRedactOthers {
                danger.append(.init(title: String(localized: "common.delete"), icon: "ph-trash-regular", destructive: true) { actions.delete(entry) })
            }
        }
        return [main, danger].filter { !$0.isEmpty }
    }

    private var preview: ChatEntry {
        var copy = entry
        copy.isGrouped = false
        return copy
    }

    private func close(then action: (() -> Void)? = nil) {
        withAnimation(.easeOut(duration: WZ.MotionDuration.fast)) { shown = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + WZ.MotionDuration.fast) { onDismiss(action) }
    }
}
