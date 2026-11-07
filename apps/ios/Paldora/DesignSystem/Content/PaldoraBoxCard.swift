import PaldoraKit
import SwiftUI

struct PaldoraBoxCardContent {
    var name: String
    /// "11 members · weekly".
    var subtitle: String
    /// The Box colour dot.
    var color: Color = Theme.brass
    /// Unread count; shown as an "n new" chip when above zero.
    var newCount = 0
    var members: [PaldoraAvatarStack.Member] = []
}

/// Figma "Box card": a 128 pt cover slot, colour dot, name in Title/M, member
/// stack and an "n new" chip when unread. Tapping is the caller's (wrap it in a
/// `NavigationLink` or `Button`).
struct PaldoraBoxCard<Cover: View>: View {
    let content: PaldoraBoxCardContent
    @ViewBuilder var cover: Cover

    static var radius: CGFloat { PaldoraTokens.radiusXl }
    static var coverHeight: CGFloat { 128 }
    static var coverRadius: CGFloat { 22 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cover
                .frame(maxWidth: .infinity)
                .frame(height: Self.coverHeight)
                .clipShape(RoundedRectangle(cornerRadius: Self.coverRadius))
                .overlay(alignment: .topTrailing) {
                    if content.newCount > 0 {
                        PaldoraChip(title: "\(content.newCount) new", style: .accent).padding(Theme.space2)
                    }
                }
            AdaptiveStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: Theme.space2) {
                        Circle().fill(content.color).frame(width: 8, height: 8).accessibilityHidden(true)
                        Text(content.name).paldoraText(.titleM).foregroundStyle(Theme.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                    }
                    Text(content.subtitle).paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !content.members.isEmpty { PaldoraAvatarStack(members: content.members) }
            }
            .padding(.horizontal, 10)
            .padding(.top, 14)
            .padding(.bottom, Theme.space2)
        }
        .padding(Theme.space2)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius))
        .paldoraElevation(.soft)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spokenText)
    }

    var spokenText: String {
        let unread = content.newCount > 0 ? ", \(content.newCount) new" : ""
        return "\(content.name), \(content.subtitle)\(unread)"
    }
}

#Preview("Box card") {
    PaldoraBoxCard(content: .init(name: "Sunday Supper", subtitle: "11 members · weekly", newCount: 3,
                                  members: [.init(id: "1", name: "Leah H"), .init(id: "2", name: "Jonah W"), .init(id: "3", name: "Maya")])) {
        Theme.brassSoft
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
