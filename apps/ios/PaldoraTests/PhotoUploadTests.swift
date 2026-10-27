import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct PhotoUploadTests {
    private let image = ImagePreparerTests.sourceJPEG(width: 300, height: 200, withGPS: true)

    private func harness(
        polls: [Data] = [JSON.asset(status: "ready", available: true)],
        media: FakeMediaClient = FakeMediaClient(),
        completeFails: Ref<Bool> = Ref(false)
    ) async -> (FeatureHarness, Ref<Int>, Ref<[[String: Any]]>) {
        let pollIndex = Ref(0)
        let reservations = Ref<[[String: Any]]>([])
        let h = await FeatureHarness(media: media) { name, data in
            switch name {
            case .createMediaUpload:
                reservations.append(JSON.body(data))
                return JSON.reservation(id: "m\(reservations.value.count)")
            case .completeMediaUpload:
                if completeFails.value { throw failure("unavailable") }
                return JSON.mediaAsset()
            case .getMediaAsset:
                defer { pollIndex.value += 1 }
                return polls[min(pollIndex.value, polls.count - 1)]
            default: return JSON.data(["ok": true])
            }
        }
        return (h, pollIndex, reservations)
    }

    @Test func happyPathUploadsThenWaitsForProcessing() async {
        let (h, polls, reservations) = await harness(polls: [JSON.asset(status: "processing", available: false),
                                                              JSON.asset(status: "ready", available: true, id: "m1")])
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add([image])
        await attachments.settled()
        #expect(attachments.readyAssetIds == ["m1"])
        #expect(polls.value == 2)
        let request = reservations.value[0]
        #expect(request["purpose"] as? String == "post_image")
        #expect(request["boxId"] as? String == "b1")
        #expect(request["contentType"] as? String == "image/jpeg")
        // Exact length: the reserved count is the uploaded count.
        let h2 = h.transport.calls
        #expect(h2 == [.getMyProfile, .createMediaUpload, .completeMediaUpload, .getMediaAsset, .getMediaAsset])
    }

    @Test func uploadedLengthMatchesTheReservation() async {
        let media = FakeMediaClient()
        let (h, _, reservations) = await harness(media: media)
        let attachments = PhotoAttachments(env: h.env, purpose: .avatar, limit: 1, timing: .instant)
        attachments.add([image])
        await attachments.settled()
        #expect(media.uploads.first?.size == reservations.value[0]["contentLength"] as? Int)
        #expect(reservations.value[0]["boxId"] == nil)
    }

    @Test func transientUploadFailureRetriesWithTheSameReservation() async {
        let media = FakeMediaClient()
        media.failNextUpload(.transient)
        let (h, _, reservations) = await harness(media: media)
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add([image])
        await attachments.settled()
        guard case .failed(let message) = attachments.items[0].state else { Issue.record("expected failure"); return }
        #expect(message == UserMessages.unavailable)
        attachments.items[0].retry()
        await attachments.settled()
        #expect(attachments.readyAssetIds == ["m1"])
        #expect(reservations.value.count == 1)
    }

    @Test func rejectedReservationIsReplacedOnRetry() async {
        let media = FakeMediaClient()
        media.failNextUpload(.rejected)
        let (h, _, reservations) = await harness(media: media)
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add([image])
        await attachments.settled()
        attachments.items[0].retry()
        await attachments.settled()
        #expect(reservations.value.count == 2)
        #expect(attachments.readyAssetIds == ["m2"])
    }

    @Test func slowProcessingEndsHonestlyAndRetryKeepsPolling() async {
        let (h, polls, reservations) = await harness(polls: [JSON.asset(status: "processing", available: false),
                                                              JSON.asset(status: "processing", available: false),
                                                              JSON.asset(status: "processing", available: false),
                                                              JSON.asset(status: "ready", available: true)])
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add([image])
        await attachments.settled()
        guard case .failed(let message) = attachments.items[0].state else { Issue.record("expected failure"); return }
        #expect(message.contains("Still processing"))
        attachments.items[0].retry()
        await attachments.settled()
        #expect(attachments.readyAssetIds == ["m1"])
        #expect(reservations.value.count == 1 && polls.value == 4)
    }

    @Test func unreadablePhotoFailsBeforeAnyNetworkCall() async {
        let (h, _, reservations) = await harness()
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add([Data("nope".utf8)])
        await attachments.settled()
        guard case .failed = attachments.items[0].state else { Issue.record("expected failure"); return }
        #expect(reservations.value.isEmpty)
    }

    @Test func limitsToFourPhotos() async {
        let (h, _, _) = await harness()
        let attachments = PhotoAttachments(env: h.env, purpose: .postImage(boxId: "b1"), timing: .instant)
        attachments.add(Array(repeating: image, count: 6))
        #expect(attachments.items.count == 4 && attachments.remaining == 0)
        await attachments.settled()
    }

    @Test func rateLimitedReservationShowsFriendlyMessage() async {
        let h = await FeatureHarness { name, _ in
            if name == .createMediaUpload { throw failure("resource-exhausted", "RATE_LIMITED") }
            return JSON.data(["ok": true])
        }
        let attachments = PhotoAttachments(env: h.env, purpose: .avatar, limit: 1, timing: .instant)
        attachments.add([image])
        await attachments.settled()
        #expect(attachments.items[0].state == .failed(UserMessages.rateLimited))
    }

    @Test func publishAttachesReadyPhotosAndAllowsPhotoOnlyPosts() async {
        let sent = Ref<[String: Any]>([:])
        let media = FakeMediaClient()
        let h = await FeatureHarness(media: media) { name, data in
            switch name {
            case .createMediaUpload: return JSON.reservation(id: "m1")
            case .completeMediaUpload: return JSON.mediaAsset()
            case .getMediaAsset: return JSON.asset(status: "ready", available: true)
            case .createBoxPost: sent.value = JSON.body(data); return JSON.data(["postId": "p9"])
            case .getBox: return JSON.data(JSON.box())
            default: return JSON.page([])
            }
        }
        let model = BoxDetailViewModel(env: h.env, boxId: "b1")
        await model.load()
        #expect(!model.canSubmit)
        model.attachments.add([image])
        await model.attachments.settled()
        #expect(model.canSubmit)
        await model.publish()
        #expect(sent.value["mediaAssetIds"] as? [String] == ["m1"])
        #expect(sent.value["text"] as? String == "")
        #expect(model.attachments.items.isEmpty)
    }

    @Test func sessionEndedDuringUploadSignsOut() async {
        let media = FakeMediaClient()
        media.failNextUpload(.unauthenticated)
        let (h, _, _) = await harness(media: media)
        let attachments = PhotoAttachments(env: h.env, purpose: .avatar, limit: 1, timing: .instant)
        attachments.add([image])
        await attachments.settled()
        #expect(h.model.state == .signedOut)
    }
}
