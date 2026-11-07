import PaldoraKit
import SwiftUI

// MARK: - Text styles beyond the generated type scale

/// Figma text styles used inside components that the token scale does not name
/// (sizes read from the "02 · Components" frames). Faces and sizes are the kit's;
/// every style scales with Dynamic Type.
extension PaldoraFont.Style {
    /// Button label, Large (Geist Medium 16).
    static let buttonL = PaldoraFont.Style(face: .uiMedium, size: 16, lineHeight: 22, tracking: 0, relativeTo: .body)
    /// Field input text (Geist Regular 16/22).
    static let ui16 = PaldoraFont.Style(face: .uiRegular, size: 16, lineHeight: 22, tracking: 0, relativeTo: .body)
    /// Compact UI text (Geist 14/20): banners, toasts, comments, notifications.
    static let ui14 = PaldoraFont.Style(face: .uiRegular, size: 14, lineHeight: 20, tracking: 0, relativeTo: .callout)
    static let ui14Medium = PaldoraFont.Style(face: .uiMedium, size: 14, lineHeight: 20, tracking: 0, relativeTo: .callout)
    static let ui14SemiBold = PaldoraFont.Style(face: .uiSemiBold, size: 14, lineHeight: 20, tracking: 0, relativeTo: .callout)
    static let ui13SemiBold = PaldoraFont.Style(face: .uiSemiBold, size: 13, lineHeight: 18, tracking: 0, relativeTo: .footnote)
    static let ui12Medium = PaldoraFont.Style(face: .uiMedium, size: 12, lineHeight: 16, tracking: 0, relativeTo: .caption)
    /// Eyebrow without `textCase`: callers uppercase the string (see `PaldoraEyebrow`).
    static let eyebrowPlain = PaldoraFont.Style(face: .uiMedium, size: PaldoraTokens.typeEyebrowFontSize,
                                                lineHeight: PaldoraTokens.typeEyebrowLineHeight,
                                                tracking: PaldoraTokens.typeEyebrowTracking, relativeTo: .caption)
    /// Tab bar label (Geist Medium 10/12).
    static let tabLabel = PaldoraFont.Style(face: .uiMedium, size: PaldoraTokens.typeLabelXsFontSize,
                                            lineHeight: PaldoraTokens.typeLabelXsLineHeight,
                                            tracking: PaldoraTokens.typeLabelXsTracking, relativeTo: .caption)
    /// Life Update headline (Fraunces Light 30/34, tracking -2.5%).
    static let lifeUpdateHeadline = PaldoraFont.Style(face: .displayLight, size: 30, lineHeight: 34, tracking: -0.025, relativeTo: .title)
}

// MARK: - Elevation

/// Figma elevation tokens: Soft (cards), Lift (floating surfaces). A SwiftUI shadow
/// radius is half the CSS blur.
enum PaldoraElevation {
    case soft, lift

    var color: Color {
        Color(self == .soft ? PaldoraTokens.elevationSoftColor : PaldoraTokens.elevationLiftColor)
    }
    var radius: CGFloat { (self == .soft ? PaldoraTokens.elevationSoftBlur : PaldoraTokens.elevationLiftBlur) / 2 }
    var yOffset: CGFloat { self == .soft ? PaldoraTokens.elevationSoftY : PaldoraTokens.elevationLiftY }
}

extension View {
    func paldoraElevation(_ elevation: PaldoraElevation) -> some View {
        #if DEBUG
        // The gallery audit runs flat: Xcode's contrast audit mis-samples text near shadows.
        if ProcessInfo.processInfo.environment["PALDORA_GALLERY_FLAT"] == "1" { return AnyView(self) }
        #endif
        return AnyView(shadow(color: elevation.color, radius: elevation.radius, x: 0, y: elevation.yOffset))
    }

    /// A 1 pt hairline border on a shape.
    func paldoraHairline<S: InsettableShape>(_ shape: S, color: Color = Theme.borderHairline,
                                             width: CGFloat = PaldoraTokens.borderWidthHairline) -> some View {
        overlay(shape.strokeBorder(color, lineWidth: width))
    }
}

