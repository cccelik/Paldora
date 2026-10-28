import Foundation
import PaldoraKit
import Testing
@testable import Paldora

struct BoxRulesTests {
    private let roles: [BoxRole] = [.owner, .admin, .member]

    @Test func roleChangeMatrixMatchesTheDomainRules() {
        for actor in roles {
            for target in roles {
                for next in [AssignableBoxRole.admin, .member] {
                    let expected: Bool
                    if target == .owner || actor == .member { expected = false }
                    else if actor == .owner { expected = target.rawValue != next.rawValue }
                    else { expected = target == .member && next == .admin }
                    #expect(BoxRules.mayChangeRole(actor: actor, target: target, next: next) == expected, "\(actor) \(target) \(next)")
                }
            }
        }
    }

    @Test func removeTransferInviteRenameDeleteLeave() {
        for actor in roles {
            for target in roles {
                #expect(BoxRules.mayRemove(actor: actor, target: target) == (target != .owner && actor != .member))
                #expect(BoxRules.mayTransfer(actor: actor, target: target) == (actor == .owner && target != .owner))
            }
            #expect(BoxRules.canInvite(actor: actor, status: .active) == (actor != .member))
            #expect(!BoxRules.canInvite(actor: actor, status: .archived))
            #expect(BoxRules.canRenameOrArchive(actor) == (actor == .owner) && BoxRules.canDelete(actor) == (actor == .owner))
            #expect(BoxRules.canLeave(actor) == (actor != .owner))
        }
        #expect(BoxRules.nextRole(for: .member) == .admin && BoxRules.nextRole(for: .admin) == .member)
    }
}

@MainActor
struct BoxManagementTests {
    private func box(role: String = "owner", status: String = "active") throws -> PaldoraKit.Box {
        try JSONDecoder().decode(PaldoraKit.Box.self, from: JSON.data(JSON.box("b1", name: "Friends", status: status, role: role)))
    }

    @Test func renameArchiveAndRestoreSendOnlyWhatChanged() async throws {
        let bodies = Ref<[[String: Any]]>([])
        let h = await FeatureHarness { name, data in
            if name == .updateBox {
                let body = JSON.body(data); bodies.append(body)
                let archived = (body["status"] as? String) == "archived"
                return JSON.data(JSON.box("b1", name: (body["name"] as? String) ?? "Friends", status: archived ? "archived" : "active"))
            }
            return JSON.page([])
        }
        let model = BoxManagementViewModel(env: h.env, box: try box())
        #expect(!model.canRename)
        model.renameText = "  Family "
        await model.rename()
        #expect(bodies.value[0]["name"] as? String == "Family" && bodies.value[0]["status"] == nil)
        await model.setArchived(true)
        #expect(bodies.value[1]["status"] as? String == "archived" && bodies.value[1]["name"] == nil && model.isArchived)
        #expect(!model.canInvite)
        await model.setArchived(false)
        #expect(!model.isArchived && model.canInvite)
    }

    @Test func inviteTrimsAndRevokeRemovesFromThePendingList() async throws {
        let sent = Ref<[String: Any]>([:])
        let revoked = Ref<[String: Any]>([:])
        let list = JSON.page([["id": "i1", "boxId": "b1", "inviteeUid": "u9", "inviteeUsername": "ola", "inviteeDisplayName": "Ola",
                               "inviterUid": "u1", "inviterUsername": "mira", "inviterDisplayName": "Mira", "expiresAt": 1, "createdAt": 1]])
        let h = await FeatureHarness { name, data in
            switch name {
            case .inviteBox: sent.value = JSON.body(data); return JSON.data(["invitationId": "i1"])
            case .revokeBoxInvitation: revoked.value = JSON.body(data); return JSON.data(["ok": true])
            case .listBoxInvitations: return list
            default: return JSON.page([])
            }
        }
        let model = BoxManagementViewModel(env: h.env, box: try box(role: "admin"))
        await model.load()
        #expect(model.invitations.items.count == 1)
        model.inviteUsername = " @ola "
        await model.invite()
        #expect(sent.value["username"] as? String == "ola" && model.inviteUsername.isEmpty)
        await model.revoke(model.invitations.items[0])
        #expect(revoked.value["invitationId"] as? String == "i1" && revoked.value["boxId"] as? String == "b1")
        #expect(model.invitations.items.isEmpty)
    }

    @Test func plainMembersCannotInviteOrLoadInvitations() async throws {
        let h = await FeatureHarness { _, _ in JSON.page([]) }
        let model = BoxManagementViewModel(env: h.env, box: try box(role: "member"))
        await model.load()
        model.inviteUsername = "ola"
        await model.invite()
        #expect(!h.transport.calls.contains(.inviteBox) && !h.transport.calls.contains(.listBoxInvitations))
    }

