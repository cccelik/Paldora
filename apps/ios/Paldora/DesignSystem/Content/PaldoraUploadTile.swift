import PaldoraKit
import SwiftUI

/// Composer media states (max 4 per post).
enum PaldoraUploadState: Equatable {
    case done
    /// 0...1.
    case uploading(progress: Double)
    case processing
    case failed
    case add

    /// Percent text for the uploading state, clamped to 0...100.
    static func percent(_ progress: Double) -> Int { Int((min(max(progress, 0), 1) * 100).rounded()) }

    var spokenLabel: String {
        switch self {
        case .done: "Photo"
        case .uploading(let progress): "Uploading, \(Self.percent(progress)) percent"
        case .processing: "Processing"
        case .failed: "Upload failed. Tap to retry"
        case .add: "Add photo"
        }
    }
}

/// Figma "Upload tile": a 150 pt square, radius 18. Done shows the thumbnail slot;
/// Uploading, Processing and Failed cover it with the inverse surface; Add is a
/// dashed sunken tile. Failed and Add are buttons (`action`).
struct PaldoraUploadTile<Thumbnail: View>: View {
    let state: PaldoraUploadState
    var side: CGFloat = 150
    var action: (() -> Void)?
    @ViewBuilder var thumbnail: Thumbnail

    static var radius: CGFloat { 18 }

    var body: some View {
        Group {
            if let action, state == .failed || state == .add {
                Button(action: action) { tile }.buttonStyle(PaldoraPressableStyle())
            } else {
                tile
            }
        }
        .frame(width: side, height: side)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.spokenLabel)
        .accessibilityAddTraits(action != nil && (state == .failed || state == .add) ? .isButton : .isImage)
    }

    @ViewBuilder private var tile: some View {
        let shape = RoundedRectangle(cornerRadius: Self.radius)
        switch state {
        case .add:
            VStack(spacing: 6) {
                PaldoraIconView(.plus, size: 24)
                Text("Add").paldoraText(.bodyS)
            }
            .foregroundStyle(Theme.textSecondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bgSunken, in: shape)
            .overlay(shape.strokeBorder(Theme.textTertiary, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        case .done:
            thumbnail.frame(maxWidth: .infinity, maxHeight: .infinity).clipShape(shape)
        case .uploading, .processing, .failed:
            ZStack {
                thumbnail.frame(maxWidth: .infinity, maxHeight: .infinity)
                Theme.bgInverse
                overlayContent
            }
            .clipShape(shape)
        }
    }

    @ViewBuilder private var overlayContent: some View {
        switch state {
        case .uploading(let progress):
            Text("\(PaldoraUploadState.percent(progress))%").paldoraText(.titleL).foregroundStyle(Theme.textOnInverse)
        case .processing:
            VStack(spacing: Theme.space2) {
                PaldoraIconView(.refresh, size: 24)
                Text("Processing").paldoraText(.caption)
            }
            .foregroundStyle(Theme.textOnInverse)
        case .failed:
            VStack(spacing: Theme.space2) {
                PaldoraIconView(.refresh, size: 24)
                Text("Tap to retry").paldoraText(.ui12Medium)
            }
            .foregroundStyle(Theme.textOnInverse)
        default:
            EmptyView()
        }
    }
}

extension PaldoraUploadTile where Thumbnail == EmptyView {
    init(state: PaldoraUploadState, side: CGFloat = 150, action: (() -> Void)? = nil) {
        self.init(state: state, side: side, action: action, thumbnail: { EmptyView() })
    }
}

#Preview("Upload tiles") {
    HStack {
        PaldoraUploadTile(state: .done, thumbnail: { Theme.brassSoft })
        PaldoraUploadTile(state: .uploading(progress: 0.64), thumbnail: { Theme.brassSoft })
        PaldoraUploadTile(state: .add) {}
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
