import Foundation
import PaldoraKit
import UIKit

enum LoadedImage {
    case image(UIImage)
    /// 404 (or an undecodable body): show the neutral placeholder.
    case unavailable
    case failed
    /// 429: backed off for a while; offer a retry rather than a permanent failure.
    case rateLimited
    /// The session ended. The loader has already told the app (`onSessionEnded`).
    case sessionEnded
}

/// In-memory image cache with in-flight de-duplication. Private bytes are never
/// written to disk and no URLs are kept. Cancelling every waiter of a request
/// cancels the underlying fetch.
@MainActor
final class ImageLoader {
    private struct Key: Hashable { let id: String; let variant: MediaVariant }

    private final class Flight: @unchecked Sendable {
        let task: Task<LoadedImage, Never>
        var waiters = 0
        init(task: Task<LoadedImage, Never>) { self.task = task }
    }

    private let client: any MediaClient
    private let cache = NSCache<NSString, UIImage>()
    private var flights: [Key: Flight] = [:]
    private var misses: [Key: Date] = [:]
    private var backoffs: [Key: Date] = [:]
    private var sessionHasEnded = false
    private let missTTL: TimeInterval
    private let backoffTTL: TimeInterval
    /// Called once when a token refresh could not rescue a 401.
    var onSessionEnded: (@MainActor () -> Void)?
    private let now: () -> Date
    private(set) var fetchCount = 0

    init(client: any MediaClient, missTTL: TimeInterval = 30, backoffTTL: TimeInterval = 45,
         now: @escaping () -> Date = Date.init) {
        self.client = client
        self.missTTL = missTTL
        self.backoffTTL = backoffTTL
        self.now = now
        cache.countLimit = 200
        cache.totalCostLimit = 64 * 1024 * 1024
    }

    func cached(_ id: String, _ variant: MediaVariant) -> UIImage? {
        cache.object(forKey: Self.name(Key(id: id, variant: variant)))
    }

    func clear() {
        cache.removeAllObjects()
        misses.removeAll()
        backoffs.removeAll()
        flights.values.forEach { $0.task.cancel() }
        flights.removeAll()
    }

    /// A user-initiated retry: forget any remembered miss or backoff for this image.
    func retry(_ id: String, _ variant: MediaVariant) {
        let key = Key(id: id, variant: variant)
        misses[key] = nil
        backoffs[key] = nil
    }

    func image(_ id: String, _ variant: MediaVariant) async -> LoadedImage {
        let key = Key(id: id, variant: variant)
        if sessionHasEnded { return .sessionEnded }
        if let hit = cache.object(forKey: Self.name(key)) { return .image(hit) }
        if let until = backoffs[key], until > now() { return .rateLimited }
        if let missedAt = misses[key], now().timeIntervalSince(missedAt) < missTTL { return .unavailable }
        let flight = flights[key] ?? start(key)
        flight.waiters += 1
        let result = await withTaskCancellationHandler {
            await flight.task.value
        } onCancel: {
            Task { @MainActor in self.release(key, flight) }
        }
        if !Task.isCancelled { release(key, flight, finished: true) }
        if case .sessionEnded = result, !sessionHasEnded {
            sessionHasEnded = true
            clear()
            onSessionEnded?()
        }
        return result
    }

    private func start(_ key: Key) -> Flight {
        fetchCount += 1
        let client = client
        let task = Task { [weak self] () -> LoadedImage in
            do {
                let data = try await client.fetch(assetId: key.id, variant: key.variant)
                guard let image = UIImage(data: data) else { return .unavailable }
                self?.store(image, key: key, bytes: data.count)
                return .image(image)
            } catch let error as MediaError {
                if error == .unavailable { self?.misses[key] = self?.now() }
                switch error {
                case .unauthenticated: return .sessionEnded
                case .unavailable: return .unavailable
                case .rateLimited:
                    self?.backoffs[key] = (self?.now() ?? Date()).addingTimeInterval(self?.backoffTTL ?? 45)
                    return .rateLimited
                default: return .failed
                }
            } catch {
                return .failed
            }
        }
        let flight = Flight(task: task)
        flights[key] = flight
        return flight
    }

    private func store(_ image: UIImage, key: Key, bytes: Int) {
        cache.setObject(image, forKey: Self.name(key), cost: bytes)
    }

    private func release(_ key: Key, _ flight: Flight, finished: Bool = false) {
        flight.waiters = max(0, flight.waiters - 1)
        guard flight.waiters == 0, flights[key] === flight else { return }
        if !finished { flight.task.cancel() }
        flights[key] = nil
    }

    private static func name(_ key: Key) -> NSString { "\(key.id)/\(key.variant.rawValue)" as NSString }
}
