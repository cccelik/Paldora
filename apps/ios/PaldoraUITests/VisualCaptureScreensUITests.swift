import XCTest

/// Second screenshot capture pass for the visual QA (docs/plans/ui-overhaul.md, "Visual QA (iOS)"):
/// the sheets, dialogs, Box settings, onboarding, safety screens and Room editors that
/// `VisualCaptureUITests` does not reach. Best effort: a screen it cannot reach is logged to
/// `misses.txt` instead of failing. Skipped unless `TEST_RUNNER_PALDORA_VISUAL_QA=1`.
final class VisualCaptureScreensUITests: XCTestCase {
    private var dir = ""
    private var mode = ""
    private var misses: [String] = []

    override func setUp() { continueAfterFailure = true }

    // One test per screen group and appearance, so a hung group does not take the others with it.
    func testSignedOutLight() throws { try prepare(dark: false) { self.captureSignedOut($0) } }
    func testSignedOutDark() throws { try prepare(dark: true) { self.captureSignedOut($0) } }
    func testOnboardingLight() throws { try prepare(dark: false) { self.captureOnboarding($0, env: self.env) } }
    func testOnboardingDark() throws { try prepare(dark: true) { self.captureOnboarding($0, env: self.env) } }
    func testFriendsLight() throws { try signedIn(dark: false) { self.captureFriends($0, env: self.env) } }
    func testFriendsDark() throws { try signedIn(dark: true) { self.captureFriends($0, env: self.env) } }
    func testBoxLight() throws { try signedIn(dark: false) { self.captureBox($0, env: self.env) } }
    func testBoxDark() throws { try signedIn(dark: true) { self.captureBox($0, env: self.env) } }
    func testPostLight() throws { try signedIn(dark: false) { self.capturePost($0) } }
    func testPostDark() throws { try signedIn(dark: true) { self.capturePost($0) } }
    func testRoomLight() throws { try signedIn(dark: false) { self.captureRoom($0) } }
    func testRoomDark() throws { try signedIn(dark: true) { self.captureRoom($0) } }
    func testSettingsLight() throws { try signedIn(dark: false) { self.captureSettings($0) } }
    func testSettingsDark() throws { try signedIn(dark: true) { self.captureSettings($0) } }
    func testComposerLight() throws { try signedIn(dark: false) { self.capturePhotoComposer($0) } }
    func testComposerDark() throws { try signedIn(dark: true) { self.capturePhotoComposer($0) } }

    private var env: [String: String] { ProcessInfo.processInfo.environment }
    private var style: [String] { ["-AppleInterfaceStyle", mode == "dark" ? "Dark" : "Light"] }

    private func prepare(dark: Bool, _ body: (XCUIApplication?) -> Void) throws {
        try setUpMode(dark: dark)
        defer { writeMisses() }
        body(nil)
    }

    private func signedIn(dark: Bool, _ body: (XCUIApplication) -> Void) throws {
        try setUpMode(dark: dark)
        defer { writeMisses() }
        let app = try launchSignedIn(environment: ["PALDORA_UI_TEST_IMAGE": "1"], arguments: style)
        sleep(2)
        body(app)
    }

