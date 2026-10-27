import Foundation

/// The `FunctionsErrorCode` a callable failed with. Never carries the server
/// message: messages are generic and must not be shown or parsed.
public enum PaldoraError: Error, Hashable, Sendable {
    case ok
    case cancelled
    case unknown
    case invalidArgument
    case deadlineExceeded
    case notFound
    case alreadyExists
    case permissionDenied
    case unauthenticated
    case resourceExhausted
    case failedPrecondition
    case aborted
    case outOfRange
    case unimplemented
    case `internal`
    case unavailable
    case dataLoss
    /// A code newer than this client; treat like `.unknown`.
    case unrecognized(String)

    /// The 17 codes of the contract, in contract order.
    public static let knownCodes: [String] = [
        "ok", "cancelled", "unknown", "invalid-argument", "deadline-exceeded",
        "not-found", "already-exists", "permission-denied", "unauthenticated",
        "resource-exhausted", "failed-precondition", "aborted", "out-of-range",
        "unimplemented", "internal", "unavailable", "data-loss",
    ]

    public init(code: String) {
        switch code {
        case "ok": self = .ok
        case "cancelled": self = .cancelled
        case "unknown": self = .unknown
        case "invalid-argument": self = .invalidArgument
        case "deadline-exceeded": self = .deadlineExceeded
        case "not-found": self = .notFound
        case "already-exists": self = .alreadyExists
        case "permission-denied": self = .permissionDenied
        case "unauthenticated": self = .unauthenticated
        case "resource-exhausted": self = .resourceExhausted
        case "failed-precondition": self = .failedPrecondition
        case "aborted": self = .aborted
        case "out-of-range": self = .outOfRange
        case "unimplemented": self = .unimplemented
        case "internal": self = .internal
        case "unavailable": self = .unavailable
        case "data-loss": self = .dataLoss
        default: self = .unrecognized(code)
        }
    }

    /// The wire code.
    public var code: String {
        switch self {
        case .ok: "ok"
        case .cancelled: "cancelled"
        case .unknown: "unknown"
        case .invalidArgument: "invalid-argument"
        case .deadlineExceeded: "deadline-exceeded"
        case .notFound: "not-found"
        case .alreadyExists: "already-exists"
        case .permissionDenied: "permission-denied"
        case .unauthenticated: "unauthenticated"
        case .resourceExhausted: "resource-exhausted"
        case .failedPrecondition: "failed-precondition"
        case .aborted: "aborted"
        case .outOfRange: "out-of-range"
        case .unimplemented: "unimplemented"
        case .internal: "internal"
        case .unavailable: "unavailable"
        case .dataLoss: "data-loss"
        case .unrecognized(let value): value
        }
    }

    /// True for codes where the same request may succeed later.
    public var isRetryable: Bool {
        switch self {
        case .unavailable, .deadlineExceeded, .aborted, .resourceExhausted: true
        default: false
        }
    }

    public var isRecognized: Bool {
        if case .unrecognized = self { false } else { true }
    }
}

/// `details.reason` (ADR 021 decision 7). Missing or unknown reasons are `nil`.
public enum ErrorReason: String, CaseIterable, Hashable, Sendable {
    case signInRequired = "SIGN_IN_REQUIRED"
    case sessionEnded = "SESSION_ENDED"
    case invalidInput = "INVALID_INPUT"
    case rateLimited = "RATE_LIMITED"
    /// A save named an `expectedUpdatedAt` that is no longer current; reload and retry.
    case staleWrite = "STALE_WRITE"
}

/// What a typed call throws when the callable failed.
public struct PaldoraFailure: Error, Hashable, Sendable {
    public let error: PaldoraError
    public let reason: ErrorReason?

    public init(error: PaldoraError, reason: ErrorReason? = nil) {
        self.error = error
        self.reason = reason
    }

    public init(_ transport: TransportError) {
        self.init(
            error: PaldoraError(code: transport.code),
            reason: transport.reason.flatMap(ErrorReason.init(rawValue:))
        )
    }
}

/// Failures that are not the callable's own: this client could not build the
/// request or understand the response.
public enum ContractError: Error, Hashable, Sendable {
    case malformedRequest(CallableName)
    case malformedResponse(CallableName)
}
