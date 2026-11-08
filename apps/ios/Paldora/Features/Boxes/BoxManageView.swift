import PaldoraKit
import SwiftUI

/// Everything a Box member can manage, shown as the web shows it: role-aware.
/// Navigates to Manage by value, so the screen is built only when it is opened.
struct BoxManageRoute: Hashable {
    let box: Box
    static func == (lhs: BoxManageRoute, rhs: BoxManageRoute) -> Bool { lhs.box.id == rhs.box.id }
    func hash(into hasher: inout Hasher) { hasher.combine(box.id) }
}

struct BoxManageView: View {
    @State private var model: BoxManagementViewModel
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, box: Box) {
        _model = State(initialValue: BoxManagementViewModel(env: env, box: box))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space6) {
                PaldoraScreenTitle(eyebrow: model.box.name, title: "Box settings",
                                   subtitle: "You're \(model.role == .owner ? "the owner" : (model.role == .admin ? "an admin" : "a member"))")
                ManageMessages(model: model)
                if BoxRules.canManageMembers(model.role) { InviteSection(model: model) }
                if BoxRules.canRenameOrArchive(model.role) { RenameSection(model: model) }
                LeaveSection(model: model)
                if BoxRules.canDelete(model.role) { DeleteSection(model: model) }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .paldoraCanvas()
        .paldoraNavBar("Manage Box")
        .task { await model.load() }
        .onChange(of: model.isGone) { if model.isGone { dismiss() } }
    }
}
