import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct PagedListTests {
    @Test func paginatesWithOpaqueCursorsAndDedupes() async {
        let seen = Ref<[String?]>([])
        let h = await FeatureHarness { name, data in
            guard name == .getHomeFeed else { throw failure("not-found") }
            let cursor = JSON.body(data)["cursor"] as? String
            seen.value.append(cursor)
            return cursor == nil
                ? JSON.page([JSON.feedPost("a"), JSON.feedPost("b")], next: "CURSOR/==")
                : JSON.page([JSON.feedPost("b"), JSON.feedPost("c")])
        }
        let api = h.env.api
        let list = PagedList<FeedItem>(env: h.env) { c in
            let page = try await api.getHomeFeed(cursor: c)
            return (page.items, page.nextCursor)
        }
        await list.loadFirst()
        #expect(list.items.count == 2 && list.hasMore)
        await list.loadMore()
        #expect(list.items.map(\.id) == ["post:a", "post:b", "post:c"])
        #expect(!list.hasMore)
        #expect(seen.value == [nil, "CURSOR/=="])
    }

    @Test func unknownFeedKindsAreTolerated() async {
        let h = await FeatureHarness { _, _ in
            JSON.page([JSON.feedPost("a"), ["kind": "hologram", "x": 1]])
        }
        let page = try? await h.env.api.getHomeFeed()
        #expect(page?.items.count == 2)
        if case .unsupported(let kind) = page?.items.last { #expect(kind == "hologram") } else { Issue.record("not unsupported") }
    }

    @Test func failedRefreshKeepsItemsAndShowsInlineError() async {
        let fail = Ref(false)
        let h = await FeatureHarness { _, _ in
            if fail.value { throw failure("unavailable") }
            return JSON.page([JSON.box()])
        }
        let api = h.env.api
        let list = PagedList<PaldoraKit.Box>(env: h.env) { c in
            let page = try await api.listMyBoxes(cursor: c)
            return (page.items, page.nextCursor)
        }
        await list.loadFirst()
        fail.value = true
        await list.refresh()
        #expect(list.items.count == 1)
        #expect(list.inlineError == UserMessages.unavailable)
    }

    @Test func absentIsOneNeutralStateAndFirstFailureShowsRetry() async {
        let code = Ref("not-found")
        let h = await FeatureHarness { _, _ in throw failure(code.value) }
        let api = h.env.api
        let list = PagedList<BoxPost>(env: h.env) { c in
            let page = try await api.listBoxPosts(ListBoxPostsRequest(boxId: "b1", cursor: c))
            return (page.items, page.nextCursor)
        }
        await list.loadFirst()
        #expect(list.phase == .unavailable)
        code.value = "permission-denied"
        await list.refresh()
        #expect(list.phase == .unavailable)
        code.value = "resource-exhausted"
        await list.refresh()
        #expect(list.phase == .failed(UserMessages.rateLimited))
    }

    @Test func sessionEndedSignsOut() async {
        let h = await FeatureHarness { _, _ in throw failure("unauthenticated", "SESSION_ENDED") }
        let api = h.env.api
        let list = PagedList<PaldoraKit.Box>(env: h.env) { c in
            let page = try await api.listMyBoxes(cursor: c)
            return (page.items, page.nextCursor)
        }
        await list.loadFirst()
        #expect(h.model.state == .signedOut)
        #expect(h.auth.signOutCount == 1)
    }
}

final class Ref<Value>: @unchecked Sendable {
    var value: Value
    init(_ value: Value) { self.value = value }
}

@MainActor
struct PostDetailTests {
    private func harness(reactions: [[String: Any]] = [], failReaction: String? = nil) async -> FeatureHarness {
        let reactionsData = JSON.page(reactions)
        return await FeatureHarness { name, _ in
            switch name {
            case .getBoxPost: return JSON.data(JSON.post())
            case .listBoxReactions: return reactionsData
            case .listBoxComments: return JSON.page([JSON.comment("c1"), JSON.comment("c2", parent: "c1"), JSON.comment("c3")])
            case .listBoxMembers: return JSON.page([["uid": "u2", "username": "kai", "displayName": "Kai", "role": "member", "joinedAt": 1]])
            case .setBoxReaction:
                if let failReaction { throw failure(failReaction, failReaction == "resource-exhausted" ? "RATE_LIMITED" : nil) }
                return JSON.data(["ok": true])
            default: return JSON.data(["ok": true])
            }
        }
    }

    @Test func loadsPostReactionsAndThreads() async {
        let h = await harness(reactions: [["uid": "u1", "kind": "👍"], ["uid": "u2", "kind": "👍"], ["uid": "u3", "kind": "❤️"]])
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        #expect(model.post?.text == "Hello")
        #expect(model.viewerKind == "👍")
        #expect(model.reactionCounts.map(\.count) == [2, 1])
        #expect(model.comments.threads.count == 2)
        #expect(model.comments.threads.first?.replies.count == 1)
        #expect(model.authorName("u2") == "Kai")
        #expect(model.authorName("u1") == "You")
    }

    @Test func reactionIsOptimisticAndSentOnce() async {
        let h = await harness()
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        await model.toggle("🎉")
        #expect(model.viewerKind == "🎉")
        await model.toggle("🎉")
        #expect(model.viewerKind == nil)
        #expect(h.transport.calls.filter { $0 == .setBoxReaction }.count == 2)
    }

    @Test func reactionRollsBackAndShowsRateLimitMessage() async {
        let h = await harness(reactions: [["uid": "u1", "kind": "👍"]], failReaction: "resource-exhausted")
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        await model.react("😂")
        #expect(model.viewerKind == "👍")
        #expect(model.reactionError == UserMessages.rateLimited)
    }

    @Test func absentPostIsNeutralUnavailable() async {
        let h = await FeatureHarness { _, _ in throw failure("permission-denied") }
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        #expect(model.phase == .unavailable)
    }

    @Test func reactionWithEndedSessionSignsOut() async {
        let h = await harness(failReaction: "unauthenticated")
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        await model.react("👍")
        #expect(h.model.state == .signedOut)
    }

    @Test func lifeUpdatePostsAreNotEditable() async {
        let h = await FeatureHarness { name, _ in
            name == .getBoxPost ? JSON.data(JSON.post(author: "u1", kind: "life_update")) : JSON.page([])
        }
        let model = PostDetailViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await model.load()
        #expect(!model.isOwnEditablePost)
    }
}

@MainActor
struct CommentsTests {
    @Test func replyToReplyTargetsTheParentAndSendCarriesParentId() async {
        let sent = Ref<[String: Any]>([:])
        let h = await FeatureHarness { name, data in
            switch name {
            case .listBoxComments: return JSON.page([JSON.comment("c1"), JSON.comment("c2", parent: "c1")])
            case .createBoxComment: sent.value = JSON.body(data); return JSON.data(["commentId": "c9"])
            default: return JSON.data(["ok": true])
            }
        }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await comments.list.refresh()
        let reply = comments.list.items[1]
        comments.reply(to: reply)
        #expect(comments.replyTarget?.id == "c1")
        comments.draft = "  thanks  "
        await comments.send()
        #expect(sent.value["parentId"] as? String == "c1")
        #expect(sent.value["text"] as? String == "thanks")
        #expect(comments.draft.isEmpty && comments.replyTarget == nil)
    }

    @Test func overLimitDraftCannotSend() async {
        let h = await FeatureHarness { _, _ in JSON.page([]) }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        comments.draft = String(repeating: "a", count: CommentsViewModel.textLimit + 1)
        #expect(!comments.canSend)
    }

    @Test func onlyOwnCommentsAreEditable() async {
        let h = await FeatureHarness { _, _ in JSON.page([JSON.comment("c1", author: "u1"), JSON.comment("c2")]) }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        await comments.list.refresh()
        #expect(comments.isOwn(comments.list.items[0]) && !comments.isOwn(comments.list.items[1]))
    }
}
