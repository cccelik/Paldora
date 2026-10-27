import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct FriendsTests {
    private func harness(onClose: @escaping @Sendable () -> Void = {}) async -> (FeatureHarness, Ref<[CallableName]>) {
        let seen = Ref<[CallableName]>([])
        let h = await FeatureHarness { name, data in
            seen.append(name)
            switch name {
            case .listMyFriendships:
                switch JSON.body(data)["status"] as? String {
                case "pending": return JSON.page([JSON.friendship("f1", status: "pending")])
                case "sent": return JSON.page([JSON.friendship("f2", status: "sent", name: "Ola")])
                default: return JSON.page([JSON.friendship("f3", status: "accepted", other: "u3", name: "Ren")])
                }
            case .listMyBlocks: return JSON.page([["userId": "u9", "username": "zed", "displayName": "Zed", "blockedAt": 1]])
            case .closeFriendship: onClose(); return JSON.data(["ok": true])
            default: return JSON.data(["ok": true, "requestId": "r1"])
            }
        }
        return (h, seen)
    }

    @Test func loadsRequestsSentFriendsAndBlocks() async {
        let (h, _) = await harness()
        let model = FriendsViewModel(env: h.env)
        await model.load()
        #expect(model.requests.items.map(\.id) == ["f1"])
        #expect(model.sent.items.map(\.id) == ["f2"])
        #expect(model.friends.items.map(\.id) == ["f3"])
        #expect(model.blocked.items.map(\.userId) == ["u9"])
    }

    @Test func sendTrimsAtSignAndFailuresAreNeutral() async {
        let code = Ref("not-found")
        let sentName = Ref("")
        let h = await FeatureHarness { name, data in
            if name == .sendFriendRequest {
                sentName.value = JSON.body(data)["username"] as? String ?? ""
                if code.value != "ok" { throw failure(code.value) }
                return JSON.data(["requestId": "r1"])
            }
            return JSON.page([])
        }
        let model = FriendsViewModel(env: h.env)
        #expect(await model.sendRequest(username: " @kai ") == false)
        #expect(sentName.value == "kai")
        #expect(model.notice == .init(text: FriendsViewModel.neutralFailure, isError: true))
        // Unknown user, blocked, already friends and permission denied all read the same.
        for other in ["permission-denied", "already-exists", "failed-precondition"] {
            code.value = other
            _ = await model.sendRequest(username: "kai")
            #expect(model.notice?.text == FriendsViewModel.neutralFailure)
        }
        code.value = "ok"
        #expect(await model.sendRequest(username: "kai"))
        #expect(model.notice?.text == "Friend request sent.")
    }

    @Test func rateLimitKeepsItsOwnMessage() async {
        let h = await FeatureHarness { name, _ in
            if name == .sendFriendRequest { throw failure("resource-exhausted", "RATE_LIMITED") }
            return JSON.page([])
        }
        let model = FriendsViewModel(env: h.env)
        _ = await model.sendRequest(username: "kai")
        #expect(model.notice?.text == UserMessages.rateLimited)
    }

    @Test func acceptDeclineWithdrawRemoveAndBlockUseTheRightCallables() async {
        let (h, seen) = await harness()
        let model = FriendsViewModel(env: h.env)
        await model.load()
        seen.value = []
        await model.accept(model.requests.items[0])
        await model.close(model.sent.items[0], success: "Request withdrawn.")
        await model.block(model.friends.items[0])
        await model.unblock(model.blocked.items[0])
        let used = seen.value.filter { [.acceptFriendRequest, .closeFriendship, .setUserBlock].contains($0) }
        #expect(used == [.acceptFriendRequest, .closeFriendship, .setUserBlock, .setUserBlock])
    }

    @Test func blockSendsTheOtherUid() async {
        let sent = Ref<[String: Any]>([:])
        let h = await FeatureHarness { name, data in
            switch name {
            case .listMyFriendships: return JSON.page([JSON.friendship("f3", status: "accepted", other: "u3")])
            case .setUserBlock: sent.value = JSON.body(data); return JSON.data(["ok": true])
            default: return JSON.page([])
            }
        }
        let model = FriendsViewModel(env: h.env)
        await model.load()
        await model.block(model.friends.items[0])
        #expect(sent.value["targetUid"] as? String == "u3")
        #expect(sent.value["blocked"] as? Bool == true)
    }
}

@MainActor
struct LifeUpdateTests {
    private let boxes = [JSON.box("b1", name: "Friends"), JSON.box("b2", name: "Old", status: "archived"),
                         JSON.box("b3", name: "Family")]

    @Test func composerBuildsRequestWithStableIdempotencyKey() async {
        let sent = Ref<[[String: Any]]>([])
        let failFirst = Ref(true)
        let boxData = JSON.page(boxes)
        let h = await FeatureHarness { name, data in
            switch name {
            case .listMyBoxes: return boxData
            case .createLifeUpdate:
                sent.append(JSON.body(data))
                if failFirst.value { failFirst.value = false; throw failure("unavailable") }
                return JSON.data(["id": "l1"])
            default: return JSON.data(["ok": true])
            }
        }
        let model = LifeUpdateComposerViewModel(env: h.env)
        await model.load()
        model.form.set(.travel, "  Lisbon  ")
        model.form.set(.reading, "   ")
        model.toggle(model.boxes.items[1])  // archived: not selectable
        #expect(!model.canPublish)
        model.toggle(model.boxes.items[0]); model.toggle(model.boxes.items[2])
        #expect(model.canPublish)
        await model.publish()
        #expect(model.error == UserMessages.unavailable && model.publishedId == nil)
        await model.publish()
        #expect(model.publishedId == "l1")
        let (first, second) = (sent.value[0], sent.value[1])
        #expect(first["idempotencyKey"] as? String == second["idempotencyKey"] as? String)
        #expect(first["sections"] as? [String: String] == ["travel": "Lisbon"])
        let audience = first["audience"] as? [String: Any]
        #expect(audience?["type"] as? String == "boxes")
        #expect(Set(audience?["boxIds"] as? [String] ?? []) == ["b1", "b3"])
        let oldKey = model.key
        model.reset()
        #expect(model.key != oldKey)
    }

