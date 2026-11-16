// Auto-crop bald heads with Apple's Vision face landmarks.
//
// For each photo under the source folder (e.g. <id>/<n>.jpg, one folder per person) writes:
//   <out>/<id>/<n>/crop.jpg  — 800x600, top of the head down to just above the eyebrows
//   <out>/<id>/<n>/zoom.jpg  — from the dome out to head and shoulders, for the zoom-out reveal
// and <out>/crops-report.json with what was detected, including each photo's "zoom":
//   crop and full: those two framings as fractions of zoom.jpg ([x, y, width, height])
//   brow, eyes, nose: how far through the zoom (0 = dome, 1 = full) each first shows
//
// Usage: swift tools/crop_heads.swift <source dir> <out dir> [adjust.json]
// then: python3 tools/zoom_data.py (copies the zoom framings into src/data/zoom.json)
//
// adjust.json fine-tunes one photo's crop (keyed "<id>/<n>"), in units of face height:
//   { "moby/0": { "cropShift": -0.05, "cropZoom": 1.1, "fullShift": 0.1, "face": 1 } }
//   cropShift  moves the eyebrow cut line (negative = higher, shows less)
//   cropZoom   >1 zooms out on the dome, <1 zooms in
//   fullShift  moves the reveal framing down (positive) or up
//   face       which detected face to use when there are several (0 = largest)

import AppKit
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Adjust: Decodable {
    var cropShift: Double?
    var cropZoom: Double?
    var fullShift: Double?
    var face: Int?
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: swift crop_heads.swift <source dir> <out dir> [adjust.json]")
    exit(2)
}
let srcDir = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
var adjustments: [String: Adjust] = [:]
if args.count > 3, let data = try? Data(contentsOf: URL(fileURLWithPath: args[3])) {
    adjustments = (try? JSONDecoder().decode([String: Adjust].self, from: data)) ?? [:]
}

let outW = 800.0, outH = 600.0
let ciContext = CIContext()

func loadUpright(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    if raw == 1 { return img }
    let ci = CIImage(cgImage: img).oriented(CGImagePropertyOrientation(rawValue: raw) ?? .up)
    return ciContext.createCGImage(ci, from: ci.extent)
}

// A 4:3 rect (top-left pixel coords). It may run past the photo's edges; write() pads those parts.
func rect43(cx: Double, bottom: Double, width: Double) -> CGRect {
    let h = width * 3 / 4
    return CGRect(x: cx - width / 2, y: bottom - h, width: width, height: h)
}

// Share of the rect that falls outside the photo (0…1).
func outside(_ r: CGRect, _ W: Double, _ H: Double) -> Double {
    let inside = r.intersection(CGRect(x: 0, y: 0, width: W, height: H))
    return inside.isNull ? 1 : 1 - (inside.width * inside.height) / (r.width * r.height)
}

