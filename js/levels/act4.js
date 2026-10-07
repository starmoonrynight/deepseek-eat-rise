/* ─────────────────────────────────────────────────────────────
   act4.js —— 第 19~24 关（第四幕：房间 20~30 间的大图）
   ------------------------------------------------------------------
   第四幕规模上来了（单关 20~30 个房间），一行一个元素手写既长又容易错，
   所以这里用**参数化生成器**：每关只给一组参数（网格、房间尺寸、种子、
   门型池、条件池），房间/连线/元素由 buildAct4() 按种子确定性生成。

   难度增长点（对应策划要求）：
     · 房间数与房间面积继续加大（单房间 ≤ 50×50，单关房间 ≤ 30）
     · 一个房间联通多个房间：网格生成时除了"生成树"边，还额外加环边，
       所以枢纽房间会同时连着 3~4 个邻居
     · 一条路径上多道门：每关都插一批 4×4 中转屋，形成"门→屋→门"
     · 用户条件用复合逻辑 + 函数（min / abs / reverseNum / digitSum / mod）
     · 门运算用 min / max / if / mod / digitSum / gcd 的组合

   所有门的门槛都写 'auto'，由 tools/solve.mjs 搜出的最优解反推成极限数值。
   生成器只挑"物理下限很低"的门型，避免出现"门槛高到过不去"的死门。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';
  G.levelSpecs = G.levelSpecs || [];
  var L = G.levelKit;

  /* ── 确定性伪随机（同一 seed 每次生成同一张图） ───────────── */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  /* ── 门型池：写成"按关卡数值规模缩放"的构造函数 ─────────────
     门有硬约束：算完必须减少、而且不能把自己算死，所以每扇门都有一个
     "物理下限"。如果门的量级远大于这一关能凑出的数值，就会出现死门
     （求解器直接搜不到路）。所以池子里所有常数都乘 riceScale。 */
  var DOOR_POOL = [
    function (s) { return { op: 'sub', amount: Math.max(6, Math.round(12 * s)) }; },
    function (s) { return { op: 'sub', amount: Math.max(10, Math.round(22 * s)) }; },
    function (s) { return { op: 'sub', amount: Math.max(14, Math.round(34 * s)) }; },
    function (s) { return { op: 'sub', amount: Math.max(18, Math.round(48 * s)) }; },
    function () { return { op: 'div', divisor: 2 }; },
    function () { return { op: 'div', divisor: 3 }; },
    function (s) { return { op: 'expr', expr: 'x - mod(x, 13) - ' + Math.max(8, Math.round(16 * s)), label: '余数门' }; },
    function (s) { return { op: 'expr', expr: 'x - mod(x, 29) - ' + Math.max(12, Math.round(28 * s)), label: '余数门' }; },
    function (s) { return { op: 'expr', expr: 'x - digitSum(x) * 3 - ' + Math.max(8, Math.round(18 * s)), label: '数位门' }; },
    function (s) { return { op: 'expr', expr: 'x - gcd(x, 132) - ' + Math.max(10, Math.round(24 * s)), label: '公约门' }; },
    function (s) { return { op: 'expr', expr: 'min(x - ' + Math.max(12, Math.round(30 * s)) + ', floor(x / 2) + ' + Math.max(8, Math.round(20 * s)) + ')', label: 'min 门' }; },
    function (s) { return { op: 'expr', expr: 'max(x - ' + Math.max(20, Math.round(80 * s)) + ', floor(x / 4))', label: 'max 门' }; },
    function (s) { return { op: 'expr', expr: 'if(x > ' + Math.max(120, Math.round(400 * s)) + ', x - ' + Math.max(40, Math.round(150 * s)) + ', floor(x / 4) + ' + Math.max(6, Math.round(14 * s)) + ')', label: '分支门' }; },
    function (s) { return { op: 'expr', expr: 'min(x - ' + Math.max(20, Math.round(70 * s)) + ', max(floor(x / 2), ' + Math.max(10, Math.round(35 * s)) + '))', label: '嵌套门' }; }
  ];

  /* ── 条件池：从简单到复合 ─────────────────────────────────── */
  var COND_POOL = [
    { cond: '(x % 4 == 3 && x > 8)', bonus: 25, penalty: 30 },
    { cond: '(x % 5 != 2 || mod(x, 30) < 12)', bonus: 34, penalty: 21 },
    { cond: '(x > 60 && x < 240) || x % 7 == 0', bonus: 48, penalty: 42 },
    { cond: '!(x > 900) && x % 9 == 0', bonus: 62, penalty: 55 },
    { cond: 'min(x, 500) > 260 && x % 8 != 6', bonus: 78, penalty: 68 },
    { cond: '(x % 12 == 9 && x > 300) || x > 1500', bonus: 95, penalty: 82 },
    { cond: 'digitSum(x) % 4 == 1 && x > 700', bonus: 110, penalty: 96 },
    { cond: 'max(x, 800) > 1400 && mod(x, 11) < 4', bonus: 130, penalty: 115 },
    { cond: 'reverseNum(x) % 5 == 0 && x > 1200', bonus: 150, penalty: 130 },
    { cond: 'abs(x - 2000) < 900 || x % 13 == 5', bonus: 175, penalty: 150 },
    { cond: '(x % 16 == 11 && x > 2000) || x > 6000', bonus: 200, penalty: 175 },
    { cond: 'min(x, 3000) > 1800 && digitSum(x) % 3 == 0', bonus: 230, penalty: 200 }
  ];

  var TOKEN_POOL = [
    'x + digitSum(x) * 6',
    'x - mod(x, 17) + 22',
    'max(x, 90) + 26',
    'floor(x / 3) + min(x, 180)',
    'x + digitSum(x) * 11',
    'floor(x / 4) + min(x, 320)',
    'max(x, 600) + 55',
    'x - mod(x, 23) + 70'
  ];

  /* ── 生成一关 ─────────────────────────────────────────────── */
  function buildAct4(p) {
    var r = rng(p.seed);
    var cols = [], rows = [], i, j;
    for (i = 0; i < p.grid[0]; i++) cols.push(2 + i * (p.wh[0] + p.gap));
    for (j = 0; j < p.grid[1]; j++) rows.push(2 + j * (p.wh[1] + p.gap));
    var N = p.grid[0] * p.grid[1];

    /* 房间：网格铺开，形状按行列轮换，起点/终点房间固定形状 */
    var SHAPES = ['rect', 'round', 'rect', 'plus', 'rect', 'diamond'];
    var rooms = [];
    var free = !!p.freeform;
    for (j = 0; j < p.grid[1]; j++) {
      for (i = 0; i < p.grid[0]; i++) {
        var id = 'r' + (j * p.grid[0] + i);
        var shape = (id === 'r0') ? 'rect' : pick(r, SHAPES);
        /* 自由布局：房间不再严格对齐成矩形阵列，各自抖一下（±2，
           小于间距的一半，保证不会贴到一起） */
        var jx = free ? (Math.floor(r() * 5) - 2) : 0;
        var jy = free ? (Math.floor(r() * 5) - 2) : 0;
        var wh = p.wh.slice();
        if (p.whJitter) wh = [wh[0] + Math.floor(r() * 5) - 2, wh[1] + Math.floor(r() * 5) - 2];
        var rm = { id: id, name: '区' + (j + 1) + '-' + (i + 1), shape: shape, at: [cols[i] + jx, rows[j] + jy], wh: wh };
        if (shape === 'round') rm.k = 3 + Math.floor(r() * 3);
        rooms.push(rm);
      }
    }

    /* 连线：先生成树（右邻 + 下邻）保证连通，再补环边让房间多连通 */
    var links = [], used = {};
    function addLink(a, b, idx) {
      if (a === b) return;
      var key = a < b ? (a + '|' + b) : (b + '|' + a);   /* 排序去重：枢纽之间会双向连 */
      if (used[key]) return;
      used[key] = true;
      var t = DOOR_POOL[(idx + p.doorBias) % DOOR_POOL.length]((p.riceScale || 1) * (p.doorScale || 1));
      var o = { op: t.op, label: t.label || '中转站门' };
      if (t.amount !== undefined) o.amount = t.amount;
      if (t.divisor !== undefined) o.divisor = t.divisor;
      if (t.expr) o.expr = t.expr;
      links.push(L.link(a, b, o));
    }
    /* 只连"右邻 + 下邻"：这样得到一棵网格生成树 ——
       内部房间天然同时连着左/右/上/下最多 4 个邻居（满足"一个房间联通多个房间"），
       又不会出现环。一旦有环，某扇门去掉之后两个房间还绕着连着，
       就违反了"每扇门必须隔开它连接的两个房间"这条规则。 */
    var k = 0;
    /* 中心枢纽：挑几个靠中间的房间当枢纽，把周围两圈内的房间直接连过去。
       自由布局下走廊允许交叠、允许绕行，所以一个房间可以同时挂七八条连线。 */
    (p.hubs || []).forEach(function (hid) {
      var hx = hid % p.grid[0], hy = Math.floor(hid / p.grid[0]);
      for (var jj = 0; jj < p.grid[1]; jj++) {
        for (var ii = 0; ii < p.grid[0]; ii++) {
          var dd = Math.abs(ii - hx) + Math.abs(jj - hy);
          if (dd < 1 || dd > (p.hubReach || 2)) continue;
          addLink('r' + (jj * p.grid[0] + ii), 'r' + hid, k++);
        }
      }
    });
    for (j = 0; j < p.grid[1]; j++) {
      for (i = 0; i < p.grid[0]; i++) {
        var here = 'r' + (j * p.grid[0] + i);
        if (i + 1 < p.grid[0]) addLink(here, 'r' + (j * p.grid[0] + i + 1), k++);
        if (j + 1 < p.grid[1]) addLink(here, 'r' + ((j + 1) * p.grid[0] + i), k++);
      }
    }

    /* 元素：每个房间 1~2 个（大房间的空旷部分交给填充白饭撑密度） */
    /* 基础条件池：只用第 1 关就解锁的算法 —— 重建"基础关"时必须用这个，
       否则会违反"新算法必须先介绍"的规则 */
    var COND_BASIC = [
      { cond: 'x > N', bonus: 30 },
      { cond: '(x % 4 == 3 && x > N)', bonus: 45 },
      { cond: 'mod(x, 9) == 0 || x > N', bonus: 60 },
      { cond: 'digitSum(x) % 3 == 0 && x > N', bonus: 80 },
      { cond: 'reverseNum(x) % 2 == 0 && x > N', bonus: 100 }
    ];
    var condPool = (p.basic ? COND_BASIC : COND_POOL);
    var table = {}, condBase = p.condBias || 0;
    var riceScale = p.riceScale || 1;
    for (i = 0; i < rooms.length; i++) {
      var rid = rooms[i].id;
      var list = [];
      var roll = r();
      if (roll < 0.34) {
        list.push(['claude', 2 + Math.floor(r() * 3)]);
        list.push(['rice', Math.round((18 + r() * 40) * riceScale)]);
      } else if (roll < 0.62) {
        var c = condPool[(condBase + i) % condPool.length];
        /* 惩罚值只取奖励的一小部分：沿途顺手吃掉的白饭会让数值浮动，
           条件有可能被"顶翻"，惩罚必须小到不会把大肥鱼直接扣死。 */
        list.push(['user', c.cond, c.bonus, Math.max(6, Math.round(c.bonus * 0.22))]);
      } else if (roll < 0.82) {
        list.push(['token', TOKEN_POOL[(condBase + i) % TOKEN_POOL.length]]);
        list.push(['rice', Math.round((12 + r() * 30) * riceScale)]);
      } else {
        list.push(['rice', Math.round((40 + r() * 70) * riceScale)]);
        if (r() < 0.5) list.push(['bowl', Math.round((10 + r() * 25) * riceScale)]);
      }
      table[rid] = list;
    }
    /* 起点房间多给一点，终点房间放终点格 */
    table['r0'] = [['rice', Math.round(20 * riceScale)], ['rice', Math.round(32 * riceScale)]];
    var lastId = 'r' + (N - 1);
    table[lastId] = (table[lastId] || []).concat(p.hidden ? [['hidden', '唯一出路']] : [['goal']]);

    return {
      id: p.id, name: p.name, subtitle: p.subtitle, tier: p.tier,
      size: [cols[cols.length - 1] + p.wh[0] + 2, rows[rows.length - 1] + p.wh[1] + 2],
      sizeClass: '>75x75', seed: p.seed,
      freeform: !!p.freeform,
      noEnrich: !!p.noEnrich,
      hint: p.hint,
      intro: p.intro,
      tips: p.tips,
      fill: { type: 'rice', value: 1, density: p.density || 0.14, clearance: 1 },
      rooms: rooms,
      links: links,
      elements: L.autoEls(rooms, table),
      start: { room: 'r0', at: [2, 2] },
      solution: p.solution || []
    };
  }

  /* ═══ 第 19 关 · 条件迷宫 ═══════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 19, name: '条件迷宫', subtitle: '第四幕 · 迷宫', tier: '迷宫',
    grid: [5, 4], wh: [20, 18], gap: 6, seed: 19019, riceScale: 1,
    doorBias: 0, condBias: 0, density: 0.14, solution: [
      'r0_rice2', 'door_r0_r1', 'r1_rice1', 'door_r1_r6', 'r6_rice1', 'r0_rice1', 'r1_claude1', 'r6_claude1',
      'door_r1_r2', 'r2_claude1', 'door_r6_r7', 'r7_claude1', 'door_r7_r12', 'r12_claude1', 'door_r12_r13',
      'door_r8_r13', 'r8_claude1', 'door_r13_r18', 'door_r18_r19', 'r19_claude1', 'door_r3_r8', 'door_r3_r4',
      'r4_token1', 'r18_rice1', 'door_r11_r12', 'r11_user1', 'r13_user1', 'door_r8_r9', 'r9_user1',
      'door_r0_r5', 'r5_user1', 'r8_rice1', 'r4_rice1', 'r2_rice1', 'r3_rice1', 'r19_rice1', 'door_r17_r18',
      'r17_rice1', 'r17_token1', 'r7_rice1', 'door_r16_r17', 'r16_user1', 'r12_rice1', 'r18_bowl1',
      'r19_goal1'
    ],
    hint: '20 个房间，每个房间的条件都不一样：先算真假，再决定吃不吃',
    intro: [
      { key: 'l19_scale', new: true, title: '新规模：20 房间', icon: 'door',
        desc: '地图铺成 5×4：横向走廊 + 纵向走廊 + 环边，枢纽房间同时连着 3~4 个邻居。',
        formula: '5 × 4 = 20 间' },
      { key: 'l19_cond', new: true, title: '条件池', icon: 'user',
        desc: '用户条件按房间轮换，从 (x % 4 == 3 && x > 8) 一路到 min(x, 3000) > 1800。',
        formula: '复合条件 + 函数' }
    ],
    tips: ['先沿着环边把倍率拿到手，再回头吃大额白饭', '不是每个房间都要进：门开了才是通路', '条件要算两遍——算函数值，再比大小']
  }));

  /* ═══ 第 20 关 · 长链回廊 ═══════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 20, name: '长链回廊', subtitle: '第四幕 · 迷宫', tier: '迷宫',
    grid: [6, 4], wh: [18, 16], gap: 6, seed: 20020, riceScale: 1.2,
    doorBias: 3, condBias: 2, density: 0.14, solution: [
      'r0_rice1', 'door_r0_r6', 'r0_rice2', 'door_r6_r7', 'r7_rice1', 'door_r7_r13', 'door_r13_r19',
      'r19_user1', 'r6_claude1', 'door_r19_r20', 'r20_claude1', 'door_r18_r19', 'r18_claude1', 'r18_rice1',
      'door_r7_r8', 'door_r2_r8', 'r2_token1', 'r8_user1', 'door_r2_r3', 'r3_claude1', 'door_r3_r4',
      'door_r4_r10', 'r10_claude1', 'door_r9_r10', 'r9_user1', 'door_r10_r16', 'r16_claude1', 'r20_rice1',
      'door_r4_r5', 'r5_user1', 'r4_user1', 'r3_rice1', 'r6_rice1', 'r10_rice1', 'door_r6_r12', 'r12_user1',
      'r2_rice1', 'r16_rice1', 'door_r14_r20', 'r14_rice1', 'door_r14_r15', 'r15_token1', 'door_r16_r22',
      'r15_rice1', 'r22_user1', 'door_r21_r22', 'r21_rice1', 'r13_user1', 'door_r1_r7', 'door_r10_r11',
      'r11_rice1', 'door_r22_r23', 'r23_user1', 'door_r17_r23', 'r1_user1', 'r17_user1', 'r23_goal1'
    ],
    hint: '24 个房间排成长链：环边让你能抄近路，但近路往往亏数值',
    intro: [
      { key: 'l20_chain', new: true, title: '新拓扑：长链 + 环边', icon: 'door',
        desc: '6×4 的长链结构，斜向环边把远端房间接起来。抄近路会少吃饭，绕远路会把数值顶高。',
        formula: '6 × 4 = 24 间' }
    ],
    tips: ['两条路摆在面前时，先估算哪条留下的数值更适合下一道门', '门的门槛是极限值：能过就过，别为了多吃一碗饭卡在门口', '中转屋形成的双门走廊，进去前要连算两道门']
  }));

  /* ═══ 第 21 关 · 方格高塔 ═══════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 21, name: '方格高塔', subtitle: '第四幕 · 高塔', tier: '高塔',
    grid: [5, 5], wh: [20, 18], gap: 6, seed: 21021, riceScale: 1.5,
    doorBias: 6, condBias: 3, density: 0.14, solution: [
      'r0_rice2', 'r0_rice1', 'door_r0_r1', 'door_r1_r6', 'door_r6_r11', 'r1_rice1', 'r6_user1', 'r11_rice1',
      'r11_claude1', 'door_r6_r7', 'r7_claude1', 'door_r7_r12', 'r12_claude1', 'door_r12_r13', 'r13_claude1',
      'door_r12_r17', 'door_r16_r17', 'r16_claude1', 'r7_rice1', 'door_r5_r6', 'r17_token1', 'door_r5_r10',
      'r10_claude1', 'r13_rice1', 'door_r16_r21', 'r5_rice1', 'r21_token1', 'door_r17_r18', 'r18_rice1',
      'r12_rice1', 'door_r20_r21', 'r20_rice1', 'door_r21_r22', 'r22_rice1', 'r10_rice1', 'r16_rice1',
      'r22_bowl1', 'r21_rice1', 'door_r13_r14', 'r14_rice1', 'r14_bowl1', 'r17_rice1', 'door_r15_r20',
      'r15_user1', 'r5_bowl1', 'door_r9_r14', 'door_r4_r9', 'r4_rice1', 'r4_claude1', 'r1_bowl1', 'r9_user1',
      'door_r22_r23', 'door_r8_r9', 'r23_user1', 'r8_rice1', 'r20_bowl1', 'door_r23_r24', 'r24_goal1'
    ],
    hint: '25 个房间铺成正方形：从最外圈绕，还是直接穿中间？',
    intro: [
      { key: 'l21_square', new: true, title: '新拓扑：方格城', icon: 'door',
        desc: '5×5 正方布局，每个内部房间都连着 4 个邻居。路线可以绕圈，也可以直插中心。',
        formula: '5 × 5 = 25 间' },
      { key: 'l21_scale', new: true, title: '数值量级', icon: 'token',
        desc: '这一关的数值会到五位数，token 的改写公式要按新量级重新估。',
        formula: 'floor(x / 4) + min(x, 320)' }
    ],
    tips: ['直插中心最短，但会把倍率吃在错误的时机', '外部走廊的白饭最便宜，拿来垫门槛正好', '算不过来就按 V 看校验面板里的最优路线']
  }));

  /* ═══ 第 22 关 · 三十间 ═════════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 22, name: '三十间', subtitle: '第四幕 · 高塔', tier: '高塔',
    grid: [6, 5], wh: [18, 16], gap: 6, seed: 22022, riceScale: 1.8,
    doorBias: 9, condBias: 5, density: 0.13, solution: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r2', 'r1_rice1', 'door_r2_r8', 'door_r8_r9', 'r9_token1',
      'door_r3_r9', 'r3_claude1', 'door_r9_r10', 'door_r10_r16', 'r16_claude1', 'door_r16_r17',
      'r17_claude1', 'door_r16_r22', 'door_r21_r22', 'r21_claude1', 'door_r21_r27', 'r27_claude1',
      'door_r22_r23', 'r23_claude1', 'door_r27_r28', 'door_r28_r29', 'r29_claude1', 'r21_rice1',
      'door_r10_r11', 'r11_token1', 'r2_user1', 'r11_rice1', 'r28_user1', 'r29_rice1', 'r23_rice1',
      'r9_rice1', 'r3_rice1', 'r16_rice1', 'r8_rice1', 'door_r15_r16', 'r15_rice1', 'door_r3_r4', 'r4_rice1',
      'r17_rice1', 'r27_rice1', 'r4_token1', 'r0_rice1', 'door_r7_r8', 'r7_rice1', 'door_r6_r7', 'r6_user1',
      'door_r7_r13', 'r13_user1', 'r7_bowl1', 'door_r13_r19', 'r19_token1', 'door_r18_r19', 'r18_user1',
      'r1_bowl1', 'door_r6_r12', 'r12_rice1', 'r12_bowl1', 'door_r14_r15', 'r14_rice1', 'door_r4_r5',
      'r5_rice1', 'door_r19_r20', 'r20_token1', 'r19_rice1', 'r20_rice1', 'door_r19_r25', 'r25_rice1',
      'r25_token1', 'r29_goal1'
    ],
    hint: '房间数顶到上限 30：不可能全吃，必须一路做减法',
    intro: [
      { key: 'l22_max', new: true, title: '规模上限：30 间', icon: 'door',
        desc: '单关房间数按策划要求顶到 30。全图 30 间、几十扇门，靠穷举是走不完的 —— 要挑路线。',
        formula: '6 × 5 = 30 间' }
    ],
    tips: ['30 间全吃完是不可能的：只吃"过门缺口"那部分', '高价值白饭一律留到倍率之后', '走错了就重开，这一关不值得硬救']
  }));

  /* ═══ 第 23 关 · 环形深处 ═══════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 23, name: '环形深处', subtitle: '第四幕 · 深处', tier: '深处',
    grid: [5, 6], wh: [22, 18], gap: 6, seed: 23031, riceScale: 1.7,
    doorBias: 12, condBias: 7, density: 0.13, solution: [
      'r0_rice1', 'door_r0_r1', 'r0_rice2', 'door_r1_r6', 'r6_rice1', 'door_r6_r11', 'door_r11_r12',
      'r12_rice1', 'r6_claude1', 'r11_claude1', 'door_r12_r13', 'r13_claude1', 'door_r10_r11', 'r10_claude1',
      'door_r10_r15', 'r15_claude1', 'door_r1_r2', 'door_r2_r3', 'r3_claude1', 'door_r13_r18',
      'door_r18_r19', 'r19_claude1', 'door_r5_r6', 'r18_rice1', 'r15_rice1', 'r5_claude1', 'door_r17_r18',
      'r17_token1', 'r17_rice1', 'r2_token1', 'r19_rice1', 'r10_rice1', 'r5_rice1', 'r13_rice1', 'r11_rice1',
      'door_r17_r22', 'r22_rice1', 'door_r15_r16', 'r16_user1', 'door_r16_r21', 'r21_token1', 'door_r21_r26',
      'r26_claude1', 'r1_user1', 'r21_rice1', 'door_r20_r21', 'r20_rice1', 'door_r25_r26', 'r25_rice1',
      'r26_rice1', 'r25_bowl1', 'r3_rice1', 'door_r26_r27', 'r27_rice1', 'r2_rice1', 'r27_token1',
      'r12_bowl1', 'door_r27_r28', 'r28_rice1', 'door_r13_r14', 'r14_rice1', 'door_r9_r14', 'door_r4_r9',
      'r9_rice1', 'r4_user1', 'r14_bowl1', 'r22_bowl1', 'r9_token1', 'door_r6_r7', 'door_r5_r10',
      'door_r8_r13', 'r8_user1', 'door_r12_r17', 'r7_user1', 'door_r20_r25', 'door_r2_r7', 'door_r7_r8',
      'door_r22_r23', 'r23_claude1', 'door_r23_r24', 'r24_user1', 'r23_rice1', 'door_r24_r29', 'r29_rice1',
      'r29_goal1'
    ],
    hint: '房间更大、条件更毒：先算清楚每道门出来剩多少再动',
    intro: [
      { key: 'l23_big', new: true, title: '大房间', icon: 'rice',
        desc: '单个房间放大到 22×18（仍远低于 50×50 上限），房间里能塞下更多复杂元素。',
        formula: '单间 22 × 18' },
      { key: 'l23_cond', new: true, title: '毒条件', icon: 'user',
        desc: '用户条件开始用 reverseNum / abs 这类"看着像奖励、算错就亏"的写法。',
        formula: 'abs(x − 2000) < 900 || x % 13 == 5' }
    ],
    tips: ['条件里带 abs 的先找区间中点', 'reverseNum 只看数位，不看大小', '大房间里白饭多，别一次吃光']
  }));

  /* ═══ 第 24 关 · 地狱中枢 ═══════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 24, name: '地狱中枢', subtitle: '第四幕 · 终章', tier: '终章',
    grid: [6, 5], wh: [22, 18], gap: 6, seed: 24033, riceScale: 1.9,
    doorBias: 15, condBias: 9, density: 0.13, hidden: true, solution: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r7', 'r7_rice1', 'r0_rice1', 'r7_claude1', 'door_r7_r8',
      'r8_claude1', 'door_r8_r14', 'r14_claude1', 'door_r14_r15', 'r15_claude1', 'door_r15_r16',
      'r16_claude1', 'r1_user1', 'door_r15_r21', 'r21_claude1', 'door_r14_r20', 'door_r20_r26',
      'r26_claude1', 'r20_user1', 'door_r19_r20', 'r19_rice1', 'r14_rice1', 'r26_rice1', 'r21_rice1',
      'door_r19_r25', 'r25_user1', 'r15_rice1', 'r16_rice1', 'r8_rice1', 'door_r10_r16', 'r10_rice1',
      'r10_bowl1', 'door_r10_r11', 'r11_rice1', 'door_r0_r6', 'r6_rice1', 'r6_token1', 'door_r18_r19',
      'r18_rice1', 'r18_bowl1', 'door_r18_r24', 'r24_rice1', 'door_r7_r13', 'r13_rice1', 'r24_bowl1',
      'door_r12_r13', 'r12_rice1', 'door_r8_r9', 'r9_rice1', 'r9_token1', 'door_r3_r9', 'r13_bowl1',
      'r3_user1', 'door_r3_r4', 'r4_rice1', 'r4_claude1', 'door_r21_r22', 'r22_rice1', 'door_r22_r23',
      'r23_rice1', 'r22_bowl1', 'r23_bowl1', 'door_r23_r29', 'r29_claude1', 'door_r16_r17', 'door_r4_r5',
      'r17_rice1', 'r5_token1', 'door_r2_r8', 'r5_rice1', 'r2_rice1', 'r29_rice1', 'r29_hidden1'
    ],
    hint: '没有终点门：把数值堆到最高，藏在最深处的那一格才会浮出来',
    intro: [
      { key: 'l24_hidden', new: true, title: '终章：隐藏出口', icon: 'hidden',
        desc: '30 间房的最后一间没有终点门，只有一块隐藏通关格：数值堆够高它才会显形。',
        formula: '数值 ≥ 显形门槛' },
      { key: 'l24_all', new: true, title: '全部机制齐上', icon: 'door',
        desc: '嵌套门、复合条件、多门走廊、四通枢纽、隐藏格 —— 前面学过的全部叠在一起。',
        formula: '6 × 5 = 30 间 · 单间 22 × 18' }
    ],
    tips: ['先绕外圈把倍率吃满，再往里推', '隐藏格的显形门槛就是通关门槛：差一点都白跑', '算不动了就按 V 看最优路线对照']
  }));

  /* ═══════════════════════════════════════════════════════════
     第 25~36 关 · 第五幕：自由布局 + 中心枢纽
     ─────────────────────────────────────────────────────────
     场地规则变了（对应策划第 5 条）：
       · 房间不再排成方阵：每间各自抖动 ±2，宽高也各自浮动（10~14，仍 ≤15×15）
       · 走廊允许 Z 形拐弯、允许互相交叠（map.js 的 pathBetweenZ + freeform 模式）
       · 门只落在走廊"窄口"上 —— 交叉口四面都通，放门等于没门
       · 中心枢纽：抽几个靠中间的房间当枢纽，两圈以内的房间直接连过去，
         一间能挂 6~8 条连线
     ═══════════════════════════════════════════════════════════ */
  var ACT5 = [
    { id: 25, name: '碎岛', grid: [4, 3], seed: 25025, riceScale: 2.0, hubs: [5], doorBias: 1, condBias: 1, sol: [
      'r0_rice1', 'door_r0_r1', 'door_r1_r5', 'door_r5_r9', 'r1_rice1', 'r0_rice2', 'door_r9_r10',
      'r10_rice1', 'r1_claude1', 'door_r10_r11', 'r11_token1', 'r10_claude1', 'door_r7_r11', 'r7_claude1',
      'door_r8_r9', 'r8_rice1', 'r7_rice1', 'r9_user1', 'door_r3_r7', 'r3_rice1', 'r3_bowl1', 'door_r4_r8',
      'r4_user1', 'r11_rice1', 'r8_token1', 'r5_user1', 'door_r6_r7', 'r6_user1', 'door_r2_r6', 'r2_rice1',
      'r11_goal1'
    ] },
    { id: 26, name: '回旋', grid: [4, 4], seed: 26026, riceScale: 2.2, hubs: [5, 10], doorBias: 3, condBias: 2, sol: [
      'r0_rice1', 'door_r0_r4', 'door_r4_r8', 'r8_rice1', 'door_r8_r12', 'r12_token1', 'r4_rice1',
      'r12_rice1', 'r4_claude1', 'r8_claude1', 'door_r8_r9', 'r9_claude1', 'door_r0_r1', 'door_r1_r5',
      'r5_claude1', 'door_r5_r6', 'door_r2_r6', 'r2_claude1', 'door_r2_r3', 'r3_claude1', 'r1_rice1',
      'r6_rice1', 'r3_rice1', 'door_r6_r10', 'r10_token1', 'door_r6_r7', 'r7_rice1', 'r2_rice1', 'r10_rice1',
      'r0_rice2', 'door_r10_r14', 'r5_rice1', 'r14_rice1', 'r9_rice1', 'r14_token1', 'door_r7_r11',
      'door_r11_r15', 'r15_user1', 'r11_user1', 'r15_goal1'
    ] },
    { id: 27, name: '蛛网', grid: [5, 3], seed: 27027, riceScale: 2.4, hubs: [7], doorBias: 5, condBias: 3, sol: [
      'r0_rice1', 'door_r0_r1', 'r1_rice1', 'door_r1_r6', 'door_r6_r11', 'r11_token1', 'r1_bowl1',
      'r6_claude1', 'door_r1_r2', 'r2_claude1', 'door_r6_r7', 'r7_claude1', 'door_r2_r3', 'door_r3_r8',
      'r8_claude1', 'r3_rice1', 'door_r3_r4', 'r4_claude1', 'r0_rice2', 'door_r8_r9', 'r9_token1',
      'r2_rice1', 'r7_rice1', 'r4_rice1', 'door_r9_r14', 'r14_claude1', 'door_r8_r13', 'door_r12_r13',
      'r13_token1', 'r12_rice1', 'r13_rice1', 'r9_rice1', 'r6_rice1', 'r12_token1', 'r14_rice1', 'r11_rice1',
      'door_r10_r11', 'r10_user1', 'r8_rice1', 'r3_bowl1', 'r14_goal1'
    ] },
    { id: 28, name: '十字心', grid: [5, 4], seed: 28028, riceScale: 2.6, hubs: [7, 12], doorBias: 7, condBias: 4, sol: [
      'r0_rice2', 'r0_rice1', 'door_r0_r1', 'door_r1_r2', 'door_r1_r6', 'r2_token1', 'r1_rice1',
      'r1_claude1', 'r6_claude1', 'door_r2_r7', 'r7_claude1', 'door_r7_r12', 'r12_claude1', 'door_r12_r17',
      'r17_claude1', 'door_r16_r17', 'r16_claude1', 'door_r12_r13', 'door_r13_r14', 'r14_claude1',
      'door_r17_r18', 'door_r18_r19', 'r19_claude1', 'r18_rice1', 'door_r7_r8', 'r8_claude1', 'r13_rice1',
      'r16_rice1', 'r14_rice1', 'r17_rice1', 'r8_rice1', 'r12_rice1', 'r7_rice1', 'r19_rice1',
      'door_r11_r16', 'r11_token1', 'r2_rice1', 'r11_rice1', 'door_r3_r8', 'r3_user1', 'door_r5_r6',
      'r5_rice1', 'r6_rice1', 'r18_bowl1', 'door_r5_r10', 'r10_rice1', 'r10_bowl1', 'door_r15_r16',
      'r15_user1', 'door_r8_r9', 'door_r4_r9', 'r4_rice1', 'r9_rice1', 'r5_token1', 'r4_token1', 'r19_goal1'
    ] },
    { id: 29, name: '碎镜', grid: [6, 3], seed: 29029, riceScale: 2.8, hubs: [7, 8], doorBias: 9, condBias: 5, sol: [
      'r0_rice1', 'door_r0_r1', 'door_r1_r2', 'r0_rice2', 'door_r2_r3', 'r1_token1', 'r2_rice1',
      'r3_claude1', 'door_r1_r7', 'r7_claude1', 'door_r2_r8', 'door_r8_r14', 'r14_claude1', 'door_r6_r7',
      'r6_user1', 'r14_rice1', 'r3_rice1', 'r1_rice1', 'r8_user1', 'door_r3_r4', 'r4_user1', 'door_r7_r13',
      'r13_user1', 'door_r4_r5', 'r5_rice1', 'door_r6_r12', 'r7_rice1', 'r2_bowl1', 'door_r3_r9', 'r9_user1',
      'r12_rice1', 'door_r9_r10', 'door_r10_r16', 'r16_rice1', 'r16_claude1', 'door_r15_r16', 'r15_claude1',
      'door_r16_r17', 'r17_claude1', 'r15_rice1', 'r17_rice1', 'door_r10_r11', 'r12_token1', 'r11_user1',
      'r17_goal1'
    ] },
    { id: 30, name: '深网', grid: [6, 4], seed: 30030, riceScale: 3.0, hubs: [8], doorBias: 11, condBias: 6, sol: [
      'r0_rice1', 'door_r0_r1', 'r0_rice2', 'door_r1_r7', 'door_r7_r8', 'r8_token1', 'r8_rice1', 'r7_rice1',
      'r7_claude1', 'door_r7_r13', 'r13_claude1', 'door_r2_r8', 'r1_user1', 'door_r2_r3', 'r3_rice1',
      'door_r13_r14', 'r2_rice1', 'r14_token1', 'door_r14_r15', 'r15_rice1', 'door_r15_r16', 'r16_rice1',
      'door_r3_r4', 'r4_rice1', 'door_r4_r10', 'r10_rice1', 'r16_bowl1', 'r13_rice1', 'r10_token1',
      'r15_bowl1', 'door_r16_r22', 'r22_user1', 'door_r22_r23', 'r23_user1', 'r14_rice1', 'door_r17_r23',
      'r17_user1', 'door_r13_r19', 'r19_rice1', 'door_r10_r11', 'r11_user1', 'r4_token1', 'door_r5_r11',
      'r5_user1', 'door_r18_r19', 'door_r12_r18', 'r18_rice1', 'r19_token1', 'r18_token1', 'r12_rice1',
      'r12_token1', 'r23_goal1'
    ] },
    { id: 31, name: '枢纽城', grid: [6, 5], seed: 31031, riceScale: 3.2, hubs: [8, 17], doorBias: 0, condBias: 7, sol: [
      'r0_rice2', 'door_r0_r1', 'r1_rice1', 'door_r1_r7', 'r7_rice1', 'r1_bowl1', 'r7_claude1', 'door_r0_r6',
      'r6_claude1', 'door_r7_r13', 'door_r13_r19', 'r19_claude1', 'door_r19_r25', 'r25_claude1',
      'door_r24_r25', 'door_r18_r24', 'r18_claude1', 'r13_token1', 'r24_rice1', 'r19_rice1', 'r6_rice1',
      'r25_rice1', 'door_r19_r20', 'r18_rice1', 'r24_bowl1', 'r13_rice1', 'door_r20_r21', 'r21_token1',
      'door_r21_r22', 'r22_user1', 'door_r22_r28', 'r28_claude1', 'door_r28_r29', 'door_r23_r29',
      'r23_rice1', 'r28_rice1', 'r23_claude1', 'door_r15_r21', 'r15_user1', 'door_r15_r16', 'door_r10_r16',
      'r16_user1', 'door_r4_r10', 'r4_rice1', 'r10_user1', 'r4_claude1', 'door_r4_r5', 'r5_claude1',
      'r5_rice1', 'door_r3_r4', 'door_r1_r2', 'r0_rice1', 'r2_user1', 'r3_user1', 'r21_rice1', 'door_r3_r9',
      'r9_user1', 'door_r25_r26', 'r26_user1', 'door_r16_r17', 'door_r12_r18', 'r17_user1', 'r12_user1',
      'door_r11_r17', 'r20_user1', 'r29_user1', 'r11_user1', 'r29_goal1'
    ] },
    { id: 32, name: '乱流', grid: [7, 4], seed: 32032, riceScale: 3.4, hubs: [9, 17], doorBias: 2, condBias: 8, sol: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r8', 'door_r8_r15', 'r8_rice1', 'r15_rice1', 'r8_claude1',
      'r1_claude1', 'r15_claude1', 'door_r15_r16', 'r16_claude1', 'door_r14_r15', 'door_r14_r21',
      'r21_claude1', 'door_r15_r22', 'r22_claude1', 'door_r22_r23', 'door_r23_r24', 'r24_claude1',
      'door_r24_r25', 'r25_claude1', 'door_r17_r24', 'r17_claude1', 'r14_user1', 'door_r10_r17',
      'r10_claude1', 'r10_rice1', 'door_r3_r10', 'r3_user1', 'r25_rice1', 'r17_rice1', 'r16_rice1',
      'r23_token1', 'r21_rice1', 'r24_rice1', 'r1_rice1', 'r22_rice1', 'r0_rice1', 'door_r18_r25',
      'r18_rice1', 'door_r10_r11', 'r11_rice1', 'door_r11_r12', 'r12_rice1', 'r12_claude1', 'door_r18_r19',
      'r19_rice1', 'r19_claude1', 'r23_rice1', 'door_r12_r13', 'r13_user1', 'door_r6_r13', 'r6_user1',
      'door_r9_r16', 'r9_rice1', 'door_r2_r3', 'r2_rice1', 'r9_token1', 'door_r25_r26', 'r26_rice1',
      'r2_token1', 'r26_token1', 'door_r4_r11', 'r4_user1', 'door_r7_r14', 'door_r2_r9', 'door_r17_r18',
      'r7_user1', 'door_r7_r8', 'door_r0_r7', 'door_r5_r6', 'r5_claude1', 'door_r19_r20', 'r20_claude1',
      'r5_rice1', 'r20_rice1', 'door_r19_r26', 'door_r20_r27', 'r27_user1', 'r27_goal1'
    ] },
    { id: 33, name: '千针', grid: [7, 5], seed: 33033, riceScale: 3.6, hubs: [10, 24], doorBias: 4, condBias: 9, sol: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r8', 'door_r8_r9', 'r8_rice1', 'r9_rice1', 'r8_bowl1', 'r9_claude1',
      'door_r1_r2', 'r2_claude1', 'door_r9_r10', 'r10_claude1', 'door_r9_r16', 'door_r16_r17', 'r17_claude1',
      'door_r17_r24', 'door_r24_r25', 'r25_claude1', 'r16_rice1', 'r1_user1', 'door_r10_r11', 'r11_rice1',
      'r17_rice1', 'r10_rice1', 'r24_user1', 'door_r25_r26', 'r16_bowl1', 'r26_user1', 'door_r8_r15',
      'r25_rice1', 'r15_token1', 'door_r16_r23', 'r2_rice1', 'r23_token1', 'door_r24_r31', 'r31_token1',
      'r31_rice1', 'r23_rice1', 'door_r23_r30', 'r15_rice1', 'door_r29_r30', 'r29_rice1', 'r0_rice1',
      'r29_claude1', 'door_r26_r27', 'r27_rice1', 'door_r20_r27', 'door_r13_r20', 'r13_claude1',
      'door_r4_r11', 'r4_claude1', 'door_r19_r20', 'r19_claude1', 'door_r12_r19', 'door_r5_r12',
      'r5_claude1', 'door_r7_r8', 'r7_token1', 'r13_rice1', 'r5_rice1', 'r4_rice1', 'door_r5_r6',
      'r6_token1', 'r20_rice1', 'r7_rice1', 'door_r28_r29', 'r28_rice1', 'r6_rice1', 'door_r21_r28',
      'r21_user1', 'door_r14_r15', 'r14_rice1', 'r14_token1', 'door_r21_r22', 'r22_user1', 'door_r31_r32',
      'r32_user1', 'r19_rice1', 'r12_rice1', 'r30_user1', 'door_r6_r13', 'door_r30_r31', 'door_r3_r10',
      'r3_user1', 'door_r17_r18', 'r18_user1', 'door_r14_r21', 'door_r11_r12', 'door_r2_r9', 'door_r2_r3',
      'door_r22_r23', 'door_r26_r33', 'r33_user1', 'door_r18_r25', 'door_r27_r34', 'r34_rice1', 'r34_goal1'
    ] },
    { id: 34, name: '涡心', grid: [8, 4], seed: 34034, riceScale: 3.8, hubs: [13, 18], doorBias: 6, condBias: 10, sol: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r9', 'r9_rice1', 'door_r9_r17', 'r17_rice1', 'r1_claude1',
      'r0_rice1', 'r9_claude1', 'r1_rice1', 'r17_claude1', 'door_r17_r25', 'r25_rice1', 'door_r9_r10',
      'door_r24_r25', 'r24_user1', 'r10_user1', 'door_r10_r11', 'r11_rice1', 'door_r11_r19', 'r19_user1',
      'door_r19_r27', 'r27_rice1', 'r27_claude1', 'door_r19_r20', 'door_r20_r28', 'r28_claude1',
      'door_r26_r27', 'r26_rice1', 'r26_claude1', 'door_r12_r20', 'r12_rice1', 'door_r12_r13', 'r13_claude1',
      'door_r5_r13', 'r5_claude1', 'r5_rice1', 'door_r13_r14', 'r14_rice1', 'r28_rice1', 'r20_rice1',
      'r14_token1', 'r13_rice1', 'r25_bowl1', 'door_r14_r22', 'r12_token1', 'door_r22_r23', 'r23_rice1',
      'r20_token1', 'door_r23_r31', 'r31_rice1', 'r31_claude1', 'door_r10_r18', 'r18_rice1', 'door_r15_r23',
      'door_r7_r15', 'r7_rice1', 'door_r30_r31', 'door_r29_r30', 'r29_token1', 'r30_user1', 'r29_rice1',
      'r7_bowl1', 'r15_user1', 'door_r20_r21', 'r21_user1', 'door_r16_r24', 'r16_rice1', 'door_r0_r8',
      'r8_user1', 'door_r5_r6', 'r6_user1', 'r23_token1', 'door_r4_r5', 'r4_user1', 'r16_token1',
      'door_r1_r2', 'r2_rice1', 'door_r3_r4', 'r3_rice1', 'r3_bowl1', 'r31_goal1'
    ] },
    { id: 35, name: '自由之城', grid: [8, 5], seed: 35035, riceScale: 4.0, hubs: [13, 26], doorBias: 8, condBias: 11, sol: [
      'r0_rice2', 'door_r0_r1', 'door_r1_r9', 'door_r9_r10', 'r9_rice1', 'door_r10_r18', 'r18_rice1',
      'r1_claude1', 'r10_claude1', 'door_r18_r26', 'door_r26_r27', 'r27_claude1', 'door_r25_r26',
      'r25_claude1', 'door_r25_r33', 'r33_claude1', 'door_r26_r34', 'r34_claude1', 'door_r34_r35',
      'r35_claude1', 'r34_rice1', 'door_r35_r36', 'r36_claude1', 'door_r28_r36', 'r28_claude1',
      'door_r36_r37', 'r37_rice1', 'r28_rice1', 'door_r0_r8', 'r8_rice1', 'r10_rice1', 'r26_rice1',
      'r25_rice1', 'r27_rice1', 'r36_rice1', 'r35_rice1', 'r9_bowl1', 'r1_rice1', 'r8_bowl1', 'door_r18_r19',
      'r19_rice1', 'r37_bowl1', 'r0_rice1', 'door_r37_r38', 'r38_rice1', 'r33_rice1', 'r38_claude1',
      'door_r11_r19', 'door_r3_r11', 'r3_rice1', 'r3_claude1', 'door_r3_r4', 'r4_claude1', 'door_r4_r5',
      'r5_claude1', 'door_r11_r12', 'door_r12_r13', 'r13_claude1', 'r12_user1', 'r4_rice1', 'r11_rice1',
      'door_r13_r21', 'r21_rice1', 'door_r21_r22', 'r22_rice1', 'r22_claude1', 'door_r22_r23', 'r23_claude1',
      'door_r21_r29', 'r29_rice1', 'r23_rice1', 'r5_rice1', 'r13_rice1', 'r29_bowl1', 'door_r22_r30',
      'r30_rice1', 'r30_bowl1', 'r21_bowl1', 'r11_token1', 'r19_token1', 'door_r24_r25', 'r24_user1',
      'door_r15_r23', 'door_r30_r31', 'r31_rice1', 'door_r14_r15', 'r31_token1', 'r15_user1', 'r14_user1',
      'door_r6_r14', 'r6_user1', 'door_r6_r7', 'r7_rice1', 'r7_claude1', 'door_r31_r39', 'r39_rice1',
      'r39_token1', 'door_r19_r20', 'r20_user1', 'r39_goal1'
    ] },
    { id: 36, name: '终焉枢纽', grid: [9, 4], seed: 36036, riceScale: 4.5, hubs: [13, 22], doorBias: 10, condBias: 9, reach: 2, hidden: true, sol: [
      'r0_rice1', 'door_r0_r9', 'r9_rice1', 'door_r9_r18', 'r18_rice1', 'r0_rice2', 'r18_claude1',
      'r9_claude1', 'door_r18_r19', 'r19_claude1', 'r19_rice1', 'door_r18_r27', 'r27_claude1',
      'door_r10_r19', 'door_r10_r11', 'door_r11_r12', 'door_r12_r21', 'door_r21_r22', 'r22_rice1',
      'r22_bowl1', 'r21_user1', 'r10_user1', 'r27_rice1', 'door_r13_r22', 'r13_rice1', 'r13_claude1',
      'door_r22_r23', 'r23_claude1', 'door_r22_r31', 'r31_claude1', 'door_r3_r12', 'r3_rice1', 'r31_rice1',
      'door_r13_r14', 'r14_rice1', 'r23_rice1', 'door_r31_r32', 'r32_rice1', 'door_r14_r15', 'r15_token1',
      'r15_rice1', 'r14_bowl1', 'r12_user1', 'r32_bowl1', 'r3_bowl1', 'door_r15_r16', 'r16_rice1',
      'r16_claude1', 'door_r7_r16', 'r7_rice1', 'r7_claude1', 'door_r16_r25', 'door_r25_r34', 'r34_rice1',
      'door_r25_r26', 'r26_rice1', 'r25_rice1', 'r34_bowl1', 'door_r24_r25', 'door_r24_r33', 'r33_rice1',
      'door_r21_r30', 'r30_rice1', 'r24_user1', 'door_r2_r11', 'r2_rice1', 'door_r20_r21', 'r20_user1',
      'r30_token1', 'door_r17_r26', 'r17_rice1', 'door_r20_r29', 'r17_token1', 'door_r28_r29', 'r28_rice1',
      'r33_token1', 'r11_user1', 'r29_user1', 'door_r3_r4', 'r4_user1', 'door_r5_r14', 'r5_user1',
      'door_r5_r6', 'r6_user1', 'door_r2_r3', 'door_r29_r30', 'door_r6_r15', 'door_r34_r35', 'r35_rice1',
      'door_r1_r2', 'r1_rice1', 'r1_bowl1', 'r35_bowl1', 'r35_hidden1'
    ] }
  ];
  ACT5.forEach(function (cfg, n) {
    var roomCount = cfg.grid[0] * cfg.grid[1];
    G.levelSpecs.push(buildAct4({
      id: cfg.id, name: cfg.name,
      subtitle: '第五幕 · 自由布局', tier: '自由布局',
      grid: cfg.grid, wh: [12, 10], gap: 9, seed: cfg.seed,
      riceScale: cfg.riceScale, doorBias: cfg.doorBias, condBias: cfg.condBias,
      doorScale: 0.45,   /* 房间缩到 5×5~10×10 后白饭总量大幅变少，
                            门的量级必须跟着降，否则开局凑不够过门下限，整关搜不到路 */
      density: 0.14, freeform: true, whJitter: true, noEnrich: true,
      /* 枢纽连线暂时关闭：一个枢纽挂 6~8 条走廊时，几条走廊在枢纽周围会贴边合并成
         一片大厅，门旁边就多出通路、可以绕过（策划实测到的问题）。
         要重新打开，必须先让枢纽的每条走廊从**不同方向的边缘**接入，
         并保证走廊之间留 1 格墙 —— 见 js/map.js 里 pathMergesOther 的说明。 */
      hubs: [], hubReach: 2,
      solution: cfg.sol || [],
      hidden: !!cfg.hidden,
      hint: '走廊会拐弯、会交叠：中心枢纽一间就挂着七八条连线',
      intro: [
        { key: 'l' + cfg.id + '_free', new: true, title: '新场地：自由布局', icon: 'door',
          desc: '房间不再排成方阵，走廊也不再是直线 —— 它们会 Z 形拐弯、会互相交叠，' +
                '中间那几个枢纽房间一间就挂着六七条连线。门只落在走廊的窄口上。',
          formula: 'Z 形走廊 + 走廊交叠 + 中心枢纽' },
        { key: 'l' + cfg.id + '_scale', new: n === 0, title: '规模：' + roomCount + ' 间', icon: 'rice',
          desc: '这一关有 ' + roomCount + ' 个房间，单间最大 14×14（策划上限 15×15）。' +
                '枢纽周围两圈的房间都是直连，可以从枢纽一次散开。',
          formula: cfg.grid[0] + ' × ' + cfg.grid[1] + ' = ' + roomCount + ' 间' }
      ],
      tips: [
        '枢纽是十字路口：从哪进、从哪出，差别很大',
        '交叠的走廊看着像近路，其实常常绕远、还会多吃白饭',
        '门的门槛是极限数值：能过就立刻过，别恋战'
      ]
    }));
  });

  /* ═══════════════════════════════════════════════════════════
     第 11 关 · 高塔之门（重建版）
     ─────────────────────────────────────────────────────────
     原版是手写关卡，房间从 14×14 压到 5×5~10×10 之后求解器搜不到通路，
     按策划要求"过不了就重新建关"用生成器重建：16 个房间、基础算法限定
     （basic 条件池，只用第 1 关就解锁的函数），门量级按小房间缩放。
     levels.js 的 refresh() 规则是"同 id 后定义覆盖前定义"，
     所以这里 push 的同 id 关卡会顶掉 act2.js 里那份。
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push(buildAct4({
    id: 11, name: '高塔之门', subtitle: '第二幕 · 重建', tier: '进阶',
    grid: [4, 4], wh: [12, 10], gap: 9, seed: 11011,
    riceScale: 1.3, doorScale: 0.5, doorBias: 4, condBias: 1,
    density: 0.15, freeform: true, whJitter: true, basic: true, noEnrich: true,
    hint: '十六间石室连成塔：每一层的门都把数值咬掉一块，算清楚再进',
    intro: [
      { key: 'l11_rebuild', new: true, title: '十六间石室', icon: 'door',
        desc: '房间排开成 4×4 的塔身，门量级按小房间重新配过。',
        formula: '4 × 4 = 16 间' }
    ],
    tips: ['门只要求极限数值：能过就过，别为了多吃一碗饭卡在门口',
           '基础算法就够用：mod / digitSum / gcd / min / max',
           '走错了按 R 重开，这一关不值得硬救'],
    sol: [
      'q0_rice1', 'q0_rice2', 'door_q0_q1', 'door_q0_q3', 'door_q1_q2', 'door_q2_q5', 'q3_rice1',
      'q2_token1', 'q2_rice1', 'q3_user1', 'q1_rice1', 'q1_claude1', 'door_q3_q4', 'q4_bowl1', 'q4_claude1',
      'q5_goal1'
    ]
  }));

  /* ═══════════════════════════════════════════════════════════
     第 11 关 · 高塔之门（第三次重做 · 手写版）
     ─────────────────────────────────────────────────────────
     前两版失败的原因：
       · 第一版是手写大房间（14×14），房间被压到 5×5~10×10 之后路线失效；
       · 第二版改用生成器，求解器能搜出顺序，但真实引擎复算不收敛
         —— 生成器的元素集合与求解器的可达性模型和 verify.trace 有分叉。
     这一版回到最稳的做法：手写小房间 + 低量级门 + 显式 noEnrich。
       ① 每间 10×10（≤15 上限），六个房间排两排；
       ② 门的量级全压到 10 以内，开局一定凑得出过门下限；
       ③ noEnrich：元素集合每次构建完全一致，求解与复盘看到同一张图。
     用到的算法只有基础集合（mod / min / max），符合"基础关"定位。
     ═══════════════════════════════════════════════════════════ */
  var r11 = L.gridRooms([2, 22, 42], [2, 22], [
    { c: 0, r: 0, id: 'q0', name: '塔基', shape: 'rect', wh: [10, 10] },
    { c: 1, r: 0, id: 'q1', name: '一层', shape: 'round', k: 3, wh: [10, 10] },
    { c: 2, r: 0, id: 'q2', name: '二层', shape: 'rect', wh: [10, 10] },
    { c: 0, r: 1, id: 'q3', name: '三层', shape: 'rect', wh: [10, 10] },
    { c: 1, r: 1, id: 'q4', name: '四层', shape: 'round', k: 3, wh: [10, 10] },
    { c: 2, r: 1, id: 'q5', name: '塔顶', shape: 'rect', wh: [10, 10] }
  ]);
  var e11 = L.autoEls(r11, {
    q0: [['rice', 13], ['rice', 9]],
    q1: [['claude', 2], ['rice', 15]],
    q2: [['token', 'x - mod(x, 7) + 11'], ['rice', 17]],
    q3: [['user', 'x > 45', 26, 8], ['rice', 19]],
    q4: [['claude', 2], ['bowl', 12]],
    q5: [['goal']]
  });
  G.levelSpecs.push({
    id: 11, name: '高塔之门', subtitle: '第二幕 · 塔', tier: '进阶',
    size: [78, 78], sizeClass: '>75x75', seed: 11011,
    noEnrich: true,
    hint: '六层石塔：门只把数值咬掉一小口，先攒后过',
    intro: [
      { key: 'l11_tower', new: true, title: '六层石塔', icon: 'door',
        desc: '塔身六间石室，每层之间一扇门。门的量级都不大（最多扣 10），' +
              '所以关键是顺序：倍率要留给后面的大额白饭。',
        formula: '六层 · 六门' }
    ],
    tips: ['门的门槛是"刚好能过"的极限值，能过就立刻过',
           'Claude 娘的倍率留到吃完大额白饭再吃最划算',
           '过不去的门别硬撞，回头把别的房间吃了再来'],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: r11,
    links: [
      L.link('q0', 'q1', { op: 'sub', amount: 5, label: '减法门' }),
      L.link('q1', 'q2', { op: 'sub', amount: 8, label: '减法门' }),
      L.link('q2', 'q5', { op: 'div', divisor: 2, label: '除法门' }),
      L.link('q0', 'q3', { op: 'sub', amount: 6, label: '减法门' }),
      L.link('q3', 'q4', { op: 'sub', amount: 9, label: '减法门' }),
      L.link('q4', 'q5', { op: 'sub', amount: 10, label: '终点前门' })
    ],
    elements: e11,
    start: { room: 'q0', at: [2, 2] },
    solution: [
      'q0_rice1', 'q0_rice2', 'door_q0_q1', 'door_q0_q3', 'door_q1_q2', 'door_q2_q5', 'q3_rice1',
      'q2_token1', 'q2_rice1', 'q3_user1', 'q1_rice1', 'q1_claude1', 'door_q3_q4', 'q4_bowl1', 'q4_claude1',
      'q5_goal1'
    ]
  });

})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
