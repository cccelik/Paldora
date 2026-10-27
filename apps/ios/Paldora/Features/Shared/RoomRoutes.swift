import SwiftUI

/// Registers the Room and Memories destinations on a navigation stack.
private struct RoomRoutes: ViewModifier {
    let env: FeatureEnvironment

    func body(content: Content) -> some View {
        content
            .navigationDestination(for: RoomRoute.self) { RoomView(env: env, route: $0) }
            .navigationDestination(for: RoomEditRoute.self) { _ in RoomEditorView(env: env) }
            .navigationDestination(for: MemoriesRoute.self) { MemoriesView(env: env, route: $0) }
    }
}

extension View {
    func roomRoutes(env: FeatureEnvironment) -> some View { modifier(RoomRoutes(env: env)) }
}

/// "My Room" as its own tab: a stack with every destination a Room can lead to.
struct MyRoomTab: View {
    let env: FeatureEnvironment

    var body: some View {
        NavigationStack {
            RoomView(env: env, route: RoomRoute(username: nil))
                .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
                .navigationDestination(for: LifeUpdateRoute.self) { LifeUpdateDetailView(env: env, route: $0) }
                .roomRoutes(env: env)
        }
    }
}
