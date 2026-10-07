/* ─────────────────────────────────────────────────────────────
   levels.js —— 关卡注册表
   ------------------------------------------------------------------
   · 收集 js/levels/act*.js 里 push 进来的 spec
   · 懒构建：真正进入某一关时才生成地图 + 反推终点门槛（保证可通关）
   · 记录通关进度（localStorage）
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var M = G.map;
  var STORE_KEY = 'dsf.fish.rice.progress.v1';

  var cache = {};
  var specs = [];

  /* 校验器要延迟取（脚本加载顺序不能成为隐患） */
  function V() {
    var v = G.verify;
    if (!v) throw new Error('verify.js 还没加载：请确认 index.html 里它在 levels.js 之前');
    return v;
  }

  function refresh() {
    /* 同一个 id 允许被后面的文件重新定义（老关卡重建时用）：后定义的覆盖前面的 */
    var byId = {}, order = [];
    (G.levelSpecs || []).forEach(function (s) {
      if (!byId[s.id]) order.push(s.id);
      byId[s.id] = s;
    });
    /* 暂时下架名单（空着表示全部关卡都在） */
    var DISABLED = {};
    specs = order.map(function (id) { return byId[id]; })
      .filter(function (s) { return !DISABLED[s.id]; })
      .sort(function (a, b) { return a.id - b.id; });
    return specs;
  }

  function specById(id) {
    if (!specs.length) refresh();
    for (var i = 0; i < specs.length; i++) if (specs[i].id === id) return specs[i];
    return null;
  }

  /* ══ 给房间补足特殊元素 ══════════════════════════════════════
     策划反馈"每个房间的特殊元素太少"。直接在 24 张图上手改不现实，
     所以做成构建期的一道工序：房间建好之后按面积补元素。

     三条安全规则：
       ① 只补这一关**已经出现过**的元素类型 —— 第 1 关没有 Claude 娘，
          就绝不会凭空冒出 Claude 娘，教程顺序不会被破坏；
       ② 新元素必须四邻都是空地，而且周围留 1 格净空 ——
          否则会堵死走廊口，把关卡变成不可解；
       ③ 目标数量按房间面积算（每约 70 格 1 个，2~7 个封顶），
          并且不碰放着终点/隐藏格的那一格。
     ══════════════════════════════════════════════════════════ */
  function enrichLevel(lv) {
    var E = G.expr;
    var kinds = {};
    lv.elements.forEach(function (e) { if (!e.filler) kinds[e.type] = true; });
    var pool = [];
    if (kinds.claude) pool.push('claude');
    if (kinds.token) pool.push('token');
    if (kinds.user) pool.push('user');
    if (kinds.bowl_rice) pool.push('bowl_rice');

    /* 这一关白饭的中位数，新补的白饭围着它上下浮动 */
    var rices = lv.elements.filter(function (e) { return e.type === 'rice' && !e.filler; })
      .map(function (e) { return e.value; }).sort(function (a, b) { return a - b; });
    var med = rices.length ? rices[Math.floor(rices.length / 2)] : 20;

    var seed = (lv.id * 2654435761) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

    /* 只挑"这一关已经解锁的函数"能组成的式子 ——
       策划要求新算法必须先介绍再出现，所以补元素不能乱用高级函数 */
    var allowed = introducedAt(lv.id);
    function okExpr(src) {
      var used = G.expr.funcsUsed(src);
      if (!used) return false;
      for (var f in used) if (!allowed[f]) return false;
      return true;
    }
    var tokens = TOKEN_LITE.filter(okExpr);
    var conds = COND_LITE.filter(okExpr);
    if (!tokens.length) tokens = ['x + ' + Math.max(5, Math.round(med * 0.6))];

    var W = lv.w, H = lv.h, FLOOR = M.FLOOR;
    var added = 0, guard = {};
    function blocked(x, y) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return true;
      var k = y * W + x;
      if (lv.tiles[k] !== FLOOR) return true;
      if (lv.cellMap[k]) return true;                 /* 已经有元素 */
      if (guard[k]) return true;
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var nk = (y + dy) * W + (x + dx);
          if (lv.tiles[nk] !== FLOOR || lv.cellMap[nk] || guard[nk]) return true;
        }
      }
      return false;
    }

    for (var ri = 0; ri < lv.rooms.length; ri++) {
      var room = lv.rooms[ri];
      var x0 = room.at[0], y0 = room.at[1], x1 = x0 + room.wh[0], y1 = y0 + room.wh[1];
      var cells = [], have = 0, protect = {};
      for (var y = y0; y < y1; y++) {
        for (var x = x0; x < x1; x++) {
          if (M.roomAt(lv, x, y) !== room) continue;
          cells.push([x, y]);
          var el = lv.cellMap[y * W + x];
          if (el && !el.filler) {
            have++;
            if (el.type === 'goal' || el.type === 'hidden') protect[y * W + x] = true;
          }
        }
      }
      if (!cells.length) continue;
      /* 目标数量按房间实际空格算，并且留够走路的余地 ——
         房间缩到 5×5~10×10 之后，如果还按老公式补 3~8 个，
         这些元素连同它们要求的 1 格净空会把小房间整个占满，路直接堵死。 */
      var target = Math.max(1, Math.min(8, Math.floor(cells.length / 22)));
      if (have >= target) continue;
      var want = target - have;
      for (var c = 0; c < cells.length && want > 0; c++) {
        var px = cells[c][0], py = cells[c][1];
        if (protect[py * W + px]) continue;
        if (blocked(px, py)) continue;
        /* 第一个补的总是白饭（垫门槛用），之后轮流补已解锁的复杂元素 */
        var type = (added % 2 === 0 || !pool.length) ? 'rice' : pool[(added >> 1) % pool.length];
        /* id 用格子坐标而不是计数器：同一张图重复构建时编号必须一致，
           否则求解器给的顺序里会出现在另一次构建中不存在的 id */
        var el2 = { id: 'x' + lv.id + '_' + px + '_' + py, type: type, x: px, y: py, room: room.id, filler: false };
        if (type === 'rice') el2.value = Math.max(3, Math.round(med * (0.5 + rnd() * 1.1)));
        else if (type === 'bowl_rice') el2.value = Math.max(4, Math.round(med * (0.4 + rnd() * 0.8)));
        else if (type === 'claude') el2.factor = 2 + Math.floor(rnd() * 2);
        else if (type === 'token') el2.expr = tokens[Math.floor(rnd() * tokens.length)];
        else el2.cond = (conds.length ? conds : ['x > N'])[Math.floor(rnd() * Math.max(1, conds.length))].replace('N', String(Math.max(20, Math.round(med * (2 + rnd() * 6)))));
        if (type === 'user') { el2.bonus = Math.max(8, Math.round(med * 1.5)); el2.penalty = Math.max(6, Math.round(med * 0.4)); }
        if (type === 'user') { el2.bonus = Math.max(8, Math.round(med * 1.5)); el2.penalty = Math.max(6, Math.round(med * 0.4)); }
        lv.elements.push(el2);
        lv.cellMap[py * W + px] = el2;
        guard[py * W + px] = 1;
        added++;
        want--;
      }
    }
    lv.enriched = added;
    return added;
  }
  /* 补元素用的 token 公式：尽量把这版新加的"创新运算"用上，
     而不是反复出现 x + 常数 */
  var TOKEN_LITE = [
    'x + digitSum(x) * 4',
    'chunk(x, 10) + 9',
    'x - mod(x, 7) + 13',
    'snap(x, 25) + 6',
    'floor(x / 3) + min(x, 60)',
    'max(x, 40) + 12',
    'chunk(x, 100) + tri(digitCount(x)) * 7',
    'x - mod(x, 9) + popcount(x) * 5',
    'sumRange(digitAt(x, 0), headDigit(x) + 4) + 10',
    'snap(x, 16) + median(digitSum(x), 3, 12) * 4',
    'chunk(x, 50) + if(isPrime(digitSum(x)), 26, 11)',
    'x - mod(x, 11) + nthPrime(mod(x, 9) + 1) * 3',
    'fold(x, 128) + chunk(x, 40)',
    'x + bitLen(x) * 6 - mod(x, 13)'
  ];
  /* 补元素用的用户条件：同样用上新函数（N 会被替换成按关卡数值规模算出的门槛） */
  var COND_LITE = [
    'x > N',
    '(x > N && isPrime(mod(x, 97)))',
    'popcount(x) > 5 || x > N',
    '(x % 7 == 3 && x > N) || digitSum(x) % 4 == 0',
    'chunk(x, 10) % 3 == 0 && x > N',
    'headDigit(x) >= 5 || x > N',
    'tri(digitCount(x)) > 3 && x > N',
    'x > N && (mod(x, 16) < 5 || isPrime(digitSum(x)))'
  ];

  /* ══ 每一幕的场地样式 ════════════════════════════════════════
     四幕沿着"下潜"的路线走：浅海 → 深海 → 海沟 → 热泉 → 深渊。
     配色只改观感，不影响任何数值与判定。
     ══════════════════════════════════════════════════════════ */
  var THEMES = {
    sea: { name: '浅海', void: '#0a1120', accent: '#7cc0ff', rooms: ['#2a3f66', '#2f4a3a', '#4a3a2f', '#33436b', '#3b4a5e'] },
    deep: { name: '深海', void: '#060c18', accent: '#5fa8e8', rooms: ['#22355c', '#1f3a4a', '#2c3450', '#243f5e', '#2a3048'] },
    trench: { name: '海沟', void: '#0c0a1c', accent: '#a98cff', rooms: ['#2b2450', '#3a2a5e', '#243055', '#332a52', '#2e2a48'] },
    vent: { name: '热泉', void: '#170a08', accent: '#ff9a5c', rooms: ['#4a2a24', '#3f2420', '#53301f', '#452a2e', '#3a2222'] },
    abyss: { name: '深渊', void: '#0b0714', accent: '#ff6b8a', rooms: ['#3a1c3e', '#2c1a44', '#43203a', '#33203f', '#2a1836'] }
  };
  function themeKeyFor(id) {
    if (id <= 6) return 'sea';
    if (id <= 12) return 'deep';
    if (id <= 18) return 'trench';
    if (id <= 24) return 'vent';
    return 'abyss';
  }

  /* ══ 算法解锁表：新函数必须先介绍，才能出现在关卡里 ══════════
     策划要求"前面没出现过的算法，不能没有介绍就出现在新关卡"。
     这张表规定每个函数**最早能在第几关出现**，校验器会强制检查；
     补元素工序也按它过滤（否则会把 isPrime 这种高级函数塞进第 1 关）。
     三幕节奏：1~12 基础关 / 13~24 算法关 / 25~36 算法 + 地图复杂度。
     ══════════════════════════════════════════════════════════ */
  var FUNC_SCHEDULE = {
    /* —— 第 1 关就有的基础运算 —— */
    min: 1, max: 1, abs: 1, floor: 1, ceil: 1, round: 1, sqrt: 1, sign: 1, pow: 1,
    clamp: 1, div: 1, mod: 1, gcd: 1, lcm: 1, digitSum: 1, digitCount: 1, reverseNum: 1,
    sumDigits: 1, if: 1,
    /* —— 第二幕（13 起）：整数技巧 —— */
    chunk: 13, snap: 13, ceilDiv: 13, digitAt: 13, headDigit: 13,
    /* —— 第二幕后段（19 起）：数列与统计 —— */
    sumRange: 19, tri: 19, median: 19, avg: 19,
    /* —— 第三幕（25 起）：数论与位运算 —— */
    fold: 25, collatz: 25, popcount: 25, bitLen: 25,
    isPrime: 25, nthPrime: 25, xor: 25, band: 25, bor: 25
  };
  var FUNC_DESC = {
    chunk: '抹零：chunk(1234,100)=1200', snap: '吸附：snap(107,25)=100',
    ceilDiv: '向上取整除法', digitAt: '第 i 位数字', headDigit: '最高位数字',
    sumRange: '等差数列求和', tri: '三角数：tri(6)=21',
    median: '三数取中', avg: '变参平均',
    fold: '折返：在 [0,n] 之间来回折', collatz: 'Collatz 一步：偶减半、奇 3x+1',
    popcount: '二进制里 1 的个数', bitLen: '二进制位数',
    isPrime: '质数判定', nthPrime: '第 k 个质数',
    xor: '按位异或', band: '按位与', bor: '按位或'
  };
  function introducedAt(levelId) {
    var out = {};
    Object.keys(FUNC_SCHEDULE).forEach(function (f) { if (FUNC_SCHEDULE[f] <= levelId) out[f] = true; });
    return out;
  }
  function newFuncsAt(levelId) {
    return Object.keys(FUNC_SCHEDULE).filter(function (f) { return FUNC_SCHEDULE[f] === levelId; });
  }

  /* ══ 房间尺寸：普通房间 5×5 ~ 10×10，特殊房间最多 15×15 ══════
     超限的房间按比例缩放进 5~10 区间（保持长宽比，所以大小仍有变化），
     元素坐标等比例跟着缩。标了 special 的房间放宽到 15×15。 */
  var ROOM_MAX = 10, ROOM_MIN = 5, ROOM_MAX_SPECIAL = 15;
  function clampRooms(spec) {
    var out = 0, scale = {};
    (spec.rooms || []).forEach(function (r) {
      if (!r.wh) return;
      var cap = r.special ? ROOM_MAX_SPECIAL : ROOM_MAX;
      var ow = r.wh[0], oh = r.wh[1];
      var long = Math.max(ow, oh);
      if (long <= cap && long >= ROOM_MIN) return;
      var f = long > cap ? cap / long : 1;
      if (long < ROOM_MIN) f = ROOM_MIN / long;          /* 太小的房间也撑到 5 */
      var w = Math.max(ROOM_MIN, Math.min(cap, Math.round(ow * f)));
      var h = Math.max(ROOM_MIN, Math.min(cap, Math.round(oh * f)));
      r.at = [r.at[0] + Math.floor((ow - w) / 2), r.at[1] + Math.floor((oh - h) / 2)];
      r.wh = [w, h];
      scale[r.id] = [w / ow, h / oh];
      out++;
    });
    /* 元素坐标也要跟着等比例缩 —— 否则原来按大房间摆的元素会全部掉到房间外，
       ensurePlaceable 虽然会兜底挪位，但几十个元素抢几个格子会挤成一团、甚至堵死路 */
    function rescale(at, s) {
      if (!at || !s) return at;
      return [
        Math.max(0, Math.min(ROOM_MAX_SPECIAL - 1, Math.round(at[0] * s[0]))),
        Math.max(0, Math.min(ROOM_MAX_SPECIAL - 1, Math.round(at[1] * s[1])))
      ];
    }
    (spec.elements || []).forEach(function (el) {
      if (!el.at || !scale[el.room]) return;
      el.at = rescale(el.at, scale[el.room]);
    });
    if (spec.start && spec.start.at && scale[spec.start.room]) {
      spec.start.at = rescale(spec.start.at, scale[spec.start.room]);
    }
    return out;
  }

  /* ══ 走廊口清场 ══════════════════════════════════════════════
     寻路默认把"没吃掉的特殊元素"当成障碍（否则会算错数值）。
     房间缩到 5×5~10×10 之后，走廊口那一格经常正好压着一个特殊元素，
     结果整间房都进不去 —— 求解器直接搜不到路。
     这里把压在走廊口上的元素挪到同房间的别的空格去。
     （门自己带着 corridor 数组，两端就是两个房间的进出口。）
     ══════════════════════════════════════════════════════════ */
  function clearCorridorMouths(lv) {
    var W = lv.w, H = lv.h, moved = 0;
    function freeIn(room, x0, y0) {
      for (var r = 2; r <= 6; r++) {
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            var x = x0 + dx, y = y0 + dy;
            if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
            var k = y * W + x;
            if (lv.tiles[k] !== M.FLOOR || lv.cellMap[k]) continue;
            if (room && M.roomAt(lv, x, y) !== room) continue;
            /* 别又挪到另一个走廊口上 */
            var onMouth = false;
            (lv.doors || []).forEach(function (d) {
              var p = d.corridor || [];
              if ((p[0] && p[0][0] === x && p[0][1] === y) ||
                  (p.length && p[p.length - 1][0] === x && p[p.length - 1][1] === y)) onMouth = true;
            });
            if (onMouth) continue;
            return [x, y];
          }
        }
      }
      return null;
    }
    (lv.doors || []).forEach(function (d) {
      var p = d.corridor || [];
      if (p.length < 2) return;
      [p[0], p[p.length - 1]].forEach(function (cell) {
        var k = cell[1] * W + cell[0];
        var el = lv.cellMap[k];
        if (!el || el.filler) return;
        var room = el.room ? lv.rooms.filter(function (r) { return r.id === el.room; })[0] : null;
        var spot = freeIn(room, el.x, el.y);
        if (!spot) return;
        delete lv.cellMap[k];
        el.x = spot[0]; el.y = spot[1];
        lv.cellMap[el.y * W + el.x] = el;
        moved++;
      });
    });
    lv.mouthsCleared = moved;
    return moved;
  }

  function buildSpec(spec) {    clampRooms(spec);                     /* 普通房间 5×5~10×10，特殊房间 ≤15×15 */
    var lv = M.buildLevel(spec);
    lv.freeform = !!spec.freeform;        /* 自由布局：走廊可交叠，校验改用"门是否卡在窄口" */
    var th = THEMES[themeKeyFor(spec.id)];
    lv.theme = th;
    lv.rooms.forEach(function (room, i) {
      if (!room.color) room.color = th.rooms[i % th.rooms.length];
    });
    /* buildLevel 和 spec 共享同一个 elements 数组，补元素只能做一次 ——
       否则重复构建会不断往数组里追加，两次构建的元素集合对不上，
       求解器给出的顺序里就会出现"地图上不存在"的 id。 */
    if (!spec.noEnrich && !spec._enriched && (spec.solution || []).length) { enrichLevel(lv); spec._enriched = true; }
    clearCorridorMouths(lv);              /* 走廊口不许有元素挡着（小房间尤其致命） */
    /* 这一关新解锁的算法，自动进开场介绍。
       注意是"本关真的用到了、而且按解锁表就该在本关解锁"的算法 ——
       不能只按解锁表广播：那会介绍一堆本关根本用不到的算法。 */
    var usedNow = {};
    lv.elements.forEach(function (el) {
      [el.expr, el.cond].forEach(function (s) {
        if (!s) return;
        var u = G.expr.funcsUsed(s);
        if (u) Object.keys(u).forEach(function (f) { usedNow[f] = true; });
      });
    });
    var nf = Object.keys(usedNow).filter(function (f) { return FUNC_SCHEDULE[f] === spec.id; });
    if (nf.length && !spec._funcIntro) {
      spec._funcIntro = true;
      spec.intro = (spec.intro || []).slice();
      spec.intro.push({
        key: 'l' + spec.id + '_funcs', new: true,
        title: '新算法：' + nf.join(' / '),
        icon: 'token',
        desc: nf.map(function (f) { return f + '() —— ' + (FUNC_DESC[f] || ''); }).join('；'),
        formula: nf.map(function (f) { return f + '(x)'; }).join('　')
      });
    }
    lv.autoTuneReport = V().resolveAutoReqs(lv);
    return lv;
  }

  function get(id) {
    if (cache[id]) return cache[id];
    var spec = specById(id);
    if (!spec) return null;
    var lv = buildSpec(spec);
    cache[id] = lv;
    return lv;
  }

  /** 强制重建（改了 spec 之后用） */
  function rebuild(id) {
    delete cache[id];
    return get(id);
  }

  /* ── 进度 ─────────────────────────────────────────────── */
  var progress = { cleared: {}, unlocked: 1 };

  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          progress.cleared = p.cleared || {};
          progress.unlocked = p.unlocked || 1;
        }
      }
    } catch (e) { /* file:// 或隐私模式，忽略 */ }
    return progress;
  }

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { }
  }

  function markCleared(id) {
    progress.cleared[id] = 1;
    var next = Math.min(count(), id + 1);
    if (next > progress.unlocked) progress.unlocked = next;
    save();
  }

  function unlockAll() {
    progress.unlocked = count();
    save();
  }

  function resetProgress() {
    progress.cleared = {};
    progress.unlocked = 1;
    save();
  }

  function isUnlocked(id) { return id <= progress.unlocked; }
  function isCleared(id) { return !!progress.cleared[id]; }
  function count() { return specs.length || refresh().length; }

  /** 校验全部关卡（开发面板用） */
  function checkAll() {
    refresh();
    return V().checkAll(specs, buildSpec);
  }

  G.levels = {
    refresh: refresh,
    specs: function () { return specs.length ? specs : refresh(); },
    specById: specById,
    get: get,
    buildSpec: buildSpec,        /* 工具链（solve / prune）也走同一条构建路径，保证和游戏一致 */
    funcSchedule: FUNC_SCHEDULE, /* 算法解锁表：校验器靠它强制"新算法必须先介绍" */
    newFuncsAt: newFuncsAt,
    rebuild: rebuild,
    count: count,
    progress: progress,
    load: load,
    save: save,
    markCleared: markCleared,
    unlockAll: unlockAll,
    resetProgress: resetProgress,
    isUnlocked: isUnlocked,
    isCleared: isCleared,
    checkAll: checkAll,
    buildSpec: buildSpec
  };

  refresh();
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
