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
