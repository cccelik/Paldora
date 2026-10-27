import FirebaseFunctions
import Foundation
import PaldoraKit

/// `CallableTransport` over Firebase Functions in `europe-west4`.
/// Never logs or retains request or response bodies, tokens or emails.
struct FirebaseCallableTransport: CallableTransport {
    private let functions: Functions

    init(functions: Functions) {
        self.functions = functions
    }

    func call(_ name: CallableName, data: Data?) async throws -> Data {
        let payload: Any? = try data.map {
            try JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed])
        }
        do {
            let result = try await functions.httpsCallable(name.rawValue).call(payload)
            return try JSONSerialization.data(withJSONObject: result.data, options: [.fragmentsAllowed])
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw FunctionsErrorMapping.transportError(for: error as NSError)
        }
    }
}

/// Pure mapping from the SDK's `NSError` to `TransportError`.
enum FunctionsErrorMapping {
    static func transportError(for error: NSError) -> TransportError {
        if error.domain == FunctionsErrorDomain {
            let code = FunctionsErrorCode(rawValue: error.code).map(wireCode) ?? "unknown"
            return TransportError(code: code, reason: reason(from: error.userInfo[FunctionsErrorDetailsKey]))
        }
        if error.domain == NSURLErrorDomain {
            return TransportError(code: error.code == NSURLErrorTimedOut ? "deadline-exceeded" : "unavailable")
        }
        return TransportError(code: "unknown")
    }

    /// `details` is `{ reason: "…" }`; anything else is no reason.
    static func reason(from details: Any?) -> String? {
        (details as? [String: Any])?["reason"] as? String
    }

    static func wireCode(_ code: FunctionsErrorCode) -> String {
        switch code {
        case .OK: "ok"
        case .cancelled: "cancelled"
        case .unknown: "unknown"
        case .invalidArgument: "invalid-argument"
        case .deadlineExceeded: "deadline-exceeded"
        case .notFound: "not-found"
        case .alreadyExists: "already-exists"
        case .permissionDenied: "permission-denied"
        case .resourceExhausted: "resource-exhausted"
        case .failedPrecondition: "failed-precondition"
        case .aborted: "aborted"
        case .outOfRange: "out-of-range"
        case .unimplemented: "unimplemented"
        case .internal: "internal"
        case .unavailable: "unavailable"
        case .dataLoss: "data-loss"
        case .unauthenticated: "unauthenticated"
        @unknown default: "unknown"
        }
    }
}
