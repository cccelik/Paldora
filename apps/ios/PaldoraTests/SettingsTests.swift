import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct SecurityTests {
    @Test func validationRequiresTenCharactersAndMatchingConfirmation() async {
        let h = await FeatureHarness { _, _ in JSON.data(["ok": true]) }
        let model = SecurityViewModel(env: h.env)
        model.current = "old-password"
        model.new = "short"
        model.confirm = "short"
        #expect(!model.canChange && model.newPasswordHint == "Use at least 10 characters.")
        model.new = "long-enough-1"
        model.confirm = "different-one"
        #expect(!model.canChange && model.newPasswordHint == "The two new passwords don't match.")
        model.confirm = "long-enough-1"
        #expect(model.canChange && model.newPasswordHint == nil)
        model.new = String(repeating: "a", count: SecurityViewModel.maxLength + 1)
        #expect(!model.canChange)
    }

    @Test func successSignsOutLocallyClearsFieldsAndShowsSignInAgain() async {
        let body = Ref<[String: Any]>([:])
        let h = await FeatureHarness { name, data in
            if name == .changeMyPassword { body.value = JSON.body(data) }
            return JSON.data(["ok": true, "signInRequired": true])
        }
        let model = SecurityViewModel(env: h.env)
        model.current = "old-password"; model.new = "brand-new-pass"; model.confirm = "brand-new-pass"
        await model.changePassword()
        #expect(body.value["currentPassword"] as? String == "old-password")
        #expect(body.value["newPassword"] as? String == "brand-new-pass")
        #expect(h.model.state == .signedOut && h.model.notice == UserMessages.passwordChanged)
        #expect(h.auth.signOutCount == 1)
        #expect(model.current.isEmpty && model.new.isEmpty && model.confirm.isEmpty)
    }

    @Test func wrongCurrentPasswordIsOneMessageAndKeepsTheSession() async {
        let h = await FeatureHarness { _, _ in throw failure("permission-denied") }
        let model = SecurityViewModel(env: h.env)
        model.current = "nope"; model.new = "brand-new-pass"; model.confirm = "brand-new-pass"
        await model.changePassword()
        #expect(model.error == UserMessages.wrongPassword)
        if case .signedIn = h.model.state {} else { Issue.record("should stay signed in") }
    }

    @Test func passwordsNeverAppearInDescriptions() {
        let change = ChangeMyPasswordRequest(currentPassword: "hunter2-secret", newPassword: "another-secret-1")
        let confirm = PasswordConfirmationRequest(password: "hunter2-secret")
        for text in [String(describing: change), String(reflecting: change), String(describing: confirm), "\(confirm)"] {
            #expect(!text.contains("secret") && text.contains("redacted"))
        }
    }

    @Test func signOutEverywhereSignsOutWithItsOwnNotice() async {
        let h = await FeatureHarness { _, _ in JSON.data(["ok": true, "signInRequired": true]) }
        await SecurityViewModel(env: h.env).signOutEverywhere()
        #expect(h.model.state == .signedOut && h.model.notice == UserMessages.signedOutEverywhere)
    }

    @Test func revokedSessionAfterAPasswordChangeElsewhereSignsOutNeutrally() async {
        let h = await FeatureHarness { _, _ in throw failure("unauthenticated", "SESSION_ENDED") }
        _ = await h.model.saveProfile(displayName: "Mira", bio: "")
        #expect(h.model.state == .signedOut && h.model.notice == UserMessages.sessionEnded)
        let again = await FeatureHarness { _, _ in throw failure("unauthenticated", "SESSION_ENDED") }
        let model = SecurityViewModel(env: again.env)
        model.current = "x"; model.new = "long-enough-1"; model.confirm = "long-enough-1"
        await model.changePassword()
        #expect(again.model.state == .signedOut)
    }
}

@MainActor
struct ExportTests {
    private func export(_ status: String, id: String = "e1") -> Data {
        JSON.data(["export": ["id": id, "status": status, "createdAt": 1, "readyAt": (status == "ready" ? 2 : NSNull()) as Any, "expiresAt": 9]])
    }

    private func temp() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("paldora-test-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func requestPollsFromPendingToReady() async {
        let polls = Ref(0)
        let pending = export("pending"), ready = export("ready")
        let h = await FeatureHarness { name, _ in
            switch name {
            case .requestAccountExport: return pending
            case .getAccountExport: polls.value += 1; return polls.value >= 2 ? ready : pending
            default: return JSON.data(["ok": true])
            }
        }
        let model = ExportViewModel(env: h.env, directory: temp(), maxPolls: 5, pollInterval: .zero)
        await model.request()
        #expect(model.status == "ready" && model.canDownload && model.statusText == "Your archive is ready.")
    }

