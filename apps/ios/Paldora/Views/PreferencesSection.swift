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
            Text("Preferences").paldoraText(.titleM).foregroundStyle(Theme.textPrimary)
            VStack(alignment: .leading, spacing: Theme.space2) {
                PaldoraEyebrow("Appearance")
                AppearancePicker(selection: model.preferences?.appearance ?? .system) { choice in
                    Task { message = await model.savePreferences(appearance: choice) }
                }
                Text("Your Room keeps its own theme. Visitors see it the way you designed it.")
                    .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
            VStack(alignment: .leading, spacing: Theme.space2) {
                PaldoraEyebrow("Reaction shortcuts")
                HStack(spacing: Theme.space2) {
                    ForEach(presets.indices, id: \.self) { index in
                        TextField("", text: binding(index))
                            .multilineTextAlignment(.center)
                            .font(.title2)
                            .frame(width: PaldoraHitTarget.minimum, height: PaldoraHitTarget.minimum)
                            .background(Theme.bgSurface, in: Circle())
                            .paldoraHairline(Circle())
                            .accessibilityLabel("Reaction shortcut \(index + 1)")
                    }
                }
                Text("One emoji each. You can always react with any emoji.")
                    .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
            if let message { PaldoraBanner(tone: .danger, title: message) }
            if saved { PaldoraBanner(tone: .success, title: "Shortcuts saved") }
            PaldoraButton("Save shortcuts", size: .medium, isLoading: isSaving, fullWidth: true, action: savePresets)
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

/// Light, Dark or System as a Figma segmented control (9.3).
struct AppearancePicker: View {
    let selection: Appearance
    let onSelect: (Appearance) -> Void

    var body: some View {
        PaldoraSegmentedControl([.init(Appearance.system, "System"), .init(Appearance.light, "Light"), .init(Appearance.dark, "Dark")],
                                selection: Binding(get: { selection }, set: { onSelect($0) }))
    }
}
