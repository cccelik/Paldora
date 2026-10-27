import FirebaseAuth
import Foundation

/// Why a sign-in failed, with nothing that could reveal whether an account exists.
enum AuthFailure: Error, Equatable {
    case invalidCredentials
    case tooManyAttempts
    case networkUnavailable
    case other
}

/// The slice of Firebase Auth the app model needs. Firebase Auth owns
/// Keychain storage and token refresh; the model never sees tokens.
@MainActor
protocol AuthService: AnyObject {
    /// True when a persisted session was restored.
    var hasSession: Bool { get }
    func signIn(email: String, password: String) async throws
    func signOut() throws
}

@MainActor
final class FirebaseAuthService: AuthService {
    private let auth: Auth

    init(auth: Auth = Auth.auth()) {
        self.auth = auth
    }

    var hasSession: Bool { auth.currentUser != nil }

    func signIn(email: String, password: String) async throws {
        do {
            _ = try await auth.signIn(withEmail: email, password: password)
        } catch {
            throw Self.map(error)
        }
    }

    func signOut() throws {
        try auth.signOut()
    }

    /// Collapses account-existence signals (wrong password, unknown email,
    /// disabled account) into one failure.
    nonisolated static func map(_ error: any Error) -> AuthFailure {
        let nsError = error as NSError
        guard nsError.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: nsError.code) else {
            return nsError.domain == NSURLErrorDomain ? .networkUnavailable : .other
        }
        switch code {
        case .tooManyRequests: return .tooManyAttempts
        case .networkError: return .networkUnavailable
        case .wrongPassword, .invalidEmail, .userNotFound, .invalidCredential, .userDisabled:
            return .invalidCredentials
        default: return .other
        }
    }
}
