import Foundation

public enum FriendshipListing: String, Codable, Sendable, Equatable {
    case pending, sent, accepted
}

public struct Friendship: Codable, Sendable, Equatable {
    public let id: String
    public let otherUid: String
    public let status: FriendshipListing
    public let requesterUid: String
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
    public let username: String
    public let displayName: String
}

public struct SendFriendRequestRequest: Codable, Sendable, Equatable {
    public var username: String
    public init(username: String) { self.username = username }
}

public struct SendFriendRequestResponse: Codable, Sendable, Equatable {
    public let requestId: String
}

/// Input of `acceptFriendRequest` and `closeFriendship`.
public struct FriendRequestReference: Codable, Sendable, Equatable {
    public var requestId: String
    public init(requestId: String) { self.requestId = requestId }
}

public struct ListMyFriendshipsRequest: Codable, Sendable, Equatable {
    public var status: FriendshipListing
    public var cursor: String?
    public init(status: FriendshipListing, cursor: String? = nil) {
        self.status = status
        self.cursor = cursor
    }
}

public struct SetUserBlockRequest: Codable, Sendable, Equatable {
    public var targetUid: String
    public var blocked: Bool
    public init(targetUid: String, blocked: Bool) {
        self.targetUid = targetUid
        self.blocked = blocked
    }
}
