import Foundation
import ImageIO
import UniformTypeIdentifiers

struct PreparedImage: Equatable, Sendable {
    let data: Data
    /// Always `image/jpeg`: re-encoding from pixels drops every metadata block.
    let contentType: String
    let width: Int
    let height: Int
}

enum ImagePreparationError: Error, Equatable {
    case unreadable
    case tooLarge
}

/// On-device preparation before upload: orientation is baked into the pixels,
/// the long edge is limited, and the image is re-encoded as JPEG from raw
/// pixels. Nothing is copied from the source's properties, so EXIF, GPS and
/// other metadata never leave the device. The result fits the 10 MB policy.
enum ImagePreparer {
    static let maxBytes = 9 * 1024 * 1024
    static let maxLongEdge = 2560

    static func prepare(
        _ source: Data,
        maxBytes: Int = maxBytes,
        maxLongEdge: Int = maxLongEdge
    ) throws -> PreparedImage {
        let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let imageSource = CGImageSourceCreateWithData(source as CFData, options as CFDictionary),
              CGImageSourceGetCount(imageSource) > 0 else { throw ImagePreparationError.unreadable }

        var edge = maxLongEdge
        var quality = 0.85
        for _ in 0..<8 {
            let thumbnailOptions: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: edge,
                kCGImageSourceShouldCacheImmediately: true,
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, thumbnailOptions as CFDictionary)
            else { throw ImagePreparationError.unreadable }
            let output = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(
                output, UTType.jpeg.identifier as CFString, 1, nil) else { throw ImagePreparationError.unreadable }
            // Only the compression quality is set: no source properties are carried over.
            let properties: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
            CGImageDestinationAddImage(destination, image, properties as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw ImagePreparationError.unreadable }
            if output.length <= maxBytes {
                return PreparedImage(data: output as Data, contentType: "image/jpeg",
                                     width: image.width, height: image.height)
            }
            quality = max(0.4, quality - 0.15)
            edge = Int(Double(edge) * 0.8)
        }
        throw ImagePreparationError.tooLarge
    }
}
