import PaldoraKit
import SwiftUI

struct ProfileView: View {
    let model: AppModel
    let env: FeatureEnvironment
    let profile: MyProfile

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space8) {
                    header
                    ProfileLinks()
                    AvatarSection(model: model, env: env, hasAvatar: profile.profile.avatarMediaId != nil)
                    ProfileEditor(model: model, profile: profile)
                    PreferencesSection(model: model)
                    Button("Sign out") { model.signOut() }
                        .buttonStyle(QuietButtonStyle(destructive: true))
                        .accessibilityIdentifier("sign-out-button")
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space6)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.canvas)
            .navigationDestination(for: FriendsRoute.self) { _ in FriendsView(env: env) }
            .navigationDestination(for: SettingsRoute.self) { _ in SettingsView(env: env) }
            .navigationDestination(for: LifeUpdatesRoute.self) { _ in MyLifeUpdatesView(env: env) }
            .navigationDestination(for: LifeUpdateRoute.self) { LifeUpdateDetailView(env: env, route: $0) }
            .navigationDestination(for: LifeUpdateComposeRoute.self) { _ in LifeUpdateComposerView(env: env) }
            .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
            .roomRoutes(env: env)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var header: some View {
        HStack(spacing: Theme.space4) {
            AvatarView(mediaId: profile.profile.avatarMediaId,
                       name: profile.profile.displayName ?? profile.profile.username ?? "Paldora", size: 56)
            VStack(alignment: .leading, spacing: Theme.space1) {
                Text(profile.profile.displayName ?? "Unnamed")
                    .font(Typography.brandSmall)
                    .foregroundStyle(Theme.text)
                    .accessibilityIdentifier("profile-display-name")
                if let username = profile.profile.username {
                    Text("@\(username)").font(Typography.callout).foregroundStyle(Theme.textMuted)
                }
                Text(profile.user.email).font(Typography.caption).foregroundStyle(Theme.textMuted)
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Signed in as \(profile.user.email)")
            }
        }
    }
}
