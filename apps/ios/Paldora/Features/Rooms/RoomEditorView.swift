import PaldoraKit
import SwiftUI

struct RoomEditorView: View {
    let env: FeatureEnvironment
    @State private var model: RoomEditorViewModel

    init(env: FeatureEnvironment) {
        self.env = env
        _model = State(initialValue: RoomEditorViewModel(env: env))
    }

    var body: some View {
        content
            .paldoraCanvas()
            .paldoraNavBar("Customize room")
            .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: ScrollView { LoadingBlock(label: "Loading your Room").padding(Theme.gutter) }
        case .failed(let message): ErrorBlock(message: message) { await model.load() }
        case .ready:
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space6) {
                    if model.isStale { staleBanner }
                    preview
                    appearance
                    about
                    audience
                    banner
                    RoomWidgetsEditor(model: model)
                    RoomTopFriendsEditor(model: model)
                    saveBar
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.space8)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    /// Shown on `STALE_WRITE`: another device or tab saved first.
    private var staleBanner: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraBanner(tone: .warning, title: "This Room changed somewhere else",
                          message: "Reload to see the latest version, then make your changes again.")
            PaldoraButton("Reload latest", size: .medium, fullWidth: true) { Task { await model.reloadAfterStale() } }
                .accessibilityIdentifier("reload-room")
        }
        .accessibilityIdentifier("stale-write")
    }

    private var preview: some View {
        let look = RoomAppearance(themePreset: model.themePreset, accent: model.accent, font: model.font,
                                  decorationPack: model.decorationPack, sparkles: model.sparkles)
        return VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraEyebrow("Preview")
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(RoomRegistry.themeLabel(model.themePreset)).font(look.font(.title3, weight: .semibold)).foregroundStyle(look.text)
                    Spacer()
                    RoomDecoration(appearance: look)
                }
                Text("A box for your people.").font(look.font(.body)).foregroundStyle(look.muted)
                RoundedRectangle(cornerRadius: 2).fill(look.accentColor).frame(width: 48, height: 4)
                    .accessibilityLabel("Accent color sample")
            }
            .padding(Theme.space4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(look.canvas, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(look.border.opacity(0.6), lineWidth: 1))
            .environment(\.colorScheme, look.colorScheme)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Preview of \(RoomRegistry.themeLabel(model.themePreset))")
        }
    }

    private var appearance: some View {
        section("Appearance") {
            PaldoraListGroup {
                choice("Theme", icon: .palette, id: "room-theme", selection: $model.themePreset,
                       options: PaldoraKit.RoomCatalog.themePresets.map { ($0, RoomRegistry.themeLabel($0)) })
                PaldoraListDivider()
                choice("Layout", icon: .layout, id: "room-layout", selection: $model.layout,
                       options: RoomCatalog.layouts.map { ($0, RoomRegistry.label(RoomRegistry.layoutLabels, $0)) })
                PaldoraListDivider()
                optionalChoice("Accent", icon: .palette, selection: $model.accent, defaultLabel: "Theme default",
                               options: RoomCatalog.accents.map { ($0, RoomRegistry.label(RoomRegistry.accentLabels, $0)) })
                PaldoraListDivider()
                optionalChoice("Font", icon: .type, selection: $model.font, defaultLabel: "Editorial serif",
                               options: RoomCatalog.fonts.map { ($0, RoomRegistry.label(RoomRegistry.fontLabels, $0)) })
                PaldoraListDivider()
                optionalChoice("Decoration", icon: .spark, selection: $model.decorationPack, defaultLabel: "Theme default",
                               options: RoomCatalog.decorationPacks.map { ($0, RoomRegistry.label(RoomRegistry.decorationLabels, $0)) })
                PaldoraListDivider()
                PaldoraListRow(title: "Sparkles", icon: .spark, trailing: .toggle($model.sparkles))
            }
        }
    }

    private var about: some View {
        section("About") {
            PaldoraTextField("Location", text: $model.location, placeholder: "Where are you?", identifier: "room-location")
            PaldoraFieldContainer(title: "Currently") {
                TextField("What are you up to?", text: $model.currently, prompt: Text("What are you up to?").foregroundStyle(Theme.textTertiary), axis: .vertical).lineLimit(1...4)
                    .padding(.vertical, Theme.space3).accessibilityIdentifier("room-currently")
            }
            PaldoraTextField("Music link (https)", text: $model.musicURL, placeholder: "https://",
                             errorMessage: model.musicIsValid ? nil : "Use a public https:// link.", identifier: "room-music-url")
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            PaldoraTextField("Song title", text: $model.musicTitle, placeholder: "Optional")
            PaldoraTextField("Artist", text: $model.musicArtist, placeholder: "Optional")
            Text("Music appears as a link card. It never plays on its own.").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
        }
    }

    private var audience: some View {
        section("Who can visit") {
            PaldoraListGroup {
                choice("Visibility", icon: .eye, id: "room-visibility", selection: $model.visibility,
                       options: RoomCatalog.visibilities.map { ($0, RoomRegistry.label(RoomRegistry.visibilityLabels, $0)) })
            }
            Text(RoomRegistry.label(RoomRegistry.visibilityNotes, model.visibility)).paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            PaldoraBanner(tone: .info, title: "Changes apply instantly",
                          message: "Someone who leaves a Box loses access that same moment unless they're also your friend.")
        }
    }

    private var banner: some View {
        section("Banner") {
            if let id = model.effectiveBanner {
                RemoteImage(assetId: id, variant: .display).frame(height: 120).frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                PaldoraButton("Remove banner", kind: .ghost, size: .small, destructive: true) { model.removeBanner() }
            }
            PhotoAttachmentsView(attachments: model.bannerUpload, title: "Choose a banner", showsCount: false)
        }
    }

    private var saveBar: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let error = model.error { PaldoraBanner(tone: .danger, title: error) }
            if model.savedAt != nil { PaldoraBanner(tone: .success, title: "Room saved.").accessibilityIdentifier("room-saved") }
            PaldoraButton("Save Room", isLoading: model.isSaving, fullWidth: true) { Task { await model.save() } }
                .disabled(!model.canSave)
                .accessibilityIdentifier("save-room")
        }
    }

    // MARK: helpers

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text(title).paldoraText(.titleM).foregroundStyle(Theme.textPrimary).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func choice(_ title: String, icon: PaldoraIcon, id: String, selection: Binding<String>, options: [(String, String)]) -> some View {
        PaldoraChoiceRow(title: title, icon: icon, options: options.map { .init($0.0, $0.1) }, selection: selection)
            .accessibilityIdentifier(id)
    }

    private func optionalChoice(_ title: String, icon: PaldoraIcon, selection: Binding<String?>, defaultLabel: String,
                                options: [(String, String)]) -> some View {
        PaldoraChoiceRow(title: title, icon: icon,
                         options: [.init(String?.none, defaultLabel)] + options.map { .init(Optional($0.0), $0.1) },
                         selection: selection)
    }
}
