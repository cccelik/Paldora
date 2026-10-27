import PaldoraKit
import SwiftUI

/// Registry metadata mirroring `packages/domain/src/rooms.ts`. Colors come only
/// from the generated `PaldoraRoomThemes` tokens; a Room stores registry ids,
/// never CSS or colors.
enum RoomRegistry {
    struct ThemeMeta {
        let label: String
        let defaultAccent: String
        let defaultDecoration: String
    }

    static let themes: [String: ThemeMeta] = [
        "obsidian_gold": .init(label: "Obsidian Gold", defaultAccent: "gold", defaultDecoration: "none"),
        "cream_paper": .init(label: "Cream Paper", defaultAccent: "gold", defaultDecoration: "tape"),
        "lavender_dream": .init(label: "Lavender Dream", defaultAccent: "lavender", defaultDecoration: "stars"),
        "ocean_glow": .init(label: "Ocean Glow", defaultAccent: "ocean", defaultDecoration: "stars"),
        "daisy_day": .init(label: "Daisy Day", defaultAccent: "daisy", defaultDecoration: "flowers"),
        "neon_night": .init(label: "Neon Night", defaultAccent: "pink", defaultDecoration: "pixels"),
        "y2k_glitter": .init(label: "Y2K Glitter", defaultAccent: "lavender", defaultDecoration: "stars"),
        "dark_academia": .init(label: "Dark Academia", defaultAccent: "gold", defaultDecoration: "tape"),
        "frutiger_aero": .init(label: "Frutiger Aero", defaultAccent: "emerald", defaultDecoration: "stickers"),
        "tumblr_2014": .init(label: "Tumblr 2014", defaultAccent: "ocean", defaultDecoration: "stars"),
        "retro_windows": .init(label: "Retro Windows", defaultAccent: "cyan", defaultDecoration: "pixels"),
        "cyberpunk": .init(label: "Cyberpunk", defaultAccent: "cyan", defaultDecoration: "pixels"),
        "minimal_editorial": .init(label: "Minimal Editorial", defaultAccent: "crimson", defaultDecoration: "none"),
        "polaroid_scrapbook": .init(label: "Polaroid Scrapbook", defaultAccent: "crimson", defaultDecoration: "tape"),
    ]

    static let accentLabels = ["gold": "Gold", "lavender": "Lavender", "ocean": "Ocean", "daisy": "Daisy",
                               "pink": "Pink", "emerald": "Emerald", "cyan": "Cyan", "crimson": "Crimson"]
    static let fontLabels = ["editorial": "Editorial serif", "modern": "Modern sans", "rounded": "Rounded",
                             "mono": "Monospace", "handwritten": "Handwritten"]
    static let decorationLabels = ["none": "None", "stars": "Stars", "flowers": "Flowers", "stickers": "Stickers",
                                   "tape": "Tape", "pixels": "Pixels"]
    static let layoutLabels = ["single": "Single column", "two_column": "Two columns"]
    static let visibilityLabels = ["friends": "Friends", "members": "Friends and Box members", "hidden": "Only me"]
    static let visibilityNotes = [
        "friends": "Your accepted friends can visit your Room.",
        "members": "Your friends and people who share a Box with you can visit your Room.",
        "hidden": "Only you can see your Room.",
    ]
    static let widgetLabels = ["currently": "Currently", "music": "Music", "top_friends": "Top Friends",
                               "photos": "Photos", "life_updates": "Life Updates", "posts": "Posts", "memories": "Memories"]
    static let topFriendsLabels = ["visible": "Everyone who can visit", "friends": "Friends only", "hidden": "Only me"]

    static func label(_ table: [String: String], _ key: String?) -> String { key.flatMap { table[$0] } ?? key ?? "" }
    static func themeLabel(_ id: String) -> String { themes[id]?.label ?? id }
}

/// A resolved look: colors from tokens, a font design and decoration.
struct RoomAppearance: Equatable {
    let preset: PaldoraRoomPreset
    let scheme: PaldoraRoomScheme
    let accent: PaldoraColor
    let fontKey: String
    let decoration: String
    let sparkles: Bool

    init(themePreset: String, accent accentKey: String?, font: String?, decorationPack: String?, sparkles: Bool) {
        let found = PaldoraRoomThemes.presets.first { $0.id == themePreset } ?? PaldoraRoomThemes.presets[0]
        preset = found
        scheme = found.scheme
        let meta = RoomRegistry.themes[found.id]
        let key = accentKey ?? meta?.defaultAccent ?? "gold"
        accent = (PaldoraRoomThemes.accents.first { $0.key == key } ?? PaldoraRoomThemes.accents[0]).color(for: found.scheme)
        fontKey = font ?? "editorial"
        decoration = decorationPack ?? meta?.defaultDecoration ?? "none"
        self.sparkles = sparkles
    }

    init(style: RoomStyle) {
        self.init(themePreset: style.themePreset, accent: style.accent, font: style.font,
                  decorationPack: style.decorationPack, sparkles: style.sparkles)
    }

    var canvas: Color { Color(preset.canvas) }
    var surface: Color { Color(preset.surface) }
    var text: Color { Color(preset.text) }
    var muted: Color { Color(preset.textMuted) }
    var border: Color { Color(preset.border) }
    var accentColor: Color { Color(accent) }
    var colorScheme: ColorScheme { scheme == .dark ? .dark : .light }

    /// System font stacks only (no font files), scaled with Dynamic Type.
    func font(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        switch fontKey {
        case "modern": .system(style, design: .default).weight(weight)
        case "rounded": .system(style, design: .rounded).weight(weight)
        case "mono": .system(style, design: .monospaced).weight(weight)
        case "handwritten": .custom("Bradley Hand", size: Self.size(style), relativeTo: style).weight(weight)
        default: .system(style, design: .serif).weight(weight)
        }
    }

    private static func size(_ style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title, .title2: 24
        case .title3, .headline: 20
        case .caption, .footnote: 14
        default: 17
        }
    }
}
