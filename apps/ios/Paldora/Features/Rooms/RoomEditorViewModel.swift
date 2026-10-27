import Foundation
import Observation
import PaldoraKit

/// Edits my Room. Every write carries `expectedUpdatedAt`; a stale value
/// (`STALE_WRITE`) stops the save and asks the owner to reload.
@MainActor
@Observable
final class RoomEditorViewModel {
    enum Phase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    // Appearance
    var themePreset = "obsidian_gold"
    var layout = "single"
    var accent: String?
    var font: String?
    var decorationPack: String?
    var sparkles = false
    // About and audience
    var visibility = "friends"
    var location = ""
    var currently = ""
    var musicURL = ""
    var musicTitle = ""
    var musicArtist = ""
    // Banner
    private(set) var bannerMediaId: String?
    let bannerUpload: PhotoAttachments
    // Widgets and Top Friends
    private(set) var widgets: [RoomWidget] = []
    var topFriendsSize = 4
    var topFriendsVisibility = "visible"
    private(set) var topFriendIds: [String] = []
    let friends: PagedList<Friendship>

    private(set) var phase: Phase = .loading
    private(set) var room: Room?
    private(set) var isSaving = false
    private(set) var isStale = false
    private(set) var error: String?
    private(set) var savedAt: Date?
    private let env: FeatureEnvironment

    static let locationLimit = 80
    static let currentlyLimit = 280

    init(env: FeatureEnvironment) {
        self.env = env
        bannerUpload = PhotoAttachments(env: env, purpose: .roomBanner, limit: 1)
        let api = env.api
        friends = PagedList(env: env) { cursor in
            let page = try await api.listMyFriendships(ListMyFriendshipsRequest(status: .accepted, cursor: cursor))
            return (page.items, page.nextCursor)
        }
    }

    // MARK: Loading

    func load() async {
        phase = .loading
        do {
            adopt(try await env.api.getMyRoom())
            phase = .ready
        } catch {
            phase = .failed(env.message(for: error))
            return
        }
        await friends.refresh()
        await friends.loadAll()
    }

    /// Discards unsaved edits and takes the latest saved Room.
    func reloadAfterStale() async {
        error = nil
        isStale = false
        bannerUpload.clear()
        await load()
    }

    private func adopt(_ room: Room) {
        self.room = room
        themePreset = room.style.themePreset
        layout = room.style.layout
        accent = room.style.accent
        font = room.style.font
        decorationPack = room.style.decorationPack
        sparkles = room.style.sparkles
        visibility = room.visibility ?? "friends"
        location = room.location ?? ""
        currently = room.currently ?? ""
        musicURL = room.music?.url ?? ""
        musicTitle = room.music?.title ?? ""
        musicArtist = room.music?.artist ?? ""
        bannerMediaId = room.bannerMediaId
        widgets = room.widgets.sorted { $0.position < $1.position }
        topFriendsSize = room.topFriends.size ?? 4
        topFriendsVisibility = room.topFriends.visibility ?? "visible"
        topFriendIds = (room.topFriends.items ?? []).map(\.uid)
    }

    // MARK: Widgets

    func move(_ type: String, by offset: Int) {
        guard let index = widgets.firstIndex(where: { $0.type == type }) else { return }
        let target = index + offset
        guard widgets.indices.contains(target) else { return }
        widgets.swapAt(index, target)
        renumber()
    }

    func setEnabled(_ type: String, _ enabled: Bool) { mutate(type) { $0.enabled = enabled } }
    func setPlacement(_ type: String, _ placement: String) { mutate(type) { $0.placement = placement } }

    private func mutate(_ type: String, _ change: (inout RoomWidget) -> Void) {
        guard let index = widgets.firstIndex(where: { $0.type == type }) else { return }
        change(&widgets[index])
    }

    private func renumber() {
        for index in widgets.indices { widgets[index].position = index }
    }

    // MARK: Top Friends

    var maxTopFriends: Int { topFriendsSize }

    func toggleTopFriend(_ uid: String) {
        if let index = topFriendIds.firstIndex(of: uid) { topFriendIds.remove(at: index) }
        else if topFriendIds.count < topFriendsSize { topFriendIds.append(uid) }
    }

    func moveTopFriend(_ uid: String, by offset: Int) {
        guard let index = topFriendIds.firstIndex(of: uid), topFriendIds.indices.contains(index + offset) else { return }
        topFriendIds.swapAt(index, index + offset)
    }

    func setTopFriendsSize(_ size: Int) {
        topFriendsSize = size
        if topFriendIds.count > size { topFriendIds = Array(topFriendIds.prefix(size)) }
    }

    var selectedTopFriends: [String] { topFriendIds }

    func friendName(_ uid: String) -> String {
        friends.items.first { $0.otherUid == uid }?.displayName
            ?? room?.topFriends.items?.first { $0.uid == uid }?.displayName ?? "Friend"
    }

    // MARK: Banner

