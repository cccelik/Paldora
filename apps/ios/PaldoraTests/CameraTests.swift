import AVFoundation
import Foundation
import PaldoraKit
import Testing
@testable import Paldora

final class FakeCamera: CameraProvider, @unchecked Sendable {
    var isAvailable = true
    var permission: CameraPermission = .authorized
    var grants = true
    var failCapture = false
    private(set) var started = 0
    private(set) var stopped = 0
    var previewSession: AVCaptureSession? { nil }
    func requestAccess() async -> Bool { if grants { permission = .authorized }; return grants }
    func start() async throws { started += 1 }
    func stop() { stopped += 1 }
    func capture() async throws -> Data {
        if failCapture { throw CameraError.captureFailed }
        return ImagePreparerTests.sourceJPEG(width: 300, height: 200, withGPS: true)
    }
}

@MainActor
struct CameraReactionTests {
    private let route = PostRoute(boxId: "b1", postId: "p1")

    private func harness(reactionFails: Ref<Bool> = Ref(false), reactions: Ref<[[String: Any]]> = Ref([]),
                         reservations: Ref<[[String: Any]]> = Ref([])) async -> FeatureHarness {
        await FeatureHarness(media: FakeMediaClient()) { name, data in
            switch name {
            case .createMediaUpload: reservations.append(JSON.body(data)); return JSON.reservation(id: "cam1")
            case .completeMediaUpload: return JSON.mediaAsset(id: "cam1")
            case .getMediaAsset: return JSON.asset(status: "ready", available: true, id: "cam1")
            case .setBoxReaction:
                reactions.append(JSON.body(data))
                if reactionFails.value { throw failure("resource-exhausted", "RATE_LIMITED") }
                return JSON.data(["ok": true])
            default: return JSON.page([])
            }
        }
    }

    @Test func noCameraAndDeniedAreClearStates() async {
        let h = await harness()
        let none = FakeCamera(); none.isAvailable = false
        let a = CameraReactionViewModel(env: h.env, route: route, camera: none)
        await a.prepare()
        #expect(a.phase == .unavailable)
        let denied = FakeCamera(); denied.permission = .denied
        let b = CameraReactionViewModel(env: h.env, route: route, camera: denied)
        await b.prepare()
        #expect(b.phase == .denied && denied.started == 0)
    }

    @Test func asksOnceWhenUndecidedThenGoesLiveOrDenied() async {
        let h = await harness()
        let granted = FakeCamera(); granted.permission = .notDetermined
        let a = CameraReactionViewModel(env: h.env, route: route, camera: granted)
        await a.prepare()
        #expect(a.phase == .live && granted.started == 1)
        let refused = FakeCamera(); refused.permission = .notDetermined; refused.grants = false
        let b = CameraReactionViewModel(env: h.env, route: route, camera: refused)
        await b.prepare()
        #expect(b.phase == .denied)
    }

    @Test func captureUploadsAsReactionImageThenSetsTheRealReaction() async {
        let reactions = Ref<[[String: Any]]>([])
        let reservations = Ref<[[String: Any]]>([])
        let h = await harness(reactions: reactions, reservations: reservations)
        let camera = FakeCamera()
        let model = CameraReactionViewModel(env: h.env, route: route, camera: camera, timing: .instant)
        await model.prepare()
        await model.capture()
        #expect(model.phase == .captured && camera.stopped == 1 && model.capturedData != nil)
        await model.send()
        #expect(model.phase == .done && model.sentAssetId == "cam1")
        #expect(reservations.value[0]["purpose"] as? String == "reaction_image" && reservations.value[0]["boxId"] as? String == "b1")
        #expect(reactions.value[0]["kind"] as? String == "real" && reactions.value[0]["mediaAssetId"] as? String == "cam1")
        #expect(reactions.value[0]["postId"] as? String == "p1")
    }

    @Test func failedSendCanBeRetriedAndCaptureFailureIsReported() async {
        let fails = Ref(true)
        let h = await harness(reactionFails: fails)
        let model = CameraReactionViewModel(env: h.env, route: route, camera: FakeCamera(), timing: .instant)
        await model.prepare()
        await model.capture()
        await model.send()
        #expect(model.phase == .failed(UserMessages.rateLimited) && model.canRetrySend)
        fails.value = false
        await model.send()
        #expect(model.phase == .done)
        let broken = FakeCamera(); broken.failCapture = true
        let other = CameraReactionViewModel(env: h.env, route: route, camera: broken, timing: .instant)
        await other.prepare()
        await other.capture()
        #expect(other.phase == .failed("The photo couldn't be taken. Try again."))
    }

    @Test func retakeReturnsToLive() async {
        let h = await harness()
        let model = CameraReactionViewModel(env: h.env, route: route, camera: FakeCamera(), timing: .instant)
        await model.prepare()
        await model.capture()
        await model.retake()
        #expect(model.phase == .live && model.capturedData == nil)
    }

    @Test func postDetailOnlyOffersCameraWhenThereIsOne() async {
        let h = await FeatureHarness { name, _ in name == .getBoxPost ? JSON.data(JSON.post()) : JSON.page([]) }
        let model = PostDetailViewModel(env: h.env, route: route)
        await model.load()
        #expect(!model.cameraAvailable)
    }
}
