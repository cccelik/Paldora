import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct NotificationsTests {
    @Test func openingMarksReadOptimisticallyAndRoutesToThePost() async {
        let h = await FeatureHarness { name, _ in
            switch name {
            case .listMyNotifications:
                return JSON.data(["items": [JSON.notification("n1")], "nextCursor": NSNull(), "unreadCount": ["count": 1, "capped": false]])
            case .markNotificationRead: return JSON.data(JSON.notification("n1", read: true))
            default: return JSON.data(["ok": true])
            }
        }
        let model = NotificationsViewModel(env: h.env)
        await model.list.refresh()
        #expect(h.env.badge.count == 1)
        let route = await model.open(model.list.items[0])
        #expect(route == PostRoute(boxId: "b1", postId: "p1", commentId: "c1"))
        #expect(model.list.items[0].read)
        #expect(h.env.badge.count == 0)
        #expect(h.transport.calls.contains(.markNotificationRead))
    }

    @Test func markReadFailureRollsBack() async {
        let h = await FeatureHarness { name, _ in
            switch name {
            case .listMyNotifications, .countMyUnreadNotifications:
                return JSON.data(["items": [JSON.notification("n1")], "nextCursor": NSNull(),
                                  "unreadCount": ["count": 1, "capped": false], "count": 1, "capped": false])
            default: throw failure("resource-exhausted", "RATE_LIMITED")
            }
        }
        let model = NotificationsViewModel(env: h.env)
        await model.list.refresh()
        _ = await model.open(model.list.items[0])
        #expect(!model.list.items[0].read)
        #expect(model.actionError == UserMessages.rateLimited)
    }

    @Test func badgeLabelCapsAndHidesZero() async {
        let h = await FeatureHarness { _, _ in JSON.data(["count": 99, "capped": true]) }
        #expect(h.env.badge.label == nil)
        await h.env.badge.refresh()
        #expect(h.env.badge.label == "99+")
    }

    @Test func unknownTypeStillSummarises() {
        var object = JSON.notification("n1")
        object["type"] = "post.hologram"
        let item = try? JSONDecoder().decode(PaldoraNotification.self, from: JSON.data(object))
        #expect(item.map(NotificationsViewModel.summary) == "New activity from Kai")
    }
}

@MainActor
struct BoxesTests {
    @Test func acceptRemovesInvitationAndRefreshesBoxes() async {
        let accepted = Ref(false)
        let h = await FeatureHarness { name, _ in
            switch name {
            case .listMyBoxes: return JSON.page(accepted.value ? [JSON.box("b2", name: "New")] : [])
            case .listMyBoxInvitations:
                return JSON.page(accepted.value ? [] : [["id": "i1", "boxId": "b2", "boxName": "New", "inviterUid": "u2",
                    "expiresAt": 1, "createdAt": 1, "inviterUsername": "kai", "inviterDisplayName": "Kai"]])
            case .acceptBoxInvitation: accepted.value = true; return JSON.data(["boxId": "b2"])
            default: return JSON.data(["ok": true])
            }
        }
        let model = BoxesViewModel(env: h.env)
        await model.load()
        #expect(model.invitations.items.count == 1)
        await model.accept(model.invitations.items[0])
        #expect(model.invitations.items.isEmpty)
        #expect(model.boxes.items.map(\.name) == ["New"])
    }

    @Test func createBoxTrimsNameAndReportsFailures() async {
        let sentName = Ref("")
        let ok = Ref(true)
        let h = await FeatureHarness { name, data in
            switch name {
            case .createBox:
                if !ok.value { throw failure("resource-exhausted", "RATE_LIMITED") }
                sentName.value = JSON.body(data)["name"] as? String ?? ""
                return JSON.data(JSON.box("b9", name: "Trip"))
            default: return JSON.page([])
            }
        }
        let model = BoxesViewModel(env: h.env)
        #expect(await model.createBox(name: "  Trip ") == nil)
        #expect(sentName.value == "Trip")
        ok.value = false
        #expect(await model.createBox(name: "Again") == UserMessages.rateLimited)
    }

    @Test func archivedBoxRejectsComposerAndPublishRefreshes() async {
        let status = Ref("archived")
        let created = Ref(0)
        let h = await FeatureHarness { name, _ in
            switch name {
            case .getBox: return JSON.data(JSON.box(status: status.value))
            case .listBoxPosts: return JSON.page([])
            case .listBoxMembers: return JSON.page([])
            case .createBoxPost: created.value += 1; return JSON.data(["postId": "p5"])
            default: return JSON.data(["ok": true])
            }
        }
        let model = BoxDetailViewModel(env: h.env, boxId: "b1")
        await model.load()
        #expect(!model.canPost)
        status.value = "active"
        await model.load()
        #expect(model.canPost)
        model.draft = "  hello  "
        await model.publish()
        #expect(created.value == 1 && model.draft.isEmpty)
        model.draft = String(repeating: "x", count: BoxDetailViewModel.textLimit + 1)
        #expect(!model.canSubmit)
    }
}
