#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/smoke.mjs —— 端到端冒烟测试（零依赖）
   ------------------------------------------------------------------
   在 Node 里用一套 stub DOM 把整个游戏跑起来，验证：
     · 15 个脚本能加载、能启动
     · 第 1 关按最优解路线真按键 → 通关，数值 == 该关最优值
     · 第 2 关故意撞陷阱门 → 失败，并弹出判定范围面板
     · 「数值 ≤ 0」的失败判定确实触发（用户扣分 / token 改写成负数）
     · 铁盆能免疫一次「数值 ≤ 0」的失败：盆碎、数值不变、元素留在原地、人被弹回
     · 立绘绘制全状态矩阵（尺寸 × 朝向 × 铁盆 × 移动 × 受击 × 死亡 × 眨眼）不报错
     · assets/ 里的立绘是合法 PNG

   用法： node tools/smoke.mjs
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = [
  'js/expr.js', 'js/rules.js', 'js/map.js', 'js/engine.js', 'js/sprites.js', 'js/fx.js',
  'js/render.js', 'js/audio.js', 'js/levelkit.js', 'js/levels/act1.js', 'js/levels/act2.js',
  'js/levels/act3.js', 'js/levels/act4.js', 'js/verify.js',
  'js/levels.js', 'js/ui.js', 'js/input.js', 'js/main.js'
];

/* ══ 结果统计 ══ */
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  \u2713 ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; failures.push(name + (extra ? '  ' + extra : '')); console.log('  \u2717 ' + name + (extra ? '  ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

/* ══ stub canvas ══ */
function ctx2d() {
  const NUM = { globalAlpha: 1, lineWidth: 1, shadowBlur: 0, miterLimit: 10 };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in NUM) return NUM[k];
      if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 7, actualBoundingBoxAscent: 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() { } });
      if (k === 'createPattern') return () => ({});
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'canvas') return { width: 0, height: 0 };
      return () => { };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

/* ══ stub DOM ══ */
const byId = {};
function mkEl(tag, id) {
  const el = {
    id: id || '', tagName: String(tag || 'div').toUpperCase(), _l: {}, _qs: {}, _s: {}, _attr: {},
    style: {}, dataset: {}, children: [], parentNode: null,
    textContent: '', innerHTML: '', disabled: false,
    offsetWidth: 1280, offsetHeight: 58, clientWidth: 1280, clientHeight: 720, width: 0, height: 0,
    addEventListener(t, fn) { (el._l[t] = el._l[t] || []).push(fn); },
    removeEventListener() { },
    appendChild(c) { el.children.push(c); if (c) c.parentNode = el; return c; },
    insertBefore(c) { el.children.unshift(c); if (c) c.parentNode = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); if (c) c.parentNode = null; return c; },
    querySelector(sel) { return el._qs[sel] || (el._qs[sel] = mkEl('div')); },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      if (el.id === 'hud') return { left: 10, top: 8, right: 1270, bottom: 66, width: 1260, height: 58 };
      if (el.id === 'hint-bar') return { left: 400, top: 686, right: 880, bottom: 710, width: 480, height: 24 };
      return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
    },
    setAttribute(k, v) { el._attr[k] = v; }, getAttribute(k) { return el._attr[k] === undefined ? null : el._attr[k]; },
    closest() { return null; }, focus() { }, blur() { }, click() { },
    getContext() { return ctx2d(); },
    _fire(t, ev) { (el._l[t] || []).forEach((fn) => { try { fn(ev); } catch (e) { errors.push('el.' + t + ': ' + e.message); } }); }
  };
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
  el.classList = {
    add(...c) { c.forEach((x) => el._s[x] = 1); },
    remove(...c) { c.forEach((x) => delete el._s[x]); },
    toggle(c, v) { if (v === undefined) v = !el._s[c]; if (v) el._s[c] = 1; else delete el._s[c]; return !!v; },
    contains(c) { return !!el._s[c]; }
  };
  return el;
}

