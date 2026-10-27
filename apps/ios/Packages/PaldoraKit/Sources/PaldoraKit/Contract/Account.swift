import Foundation

public struct ReserveUsernameRequest: Codable, Sendable, Equatable {
    public var username: String
    public init(username: String) { self.username = username }
}

public struct ReserveUsernameResponse: Codable, Sendable, Equatable {
    public let normalized: String
}

// MARK: - Password and sessions

/// Passwords are request-only secrets: the description never includes them.
public struct ChangeMyPasswordRequest: Codable, Sendable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    public var currentPassword: String
    public var newPassword: String
    public init(currentPassword: String, newPassword: String) {
        self.currentPassword = currentPassword
        self.newPassword = newPassword
    }
    public var description: String { "ChangeMyPasswordRequest(redacted)" }
    public var debugDescription: String { description }
}

/// Every earlier ID and refresh token is refused. Drop local credentials and
/// send the person to sign in again.
public struct SessionEndedResponse: Codable, Sendable, Equatable {
    public let ok: Bool
    public let signInRequired: Bool
}

// MARK: - Account export

/// `status` is `pending`, `ready` or `expired`. Bytes come from the
/// `accountExportDownload` HTTP Function: `GET .../accountExportDownload/{id}`
/// with the same bearer token.
public struct AccountExport: Codable, Sendable, Equatable {
    public let id: String
    public let status: String
    public let createdAt: EpochMillis
    public let readyAt: EpochMillis?
    public let expiresAt: EpochMillis?
}

public struct RequestAccountExportResponse: Codable, Sendable, Equatable {
    public let export: AccountExport
}

public struct GetAccountExportResponse: Codable, Sendable, Equatable {
    public let export: AccountExport?
}

// MARK: - Account deletion

/// `id` is the deletion generation; `status` is `pending`, `blocked` or `cancelled`.
public struct AccountDeletion: Codable, Sendable, Equatable {
    public let id: String
    public let status: String
    public let requestedAt: EpochMillis
    public let dueAt: EpochMillis
    public let cancelledAt: EpochMillis?
}

public struct GetAccountDeletionResponse: Codable, Sendable, Equatable {
    public let deletion: AccountDeletion?
}

public struct AccountDeletionResponse: Codable, Sendable, Equatable {
    public let deletion: AccountDeletion
}

/// Fresh password reauthentication for deletion requests and cancellations.
public struct PasswordConfirmationRequest: Codable, Sendable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    public var password: String
    public init(password: String) { self.password = password }
    public var description: String { "PasswordConfirmationRequest(redacted)" }
    public var debugDescription: String { description }
}
