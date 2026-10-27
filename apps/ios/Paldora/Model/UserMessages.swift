/// Neutral, non-leaking copy. Server messages are never shown (ADR 021).
enum UserMessages {
    static let sessionEnded = "You were signed out. Please sign in again."
    static let rateLimited = "That was a lot at once. Wait a moment, then try again."
    static let unavailable = "Paldora can't be reached right now. Check your connection and try again."
    static let invalidInput = "Some of that wasn't accepted. Check it and try again."
    static let generic = "Something went wrong. Please try again."
    static let invalidCredentials = "That email and password didn't match."
    static let signInTooMany = "Too many tries. Wait a moment, then try again."
    static let signInMissing = "Enter your email and password."
}
