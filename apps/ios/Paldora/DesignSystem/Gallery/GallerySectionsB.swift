#if DEBUG
import SwiftUI

struct GalleryFeedback: View {
    var body: some View {
        GalleryBlock(title: "Banner", node: "43:280") {
            PaldoraBanner(tone: .info, title: "Good to know", message: "Unblocking doesn’t restore a friendship.")
            PaldoraBanner(tone: .success, title: "Saved", message: "Your Room is up to date.")
            PaldoraBanner(tone: .warning, title: "This Box is archived", message: "Nobody can post or comment.")
            PaldoraBanner(tone: .danger, title: "Photo failed", message: "One photo couldn’t be processed.")
        }
        GalleryBlock(title: "Toast", node: "43:296") {
            PaldoraToast(kind: .action(message: "Moment shared with Sunday Supper.", actionTitle: "View", onAction: {}))
            PaldoraToast(kind: .notification(title: "Leah reacted ❤️ to your photo", subtitle: "Sunday Supper · now")) {
                PaldoraAvatar(name: "Leah Hartmann", size: .medium)
            }
        }
        GalleryBlock(title: "Skeleton", node: "44:212") { PaldoraPostSkeleton() }
    }
}

struct GalleryNavigation: View {
    @State private var tab = PaldoraTab.home

    var body: some View {
        GalleryBlock(title: "Nav bar", node: "44:200") {
            PaldoraNavBar(title: "Title", leading: .back {}, trailing: .more {})
            PaldoraNavBar(title: "Title", leading: .close {}, trailing: .more {})
            PaldoraNavBar(title: "Title", leading: .back {}, trailing: .action(title: "Save") {})
        }
        GalleryBlock(title: "Tab bar", node: "21:108") {
            PaldoraTabBar(selection: $tab, badges: [.notifications: 3])
            ForEach(PaldoraTab.allCases.filter { $0 != tab }, id: \.self) { other in
                PaldoraTabBar(selection: .constant(other))
            }
        }
    }
}

struct GalleryAvatars: View {
    var body: some View {
        GalleryBlock(title: "Avatar", node: "43:245") {
            FlowLayout(spacing: Theme.space3) {
                ForEach(PaldoraAvatarSize.allCases, id: \.self) { PaldoraAvatar(name: "Jonah Weiss", size: $0) }
                PaldoraAvatar(name: "Leah Hartmann", size: .large, ring: .brass)
                PaldoraAvatar(name: "Maya Ortiz", size: .large)
                PaldoraAvatarStack(members: GallerySample.members)
            }
        }
        GalleryBlock(title: "Upload tile", node: "44:166") {
            FlowLayout(spacing: Theme.space3) {
                PaldoraUploadTile(state: .done, thumbnail: { GalleryPhoto() })
                PaldoraUploadTile(state: .uploading(progress: 0.64), thumbnail: { GalleryPhoto() })
                PaldoraUploadTile(state: .processing, thumbnail: { GalleryPhoto() })
                PaldoraUploadTile(state: .failed, action: {}, thumbnail: { GalleryPhoto() })
                PaldoraUploadTile(state: .add) {}
            }
        }
    }
}
#endif