func write(_ image: CGImage, crop: CGRect, to url: URL, size: CGSize = CGSize(width: outW, height: outH)) throws {
    // Anything past the photo's edge is filled with its stretched, blurred border.
    let H = Double(image.height)
    let ci = CIImage(cgImage: image)
    let bg = ci.clampedToExtent().applyingGaussianBlur(sigma: 24)
    let comp = ci.composited(over: bg)
    let ciRect = CGRect(x: crop.minX, y: H - crop.maxY, width: crop.width, height: crop.height).integral
    guard let cut = ciContext.createCGImage(comp, from: ciRect, format: .RGBA8,
                                            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else {
        throw NSError(domain: "crop", code: 1)
    }
    let ctx = CGContext(data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(cut, in: CGRect(origin: .zero, size: size))
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
    if !CGImageDestinationFinalize(dest) { throw NSError(domain: "write", code: 2) }
}

var report: [[String: Any]] = []
let files = FileManager.default.enumerator(at: srcDir, includingPropertiesForKeys: nil)!
    .compactMap { $0 as? URL }
    .filter { ["jpg", "jpeg", "png"].contains($0.pathExtension.lowercased()) }
    .sorted { $0.path < $1.path }

for file in files {
    // "<id>/<n>", the photo's path inside the source folder without its extension
    let id = String(file.deletingPathExtension().path.dropFirst(srcDir.path.count + 1))
    let adj = adjustments[id] ?? Adjust()
    var entry: [String: Any] = ["id": id]
    defer { report.append(entry) }

    guard let image = loadUpright(file) else { entry["error"] = "could not read image"; print("✗ \(id): unreadable"); continue }
    let W = Double(image.width), H = Double(image.height)

    let request = VNDetectFaceLandmarksRequest()
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let faces = (request.results ?? []).sorted { $0.boundingBox.width > $1.boundingBox.width }
    entry["faces"] = faces.count
    let pick = adj.face ?? 0
    guard pick < faces.count else { entry["error"] = "no face found"; print("✗ \(id): no face found"); continue }
    let face = faces[pick]

    // Vision uses normalised coords with the origin bottom-left; convert to top-left pixels.
    let bb = face.boundingBox
    let fx = bb.minX * W, fw = bb.width * W, fh = bb.height * H
    let faceTop = (1 - bb.maxY) * H
    let cx = fx + fw / 2

    // Top of the eyebrows; fall back to an estimate from the box if landmarks are missing.
    var browTop = faceTop + fh * 0.18
    let lm = face.landmarks
    let toY = { (r: VNFaceLandmarkRegion2D) in r.normalizedPoints.map { (1 - (bb.minY + Double($0.y) * bb.height)) * H } }
    // where the eyes start and the nose ends, for the zoom-out stages (estimated if missing)
    let eyesTop = ([lm?.leftEye, lm?.rightEye].compactMap { $0 }.flatMap(toY).min()) ?? faceTop + fh * 0.3
    let noseBottom = (lm?.nose.map(toY)?.max()) ?? faceTop + fh * 0.62
    let brows = [face.landmarks?.leftEyebrow, face.landmarks?.rightEyebrow].compactMap { $0 }
    if !brows.isEmpty {
        let ys = brows.flatMap { $0.normalizedPoints }.map { (1 - (bb.minY + Double($0.y) * bb.height)) * H }
        browTop = ys.min()!
        entry["landmarks"] = true
    } else {
        entry["landmarks"] = false
    }

    // Question: dome only. Cut slightly above the brows so they don't peek through.
    let cutLine = browTop - fh * (0.04 - (adj.cropShift ?? 0))
    let cropRect = rect43(cx: cx, bottom: cutLine, width: fh * 1.3 * (adj.cropZoom ?? 1))

    // Reveal: head and shoulders.
    let fullRect = rect43(cx: cx, bottom: browTop + fh * (1.15 + (adj.fullShift ?? 0)), width: fh * 2.2)

    let padded = outside(cropRect, W, H)
    if padded > 0.3 { entry["warning"] = "\(Int(padded * 100))% of the dome crop is padding" }

    let dir = outDir.appendingPathComponent(id)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try write(image, crop: cropRect, to: dir.appendingPathComponent("crop.jpg"))

    // Zoom-out: one picture spanning both framings; the page glides from one to the other.
    let union = cropRect.union(fullRect)
    let zoomW = 1200.0
    try write(image, crop: union, to: dir.appendingPathComponent("zoom.jpg"),
              size: CGSize(width: zoomW, height: (zoomW * union.height / union.width).rounded()))
    let frac = { (r: CGRect) in [(r.minX - union.minX) / union.width, (r.minY - union.minY) / union.height,
                                 r.width / union.width, r.height / union.height].map { ($0 * 10000).rounded() / 10000 } }
    // the zoom's bottom edge runs from cutLine to fullRect.maxY; when does it pass each feature?
    let through = { (y: Double) in ((y - cutLine) / (fullRect.maxY - cutLine) * 1000).rounded() / 1000 }
    entry["zoom"] = ["crop": frac(cropRect), "full": frac(fullRect),
                     "brow": through(browTop), "eyes": through(eyesTop + fh * 0.03), "nose": through(noseBottom)]
    entry["confidence"] = Double(face.confidence)
    print("✓ \(id)\(faces.count > 1 ? "  (\(faces.count) faces, used #\(pick))" : "")\(entry["warning"].map { "  ⚠︎ \($0)" } ?? "")")
}

let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outDir.appendingPathComponent("crops-report.json"))
