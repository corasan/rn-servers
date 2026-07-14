import Foundation

struct Project: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let directory: String
    let port: Int
    let command: String
    let autoStart: Bool
    let tailscale: Bool?
    let runtime: Runtime
}

struct Runtime: Codable, Hashable, Sendable {
    let state: String
    let pid: Int?
    let endpoint: String
    let localEndpoint: String?
    let logFile: String
    let exitCode: Int?
    let startedAt: String?
    let tailscale: TailscaleRuntime?
}

struct TailscaleRuntime: Codable, Hashable, Sendable {
    let state: String
    let endpoint: String?
    let dnsName: String?
    let error: String?
}

enum ProjectAction: String, Sendable {
    case start
    case stop
    case restart
}

enum LoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
}

struct APIError: Decodable, Error, LocalizedError {
    let error: String

    var errorDescription: String? { error }
}
