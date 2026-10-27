import Foundation
import Observation
import PaldoraKit

/// Change password and sign out everywhere. Passwords live only in this
/// object's fields until the call, are cleared right after, and are never
/// logged (the request types redact themselves).
@MainActor
@Observable
final class SecurityViewModel {
    static let minLength = 10
    static let maxLength = 1_024

    var current = ""
    var new = ""
    var confirm = ""
    private(set) var error: String?
    private(set) var isWorking = false
    private let env: FeatureEnvironment

    init(env: FeatureEnvironment) { self.env = env }

    /// Inline hint for the new password, nil when it is acceptable.
    var newPasswordHint: String? {
        if new.isEmpty { return nil }
        if new.count < Self.minLength { return "Use at least \(Self.minLength) characters." }
        if new.count > Self.maxLength { return "That password is too long." }
        if !confirm.isEmpty && confirm != new { return "The two new passwords don't match." }
        return nil
    }

    var canChange: Bool {
        !isWorking && !current.isEmpty && new.count >= Self.minLength && new.count <= Self.maxLength && new == confirm
    }

    func changePassword() async {
        guard canChange else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            _ = try await env.api.changeMyPassword(ChangeMyPasswordRequest(currentPassword: current, newPassword: new))
            clear()
            // Every earlier token is revoked: drop local credentials and sign in again.
            env.signOut(notice: UserMessages.passwordChanged)
        } catch {
            self.error = message(for: error)
        }
    }

    func signOutEverywhere() async {
        guard !isWorking else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            _ = try await env.api.signOutEverywhere()
            clear()
            env.signOut(notice: UserMessages.signedOutEverywhere)
        } catch {
            self.error = message(for: error)
        }
    }

    private func clear() {
        current = ""
        new = ""
        confirm = ""
    }

    /// A wrong current password, or any other denial, is one message.
    private func message(for error: any Error) -> String {
        if let failure = error as? PaldoraFailure, failure.error == .permissionDenied { return UserMessages.wrongPassword }
        return env.message(for: error)
    }
}
