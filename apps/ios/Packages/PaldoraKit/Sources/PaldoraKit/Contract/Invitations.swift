import Foundation

public struct InviteBoxRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var username: String
    public init(boxId: String, username: String) {
        self.boxId = boxId
        self.username = username
    }
}

public struct InviteBoxResponse: Codable, Sendable, Equatable {
    public let invitationId: String
}

/// Input of `acceptBoxInvitation` and `declineBoxInvitation`.
public struct InvitationReference: Codable, Sendable, Equatable {
    public var invitationId: String
    public init(invitationId: String) { self.invitationId = invitationId }
}

public struct AcceptBoxInvitationResponse: Codable, Sendable, Equatable {
    public let boxId: String
}

public struct RevokeBoxInvitationRequest: Codable, Sendable, Equatable {
    public var invitationId: String
    public var boxId: String
    public init(invitationId: String, boxId: String) {
        self.invitationId = invitationId
        self.boxId = boxId
    }
}

public struct ListBoxInvitationsRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var cursor: String?
    public init(boxId: String, cursor: String? = nil) {
        self.boxId = boxId
        self.cursor = cursor
    }
}

/// An invitation addressed to the caller.
public struct MyBoxInvitation: Codable, Sendable, Equatable {
    public let id: String
    public let boxId: String
    public let boxName: String
    public let inviterUid: String
    public let expiresAt: EpochMillis
    public let createdAt: EpochMillis
    public let inviterUsername: String
    public let inviterDisplayName: String
}

/// An invitation as a Box manager sees it.
public struct BoxInvitation: Codable, Sendable, Equatable {
    public let id: String
    public let boxId: String
    public let inviteeUid: String
    public let inviteeUsername: String?
    public let inviteeDisplayName: String?
    public let inviterUid: String
    public let inviterUsername: String?
    public let inviterDisplayName: String?
    public let expiresAt: EpochMillis
    public let createdAt: EpochMillis
}
