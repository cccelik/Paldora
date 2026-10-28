import Foundation
import Observation
import PaldoraKit

/// Threaded comments: roots newest first (20 a page), a short reply preview, and
/// "View N more replies". A linked comment's thread is pinned at the top.
@MainActor
@Observable
final class CommentsViewModel {
    static let textLimit = 2_000

    struct ReplyState: Equatable {
        var items: [CommentItem]
        var next: String?
        var isLoading = false
        var error: String?
    }

    let threads: PagedList<CommentThread>
    private(set) var pinned: CommentThread?
    private(set) var expanded: [String: ReplyState] = [:]
    var draft = ""
    private(set) var replyTarget: BoxComment?
    private(set) var editing: BoxComment?
    private(set) var error: String?
    private(set) var isSending = false

    let env: FeatureEnvironment
    private let route: PostRoute

    init(env: FeatureEnvironment, route: PostRoute) {
        self.env = env
        self.route = route
        let api = env.api
        threads = PagedList(env: env) { cursor in
            let page = try await api.listBoxCommentThreads(
                ListBoxCommentsRequest(boxId: route.boxId, postId: route.postId, cursor: cursor))
            return (page.items, page.nextCursor)
        }
    }

    /// Everything shown: the pinned thread first, then the paged roots without a duplicate.
    var visibleThreads: [CommentThread] {
        let pinnedId = pinned?.rootId
        return (pinned.map { [$0] } ?? []) + threads.items.filter { $0.rootId != pinnedId }
    }

    func isPinned(_ thread: CommentThread) -> Bool { thread.rootId == pinned?.rootId }

    func refresh() async {
        expanded = [:]
        async let list: Void = threads.refresh()
        async let linked: Void = loadPinned()
        _ = await (list, linked)
    }

    private func loadPinned() async {
        guard let commentId = route.commentId else { return }
        pinned = try? await env.api.getBoxCommentThread(
            GetBoxCommentThreadRequest(boxId: route.boxId, postId: route.postId, commentId: commentId))
    }

    // MARK: Replies

    func replies(of thread: CommentThread) -> [CommentItem] { expanded[thread.rootId]?.items ?? thread.replies }

    func remainingReplies(of thread: CommentThread) -> Int {
        let state = expanded[thread.rootId]
        if let state, state.next == nil, !state.items.isEmpty { return 0 }
        return max(0, thread.replyCount - replies(of: thread).count)
    }

    func isLoadingReplies(_ thread: CommentThread) -> Bool { expanded[thread.rootId]?.isLoading ?? false }
    func repliesError(_ thread: CommentThread) -> String? { expanded[thread.rootId]?.error }

    /// Loads the next page of one root's replies (the first page replaces the preview).
    func loadMoreReplies(_ thread: CommentThread) async {
        var state = expanded[thread.rootId] ?? ReplyState(items: [], next: nil)
        guard !state.isLoading else { return }
        let first = expanded[thread.rootId] == nil
        state.isLoading = true
        state.error = nil
        expanded[thread.rootId] = state
        do {
            let page = try await env.api.listBoxCommentReplies(ListBoxCommentRepliesRequest(
                boxId: route.boxId, postId: route.postId, rootId: thread.rootId, cursor: first ? nil : state.next))
            var merged = first ? [] : state.items
            let known = Set(merged.map(Self.id))
            merged.append(contentsOf: page.items.filter { !known.contains(Self.id($0)) })
            expanded[thread.rootId] = ReplyState(items: merged, next: page.nextCursor)
        } catch {
            state.isLoading = false
            state.error = env.message(for: error)
            expanded[thread.rootId] = state
        }
    }

    nonisolated static func id(_ item: CommentItem) -> String { item.stableId }

    // MARK: Composer

    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSending && !trimmed.isEmpty && draft.count <= Self.textLimit
    }

    func isOwn(_ comment: BoxComment) -> Bool { comment.authorUid == env.currentUserID }

    /// One reply level: you reply to a thread's root.
    func reply(to root: BoxComment) {
        editing = nil
        replyTarget = root
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
            await refresh()
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
            await refresh()
        } catch {
            self.error = env.message(for: error)
        }
    }
}

extension CommentItem {
    /// A stable identity for lists (comments, placeholders and unknown kinds never collide).
    var stableId: String {
        switch self {
        case .comment(let comment): comment.id
        case .deleted(let id, _), .hidden(let id, _): id
        case .unsupported(let kind): "unsupported:\(kind)"
        }
    }
}
