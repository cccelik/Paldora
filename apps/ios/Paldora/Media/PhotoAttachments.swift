import Foundation
import Observation

/// Up to four photos being attached to one post (or one avatar being replaced).
@MainActor
@Observable
final class PhotoAttachments {
    static let postLimit = 4

    private(set) var items: [PhotoUpload] = []
    let purpose: UploadPurpose
    private let env: FeatureEnvironment
    private let limit: Int
    private let timing: UploadTiming

    init(env: FeatureEnvironment, purpose: UploadPurpose, limit: Int = PhotoAttachments.postLimit,
         timing: UploadTiming = UploadTiming()) {
        self.env = env
        self.purpose = purpose
        self.limit = limit
        self.timing = timing
    }

    var remaining: Int { max(0, limit - items.count) }
    var readyAssetIds: [String] { items.compactMap(\.readyAssetId) }
    var isBusy: Bool { items.contains { $0.isInFlight } }
    var hasFailure: Bool { items.contains { if case .failed = $0.state { true } else { false } } }

    /// Starts uploading each photo; extra photos beyond the limit are ignored.
    func add(_ photos: [Data]) {
        for data in photos.prefix(remaining) {
            let upload = PhotoUpload(data: data, purpose: purpose, env: env, timing: timing)
            items.append(upload)
            upload.start()
        }
    }

    func remove(_ upload: PhotoUpload) {
        upload.cancel()
        items.removeAll { $0.id == upload.id }
    }

    func clear() {
        items.forEach { $0.cancel() }
        items.removeAll()
    }

    /// Waits for every upload to settle (used by tests).
    func settled() async {
        while isBusy { try? await Task.sleep(for: .milliseconds(5)) }
    }
}
