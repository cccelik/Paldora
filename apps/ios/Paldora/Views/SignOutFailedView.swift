import SwiftUI

/// Shown when the local sign-out failed twice. Honest: the session may still be
/// on this device, so the app does not claim to be signed out.
struct SignOutFailedView: View {
    let model: AppModel

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            Text("We couldn't sign you out").font(Typography.title).foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text("Your session may still be on this device. Try again. If it keeps failing, close and reopen Paldora; it will finish signing out before showing anything.")
                .font(Typography.body).foregroundStyle(Theme.textMuted).multilineTextAlignment(.center)
            Button("Try signing out again") { model.retrySignOut() }
                .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("retry-sign-out")
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
        .accessibilityIdentifier("sign-out-failed")
    }
}
