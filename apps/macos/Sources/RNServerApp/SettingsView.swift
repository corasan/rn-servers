import SwiftUI

struct SettingsView: View {
    @AppStorage("refreshInterval") private var refreshInterval = 3.0

    var body: some View {
        Form {
            Section("Daemon") {
                LabeledContent("API", value: "http://127.0.0.1:7231")
                Picker("Refresh interval", selection: $refreshInterval) {
                    Text("1 second").tag(1.0)
                    Text("3 seconds").tag(3.0)
                    Text("5 seconds").tag(5.0)
                    Text("10 seconds").tag(10.0)
                }
            }

            Section("Command Line") {
                LabeledContent("Installed path", value: "/usr/local/bin/rn-server")
                Text("The RN Server installer package installs the app and CLI together.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .scenePadding()
        .frame(width: 480, height: 280)
    }
}
