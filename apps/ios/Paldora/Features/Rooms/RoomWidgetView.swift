import PaldoraKit
import SwiftUI

/// One Room widget. Each type is bound to one data source (closed registry).
struct RoomWidgetView: View {
    let widget: RoomWidget
    let room: Room
    let model: RoomViewModel
    let look: RoomAppearance

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            Text(RoomRegistry.label(RoomRegistry.widgetLabels, widget.type))
                .font(look.font(.headline, weight: .semibold)).foregroundStyle(look.accentColor)
                .accessibilityAddTraits(.isHeader)
            inner
        }
        .padding(Theme.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(look.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(look.border.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("room-widget-\(widget.type)")
    }

    @ViewBuilder private var inner: some View {
        switch widget.type {
        case "currently": currently
        case "music": music
        case "top_friends": topFriends
        case "photos": photos
        case "life_updates": snippets(model.lifeUpdates, empty: "No Life Updates to show.")
        case "posts": snippets(model.posts, empty: "No posts to show.")
        case "memories": memories
        default: Text("This widget isn't available in this version.").font(look.font(.callout)).foregroundStyle(look.muted)
        }
    }

    private func empty(_ text: String) -> some View {
        Text(text).font(look.font(.callout)).foregroundStyle(look.muted)
    }

    @ViewBuilder private var currently: some View {
        if let text = room.currently, !text.isEmpty {
            Text(text).font(look.font(.body)).foregroundStyle(look.text)
        } else { empty("Nothing here yet.") }
    }

    /// A link card only: https, opened in the system browser. No embed, no autoplay.
    @ViewBuilder private var music: some View {
        if let music = room.music, let url = Self.safeURL(music.url) {
            Link(destination: url) {
                HStack(spacing: Theme.space3) {
                    Image(systemName: "music.note").foregroundStyle(look.accentColor)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(music.title ?? url.host ?? "Listen").font(look.font(.body, weight: .semibold)).foregroundStyle(look.text)
                        if let artist = music.artist { Text(artist).font(look.font(.footnote)).foregroundStyle(look.muted) }
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right").foregroundStyle(look.muted)
                }
                .frame(minHeight: Theme.touchTarget)
            }
            .accessibilityHint("Opens in your browser")
            .accessibilityIdentifier("room-music-link")
        } else { empty("Nothing here yet.") }
    }

    static func safeURL(_ text: String) -> URL? {
        guard let url = URL(string: text), url.scheme?.lowercased() == "https", url.host != nil else { return nil }
        return url
    }

    @ViewBuilder private var topFriends: some View {
        if let items = room.topFriends.items, !items.isEmpty {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: Theme.space3)], spacing: Theme.space3) {
                ForEach(items, id: \.uid) { person in
                    NavigationLink(value: RoomRoute(username: person.username)) {
                        VStack(spacing: 4) {
                            AvatarView(mediaId: person.avatarMediaId, name: person.displayName, size: 48)
                            Text(person.displayName).font(look.font(.footnote)).foregroundStyle(look.text).lineLimit(1)
                        }
                        .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                    }
                    .accessibilityLabel(person.displayName)
                }
            }
        } else if room.topFriends.items == nil && !model.isOwner {
            empty("Top Friends are private.")
        } else { empty("No Top Friends chosen yet.") }
    }

    @ViewBuilder private var photos: some View {
        if let list = model.photos, !list.items.isEmpty {
            PhotoStrip(assetIds: list.items.prefix(6).map(\.mediaAssetId))
        } else { empty("No photos to show.") }
    }

    @ViewBuilder private func snippets(_ items: [MemoryItem], empty text: String) -> some View {
        if items.isEmpty { empty(text) }
        ForEach(items) { item in
            MemoryLink(item: item) {
                Text(Self.excerpt(item)).font(look.font(.body)).foregroundStyle(look.text)
                    .multilineTextAlignment(.leading).lineLimit(3)
                    .frame(maxWidth: .infinity, minHeight: Theme.touchTarget, alignment: .leading)
            }
        }
    }

    @ViewBuilder private var memories: some View {
        NavigationLink(value: MemoriesRoute(scope: .room(username: room.owner.username))) {
            Label("Browse memories", systemImage: "clock.arrow.circlepath").font(look.font(.body))
                .foregroundStyle(look.accentColor).frame(minHeight: Theme.touchTarget)
        }
    }

    static func excerpt(_ item: MemoryItem) -> String {
        switch item {
        case .post(let value): value.post.text
        case .lifeUpdate(let value): value.sections.first?.content ?? "Photos"
        case .unsupported: ""
        }
    }
}
