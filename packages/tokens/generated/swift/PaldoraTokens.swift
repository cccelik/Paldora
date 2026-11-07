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
    public static let themeLightBgCanvas: PaldoraColor = PaldoraColor(argb: 0xFFF4EFE7)
    public static let themeLightBgSurface: PaldoraColor = PaldoraColor(argb: 0xFFFBF8F3)
    public static let themeLightBgSunken: PaldoraColor = PaldoraColor(argb: 0xFFEAE2D5)
    public static let themeLightBgInverse: PaldoraColor = PaldoraColor(argb: 0xFF2A2420)
    public static let themeLightBgInverseRaised: PaldoraColor = PaldoraColor(argb: 0xFF3A322C)
    public static let themeLightBgPaper: PaldoraColor = PaldoraColor(argb: 0xFFFFFFFF)
    public static let themeLightTextPrimary: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
    public static let themeLightTextSecondary: PaldoraColor = PaldoraColor(argb: 0xFF4F473F)
    public static let themeLightTextMuted: PaldoraColor = PaldoraColor(argb: 0xFF8C8276)
    public static let themeLightTextOnInverse: PaldoraColor = PaldoraColor(argb: 0xFFFBF8F3)
    public static let themeLightBorderHairline: PaldoraColor = PaldoraColor(argb: 0xFFE2D9CB)
    public static let themeLightAccentBrass: PaldoraColor = PaldoraColor(argb: 0xFFA9823F)
    public static let themeLightAccentBrassText: PaldoraColor = PaldoraColor(argb: 0xFF7A5B24)
    public static let themeLightAccentBrassSoft: PaldoraColor = PaldoraColor(argb: 0xFFF1E6CF)
    public static let themeLightAccentEmber: PaldoraColor = PaldoraColor(argb: 0xFFB65A3C)
    public static let themeLightAccentEmberSoft: PaldoraColor = PaldoraColor(argb: 0xFFF6E1D6)
    public static let themeLightAccentSage: PaldoraColor = PaldoraColor(argb: 0xFF6F7D64)
    public static let themeLightAccentSageSoft: PaldoraColor = PaldoraColor(argb: 0xFFE4E8DC)
    public static let themeLightAccentOnBrass: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
    public static let themeLightActionPrimary: PaldoraColor = PaldoraColor(argb: 0xFF2A2420)
    public static let themeLightActionOnPrimary: PaldoraColor = PaldoraColor(argb: 0xFFFBF8F3)
    public static let themeLightFocusRing: PaldoraColor = PaldoraColor(argb: 0xFF8D6CD1)
    public static let themeLightStatusDanger: PaldoraColor = PaldoraColor(argb: 0xFFA54B46)
    public static let themeLightStatusSuccess: PaldoraColor = PaldoraColor(argb: 0xFF5B7255)
    public static let themeLightNavActive: PaldoraColor = PaldoraColor(argb: 0xFFFBF8F3)
    public static let themeLightNavOnActive: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
    public static let themeDarkBgCanvas: PaldoraColor = PaldoraColor(argb: 0xFF14110E)
    public static let themeDarkBgSurface: PaldoraColor = PaldoraColor(argb: 0xFF1D1915)
    public static let themeDarkBgSunken: PaldoraColor = PaldoraColor(argb: 0xFF27221D)
    public static let themeDarkBgInverse: PaldoraColor = PaldoraColor(argb: 0xFF2C2621)
    public static let themeDarkBgInverseRaised: PaldoraColor = PaldoraColor(argb: 0xFF3A332C)
    public static let themeDarkBgPaper: PaldoraColor = PaldoraColor(argb: 0xFFF1EBE1)
    public static let themeDarkTextPrimary: PaldoraColor = PaldoraColor(argb: 0xFFF2EBDF)
    public static let themeDarkTextSecondary: PaldoraColor = PaldoraColor(argb: 0xFFC9BDAB)
    public static let themeDarkTextMuted: PaldoraColor = PaldoraColor(argb: 0xFF908574)
    public static let themeDarkTextOnInverse: PaldoraColor = PaldoraColor(argb: 0xFFFBF8F3)
    public static let themeDarkBorderHairline: PaldoraColor = PaldoraColor(argb: 0xFF352E27)
    public static let themeDarkAccentBrass: PaldoraColor = PaldoraColor(argb: 0xFFC39A52)
    public static let themeDarkAccentBrassText: PaldoraColor = PaldoraColor(argb: 0xFFD9B26A)
    public static let themeDarkAccentBrassSoft: PaldoraColor = PaldoraColor(argb: 0xFF3A2F1E)
    public static let themeDarkAccentEmber: PaldoraColor = PaldoraColor(argb: 0xFFD67A5C)
    public static let themeDarkAccentEmberSoft: PaldoraColor = PaldoraColor(argb: 0xFF3D241B)
    public static let themeDarkAccentSage: PaldoraColor = PaldoraColor(argb: 0xFF9AAA8C)
    public static let themeDarkAccentSageSoft: PaldoraColor = PaldoraColor(argb: 0xFF263022)
    public static let themeDarkAccentOnBrass: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
    public static let themeDarkActionPrimary: PaldoraColor = PaldoraColor(argb: 0xFFF2EBDF)
    public static let themeDarkActionOnPrimary: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
    public static let themeDarkFocusRing: PaldoraColor = PaldoraColor(argb: 0xFFC8B7E8)
    public static let themeDarkStatusDanger: PaldoraColor = PaldoraColor(argb: 0xFFE08A84)
    public static let themeDarkStatusSuccess: PaldoraColor = PaldoraColor(argb: 0xFF9DB596)
    public static let themeDarkNavActive: PaldoraColor = PaldoraColor(argb: 0xFFF2EBDF)
    public static let themeDarkNavOnActive: PaldoraColor = PaldoraColor(argb: 0xFF1D1A17)
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
    public static let radiusMd: CGFloat = 16
    public static let radiusLg: CGFloat = 24
    public static let radiusXl: CGFloat = 28
    public static let radiusSheet: CGFloat = 30
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
    public static let fontDisplay: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let fontUi: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let fontMono: [String] = ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
    public static let fontBrand: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let fontEditorial: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let borderWidthHairline: CGFloat = 1
    public static let borderWidthFocus: CGFloat = 1.5
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
    public static let typeDisplayXlFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeDisplayXlFontWeight: Int = 300
    public static let typeDisplayXlFontSize: CGFloat = 76
    public static let typeDisplayXlLineHeight: CGFloat = 78
    public static let typeDisplayXlTracking: CGFloat = -0.025
    public static let typeDisplayLFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeDisplayLFontWeight: Int = 300
    public static let typeDisplayLFontSize: CGFloat = 44
    public static let typeDisplayLLineHeight: CGFloat = 48
    public static let typeDisplayLTracking: CGFloat = -0.025
    public static let typeDisplayMFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeDisplayMFontWeight: Int = 300
    public static let typeDisplayMFontSize: CGFloat = 34
    public static let typeDisplayMLineHeight: CGFloat = 38
    public static let typeDisplayMTracking: CGFloat = -0.025
    public static let typeDisplayAccentFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeDisplayAccentFontWeight: Int = 300
    public static let typeDisplayAccentFontSize: CGFloat = 34
    public static let typeDisplayAccentLineHeight: CGFloat = 38
    public static let typeDisplayAccentTracking: CGFloat = -0.025
    public static let typeDisplayAccentFontStyle: String = "italic"
    public static let typeTitleLFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeTitleLFontWeight: Int = 400
    public static let typeTitleLFontSize: CGFloat = 26
    public static let typeTitleLLineHeight: CGFloat = 32
    public static let typeTitleLTracking: CGFloat = -0.015
    public static let typeTitleMFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeTitleMFontWeight: Int = 400
    public static let typeTitleMFontSize: CGFloat = 22
    public static let typeTitleMLineHeight: CGFloat = 28
    public static let typeTitleMTracking: CGFloat = -0.01
    public static let typeTitleSFontFamily: [String] = ["Fraunces", "Iowan Old Style", "Georgia", "serif"]
    public static let typeTitleSFontWeight: Int = 400
    public static let typeTitleSFontSize: CGFloat = 18
    public static let typeTitleSLineHeight: CGFloat = 24
    public static let typeTitleSTracking: CGFloat = 0
    public static let typeBodyLFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeBodyLFontWeight: Int = 400
    public static let typeBodyLFontSize: CGFloat = 17
    public static let typeBodyLLineHeight: CGFloat = 26
    public static let typeBodyLTracking: CGFloat = 0
    public static let typeBodyMFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeBodyMFontWeight: Int = 400
    public static let typeBodyMFontSize: CGFloat = 15
    public static let typeBodyMLineHeight: CGFloat = 21
    public static let typeBodyMTracking: CGFloat = 0
    public static let typeBodySFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeBodySFontWeight: Int = 400
    public static let typeBodySFontSize: CGFloat = 13
    public static let typeBodySLineHeight: CGFloat = 18
    public static let typeBodySTracking: CGFloat = 0
    public static let typeLabelMFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeLabelMFontWeight: Int = 500
    public static let typeLabelMFontSize: CGFloat = 15
    public static let typeLabelMLineHeight: CGFloat = 20
    public static let typeLabelMTracking: CGFloat = 0
    public static let typeLabelSFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeLabelSFontWeight: Int = 500
    public static let typeLabelSFontSize: CGFloat = 13
    public static let typeLabelSLineHeight: CGFloat = 18
    public static let typeLabelSTracking: CGFloat = 0
    public static let typeLabelXsFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeLabelXsFontWeight: Int = 500
    public static let typeLabelXsFontSize: CGFloat = 10
    public static let typeLabelXsLineHeight: CGFloat = 12
    public static let typeLabelXsTracking: CGFloat = 0
    public static let typeEyebrowFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeEyebrowFontWeight: Int = 500
    public static let typeEyebrowFontSize: CGFloat = 11
    public static let typeEyebrowLineHeight: CGFloat = 14
    public static let typeEyebrowTracking: CGFloat = 0.14
    public static let typeCaptionFontFamily: [String] = ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
    public static let typeCaptionFontWeight: Int = 400
    public static let typeCaptionFontSize: CGFloat = 12
    public static let typeCaptionLineHeight: CGFloat = 16
    public static let typeCaptionTracking: CGFloat = 0
    public static let elevationSoftX: CGFloat = 0
    public static let elevationSoftY: CGFloat = 6
    public static let elevationSoftBlur: CGFloat = 24
    public static let elevationSoftSpread: CGFloat = 0
    public static let elevationSoftColor: PaldoraColor = PaldoraColor(argb: 0x123D2B1A)
    public static let elevationLiftX: CGFloat = 0
    public static let elevationLiftY: CGFloat = 14
    public static let elevationLiftBlur: CGFloat = 36
    public static let elevationLiftSpread: CGFloat = 0
    public static let elevationLiftColor: PaldoraColor = PaldoraColor(argb: 0x29332112)
    public static let layoutIphoneWidth: CGFloat = 402
    public static let layoutIphoneHeight: CGFloat = 874
    public static let layoutStatusBarHeight: CGFloat = 58
    public static let layoutHomeIndicatorHeight: CGFloat = 34
    public static let layoutTabBarWidth: CGFloat = 370
    public static let layoutTabBarHeight: CGFloat = 64
    public static let layoutTabBarTop: CGFloat = 774
    public static let layoutMobileGutter: CGFloat = 20
    public static let layoutWebSidebar: CGFloat = 264
    public static let layoutWebPagePadding: CGFloat = 48
    public static let layoutWebColumnGap: CGFloat = 40
    public static let layoutWebFeedColumn: CGFloat = 660
    public static let layoutWebRightRail: CGFloat = 388
    public static let iconSize: CGFloat = 24
    public static let iconStroke: CGFloat = 1.6
    public static let iconStrokeActive: CGFloat = 1.8
}

