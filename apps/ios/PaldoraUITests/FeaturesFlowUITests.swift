import XCTest

/// Box, post, Home, comment and reaction flow against the local emulators.
final class FeaturesFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCreateBoxPostOpenFromHomeCommentAndReact() throws {
        let app = try launchSignedIn()
        let stamp = Int.random(in: 1000...9999)
        let boxName = "UI Box \(stamp)"
        let postText = "UI post \(stamp)"
        let commentText = "UI comment \(stamp)"

        // Boxes: create one.
        app.tabBars.buttons["Boxes"].tap()
        let create = app.buttons["create-box"]
        XCTAssertTrue(create.waitForExistence(timeout: 20))
        create.tap()
        app.type(boxName, into: "box-name-field")
        app.buttons["create-box-submit"].tap()
        let row = app.element("box-row", containing: boxName)
        XCTAssertTrue(row.waitForExistence(timeout: 20), "New Box did not appear in the list")

        // Box detail: post text.
        // The sheet may still be dismissing; retry the tap until the detail opens.
        for _ in 0..<3 where !app.element("post-field").exists {
            if row.isHittable { row.tap() }
            _ = app.element("post-field").waitForExistence(timeout: 5)
        }
        app.type(postText, into: "post-field")
        app.buttons["publish-post"].tap()
        XCTAssertTrue(app.element("box-post", containing: postText).waitForExistence(timeout: 20),
                      "Post did not appear in the Box")

        // Home: open it.
        app.tabBars.buttons["Home"].tap()
        let item = app.element("feed-item", containing: postText)
        XCTAssertTrue(item.waitForExistence(timeout: 30), "Post did not appear on Home")
        item.tap()
        XCTAssertTrue(app.staticTexts["post-text"].waitForExistence(timeout: 20))

        // React with a preset, then comment.
        let thumbs = app.buttons["reaction-👍"]
        app.scrollToReveal(thumbs)
        XCTAssertTrue(thumbs.waitForExistence(timeout: 10), "Preset reaction missing")
        thumbs.tap()
        XCTAssertTrue(app.buttons["clear-reaction"].waitForExistence(timeout: 20), "Reaction was not applied")

        app.type(commentText, into: "comment-field")
        app.buttons["send-comment"].tap()
        XCTAssertTrue(app.staticTexts[commentText].waitForExistence(timeout: 20),
                      "Comment did not appear")

        // Notifications tab opens (own activity does not notify you).
        app.navigationBars.buttons.firstMatch.tap()
        app.tabBars.buttons["Notifications"].tap()
        XCTAssertTrue(app.buttons["mark-all-read"].waitForExistence(timeout: 20))
    }
}
