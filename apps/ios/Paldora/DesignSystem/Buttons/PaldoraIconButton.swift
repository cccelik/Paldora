import PaldoraKit
import SwiftUI

enum PaldoraIconButtonStyle: CaseIterable, Equatable {
    case surface, primary, plain
}

enum PaldoraIconButtonSize: CaseIterable, Equatable {
    case medium, large

    /// Drawn diameter from Figma (40 / 52).
    var diameter: CGFloat { self == .medium ? 40 : 52 }
    var iconSize: CGFloat { self == .medium ? 20 : 22 }
}

/// Figma "Icon button": circular, Surface / Primary / Plain × 40 / 52. A visible
/// label is not drawn, so `label` is required for VoiceOver. A 40 pt button still
/// has a 44 pt hit region.
struct PaldoraIconButton: View {
    let icon: PaldoraIcon
    let label: String
    var style: PaldoraIconButtonStyle = .surface
    var size: PaldoraIconButtonSize = .medium
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            PaldoraIconView(icon, size: size.iconSize)
                .foregroundStyle(style == .primary ? Theme.actionOnPrimary : Theme.textPrimary)
                .frame(width: size.diameter, height: size.diameter)
                .background { if style == .primary { Circle().fill(Theme.actionPrimary) } else if style == .surface { Circle().fill(Theme.bgSurface) } }
                .paldoraHairline(Circle(), width: style == .surface ? PaldoraTokens.borderWidthHairline : 0)
                .paldoraFocusRing(Circle())
                .paldoraHitTarget()
        }
        .buttonStyle(PaldoraPressableStyle())
        .accessibilityLabel(label)
    }
}

#Preview("Icon buttons") {
    HStack(spacing: Theme.space3) {
        PaldoraIconButton(icon: .more, label: "More") {}
        PaldoraIconButton(icon: .plus, label: "Create", style: .primary) {}
        PaldoraIconButton(icon: .close, label: "Close", style: .plain) {}
        PaldoraIconButton(icon: .camera, label: "Camera", size: .large) {}
        PaldoraIconButton(icon: .send, label: "Send", style: .primary, size: .large) {}
        PaldoraIconButton(icon: .back, label: "Back", style: .plain, size: .large) {}
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
