import CoreGraphics
import Foundation
import ImageIO
import PaldoraKit
import Testing
import UIKit
@testable import Paldora

// MARK: URLSession client

final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var seen: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.seen.append(request)
        let (status, body) = Self.handler?(request) ?? (500, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

struct StubTokens: IDTokenProvider {
    let refreshes = Ref<[Bool]>([])
    func idToken(forceRefresh: Bool) async throws -> String {
        refreshes.value.append(forceRefresh)
        return forceRefresh ? "fresh" : "stale"
    }
}

@Suite(.serialized)
struct URLSessionMediaClientTests {
    private func client(_ tokens: StubTokens = StubTokens()) -> URLSessionMediaClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        StubURLProtocol.seen = []
        return URLSessionMediaClient(baseURL: URL(string: "http://127.0.0.1:5001/demo-paldora/europe-west4")!,
                                     tokens: tokens, session: URLSession(configuration: configuration))
    }

    @Test func readSendsBearerAndNeverCaches() async throws {
        StubURLProtocol.handler = { _ in (200, Data([1, 2, 3])) }
        let data = try await client().fetch(assetId: "abc-1", variant: .thumbnail)
        #expect(data == Data([1, 2, 3]))
        let request = try #require(StubURLProtocol.seen.first)
        #expect(request.url?.absoluteString == "http://127.0.0.1:5001/demo-paldora/europe-west4/mediaRead/abc-1/thumbnail")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale")
        #expect(request.cachePolicy == .reloadIgnoringLocalCacheData)
        #expect(URLSessionMediaClient.makeSession().configuration.urlCache == nil)
    }

    @Test func notFoundIsUnavailableWithoutExplanation() async {
        StubURLProtocol.handler = { _ in (404, Data("{}".utf8)) }
        await #expect(throws: MediaError.unavailable) { try await client().fetch(assetId: "x", variant: .display) }
    }

    @Test func unauthorizedRefreshesTheTokenOnceThenSucceeds() async throws {
        let tokens = StubTokens()
        StubURLProtocol.handler = { $0.value(forHTTPHeaderField: "Authorization") == "Bearer fresh" ? (200, Data([9])) : (401, Data()) }
        #expect(try await client(tokens).fetch(assetId: "x", variant: .display) == Data([9]))
        #expect(tokens.refreshes.value == [false, true])
    }

    @Test func secondUnauthorizedMeansSessionEnded() async {
        StubURLProtocol.handler = { _ in (401, Data()) }
        await #expect(throws: MediaError.unauthenticated) { try await client().fetch(assetId: "x", variant: .display) }
    }

    @Test func statusMapping() {
        #expect(URLSessionMediaClient.error(for: 429) == .rateLimited)
        #expect(URLSessionMediaClient.error(for: 400) == .rejected)
        #expect(URLSessionMediaClient.error(for: 413) == .rejected)
        #expect(URLSessionMediaClient.error(for: 503) == .transient)
    }

    @Test func uploadUsesReservedContentTypeAndPath() async throws {
        StubURLProtocol.handler = { _ in (204, Data()) }
        let reservation = try JSONDecoder().decode(CreateMediaUploadResponse.self, from: JSON.reservation(id: "m7"))
        try await client().upload(reservation, data: Data(repeating: 1, count: 100)) { _ in }
        let request = try #require(StubURLProtocol.seen.first)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.lastPathComponent == "m7")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "image/jpeg")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer stale")
    }

    @Test func unsafePathsAreRefused() {
        #expect(URLSessionMediaClient.url(base: URL(string: "http://h")!, function: "mediaRead", path: "/a/../b") == nil)
        #expect(URLSessionMediaClient.url(base: URL(string: "http://h")!, function: "x/y", path: "/a") == nil)
    }

    @Test func hostedAndEmulatorBaseURLs() {
        #expect(AppConfiguration.functionsBaseURL(for: .emulator)?.absoluteString == "http://127.0.0.1:5001/demo-paldora/europe-west4")
        let hosted = HostedFirebaseConfig(projectID: "paldora-dev", apiKey: "k", appID: "a", gcmSenderID: "1")
        #expect(AppConfiguration.functionsBaseURL(for: .hosted(hosted))?.absoluteString == "https://europe-west4-paldora-dev.cloudfunctions.net")
    }
}

// MARK: Image loader

