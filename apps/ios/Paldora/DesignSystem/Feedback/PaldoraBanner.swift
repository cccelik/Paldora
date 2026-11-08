import PaldoraKit
import SwiftUI

/// Figma "Banner": inline notice, Info / Success / Warning / Danger. Never for
/// errors that block a form (use the field's error). Tone is carried by the icon
/// and a spoken prefix as well as color.
struct PaldoraBanner: View {
    let tone: PaldoraTone
    let title: String
    var message: String?
    /// Replaces the tone's default icon (Figma's archived banner uses the archive box).
    var icon: PaldoraIcon?

    private static var radius: CGFloat { 18 }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            PaldoraIconView(icon ?? tone.icon, size: 18).foregroundStyle(tone.iconColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).paldoraText(.ui14Medium).foregroundStyle(tone.titleColor)
                if let message {
                    Text(message).paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(tone.background, in: RoundedRectangle(cornerRadius: Self.radius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenText)
    }

    var spokenText: String {
        [tone.spokenPrefix, title, message].compactMap { $0 }.joined(separator: ". ")
    }
}

#Preview("Banners") {
    VStack(spacing: Theme.space3) {
        PaldoraBanner(tone: .info, title: "Good to know", message: "Unblocking doesn’t restore a friendship.")
        PaldoraBanner(tone: .success, title: "Saved", message: "Your Room is up to date.")
        PaldoraBanner(tone: .warning, title: "This Box is archived", message: "Nobody can post or comment.")
        PaldoraBanner(tone: .danger, title: "Photo failed", message: "One photo couldn’t be processed.")
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
