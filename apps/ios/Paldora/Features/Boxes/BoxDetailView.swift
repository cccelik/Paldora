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
            .background(Theme.canvas)
            .navigationTitle(model.box?.name ?? "Box")
            .navigationBarTitleDisplayMode(.inline)
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if let box = model.box {
                        NavigationLink(value: BoxManageRoute(box: box)) {
                            Image(systemName: "gearshape").frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                        }
                        .accessibilityLabel("Manage Box")
                        .accessibilityIdentifier("manage-box")
                    }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: LoadingBlock(label: "Loading Box")
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let box): loaded(box)
        }
    }

    private func loaded(_ box: Box) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.space3) {
                NavigationLink {
                    MembersView(env: env, box: box)
                } label: {
                    Label(Formatting.countLabel(box.memberCount, singular: "member", plural: "members"),
                          systemImage: "person.2")
                        .font(Typography.label).foregroundStyle(Theme.goldText)
                        .frame(minHeight: Theme.touchTarget, alignment: .leading)
                }
                .accessibilityIdentifier("members-link")
                NavigationLink(value: MemoriesRoute(scope: .box(id: box.id))) {
                    Label("Memories", systemImage: "clock.arrow.circlepath")
                        .font(Typography.label).foregroundStyle(Theme.goldText)
                        .frame(minHeight: Theme.touchTarget, alignment: .leading)
                }
                .accessibilityIdentifier("box-memories-link")
                if model.canPost {
                    PostComposer(model: model)
                } else {
                    Text("This Box is archived. You can read it, but not post.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted).paldoraCard()
                }
                posts
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(Theme.space4)
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
                EmptyBlock(title: "No posts yet", message: "Be the first to post in this Box.")
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
        VStack(alignment: .leading, spacing: Theme.space2) {
            AdaptiveStack {
                AvatarView(mediaId: avatar, name: author)
                VStack(alignment: .leading, spacing: 2) {
                    Text(author).font(Typography.headline).foregroundStyle(Theme.text)
                    Text(Formatting.relativeTime(post.createdAt) + (post.kind == .lifeUpdate ? " · Life update" : ""))
                        .font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
            }
            Text(post.text).font(Typography.body).foregroundStyle(Theme.text)
                .multilineTextAlignment(.leading).lineLimit(6)
            PhotoStrip(assetIds: post.mediaAssetIds, interactive: false)
        }
        .paldoraCard()
        .accessibilityElement(children: .combine)
    }
}

struct PostComposer: View {
    @Bindable var model: BoxDetailViewModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            FieldContainer(title: "Post to this Box") {
                TextField("What's on your mind?", text: $model.draft, prompt: Text("What's on your mind?").foregroundStyle(Theme.textMuted), axis: .vertical)
                    .lineLimit(2...8)
                    .padding(.vertical, Theme.space2)
                    .focused($focused)
                    .accessibilityIdentifier("post-field")
            }
            PhotoAttachmentsView(attachments: model.attachments)
            HStack {
                Text("\(model.draft.count) of \(BoxDetailViewModel.textLimit)").font(Typography.caption)
                    .foregroundStyle(model.draft.count > BoxDetailViewModel.textLimit ? Theme.danger : Theme.textMuted)
                Spacer()
            }
            if let error = model.composeError { InlineMessage(text: error) }
            Button {
                focused = false
                Task { await model.publish() }
            } label: {
                if model.isPosting { ProgressView() } else { Text("Post") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!model.canSubmit)
            .accessibilityIdentifier("publish-post")
        }
    }
}
