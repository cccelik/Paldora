import SwiftUI
import UIKit

struct ExportView: View {
    @State private var model: ExportViewModel

    init(env: FeatureEnvironment) { _model = State(initialValue: ExportViewModel(env: env)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                Text("Get a private JSON archive of your profile, posts, comments, reactions, Room settings, and owned media details.")
                    .font(Typography.callout).foregroundStyle(Theme.textMuted)
                switch model.phase {
                case .loading: LoadingBlock(label: "Checking your archive")
                case .failed(let message): ErrorBlock(message: message) { await model.load() }
                case .ready: content
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.canvas)
        .navigationTitle("Your data")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .sheet(isPresented: Binding(get: { model.preparedFile != nil }, set: { if !$0 { model.finishSharing() } })) {
            if let file = model.preparedFile { ShareSheet(file: file) { model.finishSharing() }.ignoresSafeArea() }
        }
    }

    @ViewBuilder private var content: some View {
        HStack(spacing: Theme.space2) {
            if model.status == "pending" { ProgressView() }
            Text(model.statusText).font(Typography.body).foregroundStyle(Theme.text)
                .accessibilityIdentifier("export-status")
        }
        if let error = model.error { InlineMessage(text: error).accessibilityIdentifier("export-error") }
        if model.canDownload {
            Button { Task { await model.download() } } label: { Text("Download your archive") }
                .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("download-export")
        }
        Button { Task { await model.request() } } label: {
            if model.isWorking { ProgressView() } else { Text(model.requestTitle) }
        }
        .buttonStyle(model.canDownload ? AnyButtonStyle(QuietButtonStyle()) : AnyButtonStyle(PrimaryButtonStyle()))
        .disabled(model.isWorking || model.status == "pending")
        .accessibilityIdentifier("request-export")
        Text("The file stays on this device only while you share it, then it is deleted.")
            .font(Typography.caption).foregroundStyle(Theme.textMuted)
    }
}

struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// The system share/save sheet. `onFinish` runs when it closes, whatever the outcome.
struct ShareSheet: UIViewControllerRepresentable {
    let file: URL
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in onFinish() }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
