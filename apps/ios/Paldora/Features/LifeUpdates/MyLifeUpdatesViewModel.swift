import Foundation
import PaldoraKit

@MainActor
func makeMyLifeUpdates(env: FeatureEnvironment) -> PagedList<LifeUpdate> {
    let api = env.api
    return PagedList(env: env) { cursor in
        let page = try await api.listMyLifeUpdates(cursor: cursor)
        return (page.items, page.nextCursor)
    }
}
