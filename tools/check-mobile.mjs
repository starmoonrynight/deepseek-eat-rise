#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/check-mobile.mjs —— 移动端体检
   ------------------------------------------------------------------
   手机上踩过的坑，逐条做成静态断言（不需要真的拿手机跑）：

     1. 拖拽换立绘的提示框不能卡住 —— 手机长按会发 dragenter，
        而 dragleave 常常不发，提示框会永久停在屏幕中央挡住大肥鱼
     2. 视口 meta 必须禁掉双指缩放与下拉刷新（否则滑动走格会误触）
     3. 虚拟方向键必须存在，且只在触摸设备上显示
     4. 长按查看元素之后抬手不能顺带走一格
     5. 点击不能误触发原生拖拽（图片/文字被拖走会打断游戏）
     6. 关键 UI 不能被 HUD 覆盖（小地图、提示条、方向键）

   用法： node tools/check-mobile.mjs
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const ui = read('js/ui.js');
const css = read('css/style.css');
const input = read('js/input.js');

let bad = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '　' + detail : ''));
  if (!ok) bad++;
}

console.log('移动端体检\n');

console.log('1. 拖拽提示框不会卡住');
check('只认「拖文件」（检查 dataTransfer.types 里的 Files）', /isFileDrag/.test(ui));
check('有看门狗定时器自动收起', /hideTimer\s*=\s*setTimeout/.test(ui));
check('触摸/点击会收起提示', /touchstart[\s\S]{0,80}show\(false\)/.test(ui) && /pointerdown[\s\S]{0,60}show\(false\)/.test(ui));

console.log('\n2. 视口设置');
check('禁掉双指缩放', /user-scalable=no/.test(html));
check('适配刘海屏', /viewport-fit=cover/.test(html));

console.log('\n3. 虚拟方向键');
check('D-pad 存在四个方向', (html.match(/data-dir="/g) || []).length === 4);
check('只在触摸设备显示', /setPadVisible/.test(read('js/main.js')) && /ontouchstart|maxTouchPoints/.test(read('js/main.js')));
check('.pad 有定位样式', /\.pad\s*\{/.test(css));

console.log('\n4. 长按不会顺带走一格');
check('长按已弹出面板时抬手不再走格', /wasHold/.test(input));
check('移动会取消长按计时器', /cancelHold\(\)/.test(input));

console.log('\n5. 禁止原生拖拽打断游戏');
check('canvas 关闭原生拖拽（CSS）', /user-drag|-webkit-user-drag|user-select/.test(css));
check('canvas 上阻止 contextmenu', /contextmenu/.test(input));

console.log('\n6. 关键 UI 层级');
check('提示条 .hint-bar 有定位', /\.hint-bar\s*\{/.test(css));
check('小地图画在画布内（不占 DOM，不会与 HUD 抢位）', /drawMini/.test(read('js/render.js')));

console.log('\n' + (bad ? bad + ' 项有问题 ❌' : '移动端体检全部通过 ✅'));
process.exit(bad ? 1 : 0);