@MainActor
struct ImageLoaderTests {
    @Test func cachesInMemoryAndFetchesOnce() async {
        let media = FakeMediaClient()
        let loader = ImageLoader(client: media)
        async let a = loader.image("a", .thumbnail)
        async let b = loader.image("a", .thumbnail)
        _ = await (a, b)
        _ = await loader.image("a", .thumbnail)
        #expect(media.fetches == ["a/thumbnail"])
        #expect(loader.cached("a", .thumbnail) != nil)
        loader.clear()
        #expect(loader.cached("a", .thumbnail) == nil)
    }

    @Test func notFoundIsAPlaceholderAndBrieflyRemembered() async {
        let media = FakeMediaClient { _, _ in throw MediaError.unavailable }
        var clock = Date(timeIntervalSince1970: 0)
        let loader = ImageLoader(client: media, missTTL: 30, now: { clock })
        guard case .unavailable = await loader.image("gone", .display) else { Issue.record("expected unavailable"); return }
        _ = await loader.image("gone", .display)
        #expect(media.fetches.count == 1)
        clock = Date(timeIntervalSince1970: 31)
        _ = await loader.image("gone", .display)
        #expect(media.fetches.count == 2)
    }

    @Test func cancellingTheOnlyWaiterCancelsTheFetch() async {
        let cancelled = Ref(false)
        let media = FakeMediaClient { _, _ in
            do { try await Task.sleep(for: .seconds(30)) } catch { cancelled.value = true; throw error }
            return Data()
        }
        let loader = ImageLoader(client: media)
        let task = Task { await loader.image("slow", .thumbnail) }
        try? await Task.sleep(for: .milliseconds(50))
        task.cancel()
        _ = await task.value
        try? await Task.sleep(for: .milliseconds(50))
        #expect(cancelled.value)
        #expect(loader.cached("slow", .thumbnail) == nil)
    }

    @Test func sessionEndedIsSurfaced() async {
        let loader = ImageLoader(client: FakeMediaClient { _, _ in throw MediaError.unauthenticated })
        guard case .sessionEnded = await loader.image("a", .display) else { Issue.record("expected sessionEnded"); return }
    }

    @Test func initialsFallback() {
        #expect(AvatarView.initials("Mira Rose") == "MR")
        #expect(AvatarView.initials("kai") == "K")
        #expect(AvatarView.initials("") == "P")
    }
}

// MARK: Image preparation

struct ImagePreparerTests {
    static func sourceJPEG(width: Int, height: Int, withGPS: Bool) -> Data {
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { ctx in
            UIColor.systemOrange.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }.cgImage!
        let out = NSMutableData()
        let destination = CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil)!
        var properties: [CFString: Any] = [:]
        if withGPS {
            properties[kCGImagePropertyGPSDictionary] = [kCGImagePropertyGPSLatitude: 52.52, kCGImagePropertyGPSLatitudeRef: "N",
                                                         kCGImagePropertyGPSLongitude: 13.40, kCGImagePropertyGPSLongitudeRef: "E"]
            properties[kCGImagePropertyExifDictionary] = [kCGImagePropertyExifUserComment: "secret"]
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        CGImageDestinationFinalize(destination)
        return out as Data
    }

    static func properties(_ data: Data) -> [CFString: Any] {
        let source = CGImageSourceCreateWithData(data as CFData, nil)!
        return (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]
    }

    @Test func stripsLocationAndOtherMetadata() throws {
        let source = Self.sourceJPEG(width: 400, height: 300, withGPS: true)
        #expect(Self.properties(source)[kCGImagePropertyGPSDictionary] != nil)
        let prepared = try ImagePreparer.prepare(source)
        let output = Self.properties(prepared.data)
        #expect(output[kCGImagePropertyGPSDictionary] == nil)
        let exif = output[kCGImagePropertyExifDictionary] as? [CFString: Any]
        #expect(exif?[kCGImagePropertyExifUserComment] == nil)
        #expect(prepared.contentType == "image/jpeg")
    }

    @Test func downscalesTheLongEdge() throws {
        let prepared = try ImagePreparer.prepare(Self.sourceJPEG(width: 3000, height: 2000, withGPS: false), maxLongEdge: 1000)
        #expect(max(prepared.width, prepared.height) == 1000)
        #expect(prepared.width > prepared.height)
    }

    @Test func respectsTheByteBudgetOrFails() throws {
        let source = Self.sourceJPEG(width: 2000, height: 2000, withGPS: false)
        #expect(try ImagePreparer.prepare(source, maxBytes: 5_000_000).data.count <= 5_000_000)
        #expect(throws: ImagePreparationError.tooLarge) { try ImagePreparer.prepare(source, maxBytes: 10) }
    }

    @Test func unreadableInputFails() {
        #expect(throws: ImagePreparationError.unreadable) { try ImagePreparer.prepare(Data("not an image".utf8)) }
    }
}
