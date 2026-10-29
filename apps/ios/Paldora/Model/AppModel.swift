import Foundation
import Observation
import PaldoraKit

/// Session state for the whole app. No Firebase types: auth goes through
/// `AuthService` and callables through `PaldoraAPI`, so it is unit-testable.
@MainActor
@Observable
final class AppModel {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(MyProfile)
        /// Provisioned but unfinished: username, profile or avatar step still to do.
        case onboarding(MyProfile)
        /// Signed in with Firebase, but the Paldora account is unavailable
        /// (not provisioned, suspended, or onboarding not finished).
        case accountNotReady
        /// The profile could not be loaded for a transient reason.
        case profileUnavailable(String)
        case notConfigured(ConfigurationIssue)
        /// Local sign-out failed twice: the session may still be on this device. Never pretend otherwise.
        case signOutFailed
    }

    private(set) var state: State = .loading
    private(set) var preferences: Preferences?
    /// Shown on the sign-in screen after a forced sign-out.
    private(set) var notice: String?
    private(set) var signInError: String?
    private(set) var isSigningIn = false

    private let auth: (any AuthService)?
    private let api: PaldoraAPI?
    private let media: (any MediaClient)?
    private let camera: (any CameraProvider)?
    private let signOutStore: any PendingSignOutStore
    private weak var activeEnvironment: FeatureEnvironment?
    private var pendingNotice: String?

    init(
        auth: (any AuthService)?,
        api: PaldoraAPI?,
        media: (any MediaClient)? = nil,
        camera: (any CameraProvider)? = nil,
        signOutStore: any PendingSignOutStore = UserDefaultsPendingSignOut(),
        configurationIssue: ConfigurationIssue? = nil
    ) {
        self.auth = auth
        self.api = api
        self.media = media
        self.camera = camera
        self.signOutStore = signOutStore
        if let configurationIssue { state = .notConfigured(configurationIssue) }
    }

    var profile: MyProfile? {
        if case .signedIn(let profile) = state { profile } else { nil }
    }

    // MARK: Lifecycle

    /// Restores a persisted session, if any.
    func start() async {
        guard case .loading = state else { return }
        guard let auth else { state = .notConfigured(.startupFailed); return }
        // A sign-out that failed last time must finish before any session is restored.
        if signOutStore.isPending {
            state = performLocalSignOut() ? .signedOut : .signOutFailed
            return
        }
        if auth.hasSession { await loadProfile() } else { state = .signedOut }
    }

    func signIn(email: String, password: String) async {
        guard let auth, !isSigningIn else { return }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !password.isEmpty else {
            signInError = UserMessages.signInMissing
            return
        }
        isSigningIn = true
        signInError = nil
        notice = nil
        defer { isSigningIn = false }
        do {
            try await auth.signIn(email: trimmed, password: password)
        } catch let failure as AuthFailure {
            signInError = Self.message(for: failure)
            return
        } catch {
            signInError = UserMessages.generic
            return
        }
        state = .loading
        await loadProfile()
    }

    func signOut() {
        endSession(notice: nil)
    }

    /// Asks for a reset link. The answer is the same whether or not the email has an
    /// account, so nothing about account existence leaks. Only a malformed address
    /// or an unreachable service is reported.
    func requestPasswordReset(email: String) async -> String {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let auth, trimmed.contains("@"), trimmed.count >= 3 else { return UserMessages.resetNeedsEmail }
        do {
            try await auth.sendPasswordReset(email: trimmed)
        } catch let failure as AuthFailure where failure == .networkUnavailable {
            return UserMessages.unavailable
        } catch let failure as AuthFailure where failure == .tooManyAttempts {
            return UserMessages.signInTooMany
        } catch {
            // Unknown account, disabled account and other refusals look like success.
        }
        return UserMessages.resetSent
    }

    func loadProfile() async {
        guard let api else { return }
        do {
            let profile = try await api.getMyProfile()
            apply(profile)
        } catch {
            handleLoadFailure(error)
        }
    }

    /// Wires the feature layer for the signed-in user. Nil without an API.
    func makeFeatureEnvironment(userID: String) -> FeatureEnvironment? {
        guard let api else { return nil }
        let environment = FeatureEnvironment(
            api: api,
            media: media ?? UnavailableMediaClient(),
            camera: camera ?? UnavailableCamera(),
            currentUserID: userID,
            reactionPresets: { [weak self] in self?.preferences?.reactionPresets ?? [] },
            handleFailure: { [weak self] error in self?.failureMessage(error) ?? UserMessages.generic },
            signOut: { [weak self] notice in self?.endSession(notice: notice) }
        )
        activeEnvironment = environment
        return environment
    }

    /// Takes a newer profile from an onboarding step.
    func adopt(_ profile: MyProfile) { apply(profile) }

    // MARK: Profile and preferences

    /// Returns an error message, or nil on success.
    func saveProfile(displayName: String, bio: String) async -> String? {
        guard let api else { return UserMessages.generic }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = UpdateMyProfileRequest(
            displayName: name,
            bio: .some(trimmedBio.isEmpty ? nil : trimmedBio)
        )
        do {
            apply(try await api.updateMyProfile(request))
            return nil
        } catch {
            return failureMessage(error)
        }
    }

    func savePreferences(appearance: Appearance? = nil, reactionPresets: [String]? = nil) async -> String? {
        guard let api else { return UserMessages.generic }
        do {
            preferences = try await api.updateMyPreferences(
                UpdateMyPreferencesRequest(appearance: appearance, reactionPresets: reactionPresets)
            )
            return nil
        } catch {
            return failureMessage(error)
        }
    }

    // MARK: Failure handling

    private func apply(_ profile: MyProfile) {
        preferences = profile.preferences
        state = profile.profile.onboardingState == .complete ? .signedIn(profile) : .onboarding(profile)
    }

    private func handleLoadFailure(_ error: any Error) {
        guard let failure = error as? PaldoraFailure else {
            state = .profileUnavailable(UserMessages.generic)
            return
        }
        if Self.endsSession(failure) {
            endSession(notice: UserMessages.sessionEnded)
            return
        }
        switch failure.error {
        case .notFound, .permissionDenied, .failedPrecondition:
            state = .accountNotReady
        default:
            state = .profileUnavailable(Self.message(for: failure))
        }
    }

    /// A message for a failed action. A session-ending failure signs out and
    /// returns the neutral sign-in message.
    func failureMessage(_ error: any Error) -> String {
        guard let failure = error as? PaldoraFailure else {
            return UserMessages.generic
        }
        if Self.endsSession(failure) {
            endSession(notice: UserMessages.sessionEnded)
        }
        return Self.message(for: failure)
    }

    /// Ends the session everywhere on this device: drop private state, then sign out
    /// locally. A failure is retried once; if it still fails the app says so, and the
    /// pending flag keeps a Keychain session from being restored at the next launch.
    private func endSession(notice: String?) {
        activeEnvironment?.invalidate()
        ExportFiles.sweep()
        preferences = nil
        signInError = nil
        pendingNotice = notice
        if performLocalSignOut() {
            self.notice = notice
            state = .signedOut
        } else {
            state = .signOutFailed
        }
    }

    /// Retry from the "couldn't sign out" screen.
    func retrySignOut() {
        if performLocalSignOut() {
            notice = pendingNotice
            state = .signedOut
        }
    }

    private func performLocalSignOut() -> Bool {
        guard let auth else { return true }
        signOutStore.isPending = true
        for _ in 0..<2 {
            do {
                try auth.signOut()
                signOutStore.isPending = false
                return true
            } catch {
                continue
            }
        }
        return false
    }

    private static func endsSession(_ failure: PaldoraFailure) -> Bool {
        failure.reason == .sessionEnded || failure.reason == .signInRequired
            || failure.error == .unauthenticated
    }

    private static func message(for failure: PaldoraFailure) -> String {
        if endsSession(failure) { return UserMessages.sessionEnded }
        if failure.reason == .rateLimited || failure.error == .resourceExhausted {
            return UserMessages.rateLimited
        }
        if failure.reason == .invalidInput || failure.error == .invalidArgument {
            return UserMessages.invalidInput
        }
        if failure.error.isRetryable { return UserMessages.unavailable }
        return UserMessages.generic
    }

    private static func message(for failure: AuthFailure) -> String {
        switch failure {
        case .invalidCredentials: UserMessages.invalidCredentials
        case .tooManyAttempts: UserMessages.signInTooMany
        case .networkUnavailable: UserMessages.unavailable
        case .other: UserMessages.generic
        }
    }
}
