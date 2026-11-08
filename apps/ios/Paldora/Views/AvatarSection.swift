import SwiftUI

/// Profile photo: pick, upload, wait for processing, then refresh the profile.
/// "Remove photo" clears it (and any pending upload) with `deleteAvatar`.
struct AvatarSection: View {
    let model: AppModel
    let env: FeatureEnvironment
    var hasAvatar = false
    @State private var attachments: PhotoAttachments
    @Environment(PaldoraDialogCenter.self) private var dialogs
    @State private var error: String?
    @State private var isRemoving = false

    init(model: AppModel, env: FeatureEnvironment, hasAvatar: Bool = false) {
        self.model = model
        self.env = env
        self.hasAvatar = hasAvatar
        _attachments = State(initialValue: PhotoAttachments(env: env, purpose: .avatar, limit: 1))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraEyebrow("Profile photo")
            PhotoAttachmentsView(attachments: attachments, title: "Choose a photo", showsCount: false)
            if hasAvatar {
                PaldoraButton("Remove photo", kind: .ghost, size: .small, isLoading: isRemoving, destructive: true) {
                    dialogs.present(icon: .trash, title: "Remove your photo?",
                                    message: "You'll show initials until you add another.", confirmTitle: "Remove photo") {
                        Task { await remove() }
                    }
                }
                .disabled(isRemoving)
                    .accessibilityIdentifier("remove-avatar")
            }
            if let error { PaldoraFieldMessage(text: error) }
        }
        .onChange(of: attachments.readyAssetIds) {
            guard !attachments.readyAssetIds.isEmpty else { return }
            Task {
                await model.loadProfile()
                attachments.clear()
            }
        }
    }

    private func remove() async {
        isRemoving = true
        error = nil
        defer { isRemoving = false }
        do {
            _ = try await env.api.deleteAvatar()
            attachments.clear()
            await model.loadProfile()
        } catch {
            self.error = env.message(for: error)
        }
    }
}
