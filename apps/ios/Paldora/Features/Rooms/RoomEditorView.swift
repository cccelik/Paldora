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
            .background(Theme.canvas)
            .navigationTitle("Customize Room")
            .navigationBarTitleDisplayMode(.inline)
            .task { await model.load() }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading: LoadingBlock(label: "Loading your Room")
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
                .padding(Theme.space4)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    /// Shown on `STALE_WRITE`: another device or tab saved first.
    private var staleBanner: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            InlineMessage(text: "This Room changed somewhere else. Reload to see the latest version, then make your changes again.")
            Button("Reload latest") { Task { await model.reloadAfterStale() } }
                .buttonStyle(PrimaryButtonStyle()).accessibilityIdentifier("reload-room")
        }
        .paldoraCard()
        .accessibilityIdentifier("stale-write")
    }

    private var preview: some View {
        let look = RoomAppearance(themePreset: model.themePreset, accent: model.accent, font: model.font,
                                  decorationPack: model.decorationPack, sparkles: model.sparkles)
        return VStack(alignment: .leading, spacing: Theme.space2) {
            Text("Preview").font(Typography.label).foregroundStyle(Theme.textMuted)
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
            picker("Theme", id: "room-theme", selection: $model.themePreset,
                   options: PaldoraKit.RoomCatalog.themePresets.map { ($0, RoomRegistry.themeLabel($0)) })
            picker("Layout", id: "room-layout", selection: $model.layout,
                   options: RoomCatalog.layouts.map { ($0, RoomRegistry.label(RoomRegistry.layoutLabels, $0)) })
            optionalPicker("Accent", selection: $model.accent, defaultLabel: "Theme default",
                           options: RoomCatalog.accents.map { ($0, RoomRegistry.label(RoomRegistry.accentLabels, $0)) })
            optionalPicker("Font", selection: $model.font, defaultLabel: "Editorial serif",
                           options: RoomCatalog.fonts.map { ($0, RoomRegistry.label(RoomRegistry.fontLabels, $0)) })
            optionalPicker("Decoration", selection: $model.decorationPack, defaultLabel: "Theme default",
                           options: RoomCatalog.decorationPacks.map { ($0, RoomRegistry.label(RoomRegistry.decorationLabels, $0)) })
            Toggle("Sparkles", isOn: $model.sparkles).frame(minHeight: Theme.touchTarget)
        }
    }

    private var about: some View {
        section("About") {
            FieldContainer(title: "Location") {
                TextField("Where are you?", text: $model.location, prompt: Text("Where are you?").foregroundStyle(Theme.textMuted)).accessibilityIdentifier("room-location")
            }
            FieldContainer(title: "Currently") {
                TextField("What are you up to?", text: $model.currently, prompt: Text("What are you up to?").foregroundStyle(Theme.textMuted), axis: .vertical).lineLimit(1...4)
                    .padding(.vertical, Theme.space2).accessibilityIdentifier("room-currently")
            }
            FieldContainer(title: "Music link (https)") {
                TextField("https://", text: $model.musicURL, prompt: Text("https://").foregroundStyle(Theme.textMuted)).keyboardType(.URL)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .accessibilityIdentifier("room-music-url")
            }
            if !model.musicIsValid { InlineMessage(text: "Use a public https:// link.") }
            FieldContainer(title: "Song title") { TextField("Optional", text: $model.musicTitle, prompt: Text("Optional").foregroundStyle(Theme.textMuted)) }
            FieldContainer(title: "Artist") { TextField("Optional", text: $model.musicArtist, prompt: Text("Optional").foregroundStyle(Theme.textMuted)) }
            Text("Music appears as a link card. It never plays on its own.").font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
    }

    private var audience: some View {
        section("Who can visit") {
            picker("Visibility", id: "room-visibility", selection: $model.visibility,
                   options: RoomCatalog.visibilities.map { ($0, RoomRegistry.label(RoomRegistry.visibilityLabels, $0)) })
            Text(RoomRegistry.label(RoomRegistry.visibilityNotes, model.visibility)).font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
    }

    private var banner: some View {
        section("Banner") {
            if let id = model.effectiveBanner {
                RemoteImage(assetId: id, variant: .display).frame(height: 120).frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                Button("Remove banner") { model.removeBanner() }.buttonStyle(QuietButtonStyle(destructive: true))
            }
            PhotoAttachmentsView(attachments: model.bannerUpload, title: "Choose a banner", showsCount: false)
        }
    }

    private var saveBar: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let error = model.error { InlineMessage(text: error) }
            if model.savedAt != nil { InlineMessage(text: "Room saved.", kind: .success).accessibilityIdentifier("room-saved") }
            Button { Task { await model.save() } } label: {
                if model.isSaving { ProgressView() } else { Text("Save Room") }
            }
            .buttonStyle(PrimaryButtonStyle()).disabled(!model.canSave)
            .accessibilityIdentifier("save-room")
        }
    }

    // MARK: helpers

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text(title).font(Typography.title).foregroundStyle(Theme.text).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func picker(_ title: String, id: String, selection: Binding<String>, options: [(String, String)]) -> some View {
        Picker(title, selection: selection) { ForEach(options, id: \.0) { Text($0.1).tag($0.0) } }
            .pickerStyle(.menu).frame(minHeight: Theme.touchTarget).accessibilityIdentifier(id)
    }

    private func optionalPicker(_ title: String, selection: Binding<String?>, defaultLabel: String, options: [(String, String)]) -> some View {
        Picker(title, selection: selection) {
            Text(defaultLabel).tag(String?.none)
            ForEach(options, id: \.0) { Text($0.1).tag(Optional($0.0)) }
        }
        .pickerStyle(.menu).frame(minHeight: Theme.touchTarget)
    }
}
