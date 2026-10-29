import Foundation
import PaldoraKit
import SwiftUI
import Testing
@testable import Paldora

@MainActor
struct IdempotencyTests {
    @Test func draftKeyIsStablePerContentAndRotates() {
        var draft = DraftKey()
        let first = draft.key(for: "hello")
        #expect(draft.key(for: "hello") == first)
        let edited = draft.key(for: "hello world")
        #expect(edited != first && draft.key(for: "hello world") == edited)
        draft.rotate()
        #expect(draft.key(for: "hello world") != edited)
        #expect(UUID(uuidString: first) != nil)
    }

    @Test func boxPostRetryReusesTheKeyAndSuccessRotatesIt() async {
        let keys = Ref<[String]>([])
        let fail = Ref(true)
        let h = await FeatureHarness { name, data in
            switch name {
            case .createBoxPost:
                keys.append(JSON.body(data)["idempotencyKey"] as? String ?? "")
                if fail.value { throw failure("unavailable") }
                return JSON.data(["postId": "p1"])
            case .getBox: return JSON.data(JSON.box())
            default: return JSON.page([])
            }
        }
        let model = BoxDetailViewModel(env: h.env, boxId: "b1")
        model.draft = "same draft"
        await model.publish()
        await model.publish()
        #expect(keys.value.count == 2 && keys.value[0] == keys.value[1] && !keys.value[0].isEmpty)
        model.draft = "edited draft"
        await model.publish()
        #expect(keys.value[2] != keys.value[0])
        fail.value = false
        await model.publish()
        #expect(keys.value[3] == keys.value[2])
        model.draft = "edited draft"  // the same words again are a new draft after success
        await model.publish()
        #expect(keys.value[4] != keys.value[3])
    }

    @Test func commentRetryReusesTheKeyAndCancelRotates() async {
        let keys = Ref<[String]>([])
        let fail = Ref(true)
        let h = await FeatureHarness { name, data in
            if name == .createBoxComment {
                keys.append(JSON.body(data)["idempotencyKey"] as? String ?? "")
                if fail.value { throw failure("unavailable") }
                return JSON.data(["commentId": "c1"])
            }
            return JSON.page([])
        }
        let comments = CommentsViewModel(env: h.env, route: PostRoute(boxId: "b1", postId: "p1"))
        comments.draft = "hi"
        await comments.send()
        await comments.send()
        #expect(keys.value[0] == keys.value[1])
        comments.cancelComposer()
        comments.draft = "hi"
        await comments.send()
        #expect(keys.value[2] != keys.value[0])
        fail.value = false
        await comments.send()
        #expect(keys.value[3] == keys.value[2])
    }

    @Test func createBoxRetryReusesTheKeyThenRotates() async {
        let keys = Ref<[String]>([])
        let fail = Ref(true)
        let h = await FeatureHarness { name, data in
            if name == .createBox {
                keys.append(JSON.body(data)["idempotencyKey"] as? String ?? "")
                if fail.value { throw failure("unavailable") }
                return JSON.data(JSON.box("b9", name: "Trip"))
            }
            return JSON.page([])
        }
        let model = BoxesViewModel(env: h.env)
        _ = await model.createBox(name: "Trip")
        _ = await model.createBox(name: "Trip")
        #expect(keys.value[0] == keys.value[1])
        fail.value = false
        _ = await model.createBox(name: "Trip")
        #expect(keys.value[2] == keys.value[0])
        _ = await model.createBox(name: "Trip")
        #expect(keys.value[3] != keys.value[2])
    }
}

@MainActor
struct ImageLoaderHardeningTests {
    @Test func sessionEndedReachesTheCallbackOnceAndStopsFetching() async {
        let media = FakeMediaClient { _, _ in throw MediaError.unauthenticated }
        let loader = ImageLoader(client: media)
        let calls = Ref(0)
        loader.onSessionEnded = { calls.value += 1 }
        guard case .sessionEnded = await loader.image("a", .thumbnail) else { Issue.record("expected sessionEnded"); return }
        guard case .sessionEnded = await loader.image("b", .thumbnail) else { Issue.record("expected sessionEnded"); return }
        #expect(calls.value == 1 && media.fetches == ["a/thumbnail"])
    }

    @Test func sessionEndedInTheEnvironmentSignsTheUserOut() async {
        let media = FakeMediaClient { _, _ in throw MediaError.unauthenticated }
        let h = await FeatureHarness(media: media) { _, _ in JSON.page([]) }
        _ = await h.env.images.image("a", .display)
        #expect(h.model.state == .signedOut && h.model.notice == UserMessages.sessionEnded)
    }

    @Test func rateLimitBacksOffAndRetryClearsIt() async {
        let media = FakeMediaClient { _, _ in throw MediaError.rateLimited }
        var clock = Date(timeIntervalSince1970: 0)
        let loader = ImageLoader(client: media, backoffTTL: 45, now: { clock })
        guard case .rateLimited = await loader.image("a", .thumbnail) else { Issue.record("expected rateLimited"); return }
        _ = await loader.image("a", .thumbnail)
        #expect(media.fetches.count == 1)
        clock = Date(timeIntervalSince1970: 46)
        _ = await loader.image("a", .thumbnail)
        #expect(media.fetches.count == 2)
        loader.retry("a", .thumbnail)
        _ = await loader.image("a", .thumbnail)
        #expect(media.fetches.count == 3)
    }
}

