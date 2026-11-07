import PaldoraKit
import SwiftUI

/// Figma "Chip" states. Selected uses action/primary.
enum PaldoraChipStyle: CaseIterable, Equatable {
    case standard, selected, accent, soft, brass

    /// Selection toggles between the default and selected looks.
    static func forSelection(_ isSelected: Bool) -> PaldoraChipStyle { isSelected ? .selected : .standard }

    var background: Color {
        switch self {
        case .standard: Theme.bgSurface
        case .selected: Theme.actionPrimary
        case .accent: Theme.emberSoft
        case .soft: Theme.bgSunken
        case .brass: Theme.brassSoft
        }
    }

    /// Accent text is status/danger, not accent/ember: ember on ember-soft is 3.7:1 in Light.
    var foreground: Color {
        switch self {
        case .standard, .soft: Theme.textSecondary
        case .selected: Theme.actionOnPrimary
        case .accent: Theme.statusDanger
        case .brass: Theme.brassText
        }
    }

    var hasBorder: Bool { self == .standard }
}

enum PaldoraChipLeading: Equatable {
    case none
    /// A 6 pt dot, e.g. the Box colour.
    case dot(Color)
    case icon(PaldoraIcon)
}

/// Filters, audiences, statuses. Pass `action` to make it a button (44 pt hit
/// region); without one it is a static label.
struct PaldoraChip: View {
    let title: String
    var style: PaldoraChipStyle = .standard
    var leading: PaldoraChipLeading = .none
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { pill }
                .buttonStyle(PaldoraPressableStyle())
                .paldoraHitTarget()
        } else {
            pill.accessibilityElement(children: .combine)
        }
    }

    private var pill: some View {
        HStack(spacing: 6) {
            switch leading {
            case .none: EmptyView()
            case .dot(let color): Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
            case .icon(let icon): PaldoraIconView(icon, size: 14)
            }
            Text(title).paldoraText(.labelS)
        }
        .foregroundStyle(style.foreground)
        .padding(.horizontal, Theme.space3)
        .padding(.vertical, 7)
        .background(Capsule().fill(style.background))
        .paldoraHairline(Capsule(), width: style.hasBorder ? PaldoraTokens.borderWidthHairline : 0)
        .paldoraFocusRing(Capsule())
    }
}

/// A chip that toggles a selection (filters). Announces "selected" to VoiceOver.
struct PaldoraSelectableChip: View {
    let title: String
    @Binding var isSelected: Bool
    var leading: PaldoraChipLeading = .none

    var body: some View {
        PaldoraChip(title: title, style: .forSelection(isSelected), leading: leading) { isSelected.toggle() }
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview("Chips") {
    HStack {
        PaldoraChip(title: "Sunday Supper", leading: .dot(Theme.brass))
        PaldoraChip(title: "All circles", style: .selected)
        PaldoraChip(title: "3 new", style: .accent)
        PaldoraChip(title: "Only me", style: .soft, leading: .icon(.lock))
        PaldoraChip(title: "Owner", style: .brass)
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
