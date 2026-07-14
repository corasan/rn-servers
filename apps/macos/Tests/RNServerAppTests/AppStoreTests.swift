import Foundation
import Testing
@testable import RNServerApp

struct AppStoreTests {
    @Test @MainActor
    func startsDaemonAndLoadsProjects() async {
        let project = Project.fixture
        let client = RNServerClient(
            projects: { [project] },
            add: { _, _ in project },
            perform: { _, _ in project },
            remove: { _ in project },
            setTailscale: { _, _ in project }
        )
        let store = AppStore(client: client, cli: CLIService(startDaemon: {}))

        await store.start()

        #expect(store.loadState == .loaded)
        #expect(store.projects == [project])
    }

    @Test
    func decodesDaemonProjectResponse() throws {
        let data = Data(Self.projectJSON.utf8)
        let project = try JSONDecoder().decode(Project.self, from: data)

        #expect(project.name == "Example")
        #expect(project.runtime.endpoint == "http://dev-mac.example.ts.net:8081")
        #expect(project.runtime.tailscale?.state == "enabled")
    }

    @Test
    func locatesRepositoryCLIForDebugBuilds() throws {
        let location = try CLIService.locateCLI(environment: ["RN_SERVER_NODE": "/opt/node"])

        #expect(location.executable.path == "/opt/node")
        #expect(location.arguments.count == 1)
        #expect(location.arguments[0].hasSuffix("/bin/rn-server.js"))
        #expect(FileManager.default.fileExists(atPath: location.arguments[0]))
    }

    private static let projectJSON = #"""
    {
      "id":"example",
      "name":"Example",
      "directory":"/projects/example",
      "port":8081,
      "command":"npx expo start --port {port}",
      "autoStart":true,
      "tailscale":true,
      "runtime":{
        "state":"running",
        "pid":123,
        "endpoint":"http://dev-mac.example.ts.net:8081",
        "localEndpoint":"http://127.0.0.1:8081",
        "logFile":"/tmp/example.log",
        "exitCode":null,
        "startedAt":"2026-07-14T00:00:00.000Z",
        "tailscale":{
          "state":"enabled",
          "endpoint":"http://dev-mac.example.ts.net:8081",
          "dnsName":"dev-mac.example.ts.net",
          "error":null
        }
      }
    }
    """#
}

private extension Project {
    static let fixture = Project(
        id: "example",
        name: "Example",
        directory: "/projects/example",
        port: 8081,
        command: "npx expo start --port {port}",
        autoStart: true,
        tailscale: true,
        runtime: Runtime(
            state: "running",
            pid: 123,
            endpoint: "http://dev-mac.example.ts.net:8081",
            localEndpoint: "http://127.0.0.1:8081",
            logFile: "/tmp/example.log",
            exitCode: nil,
            startedAt: nil,
            tailscale: TailscaleRuntime(
                state: "enabled",
                endpoint: "http://dev-mac.example.ts.net:8081",
                dnsName: "dev-mac.example.ts.net",
                error: nil
            )
        )
    )
}
