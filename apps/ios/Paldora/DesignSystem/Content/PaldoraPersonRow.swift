import PaldoraKit
import SwiftUI

/// A person in a list (friends, requests, members, blocked): avatar, name, a
/// secondary line and a trailing slot for a button or a menu. Sits on a surface card
/// (radius 18) like `PaldoraNotificationRow`. Wrap it in a `NavigationLink` for a
/// tappable row; the trailing slot stays its own control.
struct PaldoraPersonRow<Trailing: View>: View {
    let name: String
    var subtitle: String?
    var mediaId: String?
    var ring: PaldoraAvatarRing = .none
    @ViewBuilder var trailing: Trailing

    static var radius: CGFloat { 18 }

    var body: some View {
        AdaptiveStack(spacing: Theme.space3) {
            HStack(spacing: Theme.space3) {
                PaldoraAvatar(name: name, size: .medium, ring: ring, mediaId: mediaId)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                    if let subtitle {
                        Text(subtitle).paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            trailing
        }
        .padding(Theme.space3)
        .frame(minHeight: 62)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius))
    }
}

extension PaldoraPersonRow where Trailing == EmptyView {
    init(name: String, subtitle: String? = nil, mediaId: String? = nil, ring: PaldoraAvatarRing = .none) {
        self.init(name: name, subtitle: subtitle, mediaId: mediaId, ring: ring, trailing: { EmptyView() })
    }
}

#Preview("Person rows") {
    VStack(spacing: Theme.space3) {
        PaldoraPersonRow(name: "Leah Hartmann", subtitle: "@leah.h") {
            PaldoraButton("Accept", kind: .secondary, size: .small) {}
        }
        PaldoraPersonRow(name: "Jonah Weiss", subtitle: "@jonah")
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
