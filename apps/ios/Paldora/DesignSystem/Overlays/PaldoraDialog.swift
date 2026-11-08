import PaldoraKit
import SwiftUI

/// Figma "Overlays / Dialog": a canvas card (radius 28, Lift) over a 50% inverse
/// scrim with an ember-soft icon disc, a Title/L heading, one or two plain sentences,
/// a Danger (or Primary) button and a Ghost cancel.
struct PaldoraDialogCard: View {
    let icon: PaldoraIcon
    let title: String
    let message: String
    let confirmTitle: String
    var isDestructive = true
    let onConfirm: () -> Void
    let onCancel: () -> Void

    static var radius: CGFloat { PaldoraTokens.radiusXl }
    static var maxWidth: CGFloat { 354 }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            PaldoraIconView(icon, size: 24)
                .foregroundStyle(isDestructive ? Theme.statusDanger : Theme.textPrimary)
                .frame(width: 52, height: 52)
                .background(isDestructive ? Theme.emberSoft : Theme.bgSunken, in: Circle())
            Text(title).paldoraText(.titleL).foregroundStyle(Theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(message).paldoraText(.ui14).foregroundStyle(Theme.textSecondary)
            PaldoraButton(confirmTitle, kind: isDestructive ? .danger : .primary, size: .medium,
                          fullWidth: true, action: onConfirm)
            PaldoraButton("Cancel", kind: .ghost, size: .medium, fullWidth: true, action: onCancel)
        }
        .padding(Theme.space6)
        .frame(maxWidth: Self.maxWidth, alignment: .leading)
        .background(Theme.bgCanvas, in: RoundedRectangle(cornerRadius: Self.radius))
        .paldoraElevation(.lift)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

private struct PaldoraDialogModifier: ViewModifier {
    @Binding var isPresented: Bool
    let card: () -> PaldoraDialogCard

    func body(content: Content) -> some View {
        ZStack {
            content.accessibilityHidden(isPresented)
            if isPresented {
                Theme.bgInverse.opacity(0.5).ignoresSafeArea()
                    .onTapGesture { isPresented = false }
                    .accessibilityHidden(true)
                    .transition(.opacity)
                card()
                    .padding(Theme.space5)
                    .transition(.opacity)
                    .accessibilityAction(.escape) { isPresented = false }
                    .zIndex(1)
            }
        }
        .paldoraAnimation(value: isPresented)
    }
}

extension View {
    /// Presents a Paldora dialog over a scrim. Present one overlay at a time.
    func paldoraDialog(isPresented: Binding<Bool>, card: @escaping () -> PaldoraDialogCard) -> some View {
        modifier(PaldoraDialogModifier(isPresented: isPresented, card: card))
    }
}

#Preview("Dialog") {
    ZStack {
        Theme.bgInverse.opacity(0.5)
        PaldoraDialogCard(icon: .ban, title: "Block Leah?", message: "Explain the consequence in one or two plain sentences.",
                          confirmTitle: "Block", onConfirm: {}, onCancel: {})
    }
}

// MARK: - App-wide presenter

/// One dialog at a time for the whole app. Screens call `present(...)` from anywhere
/// (a row, a menu) and the host at the root draws `PaldoraDialogCard` over the scrim,
/// so a dialog is never clipped to a scroll view. Sheets that need a confirmation
/// use `.paldoraDialog` locally.
@Observable
final class PaldoraDialogCenter {
    struct Config {
        var icon: PaldoraIcon
        var title: String
        var message: String
        var confirmTitle: String
        var isDestructive = true
        var onConfirm: () -> Void
    }

    var current: Config?
    var isPresented: Bool {
        get { current != nil }
        set { if !newValue { current = nil } }
    }

    func present(icon: PaldoraIcon = .alert, title: String, message: String, confirmTitle: String,
                 isDestructive: Bool = true, onConfirm: @escaping () -> Void) {
        current = Config(icon: icon, title: title, message: message, confirmTitle: confirmTitle,
                         isDestructive: isDestructive, onConfirm: onConfirm)
    }

    func dismiss() { current = nil }
}

extension View {
    /// Installs the app-wide dialog host. Place it once near the root and inject the center.
    func paldoraDialogHost(_ center: PaldoraDialogCenter) -> some View {
        paldoraDialog(isPresented: Binding(get: { center.isPresented }, set: { center.isPresented = $0 })) {
            let config = center.current
            return PaldoraDialogCard(
                icon: config?.icon ?? .alert, title: config?.title ?? "", message: config?.message ?? "",
                confirmTitle: config?.confirmTitle ?? "OK", isDestructive: config?.isDestructive ?? true,
                onConfirm: {
                    let action = config?.onConfirm
                    center.dismiss()
                    action?()
                },
                onCancel: { center.dismiss() })
        }
        .environment(center)
    }
}
