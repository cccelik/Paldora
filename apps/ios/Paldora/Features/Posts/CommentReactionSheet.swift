import SwiftUI

struct CommentReactionSheet: View {
    let model: CommentReactionsViewModel
    @State private var custom = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.space4) {
                switch model.phase {
                case .idle, .loading: LoadingBlock(label: "Loading reactions")
                case .failed(let message): ErrorBlock(message: message) { await model.load() }
                case .unavailable: UnavailableBlock()
                case .loaded: content
                }
                Spacer()
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle("React to comment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
        .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        if model.counts.isEmpty {
            Text("No reactions yet").font(Typography.callout).foregroundStyle(Theme.textMuted)
        } else {
            FlowLayout {
                ForEach(model.counts, id: \.kind) { entry in
                    Text("\(ReactionSection.display(entry.kind)) \(entry.count)").font(Typography.label)
                        .padding(.horizontal, Theme.space3).frame(minHeight: 32)
                        .foregroundStyle(Theme.text)
                        .background(Theme.highlight, in: Capsule())
                        .accessibilityLabel("\(entry.count) \(ReactionSection.display(entry.kind)) reactions")
                }
            }
        }
        HStack(spacing: Theme.space2) {
            ForEach(model.presets, id: \.self) { kind in
                let selected = model.viewerKind == kind
                Button { Task { await model.toggle(kind) } } label: {
                    Text(kind).font(.title2).frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                        .background(selected ? Theme.highlight : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(selected ? Theme.gold : Theme.hairline, lineWidth: selected ? 2 : 1))
                }
                .accessibilityLabel("React with \(kind)")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        AdaptiveStack {
            TextField("Any emoji", text: $custom, prompt: Text("Any emoji").foregroundStyle(Theme.textMuted))
                .padding(.horizontal, Theme.space3).frame(minHeight: Theme.touchTarget)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                .onChange(of: custom) { custom = custom.last.map(String.init) ?? "" }
                .accessibilityLabel("Custom emoji reaction")
            Button("React") { let kind = custom; custom = ""; Task { await model.react(kind) } }
                .buttonStyle(QuietButtonStyle()).disabled(!EmojiValidation.isSingleEmoji(custom))
        }
        if model.viewerKind != nil {
            Button("Remove my reaction") { Task { await model.react(nil) } }
                .buttonStyle(QuietButtonStyle(destructive: true))
        }
        if let error = model.error { InlineMessage(text: error) }
    }
}
