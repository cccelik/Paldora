import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct ThreadTests {
    @Test func rootsPageAndRepliesLoadByRootWithTheirOwnCursor() async {
        let bodies = Ref<[(CallableName, [String: Any])]>([])
        let rootsFirst = JSON.page([JSON.thread("r1", replies: [JSON.comment("a", parent: "r1")], replyCount: 3)], next: "r1")
        let rootsSecond = JSON.page([JSON.thread("r2")])
        let repliesFirst = JSON.page([JSON.replyItem("a", parent: "r1"), JSON.replyItem("b", parent: "r1")], next: "b")
        let repliesSecond = JSON.page([JSON.replyItem("c", parent: "r1")])
        let h = await FeatureHarness { name, data in
            let body = JSON.body(data); bodies.append((name, body))
            switch name {
            case .listBoxCommentThreads: return (body["cursor"] as? String) == nil ? rootsFirst : rootsSecond
            case .listBoxCommentReplies: return (body["cursor"] as? String) == nil ? repliesFirst : repliesSecond
            default: return JSON.page([])
            }
        }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await comments.refresh()
        let thread = comments.threads.items[0]
        #expect(comments.remainingReplies(of: thread) == 2 && comments.replies(of: thread).count == 1)
        await comments.threads.loadMore()
        #expect(comments.threads.items.map(\.rootId) == ["r1", "r2"])
        await comments.loadMoreReplies(thread)
        #expect(comments.replies(of: thread).count == 2 && comments.remainingReplies(of: thread) == 1)
        await comments.loadMoreReplies(thread)
        #expect(comments.replies(of: thread).map(\.stableId) == ["a", "b", "c"] && comments.remainingReplies(of: thread) == 0)
        let replyCalls = bodies.value.filter { $0.0 == .listBoxCommentReplies }.map(\.1)
        #expect(replyCalls.first?["rootId"] as? String == "r1" && replyCalls.last?["cursor"] as? String == "b")
    }

    @Test func deletedAndHiddenPlaceholdersAreKept() async {
        let threads = JSON.page([JSON.thread("r1", replyItems: [JSON.placeholder("hidden", "x")], root: JSON.placeholder("deleted", "r1"))])
        let h = await FeatureHarness { _, _ in threads }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await comments.refresh()
        let thread = comments.threads.items[0]
        if case .deleted(let id, _) = thread.root { #expect(id == "r1") } else { Issue.record("root should be a deleted placeholder") }
        if case .hidden(let id, _) = comments.replies(of: thread)[0] { #expect(id == "x") } else { Issue.record("reply should be hidden") }
    }

    @Test func linkedCommentIsPinnedAndNotDuplicated() async {
        let asked = Ref<[String: Any]>([:])
        let list = JSON.page([JSON.thread("r1"), JSON.thread("r2")])
        let linked = JSON.data(JSON.thread("r2", replies: [JSON.comment("deep", parent: "r2")], replyCount: 9))
        let h = await FeatureHarness { name, data in
            if name == .getBoxCommentThread { asked.value = JSON.body(data); return linked }
            return list
        }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1", commentId: "deep"))
        await comments.refresh()
        #expect(asked.value["commentId"] as? String == "deep")
        #expect(comments.visibleThreads.map(\.rootId) == ["r2", "r1"])
        #expect(comments.isPinned(comments.visibleThreads[0]))
    }

    @Test func missingThreadsAreNeutral() async {
        let h = await FeatureHarness { _, _ in throw failure("not-found") }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await comments.refresh()
        #expect(comments.threads.phase == .unavailable)
    }
}

@MainActor
struct OnboardingTests {
    private func profile(_ state: String, name: String? = nil, username: String? = nil) throws -> MyProfile {
        var object = try #require(try JSONSerialization.jsonObject(with: Fixtures.profileJSON(name: name, onboarding: state)) as? [String: Any])
        var inner = object["profile"] as? [String: Any] ?? [:]
        inner["username"] = username as Any? ?? NSNull()
        object["profile"] = inner
        return try JSONDecoder().decode(MyProfile.self, from: JSON.data(object))
    }

    @Test func stepFollowsTheServerState() throws {
        #expect(OnboardingViewModel.Step(.username) == .username && OnboardingViewModel.Step(.profile) == .profile)
        #expect(OnboardingViewModel.Step(.avatar) == .avatar)
    }

    @Test func walksUsernameProfileAvatarThenFinishes() async throws {
        let order = Ref<[String]>([])
        let adopted = Ref<[OnboardingState]>([])
        let h = await FeatureHarness { name, data in
            let body = JSON.body(data)
            switch name {
            case .reserveUsername: order.append("reserve:\(body["username"] ?? "")"); return JSON.data(["normalized": "mira"])
            case .updateMyProfile:
                let state = body["onboardingState"] as? String ?? ""
                order.append("update:\(state)")
                return Fixtures.profileJSON(name: body["displayName"] as? String, bio: body["bio"] as? String, onboarding: state)
            default: return JSON.data(["ok": true])
            }
        }
        let flow = OnboardingViewModel(env: h.env, profile: try profile("username")) { adopted.append($0.profile.onboardingState) }
        #expect(flow.step == .username && !flow.canSaveUsername)
        flow.username = "Mira"
        #expect(flow.canSaveUsername)
        await flow.saveUsername()
        #expect(flow.reservedUsername == "mira" && flow.step == .profile)
        #expect(!flow.canSaveProfile)
        flow.displayName = " Mira R "
        flow.bio = " hi "
        await flow.saveProfile()
        #expect(flow.step == .avatar)
        await flow.finish()
        #expect(order.value == ["reserve:Mira", "update:profile", "update:avatar", "update:complete"])
        #expect(adopted.value.last == .complete)
    }

    @Test func usernameRulesAndTakenAreNeutral() async throws {
        let code = Ref("already-exists")
        let h = await FeatureHarness { name, _ in
            if name == .reserveUsername { throw failure(code.value) }
            return JSON.data(["ok": true])
        }
        let flow = OnboardingViewModel(env: h.env, profile: try profile("username")) { _ in }
        flow.username = "ab"
        #expect(flow.usernameHint == OnboardingViewModel.usernameRules && !flow.canSaveUsername)
        flow.username = "has space"
        #expect(flow.usernameHint != nil)
        flow.username = "mira_1"
        #expect(flow.usernameHint == nil)
        await flow.saveUsername()
        #expect(flow.error == OnboardingViewModel.taken)
        code.value = "failed-precondition"
        await flow.saveUsername()
        #expect(flow.error == OnboardingViewModel.unavailable)
        #expect(flow.step == .username)
    }

    @Test func unprovisionedStaysAccountNotReady() async {
        let model = AppModel(auth: FakeAuth(hasSession: true), api: PaldoraAPI(transport: FakeTransport { _, _ in throw TransportError(code: "not-found") }))
        await model.start()
        #expect(model.state == .accountNotReady)
    }
}

@MainActor
struct ForgotPasswordTests {
    @Test func answersTheSameForKnownAndUnknownAccounts() async {
        let auth = FakeAuth()
        let model = AppModel(auth: auth, api: nil)
        #expect(await model.requestPasswordReset(email: "known@example.com") == UserMessages.resetSent)
        auth.resetResult = .failure(.invalidCredentials)  // e.g. user not found
        #expect(await model.requestPasswordReset(email: "ghost@example.com") == UserMessages.resetSent)
        auth.resetResult = .failure(.other)
        #expect(await model.requestPasswordReset(email: "x@example.com") == UserMessages.resetSent)
        #expect(auth.resetEmails == ["known@example.com", "ghost@example.com", "x@example.com"])
    }

    @Test func malformedAndUnreachableAreTheOnlyDifferences() async {
        let auth = FakeAuth()
        let model = AppModel(auth: auth, api: nil)
        #expect(await model.requestPasswordReset(email: "  ") == UserMessages.resetNeedsEmail)
        #expect(auth.resetEmails.isEmpty)
        auth.resetResult = .failure(.networkUnavailable)
        #expect(await model.requestPasswordReset(email: "a@b.c") == UserMessages.unavailable)
        auth.resetResult = .failure(.tooManyAttempts)
        #expect(await model.requestPasswordReset(email: "a@b.c") == UserMessages.signInTooMany)
    }
}
