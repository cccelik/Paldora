import PaldoraKit
import SwiftUI
import Testing
@testable import Paldora

/// Non-visual logic of the design-system components (Figma "02 · Components").
@MainActor
struct DesignSystemTests {
    // MARK: Button state mapping

    @Test func buttonKindsMapToFigmaFillsAndContent() {
        typealias A = PaldoraButtonAppearance
        #expect(A.resolve(kind: .primary) == A(fill: .primary, content: .onPrimary, hasBorder: false, opacity: 1))
        #expect(A.resolve(kind: .secondary) == A(fill: .surface, content: .text, hasBorder: true, opacity: 1))
        #expect(A.resolve(kind: .accent).fill == .brass)
        #expect(A.resolve(kind: .accent).content == .onBrass)
        #expect(A.resolve(kind: .ghost).fill == .none)
        #expect(A.resolve(kind: .danger).fill == .danger)
    }

    @Test func disabledIsFortyPercentAndPressedDims() {
        for kind in PaldoraButtonKind.allCases {
            #expect(PaldoraButtonAppearance.resolve(kind: kind, isEnabled: false).opacity == 0.4)
            #expect(PaldoraButtonAppearance.resolve(kind: kind, isPressed: true).opacity == 0.85)
        }
        #expect(PaldoraButtonAppearance.resolve(kind: .ghost, destructive: true).content == .danger)
    }

    @Test func buttonSizesMatchFigma() {
        #expect(PaldoraButtonSize.allCases.map(\.height) == [56, 48, 36])
        #expect(PaldoraButtonSize.small.horizontalPadding == 14)
        #expect(PaldoraButtonSize.large.horizontalPadding == 22)
        #expect(PaldoraIconButtonSize.medium.diameter == 40)
        #expect(PaldoraIconButtonSize.large.diameter == 52)
    }

    // MARK: Chip, field, segmented

    @Test func chipSelectionTogglesBetweenDefaultAndSelected() {
        #expect(PaldoraChipStyle.forSelection(true) == .selected)
        #expect(PaldoraChipStyle.forSelection(false) == .standard)
        #expect(PaldoraChipStyle.allCases.filter(\.hasBorder) == [.standard])
    }

    @Test func fieldStateErrorBeatsFocus() {
        #expect(PaldoraFieldState.resolve(isFocused: false, errorMessage: nil) == .normal)
        #expect(PaldoraFieldState.resolve(isFocused: true, errorMessage: nil) == .focused)
        #expect(PaldoraFieldState.resolve(isFocused: true, errorMessage: "Taken") == .error)
        #expect(PaldoraFieldState.resolve(isFocused: false, errorMessage: "") == .normal)
        #expect(PaldoraFieldState.normal.borderWidth == 1)
        #expect(PaldoraFieldState.focused.borderWidth == 1.5)
        #expect(PaldoraFieldState.error.borderWidth == 1.5)
    }

    @Test func segmentedSelectionAndCounts() {
        typealias Control = PaldoraSegmentedControl<String>
        let options: [Control.Option] = [.init("a", "A"), .init("b", "B"), .init("c", "C")]
        #expect(Control.selectedIndex(of: "b", in: options) == 1)
        #expect(Control.selectedIndex(of: "z", in: options) == nil)
        #expect(Control.supportedCounts == 2...4)
    }

    // MARK: Tone, avatar, tab bar, hit target

    @Test func toneIconsAndSpokenPrefixes() {
        #expect(PaldoraTone.allCases.count == 4)
        #expect(PaldoraTone.danger.spokenPrefix == "Error")
        #expect(PaldoraTone.warning.spokenPrefix == "Warning")
        #expect(PaldoraTone.success.spokenPrefix == "Success")
        #expect(PaldoraTone.info.spokenPrefix == nil)
        #expect(PaldoraTone.success.icon == .check)
        let banner = PaldoraBanner(tone: .danger, title: "Photo failed", message: "Try again.")
        #expect(banner.spokenText == "Error. Photo failed. Try again.")
    }

