import XCTest

/// Shared helpers for the emulator-backed UI tests.
extension XCTestCase {
    func credentials() -> (email: String, password: String)? {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["PALDORA_UI_EMAIL"], let password = env["PALDORA_UI_PASSWORD"],
              !email.isEmpty, !password.isEmpty else { return nil }
        return (email, password)
    }

    /// Launches signed out, signs in with the seeded fixture, waits for the tab shell.
    func launchSignedIn(environment: [String: String] = [:]) throws -> XCUIApplication {
        guard let (email, password) = credentials() else {
            XCTFail("Set PALDORA_UI_EMAIL and PALDORA_UI_PASSWORD (use apps/ios/scripts/ui-test.sh).")
            throw XCTSkip("missing credentials")
        }
        let app = XCUIApplication()
        app.launchEnvironment["PALDORA_UI_RESET_SESSION"] = "1"
        environment.forEach { app.launchEnvironment[$0.key] = $0.value }
        app.launch()
        let emailField = app.textFields["email-field"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 30), "Sign-in screen did not appear")
        focusAndType(email, into: emailField, app: app)
        focusAndType(password, into: app.secureTextFields["password-field"], app: app)
        app.buttons["sign-in-button"].tap()
        XCTAssertTrue(app.tabBars.buttons["Profile"].waitForExistence(timeout: 30), "Tab shell did not appear")
        return app
    }
}

extension XCTestCase {
    /// Taps until the field has keyboard focus (the first tap can race the launch), then types.
    func focusAndType(_ text: String, into field: XCUIElement, app: XCUIApplication) {
        for _ in 0..<4 {
            field.tap()
            if (field.value(forKey: "hasKeyboardFocus") as? Bool) == true { break }
            if app.keyboards.firstMatch.waitForExistence(timeout: 2) { break }
        }
        field.typeText(text)
    }
}

extension XCUIApplication {
    /// Any element by accessibility identifier, whatever its type.
    func element(_ id: String) -> XCUIElement {
        descendants(matching: .any).matching(identifier: id).firstMatch
    }

    /// Any element whose identifier matches and whose label contains `text`.
    func element(_ id: String, containing text: String) -> XCUIElement {
        descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@", id, text)).firstMatch
    }

    func type(_ text: String, into id: String, timeout: TimeInterval = 15) {
        let field = element(id)
        XCTAssertTrue(field.waitForExistence(timeout: timeout), "\(id) did not appear")
        field.tap()
        field.typeText(text)
    }

    /// Taps `tapElement` until `target` exists; the first tap right after launch can be lost.
    func tap(_ tapElement: XCUIElement, until target: XCUIElement, attempts: Int = 3) {
        for _ in 0..<attempts where !target.exists {
            if tapElement.isHittable { tapElement.tap() }
            _ = target.waitForExistence(timeout: 6)
        }
    }

    /// Swipes up until the element is hittable (bounded).
    func scrollToReveal(_ element: XCUIElement, attempts: Int = 6) {
        var tries = 0
        while !element.isHittable && tries < attempts {
            swipeUp()
            tries += 1
        }
    }
}
