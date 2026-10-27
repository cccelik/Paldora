import XCTest

/// Friend request and Life Update flows against the local emulators. The peer
/// account is a second seeded fixture (PALDORA_UI_PEER_USERNAME).
final class SocialFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testSendFriendRequestToPeer() throws {
        let app = try launchSignedIn()
        guard let peer = ProcessInfo.processInfo.environment["PALDORA_UI_PEER_USERNAME"], !peer.isEmpty else {
            XCTFail("Set PALDORA_UI_PEER_USERNAME (use apps/ios/scripts/ui-test.sh).")
            return
        }
        let link = app.buttons["friends-link"]
        app.tap(app.tabBars.buttons["Profile"], until: link)
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        link.tap()
        app.type(peer, into: "friend-username-field")
        app.buttons["send-friend-request"].tap()
        XCTAssertTrue(app.element("friends-notice", containing: "Friend request sent").waitForExistence(timeout: 20),
                      "Friend request was not confirmed")
        let waiting = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@\(peer)")).firstMatch
        app.scrollToReveal(waiting)
        XCTAssertTrue(waiting.waitForExistence(timeout: 20), "Sent request not listed")
        // A repeat is one neutral failure, never an explanation.
        app.type(peer, into: "friend-username-field")
        app.buttons["send-friend-request"].tap()
        XCTAssertTrue(app.element("friends-notice", containing: "couldn't").waitForExistence(timeout: 20))
    }

    func testOnlyMeLifeUpdateCreateEditDelete() throws {
        let app = try launchSignedIn()
        let stamp = Int.random(in: 1000...9999)
        let text = "Lisbon trip \(stamp)"
        let link = app.buttons["life-updates-link"]
        app.tap(app.tabBars.buttons["Profile"], until: link)
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        link.tap()
        let plus = app.buttons["new-life-update"]
        XCTAssertTrue(plus.waitForExistence(timeout: 20))
        plus.tap()

        app.type(text, into: "section-travel")
        let onlyMe = app.switches["only-me-toggle"]
        app.scrollToReveal(onlyMe)
        onlyMe.tap()
        let publish = app.buttons["publish-life-update"]
        app.scrollToReveal(publish)
        publish.tap()

        // Back on the list: the new Life Update is there; open it.
        let row = app.element("my-life-update", containing: text)
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Life Update not listed")
        row.tap()
        XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 20))
        XCTAssertTrue(app.element("only-me-badge").exists, "Only Me badge missing")

        // Edit.
        app.buttons["life-update-actions"].tap()
        app.buttons["Edit"].tap()
        app.type(" edited", into: "section-travel")
        let save = app.buttons["save-life-update"]
        app.scrollToReveal(save)
        save.tap()
        let edited = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "edited", text)).firstMatch
        XCTAssertTrue(edited.waitForExistence(timeout: 30), "Edit not shown")

        // Delete.
        app.buttons["life-update-actions"].tap()
        app.buttons["Delete"].tap()
        app.buttons["Delete Life Update"].tap()
        let gone = app.element("my-life-update", containing: text)
        XCTAssertTrue(app.buttons["new-life-update"].waitForExistence(timeout: 20))
        XCTAssertFalse(gone.waitForExistence(timeout: 5), "Deleted Life Update still listed")
    }
}
