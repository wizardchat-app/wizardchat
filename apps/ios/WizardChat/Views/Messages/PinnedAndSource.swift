import WizardChatCore
import SwiftUI

struct PinnedMessagesView: View {
    let room: RoomSummary
    let canPin: Bool

    @StateObject private var timeline: TimelineModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    init(room: RoomSummary, client: WizardClient, canPin: Bool) {
        self.room = room
        self.canPin = canPin
        _timeline = StateObject(wrappedValue: TimelineModel(client: client, roomId: room.id, pinnedOnly: true))
    }

    private var messages: [ChatEntry] {
        timeline.entries.filter {
            switch $0.kind {
            case .dateDivider, .system, .call: return false
            default: return true
            }
        }
        .map { var entry = $0; entry.isGrouped = false; return entry }
        .reversed()
    }

    var body: some View {
            List {
                ForEach(messages) { entry in
                    MessageRow(entry: entry, isPrivateRoom: room.isDirect)
                        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(theme.bgSecondary)
                        .swipeActions {
                            if canPin {
                                Button(String(localized: "timeline.unpin")) { Task { await timeline.togglePin(entry) } }
                                    .tint(theme.accent)
                            }
                        }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(theme.bgSecondary)
            .overlay {
                if messages.isEmpty {
                    ContentUnavailableView(String(localized: "timeline.pinnedEmpty"), image: "ph-push-pin-regular",
                                           description: Text(String(localized: "timeline.pinImportantMessagesFrom")))
                }
            }
            .navigationTitle(String(localized: "room.header.pinnedMessages"))
            .navigationBarTitleDisplayMode(.inline)
            .tint(theme.control)
            .task { await timeline.start() }
    }
}

struct SourceView: View {
    let json: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView([.vertical, .horizontal]) {
                Text(json)
                    .font(.system(size: WZ.SizeIcon.xs, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                    .textSelection(.enabled)
                    .padding(WZ.Space.space6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.bgSecondary)
            .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
            .navigationTitle(String(localized: "timeline.viewSource"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { copyToClipboard(json) } label: { Image("ph-copy-regular") }
                        .accessibilityLabel(String(localized: "common.copy"))
                }
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .tint(theme.control)
        }
    }
}

struct EditHistory: Identifiable {
    let id = UUID()
    let versions: [MessageVersion]
}

struct EditHistoryView: View {
    let versions: [MessageVersion]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        let newestFirst = Array(versions.reversed())
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: WZ.Space.space4) {
                    ForEach(Array(newestFirst.enumerated()), id: \.element.eventId) { index, version in
                        VStack(alignment: .leading, spacing: WZ.Space.space2) {
                            Text(meta(index: index, of: newestFirst.count, timestamp: version.timestamp))
                                .font(.wizard(WZ.FontSize.sm, .medium))
                                .foregroundStyle(theme.textMuted)
                            Text(version.body)
                                .font(.wizard(WZ.FontSize.md))
                                .foregroundStyle(theme.textPrimary)
                                .textSelection(.enabled)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(WZ.Space.space5)
                        .background(theme.bgTertiary, in: RoundedRectangle(cornerRadius: WZ.Radius.md, style: .continuous))
                    }
                }
                .padding(WZ.Space.space6)
            }
            .background(theme.bgSecondary)
            .navigationTitle(String(localized: "timeline.editHistory"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
            }
            .tint(theme.control)
        }
    }

    private func meta(index: Int, of count: Int, timestamp: Int) -> String {
        let date = Date(timeIntervalSince1970: Double(timestamp) / 1000)
            .formatted(date: .abbreviated, time: .shortened)
        if index == 0 { return "\(String(localized: "timeline.editHistoryCurrent")) · \(date)" }
        if index == count - 1 { return "\(String(localized: "timeline.editHistoryOriginal")) · \(date)" }
        return date
    }
}

struct SelectTextView: View {
    let text: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            SelectableText(text: text, color: UIColor(theme.textPrimary), tint: UIColor(theme.accent))
                .padding(.horizontal, WZ.Space.space5)
                .background(theme.bgSecondary)
                .overlay(alignment: .top) { CopyToastView().padding(.top, WZ.Space.space2) }
                .navigationTitle(String(localized: "timeline.selectText"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { copyToClipboard(text) } label: { Image("ph-copy-regular") }
                            .accessibilityLabel(String(localized: "common.copy"))
                    }
                    ToolbarItem(placement: .confirmationAction) { Button(String(localized: "common.done")) { dismiss() } }
                }
                .tint(theme.control)
        }
        .presentationDetents([.medium, .large])
    }
}

private struct SelectableText: UIViewRepresentable {
    let text: String
    let color: UIColor
    let tint: UIColor

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.isEditable = false
        view.isSelectable = true
        view.backgroundColor = .clear
        view.font = Font.wizardUIFont(WZ.FontSize.lg)
        view.adjustsFontForContentSizeCategory = true
        view.textColor = color
        view.tintColor = tint
        view.dataDetectorTypes = .link
        view.textContainerInset = UIEdgeInsets(top: WZ.Space.space5, left: 0, bottom: WZ.Space.space5, right: 0)
        view.text = text
        DispatchQueue.main.async {
            view.becomeFirstResponder()
            view.selectedRange = NSRange(location: 0, length: (text as NSString).length)
        }
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {}
}
