import PaldoraKit
import SwiftUI

/// One feed row built from the design-system cards. Media is shown through the
/// authenticated `PhotoStrip`; Life Updates use the inverse Life Update card.
struct FeedItemCard: View {
    let item: FeedItem
    let boxName: String?

    var body: some View {
        switch item {
        case .post(let post):
            PaldoraPostCard(
                content: PaldoraPostCardContent(
                    authorName: post.authorName, avatarMediaId: post.authorAvatarMediaId,
                    context: Self.context(box: boxName, time: post.createdAt, edited: post.edited),
                    caption: post.text, reactionCount: post.interactions.reactionCount,
                    commentCount: post.interactions.commentCount, audience: "Only this Box"),
                media: { PhotoStrip(assetIds: post.mediaAssetIds, interactive: false) })
        case .lifeUpdate(let update):
            PaldoraLifeUpdateCard(content: Self.lifeUpdate(update, boxName: boxName),
                                  photo: { PhotoStrip(assetIds: Array(update.mediaAssetIds.prefix(1)), interactive: false) })
        case .unsupported:
            PaldoraBanner(tone: .info, title: "This kind of update isn't supported in this version of Paldora.")
        }
    }

    static func context(box: String?, time: EpochMillis, edited: Bool) -> String {
        [box ?? "Box", Formatting.relativeTime(time), edited ? "edited" : nil].compactMap { $0 }.joined(separator: " · ")
    }

    static func lifeUpdate(_ update: FeedLifeUpdate, boxName: String?) -> PaldoraLifeUpdateCardContent {
        let first = update.sections.first
        let rest = update.sections.dropFirst().map { "\(Formatting.sectionTitle($0.key)): \($0.content)" }.joined(separator: "\n")
        return PaldoraLifeUpdateCardContent(
            eyebrow: "\(update.authorName) · Life update",
            timeLabel: Formatting.relativeTime(update.createdAt),
            headline: first.map { Self.clipped($0.content, to: 140) } ?? "A Life Update",
            quote: rest.isEmpty ? nil : Self.clipped(rest, to: 220))
    }

    static func clipped(_ text: String, to limit: Int) -> String {
        text.count <= limit ? text : String(text.prefix(limit)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }
}
