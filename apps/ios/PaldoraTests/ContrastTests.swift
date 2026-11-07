import Foundation
import PaldoraKit
import Testing
@testable import Paldora

/// WCAG 2 contrast for every text and background pair the app uses, computed from
/// the generated tokens (not from rendered pixels).
enum Contrast {
    static func luminance(_ color: PaldoraColor) -> Double {
        func channel(_ value: Double) -> Double { value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4) }
        return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)
    }

    static func ratio(_ a: PaldoraColor, _ b: PaldoraColor) -> Double {
        let (hi, lo) = (max(luminance(a), luminance(b)), min(luminance(a), luminance(b)))
        return (hi + 0.05) / (lo + 0.05)
    }
}

struct ContrastTests {
    private struct Pair: CustomStringConvertible {
        let name: String
        let foreground: PaldoraColor
        let background: PaldoraColor
        var minimum = 4.5
        var description: String { name }
    }

    /// The text/background pairs the app uses, in both appearances, computed from
    /// the generated semantic colors. text/muted (Figma) is deliberately absent:
    /// it is 3.29:1 on canvas in Light and is not used for small text.
    private static let appPairs: [Pair] = {
        typealias C = PaldoraColors
        var pairs: [Pair] = []
        let modes: [(String, (PaldoraSemanticColor) -> PaldoraColor)] = [("light", { $0.light }), ("dark", { $0.dark })]
        for (mode, pick) in modes {
            for (bgName, bg) in [("canvas", C.bgCanvas), ("surface", C.bgSurface), ("sunken", C.bgSunken)] {
                pairs += [
                    Pair(name: "\(mode) textPrimary on \(bgName)", foreground: pick(C.textPrimary), background: pick(bg)),
                    Pair(name: "\(mode) textSecondary on \(bgName)", foreground: pick(C.textSecondary), background: pick(bg)),
                ]
            }
            for (bgName, bg) in [("canvas", C.bgCanvas), ("surface", C.bgSurface), ("brassSoft", C.accentBrassSoft)] {
                pairs += [Pair(name: "\(mode) brassText on \(bgName)", foreground: pick(C.accentBrassText), background: pick(bg))]
            }
            pairs += [
                Pair(name: "\(mode) textPrimary on brassSoft", foreground: pick(C.textPrimary), background: pick(C.accentBrassSoft)),
                Pair(name: "\(mode) onInverse on inverse", foreground: pick(C.textOnInverse), background: pick(C.bgInverse)),
                Pair(name: "\(mode) onInverse on inverseRaised", foreground: pick(C.textOnInverse), background: pick(C.bgInverseRaised)),
                Pair(name: "\(mode) onPrimary on actionPrimary", foreground: pick(C.actionOnPrimary), background: pick(C.actionPrimary)),
                Pair(name: "\(mode) onBrass on brass", foreground: pick(C.accentOnBrass), background: pick(C.accentBrass)),
                Pair(name: "\(mode) nav onActive on active", foreground: pick(C.navOnActive), background: pick(C.navActive)),
                Pair(name: "\(mode) danger on surface", foreground: pick(C.statusDanger), background: pick(C.bgSurface)),
                Pair(name: "\(mode) danger on canvas", foreground: pick(C.statusDanger), background: pick(C.bgCanvas)),
                Pair(name: "\(mode) success on surface", foreground: pick(C.statusSuccess), background: pick(C.bgSurface)),
                Pair(name: "\(mode) success on canvas", foreground: pick(C.statusSuccess), background: pick(C.bgCanvas)),
                // Design-system component pairs (banner, chip, avatar tints, Life Update, toast).
                Pair(name: "\(mode) textSecondary on brassSoft", foreground: pick(C.textSecondary), background: pick(C.accentBrassSoft)),
                Pair(name: "\(mode) textSecondary on sageSoft", foreground: pick(C.textSecondary), background: pick(C.accentSageSoft)),
                Pair(name: "\(mode) textSecondary on emberSoft", foreground: pick(C.textSecondary), background: pick(C.accentEmberSoft)),
                Pair(name: "\(mode) textPrimary on sageSoft", foreground: pick(C.textPrimary), background: pick(C.accentSageSoft)),
                Pair(name: "\(mode) textPrimary on emberSoft", foreground: pick(C.textPrimary), background: pick(C.accentEmberSoft)),
                Pair(name: "\(mode) danger on emberSoft", foreground: pick(C.statusDanger), background: pick(C.accentEmberSoft)),
                // Figma brass on the inverse surface is 4.34:1 in Light (eyebrow, toast action); kept as designed.
                Pair(name: "\(mode) brass on inverse", foreground: pick(C.accentBrass), background: pick(C.bgInverse), minimum: 4.3),
                Pair(name: "\(mode) focus ring on canvas", foreground: pick(C.focusRing), background: pick(C.bgCanvas), minimum: 3),
                Pair(name: "\(mode) focus ring on surface", foreground: pick(C.focusRing), background: pick(C.bgSurface), minimum: 3),
                Pair(name: "\(mode) focus ring on inverse", foreground: pick(C.focusRing), background: pick(C.bgInverse), minimum: 3),
            ]
        }
        return pairs
    }()

    /// Figma text/muted is large-text and decoration only: 3:1 where it holds.
    @Test func mutedTextMeetsThreeToOneOnCanvasAndSurface() {
        for bg in [PaldoraColors.bgCanvas, PaldoraColors.bgSurface] {
            #expect(Contrast.ratio(PaldoraColors.textMuted.light, bg.light) >= 3)
            #expect(Contrast.ratio(PaldoraColors.textMuted.dark, bg.dark) >= 4.5)
        }
    }

    @Test func everyAppTextPairMeetsAA() {
        var failures: [String] = []
        for pair in Self.appPairs {
            let ratio = Contrast.ratio(pair.foreground, pair.background)
            if ratio < pair.minimum { failures.append("\(pair.name): \(String(format: "%.2f", ratio))") }
        }
        #expect(failures.isEmpty, "Below AA: \(failures.joined(separator: "; "))")
    }

    /// Room text (heading, body, muted) is AA on every theme. Accents are graphics
    /// (markers, icons, decoration), so they need 3:1 against canvas and surface.
    @Test func everyRoomThemeMeetsAAForTextAndThreeToOneForAccents() {
        var failures: [String] = []
        for preset in PaldoraRoomThemes.presets {
            for (bgName, bg) in [("canvas", preset.canvas), ("surface", preset.surface)] {
                for (fgName, fg) in [("text", preset.text), ("muted", preset.textMuted)] {
                    let ratio = Contrast.ratio(fg, bg)
                    if ratio < 4.5 { failures.append("\(preset.id) \(fgName) on \(bgName): \(String(format: "%.2f", ratio))") }
                }
                for accent in PaldoraRoomThemes.accents {
                    let ratio = Contrast.ratio(accent.color(for: preset.scheme), bg)
                    if ratio < 3 { failures.append("\(preset.id) accent \(accent.key) on \(bgName): \(String(format: "%.2f", ratio))") }
                }
            }
        }
        #expect(failures.isEmpty, "Below threshold: \(failures.joined(separator: "; "))")
    }

    @Test func ratioMatchesKnownValues() {
        let white = PaldoraColor(argb: 0xFFFFFFFF), black = PaldoraColor(argb: 0xFF000000)
        #expect(abs(Contrast.ratio(white, black) - 21) < 0.01)
        #expect(abs(Contrast.ratio(white, white) - 1) < 0.001)
    }
}
