import Foundation
import PaldoraKit

/// Why a media byte request failed. Absence and denial are one case.
enum MediaError: Error, Equatable, Sendable {
    /// 404: unknown, not ready, or not allowed (indistinguishable).
    case unavailable
    /// 401 after one forced token refresh: the session ended.
    case unauthenticated
    case rateLimited
    /// 400 or 413: the bytes do not match the reservation.
    case rejected
    /// Network trouble or 5xx.
    case transient
}

/// Supplies the Firebase ID token for the Authorization header.
protocol IDTokenProvider: Sendable {
    func idToken(forceRefresh: Bool) async throws -> String
}

/// Authenticated media bytes (ADR 021 decision 8). Nothing here persists
/// bytes, tokens or URLs.
protocol MediaClient: Sendable {
    /// PUT the exact bytes the reservation describes.
    func upload(
        _ reservation: CreateMediaUploadResponse,
        data: Data,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws
    func fetch(assetId: String, variant: MediaVariant) async throws -> Data
    /// Streams the caller's latest ready account export (`accountExportDownload`) to
    /// `destination` on disk (complete file protection) without holding it in memory.
    /// 404 is `unavailable`.
    func downloadExport(id: String, to destination: URL) async throws
}

struct URLSessionMediaClient: MediaClient {
    private let baseURL: URL
    private let tokens: any IDTokenProvider
    private let session: URLSession

    /// `session` defaults to an ephemeral one with no URL cache, so private
    /// bytes never reach disk.
    init(baseURL: URL, tokens: any IDTokenProvider, session: URLSession? = nil) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session ?? Self.makeSession()
    }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }

    func upload(
        _ reservation: CreateMediaUploadResponse,
        data: Data,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws {
        guard reservation.upload.method == "PUT",
              let url = Self.url(base: baseURL, function: reservation.upload.function,
                                 path: reservation.upload.path) else { throw MediaError.rejected }
        let contentType = reservation.upload.headers.contentType
        let delegate = ProgressDelegate(total: data.count, progress: progress)
        let (_, response) = try await send(forceRefresh: false) { token in
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            request.cachePolicy = .reloadIgnoringLocalCacheData
            return try await session.upload(for: request, from: data, delegate: delegate)
        }
        guard response.statusCode == 204 else { throw Self.error(for: response.statusCode) }
        progress(1)
    }

    func fetch(assetId: String, variant: MediaVariant) async throws -> Data {
        guard Self.isSafeSegment(assetId),
              let url = Self.url(base: baseURL, function: "mediaRead", path: "/\(assetId)/\(variant.rawValue)")
        else { throw MediaError.unavailable }
        let (data, response) = try await send(forceRefresh: false) { token in
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.cachePolicy = .reloadIgnoringLocalCacheData
            return try await session.data(for: request)
        }
        guard response.statusCode == 200 else { throw Self.error(for: response.statusCode) }
        return data
    }

    func downloadExport(id: String, to destination: URL) async throws {
        guard Self.isSafeSegment(id),
              let url = Self.url(base: baseURL, function: "accountExportDownload", path: "/\(id)")
        else { throw MediaError.unavailable }
        let (file, response) = try await send(forceRefresh: false) { token in
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.cachePolicy = .reloadIgnoringLocalCacheData
            return try await session.download(for: request)
        }
        // The system's download file is ours to move; never leave it behind on failure.
        defer { try? FileManager.default.removeItem(at: file) }
        guard response.statusCode == 200 else { throw Self.error(for: response.statusCode) }
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: file, to: destination)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
    }

    /// Sends with the current token; on 401 refreshes the token once and retries.
    private func send<Body>(
        forceRefresh: Bool,
        _ perform: (String) async throws -> (Body, URLResponse)
    ) async throws -> (Body, HTTPURLResponse) {
        let token: String
        do { token = try await tokens.idToken(forceRefresh: forceRefresh) } catch { throw MediaError.unauthenticated }
        let data: Body
        let response: URLResponse
        do {
            (data, response) = try await perform(token)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw MediaError.transient
        }
        guard let http = response as? HTTPURLResponse else { throw MediaError.transient }
        if http.statusCode == 401, !forceRefresh {
            return try await send(forceRefresh: true, perform)
        }
        return (data, http)
    }

    static func error(for status: Int) -> MediaError {
        switch status {
        case 401: .unauthenticated
        case 404: .unavailable
        case 429: .rateLimited
        case 400, 413: .rejected
        default: .transient
        }
    }

    static func isSafeSegment(_ value: String) -> Bool {
        !value.isEmpty && value.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }

    static func url(base: URL, function: String, path: String) -> URL? {
        let segments = path.split(separator: "/").map(String.init)
        guard isSafeSegment(function), segments.allSatisfy(isSafeSegment) else { return nil }
        return segments.reduce(base.appendingPathComponent(function)) { $0.appendingPathComponent($1) }
    }
}

private final class ProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let total: Int
    private let progress: @Sendable (Double) -> Void

    init(total: Int, progress: @escaping @Sendable (Double) -> Void) {
        self.total = max(total, 1)
        self.progress = progress
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        progress(min(1, Double(totalBytesSent) / Double(total)))
    }
}

/// Used when no media client is configured: every request is unavailable.
struct UnavailableMediaClient: MediaClient {
    func upload(_ reservation: CreateMediaUploadResponse, data: Data,
                progress: @escaping @Sendable (Double) -> Void) async throws { throw MediaError.transient }
    func fetch(assetId: String, variant: MediaVariant) async throws -> Data { throw MediaError.unavailable }
    func downloadExport(id: String, to destination: URL) async throws { throw MediaError.unavailable }
}
