import PaldoraKit
import SwiftUI

struct MainTabView: View {
    let model: AppModel
    let profile: MyProfile

    var body: some View {
        TabView {
            PlaceholderScreen(
                title: "Home",
                message: "Your chronological feed arrives in the next update. Nothing is hidden or missing; it just isn't built in the app yet."
            )
            .tabItem { Label("Home", systemImage: "house") }

            PlaceholderScreen(
                title: "Boxes",
                message: "Your private circles will live here. Boxes are coming to the app in the next update."
            )
            .tabItem { Label("Boxes", systemImage: "shippingbox") }

            PlaceholderScreen(
                title: "Notifications",
                message: "Notifications are coming to the app in the next update."
            )
            .tabItem { Label("Notifications", systemImage: "bell") }

            ProfileView(model: model, profile: profile)
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .toolbarBackground(Theme.canvas, for: .tabBar)
    }
}
