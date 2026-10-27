import SwiftUI

/// A small decorative cluster for the Room header. Static (no motion), hidden
/// from VoiceOver, and only inside the Room canvas.
struct RoomDecoration: View {
    let appearance: RoomAppearance

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(symbols.enumerated()), id: \.offset) { index, name in
                Image(systemName: name).font(.system(size: index == 0 ? 20 : 13))
                    .rotationEffect(.degrees(index == 1 ? -12 : 8))
            }
        }
        .foregroundStyle(appearance.accentColor.opacity(0.85))
        .accessibilityHidden(true)
    }

    private var symbols: [String] {
        var result: [String]
        switch appearance.decoration {
        case "stars": result = ["sparkle", "sparkle"]
        case "flowers": result = ["camera.macro", "leaf"]
        case "stickers": result = ["face.smiling", "heart.fill"]
        case "tape": result = ["rectangle.fill"]
        case "pixels": result = ["square.grid.3x3.fill"]
        default: result = []
        }
        if appearance.sparkles { result.append("sparkles") }
        return result
    }
}
