import Foundation
import PaldoraKit
@testable import Paldora

@MainActor
final class FakeAuth: AuthService {
    var hasSession: Bool
    var signInResult: Result<Void, AuthFailure> = .success(())
    private(set) var signOutCount = 0

    init(hasSession: Bool = false) { self.hasSession = hasSession }

    func signIn(email: String, password: String) async throws {
        try signInResult.get()
        hasSession = true
    }

    func signOut() throws {
        signOutCount += 1
        hasSession = false
    }
}

/// Scripted transport: one handler per call, recording the callable names.
final class FakeTransport: CallableTransport, @unchecked Sendable {
    typealias Handler = @Sendable (CallableName, Data?) throws -> Data
    private let lock = NSLock()
    private var handler: Handler
    private var names: [CallableName] = []

    init(_ handler: @escaping Handler) { self.handler = handler }

    var calls: [CallableName] { lock.withLock { names } }

    func set(_ handler: @escaping Handler) { lock.withLock { self.handler = handler } }

    func call(_ name: CallableName, data: Data?) async throws -> Data {
        let current = lock.withLock { () -> Handler in names.append(name); return handler }
        return try current(name, data)
    }
}

enum Fixtures {
    static func profileJSON(
        name: String? = "Mira",
        bio: String? = nil,
        onboarding: String = "complete",
        appearance: String = "system"
    ) -> Data {
        let object: [String: Any] = [
            "user": ["id": "u1", "email": "mira@example.invalid", "status": "active", "createdAt": 1_700_000_000_000],
            "profile": [
                "username": "mira", "displayName": name as Any? ?? NSNull(), "bio": bio as Any? ?? NSNull(),
                "onboardingState": onboarding, "updatedAt": 1_700_000_000_000,
            ],
            "preferences": ["appearance": appearance, "reactionPresets": ["👍", "❤️", "😂", "😮", "🎉"]],
        ]
        return try! JSONSerialization.data(withJSONObject: object)
    }

    static func preferencesJSON(appearance: String) -> Data {
        let object: [String: Any] = ["appearance": appearance, "reactionPresets": ["👍", "❤️", "😂", "😮", "🎉"]]
        return try! JSONSerialization.data(withJSONObject: object)
    }
}
