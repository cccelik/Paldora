import PaldoraKit
import SwiftUI

struct RootView: View {
    let model: AppModel
    @State private var dialogs = PaldoraDialogCenter()

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                VStack(spacing: Theme.space6) {
                    BrandMark()
                    PaldoraRowSkeleton(count: 3)
                }
                .padding(Theme.space6)
                .frame(maxWidth: Theme.readingWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .paldoraCanvas()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Opening your box")
            case .signedOut:
                SignInView(model: model)
            case .signedIn(let profile):
                MainTabView(model: model, profile: profile)
            case .onboarding(let profile):
                OnboardingView(model: model, profile: profile)
            case .accountNotReady:
                StatusScreen(
                    icon: .lock, title: "Your account isn't ready yet",
                    message: "Paldora accounts are set up by invitation, and this one isn't ready yet. Sign out and try another account, or ask the person who invited you.",
                    actionTitle: nil, action: nil, model: model
                )
            case .profileUnavailable(let message):
                StatusScreen(
                    icon: .alert, tone: .danger, title: "Couldn't open your box",
                    message: message,
                    actionTitle: "Try again",
                    action: { await model.loadProfile() },
                    model: model
                )
            case .notConfigured(let issue):
                NotConfiguredView(issue: issue)
            case .signOutFailed:
                SignOutFailedView(model: model)
            }
        }
        .tint(Theme.goldText)
        .paldoraDialogHost(dialogs)
        .preferredColorScheme(Self.colorScheme(model.preferences?.appearance))
        .task { await model.start() }
    }

    static func colorScheme(_ appearance: Appearance?) -> ColorScheme? {
        switch appearance {
        case .light: .light
        case .dark: .dark
        case .system, .none: nil
        }
    }
}
