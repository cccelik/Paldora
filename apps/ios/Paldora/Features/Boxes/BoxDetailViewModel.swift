import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class BoxDetailViewModel {
    enum Phase: Equatable {
        case loading
        case loaded(Box)
        case unavailable
        case failed(String)
    }

    static let textLimit = 5_000

    private(set) var phase: Phase = .loading
    let posts: PagedList<BoxPost>
    var draft = ""
    private(set) var composeError: String?
    private(set) var isPosting = false
    let boxId: String
    let attachments: PhotoAttachments
    private let env: FeatureEnvironment
    private var draftKey = DraftKey()

    init(env: FeatureEnvironment, boxId: String) {
        self.env = env
        self.boxId = boxId
        attachments = PhotoAttachments(env: env, purpose: .postImage(boxId: boxId))
        let api = env.api
        posts = PagedList(env: env) { cursor in
            let page = try await api.listBoxPosts(ListBoxPostsRequest(boxId: boxId, cursor: cursor))
            return (page.items, page.nextCursor)
        }
    }

    var box: Box? {
        if case .loaded(let box) = phase { box } else { nil }
    }

    /// Archived Boxes are readable but reject posts.
    var canPost: Bool { box?.status == .active }

    var canSubmit: Bool {
        let hasText = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasPhotos = !attachments.readyAssetIds.isEmpty
        return !isPosting && !attachments.isBusy && !attachments.hasFailure && (hasText || hasPhotos) && draft.count <= Self.textLimit
    }

    func authorName(_ uid: String) -> String {
        uid == env.currentUserID ? "You" : (env.people.name(for: uid, in: boxId) ?? "A member")
    }

    func authorAvatar(_ uid: String) -> String? { env.people.avatar(for: uid, in: boxId) }

    func load() async {
        do {
            let box = try await env.api.getBox(boxId: boxId)
            env.boxes.remember(box)
            phase = .loaded(box)
        } catch {
            phase = FeatureEnvironment.isAbsent(error) ? .unavailable : .failed(env.message(for: error))
            return
        }
        async let people: Void = env.people.load(boxId: boxId)
        await posts.refresh()
        await people
    }

    func publish() async {
        guard canSubmit else { return }
        isPosting = true
        composeError = nil
        defer { isPosting = false }
        do {
            let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            let photos = attachments.readyAssetIds
            _ = try await env.api.createBoxPost(CreateBoxPostRequest(
                boxId: boxId, text: text, mediaAssetIds: photos.isEmpty ? nil : photos,
                idempotencyKey: draftKey.key(for: ([text] + photos).joined(separator: "\u{1F}"))))
            draftKey.rotate()
            draft = ""
            attachments.clear()
            env.contentChanged()
            await posts.refresh()
        } catch {
            composeError = env.message(for: error)
        }
    }
}
