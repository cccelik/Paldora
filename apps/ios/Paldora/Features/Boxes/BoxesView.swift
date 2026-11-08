import PaldoraKit
import SwiftUI

struct BoxRoute: Hashable {
    let boxId: String
}

struct BoxesView: View {
    let env: FeatureEnvironment
    @State private var model: BoxesViewModel
    @State private var showCreate = false
    @State private var seenVersion = 0

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: BoxesViewModel(env: env))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                content
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .paldoraCanvas()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: BoxRoute.self) { BoxDetailView(env: env, route: $0) }
            .navigationDestination(for: BoxManageRoute.self) { BoxManageView(env: env, box: $0.box) }
            .navigationDestination(for: PostRoute.self) { PostDetailView(env: env, route: $0) }
            .roomRoutes(env: env)
            .sheet(isPresented: $showCreate) { CreateBoxSheet(model: model) }
        }
        .task { await model.load(); seenVersion = env.contentVersion }
        .onAppear {
            // Boxes may have been renamed, archived, deleted or left from a detail screen.
            guard seenVersion != env.contentVersion else { return }
            seenVersion = env.contentVersion
            Task { await model.refresh() }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            let count = model.boxes.items.count
            PaldoraScreenTitle(eyebrow: count > 0 ? "\(count) private \(count == 1 ? "circle" : "circles")" : "Private circles",
                               title: "Your Boxes",
                               subtitle: "Each Box is a small, closed room. Only its members ever see what's inside.")
            PaldoraIconButton(icon: .plus, label: "Create a Box", style: .primary) { showCreate = true }
                .accessibilityIdentifier("create-box")
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(.horizontal, Theme.gutter)
        .padding(.bottom, Theme.space3)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var content: some View {
        switch model.boxes.phase {
        case .idle, .loading: ScrollView { LoadingBlock(label: "Loading your Boxes").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await model.refresh() }
        case .unavailable: UnavailableBlock()
        case .loaded: list
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: Theme.space4) {
                if let error = model.actionError { PaldoraBanner(tone: .danger, title: error) }
                if !model.invitations.items.isEmpty { InvitationsSection(model: model) }
                if model.boxes.items.isEmpty {
                    PaldoraStateView(icon: .box, title: "A Box is a small, private circle.",
                                     message: "Family, flatmates, the Sunday table. Only members can see what's inside, never the public.") {
                        PaldoraButton("Make your first Box", size: .medium, fullWidth: true) { showCreate = true }
                            .padding(.top, Theme.space2)
                    }
                }
                ForEach(model.boxes.items) { box in
                    NavigationLink(value: BoxRoute(boxId: box.id)) { boxCard(box) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("box-row")
                }
                LoadMoreFooter(isLoading: model.boxes.isLoadingMore, error: model.boxes.inlineError,
                               hasMore: model.boxes.hasMore, loadMore: { await model.boxes.loadMore() })
            }
            .frame(maxWidth: Theme.readingWidth)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.refresh() }
    }

    private func boxCard(_ box: Box) -> some View {
        PaldoraBoxCard(content: .init(
            name: box.name,
            subtitle: Formatting.countLabel(box.memberCount, singular: "member", plural: "members")
                + (box.status == .archived ? " · archived" : ""))) {
            Theme.brassSoft.overlay { PaldoraIconView(.box, size: 32).foregroundStyle(Theme.brassText) }
        }
    }
}

/// Figma 3.1 / 3.6: invitations at the top of the list; declining is private.
struct InvitationsSection: View {
    let model: BoxesViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            ForEach(model.invitations.items) { invitation in
                VStack(alignment: .leading, spacing: Theme.space3) {
                    PaldoraPersonRow(name: invitation.boxName, subtitle: "\(invitation.inviterDisplayName) invited you")
                    HStack(spacing: Theme.space2) {
                        PaldoraButton("Join", size: .small) { Task { await model.accept(invitation) } }
                            .accessibilityIdentifier("accept-invitation")
                        PaldoraButton("Decline", kind: .ghost, size: .small) { Task { await model.decline(invitation) } }
                        Spacer(minLength: 0)
                    }
                    .disabled(model.busyInvitation == invitation.id)
                    Text("You'll only see moments shared after you join. Declining is private.")
                        .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.space3)
                .background(Theme.brassSoft, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
                .accessibilityElement(children: .contain)
            }
        }
    }
}

/// Figma 3.3 Create a Box (sheet). The API takes a name only today, so there is no
/// cover, description, colour or invite picker (those need new callables).
struct CreateBoxSheet: View {
    let model: BoxesViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var error: String?
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 0) {
            PaldoraNavBar(title: "New Box", leading: .close { dismiss() })
                .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space2)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space4) {
                    PaldoraScreenTitle(title: "Make a little room for your people.")
                    PaldoraTextField("Box name", text: $name, placeholder: "Name your Box",
                                     errorMessage: name.count > BoxesViewModel.nameLimit ? "Use \(BoxesViewModel.nameLimit) characters or fewer." : error,
                                     identifier: "box-name-field")
                    Text("\(name.count) of \(BoxesViewModel.nameLimit)").paldoraText(.caption)
                        .foregroundStyle(Theme.textSecondary)
                    PaldoraButton("Create Box", isLoading: isWorking, fullWidth: true, action: create)
                        .disabled(!canCreate)
                        .accessibilityIdentifier("create-box-submit")
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space5)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .paldoraCanvas()
    }

    private var canCreate: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isWorking && !trimmed.isEmpty && name.count <= BoxesViewModel.nameLimit
    }

    private func create() {
        isWorking = true
        Task {
            error = await model.createBox(name: name)
            isWorking = false
            if error == nil { dismiss() }
        }
    }
}
