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
    /// A UUID; a retry with the same key returns the original `commentId`.
    public var idempotencyKey: String?
    public init(
        boxId: String,
        postId: String,
        text: String,
        parentId: String? = nil,
        idempotencyKey: String? = nil
    ) {
        self.boxId = boxId
        self.postId = postId
        self.text = text
        self.parentId = parentId
        self.idempotencyKey = idempotencyKey
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

public struct ListBoxCommentRepliesRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var rootId: String
    public var cursor: String?
    public init(boxId: String, postId: String, rootId: String, cursor: String? = nil) {
        self.boxId = boxId
        self.postId = postId
        self.rootId = rootId
        self.cursor = cursor
    }
}

public struct GetBoxCommentThreadRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var commentId: String
    public init(boxId: String, postId: String, commentId: String) {
        self.boxId = boxId
        self.postId = postId
        self.commentId = commentId
    }
}

/// One thread entry. `deleted` (a deleted comment that still has replies) and
/// `hidden` (an author the viewer may not see) carry no text or author.
public enum CommentItem: Codable, Sendable, Equatable {
    case comment(BoxComment)
    case deleted(id: String, createdAt: EpochMillis)
    case hidden(id: String, createdAt: EpochMillis)
    /// A `kind` this client does not know; skip it when rendering.
    case unsupported(kind: String)

    private enum Key: String, CodingKey { case kind, comment, id, createdAt }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "comment": self = .comment(try c.decode(BoxComment.self, forKey: .comment))
        case "deleted": self = .deleted(id: try c.decode(String.self, forKey: .id), createdAt: try c.decode(EpochMillis.self, forKey: .createdAt))
        case "hidden": self = .hidden(id: try c.decode(String.self, forKey: .id), createdAt: try c.decode(EpochMillis.self, forKey: .createdAt))
        default: self = .unsupported(kind: kind)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        switch self {
        case .comment(let value):
            try c.encode("comment", forKey: .kind)
            try c.encode(value, forKey: .comment)
        case .deleted(let id, let createdAt):
            try c.encode("deleted", forKey: .kind)
            try c.encode(id, forKey: .id)
            try c.encode(createdAt, forKey: .createdAt)
        case .hidden(let id, let createdAt):
            try c.encode("hidden", forKey: .kind)
            try c.encode(id, forKey: .id)
            try c.encode(createdAt, forKey: .createdAt)
        case .unsupported(let kind):
            try c.encode(kind, forKey: .kind)
        }
    }
}

/// A root with at most three replies (oldest first) and the full reply count.
public struct CommentThread: Codable, Sendable, Equatable {
    public let root: CommentItem
    public let rootId: String
    public let replies: [CommentItem]
    public let replyCount: Int
}
