import AppKit
import SwiftUI

struct ProjectRow: View {
    @Environment(AppStore.self) private var store
    let project: Project

    private var isBusy: Bool { store.activeProjectIDs.contains(project.id) }
    private var isRunning: Bool { project.runtime.state == "running" }

    var body: some View {
        HStack(spacing: 14) {
            statusIcon

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(project.name).font(.headline)
                    Text(project.runtime.state.capitalized)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusColor)
                    if project.runtime.tailscale?.state == "enabled" {
                        Label("Tailnet", systemImage: "lock.shield")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button(project.runtime.endpoint) {
                    if let url = URL(string: project.runtime.endpoint) {
                        NSWorkspace.shared.open(url)
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .help("Open endpoint")

                Text(project.directory)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 16)

            if isBusy {
                ProgressView().controlSize(.small)
            }

            Button {
                copyEndpoint()
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .help("Copy endpoint")

            Menu {
                Button(isRunning ? "Restart" : "Start") {
                    Task { await store.perform(isRunning ? .restart : .start, on: project) }
                }
                if isRunning {
                    Button("Stop") { Task { await store.perform(.stop, on: project) } }
                }
                Divider()
                Button(project.tailscale == true ? "Disable Tailscale" : "Enable Tailscale") {
                    Task { await store.setTailscale(project.tailscale != true, for: project) }
                }
                Divider()
                Button("Remove", role: .destructive) { Task { await store.remove(project) } }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .disabled(isBusy)
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button("Copy Endpoint", action: copyEndpoint)
            Button("Reveal in Finder") {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: project.directory)])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(project.name), \(project.runtime.state), \(project.runtime.endpoint)")
    }

    private var statusIcon: some View {
        Image(systemName: isRunning ? "play.circle.fill" : "stop.circle")
            .font(.system(size: 24))
            .foregroundStyle(statusColor)
            .frame(width: 30)
    }

    private var statusColor: Color {
        switch project.runtime.state {
        case "running": .green
        case "failed": .red
        default: .secondary
        }
    }

    private func copyEndpoint() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(project.runtime.endpoint, forType: .string)
    }
}