    @Test func toastAnnouncements() {
        let action = PaldoraToast(kind: .action(message: "Saved.", actionTitle: "View", onAction: {}))
        #expect(action.announcement == "Saved.")
        let note = PaldoraToast(kind: .notification(title: "Leah reacted", subtitle: "Sunday Supper · now"))
        #expect(note.announcement == "Leah reacted. Sunday Supper · now")
    }

    @Test func avatarInitialsAndSizes() {
        #expect(PaldoraAvatar.initials("Mira Rose") == "MR")
        #expect(PaldoraAvatar.initials("kai") == "K")
        #expect(PaldoraAvatar.initials("") == "P")
        #expect(PaldoraAvatar.initials("a b c") == "AB")
        #expect(PaldoraAvatar.initials("Jonah Weiss", maxLetters: 1) == "J")
        #expect(PaldoraAvatarSize.allCases.map(\.rawValue) == [28, 40, 56, 104])
        #expect(PaldoraAvatar.initialsSize(forDiameter: 28) == 12)
        #expect(PaldoraAvatar.initialsSize(forDiameter: 104) == 45)
    }

    @Test func tabBarOrderAndSelection() {
        #expect(PaldoraTab.allCases.map(\.title) == ["Home", "Boxes", "My Room", "Notifications", "Profile"])
        #expect(PaldoraTab.notifications.visibleTitle == "Activity")
        #expect(PaldoraTab.allCases.map(\.icon) == [.home, .box, .room, .bell, .user])
        #expect(PaldoraTab.selection(current: .home, tapped: .boxes) == .boxes)
        #expect(PaldoraTab.selection(current: .boxes, tapped: .boxes) == .boxes)
    }

    @Test func minimumHitTargetIsFortyFour() {
        #expect(PaldoraHitTarget.minimum == 44)
        #expect(PaldoraHitTarget.side(for: 36) == 44)
        #expect(PaldoraHitTarget.side(for: 40) == 44)
        #expect(PaldoraHitTarget.side(for: 52) == 52)
    }

    // MARK: Icons, upload, list rows

    @Test func everyIconHasASymbolOrACustomShape() {
        #expect(PaldoraIcon.allCases.count == 54)
        for icon in PaldoraIcon.allCases where icon.systemName == nil {
            #expect([PaldoraIcon.spark, .flame].contains(icon))
        }
        for icon in PaldoraIcon.allCases {
            if let name = icon.systemName { #expect(UIImage(systemName: name) != nil, "\(icon) has no SF Symbol \(name)") }
        }
        for icon in PaldoraIcon.allCases {
            if let name = icon.filledSystemName { #expect(UIImage(systemName: name) != nil, "\(icon) has no filled SF Symbol \(name)") }
        }
        for tab in PaldoraTab.allCases { #expect(tab.icon.filledSystemName != nil, "\(tab) needs a filled selected icon") }
        #expect(PaldoraIconView.stroke(isActive: false) == 1.6)
        #expect(PaldoraIconView.stroke(isActive: true) == 1.8)
    }

    @Test func uploadStateLabelsAndPercent() {
        #expect(PaldoraUploadState.percent(0.64) == 64)
        #expect(PaldoraUploadState.percent(2) == 100)
        #expect(PaldoraUploadState.percent(-1) == 0)
        #expect(PaldoraUploadState.uploading(progress: 0.5).spokenLabel == "Uploading, 50 percent")
        #expect(PaldoraUploadState.failed.spokenLabel.contains("retry"))
    }

    @Test func listRowHeights() {
        #expect(PaldoraListRow.height(hasSubtitle: false) == 54)
        #expect(PaldoraListRow.height(hasSubtitle: true) == 62)
    }

    @Test func cardSpokenText() {
        let box = PaldoraBoxCard(content: .init(name: "Sunday Supper", subtitle: "11 members", newCount: 3)) { EmptyView() }
        #expect(box.spokenText == "Sunday Supper, 11 members, 3 new")
        let row = PaldoraNotificationRow(content: .init(actorName: "Leah", message: "loved your photo.", timeLabel: "12 min", isUnread: true))
        #expect(row.spokenText == "Unread. Leah loved your photo. 12 min")
    }
}
