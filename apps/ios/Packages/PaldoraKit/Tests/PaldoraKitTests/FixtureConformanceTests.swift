import Foundation
import Testing
@testable import PaldoraKit

/// Callables that exist in `contracts/native/fixtures` but have no typed Swift
/// handling yet. Adding a callable to the contract without covering it here (or
/// listing it with a reason) fails `everyFixtureCallableIsHandledOrAllowlisted`.
/// Empty today: all 72 callables are typed.
private let notYetCovered: [String: String] = [:]

private let repoRoot: URL = {
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<7 { url.deleteLastPathComponent() }
    return url
}()

private let fixturesDirectory = repoRoot.appendingPathComponent("contracts/native/fixtures")

private struct Fixture {
    let callable: String
    let requestValid: [Any]
    let responseValid: [Any]
    let errorCodes: [String]

    init(url: URL) throws {
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let root = try #require(object as? [String: Any])
        callable = try #require(root["callable"] as? String)
        let request = root["request"] as? [String: Any]
        let response = root["response"] as? [String: Any]
        requestValid = request?["valid"] as? [Any] ?? []
        responseValid = response?["valid"] as? [Any] ?? []
        errorCodes = (root["errors"] as? [[String: Any]] ?? []).compactMap { $0["code"] as? String }
    }
}

private func loadFixtures() throws -> [Fixture] {
    let files = try FileManager.default.contentsOfDirectory(at: fixturesDirectory, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "json" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    return try files.map(Fixture.init(url:))
}

private func data(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])
}

private func jsonEqual(_ lhs: Data, _ rhs: Data) throws -> Bool {
    let a = try JSONSerialization.jsonObject(with: lhs, options: .fragmentsAllowed)
    let b = try JSONSerialization.jsonObject(with: rhs, options: .fragmentsAllowed)
    return (a as AnyObject).isEqual(b)
}

/// Adds an unknown key to a JSON object so tolerance of new fields is exercised.
private func withUnknownKey(_ value: Any) -> Any {
    guard var object = value as? [String: Any] else { return value }
    object["zzUnknownFutureKey"] = ["nested": 1]
    return object
}

private func withoutNullParentId(_ value: Any) -> Any {
    guard var object = value as? [String: Any], object["parentId"] is NSNull else { return value }
    object["parentId"] = nil
    return object
}

private func check<C: CallableContract>(_ contract: C.Type, fixture: Fixture) throws {
    let name = fixture.callable
    for raw in fixture.requestValid {
        let original = try data(raw)
        // `parentId: null` and an omitted `parentId` mean the same (top-level comment).
        let canonical = try data(withoutNullParentId(raw))
        let decoded = try JSONDecoder().decode(C.Request.self, from: original)
        let encoded = try JSONEncoder().encode(decoded)
        #expect(try jsonEqual(canonical, encoded), "\(name): request encodes differently from fixture")
        #expect(try JSONDecoder().decode(C.Request.self, from: encoded) == decoded, "\(name): request round trip")
    }
    for raw in fixture.responseValid {
        let decoded = try JSONDecoder().decode(C.Response.self, from: data(raw))
        let encoded = try JSONEncoder().encode(decoded)
        #expect(try JSONDecoder().decode(C.Response.self, from: encoded) == decoded, "\(name): response round trip")
        let tolerant = try JSONDecoder().decode(C.Response.self, from: data(withUnknownKey(raw)))
        #expect(tolerant == decoded, "\(name): unknown keys must be ignored")
    }
}

@Suite("Native contract fixtures")
struct FixtureConformanceTests {
    @Test func fixtureDirectoryResolves() throws {
        #expect(!(try loadFixtures()).isEmpty)
    }

    @Test func everyTypedCallableConformsToItsFixture() throws {
        let fixtures = Dictionary(uniqueKeysWithValues: try loadFixtures().map { ($0.callable, $0) })
        for contract in Contracts.all {
            let fixture = try #require(fixtures[contract.name.rawValue], "no fixture for \(contract.name.rawValue)")
            try check(contract, fixture: fixture)
        }
    }

    @Test func declaredErrorCodesAreRepresentable() throws {
        for fixture in try loadFixtures() {
            for code in fixture.errorCodes {
                let error = PaldoraError(code: code)
                #expect(error.isRecognized, "\(fixture.callable): \(code) not mapped")
                #expect(error.code == code)
                #expect(PaldoraError.knownCodes.contains(code))
            }
        }
    }

    @Test func everyFixtureCallableIsHandledOrAllowlisted() throws {
        let typed = Set(Contracts.all.map { $0.name.rawValue })
        for fixture in try loadFixtures() {
            #expect(
                typed.contains(fixture.callable) || notYetCovered[fixture.callable] != nil,
                "\(fixture.callable) has fixtures but no Swift contract; add it or list it in notYetCovered with a reason"
            )
        }
        for name in notYetCovered.keys {
            #expect(!typed.contains(name), "\(name) is typed now; remove it from notYetCovered")
        }
    }

    @Test func callableNamesMatchTheGeneratedSchema() throws {
        let url = repoRoot.appendingPathComponent("contracts/native/callables.schema.json")
        let root = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let callables = try #require(root["callables"] as? [String: Any])
        #expect(Set(callables.keys) == Set(CallableName.allCases.map(\.rawValue)))
        let reasons = try #require(root["errorReasons"] as? [String])
        #expect(Set(reasons) == Set(ErrorReason.allCases.map(\.rawValue)))
        #expect(Set(Contracts.all.map { $0.name }).count == Contracts.all.count)
    }
}
