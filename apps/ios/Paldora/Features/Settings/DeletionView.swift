import PaldoraKit
import SwiftUI

struct DeletionView: View {
    @State private var model: DeletionViewModel
    @State private var confirming = false

    init(env: FeatureEnvironment) { _model = State(initialValue: DeletionViewModel(env: env)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                switch model.phase {
                case .loading: LoadingBlock(label: "Checking your account")
                case .failed(let message): ErrorBlock(message: message) { await model.load() }
                case .ready: content
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas)
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .confirmationDialog(model.isPending ? "Cancel the deletion?" : "Delete your account? It is permanently removed after seven days unless you cancel.",
                            isPresented: $confirming, titleVisibility: .visible) {
            Button(model.isPending ? "Cancel deletion" : "Request account deletion", role: model.isPending ? nil : .destructive) {
                Task { if model.isPending { await model.cancel() } else { await model.request() } }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let deletion = model.deletion, model.isPending {
            Text("Your account is scheduled for permanent deletion on \(Self.date(deletion.dueAt)). You can cancel before then.")
                .font(Typography.body).foregroundStyle(Theme.text).accessibilityIdentifier("deletion-pending")
        } else {
            Text("Your account and owned content will be permanently removed after a seven-day cancellation window. Transfer ownership of every Box you own first. Download your archive before requesting deletion.")
                .font(Typography.body).foregroundStyle(Theme.text)
        }
        if model.isBlockedState {
            InlineMessage(text: DeletionViewModel.blockedMessage).accessibilityIdentifier("deletion-blocked")
        }
        FieldContainer(title: "Confirm your password") {
            SecureField("Password", text: $model.password, prompt: Text("Password").foregroundStyle(Theme.textMuted)).textContentType(.password)
                .accessibilityIdentifier("deletion-password")
        }
        if let error = model.error, !model.isBlockedState { InlineMessage(text: error) }
        if let notice = model.notice { InlineMessage(text: notice, kind: .success) }
        Button { confirming = true } label: {
            if model.isWorking { ProgressView() } else { Text(model.isPending ? "Cancel deletion" : "Request account deletion") }
        }
        .buttonStyle(model.isPending ? AnyButtonStyle(PrimaryButtonStyle()) : AnyButtonStyle(QuietButtonStyle(destructive: true)))
        .disabled(!model.canSubmit)
        .accessibilityIdentifier("deletion-submit")
    }

    static func date(_ time: EpochMillis) -> String { time.date.formatted(date: .long, time: .omitted) }
}
