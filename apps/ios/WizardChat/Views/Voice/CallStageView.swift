import LiveKit
import WizardChatCore
import SwiftUI

enum StageTile: Identifiable, Equatable {
    case person(CallParticipantInfo)
    case screen(CallParticipantInfo)
    case watch

    var id: String {
        switch self {
        case .person(let participant): participant.identity
        case .screen(let participant): "\(participant.identity):screen"
        case .watch: "watch-together"
        }
    }

    var isStage: Bool {
        if case .person = self { return false }
        return true
    }
}

private enum StageLayout: Equatable {
    case calling, oneOnOne, grid, spotlight
}

private enum PipCorner {
    case topLeading, topTrailing, bottomLeading, bottomTrailing
}

private struct WatchObserving<Content: View>: View {
    @ObservedObject var watch: WatchTogether
    @ViewBuilder let content: (WatchTogether) -> Content

    var body: some View { content(watch) }
}

/// The call itself: one other person full screen with you in a corner, a grid, or one tile in
/// focus with the rest in a strip; screen shares and Watch Together only once you choose to watch
struct InCallView: View {
    let room: RoomSummary
    var title: String?
    var onMinimize: (() -> Void)?
    var onOpenChat: (() -> Void)?

    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var pinned: String?
    @State private var preferred: StageLayout?
    @State private var lastSpeaker: String?
    @State private var swapped = false
    @State private var corner = PipCorner.bottomTrailing
    @State private var chromeVisible = true
    @State private var chromeTouches = 0
    @State private var headerHeight: CGFloat = 0
    @State private var controlsHeight: CGFloat = 0
    @State private var volumeFor: CallParticipantInfo?

    private static let gap = WZ.Space.space4
    private static let autoHide = Duration.seconds(5)

    var body: some View {
        Group {
            if let watch = calls.watch {
                WatchObserving(watch: watch) { content(watch: $0) }
            } else {
                content(watch: nil)
            }
        }
        .sheet(item: $volumeFor) { participant in
            VolumeSheet(roomId: room.id, userId: participant.userId)
                .presentationDetents([.height(260)])
        }
    }

    private var local: CallParticipantInfo? { calls.participants.first { $0.isLocal } }
    private var others: [CallParticipantInfo] { calls.participants.filter { !$0.isLocal } }

    private func tiles(watchActive: Bool) -> [StageTile] {
        var list: [StageTile] = []
        if watchActive { list.append(.watch) }
        list += calls.participants.map(StageTile.person)
        list += calls.participants.filter(\.screenShared).map(StageTile.screen)
        return list
    }

    private func layout(_ tiles: [StageTile]) -> StageLayout {
        let hasStage = tiles.contains(where: \.isStage)
        if others.isEmpty && !hasStage && !room.isVoice { return .calling }
        if preferred == .grid { return .grid }
        if preferred == .spotlight { return .spotlight }
        if others.count == 1 && !hasStage && pinned == nil { return .oneOnOne }
        if pinned != nil || hasStage { return .spotlight }
        return .grid
    }

    private func focus(_ tiles: [StageTile], watchingNow: Bool) -> StageTile? {
        if let pinned, let tile = tiles.first(where: { $0.id == pinned }) { return tile }
        if watchingNow, tiles.contains(.watch) { return .watch }
        let screens = tiles.compactMap { tile -> CallParticipantInfo? in
            if case .screen(let participant) = tile { return participant }
            return nil
        }
        if let screen = screens.first(where: { !$0.isLocal && $0.watchingScreen }) ?? screens.first(where: { !$0.isLocal })
            ?? screens.first {
            return .screen(screen)
        }
        if tiles.contains(.watch) { return .watch }
        let people = tiles.compactMap { tile -> CallParticipantInfo? in
            if case .person(let participant) = tile { return participant }
            return nil
        }
        if let speaker = people.first(where: { !$0.isLocal && $0.identity == lastSpeaker }) { return .person(speaker) }
        if let other = people.first(where: { !$0.isLocal }) { return .person(other) }
        return tiles.first
    }

