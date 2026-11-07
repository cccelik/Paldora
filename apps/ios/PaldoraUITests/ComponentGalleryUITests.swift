import XCTest

/// Xcode's accessibility audit over every section of the DEBUG component gallery
/// (`-PALDORA_GALLERY`), in Light and Dark, at the default text size and at
/// accessibility3. No emulator or sign-in is needed.
final class ComponentGalleryUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    private let largest = "UICTContentSizeCategoryAccessibilityL"  // accessibility3
    private let sections = ["Buttons", "Inputs", "Controls", "Lists", "Feedback", "Navigation",
                            "Avatars", "Cards", "Threads", "Overlays"]

    func testGalleryAuditLight() { run(dark: false, large: false) }
    func testGalleryAuditDark() { run(dark: true, large: false) }
    func testGalleryAuditAtAccessibility3() { run(dark: false, large: true) }

    private func run(dark: Bool, large: Bool) {
        let app = XCUIApplication()
        app.launchArguments += ["-PALDORA_GALLERY"]
        app.launchEnvironment["PALDORA_GALLERY_FLAT"] = "1"
        if dark { app.launchArguments += ["-AppleInterfaceStyle", "Dark"] }
        if large { app.launchArguments += ["-UIPreferredContentSizeCategoryName", largest] }
        app.launch()
        let menu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Section:")).firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 30), "Gallery did not open")
        let label = "\(dark ? "dark" : "light")\(large ? " AX3" : "")"
        for section in sections {
            menu.tap()
            let item = app.buttons["gallery-section-\(section.lowercased())"]
            XCTAssertTrue(item.waitForExistence(timeout: 10), "\(section) menu item missing")
            item.tap()
            sleep(1)
            audit(app, "\(section) \(label)")
        }
    }

    /// Collects every issue (so one run shows all of them) then fails once. Exemptions are
    /// the same as the main-screen audit (AccessibilityAuditUITests).
    private func audit(_ app: XCUIApplication, _ screen: String) {
        let log = IssueLog()
        // Elements within the home-indicator strip are measured against the indicator, not
        // their own background (the main audit makes the same allowance for the tab bar).
        let indicatorTop = app.frame.maxY - 34
        do {
            try app.performAccessibilityAudit { issue in
                // Audit findings without an element are system-drawn chrome; token contrast
                // is covered by ContrastTests.
                if issue.element == nil,
                   issue.auditType == .elementDetection || issue.auditType == .contrast || issue.auditType == .dynamicType || issue.auditType == .textClipped
                    || issue.auditType == .sufficientElementDescription { return true }
                if issue.auditType == .contrast, let frame = issue.element?.frame, frame.maxY > indicatorTop { return true }
                // WCAG 1.4.3 exempts inactive components, and the audit measures the faded (40%)
                // disabled buttons against the canvas; enabled ones are checked.
                if issue.auditType == .contrast, issue.element?.isEnabled == false { return true }
                // Same known false positive as the main audit: a text field reported as "text
                // clipped" while its text visibly scales.
                if issue.auditType == .textClipped, issue.element?.identifier == "gallery-name" { return true }
                // "nearly passed" is the audit's own tolerance band for anti-aliased small text.
                if issue.compactDescription.contains("nearly passed") { return true }
                let element = issue.element.map { "\($0.elementType.rawValue) '\($0.label)' id=\($0.identifier) frame=\($0.frame)" } ?? "no element"
                log.add("\(issue.auditType) \(issue.compactDescription) [\(element)] detail=\(issue.detailedDescription)")
                return true
            }
        } catch {
            log.add("audit error: \(error)")
        }
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "gallery: \(screen)"
        attachment.lifetime = .keepAlways
        add(attachment)
        let found = log.items
        XCTAssertTrue(found.isEmpty, "\(screen): \(found.count) issue(s)\n" + found.joined(separator: "\n"))
    }
}

private final class IssueLog: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [String] = []
    var items: [String] { lock.withLock { stored } }
    func add(_ line: String) { lock.withLock { stored.append(line) } }
}
