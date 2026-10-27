import SwiftUI

/// Profile photo: pick, upload, wait for processing, then refresh the profile.
struct AvatarSection: View {
    let model: AppModel
    @State private var attachments: PhotoAttachments

    init(model: AppModel, env: FeatureEnvironment) {
        self.model = model
        _attachments = State(initialValue: PhotoAttachments(env: env, purpose: .avatar, limit: 1))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            Text("Profile photo").font(Typography.title).foregroundStyle(Theme.text)
            PhotoAttachmentsView(attachments: attachments, title: "Choose a photo", showsCount: false)
        }
        .onChange(of: attachments.readyAssetIds) {
            guard !attachments.readyAssetIds.isEmpty else { return }
            Task {
                await model.loadProfile()
                attachments.clear()
            }
        }
    }
}
