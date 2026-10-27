import Foundation
import Observation
import PaldoraKit

/// Account data export: request, watch status, download through the
/// authenticated endpoint into a temporary file for the share sheet, then
/// delete that file.
@MainActor
@Observable
final class ExportViewModel {
    enum Phase: Equatable {
        case loading
        case ready(AccountExport?)
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var error: String?
    private(set) var isWorking = false
    /// The temporary file being shared; removed by `finishSharing()`.
    private(set) var preparedFile: URL?
    private let env: FeatureEnvironment
    private let directory: URL
    private let maxPolls: Int
    private let pollInterval: Duration

    init(env: FeatureEnvironment, directory: URL = FileManager.default.temporaryDirectory,
         maxPolls: Int = 20, pollInterval: Duration = .seconds(3)) {
        self.env = env
        self.directory = directory
        self.maxPolls = maxPolls
        self.pollInterval = pollInterval
    }

    var export: AccountExport? {
        if case .ready(let export) = phase { export } else { nil }
    }

    var status: String? { export?.status }

    func load() async {
        do { phase = .ready(try await env.api.getAccountExport()) } catch { phase = .failed(env.message(for: error)) }
        if status == "pending" { await waitUntilSettled() }
    }

    func request() async {
        guard !isWorking else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            phase = .ready(try await env.api.requestAccountExport())
        } catch {
            self.error = env.message(for: error)
            return
        }
        if status == "pending" { await waitUntilSettled() }
    }

    /// Polls a pending archive (bounded) until it is no longer pending.
    private func waitUntilSettled() async {
        for _ in 0..<maxPolls where status == "pending" {
            try? await Task.sleep(for: pollInterval)
            if Task.isCancelled { return }
            if let latest = try? await env.api.getAccountExport() { phase = .ready(latest) }
        }
    }

    var statusText: String {
        switch status {
        case nil: "No archive yet."
        case "pending": "Your archive is being prepared."
        case "ready": "Your archive is ready."
        case "expired": "Your last archive expired. Prepare a new one."
        default: "That archive couldn't be prepared. Prepare a new one."
        }
    }

    var canDownload: Bool { status == "ready" && !isWorking }
    var requestTitle: String { status == "ready" ? "Prepare a new archive" : "Request an archive" }

    /// Downloads the archive to a protected temp file and exposes it for sharing.
    func download() async {
        guard canDownload, let id = export?.id else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let data = try await env.media.fetchExport(id: id)
            let url = directory.appendingPathComponent("paldora-data-\(UUID().uuidString).json")
            try data.write(to: url, options: [.completeFileProtection, .atomic])
            preparedFile = url
        } catch MediaError.unavailable {
            // Unknown, expired, replaced and not-ready archives are the same answer.
            error = "That archive isn't available anymore. Prepare a new one."
            await load()
        } catch MediaError.unauthenticated {
            error = env.message(for: PaldoraFailure(error: .unauthenticated, reason: .sessionEnded))
        } catch MediaError.rateLimited {
            error = UserMessages.rateLimited
        } catch {
            self.error = UserMessages.unavailable
        }
    }

    /// Call when the share sheet closes: the private file must not outlive it.
    func finishSharing() {
        if let file = preparedFile { try? FileManager.default.removeItem(at: file) }
        preparedFile = nil
    }
}
