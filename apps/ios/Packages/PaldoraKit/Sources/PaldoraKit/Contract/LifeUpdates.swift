import Foundation

/// Sections keyed by `LifeUpdateSectionKey`. Only known keys are kept on read.
public struct LifeUpdateSections: Codable, Sendable, Equatable {
    public var values: [LifeUpdateSectionKey: String]

    public init(_ values: [LifeUpdateSectionKey: String] = [:]) { self.values = values }

    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        var result: [LifeUpdateSectionKey: String] = [:]
        for key in LifeUpdateSectionKey.canonical {
            if let text = try c.decodeIfPresent(String.self, forKey: Key(stringValue: key.rawValue)) {
                result[key] = text
            }
        }
        values = result
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        for key in LifeUpdateSectionKey.canonical {
            if let text = values[key] { try c.encode(text, forKey: Key(stringValue: key.rawValue)) }
        }
    }
}

/// Chosen once at publish time; it can never change afterwards.
public enum LifeUpdateAudience: Codable, Sendable, Equatable {
    case onlyMe
    case boxes([String])

    private enum CodingKeys: String, CodingKey { case type, boxIds }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "only_me": self = .onlyMe
        case "boxes": self = .boxes(try c.decode([String].self, forKey: .boxIds))
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c, debugDescription: "Unknown audience \(other)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .onlyMe:
            try c.encode("only_me", forKey: .type)
        case .boxes(let ids):
            try c.encode("boxes", forKey: .type)
            try c.encode(ids, forKey: .boxIds)
        }
    }
}

/// What a viewer may see of a Life Update's audience once published.
public enum LifeUpdateAudienceKind: String, Codable, Sendable, Equatable {
    case onlyMe = "only_me"
    case boxes
}

public struct LifeUpdateContext: Codable, Sendable, Equatable {
    public let boxId: String
    public let boxName: String
    public let postId: String
    public let canInteract: Bool
}

public struct LifeUpdate: Codable, Sendable, Equatable {
    public let id: String
    public let authorUid: String
    public let audience: LifeUpdateAudienceKind
    public let sections: LifeUpdateSections
    public let mediaAssetIds: [String]
    public let createdAt: EpochMillis
    public let updatedAt: EpochMillis
    public let canEdit: Bool
    public let contexts: [LifeUpdateContext]
}

public struct CreateLifeUpdateRequest: Codable, Sendable, Equatable {
    public var audience: LifeUpdateAudience
    public var sections: LifeUpdateSections?
    public var mediaAssetIds: [String]?
    /// A UUID; the same key by the same author publishes once.
    public var idempotencyKey: String?

    public init(
        audience: LifeUpdateAudience,
        sections: LifeUpdateSections? = nil,
        mediaAssetIds: [String]? = nil,
        idempotencyKey: String? = nil
    ) {
        self.audience = audience
        self.sections = sections
        self.mediaAssetIds = mediaAssetIds
        self.idempotencyKey = idempotencyKey
    }
}

public struct CreateLifeUpdateResponse: Codable, Sendable, Equatable {
    public let id: String
}

/// Input of `getLifeUpdate` and `deleteLifeUpdate`.
public struct LifeUpdateReference: Codable, Sendable, Equatable {
    public var id: String
    public init(id: String) { self.id = id }
}

/// A field that is present replaces that part whole; one left out stays.
public struct LifeUpdateChanges: Codable, Sendable, Equatable {
    public var sections: LifeUpdateSections?
    public var mediaAssetIds: [String]?
    public init(sections: LifeUpdateSections? = nil, mediaAssetIds: [String]? = nil) {
        self.sections = sections
        self.mediaAssetIds = mediaAssetIds
    }
}

public struct EditLifeUpdateRequest: Codable, Sendable, Equatable {
    public var id: String
    public var changes: LifeUpdateChanges
    public init(id: String, changes: LifeUpdateChanges) {
        self.id = id
        self.changes = changes
    }
}
