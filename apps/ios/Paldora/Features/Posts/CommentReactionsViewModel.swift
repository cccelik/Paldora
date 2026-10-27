import Foundation
import Observation
import PaldoraKit

/// Reactions on one comment: same rules as post reactions (one per person,
/// any single emoji, optimistic with rollback).
@MainActor
@Observable
final class CommentReactionsViewModel {
    private(set) var reactions: [BoxReaction] = []
    private(set) var phase: ListPhase = .idle
    private(set) var error: String?
    let route: PostRoute
    let commentId: String
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment, route: PostRoute, commentId: String) {
        self.env = env
        self.route = route
        self.commentId = commentId
    }

    var presets: [String] { env.reactionPresets }
    var viewerKind: String? { reactions.first { $0.uid == env.currentUserID }?.kind }

    var counts: [(kind: String, count: Int)] {
        var counts: [String: Int] = [:]
        var order: [String] = []
        for reaction in reactions {
            if counts[reaction.kind] == nil { order.append(reaction.kind) }
            counts[reaction.kind, default: 0] += 1
        }
        return order.map { ($0, counts[$0] ?? 0) }
    }

    func load() async {
        phase = .loading
        var found: [BoxReaction] = []
        var cursor: String?
        do {
            for _ in 0..<10 {
                let page = try await env.api.listBoxReactions(ListBoxReactionsRequest(
                    boxId: route.boxId, postId: route.postId, commentId: commentId, cursor: cursor))
                found.append(contentsOf: page.items)
                guard let next = page.nextCursor else { break }
                cursor = next
            }
            reactions = found
            phase = .loaded
        } catch {
            phase = FeatureEnvironment.isAbsent(error) ? .unavailable : .failed(env.message(for: error))
        }
    }

    func toggle(_ kind: String) async { await react(viewerKind == kind ? nil : kind) }

    func react(_ kind: String?) async {
        let previous = reactions
        let uid = env.currentUserID
        reactions.removeAll { $0.uid == uid }
        if let kind, let added = BoxReaction.make(uid: uid, kind: kind) { reactions.append(added) }
        error = nil
        do {
            _ = try await env.api.setBoxReaction(SetBoxReactionRequest(
                boxId: route.boxId, postId: route.postId, commentId: commentId, kind: kind))
        } catch {
            reactions = previous
            self.error = env.message(for: error)
        }
    }
}