    @Test func ownerMustTransferBeforeLeaving() async throws {
        let h = await FeatureHarness { _, _ in JSON.data(["ok": true]) }
        let owner = BoxManagementViewModel(env: h.env, box: try box(role: "owner"))
        await owner.leave()
        #expect(owner.error == BoxManagementViewModel.ownerMustTransfer && !owner.isGone)
        #expect(!h.transport.calls.contains(.leaveBox))
        let member = BoxManagementViewModel(env: h.env, box: try box(role: "member"))
        await member.leave()
        #expect(member.isGone && h.transport.calls.contains(.leaveBox))
    }

    @Test func deleteNeedsTheExactNameAndAcknowledgementThenPollsToComplete() async throws {
        let polls = Ref(0)
        let begun = Ref<[String: Any]>([:])
        let h = await FeatureHarness { name, data in
            switch name {
            case .beginBoxDeletion: begun.value = JSON.body(data); return JSON.data(["jobId": "j1"])
            case .boxDeletionStatus:
                polls.value += 1
                return JSON.data(["boxId": "b1", "generation": "g", "phase": polls.value >= 3 ? "complete" : "members", "updatedAt": 1])
            default: return JSON.page([])
            }
        }
        let model = BoxManagementViewModel(env: h.env, box: try box(), pollInterval: .zero)
        model.typedName = "friends"
        model.acknowledged = true
        #expect(!model.canDeleteNow)
        model.typedName = "Friends"
        model.acknowledged = false
        #expect(!model.canDeleteNow)
        model.acknowledged = true
        #expect(model.canDeleteNow)
        await model.deleteBox()
        #expect(begun.value["confirmName"] as? String == "Friends" && polls.value == 3 && model.isGone)
    }

    @Test func deletionFailuresAreNeutralAndGoneBoxCountsAsDone() async throws {
        let h = await FeatureHarness { name, _ in
            if name == .beginBoxDeletion { throw failure("permission-denied") }
            return JSON.page([])
        }
        let model = BoxManagementViewModel(env: h.env, box: try box(), pollInterval: .zero)
        model.typedName = "Friends"; model.acknowledged = true
        await model.deleteBox()
        #expect(model.error == BoxManagementViewModel.neutral && !model.isGone)
        let gone = await FeatureHarness { name, _ in
            if name == .boxDeletionStatus { throw failure("not-found") }
            return JSON.data(["jobId": "j"])
        }
        let done = BoxManagementViewModel(env: gone.env, box: try box(), pollInterval: .zero)
        done.typedName = "Friends"; done.acknowledged = true
        await done.deleteBox()
        #expect(done.isGone)
    }

    @Test func memberActionsAreRoleAwareAndCallTheRightCallables() async throws {
        let seen = Ref<[CallableName]>([])
        let bodies = Ref<[[String: Any]]>([])
        let members = JSON.page([["uid": "u1", "username": "mira", "displayName": "Mira", "avatarMediaId": NSNull(), "role": "owner", "joinedAt": 1],
                                 ["uid": "u2", "username": "kai", "displayName": "Kai", "avatarMediaId": NSNull(), "role": "member", "joinedAt": 1],
                                 ["uid": "u3", "username": "ola", "displayName": "Ola", "avatarMediaId": NSNull(), "role": "admin", "joinedAt": 1]])
        let h = await FeatureHarness { name, data in
            seen.append(name); bodies.append(JSON.body(data))
            return name == .listBoxMembers ? members : JSON.data(["ok": true])
        }
        let owner = BoxMembersViewModel(env: h.env, boxId: "b1", viewerRole: .owner)
        await owner.members.refresh()
        let (me, kai, ola) = (owner.members.items[0], owner.members.items[1], owner.members.items[2])
        #expect(!owner.hasActions(me) && owner.hasActions(kai) && owner.hasActions(ola))
        await owner.changeRole(kai)
        await owner.transfer(ola)
        await owner.remove(kai)
        #expect(seen.value.contains(.setBoxMemberRole) && seen.value.contains(.transferBoxOwnership) && seen.value.contains(.removeBoxMember))
        let role = bodies.value.first { $0["role"] != nil }
        #expect(role?["role"] as? String == "admin" && role?["memberUid"] as? String == "u2")
        let admin = BoxMembersViewModel(env: h.env, boxId: "b1", viewerRole: .admin)
        #expect(admin.canChangeRole(kai) && !admin.canChangeRole(ola) && admin.canRemove(kai) && !admin.canTransfer(kai))
        let plain = BoxMembersViewModel(env: h.env, boxId: "b1", viewerRole: .member)
        #expect(!plain.hasActions(kai) && !plain.hasActions(ola))
    }

    @Test func cancellingYourOwnRequestIsNotDeclining() async {
        let seen = Ref<[CallableName]>([])
        let h = await FeatureHarness { name, _ in
            seen.append(name)
            return name == .listMyFriendships ? JSON.page([JSON.friendship("f2", status: "sent")]) : JSON.page([])
        }
        let model = FriendsViewModel(env: h.env)
        await model.load()
        await model.cancel(model.sent.items[0])
        #expect(seen.value.contains(.cancelFriendRequest) && !seen.value.contains(.closeFriendship))
    }
}
