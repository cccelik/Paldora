import PaldoraKit
import SwiftUI
import UIKit

private struct ImageLoaderKey: EnvironmentKey {
    static let defaultValue: ImageLoader? = nil
}

extension EnvironmentValues {
    var imageLoader: ImageLoader? {
        get { self[ImageLoaderKey.self] }
        set { self[ImageLoaderKey.self] = newValue }
    }
}

/// An authenticated image: spinner, then the picture, or a neutral placeholder
/// when it is unavailable (404 never explains why).
struct RemoteImage: View {
    let assetId: String
    var variant: MediaVariant = .thumbnail
    var fill = true
    @Environment(\.imageLoader) private var loader
    @State private var phase: Phase = .loading

    private enum Phase { case loading, image(UIImage), unavailable, retry, blank }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                Theme.bgSunken.overlay(PaldoraSkeleton(height: 12, radius: 6).padding(Theme.space5))
            case .image(let image):
                Image(uiImage: image).resizable()
                    .aspectRatio(contentMode: fill ? .fill : .fit)
            case .blank:
                // The session ended: nothing misleading is shown while the app signs out.
                Theme.highlight
            case .retry:
                Button { retry() } label: {
                    Theme.highlight.overlay(
                        VStack(spacing: 2) {
                            PaldoraIconView(.refresh, size: 22)
                            Text("Couldn't load. Tap to retry").font(Typography.caption).multilineTextAlignment(.center)
                        }.foregroundStyle(Theme.textMuted)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Photo couldn't load. Retry")
            case .unavailable:
                Theme.highlight.overlay(
                    VStack(spacing: 2) {
                        PaldoraIconView(.image, size: 22)
                        Text("Photo unavailable").font(Typography.caption)
                    }.foregroundStyle(Theme.textMuted)
                )
            }
        }
        .task(id: assetId + variant.rawValue) { await load() }
    }

    private func load() async {
        guard let loader else { phase = .unavailable; return }
        if let hit = loader.cached(assetId, variant) { phase = .image(hit); return }
        phase = .loading
        switch await loader.image(assetId, variant) {
        case .image(let image): phase = .image(image)
        case .unavailable: if !Task.isCancelled { phase = .unavailable }
        case .rateLimited, .failed: if !Task.isCancelled { phase = .retry }
        case .sessionEnded: if !Task.isCancelled { phase = .blank }
        }
    }

    private func retry() {
        loader?.retry(assetId, variant)
        Task { await load() }
    }
}
