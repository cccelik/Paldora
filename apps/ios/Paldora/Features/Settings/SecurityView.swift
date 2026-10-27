import SwiftUI

struct SecurityView: View {
    @State private var model: SecurityViewModel
    @State private var confirmSignOutAll = false

    init(env: FeatureEnvironment) { _model = State(initialValue: SecurityViewModel(env: env)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                VStack(alignment: .leading, spacing: Theme.space3) {
                    Text("Change password").font(Typography.title).foregroundStyle(Theme.text)
                    Text("Changing your password signs you out everywhere. You'll sign in again with the new one.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted)
                    field("Current password", text: $model.current, id: "current-password", type: .password)
                    field("New password", text: $model.new, id: "new-password", type: .newPassword)
                    field("Confirm new password", text: $model.confirm, id: "confirm-password", type: .newPassword)
                    if let hint = model.newPasswordHint { InlineMessage(text: hint) }
                    if let error = model.error { InlineMessage(text: error).accessibilityIdentifier("security-error") }
                    Button { Task { await model.changePassword() } } label: {
                        if model.isWorking { ProgressView() } else { Text("Change password") }
                    }
                    .buttonStyle(PrimaryButtonStyle()).disabled(!model.canChange)
                    .accessibilityIdentifier("change-password")
                }
                VStack(alignment: .leading, spacing: Theme.space3) {
                    Text("Sign out everywhere").font(Typography.title).foregroundStyle(Theme.text)
                    Text("Ends every session on every device, including this one.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted)
                    Button("Sign out everywhere") { confirmSignOutAll = true }
                        .buttonStyle(QuietButtonStyle(destructive: true))
                        .accessibilityIdentifier("sign-out-everywhere")
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .navigationTitle("Security")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Sign out of every device? You'll sign in again here.",
                            isPresented: $confirmSignOutAll, titleVisibility: .visible) {
            Button("Sign out everywhere", role: .destructive) { Task { await model.signOutEverywhere() } }
        }
    }

    private func field(_ title: String, text: Binding<String>, id: String, type: UITextContentType) -> some View {
        FieldContainer(title: title) {
            SecureField(title, text: text).textContentType(type).accessibilityIdentifier(id)
        }
    }
}
