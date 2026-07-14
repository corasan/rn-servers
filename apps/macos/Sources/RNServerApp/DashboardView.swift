import AppKit
import SwiftUI

struct DashboardView: View {
    @Environment(AppStore.self) private var store
    @State private var isAddingProject = false
    @State private var addWithTailscale = true
    @AppStorage("refreshInterval") private var refreshInterval = 3.0

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task { await store.start() }
        .task(id: refreshInterval) { await store.monitor(every: .seconds(refreshInterval)) }
        .alert("RN Server", isPresented: errorBinding) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "Unknown error")
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: "server.rack")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.tint)

            VStack(alignment: .leading, spacing: 2) {
                Text("RN Server")
                    .font(.title2.bold())
                Text("Metro servers, stable endpoints, one place")
                    .foregroundStyle(.secondary)
            }

            Spacer()
            daemonBadge

            Button {
                Task { await store.refresh(showLoading: true) }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }

            Menu {
                Toggle("Enable Tailscale Serve", isOn: $addWithTailscale)
                Divider()
                Button("Choose Project Folder…", action: addProject)
            } label: {
                Label("Add Project", systemImage: "plus")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
        .padding(20)
    }

    @ViewBuilder
    private var content: some View {
        switch store.loadState {
        case .idle, .loading:
            loadingList
        case .failed(let message):
            ContentUnavailableView {
                Label("Daemon unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try Again") { Task { await store.start() } }
            }
        case .loaded where store.projects.isEmpty:
            ContentUnavailableView {
                Label("No projects yet", systemImage: "folder.badge.plus")
            } description: {
                Text("Add a React Native or Expo project to keep Metro running in the background.")
            } actions: {
                Button("Add Project…", action: addProject)
                    .buttonStyle(.borderedProminent)
            }
        case .loaded:
            List(store.projects) { project in
                ProjectRow(project: project)
                    .environment(store)
                    .listRowInsets(.init(top: 10, leading: 16, bottom: 10, trailing: 16))
            }
            .listStyle(.inset)
        }
    }

    private var loadingList: some View {
        List(0..<4, id: \.self) { index in
            VStack(alignment: .leading, spacing: 8) {
                Text("Example Project \(index)").font(.headline)
                Text("http://127.0.0.1:8081").foregroundStyle(.secondary)
                Text("/Users/example/Projects/example").foregroundStyle(.tertiary)
            }
            .padding(.vertical, 8)
            .redacted(reason: .placeholder)
        }
        .listStyle(.inset)
    }

    private var daemonBadge: some View {
        let running = store.loadState == .loaded
        return HStack(spacing: 6) {
            Circle()
                .fill(running ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
            Text(running ? "Daemon online" : "Connecting")
                .font(.caption.weight(.medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.quaternary, in: Capsule())
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }

    private func addProject() {
        guard !isAddingProject else { return }
        isAddingProject = true
        let panel = NSOpenPanel()
        panel.title = "Choose a React Native or Expo project"
        panel.prompt = "Add Project"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.begin { response in
            isAddingProject = false
            guard response == .OK, let directory = panel.url else { return }
            Task { await store.add(directory: directory, tailscale: addWithTailscale) }
        }
    }
}
