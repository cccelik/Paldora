import PaldoraKit
import SwiftUI

/// What sits at the trailing edge of a Figma "List row".
enum PaldoraListRowTrailing {
    case none
    case chevron
    case value(String)
    case radio(isSelected: Bool)
    case toggle(Binding<Bool>)
}

/// Figma "List row": a 34 pt icon tile, a title (and optional subtitle) and a
/// trailing element. 54 pt tall, 62 pt with a subtitle. Place rows in a
/// `PaldoraListGroup`. A row with an `action` is a button; toggle rows toggle.
struct PaldoraListRow: View {
    let title: String
    var subtitle: String?
    var icon: PaldoraIcon?
    var trailing: PaldoraListRowTrailing = .chevron
    var isDestructive = false
    var action: (() -> Void)?

    static func height(hasSubtitle: Bool) -> CGFloat { hasSubtitle ? 62 : 54 }

    var body: some View {
        switch trailing {
        case .toggle(let isOn):
            Toggle(isOn: isOn) { leading }.toggleStyle(PaldoraToggleStyle())
                .accessibilityLabel([title, subtitle].compactMap { $0 }.joined(separator: ", "))
                .frame(minHeight: Self.height(hasSubtitle: subtitle != nil))
        default:
            if let action {
                Button(action: action) { row }
                    .buttonStyle(PaldoraPressableStyle())
                    .accessibilityAddTraits(isSelectedRadio ? .isSelected : [])
            } else {
                row
            }
        }
    }

    private var isSelectedRadio: Bool {
        if case .radio(let selected) = trailing { return selected }
        return false
    }

    private var row: some View {
        HStack(spacing: Theme.space3) {
            leading
            Spacer(minLength: Theme.space2)
            trailingView
        }
        .frame(minHeight: Self.height(hasSubtitle: subtitle != nil))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var leading: some View {
        HStack(spacing: Theme.space3) {
            if let icon {
                PaldoraIconView(icon, size: 18)
                    .foregroundStyle(isDestructive ? Theme.statusDanger : Theme.textPrimary)
                    .frame(width: 34, height: 34)
                    .background(isDestructive ? Theme.emberSoft : Theme.bgSunken,
                                in: RoundedRectangle(cornerRadius: 12))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(title).paldoraText(.bodyM)
                    .foregroundStyle(isDestructive ? Theme.statusDanger : Theme.textPrimary)
                if let subtitle {
                    Text(subtitle).paldoraText(.bodyS).foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private var trailingView: some View {
        switch trailing {
        case .none, .toggle:
            EmptyView()
        case .chevron:
            PaldoraIconView(.chev, size: 16).foregroundStyle(Theme.textTertiary)
        case .value(let value):
            HStack(spacing: Theme.space2) {
                Text(value).paldoraText(.ui14).foregroundStyle(Theme.textSecondary)
                PaldoraIconView(.chev, size: 16).foregroundStyle(Theme.textTertiary)
            }
        case .radio(let isSelected):
            PaldoraRadioIndicator(isSelected: isSelected)
        }
    }
}

/// The surface that holds rows: radius 22, hairline border. Put a `PaldoraListDivider`
/// between rows.
struct PaldoraListGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .padding(.horizontal, Theme.space4)
            .padding(.vertical, Theme.space1)
            .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Self.radius))
            .paldoraHairline(RoundedRectangle(cornerRadius: Self.radius))
    }

    static var radius: CGFloat { 22 }
}

/// A 1 pt hairline between rows.
struct PaldoraListDivider: View {
    var body: some View {
        Rectangle().fill(Theme.borderHairline).frame(height: PaldoraTokens.borderWidthHairline)
            .accessibilityHidden(true)
    }
}

#Preview("List rows") {
    PaldoraListGroup {
        PaldoraListRow(title: "Settings", icon: .gear) {}
        PaldoraListDivider()
        PaldoraListRow(title: "Role", icon: .gear, trailing: .value("Admins")) {}
        PaldoraListDivider()
        PaldoraListRow(title: "Notifications", icon: .bell, trailing: .toggle(.constant(true)))
        PaldoraListDivider()
        PaldoraListRow(title: "Delete Box", icon: .trash, trailing: .none, isDestructive: true) {}
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
