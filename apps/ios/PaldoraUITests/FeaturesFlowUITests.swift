import XCTest

/// Box, post, Home, comment and reaction flow against the local emulators.
final class FeaturesFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCreateBoxPostOpenFromHomeCommentAndReact() throws {
        // PALDORA_UI_TEST_IMAGE enables the DEBUG-only generated test photo (never in Release).
        let app = try launchSignedIn(environment: ["PALDORA_UI_TEST_IMAGE": "1"])
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
        // Attach a generated photo: upload, process, then wait until it is ready.
        let attach = app.buttons["attach-test-photo"]
        XCTAssertTrue(attach.waitForExistence(timeout: 10), "Test photo button missing")
        attach.tap()
        XCTAssertTrue(app.staticTexts["Ready"].waitForExistence(timeout: 90), "Photo did not finish processing")
        app.buttons["publish-post"].tap()
        XCTAssertTrue(app.element("box-post", containing: postText).waitForExistence(timeout: 20),
                      "Post did not appear in the Box")

        // Home: open it.
        app.tabBars.buttons["Home"].tap()
        let item = app.element("feed-item", containing: postText)
        XCTAssertTrue(item.waitForExistence(timeout: 30), "Post did not appear on Home")
        item.tap()
        XCTAssertTrue(app.staticTexts["post-text"].waitForExistence(timeout: 20))

        // The photo loads through the authenticated media client and opens full screen.
        let photo = app.buttons["post-photo"].firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 20), "Post photo missing")
        XCTAssertFalse(app.staticTexts["Photo unavailable"].waitForExistence(timeout: 5), "Photo showed the unavailable placeholder")
        photo.tap()
        XCTAssertTrue(app.buttons["close-photo"].waitForExistence(timeout: 10), "Viewer did not open")
        app.buttons["close-photo"].tap()

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

        // Camera reaction through the DEBUG test camera (the simulator has none).
        let camera = app.buttons["camera-reaction"]
        app.scrollToReveal(camera)
        XCTAssertTrue(camera.waitForExistence(timeout: 10), "Camera reaction entry missing")
        camera.tap()
        let take = app.buttons["take-photo"]
        XCTAssertTrue(take.waitForExistence(timeout: 20))
        take.tap()
        let sendCamera = app.buttons["send-camera-reaction"]
        XCTAssertTrue(sendCamera.waitForExistence(timeout: 10))
        sendCamera.tap()
        XCTAssertTrue(app.element("camera-sent").waitForExistence(timeout: 90), "Camera reaction was not sent")
        app.buttons["Close"].tap()

        // Notifications tab opens (own activity does not notify you).
        app.navigationBars.buttons.firstMatch.tap()
        app.tabBars.buttons["Notifications"].tap()
        let nothingNew = app.staticTexts["Nothing new"]
        XCTAssertTrue(nothingNew.waitForExistence(timeout: 20) || app.buttons["mark-all-read"].waitForExistence(timeout: 5))
    }
}
