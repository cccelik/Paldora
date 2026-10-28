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

extension UserMessages {
    static let passwordChanged = "Your password was changed. Sign in again."
    static let signedOutEverywhere = "You were signed out everywhere. Sign in again."
    static let wrongPassword = "That password didn't match."
}

extension UserMessages {
    static let resetSent = "If that email has a Paldora account, a link to reset your password is on its way."
    static let resetNeedsEmail = "Enter the email you signed up with."
}