    @Test func onlyMeNeedsNoBoxesAndContentIsRequired() async {
        let h = await FeatureHarness { _, _ in JSON.page([]) }
        let model = LifeUpdateComposerViewModel(env: h.env)
        model.onlyMe = true
        #expect(!model.canPublish)  // nothing written
        model.form.set(.lifeLately, "Hi")
        #expect(model.canPublish)
        model.form.set(.lifeLately, String(repeating: "a", count: LifeUpdateForm.sectionLimit + 1))
        #expect(!model.canPublish)
    }

    @Test func totalLimitIsEnforced() {
        let form = LifeUpdateForm()
        for key in LifeUpdateSectionKey.canonical.prefix(6) { form.set(key, String(repeating: "a", count: 1_900)) }
        #expect(form.overTotal && !form.isWithinLimits)
    }

    @Test func audienceCapsAtTwentyBoxes() async {
        let many = (0..<25).map { JSON.box("b\($0)", name: "Box \($0)") }
        let manyData = JSON.page(many)
        let h = await FeatureHarness { _, _ in manyData }
        let model = LifeUpdateComposerViewModel(env: h.env)
        await model.load()
        model.boxes.items.forEach(model.toggle)
        #expect(model.selectedCount == 20)
    }

    @Test func editorSendsOnlyWhatChangedAndNeverTheAudience() async throws {
        let sent = Ref<[String: Any]>([:])
        let h = await FeatureHarness { name, data in
            if name == .editLifeUpdate { sent.value = JSON.body(data); return JSON.data(["ok": true]) }
            return JSON.page([])
        }
        let update = try JSONDecoder().decode(LifeUpdate.self, from: JSON.data(JSON.lifeUpdate(media: ["m1", "m2"])))
        let editor = LifeUpdateEditorViewModel(env: h.env, update: update)
        #expect(!editor.canSave)
        editor.removeKept("m1")
        await editor.save()
        let changes = sent.value["changes"] as? [String: Any]
        #expect(changes?["mediaAssetIds"] as? [String] == ["m2"])
        #expect(changes?["sections"] == nil)
        #expect(changes?["audience"] == nil && sent.value["audience"] == nil)
        #expect(editor.saved)
    }

    @Test func detailOrdersContextsAlphabeticallyAndOnlyMeHasNone() async {
        let h = await FeatureHarness { name, _ in
            name == .getLifeUpdate ? JSON.data(JSON.lifeUpdate()) : JSON.page([])
        }
        let model = LifeUpdateDetailViewModel(env: h.env, route: LifeUpdateRoute(id: "l1", postId: "p2"))
        await model.load()
        #expect(model.contexts.map(\.boxName) == ["alpha", "Zed"])
        #expect(model.selectedContext?.postId == "p2")
        #expect(!model.isOnlyMe)
        let only = await FeatureHarness { _, _ in JSON.data(JSON.lifeUpdate(audience: "only_me", contexts: [])) }
        let onlyModel = LifeUpdateDetailViewModel(env: only.env, route: LifeUpdateRoute(id: "l1"))
        await onlyModel.load()
        #expect(onlyModel.isOnlyMe && onlyModel.contexts.isEmpty && onlyModel.selectedContext == nil)
    }

    @Test func absentLifeUpdateIsNeutral() async {
        let h = await FeatureHarness { _, _ in throw failure("not-found") }
        let model = LifeUpdateDetailViewModel(env: h.env, route: LifeUpdateRoute(id: "x"))
        await model.load()
        #expect(model.phase == .unavailable)
    }

    @Test func deleteReportsSuccess() async {
        let h = await FeatureHarness { _, _ in JSON.data(["ok": true]) }
        let model = LifeUpdateDetailViewModel(env: h.env, route: LifeUpdateRoute(id: "l1"))
        #expect(await model.delete())
    }
}

@MainActor
struct CommentReactionTests {
    @Test func setsClearsAndRollsBackWithTheCommentId() async {
        let bodies = Ref<[[String: Any]]>([])
        let fail = Ref(false)
        let h = await FeatureHarness { name, data in
            switch name {
            case .listBoxReactions: return JSON.page([["uid": "u2", "kind": "👍"]])
            case .setBoxReaction:
                bodies.append(JSON.body(data))
                if fail.value { throw failure("resource-exhausted", "RATE_LIMITED") }
                return JSON.data(["ok": true])
            default: return JSON.data(["ok": true])
            }
        }
        let model = CommentReactionsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"), commentId: "c1")
        await model.load()
        #expect(model.counts.map(\.count) == [1])
        await model.toggle("🎉")
        #expect(model.viewerKind == "🎉")
        #expect(bodies.value[0]["commentId"] as? String == "c1")
        await model.toggle("🎉")
        #expect(model.viewerKind == nil)
        #expect(bodies.value[1]["kind"] is NSNull)
        fail.value = true
        await model.react("❤️")
        #expect(model.viewerKind == nil && model.error == UserMessages.rateLimited)
    }
}
