import PaldoraKit
import SwiftUI

/// A list row that shows the current choice as its value and opens a bottom sheet of
/// radio rows (the design system's replacement for a system menu picker).
struct PaldoraChoiceRow<Value: Hashable>: View {
    struct Option {
        let value: Value
        let title: String
        var subtitle: String?
        init(_ value: Value, _ title: String, subtitle: String? = nil) {
            self.value = value
            self.title = title
            self.subtitle = subtitle
        }
    }

    let title: String
    var icon: PaldoraIcon?
    let options: [Option]
    @Binding var selection: Value
    @State private var isOpen = false

    var current: String { options.first { $0.value == selection }?.title ?? "" }

    var body: some View {
        PaldoraListRow(title: title, icon: icon, trailing: .value(current)) { isOpen = true }
            .accessibilityLabel("\(title): \(current)")
            .paldoraBottomSheet(isPresented: $isOpen, title: title) {
                ScrollView {
                    PaldoraListGroup {
                        ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                            if index > 0 { PaldoraListDivider() }
                            PaldoraListRow(title: option.title, subtitle: option.subtitle,
                                           trailing: .radio(isSelected: option.value == selection)) {
                                selection = option.value
                                isOpen = false
                            }
                            .accessibilityIdentifier("choice-\(option.title)")
                        }
                    }
                }
            }
    }
}

#Preview("Choice row") {
    PaldoraListGroup {
        PaldoraChoiceRow(title: "Visibility", icon: .eye,
                         options: [.init("friends", "Friends"), .init("hidden", "Only me")],
                         selection: .constant("friends"))
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
