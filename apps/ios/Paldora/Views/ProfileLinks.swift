import SwiftUI

struct FriendsRoute: Hashable {}
struct LifeUpdatesRoute: Hashable {}

/// Entry points to the social screens from the Profile tab.
struct ProfileLinks: View {
    var body: some View {
        VStack(spacing: 0) {
            row("Friends", systemImage: "person.2", value: FriendsRoute(), id: "friends-link")
            Divider().overlay(Theme.hairline)
            row("Life Updates", systemImage: "text.book.closed", value: LifeUpdatesRoute(), id: "life-updates-link")
            Divider().overlay(Theme.hairline)
            row("Memories", systemImage: "clock.arrow.circlepath", value: MemoriesRoute(scope: .me), id: "memories-link")
        }
        .padding(.horizontal, Theme.space3)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.hairline, lineWidth: 1))
    }

    private func row<V: Hashable>(_ title: String, systemImage: String, value: V, id: String) -> some View {
        NavigationLink(value: value) {
            HStack {
                Label(title, systemImage: systemImage).font(Typography.headline).foregroundStyle(Theme.text)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.textMuted).accessibilityHidden(true)
            }
            .frame(minHeight: Theme.touchTarget)
        }
        .accessibilityIdentifier(id)
    }
}
