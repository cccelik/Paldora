import SwiftUI

struct SettingsRoute: Hashable {}

/// Figma 9.2 Account and the safety group, as grouped list rows.
struct SettingsView: View {
    let env: FeatureEnvironment

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.space5) {
                PaldoraScreenTitle(title: "Settings")
                group("Account") {
                    link("Security", icon: .lock, id: "settings-security") { SecurityView(env: env) }
                    PaldoraListDivider()
                    link("Your data", icon: .download, id: "settings-export") { ExportView(env: env) }
                    PaldoraListDivider()
                    link("Delete account", icon: .trash, id: "settings-deletion", destructive: true) { DeletionView(env: env) }
                }
                group("Privacy & safety") {
                    link("Your reports", icon: .flag, id: "settings-reports") { MyReportsView(env: env) }
                    PaldoraListDivider()
                    link("Content notices", icon: .info, id: "settings-notices") { NoticesView(env: env) }
                }
                PaldoraBanner(tone: .info, title: "Moderation is web-first",
                              message: "Moderators review cases on the web. Nothing you share leaves your Boxes.")
            }
            .frame(maxWidth: Theme.readingWidth, alignment: .leading)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.space8)
            .frame(maxWidth: .infinity)
        }
        .paldoraCanvas()
        .paldoraNavBar("Settings")
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraEyebrow(title)
            PaldoraListGroup { content() }
        }
    }

    private func link<Destination: View>(_ title: String, icon: PaldoraIcon, id: String, destructive: Bool = false,
                                         @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: destination) {
            PaldoraListRow(title: title, icon: icon, isDestructive: destructive)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}
