import PaldoraKit
import SwiftUI

/// Figma 9.1 Profile & settings: an inverse profile card, list groups, appearance,
/// your reactions and the edit-profile form, with the privacy promise at the end.
struct ProfileView: View {
    let model: AppModel
    let env: FeatureEnvironment
    let profile: MyProfile

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space6) {
                    PaldoraScreenTitle(title: "Profile")
                    header
                    ProfileLinks()
                    AvatarSection(model: model, env: env, hasAvatar: profile.profile.avatarMediaId != nil)
                    ProfileEditor(model: model, profile: profile)
                    PreferencesSection(model: model)
                    PaldoraBanner(tone: .info, title: "Nothing you share ever leaves your Boxes.",
                                  message: "No ads, no strangers.")
                    PaldoraButton("Sign out", kind: .secondary, size: .medium, icon: .logout, fullWidth: true, destructive: true) {
                        model.signOut()
                    }
                    .accessibilityIdentifier("sign-out-button")
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.space8)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .paldoraCanvas()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: FriendsRoute.self) { _ in FriendsView(env: env) }
            .navigationDestination(for: SettingsRoute.self) { _ in SettingsView(env: env) }
            .navigationDestination(for: LifeUpdatesRoute.self) { _ in MyLifeUpdatesView(env: env) }
            .navigationDestination(for: LifeUpdateRoute.self) { LifeUpdateDetailView(env: env, route: $0) }
            .navigationDestination(for: LifeUpdateComposeRoute.self) { _ in LifeUpdateComposerView(env: env) }
            .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
            .roomRoutes(env: env)
        }
    }

    /// The inverse profile card.
    private var header: some View {
        HStack(spacing: Theme.space4) {
            PaldoraAvatar(name: profile.profile.displayName ?? profile.profile.username ?? "Paldora",
                          size: .large, ring: .brass, mediaId: profile.profile.avatarMediaId)
            VStack(alignment: .leading, spacing: Theme.space1) {
                Text(profile.profile.displayName ?? "Unnamed")
                    .paldoraText(.titleL)
                    .foregroundStyle(Theme.textOnInverse)
                    .accessibilityIdentifier("profile-display-name")
                if let username = profile.profile.username {
                    Text("@\(username)").paldoraText(.bodyM).foregroundStyle(Theme.textOnInverse)
                }
                Text(profile.user.email).paldoraText(.caption).foregroundStyle(Theme.textOnInverse)
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Signed in as \(profile.user.email)")
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.space5)
        .background(Theme.bgInverse, in: RoundedRectangle(cornerRadius: Theme.radiusXl))
        .paldoraElevation(.lift)
    }
}
