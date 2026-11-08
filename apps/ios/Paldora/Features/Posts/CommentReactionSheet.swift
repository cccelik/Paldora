import SwiftUI

struct CommentReactionSheet: View {
    let model: CommentReactionsViewModel
    @State private var custom = ""

    var body: some View {
        PaldoraBottomSheetContent(title: "React to comment") {
            switch model.phase {
            case .idle, .loading: PaldoraRowSkeleton(count: 2)
            case .failed(let message): ErrorBlock(message: message) { await model.load() }
            case .unavailable: UnavailableBlock()
            case .loaded: content
            }
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(Theme.radiusSheet)
        .presentationDragIndicator(.hidden)
        .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        if model.counts.isEmpty {
            Text("No reactions yet").paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
        } else {
            FlowLayout {
                ForEach(model.counts, id: \.kind) { entry in
                    ReactionSection.countChip(entry.kind, entry.count)
                }
            }
        }
        HStack(spacing: Theme.space2) {
            ForEach(model.presets, id: \.self) { kind in
                PaldoraEmojiButton(emoji: kind, isSelected: model.viewerKind == kind) { Task { await model.toggle(kind) } }
            }
        }
        HStack(spacing: Theme.space2) {
            PaldoraTextField("Any emoji", text: $custom, placeholder: "Any emoji")
                .onChange(of: custom) { custom = custom.last.map(String.init) ?? "" }
            PaldoraButton("React", kind: .secondary, size: .small) { let kind = custom; custom = ""; Task { await model.react(kind) } }
                .disabled(!EmojiValidation.isSingleEmoji(custom))
        }
        if model.viewerKind != nil {
            PaldoraButton("Remove my reaction", kind: .ghost, size: .small, destructive: true) { Task { await model.react(nil) } }
        }
        if let error = model.error { PaldoraFieldMessage(text: error) }
    }
}
