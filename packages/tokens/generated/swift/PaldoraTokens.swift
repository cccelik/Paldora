// Generated from design/tokens/paldora.tokens.json by `pnpm tokens:generate`. Do not edit.
// Units: dimensions are CGFloat points (rem x 16; em stays a ratio),
// durations are TimeInterval seconds, colors are sRGB PaldoraColor values.
import Foundation

/// sRGB color as 0xAARRGGBB. Convert in the app, for example
/// `Color(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: c.alpha)`.
public struct PaldoraColor: Equatable, Sendable {
    public let argb: UInt32

    public init(argb: UInt32) {
        self.argb = argb
    }

    public var alpha: Double { Double((argb >> 24) & 0xFF) / 255 }
    public var red: Double { Double((argb >> 16) & 0xFF) / 255 }
    public var green: Double { Double((argb >> 8) & 0xFF) / 255 }
    public var blue: Double { Double(argb & 0xFF) / 255 }
}

public enum PaldoraTokens {
    public static let colorBrandObsidian: PaldoraColor = PaldoraColor(argb: 0xFF11100E)
    public static let colorBrandSoftBlack: PaldoraColor = PaldoraColor(argb: 0xFF191713)
    public static let colorBrandGold: PaldoraColor = PaldoraColor(argb: 0xFFC79A3B)
    public static let colorBrandDeepGold: PaldoraColor = PaldoraColor(argb: 0xFF9C7424)
    public static let colorBrandChampagne: PaldoraColor = PaldoraColor(argb: 0xFFF4E7C3)
    public static let colorBrandIvory: PaldoraColor = PaldoraColor(argb: 0xFFFAF7EF)
    public static let colorBrandPaper: PaldoraColor = PaldoraColor(argb: 0xFFF4EFE5)
    public static let colorBrandLavender: PaldoraColor = PaldoraColor(argb: 0xFFC8B7E8)
    public static let colorTextDarkPrimary: PaldoraColor = PaldoraColor(argb: 0xFFF8F1E0)
    public static let colorTextDarkMuted: PaldoraColor = PaldoraColor(argb: 0xFFB9AF9D)
    public static let colorTextLightPrimary: PaldoraColor = PaldoraColor(argb: 0xFF171717)
    public static let colorTextLightMuted: PaldoraColor = PaldoraColor(argb: 0xFF6E6250)
    public static let colorStatusSuccess: PaldoraColor = PaldoraColor(argb: 0xFF668060)
    public static let colorStatusWarning: PaldoraColor = PaldoraColor(argb: 0xFFA96F2D)
    public static let colorStatusDanger: PaldoraColor = PaldoraColor(argb: 0xFFA54B46)
    public static let colorAccessibleGoldText: PaldoraColor = PaldoraColor(argb: 0xFF88651F)
    public static let colorAccessibleSuccessText: PaldoraColor = PaldoraColor(argb: 0xFF5B7255)
    public static let colorAccessibleWarningText: PaldoraColor = PaldoraColor(argb: 0xFF936127)
    public static let colorFocus: PaldoraColor = PaldoraColor(argb: 0xFF8D6CD1)
    public static let themeLightCanvas: PaldoraColor = PaldoraColor(argb: 0xFFFAF7EF)
    public static let themeLightSurface: PaldoraColor = PaldoraColor(argb: 0xFFF4EFE5)
    public static let themeLightText: PaldoraColor = PaldoraColor(argb: 0xFF171717)
    public static let themeLightTextMuted: PaldoraColor = PaldoraColor(argb: 0xFF6E6250)
    public static let themeLightAccent: PaldoraColor = PaldoraColor(argb: 0xFFC79A3B)
    public static let themeLightAccentText: PaldoraColor = PaldoraColor(argb: 0xFF88651F)
    public static let themeLightHighlight: PaldoraColor = PaldoraColor(argb: 0xFFF4E7C3)
    public static let themeLightEmotional: PaldoraColor = PaldoraColor(argb: 0xFFC8B7E8)
    public static let themeLightSuccessText: PaldoraColor = PaldoraColor(argb: 0xFF5B7255)
    public static let themeLightWarningText: PaldoraColor = PaldoraColor(argb: 0xFF936127)
    public static let themeLightDangerText: PaldoraColor = PaldoraColor(argb: 0xFFA54B46)
    public static let themeLightFocus: PaldoraColor = PaldoraColor(argb: 0xFF8D6CD1)
    public static let themeLightOnAccent: PaldoraColor = PaldoraColor(argb: 0xFF11100E)
    public static let themeDarkCanvas: PaldoraColor = PaldoraColor(argb: 0xFF11100E)
    public static let themeDarkSurface: PaldoraColor = PaldoraColor(argb: 0xFF191713)
    public static let themeDarkText: PaldoraColor = PaldoraColor(argb: 0xFFF8F1E0)
    public static let themeDarkTextMuted: PaldoraColor = PaldoraColor(argb: 0xFFB9AF9D)
    public static let themeDarkAccent: PaldoraColor = PaldoraColor(argb: 0xFFC79A3B)
    public static let themeDarkAccentText: PaldoraColor = PaldoraColor(argb: 0xFFC79A3B)
    public static let themeDarkHighlight: PaldoraColor = PaldoraColor(argb: 0xFFF4E7C3)
    public static let themeDarkEmotional: PaldoraColor = PaldoraColor(argb: 0xFFC8B7E8)
    public static let themeDarkSuccessText: PaldoraColor = PaldoraColor(argb: 0xFF9DB596)
    public static let themeDarkWarningText: PaldoraColor = PaldoraColor(argb: 0xFFD9A066)
    public static let themeDarkDangerText: PaldoraColor = PaldoraColor(argb: 0xFFE08A84)
    public static let themeDarkFocus: PaldoraColor = PaldoraColor(argb: 0xFFC8B7E8)
    public static let themeDarkOnAccent: PaldoraColor = PaldoraColor(argb: 0xFF11100E)
    public static let space1: CGFloat = 4
    public static let space2: CGFloat = 8
    public static let space3: CGFloat = 12
    public static let space4: CGFloat = 16
    public static let space5: CGFloat = 20
    public static let space6: CGFloat = 24
    public static let space8: CGFloat = 32
    public static let space10: CGFloat = 40
    public static let space12: CGFloat = 48
    public static let space16: CGFloat = 64
    public static let space20: CGFloat = 80
    public static let radiusSm: CGFloat = 8
    public static let radiusMd: CGFloat = 14
    public static let radiusLg: CGFloat = 20
    public static let radiusXl: CGFloat = 28
    public static let radiusPill: CGFloat = 999
    public static let sizeTouchTarget: CGFloat = 44
    public static let sizeFocusRing: CGFloat = 3
    public static let sizeReadingColumn: CGFloat = 620
    public static let sizeContentMax: CGFloat = 1280
    public static let breakpointSm: CGFloat = 390
    public static let breakpointMd: CGFloat = 768
    public static let breakpointLg: CGFloat = 1024
    public static let breakpointXl: CGFloat = 1280
    public static let breakpointXxl: CGFloat = 1440
    public static let durationFast: TimeInterval = 0.12
    public static let durationStandard: TimeInterval = 0.2
    public static let durationSlow: TimeInterval = 0.32
    public static let easingStandard: [Double] = [0.2, 0.8, 0.2, 1]
    public static let zIndexBase: Int = 0
    public static let zIndexSticky: Int = 100
    public static let zIndexDropdown: Int = 300
    public static let zIndexOverlay: Int = 500
    public static let zIndexModal: Int = 600
    public static let zIndexToast: Int = 700
    public static let zIndexSecurity: Int = 800
    public static let fontBrand: [String] = ["Cormorant Garamond", "Iowan Old Style", "Georgia", "serif"]
    public static let fontEditorial: [String] = ["Newsreader", "Iowan Old Style", "Georgia", "serif"]
    public static let fontUi: [String] = ["Inter", "ui-sans-serif", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let borderWidthHairline: CGFloat = 1
    public static let borderOpacitySoft: CGFloat = 0.12
    public static let borderOpacityDefault: CGFloat = 0.2
    public static let borderOpacityStrong: CGFloat = 0.5
    public static let fontSizeCaption: CGFloat = 13
    public static let fontSizeHeroSmall: CGFloat = 44
    public static let fontSizeHeroLarge: CGFloat = 72
    public static let fontSizeLead: CGFloat = 18
    public static let fontSizeSm: CGFloat = 14
    public static let fontSizeSubtitle: CGFloat = 20
    public static let fontSizeTitleSmall: CGFloat = 28
    public static let fontSizeDisplay: CGFloat = 36
    public static let fontSizeBody: CGFloat = 16
    public static let fontSizeBrandSmall: CGFloat = 20.8
    public static let fontSizeDisplayLarge: CGFloat = 40
    public static let fontSizeHeadingSmall: CGFloat = 22
    public static let fontSizeHeading: CGFloat = 24
    public static let fontSizeXs: CGFloat = 12
    public static let fontSizeTitle: CGFloat = 30
    public static let fontSizeBodyLarge: CGFloat = 17
    public static let fontSizeRelativeLabel: CGFloat = 0.75
    public static let fontSizeDisplaySmall: CGFloat = 32
    public static let fontSizeReadable: CGFloat = 15
    public static let fontSizeHero: CGFloat = 48
    public static let fontSizeRelativeSmall: CGFloat = 0.7
}

public enum PaldoraRoomScheme: String, Sendable {
    case light
    case dark
}

public struct PaldoraRoomPreset: Equatable, Sendable {
    public let id: String
    public let scheme: PaldoraRoomScheme
    public let canvas: PaldoraColor
    public let surface: PaldoraColor
    public let text: PaldoraColor
    public let textMuted: PaldoraColor
    public let border: PaldoraColor
}

public struct PaldoraRoomAccent: Equatable, Sendable {
    public let key: String
    public let onLight: PaldoraColor
    public let onDark: PaldoraColor

