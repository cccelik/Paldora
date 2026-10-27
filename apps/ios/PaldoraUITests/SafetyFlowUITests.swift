import XCTest

/// Settings flows against the local emulators: password change, data export, comment report.
final class SafetyFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testChangePasswordThenSignInWithTheNewOneAndBack() throws {
        let app = try launchSignedIn()
        let env = ProcessInfo.processInfo.environment
        let original = try XCTUnwrap(env["PALDORA_UI_PASSWORD"])
        let email = try XCTUnwrap(env["PALDORA_UI_EMAIL"])
        let replacement = original + "-changed"

        try changePassword(app, from: original, to: replacement)
        XCTAssertTrue(app.element("sign-in-notice", containing: "password was changed").waitForExistence(timeout: 30),
                      "Neutral sign-in notice missing")
        signIn(app, email: email, password: replacement)
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 30), "New password did not sign in")

        // Restore the fixture's password so the other flows keep working.
        try changePassword(app, from: replacement, to: original)
        signIn(app, email: email, password: original)
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 30), "Original password did not sign in")
    }

    private func changePassword(_ app: XCUIApplication, from old: String, to new: String) throws {
        openSettingsRow(app, "settings-security")
        app.type(old, into: "current-password")
        app.type(new, into: "new-password")
        app.type(new, into: "confirm-password")
        let change = app.buttons["change-password"]
        app.scrollToReveal(change)
        XCTAssertTrue(change.isEnabled)
        change.tap()
        XCTAssertTrue(app.textFields["email-field"].waitForExistence(timeout: 30), "Did not return to sign-in")
    }

    func testRequestExportAndSeeItReady() throws {
        let app = try launchSignedIn()
        openSettingsRow(app, "settings-export")
        let request = app.buttons["request-export"]
        XCTAssertTrue(request.waitForExistence(timeout: 20))
        request.tap()
        let ready = app.staticTexts["Your archive is ready."]
        XCTAssertTrue(ready.waitForExistence(timeout: 90), "Archive never became ready")
        XCTAssertFalse(app.element("export-error").exists)
        let download = app.buttons["download-export"]
        XCTAssertTrue(download.waitForExistence(timeout: 10))
        download.tap()
        // The system share sheet opens with the downloaded file; no neutral-404 error appears.
        let sheet = app.otherElements["ActivityListView"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 20), "Share sheet did not open")
        XCTAssertFalse(app.element("export-error").exists)
    }

    func testReportACommentAndSeeTheReceipt() throws {
        let app = try launchSignedIn()
        app.tabBars.buttons["Boxes"].tap()
        let row = app.element("box-row", containing: "Shared UI Box")
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Shared Box not listed")
        for _ in 0..<3 where !app.element("box-post").exists {
            if row.isHittable { row.tap() }
            _ = app.element("box-post").waitForExistence(timeout: 8)
        }
        let post = app.element("box-post", containing: "Peer post")
        XCTAssertTrue(post.waitForExistence(timeout: 20))
        post.tap()
        XCTAssertTrue(app.staticTexts["Peer comment for UI tests"].waitForExistence(timeout: 20), "Peer comment missing")
        let report = app.buttons["report-comment"].firstMatch
        app.scrollToReveal(report)
        report.tap()

        let category = app.buttons["report-category"]
        XCTAssertTrue(category.waitForExistence(timeout: 10))
        category.tap()
        app.buttons["Spam"].tap()
        app.buttons["send-report"].tap()
        XCTAssertTrue(app.element("report-sent").waitForExistence(timeout: 20), "Report was not accepted")
        app.buttons["Done"].tap()

        openSettingsRow(app, "settings-reports")
        XCTAssertTrue(app.element("report-receipt").waitForExistence(timeout: 20), "Receipt missing")
        XCTAssertFalse(app.element("no-reports").exists)
    }

    func testSettingsEmptyStatesAreHonest() throws {
        let app = try launchSignedIn()
        openSettingsRow(app, "settings-notices")
        XCTAssertTrue(app.element("no-notices").waitForExistence(timeout: 20))
    }
}
