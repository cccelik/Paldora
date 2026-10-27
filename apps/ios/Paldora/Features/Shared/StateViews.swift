import SwiftUI

/// Card container: paper surface and hairline, no glass.
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(Theme.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
    }
}

extension View {
    func paldoraCard() -> some View { modifier(CardBackground()) }
}

struct LoadingBlock: View {
    var label = "Loading"

    var body: some View {
        ProgressView(label)
            .font(Typography.callout)
            .frame(maxWidth: .infinity, minHeight: 120)
            .accessibilityIdentifier("loading")
    }
}

struct ErrorBlock: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: Theme.space3) {
            InlineMessage(text: message)
            Button("Try again") { Task { await retry() } }
                .buttonStyle(QuietButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.space4)
    }
}

struct EmptyBlock: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: Theme.space2) {
            FourPointStar().fill(Theme.gold).frame(width: 18, height: 18).accessibilityHidden(true)
            Text(title).font(Typography.brandSmall).foregroundStyle(Theme.text)
            Text(message).font(Typography.callout).foregroundStyle(Theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.space8)
        .accessibilityElement(children: .combine)
    }
}

/// The one neutral state for missing or inaccessible content.
struct UnavailableBlock: View {
    var body: some View {
        EmptyBlock(title: "No longer available", message: "This isn't available anymore.")
            .accessibilityIdentifier("unavailable")
    }
}

/// Footer for paged lists: loads the next page when it appears.
struct LoadMoreFooter: View {
    let isLoading: Bool
    let error: String?
    let hasMore: Bool
    let loadMore: () async -> Void

    var body: some View {
        if let error {
            ErrorBlock(message: error, retry: loadMore)
        } else if hasMore {
            ProgressView().frame(maxWidth: .infinity, minHeight: Theme.touchTarget)
                .task { await loadMore() }
                .accessibilityLabel("Loading more")
        }
    }
}

extension View {
    /// Animation that falls back to none when Reduce Motion is on.
    func calmAnimation<V: Equatable>(_ value: V) -> some View {
        modifier(CalmAnimation(value: value))
    }
}

private struct CalmAnimation<V: Equatable>: ViewModifier {
    let value: V
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: value)
    }
}
