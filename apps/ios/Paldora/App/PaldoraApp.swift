import AVFoundation
import FirebaseAuth
import FirebaseFunctions
import PaldoraKit
import SwiftUI

@main
struct PaldoraApp: App {
    @State private var model: AppModel

    @MainActor
    init() {
        _model = State(initialValue: Self.makeModel())
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
        }
    }

    /// Wires Firebase once, fail closed. Release builds without a hosted
    /// project (or with an emulator/demo project) never start Firebase.
    @MainActor
    private static func makeModel() -> AppModel {
        // The unit-test host must not start Firebase; tests build their own models.
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return AppModel(auth: nil, api: nil, configurationIssue: .startupFailed)
        }
        let info = Bundle.main.infoDictionary ?? [:]
        switch AppConfiguration.resolve(info: info, isDebugBuild: AppConfiguration.isDebugBuild) {
        case .failure(let issue):
            return AppModel(auth: nil, api: nil, configurationIssue: issue)
        case .success(let setup):
            if let issue = FirebaseBootstrap.start(setup) {
                return AppModel(auth: nil, api: nil, configurationIssue: issue)
            }
            let auth = FirebaseAuthService()
            #if DEBUG
            // UI tests start from a known signed-out state.
            if ProcessInfo.processInfo.environment["PALDORA_UI_RESET_SESSION"] == "1" {
                try? auth.signOut()
            }
            #endif
            let functions = Functions.functions(region: AppConfiguration.functionsRegion)
            let api = PaldoraAPI(transport: FirebaseCallableTransport(functions: functions))
            let media = AppConfiguration.functionsBaseURL(for: setup).map {
                URLSessionMediaClient(baseURL: $0, tokens: FirebaseTokenProvider())
            }
            var camera: any CameraProvider = AVCameraProvider()
            #if DEBUG
            // UI tests have no camera: a generated image stands in, DEBUG only.
            if ProcessInfo.processInfo.environment["PALDORA_UI_TEST_IMAGE"] == "1" { camera = DebugCamera() }
            #endif
            return AppModel(auth: auth, api: api, media: media, camera: camera)
        }
    }
}
