# iphone-lockstage

**Preview a wallpaper on a pixel-accurate iOS lock screen and home screen.**
An iPhone lock screen / home screen wallpaper preview tool, for people who make wallpapers.

[English](#english) · [中文](#中文) · **Live demo → https://app.lideguang.com/iphone-lockstage/**

---

## English

### What it does

Drop in a wallpaper and see it behind a real iOS 26 lock screen — clock, lunar date,
Dynamic Island, status bar — and behind a home screen on the real icon grid. Export the
lock screen at full resolution (1320×2868), or a 3:4 side-by-side of both screens.

Every wallpaper has to answer two questions, and neither is answerable in Photoshop:

- **Where exactly does the clock land on it?**
- **Do app icons stay readable on top of it?**

### Why another iPhone mockup tool

| Existing | What it is | What's missing |
|---|---|---|
| [shuding/liquid-glass](https://github.com/shuding/liquid-glass) · 1.2k★ MIT | iOS 26 glass material | Not a lock screen |
| [EdenQwQ/waydeeper](https://github.com/EdenQwQ/waydeeper) · 149★ MIT | Depth wallpaper engine | Rust / Wayland |
| [nfzv/depth_clock_wallpaper](https://github.com/nfzv/depth_clock_wallpaper) · MIT | Depth clock | C# / Windows desktop |
| mockup-factory and friends | A phone shell around a screenshot | No lock screen elements at all |
| wallpapermockup.com | Works | Closed source |

The GitHub topic `ios-lockscreen` had **zero repositories**; `ios-lockscreen` and
`iphone-mockup` are both unclaimed on npm.

### The only selling point is accuracy, so every number is reproducible

Wrapping a screenshot in a phone bezel is easy. Whether this project deserves to exist
comes down to whether the layout numbers are right.

**Every layout constant is measured from an iOS Simulator screenshot** — see
`src/ios-metrics.json`. Each one can be re-derived with `tools/measure-ios.mjs`:

```bash
xcrun simctl boot "iPhone 17 Pro Max"
xcrun simctl io booted screenshot reference/home.png
node tools/measure-ios.mjs reference/home.png
```

The method is dumb but stable: the simulator's default wallpaper is pure black, so
icons, text and the Dock are simply the non-black regions — row/column projection finds
them, no image recognition needed. **Change the wallpaper and this script stops working.**

Measured (iOS 26.2 / iPhone 17 Pro Max / 440×956pt @3x):

| Item | Value |
|---|---|
| Status bar ink | top 25pt, height 14.3pt |
| Clock left margin | 60.7pt |
| Icon side | 68pt |
| Icon column / row pitch | 100.7pt / 108.7pt |
| Side margins | 35pt each |
| Dock | 406 × 117.3pt, left margin 17pt |
| Search pill | 61 × 30pt |

**Anything not measured is flagged as such** (`_caveat` / `_status: unverified`). The
Dynamic Island can't be segmented out of a black-on-black screenshot, and the corner
radius can't be fitted from it either. The lock screen group was measured later
(`lockScreen._status: "measured"`): clock and date ink boxes came off `reference/lock.png`
and `lock2.png` — and the flashlight/camera buttons and the home indicator turned out
**not to exist there at all** (zero bright pixels in both regions), so the page doesn't
draw them. Flagging the unmeasured ones matters: every piece of rework in this project
traces back to mixing guesses with measurements.

### The clock isn't glass — it's one flat translucent white

The lock screen clock was first built as glass: a signed distance field over the glyph
outlines, gradients encoded into a displacement map, `feImage` + `feDisplacementMap` to
refract the picture behind it (technique adapted from
[shuding/liquid-glass](https://github.com/shuding/liquid-glass), MIT).

**Measurement killed it.** 397 sample points on a device screenshot: the clock pixels sit
at α = 0.601 ± 0.072 relative to the background, and **that ratio stays constant across
backgrounds of very different brightness**. Refraction's ratio would vary with background
structure; a constant ratio can only be a fixed-opacity white. SDF, displacement,
specular and the dark edge were all deleted.

What survived is the half that was actually needed: **glyphs must come from Core Text,
not SVG `<text>`.** iOS uses SF's width axis (`wdth`) for the compressed digits, and
librsvg/fontconfig can't reach that axis — asking Core Text for `.SFNS-Compressed` by
name silently falls back to Times New Roman. So `tools/glyph-paths` (Swift + Core Text)
exports the outlines as SVG paths and the page draws `<path>` directly. Exact in any browser.

One more thing that only showed up in rendered output: **size the clock by ink height,
not by width.** A real device uses a fixed point size, so the string's width varies with
the digits. Deriving size from width makes "11:49" (two narrow 1s) render taller than
"16:55" and collide with the date line above it.

### Assets: ships the tools, not someone else's artwork

With no real icons present, the home screen draws **three rows of translucent rounded
slabs** — no symbols, no app names, no third-party assets of any kind. Sizes and grid come
from the measured constants; the fill follows the wallpaper's brightness, sampled
separately for the icon area and the Dock.

That also suits the job better: this tool exists to look at the **wallpaper**. The home
screen only has to answer "is it still readable with things on top of it".

**Apple's icon artwork (`src/icons.js`, ~729 KB) is not in this repository.** Extract
your own if you want the real thing:

```bash
xcrun simctl io booted screenshot reference/home.png
node tools/extract-icons.mjs reference/home.png     # → src/icons.js
```

Drop it into `src/` and the page switches to real icons (widgets + two rows of apps); the
placeholder slabs step aside.

The one exception is `src/glyphs.js` (22 digit outlines, 20 KB) — without it the page
draws no clock at all, and the clock is the entire point of the tool. It is Apple's,
**outside this repository's MIT license**; see [NOTICE](NOTICE).

### Status

Working. Layout constants for both screens are measured; clock, lunar date, Dynamic
Island and side-by-side export are all in. The depth effect (subject passing in front of
the clock) isn't wired up yet.

### License

MIT — **for this project's own code only**.

`src/glyphs.js` is Apple's glyph outline data and is not covered. See [NOTICE](NOTICE).

The early glass-clock technique was adapted from
[shuding/liquid-glass](https://github.com/shuding/liquid-glass) (MIT); that code was later
refuted by measurement and removed, but the credit stays.

---

## 中文

把一张壁纸放进**按真机尺寸复刻**的 iPhone 锁屏和主屏里预览。给做壁纸的人用。

**在线预览 → https://app.lideguang.com/iphone-lockstage/**

线上那份不含 Apple 的图标美术 —— 主屏画的是三排半透明占位块。
放了自己抠的 `src/icons.js` 才会切成真图标（组件 + 两排 app）。

### 为什么又造一个

做壁纸要回答两个问题：装上去时钟压在哪、图标压上去还读不读得清。现成的工具回答不了：

| 有的 | 是什么 | 缺什么 |
|---|---|---|
| [shuding/liquid-glass](https://github.com/shuding/liquid-glass) · 1.2k★ MIT | iOS 26 玻璃材质 | 不是锁屏 |
| [EdenQwQ/waydeeper](https://github.com/EdenQwQ/waydeeper) · 149★ MIT | 景深壁纸引擎 | Rust / Wayland |
| [nfzv/depth_clock_wallpaper](https://github.com/nfzv/depth_clock_wallpaper) · MIT | 景深时钟 | C# / Windows 桌面 |
| mockup-factory 一类 | 手机套壳放截图 | 没有任何锁屏元素 |
| wallpapermockup.com | 能用 | 闭源 |

GitHub 话题 `ios-lockscreen` 是 **0 个仓库**，npm 上 `ios-lockscreen` / `iphone-mockup` 都不存在。

### 唯一的卖点是准，所以数字必须可复现

套壳放截图谁都会做。这个项目值不值得存在，取决于版式数字准不准。

**所有版式常量来自 iOS 模拟器真机截图实测**，见 `src/ios-metrics.json`，
每一个都能用 `tools/measure-ios.mjs` 从截图里重新量出来：

```bash
xcrun simctl boot "iPhone 17 Pro Max"
xcrun simctl io booted screenshot reference/home.png
node tools/measure-ios.mjs reference/home.png
```

原理很笨但很稳：模拟器默认壁纸是纯黑，图标、文字、Dock 全是非黑区域，
行列投影就能切出来，不需要任何图像识别。**换了壁纸这个脚本就不成立。**

实测出来的（iOS 26.2 / iPhone 17 Pro Max / 440×956pt @3x）：

| 项 | 值 |
|---|---|
| 状态栏墨迹 | 顶边 25pt，高 14.3pt |
| 时间左边距 | 60.7pt |
| 图标边长 | 68pt |
| 图标列距 / 行距 | 100.7pt / 108.7pt |
| 左右边距 | 各 35pt |
| Dock | 406 × 117.3pt，左边距 17pt |
| 搜索胶囊 | 61 × 30pt |

**没实测的都标了出来**（`_caveat` / `_status: unverified`）：灵动岛在黑底截图上切不出来，
圆角比例也量不准。锁屏那组后来测了（`lockScreen._status: "measured"`）——
时钟和日期的墨迹包围盒都从 reference/lock.png、lock2.png 上量出来了，
而**手电筒/相机按钮和 home 指示条实测是不存在的**（两张截图里那两块区域亮像素都是 0），
所以页面也不画它们。
标出来是为了别把猜的和量的混在一起 —— 这个项目里所有返工都源于这一点。

### 时钟：不是玻璃，是一层半透明白

一开始把锁屏时钟当成玻璃做的：对字形求有向距离场（SDF），把梯度编码进位移图，
再用 `feImage` + `feDisplacementMap` 推背后的画面（技法改编自
[shuding/liquid-glass](https://github.com/shuding/liquid-glass)，MIT）。

**实测把这套推翻了。** 在真机截图上取了 397 个采样点，时钟像素相对背景的比值
α = 0.601 ± 0.072，而且**这个比值在明暗差异很大的几块背景上保持恒定**。
折射的比值会随背景结构变化；恒定比值只能是一层固定透明度的白。
于是 SDF、位移折射、高光、暗边全部删掉了。

留下来的是另一半，而那一半是真需要的：**字形必须走 Core Text，不能用 SVG `<text>`。**
iOS 用的是 SF 的宽度轴（wdth）压缩字形，而 librsvg/fontconfig 够不到这条轴，
CoreText 按名字取也会静默回退（要 `.SFNS-Compressed`，给的是 Times New Roman）。
所以字形由 `tools/glyph-paths`（Swift + Core Text）导成 SVG path，网页直接画 `<path>`，
任何浏览器都精确。

还有一条是出图才发现的：**时钟按字高定大小，不按宽度。**
真机是固定字号，显示什么数字宽度就随之变；按宽度反推会让「11:49」（两个窄的 1）
被放得比「16:55」更高，压到农历那行上。

### 素材：带工具，不带别人的资产

没放真图标时，主屏画**三排半透明圆角块** —— 没有符号、没有应用名、
不含任何第三方素材。尺寸和网格全部取自实测常量，
颜色跟着壁纸明暗走（图标区和 Dock 分别取样）。

这样也更合本职：这个工具是看**壁纸**的，主屏只需要回答「压上去还读不读得清」。

**Apple 的图标美术（`src/icons.js`，约 729 KB）不入库。** 想用真图标就自己抠：

```bash
xcrun simctl io booted screenshot reference/home.png
node tools/extract-icons.mjs reference/home.png     # → src/icons.js
```

放进 `src/` 后页面自动切回真图标（组件 + 两排 app），占位块让位。

唯一的例外是 `src/glyphs.js`（22 个数字的轮廓，20 KB）——
页面缺了它就不画时钟，而时钟是这个工具的全部意义。它版权归 Apple，
**不在本仓库的 MIT 范围内**，详见 [NOTICE](NOTICE)。

### 状态

能用。版式常量（主屏 + 锁屏）都已实测，时钟、农历日期、灵动岛、并排导出都在。
景深效果（主体从时钟前穿过）还没接。

### 授权

MIT —— **仅适用于本项目的代码**。

`src/glyphs.js` 是 Apple 的字形轮廓，不在此范围内。见 [NOTICE](NOTICE)。

早期的玻璃时钟技法改编自 [shuding/liquid-glass](https://github.com/shuding/liquid-glass)（MIT），
那部分代码后来被实测推翻并删除了，致谢保留。
