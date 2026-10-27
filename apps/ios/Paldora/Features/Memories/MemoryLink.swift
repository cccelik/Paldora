import PaldoraKit
import SwiftUI

/// Opens the underlying post or Life Update. A Memory is a derived view, never a copy.
struct MemoryLink<Label: View>: View {
    let item: MemoryItem
    @ViewBuilder var label: Label

    var body: some View {
        switch item {
        case .post(let value):
            NavigationLink(value: PostRoute(boxId: value.post.boxId, postId: value.post.id)) { label }
        case .lifeUpdate(let value):
            NavigationLink(value: LifeUpdateRoute(id: value.id, postId: value.contexts.first?.postId)) { label }
        case .unsupported:
            label
        }
    }
}