    public func color(for scheme: PaldoraRoomScheme) -> PaldoraColor {
        scheme == .light ? onLight : onDark
    }
}

public struct PaldoraRoomFont: Equatable, Sendable {
    public let key: String
    public let families: [String]
}

/// Room themes (ADR 017), keyed by the domain ids used by the API.
public enum PaldoraRoomThemes {
    public static let presets: [PaldoraRoomPreset] = [
        PaldoraRoomPreset(
            id: "obsidian_gold",
            scheme: .dark,
            canvas: PaldoraColor(argb: 0xFF14110D),
            surface: PaldoraColor(argb: 0xFF211B14),
            text: PaldoraColor(argb: 0xFFF7EFD9),
            textMuted: PaldoraColor(argb: 0xFF8D887A),
            border: PaldoraColor(argb: 0xFF726C5F)
        ),
        PaldoraRoomPreset(
            id: "cream_paper",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFF8F0DF),
            surface: PaldoraColor(argb: 0xFFFFFAF0),
            text: PaldoraColor(argb: 0xFF241D16),
            textMuted: PaldoraColor(argb: 0xFF6F685D),
            border: PaldoraColor(argb: 0xFF8B857C)
        ),
        PaldoraRoomPreset(
            id: "lavender_dream",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFEEE6FA),
            surface: PaldoraColor(argb: 0xFFFAF7FF),
            text: PaldoraColor(argb: 0xFF2E2140),
            textMuted: PaldoraColor(argb: 0xFF6B607C),
            border: PaldoraColor(argb: 0xFF867D92)
        ),
        PaldoraRoomPreset(
            id: "ocean_glow",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFDFF5F4),
            surface: PaldoraColor(argb: 0xFFF5FFFF),
            text: PaldoraColor(argb: 0xFF102F39),
            textMuted: PaldoraColor(argb: 0xFF526E75),
            border: PaldoraColor(argb: 0xFF74898F)
        ),
        PaldoraRoomPreset(
            id: "daisy_day",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFFFF4C9),
            surface: PaldoraColor(argb: 0xFFFFFBED),
            text: PaldoraColor(argb: 0xFF3A3115),
            textMuted: PaldoraColor(argb: 0xFF746B4A),
            border: PaldoraColor(argb: 0xFF8F8872)
        ),
        PaldoraRoomPreset(
            id: "neon_night",
            scheme: .dark,
            canvas: PaldoraColor(argb: 0xFF100D20),
            surface: PaldoraColor(argb: 0xFF211839),
            text: PaldoraColor(argb: 0xFFF8F2FF),
            textMuted: PaldoraColor(argb: 0xFF8C8897),
            border: PaldoraColor(argb: 0xFF716982)
        ),
        PaldoraRoomPreset(
            id: "y2k_glitter",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFF2E8FA),
            surface: PaldoraColor(argb: 0xFFFFF7FF),
            text: PaldoraColor(argb: 0xFF352044),
            textMuted: PaldoraColor(argb: 0xFF71607E),
            border: PaldoraColor(argb: 0xFF8C7C94)
        ),
        PaldoraRoomPreset(
            id: "dark_academia",
            scheme: .dark,
            canvas: PaldoraColor(argb: 0xFF211B14),
            surface: PaldoraColor(argb: 0xFF30271C),
            text: PaldoraColor(argb: 0xFFF1DFBD),
            textMuted: PaldoraColor(argb: 0xFFA0937B),
            border: PaldoraColor(argb: 0xFF817460)
        ),
        PaldoraRoomPreset(
            id: "frutiger_aero",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFDFF7FF),
            surface: PaldoraColor(argb: 0xFFF7FFFF),
            text: PaldoraColor(argb: 0xFF12374A),
            textMuted: PaldoraColor(argb: 0xFF4D6F7E),
            border: PaldoraColor(argb: 0xFF728B96)
        ),
        PaldoraRoomPreset(
            id: "tumblr_2014",
            scheme: .dark,
            canvas: PaldoraColor(argb: 0xFF263247),
            surface: PaldoraColor(argb: 0xFF34445F),
            text: PaldoraColor(argb: 0xFFF5F7FB),
            textMuted: PaldoraColor(argb: 0xFFB1B6C0),
            border: PaldoraColor(argb: 0xFF8A94A4)
        ),
        PaldoraRoomPreset(
            id: "retro_windows",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFC0C0C0),
            surface: PaldoraColor(argb: 0xFFECECEC),
            text: PaldoraColor(argb: 0xFF101010),
            textMuted: PaldoraColor(argb: 0xFF4A4A4A),
            border: PaldoraColor(argb: 0xFF656565)
        ),
        PaldoraRoomPreset(
            id: "cyberpunk",
            scheme: .dark,
            canvas: PaldoraColor(argb: 0xFF110B1B),
            surface: PaldoraColor(argb: 0xFF21122D),
            text: PaldoraColor(argb: 0xFFF4FF52),
            textMuted: PaldoraColor(argb: 0xFF878A38),
            border: PaldoraColor(argb: 0xFF706B3B)
        ),
        PaldoraRoomPreset(
            id: "minimal_editorial",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFF7F5F0),
            surface: PaldoraColor(argb: 0xFFFFFFFF),
            text: PaldoraColor(argb: 0xFF151515),
            textMuted: PaldoraColor(argb: 0xFF6D6C6A),
            border: PaldoraColor(argb: 0xFF898989)
        ),
        PaldoraRoomPreset(
            id: "polaroid_scrapbook",
            scheme: .light,
            canvas: PaldoraColor(argb: 0xFFEEE3CC),
            surface: PaldoraColor(argb: 0xFFFFFDF8),
            text: PaldoraColor(argb: 0xFF292118),
            textMuted: PaldoraColor(argb: 0xFF696053),
            border: PaldoraColor(argb: 0xFF827C75)
        ),
    ]

    public static let accents: [PaldoraRoomAccent] = [
        PaldoraRoomAccent(key: "gold", onLight: PaldoraColor(argb: 0xFF8C5F1A), onDark: PaldoraColor(argb: 0xFFC4933F)),
        PaldoraRoomAccent(key: "lavender", onLight: PaldoraColor(argb: 0xFF7F51B5), onDark: PaldoraColor(argb: 0xFFA281CA)),
        PaldoraRoomAccent(key: "ocean", onLight: PaldoraColor(argb: 0xFF127282), onDark: PaldoraColor(argb: 0xFF7FA4D8)),
        PaldoraRoomAccent(key: "daisy", onLight: PaldoraColor(argb: 0xFF915D0F), onDark: PaldoraColor(argb: 0xFFDB8D16)),
        PaldoraRoomAccent(key: "pink", onLight: PaldoraColor(argb: 0xFFAF398A), onDark: PaldoraColor(argb: 0xFFDC49FF)),
        PaldoraRoomAccent(key: "emerald", onLight: PaldoraColor(argb: 0xFF267647), onDark: PaldoraColor(argb: 0xFF34A362)),
        PaldoraRoomAccent(key: "cyan", onLight: PaldoraColor(argb: 0xFF007287), onDark: PaldoraColor(argb: 0xFF00E5FF)),
        PaldoraRoomAccent(key: "crimson", onLight: PaldoraColor(argb: 0xFFA23C2D), onDark: PaldoraColor(argb: 0xFFD57566)),
    ]

    public static let fonts: [PaldoraRoomFont] = [
        PaldoraRoomFont(key: "editorial", families: ["Newsreader", "Iowan Old Style", "Georgia", "serif"]),
        PaldoraRoomFont(key: "modern", families: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"]),
        PaldoraRoomFont(key: "rounded", families: ["ui-rounded", "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "sans-serif"]),
        PaldoraRoomFont(key: "mono", families: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]),
        PaldoraRoomFont(key: "handwritten", families: ["Bradley Hand", "Segoe Print", "Noteworthy", "cursive"]),
    ]
}
