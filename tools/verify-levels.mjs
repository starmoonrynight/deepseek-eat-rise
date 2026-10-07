#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   tools/verify-levels.mjs —— 命令行关卡校验
   ------------------------------------------------------------------
   用法：  node tools/verify-levels.mjs            # 校验全部关卡
           node tools/verify-levels.mjs 12         # 只看第 12 关
           node tools/verify-levels.mjs --dump 9   # 导出第 9 关的二维数组 A / B

   它把浏览器里的同一套 js（expr / rules / map / engine / verify / levels）
   装进一个干净的 vm 沙箱里跑，所以结果和游戏内按 V 的校验完全一致。
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAD = [
  'js/expr.js',
  'js/rules.js',
  'js/map.js',
  'js/engine.js',
  'js/levelkit.js',
  'js/levels/act1.js',
  'js/levels/act2.js',
  'js/levels/act3.js',
  'js/levels/act4.js',
  'js/verify.js',
  'js/levels.js'
].filter((f) => fs.existsSync(path.join(root, f)));

function loadDSF() {
  const sandbox = { console, window: {}, setTimeout, clearTimeout, performance: { now: () => Date.now() } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const rel of LOAD) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      console.error(`缺少文件：${rel}（关卡数据还没写？）`);
      process.exit(2);
    }
    const code = fs.readFileSync(file, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      console.error(`加载 ${rel} 失败：${e.message}`);
      process.exit(2);
    }
  }
  const DSF = sandbox.window.DSF;
  if (!DSF || !DSF.levels) {
    console.error('DSF 命名空间没有挂载成功，检查各文件末尾的 IIFE 尾巴。');
    process.exit(2);
  }
  return DSF;
}

const args = process.argv.slice(2);
const dumpIdx = args.indexOf('--dump');
const DSF = loadDSF();
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);

if (dumpIdx >= 0) {
  const id = Number(args[dumpIdx + 1] || 1);
  const lv = DSF.levels.get(id);
  console.log(`# 第 ${id} 关 ${lv.name}　${lv.w}×${lv.h}　元素 ${lv.elements.length}　门 ${lv.doors.length}`);
  console.log('\n## 二维数组 A（# 墙 / . 地板 / 空格 虚空）');
  lv.A.forEach((row, i) => console.log(String(i).padStart(3, ' ') + ' ' + row));
  console.log('\n## 二维数组 B（元素注释，. 表示没有元素）');
  lv.B.forEach((row, i) => console.log(String(i).padStart(3, ' ') + ' ' + row));
  console.log('\n## legend（B 里每个字符代表什么）');
  Object.keys(lv.legend).forEach((ch) => {
    const list = lv.legend[ch];
    const head = list[0];
    console.log(`  ${ch}  ×${list.length}  ${head.type}` +
      (head.isDoor ? ` op=${head.op} req=${head.req}` : '') +
      (head.type === 'token' ? ` expr=${head.expr}` : '') +
      (head.type === 'claude' ? ` ×${head.factor}` : '') +
      (head.type === 'user' ? ` cond=${head.cond} +${head.bonus}/-${head.penalty ?? head.bonus}` : '') +
      (head.filler ? '  (填充白饭)' : ''));
  });
  process.exit(0);
}

let reports;
const t0 = Date.now();
try {
  reports = only.length
    ? only.map((id) => DSF.verify.checkLevel(DSF.levels.buildSpec(DSF.levels.specById(id))))
    : DSF.levels.checkAll();
} catch (e) {
  console.error('校验器异常：', e);
  process.exit(2);
}

console.log(DSF.verify.formatReport(reports));
console.log(`\n耗时 ${Date.now() - t0} ms`);

const bad = reports.filter((r) => !r.ok);
if (bad.length) {
  console.log('\n──── 失败明细 ────');
  bad.forEach((r) => {
    console.log(`第 ${r.id} 关 ${r.name}`);
    r.errors.forEach((e) => console.log('  ✗ ' + e));
  });
  process.exit(1);
}
process.exit(0);
