import PaldoraKit
import SwiftUI

/// Visual state of a field. An error wins over focus (Figma: danger 1.5 pt).
enum PaldoraFieldState: Equatable {
    case normal, focused, error

    static func resolve(isFocused: Bool, errorMessage: String?) -> PaldoraFieldState {
        if let errorMessage, !errorMessage.isEmpty { return .error }
        return isFocused ? .focused : .normal
    }

    /// Focus and error use the 1.5 pt border; resting fields use the hairline.
    var borderWidth: CGFloat {
        self == .normal ? PaldoraTokens.borderWidthHairline : PaldoraTokens.borderWidthFocus
    }

    var borderColor: Color {
        switch self {
        case .normal: Theme.borderHairline
        case .focused: Theme.brass
        case .error: Theme.statusDanger
        }
    }
}

/// Eyebrow label + 54 pt input surface + optional error message. Wrap any input
/// (`TextField`, `SecureField`, a picker row). `PaldoraTextField` builds on it.
struct PaldoraFieldContainer<Content: View>: View {
    let title: String
    var isFocused = false
    var errorMessage: String?
    /// False when the input carries the label itself (`PaldoraTextField`), so VoiceOver does not read it twice.
    var labelIsAccessible = true
    @ViewBuilder var content: Content

    private static var inputHeight: CGFloat { 54 }

    var body: some View {
        let state = PaldoraFieldState.resolve(isFocused: isFocused, errorMessage: errorMessage)
        VStack(alignment: .leading, spacing: Theme.space2) {
            // The Figma label is text/muted (3.3:1); small text uses text/secondary.
            PaldoraEyebrow(title).accessibilityHidden(!labelIsAccessible)
            content
                .paldoraText(.ui16)
                .foregroundStyle(Theme.textPrimary)
                .padding(.horizontal, Theme.space4)
                .frame(maxWidth: .infinity, minHeight: Self.inputHeight, alignment: .leading)
                .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radius))
                .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radius), color: state.borderColor, width: state.borderWidth)
                .paldoraAnimation(PaldoraTokens.durationFast, value: state)
            if let errorMessage, !errorMessage.isEmpty { PaldoraFieldMessage(text: errorMessage, isError: true) }
        }
    }
}

/// The 12 pt message under a field: an icon and text, so meaning never relies on
/// color alone. Error is danger, success is status/success.
struct PaldoraFieldMessage: View {
    let text: String
    var isError = true

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            PaldoraIconView(isError ? .alert : .check, size: 14)
            Text(text).paldoraText(.ui12Medium)
        }
        .foregroundStyle(isError ? Theme.statusDanger : Theme.statusSuccess)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Figma "Text field": Default, Focus (brass 1.5 pt), Error (danger 1.5 pt +
/// message) and Placeholder. Pass keyboard and content-type modifiers on the
/// field itself; they reach the inner input through the environment.
struct PaldoraTextField: View {
    let title: String
    @Binding var text: String
    var placeholder = ""
    var errorMessage: String?
    var isSecure = false
    var identifier: String?
    @FocusState private var focused: Bool

    init(_ title: String, text: Binding<String>, placeholder: String = "", errorMessage: String? = nil,
         isSecure: Bool = false, identifier: String? = nil) {
        self.title = title
        self._text = text
        self.placeholder = placeholder
        self.errorMessage = errorMessage
        self.isSecure = isSecure
        self.identifier = identifier
    }

    var body: some View {
        PaldoraFieldContainer(title: title, isFocused: focused, errorMessage: errorMessage, labelIsAccessible: false) {
            input
                .focused($focused)
                .accessibilityLabel(title)
                .accessibilityHint(errorMessage ?? "")
                .accessibilityIdentifier(identifier ?? "")
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }

    @ViewBuilder private var input: some View {
        let prompt = Text(placeholder).foregroundStyle(Theme.textTertiary)
        if isSecure {
            SecureField(title, text: $text, prompt: prompt)
        } else {
            TextField(title, text: $text, prompt: prompt)
        }
    }
}

#Preview("Text fields") {
    struct Demo: View {
        @State var email = "alice@moreau.studio"
        @State var name = "alice"
        @State var link = ""
        var body: some View {
            VStack(spacing: Theme.space4) {
                PaldoraTextField("Email", text: $email)
                PaldoraTextField("Username", text: $name, errorMessage: "That name is taken.")
                PaldoraTextField("Invite link", text: $link, placeholder: "paldora.app/i/…")
            }
            .padding(Theme.space5)
            .background(Theme.bgCanvas)
        }
    }
    return Demo()
}
