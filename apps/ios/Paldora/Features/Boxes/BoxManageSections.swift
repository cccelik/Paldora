import PaldoraKit
import SwiftUI

// Each section is its own small view: one giant body produced enormous generic
// types that made SwiftUI's debug runtime crawl.

@MainActor private func manageSection<C: View>(_ title: String, _ note: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
    VStack(alignment: .leading, spacing: Theme.space3) {
        Text(title).paldoraText(.titleM).foregroundStyle(Theme.textPrimary).accessibilityAddTraits(.isHeader)
        if let note { Text(note).paldoraText(.bodyM).foregroundStyle(Theme.textSecondary) }
        content()
    }
}

struct ManageMessages: View {
    let model: BoxManagementViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let notice = model.notice { PaldoraBanner(tone: .success, title: notice).accessibilityIdentifier("manage-notice") }
            if let error = model.error { PaldoraBanner(tone: .danger, title: error).accessibilityIdentifier("manage-error") }
        }
    }
}

struct InviteSection: View {
    @Bindable var model: BoxManagementViewModel

    var body: some View {
        manageSection("Invite people", "Invite anyone by username. They don't need to be your friend, and invitations expire after 7 days.") {
            if model.canInvite { form } else {
                PaldoraBanner(tone: .warning, title: "Restore this Box to invite people.")
            }
        }
    }

    @ViewBuilder private var form: some View {
        PaldoraTextField("Their username", text: $model.inviteUsername, placeholder: "username", identifier: "invite-username")
            .textInputAutocapitalization(.never).autocorrectionDisabled()
        PaldoraButton("Send invitation", size: .medium, fullWidth: true) { Task { await model.invite() } }
            .disabled(model.isWorking || model.inviteUsername.isEmpty)
            .accessibilityIdentifier("send-invitation")
        PaldoraEyebrow("Pending invitations")
        if model.invitations.items.isEmpty {
            Text("No invitations waiting.").paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
        }
        ForEach(model.invitations.items) { InvitationRow(model: model, invitation: $0) }
    }
}

struct InvitationRow: View {
    let model: BoxManagementViewModel
    let invitation: BoxInvitation

    var body: some View {
        PaldoraPersonRow(name: invitation.inviteeDisplayName ?? invitation.inviteeUsername ?? "Member",
                         subtitle: invitation.inviteeUsername.map { "@\($0)" }) {
            PaldoraButton("Revoke", kind: .ghost, size: .small, destructive: true) { Task { await model.revoke(invitation) } }
                .accessibilityIdentifier("revoke-invitation")
        }
        .accessibilityElement(children: .contain).accessibilityIdentifier("pending-invitation")
    }
}

struct RenameSection: View {
    @Bindable var model: BoxManagementViewModel

    var body: some View {
        manageSection("Name and status") {
            PaldoraTextField("Box name", text: $model.renameText, placeholder: "Box name", identifier: "rename-field")
            PaldoraButton("Rename", size: .medium, fullWidth: true) { Task { await model.rename() } }
                .disabled(!model.canRename).accessibilityIdentifier("rename-submit")
            PaldoraListGroup {
                PaldoraListRow(title: model.isArchived ? "Restore this Box" : "Archive this Box",
                               subtitle: model.isArchived ? nil : "Read-only for everyone; can be restored",
                               icon: .archive, trailing: .none) {
                    Task { await model.setArchived(!model.isArchived) }
                }
                .accessibilityIdentifier("archive-toggle")
            }
        }
    }
}

struct LeaveSection: View {
    let model: BoxManagementViewModel
    @Environment(PaldoraDialogCenter.self) private var dialogs

    var body: some View {
        manageSection("Leave") {
            if BoxRules.canLeave(model.role) {
                PaldoraButton("Leave this Box", kind: .secondary, size: .medium, fullWidth: true, destructive: true) {
                    dialogs.present(icon: .logout, title: "Leave this Box?", message: "You'll need a new invitation to come back.",
                                    confirmTitle: "Leave") { Task { await model.leave() } }
                }
                .accessibilityIdentifier("leave-box")
            } else {
                PaldoraBanner(tone: .info, title: BoxManagementViewModel.ownerMustTransfer)
                    .accessibilityIdentifier("leave-blocked")
                PaldoraButton("Leave this Box", kind: .secondary, size: .medium, fullWidth: true, destructive: true) {
                    Task { await model.leave() }
                }
                .accessibilityIdentifier("leave-box-owner")
            }
        }
    }
}

struct DeleteSection: View {
    @Bindable var model: BoxManagementViewModel
    @Environment(PaldoraDialogCenter.self) private var dialogs

    var body: some View {
        manageSection("Delete this Box", "Permanently removes the Box for everyone. This can't be undone; consider archiving instead.") {
            PaldoraTextField("Type \u{201C}\(model.box.name)\u{201D} to confirm", text: $model.typedName,
                             placeholder: "Box name", identifier: "delete-name")
                .autocorrectionDisabled().textInputAutocapitalization(.never)
            PaldoraToggle("I understand this can't be undone and everyone loses access.", isOn: $model.acknowledged)
                .accessibilityIdentifier("delete-ack")
            PaldoraButton("Delete this Box forever", kind: .danger, size: .medium, isLoading: model.isWorking, fullWidth: true) {
                dialogs.present(icon: .trash, title: "Delete \(model.box.name) forever?",
                                message: "Everything inside is erased for everyone.", confirmTitle: "Delete forever") {
                    Task { await model.deleteBox() }
                }
            }
            .disabled(!model.canDeleteNow)
            .accessibilityIdentifier("delete-box")
        }
    }
}
