#if DEBUG
import SwiftUI

/// A titled group in the gallery, labelled with the Figma component and node id.
struct GalleryBlock<Content: View>: View {
    let title: String
    var node: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).paldoraText(.titleS).foregroundStyle(Theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                if let node { Text("Figma \(node)").paldoraText(.caption).foregroundStyle(Theme.textSecondary) }
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .id(title)
    }
}

/// A stand-in photo built from tokens (no fake network data).
struct GalleryPhoto: View {
    var body: some View {
        LinearGradient(colors: [Theme.brassSoft, Theme.emberSoft], startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay(PaldoraIconView(.image, size: 32).foregroundStyle(Theme.textSecondary))
            .accessibilityHidden(true)
    }
}

/// Fixed sample strings from the Figma frames.
enum GallerySample {
    static let members: [PaldoraAvatarStack.Member] = [
        .init(id: "1", name: "Leah Hartmann"), .init(id: "2", name: "Jonah Weiss"), .init(id: "3", name: "Maya Ortiz"),
    ]
}
#endif
