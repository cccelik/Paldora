import Foundation

/// Unknown future types decode as `.unknown` so one new type never breaks a page.
public enum NotificationType: Codable, Sendable, Equatable {
    case postComment, commentReply, postReaction, commentReaction
    case unknown(String)

    public init(rawValue: String) {
        switch rawValue {
        case "post.comment": self = .postComment
        case "comment.reply": self = .commentReply
        case "post.reaction": self = .postReaction
        case "comment.reaction": self = .commentReaction
        default: self = .unknown(rawValue)
        }
    }

    public var rawValue: String {
        switch self {
        case .postComment: "post.comment"
        case .commentReply: "comment.reply"
        case .postReaction: "post.reaction"
        case .commentReaction: "comment.reaction"
        case .unknown(let value): value
        }
    }

    public init(from decoder: any Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

public struct ReactionKindRef: Codable, Sendable, Equatable {
    public let kind: String
}

public struct PaldoraNotification: Codable, Sendable, Equatable {
    public let id: String
    public let type: NotificationType
    public let actor: Person
    public let boxId: String
    public let boxName: String
    public let postId: String
    public let lifeUpdateId: String?
    public let commentId: String?
    public let reaction: ReactionKindRef?
    public let read: Bool
    public let createdAt: EpochMillis
}

/// Capped at 100 by the server; `capped` says whether the real count is higher.
public struct UnreadCount: Codable, Sendable, Equatable {
    public let count: Int
    public let capped: Bool
}

public struct NotificationPage: Codable, Sendable, Equatable {
    public let items: [PaldoraNotification]
    public let nextCursor: String?
    public let unreadCount: UnreadCount
}

public struct NotificationReference: Codable, Sendable, Equatable {
    public var id: String
    public init(id: String) { self.id = id }
}