const errors = [];
let now = 0, rafCb = null;
const timers = [];
const setTimeout_ = (fn, ms) => { const id = timers.length + 1; timers.push({ id, fn, at: now + (ms || 0) }); return id; };
const clearTimeout_ = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
function runTimers() {
  for (let g = 0; g < 500; g++) {
    const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
    if (!due.length) break;
    const t = due[0]; timers.splice(timers.indexOf(t), 1);
    try { t.fn(); } catch (e) { errors.push('timer: ' + e.message); }
  }
}

const document = {
  readyState: 'complete', _l: {}, body: mkEl('body'), documentElement: mkEl('html'),
  addEventListener(t, fn) { (document._l[t] = document._l[t] || []).push(fn); },
  createElement(tag) { return mkEl(tag); },
  getElementById(id) { return byId[id] || (byId[id] = mkEl(id === 'stage' ? 'canvas' : 'div', id)); },
  querySelector() { return mkEl('div'); }, querySelectorAll() { return []; }
};
/* ══ 真实立绘尺寸（用于让 stub Image 同步"加载"成功，从而覆盖图片绘制分支）══ */
function pngInfo(p) {
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: b.length };
}
const IMG_SIZE = {};
for (const n of ['fish.png', 'fish_bowl.png', 'claude.png', 'user.png']) {
  const info = pngInfo(path.join(root, 'assets', n));
  if (info) IMG_SIZE['assets/' + n] = info;
}

const Image_ = function () {
  this.onload = null; this.onerror = null;
  this.naturalWidth = 0; this.naturalHeight = 0; this.width = 0; this.height = 0;
  let _src = '';
  Object.defineProperty(this, 'src', {
    get: () => _src,
    set: (v) => {
      _src = String(v);
      /* 真实浏览器会忽略 ?v= 缓存参数，桩也要一样处理 */
      const base = _src.split('?')[0];
      const info = IMG_SIZE[base] || (_src.indexOf('data:image') === 0 ? { w: 32, h: 32 } : null);
      if (!info) { try { if (this.onerror) this.onerror(); } catch (e) { } return; }
      this.naturalWidth = info.w; this.naturalHeight = info.h;
      this.width = info.w; this.height = info.h;
      try { if (this.onload) this.onload(); } catch (e) { }
    }
  });
};
const winL = {};
const window_ = {
  DSF: undefined, document, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  navigator: { maxTouchPoints: 0, userAgent: 'smoke' },
  location: { search: '', hash: '#1', protocol: 'file:' },
  performance: { now: () => now },
  localStorage: {
    _d: {}, getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
  },
  addEventListener(t, fn) { (winL[t] = winL[t] || []).push(fn); },
  removeEventListener() { },
  requestAnimationFrame(fn) { rafCb = fn; return 1; },
  cancelAnimationFrame() { },
  getComputedStyle() { return { getPropertyValue: () => '' }; },
  Image: Image_, setTimeout: setTimeout_, clearTimeout: clearTimeout_,
  setInterval: () => 0, clearInterval() { }
};

/* ══ 沙箱加载 ══ */
/* ══ 加载源：默认按 index.html 的顺序读文件；
       加 --dist <html> 则改测"单文件版"（抽出内联脚本按序执行） ══ */
const argv = process.argv.slice(2);
const distIdx = argv.indexOf('--dist');
const DIST = distIdx >= 0 ? argv[distIdx + 1] : null;
let SOURCES = [];
if (DIST) {
  const distPath = path.isAbsolute(DIST) ? DIST : path.join(root, DIST);
  const html = fs.readFileSync(distPath, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) SOURCES.push({ name: 'inline#' + SOURCES.length, code: m[1].replace(/<\\\/script>/gi, '</script>') });
} else {
  SOURCES = ORDER.map((f) => ({ name: f, code: fs.readFileSync(path.join(root, f), 'utf8') }));
}

