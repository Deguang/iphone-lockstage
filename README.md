# lockstage

把一张壁纸放进**按真机尺寸复刻**的 iPhone 锁屏和主屏里预览。给做壁纸的人用。


## 在线预览

https://app.lideguang.com/lockstage/

线上那份不含 Apple 的图标美术 —— 主屏画的是三排半透明占位块。
放了自己抠的 `src/icons.js` 才会切成真图标（组件 + 两排 app）。

## 为什么又造一个

做壁纸要回答两个问题：装上去时钟压在哪、图标压上去还读不读得清。现成的工具回答不了：

| 有的 | 是什么 | 缺什么 |
|---|---|---|
| [shuding/liquid-glass](https://github.com/shuding/liquid-glass) · 1.2k★ MIT | iOS 26 玻璃材质 | 不是锁屏 |
| [EdenQwQ/waydeeper](https://github.com/EdenQwQ/waydeeper) · 149★ MIT | 景深壁纸引擎 | Rust / Wayland |
| [nfzv/depth_clock_wallpaper](https://github.com/nfzv/depth_clock_wallpaper) · MIT | 景深时钟 | C# / Windows 桌面 |
| mockup-factory 一类 | 手机套壳放截图 | 没有任何锁屏元素 |
| wallpapermockup.com | 能用 | 闭源 |

GitHub 话题 `ios-lockscreen` 是 **0 个仓库**，npm 上 `ios-lockscreen` / `iphone-mockup` 都不存在。

## 唯一的卖点是准，所以数字必须可复现

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

## 时钟：不是玻璃，是一层半透明白

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

## 状态

能用。版式常量（主屏 + 锁屏）都已实测，时钟、农历日期、灵动岛、并排导出都在。
景深效果（主体从时钟前穿过）还没接。

## 素材：带工具，不带别人的资产

没放真图标时，主屏画**三排半透明圆角块** —— 没有符号、没有应用名、
不含任何第三方素材。尺寸和网格全部取自 `src/ios-metrics.json` 的实测值，
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

## 授权

MIT —— **仅适用于本项目的代码**。

`src/glyphs.js` 是 Apple 的字形轮廓，不在此范围内。见 [NOTICE](NOTICE)。

早期的玻璃时钟技法改编自 [shuding/liquid-glass](https://github.com/shuding/liquid-glass)（MIT），
那部分代码后来被实测推翻并删除了，致谢保留。
