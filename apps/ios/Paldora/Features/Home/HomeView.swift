import PaldoraKit
import SwiftUI

struct HomeView: View {
    let env: FeatureEnvironment
    let isActive: Bool
    @State private var seenVersion = 0
    @State private var feed: PagedList<FeedItem>
    @State private var path: [PostRoute] = []

    init(env: FeatureEnvironment, isActive: Bool) {
        self.env = env
        self.isActive = isActive
        let api = env.api
        _feed = State(initialValue: PagedList(env: env) { cursor in
            let page = try await api.getHomeFeed(cursor: cursor)
            return (page.items, page.nextCursor)
        })
    }

    var body: some View {
        NavigationStack(path: $path) {
            content
                .background(Theme.canvas)
                .navigationTitle("Home")
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: PostRoute.self) { route in
                    PostDetailView(env: env, route: route) { Task { await feed.refresh() } }
                }
        }
        .task {
            await env.boxes.loadIfNeeded()
            await feed.loadFirst()
            seenVersion = env.contentVersion
        }
        .onChange(of: isActive) {
            // Reload when the user changed content elsewhere (new post, new Box).
            guard isActive, seenVersion != env.contentVersion else { return }
            seenVersion = env.contentVersion
            Task { await env.boxes.reload(); await feed.refresh() }
        }
    }

    @ViewBuilder private var content: some View {
        switch feed.phase {
        case .idle, .loading: LoadingBlock(label: "Loading your feed")
        case .failed(let message): ErrorBlock(message: message) { await feed.refresh() }
        case .unavailable: UnavailableBlock()
        case .loaded:
            if feed.items.isEmpty {
                EmptyBlock(title: "Nothing here yet",
                           message: "Posts from your Boxes appear here, newest first.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: Theme.space3) {
                if let error = feed.inlineError, !feed.isLoadingMore { InlineMessage(text: error) }
                ForEach(feed.items) { item in
                    row(item)
                }
                LoadMoreFooter(isLoading: feed.isLoadingMore, error: feed.inlineError,
                               hasMore: feed.hasMore, loadMore: { await feed.loadMore() })
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await feed.refresh(); await env.badge.refresh() }
        .accessibilityIdentifier("home-feed")
    }

    @ViewBuilder private func row(_ item: FeedItem) -> some View {
        let name = boxId(of: item).flatMap { env.boxes.name(for: $0) }
        if let route = route(of: item) {
            Button { path.append(route) } label: { FeedItemCard(item: item, boxName: name) }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("feed-item")
        } else {
            FeedItemCard(item: item, boxName: name)
        }
    }

    private func boxId(of item: FeedItem) -> String? {
        switch item {
        case .post(let post): post.boxId
        case .lifeUpdate(let update): update.boxId
        case .unsupported: nil
        }
    }

    private func route(of item: FeedItem) -> PostRoute? {
        switch item {
        case .post(let post): PostRoute(boxId: post.boxId, postId: post.id)
        case .lifeUpdate(let update): PostRoute(boxId: update.boxId, postId: update.postId)
        case .unsupported: nil
        }
    }
}
