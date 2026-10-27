import Foundation

/// `all`, `posts` or `life_updates`.
public enum MemoryType: String, Codable, Sendable, Equatable {
    case all
    case posts
    case lifeUpdates = "life_updates"
}

/// Year, month and type narrow a Memories page (UTC). A `month` needs a `year`.
/// A cursor is only valid with the same scope, year, month and type.
public struct ListMyMemoriesRequest: Codable, Sendable, Equatable {
    public var year: Int?
    public var month: Int?
    public var type: MemoryType?
    public var cursor: String?
    /// 1 to 50; the server defaults to 20.
    public var limit: Int?

    public init(year: Int? = nil, month: Int? = nil, type: MemoryType? = nil, cursor: String? = nil, limit: Int? = nil) {
        self.year = year
        self.month = month
        self.type = type
        self.cursor = cursor
        self.limit = limit
    }
}

public struct ListBoxMemoriesRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var year: Int?
    public var month: Int?
    public var type: MemoryType?
    public var cursor: String?
    public var limit: Int?

    public init(boxId: String, year: Int? = nil, month: Int? = nil, type: MemoryType? = nil, cursor: String? = nil, limit: Int? = nil) {
        self.boxId = boxId
        self.year = year
        self.month = month
        self.type = type
        self.cursor = cursor
        self.limit = limit
    }
}

public struct ListRoomMemoriesRequest: Codable, Sendable, Equatable {
    public var username: String
    public var year: Int?
    public var month: Int?
    public var type: MemoryType?
    public var cursor: String?
    public var limit: Int?

    public init(username: String, year: Int? = nil, month: Int? = nil, type: MemoryType? = nil, cursor: String? = nil, limit: Int? = nil) {
        self.username = username
        self.year = year
        self.month = month
        self.type = type
        self.cursor = cursor
        self.limit = limit
    }
}

public struct MyMemorySummaryRequest: Codable, Sendable, Equatable {
    public var year: Int?
    public init(year: Int? = nil) { self.year = year }
}

public struct BoxMemorySummaryRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var year: Int?
    public init(boxId: String, year: Int? = nil) {
        self.boxId = boxId
        self.year = year
    }
}

public struct RoomMemorySummaryRequest: Codable, Sendable, Equatable {
    public var username: String
    public var year: Int?
    public init(username: String, year: Int? = nil) {
        self.username = username
        self.year = year
    }
}

/// A Box post as Memories show it. `occurredAt` is the publish time and never moves on edit.
public struct MemoryPost: Codable, Sendable, Equatable {
    public let occurredAt: EpochMillis
    public let post: FeedPost

    private enum CodingKeys: String, CodingKey { case occurredAt }

    public init(from decoder: any Decoder) throws {
        occurredAt = try decoder.container(keyedBy: CodingKeys.self).decode(EpochMillis.self, forKey: .occurredAt)
        post = try FeedPost(from: decoder)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(occurredAt, forKey: .occurredAt)
        try post.encode(to: encoder)
    }
}

public struct MemoryContext: Codable, Sendable, Equatable {
    public let boxId: String
    public let boxName: String
    public let postId: String
    public let interactions: InteractionSummary
}

/// A Life Update appears once, with a context per Box the viewer is in. Only Me has none.
public struct MemoryLifeUpdate: Codable, Sendable, Equatable {
    public let occurredAt: EpochMillis
    public let id: String
    public let authorUid: String
    public let authorName: String
    public let authorAvatarMediaId: String?
    public let audience: LifeUpdateAudienceKind
    public let sections: [FeedSection]
    public let mediaAssetIds: [String]
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
    public let canEdit: Bool
    public let contexts: [MemoryContext]
}

public enum MemoryItem: Codable, Sendable, Equatable {
    case post(MemoryPost)
    case lifeUpdate(MemoryLifeUpdate)
    /// A `kind` this client does not know; skip it when rendering.
    case unsupported(kind: String)

    private enum Key: String, CodingKey { case kind }

    public init(from decoder: any Decoder) throws {
        let kind = try decoder.container(keyedBy: Key.self).decode(String.self, forKey: .kind)
        switch kind {
        case "post": self = .post(try MemoryPost(from: decoder))
        case "life_update": self = .lifeUpdate(try MemoryLifeUpdate(from: decoder))
        default: self = .unsupported(kind: kind)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        switch self {
        case .post(let value):
            try c.encode("post", forKey: .kind)
            try value.encode(to: encoder)
        case .lifeUpdate(let value):
            try c.encode("life_update", forKey: .kind)
            try value.encode(to: encoder)
        case .unsupported(let kind):
            try c.encode(kind, forKey: .kind)
        }
    }

    /// When it was published (UTC), for grouping by year and month.
    public var occurredAt: EpochMillis? {
        switch self {
        case .post(let value): value.occurredAt
        case .lifeUpdate(let value): value.occurredAt
        case .unsupported: nil
        }
    }
}

public struct MemoryYearCount: Codable, Sendable, Equatable {
    public let year: Int
    public let count: Int
}

public struct MemoryMonthCount: Codable, Sendable, Equatable {
    public let month: Int
    public let count: Int
}

/// Counts of what Memories would list. An exact scan, so it is tightly rate limited.
public struct MemorySummary: Codable, Sendable, Equatable {
    public let years: [MemoryYearCount]
    /// The requested or newest year; nil when there is nothing.
    public let year: Int?
    public let months: [MemoryMonthCount]
}
