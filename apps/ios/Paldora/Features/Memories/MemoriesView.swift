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
        List {
            Section { filters }.listRowBackground(Theme.canvas)
            switch model.list.phase {
            case .idle, .loading: LoadingBlock(label: "Loading memories").listRowBackground(Theme.canvas)
            case .failed(let message): ErrorBlock(message: message) { await model.refresh() }.listRowBackground(Theme.canvas)
            case .unavailable: UnavailableBlock().listRowBackground(Theme.canvas)
            case .loaded: items
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("Memories")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .task { await model.load() }
    }

    @ViewBuilder private var items: some View {
        if model.list.items.isEmpty {
            EmptyBlock(title: "No memories here", message: emptyMessage).listRowBackground(Theme.canvas)
        }
        ForEach(model.list.items) { item in
            MemoryLink(item: item) { MemoryRow(item: item) }
                .listRowBackground(Theme.surface)
                .accessibilityIdentifier("memory-item")
        }
        LoadMoreFooter(isLoading: model.list.isLoadingMore, error: model.list.inlineError,
                       hasMore: model.list.hasMore, loadMore: { await model.list.loadMore() })
            .listRowBackground(Theme.canvas)
    }

    private var emptyMessage: String {
        model.selectedYear == nil && model.type == .all
            ? "Memories appear as posts and Life Updates you can still see build up over time."
            : "Nothing matches these filters."
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            Picker("Type", selection: Binding(get: { model.type }, set: { value in Task { await model.select(type: value) } })) {
                Text("All").tag(MemoryType.all)
                Text("Posts").tag(MemoryType.posts)
                Text("Life Updates").tag(MemoryType.lifeUpdates)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("memory-type")
            if let error = model.summaryError { InlineMessage(text: error) }
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
            Text(title).font(Typography.caption).foregroundStyle(Theme.textMuted)
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
        Button(action: action) {
            Text(count.map { "\(label) (\($0))" } ?? label).font(Typography.label)
                .foregroundStyle(isSelected ? Theme.onInk : Theme.text)
                .padding(.horizontal, Theme.space3).frame(minHeight: Theme.touchTarget)
                .background(isSelected ? Theme.ink : Theme.surface, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct MemoryRow: View {
    let item: MemoryItem

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space1) {
            if let when = item.occurredAt { Text(Self.date(when)).font(Typography.caption).foregroundStyle(Theme.textMuted) }
            switch item {
            case .post(let value):
                Text(value.post.authorName).font(Typography.headline).foregroundStyle(Theme.text)
                Text(value.post.text).font(Typography.body).foregroundStyle(Theme.text).lineLimit(4)
                PhotoStrip(assetIds: value.post.mediaAssetIds, interactive: false)
            case .lifeUpdate(let value):
                Text("\(value.authorName) · Life Update").font(Typography.headline).foregroundStyle(Theme.text)
                Text(value.sections.first.map { "\(Formatting.sectionTitle($0.key)): \($0.content)" } ?? "Photos")
                    .font(Typography.body).foregroundStyle(Theme.text).lineLimit(4)
                PhotoStrip(assetIds: value.mediaAssetIds, interactive: false)
            case .unsupported:
                Text("This kind of memory isn't supported in this version of Paldora.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, minHeight: Theme.touchTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    static func date(_ time: EpochMillis) -> String {
        // Memories are UTC year and month; show the same calendar date the server bucketed.
        var style = Date.FormatStyle(date: .long, time: .omitted)
        style.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return time.date.formatted(style)
    }
}
