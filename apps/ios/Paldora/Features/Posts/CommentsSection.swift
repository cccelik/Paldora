import PaldoraKit
import SwiftUI

struct CommentsSection: View {
    let model: PostDetailViewModel
    @State private var pendingDelete: BoxComment?

    private var comments: CommentsViewModel { model.comments }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Comments").font(Typography.headline).foregroundStyle(Theme.text)
            switch comments.list.phase {
            case .idle, .loading: LoadingBlock(label: "Loading comments")
            case .failed(let message): ErrorBlock(message: message) { await comments.list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded: loaded
            }
        }
        .confirmationDialog("Delete this comment?", isPresented: Binding(
            get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }
        ), titleVisibility: .visible) {
            Button("Delete comment", role: .destructive) {
                if let target = pendingDelete { Task { await comments.delete(target) } }
                pendingDelete = nil
            }
        }
    }

    @ViewBuilder private var loaded: some View {
        if comments.list.items.isEmpty {
            Text("No comments yet").font(Typography.callout).foregroundStyle(Theme.textMuted)
        }
        ForEach(comments.threads, id: \.root.id) { thread in
            row(thread.root, indented: false)
            ForEach(thread.replies) { row($0, indented: true) }
        }
        LoadMoreFooter(isLoading: comments.list.isLoadingMore, error: comments.list.inlineError,
                       hasMore: comments.list.hasMore, loadMore: { await comments.list.loadMore() })
    }

    private func row(_ comment: BoxComment, indented: Bool) -> some View {
        VStack(alignment: .leading, spacing: Theme.space1) {
            HStack(spacing: Theme.space2) {
                AvatarView(mediaId: model.authorAvatar(comment.authorUid), name: model.authorName(comment.authorUid), size: 28)
                Text(model.authorName(comment.authorUid)).font(Typography.label).foregroundStyle(Theme.text)
            }
            Text(comment.text).font(Typography.body).foregroundStyle(Theme.text)
            HStack(spacing: 0) {
                Text(Formatting.relativeTime(comment.createdAt)
                     + (comment.updatedAt > comment.createdAt ? " · edited" : ""))
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
                Spacer()
                if !indented {
                    Button("Reply") { comments.reply(to: comment) }.buttonStyle(QuietButtonStyle())
                }
                if comments.isOwn(comment) {
                    Button("Edit") { comments.edit(comment) }.buttonStyle(QuietButtonStyle())
                    Button("Delete") { pendingDelete = comment }.buttonStyle(QuietButtonStyle(destructive: true))
                }
            }
        }
        .padding(.leading, indented ? Theme.space6 : 0)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("comment")
    }
}

/// Pinned composer for comments, replies and edits.
struct CommentComposer: View {
    @Bindable var comments: CommentsViewModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let target = comments.replyTarget {
                banner("Replying to a comment", detail: target.text)
            } else if comments.editing != nil {
                banner("Editing your comment", detail: nil)
            }
            if let error = comments.error { InlineMessage(text: error) }
            HStack(alignment: .bottom, spacing: Theme.space2) {
                TextField("Add a comment", text: $comments.draft, axis: .vertical)
                    .lineLimit(1...4)
                    .font(Typography.body)
                    .padding(.horizontal, Theme.space3).padding(.vertical, Theme.space2)
                    .frame(minHeight: Theme.touchTarget)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
                    .focused($focused)
                    .accessibilityIdentifier("comment-field")
                Button(comments.editing == nil ? "Send" : "Save") {
                    focused = false
                    Task { await comments.send() }
                }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(!comments.canSend)
                    .accessibilityIdentifier("send-comment")
            }
            if comments.draft.count > CommentsViewModel.textLimit * 9 / 10 {
                Text("\(comments.draft.count) of \(CommentsViewModel.textLimit)")
                    .font(Typography.caption)
                    .foregroundStyle(comments.draft.count > CommentsViewModel.textLimit ? Theme.danger : Theme.textMuted)
            }
        }
        .padding(Theme.space3)
        .background(Theme.canvas)
        .overlay(alignment: .top) { Rectangle().fill(Theme.hairline).frame(height: 1) }
    }

    private func banner(_ title: String, detail: String?) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(title).font(Typography.label).foregroundStyle(Theme.goldText)
                if let detail { Text(detail).font(Typography.caption).foregroundStyle(Theme.textMuted).lineLimit(1) }
            }
            Spacer()
            Button("Cancel") { comments.cancelComposer() }.buttonStyle(QuietButtonStyle())
        }
    }
}
