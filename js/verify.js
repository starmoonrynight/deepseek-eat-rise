/* ─────────────────────────────────────────────────────────────
   verify.js —— 关卡校验器 / 最优解追踪 / 终点门槛反推
   ------------------------------------------------------------------
   1) trace(level)：按 level.solution 给出的最优解顺序，
      用 BFS 在「未消耗的非填充元素视为障碍」的地图上逐段寻路，
      再把整条路径交给真实规则引擎逐步模拟，得到每一步的真实数值。
   2) resolveAutoReqs(level)：把 req:'auto' 的门槛，
      按最优解到达该元素时的真实数值反推出来
         · 中转站门：floor(到达值 × reqFrac)，默认 0.8
         · 终点门 / 隐藏通关格：到达值本身（策划案要求：最优值即标准值）
      然后带着真实门槛再跑一次 trace 复核，确保一定可通关。
   3) checkAll(specs)：把全部关卡建出来跑一遍，输出可读报告。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var M = G.map, R = G.rules;
  var FLOOR = M.FLOOR;

  /* 各关规模下限（对应策划案第 6 节） */
  function sizeMinFor(id) {
    if (id <= 5) return [31, 31];        /* > 30×30 */
    if (id <= 8) return [41, 41];        /* > 40×40 */
    if (id <= 10) return [51, 51];       /* > 50×50 */
    if (id === 11) return [76, 76];      /* > 75×75 */
    if (id === 12) return [121, 121];    /* > 120×120 */
    return [0, 0];                       /* 自定义关卡不做规模限制 */
  }

  /* ── BFS 最短路 ───────────────────────────────────────── */
  function bfsPath(level, sx, sy, tx, ty, blocked) {
    var W = level.w, H = level.h;
    if (sx === tx && sy === ty) return [[sx, sy]];
    var start = sy * W + sx, goal = ty * W + tx;
    if (level.tiles[goal] !== FLOOR) return null;
    var prev = new Int32Array(W * H).fill(-1);
    var seen = new Uint8Array(W * H);
    var q = [start];
    seen[start] = 1;
    var head = 0;
    while (head < q.length) {
      var cur = q[head++];
      var cx = cur % W, cy = (cur - cx) / W;
      var nbs = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (var n = 0; n < 4; n++) {
        var nx = nbs[n][0], ny = nbs[n][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var k = ny * W + nx;
        if (seen[k]) continue;
        if (level.tiles[k] !== FLOOR) continue;
        if (k !== goal && blocked && blocked(nx, ny)) continue;
        seen[k] = 1;
        prev[k] = cur;
        if (k === goal) {
          var path = [], p = goal;
          while (p !== -1) { var px = p % W, py = (p - px) / W; path.push([px, py]); p = prev[p]; }
          path.reverse();
          return path;
        }
        q.push(k);
      }
    }
    return null;
  }

  function byId(level, id) {
    for (var i = 0; i < level.elements.length; i++) if (level.elements[i].id === id) return level.elements[i];
    return null;
  }

  /* ── 追踪最优解 ───────────────────────────────────────── */
  function trace(level, opts) {
    opts = opts || {};
    var eng = new G.Engine(level);
    var records = [], warnings = [], errors = [], fullPath = [[eng.px, eng.py]];
    var ids = (level.solution || []).slice();
    if (!ids.length) errors.push('关卡 ' + level.id + ' 没有写 solution（最优解顺序）');

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var el = byId(level, id);
      if (!el) { errors.push('solution 里的 "' + id + '" 在地图上不存在'); break; }
      if (eng.gone[el.id]) { warnings.push(id + ' 在到达之前已被顺路吃掉，跳过'); continue; }

      var blocked = (function (e0) {
        return function (x, y) {
          var e = level.cellMap[y * level.w + x];
          if (!e) return false;
          if (e.filler) return false;
          if (eng.gone[e.id]) return false;
          if (e.id === e0.id) return false;
          return true;
        };
      })(el);

      var path = bfsPath(level, eng.px, eng.py, el.x, el.y, blocked);
      if (!path) {
        /* 宽松模式：允许穿过其它元素（会改变数值，记录下来） */
        path = bfsPath(level, eng.px, eng.py, el.x, el.y, null);
        if (path) {
          var crossed = [];
          for (var pc = 1; pc < path.length - 1; pc++) {
            var ce = eng.elementAt(path[pc][0], path[pc][1]);
            if (ce && !ce.filler) crossed.push(ce.id);
          }
          warnings.push('前往 ' + id + ' 的干净路线不存在，被迫穿过：' + (crossed.join(', ') || '（未知）'));
        }
      }
      if (!path) { errors.push('从当前位置走不到 ' + id + '（' + el.x + ',' + el.y + '）'); break; }

      var preVal = eng.value, lossless = true;
      for (var p = 1; p < path.length; p++) {
        preVal = eng.value;
        var ev = eng.step(path[p][0] - eng.px, path[p][1] - eng.py);
        fullPath.push([eng.px, eng.py]);
        if (ev.kind === 'bowl-block') lossless = false;
        if (eng.status !== 'playing') break;
      }
      records.push({
        id: id, type: el.type, at: [el.x, el.y],
        before: preVal, after: eng.value,
        gainedBowl: !!eng.bowl, status: eng.status, lossless: lossless
      });
      if (eng.status !== 'playing') break;
    }

    return {
      ok: eng.status === 'won',
      status: eng.status,
      reason: eng.reason,
      value: eng.value,
      records: records,
      warnings: warnings,
      errors: errors,
      path: fullPath,
      engine: eng,
      steps: eng.steps
    };
  }

  /* ── 门槛反推：把 'auto' 变成真实数字 ──────────────────
     两遍法：
       第一遍把所有 auto 门槛临时置 0（保证一定能过），跑出每一步的真实到达值；
       第二遍按到达值算出真实门槛，再跑一次复核。
     ──────────────────────────────────────────────────── */
  function resolveAutoReqs(level) {
    var autos = [];
    level.elements.forEach(function (el) {
      var dirty = false;
      if (el.req === 'auto') { el.reqAuto = true; el.req = 0; dirty = true; }
      if (el.reveal === 'auto') { el.revealAuto = true; el.reveal = 0; dirty = true; }
      if (dirty) autos.push(el);
    });
    if (!autos.length) return { tuned: 0, pass1: null, pass2: null };

    var pass1 = trace(level);
    var report = { tuned: 0, pass1: pass1, pass2: null, failed: false };

    if (!pass1.ok) {
      /* 反推失败：给一个保守门槛，保证还能玩，并让校验器大声报错 */
      autos.forEach(function (el) {
        if (el.reqAuto) el.req = (el.type === 'door') ? 1 : 1;
        if (el.revealAuto) el.reveal = 1;
      });
      report.failed = true;
      report.reason = pass1.errors.length ? pass1.errors.join('；') : ('最优解路线在 ' + pass1.status + ' 结束（' + pass1.reason + '）');
      return report;
    }

    var byRecord = {};
    pass1.records.forEach(function (r) { byRecord[r.id] = r; });

    autos.forEach(function (el) {
      var r = byRecord[el.id];
      if (!r) return;
      if (el.reqAuto) {
        var frac = typeof el.reqFrac === 'number' ? el.reqFrac
                 : (el.type === 'door' ? 0.8 : 1.0);
        var req = Math.floor(r.before * frac);
        /* 门的门槛至少 1，避免出现"0 也能过"的退化门 */
        if (el.type === 'door' && req < 1) req = 1;
        if (el.type === 'goal' && req < 1) req = 1;
        el.req = req;
        el.reqResolved = r.before;
      }
      if (el.revealAuto) {
        var rf = typeof el.revealFrac === 'number' ? el.revealFrac : 0.5;
        el.reveal = Math.max(1, Math.floor(r.before * rf));
      }
      report.tuned++;
    });

    var pass2 = trace(level);
    report.pass2 = pass2;
    if (!pass2.ok) report.failed = true;
    return report;
  }

  /* ── 单关完整校验 ─────────────────────────────────────── */
  function checkLevel(level) {
    var base = M.validate(level);
    var errors = base.errors.slice(), warns = base.warns.slice();

    /* 规模 */
    var mn = sizeMinFor(level.id);
    if (level.w < mn[0] || level.h < mn[1]) {
      errors.push('[' + level.id + '] 地图 ' + level.w + '×' + level.h + ' 不满足下限 >' + (mn[0] - 1) + '×' + (mn[1] - 1));
    }

    /* 最优解追踪 */
    var t = trace(level);
    errors = errors.concat(t.errors);
    warns = warns.concat(t.warnings);
    if (!t.ok) {
      errors.push('[' + level.id + '] 最优解路线没能通关（结束状态 ' + t.status + '：' + t.reason + '）');
    }

    /* 终点门槛 = 最优值（或 ≤ 最优值） */
    var goal = level.goal;
    var intended = null;
    if (t.ok) {
      var last = t.records[t.records.length - 1];
      intended = last ? last.before : t.value;
      if (goal) {
        if (goal.req > intended) {
          errors.push('[' + level.id + '] 终点门槛 ' + goal.req + ' > 最优解可达值 ' + intended + '，无法通关');
        } else if (goal.req < intended * 0.7) {
          warns.push('[' + level.id + '] 终点门槛 ' + goal.req + ' 明显低于最优值 ' + intended + '（偏松）');
        }
      }
    }

    /* 门口不能"过了就死" */
    level.doors.forEach(function (d) {
      if (d.type !== 'door') return;
      var probe = [d.req, Math.max(d.req, 1), d.req * 2 + 1, d.req * 4 + 3];
      var killers = probe.filter(function (x) { return !(R.doorValue(x, d) > 0); });
      if (killers.length) {
        warns.push('[' + level.id + '] 门 ' + d.id + ' 在 x=' + killers.join('/') + ' 时通过后的数值 ≤ 0（过门即死）');
      }
    });

    /* 每关至少介绍一个新元素 */
    if (!level.intro || !level.intro.length) warns.push('[' + level.id + '] 没有配置开局元素介绍 intro');

    /* 元素类型清单 */
    var types = {};
    level.elements.forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; });

    return {
      id: level.id, name: level.name, w: level.w, h: level.h,
      ok: errors.length === 0, errors: errors, warns: warns,
      info: base.info, intendedValue: intended,
      goalReq: goal ? goal.req : null,
      trace: {
        status: t.status, steps: t.steps, value: t.value,
        records: t.records.map(function (r) {
          return r.id + '(' + r.before + '→' + r.after + ')';
        })
      },
      types: types,
      autoTune: level.autoTuneReport || null
    };
  }

  /* ── 批量校验 ─────────────────────────────────────────── */
  function checkAll(specs, buildFn) {
    var out = [];
    specs.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (spec) {
      try {
        var lv = buildFn(spec);
        out.push(checkLevel(lv));
      } catch (e) {
        out.push({
          id: spec.id, name: spec.name, ok: false,
          errors: ['构建失败：' + e.message], warns: [], info: {},
          types: {}, trace: null, intendedValue: null, goalReq: null
        });
      }
    });
    return out;
  }

  function formatReport(reports) {
    var lines = [];
    var bad = 0;
    reports.forEach(function (r) {
      var head = (r.ok ? '✅' : '❌') + ' 第' + r.id + '关 ' + (r.name || '') +
        '　' + r.w + '×' + r.h + '　门槛=' + r.goalReq + '　最优值=' + r.intendedValue;
      if (!r.ok) bad++;
      lines.push(head);
      r.errors.slice(0, 12).forEach(function (e) { lines.push('   ✗ ' + e); });
      r.warns.slice(0, 8).forEach(function (w) { lines.push('   ! ' + w); });
      if (r.trace && r.trace.records && r.trace.records.length) {
        lines.push('   路线：' + r.trace.records.slice(0, 24).join(' → '));
      }
      if (r.types) {
        var ts = Object.keys(r.types).map(function (k) { return k + '×' + r.types[k]; }).join(' ');
        lines.push('   元素：' + ts);
      }
    });
    lines.unshift(bad === 0 ? '全部 ' + reports.length + ' 关通过校验 ✅' : ('有 ' + bad + ' 关未通过 ❌'));
    return lines.join('\n');
  }

  G.verify = {
    bfsPath: bfsPath,
    trace: trace,
    resolveAutoReqs: resolveAutoReqs,
    checkLevel: checkLevel,
    checkAll: checkAll,
    formatReport: formatReport,
    sizeMinFor: sizeMinFor,
    byId: byId
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
