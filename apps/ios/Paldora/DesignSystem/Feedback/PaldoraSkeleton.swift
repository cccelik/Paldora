import PaldoraKit
import SwiftUI

/// A loading placeholder block on bg/sunken. Loading in Paldora uses skeletons,
/// never spinners (except inside buttons). The soft pulse stops under Reduce Motion.
struct PaldoraSkeleton: View {
    var width: CGFloat?
    var height: CGFloat
    var radius: CGFloat = 5
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Theme.bgSunken)
            .frame(width: width, height: height)
            .opacity(dimmed ? 0.55 : 1)
            .onAppear {
                guard !reduceMotion, !Self.isStatic else { return }
                withAnimation(PaldoraMotion.animation(PaldoraTokens.durationSlow * 3).repeatForever(autoreverses: true)) {
                    dimmed = true
                }
            }
            .accessibilityHidden(true)
    }

    /// UI tests wait for the app to go idle; a perpetual animation would stall them.
    private static var isStatic: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-PALDORA_GALLERY")
        #else
        false
        #endif
    }
}

/// Figma "Skeleton / Post": avatar, two text lines, a photo block and a caption line.
struct PaldoraPostSkeleton: View {
    private static var radius: CGFloat { 26 }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            HStack(spacing: 10) {
                PaldoraSkeleton(width: 38, height: 38, radius: 19)
                VStack(alignment: .leading, spacing: 6) {
                    PaldoraSkeleton(width: 120, height: 10)
                    PaldoraSkeleton(width: 80, height: 8, radius: 4)
                }
            }
            PaldoraSkeleton(height: 180, radius: 18)
            PaldoraSkeleton(width: 260, height: 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
    }
}

#Preview("Skeleton") {
    PaldoraPostSkeleton().padding(Theme.space5).background(Theme.bgCanvas)
}
