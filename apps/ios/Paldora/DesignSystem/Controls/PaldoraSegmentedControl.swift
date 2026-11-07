import PaldoraKit
import SwiftUI

/// Figma "Segmented control": 2 to 4 options on a sunken pill track; the selected
/// option is a surface pill with a soft shadow. At accessibility text sizes the
/// options stack vertically so labels never truncate.
struct PaldoraSegmentedControl<Value: Hashable>: View {
    struct Option {
        let value: Value
        let title: String
        init(_ value: Value, _ title: String) {
            self.value = value
            self.title = title
        }
    }

    /// The kit defines 2, 3 and 4 option variants.
    static var supportedCounts: ClosedRange<Int> { 2...4 }

    /// Index of the selected option, if it is one of `options`.
    static func selectedIndex(of selection: Value, in options: [Option]) -> Int? {
        options.firstIndex { $0.value == selection }
    }

    let options: [Option]
    @Binding var selection: Value
    @Environment(\.dynamicTypeSize) private var typeSize

    init(_ options: [Option], selection: Binding<Value>) {
        assert(Self.supportedCounts.contains(options.count), "Segmented control takes 2 to 4 options")
        self.options = options
        self._selection = selection
    }

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(spacing: 0) { segments }
                    .background(Theme.bgSunken, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
            } else {
                HStack(spacing: 0) { segments }
                    .padding(.horizontal, Theme.space1)
                    .background(Theme.bgSunken, in: Capsule())
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var segments: some View {
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
            let isSelected = option.value == selection
            Button { selection = option.value } label: {
                Text(option.title)
                    .paldoraText(.labelS)
                    .foregroundStyle(isSelected ? Theme.textPrimary : Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, minHeight: PaldoraHitTarget.minimum)
                    .background {
                        if isSelected {
                            Capsule().fill(Theme.bgSurface).paldoraElevation(.soft)
                                .padding(.vertical, Theme.space1)
                        }
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .paldoraAnimation(PaldoraTokens.durationFast, value: isSelected)
            .accessibilityAddTraits(isSelected ? .isSelected : [])
        }
    }
}

#Preview("Segmented") {
    struct Demo: View {
        @State var two = "Moments"
        @State var four = "Moments"
        var body: some View {
            VStack(spacing: Theme.space4) {
                PaldoraSegmentedControl([.init("Moments", "Moments"), .init("Memories", "Memories")], selection: $two)
                PaldoraSegmentedControl([.init("Moments", "Moments"), .init("Memories", "Memories"),
                                         .init("Members", "Members"), .init("Settings", "Settings")], selection: $four)
            }
            .padding(Theme.space5)
            .background(Theme.bgCanvas)
        }
    }
    return Demo()
}
