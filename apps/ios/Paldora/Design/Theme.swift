import PaldoraKit
import SwiftUI

extension Color {
    init(_ token: PaldoraColor) {
        self.init(.sRGB, red: token.red, green: token.green, blue: token.blue, opacity: token.alpha)
    }

    /// A Hearth & Brass semantic color; resolves per interface style.
    init(_ token: PaldoraSemanticColor) {
        self.init(light: token.light, dark: token.dark)
    }

    /// Resolves per interface style so Light, Dark and System all work.
    init(light: PaldoraColor, dark: PaldoraColor) {
        self.init(UIColor { traits in
            let token = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: token.red, green: token.green, blue: token.blue, alpha: token.alpha)
        })
    }
}

/// App colors and metrics, all from the generated `PaldoraTokens` and
/// `PaldoraColors` (Hearth & Brass v2, ADR 024). Brass is a signal (marks,
/// focus, hairlines), never a large fill. Names under "v2" match the Figma
/// variables; the older names below them are kept so existing views compile.
enum Theme {
    // MARK: v2 (color/bg/*, text/*, border/*, accent/*, action/*, status/*, nav/*)
    static let bgCanvas = Color(PaldoraColors.bgCanvas)
    static let bgSurface = Color(PaldoraColors.bgSurface)
    static let bgSunken = Color(PaldoraColors.bgSunken)
    /// Stays dark in both appearances (Life Updates, tab bar, toasts).
    static let bgInverse = Color(PaldoraColors.bgInverse)
    static let bgInverseRaised = Color(PaldoraColors.bgInverseRaised)
    static let bgPaper = Color(PaldoraColors.bgPaper)
    static let textPrimary = Color(PaldoraColors.textPrimary)
    static let textSecondary = Color(PaldoraColors.textSecondary)
    /// Figma text/muted: 3.3:1 on canvas in Light, so decorative or large text only.
    static let textTertiary = Color(PaldoraColors.textMuted)
    static let textOnInverse = Color(PaldoraColors.textOnInverse)
    static let borderHairline = Color(PaldoraColors.borderHairline)
    static let brass = Color(PaldoraColors.accentBrass)
    static let brassText = Color(PaldoraColors.accentBrassText)
    static let brassSoft = Color(PaldoraColors.accentBrassSoft)
    static let onBrass = Color(PaldoraColors.accentOnBrass)
    static let ember = Color(PaldoraColors.accentEmber)
    static let emberSoft = Color(PaldoraColors.accentEmberSoft)
    static let sage = Color(PaldoraColors.accentSage)
    static let sageSoft = Color(PaldoraColors.accentSageSoft)
    static let actionPrimary = Color(PaldoraColors.actionPrimary)
    static let actionOnPrimary = Color(PaldoraColors.actionOnPrimary)
    static let focusRing = Color(PaldoraColors.focusRing)
    static let statusDanger = Color(PaldoraColors.statusDanger)
    static let statusSuccess = Color(PaldoraColors.statusSuccess)
    static let navActive = Color(PaldoraColors.navActive)
    static let navOnActive = Color(PaldoraColors.navOnActive)

    // MARK: Names used by the existing views (mapped to v2)
    static let canvas = bgCanvas
    static let surface = bgSurface
    static let text = textPrimary
    /// Mapped to text/secondary so small text keeps AA; v2 views choose between
    /// `textSecondary` and `textTertiary` explicitly.
    static let textMuted = textSecondary
    static let gold = brass
    static let goldText = brassText
    static let highlight = brassSoft
    static let lavender = sage
    static let danger = statusDanger
    static let success = statusSuccess
    static let focus = focusRing
    /// Espresso in Light, cream in Dark: the primary button fill.
    static let ink = actionPrimary
    static let onInk = actionOnPrimary
    static let hairline = borderHairline

    static let space1 = PaldoraTokens.space1
    static let space2 = PaldoraTokens.space2
    static let space3 = PaldoraTokens.space3
    static let space4 = PaldoraTokens.space4
    static let space5 = PaldoraTokens.space5
    static let space6 = PaldoraTokens.space6
    static let space8 = PaldoraTokens.space8
    static let radiusSm = PaldoraTokens.radiusSm
    static let radius = PaldoraTokens.radiusMd
    static let radiusLg = PaldoraTokens.radiusLg
    static let radiusXl = PaldoraTokens.radiusXl
    static let radiusSheet = PaldoraTokens.radiusSheet
    static let touchTarget = PaldoraTokens.sizeTouchTarget
    /// Readable column width; keeps iPad layouts from stretching.
    static let readingWidth = PaldoraTokens.sizeReadingColumn
    static let contentWidth = PaldoraTokens.sizeContentMax
    static let gutter = PaldoraTokens.layoutMobileGutter
}
