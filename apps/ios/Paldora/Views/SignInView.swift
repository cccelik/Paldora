import SwiftUI

/// Figma 1.2 "Sign in with email". Registration is invite-only, so there is no Apple,
/// Google or sign-up path; the privacy line says so.
struct SignInView: View {
    let model: AppModel
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focus: Field?
    @State private var showReset = false

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                BrandMark()
                PaldoraScreenTitle(eyebrow: "Welcome back", title: "Come on in.",
                                   subtitle: "Sign in with the email your invite was sent to.")
                if let notice = model.notice {
                    PaldoraBanner(tone: .warning, title: notice)
                        .accessibilityIdentifier("sign-in-notice")
                }
                VStack(spacing: Theme.space4) {
                    PaldoraTextField("Email", text: $email, placeholder: "Your email address", identifier: "email-field")
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                    VStack(alignment: .trailing, spacing: Theme.space1) {
                        PaldoraTextField("Password", text: $password, placeholder: "Password",
                                         errorMessage: model.signInError, isSecure: true, identifier: "password-field")
                            .textContentType(.password)
                            .submitLabel(.go)
                            .focused($focus, equals: .password)
                            .onSubmit(submit)
                        PaldoraButton("Forgot password?", kind: .ghost, size: .small) { showReset = true }
                            .accessibilityIdentifier("forgot-password")
                    }
                }
                .disabled(model.isSigningIn)
                PaldoraButton("Sign in", isLoading: model.isSigningIn, fullWidth: true, action: submit)
                    .disabled(model.isSigningIn)
                    .accessibilityIdentifier("sign-in-button")
                Text("Paldora accounts are created by invitation. Ask the person who invited you if you need a new link.")
                    .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(Theme.space5)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .sheet(isPresented: $showReset) { PasswordResetSheet(model: model, initialEmail: email) }
    }

    private func submit() {
        focus = nil
        Task { await model.signIn(email: email, password: password) }
    }
}
