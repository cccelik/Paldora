import PaldoraKit
import SwiftUI

struct OnboardingView: View {
    let model: AppModel
    @State private var env: FeatureEnvironment?
    @State private var flow: OnboardingViewModel?

    init(model: AppModel, profile: MyProfile) {
        self.model = model
        let env = model.makeFeatureEnvironment(userID: profile.user.id)
        _env = State(initialValue: env)
        _flow = State(initialValue: env.map { env in
            OnboardingViewModel(env: env, profile: profile) { model.adopt($0) }
        })
    }

    var body: some View {
        if let env, let flow {
            OnboardingSteps(flow: flow, model: model, env: env)
                .environment(\.imageLoader, env.images)
        } else {
            StatusScreen(title: "Couldn't open your box", message: UserMessages.generic,
                         actionTitle: nil, action: nil, model: model)
        }
    }
}

private struct OnboardingSteps: View {
    @Bindable var flow: OnboardingViewModel
    let model: AppModel
    let env: FeatureEnvironment

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                BrandMark()
                Text("Step \(flow.step.rawValue + 1) of 3").font(Typography.caption).foregroundStyle(Theme.textMuted)
                    .accessibilityIdentifier("onboarding-step")
                switch flow.step {
                case .username: username
                case .profile: profileStep
                case .avatar: avatar
                }
                if let error = flow.error { InlineMessage(text: error).accessibilityIdentifier("onboarding-error") }
                Button("Sign out") { model.signOut() }.buttonStyle(QuietButtonStyle())
            }
            .frame(maxWidth: 440, alignment: .leading)
            .padding(Theme.space6)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
    }

    private var username: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Choose a username").font(Typography.title).foregroundStyle(Theme.text)
            Text("People find you and invite you by username. Letters, numbers and underscores, 3 to 30 characters.")
                .font(Typography.callout).foregroundStyle(Theme.textMuted)
            FieldContainer(title: "Username") {
                TextField("username", text: $flow.username, prompt: Text("username").foregroundStyle(Theme.textMuted)).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityIdentifier("onboarding-username")
            }
            if let hint = flow.usernameHint { InlineMessage(text: hint) }
            if let reserved = flow.reservedUsername {
                Text("Saved as @\(reserved)").font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
            primary("Continue", enabled: flow.canSaveUsername, id: "onboarding-username-next") { await flow.saveUsername() }
        }
    }

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("About you").font(Typography.title).foregroundStyle(Theme.text)
            if let reserved = flow.reservedUsername ?? flow.profile.profile.username {
                Text("Your username is @\(reserved).").font(Typography.callout).foregroundStyle(Theme.textMuted)
            }
            FieldContainer(title: "Display name") {
                TextField("Display name", text: $flow.displayName, prompt: Text("Display name").foregroundStyle(Theme.textMuted)).accessibilityIdentifier("onboarding-display-name")
            }
            FieldContainer(title: "Bio (optional)") {
                TextField("A line about you", text: $flow.bio, prompt: Text("A line about you").foregroundStyle(Theme.textMuted), axis: .vertical).lineLimit(2...5).padding(.vertical, Theme.space2)
                    .accessibilityIdentifier("onboarding-bio")
            }
            primary("Continue", enabled: flow.canSaveProfile, id: "onboarding-profile-next") { await flow.saveProfile() }
        }
    }

    private var avatar: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Add a photo").font(Typography.title).foregroundStyle(Theme.text)
            Text("Optional. You can add or change it later in your profile.").font(Typography.callout).foregroundStyle(Theme.textMuted)
            AvatarSection(model: model, env: env)
            primary("Finish", enabled: !flow.isWorking, id: "onboarding-finish") { await flow.finish() }
        }
    }

    private func primary(_ title: String, enabled: Bool, id: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: { if flow.isWorking { ProgressView() } else { Text(title) } }
            .buttonStyle(PrimaryButtonStyle()).disabled(!enabled).accessibilityIdentifier(id)
    }
}
