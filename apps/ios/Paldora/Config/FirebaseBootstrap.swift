import FirebaseAuth
import FirebaseCore
import FirebaseFunctions
import Foundation

/// Starts Firebase programmatically (no GoogleService-Info.plist).
enum FirebaseBootstrap {
    /// Returns nil on success, or the reason Firebase must not be used.
    @MainActor
    static func start(_ setup: FirebaseSetup) -> ConfigurationIssue? {
        switch setup {
        case .emulator:
            #if DEBUG
            let options = FirebaseOptions(
                googleAppID: "1:000000000000:ios:0000000000000000",
                gcmSenderID: "000000000000"
            )
            options.apiKey = "demo-api-key"
            options.projectID = AppConfiguration.emulatorProjectID
            FirebaseApp.configure(options: options)
            guard let app = FirebaseApp.app() else { return .startupFailed }
            Auth.auth(app: app).useEmulator(withHost: AppConfiguration.emulatorHost, port: 9099)
            Functions.functions(app: app, region: AppConfiguration.functionsRegion)
                .useEmulator(withHost: AppConfiguration.emulatorHost, port: 5001)
            return nil
            #else
            return .emulatorOrDemoRefused
            #endif
        case .hosted(let config):
            let options = FirebaseOptions(googleAppID: config.appID, gcmSenderID: config.gcmSenderID)
            options.apiKey = config.apiKey
            options.projectID = config.projectID
            FirebaseApp.configure(options: options)
            return FirebaseApp.app() == nil ? .startupFailed : nil
        }
    }
}
