#if DEBUG
import SwiftUI

struct GalleryButtons: View {
    var body: some View {
        GalleryBlock(title: "Button", node: "43:98") {
            ForEach(PaldoraButtonKind.allCases, id: \.self) { kind in
                VStack(alignment: .leading, spacing: Theme.space2) {
                    FlowLayout {
                        ForEach(PaldoraButtonSize.allCases, id: \.self) { size in
                            PaldoraButton("Continue", kind: kind, size: size) {}
                        }
                    }
                    FlowLayout {
                        ForEach(PaldoraButtonSize.allCases, id: \.self) { size in
                            PaldoraButton("Continue", kind: kind, size: size) {}.disabled(true)
                        }
                    }
                }
            }
            PaldoraButton("Saving", kind: .primary, isLoading: true, fullWidth: true) {}
        }
        GalleryBlock(title: "Icon button", node: "43:125") {
            FlowLayout {
                PaldoraIconButton(icon: .more, label: "More") {}
                PaldoraIconButton(icon: .plus, label: "Create", style: .primary) {}
                PaldoraIconButton(icon: .close, label: "Close", style: .plain) {}
                PaldoraIconButton(icon: .camera, label: "Camera", size: .large) {}
                PaldoraIconButton(icon: .send, label: "Send", style: .primary, size: .large) {}
                PaldoraIconButton(icon: .back, label: "Back", style: .plain, size: .large) {}
            }
        }
        GalleryBlock(title: "Icons", node: "42:389") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: Theme.space3) {
                ForEach(PaldoraIcon.allCases, id: \.self) { icon in
                    PaldoraIconView(icon, size: 24).foregroundStyle(Theme.textPrimary)
                }
            }
        }
    }
}

struct GalleryInputs: View {
    @State private var email = "Alice Moreau"
    @State private var username = "alice"
    @State private var invite = ""
    @State private var focused = "Alice Moreau"

    var body: some View {
        GalleryBlock(title: "Text field", node: "43:189") {
            PaldoraTextField("Name", text: $email, identifier: "gallery-name")
            PaldoraFieldContainer(title: "Focus (forced)", isFocused: true) { Text(focused) }
            PaldoraTextField("Username", text: $username, errorMessage: "That name is taken.")
            PaldoraTextField("Invite link", text: $invite, placeholder: "paldora.app/i/…")
        }
        GalleryBlock(title: "Chip", node: "43:146") {
            FlowLayout {
                PaldoraChip(title: "Sunday Supper", leading: .dot(Theme.brass))
                PaldoraChip(title: "All circles", style: .selected)
                PaldoraChip(title: "3 new", style: .accent)
                PaldoraChip(title: "Only me", style: .soft, leading: .icon(.lock))
                PaldoraChip(title: "Owner", style: .brass)
            }
        }
    }
}

struct GalleryControls: View {
    @State private var on = true
    @State private var off = false
    @State private var radio = 0
    @State private var checked = true
    @State private var unchecked = false
    @State private var two = "Moments"
    @State private var three = "Moments"
    @State private var four = "Moments"

    var body: some View {
        GalleryBlock(title: "Toggle", node: "43:198") {
            PaldoraToggle("Notifications", isOn: $on)
            PaldoraToggle("Sounds", isOn: $off)
        }
        GalleryBlock(title: "Radio", node: "43:205") {
            PaldoraRadio(title: "Selected", isSelected: radio == 0) { radio = 0 }
            PaldoraRadio(title: "Not selected", isSelected: radio == 1) { radio = 1 }
        }
        GalleryBlock(title: "Checkbox", node: "43:214") {
            PaldoraCheckbox("Checked", isOn: $checked)
            PaldoraCheckbox("Unchecked", isOn: $unchecked)
        }
        GalleryBlock(title: "Segmented control", node: "43:377") {
            PaldoraSegmentedControl([.init("Moments", "Moments"), .init("Memories", "Memories")], selection: $two)
            PaldoraSegmentedControl([.init("Moments", "Moments"), .init("Memories", "Memories"),
                                     .init("Members", "Members")], selection: $three)
            PaldoraSegmentedControl([.init("Moments", "Moments"), .init("Memories", "Memories"),
                                     .init("Members", "Members"), .init("Settings", "Settings")], selection: $four)
        }
    }
}

struct GalleryLists: View {
    @State private var toggle = true

    var body: some View {
        GalleryBlock(title: "List row", node: "43:347") {
            PaldoraListGroup {
                PaldoraListRow(title: "Row label", icon: .gear) {}
                PaldoraListDivider()
                PaldoraListRow(title: "Row label", subtitle: "With a subtitle", icon: .gear) {}
                PaldoraListDivider()
                PaldoraListRow(title: "Row label", icon: .gear, trailing: .toggle($toggle))
                PaldoraListDivider()
                PaldoraListRow(title: "Row label", icon: .gear, trailing: .radio(isSelected: true)) {}
                PaldoraListDivider()
                PaldoraListRow(title: "Row label", icon: .gear, trailing: .value("Admins")) {}
                PaldoraListDivider()
                PaldoraListRow(title: "Delete Box", icon: .trash, trailing: .none, isDestructive: true) {}
            }
        }
    }
}
#endif
