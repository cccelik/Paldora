import PaldoraKit
import SwiftUI

struct RootView: View {
    let model: AppModel

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                ProgressView("Opening your box")
                    .font(Typography.body)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.canvas)
            case .signedOut:
                SignInView(model: model)
            case .signedIn(let profile):
                MainTabView(model: model, profile: profile)
            case .accountNotReady:
                StatusScreen(
                    title: "Your account isn't ready yet",
                    message: "Paldora accounts are set up by invitation, and this one isn't finished. Finish setting it up on the web, or sign out and try another account.",
                    actionTitle: nil, action: nil, model: model
                )
            case .profileUnavailable(let message):
                StatusScreen(
                    title: "Couldn't open your box",
                    message: message,
                    actionTitle: "Try again",
                    action: { await model.loadProfile() },
                    model: model
                )
            case .notConfigured(let issue):
                NotConfiguredView(issue: issue)
            }
        }
        .tint(Theme.goldText)
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
