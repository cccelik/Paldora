import PaldoraKit
import SwiftUI

struct PreferencesSection: View {
    let model: AppModel
    @State private var presets: [String] = []
    @State private var message: String?
    @State private var saved = false
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            Text("Preferences").font(Typography.title).foregroundStyle(Theme.text)
            VStack(alignment: .leading, spacing: Theme.space2) {
                Text("Appearance").font(Typography.label).foregroundStyle(Theme.textMuted)
                AppearancePicker(selection: model.preferences?.appearance ?? .system) { choice in
                    Task { message = await model.savePreferences(appearance: choice) }
                }
            }
            VStack(alignment: .leading, spacing: Theme.space2) {
                Text("Reaction shortcuts").font(Typography.label).foregroundStyle(Theme.textMuted)
                HStack(spacing: Theme.space2) {
                    ForEach(presets.indices, id: \.self) { index in
                        TextField("", text: binding(index))
                            .multilineTextAlignment(.center)
                            .font(.title2)
                            .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
                            .accessibilityLabel("Reaction shortcut \(index + 1)")
                    }
                }
                Text("One emoji each. You can always react with any emoji.")
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
            if let message { InlineMessage(text: message) }
            if saved { InlineMessage(text: "Shortcuts saved", kind: .success) }
            Button(action: savePresets) {
                if isSaving { ProgressView() } else { Text("Save shortcuts") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSavePresets)
        }
        .onAppear(perform: syncPresets)
        .onChange(of: model.preferences) { syncPresets() }
    }

    private var current: [String] { model.preferences?.reactionPresets ?? [] }

    private var canSavePresets: Bool {
        !isSaving && presets != current && presets.count == current.count
            && presets.allSatisfy(EmojiValidation.isSingleEmoji)
    }

    private func binding(_ index: Int) -> Binding<String> {
        Binding(
            get: { presets.indices.contains(index) ? presets[index] : "" },
            set: { newValue in
                guard presets.indices.contains(index) else { return }
                // Keep the last typed grapheme so replacing is one tap.
                presets[index] = newValue.last.map(String.init) ?? ""
                saved = false
            }
        )
    }

    private func syncPresets() { presets = current }

    private func savePresets() {
        isSaving = true
        message = nil
        saved = false
        Task {
            let failure = await model.savePreferences(reactionPresets: presets)
            isSaving = false
            message = failure
            saved = failure == nil
        }
    }
}

/// Three 44pt choices. Plain buttons keep touch targets and VoiceOver simple.
struct AppearancePicker: View {
    let selection: Appearance
    let onSelect: (Appearance) -> Void

    private let choices: [(Appearance, String)] = [(.system, "System"), (.light, "Light"), (.dark, "Dark")]

    var body: some View {
        HStack(spacing: Theme.space2) {
            ForEach(choices, id: \.0) { choice, title in
                Button(title) { onSelect(choice) }
                    .font(Typography.label)
                    .foregroundStyle(selection == choice ? Theme.onInk : Theme.text)
                    .frame(maxWidth: .infinity, minHeight: Theme.touchTarget)
                    .background(selection == choice ? Theme.ink : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
                    .accessibilityAddTraits(selection == choice ? .isSelected : [])
            }
        }
    }
}
