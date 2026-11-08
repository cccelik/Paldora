import PaldoraKit
import SwiftUI

struct MemoriesView: View {
    let env: FeatureEnvironment
    let route: MemoriesRoute
    @State private var model: MemoriesViewModel

    init(env: FeatureEnvironment, route: MemoriesRoute) {
        self.env = env
        self.route = route
        _model = State(initialValue: MemoriesViewModel(env: env, scope: route.scope))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.space3) {
                PaldoraScreenTitle(eyebrow: "Gathered quietly from what you shared", title: "Memories")
                filters
                switch model.list.phase {
                case .idle, .loading: LoadingBlock(label: "Loading memories", compact: true)
                case .failed(let message): ErrorBlock(message: message) { await model.refresh() }
                case .unavailable: UnavailableBlock()
                case .loaded: items
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Memories", showsTitle: false)
        .refreshable { await model.refresh() }
        .task { await model.load() }
    }

    @ViewBuilder private var items: some View {
        if model.list.items.isEmpty {
            EmptyBlock(title: "No memories here", message: emptyMessage, icon: .cal)
        }
        ForEach(model.list.items) { item in
            MemoryLink(item: item) { MemoryRow(item: item) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("memory-item")
        }
        LoadMoreFooter(isLoading: model.list.isLoadingMore, error: model.list.inlineError,
                       hasMore: model.list.hasMore, loadMore: { await model.list.loadMore() })
    }

    private var emptyMessage: String {
        model.selectedYear == nil && model.type == .all
            ? "Your first memories will gather here as posts and Life Updates you can still see build up over time."
            : "Nothing matches these filters."
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            PaldoraSegmentedControl([.init(MemoryType.all, "All"), .init(MemoryType.posts, "Posts"),
                                     .init(MemoryType.lifeUpdates, "Life Updates")],
                                    selection: Binding(get: { model.type }, set: { value in Task { await model.select(type: value) } }))
                .accessibilityIdentifier("memory-type")
            if let error = model.summaryError { PaldoraBanner(tone: .danger, title: error) }
            if let summary = model.summary, !summary.years.isEmpty {
                chips(title: "Year", options: summary.years.map { ($0.year, "\($0.year)", $0.count) },
                      selected: model.selectedYear) { year in Task { await model.select(year: year) } }
                if model.selectedYear != nil, !summary.months.isEmpty {
                    chips(title: "Month", options: summary.months.map { ($0.month, MemoriesViewModel.monthName($0.month), $0.count) },
                          selected: model.selectedMonth) { month in Task { await model.select(month: month) } }
                }
            }
        }
    }

    private func chips(title: String, options: [(Int, String, Int)], selected: Int?, pick: @escaping (Int?) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            PaldoraEyebrow(title)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.space2) {
                    chip("All", count: nil, isSelected: selected == nil) { pick(nil) }
                    ForEach(options, id: \.0) { value, label, count in
                        chip(label, count: count, isSelected: selected == value) { pick(value) }
                    }
                }
            }
        }
    }

    private func chip(_ label: String, count: Int?, isSelected: Bool, action: @escaping () -> Void) -> some View {
        PaldoraChip(title: count.map { "\(label) (\($0))" } ?? label, style: .forSelection(isSelected), action: action)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct MemoryRow: View {
    let item: MemoryItem

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let when = item.occurredAt { PaldoraEyebrow(Self.date(when)) }
            switch item {
            case .post(let value):
                Text(value.post.authorName).paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                Text(value.post.text).paldoraText(.titleS).foregroundStyle(Theme.textPrimary).lineLimit(4)
                PhotoStrip(assetIds: value.post.mediaAssetIds, interactive: false)
            case .lifeUpdate(let value):
                Text("\(value.authorName) · Life Update").paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                Text(value.sections.first.map { "\(Formatting.sectionTitle($0.key)): \($0.content)" } ?? "Photos")
                    .paldoraText(.titleS).foregroundStyle(Theme.textPrimary).lineLimit(4)
                PhotoStrip(assetIds: value.mediaAssetIds, interactive: false)
            case .unsupported:
                Text("This kind of memory isn't supported in this version of Paldora.")
                    .paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.space4)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
        .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radiusLg))
        .accessibilityElement(children: .combine)
    }

    static func date(_ time: EpochMillis) -> String {
        // Memories are UTC year and month; show the same calendar date the server bucketed.
        var style = Date.FormatStyle(date: .long, time: .omitted)
        style.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return time.date.formatted(style)
    }
}
