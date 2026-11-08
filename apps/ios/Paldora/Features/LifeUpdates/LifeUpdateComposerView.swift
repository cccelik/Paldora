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
                PaldoraScreenTitle(eyebrow: "New life update", title: "What's been", accent: "going on?",
                                   subtitle: "A catch-up for your people. Every section is optional.")
                LifeUpdateFields(form: model.form)
                PhotoAttachmentsView(attachments: model.attachments)
                audience
                if let error = model.error { PaldoraBanner(tone: .danger, title: error) }
                PaldoraButton("Share Life Update", isLoading: model.isPublishing, fullWidth: true) { Task { await model.publish() } }
                    .disabled(!model.canPublish)
                    .accessibilityIdentifier("publish-life-update")
                Text("Life updates are never public. Not even a little.").paldoraText(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("New life update")
        .task { await model.load() }
        .onChange(of: model.publishedId) { if model.publishedId != nil { dismiss() } }
    }

    private var audience: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            PaldoraEyebrow("Who sees this")
            Text("You choose this once. It can't be changed after you share.")
                .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            PaldoraListGroup {
                PaldoraListRow(title: "Only me", subtitle: "Keep it as a private note", icon: .lock,
                               trailing: .toggle($model.onlyMe))
                    .accessibilityIdentifier("only-me-toggle")
            }
            if !model.onlyMe { boxList }
        }
    }

    @ViewBuilder private var boxList: some View {
        switch model.boxes.phase {
        case .idle, .loading: LoadingBlock(label: "Loading your Boxes", compact: true)
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded:
            if model.boxes.items.isEmpty {
                PaldoraBanner(tone: .info, title: "You're not in any Boxes yet",
                              message: "Share this as Only me, or join a Box first.")
            }
            PaldoraListGroup {
                ForEach(model.boxes.items) { box in
                    let archived = box.status == .archived
                    PaldoraCheckbox(archived ? "\(box.name) · archived, can't receive updates" : box.name,
                                    isOn: Binding(get: { model.audienceContains(box.id) }, set: { _ in model.toggle(box) }))
                        .disabled(archived)
                        .accessibilityIdentifier("audience-box")
                }
            }
            Text("\(model.selectedCount) of \(LifeUpdateComposerViewModel.maxBoxes) Boxes chosen")
                .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
        }
    }
}