    private func setUpMode(dark: Bool) throws {
        try XCTSkipUnless(env["PALDORA_VISUAL_QA"] == "1", "visual capture only")
        dir = env["PALDORA_VISUAL_DIR"] ?? NSTemporaryDirectory()
        mode = dark ? "dark" : "light"
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    private func writeMisses() {
        let test = name.components(separatedBy: " ").last?.replacingOccurrences(of: "]", with: "") ?? "test"
        try? misses.joined(separator: "\n").write(toFile: "\(dir)/misses-\(test).txt", atomically: true, encoding: .utf8)
    }

    // MARK: helpers

    private func shot(_ app: XCUIApplication, _ name: String) {
        sleep(2)
        try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(mode)-\(name).png"))
    }

    private func miss(_ name: String) { misses.append(name) }

    /// Any element by exact label or identifier.
    private func find(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@ OR identifier == %@", text, text)).firstMatch
    }

    /// Taps an element found by label/identifier; false (and a logged miss) when absent.
    @discardableResult
    private func tap(_ app: XCUIApplication, _ text: String, scroll: Bool = true, timeout: TimeInterval = 8) -> Bool {
        let element = find(app, text)
        guard element.waitForExistence(timeout: timeout) else { miss("tap:\(text)"); return false }
        if scroll { app.scrollToReveal(element) }
        element.tap()
        return true
    }

    private func dismissKeyboard(_ app: XCUIApplication) {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        for key in ["Return", "return", "Done", "done", "Go"] where keyboard.buttons[key].exists {
            keyboard.buttons[key].tap()
            return
        }
    }

    /// Pops pushed screens and closes sheets until the tab bar is usable again.
    private func backToTabs(_ app: XCUIApplication) {
        for _ in 0..<8 where !app.tab("Boxes").isHittable {
            let back = app.buttons.matching(identifier: "nav-back")
            let close = app.buttons.matching(identifier: "nav-close")
            if close.count > 0, close.element(boundBy: close.count - 1).isHittable {
                close.element(boundBy: close.count - 1).tap()
            } else if back.count > 0 {
                back.element(boundBy: back.count - 1).tap()
            } else { app.swipeDown() }
            sleep(1)
        }
    }

    // MARK: groups

    private func captureSignedOut(_ unused: XCUIApplication?) {
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launchArguments += style
        app.launch()
        let forgot = app.buttons["forgot-password"]
        guard forgot.waitForExistence(timeout: 30) else { return miss("signin") }
        app.tap(forgot, until: app.element("reset-email"))
        shot(app, "1.3-forgot")
        app.type("nobody@example.invalid", into: "reset-email")
        app.buttons["send-reset"].tap()
        if app.element("reset-message").waitForExistence(timeout: 30) { shot(app, "1.4-check-email") } else { miss("1.4") }
        app.terminate()
    }

    private func captureOnboarding(_ unused: XCUIApplication?, env: [String: String]) {
        let key = mode == "dark" ? "PALDORA_UI_FRESH3" : "PALDORA_UI_FRESH2"
        guard let email = env["\(key)_EMAIL"], let password = env["\(key)_PASSWORD"] else { return miss("onboarding creds") }
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launchArguments += style
        app.launch()
        signIn(app, email: email, password: password)
        guard app.staticTexts["onboarding-step"].waitForExistence(timeout: 30) else { return miss("1.8") }
        shot(app, "1.8-username")
        app.type("cap\(Int.random(in: 100000...999999))", into: "onboarding-username")
        dismissKeyboard(app)
        shot(app, "1.8b-username-typed")
        app.buttons["onboarding-username-next"].tap()
        guard app.element("onboarding-display-name").waitForExistence(timeout: 30) else { return miss("1.10") }
        shot(app, "1.10-about")
        app.type("Capture Person", into: "onboarding-display-name")
        let next = app.buttons["onboarding-profile-next"]
        app.scrollToReveal(next)
        next.tap()
        if app.buttons["onboarding-finish"].waitForExistence(timeout: 30) { shot(app, "1.9-photo") } else { miss("1.9") }
        app.terminate()
    }

    private func captureFriends(_ app: XCUIApplication, env: [String: String]) {
        app.tab("Profile").tap()
        let link = app.buttons["friends-link"]
        app.scrollToReveal(link)
        link.tap()
        if tap(app, "Add a friend") {
            shot(app, "2.2-add-friend")
            if let peer = env["PALDORA_UI_PEER_USERNAME"], app.element("friend-username-field").waitForExistence(timeout: 5) {
                app.type(peer, into: "friend-username-field")
                dismissKeyboard(app)
                app.buttons["send-friend-request"].tap()
                sleep(2)
                shot(app, "2.2b-request-sent")
            }
            app.goBack()
        }
        if app.buttons["requests-link"].waitForExistence(timeout: 5) {
            app.buttons["requests-link"].tap()
            shot(app, "2.3-requests")
            app.goBack()
        } else { miss("2.3") }
        if app.buttons["blocked-link"].waitForExistence(timeout: 3) {
            app.buttons["blocked-link"].tap()
            shot(app, "2.6-blocked")
            app.goBack()
        } else { miss("2.6") }
        app.goBack()
    }

    private func captureBox(_ app: XCUIApplication, env: [String: String]) {
        app.tab("Boxes").tap()
        guard app.buttons["create-box"].waitForExistence(timeout: 20) else { return miss("3.3") }
        app.buttons["create-box"].tap()
        let nameField = app.element("box-name-field")
        if nameField.waitForExistence(timeout: 10) { shot(app, "3.3-create-box") }
        let name = "Capture \(Int.random(in: 1000...9999))"
        app.type(name, into: "box-name-field")
        dismissKeyboard(app)
        shot(app, "3.3b-create-box-filled")
        app.buttons["create-box-submit"].tap()
        let row = app.element("box-row", containing: name)
        guard row.waitForExistence(timeout: 20) else { return miss("box created") }
        let manage = app.buttons["manage-box"]
        for _ in 0..<3 where !manage.exists {
            if row.isHittable { row.tap() }
            _ = manage.waitForExistence(timeout: 8)
        }
        // Own Box detail with the composer: 4.2 New moment, then 4.1b with a post.
        shot(app, "3.4b-own-boxdetail")
        // The composer is exercised last (capturePhotoComposer): typing before navigating hangs XCUITest.
        // Box settings.
        guard manage.waitForExistence(timeout: 5) else { return miss("3.8") }
        manage.tap()
        guard app.element("rename-field").waitForExistence(timeout: 20) else { return miss("3.8 rename") }
        shot(app, "3.8-box-settings")
        let invite = app.element("invite-username")
        app.scrollToReveal(invite)
        if let peer = env["PALDORA_UI_PEER_USERNAME"] {
            app.type(peer, into: "invite-username")
            dismissKeyboard(app)
            let send = app.buttons["send-invitation"]
            app.scrollToReveal(send)
            send.tap()
            if app.element("pending-invitation").waitForExistence(timeout: 20) { shot(app, "3.5-invite-pending") } else { miss("3.5") }
        }
        let leave = app.buttons["leave-box-owner"]
        app.scrollToReveal(leave)
        shot(app, "3.9-owner-actions")
        let archive = app.element("archive-toggle")
        app.scrollToReveal(archive)
        shot(app, "3.11-archive-section")
        // Delete dialog / section.
        let delName = app.element("delete-name")
        app.scrollToReveal(delName)
        shot(app, "3.10-delete-box")
        if delName.exists {
            app.type(name, into: "delete-name")
            dismissKeyboard(app)
            let del = app.buttons["delete-box"]
            app.scrollToReveal(del)
            if del.exists, del.isEnabled { del.tap(); shot(app, "3.10b-delete-dialog") ; dismissDialog(app) }
        }
        // Archive the Box and view the archived state.
        let toggle = app.element("archive-toggle")
        app.scrollToReveal(toggle)
        if toggle.exists {
            toggle.tap()
            shot(app, "3.11b-archive-dialog")
            dismissDialog(app, confirm: true)
            sleep(2)
            app.goBack()
            shot(app, "3.11-archived-box")
        }
        // Members last: opening it on a fresh Box can freeze the app under XCUITest (see the QA notes).
        if app.buttons["members-link"].waitForExistence(timeout: 3) {
            app.buttons["members-link"].tap()
            shot(app, "3.7-members")
            app.goBack()
        } else { miss("3.7") }
        app.goBack()
    }

    /// Taps a dialog's confirm or cancel button (last/first button inside the dialog layer).
    private func dismissDialog(_ app: XCUIApplication, confirm: Bool = false) {
        for title in confirm ? ["Archive", "Confirm", "Yes"] : ["Cancel", "Keep it", "Not now"] {
            let b = app.buttons[title]
            if b.exists, b.isHittable { b.tap(); return }
        }
        miss("dialog button")
    }

    private func capturePost(_ app: XCUIApplication) {
        // The shared Box post (peer owns it): reaction picker, who reacted, report, post actions.
        app.tab("Boxes").tap()
        let rows = app.descendants(matching: .any).matching(identifier: "box-row")
        guard rows.firstMatch.waitForExistence(timeout: 10) else { return miss("post box") }
        rows.firstMatch.tap()
        let post = app.element("box-post")
        guard post.waitForExistence(timeout: 10) else { return miss("post") }
        post.tap()
        guard app.staticTexts["post-text"].waitForExistence(timeout: 20) else { return miss("post detail") }
        let thumbs = app.buttons["reaction-👍"]
        app.scrollToReveal(thumbs)
        if thumbs.exists { thumbs.tap(); sleep(2); shot(app, "5.2-reacted") }
        let camera = app.buttons["camera-reaction"]
        app.scrollToReveal(camera)
        if camera.exists {
            camera.tap()
            if app.buttons["take-photo"].waitForExistence(timeout: 20) {
                shot(app, "5.3-camera")
                app.buttons["take-photo"].tap()
                if app.buttons["send-camera-reaction"].waitForExistence(timeout: 10) { shot(app, "5.3b-camera-taken") }
                app.buttons["nav-close"].firstMatch.tap()
            } else { miss("5.3") }
        }
        let who = app.element("reaction-counts")
        app.scrollToReveal(who)
        if who.exists, who.isHittable { who.tap(); shot(app, "5.4-who-reacted"); dismissSheet(app) }
        let reply = app.buttons["open-conversation"].firstMatch
        if reply.exists { app.scrollToReveal(reply); reply.tap(); shot(app, "5.5-replies"); app.goBack() }
        // Report sheet.
        app.navButton("nav-more").tap()
        shot(app, "4.7-post-actions")
        if tap(app, "Report", scroll: false) { shot(app, "10.1-report"); dismissSheet(app) } else { miss("10.1") }
        app.goBack()
        // Peer's Room.
        let author = app.element("post-author-room").firstMatch
        if author.exists { author.tap(); shot(app, "7.2-visit-room"); app.goBack() } else { miss("7.2") }
        app.goBack()
    }

    /// Last on purpose: an attached photo keeps the app busy, so nothing may follow it.
    private func capturePhotoComposer(_ app: XCUIApplication) {
        backToTabs(app)
        app.tab("Boxes").tap()
        let rows = app.descendants(matching: .any).matching(identifier: "box-row")
        guard rows.firstMatch.waitForExistence(timeout: 10) else { return miss("4.3 box") }
        rows.firstMatch.tap()
        guard app.element("post-field").waitForExistence(timeout: 10) else { return miss("4.3 composer") }
        app.type("A first moment for the capture", into: "post-field")
        shot(app, "4.2-new-moment")
        dismissKeyboard(app)
        let attach = app.buttons["attach-test-photo"]
        app.scrollToReveal(attach)
        guard attach.exists else { return miss("4.3 attach") }
        attach.tap()
        if app.element("photo-upload", containing: "Photo").waitForExistence(timeout: 90) { shot(app, "4.3-photo-attached") } else { miss("4.3") }
    }

    private func dismissSheet(_ app: XCUIApplication) {
        let close = app.buttons["nav-close"]
        if close.exists { close.firstMatch.tap(); return }
        app.swipeDown()
    }

    private func captureRoom(_ app: XCUIApplication) {
        app.tab("My Room").tap()
        guard app.buttons["customize-room"].waitForExistence(timeout: 10) else { return miss("7.3") }
        app.buttons["customize-room"].tap()
        sleep(2)
        shot(app, "7.3-customize-top")
        for i in 1...4 {
            app.swipeUp()
            shot(app, "7.3-customize-\(i)")
        }
        let theme = app.buttons["room-theme"]
        app.swipeDown(velocity: .fast); app.swipeDown(velocity: .fast); app.swipeDown(velocity: .fast); app.swipeDown(velocity: .fast)
        if theme.waitForExistence(timeout: 5) { theme.tap(); shot(app, "7.3b-theme-sheet"); dismissSheet(app) } else { miss("7.3b") }
        app.goBack()
    }

    private func captureSettings(_ app: XCUIApplication) {
        app.tab("Profile").tap()
        app.scrollToReveal(app.buttons["settings-link"])
        app.buttons["settings-link"].tap()
        sleep(1)
        shot(app, "9.1-settings-top")
        app.swipeUp()
        shot(app, "9.1-settings-bottom")
        for (id, name) in [("settings-security", "9.2-security"), ("settings-reports", "10.3-reports"),
                           ("settings-notices", "9.5-notices"), ("settings-export", "10.7-export"),
                           ("settings-deletion", "10.8-deletion")] {
            let row = app.buttons[id]
            app.scrollToReveal(row)
            guard row.exists else { miss(id); continue }
            row.tap()
            shot(app, name)
            if id == "settings-deletion" {
                let ack = app.element("delete-ack")
                app.scrollToReveal(ack)
                if ack.exists { ack.tap(); shot(app, "10.9-deletion-ack") }
            }
            app.goBack()
        }
    }
}
