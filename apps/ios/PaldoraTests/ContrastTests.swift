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

    private static let appPairs: [Pair] = {
        typealias T = PaldoraTokens
        var pairs: [Pair] = []
        // Light appearance: Theme.text, textMuted, goldText, danger, success on canvas, surface and highlight.
        let light: [(String, PaldoraColor)] = [("canvas", T.themeLightCanvas), ("surface", T.themeLightSurface), ("highlight", T.themeLightHighlight)]
        for (bgName, bg) in light {
            pairs += [
                Pair(name: "light text on \(bgName)", foreground: T.themeLightText, background: bg),
                Pair(name: "light textMuted on \(bgName)", foreground: T.themeLightTextMuted, background: bg),
            ]
        }
        // goldText, danger and success never sit on the highlight fill (chips and avatars use
        // text and textMuted there), so only canvas and surface are checked for them.
        for (bgName, bg) in [("canvas", T.themeLightCanvas), ("surface", T.themeLightSurface)] {
            pairs += [
                Pair(name: "light goldText on \(bgName)", foreground: T.themeLightAccentText, background: bg),
                Pair(name: "light danger on \(bgName)", foreground: T.themeLightDangerText, background: bg),
                Pair(name: "light success on \(bgName)", foreground: T.themeLightSuccessText, background: bg),
            ]
        }
        let dark: [(String, PaldoraColor)] = [("canvas", T.themeDarkCanvas), ("surface", T.themeDarkSurface)]
        for (bgName, bg) in dark {
            pairs += [
                Pair(name: "dark text on \(bgName)", foreground: T.themeDarkText, background: bg),
                Pair(name: "dark textMuted on \(bgName)", foreground: T.themeDarkTextMuted, background: bg),
                Pair(name: "dark goldText on \(bgName)", foreground: T.themeDarkAccentText, background: bg),
                Pair(name: "dark danger on \(bgName)", foreground: T.themeDarkDangerText, background: bg),
                Pair(name: "dark success on \(bgName)", foreground: T.themeDarkSuccessText, background: bg),
            ]
        }
        pairs += [
            Pair(name: "light text on highlight", foreground: T.themeLightText, background: T.themeLightHighlight),
            Pair(name: "light textMuted on highlight", foreground: T.themeLightTextMuted, background: T.themeLightHighlight),
        ]
        // The dark "highlight" token is the surface (Theme.highlight uses themeDarkSurface in dark).
        pairs += [
            Pair(name: "light onInk (ivory) on ink (obsidian)", foreground: T.colorBrandIvory, background: T.colorBrandObsidian),
            Pair(name: "dark onInk (obsidian) on ink (champagne)", foreground: T.colorBrandObsidian, background: T.colorBrandChampagne),
            Pair(name: "light primary text on ink hover", foreground: T.colorBrandIvory, background: T.colorBrandObsidian),
        ]
        return pairs
    }()

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
