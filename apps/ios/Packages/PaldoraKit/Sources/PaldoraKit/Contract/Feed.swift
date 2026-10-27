import Foundation

/// Known section keys of a Life Update. Unknown keys are tolerated on read.
public struct LifeUpdateSectionKey: Hashable, Codable, Sendable, RawRepresentable {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }

    public static let lifeLately = Self(rawValue: "lifeLately")
    public static let workOrUniversity = Self(rawValue: "workOrUniversity")
    public static let travel = Self(rawValue: "travel")
    public static let currentlyInto = Self(rawValue: "currentlyInto")
    public static let listeningTo = Self(rawValue: "listeningTo")
    public static let watching = Self(rawValue: "watching")
    public static let reading = Self(rawValue: "reading")
    public static let excitedAbout = Self(rawValue: "excitedAbout")
    public static let whatsNext = Self(rawValue: "whatsNext")

    /// Canonical display order.
    public static let canonical: [Self] = [
        .lifeLately, .workOrUniversity, .travel, .currentlyInto, .listeningTo,
        .watching, .reading, .excitedAbout, .whatsNext,
    ]

    public init(from decoder: any Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

public struct ReactionCount: Codable, Sendable, Equatable {
    public let kind: String
    public let count: Int
}

public struct RealReactionPreview: Codable, Sendable, Equatable {
    public let user: Person
    public let mediaAssetId: String
}

public struct ViewerReaction: Codable, Sendable, Equatable {
    public let kind: String
    public let mediaAssetId: String?
}

public struct InteractionSummary: Codable, Sendable, Equatable {
    public let commentCount: Int
    public let reactions: [ReactionCount]
    public let reactionCount: Int
    public let realCount: Int
    public let realPreview: [RealReactionPreview]
    public let viewerReaction: ViewerReaction?
    public let canInteract: Bool
}

public struct FeedPost: Codable, Sendable, Equatable {
    public let id: String
    public let boxId: String
    public let authorUid: String
    public let authorName: String
    public let mediaAssetIds: [String]
    public let createdAt: EpochMillis
    public let interactions: InteractionSummary
    public let text: String
    public let edited: Bool
    public let canEdit: Bool
}

public struct FeedSection: Codable, Sendable, Equatable {
    public let key: LifeUpdateSectionKey
    public let content: String
}

/// `id` is the Life Update; `postId` is its delivery in `boxId`.
public struct FeedLifeUpdate: Codable, Sendable, Equatable {
    public let id: String
    public let postId: String
    public let boxId: String
    public let authorUid: String
    public let authorName: String
    public let mediaAssetIds: [String]
    public let createdAt: EpochMillis
    public let interactions: InteractionSummary
    public let sections: [FeedSection]
}

public enum FeedItem: Codable, Sendable, Equatable {
    case post(FeedPost)
    case lifeUpdate(FeedLifeUpdate)
    /// A `kind` this client does not know; skip it when rendering.
    case unsupported(kind: String)

    private enum Key: String, CodingKey { case kind }

    public init(from decoder: any Decoder) throws {
        let kind = try decoder.container(keyedBy: Key.self).decode(String.self, forKey: .kind)
        switch kind {
        case "post": self = .post(try FeedPost(from: decoder))
        case "life_update": self = .lifeUpdate(try FeedLifeUpdate(from: decoder))
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
}
