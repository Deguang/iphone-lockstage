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
async function cut(left, top, w, h, radiusRatio) {
  const r = Math.round(Math.min(w, h) * radiusRatio);
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const buf = await sharp(file).extract({ left, top, width: w, height: h })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

// 组件圆角实测 18.6% 宽（图标是 25% 边长）—— 同样从 reference/home.png 拟合出来的
const WIDGET_R = 0.186;
const size = px(H.icon.size);
const colX = (c) => px(H.grid.marginLeft + c * H.grid.columnPitch);
const rowY = (r) => px(H.grid.firstIconRowTop + r * H.grid.rowPitch);

const out = { _source: path.basename(file), _captured: M._captured, icons: [], widgets: [], dock: [] };

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

// 小组件：实测条带 y top..top+height，左右用列投影找边界
{
  const wy = px(H.widget2x2.top), wh = px(H.widget2x2.height);
  const { data, info } = await sharp(file)
    .extract({ left: 0, top: wy, width: M.screen.px.w, height: wh })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const hit = [];
  for (let x = 0; x < info.width; x++) {
    let n = 0;
    for (let y = 0; y < info.height; y++) if (data[y * info.width + x] > 30) n++;
    hit.push(n > 10);
  }
  const segs = [];
  let s = -1;
  for (let x = 0; x < info.width; x++) {
    if (hit[x]) { if (s < 0) s = x; } else if (s >= 0) { if (x - s > 40) segs.push([s, x - 1]); s = -1; }
  }
  for (const [x0, x1] of segs) out.widgets.push({ x: x0, w: x1 - x0 + 1, uri: await cut(x0, wy, x1 - x0 + 1, wh, WIDGET_R) });
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
const dest = new URL('../src/icons.js', import.meta.url);
fs.writeFileSync(dest, 'window.LS_ICONS=' + JSON.stringify(out) + ';');
const kb = (fs.statSync(dest).size / 1024).toFixed(0);
console.log(`图标 ${out.icons.length} 个 · 组件 ${out.widgets.length} 个 · Dock ${out.dock.length} 个 → src/icons.js (${kb} KB)`);
console.log('⚠️ 这是 Apple 的图标素材，已在 .gitignore 里，不要提交。');
