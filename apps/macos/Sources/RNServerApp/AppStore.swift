import Foundation
import Observation

@MainActor
@Observable
final class AppStore {
    private(set) var projects: [Project] = []
    private(set) var loadState: LoadState = .idle
    private(set) var activeProjectIDs: Set<String> = []
    var errorMessage: String?

    private let client: RNServerClient
    private let cli: CLIService

    init(client: RNServerClient, cli: CLIService) {
        self.client = client
        self.cli = cli
    }

    func start() async {
        loadState = .loading
        do {
            try await cli.startDaemon()
            await refresh()
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func refresh(showLoading: Bool = false) async {
        if showLoading { loadState = .loading }
        do {
            projects = try await client.projects()
            loadState = .loaded
        } catch is CancellationError {
            return
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func add(directory: URL, tailscale: Bool) async {
        await performGlobal {
            _ = try await client.add(directory.path, tailscale)
        }
    }

    func perform(_ action: ProjectAction, on project: Project) async {
        activeProjectIDs.insert(project.id)
        defer { activeProjectIDs.remove(project.id) }
        do {
            _ = try await client.perform(project.id, action)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func remove(_ project: Project) async {
        await performGlobal { _ = try await client.remove(project.id) }
    }

    func setTailscale(_ enabled: Bool, for project: Project) async {
        activeProjectIDs.insert(project.id)
        defer { activeProjectIDs.remove(project.id) }
        do {
            _ = try await client.setTailscale(project.id, enabled)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func monitor(every interval: Duration = .seconds(3)) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            guard !Task.isCancelled else { return }
            await refresh()
        }
    }

    private func performGlobal(_ operation: () async throws -> Void) async {
        do {
            try await operation()
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