section('1. 加载与启动' + (DIST ? '（单文件版：' + DIST + '）' : ''));
if (DIST) {
  check('单文件版：脚本全部内联（' + SOURCES.length + ' 段）', SOURCES.length >= 15);
  check('单文件版：样式已内联', /<style>/.test(fs.readFileSync(path.isAbsolute(DIST) ? DIST : path.join(root, DIST), 'utf8')));
  check('单文件版：立绘以 base64 内嵌', SOURCES[0].code.indexOf('data:image/png;base64,') >= 0);
}
const sandbox = {
  console, window: window_, document, navigator: window_.navigator, location: window_.location,
  performance: window_.performance, Image: Image_, setTimeout: setTimeout_, clearTimeout: clearTimeout_,
  setInterval: () => 0, clearInterval() { }, requestAnimationFrame: window_.requestAnimationFrame,
  globalThis: undefined
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const s of SOURCES) {
  try { vm.runInContext(s.code, sandbox, { filename: s.name }); }
  catch (e) { check('加载 ' + s.name, false, e.message); }
}
const G = sandbox.window.DSF;
check('脚本全部加载（' + SOURCES.length + ' 段）', !!G && !!G.levels && !!G.sprites && !!G.Renderer && !!G.verify && !!G.Engine, '');
if (DIST) check('单文件版：内嵌立绘已装载', !!(G && G.sprites && G.sprites.assetReady('fish')));
if (!G) { process.exit(1); }