    private func content(watch: WatchTogether?) -> some View {
        let watchActive = watch?.state != nil
        let watchingNow = watchActive && watch?.watchingVideoId == watch?.state?.videoId
        let tiles = tiles(watchActive: watchActive)
        let layout = layout(tiles)
        let focused = focus(tiles, watchingNow: watchingNow)
        let mainHasVideo = layout == .oneOnOne && (swapped ? local?.cameraTrack : others.first?.cameraTrack) != nil
        let canHide = mainHasVideo
        let showToggle = (layout == .grid || layout == .spotlight) && tiles.count > 1
        let speaker = others.first(where: \.speaking)?.identity
        let hasStage = tiles.contains(where: \.isStage)

        return GeometryReader { outer in
            let safe = outer.safeAreaInsets
            let chrome = chromeVisible || !canHide
            let insets = EdgeInsets(top: safe.top + (chrome ? headerHeight : 0), leading: safe.leading,
                                    bottom: safe.bottom + (chrome ? controlsHeight : 0), trailing: safe.trailing)
            ZStack {
                GeometryReader { full in
                    stage(layout, tiles: tiles, focused: focused, watch: watch, size: full.size,
                          safe: safe, insets: insets, chrome: chrome)
                }
                .ignoresSafeArea()

                VStack(spacing: WZ.Space.space0) {
                    header(showToggle: showToggle, layout: layout)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
                    Spacer(minLength: 0)
                    CallControls(onOpenChat: onOpenChat)
                        .padding(.horizontal, WZ.Space.space6)
                        .padding(.bottom, WZ.Space.space4)
                        .padding(.top, WZ.Space.space4)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { controlsHeight = $0 }
                        .simultaneousGesture(TapGesture().onEnded { chromeTouches += 1 })
                }
                .opacity(chrome ? 1 : 0)
                .offset(y: chrome ? 0 : WZ.Space.space6)
                .allowsHitTesting(chrome)
            }
            .animation(.easeInOut(duration: WZ.MotionDuration.slow), value: chrome)
        }
        .background(theme.bgSecondary.ignoresSafeArea())
        .statusBarHidden(onMinimize != nil && canHide && !chromeVisible)
        .task(id: "\(chromeVisible)|\(canHide)|\(chromeTouches)") {
            guard canHide, chromeVisible else { return }
            try? await Task.sleep(for: Self.autoHide)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: WZ.MotionDuration.slow)) { chromeVisible = false }
        }
        .onChange(of: canHide) { _, hide in if !hide { chromeVisible = true } }
        .onChange(of: speaker) { _, speaker in if let speaker { lastSpeaker = speaker } }
        .onChange(of: hasStage) { _, has in
            if !has {
                preferred = nil
                if pinned?.hasSuffix(":screen") == true || pinned == StageTile.watch.id { pinned = nil }
            }
        }
        .onChange(of: watchingNow) { _, now in if now { pinned = StageTile.watch.id } }
        .onChange(of: tiles.map(\.id)) { _, ids in if let pinned, !ids.contains(pinned) { self.pinned = nil } }
        .animation(.spring(duration: WZ.MotionDuration.slow * 1.5), value: layout)
        .animation(.spring(duration: WZ.MotionDuration.slow * 1.5), value: focused?.id)
    }

    private func header(showToggle: Bool, layout: StageLayout) -> some View {
        HStack(spacing: WZ.Space.space4) {
            if let onMinimize {
                roundButton("ph-caret-down-regular", label: String(localized: "call.minimize"), action: onMinimize)
            }
            Spacer(minLength: 0)
            if showToggle {
                let spotlight = layout == .spotlight
                roundButton(spotlight ? "ph-squares-four-regular" : "ph-presentation-regular",
                            label: String(localized: spotlight ? "call.switchToGrid" : "call.switchToSpotlight")) {
                    if spotlight {
                        pinned = nil
                        preferred = .grid
                    } else {
                        preferred = .spotlight
                    }
                }
            } else if onMinimize != nil {
                Color.clear.frame(width: WZ.Space.space10, height: WZ.Space.space10)
            }
        }
        .overlay {
            VStack(spacing: WZ.Space.space0) {
                if let title, layout != .calling {
                    Text(title)
                        .font(.wizard(WZ.FontSize.lg, .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                }
                if calls.reconnecting {
                    Label(String(localized: "call.statusReconnecting"), image: "ph-wifi-slash-regular")
                        .font(.wizard(WZ.FontSize.sm, .semibold))
                        .foregroundStyle(theme.warningColor)
                }
            }
            .padding(.horizontal, WZ.Space.space11 + WZ.Space.space4)
            .shadow(color: .black.opacity(layout == .oneOnOne ? 0.35 : 0), radius: 6)
        }
        .padding(.horizontal, WZ.Space.space6)
        .padding(.top, WZ.Space.space4)
        .padding(.bottom, WZ.Space.space4)
    }

    private func roundButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(icon)
                .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .frame(width: WZ.Space.space10, height: WZ.Space.space10)
                .floatingGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func stage(_ layout: StageLayout, tiles: [StageTile], focused: StageTile?, watch: WatchTogether?,
                       size: CGSize, safe: EdgeInsets, insets: EdgeInsets, chrome: Bool) -> some View {
        switch layout {
        case .calling:
            CallingView(room: room, local: local, insets: insets)
        case .oneOnOne:
            oneOnOne(size: size, insets: insets, chrome: chrome)
        case .grid:
            grid(tiles, watch: watch, size: size, insets: insets)
        case .spotlight:
            spotlight(tiles, focused: focused, watch: watch, size: size, insets: insets)
        }
        if calls.state == .joining && layout != .calling {
            ProgressView(String(localized: "call.statusConnecting"))
                .tint(theme.accent)
                .padding(WZ.Space.space7)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                .position(x: size.width / 2, y: size.height / 2)
        }
    }

    @ViewBuilder
    private func oneOnOne(size: CGSize, insets: EdgeInsets, chrome: Bool) -> some View {
        let remote = others.first
        let main = swapped ? local : remote
        let pip = swapped ? remote : local
        ZStack {
            if let main {
                PersonTile(roomId: room.id, participant: main, style: .full, insets: insets)
                    .id(main.identity)
                    .transition(.opacity)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: WZ.MotionDuration.slow)) { chromeVisible.toggle() }
                    }
                    .contextMenu { if !main.isLocal { personMenu(main) } }
            }
            if let pip {
                FloatingPip(container: size, insets: insets, corner: $corner) {
                    PersonTile(roomId: room.id, participant: pip, style: .pip)
                        .id(pip.identity)
                } onTap: {
                    withAnimation(.spring(duration: WZ.MotionDuration.slow * 1.5)) { swapped.toggle() }
                }
                .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        }
        .frame(width: size.width, height: size.height)
        .animation(.spring(duration: WZ.MotionDuration.slow * 1.5), value: pip?.identity)
        .animation(.spring(duration: WZ.MotionDuration.slow * 1.5), value: swapped)
    }

    private func gridShape(count: Int, in area: CGSize) -> (columns: Int, scroll: Bool) {
        guard count > 1 else { return (1, false) }
        let aspect: CGFloat = area.width > area.height ? 16 / 9 : 3 / 4
        var best = (columns: 1, width: CGFloat(0))
        for columns in 1...count {
            let rows = Int(ceil(Double(count) / Double(columns)))
            let byWidth = (area.width - Self.gap * CGFloat(columns - 1)) / CGFloat(columns)
            let byHeight = (area.height - Self.gap * CGFloat(rows - 1)) / CGFloat(rows) * aspect
            let width = min(byWidth, byHeight)
            if width > best.width { best = (columns, width) }
        }
        if best.width < 96 { return (area.width > area.height ? 4 : 2, true) }
        return (best.columns, false)
    }

    private func grid(_ tiles: [StageTile], watch: WatchTogether?, size: CGSize, insets: EdgeInsets) -> some View {
        let pad = Self.gap
        let area = CGSize(width: max(size.width - insets.leading - insets.trailing - pad * 2, 1),
                          height: max(size.height - insets.top - insets.bottom - pad * 2, 1))
        let shape = gridShape(count: tiles.count, in: area)
        let rows = stride(from: 0, to: tiles.count, by: shape.columns).map { Array(tiles[$0..<min($0 + shape.columns, tiles.count)]) }
        return Group {
            if shape.scroll {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Self.gap), count: shape.columns),
                              spacing: Self.gap) {
                        ForEach(tiles) { tile in
                            tileView(tile, watch: watch, style: .tile) { select(tile) }
                                .aspectRatio(3 / 4, contentMode: .fit)
                        }
                    }
                    .padding(pad)
                }
                .contentMargins(.top, insets.top, for: .scrollContent)
                .contentMargins(.bottom, insets.bottom, for: .scrollContent)
                .padding(.leading, insets.leading)
                .padding(.trailing, insets.trailing)
            } else {
                VStack(spacing: Self.gap) {
                    ForEach(rows.indices, id: \.self) { index in
                        HStack(spacing: Self.gap) {
                            ForEach(rows[index]) { tile in
                                tileView(tile, watch: watch, style: .tile) { select(tile) }
                            }
                        }
                    }
                }
                .padding(pad)
                .padding(insets)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func spotlight(_ tiles: [StageTile], focused: StageTile?, watch: WatchTogether?, size: CGSize,
                           insets: EdgeInsets) -> some View {
        let rest = tiles.filter { $0.id != focused?.id }
        let landscape = size.width - insets.leading - insets.trailing > size.height - insets.top - insets.bottom
        let strip = GeometryReader { bounds in
            ScrollView(landscape ? .vertical : .horizontal, showsIndicators: false) {
                let stack = ForEach(rest) { tile in
                    tileView(tile, watch: watch, style: .strip) { select(tile) }
                        .frame(width: landscape ? 168 : 96, height: landscape ? 96 : 128)
                }
                if landscape {
                    LazyVStack(spacing: Self.gap) { stack }
                        .frame(minHeight: bounds.size.height)
                } else {
                    LazyHStack(spacing: Self.gap) { stack }
                        .frame(minWidth: bounds.size.width)
                }
            }
        }
        return Group {
            if landscape {
                HStack(spacing: Self.gap) {
                    if let focused { focusedView(focused, watch: watch) }
                    if !rest.isEmpty { strip.frame(width: 168) }
                }
            } else {
                VStack(spacing: Self.gap) {
                    if let focused { focusedView(focused, watch: watch) }
                    if !rest.isEmpty { strip.frame(height: 128) }
                }
            }
        }
        .padding(Self.gap)
        .padding(insets)
        .frame(width: size.width, height: size.height)
    }

    private func focusedView(_ tile: StageTile, watch: WatchTogether?) -> some View {
        tileView(tile, watch: watch, style: .focused) {
            if case .person = tile {
                pinned = nil
                preferred = .grid
            }
        }
        .id(tile.id)
        .transition(.opacity.combined(with: .scale(scale: 0.96)))
    }

    private func select(_ tile: StageTile) {
        pinned = tile.id
        preferred = nil
    }

    @ViewBuilder
    private func tileView(_ tile: StageTile, watch: WatchTogether?, style: TileStyle,
                          onTap: @escaping () -> Void) -> some View {
        switch tile {
        case .person(let participant):
            PersonTile(roomId: room.id, participant: participant, style: style)
                .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
                .onTapGesture(perform: onTap)
                .contextMenu { if !participant.isLocal { personMenu(participant) } }
        case .screen(let participant):
            ScreenTile(roomId: room.id, participant: participant, compact: style == .strip) {
                calls.setWatchingScreen(participant.identity, true)
                pinned = tile.id
                preferred = nil
            }
            .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .onTapGesture(perform: style == .focused ? {} : onTap)
            .contextMenu {
                if !participant.isLocal && participant.watchingScreen {
                    Button { calls.setWatchingScreen(participant.identity, false) } label: {
                        Label(String(localized: "call.stopWatching"), image: "ph-eye-slash-regular")
                    }
                }
            }
        case .watch:
            if let watch {
                WatchTogetherTile(watch: watch, room: room, compact: style == .strip, onFocus: onTap)
            }
        }
    }

    @ViewBuilder
    private func personMenu(_ participant: CallParticipantInfo) -> some View {
        Button {
            calls.toggleLocalMute(participant.userId)
        } label: {
            participant.locallyMuted
                ? Label(String(localized: "call.unmuteForMe"), image: "ph-speaker-high-regular")
                : Label(String(localized: "call.muteForMe"), image: "ph-speaker-slash-regular")
        }
        Button { volumeFor = participant } label: { Label(String(localized: "call.volume"), image: "ph-sliders-regular") }
    }
}

