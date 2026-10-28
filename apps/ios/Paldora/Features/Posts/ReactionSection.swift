import SwiftUI

struct ReactionSection: View {
    let model: PostDetailViewModel
    @State private var custom = ""
    @State private var showCamera = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Reactions").font(Typography.headline).foregroundStyle(Theme.text)
            counts
            HStack(spacing: Theme.space2) {
                ForEach(model.presets, id: \.self) { kind in preset(kind) }
            }
            HStack(spacing: Theme.space2) {
                TextField("Any emoji", text: $custom)
                    .font(Typography.body)
                    .padding(.horizontal, Theme.space3)
                    .frame(minHeight: Theme.touchTarget)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
                    .onChange(of: custom) { custom = custom.last.map(String.init) ?? "" }
                    .accessibilityLabel("Custom emoji reaction")
                    .accessibilityIdentifier("custom-reaction-field")
                Button("React") {
                    let kind = custom
                    custom = ""
                    Task { await model.react(kind) }
                }
                .buttonStyle(QuietButtonStyle())
                .disabled(!EmojiValidation.isSingleEmoji(custom))
            }
            if model.cameraAvailable {
                Button { showCamera = true } label: { Label("React with a photo", systemImage: "camera") }
                    .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("camera-reaction")
            }
            previews
            if model.viewerKind != nil {
                Button("Remove my reaction") { Task { await model.react(nil) } }
                    .buttonStyle(QuietButtonStyle(destructive: true))
                    .accessibilityIdentifier("clear-reaction")
            }
            if let error = model.reactionError { InlineMessage(text: error) }
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
                            Text(preview.user.displayName).font(Typography.caption).foregroundStyle(Theme.textMuted).lineLimit(1)
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
            Text("No reactions yet").font(Typography.callout).foregroundStyle(Theme.textMuted)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.space2) {
                    ForEach(model.reactionCounts, id: \.kind) { entry in
                        Text("\(Self.display(entry.kind)) \(entry.count)")
                            .font(Typography.label)
                            .padding(.horizontal, Theme.space3)
                            .frame(minHeight: 32)
                            .background(Theme.highlight, in: Capsule())
                            .accessibilityLabel("\(entry.count) \(Self.display(entry.kind)) reactions")
                    }
                }
            }
            .accessibilityIdentifier("reaction-counts")
        }
    }

    private func preset(_ kind: String) -> some View {
        let selected = model.viewerKind == kind
        return Button { Task { await model.toggle(kind) } } label: {
            Text(kind).font(.title2)
                .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                .background(selected ? Theme.highlight : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(selected ? Theme.gold : Theme.hairline, lineWidth: selected ? 2 : 1))
        }
        .accessibilityLabel("React with \(kind)")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("reaction-\(kind)")
    }

    static func display(_ kind: String) -> String { kind == "real" ? "📷" : kind }
}
