import PaldoraKit
import SwiftUI

/// What a feed card shows. Features map their DTO to this; the card never sees a
/// network type.
struct PaldoraPostCardContent {
    var authorName: String
    var avatarMediaId: String?
    /// "Sunday Supper · 2h".
    var context: String
    var caption: String
    var reactionCount = 0
    var commentCount = 0
    /// "Only this Box": where the post is visible.
    var audience: String?
}

/// Figma "Post card": header (avatar, name, Box · time, menu) → media slot
/// (radius 20, photos or none) → caption in Title/S → reaction row. The media and
/// menu are slots so features supply `RemoteImage` grids and `OverflowMenu`.
struct PaldoraPostCard<Media: View, Menu: View>: View {
    let content: PaldoraPostCardContent
    var onReact: (() -> Void)?
    var onComment: (() -> Void)?
    @ViewBuilder var media: Media
    @ViewBuilder var menu: Menu

    static var radius: CGFloat { PaldoraTokens.radiusXl }
    static var mediaHeight: CGFloat { 240 }
    static var mediaRadius: CGFloat { 20 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            media
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Self.mediaRadius))
            VStack(alignment: .leading, spacing: Theme.space3) {
                Text(content.caption).paldoraText(.titleS).foregroundStyle(Theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                reactions
            }
            .padding(.horizontal, 10)
            .padding(.top, 14)
            .padding(.bottom, 6)
        }
        .padding(Theme.space2)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius))
        .paldoraElevation(.soft)
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(spacing: 10) {
            PaldoraAvatar(name: content.authorName, size: 38, mediaId: content.avatarMediaId)
            VStack(alignment: .leading, spacing: 0) {
                Text(content.authorName).paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                Text(content.context).paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: Theme.space2)
            menu
        }
        .padding(.horizontal, Theme.space2)
        .padding(.top, Theme.space2)
        .padding(.bottom, Theme.space3)
    }

    private var reactions: some View {
        AdaptiveStack(spacing: Theme.space2) {
            PaldoraChip(title: "\(content.reactionCount)", style: .accent, leading: .icon(.heart), action: onReact)
                .accessibilityLabel("\(content.reactionCount) reactions")
            PaldoraChip(title: "\(content.commentCount)", style: .standard, leading: .icon(.chat), action: onComment)
                .accessibilityLabel("\(content.commentCount) comments")
            if let audience = content.audience {
                Spacer(minLength: Theme.space2)
                HStack(spacing: 6) {
                    PaldoraIconView(.lock, size: 14)
                    Text(audience).paldoraText(.labelS)
                }
                .foregroundStyle(Theme.textSecondary)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

extension PaldoraPostCard where Menu == EmptyView {
    init(content: PaldoraPostCardContent, onReact: (() -> Void)? = nil, onComment: (() -> Void)? = nil,
         @ViewBuilder media: () -> Media) {
        self.init(content: content, onReact: onReact, onComment: onComment, media: media, menu: { EmptyView() })
    }
}

#Preview("Post card") {
    PaldoraPostCard(
        content: .init(authorName: "Leah Hartmann", context: "Sunday Supper · 2h",
                       caption: "Third Sunday in a row. Same table, new soup.",
                       reactionCount: 12, commentCount: 4, audience: "Only this Box"),
        media: { Theme.brassSoft.frame(height: PaldoraPostCard<EmptyView, EmptyView>.mediaHeight) },
        menu: { PaldoraIconView(.more, size: 22).foregroundStyle(Theme.textSecondary) }
    )
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
