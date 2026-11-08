import PaldoraKit
import SwiftUI

enum FriendsDestination: Hashable {
    case add, requests, blocked
}

/// Figma 2.1 Friends: a search field, a requests card when something is pending and
/// the friends list; Add a friend (2.2), Requests (2.3) and Blocked accounts (2.6) are
/// their own screens; the person sheet (2.4) and block dialog (2.5) sit on top.
struct FriendsView: View {
    let env: FeatureEnvironment
    @State private var model: FriendsViewModel
    @State private var query = ""
    @State private var selected: Friendship?
    @State private var pushed: FriendsDestination?
    @State private var toast: String?
    @Environment(PaldoraDialogCenter.self) private var dialogs

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: FriendsViewModel(env: env))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space5) {
                PaldoraScreenTitle(title: "Friends")
                if let notice = model.notice, notice.isError {
                    PaldoraBanner(tone: .danger, title: notice.text).accessibilityIdentifier("friends-notice")
                }
                if !model.requests.items.isEmpty || !model.sent.items.isEmpty { requestsCard }
                friendsList
                PaldoraListGroup {
                    PaldoraListRow(title: "Blocked accounts", icon: .ban) { pushed = .blocked }
                        .accessibilityIdentifier("blocked-link")
                }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Friends", trailing: .action(title: "Add") { pushed = .add })
        .refreshable { await model.refresh() }
        .task { await model.load() }
        .paldoraToast($toast)
        .navigationDestination(item: $pushed) { destination in
            switch destination {
            case .add: AddFriendView(model: model)
            case .requests: FriendRequestsView(model: model, toast: $toast)
            case .blocked: BlockedAccountsView(model: model)
            }
        }
        .paldoraBottomSheet(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } }),
                            title: selected?.displayName ?? "Friend") {
            if let friend = selected { personActions(friend) }
        }
    }

    private var requestsCard: some View {
        Button { pushed = .requests } label: {
            HStack(spacing: Theme.space3) {
                PaldoraIconView(.friends, size: 20).foregroundStyle(Theme.brassText)
                    .frame(width: 40, height: 40).background(Theme.brassSoft, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    let count = model.requests.items.count
                    Text(count == 0 ? "Requests" : (count == 1 ? "1 request" : "\(count) requests"))
                        .paldoraText(.labelM).foregroundStyle(Theme.textPrimary)
                    Text(count == 0 ? "\(model.sent.items.count) sent, waiting for a reply" : "People waiting for your answer")
                        .paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("See all").paldoraText(.labelS).foregroundStyle(Theme.brassText)
            }
            .padding(Theme.space3)
            .frame(minHeight: 62)
            .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: PaldoraPersonRow<EmptyView>.radius))
            .paldoraHairline(RoundedRectangle(cornerRadius: PaldoraPersonRow<EmptyView>.radius))
        }
        .buttonStyle(PaldoraPressableStyle())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("requests-link")
    }

    private var visibleFriends: [Friendship] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return model.friends.items }
        return model.friends.items.filter {
            $0.displayName.lowercased().contains(needle) || $0.username.lowercased().contains(needle)
        }
    }

    @ViewBuilder private var friendsList: some View {
        if model.friends.isLoadingFirst {
            PaldoraRowSkeleton()
        } else if model.friends.items.isEmpty {
            PaldoraStateView(icon: .friends, title: "Invite your first friend",
                             message: "Add someone by their exact username. Paldora never suggests strangers.") {
                PaldoraButton("Add a friend", kind: .secondary, size: .medium) { pushed = .add }
                    .padding(.top, Theme.space2)
            }
        } else {
            PaldoraTextField("Search your people", text: $query, placeholder: "Name or username")
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            PaldoraEyebrow("Your friends")
            VStack(spacing: Theme.space2) {
                ForEach(visibleFriends) { friend in
                    NavigationLink(value: RoomRoute(username: friend.username)) {
                        PaldoraPersonRow(name: friend.displayName, subtitle: "@\(friend.username)") {
                            PaldoraIconButton(icon: .more, label: "More for \(friend.displayName)", style: .plain) { selected = friend }
                                .accessibilityIdentifier("friend-actions")
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens their Room")
                }
                if visibleFriends.isEmpty {
                    Text("No one matches that.").paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
                }
                LoadMoreFooter(isLoading: model.friends.isLoadingMore, error: model.friends.inlineError,
                               hasMore: model.friends.hasMore, loadMore: { await model.friends.loadMore() })
            }
        }
    }

    /// Figma 2.4 Person actions. Destructive rows confirm first (2.5).
    @ViewBuilder private func personActions(_ friend: Friendship) -> some View {
        PaldoraListGroup {
            NavigationLink(value: RoomRoute(username: friend.username)) {
                PaldoraListRow(title: "Visit \(friend.displayName)'s Room", icon: .room)
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded { selected = nil })
            PaldoraListDivider()
            PaldoraListRow(title: "Unfriend", icon: .friends, trailing: .none, isDestructive: true) {
                selected = nil
                dialogs.present(icon: .friends, title: "Unfriend \(friend.displayName)?",
                                message: "Boxes you share stay as they are. You can send a new request later.",
                                confirmTitle: "Unfriend") {
                    Task { await model.close(friend, success: "Friend removed."); toast = "Friend removed." }
                }
            }
            PaldoraListDivider()
            PaldoraListRow(title: "Block", icon: .ban, trailing: .none, isDestructive: true) {
                selected = nil
                dialogs.present(icon: .ban, title: "Block \(friend.displayName)?",
                                message: "You won't see each other's Rooms, posts, comments or Life Updates, anywhere, including shared Boxes. Your friendship ends and unblocking later won't restore it. \(friend.displayName) isn't notified.",
                                confirmTitle: "Block") {
                    Task { await model.block(friend); toast = "Blocked" }
                }
            }
            .accessibilityIdentifier("block-friend")
        }
    }
}

/// Figma 2.2 Add a friend. The API takes an exact username and answers with one neutral
/// line, so there is no found-person preview (that would reveal who exists).
struct AddFriendView: View {
    let model: FriendsViewModel
    @State private var username = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space5) {
                PaldoraScreenTitle(title: "Find someone", accent: "you know.",
                                   subtitle: "Search by exact username. Paldora never suggests strangers.")
                PaldoraTextField("Their username", text: $username, placeholder: "username", identifier: "friend-username-field")
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.send).onSubmit(send)
                if let notice = model.notice {
                    PaldoraBanner(tone: notice.isError ? .danger : .success, title: notice.text)
                        .accessibilityIdentifier("friends-notice")
                }
                PaldoraButton("Send friend request", isLoading: model.isSending, fullWidth: true, action: send)
                    .disabled(model.isSending || username.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("send-friend-request")
                Text("They'll see your request and can accept or ignore it. If it can't be sent you'll only see that it didn't work.")
                    .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("Add a friend")
    }

    private func send() {
        let name = username
        Task { if await model.sendRequest(username: name) { username = "" } }
    }
}

