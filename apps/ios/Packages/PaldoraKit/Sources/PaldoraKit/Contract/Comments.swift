import Foundation

public struct BoxComment: Codable, Sendable, Equatable {
    public let id: String
    public let postId: String
    public let authorUid: String
    public let parentId: String?
    public let text: String
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
}

public struct CreateBoxCommentRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var text: String
    /// `nil` for a top-level comment (the key is omitted).
    public var parentId: String?
    public init(boxId: String, postId: String, text: String, parentId: String? = nil) {
        self.boxId = boxId
        self.postId = postId
        self.text = text
        self.parentId = parentId
    }
}

public struct CreateBoxCommentResponse: Codable, Sendable, Equatable {
    public let commentId: String
}

public struct ListBoxCommentsRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var cursor: String?
    public init(boxId: String, postId: String, cursor: String? = nil) {
        self.boxId = boxId
        self.postId = postId
        self.cursor = cursor
    }
}

public struct EditBoxCommentRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var commentId: String
    public var text: String
    public init(boxId: String, postId: String, commentId: String, text: String) {
        self.boxId = boxId
        self.postId = postId
        self.commentId = commentId
        self.text = text
    }
}

public struct DeleteBoxCommentRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var commentId: String
    public init(boxId: String, postId: String, commentId: String) {
        self.boxId = boxId
        self.postId = postId
        self.commentId = commentId
    }
}
