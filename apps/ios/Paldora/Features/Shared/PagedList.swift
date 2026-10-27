import Foundation
import Observation

enum ListPhase: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
    /// Not found or not allowed: one neutral state.
    case unavailable
}

/// Cursor-paginated list with refresh, load-more and honest failure states.
/// Cursors are opaque and sent back exactly as received.
@MainActor
@Observable
final class PagedList<Item: Identifiable & Sendable> where Item.ID: Sendable {
    typealias Loader = @MainActor (String?) async throws -> (items: [Item], next: String?)

    private(set) var items: [Item] = []
    private(set) var nextCursor: String?
    private(set) var phase: ListPhase = .idle
    private(set) var isLoadingMore = false
    /// A failed refresh or load-more while items are already on screen.
    private(set) var inlineError: String?

    private let env: FeatureEnvironment
    private let loader: Loader
    private var generation = 0

    init(env: FeatureEnvironment, loader: @escaping Loader) {
        self.env = env
        self.loader = loader
    }

    var hasMore: Bool { nextCursor != nil }
    var isRefreshing: Bool { phase == .loading }

    func loadFirst() async {
        if phase == .idle || phase == .unavailable || isFailed { await refresh() }
    }

    /// Reloads from the start. Keeps the current items if the reload fails.
    func refresh() async {
        generation += 1
        let mine = generation
        if items.isEmpty { phase = .loading }
        inlineError = nil
        do {
            let page = try await loader(nil)
            guard mine == generation else { return }
            items = page.items
            nextCursor = page.next
            phase = .loaded
        } catch {
            guard mine == generation else { return }
            fail(error)
        }
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, phase == .loaded else { return }
        isLoadingMore = true
        inlineError = nil
        let mine = generation
        defer { isLoadingMore = false }
        do {
            let page = try await loader(cursor)
            guard mine == generation else { return }
            let known = Set(items.map(\.id))
            items.append(contentsOf: page.items.filter { !known.contains($0.id) })
            nextCursor = page.next
        } catch {
            guard mine == generation else { return }
            inlineError = env.message(for: error)
        }
    }

    /// Loads every remaining page (bounded), for short threads.
    func loadAll(maxPages: Int = 10) async {
        for _ in 0..<maxPages where hasMore && inlineError == nil {
            await loadMore()
        }
    }

    func remove(id: Item.ID) { items.removeAll { $0.id == id } }

    func update(id: Item.ID, _ transform: (Item) -> Item) {
        if let index = items.firstIndex(where: { $0.id == id }) { items[index] = transform(items[index]) }
    }

    func prepend(_ item: Item) {
        if !items.contains(where: { $0.id == item.id }) { items.insert(item, at: 0) }
    }

    private var isFailed: Bool {
        if case .failed = phase { true } else { false }
    }

    private func fail(_ error: any Error) {
        if FeatureEnvironment.isAbsent(error) {
            items = []
            nextCursor = nil
            phase = .unavailable
            return
        }
        let message = env.message(for: error)
        if items.isEmpty { phase = .failed(message) } else { phase = .loaded; inlineError = message }
    }
}
