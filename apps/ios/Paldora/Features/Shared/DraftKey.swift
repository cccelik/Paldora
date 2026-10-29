import Foundation

/// An idempotency key for one draft. The same draft content keeps the same key
/// across retries, so a retried create after a lost response returns the
/// original. A changed draft gets a new key (so edits are not dropped), and a
/// successful send rotates it.
struct DraftKey: Equatable {
    private var current = UUID().uuidString.lowercased()
    private var fingerprint: String?

    /// The key to send for a draft with this content.
    mutating func key(for fingerprint: String) -> String {
        if fingerprint != self.fingerprint {
            current = UUID().uuidString.lowercased()
            self.fingerprint = fingerprint
        }
        return current
    }

    /// Call after a successful send or when the draft is discarded.
    mutating func rotate() {
        current = UUID().uuidString.lowercased()
        fingerprint = nil
    }
}
