import Foundation
import PaldoraKit

extension JSON {
    static let widgetTypes = ["currently", "music", "top_friends", "photos", "life_updates", "posts", "memories"]

    static func room(
        relationship: String = "owner", theme: String = "obsidian_gold", layout: String = "single",
        updatedAt: Int? = 1000, enabled: Set<String> = Set(widgetTypes), music: [String: Any]? = nil,
        topFriends: [String: Any]? = nil, banner: String? = nil, username: String = "mira"
    ) -> [String: Any] {
        let widgets: [[String: Any]] = widgetTypes.enumerated().map { index, type in
            ["type": type, "placement": index < 4 ? "sidebar" : "main", "position": index, "enabled": enabled.contains(type)]
        }
        return [
            "owner": ["uid": "u1", "username": username, "displayName": "Mira", "bio": "Hello", "avatarMediaId": NSNull()],
            "relationship": relationship,
            "style": ["themePreset": theme, "layout": layout, "accent": NSNull(), "font": NSNull(),
                      "decorationPack": NSNull(), "sparkles": false],
            "location": "Lisbon", "currently": "Reading", "music": music as Any? ?? NSNull(),
            "bannerMediaId": banner as Any? ?? NSNull(), "widgets": widgets,
            "topFriends": topFriends ?? ["size": 4, "visibility": "visible", "items": [] as [Any]],
            "visibility": relationship == "owner" ? "friends" : NSNull(),
            "updatedAt": updatedAt as Any? ?? NSNull(), "configurationVersion": 1,
        ]
    }

    static func memoryPost(_ id: String, at: Int = 1_700_000_000_000) -> [String: Any] {
        var post = feedPost(id)
        post["occurredAt"] = at
        return post
    }

    static func summary(years: [Int] = [2025, 2024], year: Int? = nil, months: [Int] = []) -> Data {
        data(["years": years.map { ["year": $0, "count": 3] }, "year": year as Any? ?? NSNull(),
              "months": months.map { ["month": $0, "count": 1] }])
    }
}
