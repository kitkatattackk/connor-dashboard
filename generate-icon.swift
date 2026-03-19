#!/usr/bin/env swift

import AppKit
import CoreGraphics

// Creates the Meridian app icon at a given size
func drawIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return image
    }

    let w = size
    let h = size
    let padding = size * 0.11

    // --- Background: deep navy rounded rect ---
    let cornerRadius = size * 0.22
    let bgRect = CGRect(x: 0, y: 0, width: w, height: h)
    let bgPath = CGPath(roundedRect: bgRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)

    // Navy gradient background
    let bgColors = [
        CGColor(red: 0.04, green: 0.09, blue: 0.16, alpha: 1.0),  // #07101a top
        CGColor(red: 0.02, green: 0.05, blue: 0.12, alpha: 1.0),  // #060c1e bottom
    ] as CFArray
    let bgGradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: bgColors,
        locations: [0.0, 1.0]
    )!
    ctx.addPath(bgPath)
    ctx.clip()
    ctx.drawLinearGradient(bgGradient,
        start: CGPoint(x: w/2, y: h),
        end: CGPoint(x: w/2, y: 0),
        options: [])
    ctx.resetClip()

    // --- Subtle inner glow at top ---
    let glowColors = [
        CGColor(red: 0.0, green: 0.78, blue: 0.65, alpha: 0.10),
        CGColor(red: 0.0, green: 0.78, blue: 0.65, alpha: 0.0),
    ] as CFArray
    let glowGradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: glowColors,
        locations: [0.0, 1.0]
    )!
    ctx.addPath(bgPath)
    ctx.clip()
    ctx.drawRadialGradient(glowGradient,
        startCenter: CGPoint(x: w * 0.5, y: h * 0.75),
        startRadius: 0,
        endCenter: CGPoint(x: w * 0.5, y: h * 0.75),
        endRadius: w * 0.7,
        options: [])
    ctx.resetClip()

    // --- Draw meridian globe ---
    let cx = w / 2
    let cy = h / 2
    let r = (w / 2) - padding  // globe radius

    // Clip to bg rounded rect for all subsequent drawing
    ctx.addPath(bgPath)
    ctx.clip()

    // Outer circle (globe outline)
    ctx.setStrokeColor(CGColor(red: 0.0, green: 0.77, blue: 0.65, alpha: 0.30))
    ctx.setLineWidth(size * 0.018)
    ctx.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r*2, height: r*2))
    ctx.strokePath()

    // Equator line (horizontal)
    ctx.setStrokeColor(CGColor(red: 0.0, green: 0.77, blue: 0.65, alpha: 0.25))
    ctx.setLineWidth(size * 0.016)
    ctx.move(to: CGPoint(x: cx - r, y: cy))
    ctx.addLine(to: CGPoint(x: cx + r, y: cy))
    ctx.strokePath()

    // Latitude arc above equator
    let latOffset1 = r * 0.5
    let latRadius1 = sqrt(r*r - latOffset1*latOffset1)
    ctx.setStrokeColor(CGColor(red: 0.0, green: 0.77, blue: 0.65, alpha: 0.18))
    ctx.setLineWidth(size * 0.013)
    ctx.addArc(center: CGPoint(x: cx, y: cy + latOffset1), radius: latRadius1,
               startAngle: CGFloat.pi, endAngle: 0, clockwise: true)
    ctx.strokePath()

    // Latitude arc below equator
    ctx.addArc(center: CGPoint(x: cx, y: cy - latOffset1), radius: latRadius1,
               startAngle: 0, endAngle: CGFloat.pi, clockwise: true)
    ctx.strokePath()

    // --- Prime Meridian arc (bright vertical ellipse) ---
    // This is the "meridian" — a glowing vertical ellipse
    let meridianRx = r * 0.42   // horizontal radius of ellipse (foreshortened)
    let meridianRy = r           // vertical radius = same as globe

    let meridianLineWidth = size * 0.032
    ctx.setLineWidth(meridianLineWidth)

    // Glow pass (wider, dimmer)
    ctx.setStrokeColor(CGColor(red: 0.0, green: 0.86, blue: 0.75, alpha: 0.20))
    ctx.setLineWidth(meridianLineWidth * 2.8)
    ctx.addEllipse(in: CGRect(x: cx - meridianRx, y: cy - meridianRy,
                               width: meridianRx*2, height: meridianRy*2))
    ctx.strokePath()

    // Main meridian arc (bright teal)
    ctx.setLineWidth(meridianLineWidth)
    let tealColor = CGColor(red: 0.0, green: 0.86, blue: 0.75, alpha: 1.0)
    ctx.setStrokeColor(tealColor)
    ctx.addEllipse(in: CGRect(x: cx - meridianRx, y: cy - meridianRy,
                               width: meridianRx*2, height: meridianRy*2))
    ctx.strokePath()

    // --- Pole dots ---
    let poleDotR = size * 0.032
    ctx.setFillColor(tealColor)
    // North pole
    ctx.addEllipse(in: CGRect(x: cx - poleDotR, y: cy + meridianRy - poleDotR,
                               width: poleDotR*2, height: poleDotR*2))
    ctx.fillPath()
    // South pole
    ctx.addEllipse(in: CGRect(x: cx - poleDotR, y: cy - meridianRy - poleDotR,
                               width: poleDotR*2, height: poleDotR*2))
    ctx.fillPath()

    // --- Small crosshair dot at center ---
    let dotR = size * 0.028
    ctx.setFillColor(CGColor(red: 0.0, green: 0.86, blue: 0.75, alpha: 0.70))
    ctx.addEllipse(in: CGRect(x: cx - dotR, y: cy - dotR, width: dotR*2, height: dotR*2))
    ctx.fillPath()

    ctx.resetClip()

    image.unlockFocus()
    return image
}

// Save PNG at a given size
func savePNG(_ image: NSImage, to path: String) {
    guard let cgImg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("Failed to get CGImage for \(path)")
        return
    }
    let bitmapRep = NSBitmapImageRep(cgImage: cgImg)
    guard let data = bitmapRep.representation(using: .png, properties: [:]) else {
        print("Failed PNG encode for \(path)")
        return
    }
    do {
        try data.write(to: URL(fileURLWithPath: path))
        print("Wrote \(path)")
    } catch {
        print("Error writing \(path): \(error)")
    }
}

// Create iconset directory
let iconsetPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "/tmp/Meridian.iconset"

let fm = FileManager.default
try? fm.createDirectory(atPath: iconsetPath, withIntermediateDirectories: true)

let sizes: [(Int, String)] = [
    (16,   "icon_16x16"),
    (32,   "icon_16x16@2x"),
    (32,   "icon_32x32"),
    (64,   "icon_32x32@2x"),
    (128,  "icon_128x128"),
    (256,  "icon_128x128@2x"),
    (256,  "icon_256x256"),
    (512,  "icon_256x256@2x"),
    (512,  "icon_512x512"),
    (1024, "icon_512x512@2x"),
]

for (px, name) in sizes {
    let img = drawIcon(size: CGFloat(px))
    savePNG(img, to: "\(iconsetPath)/\(name).png")
}

print("Done. Run: iconutil -c icns \(iconsetPath)")
