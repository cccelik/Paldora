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
            content
                .background(Theme.canvas)
                .navigationTitle("Boxes")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showCreate = true } label: {
                            Image(systemName: "plus").frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                        }
                        .accessibilityLabel("Create a Box")
                        .accessibilityIdentifier("create-box")
                    }
                }
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

    @ViewBuilder private var content: some View {
        switch model.boxes.phase {
        case .idle, .loading: LoadingBlock(label: "Loading your Boxes")
        case .failed(let message): ErrorBlock(message: message) { await model.refresh() }
        case .unavailable: UnavailableBlock()
        case .loaded: list
        }
    }

    private var list: some View {
        List {
            if let error = model.actionError { InlineMessage(text: error).listRowBackground(Theme.canvas) }
            if !model.invitations.items.isEmpty { InvitationsSection(model: model) }
            Section {
                if model.boxes.items.isEmpty {
                    EmptyBlock(title: "No Boxes yet",
                               message: "Create a Box for your people, or accept an invitation.")
                        .listRowBackground(Theme.canvas)
                }
                ForEach(model.boxes.items) { box in
                    NavigationLink(value: BoxRoute(boxId: box.id)) { boxRow(box) }
                        .listRowBackground(Theme.surface)
                        .accessibilityIdentifier("box-row")
                }
                LoadMoreFooter(isLoading: model.boxes.isLoadingMore, error: model.boxes.inlineError,
                               hasMore: model.boxes.hasMore, loadMore: { await model.boxes.loadMore() })
                    .listRowBackground(Theme.canvas)
            } header: {
                SectionHeader("Your Boxes")
            }
        }
        .scrollContentBackground(.hidden)
        .refreshable { await model.refresh() }
    }

    private func boxRow(_ box: Box) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(box.name).font(Typography.headline).foregroundStyle(Theme.text)
            Text(Formatting.countLabel(box.memberCount, singular: "member", plural: "members")
                 + (box.status == .archived ? " · archived" : ""))
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
        .frame(minHeight: Theme.touchTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct InvitationsSection: View {
    let model: BoxesViewModel

    var body: some View {
        Section {
            ForEach(model.invitations.items) { invitation in
                VStack(alignment: .leading, spacing: Theme.space2) {
                    Text(invitation.boxName).font(Typography.headline).foregroundStyle(Theme.text)
                    Text("From \(invitation.inviterDisplayName)").font(Typography.caption)
                        .foregroundStyle(Theme.textMuted)
                    FlowLayout {
                        Button("Accept") { Task { await model.accept(invitation) } }
                            .buttonStyle(QuietButtonStyle())
                            .accessibilityIdentifier("accept-invitation")
                        Button("Decline") { Task { await model.decline(invitation) } }
                            .buttonStyle(QuietButtonStyle(destructive: true))
                    }
                    .disabled(model.busyInvitation == invitation.id)
                }
                .accessibilityElement(children: .contain)
                .listRowBackground(Theme.surface)
            }
        } header: {
            SectionHeader("Invitations")
        }
    }
}

struct CreateBoxSheet: View {
    let model: BoxesViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var error: String?
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.space4) {
                FieldContainer(title: "Box name") {
                    TextField("Name your Box", text: $name, prompt: Text("Name your Box").foregroundStyle(Theme.textMuted))
                        .accessibilityIdentifier("box-name-field")
                }
                Text("\(name.count) of \(BoxesViewModel.nameLimit)").font(Typography.caption)
                    .foregroundStyle(name.count > BoxesViewModel.nameLimit ? Theme.danger : Theme.textMuted)
                if let error { InlineMessage(text: error) }
                Button(action: create) { if isWorking { ProgressView() } else { Text("Create Box") } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canCreate)
                    .accessibilityIdentifier("create-box-submit")
                Spacer()
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle("New Box")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
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
