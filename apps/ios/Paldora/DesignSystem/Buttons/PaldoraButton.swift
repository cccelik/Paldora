import PaldoraKit
import SwiftUI

enum PaldoraButtonKind: CaseIterable, Equatable {
    case primary, secondary, accent, ghost, danger
}

enum PaldoraButtonSize: CaseIterable, Equatable {
    case large, medium, small

    /// Drawn pill height from Figma (56 / 48 / 36).
    var height: CGFloat {
        switch self {
        case .large: 56
        case .medium: 48
        case .small: 36
        }
    }
    var horizontalPadding: CGFloat { self == .small ? 14 : 22 }
    var textStyle: PaldoraFont.Style {
        switch self {
        case .large: .buttonL
        case .medium: .labelM
        case .small: .labelS
        }
    }
    var iconSize: CGFloat { self == .small ? 14 : 18 }
}

/// The pure mapping from kind and state to what is drawn, so it can be tested
/// without rendering. Disabled is the same drawing at 40% opacity (Figma).
struct PaldoraButtonAppearance: Equatable {
    enum Fill: Equatable { case none, surface, primary, brass, danger }
    enum Content: Equatable { case text, onPrimary, onBrass, danger }

    let fill: Fill
    let content: Content
    let hasBorder: Bool
    let opacity: Double

    static let disabledOpacity = 0.4
    static let pressedOpacity = 0.85

    static func resolve(kind: PaldoraButtonKind, isEnabled: Bool = true, isPressed: Bool = false,
                        destructive: Bool = false) -> PaldoraButtonAppearance {
        let opacity = !isEnabled ? disabledOpacity : (isPressed ? pressedOpacity : 1)
        switch kind {
        case .primary: return .init(fill: .primary, content: .onPrimary, hasBorder: false, opacity: opacity)
        case .secondary: return .init(fill: .surface, content: .text, hasBorder: true, opacity: opacity)
        // Brass takes ink text (accent/on-brass, 4.9:1); the Figma cream label is 3.3:1.
        case .accent: return .init(fill: .brass, content: .onBrass, hasBorder: false, opacity: opacity)
        case .ghost: return .init(fill: .none, content: destructive ? .danger : .text, hasBorder: false, opacity: opacity)
        case .danger: return .init(fill: .danger, content: .onPrimary, hasBorder: false, opacity: opacity)
        }
    }

    var fillColor: Color? {
        switch fill {
        case .none: nil
        case .surface: Theme.bgSurface
        case .primary: Theme.actionPrimary
        case .brass: Theme.brass
        case .danger: Theme.statusDanger
        }
    }

    var contentColor: Color {
        switch content {
        case .text: Theme.textPrimary
        case .onPrimary: Theme.actionOnPrimary
        case .onBrass: Theme.onBrass
        case .danger: Theme.statusDanger
        }
    }
}

/// The pill button look. Use `PaldoraButton` for the common case; apply this style
/// to a custom `Button` (a `NavigationLink`, a `Menu`) to match it.
struct PaldoraButtonStyle: ButtonStyle {
    var kind: PaldoraButtonKind = .primary
    var size: PaldoraButtonSize = .medium
    var fullWidth = false
    var isLoading = false
    var destructive = false

    func makeBody(configuration: Configuration) -> some View {
        StyledBody(configuration: configuration, style: self)
    }

    private struct StyledBody: View {
        let configuration: ButtonStyleConfiguration
        let style: PaldoraButtonStyle
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            let look = PaldoraButtonAppearance.resolve(kind: style.kind, isEnabled: isEnabled,
                                                       isPressed: configuration.isPressed, destructive: style.destructive)
            HStack(spacing: Theme.space2) {
                if style.isLoading { ProgressView().tint(look.contentColor) }
                configuration.label
            }
            .paldoraText(style.size.textStyle)
            .foregroundStyle(look.contentColor)
            .multilineTextAlignment(.center)
            .padding(.horizontal, style.size.horizontalPadding)
            .padding(.vertical, Theme.space2)
            .frame(maxWidth: style.fullWidth ? .infinity : nil, minHeight: style.size.height)
            .background { if let fill = look.fillColor { Capsule().fill(fill) } }
            .paldoraHairline(Capsule(), width: look.hasBorder ? PaldoraTokens.borderWidthHairline : 0)
            .paldoraFocusRing(Capsule())
            .opacity(look.opacity)
            // The drawing may be 36 pt; the hit region is never below 44 pt.
            .frame(maxWidth: style.fullWidth ? .infinity : nil, minHeight: PaldoraHitTarget.minimum)
            .contentShape(Rectangle())
        }
    }
}

/// Figma "Button": Primary, Secondary, Accent, Ghost, Danger × L / M / S, pill.
/// Loading shows a spinner inside the button (the only place spinners are used),
/// ignores taps and speaks "Loading".
struct PaldoraButton: View {
    let title: String
    var kind: PaldoraButtonKind = .primary
    var size: PaldoraButtonSize = .large
    var icon: PaldoraIcon?
    var isLoading = false
    var fullWidth = false
    var destructive = false
    let action: () -> Void

    init(_ title: String, kind: PaldoraButtonKind = .primary, size: PaldoraButtonSize = .large,
         icon: PaldoraIcon? = nil, isLoading: Bool = false, fullWidth: Bool = false,
         destructive: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.kind = kind
        self.size = size
        self.icon = icon
        self.isLoading = isLoading
        self.fullWidth = fullWidth
        self.destructive = destructive
        self.action = action
    }

    var body: some View {
        Button {
            if !isLoading { action() }
        } label: {
            HStack(spacing: Theme.space2) {
                if let icon { PaldoraIconView(icon, size: size.iconSize) }
                Text(title)
            }
        }
        .buttonStyle(PaldoraButtonStyle(kind: kind, size: size, fullWidth: fullWidth,
                                        isLoading: isLoading, destructive: destructive))
        .accessibilityValue(isLoading ? "Loading" : "")
    }
}

#Preview("Buttons") {
    VStack(alignment: .leading, spacing: Theme.space3) {
        ForEach(PaldoraButtonKind.allCases, id: \.self) { kind in
            HStack {
                PaldoraButton("Button", kind: kind, size: .large) {}
                PaldoraButton("Button", kind: kind, size: .medium) {}
                PaldoraButton("Button", kind: kind, size: .small) {}.disabled(true)
            }
        }
        PaldoraButton("Saving", kind: .primary, isLoading: true, fullWidth: true) {}
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
