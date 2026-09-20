# glyph-paths

把数字 0–9 和冒号的字形轮廓导成 SVG path。

```bash
swiftc -O -o glyph-paths main.swift
./glyph-paths --wdth 37 --wght 250 --size 1000 > ../../src/glyphs.js
```

**为什么需要它**：iOS 锁屏时钟走 SF 的 `wdth` 可变轴，而浏览器驱动不了系统字体这条轴 ——
Chrome 实测 `font-variation-settings: 'wdth' 150 / 100 / 70 / 50 / 40 / 30`
全部返回同一个宽度，一点不变。

所以不在浏览器里排字：这里离线导出轮廓，网页直接画 `<path>`。
任何浏览器都精确，也不必分发 Apple 的字体文件。

对上真机的轴值（真机实测见 `src/ios-metrics.json`）：

| 态 | `--wdth` | 导出后单字宽高比 | 真机实测 |
|---|---|---|---|
| 拉伸 | 37 | 0.257 | 0.26 |
| 默认 | 85 | 0.587 | 0.61 |

⚠️ 导出的轮廓源自 Apple 的字体，**不要提交** `src/glyphs.js`（已 gitignore）。
