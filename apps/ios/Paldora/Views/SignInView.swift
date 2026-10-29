import SwiftUI

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
                VStack(alignment: .leading, spacing: Theme.space2) {
                    BrandMark()
                    Text("A box for your people.")
                        .font(Typography.brandSmall)
                        .foregroundStyle(Theme.textMuted)
                }
                if let notice = model.notice {
                    InlineMessage(text: notice, kind: .error)
                        .accessibilityIdentifier("sign-in-notice")
                }
                FieldContainer(title: "Email") {
                    TextField("Email", text: $email, prompt: Text("Your email address").foregroundStyle(Theme.textMuted))
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                        .accessibilityIdentifier("email-field")
                }
                FieldContainer(title: "Password") {
                    SecureField("Password", text: $password, prompt: Text("Password").foregroundStyle(Theme.textMuted))
                        .textContentType(.password)
                        .submitLabel(.go)
                        .focused($focus, equals: .password)
                        .onSubmit(submit)
                        .accessibilityIdentifier("password-field")
                }
                if let error = model.signInError {
                    InlineMessage(text: error).accessibilityIdentifier("sign-in-error")
                }
                Button(action: submit) {
                    if model.isSigningIn { ProgressView() } else { Text("Sign in") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.isSigningIn)
                .accessibilityIdentifier("sign-in-button")
                Button("Forgot password?") { showReset = true }
                    .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("forgot-password")
                Text("Paldora accounts are created by invitation.")
                    .font(Typography.caption)
                    .foregroundStyle(Theme.textMuted)
            }
            .frame(maxWidth: 440)
            .padding(Theme.space6)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .sheet(isPresented: $showReset) { PasswordResetSheet(model: model, initialEmail: email) }
    }

    private func submit() {
        focus = nil
        Task { await model.signIn(email: email, password: password) }
    }
}
