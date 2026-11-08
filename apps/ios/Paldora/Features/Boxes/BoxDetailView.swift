import PaldoraKit
import SwiftUI

struct BoxDetailView: View {
    let env: FeatureEnvironment
    let route: BoxRoute
    @State private var model: BoxDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var seenVersion = 0

    init(env: FeatureEnvironment, route: BoxRoute) {
        self.env = env
        self.route = route
        _model = State(initialValue: BoxDetailViewModel(env: env, boxId: route.boxId))
    }

    var body: some View {
        content
            .paldoraCanvas()
            .paldoraNavBar(model.box?.name ?? "Box", showsTitle: false)
            .task { await model.load(); seenVersion = env.contentVersion }
            .onAppear {
                // Returning from Manage: pick up renames and archive changes, and leave a Box that is gone.
                guard seenVersion != env.contentVersion else { return }
                seenVersion = env.contentVersion
                Task {
                    await model.load()
                    if model.phase == .unavailable { dismiss() }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: ScrollView { LoadingBlock(label: "Loading Box").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let box): loaded(box)
        }
    }

    private func loaded(_ box: Box) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.space4) {
                PaldoraScreenTitle(eyebrow: box.status == .archived ? "Private Box · archived" : "Private Box", title: box.name,
                                   subtitle: Formatting.countLabel(box.memberCount, singular: "member", plural: "members"))
                FlowLayout {
                    NavigationLink { MembersView(env: env, box: box) } label: {
                        Label("Members", systemImage: "person.2")
                    }
                    .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .small))
                    .accessibilityIdentifier("members-link")
                    NavigationLink(value: MemoriesRoute(scope: .box(id: box.id))) {
                        Label("Memories", systemImage: "clock.arrow.circlepath")
                    }
                    .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .small))
                    .accessibilityIdentifier("box-memories-link")
                    NavigationLink(value: BoxManageRoute(box: box)) {
                        Label("Manage", systemImage: "gearshape")
                    }
                    .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .small))
                    .accessibilityLabel("Manage Box")
                    .accessibilityIdentifier("manage-box")
                }
                if model.canPost {
                    PostComposer(model: model)
                } else {
                    PaldoraBanner(tone: .warning, title: "This Box is archived",
                                  message: "You can read it, but nobody can post, comment or react. The owner can restore it.")
                }
                posts
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.load() }
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var posts: some View {
        switch model.posts.phase {
        case .idle, .loading: LoadingBlock(label: "Loading posts")
        case .failed(let message): ErrorBlock(message: message) { await model.posts.refresh() }
        case .unavailable: UnavailableBlock()
        case .loaded:
            if model.posts.items.isEmpty {
                EmptyBlock(title: "Say hello", message: "Be the first to post in this Box.", icon: .chat)
            }
            ForEach(model.posts.items) { post in
                NavigationLink(value: PostRoute(boxId: post.boxId, postId: post.id)) {
                    BoxPostRow(post: post, author: model.authorName(post.authorUid),
                               avatar: model.authorAvatar(post.authorUid))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("box-post")
            }
            LoadMoreFooter(isLoading: model.posts.isLoadingMore, error: model.posts.inlineError,
                           hasMore: model.posts.hasMore, loadMore: { await model.posts.loadMore() })
        }
    }
}

struct BoxPostRow: View {
    let post: BoxPost
    let author: String
    var avatar: String?

    var body: some View {
        PaldoraPostCard(
            content: PaldoraPostCardContent(
                authorName: author, avatarMediaId: avatar,
                context: Formatting.relativeTime(post.createdAt) + (post.kind == .lifeUpdate ? " · Life update" : ""),
                caption: post.text, reactionCount: 0, commentCount: 0, audience: nil),
            media: { PhotoStrip(assetIds: post.mediaAssetIds, interactive: false) })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(author), \(Formatting.relativeTime(post.createdAt)). \(post.text)")
    }
}

/// Figma 4.2 "New moment": a card-style composer with the upload tiles and a count.
struct PostComposer: View {
    @Bindable var model: BoxDetailViewModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            PaldoraFieldContainer(title: "Post to this Box", isFocused: focused) {
                TextField("What's on your mind?", text: $model.draft, prompt: Text("What's on your mind?").foregroundStyle(Theme.textTertiary), axis: .vertical)
                    .lineLimit(2...8)
                    .padding(.vertical, Theme.space3)
                    .focused($focused)
                    .accessibilityIdentifier("post-field")
            }
            PhotoAttachmentsView(attachments: model.attachments)
            Text("\(model.draft.count) of \(BoxDetailViewModel.textLimit)").paldoraText(.caption)
                .foregroundStyle(model.draft.count > BoxDetailViewModel.textLimit ? Theme.statusDanger : Theme.textSecondary)
            if let error = model.composeError { PaldoraFieldMessage(text: error) }
            PaldoraButton("Post", size: .medium, isLoading: model.isPosting, fullWidth: true) {
                focused = false
                Task { await model.publish() }
            }
            .disabled(!model.canSubmit)
            .accessibilityIdentifier("publish-post")
        }
        .padding(Theme.space4)
        .background(Theme.bgSunken.opacity(0.5), in: RoundedRectangle(cornerRadius: Theme.radiusLg))
    }
}
