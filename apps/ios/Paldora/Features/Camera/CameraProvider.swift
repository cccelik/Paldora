import AVFoundation
import Foundation

enum CameraPermission: Equatable, Sendable {
    case notDetermined, authorized, denied
}

enum CameraError: Error, Equatable {
    case unavailable
    case captureFailed
}

/// Front-camera capture, behind a protocol so the state machine is testable
/// and the simulator (which has no camera) degrades cleanly.
protocol CameraProvider: AnyObject, Sendable {
    /// Whether this device has a front camera at all.
    var isAvailable: Bool { get }
    var permission: CameraPermission { get }
    /// The live preview session, nil for providers without one.
    var previewSession: AVCaptureSession? { get }
    func requestAccess() async -> Bool
    func start() async throws
    func stop()
    /// One JPEG frame. Never touches the photo library.
    func capture() async throws -> Data
}

final class UnavailableCamera: CameraProvider {
    var isAvailable: Bool { false }
    var permission: CameraPermission { .denied }
    var previewSession: AVCaptureSession? { nil }
    func requestAccess() async -> Bool { false }
    func start() async throws { throw CameraError.unavailable }
    func stop() {}
    func capture() async throws -> Data { throw CameraError.unavailable }
}

/// AVFoundation front camera. Capture only; nothing is written to disk or the library.
final class AVCameraProvider: NSObject, CameraProvider, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "app.paldora.camera")
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Data, Error>?
    private var configured = false

    var previewSession: AVCaptureSession? { session }

    var isAvailable: Bool {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil
    }

    var permission: CameraPermission {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: .authorized
        case .notDetermined: .notDetermined
        default: .denied
        }
    }

    func requestAccess() async -> Bool { await AVCaptureDevice.requestAccess(for: .video) }

    func start() async throws {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            queue.async {
                do {
                    try self.configureIfNeeded()
                    if !self.session.isRunning { self.session.startRunning() }
                    done.resume()
                } catch { done.resume(throwing: error) }
            }
        }
    }

    func stop() {
        queue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    private func configureIfNeeded() throws {
        guard !configured else { return }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device) else { throw CameraError.unavailable }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(output) else { throw CameraError.unavailable }
        session.addInput(input)
        session.addOutput(output)
        configured = true
    }

    func capture() async throws -> Data {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Data, Error>) in
            lock.withLock { continuation = done }
            queue.async {
                let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                self.output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let done = lock.withLock { () -> CheckedContinuation<Data, Error>? in defer { continuation = nil }; return continuation }
        if error != nil { done?.resume(throwing: CameraError.captureFailed); return }
        if let data = photo.fileDataRepresentation() { done?.resume(returning: data) } else { done?.resume(throwing: CameraError.captureFailed) }
    }
}

#if DEBUG
/// UI-test camera, enabled only by `PALDORA_UI_TEST_IMAGE=1` in DEBUG builds:
/// reports a camera, grants access and "captures" a generated image.
final class DebugCamera: CameraProvider {
    var isAvailable: Bool { true }
    var permission: CameraPermission { .authorized }
    var previewSession: AVCaptureSession? { nil }
    func requestAccess() async -> Bool { true }
    func start() async throws {}
    func stop() {}
    func capture() async throws -> Data { DebugTestImage.jpeg() }
}
#endif
