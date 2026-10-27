import Foundation
import Observation
import PaldoraKit

enum ReportCopy {
    static let received = "Report received. Thank you for letting us know."
    static let duplicate = "You have already reported this item."

    static func label(_ category: ReportCategory) -> String {
        switch category {
        case .harassment: "Harassment"
        case .spam: "Spam"
        case .privacy: "Privacy"
        case .other: "Something else"
        }
    }

    static func categoryLabel(_ raw: String) -> String {
        ReportCategory(rawValue: raw).map(label) ?? raw.capitalized
    }

    static func kind(_ raw: String) -> String { raw == "user" ? "Person" : raw.capitalized }
}

/// Report a comment: a category and optional detail.
@MainActor
@Observable
final class ReportCommentViewModel {
    static let detailLimit = 2_000

    var category: ReportCategory?
    var detail = ""
    private(set) var error: String?
    private(set) var isSending = false
    private(set) var sent = false
    private let env: FeatureEnvironment
    private let commentId: String

    init(env: FeatureEnvironment, commentId: String) {
        self.env = env
        self.commentId = commentId
    }

    var canSend: Bool { category != nil && !isSending && !sent && detail.count <= Self.detailLimit }

    func send() async {
        guard canSend, let category else { return }
        isSending = true
        error = nil
        defer { isSending = false }
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await env.api.reportBoxComment(ReportBoxCommentRequest(
                commentId: commentId, category: category, detail: trimmed.isEmpty ? nil : trimmed))
            sent = true
        } catch {
            if let failure = error as? PaldoraFailure, failure.error == .alreadyExists {
                self.error = ReportCopy.duplicate
            } else if FeatureEnvironment.isAbsent(error) {
                self.error = "That comment isn't available anymore."
            } else {
                self.error = env.message(for: error)
            }
        }
    }
}

@MainActor
func makeMyReports(env: FeatureEnvironment) -> PagedList<ReportReceipt> {
    let api = env.api
    return PagedList(env: env) { cursor in
        let page = try await api.listMyReports(cursor: cursor)
        return (page.items, page.nextCursor)
    }
}

@MainActor
func makeNotices(env: FeatureEnvironment) -> PagedList<ModerationNotice> {
    let api = env.api
    return PagedList(env: env) { _ in (try await api.listMyModerationNotices(), nil) }
}
