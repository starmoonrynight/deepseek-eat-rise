#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/build-single.mjs —— 打包成"双击即玩"的单文件 HTML
   ------------------------------------------------------------------
   把 css / js / 立绘图片全部内联进一个 .html：
     · <link rel=stylesheet> → <style>
     · <script src="js/*.js"> → <script>…</script>（保持原顺序）
     · assets/*.png → base64 data URL，挂到 window.DSF_ASSETS
   这样它不依赖任何外部文件：双击能玩、丢到任意静态托管能玩、
   微信/QQ 发给人也能玩（手机上存下来用浏览器打开）。
   图片是 data URL，不会被判定成跨域，所以连自动抠背景都能正常工作。

   用法： node tools/build-single.mjs
   产物： dist/index.html （单文件，改个名就能发给别人；丢进任意静态托管也能直接跑）
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const OUT_NAME = 'index.html';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

/* ── 图片 → data URL ─────────────────────────────────────── */
function dataUrl(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  const isPng = buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
  return 'data:image/png;base64,' + buf.toString('base64') + (isPng ? '' : '');
}

let html = read('index.html');
const warnings = [];

/* ── 1. 内联 CSS ─────────────────────────────────────────── */
html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (m, href) => {
  if (!exists(href)) { warnings.push('找不到样式表 ' + href); return m; }
  return '<style>\n' + read(href) + '\n</style>';
});

/* ── 2. 内联立绘（放在所有脚本之前） ─────────────────────── */
const artKeys = { fish: 'assets/fish.png', fish_bowl: 'assets/fish_bowl.png', claude: 'assets/claude.png', user: 'assets/user.png' };
const artPairs = [];
for (const k of Object.keys(artKeys)) {
  const d = dataUrl(artKeys[k]);
  if (d) artPairs.push(JSON.stringify(k) + ':' + JSON.stringify(d));
  else if (k === 'fish' || k === 'fish_bowl') warnings.push('缺少 ' + artKeys[k] + '（将退回程序化画法）');
}
const artScript = artPairs.length
  ? '<script>window.DSF_ASSETS={' + artPairs.join(',') + '};</script>\n'
  : '';

/* ── 3. 内联 JS（严格保持 index.html 里的先后顺序） ───────── */
let inlineCount = 0;
html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
  if (!exists(src)) { warnings.push('找不到脚本 ' + src); return m; }
  inlineCount++;
  const code = read(src);
  /* 脚本里出现 </script> 会提前结束标签，做个保险替换 */
  return '<script>\n' + code.replace(/<\/script>/gi, '<\\/script>') + '\n</script>';
});

/* 把素材脚本插到第一个 <script> 之前 */
if (artScript) {
  const i = html.indexOf('<script>');
  if (i >= 0) html = html.slice(0, i) + artScript + html.slice(i);
  else html = html.replace('</body>', artScript + '</body>');
}

/* ── 4. 加一段"单文件版"标记 + 标题注释 ──────────────────── */
html = html.replace('<head>', '<head>\n<!-- 单文件版：样式、脚本、立绘全部内联，双击即玩 -->');

fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, OUT_NAME);
fs.writeFileSync(outFile, html, 'utf8');
for (const f of fs.readdirSync(distDir)) {
  if (f !== OUT_NAME) fs.rmSync(path.join(distDir, f), { force: true });   /* 清掉旧的其它产物 */
}

/* ── 5. 自检 ─────────────────────────────────────────────── */
const size = fs.statSync(outFile).size;
const leftover = [];
const reSrc = /<(script|link)[^>]*\s(src|href)="([^"]+)"/g;
let m2;
while ((m2 = reSrc.exec(html))) leftover.push(m2[3]);
const checks = [
  ['内联了 ' + inlineCount + ' 个脚本', inlineCount >= 15],
  ['没有残留外部依赖', leftover.length === 0],
  ['立绘已内嵌 base64', /data:image\/png;base64,/.test(html)],
  ['体积合理（< 3MB）', size < 3 * 1024 * 1024]
];
let bad = 0;
console.log('\n单文件打包结果：' + path.relative(root, outFile));
for (const [name, ok] of checks) {
  console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + name);
  if (!ok) bad++;
}
if (leftover.length) console.log('  残留引用：' + leftover.join(', '));
warnings.forEach((w) => console.log('  ! ' + w));
console.log('  体积：' + (size / 1024).toFixed(0) + ' KB');
console.log(bad ? '\n打包有问题\n' : '\n完成。双击这个 html 就能玩，也可以丢到任意静态托管。\n');
process.exit(bad ? 1 : 0);
