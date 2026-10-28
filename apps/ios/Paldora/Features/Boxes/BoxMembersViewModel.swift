import Foundation
import Observation
import PaldoraKit

/// The member list with role-aware actions.
@MainActor
@Observable
final class BoxMembersViewModel {
    let members: PagedList<BoxMember>
    let viewerRole: BoxRole
    private(set) var notice: String?
    private(set) var error: String?
    private let env: FeatureEnvironment
    private let boxId: String

    init(env: FeatureEnvironment, boxId: String, viewerRole: BoxRole) {
        self.env = env
        self.boxId = boxId
        self.viewerRole = viewerRole
        let api = env.api
        members = PagedList(env: env) { cursor in
            let page = try await api.listBoxMembers(ListBoxMembersRequest(boxId: boxId, cursor: cursor))
            return (page.items, page.nextCursor)
        }
    }

    func canChangeRole(_ member: BoxMember) -> Bool {
        BoxRules.mayChangeRole(actor: viewerRole, target: member.role, next: BoxRules.nextRole(for: member.role))
    }
    func canRemove(_ member: BoxMember) -> Bool { BoxRules.mayRemove(actor: viewerRole, target: member.role) }
    func canTransfer(_ member: BoxMember) -> Bool { BoxRules.mayTransfer(actor: viewerRole, target: member.role) }
    func hasActions(_ member: BoxMember) -> Bool { canChangeRole(member) || canRemove(member) || canTransfer(member) }

    func changeRole(_ member: BoxMember) async {
        let next = BoxRules.nextRole(for: member.role)
        await act(next == .admin ? "Made an admin." : "Made a member.") {
            _ = try await $0.setBoxMemberRole(SetBoxMemberRoleRequest(boxId: self.boxId, memberUid: member.uid, role: next))
        }
    }

    func remove(_ member: BoxMember) async {
        await act("Member removed.") { _ = try await $0.removeBoxMember(BoxMemberReference(boxId: self.boxId, memberUid: member.uid)) }
    }

    func transfer(_ member: BoxMember) async {
        await act("Ownership transferred. You're now an admin.") {
            _ = try await $0.transferBoxOwnership(BoxMemberReference(boxId: self.boxId, memberUid: member.uid))
        }
    }

    private func act(_ success: String, _ call: (PaldoraAPI) async throws -> Void) async {
        notice = nil
        error = nil
        do {
            try await call(env.api)
            notice = success
            env.contentChanged()
        } catch {
            self.error = BoxManagementViewModel.neutral
            if let failure = error as? PaldoraFailure, failure.error == .unauthenticated || failure.reason == .rateLimited {
                self.error = env.message(for: error)
            }
        }
        await members.refresh()
    }
}
