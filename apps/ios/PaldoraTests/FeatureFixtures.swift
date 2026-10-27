import Foundation
import PaldoraKit
@testable import Paldora

/// JSON builders and an environment factory for feature view model tests.
enum JSON {
    static func data(_ object: Any) -> Data { try! JSONSerialization.data(withJSONObject: object) }
    static func body(_ data: Data?) -> [String: Any] {
        (data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]) ?? [:]
    }

    static func page(_ items: [Any], next: String? = nil) -> Data {
        data(["items": items, "nextCursor": next as Any? ?? NSNull()])
    }

    static func box(_ id: String = "b1", name: String = "Friends", status: String = "active", role: String = "owner") -> [String: Any] {
        ["id": id, "name": name, "status": status, "currentUserRole": role, "memberCount": 2,
         "createdAt": 1_700_000_000_000, "updatedAt": 1_700_000_000_000]
    }

    static func post(_ id: String = "p1", boxId: String = "b1", author: String = "u1", text: String = "Hello",
                     kind: String = "post") -> [String: Any] {
        ["id": id, "boxId": boxId, "authorUid": author, "text": text, "createdAt": 1_700_000_000_000,
         "updatedAt": 1_700_000_000_000, "kind": kind, "lifeUpdateId": NSNull(), "mediaAssetIds": []]
    }

    static func comment(_ id: String, parent: String? = nil, author: String = "u2", text: String = "Hi") -> [String: Any] {
        ["id": id, "postId": "p1", "authorUid": author, "parentId": parent as Any? ?? NSNull(), "text": text,
         "createdAt": 1_700_000_000_000, "updatedAt": 1_700_000_000_000]
    }

    static func notification(_ id: String, read: Bool = false) -> [String: Any] {
        ["id": id, "type": "post.comment", "actor": ["uid": "u2", "username": "kai", "displayName": "Kai"],
         "boxId": "b1", "boxName": "Friends", "postId": "p1", "lifeUpdateId": NSNull(), "commentId": "c1",
         "reaction": NSNull(), "read": read, "createdAt": 1_700_000_000_000]
    }

    static func feedPost(_ id: String) -> [String: Any] {
        ["kind": "post", "id": id, "boxId": "b1", "authorUid": "u2", "authorName": "Kai", "mediaAssetIds": ["m1"],
         "createdAt": 1_700_000_000_000, "text": "Feed post", "edited": false, "canEdit": false,
         "interactions": ["commentCount": 2, "reactions": [], "reactionCount": 1, "realCount": 0,
                          "realPreview": [], "viewerReaction": NSNull(), "canInteract": true]]
    }
}

/// A fully wired environment over a fake transport, plus the auth fake so
/// tests can assert sign-out.
@MainActor
struct FeatureHarness {
    let env: FeatureEnvironment
    let model: AppModel
    let auth: FakeAuth
    let transport: FakeTransport

    init(media: (any MediaClient)? = nil, _ handler: @escaping FakeTransport.Handler) async {
        auth = FakeAuth(hasSession: true)
        transport = FakeTransport { name, data in
            if name == .getMyProfile { return Fixtures.profileJSON() }
            return try handler(name, data)
        }
        model = AppModel(auth: auth, api: PaldoraAPI(transport: transport), media: media)
        await model.start()
        env = model.makeFeatureEnvironment(userID: "u1")!
    }
}

func failure(_ code: String, _ reason: String? = nil) -> TransportError {
    TransportError(code: code, reason: reason)
}

extension JSON {
    static func friendship(_ id: String, status: String, other: String = "u2", name: String = "Kai") -> [String: Any] {
        ["id": id, "otherUid": other, "status": status, "requesterUid": other, "createdAt": 1, "updatedAt": 1,
         "username": name.lowercased(), "displayName": name]
    }

    static func lifeUpdate(_ id: String = "l1", audience: String = "boxes", sections: [String: String] = ["travel": "Lisbon"],
                           media: [String] = [], contexts: [[String: Any]]? = nil) -> [String: Any] {
        ["id": id, "authorUid": "u1", "audience": audience, "sections": sections, "mediaAssetIds": media,
         "createdAt": 1_700_000_000_000, "updatedAt": 1_700_000_000_000, "canEdit": true,
         "contexts": contexts ?? [["boxId": "b2", "boxName": "Zed", "postId": "p2", "canInteract": true],
                                  ["boxId": "b1", "boxName": "alpha", "postId": "p1", "canInteract": true]]]
    }
}
