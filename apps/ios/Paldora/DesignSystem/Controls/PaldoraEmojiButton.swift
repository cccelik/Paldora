import PaldoraKit
import SwiftUI

/// Figma "Reaction picker" cell: a 44 pt round emoji button; the selected one sits on
/// ember-soft with a brass ring (selection is also spoken, never colour alone).
struct PaldoraEmojiButton: View {
    let emoji: String
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(emoji).font(.title2)
                .frame(width: PaldoraHitTarget.minimum, height: PaldoraHitTarget.minimum)
                .background(isSelected ? Theme.emberSoft : Theme.bgSurface, in: Circle())
                .paldoraHairline(Circle(), color: isSelected ? Theme.brass : Theme.borderHairline,
                                 width: isSelected ? PaldoraTokens.borderWidthFocus : PaldoraTokens.borderWidthHairline)
                .paldoraFocusRing(Circle())
        }
        .buttonStyle(PaldoraPressableStyle())
        .accessibilityLabel("React with \(emoji)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview("Emoji buttons") {
    HStack {
        PaldoraEmojiButton(emoji: "👍", isSelected: true) {}
        PaldoraEmojiButton(emoji: "❤️") {}
        PaldoraEmojiButton(emoji: "😂") {}
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
