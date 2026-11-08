import PaldoraKit
import SwiftUI

/// Widget visibility, order and placement. Reordering uses explicit
/// move-up and move-down buttons, never drag alone.
struct RoomWidgetsEditor: View {
    @Bindable var model: RoomEditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Widgets").paldoraText(.titleM).foregroundStyle(Theme.textPrimary).accessibilityAddTraits(.isHeader)
            Text("Choose what shows and in what order. On a wide screen, sidebar widgets sit beside the main column.")
                .paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            ForEach(Array(model.widgets.enumerated()), id: \.element.type) { index, widget in
                row(widget, index: index)
            }
        }
    }

    private func row(_ widget: RoomWidget, index: Int) -> some View {
        let name = RoomRegistry.label(RoomRegistry.widgetLabels, widget.type)
        return VStack(alignment: .leading, spacing: Theme.space2) {
            PaldoraToggle(name, isOn: Binding(get: { widget.enabled }, set: { model.setEnabled(widget.type, $0) }))
                .accessibilityIdentifier("widget-toggle-\(widget.type)")
            PaldoraSegmentedControl([.init("main", "Main"), .init("sidebar", "Sidebar")],
                                    selection: Binding(get: { widget.placement }, set: { model.setPlacement(widget.type, $0) }))
                .accessibilityLabel("\(name) placement")
            HStack(spacing: Theme.space2) {
                PaldoraIconButton(icon: .down, label: "Move \(name) down", style: .surface) { model.move(widget.type, by: 1) }
                    .disabled(index == model.widgets.count - 1)
                    .accessibilityIdentifier("widget-down-\(widget.type)")
                PaldoraIconButton(icon: .down, label: "Move \(name) up", style: .surface) { model.move(widget.type, by: -1) }
                    .rotationEffect(.degrees(180))
                    .disabled(index == 0)
                    .accessibilityIdentifier("widget-up-\(widget.type)")
                Text("Position \(index + 1) of \(model.widgets.count)").paldoraText(.caption).foregroundStyle(Theme.textSecondary)
            }
        }
        .padding(Theme.space4)
        .background(Theme.bgSurface, in: RoundedRectangle(cornerRadius: Theme.radiusLg))
        .paldoraHairline(RoundedRectangle(cornerRadius: Theme.radiusLg))
        .accessibilityElement(children: .contain)
    }
}