/// Figma 2.3 Requests: Received and Sent tabs, accept and decline, withdraw.
struct FriendRequestsView: View {
    let model: FriendsViewModel
    @Binding var toast: String?
    @State private var tab = Tab.received

    enum Tab: Hashable { case received, sent }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space5) {
                PaldoraScreenTitle(title: "Requests")
                PaldoraSegmentedControl([.init(Tab.received, "Received · \(model.requests.items.count)"),
                                         .init(Tab.sent, "Sent · \(model.sent.items.count)")], selection: $tab)
                if let notice = model.notice {
                    PaldoraBanner(tone: notice.isError ? .danger : .success, title: notice.text)
                        .accessibilityIdentifier("friends-notice")
                }
                if tab == .received { received } else { sent }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Requests")
        .refreshable { await model.refresh() }
    }

    @ViewBuilder private var received: some View {
        if model.requests.items.isEmpty {
            PaldoraStateView(icon: .friends, title: "No requests waiting", message: "When someone asks to be your friend it shows up here.")
        }
        ForEach(model.requests.items) { request in
            PaldoraPersonRow(name: request.displayName, subtitle: "@\(request.username)") {
                HStack(spacing: Theme.space2) {
                    PaldoraButton("Accept", kind: .secondary, size: .small) {
                        Task { await model.accept(request); toast = "You and \(request.displayName) are now friends." }
                    }
                    .accessibilityIdentifier("accept-friend")
                    PaldoraButton("Decline", kind: .ghost, size: .small, destructive: true) {
                        Task { await model.close(request, success: "Request declined.") }
                    }
                }
            }
        }
        if !model.requests.items.isEmpty {
            Text("Declining is silent: they aren't told.").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
        }
    }

    @ViewBuilder private var sent: some View {
        if model.sent.items.isEmpty {
            PaldoraStateView(icon: .send, title: "Nothing sent", message: "Requests you send wait here until they answer.")
        }
        ForEach(model.sent.items) { request in
            PaldoraPersonRow(name: request.displayName, subtitle: "@\(request.username) · Waiting for a reply") {
                PaldoraButton("Cancel", kind: .ghost, size: .small) { Task { await model.cancel(request) } }
                    .accessibilityIdentifier("withdraw-request")
            }
        }
    }
}

/// Figma 2.6 Blocked accounts.
struct BlockedAccountsView: View {
    let model: FriendsViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space5) {
                PaldoraScreenTitle(title: "Blocked",
                                   subtitle: "People you've blocked can't find you, see your Room, or interact with anything you share.")
                if let notice = model.notice {
                    PaldoraBanner(tone: notice.isError ? .danger : .success, title: notice.text)
                        .accessibilityIdentifier("friends-notice")
                }
                if model.blocked.items.isEmpty {
                    PaldoraStateView(icon: .ban, title: "No one is blocked", message: "You haven't blocked anyone.")
                }
                ForEach(model.blocked.items) { user in
                    PaldoraPersonRow(name: user.displayName, subtitle: "@\(user.username)") {
                        PaldoraButton("Unblock", kind: .secondary, size: .small) { Task { await model.unblock(user) } }
                            .accessibilityIdentifier("unblock-user")
                    }
                }
                PaldoraBanner(tone: .info, title: "About unblocking",
                              message: "Unblocking doesn't restore a friendship or Box membership, only access that's independently allowed today.")
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Blocked accounts")
        .refreshable { await model.refresh() }
    }
}