function frame(dtMs) { now += dtMs; runTimers(); const f = rafCb; rafCb = null; if (f) { try { f(now); } catch (e) { errors.push('raf: ' + e.message); } } }
function settle(n) { for (let i = 0; i < (n || 14); i++) frame(60); }
function key(t, k) { (winL[t] || []).forEach((fn) => { try { fn({ key: k, preventDefault() { }, metaKey: false, ctrlKey: false, altKey: false }); } catch (e) { errors.push('key: ' + e.message); } }); }
function clickAct(sel) { const b = byId['overlay-card']._qs[sel]; if (b && typeof b.onclick === 'function') { b.onclick(); return true; } return false; }
function tapCell(x, y) {
  const R = G.debugRefs.renderer, sp = R.screenOf(x, y);
  byId['stage']._fire('pointerdown', { clientX: sp.x, clientY: sp.y, pointerId: 1 });
  byId['stage']._fire('pointerup', { clientX: sp.x, clientY: sp.y, pointerId: 1 });
}
function waitCell(x, y, maxF) {
  for (let f = 0; f < (maxF || 90); f++) {
    frame(16);
    const s = G.debugState();
    if (s.px === x && s.py === y && !s.moving) return true;
  }
  return false;
}
function judgeText() {
  const j = byId['canvas-layer'].children.filter((c) => c && String(c.className || '').indexOf('judge') >= 0)[0];
  return j ? String(j.innerHTML).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

settle(14);
check('启动后进入第 1 关', G.debugState().level === 1 && G.debugState().state === 'intro', JSON.stringify({ level: G.debugState().level, state: G.debugState().state }));
check('开场弹出关卡介绍', !byId['overlay']._s.hidden);

/* ── 地图缩放 ─────────────────────────────────────────── */
const zoomT0 = G.debugState().tile;
check('默认每格够大（一屏约 16×9 格）', zoomT0 > 55 && zoomT0 < 76, Math.round(zoomT0) + ' px/格');
key('keydown', '+'); key('keyup', '+');
const zoomT1 = G.debugState().tile;
key('keydown', '-'); key('keyup', '-');
const zoomT2 = G.debugState().tile;
check('按 + 放大 / 按 − 缩小', zoomT1 > zoomT0 + 3 && Math.abs(zoomT2 - zoomT0) < 3,
  Math.round(zoomT0) + ' → ' + Math.round(zoomT1) + ' → ' + Math.round(zoomT2));
check('缩放偏好会记住', /^[0-9.]+$/.test(String(window_.localStorage.getItem('dsf.fish.zoom') || '')),
  String(window_.localStorage.getItem('dsf.fish.zoom')));
check('全图模式仍可用（Z 切过去再切回来）', (() => {
  key('keydown', 'z'); key('keyup', 'z');
  const fit = G.debugState().tile;
  key('keydown', 'z'); key('keyup', 'z');
  return fit < zoomT0 && G.debugState().tile > 55;
})(), '');

clickAct('[data-act="start"]');
settle(4);
check('点开始后进入 playing', G.debugState().state === 'playing');

/* ══ 第 1 关：按最优解真按键通关 ══ */
section('2. 第 1 关走完最优解');
const lv1 = G.levels.get(1);
const tr1 = G.verify.trace(lv1);
const intend1 = tr1.records[tr1.records.length - 1].before;
let moves = 0;
for (let i = 1; i < tr1.path.length; i++) {
  tapCell(tr1.path[i][0], tr1.path[i][1]);
  if (waitCell(tr1.path[i][0], tr1.path[i][1])) moves++;
  if (G.debugState().status !== 'playing') break;
}
settle(30);
check('最优解路线每一步都走通', moves === tr1.path.length - 1, moves + '/' + (tr1.path.length - 1));
check('通关', G.debugState().status === 'won');
check('通关数值 == 该关最优值', G.debugState().value === intend1, G.debugState().value + ' vs ' + intend1);
check('弹出通关面板', byId['overlay-card'].innerHTML.indexOf('通关！') >= 0);
check('通关进度已存档', String(window_.localStorage.getItem('dsf.fish.rice.progress.v1') || '').indexOf('"1":1') >= 0);

/* ══ 第 2 关：故意撞陷阱门 ══ */
section('3. 撞门失败（判定范围弹窗）');
clickAct('[data-act="next"]');
settle(18); clickAct('[data-act="start"]'); settle(4);
const lv2 = G.levels.get(2);
const door = lv2.doors.filter((d) => d.id === 'door_r0_r1')[0] || lv2.doors[0];
const p2 = G.verify.bfsPath(lv2, lv2.start.x, lv2.start.y, door.x, door.y, null);
for (let i = 1; i < p2.length; i++) {
  tapCell(p2[i][0], p2[i][1]);
  waitCell(p2[i][0], p2[i][1]);
  if (G.debugState().status !== 'playing') break;
}
settle(30);
check('撞上数值不足的门 → 失败', G.debugState().status === 'lost');
check('判定范围面板显示"需要 x ≥ 门槛"', /需要 x ≥ \d+/.test(judgeText()), judgeText().slice(0, 60));

/* ══ 回归：数值 ≤ 0 的失败 + 铁盆免疫 ══ */
section('4. 数值 ≤ 0 的失败判定（回归）');
let nid = 70;
function addTestLevel(elements) {
  nid++;
  G.levelSpecs.push({
    id: nid, name: 'T' + nid, size: [12, 10], seed: nid, sizeClass: 'test',
    intro: ['rice'], tips: [], fill: { type: 'none' },
    rooms: [{ id: 'r0', at: [0, 0], wh: [12, 10], shape: 'rect' }], links: [],
    elements, start: { room: 'r0', at: [1, 1] }
  });
  G.levels.refresh();
  return nid;
}
const walk = [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]];
function playCase(id, steps) {
  G.game.goLevel(id); settle(16); clickAct('[data-act="start"]'); settle(4);
  for (const s of steps) {
    tapCell(s[0], s[1]); waitCell(s[0], s[1]);
    if (G.debugState().status !== 'playing') break;
  }
  settle(30);
  return G.debugState();
}
const idUser = addTestLevel([
  { id: 'u1', room: 'r0', at: [6, 6], type: 'user', cond: 'x >= 100', bonus: 5, penalty: 50 },
  { id: 'g1', room: 'r0', at: [10, 8], type: 'goal', req: 1 }
]);
let st = playCase(idUser, walk);
check('用户扣分扣到负数 → 失败', st.status === 'lost', 'value=' + st.value);
check('并弹出失败面板', byId['overlay-card'].innerHTML.indexOf('✖ 失败') >= 0);
check('判定面板显示"数值 ≤ 0"', judgeText().indexOf('数值 ≤ 0') >= 0, judgeText().slice(0, 40));

const idTok = addTestLevel([
  { id: 't1', room: 'r0', at: [6, 6], type: 'token', expr: 'x - 40' },
  { id: 'g1', room: 'r0', at: [10, 8], type: 'goal', req: 1 }
]);
st = playCase(idTok, walk);
check('token 把数值改写成负数 → 失败', st.status === 'lost', 'value=' + st.value);

