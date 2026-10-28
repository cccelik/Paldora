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
        NavigationStack {
            VStack(spacing: Theme.space4) {
                content
                Spacer(minLength: 0)
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle("Camera reaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { model.stop(); dismiss() } } }
        }
        .task { await model.prepare() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .idle: ProgressView("Opening the camera")
        case .unavailable:
            notice("No camera is available on this device.", icon: "camera.slash")
        case .denied:
            notice("Camera access is off. Turn it on for Paldora in Settings to react with a photo. Nothing is saved to your library.", icon: "camera.badge.ellipsis")
            if let url = URL(string: UIApplication.openSettingsURLString) {
                Link("Open Settings", destination: url).font(Typography.label).frame(minHeight: Theme.touchTarget)
                    .accessibilityIdentifier("open-camera-settings")
            }
        case .live:
            preview
            Button("Take photo") { Task { await model.capture() } }
                .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("take-photo")
        case .captured, .sending, .failed:
            captured
        case .done:
            InlineMessage(text: "Your camera reaction was sent.", kind: .success).accessibilityIdentifier("camera-sent")
        }
    }

    @ViewBuilder private var preview: some View {
        if let session = model.previewSession {
            CameraPreview(session: session).frame(height: 320).clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .accessibilityLabel("Front camera preview")
        } else {
            Theme.highlight.frame(height: 320).clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(Text("Test camera").foregroundStyle(Theme.textMuted))
        }
    }

    @ViewBuilder private var captured: some View {
        if let data = model.capturedData, let image = UIImage(data: data) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 320)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius)).accessibilityLabel("Your photo")
        }
        if case .failed(let message) = model.phase { InlineMessage(text: message).accessibilityIdentifier("camera-error") }
        HStack(spacing: Theme.space3) {
            Button("Retake") { Task { await model.retake() } }.buttonStyle(QuietButtonStyle())
                .disabled(model.phase == .sending).accessibilityIdentifier("retake-photo")
            Button { Task { await model.send(); if let id = model.sentAssetId { onSent(id) } } } label: {
                if model.phase == .sending { ProgressView() } else { Text(model.canRetrySend ? "Try again" : "Send reaction") }
            }
            .buttonStyle(PrimaryButtonStyle()).disabled(model.phase == .sending).accessibilityIdentifier("send-camera-reaction")
        }
    }

    private func notice(_ text: String, icon: String) -> some View {
        VStack(spacing: Theme.space3) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(Theme.textMuted).accessibilityHidden(true)
            Text(text).font(Typography.body).foregroundStyle(Theme.text).multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .combine).accessibilityIdentifier("camera-notice")
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
