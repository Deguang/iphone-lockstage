# lockstage

把一张壁纸放进**按真机尺寸复刻**的 iPhone 锁屏和主屏里预览。给做壁纸的人用。

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
圆角比例也量不准，锁屏那组还完全没测（模拟器锁屏要按 ⌘L，而 osascript 发按键被系统拦了）。
标出来是为了别把猜的和量的混在一起 —— 这个项目里所有返工都源于这一点。

## 玻璃时钟

锁屏时钟不是「半透明文字」，是一块玻璃：靠边缘折射强、中间几乎不动，边缘有高光也有暗边。

做法是对**字形**求有向距离场（SDF），把梯度编码进位移图的 R/G 通道，
再用 `feImage` + `feDisplacementMap` 推背后的画面。
技法改编自 [shuding/liquid-glass](https://github.com/shuding/liquid-glass)（MIT），
原作对圆角矩形求 SDF，这里换成字形。

字宽走 SF 的 `wdth` 可变轴（本机 `SFNS.ttf` 实测范围 30–150）。
**这条轴只有 Safari 和 macOS 上的 Chrome 能驱动系统字体**，别处会静默回退成常规宽度 ——
所以字号是量出文字实际宽度后反推的，轴生效与否都不会溢出。

## 状态

v0.1，能用但没做完。锁屏版式待实测，景深效果（主体从时钟前穿过）还没接。

## 授权

MIT。玻璃技法改编自 shuding/liquid-glass（MIT）。
