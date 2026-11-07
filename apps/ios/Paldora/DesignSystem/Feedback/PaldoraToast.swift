import PaldoraKit
import SwiftUI

/// Figma "Toast". Action: bottom, inverse, for your own actions. Notification:
/// top, surface, for activity. Presentational; the host places and times it,
/// and posts `announcement` to VoiceOver when it appears.
struct PaldoraToast<Avatar: View>: View {
    enum Kind {
        case action(message: String, actionTitle: String?, onAction: () -> Void)
        case notification(title: String, subtitle: String)
    }

    let kind: Kind
    @ViewBuilder var avatar: Avatar

    /// What VoiceOver should announce when the toast appears.
    var announcement: String {
        switch kind {
        case .action(let message, _, _): message
        case .notification(let title, let subtitle): "\(title). \(subtitle)"
        }
    }

    var body: some View {
        switch kind {
        case .action(let message, let actionTitle, let onAction):
            HStack(spacing: 10) {
                PaldoraIconView(.check, size: 18).foregroundStyle(Theme.textOnInverse)
                Text(message).paldoraText(.ui14Medium).foregroundStyle(Theme.textOnInverse)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let actionTitle {
                    Button(action: onAction) {
                        Text(actionTitle).paldoraText(.ui14SemiBold).foregroundStyle(Theme.brass)
                            .paldoraHitTarget()
                    }
                    .buttonStyle(PaldoraPressableStyle())
                }
            }
            .padding(.horizontal, Theme.space4)
            .padding(.vertical, 14)
            .background(Theme.bgInverse, in: RoundedRectangle(cornerRadius: 18))
            .paldoraElevation(.lift)
        case .notification(let title, let subtitle):
            HStack(spacing: Theme.space3) {
                avatar
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).paldoraText(.ui14).foregroundStyle(Theme.textPrimary)
                    Text(subtitle).paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(Theme.space3)
            .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: 22))
            .paldoraHairline(RoundedRectangle(cornerRadius: 22))
            .paldoraElevation(.lift)
            .accessibilityElement(children: .combine)
        }
    }
}

extension PaldoraToast where Avatar == EmptyView {
    init(kind: Kind) {
        self.kind = kind
        self.avatar = EmptyView()
    }
}

#Preview("Toasts") {
    VStack(spacing: Theme.space3) {
        PaldoraToast(kind: .action(message: "Moment shared with Sunday Supper.", actionTitle: "View", onAction: {}))
        PaldoraToast(kind: .notification(title: "Leah reacted ❤️ to your photo", subtitle: "Sunday Supper · now")) {
            PaldoraAvatar(name: "Leah Hartmann", size: 40)
        }
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
