import Foundation
import PaldoraKit
import UIKit
@testable import Paldora

final class FakeMediaClient: MediaClient, @unchecked Sendable {
    typealias Fetch = @Sendable (String, MediaVariant) async throws -> Data
    private let lock = NSLock()
    private var _uploads: [(assetId: String, size: Int)] = []
    private var _fetches: [String] = []
    private var uploadError: MediaError?
    private var fetchHandler: Fetch

    init(fetch: @escaping Fetch = { _, _ in FakeMediaClient.pngData() }) { fetchHandler = fetch }

    var uploads: [(assetId: String, size: Int)] { lock.withLock { _uploads } }
    var fetches: [String] { lock.withLock { _fetches } }
    func failNextUpload(_ error: MediaError?) { lock.withLock { uploadError = error } }

    func upload(_ reservation: CreateMediaUploadResponse, data: Data,
                progress: @escaping @Sendable (Double) -> Void) async throws {
        progress(0.5)
        let failure = lock.withLock { () -> MediaError? in defer { uploadError = nil }; return uploadError }
        if let failure { throw failure }
        lock.withLock { _uploads.append((reservation.mediaAsset.id, data.count)) }
        progress(1)
    }

    func fetch(assetId: String, variant: MediaVariant) async throws -> Data {
        lock.withLock { _fetches.append("\(assetId)/\(variant.rawValue)") }
        return try await fetchHandler(assetId, variant)
    }

    func fetchExport(id: String) async throws -> Data {
        lock.withLock { _fetches.append("export/\(id)") }
        return try await exportHandler(id)
    }

    var exportHandler: @Sendable (String) async throws -> Data = { _ in Data("{\"archive\":true}".utf8) }

    static func pngData(width: Int = 8, height: Int = 8) -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).pngData { ctx in
            UIColor.systemTeal.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }
}

extension JSON {
    static func reservation(id: String = "m1", length: Int = 100) -> Data {
        data(["mediaAsset": ["id": id, "purpose": "post_image", "status": "pending", "contentType": "image/jpeg",
                             "contentLength": length, "createdAt": 1],
              "upload": ["method": "PUT", "function": "mediaUpload", "path": "/\(id)",
                         "headers": ["Content-Type": "image/jpeg"], "expiresAt": 2]])
    }

    static func asset(status: String, available: Bool, id: String = "m1") -> Data {
        data(["id": id, "purpose": "post_image", "status": status, "contentType": "image/jpeg", "contentLength": 100,
              "createdAt": 1, "available": available, "width": available ? 10 : NSNull(), "height": available ? 10 : NSNull()])
    }

    static func mediaAsset(id: String = "m1") -> Data {
        data(["id": id, "purpose": "post_image", "status": "processing", "contentType": "image/jpeg",
              "contentLength": 100, "createdAt": 1])
    }
}