enum TileStyle { case full, pip, tile, focused, strip }

private struct FloatingPip<Content: View>: View {
    let container: CGSize
    let insets: EdgeInsets
    @Binding var corner: PipCorner
    @ViewBuilder let content: Content
    let onTap: () -> Void
    @State private var drag: CGSize = .zero

    private static var margin: CGFloat { WZ.Space.space5 }

    private var size: CGSize {
        let short = min(max(container.width, container.height) * 0.17, 132)
        let long = short * 3 / 2
        return container.width > container.height ? CGSize(width: long, height: short) : CGSize(width: short, height: long)
    }

    private func center(_ corner: PipCorner) -> CGPoint {
        let leading = corner == .topLeading || corner == .bottomLeading
        let top = corner == .topLeading || corner == .topTrailing
        let x = leading ? insets.leading + Self.margin + size.width / 2
            : container.width - insets.trailing - Self.margin - size.width / 2
        let y = top ? insets.top + Self.margin + size.height / 2
            : container.height - insets.bottom - Self.margin - size.height / 2
        return CGPoint(x: x, y: y)
    }

    var body: some View {
        let origin = center(corner)
        content
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
            .position(x: origin.x + drag.width, y: origin.y + drag.height)
            .onTapGesture(perform: onTap)
            .gesture(
                DragGesture()
                    .onChanged { drag = $0.translation }
                    .onEnded { value in
                        let end = CGPoint(x: origin.x + value.predictedEndTranslation.width,
                                          y: origin.y + value.predictedEndTranslation.height)
                        let left = end.x < container.width / 2
                        let up = end.y < container.height / 2
                        withAnimation(.spring(duration: 0.4, bounce: 0.25)) {
                            corner = up ? (left ? .topLeading : .topTrailing) : (left ? .bottomLeading : .bottomTrailing)
                            drag = .zero
                        }
                    }
            )
            .animation(.spring(duration: 0.4, bounce: 0.15), value: insets)
            .sensoryFeedback(.impact(weight: .light), trigger: corner)
    }
}

