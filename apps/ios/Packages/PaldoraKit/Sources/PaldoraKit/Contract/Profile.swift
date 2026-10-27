import Foundation

public enum OnboardingState: String, Codable, Sendable, Equatable {
    case username, profile, avatar, complete
}

public enum Appearance: String, Codable, Sendable, Equatable {
    case light, dark, system
}

public struct Preferences: Codable, Sendable, Equatable {
    public let appearance: Appearance
    public let reactionPresets: [String]
}

public struct MyProfile: Codable, Sendable, Equatable {
    public struct Account: Codable, Sendable, Equatable {
        public let id: String
        public let email: String
        public let status: String
        public let createdAt: EpochMillis
    }

    public struct Details: Codable, Sendable, Equatable {
        public let username: String?
        public let displayName: String?
        public let bio: String?
        /// Opaque media id for the `mediaRead` thumbnail, or nil.
        public let avatarMediaId: String?
        public let onboardingState: OnboardingState
        public let updatedAt: EpochMillis
    }

    public let user: Account
    public let profile: Details
    public let preferences: Preferences
}

/// Partial update. At least one field must be set. `bio`: `nil` leaves it
/// alone, `.some(nil)` sends an explicit `null` to clear it.
public struct UpdateMyProfileRequest: Codable, Sendable, Equatable {
    public var username: String?
    public var displayName: String?
    public var bio: String??
    public var onboardingState: OnboardingState?

    public init(
        username: String? = nil,
        displayName: String? = nil,
        bio: String?? = nil,
        onboardingState: OnboardingState? = nil
    ) {
        self.username = username
        self.displayName = displayName
        self.bio = bio
        self.onboardingState = onboardingState
    }

    private enum CodingKeys: String, CodingKey {
        case username, displayName, bio, onboardingState
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        username = try c.decodeIfPresent(String.self, forKey: .username)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName)
        if c.contains(.bio) {
            bio = .some(try c.decodeIfPresent(String.self, forKey: .bio))
        } else {
            bio = nil
        }
        onboardingState = try c.decodeIfPresent(OnboardingState.self, forKey: .onboardingState)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(username, forKey: .username)
        try c.encodeIfPresent(displayName, forKey: .displayName)
        if let bio {
            if let value = bio { try c.encode(value, forKey: .bio) } else { try c.encodeNil(forKey: .bio) }
        }
        try c.encodeIfPresent(onboardingState, forKey: .onboardingState)
    }
}

public struct UpdateMyPreferencesRequest: Codable, Sendable, Equatable {
    public var appearance: Appearance?
    public var reactionPresets: [String]?

    public init(appearance: Appearance? = nil, reactionPresets: [String]? = nil) {
        self.appearance = appearance
        self.reactionPresets = reactionPresets
    }
}
