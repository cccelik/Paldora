import PaldoraKit
import SwiftUI

/// Pick Top Friends from accepted friends (4, 8 or 12), in order.
struct RoomTopFriendsEditor: View {
    @Bindable var model: RoomEditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Top Friends").paldoraText(.titleM).foregroundStyle(Theme.textPrimary).accessibilityAddTraits(.isHeader)
            PaldoraSegmentedControl(RoomCatalog.topFriendsSizes.map { .init($0, "Top \($0)") },
                                    selection: Binding(get: { model.topFriendsSize }, set: { model.setTopFriendsSize($0) }))
                .accessibilityIdentifier("top-friends-size")
            PaldoraListGroup {
                PaldoraChoiceRow(title: "Who sees them", icon: .eye,
                                 options: RoomCatalog.topFriendsVisibilities.map { .init($0, RoomRegistry.label(RoomRegistry.topFriendsLabels, $0)) },
                                 selection: $model.topFriendsVisibility)
            }
            Text("\(model.selectedTopFriends.count) of \(model.maxTopFriends) chosen").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            ForEach(Array(model.selectedTopFriends.enumerated()), id: \.element) { index, uid in
                PaldoraPersonRow(name: "\(index + 1). \(model.friendName(uid))") {
                    HStack(spacing: Theme.space1) {
                        PaldoraIconButton(icon: .down, label: "Move \(model.friendName(uid)) up", style: .plain) { model.moveTopFriend(uid, by: -1) }
                            .rotationEffect(.degrees(180)).disabled(index == 0)
                        PaldoraIconButton(icon: .down, label: "Move \(model.friendName(uid)) down", style: .plain) { model.moveTopFriend(uid, by: 1) }
                            .disabled(index == model.selectedTopFriends.count - 1)
                        PaldoraIconButton(icon: .close, label: "Remove \(model.friendName(uid))", style: .plain) { model.toggleTopFriend(uid) }
                    }
                }
            }
            PaldoraEyebrow("Your friends")
            switch model.friends.phase {
            case .idle, .loading: PaldoraRowSkeleton(count: 2)
            case .failed(let message): ErrorBlock(message: message) { await model.friends.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                if model.friends.items.isEmpty {
                    Text("Add friends first; Top Friends are chosen from your accepted friends.")
                        .paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
                }
                ForEach(model.friends.items) { friend in
                    PaldoraCheckbox(friend.displayName, isOn: Binding(
                        get: { model.selectedTopFriends.contains(friend.otherUid) },
                        set: { _ in model.toggleTopFriend(friend.otherUid) }))
                        .accessibilityIdentifier("top-friend-candidate")
                }
            }
        }
    }
}
