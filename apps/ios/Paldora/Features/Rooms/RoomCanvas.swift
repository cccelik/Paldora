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

    @ViewBuilder private var banner: some View {
        if let id = room.bannerMediaId {
            RemoteImage(assetId: id, variant: .display)
                .frame(height: 160).frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .accessibilityLabel("Room banner")
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: Theme.space3) {
            AvatarView(mediaId: room.owner.avatarMediaId, name: room.owner.displayName, size: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text(room.owner.displayName).font(look.font(.title2, weight: .semibold)).foregroundStyle(look.text)
                    .accessibilityAddTraits(.isHeader).accessibilityIdentifier("room-owner-name")
                Text("@\(room.owner.username)").font(look.font(.footnote)).foregroundStyle(look.muted)
                if let bio = room.owner.bio, !bio.isEmpty {
                    Text(bio).font(look.font(.body)).foregroundStyle(look.text)
                }
                if let location = room.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse").font(look.font(.footnote)).foregroundStyle(look.muted)
                }
            }
            Spacer(minLength: 0)
            RoomDecoration(appearance: look)
        }
    }
}
