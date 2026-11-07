import PaldoraKit
import SwiftUI

struct PaldoraLifeUpdateCardContent {
    /// "Life update".
    var eyebrow = "Life update"
    /// "Yesterday".
    var timeLabel: String
    var headline: String
    var quote: String?
    /// "Send a warm note".
    var actionTitle: String?
}

/// Figma "Life Update card": always on bg/inverse (dark in both modes), the
/// "special moment" surface. Headline in Fraunces Light, optional photo slot and
/// quote, one brass call to action.
struct PaldoraLifeUpdateCard<Photo: View>: View {
    let content: PaldoraLifeUpdateCardContent
    var onAction: (() -> Void)?
    @ViewBuilder var photo: Photo

    static var radius: CGFloat { PaldoraTokens.radiusXl }
    static var photoSide: CGFloat { 92 }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: Theme.space2) {
                PaldoraIconView(.spark, size: 16).foregroundStyle(Theme.brass)
                PaldoraEyebrow(content.eyebrow, color: Theme.brass)
                Spacer(minLength: Theme.space2)
                Text(content.timeLabel).paldoraText(.caption).foregroundStyle(Theme.textOnInverse)
            }
            Text(content.headline).paldoraText(.lifeUpdateHeadline).foregroundStyle(Theme.textOnInverse)
                .accessibilityAddTraits(.isHeader)
                .frame(maxWidth: .infinity, alignment: .leading)
            if content.quote != nil || Photo.self != EmptyView.self {
                AdaptiveStack(spacing: Theme.space3) {
                    photo
                        .frame(width: Self.photoSide, height: Self.photoSide)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    if let quote = content.quote {
                        Text(quote).paldoraText(.ui14).foregroundStyle(Theme.textOnInverse)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            if let title = content.actionTitle, let onAction {
                PaldoraButton(title, kind: .accent, size: .medium, icon: .heart, fullWidth: true, action: onAction)
            }
        }
        .padding(22)
        .background(Theme.bgInverse, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraElevation(.lift)
        .accessibilityElement(children: .contain)
    }
}

extension PaldoraLifeUpdateCard where Photo == EmptyView {
    init(content: PaldoraLifeUpdateCardContent, onAction: (() -> Void)? = nil) {
        self.init(content: content, onAction: onAction, photo: { EmptyView() })
    }
}

#Preview("Life update") {
    PaldoraLifeUpdateCard(
        content: .init(timeLabel: "Yesterday", headline: "Jonah moved to Berlin.",
                       quote: "“New flat, old couch. Come visit.”", actionTitle: "Send a warm note"),
        onAction: {}, photo: { Theme.brassSoft }
    )
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
