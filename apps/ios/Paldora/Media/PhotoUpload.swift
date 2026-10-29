import Foundation
import Observation
import PaldoraKit
import UIKit

/// What an upload is for. Post photos are Box-scoped; avatars are user-scoped.
enum UploadPurpose: Equatable, Sendable {
    case postImage(boxId: String)
    case avatar
    case lifeUpdate
    case roomBanner
    case reactionImage(boxId: String)

    var purpose: String {
        switch self {
        case .postImage: MediaPurpose.postImage
        case .avatar: MediaPurpose.avatar
        case .lifeUpdate: MediaPurpose.lifeUpdateImage
        case .roomBanner: MediaPurpose.roomBanner
        case .reactionImage: MediaPurpose.reactionImage
        }
    }

    var boxId: String? {
        switch self {
        case .postImage(let boxId), .reactionImage(let boxId): boxId
        default: nil
        }
    }
}

struct UploadTiming: Sendable {
    var pollInterval: Duration = .seconds(1)
    var maxPolls = 30
    static let instant = UploadTiming(pollInterval: .zero, maxPolls: 3)
}

/// One photo moving through prepare, reserve, upload, complete, and wait for
/// processing. A failure remembers its stage so retry resumes there.
@MainActor
@Observable
final class PhotoUpload: Identifiable {
    enum State: Equatable {
        case preparing
        case uploading(Double)
        /// Bytes are in; the server is making derivatives.
        case processing
        case ready(assetId: String)
        case failed(String)
    }

    private enum Stage { case prepare, reserve, upload, complete, poll }

    let id = UUID()
    let preview: UIImage?
    private(set) var state: State = .preparing
    private let original: Data
    private let purpose: UploadPurpose
    private let env: FeatureEnvironment
    private let timing: UploadTiming
    private var stage: Stage = .prepare
    private var prepared: PreparedImage?
    private var reservation: CreateMediaUploadResponse?
    private var assetId: String?
    private var task: Task<Void, Never>?
    private var cleanupToken: UUID?

    init(data: Data, purpose: UploadPurpose, env: FeatureEnvironment, timing: UploadTiming = UploadTiming()) {
        original = data
        preview = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 240, height: 240))
        self.purpose = purpose
        self.env = env
        self.timing = timing
    }

    var readyAssetId: String? {
        if case .ready(let id) = state { id } else { nil }
    }

    var isInFlight: Bool {
        switch state {
        case .preparing, .uploading, .processing: true
        case .ready, .failed: false
        }
    }

    func start() {
        guard task == nil else { return }
        cleanupToken = env.register { [weak self] in self?.cancel() }
        task = Task { [weak self] in
            await self?.run()
            self?.task = nil
            if let token = self?.cleanupToken { self?.env.unregister(token) }
        }
    }

    func retry() {
        guard case .failed = state, task == nil else { return }
        state = stage == .poll || stage == .complete ? .processing : .preparing
        start()
    }

    func cancel() {
        task?.cancel()
        task = nil
        // A cancelled upload is settled, never "in flight" forever.
        if isInFlight { state = .failed("Cancelled.") }
    }

    /// Runs from the current stage to the end, or to the first failure.
    func run() async {
        do {
            try Self.ensureActive(env)
            if stage == .prepare { try prepare() }
            if stage == .reserve { try await reserve(); try Self.ensureActive(env) }
            if stage == .upload { try await upload(); try Self.ensureActive(env) }
            if stage == .complete { try await complete(); try Self.ensureActive(env) }
            if stage == .poll { try await waitUntilReady() }
        } catch is CancellationError {
            return
        } catch {
            state = .failed(message(for: error))
        }
    }

    /// A session that ended stops every stage.
    private static func ensureActive(_ env: FeatureEnvironment) throws {
        if env.isInvalidated || Task.isCancelled { throw CancellationError() }
    }

    private func prepare() throws {
        do {
            prepared = try ImagePreparer.prepare(original)
        } catch ImagePreparationError.tooLarge {
            stage = .prepare
            throw UploadFailure("That photo is too large to upload.")
        } catch {
            throw UploadFailure("That photo couldn't be read.")
        }
        stage = .reserve
    }

    private func reserve() async throws {
        guard let prepared else { return }
        state = .uploading(0)
        reservation = try await env.api.createMediaUpload(CreateMediaUploadRequest(
            purpose: purpose.purpose, boxId: purpose.boxId,
            contentType: prepared.contentType, contentLength: prepared.data.count))
        stage = .upload
    }

    private func upload() async throws {
        guard let prepared, let reservation else { return }
        state = .uploading(0)
        do {
            try await env.media.upload(reservation, data: prepared.data) { [weak self] fraction in
                Task { @MainActor in
                    guard let self, case .uploading = self.state else { return }
                    self.state = .uploading(fraction)
                }
            }
        } catch let error as MediaError {
            // A rejected or consumed reservation cannot be reused; start over from a new one.
            if error == .rejected || error == .unavailable { stage = .reserve }
            throw error
        }
        assetId = reservation.mediaAsset.id
        stage = .complete
    }

    private func complete() async throws {
        guard let assetId else { return }
        state = .processing
        _ = try await env.api.completeMediaUpload(assetId: assetId)
        stage = .poll
    }

    private func waitUntilReady() async throws {
        guard let assetId else { return }
        state = .processing
        for attempt in 0..<timing.maxPolls {
            let details = try await env.api.getMediaAsset(assetId: assetId)
            if details.available || details.status == "ready" {
                state = .ready(assetId: assetId)
                return
            }
            if details.status == "failed" || details.status == "deleted" {
                stage = .prepare
                self.assetId = nil
                prepared = nil
                throw UploadFailure("That photo couldn't be processed. Choose it again.")
            }
            try Self.ensureActive(env)
            if attempt < timing.maxPolls - 1 { try await Task.sleep(for: timing.pollInterval) }
        }
        throw UploadFailure("Still processing. Try again in a moment.")
    }

    private func message(for error: any Error) -> String {
        if let failure = error as? UploadFailure { return failure.message }
        if let media = error as? MediaError {
            switch media {
            case .rateLimited: return UserMessages.rateLimited
            case .rejected, .unavailable: return "That photo couldn't be uploaded. Try again."
            case .unauthenticated: return env.message(for: PaldoraFailure(error: .unauthenticated, reason: .sessionEnded))
            case .transient: return UserMessages.unavailable
            }
        }
        return env.message(for: error)
    }
}

struct UploadFailure: Error {
    let message: String
    init(_ message: String) { self.message = message }
}
