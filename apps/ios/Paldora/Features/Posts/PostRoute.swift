struct PostRoute: Hashable {
    let boxId: String
    let postId: String
    /// A comment to pin at the top (from a notification or link).
    var commentId: String?
}
