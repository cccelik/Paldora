import FirebaseFunctions
import Foundation
import PaldoraKit
import Testing
@testable import Paldora

struct ConfigurationTests {
    @Test func debugUsesEmulator() {
        #expect(AppConfiguration.resolve(info: [:], isDebugBuild: true) == .success(.emulator))
    }

    @Test func releaseWithUnsetPlaceholdersIsNotConfigured() {
        let unset: [String: Any] = [
            AppConfiguration.projectKey: "", AppConfiguration.apiKeyKey: "$(PALDORA_HOSTED_API_KEY)",
            AppConfiguration.appIDKey: "", AppConfiguration.senderKey: "",
        ]
        #expect(AppConfiguration.resolve(info: unset, isDebugBuild: false) == .failure(.hostedNotConfigured))
        #expect(AppConfiguration.resolve(info: [:], isDebugBuild: false) == .failure(.hostedNotConfigured))
    }

    @Test func releaseRefusesDemoProjectAndEmulatorHosts() {
        func info(project: String, key: String = "k") -> [String: Any] {
            [AppConfiguration.projectKey: project, AppConfiguration.apiKeyKey: key,
             AppConfiguration.appIDKey: "1:1:ios:1", AppConfiguration.senderKey: "1"]
        }
        #expect(AppConfiguration.resolve(info: info(project: "demo-paldora"), isDebugBuild: false) == .failure(.emulatorOrDemoRefused))
        #expect(AppConfiguration.resolve(info: info(project: "paldora-dev", key: "127.0.0.1:9099"), isDebugBuild: false) == .failure(.emulatorOrDemoRefused))
    }

    @Test func releaseAcceptsCompleteHostedConfig() {
        let info: [String: Any] = [
            AppConfiguration.projectKey: "paldora-dev", AppConfiguration.apiKeyKey: "key",
            AppConfiguration.appIDKey: "1:1:ios:1", AppConfiguration.senderKey: "1",
        ]
        let expected = HostedFirebaseConfig(projectID: "paldora-dev", apiKey: "key", appID: "1:1:ios:1", gcmSenderID: "1")
        #expect(AppConfiguration.resolve(info: info, isDebugBuild: false) == .success(.hosted(expected)))
    }

    @Test func shippedInfoPlistHasNoHostedProject() {
        let info = Bundle(for: Anchor.self).infoDictionary ?? [:]
        _ = info // The host app's plist is the real placeholder source.
        let app = Bundle(identifier: "com.paldora.app")?.infoDictionary ?? [:]
        #expect(AppConfiguration.resolve(info: app, isDebugBuild: false) == .failure(.hostedNotConfigured))
    }

    private final class Anchor {}
}

struct TransportErrorMappingTests {
    private func functionsError(_ code: FunctionsErrorCode, details: Any? = nil) -> NSError {
        var info: [String: Any] = [NSLocalizedDescriptionKey: "server text that must not be carried"]
        if let details { info[FunctionsErrorDetailsKey] = details }
        return NSError(domain: FunctionsErrorDomain, code: code.rawValue, userInfo: info)
    }

    @Test func mapsEveryFunctionsCodeToTheContractWireCode() {
        let expected: [FunctionsErrorCode] = [
            .OK, .cancelled, .unknown, .invalidArgument, .deadlineExceeded, .notFound, .alreadyExists,
            .permissionDenied, .unauthenticated, .resourceExhausted, .failedPrecondition, .aborted,
            .outOfRange, .unimplemented, .internal, .unavailable, .dataLoss,
        ]
        let wire = expected.map { FunctionsErrorMapping.transportError(for: functionsError($0)).code }
        #expect(Set(wire) == Set(PaldoraError.knownCodes))
        #expect(wire.allSatisfy { PaldoraError(code: $0).isRecognized })
    }

    @Test func carriesOnlyTheReason() {
        let error = FunctionsErrorMapping.transportError(
            for: functionsError(.resourceExhausted, details: ["reason": "RATE_LIMITED", "extra": "x"])
        )
        #expect(error == TransportError(code: "resource-exhausted", reason: "RATE_LIMITED"))
        #expect(PaldoraFailure(error).reason == .rateLimited)
    }

    @Test func malformedDetailsMeanNoReason() {
        #expect(FunctionsErrorMapping.transportError(for: functionsError(.internal, details: "oops")).reason == nil)
        #expect(FunctionsErrorMapping.transportError(for: functionsError(.internal, details: ["reason": 5])).reason == nil)
    }

    @Test func networkErrorsBecomeUnavailable() {
        let offline = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        let timeout = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
        #expect(FunctionsErrorMapping.transportError(for: offline).code == "unavailable")
        #expect(FunctionsErrorMapping.transportError(for: timeout).code == "deadline-exceeded")
    }
}
