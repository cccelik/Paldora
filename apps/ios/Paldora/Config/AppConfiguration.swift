import Foundation

/// Which Firebase project the app talks to. Pure value logic so the
/// fail-closed rules can be unit tested without Firebase.
struct HostedFirebaseConfig: Equatable, Sendable {
    let projectID: String
    let apiKey: String
    let appID: String
    let gcmSenderID: String
}

enum FirebaseSetup: Equatable, Sendable {
    /// DEBUG only: the local `demo-paldora` emulator suite.
    case emulator
    case hosted(HostedFirebaseConfig)
}

/// Why the app refuses to start Firebase. Shown on the "not configured" screen.
enum ConfigurationIssue: Error, Equatable, Sendable {
    /// No hosted project is configured (the expected state until the owner
    /// provisions one).
    case hostedNotConfigured
    /// A release build was given a `demo-*` project id or an emulator host.
    case emulatorOrDemoRefused
    /// Firebase failed to start for another reason.
    case startupFailed
}

enum AppConfiguration {
    static let emulatorProjectID = "demo-paldora"
    static let emulatorHost = "127.0.0.1"
    static let functionsRegion = "europe-west4"

    static let projectKey = "PaldoraHostedProjectID"
    static let apiKeyKey = "PaldoraHostedAPIKey"
    static let appIDKey = "PaldoraHostedAppID"
    static let senderKey = "PaldoraHostedGCMSenderID"

    /// DEBUG builds use the emulators. Everything else must come from the
    /// Info.plist placeholders, which are unset today, and may never point at
    /// an emulator host or a `demo-*` project.
    static func resolve(
        info: [String: Any],
        isDebugBuild: Bool
    ) -> Result<FirebaseSetup, ConfigurationIssue> {
        if isDebugBuild { return .success(.emulator) }
        let project = value(info, projectKey)
        let apiKey = value(info, apiKeyKey)
        let appID = value(info, appIDKey)
        let sender = value(info, senderKey)
        let all = [project, apiKey, appID, sender]
        if all.allSatisfy({ $0 == nil }) { return .failure(.hostedNotConfigured) }
        guard let project, let apiKey, let appID, let sender else {
            return .failure(.hostedNotConfigured)
        }
        if project.lowercased().hasPrefix("demo-") || all.compactMap({ $0 }).contains(where: isEmulatorLike) {
            return .failure(.emulatorOrDemoRefused)
        }
        return .success(.hosted(HostedFirebaseConfig(
            projectID: project, apiKey: apiKey, appID: appID, gcmSenderID: sender
        )))
    }

    /// Unset xcconfig values arrive as "", or as an unexpanded `$(NAME)`.
    private static func value(_ info: [String: Any], _ key: String) -> String? {
        guard let raw = (info[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty, !raw.hasPrefix("$(") else { return nil }
        return raw
    }

    private static func isEmulatorLike(_ text: String) -> Bool {
        let lowered = text.lowercased()
        return lowered.contains("127.0.0.1") || lowered.contains("localhost")
            || lowered.contains("0.0.0.0") || lowered.contains("emulator")
    }

    static var isDebugBuild: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
}
