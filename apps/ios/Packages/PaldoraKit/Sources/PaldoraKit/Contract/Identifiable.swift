// List-friendly identity for contract types, so clients can diff and dedupe pages.

extension Box: Identifiable {}
extension BoxPost: Identifiable {}
extension BoxComment: Identifiable {}
extension MyBoxInvitation: Identifiable {}
extension PaldoraNotification: Identifiable {}

extension BoxMember: Identifiable {
    public var id: String { uid }
}

extension BoxReaction: Identifiable {
    public var id: String { uid }
}

extension FeedItem: Identifiable {
    /// Posts and Life Update deliveries are one item per backing post id.
    public var id: String {
        switch self {
        case .post(let post): "post:\(post.id)"
        case .lifeUpdate(let update): "post:\(update.postId)"
        case .unsupported(let kind): "unsupported:\(kind)"
        }
    }
}

extension Friendship: Identifiable {}
extension LifeUpdate: Identifiable {}

extension BlockedUser: Identifiable {
    public var id: String { userId }
}

extension RoomPhoto: Identifiable {
    public var id: String { mediaAssetId }
}

extension MemoryItem: Identifiable {
    /// Posts and Life Updates are distinct items; unknown kinds never collide.
    public var id: String {
        switch self {
        case .post(let value): "post:\(value.post.id)"
        case .lifeUpdate(let value): "lu:\(value.id)"
        case .unsupported(let kind): "unsupported:\(kind)"
        }
    }
}
