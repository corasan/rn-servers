import AppKit
import SwiftUI

struct MenuBarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if store.projects.isEmpty {
                Text("No Metro servers registered")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.projects) { project in
                    HStack {
                        Circle()
                            .fill(project.runtime.state == "running" ? Color.green : Color.gray)
                            .frame(width: 7, height: 7)
                        Text(project.name)
                        Spacer()
                        Button(project.runtime.state == "running" ? "Stop" : "Start") {
                            let action: ProjectAction = project.runtime.state == "running" ? .stop : .start
                            Task { await store.perform(action, on: project) }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }

            Divider()
            Button("Open RN Server") { openWindow(id: "main") }
                .keyboardShortcut("o")
            SettingsLink { Text("Settings…") }
            Divider()
            Button("Quit RN Server") { NSApplication.shared.terminate(nil) }
                .keyboardShortcut("q")
        }
        .padding(12)
        .frame(width: 300)
    }
}
