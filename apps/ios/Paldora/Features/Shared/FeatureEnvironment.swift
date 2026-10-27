import Foundation
import Observation
import PaldoraKit

/// Everything a feature view model needs: the typed API, who is signed in, and
/// the single place failures are interpreted (a session-ending failure signs
/// the user out there).
@MainActor
final class FeatureEnvironment {
    let api: PaldoraAPI
    let currentUserID: String
    let boxes: BoxDirectory
    let people: PeopleDirectory
    let badge: UnreadBadge
    let media: any MediaClient
    let images: ImageLoader
    private let failureHandler: @MainActor (any Error) -> String
    private let signOutHandler: @MainActor (String) -> Void
    private let presets: @MainActor () -> [String]

    init(
        api: PaldoraAPI,
        media: any MediaClient,
        currentUserID: String,
        reactionPresets: @escaping @MainActor () -> [String],
        handleFailure: @escaping @MainActor (any Error) -> String,
        signOut: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        self.api = api
        self.media = media
        images = ImageLoader(client: media)
        self.currentUserID = currentUserID
        self.presets = reactionPresets
        self.failureHandler = handleFailure
        self.signOutHandler = signOut
        boxes = BoxDirectory(api: api)
        people = PeopleDirectory(api: api)
        badge = UnreadBadge(api: api, handleFailure: handleFailure)
    }

    var reactionPresets: [String] { presets() }

    /// Bumped when this user changes content (create, edit, delete), so other
    /// tabs know to reload when they next appear.
    private(set) var contentVersion = 0

    func contentChanged() { contentVersion += 1 }

    /// Ends the local session and shows `notice` on the sign-in screen.
    func signOut(notice: String) { signOutHandler(notice) }

    /// A user-facing message for a failed call. May sign the user out.
    func message(for error: any Error) -> String {
        failureHandler(error)
    }

    /// Absence and denial are indistinguishable (CLAUDE.md section G): both
    /// show the same neutral "no longer available" state.
    static func isAbsent(_ error: any Error) -> Bool {
        guard let failure = error as? PaldoraFailure else { return false }
        switch failure.error {
        case .notFound, .permissionDenied: return true
        default: return false
        }
    }
}

/// Box id to name, for feed cards that only carry a box id.
@MainActor
@Observable
final class BoxDirectory {
    private(set) var names: [String: String] = [:]
    private let api: PaldoraAPI
    private var loaded = false

    init(api: PaldoraAPI) { self.api = api }

    func name(for boxId: String) -> String? { names[boxId] }

    func remember(_ box: Box) { names[box.id] = box.name }

    func loadIfNeeded() async {
        guard !loaded else { return }
        await reload()
    }

    func reload() async {
        var cursor: String?
        for _ in 0..<10 {
            guard let page = try? await api.listMyBoxes(cursor: cursor) else { return }
            for box in page.items { names[box.id] = box.name }
            guard let next = page.nextCursor else { break }
            cursor = next
        }
        loaded = true
    }
}

/// Uid to display name per Box, from the member list (comments and posts
/// carry only author uids).
@MainActor
@Observable
final class PeopleDirectory {
    private(set) var names: [String: [String: String]] = [:]
    private(set) var avatars: [String: [String: String]] = [:]
    private(set) var usernames: [String: [String: String]] = [:]
    private let api: PaldoraAPI
    private var loading: Set<String> = []

    init(api: PaldoraAPI) { self.api = api }

    func name(for uid: String, in boxId: String) -> String? { names[boxId]?[uid] }

    func avatar(for uid: String, in boxId: String) -> String? { avatars[boxId]?[uid] }

    func username(for uid: String, in boxId: String) -> String? { usernames[boxId]?[uid] }

    func load(boxId: String) async {
        guard names[boxId] == nil, !loading.contains(boxId) else { return }
        loading.insert(boxId)
        defer { loading.remove(boxId) }
        var found: [String: String] = [:]
        var avatarIds: [String: String] = [:]
        var handles: [String: String] = [:]
        var cursor: String?
        for _ in 0..<10 {
            guard let page = try? await api.listBoxMembers(ListBoxMembersRequest(boxId: boxId, cursor: cursor)) else { break }
            for member in page.items {
                found[member.uid] = member.displayName ?? member.username ?? "Member"
                if let avatar = member.avatarMediaId { avatarIds[member.uid] = avatar }
                if let handle = member.username { handles[member.uid] = handle }
            }
            guard let next = page.nextCursor else { break }
            cursor = next
        }
        names[boxId] = found
        avatars[boxId] = avatarIds
        usernames[boxId] = handles
    }

    func remember(uid: String, name: String, in boxId: String) {
        names[boxId, default: [:]][uid] = name
    }
}
