import PaldoraKit
import SwiftUI

/// Figma "Radio": 22 pt, on = 6 pt brass ring, off = 1.5 pt hairline ring.
struct PaldoraRadioIndicator: View {
    let isSelected: Bool

    var body: some View {
        Circle()
            .strokeBorder(isSelected ? Theme.brass : Theme.borderHairline,
                          lineWidth: isSelected ? 6 : PaldoraTokens.borderWidthFocus)
            .frame(width: 22, height: 22)
            .paldoraAnimation(PaldoraTokens.durationFast, value: isSelected)
            .accessibilityHidden(true)
    }
}

/// A labelled radio option, 44 pt tall. Selecting is the caller's `action`.
struct PaldoraRadio: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.space3) {
                PaldoraRadioIndicator(isSelected: isSelected)
                Text(title).paldoraText(.bodyM).foregroundStyle(Theme.textPrimary)
                Spacer(minLength: 0)
            }
            .frame(minHeight: PaldoraHitTarget.minimum)
            .contentShape(Rectangle())
        }
        .buttonStyle(PaldoraPressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Figma "Checkbox": 22 pt, radius 7, on = brass fill with a check.
struct PaldoraCheckboxIndicator: View {
    let isOn: Bool
    private static let radius: CGFloat = 7

    var body: some View {
        RoundedRectangle(cornerRadius: Self.radius)
            .fill(isOn ? Theme.brass : Color.clear)
            .frame(width: 22, height: 22)
            .overlay {
                if isOn { PaldoraIconView(.check, size: 16, isActive: true).foregroundStyle(Theme.onBrass) }
            }
            .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius), width: isOn ? 0 : PaldoraTokens.borderWidthFocus)
            .paldoraAnimation(PaldoraTokens.durationFast, value: isOn)
            .accessibilityHidden(true)
    }
}

/// A labelled checkbox, 44 pt tall.
struct PaldoraCheckbox: View {
    let title: String
    @Binding var isOn: Bool

    init(_ title: String, isOn: Binding<Bool>) {
        self.title = title
        self._isOn = isOn
    }

    var body: some View {
        Button { isOn.toggle() } label: {
            HStack(spacing: Theme.space3) {
                PaldoraCheckboxIndicator(isOn: isOn)
                Text(title).paldoraText(.bodyM).foregroundStyle(Theme.textPrimary)
                Spacer(minLength: 0)
            }
            .frame(minHeight: PaldoraHitTarget.minimum)
            .contentShape(Rectangle())
        }
        .buttonStyle(PaldoraPressableStyle())
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityValue(isOn ? "Checked" : "Unchecked")
    }
}

#Preview("Radio and checkbox") {
    VStack(alignment: .leading) {
        PaldoraRadio(title: "Friends", isSelected: true) {}
        PaldoraRadio(title: "Members", isSelected: false) {}
        PaldoraCheckbox("Remember me", isOn: .constant(true))
        PaldoraCheckbox("Send updates", isOn: .constant(false))
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
