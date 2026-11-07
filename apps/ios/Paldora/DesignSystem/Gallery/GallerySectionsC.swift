#if DEBUG
import SwiftUI

struct GalleryCards: View {
    private let photoPost = PaldoraPostCardContent(
        authorName: "Leah Hartmann", context: "Sunday Supper · 2h", caption: "Third Sunday in a row. Same table, new soup.",
        reactionCount: 12, commentCount: 4, audience: "Only this Box")
    private let textPost = PaldoraPostCardContent(
        authorName: "Leah Hartmann", context: "Sunday Supper · 2h",
        caption: "Who’s taking the leftover soup? I have containers and no shame.",
        reactionCount: 12, commentCount: 4, audience: "Only this Box")

    var body: some View {
        GalleryBlock(title: "Post card", node: "44:55") {
            PaldoraPostCard(content: photoPost, onReact: {}, onComment: {}, media: {
                GalleryPhoto().frame(height: PaldoraPostCard<EmptyView, EmptyView>.mediaHeight)
            }, menu: { PaldoraIconButton(icon: .more, label: "More", style: .plain) {} })
            PaldoraPostCard(content: textPost, onReact: {}, onComment: {}, media: { EmptyView() },
                            menu: { PaldoraIconButton(icon: .more, label: "More", style: .plain) {} })
        }
        GalleryBlock(title: "Life Update card", node: "44:74") {
            PaldoraLifeUpdateCard(
                content: .init(timeLabel: "Yesterday", headline: "Jonah moved to Berlin.",
                               quote: "“New flat, old couch. Come visit.”", actionTitle: "Send a warm note"),
                onAction: {}, photo: { GalleryPhoto() })
        }
        GalleryBlock(title: "Box card", node: "44:93") {
            PaldoraBoxCard(content: .init(name: "Sunday Supper", subtitle: "11 members · weekly", newCount: 3,
                                          members: GallerySample.members)) { GalleryPhoto() }
        }
    }
}

struct GalleryThreads: View {
    var body: some View {
        GalleryBlock(title: "Comment", node: "44:122") {
            PaldoraComment(content: .init(authorName: "Jonah", timeLabel: "2h", text: "The bread was a peace offering."))
            PaldoraComment(content: .init(kind: .reply, authorName: "Leah", timeLabel: "2h", text: "The bread was a peace offering."))
            PaldoraComment(content: .deleted(authorName: "Jonah", timeLabel: "2h"))
        }
        GalleryBlock(title: "Notification row", node: "44:140") {
            PaldoraNotificationRow(
                content: .init(actorName: "Leah", message: "loved your photo in Sunday Supper.", timeLabel: "12 min", isUnread: true),
                action: {}, thumbnail: { GalleryPhoto() })
            PaldoraNotificationRow(
                content: .init(actorName: "Leah", message: "loved your photo in Sunday Supper.", timeLabel: "12 min"),
                action: {}, thumbnail: { GalleryPhoto() })
        }
    }
}

struct GalleryOverlays: View {
    @State private var showSheet = false
    @Binding var showDialog: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space6) {
            GalleryBlock(title: "Overlays", node: "44:247") {
                FlowLayout {
                    PaldoraButton("Show bottom sheet", kind: .secondary, size: .medium) { showSheet = true }
                    PaldoraButton("Show dialog", kind: .secondary, size: .medium) { showDialog = true }
                }
                PaldoraEyebrow("Bottom sheet")
                PaldoraBottomSheetContent(title: "Sheet title") { sheetRows }
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: Theme.radiusSheet, topTrailingRadius: Theme.radiusSheet))
                PaldoraEyebrow("Dialog")
                PaldoraDialogCard(icon: .ban, title: "Block Leah?",
                                  message: "Explain the consequence in one or two plain sentences.",
                                  confirmTitle: "Block", onConfirm: {}, onCancel: {})
            }
        }
        .paldoraBottomSheet(isPresented: $showSheet, title: "Sheet title") { sheetRows }
    }

    private var sheetRows: some View {
        PaldoraListGroup {
            PaldoraListRow(title: "Action", icon: .room) {}
            PaldoraListDivider()
            PaldoraListRow(title: "Report", icon: .flag, trailing: .none, isDestructive: true) {}
        }
    }
}
#endif
