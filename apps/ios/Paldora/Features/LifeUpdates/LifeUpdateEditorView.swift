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
                PaldoraScreenTitle(title: "Edit your", accent: "life update.",
                                   subtitle: "You can change what you wrote and the photos. Who it's for can't be changed.")
                LifeUpdateFields(form: model.form)
                if !model.keptPhotos.isEmpty {
                    VStack(alignment: .leading, spacing: Theme.space2) {
                        PaldoraEyebrow("Current photos")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: Theme.space3) {
                                ForEach(model.keptPhotos, id: \.self) { id in
                                    VStack(spacing: Theme.space1) {
                                        PaldoraUploadTile(state: .done, side: PhotoUploadTile.side) {
                                            RemoteImage(assetId: id, variant: .thumbnail)
                                        }
                                        PaldoraButton("Remove", kind: .ghost, size: .small, destructive: true) { model.removeKept(id) }
                                    }
                                }
                            }
                        }
                    }
                }
                if model.attachments.remaining > 0 || !model.attachments.items.isEmpty {
                    PhotoAttachmentsView(attachments: model.attachments)
                }
                if let error = model.error { PaldoraBanner(tone: .danger, title: error) }
                PaldoraButton("Save changes", isLoading: model.isSaving, fullWidth: true) { Task { await model.save() } }
                    .disabled(!model.canSave)
                    .accessibilityIdentifier("save-life-update")
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("Edit life update", isModal: true)
        .onChange(of: model.saved) { if model.saved { dismiss() } }
    }
}
