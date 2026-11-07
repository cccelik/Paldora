import PaldoraKit
import SwiftUI

/// Figma "Overlays / Bottom sheet": canvas surface, 30 pt top corners, a 40 x 5 grabber,
/// a Title/M heading and content (usually a `PaldoraListGroup`). The scrim is the
/// system's; present one overlay at a time.
struct PaldoraBottomSheetContent<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            RoundedRectangle(cornerRadius: 3).fill(Theme.borderHairline).frame(width: 40, height: 5)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
            Text(title).paldoraText(.titleM).foregroundStyle(Theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            content
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.space5)
        .padding(.top, 10)
        .padding(.bottom, Theme.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.bgCanvas)
    }
}

extension View {
    /// Presents a Paldora bottom sheet. The sheet announces itself as modal and
    /// returns focus to the trigger on dismissal (system behavior).
    func paldoraBottomSheet<Sheet: View>(isPresented: Binding<Bool>, title: String,
                                         @ViewBuilder content: @escaping () -> Sheet) -> some View {
        sheet(isPresented: isPresented) {
            PaldoraBottomSheetContent(title: title, content: content)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.hidden)
                .presentationCornerRadius(Theme.radiusSheet)
                .presentationBackground(Theme.bgCanvas)
        }
    }
}

#Preview("Bottom sheet") {
    PaldoraBottomSheetContent(title: "Sheet title") {
        PaldoraListGroup {
            PaldoraListRow(title: "Action", icon: .room) {}
            PaldoraListDivider()
            PaldoraListRow(title: "Report", icon: .flag, trailing: .none, isDestructive: true) {}
        }
    }
}
