import AVFoundation
import SwiftUI
import UIKit

struct CameraReactionSheet: View {
    @State private var model: CameraReactionViewModel
    let onSent: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    init(model: CameraReactionViewModel, onSent: @escaping (String) -> Void) {
        _model = State(initialValue: model)
        self.onSent = onSent
    }

    var body: some View {
        VStack(spacing: 0) {
            PaldoraNavBar(title: "Camera reaction", leading: .close { model.stop(); dismiss() })
                .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space2)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space4) {
                    PaldoraScreenTitle(eyebrow: "Real reaction", title: "Your face,", accent: "right now.",
                                       subtitle: "Only the people in this Box will see it.")
                    content
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space5)
                .frame(maxWidth: .infinity)
            }
        }
        .paldoraCanvas()
        .task { await model.prepare() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .idle: PaldoraSkeleton(height: 320, radius: Theme.radius).accessibilityLabel("Opening the camera")
        case .unavailable:
            PaldoraStateView(icon: .camera, tone: .info, title: "No camera",
                             message: "No camera is available on this device.")
                .accessibilityIdentifier("camera-notice")
        case .denied:
            PaldoraStateView(icon: .camera, tone: .warning, title: "Camera is off",
                             message: "Turn it on for Paldora in Settings to react with a photo. Nothing is saved to your library.") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    Link(destination: url) { Text("Open Settings") }
                        .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .medium))
                        .accessibilityIdentifier("open-camera-settings")
                }
            }
            .accessibilityIdentifier("camera-notice")
        case .live:
            preview
            PaldoraButton("Take photo", icon: .camera, fullWidth: true) { Task { await model.capture() } }
                .accessibilityIdentifier("take-photo")
        case .captured, .sending, .failed:
            captured
        case .done:
            PaldoraBanner(tone: .success, title: "Your camera reaction was sent.").accessibilityIdentifier("camera-sent")
        }
    }

    @ViewBuilder private var preview: some View {
        if let session = model.previewSession {
            CameraPreview(session: session).frame(height: 320).clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .accessibilityLabel("Front camera preview")
        } else {
            Theme.brassSoft.frame(height: 320).clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(Text("Test camera").paldoraText(.bodyM).foregroundStyle(Theme.textSecondary))
        }
    }

    @ViewBuilder private var captured: some View {
        if let data = model.capturedData, let image = UIImage(data: data) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 320)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius)).accessibilityLabel("Your photo")
        }
        if case .failed(let message) = model.phase {
            PaldoraBanner(tone: .danger, title: message).accessibilityIdentifier("camera-error")
        }
        HStack(spacing: Theme.space3) {
            PaldoraButton("Retake", kind: .secondary, size: .medium) { Task { await model.retake() } }
                .disabled(model.phase == .sending).accessibilityIdentifier("retake-photo")
            PaldoraButton(model.canRetrySend ? "Try again" : "Send reaction", size: .medium,
                          isLoading: model.phase == .sending, fullWidth: true) {
                Task { await model.send(); if let id = model.sentAssetId { onSent(id) } }
            }
            .disabled(model.phase == .sending).accessibilityIdentifier("send-camera-reaction")
        }
    }
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {}
}
