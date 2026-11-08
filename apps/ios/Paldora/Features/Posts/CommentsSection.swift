import PaldoraKit
import SwiftUI

struct CommentsSection: View {
    let model: PostDetailViewModel
    @State private var reacting: BoxComment?
    @State private var reporting: BoxComment?
    @Environment(PaldoraDialogCenter.self) private var dialogs

    private var comments: CommentsViewModel { model.comments }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            PaldoraEyebrow("Conversation")
            switch comments.threads.phase {
            case .idle, .loading: PaldoraRowSkeleton(count: 2)
            case .failed(let message): ErrorBlock(message: message) { await comments.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded: loaded
            }
        }
        .sheet(item: $reacting) { comment in
            CommentReactionSheet(model: model.reactions(for: comment))
        }
        .sheet(item: $reporting) { comment in
            ReportCommentSheet(env: model.env, commentId: comment.id)
        }
    }

    @ViewBuilder private var loaded: some View {
        if comments.visibleThreads.isEmpty {
            PaldoraStateView(icon: .chat, title: "Start the conversation", message: "No comments yet.")
        }
        ForEach(comments.visibleThreads) { thread in thread_(thread) }
        LoadMoreFooter(isLoading: comments.threads.isLoadingMore, error: comments.threads.inlineError,
                       hasMore: comments.threads.hasMore, loadMore: { await comments.threads.loadMore() })
    }

    private func thread_(_ thread: CommentThread) -> some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if comments.isPinned(thread) {
                HStack(spacing: Theme.space1) {
                    PaldoraIconView(.pin, size: 14)
                    Text("Linked comment").paldoraText(.caption)
                }
                .foregroundStyle(Theme.brassText)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("pinned-thread")
            }
            item(thread.root, indented: false)
            ForEach(comments.replies(of: thread), id: \.stableId) { item($0, indented: true) }
            let remaining = comments.remainingReplies(of: thread)
            if remaining > 0 || comments.isLoadingReplies(thread) {
                PaldoraButton("View \(remaining) more \(remaining == 1 ? "reply" : "replies")", kind: .ghost, size: .small,
                              isLoading: comments.isLoadingReplies(thread)) {
                    Task { await comments.loadMoreReplies(thread) }
                }
                .padding(.leading, PaldoraComment<EmptyView>.replyIndent)
                .accessibilityIdentifier("more-replies")
            }
            if let error = comments.repliesError(thread) {
                PaldoraFieldMessage(text: error).padding(.leading, PaldoraComment<EmptyView>.replyIndent)
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private func item(_ item: CommentItem, indented: Bool) -> some View {
        switch item {
        case .comment(let comment): row(comment, indented: indented)
        case .deleted(_, let at):
            PaldoraComment(content: .deleted(timeLabel: Formatting.relativeTime(at)))
                .padding(.leading, indented ? PaldoraComment<EmptyView>.replyIndent : 0)
                .accessibilityIdentifier("comment-placeholder")
        case .hidden(_, let at):
            PaldoraComment(content: PaldoraCommentContent(kind: .deleted, authorName: "", timeLabel: Formatting.relativeTime(at), text: "This comment is hidden."))
                .padding(.leading, indented ? PaldoraComment<EmptyView>.replyIndent : 0)
                .accessibilityIdentifier("comment-placeholder")
        case .unsupported:
            PaldoraBanner(tone: .info, title: "This kind of comment isn't supported in this version of Paldora.")
                .padding(.leading, indented ? PaldoraComment<EmptyView>.replyIndent : 0)
        }
    }

    private func row(_ comment: BoxComment, indented: Bool) -> some View {
        let content = PaldoraCommentContent(
            kind: indented ? .reply : .root, authorName: model.authorName(comment.authorUid),
            avatarMediaId: model.authorAvatar(comment.authorUid),
            timeLabel: Formatting.relativeTime(comment.createdAt) + (comment.updatedAt > comment.createdAt ? " \u{00B7} edited" : ""),
            text: comment.text)
        return PaldoraComment(content: content) {
            FlowLayout(spacing: 0) {
                PaldoraButton("React", kind: .ghost, size: .small) { reacting = comment }.accessibilityIdentifier("react-comment")
                if !indented {
                    PaldoraButton("Reply", kind: .ghost, size: .small) { comments.reply(to: comment) }
                }
                if !comments.isOwn(comment) {
                    PaldoraButton("Report", kind: .ghost, size: .small) { reporting = comment }.accessibilityIdentifier("report-comment")
                }
                if comments.isOwn(comment) {
                    PaldoraButton("Edit", kind: .ghost, size: .small) { comments.edit(comment) }
                    PaldoraButton("Delete", kind: .ghost, size: .small, destructive: true) {
                        dialogs.present(icon: .trash, title: "Delete this comment?", message: "The thread keeps its shape; the text is removed.",
                                        confirmTitle: "Delete comment") { Task { await comments.delete(comment) } }
                    }
                }
            }
        }
        .accessibilityIdentifier("comment")
    }
}

/// Pinned comment bar (Figma 5.1 / 5.5): reply and edit context, a field and a send button.
struct CommentComposer: View {
    @Bindable var comments: CommentsViewModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let target = comments.replyTarget {
                context("Replying to a comment", detail: target.text)
            } else if comments.editing != nil {
                context("Editing your comment", detail: nil)
            }
            if let error = comments.error { PaldoraFieldMessage(text: error) }
            HStack(alignment: .bottom, spacing: Theme.space2) {
                PaldoraFieldContainer(title: "Comment", isFocused: focused, labelIsAccessible: false) {
                    TextField("Add to the conversation…", text: $comments.draft, prompt: Text("Add to the conversation…").foregroundStyle(Theme.textTertiary), axis: .vertical)
                        .lineLimit(1...4)
                        .focused($focused)
                        .accessibilityLabel("Add a comment")
                        .accessibilityIdentifier("comment-field")
                }
                PaldoraIconButton(icon: .send, label: comments.editing == nil ? "Send comment" : "Save comment", style: .primary, size: .large) {
                    focused = false
                    Task { await comments.send() }
                }
                .disabled(!comments.canSend)
                .accessibilityIdentifier("send-comment")
            }
            if comments.draft.count > CommentsViewModel.textLimit * 9 / 10 {
                Text("\(comments.draft.count) of \(CommentsViewModel.textLimit)")
                    .paldoraText(.caption)
                    .foregroundStyle(comments.draft.count > CommentsViewModel.textLimit ? Theme.statusDanger : Theme.textSecondary)
            }
        }
        .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space3)
        .background(Theme.bgCanvas)
        .overlay(alignment: .top) { Rectangle().fill(Theme.borderHairline).frame(height: 1) }
    }

    private func context(_ title: String, detail: String?) -> some View {
        AdaptiveStack {
            VStack(alignment: .leading) {
                Text(title).paldoraText(.labelS).foregroundStyle(Theme.brassText)
                if let detail { Text(detail).paldoraText(.caption).foregroundStyle(Theme.textSecondary).lineLimit(1) }
            }
            PaldoraButton("Cancel", kind: .ghost, size: .small) { comments.cancelComposer() }
        }
    }
}
