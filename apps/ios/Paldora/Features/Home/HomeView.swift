import PaldoraKit
import SwiftUI

struct HomeView: View {
    let env: FeatureEnvironment
    let isActive: Bool
    @State private var seenVersion = 0
    @State private var feed: PagedList<FeedItem>
    @State private var path = NavigationPath()

    init(env: FeatureEnvironment, isActive: Bool) {
        self.env = env
        self.isActive = isActive
        let api = env.api
        _feed = State(initialValue: PagedList(env: env) { cursor in
            let page = try await api.getHomeFeed(cursor: cursor)
            for case .post(let post) in page.items { env.remember(realPreviews: post.interactions.realPreview, postId: post.id) }
            return (page.items, page.nextCursor)
        })
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                content
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .paldoraCanvas()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: PostRoute.self) { route in
                PostDetailView(env: env, route: route) { Task { await feed.refresh() } }
            }
            .navigationDestination(for: LifeUpdateRoute.self) { LifeUpdateDetailView(env: env, route: $0) }
            .roomRoutes(env: env)
            .navigationDestination(for: LifeUpdateComposeRoute.self) { _ in LifeUpdateComposerView(env: env) }
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

    /// Top-level screens have no nav bar: a Display title and one primary action.
    private var header: some View {
        HStack(alignment: .top) {
            PaldoraScreenTitle(title: "Home")
            PaldoraIconButton(icon: .compose, label: "New Life Update", style: .primary) { path.append(LifeUpdateComposeRoute()) }
                .accessibilityIdentifier("home-new-life-update")
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(.horizontal, Theme.gutter)
        .padding(.bottom, Theme.space3)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var content: some View {
        switch feed.phase {
        case .idle, .loading: ScrollView { LoadingBlock(label: "Loading your feed").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await feed.refresh() }
        case .unavailable: UnavailableBlock()
        case .loaded:
            if feed.items.isEmpty {
                EmptyBlock(title: "Nothing here yet",
                           message: "Posts from your Boxes appear here, newest first.", icon: .home)
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: Theme.space4) {
                if let error = feed.inlineError, !feed.isLoadingMore { PaldoraBanner(tone: .danger, title: error) }
                ForEach(feed.items) { item in
                    row(item)
                }
                LoadMoreFooter(isLoading: feed.isLoadingMore, error: feed.inlineError,
                               hasMore: feed.hasMore, loadMore: { await feed.loadMore() })
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await feed.refresh(); await env.badge.refresh() }
        .accessibilityIdentifier("home-feed")
    }

    @ViewBuilder private func row(_ item: FeedItem) -> some View {
        let name = boxId(of: item).flatMap { env.boxes.name(for: $0) }
        if let route = route(of: item) {
            Button { open(item, route) } label: { FeedItemCard(item: item, boxName: name) }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("feed-item")
        } else {
            FeedItemCard(item: item, boxName: name)
        }
    }

    /// A Life Update card opens the structured Life Update, starting on its delivery context.
    private func open(_ item: FeedItem, _ route: PostRoute) {
        if case .lifeUpdate(let update) = item {
            path.append(LifeUpdateRoute(id: update.id, postId: update.postId))
        } else {
            path.append(route)
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
