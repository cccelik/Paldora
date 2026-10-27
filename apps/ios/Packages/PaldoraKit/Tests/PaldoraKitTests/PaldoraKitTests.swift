import Foundation
import Testing
@testable import PaldoraKit

/// Scripted transport that records calls.
private actor Recorder {
    var calls: [(CallableName, Data?)] = []
    func record(_ name: CallableName, _ data: Data?) { calls.append((name, data)) }
}

private struct FakeTransport: CallableTransport {
    let recorder = Recorder()
    let handler: @Sendable (CallableName) throws -> Data

    func call(_ name: CallableName, data: Data?) async throws -> Data {
        await recorder.record(name, data)
        return try handler(name)
    }
}

private func json(_ text: String) -> Data { Data(text.utf8) }

@Suite("Primitives")
struct PrimitivesTests {
    @Test func epochMillisConvertsToDateAndBack() throws {
        let ms = EpochMillis(1_790_000_000_123)
        #expect(ms.date.timeIntervalSince1970 == 1_790_000_000.123)
        #expect(EpochMillis(date: ms.date) == ms)
        let decoded = try JSONDecoder().decode(EpochMillis.self, from: json("1790000000000"))
        #expect(decoded.rawValue == 1_790_000_000_000)
        #expect(try JSONEncoder().encode(decoded) == json("1790000000000"))
    }

