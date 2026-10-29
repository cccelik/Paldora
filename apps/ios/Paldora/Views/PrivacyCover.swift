import SwiftUI
import UIKit

/// When the app is not active (app switcher, control center, calls) the
/// system snapshots the screen. Cover everything with an opaque placeholder
/// so passwords, exports, deletion, private Rooms and Settings never appear in it.
struct PrivacyCoverState: Equatable {
    private(set) var isCovered = false

    mutating func apply(_ phase: ScenePhase) { isCovered = phase != .active }
}

/// An opaque window-level cover. A view overlay would sit below sheets, share
/// sheets and alerts; a subview of the window covers them too.
@MainActor
final class PrivacyShield {
    static let shared = PrivacyShield()
    private var cover: UIView?

    func set(covered: Bool) {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first else { return }
        if covered {
            guard cover == nil else { return }
            let host = UIHostingController(rootView: PrivacyCoverView())
            host.view.frame = window.bounds
            host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            host.view.isOpaque = true
            window.addSubview(host.view)
            cover = host.view
        } else {
            cover?.removeFromSuperview()
            cover = nil
        }
    }
}

struct PrivacyCoverView: View {
    var body: some View {
        ZStack {
            Theme.canvas.ignoresSafeArea()
            BrandMark()
        }
        .accessibilityHidden(true)
    }
}
