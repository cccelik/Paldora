import PaldoraKit
import SwiftUI

/// The switch drawing: 46 x 28 track, 22 pt paper thumb. On = accent/brass, off =
/// border/hairline. Decorative; the owning control carries the semantics.
struct PaldoraSwitchTrack: View {
    let isOn: Bool
    private static let width: CGFloat = 46
    private static let height: CGFloat = 28
    private static let inset: CGFloat = 3

    var body: some View {
        Capsule()
            .fill(isOn ? Theme.brass : Theme.borderHairline)
            .frame(width: Self.width, height: Self.height)
            // Off needs a 3:1 outline (WCAG 1.4.11): the hairline fill alone is 1.3:1 on the canvas.
            .overlay(Capsule().strokeBorder(Theme.textTertiary, lineWidth: isOn ? 0 : PaldoraTokens.borderWidthHairline))
            .overlay(alignment: isOn ? .trailing : .leading) {
                Circle().fill(Theme.bgPaper)
                    .frame(width: Self.height - 2 * Self.inset, height: Self.height - 2 * Self.inset)
                    .paldoraElevation(.soft)
                    .padding(Self.inset)
            }
            .paldoraAnimation(PaldoraTokens.durationFast, value: isOn)
            .accessibilityHidden(true)
    }
}

/// Label on the leading side, switch on the trailing side, 44 pt tall. Reads as a
/// switch to VoiceOver with an "On" / "Off" value; the caller sets `.accessibilityLabel`.
struct PaldoraToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        StyledBody(configuration: configuration)
    }

    private struct StyledBody: View {
        let configuration: ToggleStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            HStack(spacing: Theme.space3) {
                configuration.label
                Spacer(minLength: Theme.space3)
                PaldoraSwitchTrack(isOn: configuration.isOn)
            }
            .frame(minHeight: PaldoraHitTarget.minimum)
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1 : PaldoraButtonAppearance.disabledOpacity)
            .onTapGesture { configuration.isOn.toggle() }
            .accessibilityElement(children: .ignore)
            .accessibilityValue(configuration.isOn ? "On" : "Off")
            .accessibilityAddTraits([.isButton, .isToggle])
            .accessibilityAction { configuration.isOn.toggle() }
        }
    }
}

/// Figma "Toggle" with its label.
struct PaldoraToggle: View {
    let title: String
    @Binding var isOn: Bool

    init(_ title: String, isOn: Binding<Bool>) {
        self.title = title
        self._isOn = isOn
    }

    var body: some View {
        Toggle(isOn: $isOn) { Text(title).paldoraText(.bodyM).foregroundStyle(Theme.textPrimary) }
            .toggleStyle(PaldoraToggleStyle())
            .accessibilityLabel(title)
    }
}

#Preview("Toggle") {
    VStack(spacing: Theme.space3) {
        PaldoraToggle("Notifications", isOn: .constant(true))
        PaldoraToggle("Sounds", isOn: .constant(false))
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
