import PaldoraKit
import SwiftUI

struct LifeUpdateEditorView: View {
    @State private var model: LifeUpdateEditorViewModel
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, update: LifeUpdate) {
        _model = State(initialValue: LifeUpdateEditorViewModel(env: env, update: update))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                Text("You can change what you wrote and the photos. Who it's for can't be changed.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
                LifeUpdateFields(form: model.form)
                if !model.keptPhotos.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.space2) {
                        Text("Current photos").font(Typography.label).foregroundStyle(Theme.textMuted)
                        ForEach(model.keptPhotos, id: \.self) { id in
                            HStack {
                                RemoteImage(assetId: id).frame(width: 72, height: 72)
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                                Button("Remove") { model.removeKept(id) }
                                    .buttonStyle(QuietButtonStyle(destructive: true))
                            }
                        }
                    }
                }
                if model.attachments.remaining > 0 || !model.attachments.items.isEmpty {
                    PhotoAttachmentsView(attachments: model.attachments)
                }
                if let error = model.error { InlineMessage(text: error) }
                Button { Task { await model.save() } } label: {
                    if model.isSaving { ProgressView() } else { Text("Save changes") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!model.canSave)
                .accessibilityIdentifier("save-life-update")
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .navigationTitle("Edit Life Update")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .onChange(of: model.saved) { if model.saved { dismiss() } }
    }
}
