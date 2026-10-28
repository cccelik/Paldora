import Foundation
import Observation
import PaldoraKit

@MainActor
@Observable
final class FriendsViewModel {
    let requests: PagedList<Friendship>
    let sent: PagedList<Friendship>
    let friends: PagedList<Friendship>
    let blocked: PagedList<BlockedUser>
    private(set) var notice: Notice?
    private(set) var isSending = false
    private let env: FeatureEnvironment

    struct Notice: Equatable {
        let text: String
        let isError: Bool
    }

    static let neutralFailure = "We couldn't do that. Check the details and try again."

    init(env: FeatureEnvironment) {
        self.env = env
        let api = env.api
        func listing(_ status: FriendshipListing) -> PagedList<Friendship> {
            PagedList(env: env) { cursor in
                let page = try await api.listMyFriendships(ListMyFriendshipsRequest(status: status, cursor: cursor))
                return (page.items, page.nextCursor)
            }
        }
        requests = listing(.pending)
        sent = listing(.sent)
        friends = listing(.accepted)
        blocked = PagedList(env: env) { cursor in
            let page = try await api.listMyBlocks(cursor: cursor)
            return (page.items, page.nextCursor)
        }
    }

    func load() async {
        async let a: Void = requests.loadFirst()
        async let b: Void = sent.loadFirst()
        async let c: Void = friends.loadFirst()
        async let d: Void = blocked.loadFirst()
        _ = await (a, b, c, d)
    }

    func refresh() async {
        async let a: Void = requests.refresh()
        async let b: Void = sent.refresh()
        async let c: Void = friends.refresh()
        async let d: Void = blocked.refresh()
        _ = await (a, b, c, d)
    }

    /// Sends a request by username. Failures are one neutral message: the
    /// reason (unknown user, blocked, already friends) is never explained.
    func sendRequest(username: String) async -> Bool {
        let name = username.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        guard !name.isEmpty, !isSending else { return false }
        isSending = true
        notice = nil
        defer { isSending = false }
        do {
            _ = try await env.api.sendFriendRequest(username: name)
            notice = Notice(text: "Friend request sent.", isError: false)
            await sent.refresh()
            return true
        } catch {
            notice = Notice(text: failureText(error), isError: true)
            return false
        }
    }

    func accept(_ request: Friendship) async {
        await act(success: "You're now friends.") { _ = try await $0.acceptFriendRequest(requestId: request.id) }
    }

    /// Withdraw your own pending request. Distinct from declining someone else's.
    func cancel(_ request: Friendship) async {
        await act(success: "Request withdrawn.") { _ = try await $0.cancelFriendRequest(requestId: request.id) }
    }

    /// Decline and remove are `closeFriendship`.
    func close(_ friendship: Friendship, success: String) async {
        await act(success: success) { _ = try await $0.closeFriendship(requestId: friendship.id) }
    }

    func block(_ friendship: Friendship) async {
        await act(success: "Blocked. They aren't told.") {
            _ = try await $0.setUserBlock(targetUid: friendship.otherUid, blocked: true)
        }
    }

    func unblock(_ user: BlockedUser) async {
        await act(success: "Unblocked.") { _ = try await $0.setUserBlock(targetUid: user.userId, blocked: false) }
    }

    private func act(success: String, _ call: (PaldoraAPI) async throws -> Void) async {
        notice = nil
        do {
            try await call(env.api)
            notice = Notice(text: success, isError: false)
            env.contentChanged()
        } catch {
            notice = Notice(text: failureText(error), isError: true)
        }
        await refresh()
    }

    private func failureText(_ error: any Error) -> String {
        let message = env.message(for: error)
        // Rate limits, outages and session end have their own honest copy;
        // everything else is one neutral line.
        if let failure = error as? PaldoraFailure,
           failure.reason == .rateLimited || failure.error == .resourceExhausted || failure.error.isRetryable
            || failure.error == .unauthenticated { return message }
        return Self.neutralFailure
    }
}
