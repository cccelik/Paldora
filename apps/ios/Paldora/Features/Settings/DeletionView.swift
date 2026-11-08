import PaldoraKit
import SwiftUI

struct DeletionView: View {
    @State private var model: DeletionViewModel
    @State private var confirming = false

    init(env: FeatureEnvironment) { _model = State(initialValue: DeletionViewModel(env: env)) }

    @Environment(PaldoraDialogCenter.self) private var dialogs

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                switch model.phase {
                case .loading: LoadingBlock(label: "Checking your account", compact: true)
                case .failed(let message): ErrorBlock(message: message) { await model.load() }
                case .ready: content
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("Delete account")
        .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        if let deletion = model.deletion, model.isPending {
            PaldoraScreenTitle(title: "See you,", accent: "maybe.")
            Text("Your account is scheduled for permanent deletion on \(Self.date(deletion.dueAt)). Until then you can cancel.")
                .paldoraText(.bodyL).foregroundStyle(Theme.textPrimary).accessibilityIdentifier("deletion-pending")
        } else {
            PaldoraScreenTitle(title: "Delete your", accent: "account?",
                               subtitle: "Your account and owned content are permanently removed after a seven-day cancellation window. Transfer ownership of every Box you own first, and download your archive before you go.")
        }
        if model.isBlockedState {
            PaldoraBanner(tone: .warning, title: DeletionViewModel.blockedMessage).accessibilityIdentifier("deletion-blocked")
        }
        PaldoraTextField("Confirm with your password", text: $model.password, placeholder: "Password",
                         isSecure: true, identifier: "deletion-password")
            .textContentType(.password)
        if let error = model.error, !model.isBlockedState { PaldoraBanner(tone: .danger, title: error) }
        if let notice = model.notice { PaldoraBanner(tone: .success, title: notice) }
        PaldoraButton(model.isPending ? "Cancel deletion" : "Delete my account", kind: model.isPending ? .primary : .danger,
                      size: .medium, isLoading: model.isWorking, fullWidth: true) {
            if model.isPending {
                dialogs.present(icon: .refresh, title: "Cancel the deletion?", message: "Your account stays as it is.",
                                confirmTitle: "Cancel deletion", isDestructive: false) { Task { await model.cancel() } }
            } else {
                dialogs.present(icon: .trash, title: "Delete your account?",
                                message: "It is permanently removed after seven days unless you cancel.",
                                confirmTitle: "Request account deletion") { Task { await model.request() } }
            }
        }
        .disabled(!model.canSubmit)
        .accessibilityIdentifier("deletion-submit")
    }

    static func date(_ time: EpochMillis) -> String { time.date.formatted(date: .long, time: .omitted) }
}
