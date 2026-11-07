import PaldoraKit
import Testing
import UIKit
@testable import Paldora

struct FontTests {
    /// The bundled faces must register through UIAppFonts; otherwise every style
    /// silently uses the system fallback.
    @Test func bundledFacesRegister() {
        for face in PaldoraFont.Face.allCases {
            #expect(face.isAvailable, "\(face.rawValue) did not register")
        }
    }

    @Test func stylesComeFromTheTokens() {
        #expect(PaldoraFont.Style.displayXl.size == 76)
        #expect(PaldoraFont.Style.displayXl.lineHeight == 78)
        #expect(PaldoraFont.Style.bodyM.size == 15)
        #expect(PaldoraFont.Style.eyebrow.uppercased)
        #expect(abs(PaldoraFont.Style.eyebrow.trackingPoints - 1.54) < 0.001)
    }
}
