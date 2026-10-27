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
            Text("Edit profile").font(Typography.title).foregroundStyle(Theme.text)
            FieldContainer(title: "Display name") {
                TextField("Display name", text: $displayName)
                    .textContentType(.name)
                    .accessibilityIdentifier("display-name-field")
            }
            FieldContainer(title: "Bio") {
                TextField("A line about you", text: $bio, axis: .vertical)
                    .lineLimit(3...6)
                    .padding(.vertical, Theme.space2)
                    .accessibilityIdentifier("bio-field")
            }
            Text("\(bio.count) of \(Self.bioLimit)")
                .font(Typography.caption)
                .foregroundStyle(bio.count > Self.bioLimit ? Theme.danger : Theme.textMuted)
            if let message { InlineMessage(text: message).accessibilityIdentifier("profile-error") }
            if saved { InlineMessage(text: "Saved", kind: .success).accessibilityIdentifier("profile-saved") }
            Button(action: save) {
                if isSaving { ProgressView() } else { Text("Save profile") }
            }
            .buttonStyle(PrimaryButtonStyle())
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
