import Foundation
import Observation
import PaldoraKit

struct RoomRoute: Hashable {
    /// Nil means "my Room".
    var username: String?
}

struct RoomEditRoute: Hashable {}

@MainActor
@Observable
final class RoomViewModel {
    enum Phase: Equatable {
        case loading
        case loaded(Room)
        /// Missing, hidden, blocked and inaccessible Rooms are one state.
        case unavailable
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var photos: PagedList<RoomPhoto>?
    private(set) var lifeUpdates: [MemoryItem] = []
    private(set) var posts: [MemoryItem] = []
    let route: RoomRoute
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, route: RoomRoute) {
        self.env = env
        self.route = route
    }

    var room: Room? {
        if case .loaded(let room) = phase { room } else { nil }
    }

    var isOwner: Bool { room?.relationship == "owner" }
    var username: String? { room?.owner.username ?? route.username }

    /// Enabled widgets in stored order.
    var widgets: [RoomWidget] {
        (room?.widgets ?? []).filter(\.enabled).sorted { $0.position < $1.position }
    }

    func has(_ type: String) -> Bool { widgets.contains { $0.type == type } }

    func load() async {
        do {
            let room: Room
            if let username = route.username { room = try await env.api.getRoom(username: username) }
            else { room = try await env.api.getMyRoom() }
            phase = .loaded(room)
        } catch {
            phase = FeatureEnvironment.isAbsent(error) ? .unavailable : .failed(env.message(for: error))
            return
        }
        guard let name = username else { return }
        await loadContent(username: name)
    }

    private func loadContent(username: String) async {
        let api = env.api
        let list = PagedList<RoomPhoto>(env: env) { _ in
            let page = try await api.listRoomPhotos(username: username)
            return (page.items, page.nextCursor)
        }
        photos = list
        async let photoLoad: Void = has("photos") ? list.refresh() : ()
        async let updates = has("life_updates") ? snippets(username, .lifeUpdates) : []
        async let recent = has("posts") ? snippets(username, .posts) : []
        lifeUpdates = await updates
        posts = await recent
        await photoLoad
    }

    /// A few recent items for the Room's content widgets. Failures leave the widget empty.
    private func snippets(_ username: String, _ type: MemoryType) async -> [MemoryItem] {
        let page = try? await env.api.listRoomMemories(ListRoomMemoriesRequest(username: username, type: type, limit: 3))
        return page?.items ?? []
    }
}
