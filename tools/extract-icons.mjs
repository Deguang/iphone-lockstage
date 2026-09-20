#!/usr/bin/env node
/**
 * 从 iOS 模拟器主屏截图里抠出真实的 App 图标、小组件、Dock 图标，
 * 写成 src/icons.js（data URI）。
 *
 * ⚠️ **抠出来的是 Apple 的图标素材，不进仓库。**
 * src/icons.js 已在 .gitignore 里。仓库只带这个抽取器，
 * 谁用谁从自己机器的模拟器截图里抠 —— 和 measure-ios.mjs 是同一个路子：
 * 带工具，不带别人的资产。
 *
 * 用法：
 *   xcrun simctl io booted screenshot reference/home.png
 *   node tools/extract-icons.mjs reference/home.png
 *
 * 位置不是写死的，是从 src/ios-metrics.json 的实测网格算出来的，
 * 所以换机型只要重跑 measure-ios.mjs 更新常量即可。
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const file = process.argv[2] || 'reference/home.png';
/* 组件可以来自另一张截图。
   原因：全新模拟器的地图/日历组件是**空白**的（没有位置和日历数据）。
   跑一次 Maps/Calendar 才有内容，但那会弹定位权限对话框挡住屏幕中部 ——
   而组件在顶部不受影响，所以图标用黑底那张、组件用有内容那张，各取所需。
   `--widgets <png>` 指定组件来源。 */
const wIdx = process.argv.indexOf('--widgets');
const widgetFile = wIdx > 0 ? process.argv[wIdx + 1] : file;
if (!fs.existsSync(file)) {
  console.error(`截图不存在: ${file}\n先跑: xcrun simctl io booted screenshot ${file}`);
  process.exit(2);
}

const M = JSON.parse(fs.readFileSync(new URL('../src/ios-metrics.json', import.meta.url), 'utf8'));
const H = M.homeScreen;
const G = M.screen.scale;                 // pt → px
const px = (v) => Math.round(v * G);

const img = sharp(file);
const meta = await img.metadata();
if (meta.width !== M.screen.px.w) {
  console.error(`截图宽 ${meta.width}px 与常量里的 ${M.screen.px.w}px 不符 —— 机型不同就先重跑 measure-ios.mjs`);
  process.exit(2);
}

/**
 * 裁一块出来，**按圆角挖掉四角**，转 data URI。
 *
 * 不挖角的话四角会带上壁纸的黑色，叠到别的壁纸上就是四个黑角 —— 踩过。
 * 圆角半径用实测值：图标 25% 边长、组件 18.6% 宽（tools 里量的，见 ios-metrics.json）。
 */
/**
 * 裁一块出来，按圆角挖掉四角，转 data URI。
 *
 * ⚠️ **遮罩要比图标本身内缩一两像素。**
 * 图标是从**黑底**截图上抠的，边缘那一圈抗锯齿像素混了黑背景 ——
 * 叠在深色壁纸上看不出来，叠在浅色壁纸上就是一圈黑边。
 * 把那圈受污染的像素切掉即可；68pt 的图标少两像素看不出来，黑边却没了。
 *
 * （更严谨的做法是拿黑底和白底两张截图解 alpha matting，
 *   但需要同一壁纸位置的干净背景，成本远高于内缩两像素。）
 */
const EDGE_INSET = 2;   // px，@3x 下约 0.67pt

