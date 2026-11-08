import SwiftUI

/// Full-screen state (Figma 1.11 "Account unavailable" pattern): a brand mark, an icon
/// medallion, a Title/L heading, one plain sentence, an optional primary action and a
/// sign-out. Never says who reported or why.
struct StatusScreen: View {
    var icon: PaldoraIcon = .alert
    var tone: PaldoraTone = .info
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() async -> Void)?
    let model: AppModel

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            PaldoraStateView(icon: icon, tone: tone, title: title, message: message) {
                if let actionTitle, let action {
                    PaldoraButton(actionTitle, size: .medium, fullWidth: true) { Task { await action() } }
                        .padding(.top, Theme.space3)
                }
                PaldoraButton("Sign out", kind: .ghost, size: .medium, fullWidth: true) { model.signOut() }
                    .accessibilityIdentifier("status-sign-out")
            }
        }
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paldoraCanvas()
    }
}

/// Shown instead of any Firebase use when the build has no safe configuration.
struct NotConfiguredView: View {
    let issue: ConfigurationIssue

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            PaldoraStateView(icon: .info, title: "Paldora isn't configured", message: detail)
        }
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paldoraCanvas()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("not-configured")
    }

    private var detail: String {
        switch issue {
        case .hostedNotConfigured:
            "This build has no Paldora server to connect to yet, so nothing was contacted."
        case .emulatorOrDemoRefused:
            "This build was given a test server, which release builds refuse to use. Nothing was contacted."
        case .startupFailed:
            "Paldora couldn't start. Please close and reopen the app."
        }
    }
}
