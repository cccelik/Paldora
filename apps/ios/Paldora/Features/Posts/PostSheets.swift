import SwiftUI

/// A text entry sheet used for editing a post and for reporting one.
struct TextEntrySheet: View {
    let title: String
    let prompt: String
    let actionTitle: String
    let limit: Int
    let initialText: String
    let submit: (String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var error: String?
    @State private var isWorking = false

    var body: some View {
        VStack(spacing: 0) {
            PaldoraNavBar(title: title, leading: .close { dismiss() })
                .padding(.horizontal, Theme.gutter).padding(.vertical, Theme.space2)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.space4) {
                    PaldoraFieldContainer(title: prompt) {
                        TextField(prompt, text: $text, prompt: Text(prompt).foregroundStyle(Theme.textTertiary), axis: .vertical)
                            .lineLimit(4...10)
                            .padding(.vertical, Theme.space3)
                            .accessibilityIdentifier("sheet-text-field")
                    }
                    Text("\(text.count) of \(limit)").paldoraText(.caption)
                        .foregroundStyle(text.count > limit ? Theme.statusDanger : Theme.textSecondary)
                    if let error { PaldoraBanner(tone: .danger, title: error) }
                    PaldoraButton(actionTitle, isLoading: isWorking, fullWidth: true, action: send)
                        .disabled(!canSubmit)
                        .accessibilityIdentifier("sheet-submit")
                }
                .frame(maxWidth: Theme.readingWidth, alignment: .leading)
                .padding(Theme.space5)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .paldoraCanvas()
        .onAppear { text = initialText }
    }

    private var canSubmit: Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isWorking && !trimmed.isEmpty && text.count <= limit && trimmed != initialText
    }

    private func send() {
        isWorking = true
        Task {
            error = await submit(text)
            isWorking = false
            if error == nil { dismiss() }
        }
    }
}
