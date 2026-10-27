import PaldoraKit
import SwiftUI

struct MyLifeUpdatesView: View {
    let env: FeatureEnvironment
    @State private var list: PagedList<LifeUpdate>

    init(env: FeatureEnvironment) {
        self.env = env
        _list = State(initialValue: makeMyLifeUpdates(env: env))
    }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: LoadingBlock(label: "Loading your Life Updates")
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                if list.items.isEmpty {
                    EmptyBlock(title: "No Life Updates yet", message: "Share a catch-up with your Boxes, or keep it to yourself.")
                } else {
                    List {
                        ForEach(list.items) { update in
                            NavigationLink(value: LifeUpdateRoute(id: update.id)) { row(update) }
                                .listRowBackground(Theme.surface)
                                .accessibilityIdentifier("my-life-update")
                        }
                        LoadMoreFooter(isLoading: list.isLoadingMore, error: list.inlineError,
                                       hasMore: list.hasMore, loadMore: { await list.loadMore() })
                            .listRowBackground(Theme.canvas)
                    }
                    .scrollContentBackground(.hidden)
                    .refreshable { await list.refresh() }
                }
            }
        }
        .background(Theme.canvas)
        .navigationTitle("Life Updates")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: LifeUpdateComposeRoute()) {
                    Image(systemName: "plus").frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                }
                .accessibilityLabel("New Life Update")
                .accessibilityIdentifier("new-life-update")
            }
        }
        .task { await list.refresh() }
    }

    private func row(_ update: LifeUpdate) -> some View {
        let first = LifeUpdateSectionKey.canonical.compactMap { update.sections.values[$0] }.first ?? "Photos only"
        return VStack(alignment: .leading, spacing: 2) {
            Text(first).font(Typography.body).foregroundStyle(Theme.text).lineLimit(3)
            Text(Formatting.relativeTime(update.createdAt) + (update.audience == .onlyMe ? " · Only me" : " · \(update.contexts.count) Boxes"))
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
        .frame(minHeight: Theme.touchTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct LifeUpdateComposeRoute: Hashable {}
