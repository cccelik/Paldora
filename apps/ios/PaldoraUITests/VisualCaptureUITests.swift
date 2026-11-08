import XCTest

/// Screenshot capture for the visual QA against Figma (docs/plans/ui-overhaul.md, "Visual QA (iOS)").
/// Skipped unless `TEST_RUNNER_PALDORA_VISUAL_QA=1`; writes PNGs to `PALDORA_VISUAL_DIR`.
final class VisualCaptureUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    func testCaptureLight() throws { try capture(dark: false) }
    func testCaptureDark() throws { try capture(dark: true) }

    private func capture(dark: Bool) throws {
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["PALDORA_VISUAL_QA"] == "1", "visual capture only")
        let dir = env["PALDORA_VISUAL_DIR"] ?? NSTemporaryDirectory()
        let mode = dark ? "dark" : "light"
        func shot(_ app: XCUIApplication, _ name: String) {
            sleep(2)
            let screenshot = app.screenshot()
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(mode)-\(name).png"))
        }
        // Sign-in first (signed out), then signed in.
        let out = XCUIApplication()
        out.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        out.launchArguments += ["-AppleInterfaceStyle", dark ? "Dark" : "Light"]
        out.launch()
        XCTAssertTrue(out.textFields["email-field"].waitForExistence(timeout: 30))
        shot(out, "1.2-signin")
        out.terminate()

        let app = try launchSignedIn(arguments: ["-AppleInterfaceStyle", dark ? "Dark" : "Light"])
        sleep(3)
        shot(app, "4.1-home")
        for (tab, name) in [("Boxes", "3.1-boxes"), ("My Room", "7.1-myroom"), ("Notifications", "5.6-activity"), ("Profile", "9.1-settings-profile")] {
            app.tab(tab).tap()
            sleep(2)
            shot(app, name)
        }
        // Boxes: first box (the shared one), then its post.
        app.tab("Boxes").tap()
        sleep(2)
        let cell = app.element("box-row")
        if cell.waitForExistence(timeout: 8) {
            cell.tap()
            shot(app, "3.4-boxdetail")
            let post = app.element("box-post")
            if post.waitForExistence(timeout: 5) { post.tap(); shot(app, "5.1-post"); app.goBack() }
            app.goBack()
        }
        // Profile children.
        func fromProfile(_ id: String, _ name: String) {
            app.tab("Profile").tap()
            let link = app.buttons[id]
            app.scrollToReveal(link)
            guard link.waitForExistence(timeout: 8) else { return }
            link.tap()
            shot(app, name)
            app.goBack()
        }
        fromProfile("friends-link", "2.1-friends")
        fromProfile("settings-link", "9.1-settings")
        fromProfile("life-updates-link", "6.2-lifeupdates")
        fromProfile("memories-link", "6.4-memories")
        app.tab("Profile").tap()
        let lu = app.buttons["life-updates-link"]
        app.scrollToReveal(lu)
        lu.tap()
        if app.buttons["new-life-update"].waitForExistence(timeout: 8) {
            app.buttons["new-life-update"].tap()
            shot(app, "6.1-new-life-update")
            app.goBack()
        }
        app.goBack()
        // Room customize.
        app.tab("My Room").tap()
        if app.buttons["customize-room"].waitForExistence(timeout: 10) {
            app.buttons["customize-room"].tap()
            shot(app, "7.3-customize")
        }
    }
}
