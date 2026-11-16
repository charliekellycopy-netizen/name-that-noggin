// Screen candidate photos for use as quiz heads.
//
// For every .jpg under <dir> (recursively) measures, with Apple's Vision:
//   faces       number of faces found
//   faceFrac    width of the largest face as a share of the photo width
//   second      width of the next-largest face relative to the largest (0 = alone)
//   yaw, roll   head turn and tilt in degrees
//   domeDiff    colour difference between forehead and top of head (0 = same; hats/hair score high)
//   domeLum     brightness of the top of the head relative to the forehead
//   headroom    space above the dome as a share of face height (negative = dome cut off)
// and writes <dir>/screen.json keyed by path relative to <dir>.
//
// Usage: swift tools/screen_heads.swift <dir>

import CoreGraphics
import Foundation
import ImageIO
import Vision

let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")

func load(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let opts = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1280] as CFDictionary
    return CGImageSourceCreateThumbnailAtIndex(src, 0, opts)
}

struct Pixels {
    let w: Int, h: Int, data: [UInt8]
    init(_ img: CGImage) {
        w = img.width; h = img.height
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
        data = buf
    }
    // Mean RGB (0…1) of a rect in top-left pixel coords, or nil if it falls outside.
    func mean(_ r: CGRect) -> (Double, Double, Double)? {
        let x0 = max(0, Int(r.minX)), x1 = min(w, Int(r.maxX))
        let y0 = max(0, Int(r.minY)), y1 = min(h, Int(r.maxY))
        guard x1 - x0 > 2, y1 - y0 > 2, Double((x1 - x0) * (y1 - y0)) > 0.5 * r.width * r.height else { return nil }
        var s = (0.0, 0.0, 0.0), n = 0.0
        for y in stride(from: y0, to: y1, by: 2) {
            for x in stride(from: x0, to: x1, by: 2) {
                let i = (y * w + x) * 4
                s.0 += Double(data[i]); s.1 += Double(data[i + 1]); s.2 += Double(data[i + 2]); n += 1
            }
        }
        return (s.0 / n / 255, s.1 / n / 255, s.2 / n / 255)
    }
}

// Chromaticity distance plus a smaller lightness term, so a shiny scalp still matches skin.
func colourDiff(_ a: (Double, Double, Double), _ b: (Double, Double, Double)) -> (diff: Double, lum: Double) {
    let sa = a.0 + a.1 + a.2 + 1e-6, sb = b.0 + b.1 + b.2 + 1e-6
    let dr = a.0 / sa - b.0 / sb, dg = a.1 / sa - b.1 / sb
    let chroma = sqrt(dr * dr + dg * dg) * 10
    let la = 0.2126 * a.0 + 0.7152 * a.1 + 0.0722 * a.2
    let lb = 0.2126 * b.0 + 0.7152 * b.1 + 0.0722 * b.2
    let lum = (la + 0.02) / (lb + 0.02)
    return (chroma + abs(log(lum)) * 0.6, lum)
}

var results: [String: Any] = [:]
let files = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)!
    .compactMap { $0 as? URL }
    .filter { $0.pathExtension.lowercased() == "jpg" }
    .sorted { $0.path < $1.path }

for url in files {
    let key = String(url.path.dropFirst(dir.path.count + 1))
    guard let img = load(url) else { results[key] = ["error": "unreadable"]; continue }
    let W = Double(img.width), H = Double(img.height)
    let req = VNDetectFaceLandmarksRequest()
    try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
    let faces = (req.results ?? []).sorted { $0.boundingBox.width > $1.boundingBox.width }
    var r: [String: Any] = ["faces": faces.count]
    guard let f = faces.first else { results[key] = r; continue }

    let bb = f.boundingBox
    let fw = bb.width * W, fh = bb.height * H, cx = bb.midX * W
    var browTop = (1 - bb.maxY) * H + fh * 0.18
    if let brows = [f.landmarks?.leftEyebrow, f.landmarks?.rightEyebrow].compactMap({ $0 }) as [VNFaceLandmarkRegion2D]?, !brows.isEmpty {
        browTop = brows.flatMap { $0.normalizedPoints }.map { (1 - (bb.minY + Double($0.y) * bb.height)) * H }.min()!
    }
    r["faceFrac"] = bb.width
    r["second"] = faces.count > 1 ? faces[1].boundingBox.width / bb.width : 0
    r["yaw"] = (f.yaw?.doubleValue ?? 0) * 180 / .pi
    r["roll"] = (f.roll?.doubleValue ?? 0) * 180 / .pi
    r["headroom"] = (browTop - fh * 0.55) / fh  // dome top sits roughly 0.5 face-heights above the brows

    let px = Pixels(img)
    let forehead = px.mean(CGRect(x: cx - fw * 0.15, y: browTop - fh * 0.14, width: fw * 0.3, height: fh * 0.08))
    let dome = px.mean(CGRect(x: cx - fw * 0.15, y: browTop - fh * 0.42, width: fw * 0.3, height: fh * 0.1))
    if let a = forehead, let b = dome {
        let d = colourDiff(b, a)
        r["domeDiff"] = d.diff
        r["domeLum"] = d.lum
    }
    results[key] = r
}

let json = try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys])
try json.write(to: dir.appendingPathComponent("screen.json"))
print("screened \(files.count) photos → \(dir.lastPathComponent)/screen.json")
