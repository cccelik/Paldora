import PaldoraKit
import SwiftUI

/// One feed row. Media is opaque ids until the Storage design lands, so photos
/// show only as a labelled placeholder.
struct FeedItemCard: View {
    let item: FeedItem
    let boxName: String?

    var body: some View {
        switch item {
        case .post(let post):
            card(author: post.authorName, time: post.createdAt, media: post.mediaAssetIds.count,
                 summary: post.interactions, edited: post.edited) {
                Text(post.text).font(Typography.body).foregroundStyle(Theme.text)
            }
        case .lifeUpdate(let update):
            card(author: update.authorName, time: update.createdAt, media: update.mediaAssetIds.count,
                 summary: update.interactions, edited: false, tag: "Life update") {
                VStack(alignment: .leading, spacing: Theme.space2) {
                    ForEach(update.sections.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Formatting.sectionTitle(update.sections[index].key))
                                .font(Typography.label).foregroundStyle(Theme.goldText)
                            Text(update.sections[index].content).font(Typography.body).foregroundStyle(Theme.text)
                        }
                    }
                }
            }
        case .unsupported:
            Text("This kind of update isn't supported in this version of Paldora.")
                .font(Typography.callout).foregroundStyle(Theme.textMuted)
                .paldoraCard()
        }
    }

    private func card<Body: View>(
        author: String, time: EpochMillis, media: Int, summary: InteractionSummary,
        edited: Bool, tag: String? = nil, @ViewBuilder body: () -> Body
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(author).font(Typography.headline).foregroundStyle(Theme.text)
                Text([boxName ?? "Box", tag, Formatting.relativeTime(time), edited ? "edited" : nil]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
            body()
            if media > 0 {
                Label(Formatting.countLabel(media, singular: "photo", plural: "photos"), systemImage: "photo")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
            }
            Text("\(Formatting.countLabel(summary.commentCount, singular: "comment", plural: "comments")) · "
                 + Formatting.countLabel(summary.reactionCount, singular: "reaction", plural: "reactions"))
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
        .paldoraCard()
        .accessibilityElement(children: .combine)
    }
}
