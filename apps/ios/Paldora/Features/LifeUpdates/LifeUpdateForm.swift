import Foundation
import Observation
import PaldoraKit

/// The structured sections shared by the composer and the editor. Limits mirror
/// `packages/domain` (2,000 per section, 10,000 total).
@MainActor
@Observable
final class LifeUpdateForm {
    static let sectionLimit = 2_000
    static let totalLimit = 10_000

    var sections: [LifeUpdateSectionKey: String] = [:]

    static func label(_ key: LifeUpdateSectionKey) -> String {
        key == .excitedAbout ? "Something I'm excited about" : Formatting.sectionTitle(key)
    }

    func text(_ key: LifeUpdateSectionKey) -> String { sections[key] ?? "" }

    func set(_ key: LifeUpdateSectionKey, _ value: String) { sections[key] = value }

    var total: Int { sections.values.reduce(0) { $0 + $1.count } }
    var overSection: Bool { sections.values.contains { $0.count > Self.sectionLimit } }
    var overTotal: Bool { total > Self.totalLimit }

    /// Trimmed, empty sections dropped, in canonical order (as the server stores them).
    var cleaned: LifeUpdateSections {
        var result: [LifeUpdateSectionKey: String] = [:]
        for key in LifeUpdateSectionKey.canonical {
            let trimmed = text(key).trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { result[key] = trimmed }
        }
        return LifeUpdateSections(result)
    }

    var hasText: Bool { !cleaned.values.isEmpty }
    var isWithinLimits: Bool { !overSection && !overTotal }

    func load(_ sections: LifeUpdateSections) { self.sections = sections.values }
}
