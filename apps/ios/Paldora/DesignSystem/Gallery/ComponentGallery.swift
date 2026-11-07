#if DEBUG
import SwiftUI

/// DEBUG-only catalogue of every design-system component and variant. Launch the app
/// with `-PALDORA_GALLERY` (compiled out of Release). Follows the system appearance and
/// text size, so run it with `-AppleInterfaceStyle Dark` or
/// `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityL`, or use
/// the Appearance and Text size controls at the top of any section to override.
struct ComponentGallery: View {
    enum Section: String, CaseIterable, Identifiable {
        case buttons = "Buttons", inputs = "Inputs", controls = "Controls", lists = "Lists"
        case feedback = "Feedback", navigation = "Navigation", avatars = "Avatars"
        case cards = "Cards", threads = "Threads", overlays = "Overlays"
        var id: String { rawValue }
    }

    enum SchemeOverride: String, CaseIterable { case auto = "Auto", light = "Light", dark = "Dark" }
    enum SizeOverride: String, CaseIterable { case auto = "Auto", accessibility3 = "AX3" }

    static let launchArgument = "-PALDORA_GALLERY"
    static var isRequested: Bool { ProcessInfo.processInfo.arguments.contains(launchArgument) }

    /// `-PALDORA_GALLERY_SECTION inputs` opens that section; `-PALDORA_GALLERY_BLOCK "Post card"`
    /// scrolls to a block. Both exist for screenshots and tests.
    static var initialSection: Section {
        let name = UserDefaults.standard.string(forKey: "PALDORA_GALLERY_SECTION")?.lowercased()
        return Section.allCases.first { $0.rawValue.lowercased() == name } ?? .buttons
    }
    static var initialBlock: String? { UserDefaults.standard.string(forKey: "PALDORA_GALLERY_BLOCK") }

    @State private var section = ComponentGallery.initialSection
    @State private var scheme = SchemeOverride.auto
    @State private var size = SizeOverride.auto
    @State private var showDialog = false
    @Environment(\.dynamicTypeSize) private var systemSize

    var body: some View {
        VStack(spacing: 0) {
            sectionBar
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.space6) {
                        overrides
                        content
                    }
                    .padding(.horizontal, Theme.gutter)
                    .padding(.vertical, Theme.space4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .task {
                    guard let block = Self.initialBlock else { return }
                    try? await Task.sleep(for: .milliseconds(400))
                    proxy.scrollTo(block, anchor: .top)
                }
            }
        }
        .background(Theme.bgCanvas.ignoresSafeArea())
        .preferredColorScheme(scheme == .light ? .light : scheme == .dark ? .dark : nil)
        .environment(\.dynamicTypeSize, size == .accessibility3 ? .accessibility3 : systemSize)
        .paldoraDialog(isPresented: $showDialog) {
            PaldoraDialogCard(icon: .ban, title: "Block Leah?",
                              message: "Explain the consequence in one or two plain sentences.",
                              confirmTitle: "Block", onConfirm: { showDialog = false }, onCancel: { showDialog = false })
        }
        .accessibilityIdentifier("component-gallery")
    }

    /// A menu rather than a row of chips: every section stays reachable at any text size.
    private var sectionBar: some View {
        Menu {
            ForEach(Section.allCases) { item in
                Button(item.rawValue) { section = item }
                    .accessibilityIdentifier("gallery-section-\(item.rawValue.lowercased())")
            }
        } label: {
            Text("Section: \(section.rawValue)")
        }
        .buttonStyle(PaldoraButtonStyle(kind: .secondary, size: .medium, fullWidth: true))
        .padding(.horizontal, Theme.gutter)
        .padding(.vertical, Theme.space1)
        .accessibilityIdentifier("gallery-section-menu")
    }

    private var overrides: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraEyebrow("Appearance")
            PaldoraSegmentedControl(SchemeOverride.allCases.map { .init($0, $0.rawValue) }, selection: $scheme)
            PaldoraEyebrow("Text size")
            PaldoraSegmentedControl(SizeOverride.allCases.map { .init($0, $0.rawValue) }, selection: $size)
        }
    }

    @ViewBuilder private var content: some View {
        switch section {
        case .buttons: GalleryButtons()
        case .inputs: GalleryInputs()
        case .controls: GalleryControls()
        case .lists: GalleryLists()
        case .feedback: GalleryFeedback()
        case .navigation: GalleryNavigation()
        case .avatars: GalleryAvatars()
        case .cards: GalleryCards()
        case .threads: GalleryThreads()
        case .overlays: GalleryOverlays(showDialog: $showDialog)
        }
    }
}

#Preview("Component gallery") { ComponentGallery() }
#endif
