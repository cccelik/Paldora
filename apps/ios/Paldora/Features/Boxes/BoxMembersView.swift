import PaldoraKit
import SwiftUI

struct MembersView: View {
    let env: FeatureEnvironment
    @State private var model: BoxMembersViewModel
    @State private var confirm: Confirmation?

    private struct Confirmation: Identifiable {
        let id = UUID()
        let title: String
        let action: String
        let run: () async -> Void
    }

    init(env: FeatureEnvironment, box: Box) {
        self.env = env
        _model = State(initialValue: BoxMembersViewModel(env: env, boxId: box.id, viewerRole: box.currentUserRole))
    }

    var body: some View {
        Group {
            switch model.members.phase {
            case .idle, .loading: LoadingBlock(label: "Loading members")
            case .failed(let message): ErrorBlock(message: message) { await model.members.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded: list
            }
        }
        .background(Theme.canvas)
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.members.loadFirst() }
        .confirmationDialog(confirm?.title ?? "", isPresented: Binding(
            get: { confirm != nil }, set: { if !$0 { confirm = nil } }
        ), titleVisibility: .visible) {
            if let confirm { Button(confirm.action, role: .destructive) { Task { await confirm.run() } } }
        }
    }

    private var list: some View {
        List {
            if let notice = model.notice { InlineMessage(text: notice, kind: .success).listRowBackground(Theme.canvas) }
            if let error = model.error { InlineMessage(text: error).listRowBackground(Theme.canvas) }
            ForEach(model.members.items) { member in
                VStack(alignment: .leading, spacing: Theme.space2) {
                    memberRow(member)
                    if model.hasActions(member) { actions(member) }
                }
                .listRowBackground(Theme.surface)
            }
            LoadMoreFooter(isLoading: model.members.isLoadingMore, error: model.members.inlineError,
                           hasMore: model.members.hasMore, loadMore: { await model.members.loadMore() })
                .listRowBackground(Theme.canvas)
        }
        .scrollContentBackground(.hidden)
        .refreshable { await model.members.refresh() }
    }

    @ViewBuilder private func memberRow(_ member: BoxMember) -> some View {
        let name = member.displayName ?? member.username ?? "Member"
        let content = HStack(spacing: Theme.space3) {
            AvatarView(mediaId: member.avatarMediaId, name: name)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(Typography.headline)
                Text(member.role.rawValue.capitalized).font(Typography.caption).foregroundStyle(Theme.textMuted)
            }
        }
        .frame(minHeight: Theme.touchTarget, alignment: .leading)
        if let username = member.username {
            NavigationLink(value: RoomRoute(username: username)) { content }.accessibilityHint("Opens their Room")
        } else { content }
    }

    private func actions(_ member: BoxMember) -> some View {
        let name = member.displayName ?? member.username ?? "this member"
        return HStack {
            if model.canChangeRole(member) {
                Button(BoxRules.nextRole(for: member.role) == .admin ? "Make admin" : "Make member") {
                    Task { await model.changeRole(member) }
                }
                .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("change-role")
            }
            if model.canTransfer(member) {
                Button("Make owner") {
                    confirm = Confirmation(title: "Make \(name) the owner? You'll become an admin.", action: "Yes, transfer") {
                        await model.transfer(member)
                    }
                }
                .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("make-owner")
            }
            if model.canRemove(member) {
                Button("Remove") {
                    confirm = Confirmation(title: "Remove \(name) from this Box?", action: "Yes, remove") { await model.remove(member) }
                }
                .buttonStyle(QuietButtonStyle(destructive: true)).accessibilityIdentifier("remove-member")
            }
        }
    }
}
