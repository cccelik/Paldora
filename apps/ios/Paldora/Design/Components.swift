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

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.headline)
            .foregroundStyle(Theme.onInk)
            .frame(maxWidth: .infinity, minHeight: Theme.touchTarget)
            .padding(.horizontal, Theme.space4)
            .background(Theme.ink.opacity(isEnabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: Theme.radius))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

struct QuietButtonStyle: ButtonStyle {
    var destructive = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.label)
            .foregroundStyle(destructive ? Theme.danger : Theme.goldText)
            .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// A labelled text field with a hairline surface; at least 44pt tall.
struct FieldContainer<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space1) {
            Text(title).font(Typography.label).foregroundStyle(Theme.textMuted)
            content
                .font(Typography.body)
                .foregroundStyle(Theme.text)
                .padding(.horizontal, Theme.space3)
                .frame(minHeight: Theme.touchTarget)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
        }
    }
}

/// Inline status text with an icon so meaning never relies on color alone.
struct InlineMessage: View {
    enum Kind { case error, success }
    let text: String
    var kind: Kind = .error

    var body: some View {
        Label(text, systemImage: kind == .error ? "exclamationmark.circle" : "checkmark.circle")
            .font(Typography.callout)
            .foregroundStyle(kind == .error ? Theme.danger : Theme.success)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
    }
}