section('5. 铁盆免疫（回归）');
const idBowl = addTestLevel([
  { id: 'b1', room: 'r0', at: [3, 3], type: 'bowl_rice', value: 4 },
  { id: 'u1', room: 'r0', at: [6, 6], type: 'user', cond: 'x >= 100', bonus: 5, penalty: 50 },
  { id: 'g1', room: 'r0', at: [10, 8], type: 'goal', req: 1 }
]);
const walkBowl = [[2, 1], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [6, 3], [6, 4], [6, 5], [6, 6]];
st = playCase(idBowl, walkBowl);
check('铁盆挡住了"数值 ≤ 0"的失败', st.status === 'playing', 'status=' + st.status);
check('盆碎掉（不再持有）', st.bowl === false);
check('数值不变', st.value === 5, 'value=' + st.value);
check('大肥鱼被弹回上一格', st.px === 6 && st.py === 5, st.px + ',' + st.py);
check('元素还在原地', !!G.debugRefs.engine.elementAt(6, 6));
check('弹出「铁盆碎了」面板', judgeText().indexOf('铁盆') >= 0, judgeText().slice(0, 40));
st = playCase(idBowl, walkBowl.concat([[6, 5], [6, 6]]));
check('盆碎后再撞 → 真的失败', st.status === 'lost', 'value=' + st.value);

/* ══ 立绘矩阵 ══ */
section('6. 立绘绘制矩阵');
const S = G.sprites, c = ctx2d();
let calls = 0, artErr = 0;
const sizes = [0, 4, 6, 8, 11, 12, 14, 20, 22, 30, 46, 64, 96];
for (const f of ['down', 'up', 'left', 'right'])
  for (const bowl of [false, true])
    for (const mv of [false, true])
      for (const hurt of [0, 0.6, 1])
        for (const dead of [false, true])
          for (const sz of sizes) {
            try { S.fish(c, 100, 100, sz, { t: 1.7, value: 1234, facing: f, bowl, moving: mv, hurt, dead, blink: false }); calls++; }
            catch (e) { artErr++; }
          }
try { S.fish(c, 10, 10, 40); calls++; } catch (e) { artErr++; }
try { S.fish(c, NaN, NaN, 40, { t: 1 }); calls++; } catch (e) { artErr++; }
try { S.icon({ type: 'fish' }, 48); calls++; } catch (e) { artErr++; }
for (const ty of ['rice', 'bowl_rice', 'token', 'claude', 'user', 'door', 'goal', 'hidden']) {
  const el = { type: ty, id: 'x', x: 0, y: 0, value: 7, factor: 2, expr: 'x+1', cond: 'x>=1', bonus: 3, penalty: 3, op: 'sub', amount: 5, req: 20, reveal: 10, tier: 1 };
  for (const sz of sizes) {
    try { S.element(c, el, 0, 0, sz, { t: 1.3, revealed: true, value: 10, tier: 1, req: 20 }); calls++; }
    catch (e) { artErr++; }
  }
}
check('立绘 / 元素全状态矩阵无异常', artErr === 0, calls + ' 次绘制，' + artErr + ' 次异常');
check('大肥鱼形象包围盒合理', (() => {
  const bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  const NUM = { globalAlpha: 1, lineWidth: 1, shadowBlur: 0 };
  const P = (...a) => { for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1]; if (typeof x === 'number' && isFinite(x)) { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y); } } };
  const cc = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in NUM) return NUM[k];
      if (k === 'moveTo' || k === 'lineTo') return P;
      if (k === 'quadraticCurveTo') return (a, b, c2, d) => P(a, b, c2, d);
      if (k === 'bezierCurveTo') return (a, b, c2, d, e, f) => P(a, b, c2, d, e, f);
      if (k === 'arc' || k === 'ellipse') return (x, y, r) => P(x - r, y - r, x + r, y + r);
      if (k === 'rect' || k === 'fillRect') return (x, y, w, h) => P(x, y, x + w, y + h);
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
      return () => { };
    }, set(t, k, v) { t[k] = v; return true; }
  });
  try { S.fish(cc, 0, 0, 46, { t: 1, facing: 'down', bowl: true }); } catch (e) { return false; }
  return bb.x0 > -0.9 && bb.x1 < 0.9 && bb.y0 > -0.9 && bb.y1 < 0.7;
})());

