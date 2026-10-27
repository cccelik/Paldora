import XCTest

/// My Room customize, save and reload, plus Memories, against the local emulators.
final class RoomsFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testChangeThemeSaveAndReload() throws {
        let app = try launchSignedIn()
        let customize = app.buttons["customize-room"]
        app.tap(app.tabBars.buttons["My Room"], until: customize)
        XCTAssertTrue(customize.waitForExistence(timeout: 30), "My Room did not load")
        XCTAssertTrue(app.element("room-canvas").exists, "Room canvas missing")
        customize.tap()

        // Pick a theme that differs from the current one.
        let picker = app.buttons["room-theme"]
        XCTAssertTrue(picker.waitForExistence(timeout: 20))
        let target = picker.label.contains("Lavender Dream") ? "Cyberpunk" : "Lavender Dream"
        picker.tap()
        let option = app.buttons[target]
        XCTAssertTrue(option.waitForExistence(timeout: 10), "Theme option \(target) missing")
        option.tap()

        let save = app.buttons["save-room"]
        app.scrollToReveal(save)
        XCTAssertTrue(save.isEnabled, "Changing the theme should enable Save")
        save.tap()
        XCTAssertTrue(app.element("room-saved").waitForExistence(timeout: 30), "Room was not saved")

        // Leave and reopen the editor: the saved theme is what the server returns.
        app.navigationBars.buttons.firstMatch.tap()
        let again = app.buttons["customize-room"]
        XCTAssertTrue(again.waitForExistence(timeout: 20))
        again.tap()
        let reloaded = app.buttons["room-theme"]
        XCTAssertTrue(reloaded.waitForExistence(timeout: 20))
        XCTAssertTrue(reloaded.label.contains(target), "Reloaded Room shows \(reloaded.label), expected \(target)")
    }

    func testOpenMemories() throws {
        let app = try launchSignedIn()
        let link = app.buttons["memories-link"]
        app.tap(app.tabBars.buttons["Profile"], until: link)
        app.scrollToReveal(link)
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        link.tap()
        XCTAssertTrue(app.element("memory-type").waitForExistence(timeout: 20), "Memories did not open")
        // Honest state: either memories or the empty message, never an error.
        let empty = app.staticTexts["No memories here"]
        let item = app.element("memory-item")
        XCTAssertTrue(empty.waitForExistence(timeout: 20) || item.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Try again"].exists)
    }
}
