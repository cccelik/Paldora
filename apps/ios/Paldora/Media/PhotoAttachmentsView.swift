import PhotosUI
import SwiftUI

/// Picker plus the per-photo progress, failure and retry rows.
struct PhotoAttachmentsView: View {
    let attachments: PhotoAttachments
    var title = "Add photos"
    var showsCount = true
    @State private var picked: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if !attachments.items.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.space3) {
                        ForEach(attachments.items) { PhotoUploadTile(upload: $0, attachments: attachments) }
                    }
                }
            }
            HStack(spacing: Theme.space3) {
                PhotosPicker(selection: $picked, maxSelectionCount: max(1, attachments.remaining),
                             matching: .images) {
                    Label(title, systemImage: "photo.on.rectangle")
                        .font(Typography.label).foregroundStyle(Theme.goldText)
                        .frame(minHeight: Theme.touchTarget)
                }
                .disabled(attachments.remaining == 0)
                .accessibilityIdentifier("add-photos")
                #if DEBUG
                if ProcessInfo.processInfo.environment["PALDORA_UI_TEST_IMAGE"] == "1" {
                    Button("Attach test photo") { attachments.add([DebugTestImage.jpeg()]) }
                        .buttonStyle(QuietButtonStyle())
                        .disabled(attachments.remaining == 0)
                        .accessibilityIdentifier("attach-test-photo")
                }
                #endif
                if showsCount {
                    Text("\(attachments.items.count) of \(PhotoAttachments.postLimit)")
                        .font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
            }
        }
        .onChange(of: picked) {
            let items = picked
            picked = []
            Task {
                var loaded: [Data] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self) { loaded.append(data) }
                }
                attachments.add(loaded)
            }
        }
    }
}

struct PhotoUploadTile: View {
    let upload: PhotoUpload
    let attachments: PhotoAttachments

    var body: some View {
        VStack(spacing: Theme.space1) {
            ZStack {
                if let preview = upload.preview {
                    Image(uiImage: preview).resizable().scaledToFill()
                } else {
                    Theme.highlight
                }
                overlay
            }
            .frame(width: 88, height: 88)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            statusRow
        }
        .frame(width: 96)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photo-upload")
    }

    @ViewBuilder private var overlay: some View {
        switch upload.state {
        case .preparing, .processing: ProgressView().padding(6).background(.thinMaterial, in: Circle())
        case .uploading(let fraction): ProgressView(value: fraction).padding(Theme.space2)
        case .ready: Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.success)
                .padding(4).background(Theme.canvas, in: Circle())
        case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
                .padding(4).background(Theme.canvas, in: Circle())
        }
    }

    @ViewBuilder private var statusRow: some View {
        switch upload.state {
        case .preparing: Text("Preparing").font(Typography.caption).foregroundStyle(Theme.textMuted)
        case .uploading(let fraction):
            Text("Uploading \(Int(fraction * 100))%").font(Typography.caption).foregroundStyle(Theme.textMuted)
        case .processing: Text("Processing").font(Typography.caption).foregroundStyle(Theme.textMuted)
        case .ready: Text("Ready").font(Typography.caption).foregroundStyle(Theme.success)
        case .failed(let message):
            Text(message).font(Typography.caption).foregroundStyle(Theme.danger).lineLimit(3)
            Button("Retry") { upload.retry() }.buttonStyle(QuietButtonStyle())
                .accessibilityIdentifier("retry-photo")
        }
        Button("Remove") { attachments.remove(upload) }
            .font(Typography.caption).foregroundStyle(Theme.textMuted)
            .frame(minHeight: Theme.touchTarget)
            .accessibilityLabel("Remove photo")
    }
}

#if DEBUG
/// UI-test image source, enabled only by a launch environment variable and
/// compiled only into DEBUG builds. Draws a small gradient; no bundled file.
enum DebugTestImage {
    static func jpeg() -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 400))
        return renderer.jpegData(withCompressionQuality: 0.9) { context in
            let colors = [UIColor.systemYellow.cgColor, UIColor.systemPurple.cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 600, y: 400), options: [])
        }
    }
}
#endif
