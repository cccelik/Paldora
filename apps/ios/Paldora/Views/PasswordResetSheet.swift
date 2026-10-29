import SwiftUI

struct PasswordResetSheet: View {
    let model: AppModel
    @State private var email: String
    @State private var message: String?
    @State private var isSending = false
    @Environment(\.dismiss) private var dismiss

    init(model: AppModel, initialEmail: String) {
        self.model = model
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.space4) {
                Text("Enter your email and we'll send a link to reset your password.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
                FieldContainer(title: "Email") {
                    TextField("Email", text: $email, prompt: Text("Your email address").foregroundStyle(Theme.textMuted)).keyboardType(.emailAddress)
                        .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("reset-email")
                }
                if let message { InlineMessage(text: message, kind: .success).accessibilityIdentifier("reset-message") }
                Button { send() } label: { if isSending { ProgressView() } else { Text("Send reset link") } }
                    .buttonStyle(PrimaryButtonStyle()).disabled(isSending).accessibilityIdentifier("send-reset")
                Spacer()
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle("Reset password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func send() {
        isSending = true
        Task {
            message = await model.requestPasswordReset(email: email)
            isSending = false
        }
    }
}
