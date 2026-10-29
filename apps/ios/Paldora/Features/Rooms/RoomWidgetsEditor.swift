import PaldoraKit
import SwiftUI

/// Widget visibility, order and placement. Reordering uses explicit
/// move-up and move-down buttons, never drag alone.
struct RoomWidgetsEditor: View {
    @Bindable var model: RoomEditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space3) {
            Text("Widgets").font(Typography.title).foregroundStyle(Theme.text).accessibilityAddTraits(.isHeader)
            Text("Choose what shows and in what order. On a wide screen, sidebar widgets sit beside the main column.")
                .font(Typography.caption).foregroundStyle(Theme.textMuted)
            ForEach(Array(model.widgets.enumerated()), id: \.element.type) { index, widget in
                row(widget, index: index)
            }
        }
    }

    private func row(_ widget: RoomWidget, index: Int) -> some View {
        let name = RoomRegistry.label(RoomRegistry.widgetLabels, widget.type)
        return VStack(alignment: .leading, spacing: Theme.space2) {
            Toggle(name, isOn: Binding(get: { widget.enabled }, set: { model.setEnabled(widget.type, $0) }))
                .frame(minHeight: Theme.touchTarget)
                .accessibilityIdentifier("widget-toggle-\(widget.type)")
            FlowLayout {
                Picker("Placement", selection: Binding(get: { widget.placement }, set: { model.setPlacement(widget.type, $0) })) {
                    Text("Main").tag("main")
                    Text("Sidebar").tag("sidebar")
                }
                .pickerStyle(.segmented).accessibilityLabel("\(name) placement")
                Button { model.move(widget.type, by: -1) } label: { Image(systemName: "arrow.up") }
                    .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                    .disabled(index == 0).accessibilityLabel("Move \(name) up")
                    .accessibilityIdentifier("widget-up-\(widget.type)")
                Button { model.move(widget.type, by: 1) } label: { Image(systemName: "arrow.down") }
                    .frame(minWidth: Theme.touchTarget, minHeight: Theme.touchTarget)
                    .disabled(index == model.widgets.count - 1).accessibilityLabel("Move \(name) down")
                    .accessibilityIdentifier("widget-down-\(widget.type)")
            }
            Text("Position \(index + 1) of \(model.widgets.count)").font(Typography.caption).foregroundStyle(Theme.textMuted)
        }
        .paldoraCard()
        .accessibilityElement(children: .contain)
    }
}
