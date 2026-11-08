import PaldoraKit
import SwiftUI

/// Figma 5.1 reaction chips and 5.2 reaction picker: counts per kind, the five presets,
/// any single emoji, the camera, and the latest real reactions.
struct ReactionSection: View {
    let model: PostDetailViewModel
    @State private var custom = ""
    @State private var showCamera = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            PaldoraEyebrow("Reactions")
            counts
            HStack(spacing: Theme.space2) {
                ForEach(model.presets, id: \.self) { kind in
                    PaldoraEmojiButton(emoji: kind, isSelected: model.viewerKind == kind) { Task { await model.toggle(kind) } }
                        .accessibilityIdentifier("reaction-\(kind)")
                }
                if model.cameraAvailable {
                    PaldoraIconButton(icon: .camera, label: "React with a photo", style: .surface) { showCamera = true }
                        .accessibilityIdentifier("camera-reaction")
                }
            }
            HStack(spacing: Theme.space2) {
                PaldoraTextField("Any emoji", text: $custom, placeholder: "Any emoji", identifier: "custom-reaction-field")
                    .onChange(of: custom) { custom = custom.last.map(String.init) ?? "" }
                PaldoraButton("React", kind: .secondary, size: .small) {
                    let kind = custom
                    custom = ""
                    Task { await model.react(kind) }
                }
                .disabled(!EmojiValidation.isSingleEmoji(custom))
            }
            previews
            if model.viewerKind != nil {
                PaldoraButton("Remove my reaction", kind: .ghost, size: .small, destructive: true) { Task { await model.react(nil) } }
                    .accessibilityIdentifier("clear-reaction")
            }
            if let error = model.reactionError { PaldoraFieldMessage(text: error) }
        }
        .sheet(isPresented: $showCamera) {
            CameraReactionSheet(model: model.cameraModel()) { id in
                Task { await model.cameraReactionSent(assetId: id) }
            }
        }
    }

    @ViewBuilder private var previews: some View {
        if !model.cameraPreviews.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.space2) {
                    ForEach(model.cameraPreviews, id: \.mediaAssetId) { preview in
                        VStack(spacing: 2) {
                            RemoteImage(assetId: preview.mediaAssetId, variant: .thumbnail).frame(width: 64, height: 64)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                            Text(preview.user.displayName).paldoraText(.caption).foregroundStyle(Theme.textSecondary).lineLimit(1)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Camera reaction from \(preview.user.displayName)")
                    }
                }
            }
            .accessibilityIdentifier("camera-previews")
        }
    }

    @ViewBuilder private var counts: some View {
        if model.reactionCounts.isEmpty {
            Text("No reactions yet").paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.space2) {
                    ForEach(model.reactionCounts, id: \.kind) { entry in
                        PaldoraChip(title: "\(Self.display(entry.kind)) \(entry.count)", style: .brass)
                            .accessibilityLabel("\(entry.count) \(Self.display(entry.kind)) reactions")
                    }
                }
            }
            .accessibilityIdentifier("reaction-counts")
        }
    }

    static func display(_ kind: String) -> String { kind == "real" ? "📷" : kind }
}
