import SwiftUI

struct ReactionSection: View {
    let model: PostDetailViewModel
    @State private var custom = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Reactions").font(Typography.headline).foregroundStyle(Theme.text)
            counts
            HStack(spacing: Theme.space2) {
                ForEach(model.presets, id: \.self) { kind in preset(kind) }
            }
            HStack(spacing: Theme.space2) {
                TextField("Any emoji", text: $custom)
                    .font(Typography.body)
                    .padding(.horizontal, Theme.space3)
                    .frame(minHeight: Theme.touchTarget)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
                    .onChange(of: custom) { custom = custom.last.map(String.init) ?? "" }
                    .accessibilityLabel("Custom emoji reaction")
                    .accessibilityIdentifier("custom-reaction-field")
                Button("React") {
                    let kind = custom
                    custom = ""
                    Task { await model.react(kind) }
                }
                .buttonStyle(QuietButtonStyle())
                .disabled(!EmojiValidation.isSingleEmoji(custom))
            }
            if model.viewerKind != nil {
                Button("Remove my reaction") { Task { await model.react(nil) } }
                    .buttonStyle(QuietButtonStyle(destructive: true))
                    .accessibilityIdentifier("clear-reaction")
            }
            if let error = model.reactionError { InlineMessage(text: error) }
        }
    }

    @ViewBuilder private var counts: some View {
        if model.reactionCounts.isEmpty {
            Text("No reactions yet").font(Typography.callout).foregroundStyle(Theme.textMuted)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.space2) {
                    ForEach(model.reactionCounts, id: \.kind) { entry in
                        Text("\(Self.display(entry.kind)) \(entry.count)")
                            .font(Typography.label)
                            .padding(.horizontal, Theme.space3)
                            .frame(minHeight: 32)
                            .background(Theme.highlight, in: Capsule())
                            .accessibilityLabel("\(entry.count) \(Self.display(entry.kind)) reactions")
                    }
                }
            }
            .accessibilityIdentifier("reaction-counts")
        }
    }

    private func preset(_ kind: String) -> some View {
        let selected = model.viewerKind == kind
        return Button { Task { await model.toggle(kind) } } label: {
            Text(kind).font(.title2)
                .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                .background(selected ? Theme.highlight : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(selected ? Theme.gold : Theme.hairline, lineWidth: selected ? 2 : 1))
        }
        .accessibilityLabel("React with \(kind)")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("reaction-\(kind)")
    }

    static func display(_ kind: String) -> String { kind == "real" ? "📷" : kind }
}
