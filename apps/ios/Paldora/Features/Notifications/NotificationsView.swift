import PaldoraKit
import SwiftUI

struct NotificationsView: View {
    let env: FeatureEnvironment
    @State private var model: NotificationsViewModel
    @State private var path: [PostRoute] = []

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: NotificationsViewModel(env: env))
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
            .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
            .roomRoutes(env: env)
        }
        .task { await model.list.loadFirst() }
    }

    private var header: some View {
        HStack(alignment: .top) {
            PaldoraScreenTitle(eyebrow: env.badge.count > 0 ? "\(env.badge.count) new" : nil, title: "Activity")
            if !model.list.items.isEmpty {
                PaldoraButton("Mark all read", kind: .ghost, size: .small) { Task { await model.markAllRead() } }
                    .accessibilityIdentifier("mark-all-read")
            }
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(.horizontal, Theme.gutter)
        .padding(.bottom, Theme.space3)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var content: some View {
        switch model.list.phase {
        case .idle, .loading:
            ScrollView { PaldoraRowSkeleton(count: 5).padding(Theme.gutter) }
        case .failed(let message):
            ErrorBlock(message: message) { await model.refresh() }
        case .unavailable:
            UnavailableBlock()
        case .loaded:
            if model.list.items.isEmpty {
                EmptyBlock(title: "Nothing new", message: "Comments and reactions on your posts show up here.", icon: .bell)
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.space2) {
                if let error = model.actionError { PaldoraBanner(tone: .danger, title: error) }
                ForEach(groups, id: \.title) { group in
                    PaldoraEyebrow(group.title).padding(.top, Theme.space3)
                    ForEach(group.items) { item in
                        PaldoraNotificationRow(content: content(item)) {
                            Task { path.append(await model.open(item)) }
                        }
                    }
                }
                LoadMoreFooter(
                    isLoading: model.list.isLoadingMore, error: model.list.inlineError,
                    hasMore: model.list.hasMore, loadMore: { await model.list.loadMore() })
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.refresh() }
    }

    /// Today first, then everything older (Figma 5.6 groups by recency).
    private var groups: [(title: String, items: [PaldoraNotification])] {
        let today = model.list.items.filter { Calendar.current.isDateInToday($0.createdAt.date) }
        let earlier = model.list.items.filter { !Calendar.current.isDateInToday($0.createdAt.date) }
        return [("Today", today), ("Earlier", earlier)].filter { !$0.1.isEmpty }
    }

    private func content(_ item: PaldoraNotification) -> PaldoraNotificationRowContent {
        let summary = NotificationsViewModel.summary(item)
        let name = item.actor.displayName
        let message = summary.hasPrefix(name) ? String(summary.dropFirst(name.count)).trimmingCharacters(in: .whitespaces) : summary
        return PaldoraNotificationRowContent(
            actorName: name, actorMediaId: item.actor.avatarMediaId, message: "\(message) · \(item.boxName)",
            timeLabel: Formatting.relativeTime(item.createdAt), isUnread: !item.read)
    }
}
