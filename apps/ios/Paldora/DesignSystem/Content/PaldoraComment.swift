import PaldoraKit
import SwiftUI

struct PaldoraCommentContent {
    enum Kind: Equatable { case root, reply, deleted }

    var kind: Kind = .root
    var authorName: String
    var avatarMediaId: String?
    /// "2h".
    var timeLabel: String
    var text: String

    /// A deleted comment keeps the thread shape with neutral copy.
    /// Pass the author's name when the screen still shows who it was (Figma keeps the avatar).
    static func deleted(authorName: String = "", timeLabel: String) -> PaldoraCommentContent {
        .init(kind: .deleted, authorName: authorName, timeLabel: timeLabel, text: "Removed by its author.")
    }
}

/// Figma "Comment": one reply level. A root sits on a sunken bubble, a reply is
/// indented 44 pt on surface, a deleted comment is a dashed outline with neutral
/// copy. `footer` holds the actions (Reply, reactions) below the bubble.
struct PaldoraComment<Footer: View>: View {
    let content: PaldoraCommentContent
    @ViewBuilder var footer: Footer

    static var bubbleRadius: CGFloat { 18 }
    static var replyIndent: CGFloat { 44 }

    private var isReply: Bool { content.kind == .reply }
    private var isDeleted: Bool { content.kind == .deleted }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if isDeleted && content.authorName.isEmpty {
                Circle().fill(Theme.bgSunken).frame(width: 34, height: 34).accessibilityHidden(true)
            } else {
                PaldoraAvatar(name: content.authorName, size: isReply ? 28 : 34, mediaId: content.avatarMediaId)
            }
            VStack(alignment: .leading, spacing: Theme.space1) {
                bubble
                footer
            }
        }
        .padding(.leading, isReply ? Self.replyIndent : 0)
        .accessibilityElement(children: .contain)
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(isDeleted ? "Comment deleted" : content.authorName)
                    .paldoraText(.ui13SemiBold)
                    .foregroundStyle(isDeleted ? Theme.textSecondary : Theme.textPrimary)
                Text(content.timeLabel).paldoraText(.ui12Medium).fontWeight(.regular).foregroundStyle(Theme.textSecondary)
            }
            Text(content.text).paldoraText(.ui14)
                .foregroundStyle(isDeleted ? Theme.textSecondary : Theme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isDeleted ? Theme.bgCanvas : (isReply ? Theme.bgSurface : Theme.bgSunken),
                    in: RoundedRectangle(cornerRadius: Self.bubbleRadius))
        .overlay {
            if isDeleted {
                RoundedRectangle(cornerRadius: Self.bubbleRadius)
                    .strokeBorder(Theme.borderHairline, style: StrokeStyle(lineWidth: PaldoraTokens.borderWidthHairline, dash: [4, 3]))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension PaldoraComment where Footer == EmptyView {
    init(content: PaldoraCommentContent) {
        self.init(content: content, footer: { EmptyView() })
    }
}

#Preview("Comments") {
    VStack(spacing: Theme.space3) {
        PaldoraComment(content: .init(authorName: "Jonah", timeLabel: "2h", text: "The bread was a peace offering."))
        PaldoraComment(content: .init(kind: .reply, authorName: "Leah", timeLabel: "2h", text: "The bread was a peace offering."))
        PaldoraComment(content: .deleted(timeLabel: "2h"))
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