    @Test func cursorsPassThroughUntouched() throws {
        let cursor = "eyJhdCI6MTc5MDAwMDAwMDAwMCwiaWQiOiJwX3N5bnRoZXRpYyJ9=="
        let page = try JSONDecoder().decode(
            Page<Box>.self, from: json(#"{"items":[],"nextCursor":"\#(cursor)"}"#))
        #expect(page.nextCursor == cursor)
        let body = try JSONEncoder().encode(CursorRequest(cursor: page.nextCursor))
        #expect(try JSONDecoder().decode(CursorRequest.self, from: body).cursor == cursor)
        #expect(try JSONEncoder().encode(CursorRequest()) == json("{}"))
        let last = try JSONDecoder().decode(Page<Box>.self, from: json(#"{"items":[],"nextCursor":null}"#))
        #expect(last.nextCursor == nil)
    }

    @Test func nullableBioDistinguishesAbsentFromClear() throws {
        let sort = JSONEncoder()
        sort.outputFormatting = .sortedKeys
        #expect(try sort.encode(UpdateMyProfileRequest(displayName: "A")) == json(#"{"displayName":"A"}"#))
        #expect(try sort.encode(UpdateMyProfileRequest(bio: .some(nil))) == json(#"{"bio":null}"#))
        #expect(try sort.encode(UpdateMyProfileRequest(bio: .some("hi"))) == json(#"{"bio":"hi"}"#))
    }

    @Test func roomSavesAlwaysSendTheLoadedVersionAndClearWithNull() throws {
        let sort = JSONEncoder()
        sort.outputFormatting = .sortedKeys
        #expect(
            try sort.encode(UpdateMyRoomRequest(expectedUpdatedAt: nil, sparkles: true))
                == json(#"{"expectedUpdatedAt":null,"sparkles":true}"#))
        #expect(
            try sort.encode(
                UpdateMyRoomRequest(
                    expectedUpdatedAt: EpochMillis(5), accent: .some(nil), music: .some(nil), bannerMediaId: .some("m")))
                == json(#"{"accent":null,"bannerMediaId":"m","expectedUpdatedAt":5,"music":null}"#))
        #expect(
            try sort.encode(UpdateMyRoomTopFriendsRequest(userIds: [], size: 4, visibility: "hidden", expectedUpdatedAt: nil))
                == json(#"{"expectedUpdatedAt":null,"size":4,"userIds":[],"visibility":"hidden"}"#))
        #expect(RoomCatalog.themePresets.count == 14)
    }

    @Test func clearingAReactionSendsExplicitNull() throws {
        let body = try JSONEncoder().encode(SetBoxReactionRequest(boxId: "b", postId: "p", kind: nil))
        let object = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(object["kind"] is NSNull)
    }

    @Test func unknownEnumValuesDoNotBreakPages() throws {
        let type = try JSONDecoder().decode(NotificationType.self, from: json(#""post.share""#))
        #expect(type == .unknown("post.share"))
        let item = try JSONDecoder().decode(FeedItem.self, from: json(#"{"kind":"poll","id":"x"}"#))
        #expect(item == .unsupported(kind: "poll"))
    }
}

@Suite("Errors")
struct ErrorTests {
    @Test func allSeventeenCodesMapAndRoundTrip() {
        #expect(PaldoraError.knownCodes.count == 17)
        for code in PaldoraError.knownCodes {
            let error = PaldoraError(code: code)
            #expect(error.isRecognized)
            #expect(error.code == code)
        }
        #expect(PaldoraError(code: "not-found") == .notFound)
        #expect(PaldoraError(code: "data-loss") == .dataLoss)
    }

    @Test func unknownCodeIsKept() {
        #expect(PaldoraError(code: "teapot") == .unrecognized("teapot"))
        #expect(!PaldoraError(code: "teapot").isRecognized)
    }

    @Test func reasonsAreOptionalAndTolerant() {
        let known = PaldoraFailure(TransportError(code: "resource-exhausted", reason: "RATE_LIMITED"))
        #expect(known.error == .resourceExhausted)
        #expect(known.reason == .rateLimited)
        let stale = PaldoraFailure(TransportError(code: "failed-precondition", reason: "STALE_WRITE"))
        #expect(stale.error == .failedPrecondition)
        #expect(stale.reason == .staleWrite)
        #expect(PaldoraFailure(TransportError(code: "unauthenticated")).reason == nil)
        #expect(PaldoraFailure(TransportError(code: "unauthenticated", reason: "FUTURE_REASON")).reason == nil)
        for reason in ErrorReason.allCases {
            #expect(ErrorReason(rawValue: reason.rawValue) == reason)
        }
    }
}

@Suite("PaldoraAPI")
struct APITests {
    @Test func typedCallEncodesRequestAndDecodesResponse() async throws {
        let transport = FakeTransport { name in
            #expect(name == .createBox)
            return json(#"""
            {"id":"b1","name":"Crew","status":"active","currentUserRole":"owner",
             "memberCount":1,"createdAt":1790000000000,"updatedAt":1790000000500,"extra":true}
            """#)
        }
        let api = PaldoraAPI(transport: transport)
        let box = try await api.createBox(name: "Crew")
        #expect(box.currentUserRole == .owner)
        #expect(box.updatedAt.date.timeIntervalSince1970 == 1_790_000_000.5)
        let calls = await transport.recorder.calls
        #expect(calls.count == 1)
        #expect(calls.first?.1 == json(#"{"name":"Crew"}"#))
    }

    @Test func emptyRequestsSendAnEmptyObject() async throws {
        let transport = FakeTransport { _ in json(#"{"count":3,"capped":false}"#) }
        let count = try await PaldoraAPI(transport: transport).countMyUnreadNotifications()
        #expect(count.count == 3)
        #expect(await transport.recorder.calls.first?.1 == json("{}"))
    }

    @Test func transportErrorsBecomeFailures() async {
        let transport = FakeTransport { _ in
            throw TransportError(code: "not-found", reason: nil)
        }
        do {
            _ = try await PaldoraAPI(transport: transport).getBox(boxId: "x")
            Issue.record("expected a failure")
        } catch let failure as PaldoraFailure {
            #expect(failure.error == .notFound)
            #expect(failure.reason == nil)
        } catch {
            Issue.record("unexpected \(error)")
        }
    }

    @Test func malformedResponseIsAContractError() async {
        let transport = FakeTransport { _ in json(#"{"nope":1}"#) }
        do {
            _ = try await PaldoraAPI(transport: transport).getBox(boxId: "x")
            Issue.record("expected a failure")
        } catch let error as ContractError {
            #expect(error == .malformedResponse(.getBox))
        } catch {
            Issue.record("unexpected \(error)")
        }
    }

    @Test func otherErrorsPassThrough() async {
        let transport = FakeTransport { _ in throw CancellationError() }
        do {
            _ = try await PaldoraAPI(transport: transport).markAllNotificationsRead()
            Issue.record("expected cancellation")
        } catch {
            #expect(error is CancellationError)
        }
    }

    @Test func homeFeedForwardsTheCursorVerbatim() async throws {
        let transport = FakeTransport { _ in json(#"{"items":[],"nextCursor":null}"#) }
        _ = try await PaldoraAPI(transport: transport).getHomeFeed(cursor: "abc==")
        #expect(await transport.recorder.calls.first?.1 == json(#"{"cursor":"abc=="}"#))
        #expect(await transport.recorder.calls.first?.0 == .getHomeFeed)
    }
}

@Suite("Account safety")
struct AccountSafetyTests {
    @Test func passwordsNeverAppearInDescriptions() {
        let change = ChangeMyPasswordRequest(currentPassword: "old-secret-1", newPassword: "new-secret-22")
        let confirm = PasswordConfirmationRequest(password: "hunter2-secret")
        for text in [String(describing: change), String(reflecting: change), String(describing: confirm), String(reflecting: confirm)] {
            #expect(!text.contains("secret"))
        }
    }

    @Test func reportWithoutDetailSendsExplicitNull() throws {
        let body = try JSONEncoder().encode(ReportBoxCommentRequest(commentId: "c1", category: .spam))
        let object = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(object["detail"] is NSNull)
        #expect(object["category"] as? String == "spam")
    }

    @Test func exportAndDeletionCallsUseTheirCallables() async throws {
        let transport = FakeTransport { name in
            switch name {
            case .getAccountExport: return json(#"{"export":null}"#)
            case .getAccountDeletion: return json(#"{"deletion":null}"#)
            default: return json(#"{"ok":true,"signInRequired":true}"#)
            }
        }
        let api = PaldoraAPI(transport: transport)
        #expect(try await api.getAccountExport() == nil)
        #expect(try await api.getAccountDeletion() == nil)
        let ended = try await api.signOutEverywhere()
        #expect(ended.signInRequired)
        let calls = await transport.recorder.calls.map(\.0)
        #expect(calls == [.getAccountExport, .getAccountDeletion, .signOutEverywhere])
    }
}

@Suite("Box management and comment threads")
struct BoxManagementTests {
    @Test func updateBoxOmitsAbsentKeys() throws {
        let sort = JSONEncoder()
        sort.outputFormatting = .sortedKeys
        #expect(try sort.encode(UpdateBoxRequest(boxId: "b", name: "N")) == json(#"{"boxId":"b","name":"N"}"#))
        #expect(try sort.encode(UpdateBoxRequest(boxId: "b", status: .archived)) == json(#"{"boxId":"b","status":"archived"}"#))
    }

    @Test func memberCallsUseTheirCallables() async throws {
        let transport = FakeTransport { _ in json(#"{"ok":true}"#) }
        let api = PaldoraAPI(transport: transport)
        _ = try await api.setBoxMemberRole(SetBoxMemberRoleRequest(boxId: "b", memberUid: "u", role: .admin))
        _ = try await api.removeBoxMember(BoxMemberReference(boxId: "b", memberUid: "u"))
        _ = try await api.transferBoxOwnership(BoxMemberReference(boxId: "b", memberUid: "u"))
        _ = try await api.leaveBox(boxId: "b")
        _ = try await api.cancelFriendRequest(requestId: "r")
        _ = try await api.deleteAvatar()
        let calls = await transport.recorder.calls.map(\.0)
        #expect(calls == [.setBoxMemberRole, .removeBoxMember, .transferBoxOwnership, .leaveBox, .cancelFriendRequest, .deleteAvatar])
    }

    @Test func threadItemsDecodePlaceholdersAndUnknownKinds() throws {
        let thread = try JSONDecoder().decode(
            CommentThread.self,
            from: json(#"""
            {"root":{"kind":"deleted","id":"c1","createdAt":1},"rootId":"c1",
             "replies":[{"kind":"hidden","id":"c2","createdAt":2},{"kind":"sticker","id":"c3"}],"replyCount":2}
            """#))
        #expect(thread.root == .deleted(id: "c1", createdAt: EpochMillis(1)))
        #expect(thread.replies == [.hidden(id: "c2", createdAt: EpochMillis(2)), .unsupported(kind: "sticker")])
        #expect(thread.replyCount == 2)
    }
}
