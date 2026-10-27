import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class PostDetailViewModel {
    enum Phase: Equatable {
        case loading
        case loaded(BoxPost)
        case unavailable
        case failed(String)
    }

    static let textLimit = 5_000

    private(set) var phase: Phase = .loading
    private(set) var reactions: [BoxReaction] = []
    private(set) var reactionError: String?
    private(set) var actionError: String?
    private(set) var reportSent = false
    let comments: CommentsViewModel
    let route: PostRoute
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, route: PostRoute) {
        self.env = env
        self.route = route
        comments = CommentsViewModel(env: env, route: route)
    }

    var post: BoxPost? {
        if case .loaded(let post) = phase { post } else { nil }
    }

    var isOwnEditablePost: Bool {
        guard let post else { return false }
        return post.authorUid == env.currentUserID && post.kind == .post
    }

    var canReport: Bool {
        guard let post else { return false }
        return post.authorUid != env.currentUserID
    }

    var presets: [String] { env.reactionPresets }
    var viewerKind: String? { reactions.first { $0.uid == env.currentUserID }?.kind }

    var reactionCounts: [(kind: String, count: Int)] {
        var counts: [String: Int] = [:]
        var order: [String] = []
        for reaction in reactions {
            if counts[reaction.kind] == nil { order.append(reaction.kind) }
            counts[reaction.kind, default: 0] += 1
        }
        return order.map { ($0, counts[$0] ?? 0) }
    }

    func authorName(_ uid: String) -> String {
        if uid == env.currentUserID { return "You" }
        return env.people.name(for: uid, in: route.boxId) ?? "A member"
    }

    func authorAvatar(_ uid: String) -> String? { env.people.avatar(for: uid, in: route.boxId) }

    func load() async {
        phase = .loading
        do {
            phase = .loaded(try await env.api.getBoxPost(PostReference(boxId: route.boxId, postId: route.postId)))
        } catch {
            phase = FeatureEnvironment.isAbsent(error) ? .unavailable : .failed(env.message(for: error))
            return
        }
        async let people: Void = env.people.load(boxId: route.boxId)
        await loadReactions()
        await comments.list.refresh()
        await people
    }

    func loadReactions() async {
        var found: [BoxReaction] = []
        var cursor: String?
        do {
            for _ in 0..<10 {
                let page = try await env.api.listBoxReactions(
                    ListBoxReactionsRequest(boxId: route.boxId, postId: route.postId, cursor: cursor))
                found.append(contentsOf: page.items)
                guard let next = page.nextCursor else { break }
                cursor = next
            }
            reactions = found
            reactionError = nil
        } catch {
            if !FeatureEnvironment.isAbsent(error) { reactionError = env.message(for: error) }
        }
    }

    /// Sets, switches or clears the viewer's reaction. Optimistic, rolled back on failure.
    func react(_ kind: String?) async {
        let previous = reactions
        let uid = env.currentUserID
        reactions.removeAll { $0.uid == uid }
        if let kind, let added = BoxReaction.make(uid: uid, kind: kind) { reactions.append(added) }
        reactionError = nil
        do {
            _ = try await env.api.setBoxReaction(
                SetBoxReactionRequest(boxId: route.boxId, postId: route.postId, kind: kind))
        } catch {
            reactions = previous
            reactionError = env.message(for: error)
        }
    }

    func toggle(_ kind: String) async {
        await react(viewerKind == kind ? nil : kind)
    }

    func saveEdit(_ text: String) async -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await env.api.editBoxPost(EditBoxPostRequest(boxId: route.boxId, postId: route.postId, text: trimmed))
            await load()
            return nil
        } catch {
            return env.message(for: error)
        }
    }

    /// True when the post was deleted.
    func delete() async -> Bool {
        actionError = nil
        do {
            _ = try await env.api.deleteBoxPost(PostReference(boxId: route.boxId, postId: route.postId))
            return true
        } catch {
            actionError = env.message(for: error)
            return false
        }
    }

    func report(reason: String) async -> String? {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await env.api.reportBoxPost(ReportBoxPostRequest(boxId: route.boxId, postId: route.postId, reason: trimmed))
            reportSent = true
            return nil
        } catch {
            return env.message(for: error)
        }
    }
}

extension BoxReaction {
    /// The DTO has no public initializer; build it through its Codable form.
    static func make(uid: String, kind: String) -> BoxReaction? {
        let json = try? JSONSerialization.data(withJSONObject: ["uid": uid, "kind": kind])
        return json.flatMap { try? JSONDecoder().decode(BoxReaction.self, from: $0) }
    }
}
