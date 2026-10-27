import Foundation

/// Epoch milliseconds, the only timestamp the callable contract emits.
public struct EpochMillis: Hashable, Comparable, Codable, Sendable {
    public let rawValue: Int64

    public init(_ rawValue: Int64) { self.rawValue = rawValue }

    public init(date: Date) {
        self.rawValue = Int64((date.timeIntervalSince1970 * 1000).rounded())
    }

    public var date: Date {
        Date(timeIntervalSince1970: Double(rawValue) / 1000)
    }

    public init(from decoder: any Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(Int64.self)
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public static func < (lhs: EpochMillis, rhs: EpochMillis) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

/// A page of results. `nextCursor` is opaque: send it back exactly as received.
public struct Page<Item: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public let items: [Item]
    public let nextCursor: String?
}

/// `{ ok: true }`.
public struct OkResponse: Codable, Sendable, Equatable {
    public let ok: Bool
}

/// Callables with no input accept `{}`.
public struct EmptyRequest: Codable, Sendable, Equatable {
    public init() {}
}

/// A person as notifications and feeds show them.
public struct Person: Codable, Sendable, Equatable {
    public let uid: String
    public let username: String
    public let displayName: String
}

/// Request carrying only an optional pagination cursor.
public struct CursorRequest: Codable, Sendable, Equatable {
    public var cursor: String?
    public init(cursor: String? = nil) { self.cursor = cursor }
}