    @Test func statesMapToCopy() async {
        for (status, text) in [("expired", "Your last archive expired. Prepare a new one."),
                               ("failed", "That archive couldn't be prepared. Prepare a new one.")] {
            let data = export(status)
            let h = await FeatureHarness { _, _ in data }
            let model = ExportViewModel(env: h.env, directory: temp())
            await model.load()
            #expect(model.statusText == text && !model.canDownload && model.requestTitle == "Request an archive")
        }
        let none = await FeatureHarness { _, _ in JSON.data(["export": NSNull()]) }
        let model = ExportViewModel(env: none.env, directory: temp())
        await model.load()
        #expect(model.statusText == "No archive yet.")
    }

    @Test func downloadWritesAProtectedTempFileThatIsRemovedAfterSharing() async throws {
        let ready = export("ready")
        let media = FakeMediaClient()
        let dir = temp()
        let h = await FeatureHarness(media: media) { _, _ in ready }
        let model = ExportViewModel(env: h.env, directory: dir)
        await model.load()
        await model.download()
        let file = try #require(model.preparedFile)
        #expect(file.lastPathComponent.hasPrefix("paldora-data-") && file.pathExtension == "json")
        #expect((try FileManager.default.contentsOfDirectory(atPath: dir.path)).contains(file.lastPathComponent))
        #expect(try Data(contentsOf: file) == Data("{\"archive\":true}".utf8))
        #expect(media.fetches == ["export/e1"])
        model.finishSharing()
        #expect(model.preparedFile == nil && !FileManager.default.fileExists(atPath: file.path))
    }

    @Test func missingArchiveIsNeutralAndRefreshesStatus() async {
        let media = FakeMediaClient()
        media.exportHandler = { _ in throw MediaError.unavailable }
        let ready = export("ready"), expired = export("expired")
        let calls = Ref(0)
        let h = await FeatureHarness(media: media) { _, _ in calls.value += 1; return calls.value == 1 ? ready : expired }
        let model = ExportViewModel(env: h.env, directory: temp())
        await model.load()
        await model.download()
        #expect(model.error == "That archive isn't available anymore. Prepare a new one.")
        #expect(model.preparedFile == nil && model.status == "expired")
    }

    @Test func endedSessionDuringDownloadSignsOut() async {
        let media = FakeMediaClient()
        media.exportHandler = { _ in throw MediaError.unauthenticated }
        let ready = export("ready")
        let h = await FeatureHarness(media: media) { _, _ in ready }
        let model = ExportViewModel(env: h.env, directory: temp())
        await model.load()
        await model.download()
        #expect(h.model.state == .signedOut)
    }
}

@MainActor
struct DeletionTests {
    private func deletion(_ status: String) -> Data {
        JSON.data(["deletion": ["id": "g1", "status": status, "requestedAt": 1, "dueAt": 604_800_001, "cancelledAt": NSNull()]])
    }

    @Test func requestSchedulesAndClearsThePassword() async {
        let sent = Ref<[String: Any]>([:])
        let pending = deletion("pending")
        let h = await FeatureHarness { name, data in
            if name == .getAccountDeletion { return JSON.data(["deletion": NSNull()]) }
            sent.value = JSON.body(data); return pending
        }
        let model = DeletionViewModel(env: h.env)
        await model.load()
        #expect(model.deletion == nil && !model.isPending)
        model.password = "my-password"
        await model.request()
        #expect(sent.value["password"] as? String == "my-password")
        #expect(model.isPending && model.notice == DeletionViewModel.scheduled && model.password.isEmpty)
        if case .signedIn = h.model.state {} else { Issue.record("deletion request must not sign out") }
    }

    @Test func ownedBoxesShowTheBlockedState() async {
        let h = await FeatureHarness { name, _ in
            if name == .getAccountDeletion { return JSON.data(["deletion": NSNull()]) }
            throw failure("failed-precondition")
        }
        let model = DeletionViewModel(env: h.env)
        await model.load()
        model.password = "pw"
        await model.request()
        #expect(model.isBlockedState && model.error == DeletionViewModel.blockedMessage && model.password.isEmpty)
    }

