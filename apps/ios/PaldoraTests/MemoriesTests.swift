import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct MemoriesTests {
    private static func post(_ id: String) -> [String: Any] {
        var item = JSON.memoryPost(id); item["kind"] = "post"; return item
    }

    @Test func paginatesWithOpaqueCursorsAndKeepsFilters() async {
        let bodies = Ref<[[String: Any]]>([])
        let firstPage = JSON.page([Self.post("a"), Self.post("b")], next: "CUR==")
        let secondPage = JSON.page([Self.post("c")])
        let h = await FeatureHarness { name, data in
            switch name {
            case .listMyMemories:
                let body = JSON.body(data); bodies.append(body)
                return (body["cursor"] as? String) == nil ? firstPage : secondPage
            case .getMyMemorySummary: return JSON.summary()
            default: return JSON.page([])
            }
        }
        let model = MemoriesViewModel(env: h.env, scope: .me)
        await model.load()
        await model.select(year: 2025)
        await model.list.loadMore()
        #expect(model.list.items.count == 3)
        let last = bodies.value.last
        #expect(last?["cursor"] as? String == "CUR==" && last?["year"] as? Int == 2025)
    }

    @Test func typeFilterReloadsAndAllMeansNoTypeParameter() async {
        let bodies = Ref<[[String: Any]]>([])
        let h = await FeatureHarness { name, data in
            if name == .listMyMemories { bodies.append(JSON.body(data)) }
            return name == .getMyMemorySummary ? JSON.summary() : JSON.page([])
        }
        let model = MemoriesViewModel(env: h.env, scope: .me)
        await model.load()
        await model.select(type: .lifeUpdates)
        await model.select(type: .all)
        #expect(bodies.value.map { $0["type"] as? String } == [nil, "life_updates", nil])
    }

    @Test func yearAndMonthNavigationUsesSummaries() async {
        let years = Ref<[Int?]>([])
        let h = await FeatureHarness { name, data in
            switch name {
            case .getMyMemorySummary:
                let year = JSON.body(data)["year"] as? Int
                years.append(year)
                return year == nil ? JSON.summary() : JSON.summary(year: year, months: [3, 1])
            default: return JSON.page([])
            }
        }
        let model = MemoriesViewModel(env: h.env, scope: .me)
        await model.load()
        await model.select(month: 3)  // needs a year first
        #expect(model.selectedMonth == nil)
        await model.select(year: 2025)
        await model.select(month: 3)
        #expect(model.selectedMonth == 3 && model.summary?.months.map(\.month) == [3, 1])
        #expect(years.value == [nil, 2025])
        await model.select(year: nil)
        #expect(model.selectedYear == nil && model.selectedMonth == nil)
    }

    @Test func boxAndRoomScopesUseTheirOwnCallables() async {
        let seen = Ref<[CallableName]>([])
        let h = await FeatureHarness { name, _ in
            seen.append(name)
            return [.getBoxMemorySummary, .getRoomMemorySummary].contains(name) ? JSON.summary() : JSON.page([])
        }
        await MemoriesViewModel(env: h.env, scope: .box(id: "b1")).load()
        await MemoriesViewModel(env: h.env, scope: .room(username: "mira")).load()
        #expect(seen.value.contains(.listBoxMemories), "\(seen.value)")
        #expect(seen.value.contains(.listRoomMemories), "\(seen.value)")
        #expect(seen.value.contains(.getBoxMemorySummary) && seen.value.contains(.getRoomMemorySummary))
    }

    @Test func inaccessibleRoomMemoriesAreNeutralAndSummaryFailureIsNonFatal() async {
        let h = await FeatureHarness { _, _ in throw failure("not-found") }
        let model = MemoriesViewModel(env: h.env, scope: .room(username: "ghost"))
        await model.load()
        #expect(model.list.phase == .unavailable)
        let rate = await FeatureHarness { name, _ in
            if name == .getMyMemorySummary { throw failure("resource-exhausted", "RATE_LIMITED") }
            return JSON.page([])
        }
        let limited = MemoriesViewModel(env: rate.env, scope: .me)
        await limited.load()
        #expect(limited.list.phase == .loaded && limited.summaryError == UserMessages.rateLimited)
    }

    @Test func memoryItemsAreTolerantAndLinkToTheirSources() throws {
        let items = try JSONDecoder().decode(Page<MemoryItem>.self, from: JSON.page([Self.post("a"), ["kind": "hologram"]]))
        #expect(items.items.count == 2)
        #expect(items.items[0].id == "post:a" && items.items[1].id == "unsupported:hologram")
    }
}
