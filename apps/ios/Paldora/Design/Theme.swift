import PaldoraKit
import SwiftUI

extension Color {
    init(_ token: PaldoraColor) {
        self.init(.sRGB, red: token.red, green: token.green, blue: token.blue, opacity: token.alpha)
    }

    /// Resolves per interface style so Light, Dark and System all work.
    init(light: PaldoraColor, dark: PaldoraColor) {
        self.init(UIColor { traits in
            let token = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: token.red, green: token.green, blue: token.blue, alpha: token.alpha)
        })
    }
}

/// App colors and metrics, all from the generated `PaldoraTokens`.
/// Gold is a signal (marks, focus, hairlines), never a large fill.
enum Theme {
    static let canvas = Color(light: PaldoraTokens.themeLightCanvas, dark: PaldoraTokens.themeDarkCanvas)
    static let surface = Color(light: PaldoraTokens.themeLightSurface, dark: PaldoraTokens.themeDarkSurface)
    static let text = Color(light: PaldoraTokens.themeLightText, dark: PaldoraTokens.themeDarkText)
    static let textMuted = Color(light: PaldoraTokens.themeLightTextMuted, dark: PaldoraTokens.themeDarkTextMuted)
    static let gold = Color(light: PaldoraTokens.themeLightAccent, dark: PaldoraTokens.themeDarkAccent)
    static let goldText = Color(light: PaldoraTokens.themeLightAccentText, dark: PaldoraTokens.themeDarkAccentText)
    static let highlight = Color(light: PaldoraTokens.themeLightHighlight, dark: PaldoraTokens.themeDarkSurface)
    static let lavender = Color(light: PaldoraTokens.themeLightEmotional, dark: PaldoraTokens.themeDarkEmotional)
    static let danger = Color(light: PaldoraTokens.themeLightDangerText, dark: PaldoraTokens.themeDarkDangerText)
    static let success = Color(light: PaldoraTokens.themeLightSuccessText, dark: PaldoraTokens.themeDarkSuccessText)
    static let focus = Color(light: PaldoraTokens.themeLightFocus, dark: PaldoraTokens.themeDarkFocus)
    /// Ink in light mode, champagne text in dark: the primary button fill.
    static let ink = Color(light: PaldoraTokens.colorBrandObsidian, dark: PaldoraTokens.colorBrandChampagne)
    static let onInk = Color(light: PaldoraTokens.colorBrandIvory, dark: PaldoraTokens.colorBrandObsidian)
    static let hairline = Color(light: PaldoraTokens.themeLightText, dark: PaldoraTokens.themeDarkText).opacity(PaldoraTokens.borderOpacityDefault)

    static let space1 = PaldoraTokens.space1
    static let space2 = PaldoraTokens.space2
    static let space3 = PaldoraTokens.space3
    static let space4 = PaldoraTokens.space4
    static let space6 = PaldoraTokens.space6
    static let space8 = PaldoraTokens.space8
    static let radius = PaldoraTokens.radiusMd
    static let touchTarget = PaldoraTokens.sizeTouchTarget
    /// Readable column width; keeps iPad layouts from stretching.
    static let readingWidth = PaldoraTokens.sizeReadingColumn
    static let contentWidth = PaldoraTokens.sizeContentMax
}

/// Serif for brand moments, system sans for everything functional.
/// Text styles keep Dynamic Type working.
enum Typography {
    static let brand = Font.system(.largeTitle, design: .serif).weight(.semibold)
    static let brandSmall = Font.system(.title3, design: .serif).weight(.semibold)
    static let title = Font.system(.title2).weight(.semibold)
    static let headline = Font.system(.headline)
    static let body = Font.system(.body)
    static let callout = Font.system(.callout)
    static let caption = Font.system(.footnote)
    static let label = Font.system(.subheadline).weight(.medium)
}
