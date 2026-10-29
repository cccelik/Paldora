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
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.space4) {
                FieldContainer(title: prompt) {
                    TextField(prompt, text: $text, prompt: Text(prompt).foregroundStyle(Theme.textMuted), axis: .vertical)
                        .lineLimit(4...10)
                        .padding(.vertical, Theme.space2)
                        .accessibilityIdentifier("sheet-text-field")
                }
                Text("\(text.count) of \(limit)").font(Typography.caption)
                    .foregroundStyle(text.count > limit ? Theme.danger : Theme.textMuted)
                if let error { InlineMessage(text: error) }
                Button(action: send) { if isWorking { ProgressView() } else { Text(actionTitle) } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canSubmit)
                    .accessibilityIdentifier("sheet-submit")
                Spacer()
            }
            .padding(Theme.space6)
            .background(Theme.canvas)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
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
