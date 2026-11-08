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

    @State private var showActions = false
    @Environment(PaldoraDialogCenter.self) private var dialogs

    var body: some View {
        content
            .paldoraCanvas()
            .paldoraNavBar("Life update", trailing: model.update?.canEdit == true ? .more { showActions = true } : .none)
            .task { await model.load() }
            .sheet(isPresented: $showEditor, onDismiss: { Task { await model.load() } }) {
                if let update = model.update { NavigationStack { LifeUpdateEditorView(env: env, update: update) } }
            }
            .paldoraBottomSheet(isPresented: $showActions, title: "Your life update") {
                PaldoraListGroup {
                    PaldoraListRow(title: "Edit", icon: .edit, trailing: .none) { showActions = false; showEditor = true }
                        .accessibilityIdentifier("life-update-edit")
                    PaldoraListDivider()
                    PaldoraListRow(title: "Delete", icon: .trash, trailing: .none, isDestructive: true) {
                        showActions = false
                        dialogs.present(icon: .trash, title: "Delete this Life Update?",
                                        message: "It's removed from every Box it was shared to.", confirmTitle: "Delete Life Update") {
                            Task { if await model.delete() { dismiss() } }
                        }
                    }
                    .accessibilityIdentifier("life-update-delete")
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: ScrollView { LoadingBlock(label: "Loading Life Update").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .unavailable: UnavailableBlock()
        case .loaded(let update): loaded(update)
        }
    }

    private func loaded(_ update: LifeUpdate) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space4) {
                if model.isOnlyMe {
                    PaldoraChip(title: "Only me", style: .soft, leading: .icon(.lock))
                        .accessibilityIdentifier("only-me-badge")
                }
                lifeUpdateHero(update)
                    .accessibilityIdentifier("life-update-content")
                discussion
                if let error = model.deleteError { PaldoraBanner(tone: .danger, title: error) }
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.load() }
    }

    /// The inverse hero: every section, then photos.
    private func lifeUpdateHero(_ update: LifeUpdate) -> some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            HStack(spacing: Theme.space2) {
                PaldoraIconView(.spark, size: 16).foregroundStyle(Theme.brass)
                PaldoraEyebrow("Life update", color: Theme.brass)
                Spacer(minLength: Theme.space2)
                Text(Formatting.relativeTime(update.createdAt) + (update.updatedAt > update.createdAt ? " · edited" : ""))
                    .paldoraText(.caption).foregroundStyle(Theme.textOnInverse)
            }
            ForEach(LifeUpdateSectionKey.canonical, id: \.rawValue) { key in
                if let text = update.sections.values[key] {
                    VStack(alignment: .leading, spacing: 4) {
                        PaldoraEyebrow(LifeUpdateForm.label(key), color: Theme.brass)
                        Text(text).paldoraText(.bodyL).foregroundStyle(Theme.textOnInverse)
                    }
                }
            }
            PhotoStrip(assetIds: update.mediaAssetIds)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(Theme.bgInverse, in: RoundedRectangle(cornerRadius: Theme.radiusXl))
        .paldoraElevation(.lift)
    }

    /// Per-Box delivery contexts, alphabetical. Only Me has none and hides interactions.
    @ViewBuilder private var discussion: some View {
        if model.isOnlyMe {
            PaldoraBanner(tone: .info, title: "Only you can see this", message: "So there are no comments or reactions.")
        } else if !model.contexts.isEmpty {
            VStack(alignment: .leading, spacing: Theme.space2) {
                PaldoraEyebrow("Shared to")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.space2) {
                        ForEach(model.contexts, id: \.postId) { context in
                            let selected = model.selectedContext?.postId == context.postId
                            PaldoraChip(title: context.boxName, style: .forSelection(selected)) { model.selectedPostId = context.postId }
                                .accessibilityAddTraits(selected ? .isSelected : [])
                                .accessibilityIdentifier("context-tab")
                        }
                    }
                }
                if let context = model.selectedContext {
                    NavigationLink(value: PostRoute(boxId: context.boxId, postId: context.postId)) {
                        PaldoraListRow(title: context.canInteract ? "Open the conversation in \(context.boxName)" : "View in \(context.boxName)",
                                       icon: .chat)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("open-conversation")
                }
            }
        }
    }
}
