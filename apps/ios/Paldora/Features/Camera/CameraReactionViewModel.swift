import AVFoundation
import Foundation
import Observation
import PaldoraKit

/// Camera reaction: capture, upload as `reaction_image`, then `setBoxReaction`
/// with the asset id. One reaction per person per post; this replaces an emoji one.
@MainActor
@Observable
final class CameraReactionViewModel {
    enum Phase: Equatable {
        case idle
        case denied
        case unavailable
        case live
        case captured
        case sending
        case done
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var capturedData: Data?
    let attachments: PhotoAttachments
    private(set) var sentAssetId: String?
    private let env: FeatureEnvironment
    private let route: PostRoute
    private let camera: any CameraProvider

    init(env: FeatureEnvironment, route: PostRoute, camera: any CameraProvider, timing: UploadTiming = UploadTiming()) {
        self.env = env
        self.route = route
        self.camera = camera
        attachments = PhotoAttachments(env: env, purpose: .reactionImage(boxId: route.boxId), limit: 1, timing: timing)
    }

    var previewSession: AVCaptureSession? { camera.previewSession }

    /// Checks the device and the permission, asking once if it was never decided.
    func prepare() async {
        guard camera.isAvailable else { phase = .unavailable; return }
        switch camera.permission {
        case .denied: phase = .denied
        case .authorized: await startPreview()
        case .notDetermined:
            if await camera.requestAccess() { await startPreview() } else { phase = .denied }
        }
    }

    private func startPreview() async {
        do {
            try await camera.start()
            phase = .live
        } catch {
            phase = .unavailable
        }
    }

    func capture() async {
        guard phase == .live else { return }
        do {
            capturedData = try await camera.capture()
            camera.stop()
            phase = .captured
        } catch {
            phase = .failed("The photo couldn't be taken. Try again.")
        }
    }

    func retake() async {
        capturedData = nil
        attachments.clear()
        await prepare()
    }

    func send() async {
        guard phase == .captured || isFailed, let data = capturedData else { return }
        phase = .sending
        attachments.clear()
        attachments.add([data])
        await attachments.settled()
        guard let assetId = attachments.readyAssetIds.first else {
            if case .failed(let message) = attachments.items.first?.state { phase = .failed(message) } else { phase = .failed(UserMessages.generic) }
            return
        }
        do {
            _ = try await env.api.setBoxReaction(SetBoxReactionRequest(
                boxId: route.boxId, postId: route.postId, mediaAssetId: assetId, kind: SetBoxReactionRequest.realKind))
            sentAssetId = assetId
            phase = .done
        } catch {
            phase = .failed(env.message(for: error))
        }
    }

    func stop() { camera.stop() }

    private var isFailed: Bool {
        if case .failed = phase { true } else { false }
    }

    var canRetrySend: Bool { isFailed && capturedData != nil }
}
