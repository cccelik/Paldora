import PaldoraKit
import SwiftUI

/// The Figma icon set (page 01, frame "Icons"). The kit draws 24 pt glyphs with a
/// 1.6 pt round stroke (1.8 pt when active). On iOS every glyph maps to an SF Symbol
/// of the same meaning, except the two brand marks (`spark`, `flame`) that are
/// drawn as SwiftUI shapes with the same stroke widths.
///
/// Weight mapping: SF Symbol `.light` reads as the 1.6 pt stroke, `.regular` as the 1.8 pt
/// active stroke (SF strokes are heavier than the kit's at the same size). Names equal the Figma layer names (`Icon · home` is `.home`).
enum PaldoraIcon: String, CaseIterable {
    case home, box, room, bell, user, plus, back, chev, down, more, heart, chat, search
    case gear, lock, cal, image, spark, music, close, check, friends, book, camera, send, pin
    case flame, edit, eye, shield, mail, palette, flag, ban, trash, download, key, grip, code
    case refresh, alert, archive, swap, info, star, layout, type, wifi, copy, logout, link

    /// The SF Symbol, or nil for the glyphs drawn by `PaldoraIconShape`.
    var systemName: String? {
        switch self {
        case .home: "house"
        case .box: "shippingbox"
        case .room: "chair.lounge"
        case .bell: "bell"
        case .user: "person"
        case .plus: "plus"
        case .back: "chevron.left"
        case .chev: "chevron.right"
        case .down: "chevron.down"
        case .more: "ellipsis"
        case .heart: "heart"
        case .chat: "bubble.left"
        case .search: "magnifyingglass"
        case .gear: "gearshape"
        case .lock: "lock"
        case .cal: "calendar"
        case .image: "photo"
        case .spark, .flame: nil
        case .music: "music.note"
        case .close: "xmark"
        case .check: "checkmark"
        case .friends: "person.2"
        case .book: "book"
        case .camera: "camera"
        case .send: "paperplane"
        case .pin: "mappin"
        case .edit: "square.and.pencil"
        case .eye: "eye"
        case .shield: "shield"
        case .mail: "envelope"
        case .palette: "paintpalette"
        case .flag: "flag"
        case .ban: "nosign"
        case .trash: "trash"
        case .download: "arrow.down.to.line"
        case .key: "key"
        case .grip: "line.3.horizontal"
        case .code: "chevron.left.forwardslash.chevron.right"
        case .refresh: "arrow.clockwise"
        case .alert: "exclamationmark.triangle"
        case .archive: "archivebox"
        case .swap: "arrow.left.arrow.right"
        case .info: "info.circle"
        case .star: "star"
        case .layout: "rectangle.split.2x1"
        case .type: "textformat"
        case .wifi: "wifi"
        case .copy: "doc.on.doc"
        case .logout: "rectangle.portrait.and.arrow.right"
        case .link: "link"
        }
    }
}

/// An icon at a Figma size (20 default; 14 to 24 in the kit). Decorative: hidden from
/// VoiceOver, so the control that contains it supplies the label. Scales with Dynamic Type.
struct PaldoraIconView: View {
    let icon: PaldoraIcon
    var size: CGFloat = 20
    var isActive = false
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    init(_ icon: PaldoraIcon, size: CGFloat = 20, isActive: Bool = false) {
        self.icon = icon
        self.size = size
        self.isActive = isActive
    }

    var body: some View {
        let side = size * scale
        Group {
            if let name = icon.systemName {
                Image(systemName: name).font(.system(size: side, weight: isActive ? .regular : .light))
            } else {
                PaldoraIconShape(icon: icon)
                    .stroke(style: StrokeStyle(lineWidth: Self.stroke(isActive: isActive) * side / PaldoraTokens.iconSize,
                                               lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: side, height: side)
        .accessibilityHidden(true)
    }

    /// 1.6 pt, or 1.8 pt when active, on the 24 pt grid.
    static func stroke(isActive: Bool) -> CGFloat {
        isActive ? PaldoraTokens.iconStrokeActive : PaldoraTokens.iconStroke
    }
}

/// The glyphs without an SF Symbol, on the Figma 24 pt grid.
struct PaldoraIconShape: Shape {
    let icon: PaldoraIcon

    func path(in rect: CGRect) -> Path {
        let unit = min(rect.width, rect.height) / PaldoraTokens.iconSize
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * unit, y: rect.minY + y * unit) }
        var path = Path()
        switch icon {
        case .spark:
            path.move(to: point(12, 3))
            path.addLine(to: point(13.8, 8.2))
            path.addLine(to: point(19, 10))
            path.addLine(to: point(13.8, 11.8))
            path.addLine(to: point(12, 17))
            path.addLine(to: point(10.2, 11.8))
            path.addLine(to: point(5, 10))
            path.addLine(to: point(10.2, 8.2))
            path.closeSubpath()
            path.move(to: point(18, 16))
            path.addLine(to: point(18, 20))
            path.move(to: point(16, 18))
            path.addLine(to: point(20, 18))
        case .flame:
            path.move(to: point(12, 3))
            path.addCurve(to: point(6, 14), control1: point(12, 7), control2: point(6, 9))
            path.addCurve(to: point(12, 21), control1: point(6, 18), control2: point(8.5, 21))
            path.addCurve(to: point(18, 14), control1: point(15.5, 21), control2: point(18, 18))
            path.addCurve(to: point(15.5, 9), control1: point(18, 12), control2: point(17, 10.5))
            path.addCurve(to: point(14, 12), control1: point(15.5, 10.5), control2: point(15, 11.5))
            path.addCurve(to: point(12, 3), control1: point(14, 8), control2: point(13, 5))
            path.closeSubpath()
        default:
            break
        }
        return path
    }
}

#Preview("Icons") {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: Theme.space4) {
        ForEach(PaldoraIcon.allCases, id: \.self) { icon in
            PaldoraIconView(icon, size: 24).foregroundStyle(Theme.textPrimary)
        }
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
