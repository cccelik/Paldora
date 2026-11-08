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
            StatusScreen(icon: .alert, title: "Couldn't open your box", message: UserMessages.generic,
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
            VStack(alignment: .leading, spacing: Theme.space5) {
                progress
                switch flow.step {
                case .username: username
                case .profile: profileStep
                case .avatar: avatar
                }
                if let error = flow.error {
                    PaldoraBanner(tone: .danger, title: error).accessibilityIdentifier("onboarding-error")
                }
                PaldoraButton("Sign out", kind: .ghost, size: .medium, fullWidth: true) { model.signOut() }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space5)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
    }

    /// "Step n of 3" with three segments (Figma 1.8 to 1.10).
    private var progress: some View {
        let current = flow.step.rawValue + 1
        return VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Step \(current) of 3").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityIdentifier("onboarding-step")
            HStack(spacing: Theme.space1) {
                ForEach(1...3, id: \.self) { index in
                    Capsule().fill(index <= current ? Theme.brass : Theme.bgSunken).frame(height: 4)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private var username: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            PaldoraScreenTitle(title: "Choose the name", accent: "on your door.",
                               subtitle: "Friends find you by it. Only people you accept can ever see what you share.")
            PaldoraTextField("Username", text: $flow.username, placeholder: "username",
                             errorMessage: flow.usernameHint, identifier: "onboarding-username")
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            if let reserved = flow.reservedUsername {
                PaldoraFieldMessage(text: "Saved as @\(reserved)", isError: false)
            }
            primary("Continue", enabled: flow.canSaveUsername, id: "onboarding-username-next") { await flow.saveUsername() }
        }
    }

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            PaldoraScreenTitle(title: "What should", accent: "we call you?")
            PaldoraTextField("Display name", text: $flow.displayName, placeholder: "Display name", identifier: "onboarding-display-name")
            PaldoraFieldContainer(title: "Short bio · optional") {
                TextField("A line about you", text: $flow.bio, prompt: Text("A line about you").foregroundStyle(Theme.textTertiary), axis: .vertical)
                    .lineLimit(2...5).padding(.vertical, Theme.space2)
                    .accessibilityIdentifier("onboarding-bio")
            }
            Text("\(flow.bio.count) / 500").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
            preview
            primary("Continue", enabled: flow.canSaveProfile, id: "onboarding-profile-next") { await flow.saveProfile() }
        }
    }

    /// How your name will look to friends (Figma 1.10 preview card).
    private var preview: some View {
        let name = flow.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let handle = flow.reservedUsername ?? flow.profile.profile.username
        return HStack(spacing: Theme.space3) {
            PaldoraAvatar(name: name.isEmpty ? (handle ?? "You") : name, size: .large)
            VStack(alignment: .leading, spacing: 2) {
                Text(name.isEmpty ? "Your name" : name).paldoraText(.titleS).foregroundStyle(Theme.textPrimary)
                if let handle { Text("@\(handle)").paldoraText(.bodyS).foregroundStyle(Theme.textSecondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.space4)
        .background(Theme.brassSoft, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
        .accessibilityElement(children: .combine)
    }

    private var avatar: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            PaldoraScreenTitle(title: "Add a face so", accent: "friends know it's you.",
                               subtitle: "Optional. Only people who can see your Room see your photo. You can change it later in your profile.")
            AvatarSection(model: model, env: env)
            primary("Finish", enabled: !flow.isWorking, id: "onboarding-finish") { await flow.finish() }
        }
    }

    private func primary(_ title: String, enabled: Bool, id: String, action: @escaping () async -> Void) -> some View {
        PaldoraButton(title, isLoading: flow.isWorking, fullWidth: true) { Task { await action() } }
            .disabled(!enabled).accessibilityIdentifier(id)
    }
}
