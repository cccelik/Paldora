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
                Theme.highlight.overlay(ProgressView())
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
                            Image(systemName: "arrow.clockwise").font(.title3)
                            Text("Couldn't load. Tap to retry").font(Typography.caption).multilineTextAlignment(.center)
                        }.foregroundStyle(Theme.textMuted)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Photo couldn't load. Retry")
            case .unavailable:
                Theme.highlight.overlay(
                    VStack(spacing: 2) {
                        Image(systemName: "photo").font(.title3)
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

/// Avatar with an initials fallback while loading and whenever the image is
/// unavailable.
struct AvatarView: View {
    let mediaId: String?
    let name: String
    var size: CGFloat = 40
    @Environment(\.imageLoader) private var loader
    @State private var image: UIImage?
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    var body: some View {
        ZStack {
            Circle().fill(Theme.highlight)
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text(Self.initials(name)).font(.system(.footnote, design: .serif).weight(.semibold))
                    .minimumScaleFactor(0.5).lineLimit(1).foregroundStyle(Theme.text)
            }
        }
        .frame(width: size * scale, height: size * scale)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.gold.opacity(0.6), lineWidth: 1))
        // Exposed (not hidden) so the initials are not "inaccessible text"; kept short because
        // the name is always read next to it.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Profile photo")
        .accessibilityAddTraits(.isImage)
        .task(id: mediaId) { await load() }
    }

    private func load() async {
        image = nil
        guard let mediaId, let loader else { return }
        if let hit = loader.cached(mediaId, .thumbnail) { image = hit; return }
        if case .image(let loaded) = await loader.image(mediaId, .thumbnail) { image = loaded }
    }

    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2).compactMap(\.first)
        return parts.isEmpty ? "P" : String(parts).uppercased()
    }
}
