// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "RNServerMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "RNServerApp", targets: ["RNServerApp"])
    ],
    targets: [
        .executableTarget(name: "RNServerApp"),
        .testTarget(name: "RNServerAppTests", dependencies: ["RNServerApp"])
    ]
)