    @Test func serverBlockedStatusIsBlockedToo() async {
        let blocked = deletion("blocked")
        let h = await FeatureHarness { _, _ in blocked }
        let model = DeletionViewModel(env: h.env)
        await model.load()
        #expect(model.isBlockedState && !model.isPending)
    }

    @Test func wrongPasswordIsOneMessage() async {
        let h = await FeatureHarness { name, _ in
            if name == .getAccountDeletion { return JSON.data(["deletion": NSNull()]) }
            throw failure("permission-denied")
        }
        let model = DeletionViewModel(env: h.env)
        await model.load()
        model.password = "wrong"
        await model.request()
        #expect(model.error == UserMessages.wrongPassword && !model.isBlockedState)
    }

    @Test func cancelWorksAndAClosedWindowSaysSo() async {
        let state = Ref("pending")
        let pending = deletion("pending"), cancelled = deletion("cancelled")
        let h = await FeatureHarness { name, _ in
            switch name {
            case .getAccountDeletion: return pending
            case .cancelAccountDeletion:
                if state.value == "closed" { throw failure("failed-precondition") }
                return cancelled
            default: return pending
            }
        }
        let model = DeletionViewModel(env: h.env)
        await model.load()
        state.value = "closed"
        model.password = "pw"
        await model.cancel()
        #expect(model.error == DeletionViewModel.windowClosed && model.isPending)
        state.value = "open"
        model.password = "pw"
        await model.cancel()
        #expect(model.notice == DeletionViewModel.cancelled && !model.isPending)
    }
}

@MainActor
struct SafetyTests {
    @Test func reportNeedsACategoryAndSendsNullDetailWhenEmpty() async {
        let sent = Ref<[String: Any]>([:])
        let h = await FeatureHarness { _, data in sent.value = JSON.body(data); return JSON.data(["reportId": "r1"]) }
        let model = ReportCommentViewModel(env: h.env, commentId: "c1")
        #expect(!model.canSend)
        model.category = .harassment
        await model.send()
        #expect(model.sent && sent.value["commentId"] as? String == "c1")
        #expect(sent.value["category"] as? String == "harassment" && sent.value["detail"] is NSNull)
    }

    @Test func detailIsTrimmedAndLimited() async {
        let sent = Ref<[String: Any]>([:])
        let h = await FeatureHarness { _, data in sent.value = JSON.body(data); return JSON.data(["reportId": "r1"]) }
        let model = ReportCommentViewModel(env: h.env, commentId: "c1")
        model.category = .spam
        model.detail = String(repeating: "a", count: ReportCommentViewModel.detailLimit + 1)
        #expect(!model.canSend)
        model.detail = "  rude  "
        await model.send()
        #expect(sent.value["detail"] as? String == "rude")
    }

    @Test func duplicateAbsentAndRateLimitedReportsAreHandled() async {
        let code = Ref("already-exists")
        let h = await FeatureHarness { _, _ in throw failure(code.value, code.value == "resource-exhausted" ? "RATE_LIMITED" : nil) }
        let model = ReportCommentViewModel(env: h.env, commentId: "c1")
        model.category = .privacy
        await model.send()
        #expect(model.error == ReportCopy.duplicate && !model.sent)
        code.value = "not-found"
        await model.send()
        #expect(model.error == "That comment isn't available anymore.")
        code.value = "resource-exhausted"
        await model.send()
        #expect(model.error == UserMessages.rateLimited)
    }

    @Test func receiptsAndNoticesListHonestly() async {
        let receipts = JSON.page([["id": "r1", "targetKind": "comment", "targetId": "c1", "category": "spam", "status": "closed", "createdAt": 1]])
        let notices = JSON.data(["items": [["targetKind": "post", "targetId": "p1", "originalCreatedAt": 1]]])
        let h = await FeatureHarness { name, _ in name == .listMyReports ? receipts : notices }
        let reports = makeMyReports(env: h.env)
        await reports.refresh()
        #expect(reports.items.map(\.id) == ["r1"])
        let list = makeNotices(env: h.env)
        await list.refresh()
        #expect(list.items.map(\.id) == ["post:p1"] && !list.hasMore)
        let empty = await FeatureHarness { _, _ in JSON.data(["items": [] as [Any], "nextCursor": NSNull()]) }
        let none = makeNotices(env: empty.env)
        await none.refresh()
        #expect(none.items.isEmpty && none.phase == .loaded)
        #expect(ReportCopy.categoryLabel("other") == "Something else" && ReportCopy.kind("user") == "Person")
    }
}
