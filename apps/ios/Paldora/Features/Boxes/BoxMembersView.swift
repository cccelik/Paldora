import PaldoraKit
import SwiftUI

/// Figma 3.7 Members & roles: person rows with a role chip; role actions open a sheet
/// and removal or transfer confirm in a dialog.
struct MembersView: View {
    let env: FeatureEnvironment
    @State private var model: BoxMembersViewModel
    @State private var selected: BoxMember?
    @Environment(PaldoraDialogCenter.self) private var dialogs

    init(env: FeatureEnvironment, box: Box) {
        self.env = env
        _model = State(initialValue: BoxMembersViewModel(env: env, boxId: box.id, viewerRole: box.currentUserRole))
    }

    var body: some View {
        Group {
            switch model.members.phase {
            case .idle, .loading: ScrollView { PaldoraRowSkeleton().padding(Theme.gutter) }
            case .failed(let message): ErrorBlock(message: message) { await model.members.refresh() }
            case .unavailable: UnavailableBlock()
            case .loaded: list
            }
        }
        .paldoraCanvas()
        .paldoraNavBar("Members")
        .task { await model.members.loadFirst() }
        .paldoraBottomSheet(isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } }),
                            title: selected.map(name) ?? "Member") {
            if let member = selected { actions(member) }
        }
    }

    private func name(_ member: BoxMember) -> String { member.displayName ?? member.username ?? "Member" }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space3) {
                PaldoraScreenTitle(title: "Members", subtitle: Formatting.countLabel(model.members.items.count, singular: "person", plural: "people"))
                if let notice = model.notice { PaldoraBanner(tone: .success, title: notice) }
                if let error = model.error { PaldoraBanner(tone: .danger, title: error) }
                ForEach(model.members.items) { member in row(member) }
                LoadMoreFooter(isLoading: model.members.isLoadingMore, error: model.members.inlineError,
                               hasMore: model.members.hasMore, loadMore: { await model.members.loadMore() })
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.members.refresh() }
    }

    @ViewBuilder private func row(_ member: BoxMember) -> some View {
        let row = PaldoraPersonRow(name: name(member), mediaId: member.avatarMediaId) {
            HStack(spacing: Theme.space2) {
                PaldoraChip(title: member.role.rawValue.capitalized, style: member.role == .member ? .standard : .brass)
                if model.hasActions(member) {
                    PaldoraIconButton(icon: .more, label: "Actions for \(name(member))", style: .plain) { selected = member }
                        .accessibilityIdentifier("member-actions")
                }
            }
        }
        if let username = member.username {
            NavigationLink(value: RoomRoute(username: username)) { row }
                .buttonStyle(.plain).accessibilityHint("Opens their Room")
        } else { row }
    }

    @ViewBuilder private func actions(_ member: BoxMember) -> some View {
        let who = name(member)
        PaldoraListGroup {
            if model.canChangeRole(member) {
                let makeAdmin = BoxRules.nextRole(for: member.role) == .admin
                PaldoraListRow(title: makeAdmin ? "Make admin" : "Make member",
                               subtitle: makeAdmin ? "Can invite, remove members and edit the Box" : nil,
                               icon: .shield, trailing: .none) {
                    selected = nil
                    Task { await model.changeRole(member) }
                }
                .accessibilityIdentifier("change-role")
            }
            if model.canTransfer(member) {
                PaldoraListDivider()
                PaldoraListRow(title: "Make owner", icon: .key, trailing: .none) {
                    selected = nil
                    dialogs.present(icon: .key, title: "Make \(who) the owner?", message: "You'll become an admin.",
                                    confirmTitle: "Transfer ownership", isDestructive: false) {
                        Task { await model.transfer(member) }
                    }
                }
                .accessibilityIdentifier("make-owner")
            }
            if model.canRemove(member) {
                PaldoraListDivider()
                PaldoraListRow(title: "Remove from Box", icon: .close, trailing: .none, isDestructive: true) {
                    selected = nil
                    dialogs.present(icon: .close, title: "Remove \(who)?", message: "They lose access to this Box. They can be invited again.",
                                    confirmTitle: "Remove") { Task { await model.remove(member) } }
                }
                .accessibilityIdentifier("remove-member")
            }
        }
    }
}
