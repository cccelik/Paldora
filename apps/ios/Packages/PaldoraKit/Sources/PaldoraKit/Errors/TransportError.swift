import Foundation

/// What the app's transport throws when Firebase Functions reports an error.
/// The server message is deliberately not carried.
public struct TransportError: Error, Hashable, Sendable {
    /// `FunctionsErrorCode` wire string, e.g. `"not-found"`.
    public let code: String
    /// `details.reason` when present, otherwise `nil`.
    public let reason: String?

    public init(code: String, reason: String? = nil) {
        self.code = code
        self.reason = reason
    }
}
