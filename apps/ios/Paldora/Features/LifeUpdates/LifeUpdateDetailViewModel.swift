import Foundation
import Observation
import PaldoraKit

struct LifeUpdateRoute: Hashable {
    let id: String
    /// The delivery post to show first (from a feed card), if any.
    var postId: String?
}

@MainActor
@Observable
final class LifeUpdateDetailViewModel {
    enum Phase: Equatable {
        case loading
        case loaded(LifeUpdate)
        case unavailable
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var deleteError: String?
    var selectedPostId: String?
    let route: LifeUpdateRoute
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, route: LifeUpdateRoute) {
        self.env = env
        self.route = route
        selectedPostId = route.postId
    }

    var update: LifeUpdate? {
        if case .loaded(let update) = phase { update } else { nil }
    }

    /// Delivery contexts ordered alphabetically by Box name.
    var contexts: [LifeUpdateContext] {
        (update?.contexts ?? []).sorted {
            let order = $0.boxName.localizedCaseInsensitiveCompare($1.boxName)
            return order == .orderedSame ? $0.postId < $1.postId : order == .orderedAscending
        }
    }

    var selectedContext: LifeUpdateContext? {
        contexts.first { $0.postId == selectedPostId } ?? contexts.first
    }

    var isOnlyMe: Bool { update?.audience == .onlyMe }

    func load() async {
        do {
            let update = try await env.api.getLifeUpdate(id: route.id)
            phase = .loaded(update)
            if selectedContext == nil { selectedPostId = nil }
        } catch {
            phase = FeatureEnvironment.isAbsent(error) ? .unavailable : .failed(env.message(for: error))
        }
    }

    func delete() async -> Bool {
        deleteError = nil
        do {
            _ = try await env.api.deleteLifeUpdate(id: route.id)
            env.contentChanged()
            return true
        } catch {
            deleteError = env.message(for: error)
            return false
        }
    }
}
