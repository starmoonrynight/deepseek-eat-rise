#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/solve.mjs —— 关卡求解器：搜索"最优吃元素顺序"
   ------------------------------------------------------------------
   为什么要它：
     过「削减型」门（减法 / 除法 / clamp / 余数）时，带过去的数值越多亏得越多；
     而「倍乘」应该留给后面的大额白饭。所以最优解往往不是"一个房间吃完再走"，
     而是「先凑够最低门槛把门开了 → 去别的房间吃 → 回头再吃留下的高价值元素」。

   它怎么搜：
     状态 = (已吃元素集合 mask, 当前数值 value, 是否有铁盆)。
     可达性由 mask 唯一决定：房间靠"门被吃掉"解锁，所以 mask 相同 →
     可吃的元素集合也相同，于是可以用「同一 mask 只留最优值」来去重。
     每个状态尝试吃掉所有当前可吃的元素，用**游戏自己的 rules.apply** 结算，
     数值 ≤ 0 的分支直接丢掉。用 beam search 控制规模。

   用法：
     node tools/solve.mjs              # 求解全部 12 关，打印最优顺序与各门极限值
     node tools/solve.mjs 12 --json    # 只解第 12 关，输出 JSON（便于写回关卡数据）
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAD = ['js/expr.js', 'js/rules.js', 'js/map.js', 'js/engine.js', 'js/levelkit.js',
  'js/levels/act1.js', 'js/levels/act2.js', 'js/levels/act3.js', 'js/levels/act4.js',
  'js/verify.js', 'js/levels.js'].filter((f) => fs.existsSync(path.join(root, f)));

const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const BEAM = Number((argv.find((a) => a.startsWith('--beam=')) || '').split('=')[1]) || 1200;

