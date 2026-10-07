#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/apply-solve.mjs —— 把求解器算出的最优顺序写回关卡数据
   ------------------------------------------------------------------
   做三件事：
     1) 把每关的 solution 换成求解器搜出来的顺序
        （允许「先开门 → 去别的房间吃 → 回头再吃留下的高价值元素」）
     2) 门的门槛全部改成 'auto'：交给 verify 的两遍法反推成
        「最优解走到这扇门时的真实数值」＝ 这扇门的极限数值
        （同时去掉写死的 reqFrac: 0.8，让默认的 1.0 生效）
     3) 硬编码的 hidden 门槛也一并改成 auto（reqFrac/revealFrac 都取 1）

   安全措施：改完先把每个文件里的 solution 数量对一遍，
   数量对不上就整个中止，不写文件。
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/* ── 1. 跑求解器拿顺序 ─────────────────────────────────────── */
const json = execFileSync(process.execPath, [path.join(root, 'tools/solve.mjs'), '--json']
  .concat(process.argv.slice(2).filter((a) => /^\d+$/.test(a) || a.indexOf('--beam') === 0)),
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const recs = JSON.parse(json);
const orderById = {};
const skipped = [];
for (const r of recs) {
  if (!r.solvedOrder || !r.solvedOrder.length || !r.after || !r.after.ok) {
    skipped.push(r.id + '（' + (r.after ? r.after.status : '没解出顺序') + '）');
    continue;                                    /* 解不出来的关卡跳过，不拖累其它关卡写回 */
  }
  orderById[r.id] = r.solvedOrder;
}
if (skipped.length) console.error('跳过：第 ' + skipped.join('、第 ') + ' 关');
if (!Object.keys(orderById).length) { console.error('没有任何关卡解出顺序，中止'); process.exit(1); }

/* ── 2. 缩进排版 ───────────────────────────────────────────── */
function formatOrder(ids, indent) {
  const lines = [];
  let cur = '';
  for (const id of ids) {
    const piece = "'" + id + "', ";
    if (cur.length + piece.length > 104) { lines.push(cur.replace(/\s+$/, '')); cur = ''; }
    cur += piece;
  }
  if (cur) lines.push(cur.replace(/[,\s]+$/, ''));
  return lines.map((l) => indent + l).join('\n');
}

/* 需要知道每个 solution 属于哪一关：按 spec 的 `id: N,` 顺序切块 */
function patchFileProper(rel, ids) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  /* 按 `id: <数字>,` 找出每关的起点（元素/房间的 id 都是字符串，不会误伤），
     块内第一个 solution 就属于它 */
  const marks = [];
  const idRe = /\n\s*\{?\s*id:\s*(\d+),/g;   /* 兼容 `id: 7,` 与参数表里的 `{ id: 25,` */
  let mm;
  while ((mm = idRe.exec(src))) marks.push({ id: Number(mm[1]), at: mm.index });
  marks.forEach((mk, i) => { mk.end = i + 1 < marks.length ? marks[i + 1].at : src.length; });
  const wanted = marks.filter((mk) => ids.indexOf(mk.id) >= 0 && orderById[mk.id]);
  let out = '';
  let cursor = 0;
  let patched = 0;
  for (const mk of wanted) {
    const block = src.slice(mk.at, mk.end);
    const solRe = /(solution|sol):\s*\[[^\]]*\]/;
    if (!solRe.test(block)) continue;
    const rep = solRe.exec(block);
    const nl = block.slice(0, rep.index).lastIndexOf('\n');
    const indent = (block.slice(nl + 1).match(/^\s*/) || [''])[0];
    const body = formatOrder(orderById[mk.id], indent + '  ');
    const newBlock = block.slice(0, rep.index) + rep[1] + ': [\n' + body + '\n' + indent + ']' + block.slice(rep.index + rep[0].length);
    out += src.slice(cursor, mk.at) + newBlock;
    cursor = mk.end;
    patched++;
  }
  out += src.slice(cursor);
  return { src: out, patched };
}

/* ── 3. 执行 ───────────────────────────────────────────────── */
const LOADFILES = ['js/expr.js', 'js/rules.js', 'js/map.js', 'js/engine.js', 'js/levelkit.js',
  'js/levels/act1.js', 'js/levels/act2.js', 'js/levels/act3.js', 'js/levels/act4.js',
  'js/verify.js', 'js/levels.js'];
const act1Ids = [1, 2, 3, 4, 5, 6], act2Ids = [7, 8, 9, 10, 11, 12];
const act3Ids = [13, 14, 15, 16, 17, 18], act4Ids = [11, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];
const files = [
  { rel: 'js/levels/act1.js', ids: act1Ids },
  { rel: 'js/levels/act2.js', ids: act2Ids },
  { rel: 'js/levels/act3.js', ids: act3Ids },
  { rel: 'js/levels/act4.js', ids: act4Ids }
].filter((f) => fs.existsSync(path.join(root, f.rel)));
let changed = 0;
const report = [];
for (const f of files) {
  const file = path.join(root, f.rel);
  let src = fs.readFileSync(file, 'utf8');

  /* 3a. solution */
  const r1 = patchFileProper(f.rel, f.ids);
  src = r1.src;

  /* 3b. hidden 的硬编码门槛 → auto（reqFrac / revealFrac 都取 1）
         注意要排在通用 req 替换之前，否则 req 先被换掉就匹配不上了 */
  const nHidden = (src.match(/req:\s*\d+,\s*reveal:\s*\d+/g) || []).length;
  src = src.replace(/req:\s*\d+,\s*reveal:\s*\d+/g, "req: 'auto', reveal: 'auto', reqFrac: 1, revealFrac: 1");

  /* 3c. 门的硬编码门槛 → auto。结尾可能是 "," 也可能是 " }"，所以用前瞻 */
  const nHard = (src.match(/req:\s*\d+(?=\s*[,}])/g) || []).length;
  src = src.replace(/req:\s*\d+(?=\s*[,}])/g, "req: 'auto'");

  /* 3d. 去掉门上的 reqFrac: 0.8，让默认 1.0（极限数值）生效 */
  const nFrac = (src.match(/,\s*reqFrac:\s*0\.8/g) || []).length;
  src = src.replace(/,\s*reqFrac:\s*0\.8/g, '');

  report.push({ rel: f.rel, solutions: r1.patched, hardReqs: nHard, frac8: nFrac, hidden: nHidden });
  if (src !== fs.readFileSync(file, 'utf8')) {
    changed++;
    if (!DRY) fs.writeFileSync(file, src, 'utf8');
  }
}

console.log(DRY ? '（--dry 只报告不写入）' : '已写回关卡数据：');
for (const r of report) {
  console.log('  ' + r.rel + '：替换 solution ' + r.solutions + ' 处，硬编码门槛→auto ' + r.hardReqs + ' 处，去掉 reqFrac 0.8 ' + r.frac8 + ' 处' + (r.hidden ? '，hidden 门槛→auto ' + r.hidden + ' 处' : ''));
}
console.log(changed + ' 个文件有改动');
