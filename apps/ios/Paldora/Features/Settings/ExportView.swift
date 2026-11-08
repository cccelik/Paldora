import SwiftUI
import UIKit

struct ExportView: View {
    @State private var model: ExportViewModel

    init(env: FeatureEnvironment) { _model = State(initialValue: ExportViewModel(env: env)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                PaldoraScreenTitle(eyebrow: "Your data", title: "Take a copy", accent: "with you.",
                                   subtitle: "A private JSON archive of your profile, posts, comments, reactions, Room settings and owned media details. Other people's private content isn't included.")
                switch model.phase {
                case .loading: LoadingBlock(label: "Checking your archive", compact: true)
                case .failed(let message): ErrorBlock(message: message) { await model.load() }
                case .ready: content
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Your data")
        .task { await model.load() }
        .sheet(isPresented: Binding(get: { model.preparedFile != nil }, set: { if !$0 { model.finishSharing() } })) {
            if let file = model.preparedFile { ShareSheet(file: file) { model.finishSharing() }.ignoresSafeArea() }
        }
    }

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if model.status == "pending" { PaldoraSkeleton(height: 8, radius: 4).accessibilityHidden(true) }
            Text(model.statusText).paldoraText(.bodyL).foregroundStyle(Theme.textPrimary)
                .accessibilityIdentifier("export-status")
        }
        .padding(Theme.space4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
        .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radiusLg))
        if let error = model.error { PaldoraBanner(tone: .danger, title: error).accessibilityIdentifier("export-error") }
        if model.canDownload {
            PaldoraButton("Download your archive", size: .medium, icon: .download, fullWidth: true) { Task { await model.download() } }
                .accessibilityIdentifier("download-export")
        }
        PaldoraButton(model.requestTitle, kind: model.canDownload ? .secondary : .primary, size: .medium,
                      isLoading: model.isWorking, fullWidth: true) { Task { await model.request() } }
            .disabled(model.isWorking || model.status == "pending")
            .accessibilityIdentifier("request-export")
        Text("The file stays on this device only while you share it, then it is deleted.")
            .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
    }
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
