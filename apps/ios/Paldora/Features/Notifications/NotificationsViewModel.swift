import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class NotificationsViewModel {
    let list: PagedList<PaldoraNotification>
    private(set) var actionError: String?
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment) {
        self.env = env
        let badge = env.badge
        let api = env.api
        list = PagedList(env: env) { cursor in
            let page = try await api.listMyNotifications(cursor: cursor)
            badge.apply(page.unreadCount)
            return (page.items, page.nextCursor)
        }
    }

    func refresh() async {
        await list.refresh()
        await env.badge.refresh()
    }

    /// Marks one notification read (optimistic) and returns where it points.
    func open(_ notification: PaldoraNotification) async -> PostRoute {
        let route = PostRoute(boxId: notification.boxId, postId: notification.postId)
        guard !notification.read else { return route }
        list.update(id: notification.id) { $0.markedRead() }
        env.badge.decrement()
        do {
            _ = try await env.api.markNotificationRead(id: notification.id)
        } catch {
            list.update(id: notification.id) { $0.markedUnread() }
            await env.badge.refresh()
            actionError = env.message(for: error)
        }
        return route
    }

    func markAllRead() async {
        actionError = nil
        do {
            _ = try await env.api.markAllNotificationsRead()
            env.badge.clear()
            await list.refresh()
        } catch {
            actionError = env.message(for: error)
        }
    }

    static func summary(_ notification: PaldoraNotification) -> String {
        let actor = notification.actor.displayName
        switch notification.type {
        case .postComment: return "\(actor) commented on a post"
        case .commentReply: return "\(actor) replied to a comment"
        case .postReaction:
            return notification.reaction.map { "\(actor) reacted \($0.kind) to a post" } ?? "\(actor) reacted to a post"
        case .commentReaction:
            return notification.reaction.map { "\(actor) reacted \($0.kind) to a comment" } ?? "\(actor) reacted to a comment"
        case .unknown: return "New activity from \(actor)"
        }
    }
}

extension PaldoraNotification {
    /// PaldoraKit's DTOs are immutable with no public initializer, so a
    /// read-state change goes through the Codable representation.
    func markedRead() -> PaldoraNotification { withRead(true) }
    func markedUnread() -> PaldoraNotification { withRead(false) }

    private func withRead(_ read: Bool) -> PaldoraNotification {
        guard let data = try? JSONEncoder().encode(self),
              var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return self }
        object["read"] = read
        guard let updated = try? JSONSerialization.data(withJSONObject: object),
              let copy = try? JSONDecoder().decode(PaldoraNotification.self, from: updated) else { return self }
        return copy
    }
}