/// A color with a value per interface style. The app turns it into a dynamic
/// `Color` that resolves by `userInterfaceStyle`.
public struct PaldoraSemanticColor: Equatable, Sendable {
    public let light: PaldoraColor
    public let dark: PaldoraColor

    public init(light: PaldoraColor, dark: PaldoraColor) {
        self.light = light
        self.dark = dark
    }
}

/// Semantic colors, named like the Figma variables (color/bg/canvas = bgCanvas).
public enum PaldoraColors {
    public static let bgCanvas = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFF4EFE7), dark: PaldoraColor(argb: 0xFF14110E))
    public static let bgSurface = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFFBF8F3), dark: PaldoraColor(argb: 0xFF1D1915))
    public static let bgSunken = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFEAE2D5), dark: PaldoraColor(argb: 0xFF27221D))
    public static let bgInverse = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF2A2420), dark: PaldoraColor(argb: 0xFF2C2621))
    public static let bgInverseRaised = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF3A322C), dark: PaldoraColor(argb: 0xFF3A332C))
    public static let bgPaper = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFFFFFFF), dark: PaldoraColor(argb: 0xFFF1EBE1))
    public static let textPrimary = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF1D1A17), dark: PaldoraColor(argb: 0xFFF2EBDF))
    public static let textSecondary = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF4F473F), dark: PaldoraColor(argb: 0xFFC9BDAB))
    public static let textMuted = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF8C8276), dark: PaldoraColor(argb: 0xFF908574))
    public static let textOnInverse = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFFBF8F3), dark: PaldoraColor(argb: 0xFFFBF8F3))
    public static let borderHairline = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFE2D9CB), dark: PaldoraColor(argb: 0xFF352E27))
    public static let accentBrass = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFA9823F), dark: PaldoraColor(argb: 0xFFC39A52))
    public static let accentBrassText = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF7A5B24), dark: PaldoraColor(argb: 0xFFD9B26A))
    public static let accentBrassSoft = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFF1E6CF), dark: PaldoraColor(argb: 0xFF3A2F1E))
    public static let accentEmber = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFB65A3C), dark: PaldoraColor(argb: 0xFFD67A5C))
    public static let accentEmberSoft = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFF6E1D6), dark: PaldoraColor(argb: 0xFF3D241B))
    public static let accentSage = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF6F7D64), dark: PaldoraColor(argb: 0xFF9AAA8C))
    public static let accentSageSoft = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFE4E8DC), dark: PaldoraColor(argb: 0xFF263022))
    public static let accentOnBrass = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF1D1A17), dark: PaldoraColor(argb: 0xFF1D1A17))
    public static let actionPrimary = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF2A2420), dark: PaldoraColor(argb: 0xFFF2EBDF))
    public static let actionOnPrimary = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFFBF8F3), dark: PaldoraColor(argb: 0xFF1D1A17))
    public static let focusRing = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF8D6CD1), dark: PaldoraColor(argb: 0xFFC8B7E8))
    public static let statusDanger = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFA54B46), dark: PaldoraColor(argb: 0xFFE08A84))
    public static let statusSuccess = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF5B7255), dark: PaldoraColor(argb: 0xFF9DB596))
    public static let navActive = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFFBF8F3), dark: PaldoraColor(argb: 0xFFF2EBDF))
    public static let navOnActive = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFF1D1A17), dark: PaldoraColor(argb: 0xFF1D1A17))
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
