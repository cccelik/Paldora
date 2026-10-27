import PaldoraKit
import SwiftUI

struct LifeUpdateDetailView: View {
    let env: FeatureEnvironment
    let route: LifeUpdateRoute
    @State private var model: LifeUpdateDetailViewModel
    @State private var showEditor = false
    @State private var confirmDelete = false
    @Environment(\.dismiss) private var dismiss

    init(env: FeatureEnvironment, route: LifeUpdateRoute) {
        self.env = env
        self.route = route
        _model = State(initialValue: LifeUpdateDetailViewModel(env: env, route: route))
    }

    var body: some View {
        content
            .background(Theme.canvas)
            .navigationTitle("Life Update")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { menu }
            .task { await model.load() }
            .sheet(isPresented: $showEditor, onDismiss: { Task { await model.load() } }) {
                if let update = model.update { NavigationStack { LifeUpdateEditorView(env: env, update: update) } }
            }
            .confirmationDialog("Delete this Life Update? It's removed from every Box it was shared to.",
                                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Life Update", role: .destructive) {
                    Task { if await model.delete() { dismiss() } }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: LoadingBlock(label: "Loading Life Update")
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let update): loaded(update)
        }
    }

    private func loaded(_ update: LifeUpdate) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                Text(Formatting.relativeTime(update.createdAt) + (update.updatedAt > update.createdAt ? " · edited" : ""))
                    .font(Typography.caption).foregroundStyle(Theme.textMuted)
                if model.isOnlyMe {
                    Label("Only me", systemImage: "lock").font(Typography.label).foregroundStyle(Theme.goldText)
                        .accessibilityIdentifier("only-me-badge")
                }
                VStack(alignment: .leading, spacing: Theme.space3) {
                    ForEach(LifeUpdateSectionKey.canonical, id: \.rawValue) { key in
                        if let text = update.sections.values[key] {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(LifeUpdateForm.label(key)).font(Typography.label).foregroundStyle(Theme.goldText)
                                Text(text).font(Typography.body).foregroundStyle(Theme.text)
                            }
                        }
                    }
                    PhotoStrip(assetIds: update.mediaAssetIds)
                }
                .paldoraCard()
                .accessibilityIdentifier("life-update-content")
                discussion
                if let error = model.deleteError { InlineMessage(text: error) }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(Theme.space4)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.load() }
    }

    /// Per-Box delivery contexts, alphabetical. Only Me has none and hides interactions.
    @ViewBuilder private var discussion: some View {
        if model.isOnlyMe {
            Text("Only you can see this, so there are no comments or reactions.")
                .font(Typography.callout).foregroundStyle(Theme.textMuted)
        } else if !model.contexts.isEmpty {
            VStack(alignment: .leading, spacing: Theme.space2) {
                Text("Shared to").font(Typography.headline).foregroundStyle(Theme.text)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.space2) {
                        ForEach(model.contexts, id: \.postId) { context in
                            let selected = model.selectedContext?.postId == context.postId
                            Button(context.boxName) { model.selectedPostId = context.postId }
                                .font(Typography.label)
                                .foregroundStyle(selected ? Theme.onInk : Theme.text)
                                .padding(.horizontal, Theme.space3)
                                .frame(minHeight: Theme.touchTarget)
                                .background(selected ? Theme.ink : Theme.surface, in: Capsule())
                                .accessibilityAddTraits(selected ? .isSelected : [])
                                .accessibilityIdentifier("context-tab")
                        }
                    }
                }
                if let context = model.selectedContext {
                    NavigationLink(value: PostRoute(boxId: context.boxId, postId: context.postId)) {
                        Label(context.canInteract ? "Open the conversation in \(context.boxName)" : "View in \(context.boxName)",
                              systemImage: "bubble.left.and.bubble.right")
                            .font(Typography.label).foregroundStyle(Theme.goldText)
                            .frame(minHeight: Theme.touchTarget, alignment: .leading)
                    }
                    .accessibilityIdentifier("open-conversation")
                }
            }
        }
    }

    @ToolbarContentBuilder private var menu: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if model.update?.canEdit == true {
                Menu {
                    Button("Edit", systemImage: "pencil") { showEditor = true }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmDelete = true }
                } label: { Image(systemName: "ellipsis.circle").frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget) }
                .accessibilityLabel("Life Update actions")
                .accessibilityIdentifier("life-update-actions")
            }
        }
    }
}
