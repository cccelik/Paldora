import PaldoraKit
import SwiftUI

/// The themed Room surface. Everything inside uses the Room's own colors and
/// font; nothing here carries account or privacy actions.
struct RoomCanvas: View {
    let room: Room
    let model: RoomViewModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var look: RoomAppearance { RoomAppearance(style: room.style) }
    private var twoColumns: Bool { room.style.layout == "two_column" && sizeClass == .regular }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            banner
            header
            if twoColumns {
                HStack(alignment: .top, spacing: Theme.space4) {
                    column("main").frame(maxWidth: .infinity, alignment: .topLeading)
                    column("sidebar").frame(width: 320, alignment: .topLeading)
                }
            } else {
                VStack(alignment: .leading, spacing: Theme.space4) {
                    ForEach(model.widgets, id: \.type) { widget in
                        RoomWidgetView(widget: widget, room: room, model: model, look: look)
                    }
                }
            }
            if model.widgets.isEmpty {
                Text("Nothing is switched on in this Room.").font(look.font(.callout)).foregroundStyle(look.muted)
            }
        }
        .padding(Theme.space4)
        .frame(maxWidth: twoColumns ? Theme.contentWidth : Theme.readingWidth, alignment: .leading)
        .frame(maxWidth: .infinity)
        .background(look.canvas)
        .environment(\.colorScheme, look.colorScheme)
        .accessibilityIdentifier("room-canvas")
    }

    private func column(_ placement: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            ForEach(model.widgets.filter { $0.placement == placement }, id: \.type) { widget in
                RoomWidgetView(widget: widget, room: room, model: model, look: look)
            }
        }
    }

    /// "@name · Place", as in the Figma template.
    private var handleLine: String {
        let handle = "@\(room.owner.username)"
        guard let location = room.location, !location.isEmpty else { return handle }
        return "\(handle) · \(location)"
    }

    @ViewBuilder private var banner: some View {
        if let id = room.bannerMediaId {
            RemoteImage(assetId: id, variant: .display)
                .frame(height: 110).frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusLg))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusLg).stroke(look.border, lineWidth: 1))
                .accessibilityLabel("Room banner")
        }
    }

    private var header: some View {
        AdaptiveStack(alignment: .top) {
            // Figma: 72 pt photo ringed in the accent (a graphic mark), name, then handle.
            PaldoraAvatar(name: room.owner.displayName, size: 72, ring: .color(look.accentColor), mediaId: room.owner.avatarMediaId)
                .roomPalette(fill: look.surface, text: look.text)
            VStack(alignment: .leading, spacing: 4) {
                Text(room.owner.displayName).font(look.font(.title, weight: .light)).foregroundStyle(look.text)
                    .accessibilityAddTraits(.isHeader).accessibilityIdentifier("room-owner-name")
                Text(handleLine).font(look.font(.footnote)).foregroundStyle(look.muted)
                if let bio = room.owner.bio, !bio.isEmpty {
                    Text(bio).font(look.font(.body)).foregroundStyle(look.text)
                }
            }
            Spacer(minLength: 0)
            RoomDecoration(appearance: look)
        }
    }
}
