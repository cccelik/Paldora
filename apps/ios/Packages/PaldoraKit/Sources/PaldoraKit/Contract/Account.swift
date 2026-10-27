import Foundation

public struct ReserveUsernameRequest: Codable, Sendable, Equatable {
    public var username: String
    public init(username: String) { self.username = username }
}

public struct ReserveUsernameResponse: Codable, Sendable, Equatable {
    public let normalized: String
}
