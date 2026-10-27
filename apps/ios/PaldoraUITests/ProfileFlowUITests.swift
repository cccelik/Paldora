import XCTest

/// Runs against the local `demo-paldora` emulators with a seeded, fully
/// onboarded fixture account. `apps/ios/scripts/ui-test.sh` provides both.
/// Credentials arrive only through PALDORA_UI_EMAIL / PALDORA_UI_PASSWORD.
final class ProfileFlowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testSignInEditDisplayNameAndSignOut() throws {
        let app = try launchSignedIn()

        let profileTab = app.tabBars.buttons["Profile"]
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
        nameField.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
        // Clear deterministically: move to the end, then delete every character.
        let current = (nameField.value as? String) ?? ""
        nameField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 5))
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
