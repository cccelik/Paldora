import PaldoraKit
import SwiftUI
import UIKit

/// Figma avatar sizes: S 28, M 40, L 56, XL 104.
enum PaldoraAvatarSize: CGFloat, CaseIterable {
    case small = 28, medium = 40, large = 56, extraLarge = 104
}

/// Ring around an avatar: brass for "you" or a selected person, a surface-coloured
/// ring when avatars overlap in a stack.
enum PaldoraAvatarRing: Equatable {
    case none, brass, stack
}

/// Figma "Avatar": a circle with a photo or Fraunces initials on a soft tint.
///
/// The photo is the authenticated thumbnail from the environment `ImageLoader`
/// (`mediaId`), or a ready `image` (gallery, previews). While it loads, and
/// whenever it is unavailable, the initials show. VoiceOver reads "Profile photo";
/// the person's name is always read next to it.
struct PaldoraAvatar: View {
    let name: String
    var size: CGFloat = PaldoraAvatarSize.medium.rawValue
    var ring: PaldoraAvatarRing = .none
    var mediaId: String?
    var image: Image?
    @Environment(\.imageLoader) private var loader
    @State private var loaded: UIImage?
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    init(name: String, size: CGFloat = PaldoraAvatarSize.medium.rawValue, ring: PaldoraAvatarRing = .none,
         mediaId: String? = nil, image: Image? = nil) {
        self.name = name
        self.size = size
        self.ring = ring
        self.mediaId = mediaId
        self.image = image
    }

    init(name: String, size: PaldoraAvatarSize, ring: PaldoraAvatarRing = .none, mediaId: String? = nil) {
        self.init(name: name, size: size.rawValue, ring: ring, mediaId: mediaId)
    }

    var body: some View {
        let side = size * scale
        ZStack {
            Circle().fill(Self.tint(for: name))
            if let photo {
                photo.resizable().scaledToFill()
            } else {
                Text(Self.initials(name, maxLetters: side < Self.monogramThreshold ? 1 : 2))
                    .font(Self.initialsFont(side))
                    .foregroundStyle(Theme.textSecondary)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
        }
        .frame(width: side, height: side)
        .clipShape(Circle())
        .overlay { ringView }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Profile photo")
        .accessibilityAddTraits(.isImage)
        .task(id: mediaId) { await load() }
    }

    private var photo: Image? {
        if let image { return image }
        return loaded.map { Image(uiImage: $0) }
    }

    @ViewBuilder private var ringView: some View {
        switch ring {
        case .none: EmptyView()
        case .brass: Circle().strokeBorder(Theme.brass, lineWidth: 2)
        case .stack: Circle().strokeBorder(Theme.bgSurface, lineWidth: 2)
        }
    }

    private func load() async {
        loaded = nil
        guard let mediaId, let loader else { return }
        if let hit = loader.cached(mediaId, .thumbnail) { loaded = hit; return }
        if case .image(let fetched) = await loader.image(mediaId, .thumbnail) { loaded = fetched }
    }

    // MARK: Logic (unit tested)

    /// Below this diameter only one letter fits (Figma S shows a single initial).
    static let monogramThreshold: CGFloat = 34

    /// One or two initials from the first two words; "P" for an empty name.
    static func initials(_ name: String, maxLetters: Int = 2) -> String {
        let parts = name.split(separator: " ").prefix(maxLetters).compactMap(\.first)
        return parts.isEmpty ? "P" : String(parts).uppercased()
    }

    /// Initials are about 43% of the diameter (12/28, 17/40, 24/56, 44/104 in Figma).
    static func initialsSize(forDiameter diameter: CGFloat) -> CGFloat { (diameter * 0.43).rounded() }

    /// A stable soft tint per name (brass, sage or ember), so a stack of initials
    /// is not one flat color and the same person always looks the same.
    static func tint(for name: String) -> Color {
        let seed = name.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return [Theme.brassSoft, Theme.sageSoft, Theme.emberSoft][seed % 3]
    }

    private static func initialsFont(_ diameter: CGFloat) -> Font {
        let size = initialsSize(forDiameter: diameter)
        return PaldoraFont.Style(face: .displayRegular, size: size, lineHeight: size,
                                 tracking: diameter >= 56 ? -0.025 : 0, relativeTo: .body).font
    }
}

/// Overlapping avatars (Box member stack), 10 pt overlap, surface ring.
struct PaldoraAvatarStack: View {
    struct Member: Identifiable {
        let id: String
        let name: String
        var mediaId: String?
    }

    let members: [Member]
    var size: CGFloat = PaldoraAvatarSize.small.rawValue
    var limit = 3

    var body: some View {
        HStack(spacing: -10) {
            ForEach(members.prefix(limit)) { member in
                PaldoraAvatar(name: member.name, size: size, ring: .stack, mediaId: member.mediaId)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(members.count) members")
    }
}

#Preview("Avatars") {
    HStack(alignment: .bottom, spacing: Theme.space3) {
        ForEach(PaldoraAvatarSize.allCases, id: \.self) { PaldoraAvatar(name: "Jonah Weiss", size: $0) }
        PaldoraAvatar(name: "Leah Hartmann", size: .large, ring: .brass)
        PaldoraAvatarStack(members: [.init(id: "1", name: "Leah H"), .init(id: "2", name: "Jonah W"), .init(id: "3", name: "Maya")])
    }
    .padding(Theme.space5)
    .background(Theme.bgCanvas)
}
