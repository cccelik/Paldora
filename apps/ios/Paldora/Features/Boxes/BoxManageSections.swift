import PaldoraKit
import SwiftUI

// Each section is its own small view: one giant body produced enormous generic
// types that made SwiftUI's debug runtime crawl.

private func manageSection<C: View>(_ title: String, _ note: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
    VStack(alignment: .leading, spacing: Theme.space3) {
        Text(title).font(Typography.title).foregroundStyle(Theme.text).accessibilityAddTraits(.isHeader)
        if let note { Text(note).font(Typography.callout).foregroundStyle(Theme.textMuted) }
        content()
    }
}

struct ManageMessages: View {
    let model: BoxManagementViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let notice = model.notice { InlineMessage(text: notice, kind: .success).accessibilityIdentifier("manage-notice") }
            if let error = model.error { InlineMessage(text: error).accessibilityIdentifier("manage-error") }
        }
    }
}

struct InviteSection: View {
    @Bindable var model: BoxManagementViewModel

    var body: some View {
        manageSection("Invite people", "Invite anyone by username. They don't need to be your friend, and invitations expire after 7 days.") {
            if model.canInvite { form } else {
                Text("Restore this Box to invite people.").font(Typography.callout).foregroundStyle(Theme.textMuted)
            }
        }
    }

    @ViewBuilder private var form: some View {
        FieldContainer(title: "Their username") {
            TextField("username", text: $model.inviteUsername, prompt: Text("username").foregroundStyle(Theme.textMuted)).textInputAutocapitalization(.never)
                .autocorrectionDisabled().accessibilityIdentifier("invite-username")
        }
        Button("Send invitation") { Task { await model.invite() } }
            .buttonStyle(PrimaryButtonStyle()).disabled(model.isWorking || model.inviteUsername.isEmpty)
            .accessibilityIdentifier("send-invitation")
        Text("Pending invitations").font(Typography.label).foregroundStyle(Theme.textMuted)
        if model.invitations.items.isEmpty {
            Text("No invitations waiting.").font(Typography.callout).foregroundStyle(Theme.textMuted)
        }
        ForEach(model.invitations.items) { InvitationRow(model: model, invitation: $0) }
    }
}

struct InvitationRow: View {
    let model: BoxManagementViewModel
    let invitation: BoxInvitation

    var body: some View {
        AdaptiveStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(invitation.inviteeDisplayName ?? invitation.inviteeUsername ?? "Member").font(Typography.headline)
                if let username = invitation.inviteeUsername {
                    Text("@\(username)").font(Typography.caption).foregroundStyle(Theme.textMuted)
                }
            }
            Spacer()
            Button("Revoke") { Task { await model.revoke(invitation) } }
                .buttonStyle(QuietButtonStyle(destructive: true)).accessibilityIdentifier("revoke-invitation")
        }
        .paldoraCard().accessibilityElement(children: .contain).accessibilityIdentifier("pending-invitation")
    }
}

struct RenameSection: View {
    @Bindable var model: BoxManagementViewModel

    var body: some View {
        manageSection("Name and status") {
            FieldContainer(title: "Box name") {
                TextField("Box name", text: $model.renameText, prompt: Text("Box name").foregroundStyle(Theme.textMuted)).accessibilityIdentifier("rename-field")
            }
            Button("Rename") { Task { await model.rename() } }
                .buttonStyle(PrimaryButtonStyle()).disabled(!model.canRename).accessibilityIdentifier("rename-submit")
            Button(model.isArchived ? "Restore this Box" : "Archive this Box") {
                Task { await model.setArchived(!model.isArchived) }
            }
            .buttonStyle(QuietButtonStyle()).accessibilityIdentifier("archive-toggle")
        }
    }
}

struct LeaveSection: View {
    let model: BoxManagementViewModel
    @State private var confirm = false

    var body: some View {
        manageSection("Leave") {
            if BoxRules.canLeave(model.role) {
                Button("Leave this Box") { confirm = true }
                    .buttonStyle(QuietButtonStyle(destructive: true)).accessibilityIdentifier("leave-box")
            } else {
                Text(BoxManagementViewModel.ownerMustTransfer).font(Typography.callout).foregroundStyle(Theme.textMuted)
                    .accessibilityIdentifier("leave-blocked")
                Button("Leave this Box") { Task { await model.leave() } }
                    .buttonStyle(QuietButtonStyle(destructive: true)).accessibilityIdentifier("leave-box-owner")
            }
        }
        .confirmationDialog("Leave this Box? You'll need a new invitation to come back.",
                            isPresented: $confirm, titleVisibility: .visible) {
            Button("Yes, leave", role: .destructive) { Task { await model.leave() } }
        }
    }
}

struct DeleteSection: View {
    @Bindable var model: BoxManagementViewModel
    @State private var confirm = false

    var body: some View {
        manageSection("Delete this Box", "Permanently removes the Box for everyone.") {
            FieldContainer(title: "Type \u{201C}\(model.box.name)\u{201D} to confirm") {
                TextField("Box name", text: $model.typedName, prompt: Text("Box name").foregroundStyle(Theme.textMuted)).autocorrectionDisabled().textInputAutocapitalization(.never)
                    .accessibilityIdentifier("delete-name")
            }
            Toggle("I understand this can't be undone and everyone loses access.", isOn: $model.acknowledged)
                .font(Typography.callout).frame(minHeight: Theme.touchTarget).accessibilityIdentifier("delete-ack")
            Button(role: .destructive) { confirm = true } label: {
                if model.isWorking { ProgressView() } else { Text("Delete this Box forever") }
            }
            .buttonStyle(QuietButtonStyle(destructive: true)).disabled(!model.canDeleteNow)
            .accessibilityIdentifier("delete-box")
        }
        .confirmationDialog("Delete \(model.box.name) forever?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Delete this Box forever", role: .destructive) { Task { await model.deleteBox() } }
        }
    }
}
