import SwiftUI

/// Figma 1.3 "Forgot password" and 1.4 "Check your email". The answer is always the
/// same for known and unknown addresses (no account enumeration); resending waits 60 s.
struct PasswordResetSheet: View {
    let model: AppModel
    @State private var email: String
    @State private var message: String?
    @State private var sentTo: String?
    @State private var isSending = false
    @State private var cooldown = 0
    @Environment(\.dismiss) private var dismiss

    private static let cooldownSeconds = 60

    init(model: AppModel, initialEmail: String) {
        self.model = model
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        VStack(spacing: 0) {
            PaldoraNavBar(title: "Reset password", leading: .close { dismiss() })
                .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space2)
            ScrollView {
                if let sentTo { sent(sentTo) } else { form }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .paldoraCanvas()
        .task(id: cooldown) {
            guard cooldown > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            if !Task.isCancelled { cooldown -= 1 }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: Theme.space5) {
            PaldoraScreenTitle(title: "Forgot your", accent: "password?",
                               subtitle: "We'll email you a single-use link. It expires after one hour.")
            PaldoraTextField("Email", text: $email, placeholder: "Your email address",
                             errorMessage: invalidMessage, identifier: "reset-email")
                .keyboardType(.emailAddress)
                .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            Text("We never confirm whether an address has an account.")
                .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            PaldoraButton("Send reset link", isLoading: isSending, fullWidth: true) { send() }
                .disabled(isSending).accessibilityIdentifier("send-reset")
        }
        .padding(Theme.space5)
        .frame(maxWidth: Theme.readingWidth).frame(maxWidth: .infinity)
    }

    /// Only the "enter a valid email" case is shown under the field; every other answer is the sent screen.
    private var invalidMessage: String? { message }

    private func sent(_ address: String) -> some View {
        VStack(spacing: Theme.space5) {
            PaldoraStateView(icon: .mail, tone: .info, title: "Check your inbox.",
                             message: "If \(address) has an account, a reset link is on its way.")
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("reset-message")
            PaldoraButton(cooldown > 0 ? "Resend in 0:\(String(format: "%02d", cooldown))" : "Resend link",
                          kind: .ghost, size: .medium, isLoading: isSending, fullWidth: true) { send() }
                .disabled(cooldown > 0 || isSending)
            PaldoraButton("Wrong address? Go back", kind: .ghost, size: .medium, fullWidth: true) {
                sentTo = nil
                message = nil
            }
        }
        .padding(.horizontal, Theme.space5)
        .frame(maxWidth: Theme.readingWidth).frame(maxWidth: .infinity)
    }

    private func send() {
        isSending = true
        message = nil
        Task {
            let answer = await model.requestPasswordReset(email: email)
            isSending = false
            if answer == UserMessages.resetSent {
                sentTo = email.trimmingCharacters(in: .whitespacesAndNewlines)
                cooldown = Self.cooldownSeconds
            } else {
                message = answer
            }
        }
    }
}
