import PaldoraKit
import SwiftUI

struct LifeUpdateComposerView: View {
    let env: FeatureEnvironment
    @State private var model: LifeUpdateComposerViewModel
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: LifeUpdateComposerViewModel(env: env))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                Text("A catch-up on what's been going on. Every section is optional.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
                LifeUpdateFields(form: model.form)
                PhotoAttachmentsView(attachments: model.attachments)
                audience
                if let error = model.error { InlineMessage(text: error) }
                Button { Task { await model.publish() } } label: {
                    if model.isPublishing { ProgressView() } else { Text("Share Life Update") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!model.canPublish)
                .accessibilityIdentifier("publish-life-update")
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .navigationTitle("New Life Update")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .onChange(of: model.publishedId) { if model.publishedId != nil { dismiss() } }
    }

    private var audience: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            Text("Who it's for").font(Typography.title).foregroundStyle(Theme.text)
            Text("You choose this once. It can't be changed after you share.")
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
            Toggle("Only me", isOn: $model.onlyMe)
                .frame(minHeight: Theme.touchTarget)
                .accessibilityIdentifier("only-me-toggle")
            if !model.onlyMe { boxList }
        }
    }

    @ViewBuilder private var boxList: some View {
        switch model.boxes.phase {
        case .idle, .loading: LoadingBlock(label: "Loading your Boxes")
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded:
            if model.boxes.items.isEmpty {
                Text("You're not in any Boxes yet. Share this as Only me, or join a Box first.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
            }
            ForEach(model.boxes.items) { box in
                let archived = box.status == .archived
                let chosen = model.audienceContains(box.id)
                Button { model.toggle(box) } label: {
                    HStack {
                        Image(systemName: chosen ? "checkmark.square.fill" : "square")
                            .foregroundStyle(chosen ? Theme.goldText : Theme.textMuted)
                        Text(box.name).foregroundStyle(Theme.text)
                        if archived { Text("Archived, so it can't receive new updates").font(Typography.caption).foregroundStyle(Theme.textMuted) }
                        Spacer()
                    }
                    .frame(minHeight: Theme.touchTarget)
                }
                .disabled(archived)
                .accessibilityAddTraits(chosen ? .isSelected : [])
                .accessibilityIdentifier("audience-box")
            }
            Text("\(model.selectedCount) of \(LifeUpdateComposerViewModel.maxBoxes) Boxes chosen")
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
    }
}
