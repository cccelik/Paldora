import Foundation
import Observation
import PaldoraKit

enum MemoryScope: Hashable {
    case me
    case box(id: String)
    case room(username: String)
}

struct MemoriesRoute: Hashable {
    let scope: MemoryScope
}

/// Derived chronological memories: re-authorized on every read, never copied.
@MainActor
@Observable
final class MemoriesViewModel {
    /// The filters the list loader reads. A cursor is only valid with the filters it came from.
    final class Filters: @unchecked Sendable {
        var year: Int?
        var month: Int?
        var type: MemoryType = .all
    }

    let scope: MemoryScope
    let list: PagedList<MemoryItem>
    private(set) var summary: MemorySummary?
    private(set) var summaryError: String?
    private(set) var selectedYear: Int?
    private(set) var selectedMonth: Int?
    private(set) var type: MemoryType = .all
    private let filters = Filters()
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, scope: MemoryScope) {
        self.env = env
        self.scope = scope
        let api = env.api
        let filters = filters
        list = PagedList(env: env) { cursor in
            let page = try await Self.fetch(api, scope, filters, cursor)
            return (page.items, page.nextCursor)
        }
    }

    func load() async {
        async let items: Void = list.loadFirst()
        async let sums: Void = loadSummary()
        _ = await (items, sums)
    }

    func refresh() async {
        async let items: Void = list.refresh()
        async let sums: Void = loadSummary()
        _ = await (items, sums)
    }

    func select(year: Int?) async {
        selectedYear = year
        selectedMonth = nil
        filters.year = year
        filters.month = nil
        async let items: Void = list.refresh()
        async let sums: Void = loadSummary()
        _ = await (items, sums)
    }

    func select(month: Int?) async {
        guard selectedYear != nil else { return }
        selectedMonth = month
        filters.month = month
        await list.refresh()
    }

    func select(type: MemoryType) async {
        self.type = type
        filters.type = type
        await list.refresh()
    }

    func loadSummary() async {
        summaryError = nil
        do {
            summary = try await Self.summarize(env.api, scope, selectedYear)
        } catch {
            if !FeatureEnvironment.isAbsent(error) { summaryError = env.message(for: error) }
        }
    }

    private static func fetch(_ api: PaldoraAPI, _ scope: MemoryScope, _ f: Filters, _ cursor: String?) async throws -> Page<MemoryItem> {
        let (year, month, type) = (f.year, f.month, f.type == .all ? nil : f.type)
        switch scope {
        case .me:
            return try await api.listMyMemories(ListMyMemoriesRequest(year: year, month: month, type: type, cursor: cursor))
        case .box(let id):
            return try await api.listBoxMemories(ListBoxMemoriesRequest(boxId: id, year: year, month: month, type: type, cursor: cursor))
        case .room(let username):
            return try await api.listRoomMemories(ListRoomMemoriesRequest(username: username, year: year, month: month, type: type, cursor: cursor))
        }
    }

    private static func summarize(_ api: PaldoraAPI, _ scope: MemoryScope, _ year: Int?) async throws -> MemorySummary {
        switch scope {
        case .me: try await api.getMyMemorySummary(year: year)
        case .box(let id): try await api.getBoxMemorySummary(boxId: id, year: year)
        case .room(let username): try await api.getRoomMemorySummary(username: username, year: year)
        }
    }

    static func monthName(_ month: Int) -> String {
        let names = Calendar(identifier: .gregorian).monthSymbols
        return names.indices.contains(month - 1) ? names[month - 1] : "Month \(month)"
    }
}
