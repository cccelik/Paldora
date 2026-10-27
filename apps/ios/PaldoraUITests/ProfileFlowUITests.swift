import XCTest

/// Runs against the local `demo-paldora` emulators with a seeded, fully
/// onboarded fixture account. `apps/ios/scripts/ui-test.sh` provides both.
/// Credentials arrive only through PALDORA_UI_EMAIL / PALDORA_UI_PASSWORD.
final class ProfileFlowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testSignInEditDisplayNameAndSignOut() throws {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["PALDORA_UI_EMAIL"], let password = env["PALDORA_UI_PASSWORD"],
              !email.isEmpty, !password.isEmpty else {
            XCTFail("Set PALDORA_UI_EMAIL and PALDORA_UI_PASSWORD (use apps/ios/scripts/ui-test.sh).")
            return
        }

        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        app.launch()

        // Sign in.
        let emailField = app.textFields["email-field"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 30), "Sign-in screen did not appear")
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["password-field"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["sign-in-button"].tap()

        // Tab shell, then the real Profile tab.
        let profileTab = app.tabBars.buttons["Profile"]
        XCTAssertTrue(profileTab.waitForExistence(timeout: 30), "Tab shell did not appear after sign-in")
        XCTAssertTrue(app.tabBars.buttons["Home"].exists)
        XCTAssertTrue(app.tabBars.buttons["Boxes"].exists)
        XCTAssertTrue(app.tabBars.buttons["Notifications"].exists)
        profileTab.tap()
        XCTAssertTrue(app.staticTexts["profile-display-name"].waitForExistence(timeout: 10))

        // Edit the display name.
        let newName = "UI Test \(Int.random(in: 1000...9999))"
        let nameField = app.textFields["display-name-field"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 10))
        nameField.tap()
        nameField.press(forDuration: 1.0)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        nameField.typeText(newName)
        let save = app.buttons["save-profile-button"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["profile-saved"].waitForExistence(timeout: 20), "Save did not confirm")
        let shown = app.staticTexts["profile-display-name"].firstMatch
        XCTAssertEqual(shown.label, newName)

        // Sign out.
        let signOut = app.buttons["sign-out-button"]
        if !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        XCTAssertTrue(app.textFields["email-field"].waitForExistence(timeout: 10), "Did not return to sign-in")
    }
}
