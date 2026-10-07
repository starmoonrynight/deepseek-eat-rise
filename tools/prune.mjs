#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/prune.mjs —— 删掉"多余的元素"
   ------------------------------------------------------------------
   判定标准很硬：一个元素只有同时满足下面两条才算多余 ——
     ① 求解器搜出的最优解**根本不会碰它**；
     ② 把它从关卡里拿掉之后，用同一套最优解复算，**数值一模一样**
        （关卡地图和寻路都会变，所以必须复算，不能只看"没用到"）。
   只删元素数组里的条目，不删门（门定义了房间连通关系，是关卡结构）。
   门如果没被最优解用到，它已经有"物理下限"当门槛，留着当捷径。

   用法：
     node tools/prune.mjs            # 只报告
     node tools/prune.mjs --write    # 真的从 act1/act2 里删掉这些行
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const LOAD = ['js/expr.js', 'js/rules.js', 'js/map.js', 'js/engine.js', 'js/levelkit.js',
  'js/levels/act1.js', 'js/levels/act2.js', 'js/levels/act3.js', 'js/levels/act4.js',
  'js/verify.js', 'js/levels.js'].filter((f) => fs.existsSync(path.join(root, f)));

function freshGame() {
  const sandbox = { console, window: {}, performance: { now: () => Date.now() }, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  return sandbox.window.DSF;
}

const G = freshGame();
const M = G.map, V = G.verify;

/* 复算：给定 spec 与最优解顺序，返回真实到达值 */
function measure(spec, order) {
  const lv = G.levels.buildSpec(spec);
  lv.solution = order.slice();
  V.resolveAutoReqs(lv);
  const t = V.trace(lv);
  const last = t.records[t.records.length - 1];
  return { ok: t.ok, status: t.status, value: t.ok && last ? last.before : null, errors: t.errors };
}

/* 求解器给的"没用到"清单 */
const solver = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools/solve.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const unusedById = {};
solver.forEach((r) => { unusedById[r.id] = { unused: r.unused, order: r.solvedOrder }; });

const specs = G.levels.specs();
const plan = [];      /* [{levelId, remove:[id...]}] */
let totalRemoved = 0, totalKept = 0;

for (const spec of specs) {
  const info = unusedById[spec.id];
  if (!info || !info.unused.length) continue;
  /* 只考虑元素数组里的条目（门在 links 里，结构性的，不动） */
  const elemIds = new Set((spec.elements || []).map((e) => e.id));
  const cands = info.unused.filter((id) => elemIds.has(id));
  const keptDoors = info.unused.filter((id) => !elemIds.has(id));
  const removed = [];

  let cur = JSON.parse(JSON.stringify(spec));
  let base = measure(cur, info.order);
  if (!base.ok) { console.error('第' + spec.id + '关基准复算失败：' + base.status); continue; }

  for (const id of cands) {
    const trial = JSON.parse(JSON.stringify(cur));
    trial.elements = trial.elements.filter((e) => e.id !== id);
    let m;
    try { m = measure(trial, info.order); } catch (e) { m = { ok: false, value: null, errors: [e.message] }; }
    if (m.ok && m.value === base.value) {
      cur = trial;
      base = m;
      removed.push(id);
    } else {
      totalKept++;
      plan.push({ level: spec.id, keep: id, why: !m.ok ? ('删了就过不了：' + m.status) : ('数值会从 ' + base.value + ' 变成 ' + m.value) });
    }
  }
  if (removed.length) { plan.push({ level: spec.id, remove: removed }); totalRemoved += removed.length; }
  if (keptDoors.length) plan.push({ level: spec.id, note: '门不在最优解路线上，但保留（当捷径，门槛用物理下限）：' + keptDoors.join(', ') });
}

for (const p of plan) {
  if (p.remove) console.log('第' + p.level + '关：删除 ' + p.remove.join(', '));
  else if (p.keep) console.log('第' + p.level + '关：保留 ' + p.keep + ' —— ' + p.why);
  else console.log('第' + p.level + '关：' + p.note);
}
console.log('\n共可删除 ' + totalRemoved + ' 个元素，' + totalKept + ' 个虽然没用到但删了会影响数值，保留');

if (!WRITE || !totalRemoved) process.exit(0);

/* ── 写回源码：按关卡块删掉对应那一行 ─────────────────────── */
const byLevel = {};
plan.forEach((p) => { if (p.remove) byLevel[p.level] = p.remove; });
for (const rel of ['js/levels/act1.js', 'js/levels/act2.js']) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  const marks = [];
  const idRe = /\n\s*id:\s*(\d+),/g;
  let m;
  while ((m = idRe.exec(src))) marks.push({ id: Number(m[1]), at: m.index });
  marks.forEach((mk, i) => { mk.end = i + 1 < marks.length ? marks[i + 1].at : src.length; });
  let out = '', cursor = 0, n = 0;
  for (const mk of marks) {
    const block = src.slice(mk.at, mk.end);
    const ids = byLevel[mk.id];
    if (!ids) continue;
    const lines = block.split('\n');
    const kept = lines.filter((ln) => {
      for (const id of ids) {
        if (new RegExp("\\bid:\\s*'" + id + "'").test(ln)) { n++; return false; }
      }
      return true;
    });
    out += src.slice(cursor, mk.at) + kept.join('\n');
    cursor = mk.end;
  }
  out += src.slice(cursor);
  fs.writeFileSync(file, out, 'utf8');
  console.log(rel + '：删掉 ' + n + ' 行');
}
