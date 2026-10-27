import Foundation

public enum PostKind: String, Codable, Sendable, Equatable {
    case post
    case lifeUpdate = "life_update"
}

public struct BoxPost: Codable, Sendable, Equatable {
    public let id: String
    public let boxId: String
    public let authorUid: String
    public let text: String
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
    public let kind: PostKind
    public let lifeUpdateId: String?
    public let mediaAssetIds: [String]
}

/// `text` may be empty only when `mediaAssetIds` (at most 4) is non-empty.
/// Each asset must be a ready `post_image` you reserved for this Box; it can be
/// attached once.
public struct CreateBoxPostRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var text: String
    public var mediaAssetIds: [String]?
    public init(boxId: String, text: String, mediaAssetIds: [String]? = nil) {
        self.boxId = boxId
        self.text = text
        self.mediaAssetIds = mediaAssetIds
    }
}

public struct CreateBoxPostResponse: Codable, Sendable, Equatable {
    public let postId: String
}

/// Also the input of `deleteBoxPost`.
public struct PostReference: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public init(boxId: String, postId: String) {
        self.boxId = boxId
        self.postId = postId
    }
}

/// The cursor is a UUID string the server returned; never build one.
public struct ListBoxPostsRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var cursor: String?
    public init(boxId: String, cursor: String? = nil) {
        self.boxId = boxId
        self.cursor = cursor
    }
}

public struct EditBoxPostRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var text: String
    public init(boxId: String, postId: String, text: String) {
        self.boxId = boxId
        self.postId = postId
        self.text = text
    }
}