/* ══ 立绘素材：确认真的被画出来（曾经因为少乘一次 px 缩放到 1 像素高 = 看不见）══ */
section('7. 立绘素材真的会被画出来');
const rec = [];
function recordCtx() {
  const NUM = { globalAlpha: 1, lineWidth: 1, shadowBlur: 0, miterLimit: 10 };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in NUM) return NUM[k];
      if (k === 'drawImage') return (...a) => { rec.push(a); };
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
      return () => { };
    }, set(t, k, v) { t[k] = v; return true; }
  });
}
const rc = recordCtx();
check('启动时自动装载了 assets/fish.png', !!G.sprites.assetReady('fish'));
rec.length = 0;
G.sprites.fish(rc, 100, 100, 46, { t: 1, facing: 'down', bowl: false });
check('常态立绘走的是图片分支', rec.length >= 1, rec.length + ' 次 drawImage');
if (rec.length) {
  const a = rec[rec.length - 1];
  const dw = a[7], dh = a[8], dx = a[5], dy = a[6];
  check('立绘尺寸约等于一格（没被缩成看不见的大小）',
    dh > 30 && dh < 62 && dw > 16 && dw < 72,
    '目标 ' + Math.round(dw) + '×' + Math.round(dh) + 'px（格子 46px）');
  check('立绘底边压在格子下沿（脚踩在地上）',
    Math.abs((dy + dh) - 46 * 0.47) < 1.5, 'bottom=' + (dy + dh).toFixed(1));
  check('立绘水平居中', Math.abs(dx + dw / 2) < 1.5, 'cx=' + (dx + dw / 2).toFixed(1));
}
rec.length = 0;
G.sprites.fish(rc, 100, 100, 46, { t: 1, facing: 'down', bowl: true });
check('铁盆形态走的是 fish_bowl 图片分支', rec.length >= 1 && !!G.sprites.assetReady('fish_bowl'));
G.sprites.fish(rc, 100, 100, 46, { t: 1, facing: 'left', bowl: false });
check('朝左时也能正常绘制', rec.length >= 2);

rec.length = 0;
G.sprites.installArt('fish', '');
check('卸载后回到程序化画法（不画图片）', rec.length === 0 && !G.sprites.assetReady('fish'));
G.sprites.fish(rc, 100, 100, 46, { t: 1 });
check('程序化画法没有报错', true);
G.sprites.installArt('fish', 'assets/fish.png');
check('重新装载立绘', !!G.sprites.assetReady('fish'));

section('8. 动画（真的会动）');
/* 用记录型 ctx 抓 fish() 实际下发的变换指令 */
function probeFish(o, px) {
  const tr = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, alpha: 1 };
  const NUM = { globalAlpha: 1, lineWidth: 1, shadowBlur: 0, miterLimit: 10 };
  const c = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in NUM) return NUM[k];
      if (k === 'translate') return (x, y) => { tr.tx += x || 0; tr.ty += y || 0; };
      if (k === 'scale') return (x, y) => { tr.sx *= x; tr.sy *= (y === undefined ? x : y); tr.tx *= x; tr.ty *= (y === undefined ? x : y); };
      if (k === 'rotate') return (a) => { tr.rot += a; };
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
      return () => { };
    }, set(t, k, v) { t[k] = v; if (k === 'globalAlpha') tr.alpha = v; return true; }
  });
  G.sprites.fish(c, 0, 0, px || 46, o);   /* 定位放在 (0,0)，免得定位位移被缩放放大干扰测量 */
  return tr;
}
const T = 1.0, PX = 46;
const idle = probeFish({ t: T, facing: 'down' }, PX);
const mid = probeFish({ t: T, facing: 'down', moving: true, stepT: 0.5 }, PX);
const takeoff = probeFish({ t: T, facing: 'down', moving: true, stepT: 0.02 }, PX);
check('走路的中间点比原地高（跳起来了）', mid.ty < idle.ty - 2, 'dy=' + (mid.ty - idle.ty).toFixed(1) + 'px');
check('起跳/落地时被压扁、顶点被拉长', Math.abs(mid.sy - takeoff.sy) > 0.03,
  'sy ' + takeoff.sy.toFixed(3) + ' → ' + mid.sy.toFixed(3));
