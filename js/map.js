/* ─────────────────────────────────────────────────────────────
   map.js —— 关卡地图构建器 + 校验器
   ------------------------------------------------------------------
   设计方法（对应策划案第 9 节）：
     1) 用二维数组 A 画房间：只描述「墙 / 地板」，不管元素。
     2) 用二维数组 B 给 A 里的格子写元素注释，legend 表说明每个字符是什么。
     3) 房间之间用走廊连接，走廊中点放「中转站门」，门把两个房间隔开。
     4) 按答案设计：solution 里写清楚达标路线要吃的元素顺序，
        校验器按真实规则模拟这条路线，把到达终点时的数值作为通关门槛标准值。
   ------------------------------------------------------------------
   A 约定： '#' 墙   '.' 地板   ' ' 虚空（房间外）
   B 约定： '.' 无元素，其余字符查 legend（同一字符可对应多个元素实例）
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var VOID = 0, WALL = 1, FLOOR = 2;

  /* ── 可复现随机数 ─────────────────────────────────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── 形状判定 ─────────────────────────────────────────── */
  function baseShapeInside(shape, lx, ly, w, h, room) {
    var k;
    switch (shape) {
      case 'round':                  /* 切四个角 */
        k = room.k || Math.max(1, Math.floor(Math.min(w, h) / 4));
        if (lx + ly < k) return false;
        if ((w - 1 - lx) + ly < k) return false;
        if (lx + (h - 1 - ly) < k) return false;
        if ((w - 1 - lx) + (h - 1 - ly) < k) return false;
        return true;
      case 'diamond':
        return (Math.abs(lx - (w - 1) / 2) / ((w - 1) / 2 || 1) +
                Math.abs(ly - (h - 1) / 2) / ((h - 1) / 2 || 1)) <= 1.02;
      case 'plus': {
        var aw = Math.max(1, Math.round(w * 0.34)), ah = Math.max(1, Math.round(h * 0.34));
        var cx0 = Math.floor((w - aw) / 2), cy0 = Math.floor((h - ah) / 2);
        var inH = (ly >= cy0 && ly < cy0 + ah);
        var inV = (lx >= cx0 && lx < cx0 + aw);
        return inH || inV;
      }
      case 'cross': {
        var t = Math.max(1, Math.round(Math.min(w, h) * 0.3));
        var inH2 = (ly >= Math.floor((h - t) / 2) && ly < Math.floor((h - t) / 2) + t);
        var inV2 = (lx >= Math.floor((w - t) / 2) && lx < Math.floor((w - t) / 2) + t);
        return inH2 || inV2;
      }
      case 'blob': {
        var rnd = mulberry32(room.seed || 1);
        var bites = [];
        for (var i = 0; i < 3; i++) bites.push([rnd(), rnd(), 0.18 + rnd() * 0.18]);
        for (var b = 0; b < bites.length; b++) {
          var nx = bites[b][0] * w, ny = bites[b][1] * h, r = bites[b][2] * Math.min(w, h);
          if ((lx - nx) * (lx - nx) + (ly - ny) * (ly - ny) < r * r) return false;
        }
        return true;
      }
      case 'rect':
      default:
        return true;
    }
  }

  function roomCellTest(room, lx, ly, w, h) {
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
    if (!baseShapeInside(room.shape || 'rect', lx, ly, w, h, room)) return false;
    var cuts = room.cuts || [];
    for (var i = 0; i < cuts.length; i++) {
      var c = cuts[i], cw = c.wh[0], ch = c.wh[1];
      if (lx >= c.at[0] && lx < c.at[0] + cw && ly >= c.at[1] && ly < c.at[1] + ch) return false;
    }
    return true;
  }

  /* ── 建图主流程 ───────────────────────────────────────── */
  function buildLevel(spec) {
    var W = spec.size[0], H = spec.size[1];
    var grid = new Uint8Array(W * H);            /* 0 void 1 wall 2 floor */
    var idx = function (x, y) { return y * W + x; };
    var inb = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };
    var at = function (x, y) { return inb(x, y) ? grid[idx(x, y)] : VOID; };
    var setFloor = function (x, y) { if (inb(x, y)) grid[idx(x, y)] = FLOOR; };

    var rooms = [], roomById = {};
    (spec.rooms || []).forEach(function (rs) {
      var r = {
        id: rs.id, name: rs.name || rs.id, at: rs.at.slice(), wh: rs.wh.slice(),
        shape: rs.shape || 'rect', k: rs.k, cuts: rs.cuts || [], seed: rs.seed,
        color: rs.color || null, fill: rs.fill || null,
        cells: [], bounds: null, doors: []
      };
      rooms.push(r); roomById[r.id] = r;

      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var ly = 0; ly < r.wh[1]; ly++) {
        for (var lx = 0; lx < r.wh[0]; lx++) {
          if (!roomCellTest(r, lx, ly, r.wh[0], r.wh[1])) continue;
          var gx = r.at[0] + lx, gy = r.at[1] + ly;
          if (!inb(gx, gy)) continue;
          setFloor(gx, gy);
          r.cells.push(idx(gx, gy));
          if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
          if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
        }
      }
      r.bounds = [minX, minY, maxX, maxY];
      if (!r.cells.length) throw new Error('房间 ' + r.id + ' 没有任何地板格（检查 at/wh/shape）');
    });

    /* ── 走廊 + 门 ─────────────────────────────────────── */
    var corridorPaths = [];                       /* 每条走廊的格子序列 */
    var doors = [];

    function cellCenter(r) {
      var b = r.bounds;
      return [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)];
    }
    /* 房间边缘候选锚点：地板格且八邻域里存在非地板 */
    function edgeCells(r) {
      var out = [];
      r.cells.forEach(function (i) {
        var x = i % W, y = (i - x) / W, edge = false;
        for (var dy = -1; dy <= 1 && !edge; dy++)
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (at(x + dx, y + dy) !== FLOOR) { edge = true; break; }
          }
        if (edge) out.push([x, y]);
      });
      /* 房间太小时退回全部地板格 */
      return out.length ? out : r.cells.map(function (i) { return [i % W, (i - (i % W)) / W]; });
    }

    function carvePath(pts) {
      pts.forEach(function (p) { setFloor(p[0], p[1]); });
    }

    function pathBetween(a, b, bend) {
      /* 从 a 到 b 的 L 形走廊：先横后竖(hv) 或 先竖后横(vh) */
      var pts = [], x = a[0], y = a[1];
      pts.push([x, y]);
      if (bend === 'vh') {
        while (y !== b[1]) { y += y < b[1] ? 1 : -1; pts.push([x, y]); }
        while (x !== b[0]) { x += x < b[0] ? 1 : -1; pts.push([x, y]); }
      } else {
        while (x !== b[0]) { x += x < b[0] ? 1 : -1; pts.push([x, y]); }
        while (y !== b[1]) { y += y < b[1] ? 1 : -1; pts.push([x, y]); }
      }
      return pts;
    }

    /* Z 形（多段拐弯）走廊：先到中点拐一下，再拐回来接上目标。
       —— 策划要求"连接道路不一定是直线"，而且走廊之间允许交叠，
          这样才能把远处的房间接进中心枢纽。 */
    function pathBetweenZ(a, b, bend, jog) {
      var mx = Math.round((a[0] + b[0]) / 2);
      var my = Math.round((a[1] + b[1]) / 2);
      var m = bend === 'vh' ? [mx + jog, my] : [mx, my + jog];
      var seg1 = pathBetween(a, m, bend);
      var seg2 = pathBetween(m, b, bend === 'vh' ? 'hv' : 'vh');
      return seg1.concat(seg2.slice(1));
    }

    /* 走廊交叉口四面都通，门放在那儿等于没门 ——
       只认"前后各一格是本走廊、左右都是墙"的窄口格。 */
    var DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function narrowAt(p) {
      var n = 0;
      for (var i = 0; i < 4; i++) {
        var x = p[0] + DIR4[i][0], y = p[1] + DIR4[i][1];
        if (!inb(x, y)) continue;
        if (grid[idx(x, y)] === FLOOR) n++;
      }
      return n <= 2;
    }

    /* 检查走廊是否穿过了"其它房间"的内部（会破坏门的分隔性） */
    function pathHitsOtherRoom(pts, ra, rb) {
      for (var i = 1; i < pts.length - 1; i++) {
        for (var r = 0; r < rooms.length; r++) {
          var rm = rooms[r];
          if (rm === ra || rm === rb) continue;
          if (containsCell(rm, pts[i][0], pts[i][1])) return true;
        }
      }
      return false;
    }

    /* 交汇处必须"预留宽度"：一条走廊的中间格旁边如果已经有别的走廊地板，
       两条路就会并成一片大厅 —— 门旁边凭空多出通路，等于没门。
       所以新走廊的每一格，除了它自己前后两格以外，四邻必须还是墙。 */
    function pathMergesOther(pts) {
      for (var i = 1; i < pts.length - 1; i++) {
        var p = pts[i];
        for (var q = 0; q < 4; q++) {
          var x = p[0] + DIR4[q][0], y = p[1] + DIR4[q][1];
          if (!inb(x, y)) continue;
          if (grid[idx(x, y)] !== FLOOR) continue;
          var onPath = false;
          if (i > 0 && pts[i - 1][0] === x && pts[i - 1][1] === y) onPath = true;
          if (i + 1 < pts.length && pts[i + 1][0] === x && pts[i + 1][1] === y) onPath = true;
          if (!onPath) return true;          /* 旁边已经是地板 → 会并成大厅 */
        }
      }
      return false;
    }
    function containsCell(r, x, y) {
      var lx = x - r.at[0], ly = y - r.at[1];
      return roomCellTest(r, lx, ly, r.wh[0], r.wh[1]);
    }

    (spec.links || []).forEach(function (lk, li) {
      var ra = roomById[lk.a], rb = roomById[lk.b];
      if (!ra || !rb) throw new Error('link ' + li + ' 引用了不存在的房间：' + lk.a + ' / ' + lk.b);
      var ea = lk.via && lk.via.length ? [lk.via[0]] : edgeCells(ra);
      var eb = lk.via && lk.via.length ? [lk.via[lk.via.length - 1]] : edgeCells(rb);

      /* 候选：按曼哈顿距离排序，挑不撞其它房间的走法 */
      var cands = [];
      for (var i = 0; i < ea.length; i++) {
        for (var j = 0; j < eb.length; j++) {
          cands.push({ a: ea[i], b: eb[j], d: Math.abs(ea[i][0] - eb[j][0]) + Math.abs(ea[i][1] - eb[j][1]) });
        }
      }
      cands.sort(function (p, q) { return p.d - q.d; });
      var best = null, fallback = null;
      var freeform = !!spec.freeform;
      /* 注意：这里没有启用 'zh'/'zv' 多段拐弯。多段走廊很容易和别的走廊贴边，
         两条路一并就成了大厅 —— 门旁边凭空多出通路，等于没门（策划指出过这个问题）。
         要重新启用，必须先保证交汇处"预留宽度"：给走廊之间留 1 格墙，
         并且让枢纽房间的每条走廊从不同方向的边缘接入。 */
      var bends = ['hv', 'vh'];
      var limit = Math.min(cands.length, 260);
      for (var c = 0; c < limit; c++) {
        var cand = cands[c];
        if (cand.a[0] === cand.b[0] && cand.a[1] === cand.b[1]) continue;
        bends.forEach(function (bend) {
          if (best) return;
          var pts;
          if (bend === 'zh' || bend === 'zv') {
            var jog = ((li * 7 + c) % 5 - 2) * 3;        /* 确定性抖动，同一种子出同一张图 */
            pts = pathBetweenZ(cand.a, cand.b, bend === 'zh' ? 'hv' : 'vh', jog);
          } else {
            pts = pathBetween(cand.a, cand.b, bend);
          }
          if (!fallback) fallback = pts;
          if (!pathHitsOtherRoom(pts, ra, rb) && !pathMergesOther(pts)) best = pts;
        });
        if (best) break;
      }
      /* 实在找不到"既绕开房间又不合并"的走法时，允许合并，但记一笔 ——
         校验器会因此报出门失去隔断作用的错误，让我们知道这条路没走通 */
      var merged = false;
      if (!best) { best = fallback; merged = !!best; }
      var pts = best || fallback;
      if (!pts) throw new Error('link ' + lk.a + '→' + lk.b + ' 无法生成走廊');
      carvePath(pts);
      corridorPaths.push({ pts: pts, a: ra.id, b: rb.id });

      /* 门放在走廊中段，且必须落在两个房间之外 */
      var doorCell = null, mid = Math.floor(pts.length / 2);
      var order = [];
      for (var s = 0; s < pts.length; s++) order.push(s);
      order.sort(function (p, q) { return Math.abs(p - mid) - Math.abs(q - mid); });
      for (var oi = 0; oi < order.length; oi++) {
        var pi = order[oi];
        if (pi === 0 || pi === pts.length - 1) continue;         /* 端点属于房间内部 */
        var pc = pts[pi];
        if (containsCell(ra, pc[0], pc[1]) || containsCell(rb, pc[0], pc[1])) continue;
        if (!narrowAt(pc)) continue;                             /* 走廊交叉口不放门 */
        var okDist = true;
        for (var d = 0; d < doors.length; d++) {
          if (Math.max(Math.abs(doors[d].x - pc[0]), Math.abs(doors[d].y - pc[1])) < 3) { okDist = false; break; }
        }
        if (!okDist) continue;
        doorCell = pc;
        break;
      }
      if (!doorCell) {
        /* 兜底：在整条走廊里挑"最窄"的一格（四邻地板最少），
           枢纽周围十几条走廊交汇时不可能找到完美窄口，至少要挑最像门的 */
        var bestN = 9, bestCell = null;
        for (var oi2 = 0; oi2 < order.length; oi2++) {
          var pi2 = order[oi2];
          if (pi2 === 0 || pi2 === pts.length - 1) continue;
          var pc2 = pts[pi2];
          if (containsCell(ra, pc2[0], pc2[1]) || containsCell(rb, pc2[0], pc2[1])) continue;
          var nn = 0;
          for (var q = 0; q < 4; q++) {
            var qx = pc2[0] + DIR4[q][0], qy = pc2[1] + DIR4[q][1];
            if (inb(qx, qy) && grid[idx(qx, qy)] === FLOOR) nn++;
          }
          if (nn < bestN) { bestN = nn; bestCell = pc2; }
          if (nn <= 2) break;
        }
        doorCell = bestCell;
      }
      if (!doorCell) throw new Error('link ' + lk.a + '→' + lk.b + ' 找不到合适放门的位置');

      var doorEl = Object.assign({}, lk.door || {});
      doorEl.type = doorEl.type || 'door';
      doorEl.id = doorEl.id || ('door_' + lk.a + '_' + lk.b);
      doorEl.x = doorCell[0]; doorEl.y = doorCell[1];
      doorEl.roomA = ra.id; doorEl.roomB = rb.id;
      doorEl.link = li;
      doors.push(doorEl);
      ra.doors.push(doorEl.id); rb.doors.push(doorEl.id);
      doorEl.anchorA = nearestRoomCell(ra, doorCell);
      doorEl.anchorB = nearestRoomCell(rb, doorCell);
      doorEl.corridor = pts;
    });

    function nearestRoomCell(r, p) {
      var best = null, bd = 1e9;
      for (var i = 0; i < r.cells.length; i++) {
        var x = r.cells[i] % W, y = (r.cells[i] - x) / W;
        var d = Math.abs(x - p[0]) + Math.abs(y - p[1]);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      return best;
    }

    /* ── 补齐墙体：紧贴地板的虚空变成墙 ─────────────────── */
    for (var y2 = 0; y2 < H; y2++) {
      for (var x2 = 0; x2 < W; x2++) {
        if (grid[idx(x2, y2)] !== VOID) continue;
        var touch = false;
        for (var dy = -1; dy <= 1 && !touch; dy++)
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (at(x2 + dx, y2 + dy) === FLOOR) { touch = true; break; }
          }
        if (touch) grid[idx(x2, y2)] = WALL;
      }
    }

    /* ── 元素收集 ───────────────────────────────────────── */
    var elements = [];
    var usedIds = {};
    var placed = {};
    var relocations = [];
    var seedBase = spec.seed || (spec.id * 7919 + 13);

    function addElement(el, where) {
      if (!el.id) el.id = (el.type || 'el') + '_' + elements.length;
      if (usedIds[el.id]) throw new Error('元素 id 重复：' + el.id + '（' + where + '）');
      usedIds[el.id] = true;
      elements.push(el);
      return el;
    }

    /** 把元素挪到"同一房间内最近的空地板格"；返回是否挪动过 */
    function ensurePlaceable(el, room) {
      var k = (inb(el.x, el.y)) ? (el.y * W + el.x) : -1;
      if (k >= 0 && grid[k] === FLOOR && !placed[k] && (!room || containsCell(room, el.x, el.y))) {
        placed[k] = true;
        return false;
      }
      var best = null, bd = 1e9;
      for (var yy = 1; yy < H - 1; yy++) {
        for (var xx = 1; xx < W - 1; xx++) {
          var kk = yy * W + xx;
          if (grid[kk] !== FLOOR || placed[kk]) continue;
          if (room && !containsCell(room, xx, yy)) continue;
          var d = Math.abs(xx - el.x) + Math.abs(yy - el.y);
          if (d < bd) { bd = d; best = [xx, yy]; }
        }
      }
      if (!best) {
        /* 房间内实在没位置就退到全图任意空地板格 */
        for (var y2 = 1; y2 < H - 1 && !best; y2++)
          for (var x2 = 1; x2 < W - 1; x2++) {
            var k2 = y2 * W + x2;
            if (grid[k2] === FLOOR && !placed[k2]) { best = [x2, y2]; break; }
          }
      }
      if (!best) throw new Error('元素 ' + el.id + ' 找不到可以放的地板格');
      relocations.push(el.id + ' ' + el.x + ',' + el.y + ' → ' + best[0] + ',' + best[1]);
      el.relocated = { from: [el.x, el.y], to: best.slice() };
      el.x = best[0]; el.y = best[1];
      placed[best[1] * W + best[0]] = true;
      return true;
    }

    /* 门的元素定义已经在走廊里建好了，这里统一登记 */
    doors.forEach(function (d) {
      placed[d.y * W + d.x] = true;
      addElement({
        id: d.id, type: d.type, x: d.x, y: d.y,
        op: d.op, amount: d.amount, divisor: d.divisor, expr: d.expr, factor: d.factor, req: d.req,
        roomA: d.roomA, roomB: d.roomB, anchorA: d.anchorA, anchorB: d.anchorB,
        tier: G.rules.doorTier(d), label: d.label, isDoor: true
      }, 'door');
    });

    /* 关卡里手写的元素 */
    (spec.elements || []).forEach(function (es) {
      var el = Object.assign({}, es);
      var room = null;
      if (el.room) {
        room = roomById[el.room];
        if (!room) throw new Error('元素 ' + el.id + ' 引用了不存在的房间 ' + el.room);
        el.x = room.at[0] + el.at[0];
        el.y = room.at[1] + el.at[1];
        delete el.at;
      }
      ensurePlaceable(el, room);
      addElement(el, 'elements');
    });

    /* ── 起点 ───────────────────────────────────────────── */
    var start = { x: 0, y: 0 };
    if (spec.start) {
      var sr = roomById[spec.start.room];
      if (!sr) throw new Error('start 引用了不存在的房间 ' + spec.start.room);
      start.x = sr.at[0] + (spec.start.at ? spec.start.at[0] : Math.floor(sr.wh[0] / 2));
      start.y = sr.at[1] + (spec.start.at ? spec.start.at[1] : Math.floor(sr.wh[1] / 2));
    } else {
      start.x = rooms[0].at[0] + 1; start.y = rooms[0].at[1] + 1;
    }
    ensurePlaceable(start, spec.start ? roomById[spec.start.room] : null);

    /* ── 填充白饭（房间元素密度 10%~30%） ────────────────── */
    var fillCfg = spec.fill || null;
    var rng = mulberry32(seedBase);
    if (fillCfg && fillCfg.type !== 'none') {
      var fType = fillCfg.type || 'rice';
      var fValue = typeof fillCfg.value === 'number' ? fillCfg.value : 1;
      var clearance = typeof fillCfg.clearance === 'number' ? fillCfg.clearance : 0;
      rooms.forEach(function (r) {
        var local = r.fill || {};
        var dens = typeof local.density === 'number' ? local.density
                 : (typeof fillCfg.density === 'number' ? fillCfg.density : 0.15);
        if (local.type === 'none' || dens <= 0) return;

        var occupied = {};
        elements.forEach(function (e) { occupied[e.y * W + e.x] = true; });
        occupied[start.y * W + start.x] = true;

        var specials = elements.filter(function (e) {
          return containsCell(r, e.x, e.y);
        });

        /* 特殊元素周围留白，避免谜题被饭粒糊住 */
        var blocked = {};
        if (clearance > 0) {
          specials.forEach(function (e) {
            for (var dy = -clearance; dy <= clearance; dy++)
              for (var dx = -clearance; dx <= clearance; dx++) {
                if (!inb(e.x + dx, e.y + dy)) continue;
                blocked[(e.y + dy) * W + (e.x + dx)] = true;
              }
          });
        }

        var cands = [];
        r.cells.forEach(function (i) {
          if (occupied[i] || blocked[i]) return;
          cands.push(i);
        });
        /* 洗牌（可复现） */
        for (var s = cands.length - 1; s > 0; s--) {
          var t = Math.floor(rng() * (s + 1));
          var tmp = cands[s]; cands[s] = cands[t]; cands[t] = tmp;
        }
        var want = Math.round(r.cells.length * dens) - specials.length;
        if (want < 0) want = 0;
        var roomValue = typeof local.value === 'number' ? local.value : fValue;
        var placed = 0;
        for (var p = 0; p < cands.length && placed < want; p++) {
          var ci = cands[p], cx = ci % W, cy = (ci - cx) / W;
          elements.push({
            id: 'fill_' + r.id + '_' + placed, type: fType, value: roomValue == null ? 1 : roomValue,
            x: cx, y: cy, room: r.id, filler: true
          });
          occupied[ci] = true;
          placed++;
        }
        /* 密度兜底：留白太多导致铺不满时，把"特殊元素旁边"的格子也用上，
           保证每个房间的元素密度都落在 (10%, 30%) 区间里 */
        if (placed < want) {
          var extra = [];
          r.cells.forEach(function (i) { if (!occupied[i]) extra.push(i); });
          for (var s2 = extra.length - 1; s2 > 0; s2--) {
            var t2 = Math.floor(rng() * (s2 + 1));
            var tm2 = extra[s2]; extra[s2] = extra[t2]; extra[t2] = tm2;
          }
          for (var p2 = 0; p2 < extra.length && placed < want; p2++) {
            var ci2 = extra[p2], cx2 = ci2 % W, cy2 = (ci2 - cx2) / W;
            elements.push({
              id: 'fill_' + r.id + '_' + placed, type: fType, value: roomValue == null ? 1 : roomValue,
              x: cx2, y: cy2, room: r.id, filler: true
            });
            occupied[ci2] = true;
            placed++;
          }
        }
      });
    }

    /* ── 组装 level 对象 ────────────────────────────────── */
    var level = {
      id: spec.id, name: spec.name, subtitle: spec.subtitle || '',
      tier: spec.tier || '', w: W, h: H,
      spec: spec,
      tiles: grid,
      rooms: rooms.slice(),
      roomById: roomById,
      corridors: corridorPaths,
      elements: elements,
      start: start,
      relocations: relocations,
      solution: spec.solution || [],
      intro: spec.intro || [],
      hint: spec.hint || '',
      tips: spec.tips || [],
      cellMap: {},
      meta: {
        seed: seedBase,
        sizeClass: spec.sizeClass || (W + 'x' + H),
        doorCount: doors.length
      }
    };

    elements.forEach(function (el) {
      if (!inb(el.x, el.y)) throw new Error('元素 ' + el.id + ' 坐标越界：' + el.x + ',' + el.y);
      if (grid[idx(el.x, el.y)] !== FLOOR) throw new Error('元素 ' + el.id + ' 没有放在地板上：' + el.x + ',' + el.y + '（' + el.type + '）');
      var key = el.y * W + el.x;
      if (level.cellMap[key]) throw new Error('元素重叠：' + el.id + ' 和 ' + level.cellMap[key].id + ' 都在 ' + el.x + ',' + el.y);
      level.cellMap[key] = el;
    });
    if (grid[idx(start.x, start.y)] !== FLOOR) throw new Error('起点不在房间地板上：' + start.x + ',' + start.y);

    level.doors = elements.filter(function (e) { return e.isDoor; });
    level.goal = elements.filter(function (e) { return e.type === 'goal' || e.type === 'hidden'; })[0] || null;

    /* ── 导出二维数组 A / B ─────────────────────────────── */
    level.A = [];
    level.B = [];
    var annotPool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var legend = {};
    var poolPos = 0;
    var charByEl = {};
    elements.forEach(function (el) {
      var ch;
      if (el.filler) ch = 'r';
      else if (el.type === 'goal') ch = 'G';
      else if (el.type === 'hidden') ch = 'H';
      else if (el.isDoor) ch = 'D';
      else {
        ch = annotPool.charAt(poolPos % annotPool.length);
        poolPos++;
        if (ch === 'r') { ch = annotPool.charAt(poolPos % annotPool.length); poolPos++; }
      }
      charByEl[el.id] = ch;
      (legend[ch] = legend[ch] || []).push(el);
    });
    for (var y3 = 0; y3 < H; y3++) {
      var ra = '', rb = '';
      for (var x3 = 0; x3 < W; x3++) {
        var t = grid[idx(x3, y3)];
        ra += t === FLOOR ? '.' : (t === WALL ? '#' : ' ');
        var el2 = level.cellMap[y3 * W + x3];
        rb += el2 ? charByEl[el2.id] : '.';
      }
      level.A.push(ra);
      level.B.push(rb);
    }
    level.legend = legend;
    level.charByEl = charByEl;

    return level;
  }

  /* ── 校验 ─────────────────────────────────────────────── */
  function validate(level) {
    var W = level.w, H = level.h, grid = level.tiles;
    var idx = function (x, y) { return y * W + x; };
    var inb = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };
    var errors = [], warns = [], info = {};

    /* 1. 元素定义合法性 */
    level.elements.forEach(function (el) {
      var errs = G.rules.checkElement(el);
      errs.forEach(function (e) { errors.push('[' + level.id + '] ' + e + ' @' + el.x + ',' + el.y); });
    });

    /* 2. 门：不重叠、不相邻、分隔两个房间、可互相到达 */
    var doors = level.doors;
    for (var i = 0; i < doors.length; i++) {
      for (var j = i + 1; j < doors.length; j++) {
        var d = Math.max(Math.abs(doors[i].x - doors[j].x), Math.abs(doors[i].y - doors[j].y));
        if (d < 2) errors.push('[' + level.id + '] 门 ' + doors[i].id + ' 与 ' + doors[j].id + ' 相邻（间隔 ' + d + '）');
        else if (d < 4) warns.push('[' + level.id + '] 门 ' + doors[i].id + ' 与 ' + doors[j].id + ' 距离很近（' + d + '）');
      }
    }

    /* 连通性工具 */
    function flood(blockDoors, from) {
      var seen = {};
      var q = [from];
      seen[from[1] * W + from[0]] = true;
      while (q.length) {
        var p = q.pop(), x = p[0], y = p[1];
        var nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (var n = 0; n < 4; n++) {
          var nx = nb[n][0], ny = nb[n][1];
          if (!inb(nx, ny) || grid[idx(nx, ny)] !== FLOOR) continue;
          var k = ny * W + nx;
          if (seen[k]) continue;
          if (blockDoors && level.cellMap[k] && level.cellMap[k].isDoor) continue;
          seen[k] = true; q.push([nx, ny]);
        }
      }
      return seen;
    }

    if (doors.length >= 2) {
      var openGrid = flood(false, [level.start.x, level.start.y]);
      var reachDoors = doors.filter(function (d) { return openGrid[d.y * W + d.x]; });
      if (reachDoors.length < 2) warns.push('[' + level.id + '] 从起点只能走到 ' + reachDoors.length + ' 扇门');
      doors.forEach(function (d) {
        if (!openGrid[d.y * W + d.x]) { errors.push('[' + level.id + '] 门 ' + d.id + ' 从起点不可达'); return; }
        var others = doors.filter(function (o) { return o !== d && openGrid[o.y * W + o.x]; });
        if (!others.length) errors.push('[' + level.id + '] 门 ' + d.id + ' 找不到任何"与它在一条可通行路径上"的其他门');
      });
    }

    doors.forEach(function (d) {
      if (!d.anchorA || !d.anchorB) { errors.push('[' + level.id + '] 门 ' + d.id + ' 缺少房间锚点'); return; }
      if (level.freeform) {
        /* 自由布局的走廊必须"预留宽度"，正常情况下门一定卡在 1 格宽的窄口上。
           真出现四面都通的格子，说明两条走廊并成了大厅 —— 这门就形同虚设，
           所以这里报错（而不是放过），逼着生成器换走法。 */
        var n = 0;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var i = 0; i < 4; i++) {
          var x = d.x + dirs[i][0], y = d.y + dirs[i][1];
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (grid[y * W + x] === FLOOR) n++;
        }
        if (n > 2) errors.push('[' + level.id + '] 门 ' + d.id + ' 落在走廊交汇处（四面都通），旁边可以绕过 —— 交汇处没有预留宽度');
        return;
      }
      var blocked = flood(true, d.anchorA);
      if (blocked[d.anchorB[1] * W + d.anchorB[0]]) {
        errors.push('[' + level.id + '] 门 ' + d.id + ' 没有把 ' + d.roomA + ' 和 ' + d.roomB + ' 隔开（去掉门仍然连通）');
      }
    });

    /* 3. 房间元素密度 */
    var roomStats = [];
    level.rooms.forEach(function (r) {
      var count = 0;
      r.cells.forEach(function (ci) {
        var el = level.cellMap[ci];
        if (el) count++;
      });
      var dens = r.cells.length ? count / r.cells.length : 0;
      roomStats.push({ room: r.id, floor: r.cells.length, elements: count, density: +dens.toFixed(4) });
      if (!r.cells.length) { errors.push('[' + level.id + '] 房间 ' + r.id + ' 没有地板'); return; }
      if (dens <= 0.10) errors.push('[' + level.id + '] 房间 ' + r.id + ' 元素密度 ' + (dens * 100).toFixed(1) + '% ≤ 10%');
      if (dens >= 0.30) errors.push('[' + level.id + '] 房间 ' + r.id + ' 元素密度 ' + (dens * 100).toFixed(1) + '% ≥ 30%');
    });
    info.rooms = roomStats;

    /* 4. 起点 / 终点 / 可达性 */
    if (!level.goal) errors.push('[' + level.id + '] 缺少终点门或隐藏通关格');
    var seenAll = flood(false, [level.start.x, level.start.y]);
    var floorCount = 0, reached = 0, unreachable = [];
    for (var k = 0; k < W * H; k++) {
      if (grid[k] !== FLOOR) continue;
      floorCount++;
      if (seenAll[k]) reached++;
      else { var ux = k % W, uy = (k - ux) / W; unreachable.push([ux, uy]); }
    }
    info.floor = floorCount;
    info.reachable = reached;
    if (unreachable.length) {
      warns.push('[' + level.id + '] 有 ' + unreachable.length + ' 格地板从起点走不到，例如 ' + JSON.stringify(unreachable.slice(0, 4)));
    }
    var startEl = level.cellMap[level.start.y * W + level.start.x];
    if (startEl) warns.push('[' + level.id + '] 起点上放着元素 ' + startEl.id + '，开局就会被触发');
    if (level.relocations && level.relocations.length) {
      warns.push('[' + level.id + '] ' + level.relocations.length + ' 个坐标落在房间外/被占用，已自动就近落位：' +
        level.relocations.slice(0, 6).join('；') + (level.relocations.length > 6 ? ' …' : ''));
    }

    /* 5. 门的运算必须"一定减少" */
    var maxSoFar = 0;
    level.elements.forEach(function (el) {
      if (typeof el.value === 'number' && !el.isDoor && el.type !== 'claude') maxSoFar += Math.abs(el.value);
      if (el.type === 'claude' && typeof el.factor === 'number') maxSoFar *= Math.max(1, el.factor);
    });
    var hi = Math.max(1000, Math.ceil(maxSoFar * 4));
    doors.forEach(function (d) {
      if (d.type !== 'door') return;
      var bad = G.rules.checkDoorDecreasing(d, d.req, hi);
      if (bad.length) {
        errors.push('[' + level.id + '] 门 ' + d.id + ' 的运算不满足「结果一定减少」：' +
          bad.slice(0, 3).map(function (b) { return 'x=' + b.x + '→' + b.y + '(' + b.why + ')'; }).join(', ') +
          (bad.length > 3 ? ' 等 ' + bad.length + ' 处' : ''));
      }
    });

    /* 6. 元素统计 */
    var byType = {};
    level.elements.forEach(function (el) { byType[el.type] = (byType[el.type] || 0) + 1; });
    info.types = byType;
    info.elements = level.elements.length;
    info.doors = doors.length;

    return { ok: errors.length === 0, errors: errors, warns: warns, info: info };
  }

  /* ── 运行时辅助 ───────────────────────────────────────── */
  function elementAt(level, x, y) {
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
    return level.cellMap[y * level.w + x] || null;
  }
  function tileAt(level, x, y) {
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return VOID;
    return level.tiles[y * level.w + x];
  }
  function roomAt(level, x, y) {
    for (var i = 0; i < level.rooms.length; i++) {
      var r = level.rooms[i];
      var lx = x - r.at[0], ly = y - r.at[1];
      if (roomCellTest(r, lx, ly, r.wh[0], r.wh[1])) return r;
    }
    return null;
  }

  G.map = {
    VOID: VOID, WALL: WALL, FLOOR: FLOOR,
    buildLevel: buildLevel,
    validate: validate,
    elementAt: elementAt,
    tileAt: tileAt,
    roomAt: roomAt,
    roomCellTest: roomCellTest,
    mulberry32: mulberry32
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
