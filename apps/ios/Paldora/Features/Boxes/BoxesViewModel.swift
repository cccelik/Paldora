import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class BoxesViewModel {
    static let nameLimit = 80

    let boxes: PagedList<Box>
    let invitations: PagedList<MyBoxInvitation>
    private(set) var actionError: String?
    private(set) var busyInvitation: String?
    private let env: FeatureEnvironment
    private var draftKey = DraftKey()

    init(env: FeatureEnvironment) {
        self.env = env
        let api = env.api
        let directory = env.boxes
        boxes = PagedList(env: env) { cursor in
            let page = try await api.listMyBoxes(cursor: cursor)
            page.items.forEach(directory.remember)
            return (page.items, page.nextCursor)
        }
        invitations = PagedList(env: env) { cursor in
            let page = try await api.listMyBoxInvitations(cursor: cursor)
            return (page.items, page.nextCursor)
        }
    }

    func load() async {
        async let first: Void = boxes.loadFirst()
        async let second: Void = invitations.loadFirst()
        _ = await (first, second)
    }

    func refresh() async {
        async let first: Void = boxes.refresh()
        async let second: Void = invitations.refresh()
        _ = await (first, second)
        await env.badge.refresh()
    }

    /// Returns an error message, or nil on success.
    func createBox(name: String) async -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let box = try await env.api.createBox(name: trimmed, idempotencyKey: draftKey.key(for: trimmed))
            draftKey.rotate()
            env.boxes.remember(box)
            env.contentChanged()
            await boxes.refresh()
            return nil
        } catch {
            return env.message(for: error)
        }
    }

    func accept(_ invitation: MyBoxInvitation) async {
        await resolve(invitation) { _ = try await $0.acceptBoxInvitation(invitationId: invitation.id) }
        await env.boxes.reload()
        await boxes.refresh()
        env.contentChanged()
    }

    func decline(_ invitation: MyBoxInvitation) async {
        await resolve(invitation) { _ = try await $0.declineBoxInvitation(invitationId: invitation.id) }
    }

    private func resolve(
        _ invitation: MyBoxInvitation,
        _ call: (PaldoraAPI) async throws -> Void
    ) async {
        busyInvitation = invitation.id
        actionError = nil
        defer { busyInvitation = nil }
        do {
            try await call(env.api)
            invitations.remove(id: invitation.id)
        } catch {
            actionError = env.message(for: error)
            await invitations.refresh()
        }
    }
}
