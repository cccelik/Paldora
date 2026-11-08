import SwiftUI

/// Shown when the local sign-out failed twice. Honest: the session may still be
/// on this device, so the app does not claim to be signed out.
struct SignOutFailedView: View {
    let model: AppModel

    var body: some View {
        VStack(spacing: Theme.space6) {
            BrandMark()
            PaldoraStateView(
                icon: .alert, tone: .danger, title: "We couldn't sign you out",
                message: "Your session may still be on this device. Try again. If it keeps failing, close and reopen Paldora; it will finish signing out before showing anything."
            ) {
                PaldoraButton("Try signing out again", size: .medium, fullWidth: true) { model.retrySignOut() }
                    .accessibilityIdentifier("retry-sign-out")
                    .padding(.top, Theme.space3)
            }
        }
        .padding(Theme.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paldoraCanvas()
        .accessibilityIdentifier("sign-out-failed")
    }
}
