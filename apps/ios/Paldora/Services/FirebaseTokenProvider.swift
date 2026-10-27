import FirebaseAuth
import Foundation

/// The signed-in Firebase user's ID token. Firebase caches and refreshes it.
struct FirebaseTokenProvider: IDTokenProvider {
    struct NoSession: Error {}

    func idToken(forceRefresh: Bool) async throws -> String {
        guard let user = Auth.auth().currentUser else { throw NoSession() }
        return try await user.getIDTokenResult(forcingRefresh: forceRefresh).token
    }
}
