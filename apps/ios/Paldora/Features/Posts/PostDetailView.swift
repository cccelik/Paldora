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

    @State private var showActions = false
    @Environment(PaldoraDialogCenter.self) private var dialogs

    var body: some View {
        content
            .paldoraCanvas()
            .paldoraNavBar(env.boxes.name(for: route.boxId) ?? "Post", trailing: hasActions ? .more { showActions = true } : .none)
            .task { await model.load() }
            .sheet(isPresented: $showEdit) {
                TextEntrySheet(title: "Edit caption", prompt: "Post", actionTitle: "Save changes",
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
            .paldoraBottomSheet(isPresented: $showActions, title: model.isOwnEditablePost ? "Your moment" : "Post") { actions }
    }

    private var hasActions: Bool { model.isOwnEditablePost || model.canReport }

    /// Figma 4.7: edit and delete on your own post, report on someone else's.
    @ViewBuilder private var actions: some View {
        PaldoraListGroup {
            if model.isOwnEditablePost {
                PaldoraListRow(title: "Edit caption", subtitle: "Shows \u{201C}edited\u{201D} to members", icon: .edit, trailing: .none) {
                    showActions = false
                    showEdit = true
                }
                .accessibilityIdentifier("post-edit")
                PaldoraListDivider()
                PaldoraListRow(title: "Delete moment", icon: .trash, trailing: .none, isDestructive: true) {
                    showActions = false
                    dialogs.present(icon: .trash, title: "Delete this moment?",
                                    message: "It's removed for everyone in the Box.", confirmTitle: "Delete moment") {
                        Task { if await model.delete() { onMutated(); dismiss() } }
                    }
                }
                .accessibilityIdentifier("post-delete")
            }
            if model.canReport {
                if model.isOwnEditablePost { PaldoraListDivider() }
                PaldoraListRow(title: "Report", icon: .flag, trailing: .none, isDestructive: true) {
                    showActions = false
                    showReport = true
                }
                .accessibilityIdentifier("post-report")
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: ScrollView { LoadingBlock(label: "Loading post").padding(Theme.gutter) }
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
                .padding(.horizontal, Theme.gutter)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await model.load() }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { CommentComposer(comments: model.comments) }
        }
    }

    /// Author header; opens their Room when their username is known.
    @ViewBuilder private func authorLink(_ post: BoxPost) -> some View {
        let name = model.authorName(post.authorUid)
        let header = HStack(spacing: Theme.space3) {
            PaldoraAvatar(name: name, size: .medium, mediaId: model.authorAvatar(post.authorUid))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                Text("\(env.boxes.name(for: post.boxId) ?? "Box") · \(Formatting.relativeTime(post.createdAt))"
                     + (post.updatedAt > post.createdAt ? " · edited" : ""))
                    .paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
            }
            Spacer(minLength: 0)
        }
        if let username = model.authorUsername(post.authorUid) {
            NavigationLink(value: RoomRoute(username: username)) { header }
                .buttonStyle(.plain).accessibilityHint("Opens their Room")
                .accessibilityIdentifier("post-author-room")
        } else { header }
    }

    private func postCard(_ post: BoxPost) -> some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            authorLink(post)
            Text(post.text).paldoraText(.titleS).foregroundStyle(Theme.textPrimary)
                .accessibilityIdentifier("post-text")
            PhotoStrip(assetIds: post.mediaAssetIds)
            if let error = model.actionError { PaldoraBanner(tone: .danger, title: error) }
            if model.reportSent { PaldoraBanner(tone: .success, title: "Thanks. We'll take a look.") }
        }
        .padding(Theme.space4)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radiusXl))
        .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radiusXl))
        .paldoraElevation(.soft)
    }
}
