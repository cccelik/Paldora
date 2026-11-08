import PaldoraKit
import SwiftUI

/// The nine optional sections with live counters.
struct LifeUpdateFields: View {
    @Bindable var form: LifeUpdateForm

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            ForEach(LifeUpdateSectionKey.canonical, id: \.rawValue) { key in
                VStack(alignment: .leading, spacing: Theme.space1) {
                    PaldoraFieldContainer(title: LifeUpdateForm.label(key)) {
                        TextField(LifeUpdateForm.label(key), text: Binding(
                            get: { form.text(key) }, set: { form.set(key, $0) }
                        ), prompt: Text(LifeUpdateForm.label(key)).foregroundStyle(Theme.textTertiary), axis: .vertical)
                            .lineLimit(1...6)
                            .padding(.vertical, Theme.space3)
                            .accessibilityIdentifier("section-\(key.rawValue)")
                    }
                    if form.text(key).count > LifeUpdateForm.sectionLimit * 8 / 10 {
                        Text("\(form.text(key).count) of \(LifeUpdateForm.sectionLimit)")
                            .paldoraText(.caption)
                            .foregroundStyle(form.text(key).count > LifeUpdateForm.sectionLimit ? Theme.statusDanger : Theme.textSecondary)
                    }
                }
            }
            Text("\(form.total) of \(LifeUpdateForm.totalLimit) characters in total")
                .paldoraText(.caption)
                .foregroundStyle(form.overTotal ? Theme.statusDanger : Theme.textSecondary)
        }
    }
}
