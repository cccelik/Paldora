import Foundation
import Observation
import PaldoraKit

/// Account deletion with a seven-day cancellation window. Owned Boxes must be
/// transferred first. Like the web, requesting or cancelling does not sign you out.
@MainActor
@Observable
final class DeletionViewModel {
    enum Phase: Equatable {
        case loading
        case ready(AccountDeletion?)
        case failed(String)
    }

    var password = ""
    private(set) var phase: Phase = .loading
    private(set) var notice: String?
    private(set) var error: String?
    private(set) var isBlocked = false
    private(set) var isWorking = false
    private let env: FeatureEnvironment

    static let blockedMessage = "Transfer ownership of every Box you own first, then try again."
    static let scheduled = "Deletion scheduled. You can cancel it within seven days."
    static let cancelled = "Your deletion request was cancelled."
    static let windowClosed = "The cancellation window has closed."

    init(env: FeatureEnvironment) { self.env = env }

    var deletion: AccountDeletion? {
        if case .ready(let value) = phase { value } else { nil }
    }

    /// Scheduled for deletion (not blocked or cancelled).
    var isPending: Bool { deletion?.status == "pending" }
    var isBlockedState: Bool { isBlocked || deletion?.status == "blocked" }
    var canSubmit: Bool { !password.isEmpty && !isWorking }

    func load() async {
        do { phase = .ready(try await env.api.getAccountDeletion()) } catch { phase = .failed(env.message(for: error)) }
    }

    func request() async {
        guard canSubmit else { return }
        await perform {
            let result = try await self.env.api.requestAccountDeletion(password: self.password)
            self.phase = .ready(result)
            if result.status == "blocked" { self.isBlocked = true } else { self.notice = Self.scheduled }
        }
    }

    func cancel() async {
        guard canSubmit else { return }
        await perform {
            let result = try await self.env.api.cancelAccountDeletion(password: self.password)
            self.phase = .ready(result)
            self.notice = Self.cancelled
        }
    }

    private func perform(_ work: () async throws -> Void) async {
        isWorking = true
        error = nil
        notice = nil
        isBlocked = false
        defer { isWorking = false }
        do {
            try await work()
            password = ""
        } catch {
            password = ""
            self.error = message(for: error)
        }
    }

    private func message(for error: any Error) -> String {
        if let failure = error as? PaldoraFailure {
            switch failure.error {
            case .permissionDenied: return UserMessages.wrongPassword
            case .failedPrecondition:
                // Request: owned Boxes first. Cancel: the window is closed.
                if isPending { return Self.windowClosed }
                isBlocked = true
                return Self.blockedMessage
            case .notFound: return "There is no deletion request to cancel."
            default: break
            }
        }
        return env.message(for: error)
    }
}
