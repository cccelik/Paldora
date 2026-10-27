import PaldoraKit
import SwiftUI

struct MainTabView: View {
    enum Tab: Hashable { case home, boxes, room, notifications, profile }

    let model: AppModel
    let profile: MyProfile
    @State private var env: FeatureEnvironment?
    @State private var selection: Tab = .home
    @Environment(\.scenePhase) private var scenePhase

    init(model: AppModel, profile: MyProfile) {
        self.model = model
        self.profile = profile
        _env = State(initialValue: model.makeFeatureEnvironment(userID: profile.user.id))
    }

    var body: some View {
        Group {
            if let env {
                tabs(env)
            } else {
                StatusScreen(title: "Couldn't open your box", message: UserMessages.generic,
                             actionTitle: nil, action: nil, model: model)
            }
        }
    }

    private func tabs(_ env: FeatureEnvironment) -> some View {
        TabView(selection: $selection) {
            HomeView(env: env, isActive: selection == .home)
                .tabItem { Label("Home", systemImage: "house") }
                .tag(Tab.home)

            BoxesView(env: env)
                .tabItem { Label("Boxes", systemImage: "shippingbox") }
                .tag(Tab.boxes)

            MyRoomTab(env: env)
                .tabItem { Label("My Room", systemImage: "door.left.hand.open") }
                .tag(Tab.room)

            NotificationsView(env: env)
                .tabItem { Label("Notifications", systemImage: "bell") }
                .badge(env.badge.count)
                .tag(Tab.notifications)

            ProfileView(model: model, env: env, profile: profile)
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(Tab.profile)
        }
        .toolbarBackground(Theme.canvas, for: .tabBar)
        .environment(\.imageLoader, env.images)
        // Private images live in memory only; drop them when the shell goes away (sign-out).
        .onDisappear { env.images.clear() }
        // Polling first (ADR 021 decision 2): on foreground and every 30 s.
        .task(id: scenePhase) {
            if scenePhase == .active { await env.badge.poll() }
        }
    }
}
