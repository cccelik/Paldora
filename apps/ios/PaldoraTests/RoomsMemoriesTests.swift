import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct RoomViewTests {
    @Test func loadsMyRoomAndOrdersEnabledWidgets() async {
        let h = await FeatureHarness { name, _ in
            switch name {
            case .getMyRoom: return JSON.data(JSON.room(enabled: ["posts", "currently"]))
            default: return JSON.page([])
            }
        }
        let model = RoomViewModel(env: h.env, route: RoomRoute(username: nil))
        await model.load()
        #expect(model.isOwner && model.username == "mira")
        #expect(model.widgets.map(\.type) == ["currently", "posts"])
        #expect(model.photos?.items.isEmpty == true)
        #expect(!h.transport.calls.contains(.listRoomPhotos))
    }

    @Test func visitingByUsernameCallsGetRoomAndLoadsPhotosAndSnippets() async {
        let seen = Ref<[String]>([])
        let h = await FeatureHarness { name, data in
            switch name {
            case .getRoom: seen.append(JSON.body(data)["username"] as? String ?? ""); return JSON.data(JSON.room(relationship: "friend"))
            case .listRoomPhotos:
                return JSON.page([["mediaAssetId": "m1", "width": 4, "height": 3, "source": ["kind": "post", "postId": "p1"], "occurredAt": 1]])
            case .listRoomMemories: return JSON.page([JSON.memoryPost("p1")].map { var o = $0; o["kind"] = "post"; return o })
            default: return JSON.page([])
            }
        }
        let model = RoomViewModel(env: h.env, route: RoomRoute(username: "mira"))
        await model.load()
        #expect(seen.value == ["mira"] && !model.isOwner)
        #expect(model.photos?.items.map(\.mediaAssetId) == ["m1"])
        #expect(model.posts.count == 1)
    }

    @Test(arguments: ["not-found", "permission-denied"])
    func hiddenOrBlockedRoomIsTheSameNeutralState(code: String) async {
        let h = await FeatureHarness { _, _ in throw failure(code) }
        let model = RoomViewModel(env: h.env, route: RoomRoute(username: "ghost"))
        await model.load()
        #expect(model.phase == .unavailable)
    }

    @Test func musicOnlyAllowsHttps() {
        #expect(RoomWidgetView.safeURL("https://example.com/a") != nil)
        #expect(RoomWidgetView.safeURL("http://example.com") == nil)
        #expect(RoomWidgetView.safeURL("javascript:alert(1)") == nil)
        #expect(RoomWidgetView.safeURL("not a url") == nil)
    }

    @Test func everyThemeAccentAndFontResolvesFromTokens() {
        for id in RoomCatalog.themePresets {
            #expect(RoomRegistry.themes[id] != nil)
            #expect(PaldoraRoomThemes.presets.contains { $0.id == id })
        }
        for accent in RoomCatalog.accents { #expect(PaldoraRoomThemes.accents.contains { $0.key == accent }) }
        for font in RoomCatalog.fonts { #expect(PaldoraRoomThemes.fonts.contains { $0.key == font }) }
        let look = RoomAppearance(themePreset: "cream_paper", accent: "ocean", font: nil, decorationPack: nil, sparkles: true)
        #expect(look.scheme == .light && look.fontKey == "editorial" && look.decoration == "tape")
        let dark = RoomAppearance(themePreset: "obsidian_gold", accent: nil, font: "mono", decorationPack: "stars", sparkles: false)
        #expect(dark.scheme == .dark && dark.decoration == "stars")
    }
}

@MainActor
struct RoomEditorTests {
    private func harness(
        room: [String: Any] = JSON.room(), media: FakeMediaClient = FakeMediaClient(),
        onWrite: @escaping @Sendable (CallableName, [String: Any]) throws -> Data? = { _, _ in nil }
    ) async -> FeatureHarness {
        let base = JSON.data(room)
        return await FeatureHarness(media: media) { name, data in
            switch name {
            case .getMyRoom: return base
            case .listMyFriendships:
                return JSON.page([JSON.friendship("f1", status: "accepted", other: "u2", name: "Kai"),
                                  JSON.friendship("f2", status: "accepted", other: "u3", name: "Ren"),
                                  JSON.friendship("f3", status: "accepted", other: "u4", name: "Ola")])
            case .updateMyRoom, .updateMyRoomWidgets, .updateMyRoomTopFriends:
                if let out = try onWrite(name, JSON.body(data)) { return out }
                return base
            case .createMediaUpload: return JSON.reservation(id: "banner1")
            case .completeMediaUpload: return JSON.mediaAsset(id: "banner1")
            case .getMediaAsset: return JSON.asset(status: "ready", available: true, id: "banner1")
            default: return JSON.page([])
            }
        }
    }

    @Test func savingSendsOnlyChangedFieldsWithExpectedUpdatedAt() async {
        let sent = Ref<[String: Any]>([:])
        let h = await harness { _, body in sent.value = body; return JSON.data(JSON.room(theme: "cream_paper", updatedAt: 2000)) }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        #expect(!model.canSave)
        model.themePreset = "cream_paper"
        #expect(model.canSave)
        await model.save()
        #expect(sent.value["themePreset"] as? String == "cream_paper")
        #expect(sent.value["expectedUpdatedAt"] as? Int == 1000)
        #expect(sent.value["layout"] == nil && sent.value["visibility"] == nil)
        #expect(model.savedAt != nil && model.room?.style.themePreset == "cream_paper")
    }

    @Test func staleWriteStopsSavingAndReloadDiscardsEdits() async {
        let stale = Ref(true)
        let h = await harness { _, _ in
            if stale.value { throw failure("failed-precondition", "STALE_WRITE") }
            return nil
        }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        model.themePreset = "neon_night"
        await model.save()
        #expect(model.isStale && model.error == nil && !model.canSave)
        stale.value = false
        await model.reloadAfterStale()
        #expect(!model.isStale && model.themePreset == "obsidian_gold" && !model.isDirty)
    }

    @Test func reorderRenumbersAndSendsTheWholeOrder() async {
        let sent = Ref<[String: Any]>([:])
        let h = await harness { name, body in
            if name == .updateMyRoomWidgets { sent.value = body }
            return nil
        }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        model.move("music", by: -1)
        model.move("music", by: -1)  // already first: no-op
        #expect(model.widgets.map(\.type).prefix(2) == ["music", "currently"])
        #expect(model.widgets.map(\.position) == Array(0..<7))
        model.setEnabled("posts", false)
        model.setPlacement("memories", "sidebar")
        await model.save()
        let widgets = sent.value["widgets"] as? [[String: Any]]
        #expect(widgets?.count == 7 && widgets?.first?["type"] as? String == "music")
        #expect(sent.value["expectedUpdatedAt"] as? Int == 1000)
    }

    @Test func topFriendsAreCappedOrderedAndSent() async {
        let sent = Ref<[String: Any]>([:])
        let h = await harness { name, body in
            if name == .updateMyRoomTopFriends { sent.value = body }
            return nil
        }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        #expect(model.friends.items.count == 3)
        ["u2", "u3", "u4"].forEach(model.toggleTopFriend)
        model.moveTopFriend("u4", by: -1)
        model.moveTopFriend("u4", by: -1)
        #expect(model.selectedTopFriends == ["u4", "u2", "u3"])
        model.topFriendsVisibility = "friends"
        await model.save()
        #expect(sent.value["userIds"] as? [String] == ["u4", "u2", "u3"])
        #expect(sent.value["size"] as? Int == 4 && sent.value["visibility"] as? String == "friends")
        // Shrinking the size drops extras beyond it.
        model.setTopFriendsSize(4)
        #expect(model.selectedTopFriends.count <= 4)
    }

    @Test func bannerUploadAttachesTheReadyAssetOnSave() async {
        let sent = Ref<[String: Any]>([:])
        let media = FakeMediaClient()
        let h = await harness(media: media) { name, body in
            if name == .updateMyRoom { sent.value = body }
            return nil
        }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        model.bannerUpload.add([ImagePreparerTests.sourceJPEG(width: 600, height: 200, withGPS: false)])
        await model.bannerUpload.settled()
        #expect(model.pendingBannerId == "banner1" && model.canSave)
        await model.save()
        #expect(sent.value["bannerMediaId"] as? String == "banner1")
        #expect(media.uploads.count == 1)
    }

    @Test func musicIsValidatedAndClearedWithNull() async {
        let sent = Ref<[String: Any]>([:])
        let room = JSON.room(music: ["url": "https://example.com/s", "title": "Song", "artist": NSNull()])
        let h = await harness(room: room) { name, body in
            if name == .updateMyRoom { sent.value = body }
            return nil
        }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        #expect(model.musicURL == "https://example.com/s")
        model.musicURL = "http://insecure.example"
        #expect(!model.musicIsValid && !model.canSave)
        model.musicURL = ""
        await model.save()
        #expect(sent.value["music"] is NSNull)
    }

    @Test func neverSavedRoomSendsNullExpectedUpdatedAt() async {
        let sent = Ref<[String: Any]>([:])
        let h = await harness(room: JSON.room(updatedAt: nil)) { _, body in sent.value = body; return nil }
        let model = RoomEditorViewModel(env: h.env)
        await model.load()
        model.sparkles = true
        await model.save()
        #expect(sent.value["expectedUpdatedAt"] is NSNull)
    }
}