/* ── 载入游戏代码（和浏览器同一套 rules） ─────────────────── */
const sandbox = { console, window: {}, performance: { now: () => Date.now() }, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
const G = sandbox.window.DSF;
const R = G.rules, M = G.map;

/* ── 一扇门的"物理下限"：能让这扇门成立的最小数值 ─────────────
   门有两条硬规则：① 运算后数值一定减少；② 过门不能直接把自己算死（结果 > 0）。
   规则实现放在 js/rules.js（doorFloor），游戏和工具共用同一份。
   ─────────────────────────────────────────────────────────── */
const doorFloor = (el, hi) => R.doorFloor(el, hi);

/* ── 求解一关 ─────────────────────────────────────────────── */
function solve(spec, opts) {
  opts = opts || {};
  const lv = G.levels.buildSpec(spec);      /* 和游戏同一条构建路径：含"补足房间特殊元素"工序 */
  /* 搜索阶段：每扇门用它的物理下限当门槛（保证"减少"与"不致死"两条规则成立），
     终点门槛置 0。解完之后再按真实到达值反推门槛。 */
  const HI = 40000;
  lv.elements.forEach((e) => {
    if (e.req === undefined) return;
    e.req0 = e.req;
    e.req = e.isDoor ? doorFloor(e, HI) : 0;
    if (e.type === 'hidden') e.reveal = 0;
  });
  const els = lv.elements.filter((e) => !e.filler);
  const idxOf = {};
  els.forEach((e, i) => { idxOf[e.id] = i; });
  const bit = (i) => 1n << BigInt(i);
  const W = lv.w, H = lv.h, FLOOR = M.FLOOR;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? null : lv.cellMap[y * W + x] || null;

  /* ── 真实可达性：逐格 BFS，未消耗的非填充元素就是障碍 ──────────
     （不能用"房间解锁"来近似：门没开的时候它就是挡路的，
       求解器必须和游戏里的寻路用同一套规则，给出的顺序才走得通）
     ─────────────────────────────────────────────────────────── */
  const seenBuf = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let stamp = 0;
  const stampBuf = new Int32Array(W * H);
  function reachable(mask, sx, sy) {
    stamp++;
    let head = 0, tail = 0;
    const s = sy * W + sx;
    stampBuf[s] = stamp;
    queue[tail++] = s;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % W, cy = (cur - cx) / W;
      const nb = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
      for (let i = 0; i < 8; i += 2) {
        const nx = nb[i], ny = nb[i + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (stampBuf[k] === stamp) continue;
        if (lv.tiles[k] !== FLOOR) continue;
        const e = lv.cellMap[k];
        if (e && !e.filler && !(mask & bit(idxOf[e.id]))) continue;   /* 未吃掉的特殊元素挡路 */
        stampBuf[k] = stamp;
        queue[tail++] = k;
      }
    }
    return stampBuf;
  }
  /* 当前能吃到哪些元素。
     注意：BFS 会把"未吃掉的特殊元素"自己那一格当成障碍（因为不能穿过去），
     但玩家是可以从旁边一格**走进去**的，所以判定要放宽成
     「它自己那格可达，或它的四邻有一格可达」。 */
  function available(mask, px, py) {
    const buf = reachable(mask, px, py);
    const out = [];
    for (const e of els) {
      if (mask & bit(idxOf[e.id])) continue;
      const k = e.y * W + e.x;
      let ok = buf[k] === stamp;
      if (!ok) {
        ok = (e.x > 0 && buf[k - 1] === stamp) ||
             (e.x < W - 1 && buf[k + 1] === stamp) ||
             (e.y > 0 && buf[k - W] === stamp) ||
             (e.y < H - 1 && buf[k + W] === stamp);
      }
      if (ok) out.push(e);
    }
    return out;
  }

  let beam = [{ mask: 0n, value: 1, bowl: false, px: lv.start.x, py: lv.start.y, order: [], doors: [] }];
  let best = null;
  if (process.env.SOLVE_DEBUG) {
    const buf = reachable(0n, lv.start.x, lv.start.y);
    let cells = 0;
    for (let i = 0; i < W * H; i++) if (buf[i] === stamp) cells++;
    console.error('[debug] 起点=' + lv.start.x + ',' + lv.start.y + ' 可达格数=' + cells +
      ' 非填充元素数=' + els.length + ' 地板数=' + lv.tiles.filter((t) => t === FLOOR).length);
    console.error('[debug] 前几个元素：' + els.slice(0, 6).map((e) => e.id + '@' + e.x + ',' + e.y + ' tile=' + lv.tiles[e.y * W + e.x]).join(' | '));
    console.error('[debug] available=' + available(0n, lv.start.x, lv.start.y).length);
  }

  for (let step = 0; step < els.length + 1; step++) {
    const next = [];
    const seenNext = new Map();
    for (const st of beam) {
      const list = available(st.mask, st.px, st.py);
      if (!list.length) continue;
      for (const el of list) {
        const res = R.apply({ value: st.value, bowl: st.bowl }, el);
        if (res.fatal) continue;                       /* 过不去（门槛已置成物理下限，这里只可能是运算致死） */
        const nv = res.value;
        if (!(nv > 0)) continue;                       /* 数值 ≤ 0 → 这条路走死 */
        const nmask = st.mask | bit(idxOf[el.id]);
        const nOrder = st.order.concat([el.id]);
        const nDoors = st.doors.slice();
        if (el.isDoor) nDoors.push({ id: el.id, before: st.value, after: nv });
        const nBowl = !!(res.bowl || st.bowl);
        const nst = { mask: nmask, value: nv, bowl: nBowl, px: el.x, py: el.y, order: nOrder, doors: nDoors };
        if (el.type === 'goal' || el.type === 'hidden') {
          const cand = { value: nv, order: nOrder, doors: nDoors, bowl: nBowl, eaten: nOrder.length };
          if (!best || cand.value > best.value || (cand.value === best.value && cand.order.length < best.order.length)) best = cand;
          continue;                                    /* 到终点就结束，不再往后吃 */
        }
        /* 去重：同一「已吃集合 + 当前所在格」只留数值最大的那条 */
        const key = nmask.toString(36) + '@' + (el.y * W + el.x);
        const prev = seenNext.get(key);
        if (prev === undefined || nv > prev) {
          seenNext.set(key, nv);
          next.push(nst);
        }
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.value - a.value || b.order.length - a.order.length);
    beam = next.slice(0, BEAM);
  }

  /* 哪些元素没被用到 */
  const used = {};
  if (best) best.order.forEach((id) => { used[id] = true; });
  const unused = els.filter((e) => !used[e.id] && e.type !== 'goal' && e.type !== 'hidden').map((e) => e.id);

  return { level: lv, best, unused, doorCount: lv.doors.length, floors: lv.doors.map((d) => ({ id: d.id, op: d.op, floor: d.req })) };
}

/* ── 用真实引擎复算一条顺序（含沿途吃掉的地面白饭） ──────────
   求解器只考虑特殊元素，真实游玩会顺路吃掉大量 +1 白饭，
   所以最终数值必须用 verify 的寻路 + 模拟来算，不能拿求解器的值直接比。
   ─────────────────────────────────────────────────────────── */
function measureReal(spec, order, autoDoors) {
  const lv = M.buildLevel(spec);
  lv.solution = order.slice();
  if (autoDoors) {
    /* 模拟"门门槛交给构建器反推"之后的状态：全部改成 auto + reqFrac 1 */
    lv.elements.forEach((e) => { if (e.isDoor) { e.req = 'auto'; e.reqFrac = 1; } });
  }
  G.verify.resolveAutoReqs(lv);          /* 两遍法：先置 0 跑出到达值，再写回门槛并复核 */
  const t = G.verify.trace(lv);
  const last = t.records[t.records.length - 1];
  return {
    ok: t.ok, status: t.status, value: t.value,
    intended: t.ok && last ? last.before : null,
    errors: t.errors, warnings: t.warnings,
    records: t.records.map((r) => r.id + '(' + r.before + '→' + r.after + ')'),
    doorReqs: lv.doors.map((d) => d.id + '=' + d.req),
    level: lv
  };
}

/* ── 跑一遍 ───────────────────────────────────────────────── */
const specs = G.levels.specs().filter((s) => !only.length || only.indexOf(s.id) >= 0);
const out = [];
for (const spec of specs) {
  const t0 = Date.now();
  const r = solve(spec, {});
  const ms = Date.now() - t0;
  const cur = measureReal(spec, spec.solution || [], false);
  const curAuto = measureReal(spec, spec.solution || [], true);
  const sol = r.best ? measureReal(spec, r.best.order, true) : null;
  const rec = {
    id: spec.id, name: spec.name, ms,
    solvedValue: r.best ? r.best.value : null,
    solvedOrder: r.best ? r.best.order : [],
    current: { intended: cur.intended, ok: cur.ok, status: cur.status },
    currentAuto: { intended: curAuto.intended, ok: curAuto.ok, status: curAuto.status },
    after: sol ? { intended: sol.intended, ok: sol.ok, status: sol.status, errors: sol.errors, warnings: sol.warnings, doorReqs: sol.doorReqs } : null,
    unused: r.unused,
    floors: r.floors
  };
  out.push(rec);
  if (!wantJson) {
    console.log('第' + rec.id + '关 ' + rec.name + '　（求解 ' + ms + 'ms）');
    console.log('  现有解 / 现有门槛：真实最优值 = ' + rec.current.intended + (cur.ok ? '' : '  ✗ ' + rec.current.status));
    console.log('  现有解 / 门槛全 auto：真实最优值 = ' + rec.currentAuto.intended + (curAuto.ok ? '' : '  ✗ ' + rec.currentAuto.status));
    console.log('  求解器顺序：' + rec.solvedOrder.join(' → '));
    if (sol) {
      const a = rec.after.intended;
      const b = rec.currentAuto.intended;
      console.log('  求解器解 / 门槛全 auto：真实最优值 = ' + a + '（' + rec.after.status + '）' +
        (a > b ? '　↑ 更好 ' + (a - b) : a < b ? '　↓ 更差 ' + (b - a) : '　= 持平'));
      if (rec.after.errors.length) console.log('  ✗ ' + rec.after.errors.join('；'));
      if (rec.after.warnings.length) console.log('  ! ' + rec.after.warnings.slice(0, 3).join('；'));
      console.log('  反推出的门槛：' + rec.after.doorReqs.join('　'));
    }
    if (rec.unused.length) console.log('  求解器没用到：' + rec.unused.join(', '));
    console.log('');
  }
}
if (wantJson) console.log(JSON.stringify(out, null, 1));
