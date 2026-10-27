import Foundation
import PaldoraKit
import Testing
@testable import Paldora

@MainActor
struct AppModelTests {
    private func model(
        auth: FakeAuth,
        _ handler: @escaping FakeTransport.Handler
    ) -> (AppModel, FakeTransport) {
        let transport = FakeTransport(handler)
        return (AppModel(auth: auth, api: PaldoraAPI(transport: transport)), transport)
    }

    @Test func startWithoutSessionIsSignedOut() async {
        let (model, transport) = model(auth: FakeAuth()) { _, _ in Fixtures.profileJSON() }
        await model.start()
        #expect(model.state == .signedOut)
        #expect(transport.calls.isEmpty)
    }

    @Test func startWithSessionLoadsProfile() async {
        let (model, transport) = model(auth: FakeAuth(hasSession: true)) { _, _ in Fixtures.profileJSON() }
        await model.start()
        #expect(model.profile?.profile.displayName == "Mira")
        #expect(model.preferences?.appearance == .system)
        #expect(transport.calls == [.getMyProfile])
    }

    @Test func signInLoadsProfile() async {
        let (model, _) = model(auth: FakeAuth()) { _, _ in Fixtures.profileJSON() }
        await model.start()
        await model.signIn(email: " mira@example.invalid ", password: "pw")
        #expect(model.profile != nil)
        #expect(model.signInError == nil)
    }

    @Test func wrongPasswordShowsNeutralError() async {
        let auth = FakeAuth()
        auth.signInResult = .failure(.invalidCredentials)
        let (model, transport) = model(auth: auth) { _, _ in Fixtures.profileJSON() }
        await model.start()
        await model.signIn(email: "a@b.c", password: "bad")
        #expect(model.state == .signedOut)
        #expect(model.signInError == UserMessages.invalidCredentials)
        #expect(transport.calls.isEmpty)
    }

    @Test func emptyFieldsAreRejectedLocally() async {
        let (model, _) = model(auth: FakeAuth()) { _, _ in Fixtures.profileJSON() }
        await model.start()
        await model.signIn(email: "  ", password: "")
        #expect(model.signInError == UserMessages.signInMissing)
    }

    @Test(arguments: ["SESSION_ENDED", "SIGN_IN_REQUIRED"])
    func endedSessionSignsOutWithNotice(reason: String) async {
        let auth = FakeAuth(hasSession: true)
        let (model, _) = model(auth: auth) { _, _ in
            throw TransportError(code: "unauthenticated", reason: reason)
        }
        await model.start()
        #expect(model.state == .signedOut)
        #expect(model.notice == UserMessages.sessionEnded)
        #expect(auth.signOutCount == 1)
    }

    @Test func unprovisionedAccountIsNotReady() async {
        let (model, _) = model(auth: FakeAuth(hasSession: true)) { _, _ in
            throw TransportError(code: "not-found")
        }
        await model.start()
        #expect(model.state == .accountNotReady)
    }

    @Test func incompleteOnboardingIsNotReady() async {
        let (model, _) = model(auth: FakeAuth(hasSession: true)) { _, _ in
            Fixtures.profileJSON(onboarding: "profile")
        }
        await model.start()
        #expect(model.state == .accountNotReady)
    }

    @Test func transientLoadFailureOffersRetry() async {
        let (model, transport) = model(auth: FakeAuth(hasSession: true)) { _, _ in
            throw TransportError(code: "unavailable")
        }
        await model.start()
        #expect(model.state == .profileUnavailable(UserMessages.unavailable))
        transport.set { _, _ in Fixtures.profileJSON() }
        await model.loadProfile()
        #expect(model.profile != nil)
    }

    @Test func signOutReturnsToSignedOut() async {
        let auth = FakeAuth(hasSession: true)
        let (model, _) = model(auth: auth) { _, _ in Fixtures.profileJSON() }
        await model.start()
        model.signOut()
        #expect(model.state == .signedOut)
        #expect(model.preferences == nil)
        #expect(model.notice == nil)
    }

    @Test func saveProfileUpdatesState() async {
        let (model, transport) = model(auth: FakeAuth(hasSession: true)) { name, data in
            if name == .updateMyProfile {
                let body = try JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any]
                #expect(body?["displayName"] as? String == "Mira R")
                #expect(body?["bio"] is NSNull)
                return Fixtures.profileJSON(name: "Mira R")
            }
            return Fixtures.profileJSON()
        }
        await model.start()
        let failure = await model.saveProfile(displayName: " Mira R ", bio: "  ")
        #expect(failure == nil)
        #expect(model.profile?.profile.displayName == "Mira R")
        #expect(transport.calls.last == .updateMyProfile)
    }

    @Test func rateLimitedSaveShowsFriendlyRetryAndStaysSignedIn() async {
        let (model, transport) = model(auth: FakeAuth(hasSession: true)) { _, _ in Fixtures.profileJSON() }
        await model.start()
        transport.set { _, _ in throw TransportError(code: "resource-exhausted", reason: "RATE_LIMITED") }
        let failure = await model.saveProfile(displayName: "X", bio: "")
        #expect(failure == UserMessages.rateLimited)
        #expect(model.profile != nil)
    }

    @Test func saveWithEndedSessionSignsOut() async {
        let auth = FakeAuth(hasSession: true)
        let (model, transport) = model(auth: auth) { _, _ in Fixtures.profileJSON() }
        await model.start()
        transport.set { _, _ in throw TransportError(code: "unauthenticated", reason: "SESSION_ENDED") }
        let failure = await model.saveProfile(displayName: "X", bio: "")
        #expect(failure == UserMessages.sessionEnded)
        #expect(model.state == .signedOut)
    }

    @Test func savePreferencesStoresServerResult() async {
        let (model, transport) = model(auth: FakeAuth(hasSession: true)) { _, _ in Fixtures.profileJSON() }
        await model.start()
        transport.set { _, _ in Fixtures.preferencesJSON(appearance: "dark") }
        let failure = await model.savePreferences(appearance: .dark)
        #expect(failure == nil)
        #expect(model.preferences?.appearance == .dark)
        #expect(RootView.colorScheme(model.preferences?.appearance) == .dark)
    }

    @Test func notConfiguredModelNeverStartsAuth() async {
        let model = AppModel(auth: nil, api: nil, configurationIssue: .hostedNotConfigured)
        await model.start()
        #expect(model.state == .notConfigured(.hostedNotConfigured))
    }
}
