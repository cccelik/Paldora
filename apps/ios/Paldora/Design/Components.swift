import SwiftUI

/// A four-point star, the brand's quiet sparkle.
struct FourPointStar: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        let inner = r * 0.22
        var path = Path()
        for i in 0..<8 {
            let angle = Double(i) * .pi / 4 - .pi / 2
            let radius = i.isMultiple(of: 2) ? r : inner
            let point = CGPoint(x: c.x + CGFloat(cos(angle)) * radius, y: c.y + CGFloat(sin(angle)) * radius)
            if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}

struct BrandMark: View {
    var body: some View {
        HStack(spacing: Theme.space2) {
            FourPointStar().fill(Theme.gold).frame(width: 14, height: 14).accessibilityHidden(true)
            Text("Paldora").font(Typography.brand).foregroundStyle(Theme.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Paldora")
        .accessibilityAddTraits(.isHeader)
    }
}

/// Deprecated: the primary pill. Now delegates to `PaldoraButtonStyle` (Primary, M,
/// full width); new code uses `PaldoraButton` or `PaldoraButtonStyle`.
@available(*, deprecated, message: "Use PaldoraButton or PaldoraButtonStyle(kind: .primary, fullWidth: true).")
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        LegacyPrimary(configuration: configuration)
    }

    /// Enabled is the new Primary pill. Disabled keeps the older quiet outlined look rather than
    /// the kit's 40% fade: faded ink with ivory text is below AA and the main-screen audit flags it.
    private struct LegacyPrimary: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            if isEnabled {
                PaldoraButtonStyle(kind: .primary, size: .medium, fullWidth: true).makeBody(configuration: configuration)
            } else {
                configuration.label
                    .paldoraText(PaldoraButtonSize.medium.textStyle)
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: PaldoraButtonSize.medium.height)
                    .background(Theme.bgSurface, in: Capsule())
                    .paldoraHairline(Capsule())
            }
        }
    }
}

/// A list or form section heading with AA contrast (the system default is too faint).
struct SectionHeader: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(Typography.label).foregroundStyle(Theme.textMuted).textCase(nil)
    }
}

/// Lays children out in a row, or stacked once text is at an accessibility size, so
/// nothing clips or truncates at the largest Dynamic Type sizes.
struct AdaptiveStack<Content: View>: View {
    var spacing: CGFloat = Theme.space3
    var alignment: VerticalAlignment = .center
    @ViewBuilder var content: Content
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        if size.isAccessibilitySize {
            VStack(alignment: .leading, spacing: spacing) { content }
        } else {
            HStack(alignment: alignment, spacing: spacing) { content }
        }
    }
}

/// Deprecated: a quiet text button. Now delegates to the Ghost `PaldoraButtonStyle`.
@available(*, deprecated, message: "Use PaldoraButton(kind: .ghost) or PaldoraButtonStyle(kind: .ghost).")
struct QuietButtonStyle: ButtonStyle {
    var destructive = false

    func makeBody(configuration: Configuration) -> some View {
        PaldoraButtonStyle(kind: .ghost, size: .small, destructive: destructive).makeBody(configuration: configuration)
    }
}

/// Deprecated: a labelled input surface. Now `PaldoraFieldContainer` (54 pt, eyebrow label).
@available(*, deprecated, message: "Use PaldoraTextField or PaldoraFieldContainer.")
struct FieldContainer<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        PaldoraFieldContainer(title: title) { content }
    }
}

/// Deprecated: inline status text with an icon. Now `PaldoraFieldMessage`.
@available(*, deprecated, message: "Use PaldoraFieldMessage.")
struct InlineMessage: View {
    enum Kind { case error, success }
    let text: String
    var kind: Kind = .error

    var body: some View {
        PaldoraFieldMessage(text: text, isError: kind == .error)
    }
}

/// Lays children left to right and wraps to new rows, so action buttons never clip
/// or truncate at accessibility text sizes.
struct FlowLayout: Layout {
    var spacing: CGFloat = Theme.space2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(bounds.width, subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                                  proposal: ProposedViewSize(frame.size))
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var frames: [CGRect] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: min(maxX, width), height: y + rowHeight), frames)
    }
}
