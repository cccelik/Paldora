import PaldoraKit
import SwiftUI

/// Thumbnails of a post's photos (up to four). Tap opens the full-screen viewer.
struct PhotoStrip: View {
    let assetIds: [String]
    var interactive = true
    @State private var viewing: ViewerStart?

    private struct ViewerStart: Identifiable { let id: Int }

    var body: some View {
        if !assetIds.isEmpty {
            let columns = [GridItem(.adaptive(minimum: 120), spacing: Theme.space2)]
            LazyVGrid(columns: columns, spacing: Theme.space2) {
                ForEach(Array(assetIds.enumerated()), id: \.offset) { index, id in
                    Button { if interactive { viewing = ViewerStart(id: index) } } label: {
                        RemoteImage(assetId: id, variant: .thumbnail)
                            .frame(minHeight: 120).frame(height: assetIds.count == 1 ? 220 : 120)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    }
                    .buttonStyle(.plain)
                    .disabled(!interactive)
                    .accessibilityLabel("Photo \(index + 1) of \(assetIds.count)")
                    .accessibilityHint(interactive ? "Opens the photo" : "")
                    .accessibilityAddTraits(.isImage)
                    .accessibilityIdentifier("post-photo")
                }
            }
            .fullScreenCover(item: $viewing) { start in
                PhotoViewer(assetIds: assetIds, start: start.id)
            }
        }
    }
}

/// Full-screen display-size viewer: swipe between photos, pinch to zoom,
/// double-tap to reset. Share and save are omitted: web shares the post
/// permalink, never bytes.
struct PhotoViewer: View {
    let assetIds: [String]
    @State private var index: Int
    @Environment(\.dismiss) private var dismiss

    init(assetIds: [String], start: Int) {
        self.assetIds = assetIds
        _index = State(initialValue: start)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $index) {
                ForEach(Array(assetIds.enumerated()), id: \.offset) { offset, id in
                    ZoomablePhoto(assetId: id).tag(offset)
                        .accessibilityLabel("Photo \(offset + 1) of \(assetIds.count)")
                }
            }
            .tabViewStyle(.page(indexDisplayMode: assetIds.count > 1 ? .automatic : .never))
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill").font(.title)
                    .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                    .foregroundStyle(.white)
            }
            .accessibilityLabel("Close photo")
            .accessibilityIdentifier("close-photo")
            .padding(Theme.space2)
        }
        .accessibilityAddTraits(.isModal)
    }
}

private struct ZoomablePhoto: View {
    let assetId: String
    @State private var scale: CGFloat = 1
    @State private var settled: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RemoteImage(assetId: assetId, variant: .display, fill: false)
            .scaleEffect(scale)
            .gesture(
                MagnifyGesture()
                    .onChanged { scale = min(5, max(1, settled * $0.magnification)) }
                    .onEnded { _ in settled = scale }
            )
            .onTapGesture(count: 2) { reset() }
            .accessibilityAction(named: "Reset zoom") { reset() }
    }

    private func reset() {
        if reduceMotion { scale = 1; settled = 1 } else {
            withAnimation(.easeOut(duration: 0.2)) { scale = 1; settled = 1 }
        }
    }
}
