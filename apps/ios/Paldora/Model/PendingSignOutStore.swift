import Foundation

/// Remembers a sign-out that did not complete, across launches.
protocol PendingSignOutStore: AnyObject {
    var isPending: Bool { get set }
}

final class UserDefaultsPendingSignOut: PendingSignOutStore {
    private let key = "app.paldora.pendingSignOut"

    var isPending: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

final class InMemoryPendingSignOut: PendingSignOutStore {
    var isPending = false
}
