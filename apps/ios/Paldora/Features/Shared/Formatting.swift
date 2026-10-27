import Foundation
import PaldoraKit

enum Formatting {
    static func relativeTime(_ time: EpochMillis, now: Date = Date()) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: min(time.date, now), relativeTo: now)
    }

    static func sectionTitle(_ key: LifeUpdateSectionKey) -> String {
        switch key {
        case .lifeLately: "Life lately"
        case .workOrUniversity: "Work or university"
        case .travel: "Travel"
        case .currentlyInto: "Currently into"
        case .listeningTo: "Listening to"
        case .watching: "Watching"
        case .reading: "Reading"
        case .excitedAbout: "Excited about"
        case .whatsNext: "What's next"
        default: "Update"
        }
    }

    static func countLabel(_ count: Int, singular: String, plural: String) -> String {
        "\(count) \(count == 1 ? singular : plural)"
    }
}

enum EmojiValidation {
    /// Advisory only; the server is the authority. One grapheme with an emoji scalar.
    static func isSingleEmoji(_ text: String) -> Bool {
        guard text.count == 1, let first = text.first else { return false }
        return first.unicodeScalars.contains { $0.properties.isEmojiPresentation || ($0.properties.isEmoji && $0.value > 0x238C) }
    }
}
