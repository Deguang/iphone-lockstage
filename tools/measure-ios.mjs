#!/usr/bin/env node
/**
 * 从 iOS 模拟器的真机截图里量出版式常量。
 *
 * 为什么要有这个脚本：这个项目唯一能赢闭源工具的地方就是**准**，
 * 而「准」不能靠查设计博客或者对着截图目测 —— 两者都试过，都错。
 * 状态栏左边距我原本按感觉写 28pt，实测是 61pt，差一倍多。
 *
 * 所以规矩是：**每一个版式数字都必须能被这个脚本从真机截图里重新量出来。**
 * 改了常量就重跑一次，对不上就是常量错了，不是截图错了。
 *
 * 用法：
 *   xcrun simctl boot "iPhone 17 Pro Max"
 *   xcrun simctl io booted screenshot reference/home.png
 *   node tools/measure-ios.mjs reference/home.png
 *
 * 原理：模拟器默认壁纸是纯黑，图标、文字、Dock 全是非黑区域，
 * 用连通的行列投影就能精确切出来，不需要任何图像识别。
 * **换成有图案的壁纸这个脚本就不成立** —— 所以量之前别换壁纸。
 */
import sharp from 'sharp';

const THRESH = 28;          // 高于这个灰度算「有东西」。模拟器黑底实测噪声 < 12
const MIN_RUN = 6;          // 小于这么多像素的条带当噪声丢掉

async function load(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height };
}

/** 横向条带：每一行统计非黑像素，连续的行合成一段 */
function bands({ d, w, h }) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let n = 0, x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (d[y * w + x] > THRESH) { n++; if (x0 < 0) x0 = x; x1 = x; }
    rows.push({ n, x0, x1 });
  }
  const out = [];
  let s = -1;
  for (let y = 0; y < h; y++) {
    if (rows[y].n > 3) { if (s < 0) s = y; }
    else if (s >= 0) { if (y - s > MIN_RUN) out.push({ y0: s, y1: y - 1 }); s = -1; }
  }
  if (s >= 0) out.push({ y0: s, y1: h - 1 });
  return out.map((b) => {
    const rs = rows.slice(b.y0, b.y1 + 1).filter((r) => r.n > 3);
    return { ...b, x0: Math.min(...rs.map((r) => r.x0)), x1: Math.max(...rs.map((r) => r.x1)) };
  });
}

/** 某个横带里的纵向分段 —— 用来量图标列、状态栏各个图元 */
function columns({ d, w }, y0, y1, minGap = 8) {
  const hit = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (d[y * w + x] > THRESH) n++;
    hit.push(n > 2);
  }
  const seg = [];
  let s = -1;
  for (let x = 0; x < w; x++) {
    if (hit[x]) { if (s < 0) s = x; }
    else if (s >= 0) { if (x - s > minGap) seg.push({ x0: s, x1: x - 1 }); s = -1; }
  }
  if (s >= 0) seg.push({ x0: s, x1: w - 1 });
  return seg;
}

const file = process.argv[2];
if (!file) {
  console.error('用法: node tools/measure-ios.mjs <模拟器截图.png>');
  process.exit(2);
}

const img = await load(file);
// @3x 设备：像素宽 ÷ 3 = 点宽。440pt 是 iPhone 17 Pro Max
const SCALE = 3;
const pt = (px) => +(px / SCALE).toFixed(1);

console.log(`截图 ${img.w}×${img.h}px = ${pt(img.w)}×${pt(img.h)}pt @${SCALE}x\n`);

const bs = bands(img);
console.log('横向条带:');
for (const b of bs) {
  console.log(`  y ${String(b.y0).padStart(4)}–${String(b.y1).padStart(4)}  ` +
    `顶 ${String(pt(b.y0)).padStart(6)}pt  高 ${String(pt(b.y1 - b.y0 + 1)).padStart(6)}pt  ` +
    `x ${String(pt(b.x0)).padStart(5)}–${pt(b.x1)}pt`);
}

// 图标行 = 高度接近 68pt 且横跨大半屏宽的条带
const iconRows = bs.filter((b) => {
  const hh = pt(b.y1 - b.y0 + 1);
  return hh > 55 && hh < 85 && (b.x1 - b.x0) / img.w > 0.7;
});
if (iconRows.length) {
  const r = iconRows[0];
  const segs = columns(img, r.y0, r.y1);
  console.log(`\n图标网格（取第一行 y ${r.y0}–${r.y1}）:`);
  console.log(`  图标边长 ${pt(segs[0].x1 - segs[0].x0 + 1)}pt   列数 ${segs.length}`);
  if (segs.length > 1) {
    const pitch = segs.slice(1).map((s, i) => pt(s.x0 - segs[i].x0));
    console.log(`  列距 ${pitch.join(' / ')}pt   左边距 ${pt(segs[0].x0)}pt   右边距 ${pt(img.w - segs[segs.length - 1].x1 - 1)}pt`);
  }
  if (iconRows.length > 1) console.log(`  行距 ${pt(iconRows[1].y0 - iconRows[0].y0)}pt`);
}

// 状态栏 = 最靠上的那条窄带
const sb = bs[0];
if (sb) {
  const segs = columns(img, sb.y0, sb.y1, 4);
  console.log(`\n状态栏:`);
  console.log(`  顶边 ${pt(sb.y0)}pt   墨迹高 ${pt(sb.y1 - sb.y0 + 1)}pt`);
  console.log(`  左起 ${pt(sb.x0)}pt（时间）   右至 ${pt(sb.x1)}pt（电池右缘）`);
  console.log(`  图元 ${segs.length} 段：` + segs.map((s) => `${pt(s.x0)}–${pt(s.x1)}`).join('  '));
}
