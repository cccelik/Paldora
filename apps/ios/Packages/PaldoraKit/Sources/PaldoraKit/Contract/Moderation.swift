import Foundation

public struct ReportBoxPostRequest: Codable, Sendable, Equatable {
    public var boxId: String
    public var postId: String
    public var reason: String
    public init(boxId: String, postId: String, reason: String) {
        self.boxId = boxId
        self.postId = postId
        self.reason = reason
    }
}

public struct ReportBoxPostResponse: Codable, Sendable, Equatable {
    public let reportId: String
}

public struct ModerationReport: Codable, Sendable, Equatable {
    public let id: String
    public let boxId: String
    public let postId: String
    public let reporterUid: String
    public let reason: String
    public let createdAt: EpochMillis
    public let status: String
}

public struct HideReportedPostRequest: Codable, Sendable, Equatable {
    public var reportId: String
    public init(reportId: String) { self.reportId = reportId }
}

/// Report categories the server accepts.
public enum ReportCategory: String, Codable, CaseIterable, Sendable {
    case harassment, spam, privacy, other
}

public struct ReportBoxCommentRequest: Codable, Sendable, Equatable {
    public var commentId: String
    public var category: ReportCategory
    /// Up to 2,000 characters; nil is encoded as an explicit `null`.
    public var detail: String?
    public init(commentId: String, category: ReportCategory, detail: String? = nil) {
        self.commentId = commentId
        self.category = category
        self.detail = detail
    }
    private enum CodingKeys: String, CodingKey { case commentId, category, detail }
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(commentId, forKey: .commentId)
        try container.encode(category, forKey: .category)
        try container.encode(detail, forKey: .detail)
    }
}

public struct ReportBoxCommentResponse: Codable, Sendable, Equatable {
    public let reportId: String
}

/// The reporter's own receipt. `targetKind` is `user`, `box`, `post` or `comment`;
/// `status` is `open` or `closed`.
public struct ReportReceipt: Codable, Sendable, Equatable {
    public let id: String
    public let targetKind: String
    public let targetId: String
    public let category: String
    public let status: String
    public let createdAt: EpochMillis
}

/// Content of yours that moderation hid. `targetKind` is `post` or `comment`.
public struct ModerationNotice: Codable, Sendable, Equatable {
    public let targetKind: String
    public let targetId: String
    public let originalCreatedAt: EpochMillis
}

public struct ModerationNoticesResponse: Codable, Sendable, Equatable {
    public let items: [ModerationNotice]
}
