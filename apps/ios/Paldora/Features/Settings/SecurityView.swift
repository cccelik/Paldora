import SwiftUI

struct SecurityView: View {
    @State private var model: SecurityViewModel
    @Environment(PaldoraDialogCenter.self) private var dialogs

    init(env: FeatureEnvironment) { _model = State(initialValue: SecurityViewModel(env: env)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                VStack(alignment: .leading, spacing: Theme.space3) {
                    PaldoraScreenTitle(title: "Security",
                                       subtitle: "Changing your password signs you out everywhere. You'll sign in again with the new one.")
                    field("Current password", text: $model.current, id: "current-password", type: .password)
                    field("New password", text: $model.new, id: "new-password", type: .newPassword, error: model.newPasswordHint)
                    field("Confirm new password", text: $model.confirm, id: "confirm-password", type: .newPassword)
                    if let error = model.error { PaldoraBanner(tone: .danger, title: error).accessibilityIdentifier("security-error") }
                    PaldoraButton("Change password", size: .medium, isLoading: model.isWorking, fullWidth: true) {
                        Task { await model.changePassword() }
                    }
                    .disabled(!model.canChange)
                    .accessibilityIdentifier("change-password")
                }
                VStack(alignment: .leading, spacing: Theme.space3) {
                    Text("Sign out everywhere").paldoraText(.titleM).foregroundStyle(Theme.textPrimary)
                    Text("Ends every session on every device, including this one.")
                        .paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
                    PaldoraButton("Sign out everywhere", kind: .secondary, size: .medium, fullWidth: true, destructive: true) {
                        dialogs.present(icon: .logout, title: "Sign out of every device?", message: "You'll sign in again here.",
                                        confirmTitle: "Sign out everywhere") { Task { await model.signOutEverywhere() } }
                    }
                    .accessibilityIdentifier("sign-out-everywhere")
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("Security", showsTitle: false)
    }

    private func field(_ title: String, text: Binding<String>, id: String, type: UITextContentType, error: String? = nil) -> some View {
        PaldoraTextField(title, text: text, placeholder: title, errorMessage: error, isSecure: true, identifier: id)
            .textContentType(type)
    }
}
