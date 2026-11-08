import PaldoraKit
import SwiftUI

struct ProfileEditor: View {
    let model: AppModel
    let profile: MyProfile
    @State private var displayName = ""
    @State private var bio = ""
    @State private var message: String?
    @State private var saved = false
    @State private var isSaving = false

    private static let nameLimit = 80
    private static let bioLimit = 500

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            Text("Edit profile").paldoraText(.titleM).foregroundStyle(Theme.textPrimary)
            PaldoraTextField("Display name", text: $displayName, placeholder: "Display name", identifier: "display-name-field")
                .textContentType(.name)
            PaldoraFieldContainer(title: "Bio") {
                TextField("A line about you", text: $bio, prompt: Text("A line about you").foregroundStyle(Theme.textTertiary), axis: .vertical)
                    .lineLimit(3...6)
                    .padding(.vertical, Theme.space3)
                    .accessibilityIdentifier("bio-field")
            }
            Text("\(bio.count) of \(Self.bioLimit)")
                .paldoraText(.caption)
                .foregroundStyle(bio.count > Self.bioLimit ? Theme.statusDanger : Theme.textSecondary)
            if let message { PaldoraBanner(tone: .danger, title: message).accessibilityIdentifier("profile-error") }
            if saved { PaldoraBanner(tone: .success, title: "Saved").accessibilityIdentifier("profile-saved") }
            PaldoraButton("Save profile", size: .medium, isLoading: isSaving, fullWidth: true, action: save)
                .disabled(!canSave)
                .accessibilityIdentifier("save-profile-button")
        }
        .onAppear(perform: syncFromProfile)
        .onChange(of: profile.profile.updatedAt) { syncFromProfile() }
    }

    private var trimmedName: String { displayName.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var canSave: Bool {
        !isSaving && !trimmedName.isEmpty && trimmedName.count <= Self.nameLimit
            && bio.count <= Self.bioLimit && hasChanges
    }

    private var hasChanges: Bool {
        trimmedName != (profile.profile.displayName ?? "")
            || bio.trimmingCharacters(in: .whitespacesAndNewlines) != (profile.profile.bio ?? "")
    }

    private func syncFromProfile() {
        displayName = profile.profile.displayName ?? ""
        bio = profile.profile.bio ?? ""
    }

    private func save() {
        isSaving = true
        message = nil
        saved = false
        Task {
            let failure = await model.saveProfile(displayName: displayName, bio: bio)
            isSaving = false
            message = failure
            saved = failure == nil
        }
    }
}
