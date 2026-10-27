import PaldoraKit
import SwiftUI

/// Pick Top Friends from accepted friends (4, 8 or 12), in order.
struct RoomTopFriendsEditor: View {
    @Bindable var model: RoomEditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Top Friends").font(Typography.title).foregroundStyle(Theme.text).accessibilityAddTraits(.isHeader)
            Picker("Show", selection: Binding(get: { model.topFriendsSize }, set: { model.setTopFriendsSize($0) })) {
                ForEach(RoomCatalog.topFriendsSizes, id: \.self) { Text("Top \($0)").tag($0) }
            }
            .pickerStyle(.segmented).accessibilityIdentifier("top-friends-size")
            Picker("Who sees them", selection: $model.topFriendsVisibility) {
                ForEach(RoomCatalog.topFriendsVisibilities, id: \.self) {
                    Text(RoomRegistry.label(RoomRegistry.topFriendsLabels, $0)).tag($0)
                }
            }
            .pickerStyle(.menu).frame(minHeight: Theme.touchTarget)
            Text("\(model.selectedTopFriends.count) of \(model.maxTopFriends) chosen").font(Typography.caption).foregroundStyle(Theme.textMuted)
            ForEach(Array(model.selectedTopFriends.enumerated()), id: \.element) { index, uid in
                HStack {
                    Text("\(index + 1). \(model.friendName(uid))").font(Typography.body).foregroundStyle(Theme.text)
                    Spacer()
                    Button { model.moveTopFriend(uid, by: -1) } label: { Image(systemName: "arrow.up") }
                        .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget).disabled(index == 0)
                        .accessibilityLabel("Move \(model.friendName(uid)) up")
                    Button { model.moveTopFriend(uid, by: 1) } label: { Image(systemName: "arrow.down") }
                        .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                        .disabled(index == model.selectedTopFriends.count - 1)
                        .accessibilityLabel("Move \(model.friendName(uid)) down")
                    Button { model.toggleTopFriend(uid) } label: { Image(systemName: "xmark.circle") }
                        .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                        .accessibilityLabel("Remove \(model.friendName(uid))")
                }
            }
            Text("Your friends").font(Typography.label).foregroundStyle(Theme.textMuted)
            switch model.friends.phase {
            case .idle, .loading: ProgressView()
            case .failed(let message): ErrorBlock(message: message) { await model.friends.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded:
                if model.friends.items.isEmpty {
                    Text("Add friends first; Top Friends are chosen from your accepted friends.")
                        .font(Typography.callout).foregroundStyle(Theme.textMuted)
                }
                ForEach(model.friends.items) { friend in
                    let chosen = model.selectedTopFriends.contains(friend.otherUid)
                    Button { model.toggleTopFriend(friend.otherUid) } label: {
                        HStack {
                            Image(systemName: chosen ? "checkmark.circle.fill" : "circle").foregroundStyle(chosen ? Theme.goldText : Theme.textMuted)
                            Text(friend.displayName).foregroundStyle(Theme.text)
                            Spacer()
                        }
                        .frame(minHeight: Theme.touchTarget)
                    }
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                    .accessibilityIdentifier("top-friend-candidate")
                }
            }
        }
    }
}
