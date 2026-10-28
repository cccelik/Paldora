import XCTest

/// Onboarding, Box management and sign-in extras against the local emulators.
final class ParityFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testFreshAccountIsWalkedThroughOnboarding() throws {
        let env = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(env["PALDORA_UI_FRESH_EMAIL"], "Use apps/ios/scripts/ui-test.sh")
        let password = try XCTUnwrap(env["PALDORA_UI_FRESH_PASSWORD"])
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launch()
        signIn(app, email: email, password: password)

        // Step 1: username (not the old dead end).
        let step = app.staticTexts["onboarding-step"]
        XCTAssertTrue(step.waitForExistence(timeout: 30), "Onboarding did not start")
        XCTAssertTrue(step.label.contains("Step 1 of 3"))
        app.type("fresh\(Int.random(in: 100000...999999))", into: "onboarding-username")
        let next = app.buttons["onboarding-username-next"]
        XCTAssertTrue(next.isEnabled)
        next.tap()

        // Step 2: profile.
        XCTAssertTrue(app.element("onboarding-display-name").waitForExistence(timeout: 30), "Profile step missing")
        app.type("Fresh Person", into: "onboarding-display-name")
        let profileNext = app.buttons["onboarding-profile-next"]
        app.scrollToReveal(profileNext)
        profileNext.tap()

        // Step 3: avatar is optional; finish without one.
        let finish = app.buttons["onboarding-finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 30), "Avatar step missing")
        finish.tap()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 30), "Did not reach the app after onboarding")
    }

    func testBoxRenameInviteRevokeAndOwnerCannotLeave() throws {
        let env = ProcessInfo.processInfo.environment
        let peer = try XCTUnwrap(env["PALDORA_UI_PEER_USERNAME"], "Use apps/ios/scripts/ui-test.sh")
        let app = try launchSignedIn()
        let stamp = Int.random(in: 1000...9999)
        let original = "Manage \(stamp)"
        let renamed = "Renamed \(stamp)"

        // A Box I own.
        app.tabBars.buttons["Boxes"].tap()
        let create = app.buttons["create-box"]
        XCTAssertTrue(create.waitForExistence(timeout: 20))
        create.tap()
        app.type(original, into: "box-name-field")
        app.buttons["create-box-submit"].tap()
        let row = app.element("box-row", containing: original)
        XCTAssertTrue(row.waitForExistence(timeout: 20))
        let manage = app.buttons["manage-box"]
        for _ in 0..<3 where !manage.exists {
            if row.isHittable { row.tap() }
            _ = manage.waitForExistence(timeout: 8)
        }
        manage.tap()

        // Rename.
        let renameField = app.element("rename-field")
        XCTAssertTrue(renameField.waitForExistence(timeout: 20), "Owner tools missing")
        renameField.tap()
        renameField.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
        renameField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: original.count + 3))
        renameField.typeText(renamed)
        let submit = app.buttons["rename-submit"]
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.element("manage-notice", containing: "Box renamed").waitForExistence(timeout: 20), "Rename not confirmed")

        // Invite the peer by username, see it pending, revoke it.
        let invite = app.element("invite-username")
        app.scrollToReveal(invite)
        app.type(peer, into: "invite-username")
        let send = app.buttons["send-invitation"]
        app.scrollToReveal(send)
        send.tap()
        let pending = app.element("pending-invitation")
        XCTAssertTrue(pending.waitForExistence(timeout: 20), "Invitation not listed")
        let revoke = app.buttons["revoke-invitation"]
        app.scrollToReveal(revoke)
        revoke.tap()
        XCTAssertTrue(app.element("manage-notice", containing: "Invitation withdrawn").waitForExistence(timeout: 20))
        XCTAssertFalse(app.element("pending-invitation").waitForExistence(timeout: 3), "Invitation still pending")

        // The owner cannot leave: the reason is shown and no call succeeds.
        let leave = app.buttons["leave-box-owner"]
        app.scrollToReveal(leave)
        XCTAssertTrue(app.element("leave-blocked").exists, "Owner explanation missing")
        leave.tap()
        XCTAssertTrue(app.element("manage-error", containing: "make another member the owner").waitForExistence(timeout: 10))
    }

    func testForgotPasswordIsNeutral() throws {
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launch()
        let forgot = app.buttons["forgot-password"]
        XCTAssertTrue(forgot.waitForExistence(timeout: 30))
        app.tap(forgot, until: app.element("reset-email"))
        app.type("nobody-\(Int.random(in: 1000...9999))@example.invalid", into: "reset-email")
        app.buttons["send-reset"].tap()
        let message = app.element("reset-message")
        XCTAssertTrue(message.waitForExistence(timeout: 30), "No confirmation shown")
        XCTAssertTrue(message.label.contains("If that email has a Paldora account"), "Reset copy must not reveal whether the account exists")
    }
}
