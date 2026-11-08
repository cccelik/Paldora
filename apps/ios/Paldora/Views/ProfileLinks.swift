import SwiftUI

struct FriendsRoute: Hashable {}
struct LifeUpdatesRoute: Hashable {}

/// Entry points to the social screens from the Profile tab (Figma 9.1 list group).
struct ProfileLinks: View {
    var body: some View {
        PaldoraListGroup {
            row("Friends", icon: .friends, value: FriendsRoute(), id: "friends-link")
            PaldoraListDivider()
            row("Life Updates", icon: .book, value: LifeUpdatesRoute(), id: "life-updates-link")
            PaldoraListDivider()
            row("Memories", icon: .cal, value: MemoriesRoute(scope: .me), id: "memories-link")
            PaldoraListDivider()
            row("Settings", icon: .gear, value: SettingsRoute(), id: "settings-link")
        }
    }

    private func row<V: Hashable>(_ title: String, icon: PaldoraIcon, value: V, id: String) -> some View {
        NavigationLink(value: value) { PaldoraListRow(title: title, icon: icon) }
            .buttonStyle(.plain)
            .accessibilityIdentifier(id)
    }
}
