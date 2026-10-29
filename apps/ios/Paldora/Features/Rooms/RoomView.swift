import PaldoraKit
import SwiftUI

struct RoomView: View {
    let env: FeatureEnvironment
    let route: RoomRoute
    @State private var model: RoomViewModel

    init(env: FeatureEnvironment, route: RoomRoute) {
        self.env = env
        self.route = route
        _model = State(initialValue: RoomViewModel(env: env, route: route))
    }

    var body: some View {
        content
            .background(Theme.canvas)
            .navigationTitle(route.username == nil ? "My Room" : "Room")
            .navigationBarTitleDisplayMode(.inline)
            .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: LoadingBlock(label: "Loading Room")
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let room):
            VStack(spacing: 0) {
                actionBar(room)
                ScrollView {
                    RoomCanvas(room: room, model: model)
                }
                .refreshable { await model.load() }
            }
        }
    }

    /// Account and privacy actions live outside the Room theme, in the app's own look.
    private func actionBar(_ room: Room) -> some View {
        VStack(alignment: .leading, spacing: Theme.space1) {
            AdaptiveStack(spacing: Theme.space4) {
                if model.isOwner {
                    NavigationLink(value: RoomEditRoute()) {
                        Label("Customize", systemImage: "paintbrush").font(Typography.label)
                            .frame(minHeight: Theme.touchTarget)
                    }
                    .accessibilityIdentifier("customize-room")
                }
                if let name = model.username {
                    NavigationLink(value: MemoriesRoute(scope: .room(username: name))) {
                        Label("Memories", systemImage: "clock.arrow.circlepath").font(Typography.label)
                            .frame(minHeight: Theme.touchTarget)
                    }
                    .accessibilityIdentifier("room-memories")
                }
            }
            if model.isOwner, let visibility = room.visibility {
                Text("Visible to: \(RoomRegistry.label(RoomRegistry.visibilityLabels, visibility))")
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
            } else if !model.isOwner {
                Text(room.relationship == "friend" ? "Friend" : "Shares a Box with you")
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
        }
        .padding(.horizontal, Theme.space4)
        .padding(.vertical, Theme.space1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.canvas)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hairline).frame(height: 1) }
    }
}