// MARK: - Motion

/// Motion tokens: fast 120 ms, standard 200 ms, slow 320 ms on the kit's easing.
/// Reduce Motion removes the animation entirely (state still changes).
enum PaldoraMotion {
    static func animation(_ duration: TimeInterval = PaldoraTokens.durationStandard) -> Animation {
        let e = PaldoraTokens.easingStandard
        return .timingCurve(e[0], e[1], e[2], e[3], duration: duration)
    }
}

private struct PaldoraAnimationModifier<Value: Equatable>: ViewModifier {
    let duration: TimeInterval
    let value: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : PaldoraMotion.animation(duration), value: value)
    }
}

extension View {
    /// Animates changes of `value` with the standard curve unless Reduce Motion is on.
    func paldoraAnimation<Value: Equatable>(_ duration: TimeInterval = PaldoraTokens.durationStandard,
                                            value: Value) -> some View {
        modifier(PaldoraAnimationModifier(duration: duration, value: value))
    }
}

// MARK: - Hit targets and focus

/// Every control keeps a 44 pt hit target even when its drawing is smaller
/// (a 36 pt button, a 40 pt icon button).
enum PaldoraHitTarget {
    static let minimum = Theme.touchTarget

    /// The hit-target side for a drawn size.
    static func side(for drawn: CGFloat) -> CGFloat { max(drawn, minimum) }
}

extension View {
    /// Expands the layout and hit region to at least 44 x 44 pt.
    func paldoraHitTarget() -> some View {
        frame(minWidth: PaldoraHitTarget.minimum, minHeight: PaldoraHitTarget.minimum)
            .contentShape(Rectangle())
    }

    /// Draws the focus ring (`color.focus`, 3 pt) when the control has keyboard focus.
    func paldoraFocusRing<S: InsettableShape>(_ shape: S) -> some View {
        modifier(PaldoraFocusRing(shape: shape))
    }
}

private struct PaldoraFocusRing<S: InsettableShape>: ViewModifier {
    let shape: S
    @Environment(\.isFocused) private var isFocused

    func body(content: Content) -> some View {
        content.overlay(
            shape.stroke(Theme.focusRing, lineWidth: PaldoraTokens.sizeFocusRing)
                .padding(-PaldoraTokens.sizeFocusRing)
                .opacity(isFocused ? 1 : 0)
                .allowsHitTesting(false)
        )
    }
}

/// Dims slightly while pressed; the base of the plain interactive controls.
struct PaldoraPressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Tone (Banner, Toast)

/// The status tones of Banner (Info, Success, Warning, Danger).
enum PaldoraTone: CaseIterable, Equatable {
    case info, success, warning, danger

    var icon: PaldoraIcon {
        switch self {
        case .info, .warning: .info
        case .success: .check
        case .danger: .alert
        }
    }

    /// Spoken before the text so the tone never relies on color alone.
    var spokenPrefix: String? {
        switch self {
        case .info: nil
        case .success: "Success"
        case .warning: "Warning"
        case .danger: "Error"
        }
    }

    var background: Color {
        switch self {
        case .info: Theme.bgSunken
        case .success: Theme.sageSoft
        case .warning: Theme.brassSoft
        case .danger: Theme.emberSoft
        }
    }

    var iconColor: Color {
        switch self {
        case .info: Theme.textSecondary
        case .success: Theme.sage
        case .warning: Theme.brassText
        case .danger: Theme.statusDanger
        }
    }

    /// Title color. Success uses text/primary: sage on sage-soft is 3.5:1 in Light.
    var titleColor: Color {
        switch self {
        case .info, .success: Theme.textPrimary
        case .warning: Theme.brassText
        case .danger: Theme.statusDanger
        }
    }
}

/// A Figma "Eyebrow" label (Geist Medium 11, +14% tracking, uppercase).
struct PaldoraEyebrow: View {
    let text: String
    var color: Color = Theme.textSecondary

    init(_ text: String, color: Color = Theme.textSecondary) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased()).paldoraText(.eyebrowPlain).foregroundStyle(color)
    }
}
