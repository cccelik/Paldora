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
            .paldoraCanvas()
            .modifier(RoomChrome(isTab: route.username == nil))
            .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: ScrollView { LoadingBlock(label: "Loading Room").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: roomUnavailable
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

    /// Figma 7.9: missing, hidden, blocked and malformed all look the same.
    private var roomUnavailable: some View {
        PaldoraStateView(icon: .lock, title: "This Room isn't available.",
                         message: "It may be private, or the link may be wrong.")
            .accessibilityIdentifier("unavailable")
    }

    /// Account and privacy actions live outside the Room theme, in the app's own look.
    private func actionBar(_ room: Room) -> some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            FlowLayout(spacing: Theme.space2) {
                if model.isOwner {
                    NavigationLink(value: RoomEditRoute()) { Label("Customize", systemImage: "paintbrush") }
                        .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .small))
                        .accessibilityIdentifier("customize-room")
                }
                if let name = model.username {
                    NavigationLink(value: MemoriesRoute(scope: .room(username: name))) {
                        Label("Memories", systemImage: "clock.arrow.circlepath")
                    }
                    .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .small))
                    .accessibilityIdentifier("room-memories")
                }
            }
            if model.isOwner, let visibility = room.visibility {
                PaldoraChip(title: "Visible to: \(RoomRegistry.label(RoomRegistry.visibilityLabels, visibility))",
                            style: .soft, leading: .icon(.lock))
            } else if !model.isOwner {
                PaldoraChip(title: room.relationship == "friend" ? "Friend" : "Shares a Box with you", style: .soft)
            }
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.vertical, Theme.space2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bgCanvas)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.borderHairline).frame(height: 1) }
    }
}

/// My Room is a tab root (no bar); a visited Room is a pushed screen with Back.
private struct RoomChrome: ViewModifier {
    let isTab: Bool

    func body(content: Content) -> some View {
        if isTab {
            content.toolbar(.hidden, for: .navigationBar)
        } else {
            content.paldoraNavBar("Room")
        }
    }
}
