/* ─────────────────────────────────────────────────────────────
   act3.js —— 第 13~18 关（第三幕：条件、枢纽与多门链）
   ------------------------------------------------------------------
   第三幕的难度增长点（对应策划要求）：
     · 单个房间塞更多复杂元素（每间 2~4 个，不再是"一间一碗饭"）
     · 一个房间可以联通多个房间（枢纽房间，最多 4~5 条连线）
     · 一条路径上出现多道门（用 4×4 的中转小屋串起来，两门不相邻）
     · 用户提出复合条件：(x % 4 == 3 && x > 8)、(x % 5 != 2 || mod(x, 30) < 12) 等
     · 复杂运算门开始出现 min / max / if / clamp 组合

   房间尺寸都 ≤ 50×50，单关房间数 ≤ 30，满足策划上限。
   所有门的门槛写 'auto'：由 tools/solve.mjs 搜出的最优解反推成极限数值。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';
  G.levelSpecs = G.levelSpecs || [];
  var L = G.levelKit;
  var gridRooms = L.gridRooms, link = L.link, autoEls = L.autoEls;

  /* ═══════════════════════════════════════════════════════════
     第 13 关 · 余数之门 · 58×52 · 9 房间 / 10 门
     ─────────────────────────────────────────────────────────
     新机制：余数门（x − mod(x, N) − K）与「带 % 的用户条件」。
     用户不再只看大小，而是看你数值的**余数**够不够漂亮。
     拓扑：3×3 网格，r3 / r4 各联通 3 个房间（多连通房间首次出现）。
     ═══════════════════════════════════════════════════════════ */
  var r13 = gridRooms([2, 22, 42], [2, 20, 38], [
    { c: 0, r: 0, id: 'r0', name: '起点厅', shape: 'rect', wh: [14, 12] },
    { c: 1, r: 0, id: 'r1', name: '余数厅', shape: 'round', k: 3, wh: [14, 12] },
    { c: 2, r: 0, id: 'r2', name: '高台', shape: 'diamond', wh: [14, 12] },
    { c: 0, r: 1, id: 'r3', name: '数位仓', shape: 'rect', wh: [14, 12] },
    { c: 1, r: 1, id: 'r4', name: '中枢', shape: 'round', k: 4, wh: [14, 12] },
    { c: 2, r: 1, id: 'r5', name: '深仓', shape: 'rect', wh: [14, 12] },
    { c: 0, r: 2, id: 'r6', name: '左翼', shape: 'plus', wh: [14, 12] },
    { c: 1, r: 2, id: 'r7', name: '汇流', shape: 'round', k: 3, wh: [14, 12] },
    { c: 2, r: 2, id: 'r8', name: '终点厅', shape: 'rect', wh: [14, 12] }
  ]);
  var e13 = autoEls(r13, {
    r0: [['rice', 14], ['rice', 23]],
    r1: [['claude', 2], ['rice', 18]],
    r2: [['token', 'x + digitSum(x) * 7'], ['rice', 31]],
    r3: [['user', '(x % 4 == 3 && x > 8)', 25, 30], ['rice', 12]],
    r4: [['claude', 3], ['bowl', 9]],
    r5: [['token', 'mod(x, 97) + 40'], ['rice', 27]],
    r6: [['user', '(x % 5 != 2 || mod(x, 30) < 12)', 34, 21]],
    r7: [['claude', 2], ['rice', 44]],
    r8: [['goal']]
  });
  G.levelSpecs.push({
    id: 13, name: '余数之门', subtitle: '第三幕 · 进阶', tier: '进阶',
    size: [58, 52], sizeClass: '>50x50', seed: 13013,
    hint: '用户开始看你的余数了：x % 4 是几，比 x 有多大更重要',
    intro: [
      { key: 'l13_mod_user', new: true, title: '新机制：余数条件', icon: 'user',
        desc: '用户的条件里出现 %（取余）。同一个奖励门槛，只有余数对得上的数值才能拿到。',
        formula: '(x % 4 == 3 && x > 8)' },
      { key: 'l13_mod_door', new: true, title: '余数门', icon: 'door',
        desc: '门也会按余数削你：先减掉零头再扣固定值，余数越大亏得越多。',
        formula: 'x − mod(x, 13) − 8' }
    ],
    tips: ['算不出来的话，先看每条门公式里的 mod 是几', '余数条件不满足时先去别的房间把数值调对', '一个房间能联通好几个房间，别只盯着一条路'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r13,
    links: [
      link('r0', 'r1', { op: 'sub', amount: 5, label: '减法门' }),
      link('r1', 'r2', { op: 'expr', expr: 'x - mod(x, 13) - 8', label: '余数门' }),
      link('r0', 'r3', { op: 'sub', amount: 9, label: '减法门' }),
      link('r3', 'r4', { op: 'div', divisor: 2, label: '除法门' }),
      link('r4', 'r5', { op: 'sub', amount: 14, label: '减法门' }),
      link('r2', 'r5', { op: 'expr', expr: 'min(x - 20, floor(x / 2) + 6)', label: '封顶门' }),
      link('r3', 'r6', { op: 'sub', amount: 11, label: '减法门' }),
      link('r6', 'r7', { op: 'expr', expr: 'x - digitSum(x) * 2 - 6', label: '数位门' }),
      link('r7', 'r8', { op: 'sub', amount: 18, label: '终点前门' }),
      link('r4', 'r7', { op: 'expr', expr: 'max(x - 60, floor(x / 3))', label: 'max 门' })
    ],
    elements: e13,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice1', 'door_r0_r1', 'r1_rice1', 'door_r1_r2', 'r2_rice1', 'door_r2_r5', 'r5_token1', 'r2_token1',
      'r1_claude1', 'door_r4_r5', 'r4_claude1', 'door_r4_r7', 'r7_rice1', 'r5_rice1', 'r7_claude1',
      'door_r0_r3', 'door_r3_r6', 'r6_user1', 'r0_rice2', 'r3_user1', 'r3_rice1', 'r4_bowl1', 'door_r7_r8',
      'r8_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 14 关 · 逻辑枢纽 · 68×50 · 12 房间 / 15 门
     ─────────────────────────────────────────────────────────
     新机制：复合逻辑条件（&& / || / !）。
     拓扑：r5 是四通枢纽（上下左右各一条连线），必须靠它串起整张图。
     ═══════════════════════════════════════════════════════════ */
  var r14 = gridRooms([2, 19, 36, 53], [2, 19, 36], [
    { c: 0, r: 0, id: 'r0', name: '入口', shape: 'rect', wh: [13, 12] },
    { c: 1, r: 0, id: 'r1', name: '北仓', shape: 'rect', wh: [13, 12] },
    { c: 2, r: 0, id: 'r2', name: '东北台', shape: 'round', k: 3, wh: [13, 12] },
    { c: 3, r: 0, id: 'r3', name: '远塔', shape: 'diamond', wh: [13, 12] },
    { c: 0, r: 1, id: 'r4', name: '西仓', shape: 'rect', wh: [13, 12] },
    { c: 1, r: 1, id: 'r5', name: '中枢井', shape: 'round', k: 4, wh: [13, 12] },
    { c: 2, r: 1, id: 'r6', name: '东仓', shape: 'rect', wh: [13, 12] },
    { c: 3, r: 1, id: 'r7', name: '侧廊', shape: 'plus', wh: [13, 12] },
    { c: 0, r: 2, id: 'r8', name: '西南仓', shape: 'rect', wh: [13, 12] },
    { c: 1, r: 2, id: 'r9', name: '南井', shape: 'round', k: 3, wh: [13, 12] },
    { c: 2, r: 2, id: 'r10', name: '东南台', shape: 'diamond', wh: [13, 12] },
    { c: 3, r: 2, id: 'r11', name: '终点厅', shape: 'rect', wh: [13, 12] }
  ]);
  var e14 = autoEls(r14, {
    r0: [['rice', 16], ['rice', 21]],
    r1: [['user', '(x > 30 && x < 90) || x % 7 == 0', 28, 26]],
    r2: [['claude', 2], ['rice', 19]],
    r3: [['token', 'max(x, 55) + 18'], ['rice', 24]],
    r4: [['rice', 33], ['bowl', 12]],
    r5: [['claude', 3], ['user', '!(x > 200) && x % 9 == 0', 40, 35]],
    r6: [['rice', 27], ['token', 'x - mod(x, 8) + 12']],
    r7: [['user', '(x % 3 == 0 || x % 3 == 1) && x > 40', 30, 24]],
    r8: [['rice', 38]],
    r9: [['claude', 2], ['rice', 45]],
    r10: [['token', 'floor(x / 2) + min(x, 70)'], ['rice', 29]],
    r11: [['goal']]
  });
  G.levelSpecs.push({
    id: 14, name: '逻辑枢纽', subtitle: '第三幕 · 进阶', tier: '进阶',
    size: [68, 50], sizeClass: '>50x50', seed: 14014,
    hint: '中枢井连着四个方向：想清楚从哪进、从哪出，再决定吃什么',
    intro: [
      { key: 'l14_logic', new: true, title: '新机制：复合条件', icon: 'user',
        desc: '用户的条件可以用 &&（都要满足）、||（满足一个就行）、!（取反）串起来，先在心里算出真假。',
        formula: '(x > 30 && x < 90) || x % 7 == 0' },
      { key: 'l14_hub', new: true, title: '新拓扑：四通枢纽', icon: 'door',
        desc: '中枢井上下左右各连一个房间 —— 一个房间可以联通多个房间，路线不再是一条直线。',
        formula: '北 · 西 · 东 · 南' }
    ],
    tips: ['条件里出现 || 时，先看哪一半更容易满足', '枢纽房间是十字路口，走错方向要多绕很多路', '倍率留到后面吃，前面的门只求刚好够'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r14,
    links: [
      link('r0', 'r1', { op: 'sub', amount: 6, label: '减法门' }),
      link('r1', 'r2', { op: 'expr', expr: 'x - 12 - mod(x, 9)', label: '余数门' }),
      link('r2', 'r3', { op: 'sub', amount: 15, label: '减法门' }),
      link('r0', 'r4', { op: 'sub', amount: 10, label: '减法门' }),
      link('r4', 'r5', { op: 'div', divisor: 2, label: '除法门' }),
      link('r1', 'r5', { op: 'sub', amount: 18, label: '减法门' }),
      link('r5', 'r6', { op: 'sub', amount: 22, label: '减法门' }),
      link('r5', 'r9', { op: 'div', divisor: 3, label: '除法门' }),
      link('r6', 'r7', { op: 'expr', expr: 'max(x - 90, floor(x / 4))', label: 'max 门' }),
      link('r3', 'r7', { op: 'expr', expr: 'min(x - 40, floor(x / 2) + 10)', label: '封顶门' }),
      link('r4', 'r8', { op: 'sub', amount: 13, label: '减法门' }),
      link('r8', 'r9', { op: 'expr', expr: 'x - digitSum(x) * 3 - 5', label: '数位门' }),
      link('r9', 'r10', { op: 'sub', amount: 25, label: '减法门' }),
      link('r7', 'r11', { op: 'expr', expr: 'x - 30 - mod(x, 16)', label: '终点前门' }),
      link('r10', 'r11', { op: 'sub', amount: 35, label: '终点前门' })
    ],
    elements: e14,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice2', 'door_r0_r4', 'door_r4_r5', 'door_r5_r9', 'r9_rice1', 'r0_rice1', 'r5_user1', 'r4_rice1',
      'r5_claude1', 'r9_claude1', 'door_r0_r1', 'door_r1_r2', 'r1_user1', 'r2_claude1', 'door_r4_r8',
      'r8_rice1', 'door_r9_r10', 'r10_rice1', 'door_r5_r6', 'r6_rice1', 'door_r2_r3', 'r3_rice1', 'r2_rice1',
      'r3_token1', 'r4_bowl1', 'r6_token1', 'door_r10_r11', 'r11_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 15 关 · 双门走廊 · 70×70 · 14 房间 / 17 门
     ─────────────────────────────────────────────────────────
     新机制：一条路上连着两道门（中间隔一个 4×4 的中转小屋，所以两门不相邻）。
     想过第一道门要算一次，过完立刻要算第二道 —— 中间没有补数值的机会。
     ═══════════════════════════════════════════════════════════ */
  var r15 = gridRooms([2, 28, 54], [2, 28, 54], [
    { c: 0, r: 0, id: 'r0', name: '起始站', shape: 'rect', wh: [18, 16] },
    { c: 1, r: 0, id: 'r1', name: '北台', shape: 'round', k: 4, wh: [18, 16] },
    { c: 2, r: 0, id: 'r2', name: '东北仓', shape: 'rect', wh: [18, 16] },
    { c: 0, r: 1, id: 'r3', name: '西仓', shape: 'rect', wh: [18, 16] },
    { c: 1, r: 1, id: 'r4', name: '中央井', shape: 'round', k: 5, wh: [18, 16] },
    { c: 2, r: 1, id: 'r5', name: '东仓', shape: 'rect', wh: [18, 16] },
    { c: 0, r: 2, id: 'r6', name: '西南台', shape: 'diamond', wh: [18, 16] },
    { c: 1, r: 2, id: 'r7', name: '南仓', shape: 'rect', wh: [18, 16] },
    { c: 2, r: 2, id: 'r8', name: '终点厅', shape: 'rect', wh: [18, 16] },
    /* 六个 4×4 中转屋：专门用来串"双门走廊"。
       位置必须夹在两间被连的大房间中间的缝里（同一行/同一列），
       否则走廊会横穿别处，门就起不到隔断作用。 */
    { at: [22, 8], id: 'x1', name: '中转屋甲', shape: 'rect', wh: [4, 4] },
    { at: [48, 8], id: 'x2', name: '中转屋乙', shape: 'rect', wh: [4, 4] },
    { at: [22, 34], id: 'x3', name: '中转屋丙', shape: 'rect', wh: [4, 4] },
    { at: [48, 34], id: 'x4', name: '中转屋丁', shape: 'rect', wh: [4, 4] },
    { at: [22, 60], id: 'x5', name: '中转屋戊', shape: 'rect', wh: [4, 4] },
    { at: [48, 60], id: 'x6', name: '中转屋己', shape: 'rect', wh: [4, 4] }
  ]);
  var e15 = autoEls(r15, {
    r0: [['rice', 18], ['rice', 26], ['bowl', 14]],
    r1: [['claude', 2], ['rice', 22]],
    r2: [['user', '(x % 6 == 0 && x > 40) || x > 300', 45, 40]],
    r3: [['token', 'x - mod(x, 11) + 16'], ['rice', 31]],
    r4: [['claude', 3], ['user', '(x % 4 != 2 || mod(x, 12) < 4)', 38, 33]],
    r5: [['rice', 41], ['token', 'max(x, 80) + 24']],
    r6: [['rice', 52], ['claude', 2]],
    r7: [['user', 'x > 150 && digitSum(x) % 3 == 0', 55, 48], ['bowl', 20]],
    r8: [['goal']],
    x1: [['rice', 4], ['rice', 6]],
    x2: [['rice', 5], ['rice', 8]],
    x3: [['rice', 6], ['rice', 9]],
    x4: [['rice', 7], ['rice', 11]],
    x5: [['rice', 8], ['rice', 13]],
    x6: [['rice', 9], ['rice', 14]]
  });
  G.levelSpecs.push({
    id: 15, name: '双门走廊', subtitle: '第三幕 · 进阶', tier: '进阶',
    size: [74, 72], sizeClass: '>50x50', seed: 15015,
    hint: '有的走廊上连着两道门，中间只有一间小屋 —— 过第一道门前就要算好第二道',
    intro: [
      { key: 'l15_twin', new: true, title: '新机制：一条路两道门', icon: 'door',
        desc: '两个大房间之间夹了一间 4×4 的中转屋，屋前屋后各一道门。两扇门不相邻，但中间只有两小碗饭，补不了多少。',
        formula: '房间 → 门 → 中转屋 → 门 → 房间' }
    ],
    tips: ['过第一道门之前，先把第二道门的公式算一遍', '中转屋只有两小碗饭，补不了多少，别指望靠它救急', '走不通就换条走廊，图里不止一条路'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r15,
    links: [
      /* 双门走廊：大房间 → 门 → 4×4 中转屋 → 门 → 大房间（两门隔着中转屋，不相邻） */
      link('r0', 'x1', { op: 'sub', amount: 12, label: '双门·前' }),
      link('x1', 'r1', { op: 'expr', expr: 'x - 20 - mod(x, 7)', label: '双门·后' }),
      link('r1', 'x2', { op: 'sub', amount: 18, label: '双门·前' }),
      link('x2', 'r2', { op: 'div', divisor: 2, label: '双门·后' }),
      link('r3', 'x3', { op: 'sub', amount: 16, label: '双门·前' }),
      link('x3', 'r4', { op: 'expr', expr: 'max(x - 70, floor(x / 3))', label: '双门·后' }),
      link('r4', 'x4', { op: 'sub', amount: 24, label: '双门·前' }),
      link('x4', 'r5', { op: 'expr', expr: 'x - 30 - digitSum(x)', label: '双门·后' }),
      link('r6', 'x5', { op: 'expr', expr: 'x - 18 - mod(x, 9)', label: '双门·前' }),
      link('x5', 'r7', { op: 'sub', amount: 26, label: '双门·后' }),
      link('r7', 'x6', { op: 'sub', amount: 28, label: '双门·前' }),
      link('x6', 'r8', { op: 'expr', expr: 'min(x - 40, floor(x / 3) + 12)', label: '双门·后' }),
      /* 普通单门连线（纵向） */
      link('r0', 'r3', { op: 'sub', amount: 8, label: '减法门' }),
      link('r1', 'r4', { op: 'sub', amount: 15, label: '减法门' }),
      link('r2', 'r5', { op: 'expr', expr: 'min(x - 25, floor(x / 2) + 8)', label: '封顶门' }),
      link('r3', 'r6', { op: 'sub', amount: 19, label: '减法门' }),
      link('r4', 'r7', { op: 'div', divisor: 2, label: '除法门' }),
      link('r5', 'r8', { op: 'sub', amount: 34, label: '终点前门' })
    ],
    elements: e15,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice2', 'door_r0_r3', 'door_r3_x3', 'door_x3_r4', 'r4_user1', 'r3_rice1', 'r0_rice1', 'r3_token1',
      'r4_claude1', 'door_r3_r6', 'r6_rice1', 'r6_claude1', 'door_r1_r4', 'r1_claude1', 'door_r6_x5',
      'door_x5_r7', 'r7_bowl1', 'r7_user1', 'r1_rice1', 'r0_bowl1', 'x5_rice2', 'door_r4_x4', 'x4_rice2',
      'x3_rice2', 'x5_rice1', 'x4_rice1', 'x3_rice1', 'door_r0_x1', 'x1_rice2', 'x1_rice1', 'door_x4_r5',
      'r5_rice1', 'r5_token1', 'door_r5_r8', 'r8_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 16 关 · min 与 max · 76×76 · 15 房间 / 18 门
     ─────────────────────────────────────────────────────────
     新机制：门的运算里出现 min(...) / max(...) 多路取优 ——
     同一条公式，数值小的时候按 A 削，数值大的时候按 B 削，切点要自己找。
     ═══════════════════════════════════════════════════════════ */
  var r16 = gridRooms([2, 21, 40, 59], [2, 21, 40, 59], [
    { c: 0, r: 0, id: 'r0', name: '入口台', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 0, id: 'r1', name: '北一', shape: 'round', k: 3, wh: [15, 15] },
    { c: 2, r: 0, id: 'r2', name: '北二', shape: 'rect', wh: [15, 15] },
    { c: 3, r: 0, id: 'r3', name: '北塔', shape: 'diamond', wh: [15, 15] },
    { c: 0, r: 1, id: 'r4', name: '西一', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 1, id: 'r5', name: '中枢', shape: 'round', k: 5, wh: [15, 15] },
    { c: 2, r: 1, id: 'r6', name: '东一', shape: 'rect', wh: [15, 15] },
    { c: 3, r: 1, id: 'r7', name: '东塔', shape: 'plus', wh: [15, 15] },
    { c: 0, r: 2, id: 'r8', name: '西二', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 2, id: 'r9', name: '南中枢', shape: 'round', k: 4, wh: [15, 15] },
    { c: 2, r: 2, id: 'r10', name: '东二', shape: 'rect', wh: [15, 15] },
    { c: 3, r: 2, id: 'r11', name: '东台', shape: 'diamond', wh: [15, 15] },
    { c: 0, r: 3, id: 'r12', name: '西南', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 3, id: 'r13', name: '南仓', shape: 'rect', wh: [15, 15] },
    { c: 3, r: 3, id: 'r14', name: '终点厅', shape: 'rect', wh: [15, 15] }
  ]);
  var e16 = autoEls(r16, {
    r0: [['rice', 20], ['rice', 29]],
    r1: [['claude', 2], ['rice', 24]],
    r2: [['user', '(x % 8 == 5 && x > 60) || x > 400', 50, 44]],
    r3: [['token', 'max(x, 120) + 30'], ['rice', 36]],
    r4: [['rice', 44], ['bowl', 16]],
    r5: [['claude', 3], ['user', 'min(x, 200) > 90 && digitSum(x) % 2 == 0', 60, 52]],
    r6: [['rice', 33], ['token', 'x - mod(x, 17) + 21']],
    r7: [['user', '(x % 5 == 0 || x % 5 == 1) && x > 120', 45, 38]],
    r8: [['rice', 58]],
    r9: [['claude', 2], ['rice', 47]],
    r10: [['token', 'floor(x / 3) + min(x, 150)'], ['rice', 39]],
    r11: [['user', 'max(x, 300) > 350 || x % 11 == 3', 55, 50]],
    r12: [['rice', 66], ['claude', 2]],
    r13: [['bowl', 25], ['rice', 71]],
    r14: [['goal']]
  });
  G.levelSpecs.push({
    id: 16, name: 'min 与 max', subtitle: '第三幕 · 高阶', tier: '高阶',
    size: [76, 76], sizeClass: '>75x75', seed: 16016,
    hint: '门公式里有 min / max：数值在切点两侧，被削的方式完全不同',
    intro: [
      { key: 'l16_minmax', new: true, title: '新机制：多路取优', icon: 'door',
        desc: '门公式可以用 min(甲, 乙) / max(甲, 乙)：同一个门，数值小的时候按一条路削，大的时候按另一条。',
        formula: 'max(x − 90, floor(x / 4))' },
      { key: 'l16_minfunc', new: true, title: '条件里的函数', icon: 'user',
        desc: '用户条件里也能套函数，例如 min(x, 200) > 90 —— 先算函数，再比大小。',
        formula: 'min(x, 200) > 90 && digitSum(x) % 2 == 0' }
    ],
    tips: ['先找切点：x 比它小走一条路，比它大走另一条', '两个中枢都连着四个房间，路线可以绕两圈', '终点前的饭别一次吃完，留到倍率之后再回来'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r16,
    links: [
      link('r0', 'r1', { op: 'sub', amount: 8, label: '减法门' }),
      link('r1', 'r2', { op: 'expr', expr: 'min(x - 30, floor(x / 2) + 10)', label: 'min 门' }),
      link('r2', 'r3', { op: 'sub', amount: 28, label: '减法门' }),
      link('r0', 'r4', { op: 'sub', amount: 12, label: '减法门' }),
      link('r4', 'r5', { op: 'div', divisor: 2, label: '除法门' }),
      link('r1', 'r5', { op: 'sub', amount: 24, label: '减法门' }),
      link('r5', 'r6', { op: 'expr', expr: 'max(x - 110, floor(x / 3))', label: 'max 门' }),
      link('r6', 'r7', { op: 'sub', amount: 32, label: '减法门' }),
      link('r3', 'r7', { op: 'expr', expr: 'min(x - 60, max(floor(x / 2), 40))', label: '嵌套门' }),
      link('r5', 'r9', { op: 'div', divisor: 3, label: '除法门' }),
      link('r4', 'r8', { op: 'sub', amount: 18, label: '减法门' }),
      link('r8', 'r9', { op: 'expr', expr: 'x - 25 - mod(x, 14)', label: '余数门' }),
      link('r9', 'r10', { op: 'expr', expr: 'min(x - 70, floor(x / 4) + 20)', label: 'min 门' }),
      link('r10', 'r11', { op: 'sub', amount: 38, label: '减法门' }),
      link('r9', 'r13', { op: 'sub', amount: 44, label: '减法门' }),
      link('r8', 'r12', { op: 'expr', expr: 'max(x - 130, floor(x / 5))', label: 'max 门' }),
      link('r12', 'r13', { op: 'expr', expr: 'x - digitSum(x) * 4 - 10', label: '数位门' }),
      link('r13', 'r14', { op: 'sub', amount: 52, label: '终点前门' })
    ],
    elements: e16,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice1', 'door_r0_r4', 'door_r4_r5', 'door_r5_r9', 'r9_rice1', 'r4_rice1', 'r0_rice2', 'r5_user1',
      'r5_claude1', 'door_r4_r8', 'r8_rice1', 'r9_claude1', 'door_r0_r1', 'r1_claude1', 'door_r8_r12',
      'r12_claude1', 'door_r9_r13', 'r13_rice1', 'r12_rice1', 'r13_bowl1', 'r1_rice1', 'r4_bowl1',
      'door_r13_r14', 'r14_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 17 关 · 嵌套运算 · 84×84 · 16 房间 / 20 门
     ─────────────────────────────────────────────────────────
     新机制：门公式里嵌函数调用（clamp / if / gcd / reverseNum 组合），
     一次过门要连算三层。
     ═══════════════════════════════════════════════════════════ */
  var r17 = gridRooms([2, 23, 44, 65], [2, 23, 44, 65], [
    { c: 0, r: 0, id: 'r0', name: '外门', shape: 'rect', wh: [17, 17] },
    { c: 1, r: 0, id: 'r1', name: '回廊一', shape: 'round', k: 4, wh: [17, 17] },
    { c: 2, r: 0, id: 'r2', name: '回廊二', shape: 'rect', wh: [17, 17] },
    { c: 3, r: 0, id: 'r3', name: '塔顶', shape: 'diamond', wh: [17, 17] },
    { c: 0, r: 1, id: 'r4', name: '西厅', shape: 'rect', wh: [17, 17] },
    { c: 1, r: 1, id: 'r5', name: '中枢一', shape: 'round', k: 5, wh: [17, 17] },
    { c: 2, r: 1, id: 'r6', name: '东厅', shape: 'rect', wh: [17, 17] },
    { c: 3, r: 1, id: 'r7', name: '东塔', shape: 'plus', wh: [17, 17] },
    { c: 0, r: 2, id: 'r8', name: '西深厅', shape: 'rect', wh: [17, 17] },
    { c: 1, r: 2, id: 'r9', name: '中枢二', shape: 'round', k: 5, wh: [17, 17] },
    { c: 2, r: 2, id: 'r10', name: '东深厅', shape: 'rect', wh: [17, 17] },
    { c: 3, r: 2, id: 'r11', name: '东南塔', shape: 'diamond', wh: [17, 17] },
    { c: 0, r: 3, id: 'r12', name: '西南厅', shape: 'rect', wh: [17, 17] },
    { c: 1, r: 3, id: 'r13', name: '南厅', shape: 'rect', wh: [17, 17] },
    { c: 2, r: 3, id: 'r14', name: '南二厅', shape: 'rect', wh: [17, 17] },
    { c: 3, r: 3, id: 'r15', name: '终点厅', shape: 'rect', wh: [17, 17] }
  ]);
  var e17 = autoEls(r17, {
    r0: [['rice', 22], ['rice', 34], ['bowl', 18]],
    r1: [['claude', 2], ['rice', 28]],
    r2: [['user', '(x % 9 == 4 && x > 90) || x > 600', 62, 55]],
    r3: [['token', 'max(x, 160) + 40'], ['rice', 42]],
    r4: [['rice', 51], ['claude', 2]],
    r5: [['claude', 3], ['user', 'clamp(x, 0, 500) > 220 && x % 7 != 3', 70, 60]],
    r6: [['rice', 37], ['token', 'x - mod(x, 23) + 26']],
    r7: [['user', '(x % 6 == 1 || x % 6 == 4) && x > 200', 58, 50]],
    r8: [['rice', 64]],
    r9: [['claude', 2], ['rice', 55], ['user', 'abs(x - 700) < 200 || x % 13 == 5', 75, 66]],
    r10: [['token', 'floor(x / 4) + min(x, 240)'], ['rice', 46]],
    r11: [['user', 'reverseNum(x) % 5 == 0 && x > 300', 80, 70]],
    r12: [['rice', 78], ['claude', 2]],
    r13: [['bowl', 30], ['rice', 83]],
    r14: [['token', 'x + digitSum(x) * 9'], ['rice', 61]],
    r15: [['goal']]
  });
  G.levelSpecs.push({
    id: 17, name: '嵌套运算', subtitle: '第三幕 · 高阶', tier: '高阶',
    size: [84, 84], sizeClass: '>75x75', seed: 17017,
    hint: '一次过门要连算三层：先算最里面那个函数，再算外面',
    intro: [
      { key: 'l17_nest', new: true, title: '新机制：嵌套函数门', icon: 'door',
        desc: '门公式里可以套函数：clamp / if / gcd / reverseNum 互相嵌套，从最里层往外算。',
        formula: 'min(x − 70, max(floor(x / 2), 40))' },
      { key: 'l17_twohub', new: true, title: '新拓扑：双中枢', icon: 'door',
        desc: '一张图里两个五连枢纽，可以绕两圈把高价值白饭留到最后。',
        formula: '中枢一 ⇄ 中枢二' }
    ],
    tips: ['嵌套公式从最里面往外算，别跳步', '两个中枢之间的房间可以来回走，门开了就是通路', '用户条件里的 abs / reverseNum 都要先算函数再比较'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r17,
    links: [
      link('r0', 'r1', { op: 'sub', amount: 10, label: '减法门' }),
      link('r1', 'r2', { op: 'expr', expr: 'min(x - 40, max(floor(x / 2), 30))', label: '嵌套门' }),
      link('r2', 'r3', { op: 'sub', amount: 34, label: '减法门' }),
      link('r0', 'r4', { op: 'sub', amount: 14, label: '减法门' }),
      link('r4', 'r5', { op: 'div', divisor: 2, label: '除法门' }),
      link('r1', 'r5', { op: 'sub', amount: 30, label: '减法门' }),
      link('r5', 'r6', { op: 'expr', expr: 'max(x - 140, floor(x / 4))', label: 'max 门' }),
      link('r6', 'r7', { op: 'sub', amount: 40, label: '减法门' }),
      link('r3', 'r7', { op: 'expr', expr: 'x - gcd(x, 96) - 20', label: '公约门' }),
      link('r5', 'r9', { op: 'div', divisor: 3, label: '除法门' }),
      link('r4', 'r8', { op: 'sub', amount: 22, label: '减法门' }),
      link('r8', 'r9', { op: 'expr', expr: 'clamp(x - 60, 1, 99999)', label: '封顶门' }),
      link('r9', 'r10', { op: 'expr', expr: 'if(x > 400, x - 180, floor(x / 3) + 12)', label: '分支门' }),
      link('r10', 'r11', { op: 'sub', amount: 46, label: '减法门' }),
      link('r9', 'r13', { op: 'sub', amount: 55, label: '减法门' }),
      link('r8', 'r12', { op: 'expr', expr: 'max(x - 170, floor(x / 6))', label: 'max 门' }),
      link('r12', 'r13', { op: 'expr', expr: 'x - digitSum(x) * 5 - 14', label: '数位门' }),
      link('r13', 'r14', { op: 'sub', amount: 60, label: '减法门' }),
      link('r11', 'r15', { op: 'expr', expr: 'min(x - 90, floor(x / 5) + 30)', label: '终点前门' }),
      link('r14', 'r15', { op: 'sub', amount: 66, label: '终点前门' })
    ],
    elements: e17,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice2', 'door_r0_r4', 'door_r4_r5', 'door_r5_r9', 'r9_rice1', 'r4_rice1', 'r9_user1', 'r4_claude1',
      'r5_user1', 'r5_claude1', 'r9_claude1', 'door_r0_r1', 'r1_claude1', 'door_r9_r13', 'door_r12_r13',
      'r12_claude1', 'door_r13_r14', 'door_r5_r6', 'r14_token1', 'r13_rice1', 'r12_rice1', 'door_r6_r7',
      'r7_user1', 'r14_rice1', 'r6_rice1', 'door_r3_r7', 'r3_token1', 'r13_bowl1', 'r6_token1', 'door_r4_r8',
      'r8_rice1', 'door_r2_r3', 'r2_user1', 'r3_rice1', 'r1_rice1', 'r0_rice1', 'r0_bowl1', 'door_r14_r15',
      'r15_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 18 关 · 枢纽迷城 · 95×76 · 18 房间 / 22 门
     ─────────────────────────────────────────────────────────
     收束关：多枢纽 + 多门走廊 + 复合条件全上，房间数逼近 20。
     ═══════════════════════════════════════════════════════════ */
  var r18 = gridRooms([2, 21, 40, 59, 78], [2, 21, 40, 59], [
    { c: 0, r: 0, id: 'r0', name: '城门', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 0, id: 'r1', name: '北一', shape: 'round', k: 3, wh: [15, 15] },
    { c: 2, r: 0, id: 'r2', name: '北枢纽', shape: 'round', k: 5, wh: [15, 15] },
    { c: 3, r: 0, id: 'r3', name: '北三', shape: 'rect', wh: [15, 15] },
    { c: 4, r: 0, id: 'r4', name: '北塔', shape: 'diamond', wh: [15, 15] },
    { c: 0, r: 1, id: 'r5', name: '西一', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 1, id: 'r6', name: '西枢纽', shape: 'round', k: 5, wh: [15, 15] },
    { c: 2, r: 1, id: 'r7', name: '中央厅', shape: 'round', k: 5, wh: [15, 15] },
    { c: 3, r: 1, id: 'r8', name: '东枢纽', shape: 'round', k: 5, wh: [15, 15] },
    { c: 4, r: 1, id: 'r9', name: '东塔', shape: 'plus', wh: [15, 15] },
    { c: 0, r: 2, id: 'r10', name: '西二', shape: 'rect', wh: [15, 15] },
    { c: 1, r: 2, id: 'r11', name: '西深', shape: 'rect', wh: [15, 15] },
    { c: 2, r: 2, id: 'r12', name: '南枢纽', shape: 'round', k: 5, wh: [15, 15] },
    { c: 3, r: 2, id: 'r13', name: '东深', shape: 'rect', wh: [15, 15] },
    { c: 4, r: 2, id: 'r14', name: '东南台', shape: 'diamond', wh: [15, 15] },
    { c: 0, r: 3, id: 'r15', name: '角落', shape: 'rect', wh: [15, 15] },
    { c: 3, r: 3, id: 'r16', name: '南台', shape: 'rect', wh: [15, 15] },
    { c: 4, r: 3, id: 'r17', name: '终点厅', shape: 'rect', wh: [15, 15] }
  ]);
  var e18 = autoEls(r18, {
    r0: [['rice', 24], ['rice', 36]],
    r1: [['claude', 2], ['rice', 30]],
    r2: [['user', '(x % 10 == 7 && x > 150) || x > 900', 80, 70], ['bowl', 22]],
    r3: [['token', 'max(x, 200) + 50'], ['rice', 44]],
    r4: [['user', 'min(x, 800) > 400 && x % 8 != 6', 90, 78]],
    r5: [['rice', 55], ['claude', 2]],
    r6: [['claude', 3], ['user', '(x % 7 == 2 || x % 7 == 5) && x > 300', 85, 72]],
    r7: [['token', 'x - mod(x, 29) + 34'], ['rice', 48], ['claude', 2]],
    r8: [['claude', 3], ['user', 'abs(x - 1200) < 400 || x % 11 == 4', 95, 82]],
    r9: [['user', 'reverseNum(x) % 4 == 0 && x > 500', 100, 88]],
    r10: [['rice', 67]],
    r11: [['token', 'floor(x / 5) + min(x, 320)'], ['rice', 59]],
    r12: [['claude', 2], ['rice', 72], ['user', 'max(x, 600) > 1000 && digitSum(x) % 4 == 1', 110, 95]],
    r13: [['token', 'x + digitSum(x) * 11'], ['rice', 63]],
    r14: [['user', '(x % 12 == 9 && x > 800) || x > 2000', 120, 100]],
    r15: [['rice', 88], ['bowl', 35]],
    r16: [['claude', 2], ['rice', 96]],
    r17: [['goal']]
  });
  G.levelSpecs.push({
    id: 18, name: '枢纽迷城', subtitle: '第三幕 · 收官', tier: '收官',
    size: [95, 76], sizeClass: '>75x75', seed: 18018,
    hint: '四个枢纽互相咬合：先想清楚走哪条环线，再决定每一步吃多少',
    intro: [
      { key: 'l18_mesh', new: true, title: '新拓扑：枢纽网', icon: 'door',
        desc: '四个五连枢纽彼此相连，路线是一个可以绕行的网。走错环线不会死，但会白吃一堆饭把数值顶高，反而过不了后面的门。',
        formula: '北 ⇄ 中央 ⇄ 南　西 ⇄ 中央 ⇄ 东' },
      { key: 'l18_cond', new: true, title: '条件大合集', icon: 'user',
        desc: '余数、数位、反转数、区间判断全都会出现，先算函数再判真假。',
        formula: 'reverseNum(x) % 4 == 0 && x > 500' }
    ],
    tips: ['四通枢纽是网状的：绕远路会多吃白饭，反而更难', '门的门槛是"极限值"，能过就立刻过，别恋战', '高价值白饭留给倍率，低价值的随时吃'],
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: r18,
    links: [
      link('r0', 'r1', { op: 'sub', amount: 12, label: '减法门' }),
      link('r1', 'r2', { op: 'expr', expr: 'x - 35 - mod(x, 17)', label: '余数门' }),
      link('r2', 'r3', { op: 'sub', amount: 42, label: '减法门' }),
      link('r3', 'r4', { op: 'expr', expr: 'min(x - 80, floor(x / 3) + 25)', label: 'min 门' }),
      link('r0', 'r5', { op: 'sub', amount: 16, label: '减法门' }),
      link('r5', 'r6', { op: 'div', divisor: 2, label: '除法门' }),
      link('r1', 'r6', { op: 'sub', amount: 36, label: '减法门' }),
      link('r6', 'r7', { op: 'expr', expr: 'max(x - 180, floor(x / 4))', label: 'max 门' }),
      link('r2', 'r7', { op: 'sub', amount: 50, label: '减法门' }),
      link('r7', 'r8', { op: 'sub', amount: 58, label: '减法门' }),
      link('r3', 'r8', { op: 'expr', expr: 'x - gcd(x, 120) - 25', label: '公约门' }),
      link('r8', 'r9', { op: 'sub', amount: 64, label: '减法门' }),
      link('r5', 'r10', { op: 'sub', amount: 20, label: '减法门' }),
      link('r10', 'r11', { op: 'expr', expr: 'clamp(x - 90, 1, 99999)', label: '封顶门' }),
      link('r11', 'r12', { op: 'sub', amount: 70, label: '减法门' }),
      link('r6', 'r11', { op: 'expr', expr: 'if(x > 700, x - 260, floor(x / 4) + 15)', label: '分支门' }),
      link('r7', 'r12', { op: 'div', divisor: 3, label: '除法门' }),
      link('r12', 'r13', { op: 'sub', amount: 76, label: '减法门' }),
      link('r8', 'r13', { op: 'expr', expr: 'min(x - 120, floor(x / 5) + 40)', label: 'min 门' }),
      link('r13', 'r14', { op: 'sub', amount: 82, label: '减法门' }),
      link('r10', 'r15', { op: 'sub', amount: 44, label: '减法门' }),
      link('r13', 'r16', { op: 'expr', expr: 'max(x - 240, floor(x / 6))', label: 'max 门' }),
      link('r16', 'r17', { op: 'sub', amount: 90, label: '终点前门' }),
      link('r14', 'r17', { op: 'expr', expr: 'x - 100 - digitSum(x) * 2', label: '终点前门' })
    ],
    elements: e18,
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'r0_rice1', 'door_r0_r5', 'door_r5_r6', 'door_r6_r7', 'r5_rice1', 'r7_rice1', 'r0_rice2', 'r6_claude1',
      'r5_claude1', 'r7_claude1', 'door_r0_r1', 'r1_claude1', 'door_r7_r8', 'r8_claude1', 'door_r6_r11',
      'door_r11_r12', 'r12_claude1', 'door_r12_r13', 'door_r13_r16', 'r16_claude1', 'r12_rice1', 'r13_rice1',
      'door_r5_r10', 'r13_token1', 'r11_rice1', 'r8_user1', 'r16_rice1', 'r12_user1', 'r6_user1',
      'door_r10_r15', 'r15_rice1', 'r10_rice1', 'door_r3_r8', 'r3_rice1', 'r7_token1', 'r3_token1',
      'r1_rice1', 'door_r1_r2', 'r2_user1', 'door_r13_r14', 'r14_user1', 'r15_bowl1', 'r2_bowl1',
      'door_r16_r17', 'r17_goal1'
    ]
  });

})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