check('待机时会上下浮动（不同时刻位置不同）',
  Math.abs(probeFish({ t: 0.4, facing: 'down' }, PX).ty - probeFish({ t: 1.6, facing: 'down' }, PX).ty) > 0.3);
/* 注意取样点：stepT=0.5 正好是摆动过零的顶点，摇摆要看 0.25 */
const swingA = probeFish({ t: T, facing: 'down', moving: true, stepT: 0.25 }, PX);
const swingB = probeFish({ t: T, facing: 'down', moving: true, stepT: 0.75 }, PX);
check('走路会左右摇（一来一回方向相反）', swingA.rot > 0.02 && swingB.rot < -0.02,
  'rot ' + swingA.rot.toFixed(3) + ' / ' + swingB.rot.toFixed(3));

const hurt0 = probeFish({ t: T, facing: 'down', hurt: 0 }, PX);
const hurt1 = probeFish({ t: T, facing: 'down', hurt: 1 }, PX);
check('受击会抖动', Math.abs(hurt1.tx - hurt0.tx) > 1, 'dx=' + (hurt1.tx - hurt0.tx).toFixed(1) + 'px');

const born = probeFish({ t: T, facing: 'down', spawn: 0.15 }, PX);
const stood = probeFish({ t: T, facing: 'down', spawn: 1 }, PX);
check('出生时从小弹到大', born.sx < stood.sx * 0.75, 'scale ' + born.sx.toFixed(2) + ' → ' + stood.sx.toFixed(2));
check('出生时是淡入的', born.alpha < 0.9 && stood.alpha > 0.95, 'alpha ' + born.alpha.toFixed(2) + ' → ' + stood.alpha.toFixed(2));

let winRot = 0;
for (const w of [0, 0.25, 0.5, 0.75, 1]) winRot = Math.max(winRot, Math.abs(probeFish({ t: T, facing: 'down', winT: w }, PX).rot));
check('通关会转圈（旋转累计 > 2π）', winRot > 6.28, 'rot max=' + winRot.toFixed(2));
check('通关会跳起来', probeFish({ t: T, facing: 'down', winT: 0.5 }, PX).ty < probeFish({ t: T, facing: 'down', winT: 0 }, PX).ty - 5);

const deadA = probeFish({ t: T, facing: 'down', deadT: 1 }, PX);
check('失败会翻倒', Math.abs(deadA.rot - idle.rot) > 1.0, 'rot=' + deadA.rot.toFixed(2));

const bowlA = probeFish({ t: 0.3, facing: 'down', bowl: true }, PX);
const bowlB = probeFish({ t: 1.4, facing: 'down', bowl: true }, PX);
check('头顶铁盆会晃', Math.abs(bowlA.rot - bowlB.rot) > 0.01);
check('朝右才水平镜像（让鲸鱼尾拖在身后）', (() => {
  let mirrored = false;
  const NUM = { globalAlpha: 1, lineWidth: 1 };
  const c = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in NUM) return NUM[k];
      if (k === 'scale') return (x) => { if (x < 0) mirrored = true; };
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() { } });
      return () => { };
    }, set(t, k, v) { t[k] = v; return true; }
  });
  const mirL = (() => { mirrored = false; G.sprites.fish(c, 100, 100, PX, { t: T, facing: 'left' }); return mirrored; })();
  const mirR = (() => { mirrored = false; G.sprites.fish(c, 100, 100, PX, { t: T, facing: 'right' }); return mirrored; })();
  return mirR === true && mirL === false;
})());

section('9. 不剧透：不显示运算结果 / 不显示门的判定');
const srcOf = (p) => fs.readFileSync(path.join(root, p), 'utf8');
check('HUD 里没有撤销按钮', srcOf('index.html').indexOf('btn-undo') < 0);
check('UI / 输入 / 主循环里都没有撤销入口',
  !/\bundo\b/i.test(srcOf('js/ui.js')) && !/\bundo\b/i.test(srcOf('js/input.js')) && !/\bundo\b/i.test(srcOf('js/main.js')));
