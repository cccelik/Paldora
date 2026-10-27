import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class LifeUpdateComposerViewModel {
    static let maxBoxes = 20

    let form = LifeUpdateForm()
    let attachments: PhotoAttachments
    let boxes: PagedList<PaldoraKit.Box>
    var onlyMe = false
    private(set) var selected: Set<String> = []
    private(set) var error: String?
    private(set) var isPublishing = false
    private(set) var publishedId: String?
    /// One key per form: a retried publish by the same author publishes once.
    private var idempotencyKey = UUID().uuidString.lowercased()
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment) {
        self.env = env
        attachments = PhotoAttachments(env: env, purpose: .lifeUpdate)
        let api = env.api
        boxes = PagedList(env: env) { cursor in
            let page = try await api.listMyBoxes(cursor: cursor)
            return (page.items, page.nextCursor)
        }
    }

    var key: String { idempotencyKey }
    var selectedCount: Int { selected.count }
    func audienceContains(_ boxId: String) -> Bool { selected.contains(boxId) }

    func load() async {
        await boxes.loadFirst()
        await boxes.loadAll()
    }

    func toggle(_ box: PaldoraKit.Box) {
        guard box.status == .active else { return }
        if selected.contains(box.id) { selected.remove(box.id) } else if selected.count < Self.maxBoxes { selected.insert(box.id) }
    }

    var audience: LifeUpdateAudience? {
        if onlyMe { return .onlyMe }
        return selected.isEmpty ? nil : .boxes(boxes.items.map(\.id).filter(selected.contains).map { $0.lowercased() })
    }

    var canPublish: Bool {
        !isPublishing && !attachments.isBusy && !attachments.hasFailure && audience != nil
            && form.isWithinLimits && (form.hasText || !attachments.readyAssetIds.isEmpty)
    }

    func publish() async {
        guard canPublish, let audience else { return }
        isPublishing = true
        error = nil
        defer { isPublishing = false }
        do {
            let photos = attachments.readyAssetIds
            let response = try await env.api.createLifeUpdate(CreateLifeUpdateRequest(
                audience: audience, sections: form.cleaned,
                mediaAssetIds: photos.isEmpty ? nil : photos, idempotencyKey: idempotencyKey))
            publishedId = response.id
            env.contentChanged()
        } catch {
            self.error = env.message(for: error)
        }
    }

    /// Clears the form for a new Life Update, with a fresh idempotency key.
    func reset() {
        form.sections = [:]
        attachments.clear()
        selected = []
        onlyMe = false
        publishedId = nil
        idempotencyKey = UUID().uuidString.lowercased()
    }
}
