import PhotosUI
import SwiftUI

/// Picker plus the per-photo upload tiles (Figma "Upload tile": Done, Uploading,
/// Processing, Failed, Add; at most four per post).
struct PhotoAttachmentsView: View {
    let attachments: PhotoAttachments
    var title = "Add photos"
    var showsCount = true
    @State private var picked: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: Theme.space3) {
                    ForEach(attachments.items) { PhotoUploadTile(upload: $0, attachments: attachments) }
                    if attachments.remaining > 0 {
                        PhotosPicker(selection: $picked, maxSelectionCount: max(1, attachments.remaining),
                                     matching: .images) {
                            AddPhotoTile()
                        }
                        .accessibilityLabel(title)
                        .accessibilityIdentifier("add-photos")
                    }
                }
            }
            #if DEBUG
            if ProcessInfo.processInfo.environment["PALDORA_UI_TEST_IMAGE"] == "1" {
                PaldoraButton("Attach test photo", kind: .ghost, size: .small) { attachments.add([DebugTestImage.jpeg()]) }
                    .disabled(attachments.remaining == 0)
                    .accessibilityIdentifier("attach-test-photo")
            }
            #endif
            if showsCount {
                Text("\(attachments.items.count) of \(PhotoAttachments.postLimit)")
                    .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
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

private struct AddPhotoTile: View {
    var body: some View { PaldoraUploadTile(state: .add, side: PhotoUploadTile.side) }
}

struct PhotoUploadTile: View {
    nonisolated static let side: CGFloat = 112
    let upload: PhotoUpload
    let attachments: PhotoAttachments

    var body: some View {
        VStack(spacing: Theme.space1) {
            PaldoraUploadTile(state: tileState, side: Self.side, action: tileState == .failed ? { upload.retry() } : nil) {
                if let preview = upload.preview {
                    Image(uiImage: preview).resizable().scaledToFill()
                } else {
                    Theme.brassSoft
                }
            }
            .accessibilityIdentifier(tileState == .failed ? "retry-photo" : "photo-upload")
            if case .failed(let message) = upload.state {
                Text(message).paldoraText(.caption).foregroundStyle(Theme.statusDanger).lineLimit(3)
                    .frame(width: Self.side, alignment: .leading)
            }
            PaldoraButton("Remove", kind: .ghost, size: .small) { attachments.remove(upload) }
                .accessibilityLabel("Remove photo")
        }
        .frame(width: Self.side)
    }

    private var tileState: PaldoraUploadState {
        switch upload.state {
        case .preparing: .processing
        case .uploading(let fraction): .uploading(progress: fraction)
        case .processing: .processing
        case .ready: .done
        case .failed: .failed
        }
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
