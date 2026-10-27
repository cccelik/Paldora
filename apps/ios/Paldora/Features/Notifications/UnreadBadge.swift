import Foundation
import Observation
import PaldoraKit

/// Unread count for the tab badge. Polling first (ADR 021 decision 2): the
/// tab shell refreshes it on foreground, every 30 seconds, and on pull to refresh.
@MainActor
@Observable
final class UnreadBadge {
    private(set) var count = 0
    private(set) var capped = false
    private let api: PaldoraAPI
    private let handleFailure: @MainActor (any Error) -> String

    init(api: PaldoraAPI, handleFailure: @escaping @MainActor (any Error) -> String) {
        self.api = api
        self.handleFailure = handleFailure
    }

    func refresh() async {
        do {
            apply(try await api.countMyUnreadNotifications())
        } catch {
            // A session-ending failure signs out; other failures keep the last count.
            _ = handleFailure(error)
        }
    }

    func apply(_ unread: UnreadCount) {
        count = unread.count
        capped = unread.capped
    }

    func decrement() { count = max(0, count - 1) }
    func clear() { count = 0; capped = false }

    /// The tab badge text, nil when there is nothing unread.
    var label: String? {
        guard count > 0 else { return nil }
        return capped ? "\(count)+" : "\(count)"
    }

    /// Polls until cancelled. Call from a task tied to the foreground state.
    func poll(every interval: Duration = .seconds(30)) async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: interval)
        }
    }
}
