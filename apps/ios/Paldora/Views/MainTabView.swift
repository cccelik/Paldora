import PaldoraKit
import SwiftUI
import UIKit

struct MainTabView: View {
    let model: AppModel
    let profile: MyProfile
    @State private var env: FeatureEnvironment?
    @State private var selection: PaldoraTab = .home
    @State private var chrome = PaldoraChrome()
    /// The floating bar steps aside while the keyboard is up, so it never covers a field or button.
    @State private var keyboardVisible = false
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
                StatusScreen(icon: .alert, title: "Couldn't open your box", message: UserMessages.generic,
                             actionTitle: nil, action: nil, model: model)
            }
        }
    }

    private func tabs(_ env: FeatureEnvironment) -> some View {
        // The system tab bar is hidden; `PaldoraTabBar` floats over it. TabView keeps each
        // tab's state and takes inactive tabs out of the accessibility tree.
        TabView(selection: $selection) {
            ForEach(PaldoraTab.allCases, id: \.self) { tab in
                content(tab, env)
                    .toolbar(.hidden, for: .tabBar)
                    .tag(tab)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !chrome.isTabBarHidden && !keyboardVisible {
                PaldoraTabBar(selection: $selection, badges: [.notifications: env.badge.count])
                    .padding(.horizontal, Theme.space3)
                    .padding(.bottom, Theme.space1)
            }
        }
        .background(Theme.bgCanvas.ignoresSafeArea())
        .environment(chrome)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
        .environment(\.imageLoader, env.images)
        // Private images live in memory only; drop them when the shell goes away (sign-out).
        .onDisappear { env.images.clear() }
        // Polling first (ADR 021 decision 2): on foreground and every 30 s.
        .task(id: scenePhase) {
            if scenePhase == .active { await env.badge.poll() }
        }
    }

    @ViewBuilder private func content(_ tab: PaldoraTab, _ env: FeatureEnvironment) -> some View {
        switch tab {
        case .home: HomeView(env: env, isActive: selection == .home)
        case .boxes: BoxesView(env: env)
        case .myRoom: MyRoomTab(env: env)
        case .notifications: NotificationsView(env: env)
        case .profile: ProfileView(model: model, env: env, profile: profile)
        }
    }
}
