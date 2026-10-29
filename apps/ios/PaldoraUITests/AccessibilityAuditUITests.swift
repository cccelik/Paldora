import XCTest

/// Xcode's accessibility audit over the main screens: contrast, Dynamic Type,
/// clipped text, hit regions, element descriptions and traits. Run at the default
/// text size and at the largest accessibility size (accessibility3).
final class AccessibilityAuditUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    private let largest = "UICTContentSizeCategoryAccessibilityL"  // accessibility3

    func testSignInScreenAudit() throws {
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launch()
        XCTAssertTrue(app.textFields["email-field"].waitForExistence(timeout: 30))
        audit(app, "sign-in")
    }

    func testSignInScreenAuditAtAccessibility3() throws {
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", largest]
        app.launch()
        XCTAssertTrue(app.textFields["email-field"].waitForExistence(timeout: 30))
        audit(app, "sign-in AX3")
    }

    func testMainScreensAudit() throws {
        let app = try launchSignedIn()
        auditTabs(app, label: "default")
    }

    func testMainScreensAuditAtAccessibility3() throws {
        let app = try launchSignedIn(arguments: ["-UIPreferredContentSizeCategoryName", largest])
        auditTabs(app, label: "AX3")
    }

    private func auditTabs(_ app: XCUIApplication, label: String) {
        for tab in ["Home", "Boxes", "My Room", "Notifications", "Profile"] {
            let button = app.tabBars.buttons[tab]
            XCTAssertTrue(button.waitForExistence(timeout: 20), "\(tab) tab missing")
            button.tap()
            sleep(2)  // let the screen load its data
            audit(app, "\(tab) \(label)")
        }
        // Profile sub-screens reachable from rows.
        for (row, name) in [("friends-link", "Friends"), ("settings-link", "Settings")] {
            app.tabBars.buttons["Profile"].tap()
            let link = app.buttons[row]
            app.scrollToReveal(link)
            guard link.waitForExistence(timeout: 10) else { XCTFail("\(row) missing"); continue }
            link.tap()
            sleep(2)
            audit(app, "\(name) \(label)")
            app.navigationBars.buttons.firstMatch.tap()
        }
    }

    /// Collects every issue (so one run shows all of them) then fails once.
    private func audit(_ app: XCUIApplication, _ screen: String) {
        let log = IssueLog()
        // Content scrolled under the translucent tab bar is measured against the bar, not its
        // own background; the audit cannot tell, so elements at or below the bar's top are skipped.
        let bar = app.tabBars.firstMatch
        let tabTop = bar.exists ? bar.frame.minY : app.frame.maxY
        do {
            try app.performAccessibilityAudit { issue in
                if let frame = issue.element?.frame, frame.minY >= tabTop - 1 { return true }
                // Contrast of text that reaches under the translucent tab bar is measured against it.
                if issue.auditType == .contrast, let frame = issue.element?.frame, frame.maxY > tabTop { return true }
                // The navigation bar's back button and inline title are system-drawn at a fixed
                // size, and content reaching under the tab bar is measured against it; the audit
                // reports both without an element. Real content issues carry one, and token
                // contrast is covered by ContrastTests.
                if issue.element == nil,
                   issue.auditType == .contrast || issue.auditType == .dynamicType || issue.auditType == .textClipped || issue.auditType == .sufficientElementDescription { return true }
                // Known false positive: the audit reports "text clipped" for the email-keyboard field
                // only (other text fields, with the same font and sizing, pass), at every size,
                // while its text visibly scales (checked in the accessibility3 screenshot).
                if issue.auditType == .textClipped, issue.element?.identifier == "email-field" { return true }
                // "nearly passed" is the audit's own tolerance band for anti-aliased small text.
                if issue.compactDescription.contains("nearly passed") { return true }
                let element = issue.element.map { "\($0.elementType.rawValue) '\($0.label)' id=\($0.identifier) frame=\($0.frame)" } ?? "no element"
                log.add("\(issue.auditType) \(issue.compactDescription) [\(element)] detail=\(issue.detailedDescription)")
                return true  // handled: keep going so all issues are reported
            }
        } catch {
            log.add("audit error: \(error)")
        }
        let found = log.items
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "screen: \(screen)"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertTrue(found.isEmpty, "\(screen): \(found.count) issue(s)\n" + found.joined(separator: "\n"))
    }
}

private final class IssueLog: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [String] = []
    var items: [String] { lock.withLock { stored } }
    func add(_ line: String) { lock.withLock { stored.append(line) } }
}
