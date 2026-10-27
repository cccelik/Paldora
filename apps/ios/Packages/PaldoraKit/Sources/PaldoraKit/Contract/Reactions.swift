import Foundation

/// `kind == nil` clears the caller's reaction and is sent as an explicit
/// `null` (the key may not be omitted). `kind == "real"` is a camera reaction
/// and needs `mediaAssetId`; an emoji reaction must not carry one, and a camera
/// reaction cannot target a comment.
public struct SetBoxReactionRequest: Codable, Sendable, Equatable {
    public static let realKind = "real"

    public var boxId: String
    public var postId: String
    public var commentId: String?
    public var mediaAssetId: String?
    public var kind: String?

    public init(
        boxId: String,
        postId: String,
        commentId: String? = nil,
        mediaAssetId: String? = nil,
        kind: String?
    ) {
        self.boxId = boxId
        self.postId = postId
        self.commentId = commentId
        self.mediaAssetId = mediaAssetId
        self.kind = kind
    }

    private enum CodingKeys: String, CodingKey {
        case boxId, postId, commentId, mediaAssetId, kind
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        boxId = try c.decode(String.self, forKey: .boxId)
        postId = try c.decode(String.self, forKey: .postId)
        commentId = try c.decodeIfPresent(String.self, forKey: .commentId)
        mediaAssetId = try c.decodeIfPresent(String.self, forKey: .mediaAssetId)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(boxId, forKey: .boxId)
        try c.encode(postId, forKey: .postId)
        try c.encodeIfPresent(commentId, forKey: .commentId)
        try c.encodeIfPresent(mediaAssetId, forKey: .mediaAssetId)
        if let kind { try c.encode(kind, forKey: .kind) } else { try c.encodeNil(forKey: .kind) }
    }
}

public struct ListBoxReactionsRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var commentId: String?
    public var cursor: String?
    public init(boxId: String, postId: String, commentId: String? = nil, cursor: String? = nil) {
        self.boxId = boxId
        self.postId = postId
        self.commentId = commentId
        self.cursor = cursor
    }
}

public struct BoxReaction: Codable, Sendable, Equatable {
    public let uid: String
    public let kind: String
}
