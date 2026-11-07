import PaldoraKit
import SwiftUI

/// The five top-level destinations, in Figma order.
enum PaldoraTab: String, CaseIterable, Hashable {
    case home, boxes, myRoom, notifications, profile

    var title: String {
        switch self {
        case .home: "Home"
        case .boxes: "Boxes"
        case .myRoom: "My Room"
        case .notifications: "Notifications"
        case .profile: "Profile"
        }
    }

    /// The label drawn under the icon (Figma calls the fourth tab "Activity"); VoiceOver
    /// and tests use `title`.
    var visibleTitle: String { self == .notifications ? "Activity" : title }

    var icon: PaldoraIcon {
        switch self {
        case .home: .home
        case .boxes: .box
        case .myRoom: .room
        case .notifications: .bell
        case .profile: .user
        }
    }

    /// Selecting a tab that is already active is a no-op for the selection (the host
    /// may scroll to top); selecting another changes it.
    static func selection(current: PaldoraTab, tapped: PaldoraTab) -> PaldoraTab { tapped == current ? current : tapped }
}

/// Figma "Tab Bar v2": a floating solid pill (370 x 64, bg/inverse, Lift), no glass.
/// The active tab is a nav/active pill. Used by every top-level screen.
struct PaldoraTabBar: View {
    @Binding var selection: PaldoraTab
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Unread count per tab (shown as a spoken value and an ember dot).
    var badges: [PaldoraTab: Int] = [:]

    private static var radius: CGFloat { 32 }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(PaldoraTab.allCases, id: \.self) { tab in
                item(tab)
            }
        }
        .padding(6)
        .frame(maxWidth: PaldoraTokens.layoutTabBarWidth, minHeight: PaldoraTokens.layoutTabBarHeight)
        .background(Theme.bgInverse, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraElevation(.lift)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tabs")
    }

    private func item(_ tab: PaldoraTab) -> some View {
        let isActive = tab == selection
        let badge = badges[tab] ?? 0
        return Button {
            selection = PaldoraTab.selection(current: selection, tapped: tab)
        } label: {
            VStack(spacing: 3) {
                PaldoraIconView(tab.icon, size: 21, isActive: isActive)
                    .overlay(alignment: .topTrailing) {
                        if badge > 0 {
                            Circle().fill(Theme.ember).frame(width: 8, height: 8).offset(x: 4, y: -2)
                        }
                    }
                // At accessibility sizes the labels would not fit a five-tab bar: icons only
                // (the spoken label stays), as the system tab bar does.
                if !typeSize.isAccessibilitySize {
                    Text(tab.visibleTitle).paldoraText(.tabLabel).lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .foregroundStyle(isActive ? Theme.navOnActive : Theme.textOnInverse)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background { if isActive { Capsule().fill(Theme.navActive) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .paldoraAnimation(PaldoraTokens.durationFast, value: isActive)
        .accessibilityLabel(tab.title)
        .accessibilityValue(badge > 0 ? "\(badge) unread" : "")
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .accessibilityIdentifier("tab-\(tab.rawValue)")
    }
}

#Preview("Tab bar") {
    struct Demo: View {
        @State var tab = PaldoraTab.home
        var body: some View {
            PaldoraTabBar(selection: $tab, badges: [.notifications: 3])
                .padding(Theme.space5)
                .background(Theme.bgCanvas)
        }
    }
    return Demo()
}
