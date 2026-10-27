// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PaldoraKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PaldoraKit", targets: ["PaldoraKit"]),
    ],
    targets: [
        .target(name: "PaldoraKit"),
        .testTarget(
            name: "PaldoraKitTests",
            dependencies: ["PaldoraKit"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
