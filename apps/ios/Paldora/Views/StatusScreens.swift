import SwiftUI

/// Full-screen state with an optional primary action and a sign-out.
struct StatusScreen: View {
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() async -> Void)?
    let model: AppModel

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            Text(title).font(Typography.title).foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(message).font(Typography.body).foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle) { Task { await action() } }
                    .buttonStyle(PrimaryButtonStyle())
            }
            Button("Sign out") { model.signOut() }
                .buttonStyle(QuietButtonStyle())
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }
}

/// Shown instead of any Firebase use when the build has no safe configuration.
struct NotConfiguredView: View {
    let issue: ConfigurationIssue

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            Text("Paldora isn't configured").font(Typography.title).foregroundStyle(Theme.text)
            Text(detail).font(Typography.body).foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
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
