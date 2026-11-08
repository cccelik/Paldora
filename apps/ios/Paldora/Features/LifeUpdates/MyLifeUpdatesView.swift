import PaldoraKit
import SwiftUI

struct MyLifeUpdatesView: View {
    let env: FeatureEnvironment
    @State private var list: PagedList<LifeUpdate>

    init(env: FeatureEnvironment) {
        self.env = env
        _list = State(initialValue: makeMyLifeUpdates(env: env))
    }

    /// The large "Life updates" heading is only drawn above a loaded, non-empty list.
    private var hasChapters: Bool {
        if case .loaded = list.phase { return !list.items.isEmpty }
        return false
    }

    var body: some View {
        Group {
            switch list.phase {
            case .idle, .loading: ScrollView { LoadingBlock(label: "Loading your Life Updates", compact: true).padding(Theme.gutter) }
            case .failed(let message): ErrorBlock(message: message) { await list.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                if list.items.isEmpty {
                    EmptyBlock(title: "Your chapters will live here",
                               message: "Share a catch-up with your Boxes, or keep it to yourself.", icon: .book)
                } else {
                    ScrollView {
                        LazyVStack(spacing: Theme.space3) {
                            PaldoraScreenTitle(eyebrow: "Your chapters", title: "Life updates")
                            ForEach(list.items) { update in
                                NavigationLink(value: LifeUpdateRoute(id: update.id)) { row(update) }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("my-life-update")
                            }
                            LoadMoreFooter(isLoading: list.isLoadingMore, error: list.inlineError,
                                           hasMore: list.hasMore, loadMore: { await list.loadMore() })
                        }
                        .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                        .padding(.horizontal, Theme.gutter)
                        .frame(maxWidth: .infinity)
                    }
                    .refreshable { await list.refresh() }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paldoraCanvas()
        .paldoraNavBar("Life updates", trailing: .none, showsTitle: !hasChapters)
        .overlay(alignment: .topTrailing) {
            NavigationLink(value: LifeUpdateComposeRoute()) {
                PaldoraIconView(.plus, size: 20).foregroundStyle(Theme.actionOnPrimary)
                    .frame(width: 40, height: 40).background(Theme.actionPrimary, in: Circle())
                    .paldoraHitTarget()
            }
            .accessibilityLabel("New Life Update")
            .accessibilityIdentifier("new-life-update")
            .padding(.trailing, Theme.gutter).padding(.top, Theme.space2)
        }
        .task { await list.refresh() }
    }

    private func row(_ update: LifeUpdate) -> some View {
        let first = LifeUpdateSectionKey.canonical.compactMap { update.sections.values[$0] }.first ?? "Photos only"
        return VStack(alignment: .leading, spacing: Theme.space2) {
            Text(Formatting.relativeTime(update.createdAt)).paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            Text(first).paldoraText(.titleS).foregroundStyle(Theme.textPrimary).lineLimit(3)
            PaldoraChip(title: update.audience == .onlyMe ? "Only me" : Formatting.countLabel(update.contexts.count, singular: "Box", plural: "Boxes"),
                        style: .soft, leading: .icon(.lock))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.space4)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
        .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radiusLg))
        .accessibilityElement(children: .combine)
    }
}

struct LifeUpdateComposeRoute: Hashable {}
