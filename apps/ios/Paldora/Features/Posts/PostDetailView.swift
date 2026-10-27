import PaldoraKit
import SwiftUI

struct PostDetailView: View {
    let env: FeatureEnvironment
    let route: PostRoute
    var onMutated: @MainActor () -> Void = {}
    @State private var model: PostDetailViewModel
    @State private var showEdit = false
    @State private var showReport = false
    @State private var confirmDelete = false
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, route: PostRoute, onMutated: @escaping @MainActor () -> Void = {}) {
        self.env = env
        self.route = route
        self.onMutated = onMutated
        _model = State(initialValue: PostDetailViewModel(env: env, route: route))
    }

    var body: some View {
        content
            .background(Theme.canvas)
            .navigationTitle("Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { menu }
            .task { await model.load() }
            .sheet(isPresented: $showEdit) {
                TextEntrySheet(title: "Edit post", prompt: "Post", actionTitle: "Save changes",
                               limit: PostDetailViewModel.textLimit, initialText: model.post?.text ?? "") { text in
                    let failure = await model.saveEdit(text)
                    if failure == nil { onMutated() }
                    return failure
                }
            }
            .sheet(isPresented: $showReport) {
                TextEntrySheet(title: "Report post", prompt: "What's wrong with this post?", actionTitle: "Send report",
                               limit: 2_000, initialText: "") { await model.report(reason: $0) }
            }
            .confirmationDialog("Delete this post?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete post", role: .destructive) {
                    Task { if await model.delete() { onMutated(); dismiss() } }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: LoadingBlock(label: "Loading post")
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let post):
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space6) {
                    postCard(post)
                    ReactionSection(model: model)
                    CommentsSection(model: model)
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space4)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await model.load() }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { CommentComposer(comments: model.comments) }
        }
    }

    private func postCard(_ post: BoxPost) -> some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            HStack(spacing: Theme.space3) {
                AvatarView(mediaId: model.authorAvatar(post.authorUid), name: model.authorName(post.authorUid))
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.authorName(post.authorUid)).font(Typography.headline).foregroundStyle(Theme.text)
                    Text("\(env.boxes.name(for: post.boxId) ?? "Box") · \(Formatting.relativeTime(post.createdAt))"
                         + (post.updatedAt > post.createdAt ? " · edited" : ""))
                        .font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
            }
            Text(post.text).font(Typography.body).foregroundStyle(Theme.text)
                .accessibilityIdentifier("post-text")
            PhotoStrip(assetIds: post.mediaAssetIds)
            if let error = model.actionError { InlineMessage(text: error) }
            if model.reportSent { InlineMessage(text: "Thanks. We'll take a look.", kind: .success) }
        }
        .paldoraCard()
    }

    @ToolbarContentBuilder private var menu: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if model.isOwnEditablePost || model.canReport {
                Menu {
                    if model.isOwnEditablePost {
                        Button("Edit", systemImage: "pencil") { showEdit = true }
                        Button("Delete", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    }
                    if model.canReport { Button("Report", systemImage: "flag") { showReport = true } }
                } label: { Image(systemName: "ellipsis.circle").frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget) }
                .accessibilityLabel("Post actions")
                .accessibilityIdentifier("post-actions")
            }
        }
    }
}
