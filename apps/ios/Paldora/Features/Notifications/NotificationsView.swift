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
            content
                .background(Theme.canvas)
                .navigationTitle("Notifications")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Mark all read") { Task { await model.markAllRead() } }
                            .disabled(env.badge.count == 0)
                            .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                            .accessibilityIdentifier("mark-all-read")
                    }
                }
                .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
        }
        .task { await model.list.loadFirst() }
    }

    @ViewBuilder private var content: some View {
        switch model.list.phase {
        case .idle, .loading:
            LoadingBlock(label: "Loading notifications")
        case .failed(let message):
            ErrorBlock(message: message) { await model.refresh() }
        case .unavailable:
            UnavailableBlock()
        case .loaded:
            if model.list.items.isEmpty {
                EmptyBlock(title: "Nothing new", message: "Comments and reactions on your posts show up here.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        List {
            if let error = model.actionError {
                InlineMessage(text: error).listRowBackground(Theme.canvas)
            }
            ForEach(model.list.items) { item in
                Button {
                    Task { path.append(await model.open(item)) }
                } label: { row(item) }
                    .listRowBackground(Theme.canvas)
            }
            LoadMoreFooter(
                isLoading: model.list.isLoadingMore, error: model.list.inlineError,
                hasMore: model.list.hasMore, loadMore: { await model.list.loadMore() }
            ).listRowBackground(Theme.canvas)
        }
        .listStyle(.plain)
        .refreshable { await model.refresh() }
    }

    private func row(_ item: PaldoraNotification) -> some View {
        HStack(alignment: .top, spacing: Theme.space3) {
            Circle().fill(item.read ? Color.clear : Theme.gold).frame(width: 8, height: 8)
                .padding(.top, Theme.space2).accessibilityHidden(true)
            AvatarView(mediaId: item.actor.avatarMediaId, name: item.actor.displayName, size: 36)
            VStack(alignment: .leading, spacing: Theme.space1) {
                Text(NotificationsViewModel.summary(item)).font(Typography.body)
                    .foregroundStyle(Theme.text).multilineTextAlignment(.leading)
                Text("\(item.boxName) · \(Formatting.relativeTime(item.createdAt))")
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
        }
        .frame(minHeight: Theme.touchTarget)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.read ? "" : "Unread. ")\(NotificationsViewModel.summary(item)), \(item.boxName), \(Formatting.relativeTime(item.createdAt))")
        .accessibilityAddTraits(.isButton)
    }
}
