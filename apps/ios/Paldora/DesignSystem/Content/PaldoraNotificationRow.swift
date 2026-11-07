import PaldoraKit
import SwiftUI

struct PaldoraNotificationRowContent {
    var actorName: String
    var actorMediaId: String?
    /// The sentence after the name: "loved your photo in Sunday Supper."
    var message: String
    /// "12 min".
    var timeLabel: String
    var isUnread = false
}

/// Figma "Notification row": avatar, actor name in SemiBold plus the message, the
/// time, an optional 46 pt thumbnail slot and an ember dot while unread. The row is
/// a button when `action` is set (deep link); unread is spoken, not just drawn.
struct PaldoraNotificationRow<Thumbnail: View>: View {
    let content: PaldoraNotificationRowContent
    var action: (() -> Void)?
    @ViewBuilder var thumbnail: Thumbnail

    static var radius: CGFloat { 18 }
    static var thumbnailSide: CGFloat { 46 }

    var body: some View {
        if let action {
            Button(action: action) { row }.buttonStyle(PaldoraPressableStyle())
        } else {
            row
        }
    }

    private var row: some View {
        HStack(spacing: Theme.space3) {
            PaldoraAvatar(name: content.actorName, size: 42, mediaId: content.actorMediaId)
            VStack(alignment: .leading, spacing: 3) {
                (Text(content.actorName).font(PaldoraFont.Style.ui14SemiBold.font)
                    + Text(" " + content.message).font(PaldoraFont.Style.ui14.font))
                    .foregroundStyle(Theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(content.timeLabel).paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
            thumbnail
                .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
                .clipShape(RoundedRectangle(cornerRadius: Theme.space3))
            if content.isUnread {
                Circle().fill(Theme.ember).frame(width: 8, height: 8).accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Theme.space3)
        .frame(minHeight: PaldoraHitTarget.minimum)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenText)
    }

    var spokenText: String {
        "\(content.isUnread ? "Unread. " : "")\(content.actorName) \(content.message) \(content.timeLabel)"
    }
}

extension PaldoraNotificationRow where Thumbnail == EmptyView {
    init(content: PaldoraNotificationRowContent, action: (() -> Void)? = nil) {
        self.init(content: content, action: action, thumbnail: { EmptyView() })
    }
}

#Preview("Notification rows") {
    VStack(spacing: Theme.space3) {
        PaldoraNotificationRow(content: .init(actorName: "Leah", message: "loved your photo in Sunday Supper.", timeLabel: "12 min", isUnread: true),
                               action: {}, thumbnail: { Theme.brassSoft })
        PaldoraNotificationRow(content: .init(actorName: "Leah", message: "loved your photo in Sunday Supper.", timeLabel: "12 min"),
                               action: {}, thumbnail: { Theme.brassSoft })
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