async function cut(left, top, w, h, radiusRatio, src = file) {
  const inset = EDGE_INSET;
  const iw = w - inset * 2, ih = h - inset * 2;
  const r = Math.round(Math.min(iw, ih) * radiusRatio);
  const mask = Buffer.from(
    `<svg width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const buf = await sharp(src)
    .extract({ left: left + inset, top: top + inset, width: iw, height: ih })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

// 组件圆角实测 18.6% 宽（图标是 25% 边长）—— 同样从 reference/home.png 拟合出来的
const WIDGET_R = 0.186;
const size = px(H.icon.size);
const colX = (c) => px(H.grid.marginLeft + c * H.grid.columnPitch);
const rowY = (r) => px(H.grid.firstIconRowTop + r * H.grid.rowPitch);

const out = { _source: path.basename(file), _widgetSource: path.basename(widgetFile), _captured: M._captured, icons: [], widgets: [], dock: [], statusBar: {} };

// 图标：按实测网格逐格裁。空格子（纯黑）跳过
for (let r = 0; r < 2; r++) {
  for (let c = 0; c < H.grid.columns; c++) {
    const x = colX(c), y = rowY(r);
    const stats = await sharp(file).extract({ left: x, top: y, width: size, height: size })
      .greyscale().stats();
    if (stats.channels[0].max < 30) continue;        // 全黑＝这格没图标
    out.icons.push({ row: r, col: c, uri: await cut(x, y, size, size, H.icon.cornerRadiusRatio) });
  }
}

// 小组件：位置直接用实测网格算，**不再靠「非黑即内容」找边界** ——
// 组件那张截图的壁纸不一定是黑的，投影法会失效。
{
  const wy = px(H.widget2x2.top), wh = px(H.widget2x2.height);
  const left0 = px(H.widget2x2.left);
  const right1 = px(H.widget2x2.right);
  const gap = px(H.grid.columnPitch - H.icon.size);      // 两个组件之间的空隙
  const ww = Math.round((right1 - left0 - gap) / 2);
  for (const x0 of [left0, left0 + ww + gap]) {
    out.widgets.push({ x: x0, w: ww, uri: await cut(x0, wy, ww, wh, WIDGET_R, widgetFile) });
  }
}

// Dock 图标：在 Dock 条带里按列投影找
{
  const dy = px(H.dock.top), dh = px(H.dock.height);
  const { data, info } = await sharp(file)
    .extract({ left: 0, top: dy, width: M.screen.px.w, height: dh })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const hit = [];
  for (let x = 0; x < info.width; x++) {
    let n = 0;
    for (let y = 0; y < info.height; y++) if (data[y * info.width + x] > 60) n++;
    hit.push(n > 20);
  }
  const segs = [];
  let s = -1;
  for (let x = 0; x < info.width; x++) {
    if (hit[x]) { if (s < 0) s = x; } else if (s >= 0) { if (x - s > 60) segs.push([s, x - 1]); s = -1; }
  }
  for (const [x0, x1] of segs) {
    const w = x1 - x0 + 1;
    const top = dy + Math.round((dh - w) / 2);
    out.dock.push({ x: x0, w, uri: await cut(x0, top, w, w, H.icon.cornerRadiusRatio) });
  }
}

/* 输出 .js 而不是 .json：index.html 直接双击用 file:// 打开时，
   XMLHttpRequest 取同目录 json 会被 CORS 挡（Chrome 下必然），
   而 <script src> 不受这个限制。 */
/* 状态栏图元：信号 / Wi-Fi / 电池。
   **抠成「白色 + 灰度当 alpha」**，不是直接裁一块 —— 直接裁会把黑底一起带上，
   叠到别的壁纸上就是一块黑方块。
   这几个图元我手画过两轮，每轮都错（信号画成递增高度的条、Wi-Fi 三段弧凭感觉），
   所以改成从真机抠。位置用逐图元实测值（见 ios-metrics.json statusBar）。 */
{
  const SB = M.statusBar;
  const pad = 2;   // 留一点边，别把抗锯齿边缘切掉
  for (const [name, g] of [['signal', { x0: SB.signal.x0, x1: SB.signal.x0 + 3 * SB.signal.pitch + SB.signal.dotW }],
                           ['wifi', { x0: SB.wifi.x0, x1: SB.wifi.x1 }],
                           ['battery', { x0: SB.battery.x0, x1: SB.battery.x1 }]]) {
    const x = px(g.x0) - pad, w = px(g.x1 - g.x0) + pad * 2;
    const y = px(SB.inkTop) - pad, h = px(SB.inkBottom - SB.inkTop) + pad * 2;
    const grey = await sharp(file).extract({ left: x, top: y, width: w, height: h })
      .greyscale().raw().toBuffer();
    // 白色像素 + 灰度当 alpha
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = grey[i];
    }
    const buf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    out.statusBar[name] = { xPt: g.x0 - pad / G, yPt: SB.inkTop - pad / G,
                            wPt: (g.x1 - g.x0) + 2 * pad / G, hPt: (SB.inkBottom - SB.inkTop) + 2 * pad / G,
                            uri: 'data:image/png;base64,' + buf.toString('base64') };
  }
}

const dest = new URL('../src/icons.js', import.meta.url);
fs.writeFileSync(dest, 'window.LS_ICONS=' + JSON.stringify(out) + ';');
const kb = (fs.statSync(dest).size / 1024).toFixed(0);
console.log(`图标 ${out.icons.length} 个 · 组件 ${out.widgets.length} 个 · Dock ${out.dock.length} 个 · 状态栏 ${Object.keys(out.statusBar).length} 个 → src/icons.js (${kb} KB)`);
console.log('⚠️ 这是 Apple 的图标素材，已在 .gitignore 里，不要提交。');
