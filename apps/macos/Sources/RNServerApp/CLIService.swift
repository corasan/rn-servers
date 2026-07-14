import Foundation

struct CLIService: Sendable {
    var startDaemon: @Sendable () async throws -> Void

    static func live(environment: [String: String] = ProcessInfo.processInfo.environment) -> Self {
        Self(startDaemon: {
            let location = try locateCLI(environment: environment)
            try await run(executable: location.executable, arguments: location.arguments + ["daemon", "start"])
        })
    }

    private static func locateCLI(environment: [String: String]) throws -> (executable: URL, arguments: [String]) {
        if let script = environment["RN_SERVER_CLI_SCRIPT"] {
            let node = environment["RN_SERVER_NODE"] ?? "/usr/bin/env"
            let arguments = node == "/usr/bin/env" ? ["node", script] : [script]
            return (URL(fileURLWithPath: node), arguments)
        }

        if let resources = Bundle.main.resourceURL {
            let node = resources.appending(path: "cli/node")
            let script = resources.appending(path: "cli/bin/rn-server.js")
            if FileManager.default.isExecutableFile(atPath: node.path),
               FileManager.default.fileExists(atPath: script.path) {
                return (node, [script.path])
            }
        }

        let rootScript = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appending(path: "bin/rn-server.js")
        if FileManager.default.fileExists(atPath: rootScript.path) {
            return (URL(fileURLWithPath: "/usr/bin/env"), ["node", rootScript.path])
        }

        throw CLIError.notFound
    }

    private static func run(executable: URL, arguments: [String]) async throws {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let errorPipe = Pipe()
            process.executableURL = executable
            process.arguments = arguments
            process.standardOutput = Pipe()
            process.standardError = errorPipe
            process.terminationHandler = { process in
                if process.terminationStatus == 0 {
                    continuation.resume()
                } else {
                    let data = errorPipe.fileHandleForReading.readDataToEndOfFile()
                    let detail = String(decoding: data, as: UTF8.self)
                    continuation.resume(throwing: CLIError.failed(detail.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
            }
            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}

enum CLIError: LocalizedError {
    case notFound
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .notFound:
            "The bundled rn-server CLI could not be found."
        case .failed(let detail):
            detail.isEmpty ? "The rn-server CLI failed." : detail
        }
    }
}
