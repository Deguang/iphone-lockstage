import Foundation
import CoreText
import CoreGraphics

// glyph-paths —— 把数字 0–9 和冒号的字形轮廓导成 SVG path。
//
// 为什么要这个：iOS 锁屏时钟用的是 SF 的宽度轴（wdth）。
// Core Text 能取到（实测 wdth 37 时 "11:49" 的宽高比 1.33，和真机拉伸态一致），
// 但**浏览器驱动不了系统字体这条轴** —— 实测 Chrome 里 wdth 150→30
// 全部返回同一个宽度，一点不变。
//
// 所以不在浏览器里排字：这里把轮廓导成路径，网页直接画 <path>。
// 任何浏览器都精确，也不用分发 Apple 的字体文件。
//
//   glyph-paths --wdth 37 --wght 250 --size 1000 > glyphs.json
//
// 输出每个字形的 path（y 轴已翻转成 SVG 方向）、advance 宽度，以及整体的
// em 尺寸，网页按需缩放。

func fontWith(size: CGFloat, wdth: CGFloat, wght: CGFloat, opsz: CGFloat) -> CTFont {
    let base = CTFontCreateUIFontForLanguage(.system, size, nil)!
    let vars: [CFNumber: Any] = [
        0x77647468 as CFNumber: wdth,   // 'wdth'
        0x77676874 as CFNumber: wght,   // 'wght'
        0x6f70737a as CFNumber: opsz,   // 'opsz'
    ]
    let desc = CTFontDescriptorCreateCopyWithAttributes(
        CTFontCopyFontDescriptor(base),
        [kCTFontVariationAttribute: vars] as CFDictionary)
    return CTFontCreateWithFontDescriptor(desc, size, nil)
}

func arg(_ k: String, _ d: Double) -> Double {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: k), i + 1 < a.count else { return d }
    return Double(a[i + 1]) ?? d
}

let size = CGFloat(arg("--size", 1000))
let wdth = CGFloat(arg("--wdth", 37))
let wght = CGFloat(arg("--wght", 250))
let font = fontWith(size: size, wdth: wdth, wght: wght, opsz: 96)

/// CGPath → SVG path d。y 轴翻转：CG 向上为正，SVG 向下为正
func svgPath(_ path: CGPath) -> String {
    var d = ""
    let fmt = { (v: CGFloat) -> String in String(format: "%.1f", v) }
    path.applyWithBlock { el in
        let p = el.pointee.points
        switch el.pointee.type {
        case .moveToPoint:
            d += "M\(fmt(p[0].x)) \(fmt(-p[0].y))"
        case .addLineToPoint:
            d += "L\(fmt(p[0].x)) \(fmt(-p[0].y))"
        case .addQuadCurveToPoint:
            d += "Q\(fmt(p[0].x)) \(fmt(-p[0].y)) \(fmt(p[1].x)) \(fmt(-p[1].y))"
        case .addCurveToPoint:
            d += "C\(fmt(p[0].x)) \(fmt(-p[0].y)) \(fmt(p[1].x)) \(fmt(-p[1].y)) \(fmt(p[2].x)) \(fmt(-p[2].y))"
        case .closeSubpath:
            d += "Z"
        @unknown default: break
        }
    }
    return d
}

var out: [String: Any] = [:]
var glyphs: [String: Any] = [:]
var minY = CGFloat.greatestFiniteMagnitude, maxY = -CGFloat.greatestFiniteMagnitude

for ch in "0123456789:" {
    let s = String(ch)
    var uni = Array(s.utf16)
    var glyph = CGGlyph()
    guard CTFontGetGlyphsForCharacters(font, &uni, &glyph, 1) else { continue }
    guard let p = CTFontCreatePathForGlyph(font, glyph, nil) else { continue }
    var adv = CGSize()
    CTFontGetAdvancesForGlyphs(font, .horizontal, &glyph, &adv, 1)
    let bb = p.boundingBox
    minY = min(minY, -bb.maxY); maxY = max(maxY, -bb.minY)
    glyphs[s] = ["d": svgPath(p), "advance": Double(adv.width),
                 "w": Double(bb.width), "h": Double(bb.height)]
}

out["em"] = Double(size)
out["inkTop"] = Double(minY)
out["inkBottom"] = Double(maxY)
out["font"] = CTFontCopyPostScriptName(font) as String
out["axes"] = ["wdth": Double(wdth), "wght": Double(wght)]
out["glyphs"] = glyphs

let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