check('失败面板里没有撤销按钮', srcOf('js/ui.js').indexOf('撤销一步') < 0);
check('底部提示条不再宣传撤销键', srcOf('js/main.js').indexOf('U 撤销') < 0 && srcOf('js/input.js').indexOf('U 撤销') < 0);
check('门的标签不再按"能不能过"变色', srcOf('js/render.js').indexOf('eng.value >= d.req') < 0);
check('气泡里不再出现判定/结果符号', !/✅|⛔/.test(srcOf('js/render.js')));

/* 运行时：把大肥鱼挪到元素旁边，检查气泡只写规则、不写算好的数 */
const idTip = addTestLevel([
  { id: 'tk', room: 'r0', at: [2, 1], type: 'token', expr: 'x * 7 + 3' },
  { id: 'cl', room: 'r0', at: [1, 2], type: 'claude', factor: 5 },
  { id: 'g1', room: 'r0', at: [10, 8], type: 'goal', req: 1 }
]);
G.game.goLevel(idTip); settle(16); clickAct('[data-act="start"]'); settle(3);
const tipText = G.debugRefs.renderer.focusBubbles().map((b) => b.text).join(' | ');
check('token 气泡只写表达式', tipText.indexOf('x * 7 + 3') >= 0, tipText.slice(0, 70));
check('气泡里没有算好的结果', tipText.indexOf('→') < 0 && tipText.indexOf('现在') < 0, tipText.slice(0, 70));

/* 运行时：站到真门旁边，检查门的气泡不透露能否通过 */
G.game.goLevel(1); settle(16); clickAct('[data-act="start"]'); settle(3);
const eng1 = G.debugRefs.engine;
const door1 = G.levels.get(1).doors[0];
eng1.px = door1.x - 1; eng1.py = door1.y;
settle(3);
const doorText = G.debugRefs.renderer.focusBubbles().map((b) => b.text).join(' | ');
check('门气泡写明门槛与运算', /≥\d+/.test(doorText), doorText.slice(0, 70));
check('门气泡不透露能否通过', doorText.indexOf('✅') < 0 && doorText.indexOf('⛔') < 0 &&
  doorText.indexOf('差 ') < 0 && doorText.indexOf('→') < 0, doorText.slice(0, 70));

/* 撤销键真的没反应（先走到数值发生变化，再按 U 看会不会回退） */
G.game.goLevel(1); settle(16); clickAct('[data-act="start"]'); settle(3);
const v0 = G.debugState().value;
let walked = 0;
while (walked < 24 && G.debugState().value === v0) {
  const t = tr1.path[++walked];
  if (!t) break;
  tapCell(t[0], t[1]);
  waitCell(t[0], t[1]);
}
const v1 = G.debugState().value;
key('keydown', 'u'); key('keyup', 'u');
settle(4);
check('按 U 不再撤销（数值不回退）', v1 !== v0 && G.debugState().value === v1,
  v0 + ' → ' + v1 + ' → ' + G.debugState().value + '（走了 ' + walked + ' 步）');

section('10. 素材文件');
for (const [name, key] of [['fish.png', 'fish'], ['fish_bowl.png', 'fish_bowl']]) {
  const info = pngInfo(path.join(root, 'assets', name));
  check('assets/' + name + ' 是合法 PNG', !!info, info ? info.w + '×' + info.h + '  ' + (info.size / 1024).toFixed(0) + 'KB' : '缺失');
}
check('sprites 暴露 installArt（拖拽/素材替换用）', typeof G.sprites.installArt === 'function');
check('ui 暴露形象面板 / 读取本地形象', typeof G.ui.showArt === 'function' && typeof G.ui.loadSavedArt === 'function');

/* ══ 收尾 ══ */
section('11. 运行期异常');
check('整个流程没有抛异常', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('\n──────────────────────────────');
console.log(pass + ' 项通过，' + fail + ' 项失败');
if (fail) { console.log('\n失败项：'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