private struct Backdrop: View {
    let name: String
    let url: String?
    @Environment(\.theme) private var theme

    var body: some View {
        GeometryReader { geo in
            ZStack {
                theme.bgTertiary
                AvatarView(name: name, url: url, size: max(geo.size.width, geo.size.height))
                    .blur(radius: 60)
                    .opacity(0.55)
                    .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .clipped()
        .allowsHitTesting(false)
    }
}

private struct PersonTile: View {
    let roomId: String
    let participant: CallParticipantInfo
    let style: TileStyle
    var insets = EdgeInsets()

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    private var label: String {
        let name = name ?? participant.userId
        if participant.isOwnOtherDevice { return L10n.format("call.ownOtherDevice", name) }
        return name
    }

    private var avatarSize: CGFloat {
        switch style {
        case .full: WZ.SizeAvatar.xxl
        case .focused: WZ.SizeAvatar.xl
        case .tile: WZ.SizeAvatar.lg
        case .pip, .strip: WZ.SizeAvatar.md
        }
    }

    private var radius: CGFloat { style == .full ? 0 : WZ.Radius.xl }

    var body: some View {
        ZStack {
            Backdrop(name: label, url: avatarUrl)
            if let track = participant.cameraTrack {
                SwiftUIVideoView(track, layoutMode: .fill)
                    .transition(.opacity)
            } else {
                VStack(spacing: WZ.Space.space5) {
                    AvatarView(name: label, url: avatarUrl, size: avatarSize)
                        .overlay {
                            Circle()
                                .stroke(style != .full ? .clear : participant.soundboard != nil ? theme.info
                                            : participant.speaking ? theme.success : .clear,
                                        lineWidth: WZ.BorderWidth.thick)
                                .padding(-WZ.Space.space3)
                        }
                        .opacity(participant.connected ? 1 : 0.5)
                    if style == .full {
                        HStack(spacing: WZ.Space.space3) {
                            if participant.micMuted {
                                Image("ph-microphone-slash-regular")
                                    .font(.system(size: WZ.SizeIcon.sm, weight: .bold))
                                    .foregroundStyle(theme.danger)
                            }
                            Text(label)
                                .font(.wizard(WZ.FontSize.xxl, .bold))
                                .foregroundStyle(theme.textPrimary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, WZ.Space.space8)
                    }
                }
                .transition(.opacity)
            }
            if let flash = participant.soundboard {
                Text(flash.emoji)
                    .font(.system(size: style == .strip || style == .pip ? WZ.SizeIcon.xl : WZ.SizeIcon.xxl))
                    .transition(.scale.combined(with: .opacity))
                    .id("\(flash.emoji)\(flash.key)")
            } else if let reaction = participant.reaction {
                Text(reaction)
                    .font(.system(size: style == .strip || style == .pip ? WZ.SizeIcon.xl : WZ.SizeIcon.xxl))
                    .transition(.scale.combined(with: .opacity))
                    .id(reaction)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay {
            if style != .full && style != .pip {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(participant.soundboard != nil ? theme.info : participant.speaking ? theme.success : .clear,
                            lineWidth: WZ.BorderWidth.thick)
            }
        }
        .overlay(alignment: .topTrailing) {
            if participant.handRaised {
                Text("🖐️")
                    .font(.system(size: style == .strip ? WZ.SizeIcon.xs : WZ.SizeIcon.md))
                    .frame(width: style == .strip ? WZ.Space.space8 : WZ.Space.space9,
                           height: style == .strip ? WZ.Space.space8 : WZ.Space.space9)
                    .background(.regularMaterial, in: Circle())
                    .padding(style == .full ? WZ.Space.space6 : WZ.Space.space3)
                    .padding(.top, insets.top)
                    .padding(.trailing, insets.trailing)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if style == .tile || style == .focused || style == .strip {
                nameLabel
            } else if style == .pip && participant.micMuted {
                Image("ph-microphone-slash-regular")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: WZ.Space.space8, height: WZ.Space.space8)
                    .background(theme.danger, in: Circle())
                    .padding(WZ.Space.space3)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if participant.isLocal && participant.cameraTrack != nil && style != .strip && style != .full {
                Button { calls.flipCamera() } label: {
                    Image("ph-camera-rotate-regular")
                        .font(.system(size: style == .pip ? WZ.SizeIcon.xs : WZ.SizeIcon.md))
                        .foregroundStyle(.white)
                        .frame(width: style == .pip ? WZ.Space.space8 : WZ.Space.space9,
                               height: style == .pip ? WZ.Space.space8 : WZ.Space.space9)
                        .background(.black.opacity(0.35), in: Circle())
                }
                .buttonStyle(.plain)
                .padding(style == .pip ? WZ.Space.space3 : WZ.Space.space4)
                .accessibilityLabel(String(localized: "call.switchCamera"))
            }
        }
        .animation(.easeInOut(duration: WZ.MotionDuration.slow), value: participant.cameraTrack != nil)
        .animation(.spring(duration: WZ.MotionDuration.slow), value: participant.reaction)
        .animation(.spring(duration: WZ.MotionDuration.slow), value: participant.soundboard)
        .animation(.easeOut(duration: WZ.MotionDuration.fast), value: participant.speaking)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
        .task(id: participant.userId) {
            let profile = await session.memberProfile(participant.userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }

    private var nameLabel: some View {
        HStack(spacing: WZ.Space.space2) {
            if participant.micMuted || participant.locallyMuted {
                Image(participant.locallyMuted ? "ph-speaker-slash-regular" : "ph-microphone-slash-regular")
                    .font(.system(size: WZ.SizeIcon.xs, weight: .bold))
                    .foregroundStyle(theme.danger)
            }
            Text(label)
                .font(.wizard(style == .strip ? WZ.FontSize.xs : WZ.FontSize.sm, .semibold))
                .lineLimit(1)
            if !participant.connected {
                ProgressView().controlSize(.mini)
            }
        }
        .foregroundStyle(theme.textPrimary)
        .padding(.horizontal, style == .strip ? WZ.Space.space3 : WZ.Space.space4)
        .padding(.vertical, WZ.Space.space2)
        .background(.regularMaterial, in: Capsule())
        .padding(style == .strip ? WZ.Space.space3 : WZ.Space.space4)
    }
}

private struct ScreenTile: View {
    let roomId: String
    let participant: CallParticipantInfo
    let compact: Bool
    let onWatch: () -> Void

    @EnvironmentObject private var session: MatrixSession
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    var body: some View {
        ZStack {
            if participant.isLocal {
                Backdrop(name: name ?? participant.userId, url: avatarUrl)
                VStack(spacing: WZ.Space.space4) {
                    Image("ph-monitor-arrow-up-regular")
                        .font(.system(size: compact ? WZ.SizeIcon.md : WZ.SizeIcon.xl))
                    if !compact {
                        Text(String(localized: "call.ownScreenHidden"))
                            .font(.wizard(WZ.FontSize.md, .semibold))
                            .multilineTextAlignment(.center)
                    }
                }
                .foregroundStyle(theme.textPrimary)
                .padding(WZ.Space.space6)
            } else if !participant.watchingScreen {
                Backdrop(name: name ?? participant.userId, url: avatarUrl)
                VStack(spacing: WZ.Space.space5) {
                    if !compact {
                        AvatarView(name: name ?? participant.userId, url: avatarUrl, size: WZ.SizeAvatar.lg)
                    }
                    Button(action: onWatch) {
                        Label(String(localized: "call.watchStream"), image: "ph-eye-regular")
                            .labelStyle(WatchLabelStyle(iconOnly: compact))
                            .font(.wizard(compact ? WZ.FontSize.sm : WZ.FontSize.md, .semibold))
                            .foregroundStyle(theme.textOnAccent)
                            .padding(.horizontal, compact ? WZ.Space.space4 : WZ.Space.space6)
                            .padding(.vertical, compact ? WZ.Space.space3 : WZ.Space.space4)
                            .background(theme.accent, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            } else if let track = participant.screenTrack {
                Color.black
                SwiftUIVideoView(track, layoutMode: .fit)
                    .transition(.opacity)
            } else {
                Color.black
                ProgressView().tint(.white)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: WZ.Radius.xl, style: .continuous))
        .overlay(alignment: .topLeading) { liveRow }
        .overlay(alignment: .bottomLeading) {
            if !compact {
                Label(L10n.format("call.userScreen", "\(name ?? participant.userId)"), image: "ph-monitor-regular")
                    .font(.wizard(WZ.FontSize.sm, .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                    .padding(.horizontal, WZ.Space.space4)
                    .padding(.vertical, WZ.Space.space2)
                    .background(.regularMaterial, in: Capsule())
                    .padding(WZ.Space.space4)
            }
        }
        .overlay(alignment: .topTrailing) {
            if !compact && !participant.isLocal && participant.watchingScreen {
                Button { calls.setWatchingScreen(participant.identity, false) } label: {
                    Image("ph-eye-slash-regular")
                        .font(.system(size: WZ.SizeIcon.sm, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: WZ.Space.space9, height: WZ.Space.space9)
                        .background(.black.opacity(0.45), in: Circle())
                }
                .buttonStyle(.plain)
                .padding(WZ.Space.space4)
                .accessibilityLabel(String(localized: "call.stopWatching"))
            }
        }
        .animation(.easeInOut(duration: WZ.MotionDuration.slow), value: participant.screenTrack != nil)
        .animation(.easeInOut(duration: WZ.MotionDuration.slow), value: participant.watchingScreen)
        .task(id: participant.userId) {
            let profile = await session.memberProfile(participant.userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }

    private var liveRow: some View {
        HStack(spacing: 6) {
            Text(String(localized: "call.live"))
                .tracking(0.3)
                .padding(.horizontal, 7)
                .frame(height: 18)
                .background(Color(red: 0x59 / 255, green: 0x36 / 255, blue: 0x95 / 255), in: Capsule())
            if participant.isLocal, !participant.screenWatchers.isEmpty {
                HStack(spacing: 4) {
                    Image("ph-eye-regular").font(.system(size: 12, weight: .bold))
                    Text(verbatim: "\(participant.screenWatchers.count)")
                }
                .padding(.horizontal, 7)
                .frame(height: 18)
                .background(.black.opacity(0.6), in: Capsule())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L10n.format("call.streamViewers", participant.screenWatchers.count))
            }
        }
        .font(.wizard(WZ.FontSize.xs, .bold))
        .foregroundStyle(.white)
        .padding(compact ? WZ.Space.space3 : WZ.Space.space4)
    }
}

private struct WatchLabelStyle: LabelStyle {
    let iconOnly: Bool

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: WZ.Space.space3) {
            configuration.icon
            if !iconOnly { configuration.title }
        }
    }
}

/// Ringing the other person or waiting for them; your camera fills the screen meanwhile
private struct CallingView: View {
    let room: RoomSummary
    let local: CallParticipantInfo?
    let insets: EdgeInsets

    @EnvironmentObject private var calls: CallManager
    @EnvironmentObject private var session: MatrixSession
    @Environment(\.theme) private var theme
    @State private var otherName: String?
    @State private var otherAvatar: String?

    var body: some View {
        ZStack {
            if let track = local?.cameraTrack {
                SwiftUIVideoView(track, layoutMode: .fill)
                    .overlay(Color.black.opacity(0.35))
                    .transition(.opacity)
            } else {
                Backdrop(name: otherName ?? room.displayName, url: otherAvatar ?? room.avatarUrl)
                    .transition(.opacity)
            }
            VStack(spacing: WZ.Space.space6) {
                AvatarView(name: otherName ?? room.displayName, url: otherAvatar ?? room.avatarUrl, size: WZ.SizeAvatar.xxl)
                    .overlay {
                        if calls.ring == .ringing {
                            RingPulse(color: theme.success)
                        }
                    }
                Text(otherName ?? room.displayName)
                    .font(.wizard(WZ.FontSize.xxl, .bold))
                    .foregroundStyle(local?.cameraTrack != nil ? .white : theme.textPrimary)
                    .multilineTextAlignment(.center)
                Group {
                    switch calls.ring {
                    case .ringing: Text(String(localized: "call.ringing"))
                    case .declined: Text(String(localized: "call.event.declined"))
                    case .unanswered: Text(String(localized: "call.event.unanswered"))
                    case nil: Text(calls.state == .joining ? String(localized: "call.statusConnecting") : String(localized: "call.waitingForThem"))
                    }
                }
                .font(.wizard(WZ.FontSize.lg))
                .foregroundStyle(calls.ring == .declined ? theme.danger : local?.cameraTrack != nil ? .white.opacity(0.85) : theme.textMuted)
                if calls.ring == .declined || calls.ring == .unanswered {
                    Button { calls.ringAgain() } label: { Label(String(localized: "call.callAgain"), image: "ph-phone-outgoing-regular") }
                        .buttonStyle(PrimaryButtonStyle())
                        .frame(maxWidth: WZ.Size.sidebar)
                }
            }
            .padding(WZ.Space.space8)
            .padding(insets)
        }
        .animation(.easeInOut(duration: WZ.MotionDuration.slow), value: local?.cameraTrack != nil)
        .task(id: room.id) {
            guard let other = room.dmUserId else { return }
            let profile = await session.memberProfile(other, in: room.id)
            otherName = profile.name ?? other
            otherAvatar = profile.avatarUrl
        }
    }
}

private struct RingPulse: View {
    let color: Color
    @State private var pulse = false

    var body: some View {
        Circle()
            .stroke(color, lineWidth: WZ.BorderWidth.thick)
            .scaleEffect(pulse ? 1.35 : 1)
            .opacity(pulse ? 0 : 0.9)
            .onAppear {
                withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
            }
    }
}

private struct VolumeSheet: View {
    let roomId: String
    @EnvironmentObject private var session: MatrixSession
    let userId: String
    @EnvironmentObject private var calls: CallManager
    @Environment(\.theme) private var theme
    @State private var name: String?
    @State private var avatarUrl: String?

    private var participant: CallParticipantInfo? { calls.participants.first { $0.userId == userId } }

    var body: some View {
        VStack(spacing: WZ.Space.space6) {
            HStack(spacing: WZ.Space.space5) {
                AvatarView(name: name ?? userId, url: avatarUrl, size: WZ.SizeAvatar.md)
                Text(name ?? userId).font(.wizard(WZ.FontSize.lg, .semibold)).foregroundStyle(theme.textPrimary).lineLimit(1)
                Spacer()
            }
            VStack(alignment: .leading, spacing: WZ.Space.space3) {
                HStack {
                    Text(String(localized: "call.volume")).font(.wizard(WZ.FontSize.md, .medium))
                    Spacer()
                    Text("\(Int(((participant?.volume ?? 1) * 100).rounded()))%")
                        .font(.wizard(WZ.FontSize.md).monospacedDigit())
                        .foregroundStyle(theme.textMuted)
                }
                HStack(spacing: WZ.Space.space4) {
                    Image("ph-speaker-none-regular").foregroundStyle(theme.textMuted)
                    Slider(value: Binding(get: { participant?.volume ?? 1 },
                                          set: { calls.setVolume($0, for: userId) }), in: 0...2)
                        .tint(theme.accent)
                    Image("ph-speaker-high-regular").foregroundStyle(theme.textMuted)
                }
            }
            Toggle(String(localized: "call.muteForMe"), isOn: Binding(get: { participant?.locallyMuted ?? false },
                                                set: { _ in calls.toggleLocalMute(userId) }))
                .font(.wizard(WZ.FontSize.md, .medium))
                .tint(theme.accent)
        }
        .foregroundStyle(theme.textPrimary)
        .padding(WZ.Space.space8)
        .task {
            let profile = await session.memberProfile(userId, in: roomId)
            name = profile.name
            avatarUrl = profile.avatarUrl
        }
    }
}
