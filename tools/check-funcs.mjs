#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/check-funcs.mjs —— 逐关核对"算法有没有提前出现"
   ------------------------------------------------------------------
   规则（策划要求）：某个算法只要还没在任何一关的介绍里出现过，
   就不能出现在后面的新关卡里。
   判定依据是 js/levels.js 的 FUNC_SCHEDULE 解锁表：
   每个函数规定"最早能在第几关出现"。

   本工具做的事：
     · 把关卡里每个元素表达式用到的函数全部扫出来（走 AST，不靠正则）
     · 对照解锁表，检查有没有"提前出现"的
     · 顺带打印每个算法的首次出现关卡，方便核对介绍面板
   用法： node tools/check-funcs.mjs
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAD = ['js/expr.js', 'js/rules.js', 'js/map.js', 'js/engine.js', 'js/levelkit.js',
  'js/levels/act1.js', 'js/levels/act2.js', 'js/levels/act3.js', 'js/levels/act4.js',
  'js/verify.js', 'js/levels.js'].filter((f) => fs.existsSync(path.join(root, f)));

const sandbox = { console, window: {}, setTimeout, clearTimeout, performance: { now: () => Date.now() } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
const G = sandbox.window.DSF;
const SCHED = G.levels.funcSchedule;

let bad = 0;
const firstSeen = {};
const rows = [];

for (const spec of G.levels.specs()) {
  const lv = G.levels.buildSpec(spec);
  const used = {};
  const offenders = [];
  lv.elements.forEach((el) => {
    const srcs = [];
    if (el.expr) srcs.push([el.type === 'door' ? '门' : 'token', el.expr]);
    if (el.cond) srcs.push(['用户条件', el.cond]);
    srcs.forEach((pair) => {
      const u = G.expr.funcsUsed(pair[1]);
      if (!u) return;
      Object.keys(u).forEach((f) => {
        used[f] = true;
        if (!firstSeen[f] || firstSeen[f] > lv.id) firstSeen[f] = lv.id;
        const at = SCHED[f];
        if (at === undefined) offenders.push(el.id + ' 用了未登记的 ' + f + '()');
        else if (at > lv.id) offenders.push(el.id + '（' + pair[0] + '）用了 ' + f + '()，它到第 ' + at + ' 关才解锁');
      });
    });
  });
  const list = Object.keys(used).sort();
  const maxAt = list.reduce((m, f) => Math.max(m, SCHED[f] || 0), 0);
  rows.push({ id: lv.id, name: lv.name, funcs: list, maxAt, offenders });
  if (offenders.length) bad++;
}

console.log('逐关核对：本关用到的算法，是否都在本关或更早的关卡介绍过\n');
for (const r of rows) {
  const ok = r.offenders.length === 0;
  console.log((ok ? '✅' : '❌') + ' 第' + String(r.id).padStart(2) + '关 ' + r.name.padEnd(6) +
    ' 用到 ' + String(r.funcs.length).padStart(2) + ' 个算法' +
    '（最晚解锁于第 ' + r.maxAt + ' 关）');
  if (!ok) r.offenders.slice(0, 6).forEach((o) => console.log('      ✗ ' + o));
}

console.log('\n各算法的首次出现关卡（供核对开场介绍面板）：');
const byLevel = {};
Object.keys(SCHED).forEach((f) => {
  const lid = firstSeen[f];
  if (lid === undefined) return;                 /* 还没在任何关卡里用过 */
  (byLevel[lid] = byLevel[lid] || []).push(f);
});
Object.keys(byLevel).map(Number).sort((a, b) => a - b).forEach((lid) => {
  console.log('  第' + String(lid).padStart(2) + '关：' + byLevel[lid].join(' / '));
});
const never = Object.keys(SCHED).filter((f) => firstSeen[f] === undefined);
if (never.length) {
  console.log('  ⚠ 已登记但从未在任何关卡出现（介绍面板不会提它们，放心）：' + never.join(' / '));
}
/* 反向核对：解锁表说"第 N 关解锁"，但第 N 关其实没用到 —— 那这关的介绍面板就是空的 */
const ghost = [];
Object.keys(SCHED).forEach((f) => {
  if (firstSeen[f] !== undefined && firstSeen[f] > SCHED[f]) ghost.push(f + '(表定第' + SCHED[f] + '关，实际第' + firstSeen[f] + '关才用上)');
});
console.log('  ' + (ghost.length ? '⚠ ' + ghost.join(' / ') : '解锁表与实际使用完全一致：每个算法都在表定那一关就真的用上了 ✓'));

console.log('\n' + (bad ? bad + ' 关有算法提前出现 ❌' : '全部 ' + rows.length + ' 关：没有算法提前出现 ✅'));
process.exit(bad ? 1 : 0);
