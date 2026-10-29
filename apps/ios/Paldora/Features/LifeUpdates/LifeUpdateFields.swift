import PaldoraKit
import SwiftUI

/// The nine optional sections with live counters.
struct LifeUpdateFields: View {
    @Bindable var form: LifeUpdateForm

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            ForEach(LifeUpdateSectionKey.canonical, id: \.rawValue) { key in
                VStack(alignment: .leading, spacing: Theme.space1) {
                    FieldContainer(title: LifeUpdateForm.label(key)) {
                        TextField(LifeUpdateForm.label(key), text: Binding(
                            get: { form.text(key) }, set: { form.set(key, $0) }
                        ), prompt: Text(LifeUpdateForm.label(key)).foregroundStyle(Theme.textMuted), axis: .vertical)
                            .lineLimit(1...6)
                            .padding(.vertical, Theme.space2)
                            .accessibilityIdentifier("section-\(key.rawValue)")
                    }
                    if form.text(key).count > LifeUpdateForm.sectionLimit * 8 / 10 {
                        Text("\(form.text(key).count) of \(LifeUpdateForm.sectionLimit)")
                            .font(Typography.caption)
                            .foregroundStyle(form.text(key).count > LifeUpdateForm.sectionLimit ? Theme.danger : Theme.textMuted)
                    }
                }
            }
            Text("\(form.total) of \(LifeUpdateForm.totalLimit) characters in total")
                .font(Typography.caption)
                .foregroundStyle(form.overTotal ? Theme.danger : Theme.textMuted)
        }
    }
}