    var pendingBannerId: String? { bannerUpload.readyAssetIds.first }
    var effectiveBanner: String? { pendingBannerId ?? bannerMediaId }
    func removeBanner() { bannerUpload.clear(); bannerMediaId = nil }

    // MARK: Validation

    var musicIsValid: Bool { musicURL.isEmpty || RoomWidgetView.safeURL(musicURL) != nil }
    var textIsValid: Bool { location.count <= Self.locationLimit && currently.count <= Self.currentlyLimit }

    private var generalDirty: Bool {
        guard let room else { return false }
        return themePreset != room.style.themePreset || layout != room.style.layout || accent != room.style.accent
            || font != room.style.font || decorationPack != room.style.decorationPack || sparkles != room.style.sparkles
            || visibility != (room.visibility ?? "friends") || location != (room.location ?? "")
            || currently != (room.currently ?? "") || musicURL != (room.music?.url ?? "")
            || musicTitle != (room.music?.title ?? "") || musicArtist != (room.music?.artist ?? "")
            || effectiveBanner != room.bannerMediaId
    }

    private var widgetsDirty: Bool { widgets != (room?.widgets.sorted { $0.position < $1.position } ?? []) }

    private var topFriendsDirty: Bool {
        guard let room else { return false }
        return topFriendIds != (room.topFriends.items ?? []).map(\.uid)
            || topFriendsSize != (room.topFriends.size ?? 4) || topFriendsVisibility != (room.topFriends.visibility ?? "visible")
    }

    var isDirty: Bool { generalDirty || widgetsDirty || topFriendsDirty }

    var canSave: Bool {
        !isSaving && !isStale && isDirty && musicIsValid && textIsValid && !bannerUpload.isBusy && !bannerUpload.hasFailure
    }

    // MARK: Saving

    /// Saves each changed group in turn, carrying the newest `updatedAt` forward.
    func save() async {
        guard canSave else { return }
        isSaving = true
        error = nil
        savedAt = nil
        defer { isSaving = false }
        do {
            if generalDirty, let room { adopt(keepingDrafts: try await env.api.updateMyRoom(generalRequest(room))) }
            if widgetsDirty, let room {
                adopt(keepingDrafts: try await env.api.updateMyRoomWidgets(
                    UpdateMyRoomWidgetsRequest(widgets: widgets, expectedUpdatedAt: room.updatedAt)))
            }
            if topFriendsDirty, let room {
                adopt(keepingDrafts: try await env.api.updateMyRoomTopFriends(UpdateMyRoomTopFriendsRequest(
                    userIds: topFriendIds, size: topFriendsSize, visibility: topFriendsVisibility,
                    expectedUpdatedAt: room.updatedAt)))
            }
            bannerUpload.clear()
            if let room { adopt(room) }
            env.contentChanged()
            savedAt = Date()
        } catch {
            if let failure = error as? PaldoraFailure, failure.reason == .staleWrite {
                isStale = true
            } else {
                self.error = env.message(for: error)
            }
        }
    }

    /// Takes the new `updatedAt` without overwriting edits still waiting for their own save.
    private func adopt(keepingDrafts saved: Room) {
        let pending = (themePreset, layout, accent, font, decorationPack, sparkles, visibility, location, currently,
                       musicURL, musicTitle, musicArtist, widgets, topFriendIds, topFriendsSize, topFriendsVisibility)
        let banner = bannerMediaId
        adopt(saved)
        (themePreset, layout, accent, font, decorationPack, sparkles, visibility, location, currently,
         musicURL, musicTitle, musicArtist, widgets, topFriendIds, topFriendsSize, topFriendsVisibility) = pending
        bannerMediaId = banner
    }

    private func generalRequest(_ room: Room) -> UpdateMyRoomRequest {
        var request = UpdateMyRoomRequest(expectedUpdatedAt: room.updatedAt)
        if visibility != (room.visibility ?? "friends") { request.visibility = visibility }
        if themePreset != room.style.themePreset { request.themePreset = themePreset }
        if layout != room.style.layout { request.layout = layout }
        if accent != room.style.accent { request.accent = .some(accent) }
        if font != room.style.font { request.font = .some(font) }
        if decorationPack != room.style.decorationPack { request.decorationPack = .some(decorationPack) }
        if sparkles != room.style.sparkles { request.sparkles = sparkles }
        if location != (room.location ?? "") { request.location = .some(Self.clean(location)) }
        if currently != (room.currently ?? "") { request.currently = .some(Self.clean(currently)) }
        if musicURL != (room.music?.url ?? "") || musicTitle != (room.music?.title ?? "") || musicArtist != (room.music?.artist ?? "") {
            request.music = .some(musicURL.isEmpty ? nil : RoomMusicInput(
                url: musicURL, title: Self.clean(musicTitle), artist: Self.clean(musicArtist)))
        }
        if effectiveBanner != room.bannerMediaId { request.bannerMediaId = .some(effectiveBanner) }
        return request
    }

    private static func clean(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
