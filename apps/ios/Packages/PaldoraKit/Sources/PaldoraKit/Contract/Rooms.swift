import Foundation

/// The registry ids a Room accepts (`packages/domain`). Clients send these
/// strings; no CSS, color or URL ever crosses the contract. Unknown ids from a
/// newer server are tolerated on read (the fields below are plain strings).
public enum RoomCatalog {
    public static let themePresets = [
        "obsidian_gold", "cream_paper", "lavender_dream", "ocean_glow", "daisy_day",
        "neon_night", "y2k_glitter", "dark_academia", "frutiger_aero", "tumblr_2014",
        "retro_windows", "cyberpunk", "minimal_editorial", "polaroid_scrapbook",
    ]
    public static let layouts = ["single", "two_column"]
    public static let accents = ["gold", "lavender", "ocean", "daisy", "pink", "emerald", "cyan", "crimson"]
    public static let fonts = ["editorial", "modern", "rounded", "mono", "handwritten"]
    public static let decorationPacks = ["none", "stars", "flowers", "stickers", "tape", "pixels"]
    public static let visibilities = ["friends", "members", "hidden"]
    public static let widgetTypes = [
        "currently", "music", "top_friends", "photos", "life_updates", "posts", "memories",
    ]
    public static let widgetPlacements = ["main", "sidebar"]
    public static let topFriendsVisibilities = ["visible", "friends", "hidden"]
    public static let topFriendsSizes = [4, 8, 12]
}

extension KeyedDecodingContainer {
    /// `nil` = key absent, `.some(nil)` = explicit `null`, `.some(value)` = set.
    func decodeClearable<T: Decodable>(_ type: T.Type, forKey key: Key) throws -> T?? {
        guard contains(key) else { return nil }
        return .some(try decodeIfPresent(type, forKey: key))
    }
}

extension KeyedEncodingContainer {
    mutating func encodeClearable<T: Encodable>(_ value: T??, forKey key: Key) throws {
        guard let value else { return }
        if let inner = value { try encode(inner, forKey: key) } else { try encodeNil(forKey: key) }
    }
}

public struct RoomOwner: Codable, Sendable, Equatable {
    public let uid: String
    public let username: String
    public let displayName: String
    public let bio: String?
    /// Opaque media id for the `mediaRead` thumbnail, or nil.
    public let avatarMediaId: String?
}

public struct RoomStyle: Codable, Sendable, Equatable {
    public let themePreset: String
    public let layout: String
    /// nil follows the preset.
    public let accent: String?
    public let font: String?
    public let decorationPack: String?
    public let sparkles: Bool
}

public struct RoomWidget: Codable, Sendable, Equatable {
    public var type: String
    public var placement: String
    public var position: Int
    public var enabled: Bool

    public init(type: String, placement: String, position: Int, enabled: Bool) {
        self.type = type
        self.placement = placement
        self.position = position
        self.enabled = enabled
    }
}

/// A link card for an `https://` music page. Open it externally; never embed or autoplay.
public struct RoomMusic: Codable, Sendable, Equatable {
    public let url: String
    public let title: String?
    public let artist: String?
}

public struct RoomTopFriends: Codable, Sendable, Equatable {
    /// Owner only.
    public let size: Int?
    public let visibility: String?
    /// nil when the owner hides Top Friends from this viewer.
    public let items: [Person]?
}

public struct Room: Codable, Sendable, Equatable {
    public let owner: RoomOwner
    /// `owner`, `friend` or `member`.
    public let relationship: String
    public let style: RoomStyle
    public let location: String?
    public let currently: String?
    public let music: RoomMusic?
    /// Opaque media id for `mediaRead/{id}/display`, or nil. Never a URL.
    public let bannerMediaId: String?
    public let widgets: [RoomWidget]
    public let topFriends: RoomTopFriends
    /// Owner only.
    public let visibility: String?
    /// Owner only. Send it back as `expectedUpdatedAt`; nil for a never-saved Room.
    public let updatedAt: EpochMillis?
    public let configurationVersion: Int
}

/// Input of `getRoom` and `listRoomPhotos`.
public struct RoomReference: Codable, Sendable, Equatable {
    public var username: String
    public init(username: String) { self.username = username }
}

public struct RoomMusicInput: Codable, Sendable, Equatable {
    public var url: String
    public var title: String?
    public var artist: String?
    public init(url: String, title: String? = nil, artist: String? = nil) {
        self.url = url
        self.title = title
        self.artist = artist
    }
}

/// A partial change. Optional fields: `nil` leaves the setting alone. Fields that can
/// be cleared are `T??`: `.some(nil)` sends an explicit `null`. `expectedUpdatedAt`
/// is always sent (`null` for a never-saved Room); a stale value fails with
/// `failed-precondition` and reason `STALE_WRITE`.
public struct UpdateMyRoomRequest: Codable, Sendable, Equatable {
    public var visibility: String?
    public var themePreset: String?
    public var layout: String?
    public var accent: String??
    public var font: String??
    public var decorationPack: String??
    public var sparkles: Bool?
    public var location: String??
    public var currently: String??
    public var music: RoomMusicInput??
    /// A ready `room_banner` upload of yours; `.some(nil)` removes the banner.
    public var bannerMediaId: String??
    public var expectedUpdatedAt: EpochMillis?

