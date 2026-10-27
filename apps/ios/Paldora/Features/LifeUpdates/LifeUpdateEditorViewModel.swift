import Foundation
import Observation
import PaldoraKit

/// Edits sections and photos of an existing Life Update. The audience is final.
@MainActor
@Observable
final class LifeUpdateEditorViewModel {
    let form = LifeUpdateForm()
    let attachments: PhotoAttachments
    private(set) var keptPhotos: [String]
    private(set) var error: String?
    private(set) var isSaving = false
    private(set) var saved = false
    private let update: LifeUpdate
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, update: LifeUpdate) {
        self.env = env
        self.update = update
        keptPhotos = update.mediaAssetIds
        attachments = PhotoAttachments(env: env, purpose: .lifeUpdate, limit: max(0, 4 - update.mediaAssetIds.count))
        form.load(update.sections)
    }

    func removeKept(_ id: String) { keptPhotos.removeAll { $0 == id } }

    private var photos: [String] { keptPhotos + attachments.readyAssetIds }

    var canSave: Bool {
        !isSaving && !attachments.isBusy && !attachments.hasFailure && form.isWithinLimits
            && (form.hasText || !photos.isEmpty) && changed
    }

    private var changed: Bool {
        form.cleaned != update.sections || photos != update.mediaAssetIds
    }

    func save() async {
        guard canSave else { return }
        isSaving = true
        error = nil
        defer { isSaving = false }
        let changes = LifeUpdateChanges(
            sections: form.cleaned != update.sections ? form.cleaned : nil,
            mediaAssetIds: photos != update.mediaAssetIds ? photos : nil)
        do {
            _ = try await env.api.editLifeUpdate(EditLifeUpdateRequest(id: update.id, changes: changes))
            saved = true
            env.contentChanged()
        } catch {
            self.error = env.message(for: error)
        }
    }
}
