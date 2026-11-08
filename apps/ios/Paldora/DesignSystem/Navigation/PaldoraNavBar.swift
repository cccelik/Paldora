import PaldoraKit
import SwiftUI

/// Figma "Nav bar": 40 pt circular buttons and a centered Label/M title. Large
/// titles go below it as Display/M. The leading button is Back or Close; the
/// trailing slot is More, a text action (Save) or empty.
struct PaldoraNavBar: View {
    enum Leading {
        case back(action: () -> Void)
        case close(action: () -> Void)
    }

    enum Trailing {
        case none
        case more(action: () -> Void)
        case action(title: String, action: () -> Void)
    }

    let title: String
    let leading: Leading
    var trailing: Trailing = .none

    var body: some View {
        ZStack {
            Text(title)
                .paldoraText(.buttonL)
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.horizontal, PaldoraHitTarget.minimum + Theme.space3 * 2)
                .accessibilityAddTraits(.isHeader)
            HStack {
                leadingButton
                Spacer(minLength: 0)
                trailingView
            }
        }
        .frame(minHeight: PaldoraHitTarget.minimum)
    }

    @ViewBuilder private var leadingButton: some View {
        switch leading {
        case .back(let action): PaldoraIconButton(icon: .back, label: "Back", action: action).accessibilityIdentifier("nav-back")
        case .close(let action): PaldoraIconButton(icon: .close, label: "Close", action: action).accessibilityIdentifier("nav-close")
        }
    }

    @ViewBuilder private var trailingView: some View {
        switch trailing {
        case .none:
            Color.clear.frame(width: PaldoraHitTarget.minimum, height: PaldoraHitTarget.minimum)
        case .more(let action):
            PaldoraIconButton(icon: .more, label: "More", action: action).accessibilityIdentifier("nav-more")
        case .action(let title, let action):
            Button(action: action) {
                Text(title).paldoraText(.labelM).fontWeight(.semibold).foregroundStyle(Theme.brassText)
                    .paldoraHitTarget()
            }
            .buttonStyle(PaldoraPressableStyle())
        }
    }
}

#Preview("Nav bars") {
    VStack(spacing: Theme.space4) {
        PaldoraNavBar(title: "Title", leading: .back {}, trailing: .more {})
        PaldoraNavBar(title: "Title", leading: .close {}, trailing: .more {})
        PaldoraNavBar(title: "Title", leading: .back {}, trailing: .action(title: "Save") {})
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
