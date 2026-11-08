import PaldoraKit
import SwiftUI
import UIKit

/// Screen chrome shared by every pushed or presented screen (Figma "Nav bar" plus
/// the large Display title below it). The system navigation bar is hidden and
/// `PaldoraNavBar` drawn in its place; the edge-swipe back gesture is kept.
/// Tracks which pushed or presented screens are on top, so the floating tab bar can
/// step aside (Figma shows it only on the five top-level screens).
@Observable
final class PaldoraChrome {
    private var covering: Set<UUID> = []
    var isTabBarHidden: Bool { !covering.isEmpty }
    func cover(_ id: UUID) { covering.insert(id) }
    func uncover(_ id: UUID) { covering.remove(id) }
}

private struct PaldoraNavBarModifier: ViewModifier {
    let title: String
    let isModal: Bool
    let trailing: PaldoraNavBar.Trailing
    @Environment(\.dismiss) private var dismiss
    @Environment(PaldoraChrome.self) private var chrome: PaldoraChrome?
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { chrome?.cover(token) }
            .onDisappear { chrome?.uncover(token) }
            .toolbar(.hidden, for: .navigationBar)
            .background(PaldoraSwipeBackEnabler())
            .safeAreaInset(edge: .top, spacing: 0) {
                PaldoraNavBar(title: title, leading: isModal ? .close { dismiss() } : .back { dismiss() }, trailing: trailing)
                    .padding(.horizontal, Theme.gutter)
                    .padding(.vertical, Theme.space2)
                    .background(Theme.bgCanvas)
            }
    }
}

extension View {
    /// Replaces the system navigation bar with `PaldoraNavBar`. `isModal` draws Close
    /// instead of Back (sheets, full-screen flows). The canvas shows through.
    func paldoraNavBar(_ title: String, isModal: Bool = false,
                       trailing: PaldoraNavBar.Trailing = .none) -> some View {
        modifier(PaldoraNavBarModifier(title: title, isModal: isModal, trailing: trailing))
    }

    /// The canvas background every screen sits on.
    func paldoraCanvas() -> some View {
        background(Theme.bgCanvas.ignoresSafeArea())
    }
}

/// With the system bar hidden UIKit disables the interactive pop gesture; this puts it back.
private struct PaldoraSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            navigationController?.interactivePopGestureRecognizer?.delegate = self
            navigationController?.interactivePopGestureRecognizer?.isEnabled = true
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            (navigationController?.viewControllers.count ?? 0) > 1
        }
    }
}

/// An optional eyebrow, a Display/M title (the last lines may be set in the italic
/// accent) and a Body/L subtitle: the heading block of Figma's form and flow screens.
struct PaldoraScreenTitle: View {
    var eyebrow: String?
    let title: String
    var accent: String?
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            if let eyebrow { PaldoraEyebrow(eyebrow, color: Theme.brassText) }
            Group {
                if let accent {
                    Text(title).foregroundStyle(Theme.textPrimary) + Text(" ") + Text(accent).foregroundStyle(Theme.brassText)
                } else {
                    Text(title).foregroundStyle(Theme.textPrimary)
                }
            }
            .paldoraText(.displayM)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle).paldoraText(.bodyL).foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Empty, error, inaccessible, deleted and status screens: an icon medallion, a
/// Title/L heading, a plain sentence and up to two actions (Primary, Ghost).
struct PaldoraStateView<Actions: View>: View {
    let icon: PaldoraIcon
    var tone: PaldoraTone = .info
    let title: String
    let message: String
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(spacing: Theme.space3) {
            PaldoraIconView(icon, size: 26)
                .foregroundStyle(tone.iconColor)
                .frame(width: 64, height: 64)
                .background(tone == .danger ? Theme.emberSoft : (tone == .success ? Theme.sageSoft : Theme.brassSoft), in: Circle())
                .accessibilityHidden(true)
            Text(title).paldoraText(.titleL).foregroundStyle(Theme.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text(message).paldoraText(.bodyM).foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
            actions
        }
        .frame(maxWidth: Theme.readingWidth)
        .padding(.horizontal, Theme.space5)
        .padding(.vertical, Theme.space8)
        .frame(maxWidth: .infinity)
    }
}

extension PaldoraStateView where Actions == EmptyView {
    init(icon: PaldoraIcon, tone: PaldoraTone = .info, title: String, message: String) {
        self.init(icon: icon, tone: tone, title: title, message: message, actions: { EmptyView() })
    }
}

/// Rows of skeleton cards for list loading states (never a spinner).
struct PaldoraListSkeleton: View {
    var count = 3

    var body: some View {
        VStack(spacing: Theme.space4) {
            ForEach(0..<count, id: \.self) { _ in PaldoraPostSkeleton() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
        .accessibilityIdentifier("loading")
    }
}

/// A short skeleton for compact rows (people, settings, notifications).
struct PaldoraRowSkeleton: View {
    var count = 4

    var body: some View {
        VStack(spacing: Theme.space3) {
            ForEach(0..<count, id: \.self) { _ in
                HStack(spacing: Theme.space3) {
                    PaldoraSkeleton(width: 40, height: 40, radius: 20)
                    VStack(alignment: .leading, spacing: 6) {
                        PaldoraSkeleton(width: 140, height: 10)
                        PaldoraSkeleton(width: 90, height: 8, radius: 4)
                    }
                    Spacer(minLength: 0)
                }
                .padding(Theme.space3)
                .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: 18))
                .paldoraHairline(RoundedRectangle(cornerRadius: 18))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
        .accessibilityIdentifier("loading")
    }
}

/// Host for the shared timed toast (Figma "Toast / Action"): bottom, inverse, for the
/// person's own actions. Setting `message` shows it for a few seconds and announces it.
private struct PaldoraToastModifier: ViewModifier {
    @Binding var message: String?
    @State private var shown: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let shown {
                    PaldoraToast(kind: .action(message: shown, actionTitle: nil, onAction: {}))
                        .padding(.horizontal, Theme.gutter)
                        .padding(.bottom, Theme.space4)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .accessibilityIdentifier("toast")
                        .allowsHitTesting(false)
                }
            }
            .paldoraAnimation(value: shown)
            .task(id: message) {
                guard let message else { return }
                shown = message
                UIAccessibility.post(notification: .announcement, argument: message)
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled {
                    shown = nil
                    self.message = nil
                }
            }
    }
}

extension View {
    func paldoraToast(_ message: Binding<String?>) -> some View {
        modifier(PaldoraToastModifier(message: message))
    }
}
