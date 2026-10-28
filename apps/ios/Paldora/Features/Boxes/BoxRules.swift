import PaldoraKit

/// Role rules, mirroring `packages/domain/src/boxes.ts`. Buttons only reflect
/// these rules; the server re-checks every action.
enum BoxRules {
    static func canManageMembers(_ actor: BoxRole) -> Bool { actor == .owner || actor == .admin }

    /// `next` is the role being assigned (admin or member).
    static func mayChangeRole(actor: BoxRole, target: BoxRole, next: AssignableBoxRole) -> Bool {
        if target == .owner || actor == .member { return false }
        if actor == .owner { return target.rawValue != next.rawValue }
        return target == .member && next == .admin
    }

    static func nextRole(for target: BoxRole) -> AssignableBoxRole { target == .member ? .admin : .member }

    static func mayRemove(actor: BoxRole, target: BoxRole) -> Bool { target != .owner && canManageMembers(actor) }
    static func mayTransfer(actor: BoxRole, target: BoxRole) -> Bool { actor == .owner && target != .owner }
    static func canInvite(actor: BoxRole, status: BoxStatus) -> Bool { canManageMembers(actor) && status == .active }
    static func canRenameOrArchive(_ actor: BoxRole) -> Bool { actor == .owner }
    static func canDelete(_ actor: BoxRole) -> Bool { actor == .owner }
    /// Everyone can leave except the owner, who must transfer ownership first.
    static func canLeave(_ actor: BoxRole) -> Bool { actor != .owner }
}
