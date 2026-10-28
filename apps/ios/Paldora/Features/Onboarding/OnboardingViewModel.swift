import Foundation
import Observation
import PaldoraKit

/// Walks an unfinished account through username, profile and avatar. Each step
/// is saved before the next, so closing the app resumes at the right step.
@MainActor
@Observable
final class OnboardingViewModel {
    enum Step: Int, Comparable {
        case username, profile, avatar

        static func < (lhs: Step, rhs: Step) -> Bool { lhs.rawValue < rhs.rawValue }

        init(_ state: OnboardingState) {
            switch state {
            case .username: self = .username
            case .profile: self = .profile
            case .avatar, .complete: self = .avatar
            }
        }
    }

    private(set) var profile: MyProfile
    var username = ""
    var displayName = ""
    var bio = ""
    private(set) var reservedUsername: String?
    private(set) var error: String?
    private(set) var isWorking = false
    private let env: FeatureEnvironment
    private let onProfile: (MyProfile) -> Void

    static let taken = "That username is taken. Try another."
    static let unavailable = "That username isn't available. Try another."
    static let usernameRules = "Use 3 to 30 letters, numbers or underscores."

    init(env: FeatureEnvironment, profile: MyProfile, onProfile: @escaping (MyProfile) -> Void) {
        self.env = env
        self.profile = profile
        self.onProfile = onProfile
        username = profile.profile.username ?? ""
        displayName = profile.profile.displayName ?? ""
        bio = profile.profile.bio ?? ""
    }

    var step: Step { Step(profile.profile.onboardingState) }

    var usernameHint: String? {
        let name = username.trimmingCharacters(in: .whitespaces)
        if name.isEmpty { return nil }
        if name.count < 3 || name.count > 30 { return Self.usernameRules }
        if name.contains(where: { !($0.isLetter || $0.isNumber || $0 == "_") }) { return Self.usernameRules }
        return nil
    }

    var canSaveUsername: Bool {
        !isWorking && !username.trimmingCharacters(in: .whitespaces).isEmpty && usernameHint == nil
    }

    var canSaveProfile: Bool {
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isWorking && !name.isEmpty && name.count <= 80 && bio.count <= 500
    }

    /// Reserves the username (shown back normalized), then moves to the profile step.
    func saveUsername() async {
        guard canSaveUsername else { return }
        await run {
            let wanted = self.username.trimmingCharacters(in: .whitespaces)
            self.reservedUsername = try await self.env.api.reserveUsername(wanted).normalized
            self.adopt(try await self.env.api.updateMyProfile(UpdateMyProfileRequest(onboardingState: .profile)))
        }
    }

    func saveProfile() async {
        guard canSaveProfile else { return }
        await run {
            let bioText = self.bio.trimmingCharacters(in: .whitespacesAndNewlines)
            self.adopt(try await self.env.api.updateMyProfile(UpdateMyProfileRequest(
                displayName: self.displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                bio: .some(bioText.isEmpty ? nil : bioText), onboardingState: .avatar)))
        }
    }

    /// Ends onboarding, with or without a photo.
    func finish() async {
        guard !isWorking else { return }
        await run { self.adopt(try await self.env.api.updateMyProfile(UpdateMyProfileRequest(onboardingState: .complete))) }
    }

    func avatarChanged(_ updated: MyProfile) { profile = updated }

    private func adopt(_ updated: MyProfile) {
        profile = updated
        onProfile(updated)
    }

    private func run(_ work: () async throws -> Void) async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do { try await work() } catch { self.error = message(for: error) }
    }

    private func message(for error: any Error) -> String {
        if let failure = error as? PaldoraFailure {
            switch failure.error {
            case .alreadyExists: return Self.taken
            case .failedPrecondition: return Self.unavailable
            case .invalidArgument: return Self.usernameRules
            default: break
            }
        }
        return env.message(for: error)
    }
}
