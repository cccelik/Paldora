import Foundation

public enum BoxRole: String, Codable, Sendable, Equatable {
    case owner, admin, member
}

public enum BoxStatus: String, Codable, Sendable, Equatable {
    case active, archived
}

public struct Box: Codable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let status: BoxStatus
    public let currentUserRole: BoxRole
    public let memberCount: Int
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
}

public struct CreateBoxRequest: Codable, Sendable, Equatable {
    public var name: String
    public init(name: String) { self.name = name }
}

public struct BoxReference: Codable, Sendable, Equatable {
    public var boxId: String
    public init(boxId: String) { self.boxId = boxId }
}

public struct BeginBoxDeletionRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var confirmName: String
    public init(boxId: String, confirmName: String) {
        self.boxId = boxId
        self.confirmName = confirmName
    }
}

public struct BeginBoxDeletionResponse: Codable, Sendable, Equatable {
    public let jobId: String
}

public enum BoxDeletionPhase: String, Codable, Sendable, Equatable {
    case blockers, derived_refs, deliveries, reports, invitations
    case members, post_pointers, tree, complete
}

public struct BoxDeletionProgress: Codable, Sendable, Equatable {
    public let boxId: String
    public let generation: String
    public let phase: BoxDeletionPhase
    public let updatedAt: EpochMillis
}

public struct ListBoxMembersRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var cursor: String?
    public init(boxId: String, cursor: String? = nil) {
        self.boxId = boxId
        self.cursor = cursor
    }
}

public struct BoxMember: Codable, Sendable, Equatable {
    public let uid: String
    public let username: String?
    public let displayName: String?
    public let avatarMediaId: String?
    public let role: BoxRole
    public let joinedAt: EpochMillis
}
