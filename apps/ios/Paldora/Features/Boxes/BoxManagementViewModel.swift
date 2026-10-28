import Foundation
import Observation
import PaldoraKit

/// Owner and admin tools for one Box. Failures are neutral: a disallowed action
/// and a missing Box look the same.
@MainActor
@Observable
final class BoxManagementViewModel {
    private(set) var box: Box
    let invitations: PagedList<BoxInvitation>
    var inviteUsername = ""
    var renameText: String
    var typedName = ""
    var acknowledged = false
    private(set) var notice: String?
    private(set) var error: String?
    private(set) var isWorking = false
    /// True once the Box is deleted or the user left: the screens should close.
    private(set) var isGone = false
    private let env: FeatureEnvironment
    private let pollInterval: Duration
    private let maxPolls: Int

    static let neutral = "We couldn't do that. Check the details and try again."
    static let ownerMustTransfer = "You own this Box. To leave, make another member the owner first."

    init(env: FeatureEnvironment, box: Box, pollInterval: Duration = .seconds(1), maxPolls: Int = 30) {
        self.env = env
        self.box = box
        self.pollInterval = pollInterval
        self.maxPolls = maxPolls
        renameText = box.name
        let api = env.api
        let boxId = box.id
        invitations = PagedList(env: env) { cursor in
            let page = try await api.listBoxInvitations(ListBoxInvitationsRequest(boxId: boxId, cursor: cursor))
            return (page.items, page.nextCursor)
        }
    }

    var role: BoxRole { box.currentUserRole }
    var canInvite: Bool { BoxRules.canInvite(actor: role, status: box.status) }
    var isArchived: Bool { box.status == .archived }

    var canDeleteNow: Bool { BoxRules.canDelete(role) && typedName == box.name && acknowledged && !isWorking }
    var canRename: Bool {
        let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        return BoxRules.canRenameOrArchive(role) && !isWorking && !name.isEmpty && name.count <= 80 && name != box.name
    }

    func load() async {
        if canInvite { await invitations.refresh() }
    }

    // MARK: Rename and archive

    func rename() async {
        guard canRename else { return }
        await run("Box renamed.") {
            let updated = try await self.env.api.updateBox(UpdateBoxRequest(
                boxId: self.box.id, name: self.renameText.trimmingCharacters(in: .whitespacesAndNewlines)))
            self.adopt(updated)
        }
    }

    func setArchived(_ archived: Bool) async {
        guard BoxRules.canRenameOrArchive(role), !isWorking else { return }
        await run(archived ? "Box archived." : "Box restored.") {
            self.adopt(try await self.env.api.updateBox(UpdateBoxRequest(boxId: self.box.id, status: archived ? .archived : .active)))
        }
    }

    private func adopt(_ updated: Box) {
        box = updated
        renameText = updated.name
        env.boxes.remember(updated)
        env.contentChanged()
    }

    // MARK: Invitations

    func invite() async {
        let name = inviteUsername.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        guard canInvite, !name.isEmpty, !isWorking else { return }
        await run("Invitation sent.") {
            _ = try await self.env.api.inviteBox(InviteBoxRequest(boxId: self.box.id, username: name))
            self.inviteUsername = ""
            await self.invitations.refresh()
        }
    }

    func revoke(_ invitation: BoxInvitation) async {
        await run("Invitation withdrawn.") {
            _ = try await self.env.api.revokeBoxInvitation(RevokeBoxInvitationRequest(invitationId: invitation.id, boxId: self.box.id))
            self.invitations.remove(id: invitation.id)
        }
    }

    // MARK: Leave and delete

    func leave() async {
        guard BoxRules.canLeave(role) else { error = Self.ownerMustTransfer; return }
        await run("You left the Box.") {
            _ = try await self.env.api.leaveBox(boxId: self.box.id)
            self.env.contentChanged()
            self.isGone = true
        }
    }

    /// Permanent deletion: exact name plus your own acknowledgement, then poll to completion.
    func deleteBox() async {
        guard canDeleteNow else { return }
        await run(nil) {
            _ = try await self.env.api.beginBoxDeletion(BeginBoxDeletionRequest(boxId: self.box.id, confirmName: self.typedName))
            try await self.waitForDeletion()
            self.env.contentChanged()
            self.notice = "The Box was deleted."
            self.isGone = true
        }
    }

    private func waitForDeletion() async throws {
        for _ in 0..<maxPolls {
            do {
                let progress = try await env.api.boxDeletionStatus(boxId: box.id)
                if progress.phase == .complete { return }
            } catch let failure as PaldoraFailure where failure.error == .notFound {
                return  // The Box is already gone.
            }
            try await Task.sleep(for: pollInterval)
        }
    }

    // MARK: Plumbing

    private func run(_ success: String?, _ work: () async throws -> Void) async {
        isWorking = true
        error = nil
        notice = nil
        defer { isWorking = false }
        do {
            try await work()
            if let success { notice = success }
        } catch is CancellationError {
            return
        } catch {
            self.error = failureText(error)
        }
    }

    private func failureText(_ error: any Error) -> String {
        let message = env.message(for: error)
        guard let failure = error as? PaldoraFailure else { return message }
        if failure.reason == .rateLimited || failure.error == .resourceExhausted || failure.error.isRetryable
            || failure.error == .unauthenticated { return message }
        return Self.neutral
    }
}
