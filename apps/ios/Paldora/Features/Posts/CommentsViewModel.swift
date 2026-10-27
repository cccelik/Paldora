import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class CommentsViewModel {
    static let textLimit = 2_000

    let list: PagedList<BoxComment>
    var draft = ""
    private(set) var replyTarget: BoxComment?
    private(set) var editing: BoxComment?
    private(set) var error: String?
    private(set) var isSending = false

    private let env: FeatureEnvironment
    private let route: PostRoute

    init(env: FeatureEnvironment, route: PostRoute) {
        self.env = env
        self.route = route
        let api = env.api
        list = PagedList(env: env) { cursor in
            let page = try await api.listBoxComments(
                ListBoxCommentsRequest(boxId: route.boxId, postId: route.postId, cursor: cursor)
            )
            return (page.items, page.nextCursor)
        }
    }

    /// Roots in contract order; replies grouped under their parent. A reply
    /// whose parent is not loaded is shown as a root so nothing disappears.
    var threads: [(root: BoxComment, replies: [BoxComment])] {
        let loaded = Set(list.items.map(\.id))
        var replies: [String: [BoxComment]] = [:]
        var roots: [BoxComment] = []
        for comment in list.items {
            if let parent = comment.parentId, loaded.contains(parent) {
                replies[parent, default: []].append(comment)
            } else {
                roots.append(comment)
            }
        }
        return roots.map { ($0, replies[$0.id] ?? []) }
    }

    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSending && !trimmed.isEmpty && draft.count <= Self.textLimit
    }

    func isOwn(_ comment: BoxComment) -> Bool { comment.authorUid == env.currentUserID }

    /// One reply level: replying to a reply targets its parent.
    func reply(to comment: BoxComment) {
        editing = nil
        replyTarget = comment.parentId.flatMap { id in list.items.first { $0.id == id } } ?? comment
    }

    func edit(_ comment: BoxComment) {
        replyTarget = nil
        editing = comment
        draft = comment.text
    }

    func cancelComposer() {
        replyTarget = nil
        editing = nil
        draft = ""
        error = nil
    }

    func send() async {
        guard canSend else { return }
        isSending = true
        error = nil
        defer { isSending = false }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let editing {
                _ = try await env.api.editBoxComment(EditBoxCommentRequest(
                    boxId: route.boxId, postId: route.postId, commentId: editing.id, text: text))
            } else {
                _ = try await env.api.createBoxComment(CreateBoxCommentRequest(
                    boxId: route.boxId, postId: route.postId, text: text, parentId: replyTarget?.id))
            }
            cancelComposer()
            await list.refresh()
            await list.loadAll()
        } catch {
            self.error = env.message(for: error)
        }
    }

    func delete(_ comment: BoxComment) async {
        error = nil
        do {
            _ = try await env.api.deleteBoxComment(DeleteBoxCommentRequest(
                boxId: route.boxId, postId: route.postId, commentId: comment.id))
            if editing?.id == comment.id || replyTarget?.id == comment.id { cancelComposer() }
            await list.refresh()
            await list.loadAll()
        } catch {
            self.error = env.message(for: error)
        }
    }
}
