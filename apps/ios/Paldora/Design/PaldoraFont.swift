import PaldoraKit
import SwiftUI
import UIKit

/// Hearth & Brass type: Fraunces (display), Geist (UI), Geist Mono (code, IDs).
///
/// Fonts are bundled TTFs (`Resources/Fonts`, listed in `UIAppFonts`, SIL OFL).
/// If a face is missing or fails to register, every style falls back to the
/// system font of the same role (serif for display, default for UI, monospaced
/// for code), so text is never blank. All sizes scale with Dynamic Type.
enum PaldoraFont {
    enum Face: String, CaseIterable {
        case displayLight = "Fraunces-Light"
        case displayLightItalic = "Fraunces-LightItalic"
        case displayRegular = "Fraunces-Regular"
        case uiRegular = "Geist-Regular"
        case uiMedium = "Geist-Medium"
        case uiSemiBold = "Geist-SemiBold"
        case mono = "GeistMono-Regular"

        var fallbackDesign: Font.Design {
            switch self {
            case .displayLight, .displayLightItalic, .displayRegular: .serif
            case .uiRegular, .uiMedium, .uiSemiBold: .default
            case .mono: .monospaced
            }
        }

        var fallbackWeight: Font.Weight {
            switch self {
            case .displayLight, .displayLightItalic: .light
            case .displayRegular, .uiRegular, .mono: .regular
            case .uiMedium: .medium
            case .uiSemiBold: .semibold
            }
        }

        var isItalic: Bool { self == .displayLightItalic }

        /// True when the bundled face registered with the system.
        var isAvailable: Bool { UIFont(name: rawValue, size: 12) != nil }
    }

    /// A Figma text style: face, size, line height and tracking from the tokens.
    struct Style: Equatable {
        let face: Face
        let size: CGFloat
        let lineHeight: CGFloat
        /// Tracking as a ratio of the size (Figma letter spacing).
        let tracking: CGFloat
        let relativeTo: Font.TextStyle
        var uppercased = false

        static let displayXl = Style(face: .displayLight, size: PaldoraTokens.typeDisplayXlFontSize, lineHeight: PaldoraTokens.typeDisplayXlLineHeight, tracking: PaldoraTokens.typeDisplayXlTracking, relativeTo: .largeTitle)
        static let displayL = Style(face: .displayLight, size: PaldoraTokens.typeDisplayLFontSize, lineHeight: PaldoraTokens.typeDisplayLLineHeight, tracking: PaldoraTokens.typeDisplayLTracking, relativeTo: .largeTitle)
        static let displayM = Style(face: .displayLight, size: PaldoraTokens.typeDisplayMFontSize, lineHeight: PaldoraTokens.typeDisplayMLineHeight, tracking: PaldoraTokens.typeDisplayMTracking, relativeTo: .largeTitle)
        static let displayAccent = Style(face: .displayLightItalic, size: PaldoraTokens.typeDisplayAccentFontSize, lineHeight: PaldoraTokens.typeDisplayAccentLineHeight, tracking: PaldoraTokens.typeDisplayAccentTracking, relativeTo: .largeTitle)
        static let titleL = Style(face: .displayRegular, size: PaldoraTokens.typeTitleLFontSize, lineHeight: PaldoraTokens.typeTitleLLineHeight, tracking: PaldoraTokens.typeTitleLTracking, relativeTo: .title)
        static let titleM = Style(face: .displayRegular, size: PaldoraTokens.typeTitleMFontSize, lineHeight: PaldoraTokens.typeTitleMLineHeight, tracking: PaldoraTokens.typeTitleMTracking, relativeTo: .title2)
        static let titleS = Style(face: .displayRegular, size: PaldoraTokens.typeTitleSFontSize, lineHeight: PaldoraTokens.typeTitleSLineHeight, tracking: PaldoraTokens.typeTitleSTracking, relativeTo: .title3)
        static let bodyL = Style(face: .uiRegular, size: PaldoraTokens.typeBodyLFontSize, lineHeight: PaldoraTokens.typeBodyLLineHeight, tracking: PaldoraTokens.typeBodyLTracking, relativeTo: .body)
        static let bodyM = Style(face: .uiRegular, size: PaldoraTokens.typeBodyMFontSize, lineHeight: PaldoraTokens.typeBodyMLineHeight, tracking: PaldoraTokens.typeBodyMTracking, relativeTo: .callout)
        static let bodyS = Style(face: .uiRegular, size: PaldoraTokens.typeBodySFontSize, lineHeight: PaldoraTokens.typeBodySLineHeight, tracking: PaldoraTokens.typeBodySTracking, relativeTo: .footnote)
        static let labelM = Style(face: .uiMedium, size: PaldoraTokens.typeLabelMFontSize, lineHeight: PaldoraTokens.typeLabelMLineHeight, tracking: PaldoraTokens.typeLabelMTracking, relativeTo: .subheadline)
        static let labelS = Style(face: .uiMedium, size: PaldoraTokens.typeLabelSFontSize, lineHeight: PaldoraTokens.typeLabelSLineHeight, tracking: PaldoraTokens.typeLabelSTracking, relativeTo: .footnote)
        static let labelXs = Style(face: .uiMedium, size: PaldoraTokens.typeLabelXsFontSize, lineHeight: PaldoraTokens.typeLabelXsLineHeight, tracking: PaldoraTokens.typeLabelXsTracking, relativeTo: .caption2)
        static let eyebrow = Style(face: .uiMedium, size: PaldoraTokens.typeEyebrowFontSize, lineHeight: PaldoraTokens.typeEyebrowLineHeight, tracking: PaldoraTokens.typeEyebrowTracking, relativeTo: .caption2, uppercased: true)
        static let caption = Style(face: .uiRegular, size: PaldoraTokens.typeCaptionFontSize, lineHeight: PaldoraTokens.typeCaptionLineHeight, tracking: PaldoraTokens.typeCaptionTracking, relativeTo: .caption)
        static let code = Style(face: .mono, size: PaldoraTokens.typeBodySFontSize, lineHeight: PaldoraTokens.typeBodySLineHeight, tracking: 0, relativeTo: .footnote)

        /// The SwiftUI font: the bundled face scaled with Dynamic Type, or the system fallback.
        var font: Font {
            if face.isAvailable {
                return .custom(face.rawValue, size: size, relativeTo: relativeTo)
            }
            let fallback = Font.system(size: size, weight: face.fallbackWeight, design: face.fallbackDesign)
            return face.isItalic ? fallback.italic() : fallback
        }

        /// Extra spacing between lines so the Figma line height holds (never negative).
        var lineSpacing: CGFloat { max(0, lineHeight - size * 1.2) }
        var trackingPoints: CGFloat { tracking * size }
    }
}

extension View {
    /// Applies a Figma text style: font (Dynamic Type aware), tracking, line spacing, case.
    func paldoraText(_ style: PaldoraFont.Style) -> some View {
        self.font(style.font)
            .tracking(style.trackingPoints)
            .lineSpacing(style.lineSpacing)
            .textCase(style.uppercased ? .uppercase : nil)
    }
}

/// Existing view names, mapped onto the Figma text styles.
enum Typography {
    static let brand = PaldoraFont.Style.displayM.font
    static let brandSmall = PaldoraFont.Style.titleL.font
    static let title = PaldoraFont.Style.titleM.font
    static let headline = PaldoraFont.Style.labelM.font
    static let body = PaldoraFont.Style.bodyL.font
    static let callout = PaldoraFont.Style.bodyM.font
    static let caption = PaldoraFont.Style.bodyS.font
    static let label = PaldoraFont.Style.labelS.font
}
