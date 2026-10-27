import PaldoraKit
import SwiftUI

struct FriendsView: View {
    let env: FeatureEnvironment
    @State private var model: FriendsViewModel
    @State private var username = ""
    @State private var confirm: Confirmation?

    private struct Confirmation: Identifiable {
        let id = UUID()
        let title: String
        let action: String
        let run: () async -> Void
    }

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: FriendsViewModel(env: env))
    }

    var body: some View {
        List {
            addSection
            if let notice = model.notice {
                InlineMessage(text: notice.text, kind: notice.isError ? .error : .success)
                    .listRowBackground(Theme.canvas)
                    .accessibilityIdentifier("friends-notice")
            }
            requestsSection
            friendsSection
            blockedSection
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("Friends")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh() }
        .task { await model.load() }
        .confirmationDialog(confirm?.title ?? "", isPresented: Binding(
            get: { confirm != nil }, set: { if !$0 { confirm = nil } }
        ), titleVisibility: .visible) {
            if let confirm { Button(confirm.action, role: .destructive) { Task { await confirm.run() } } }
        }
    }

    private var addSection: some View {
        Section {
            FieldContainer(title: "Their username") {
                TextField("username", text: $username)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.send).onSubmit(send)
                    .accessibilityIdentifier("friend-username-field")
            }
            .listRowBackground(Theme.canvas)
            Button(action: send) { if model.isSending { ProgressView() } else { Text("Send request") } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.isSending || username.trimmingCharacters(in: .whitespaces).isEmpty)
                .listRowBackground(Theme.canvas)
                .accessibilityIdentifier("send-friend-request")
        } header: { Text("Add a friend").font(Typography.label) }
    }

    private var requestsSection: some View {
        Section {
            if model.requests.items.isEmpty && model.sent.items.isEmpty { empty("No requests waiting.") }
            ForEach(model.requests.items) { request in
                PersonRowView(name: request.displayName, username: request.username, note: nil) {
                    Button("Accept") { Task { await model.accept(request) } }
                        .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("accept-friend")
                    Button("Decline") { Task { await model.close(request, success: "Request declined.") } }
                        .buttonStyle(QuietButtonStyle(destructive: true))
                }
            }
            ForEach(model.sent.items) { request in
                PersonRowView(name: request.displayName, username: request.username, note: "Waiting for a reply") {
                    Button("Withdraw") { Task { await model.close(request, success: "Request withdrawn.") } }
                        .buttonStyle(QuietButtonStyle())
                }
            }
        } header: { Text("Requests").font(Typography.label) }
    }

    private var friendsSection: some View {
        Section {
            if model.friends.items.isEmpty { empty("No friends yet. Send a request by username above.") }
            ForEach(model.friends.items) { friend in
                PersonRowView(name: friend.displayName, username: friend.username, note: nil) {
                    Button("Remove") {
                        confirm = Confirmation(title: "Remove \(friend.displayName) as a friend? Boxes you share stay as they are.",
                                               action: "Yes, remove") { await model.close(friend, success: "Friend removed.") }
                    }.buttonStyle(QuietButtonStyle())
                    Button("Block") {
                        confirm = Confirmation(title: "Block \(friend.displayName)? You'll stop being friends, and neither of you can reach the other.",
                                               action: "Yes, block") { await model.block(friend) }
                    }.buttonStyle(QuietButtonStyle(destructive: true)).accessibilityIdentifier("block-friend")
                }
            }
            LoadMoreFooter(isLoading: model.friends.isLoadingMore, error: model.friends.inlineError,
                           hasMore: model.friends.hasMore, loadMore: { await model.friends.loadMore() })
                .listRowBackground(Theme.canvas)
        } header: { Text("Your friends").font(Typography.label) }
    }

    private var blockedSection: some View {
        Section {
            if model.blocked.items.isEmpty { empty("You haven't blocked anyone.") }
            ForEach(model.blocked.items) { user in
                PersonRowView(name: user.displayName, username: user.username, note: nil) {
                    Button("Unblock") { Task { await model.unblock(user) } }.buttonStyle(QuietButtonStyle())
                        .accessibilityIdentifier("unblock-user")
                }
            }
        } header: { Text("Blocked people").font(Typography.label) }
        footer: { Text("Blocking ends a friendship and withdraws requests and invitations between you. They aren't told.").font(Typography.caption) }
    }

    private func empty(_ text: String) -> some View {
        Text(text).font(Typography.callout).foregroundStyle(Theme.textMuted).listRowBackground(Theme.canvas)
    }

    private func send() {
        let name = username
        Task { if await model.sendRequest(username: name) { username = "" } }
    }
}

struct PersonRowView<Actions: View>: View {
    let name: String
    let username: String
    let note: String?
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            NavigationLink(value: RoomRoute(username: username)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(Typography.headline).foregroundStyle(Theme.text)
                    Text("@\(username)" + (note.map { " · \($0)" } ?? "")).font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
                .frame(minHeight: Theme.touchTarget, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            .accessibilityHint("Opens their Room")
            HStack { actions }
        }
        .listRowBackground(Theme.surface)
        .accessibilityElement(children: .contain)
    }
}