@MainActor
struct SessionWipeTests {
    @Test func signOutInvalidatesImagesPollingExportsAndUploads() async throws {
        let media = FakeMediaClient()
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wipe-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let pending = JSON.data(["export": ["id": "e1", "status": "pending", "createdAt": 1, "readyAt": NSNull(), "expiresAt": 9]])
        let polls = Ref(0)
        let h = await FeatureHarness(media: media) { name, _ in
            switch name {
            case .getAccountExport: polls.value += 1; return pending
            case .createMediaUpload: return JSON.reservation()
            case .countMyUnreadNotifications: return JSON.data(["count": 3, "capped": false])
            default: return JSON.page([])
            }
        }
        _ = await h.env.images.image("seed", .thumbnail)
        #expect(h.env.images.cached("seed", .thumbnail) != nil)
        await h.env.badge.refresh()
        #expect(h.env.badge.count == 3)

        let export = ExportViewModel(env: h.env, directory: dir, maxPolls: 1_000, pollInterval: .milliseconds(5))
        let poller = Task { await export.load() }
        try await Task.sleep(for: .milliseconds(60))
        let leftover = dir.appendingPathComponent("\(ExportFiles.prefix)leftover.json")
        try Data("secret".utf8).write(to: leftover)
        let upload = PhotoAttachments(env: h.env, purpose: .avatar, limit: 1, timing: .instant)
        upload.add([ImagePreparerTests.sourceJPEG(width: 100, height: 100, withGPS: false)])

        h.model.signOut()
        await poller.value
        let seen = polls.value
        try await Task.sleep(for: .milliseconds(80))
        #expect(polls.value == seen, "export polling must stop at sign-out")
        #expect(h.env.isInvalidated && h.env.images.cached("seed", .thumbnail) == nil)
        #expect(h.env.badge.count == 0)
        await h.env.badge.refresh()
        #expect(h.env.badge.count == 0)
        await upload.settled()
        #expect(upload.readyAssetIds.isEmpty && !h.transport.calls.contains(.createMediaUpload), "uploads must not start after sign-out")
        ExportFiles.sweep(in: dir)
        #expect(!FileManager.default.fileExists(atPath: leftover.path))
    }

    @Test func sweepRemovesOnlyExportArchives() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sweep-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let archive = dir.appendingPathComponent("paldora-data-a.json"), other = dir.appendingPathComponent("keep.txt")
        try Data().write(to: archive); try Data().write(to: other)
        ExportFiles.sweep(in: dir)
        #expect(!FileManager.default.fileExists(atPath: archive.path) && FileManager.default.fileExists(atPath: other.path))
    }

    @Test func downloadedArchiveIsDeletedWhenTheSessionEnds() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("dl-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let ready = JSON.data(["export": ["id": "e1", "status": "ready", "createdAt": 1, "readyAt": 2, "expiresAt": 9]])
        let h = await FeatureHarness(media: FakeMediaClient()) { _, _ in ready }
        let export = ExportViewModel(env: h.env, directory: dir)
        await export.load()
        await export.download()
        let file = try #require(export.preparedFile)
        #expect(FileManager.default.fileExists(atPath: file.path))
        h.model.signOut()
        #expect(!FileManager.default.fileExists(atPath: file.path))
    }
}

@MainActor
struct SignOutFailureTests {
    @Test func aFailedLocalSignOutIsRetriedOnceThenShownHonestly() async {
        let auth = FakeAuth(hasSession: true)
        let store = InMemoryPendingSignOut()
        let model = AppModel(auth: auth, api: PaldoraAPI(transport: FakeTransport { _, _ in Fixtures.profileJSON() }), signOutStore: store)
        await model.start()
        auth.signOutFailures = 1  // the retry succeeds
        model.signOut()
        #expect(model.state == .signedOut && !store.isPending)
        await model.start()
        auth.hasSession = true
        auth.signOutFailures = 5
        model.signOut()
        #expect(model.state == .signOutFailed && store.isPending)
        auth.signOutFailures = 0
        model.retrySignOut()
        #expect(model.state == .signedOut && !store.isPending)
    }

    @Test func pendingSignOutFinishesBeforeAnyRestoredSessionIsUsed() async {
        let auth = FakeAuth(hasSession: true)
        let store = InMemoryPendingSignOut()
        store.isPending = true
        let calls = Ref<[CallableName]>([])
        let model = AppModel(auth: auth, api: PaldoraAPI(transport: FakeTransport { name, _ in calls.append(name); return Fixtures.profileJSON() }), signOutStore: store)
        await model.start()
        #expect(model.state == .signedOut && calls.value.isEmpty && !auth.hasSession && !store.isPending)
        let stuck = FakeAuth(hasSession: true)
        stuck.signOutFailures = 9
        let other = InMemoryPendingSignOut(); other.isPending = true
        let blocked = AppModel(auth: stuck, api: PaldoraAPI(transport: FakeTransport { _, _ in Fixtures.profileJSON() }), signOutStore: other)
        await blocked.start()
        #expect(blocked.state == .signOutFailed)
    }
}

struct PrivacyCoverTests {
    @Test func coversWheneverTheSceneIsNotActive() {
        var state = PrivacyCoverState()
        #expect(!state.isCovered)
        state.apply(.inactive); #expect(state.isCovered)
        state.apply(.active); #expect(!state.isCovered)
        state.apply(.background); #expect(state.isCovered)
        state.apply(.inactive); #expect(state.isCovered)
        state.apply(.active); #expect(!state.isCovered)
    }

    @Test func versionsComeFromBuildSettings() {
        let info = Bundle(identifier: "com.paldora.app")?.infoDictionary ?? [:]
        #expect(info["CFBundleShortVersionString"] as? String == "0.1.0")
        #expect(info["CFBundleVersion"] as? String == "1")
    }
}
