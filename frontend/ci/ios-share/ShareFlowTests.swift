import XCTest

final class ShareFlowTests: XCTestCase {
    @MainActor private func evidence(_ name: String, app: XCUIApplication) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility"
        tree.lifetime = .keepAlways
        add(tree)
    }

    @MainActor private func target(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Mizan’a Gönder")).firstMatch
    }

    @MainActor func testRealPDFShareTarget() throws {
        continueAfterFailure = false
        let host = XCUIApplication(bundleIdentifier: "com.faraday.ci.PDFShareProbe")
        host.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        host.launch()
        XCTAssertTrue(host.buttons["shareSyntheticPDF"].waitForExistence(timeout: 15))
        host.buttons["shareSyntheticPDF"].tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        var owner = host
        var activity = target(in: host)
        _ = host.collectionViews.firstMatch.waitForExistence(timeout: 10)
        for _ in 0..<4 where !activity.waitForExistence(timeout: 1) {
            if target(in: springboard).exists { owner = springboard; activity = target(in: springboard); break }
            let more = host.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "More", "Daha Fazla")).firstMatch
            if more.exists && more.isHittable { more.tap(); break }
            for collection in host.collectionViews.allElementsBoundByIndex where collection.isHittable { collection.swipeLeft() }
        }
        if !activity.exists { activity = target(in: owner) }
        if !activity.exists && target(in: springboard).exists { owner = springboard; activity = target(in: springboard) }
        evidence("Real system PDF Share Sheet", app: owner)
        if owner === host { evidence("System activity accessibility", app: springboard) }
        XCTAssertTrue(activity.waitForExistence(timeout: 15), "Mizan’a Gönder must exist in the real OS activity list")
        activity.tap()
        let ready = owner.staticTexts["PDF’ler Mizan’a hazır. Mizan’ı açtığında içe aktarma başlayacak."]
        let appeared = ready.waitForExistence(timeout: 30)
        evidence("Actual Mizan Share Extension result", app: owner)
        XCTAssertTrue(appeared, "The real extension must save the OS-provided PDF")
        let done = owner.buttons["Bitti"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
    }

    @MainActor func testForegroundAutomaticallyImportsDelivery() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.faraday.followfinance")
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let skip = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Kurulumu atla")).firstMatch
        if skip.waitForExistence(timeout: 15) { skip.tap() }
        let result = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1 işlem eklendi")).firstMatch
        let imported = result.waitForExistence(timeout: 60)
        evidence("Mizan foreground automatic import", app: app)
        XCTAssertTrue(imported, "Foregrounding Mizan must import the pending synthetic statement through the real UI")
        let close = app.buttons["Kapat"].firstMatch
        if close.exists && close.isHittable {
            close.tap()
        } else {
            let done = app.buttons["Bitti"].firstMatch
            for _ in 0..<4 where !done.isHittable { app.swipeUp() }
            XCTAssertTrue(done.isHittable)
            done.tap()
        }
    }
}
