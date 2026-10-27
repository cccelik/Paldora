import Foundation

/// Private media (ADR 021 decision 8). Callables reserve, complete and describe
/// an asset; the bytes move through the authenticated HTTP Functions
/// `mediaUpload` (PUT) and `mediaRead` (GET) with the Firebase ID token as a
/// bearer. There is no signed URL, Storage path or download URL.
public enum MediaPurpose {
    public static let avatar = "avatar"
    public static let postImage = "post_image"
    public static let reactionImage = "reaction_image"
    public static let lifeUpdateImage = "life_update_image"
    public static let roomBanner = "room_banner"
}

/// Variants `mediaRead` serves (always `image/webp`).
public enum MediaVariant: String, Sendable, CaseIterable {
    case display, thumbnail
}

public struct MediaAsset: Codable, Sendable, Equatable {
    public let id: String
    public let purpose: String
    /// `pending`, `processing`, `ready`, `failed` or `deleted`.
    public let status: String
    public let contentType: String
    public let contentLength: Int
    public let createdAt: EpochMillis
}

/// `boxId` is required for Box-scoped purposes (`post_image`,
/// `reaction_image`) and forbidden otherwise.
public struct CreateMediaUploadRequest: Codable, Sendable, Equatable {
    public var purpose: String
    public var boxId: String?
    public var contentType: String
    public var contentLength: Int
    public init(purpose: String, boxId: String? = nil, contentType: String, contentLength: Int) {
        self.purpose = purpose
        self.boxId = boxId
        self.contentType = contentType
        self.contentLength = contentLength
    }
}

public struct MediaUploadInstructions: Codable, Sendable, Equatable {
    public struct Headers: Codable, Sendable, Equatable {
        public let contentType: String
        private enum CodingKeys: String, CodingKey { case contentType = "Content-Type" }
    }
    /// Always `PUT`.
    public let method: String
    /// The HTTP Function name, `mediaUpload`.
    public let function: String
    /// Appended to the Function's URL: `/{assetId}`.
    public let path: String
    public let headers: Headers
    public let expiresAt: EpochMillis
}

public struct CreateMediaUploadResponse: Codable, Sendable, Equatable {
    public let mediaAsset: MediaAsset
    public let upload: MediaUploadInstructions
}

/// Input of `completeMediaUpload` and `getMediaAsset`.
public struct MediaAssetReference: Codable, Sendable, Equatable {
    public var assetId: String
    public init(assetId: String) { self.assetId = assetId }
}

public struct MediaAssetDetails: Codable, Sendable, Equatable {
    public let id: String
    public let purpose: String
    public let status: String
    public let contentType: String
    public let contentLength: Int
    public let createdAt: EpochMillis
    public let available: Bool
    /// Master derivative dimensions; `nil` until the asset is ready.
    public let width: Int?
    public let height: Int?
}
