import SwiftUI

@main
struct RNServerApp: App {
    @State private var store = AppStore(client: .live(), cli: .live())

    var body: some Scene {
        WindowGroup("RN Server", id: "main") {
            DashboardView()
                .environment(store)
                .frame(minWidth: 720, minHeight: 480)
        }
        .defaultSize(width: 860, height: 620)

        MenuBarExtra("RN Server", systemImage: "server.rack") {
            MenuBarView()
                .environment(store)
        }

        Settings {
            SettingsView()
        }
    }
}