    public init(
        expectedUpdatedAt: EpochMillis?,
        visibility: String? = nil,
        themePreset: String? = nil,
        layout: String? = nil,
        accent: String?? = nil,
        font: String?? = nil,
        decorationPack: String?? = nil,
        sparkles: Bool? = nil,
        location: String?? = nil,
        currently: String?? = nil,
        music: RoomMusicInput?? = nil,
        bannerMediaId: String?? = nil
    ) {
        self.expectedUpdatedAt = expectedUpdatedAt
        self.visibility = visibility
        self.themePreset = themePreset
        self.layout = layout
        self.accent = accent
        self.font = font
        self.decorationPack = decorationPack
        self.sparkles = sparkles
        self.location = location
        self.currently = currently
        self.music = music
        self.bannerMediaId = bannerMediaId
    }

    private enum CodingKeys: String, CodingKey {
        case visibility, themePreset, layout, accent, font, decorationPack, sparkles
        case location, currently, music, bannerMediaId, expectedUpdatedAt
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        themePreset = try c.decodeIfPresent(String.self, forKey: .themePreset)
        layout = try c.decodeIfPresent(String.self, forKey: .layout)
        accent = try c.decodeClearable(String.self, forKey: .accent)
        font = try c.decodeClearable(String.self, forKey: .font)
        decorationPack = try c.decodeClearable(String.self, forKey: .decorationPack)
        sparkles = try c.decodeIfPresent(Bool.self, forKey: .sparkles)
        location = try c.decodeClearable(String.self, forKey: .location)
        currently = try c.decodeClearable(String.self, forKey: .currently)
        music = try c.decodeClearable(RoomMusicInput.self, forKey: .music)
        bannerMediaId = try c.decodeClearable(String.self, forKey: .bannerMediaId)
        expectedUpdatedAt = try c.decodeIfPresent(EpochMillis.self, forKey: .expectedUpdatedAt)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(themePreset, forKey: .themePreset)
        try c.encodeIfPresent(layout, forKey: .layout)
        try c.encodeClearable(accent, forKey: .accent)
        try c.encodeClearable(font, forKey: .font)
        try c.encodeClearable(decorationPack, forKey: .decorationPack)
        try c.encodeIfPresent(sparkles, forKey: .sparkles)
        try c.encodeClearable(location, forKey: .location)
        try c.encodeClearable(currently, forKey: .currently)
        try c.encodeClearable(music, forKey: .music)
        try c.encodeClearable(bannerMediaId, forKey: .bannerMediaId)
        try c.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
    }
}

/// All seven widgets, each type once, positions 0 to 6 each once.
public struct UpdateMyRoomWidgetsRequest: Codable, Sendable, Equatable {
    public var widgets: [RoomWidget]
    public var expectedUpdatedAt: EpochMillis?

    public init(widgets: [RoomWidget], expectedUpdatedAt: EpochMillis?) {
        self.widgets = widgets
        self.expectedUpdatedAt = expectedUpdatedAt
    }

    private enum CodingKeys: String, CodingKey { case widgets, expectedUpdatedAt }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        widgets = try c.decode([RoomWidget].self, forKey: .widgets)
        expectedUpdatedAt = try c.decodeIfPresent(EpochMillis.self, forKey: .expectedUpdatedAt)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(widgets, forKey: .widgets)
        try c.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
    }
}

/// The full list in display order. Every id must be an accepted, unblocked friend.
public struct UpdateMyRoomTopFriendsRequest: Codable, Sendable, Equatable {
    public var userIds: [String]
    /// 4, 8 or 12; at least as many as `userIds`.
    public var size: Int
    public var visibility: String
    public var expectedUpdatedAt: EpochMillis?

    public init(userIds: [String], size: Int, visibility: String, expectedUpdatedAt: EpochMillis?) {
        self.userIds = userIds
        self.size = size
        self.visibility = visibility
        self.expectedUpdatedAt = expectedUpdatedAt
    }

    private enum CodingKeys: String, CodingKey { case userIds, size, visibility, expectedUpdatedAt }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userIds = try c.decode([String].self, forKey: .userIds)
        size = try c.decode(Int.self, forKey: .size)
        visibility = try c.decode(String.self, forKey: .visibility)
        expectedUpdatedAt = try c.decodeIfPresent(EpochMillis.self, forKey: .expectedUpdatedAt)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userIds, forKey: .userIds)
        try c.encode(size, forKey: .size)
        try c.encode(visibility, forKey: .visibility)
        try c.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
    }
}

/// Where a Room photo came from.
public enum RoomPhotoSource: Codable, Sendable, Equatable {
    case post(postId: String)
    case lifeUpdate(lifeUpdateId: String, boxId: String)
    /// A source kind newer than this client; skip the photo.
    case unsupported(kind: String)

    private enum CodingKeys: String, CodingKey { case kind, postId, lifeUpdateId, boxId }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "post":
            self = .post(postId: try c.decode(String.self, forKey: .postId))
        case "life_update":
            self = .lifeUpdate(
                lifeUpdateId: try c.decode(String.self, forKey: .lifeUpdateId),
                boxId: try c.decode(String.self, forKey: .boxId))
        default:
            self = .unsupported(kind: kind)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .post(let postId):
            try c.encode("post", forKey: .kind)
            try c.encode(postId, forKey: .postId)
        case .lifeUpdate(let lifeUpdateId, let boxId):
            try c.encode("life_update", forKey: .kind)
            try c.encode(lifeUpdateId, forKey: .lifeUpdateId)
            try c.encode(boxId, forKey: .boxId)
        case .unsupported(let kind):
            try c.encode(kind, forKey: .kind)
        }
    }
}

/// A ready photo. Render it with `mediaRead/{mediaAssetId}/thumbnail`.
public struct RoomPhoto: Codable, Sendable, Equatable {
    public let mediaAssetId: String
    public let width: Int
    public let height: Int
    public let source: RoomPhotoSource
    public let occurredAt: EpochMillis
}
