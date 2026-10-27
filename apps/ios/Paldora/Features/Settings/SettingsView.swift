import SwiftUI

struct SettingsRoute: Hashable {}

struct SettingsView: View {
    let env: FeatureEnvironment

    var body: some View {
        List {
            Section {
                link("Security", "lock", id: "settings-security") { SecurityView(env: env) }
                link("Your data", "square.and.arrow.down", id: "settings-export") { ExportView(env: env) }
                link("Delete account", "trash", id: "settings-deletion") { DeletionView(env: env) }
            } header: { Text("Account").font(Typography.label) }
            Section {
                link("Your reports", "flag", id: "settings-reports") { MyReportsView(env: env) }
                link("Content notices", "exclamationmark.bubble", id: "settings-notices") { NoticesView(env: env) }
            } header: { Text("Safety").font(Typography.label) }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func link<Destination: View>(_ title: String, _ icon: String, id: String,
                                         @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: destination) {
            Label(title, systemImage: icon).font(Typography.body).frame(minHeight: Theme.touchTarget)
        }
        .listRowBackground(Theme.surface)
        .accessibilityIdentifier(id)
    }
}
