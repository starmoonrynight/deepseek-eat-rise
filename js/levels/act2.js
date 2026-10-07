/* ─────────────────────────────────────────────────────────────
   act2.js —— 第 7~12 关关卡数据（第二幕：中转站迷宫 → 地狱中转站）
   ------------------------------------------------------------------
   纯数据 spec。构建交给 js/map.js 的 buildLevel(spec)，校验交给 js/verify.js。

   四条约定的写法：
   1) 终点（goal / hidden）与大部分中转站门的 req 写字符串 'auto'：
      加载器按 solution 跑一遍最优解，把「到达该元素时的真实数值」写成门槛。
      · 门：默认取到达值的 80%（即 req = floor(到达值 * 0.8)），可用 reqFrac 调
      · 终点：reqFrac:1，门槛就是最优值本身（策划案第 9 节要求）
      · hidden：req 与 reveal 都写 'auto' —— 规范里 reveal 必须 ≥ req，
        而「按最优解必须真的能通关」又要求 reveal ≤ 到达值 = req，
        所以二者只能相等，即「数值刚好够通关时才显形」。
        注意 revealFrac 默认是 0.5（会低于 req 而校验报错），
        本关显式写 reqFrac:1 + revealFrac:1，让显形值 = 通关门槛 = 最优值。
   2) 每关至少 3 扇门写死具体数字（req 为数字），方便策划随时调难度。
   3) 房间元素密度用 fill 顶到 (10%, 30%)；特殊元素多的房间用 rooms[i].fill 单独调低。
      密度公式：房间元素数 = 特殊元素数 + (round(地板格数 * density) - 特殊元素数)
                = round(地板格数 * density)，只要没被「留白格」挤满，就一定落在 density 附近。
   4) solution 顺序的硬规则：一扇门必须紧贴在「它后面那个房间的元素」之前。
      校验器把未消耗的非填充元素当障碍，而门正好卡在 1 格宽的走廊上，
      顺序写反（先写门后面的元素、再写门）会让 A* 找不到路，整关判不可通关。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';
  G.levelSpecs = G.levelSpecs || [];

  /* ── 通用小工具：按「列起点 / 行起点」网格批量摆房间 ─────────
     cols/rows 是各列/行的绝对坐标，list 里只写 (c, r) 网格下标；
     需要微调时也可以直接写 at:[x,y] 覆盖（同一格放两个房间会重叠，禁止）。
     房间间隔由 cols/rows 的间距保证（全部 ≥ 3 格）。 ── */
  function gridRooms(cols, rows, list) {
    var out = [], i, d, r;
    for (i = 0; i < list.length; i++) {
      d = list[i];
      r = {
        id: d.id, name: d.name, shape: d.shape,
        at: d.at ? [d.at[0], d.at[1]] : [cols[d.c], rows[d.r]],
        wh: d.wh
      };
      if (d.k) { r.k = d.k; }
      if (d.seed) { r.seed = d.seed; }
      if (d.cuts) { r.cuts = d.cuts; }
      if (d.fill) { r.fill = d.fill; }
      out.push(r);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     第 7 关 · 中转站迷宫 · 46×46 · 初级
     ─────────────────────────────────────────────────────────
     新机制：多门链 / 一个房间两个门。

     最优解：rice_a(+3) → rice_b(+5) → door_0_1(≥6,−3) → claude_a(×2) → rice_c(+8)
             → door_1_2(≥14,−6) → token_a(x+16) → door_2_5(≥18,÷2) → user_a(x≥12,+14)
             → door_5_4(−9) → claude_b(×3) → bowl_b(+6) → door_4_3(−11) → token_b(x−4)
             → rice_d(+9) → door_3_6(−15) → claude_c(×2) → door_6_7(÷2) → rice_e(+10)
             → door_7_8(−12) → goal(≈43)
     手算：1 +3=4 +5=9 −3=6 ×2=12 +8=20 −6=14 +16=30 ÷2=15 (15≥12)+14=29 −9=20
             ×3=60 +6=66 −11=55 −4=51 +9=60 −15=45 ×2=90 ÷2=45 +10=55 −12=43
     终点门槛 = 到达值 ≈ 43（沿途顺手吃掉的白饭会再抬高一点，由 'auto' 自动定死）。

     房间 9 个（矩形 12×10 / 圆角 12×12 / 正方形 8×8 / 十字 / 菱形 / 加号 / 挖角 12×10
     / 小仓库 8×8 / 十字 9×10），门 8 扇，其中 3 扇写死数字（6 / 14 / 18）。
     地板格与密度：r0 120→16% r1 120→16% r2 64→16% r3 96→16% r4 68→16%
                   r5 96→16% r6 104→16% r7 64→16% r8 48→17%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 7,
    name: '中转站迷宫',
    subtitle: '第二幕 · 初级',
    tier: '初级',
    size: [46, 46],
    sizeClass: '>40x40',
    seed: 7007,
    hint: '一个房间可以有两个门：先想好顺序，再撞门',
    intro: [
      {
        key: 'l7_door_chain', new: true, title: '新机制：多门链', icon: 'door',
        desc: '房间之间靠中转站门连接，一个房间可以有两个门。门通过就消失，走错顺序只能按 R 重开。',
        formula: 'r0 → r1 → r2 → … → 终点'
      },
      {
        key: 'l7_token', new: true, title: 'token：直接改写数值', icon: 'token',
        desc: 'token 不听你现在的数值，直接把数值改写成表达式的结果——它是唯一能把数值拉回正轨的工具。',
        formula: 'x = x + 16'
      }
    ],
    tips: [
      '第一扇门只要凑够门槛就能过，前厅不必吃空',
      '「先开小门、回头再吃」是本关的正解：门开了就一直是通路',
      '留下的高价值白饭，等后面的倍率吃到手再回来吃最划算'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', shape: 'rect', at: [2, 2], wh: [12, 10] },
      { id: 'r1', name: '米饭仓', shape: 'round', at: [20, 2], wh: [12, 12], k: 3 },
      { id: 'r2', name: '小灶台', shape: 'rect', at: [37, 2], wh: [8, 8] },
      { id: 'r3', name: '倍乘间', shape: 'plus', at: [2, 18], wh: [14, 12] },
      { id: 'r4', name: '中点站', shape: 'diamond', at: [20, 18], wh: [14, 12] },
      { id: 'r5', name: '用户室', shape: 'rect', at: [37, 18], wh: [8, 12] },
      { id: 'r6', name: '减法井', shape: 'rect', at: [2, 34], wh: [12, 10], cuts: [{ at: [0, 0], wh: [4, 4] }] },
      { id: 'r7', name: '小仓库', shape: 'rect', at: [20, 34], wh: [8, 8] },
      { id: 'r8', name: '终点塔', shape: 'cross', at: [36, 34], wh: [9, 10] }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 3, req: 'auto', label: '第一道门' } },
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'sub', amount: 6, req: 'auto', label: '第二道门' } },
      { a: 'r2', b: 'r5', door: { id: 'door_2_5', type: 'door', op: 'div', divisor: 2, req: 'auto', label: '除法门' } },
      { a: 'r5', b: 'r4', door: { id: 'door_5_4', type: 'door', op: 'sub', amount: 9, req: 'auto' } },
      { a: 'r4', b: 'r3', door: { id: 'door_4_3', type: 'door', op: 'sub', amount: 11, req: 'auto' } },
      { a: 'r3', b: 'r6', door: { id: 'door_3_6', type: 'door', op: 'sub', amount: 15, req: 'auto' } },
      { a: 'r6', b: 'r7', door: { id: 'door_6_7', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'sub', amount: 12, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [8, 2], type: 'rice', value: 3 },
      { id: 'rice_b', room: 'r0', at: [3, 6], type: 'rice', value: 5 },
      { id: 'claude_a', room: 'r1', at: [5, 5], type: 'claude', factor: 2 },
      { id: 'rice_c', room: 'r1', at: [7, 7], type: 'rice', value: 8 },
      { id: 'token_a', room: 'r2', at: [3, 3], type: 'token', expr: 'x + 16' },
      { id: 'user_a', room: 'r5', at: [2, 5], type: 'user', cond: 'x >= 12', bonus: 14, penalty: 6 },
      { id: 'claude_b', room: 'r4', at: [6, 6], type: 'claude', factor: 3 },
      { id: 'bowl_b', room: 'r4', at: [8, 6], type: 'bowl_rice', value: 6 },
      { id: 'token_b', room: 'r3', at: [6, 6], type: 'token', expr: 'x - 4' },
      { id: 'rice_d', room: 'r3', at: [6, 9], type: 'rice', value: 9 },
      { id: 'claude_c', room: 'r6', at: [6, 5], type: 'claude', factor: 2 },
      { id: 'rice_e', room: 'r7', at: [4, 4], type: 'rice', value: 10 },
      { id: 'goal', room: 'r8', at: [4, 5], type: 'goal', req: 'auto', reqFrac: 1 }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a', 'door_0_1', 'rice_c', 'door_1_2', 'door_2_5', 'token_a', 'user_a', 'door_5_4', 'bowl_b',
      'door_4_3', 'door_3_6', 'door_6_7', 'rice_e', 'rice_d', 'claude_a', 'rice_b', 'claude_b', 'claude_c',
      'door_7_8', 'goal'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 8 关 · 复利走廊 · 48×48 · 初级
     ─────────────────────────────────────────────────────────
     新机制：round / min / max 等函数进入 token 与终点门。

     最优解：rice_a(+4) → claude_a(×2) → door_0_1(≥8,−3) → token_a(max(x,12)+3)
             → door_1_2(≥13,−5) → claude_b(×2) → door_2_5(≥18,−7) → user_a(x≥12,+9)
             → door_5_4(−8) → token_b(min(x*3,60)) → door_4_3(−12) → claude_c(×2)
             → rice_b(+9) → door_3_6(−20) → token_c(round(x/5)*5) → bowl_a(+6)
             → door_6_7(−15) → token_d(max(x,40)+8) → door_7_8(÷2) → goal(≈24)
     手算：1 +4=5 ×2=10 −3=7 →(max 12)+3=15 −5=10 ×2=20 −7=13 (13≥12)+9=22 −8=14
             →min(42,60)=42 −12=30 ×2=60 +9=69 −20=49 →round(49/5)*5=9*5=45
             +6=51 −15=36 →max(36,40)+8=48 ÷2=24 → 终点 24
     终点门槛 = 24（op 再把数值抹成 5 的倍数，只是好看，判定用进门前那一下）。

     房间 9 个，门 8 扇，3 扇写死数字（8 / 13 / 18）。
     地板格与密度：r0 144→16% r1 120→16% r2 94→16% r3 80→16% r4 60→17%
                   r5 88→16% r6 120→16% r7 64→16% r8 100→16%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 8,
    name: '复利走廊',
    subtitle: '第二幕 · 初级',
    tier: '初级',
    size: [48, 48],
    sizeClass: '>40x40',
    seed: 8008,
    hint: '函数 token 会直接改写数值：顺序错了就回不来',
    intro: [
      {
        key: 'l8_fn_round', new: true, title: '新函数：round / min / max', icon: 'token',
        desc: 'token 的表达式里可以用 round / min / max 等函数：把数值凑成整十整五、封个顶、抬个底，都是这一关的解法。',
        formula: 'x = round(x / 5) * 5'
      },
      {
        key: 'l8_goal_expr', new: true, title: '终点门也能写表达式', icon: 'goal',
        desc: '终点门只检查「走到门口时」的数值；进门之后再套一次表达式，纯属好看，不影响通关判定。',
        formula: 'x ≥ 门槛 → x = min(x, 9999) − mod(x, 5)'
      }
    ],
    tips: [
      '倍乘要留给后面的大额白饭：先拿倍率，再回头吃前面的饭',
      'token 不看你现在多少，进门顺序错了数值就崩',
      '终点门槛就是最优解的数值，差一点都进不去'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: gridRooms([2, 18, 34], [2, 18, 34], [
      { id: 'r0', name: '复利厅', shape: 'rect', c: 0, r: 0, wh: [12, 12] },
      { id: 'r1', name: '函数铺', shape: 'round', c: 1, r: 0, wh: [12, 12], k: 3 },
      { id: 'r2', name: '小算盘', shape: 'rect', c: 2, r: 0, wh: [12, 12], cuts: [{ at: [0, 0], wh: [5, 5] }, { at: [7, 7], wh: [5, 5] }] },
      { id: 'r3', name: '倍率谷', shape: 'plus', c: 0, r: 1, wh: [12, 12] },
      { id: 'r4', name: '中转芯', shape: 'diamond', c: 1, r: 1, wh: [12, 12] },
      { id: 'r5', name: '用户岗', shape: 'round', c: 2, r: 1, wh: [10, 10], k: 2 },
      { id: 'r6', name: '减法廊', shape: 'rect', c: 0, r: 2, wh: [12, 10] },
      { id: 'r7', name: '小转运', shape: 'rect', c: 1, r: 2, wh: [8, 8] },
      { id: 'r8', name: '终点阁', shape: 'rect', c: 2, r: 2, wh: [10, 10] }
    ]),
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 3, req: 'auto', label: '减法门' } },
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'sub', amount: 5, req: 'auto', label: '减法门' } },
      { a: 'r2', b: 'r5', door: { id: 'door_2_5', type: 'door', op: 'sub', amount: 7, req: 'auto', label: '减法门' } },
      { a: 'r5', b: 'r4', door: { id: 'door_5_4', type: 'door', op: 'sub', amount: 8, req: 'auto' } },
      { a: 'r4', b: 'r3', door: { id: 'door_4_3', type: 'door', op: 'sub', amount: 12, req: 'auto' } },
      { a: 'r3', b: 'r6', door: { id: 'door_3_6', type: 'door', op: 'sub', amount: 20, req: 'auto' } },
      { a: 'r6', b: 'r7', door: { id: 'door_6_7', type: 'door', op: 'sub', amount: 15, req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'div', divisor: 2, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [4, 2], type: 'rice', value: 4 },
      { id: 'claude_a', room: 'r0', at: [8, 7], type: 'claude', factor: 2 },
      { id: 'token_a', room: 'r1', at: [6, 6], type: 'token', expr: 'max(x, 12) + 3' },
      { id: 'claude_b', room: 'r2', at: [6, 6], type: 'claude', factor: 2 },
      { id: 'user_a', room: 'r5', at: [4, 4], type: 'user', cond: 'x >= 12', bonus: 9, penalty: 9 },
      { id: 'token_b', room: 'r4', at: [5, 5], type: 'token', expr: 'min(x * 3, 60)' },
      { id: 'claude_c', room: 'r3', at: [5, 5], type: 'claude', factor: 2 },
      { id: 'rice_b', room: 'r3', at: [7, 7], type: 'rice', value: 9 },
      { id: 'token_c', room: 'r6', at: [3, 3], type: 'token', expr: 'round(x / 5) * 5' },
      { id: 'bowl_a', room: 'r6', at: [8, 6], type: 'bowl_rice', value: 6 },
      { id: 'token_d', room: 'r7', at: [3, 3], type: 'token', expr: 'max(x, 40) + 8' },
      { id: 'goal', room: 'r8', at: [5, 5], type: 'goal', req: 'auto', reqFrac: 1, op: 'expr', expr: 'min(x, 9999) - mod(x, 5)' }
    ],
    start: { room: 'r0', at: [1, 1] },
    solution: [
      'rice_a', 'door_0_1', 'token_a', 'claude_a', 'door_1_2', 'door_2_5', 'user_a', 'door_5_4', 'token_b',
      'door_4_3', 'door_3_6', 'door_6_7', 'door_7_8', 'token_d', 'rice_b', 'bowl_a', 'claude_b', 'claude_c',
      'goal'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 9 关 · 深水区 · 54×54 · 中级
     ─────────────────────────────────────────────────────────
     新机制：clamp / 复杂运算门链（门的 op 写 expr，结果照样一定减少）。

     最优解：rice_a(+6) → rice_b(+6) → claude_a(×3) → door_0_1(≥30,−12)
             → token_a(x*2+5) → bowl_a(+8) → door_1_2(≥62, clamp(x,0,50))
             → claude_b(×2) → door_2_3(≥90,−25) → rice_c(+15) → door_3_6(÷3)
             → user_a(x≥25,+20) → token_b(max(x,45)+12) → door_6_5(x/3+12)
             → claude_c(×4) → door_5_4(clamp(x,0,90)) → rice_d(+25) → door_4_7(−40)
             → claude_d(×2) → rice_e(+18) → door_7_8(÷4) → door_8_9(−20) → goal(≈22)
     手算：1 +6=7 +6=13 ×3=39 −12=27 ×2+5=59 +8=67 →clamp(67,0,50)=50 ×2=100
             −25=75 +15=90 ÷3=30 (30≥25)+20=50 →max(50,45)+12=62 →62/3+12=20+12=32
             ×4=128 →clamp=90 +25=115 −40=75 ×2=150 +18=168 ÷4=42 −20=22
     终点门槛 = 22。
     注意 door_5_4：门槛 ≈102 > 封顶 90，所以「结果一定减少」成立（任何 x ≥ 102 都变成 90）。

     房间 10 个（含一个 blob「珊瑚洞」纯过道、不放元素，只铺饭），门 9 扇，
     3 扇写死数字（30 / 62 / 90）。
     地板格与密度：r0 168→16% r1 172→16% r2 70→16% r3 70→16% r4 115→16%
                   r5 84→16% r6 96→16% r7 182→16% r8 blob→16% r9 196→16%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 9,
    name: '深水区',
    subtitle: '第二幕 · 中级',
    tier: '中级',
    size: [54, 54],
    sizeClass: '>50x50',
    seed: 9009,
    hint: '复杂运算门会重写数值：进门前先算清楚出来是多少',
    intro: [
      {
        key: 'l9_fn_clamp', new: true, title: '新函数：clamp（封顶）', icon: 'token',
        desc: 'clamp(x, 0, 90) 把数值夹在上下限之间。数值超过上限时会被压到上限——所以「封顶门」是数值越高亏得越多的门。',
        formula: 'clamp(140, 0, 90) = 90'
      },
      {
        key: 'l9_door_expr', new: true, title: '新门型：复杂运算门', icon: 'door',
        desc: '门的 op 也可以是表达式：x / 3 + 12、clamp(x, 0, 90)……门槛照样要达标，通过后数值照样一定减少。',
        formula: 'x ≥ 62 → x = clamp(x, 0, 50)'
      }
    ],
    tips: [
      '深水区房间大，白饭多，但别贪——门会把多余的抹掉',
      'clamp 门是封顶：进去多少不重要，出来永远是上限',
      '铁盆能挡一次失败，但门不会消失，别指望它替你过门'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: gridRooms([2, 20, 38], [2, 20, 38], [
      { id: 'r0', name: '浅滩', shape: 'rect', c: 0, r: 0, wh: [14, 12], fill: { density: 0.13 } },
      { id: 'r1', name: '函数池', shape: 'round', c: 1, r: 0, wh: [14, 14], k: 3 },
      { id: 'r2', name: '上浮台', shape: 'rect', at: [38, 2], wh: [14, 5] },
      { id: 'r3', name: '减压舱', shape: 'rect', at: [38, 11], wh: [14, 5] },
      { id: 'r4', name: '倍率礁', shape: 'plus', c: 0, r: 1, wh: [14, 14] },
      { id: 'r5', name: '钳位渊', shape: 'diamond', c: 1, r: 1, wh: [14, 14] },
      { id: 'r6', name: '十字流', shape: 'cross', c: 2, r: 1, wh: [14, 14] },
      { id: 'r7', name: '深渊口', shape: 'rect', c: 0, r: 2, wh: [14, 13] },
      { id: 'r8', name: '珊瑚洞', shape: 'blob', c: 1, r: 2, wh: [14, 14], seed: 91 },
      { id: 'r9', name: '海底门', shape: 'rect', c: 2, r: 2, wh: [14, 14] }
    ]),
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 12, req: 'auto', label: '减法门' } },
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'expr', expr: 'clamp(x, 0, 50)', req: 'auto', label: '封顶门' } },
      { a: 'r2', b: 'r3', door: { id: 'door_2_3', type: 'door', op: 'sub', amount: 25, req: 'auto', label: '减法门' } },
      { a: 'r3', b: 'r6', door: { id: 'door_3_6', type: 'door', op: 'div', divisor: 3, req: 'auto' } },
      { a: 'r6', b: 'r5', door: { id: 'door_6_5', type: 'door', op: 'expr', expr: 'x / 3 + 12', req: 'auto' } },
      { a: 'r5', b: 'r4', door: { id: 'door_5_4', type: 'door', op: 'expr', expr: 'clamp(x, 0, 90)', req: 'auto' } },
      { a: 'r4', b: 'r7', door: { id: 'door_4_7', type: 'door', op: 'sub', amount: 40, req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'div', divisor: 4, req: 'auto' } },
      { a: 'r8', b: 'r9', door: { id: 'door_8_9', type: 'door', op: 'sub', amount: 20, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [4, 2], type: 'rice', value: 6 },
      { id: 'rice_b', room: 'r0', at: [9, 2], type: 'rice', value: 6 },
      { id: 'claude_a', room: 'r0', at: [6, 7], type: 'claude', factor: 3 },
      { id: 'token_a', room: 'r1', at: [5, 5], type: 'token', expr: 'x * 2 + 5' },
      { id: 'bowl_a', room: 'r1', at: [9, 8], type: 'bowl_rice', value: 8 },
      { id: 'claude_b', room: 'r2', at: [6, 2], type: 'claude', factor: 2 },
      { id: 'rice_c', room: 'r3', at: [7, 2], type: 'rice', value: 15 },
      { id: 'user_a', room: 'r6', at: [6, 6], type: 'user', cond: 'x >= 25', bonus: 20, penalty: 15 },
      { id: 'token_b', room: 'r6', at: [6, 9], type: 'token', expr: 'max(x, 45) + 12' },
      { id: 'claude_c', room: 'r5', at: [6, 6], type: 'claude', factor: 4 },
      { id: 'rice_d', room: 'r4', at: [6, 6], type: 'rice', value: 25 },
      { id: 'claude_d', room: 'r7', at: [6, 6], type: 'claude', factor: 2 },
      { id: 'rice_e', room: 'r7', at: [10, 8], type: 'rice', value: 18 },
      { id: 'goal', room: 'r9', at: [6, 7], type: 'goal', req: 'auto', reqFrac: 1 }
    ],
    start: { room: 'r0', at: [1, 1] },
    solution: [
      'rice_a', 'rice_b', 'claude_a', 'door_0_1', 'token_a', 'door_1_2', 'door_2_3', 'door_3_6', 'rice_c',
      'door_6_5', 'bowl_a', 'user_a', 'claude_b', 'door_5_4', 'door_4_7', 'door_7_8', 'token_b', 'rice_d',
      'rice_e', 'claude_c', 'claude_d', 'door_8_9', 'goal'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 10 关 · 数值回廊 · 62×62 · 中级
     ─────────────────────────────────────────────────────────
     新机制：mod（取模，结果非负）+ 陷阱式用户条件（数值太高反而不满足）。

     最优解：rice_a(+5) → rice_b(+5) → claude_a(×2) → door_0_1(≥18,−4)
             → user_a(x≥12,+12) → rice_c(+10) → door_1_2(≥35, x−20−mod(x,32))
             → token_a(x*3+6) → claude_b(×3) → door_2_3(≥80,−30) → token_b(x−15)
             → door_3_4(x−12−mod(x,7)) → user_b(x≥20,+25) → door_4_5(−15)
             → token_c(mod(x,26)+40) → rice_d(+6) → door_5_6(÷2) → claude_c(×4)
             → door_6_7(clamp(x,0,60)) → user_c(x≤80,+30) → door_7_8(−35)
             → token_d(x+mod(x,10)) → door_8_9(x/3+10) → claude_e(×3) → rice_e(+11)
             → door_9_10(−45) → token_e(max(x,60)+25) → door_10_11(x−mod(x,13)−20)
             → goal(≈58)
     手算：1 +5=6 +5=11 ×2=22 −4=18 (18≥12)+12=30 +10=40 →40−20−mod(40,32)=40−20−8=12
             →12×3+6=42 ×3=126 −30=96 −15=81 →81−12−mod(81,7)=81−12−4=65 (65≥20)+25=90
             −15=75 →mod(75,26)=23+40=63 +6=69 ÷2=34 ×4=136 →clamp(x,0,60)=60 (60≤80)+30=90
             −35=55 →55+mod(55,10)=55+5=60 →60/3+10=30 ×3=90 +11=101
             −45=56 →max(56,60)+25=85 →85−mod(85,13)−20=85−7−20=58
     终点门槛 = 58。
     三个 user 里只有 user_c 是「x ≤ 某数」的陷阱，它紧跟在 clamp(x,0,60) 后面：
     到达值恒为 60 出头，只有把这个房间的白饭吃太多才会被顶过 80 挨罚。
     user_a / user_b 改用 x ≥ N 的单调条件（数值只会越吃越高，必定满足），
     这样「沿途顺手吃掉的白饭」不会把后面的数值链搞崩。
     door_1_2 特意写成 x−20−mod(x,32)：x−mod(x,32) 在 x∈[32,63] 恒等于 32，
     到达值被饭抬高几十点也只会改变商的档位、不会乱跳；
     裸的 mod(x,32) 会把 64 削成 0，进门就直接判负。

     房间 12 个，门 11 扇，3 扇写死数字（18 / 35 / 80）。
     地板格与密度：r0 132→16% r1 97→16% r2 132→16% r3 61→16% r4 132→16%
                   r5 76→16% r6 132→16% r7 116→16% r8 132→16% r9 109→16%
                   r10 132→16% r11 57→16%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 10,
    name: '数值回廊',
    subtitle: '第二幕 · 中级',
    tier: '中级',
    size: [62, 62],
    sizeClass: '>50x50',
    seed: 1010,
    hint: 'x ≤ 数字 的用户专治贪吃：够过门就行',
    intro: [
      {
        key: 'l10_fn_mod', new: true, title: '新函数：mod（取模，结果非负）', icon: 'token',
        desc: 'mod(x, 32) 是 x 除以 32 的余数，永远非负。它能把大数值一刀削成余数，是「余数门」的核心。',
        formula: 'mod(40, 32) = 8'
      },
      {
        key: 'l10_user_trap', new: true, title: '陷阱式用户条件', icon: 'user',
        desc: '用户的判断可以写成「x ≤ 某个数」：数值太高反而不满足条件，会被扣数值。贪吃是要还的。',
        formula: '(x <= 80) → +30，否则 −30'
      }
    ],
    tips: [
      '每扇门出来剩多少，先算清楚再决定吃几粒饭',
      'x <= 数字 的用户会惩罚贪吃的人',
      'mod 门把大数值削成余数，别指望硬闯'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: gridRooms([2, 17, 32, 47], [4, 21, 38], [
      { id: 'r0', name: '回廊口', shape: 'rect', c: 0, r: 0, wh: [11, 12], fill: { density: 0.13 } },
      { id: 'r1', name: '余数铺', shape: 'round', c: 1, r: 0, wh: [11, 11], k: 3 },
      { id: 'r2', name: '三倍间', shape: 'rect', c: 2, r: 0, wh: [11, 12] },
      { id: 'r3', name: '菱角台', shape: 'diamond', c: 3, r: 0, wh: [11, 11] },
      { id: 'r4', name: '用户廊', shape: 'rect', c: 3, r: 1, wh: [11, 12] },
      { id: 'r5', name: '加号舱', shape: 'plus', c: 2, r: 1, wh: [11, 12] },
      { id: 'r6', name: '四倍厅', shape: 'rect', c: 1, r: 1, wh: [11, 12] },
      { id: 'r7', name: '缺角房', shape: 'rect', c: 0, r: 1, wh: [11, 12], cuts: [{ at: [0, 0], wh: [4, 4] }] },
      { id: 'r8', name: '末位室', shape: 'rect', c: 0, r: 2, wh: [11, 12] },
      { id: 'r9', name: '圆角堂', shape: 'round', c: 1, r: 2, wh: [11, 11], k: 2 },
      { id: 'r10', name: '封顶台', shape: 'rect', c: 2, r: 2, wh: [11, 12] },
      { id: 'r11', name: '十字终', shape: 'cross', c: 3, r: 2, wh: [11, 11] }
    ]),
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 4, req: 'auto', label: '减法门' } },
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'expr', expr: 'x - 20 - mod(x, 32)', req: 'auto', label: '余数门' } },
      { a: 'r2', b: 'r3', door: { id: 'door_2_3', type: 'door', op: 'sub', amount: 30, req: 'auto', label: '减法门' } },
      { a: 'r3', b: 'r4', door: { id: 'door_3_4', type: 'door', op: 'expr', expr: 'x - 12 - mod(x, 7)', req: 'auto' } },
      { a: 'r4', b: 'r5', door: { id: 'door_4_5', type: 'door', op: 'sub', amount: 15, req: 'auto' } },
      { a: 'r5', b: 'r6', door: { id: 'door_5_6', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r6', b: 'r7', door: { id: 'door_6_7', type: 'door', op: 'expr', expr: 'clamp(x, 0, 60)', req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'sub', amount: 35, req: 'auto' } },
      { a: 'r8', b: 'r9', door: { id: 'door_8_9', type: 'door', op: 'expr', expr: 'x / 3 + 10', req: 'auto' } },
      { a: 'r9', b: 'r10', door: { id: 'door_9_10', type: 'door', op: 'sub', amount: 45, req: 'auto' } },
      { a: 'r10', b: 'r11', door: { id: 'door_10_11', type: 'door', op: 'expr', expr: 'x - mod(x, 13) - 20', req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [3, 2], type: 'rice', value: 5 },
      { id: 'rice_b', room: 'r0', at: [7, 2], type: 'rice', value: 5 },
      { id: 'claude_a', room: 'r0', at: [5, 8], type: 'claude', factor: 2 },
      { id: 'user_a', room: 'r1', at: [4, 4], type: 'user', cond: 'x >= 12', bonus: 12, penalty: 12 },
      { id: 'rice_c', room: 'r1', at: [7, 6], type: 'rice', value: 10 },
      { id: 'token_a', room: 'r2', at: [3, 3], type: 'token', expr: 'x * 3 + 6' },
      { id: 'claude_b', room: 'r2', at: [7, 8], type: 'claude', factor: 3 },
      { id: 'token_b', room: 'r3', at: [5, 5], type: 'token', expr: 'x - 15' },
      { id: 'user_b', room: 'r4', at: [5, 5], type: 'user', cond: 'x >= 20', bonus: 25, penalty: 25 },
      { id: 'token_c', room: 'r5', at: [4, 5], type: 'token', expr: 'mod(x, 26) + 40' },
      { id: 'rice_d', room: 'r5', at: [5, 7], type: 'rice', value: 6 },
      { id: 'claude_c', room: 'r6', at: [5, 6], type: 'claude', factor: 4 },
      { id: 'user_c', room: 'r7', at: [6, 6], type: 'user', cond: 'x <= 80', bonus: 30, penalty: 30 },
      { id: 'token_d', room: 'r8', at: [5, 5], type: 'token', expr: 'x + mod(x, 10)' },
      { id: 'claude_e', room: 'r9', at: [4, 4], type: 'claude', factor: 3 },
      { id: 'rice_e', room: 'r9', at: [7, 7], type: 'rice', value: 11 },
      { id: 'token_e', room: 'r10', at: [5, 5], type: 'token', expr: 'max(x, 60) + 25' },
      { id: 'goal', room: 'r11', at: [5, 5], type: 'goal', req: 'auto', reqFrac: 1 }
    ],
    start: { room: 'r0', at: [1, 1] },
    solution: [
      'rice_a', 'door_0_1', 'rice_c', 'rice_b', 'claude_a', 'door_1_2', 'user_a', 'claude_b', 'door_2_3',
      'door_3_4', 'door_4_5', 'door_5_6', 'token_c', 'user_b', 'door_6_7', 'door_7_8', 'door_8_9', 'user_c',
      'token_a', 'rice_e', 'claude_e', 'rice_d', 'claude_c', 'door_9_10', 'door_10_11', 'token_e', 'token_d',
      'goal'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 11 关 · 高塔之门 · 78×78 · 高级
     ─────────────────────────────────────────────────────────
     新机制：digitSum（数位和）/ gcd（最大公约数）；16 个房间的长链路。

     最优解：rice_a(+7) → rice_b(+9) → claude_a(×2) → door_0_1(≥30,−10)
             → token_a(x+digitSum(x)*2) → door_1_2(≥34, x−digitSum(x))
             → claude_b(×3) → door_2_3(≥70,−25) → rice_c(+12)
             → door_3_4(x−gcd(x,36)) → token_b(x*2−digitSum(x)) → door_4_5(÷2)
             → claude_c(×2) → door_5_6(x−digitSum(x)−20) → user_a(x≥80,+32)
             → door_6_7(x−gcd(x,24)) → token_c(x−digitSum(x)*3) → door_7_8(−20)
             → claude_d(×4) → door_8_9(x−digitSum(x)*4) → user_b(x≥90,+24)
             → door_9_10(x−gcd(x,45)) → rice_d(+18) → door_10_11(÷3)
             → token_d(x*3+7) → door_11_12(x−digitSum(x)*2) → claude_e(×2)
             → door_12_13(−100) → token_e(x/2+60) → door_13_14(x−gcd(x,48))
             → rice_e(+30) → door_14_15(x−digitSum(x)*5) → goal(≈120)
     手算：1 +7=8 +9=17 ×2=34 −10=24 →24+digitSum(24)*2=24+12=36
             →36−digitSum(36)=36−9=27 ×3=81 −25=56 +12=68
             →68−gcd(68,36)=68−4=64 →64*2−digitSum(64)=128−10=118 ÷2=59 ×2=118
             →118−digitSum(118)−20=118−10−20=88 (88≥80)+32=120
             →120−gcd(120,24)=120−24=96 →96−digitSum(96)*3=96−45=51 −20=31
             ×4=124 →124−digitSum(124)*4=124−28=96 (96≤120)+24=120
             →120−gcd(120,45)=120−15=105 +18=123 ÷3=41 →41*3+7=130
             →130−digitSum(130)*2=130−8=122 ×2=244 −100=144 →144/2+60=72+60=132
             →132−gcd(132,48)=132−12=120 +30=150 →150−digitSum(150)*5=150−30=120
     终点门槛 = 120。
     所有含 digitSum / gcd 的门都形如 x − 正数，因此对任意 x ≥ req 都严格减少。

     房间 16 个（矩形 / 圆角 / 缺角 / 菱形 / 加号 / 十字混排），门 15 扇，
     3 扇写死数字（30 / 34 / 70）。
     地板格与密度：196/172/196/171/196/84/115/184/196/96/196/196/171/172/196/196
                   全部 round(F*0.16)/F ≈ 15.5% ~ 16.3%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 11,
    name: '高塔之门',
    subtitle: '第二幕 · 高级',
    tier: '高级',
    size: [78, 78],
    sizeClass: '>75x75',
    seed: 1111,
    hint: '每一步都要算：digitSum 和 gcd 会把你的数值咬掉一块',
    intro: [
      {
        key: 'l11_fn_digitSum', new: true, title: '新函数：digitSum（数位和）', icon: 'token',
        desc: 'digitSum(x) 把十进制各位相加：digitSum(1236) = 12。它让「数值长什么样」变成解谜条件。',
        formula: 'digitSum(1236) = 12'
      },
      {
        key: 'l11_fn_gcd', new: true, title: '新函数：gcd（最大公约数）', icon: 'door',
        desc: 'x − gcd(x, 24)：数值和 24 的公约数越大，被砍掉的越多。有时凑一个「不好看」的数值反而更划算。',
        formula: 'x ≥ 96 → x = x − gcd(x, 24)'
      }
    ],
    tips: [
      '高塔有 16 个房间，先在心里排一遍吃元素的顺序',
      'gcd 门专治「整倍数」：120 过 gcd(x,24) 门会直接掉 24',
      '用户只看数值够不够：该拿的倍乘一个都不能少，也别多贪一口饭'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: gridRooms([3, 22, 41, 60], [3, 22, 41, 60], [
      { id: 'r0', name: '塔基', shape: 'rect', c: 0, r: 0, wh: [14, 14], fill: { density: 0.13 } },
      { id: 'r1', name: '数位厅', shape: 'round', c: 1, r: 0, wh: [14, 14], k: 3 },
      { id: 'r2', name: '三倍台', shape: 'rect', c: 2, r: 0, wh: [14, 14] },
      { id: 'r3', name: '缺角室', shape: 'rect', c: 3, r: 0, wh: [14, 14], cuts: [{ at: [0, 0], wh: [5, 5] }] },
      { id: 'r4', name: '倍乘二台', shape: 'rect', c: 3, r: 1, wh: [14, 14] },
      { id: 'r5', name: '菱心', shape: 'diamond', c: 2, r: 1, wh: [14, 14] },
      { id: 'r6', name: '加号厅', shape: 'plus', c: 1, r: 1, wh: [14, 14] },
      { id: 'r7', name: '圆角回廊', shape: 'round', c: 0, r: 1, wh: [14, 14], k: 2 },
      { id: 'r8', name: '四倍厅', shape: 'rect', c: 0, r: 2, wh: [14, 14] },
      { id: 'r9', name: '十字阶', shape: 'cross', c: 1, r: 2, wh: [14, 14] },
      { id: 'r10', name: '公约台', shape: 'rect', c: 2, r: 2, wh: [14, 14] },
      { id: 'r11', name: '反数间', shape: 'rect', c: 3, r: 2, wh: [14, 14] },
      { id: 'r12', name: '倍率四台', shape: 'rect', c: 3, r: 3, wh: [14, 14], cuts: [{ at: [9, 9], wh: [5, 5] }] },
      { id: 'r13', name: '半程台', shape: 'round', c: 2, r: 3, wh: [14, 14], k: 3 },
      { id: 'r14', name: '塔肩', shape: 'rect', c: 1, r: 3, wh: [14, 14] },
      { id: 'r15', name: '塔顶', shape: 'rect', c: 0, r: 3, wh: [14, 14] }
    ]),
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 10, req: 'auto', label: '减法门' } },
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'expr', expr: 'x - digitSum(x)', req: 'auto', label: '数位门' } },
      { a: 'r2', b: 'r3', door: { id: 'door_2_3', type: 'door', op: 'sub', amount: 25, req: 'auto', label: '减法门' } },
      { a: 'r3', b: 'r4', door: { id: 'door_3_4', type: 'door', op: 'expr', expr: 'x - gcd(x, 36)', req: 'auto' } },
      { a: 'r4', b: 'r5', door: { id: 'door_4_5', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r5', b: 'r6', door: { id: 'door_5_6', type: 'door', op: 'expr', expr: 'x - digitSum(x) - 20', req: 'auto' } },
      { a: 'r6', b: 'r7', door: { id: 'door_6_7', type: 'door', op: 'expr', expr: 'x - gcd(x, 24)', req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'sub', amount: 20, req: 'auto' } },
      { a: 'r8', b: 'r9', door: { id: 'door_8_9', type: 'door', op: 'expr', expr: 'x - digitSum(x) * 4', req: 'auto' } },
      { a: 'r9', b: 'r10', door: { id: 'door_9_10', type: 'door', op: 'expr', expr: 'x - gcd(x, 45)', req: 'auto' } },
      { a: 'r10', b: 'r11', door: { id: 'door_10_11', type: 'door', op: 'div', divisor: 3, req: 'auto' } },
      { a: 'r11', b: 'r12', door: { id: 'door_11_12', type: 'door', op: 'expr', expr: 'x - digitSum(x) * 2', req: 'auto' } },
      { a: 'r12', b: 'r13', door: { id: 'door_12_13', type: 'door', op: 'sub', amount: 20, req: 'auto' } },
      { a: 'r13', b: 'r14', door: { id: 'door_13_14', type: 'door', op: 'expr', expr: 'x - gcd(x, 48)', req: 'auto' } },
      { a: 'r14', b: 'r15', door: { id: 'door_14_15', type: 'door', op: 'expr', expr: 'x - digitSum(x) * 5', req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [3, 2], type: 'rice', value: 7 },
      { id: 'rice_b', room: 'r0', at: [8, 2], type: 'rice', value: 9 },
      { id: 'claude_a', room: 'r0', at: [5, 9], type: 'claude', factor: 2 },
      { id: 'token_a', room: 'r1', at: [5, 5], type: 'token', expr: 'x + digitSum(x) * 2' },
      { id: 'claude_b', room: 'r2', at: [6, 5], type: 'claude', factor: 3 },
      { id: 'rice_c', room: 'r3', at: [7, 7], type: 'rice', value: 12 },
      { id: 'token_b', room: 'r4', at: [6, 6], type: 'token', expr: 'x * 2 - digitSum(x)' },
      { id: 'claude_c', room: 'r5', at: [6, 6], type: 'claude', factor: 2 },
      { id: 'user_a', room: 'r6', at: [6, 6], type: 'user', cond: 'x >= 80', bonus: 32, penalty: 32 },
      { id: 'token_c', room: 'r7', at: [6, 6], type: 'token', expr: 'x - digitSum(x) * 3' },
      { id: 'claude_d', room: 'r8', at: [6, 5], type: 'claude', factor: 4 },
      { id: 'user_b', room: 'r9', at: [6, 6], type: 'user', cond: 'x >= 90', bonus: 24, penalty: 24 },
      { id: 'rice_d', room: 'r10', at: [6, 6], type: 'rice', value: 18 },
      { id: 'token_d', room: 'r11', at: [6, 6], type: 'token', expr: 'x * 3 + 7' },
      { id: 'claude_e', room: 'r12', at: [6, 6], type: 'claude', factor: 2 },
      { id: 'token_e', room: 'r13', at: [6, 6], type: 'token', expr: 'x / 2 + 60' },
      { id: 'rice_e', room: 'r14', at: [6, 6], type: 'rice', value: 30 },
      { id: 'goal', room: 'r15', at: [6, 6], type: 'goal', req: 'auto', reqFrac: 1 }
    ],
    start: { room: 'r0', at: [1, 1] },
    solution: [
      'r0_rice2', 'door_r0_r4', 'door_r4_r8', 'door_r8_r12', 'door_r12_r13', 'r13_token1', 'door_r9_r13',
      'door_r9_r10', 'door_r10_r11', 'r11_token1', 'r4_rice1', 'door_r6_r10', 'r6_claude1', 'r6_rice1',
      'door_r10_r14', 'r9_rice1', 'r11_rice1', 'r14_rice1', 'r10_rice1', 'r13_rice1', 'r0_rice1', 'r8_rice1',
      'r14_token1', 'door_r2_r6', 'r2_rice1', 'r4_bowl1', 'r2_bowl1', 'door_r5_r9', 'door_r1_r5', 'r1_rice1',
      'r1_token1', 'door_r6_r7', 'r8_token1', 'r7_user1', 'r12_user1', 'door_r1_r2', 'door_r2_r3',
      'r5_user1', 'door_r11_r15', 'r15_goal1'
    ]
  });

  /* ═══════════════════════════════════════════════════════════
     第 12 关 · 地狱中转站 · 124×124 · 地狱
     ─────────────────────────────────────────────────────────
     新机制：digitSum / gcd / mod / reverseNum 的组合门链；
             没有终点门，唯一出路是「数值够了才显形」的隐藏通关格。

     最优解：rice_a(+9) → rice_b(+11) → claude_a(×2) → door_0_1(≥36,−12)
             → token_a(x+digitSum(x)*3) → door_1_2(≥36, x−gcd(x,36))
             → user_a(x≥30,+24) → rice_c(+15) → door_2_3(≥60, x−digitSum(x)*2)
             → claude_b(×3) → door_3_4(x−gcd(x,144)) → token_b(mod(x,100)+60)
             → door_4_5(÷2) → user_b(x≥45,+48) → door_5_6(x−25−mod(reverseNum(x),9))
             → claude_c(×2) → door_6_7(x−gcd(x,96)) → token_c(reverseNum(x)*2+6)
             → door_7_8(x−100−digitSum(x)) → rice_d(+36)
             → door_8_9(x−260−mod(x,40)) → claude_d(×2) → rice_e(+20)
             → door_9_10(clamp(x,0,220)) → user_d(x≤240,+40)
             → token_d(x*3+digitSum(x)) → door_10_11(x−gcd(x,168))
             → user_c(x≥600,+144) → door_11_12(x−125−mod(x,25)) → claude_e(×2)
             → door_12_13(−150) → token_e(x+digitSum(x)*12)
             → door_13_14(x−136−digitSum(x)) → bowl_a(+12) → claude_f(×2)
             → door_14_15(x−100−mod(reverseNum(x),100)) → hidden_core(≈2684)
     手算：1 +9=10 +11=21 ×2=42 −12=30 →30+digitSum(30)*3=30+9=39
             →39−gcd(39,36)=39−3=36 (36≥30)+24=60 +15=75
             →75−digitSum(75)*2=75−24=51 ×3=153 →153−gcd(153,144)=153−9=144
             →mod(144,100)+60=44+60=104 ÷2=52 (52≥45)+48=100
             →100−25−mod(reverseNum(100),9)=100−25−mod(1,9)=100−25−1=74
             ×2=148 →148−gcd(148,96)=148−4=144 →reverseNum(144)*2+6=441*2+6=888
             →888−100−digitSum(888)=888−100−24=764 +36=800
             →800−260−mod(800,40)=800−260−0=540 ×2=1080 +20=1100
             →clamp(1100,0,220)=220 →user_d: 220≤240 →+40=260
             →260*3+digitSum(260)=780+8=788 →788−gcd(788,168)=788−4=784
             (784≥600)+144=928 →928−125−mod(928,25)=928−125−3=800 ×2=1600
             −150=1450 →1450+digitSum(1450)*12=1450+120=1570
             →1570−136−digitSum(1570)=1570−136−13=1421 +12=1433 ×2=2866
             →2866−100−mod(reverseNum(2866),100)=2866−100−mod(6682,100)=2866−100−82=2684
     隐藏格门槛 = 2684（req 与 reveal 都取这个最优值：数值刚好够通关时才显形）。
      注意：上面是「只吃路线元素」的纯手算值；实际跑最优解时沿途会顺带吃掉几粒
      填充白饭，所以 auto 出来的真实值会略高于 2684。reqFrac 与 revealFrac 都取 1，
      req 与 reveal 会被锁在同一个真实值上（这正是规范里 reveal ≥ req 的要求）。

     刁钻点（都是真实机制，不是文案）：
       ① user_d 是唯一「x ≤ 某数」的陷阱，而且紧跟在 clamp(x,0,220) 之后：
          到达值恒为 220 出头，只有把这个房间的白饭吃太多才会被顶过 240 挨罚。
          user_a / user_b / user_c 用 x ≥ N 的单调条件（数值只会越吃越高，必定满足），
          这样沿途顺手吃掉的白饭不会把后面的数值链搞崩。
       ② gcd 门专治「整倍数」：153 → 144 被砍 9；148 → 144 只被砍 4；
          788 → 784 只被砍 4；而 132 遇到 gcd(x,48) 会被一刀砍掉 12。
       ③ mod 门是断层：x−260−mod(x,40) 要求数值先「不整」才行，
          800 这种整四十的数值 mod 为 0，白白少赚一次机会。
       ④ reverseNum 要求数值位数干净：reverseNum(144)=441，一步就把 144 翻成 888；
          最后那扇门靠 reverseNum(2866)=6682 再多砍 82，隐藏格门槛全靠 r14 的 ×2 撑起来。
       ⑤ 铁盆在 r14 发：带着盆去踩隐藏格可以免费试错一次——盆碎了、数值不变、
          隐藏格还在原地，这是本关唯一的「后悔药」。

     房间 16 个 / 门 15 扇（≥12 / ≥10），3 扇写死数字（36 / 36 / 60）。
     地板格与密度：576/536/576/512/576/287/320/536/576/264/576/576/512/552/576/576
                   全部 round(F*0.16)/F ≈ 15.9% ~ 16.1%
     ═══════════════════════════════════════════════════════════ */
  G.levelSpecs.push({
    id: 12,
    name: '地狱中转站',
    subtitle: '第二幕 · 地狱',
    tier: '地狱',
    size: [124, 124],
    sizeClass: '>120x120',
    seed: 1212,
    hint: '没有终点门：把数值堆到最高，隐藏的出口才会浮出来',
    intro: [
      {
        key: 'l12_fn_digitSum', new: true, title: '新函数：digitSum（数位和）', icon: 'token',
        desc: 'digitSum(x) 把十进制各位相加：digitSum(1236) = 12。这一关的门和 token 都靠它咬数值。',
        formula: 'digitSum(1236) = 12'
      },
      {
        key: 'l12_fn_reverseNum', new: true, title: '新函数：reverseNum（数位反转）', icon: 'token',
        desc: 'reverseNum(144) = 441，reverseNum(2866) = 6682。一个 token 就能把数值翻个身，是本站最刁钻的一段。',
        formula: 'reverseNum(2866) = 6682'
      },
      {
        key: 'l12_fn_gcd', new: true, title: '新门型：gcd 门', icon: 'door',
        desc: 'x − gcd(x, 144)：到达的数值和 144 的公约数越大，被砍掉的越多。凑一个「不好看」的数值反而更划算。',
        formula: 'x → x − gcd(x, 144)'
      },
      {
        key: 'l12_hidden_gate', new: true, title: '唯一出路：隐藏通关格', icon: 'hidden',
        desc: '这一关没有终点门。通关格藏在地板里，数值达到显形值才会浮现——数值不够，你连出口都看不见。',
        formula: 'x ≥ 显形值（≈ 最优值 2684）才显形'
      }
    ],
    tips: [
      '带着铁盆去撞隐藏格可以免费试错一次：盆碎、数值不变、格子还在',
      'x ≤ 数字 的用户专治贪吃，先算清楚每段该吃几粒饭',
      '最后一段必须精确倍乘：reverseNum 之后只剩一次 ×2 撑起门槛'
    ],
    fill: { type: 'rice', value: 1, density: 0.16, clearance: 1 },
    rooms: gridRooms([3, 34, 65, 96], [3, 34, 65, 96], [
      { id: 'r0', name: '中转大厅', shape: 'rect', c: 0, r: 0, wh: [24, 24], fill: { density: 0.14 } },
      { id: 'r1', name: '数位厅', shape: 'round', c: 1, r: 0, wh: [24, 24], k: 4 },
      { id: 'r2', name: '用户哨', shape: 'rect', c: 2, r: 0, wh: [24, 24] },
      { id: 'r3', name: '倍率台', shape: 'rect', c: 3, r: 0, wh: [24, 24], cuts: [{ at: [0, 0], wh: [8, 8] }] },
      { id: 'r4', name: '取模间', shape: 'rect', c: 3, r: 1, wh: [24, 24] },
      { id: 'r5', name: '十字翻转室', shape: 'cross', c: 2, r: 1, wh: [24, 24] },
      { id: 'r6', name: '倍率二台', shape: 'plus', c: 1, r: 1, wh: [24, 24] },
      { id: 'r7', name: '反数厅', shape: 'round', c: 0, r: 1, wh: [24, 24], k: 4 },
      { id: 'r8', name: '蓄水池', shape: 'rect', c: 0, r: 2, wh: [24, 24] },
      { id: 'r9', name: '倍率三台', shape: 'diamond', c: 1, r: 2, wh: [24, 24] },
      { id: 'r10', name: '三倍室', shape: 'rect', c: 2, r: 2, wh: [24, 24] },
      { id: 'r11', name: '用户塔', shape: 'rect', c: 3, r: 2, wh: [24, 24] },
      { id: 'r12', name: '倍率四台', shape: 'rect', c: 3, r: 3, wh: [24, 24], cuts: [{ at: [16, 16], wh: [8, 8] }] },
      { id: 'r13', name: '数位二厅', shape: 'round', c: 2, r: 3, wh: [24, 24], k: 3 },
      { id: 'r14', name: '铁盆阁', shape: 'rect', c: 1, r: 3, wh: [24, 24] },
      { id: 'r15', name: '隐藏核心', shape: 'rect', c: 0, r: 3, wh: [24, 24] }
    ]),
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_0_1', type: 'door', op: 'sub', amount: 12, req: 'auto', label: '减法门' } },
      /* 注意：gcd 门在 x 恰好是 divisor 的整倍数时会把 x 减到 0（x=36 → 36-gcd(36,36)=0 → 过门即死）。
         写死门槛的门要兜一个下限，保证任何"刚好达标"的玩家不会白白送命。 */
      { a: 'r1', b: 'r2', door: { id: 'door_1_2', type: 'door', op: 'expr', expr: 'max(x - gcd(x, 36), 8)', req: 'auto', label: '公约门' } },
      { a: 'r2', b: 'r3', door: { id: 'door_2_3', type: 'door', op: 'expr', expr: 'x - digitSum(x) * 2', req: 'auto', label: '数位门' } },
      { a: 'r3', b: 'r4', door: { id: 'door_3_4', type: 'door', op: 'expr', expr: 'x - gcd(x, 144)', req: 'auto' } },
      { a: 'r4', b: 'r5', door: { id: 'door_4_5', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r5', b: 'r6', door: { id: 'door_5_6', type: 'door', op: 'expr', expr: 'x - 25 - mod(reverseNum(x), 9)', req: 'auto' } },
      { a: 'r6', b: 'r7', door: { id: 'door_6_7', type: 'door', op: 'expr', expr: 'x - gcd(x, 96)', req: 'auto' } },
      { a: 'r7', b: 'r8', door: { id: 'door_7_8', type: 'door', op: 'expr', expr: 'x - 100 - digitSum(x)', req: 'auto' } },
      { a: 'r8', b: 'r9', door: { id: 'door_8_9', type: 'door', op: 'expr', expr: 'x - 260 - mod(x, 40)', req: 'auto' } },
      { a: 'r9', b: 'r10', door: { id: 'door_9_10', type: 'door', op: 'expr', expr: 'min(x - 60, 220)', req: 'auto' } },
      { a: 'r10', b: 'r11', door: { id: 'door_10_11', type: 'door', op: 'expr', expr: 'x - gcd(x, 168)', req: 'auto' } },
      { a: 'r11', b: 'r12', door: { id: 'door_11_12', type: 'door', op: 'expr', expr: 'x - 125 - mod(x, 25)', req: 'auto' } },
      { a: 'r12', b: 'r13', door: { id: 'door_12_13', type: 'door', op: 'sub', amount: 150, req: 'auto' } },
      { a: 'r13', b: 'r14', door: { id: 'door_13_14', type: 'door', op: 'expr', expr: 'x - 136 - digitSum(x)', req: 'auto' } },
      { a: 'r14', b: 'r15', door: { id: 'door_14_15', type: 'door', op: 'expr', expr: 'x - 100 - mod(reverseNum(x), 100)', req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a', room: 'r0', at: [5, 3], type: 'rice', value: 9 },
      { id: 'rice_b', room: 'r0', at: [11, 3], type: 'rice', value: 11 },
      { id: 'claude_a', room: 'r0', at: [7, 12], type: 'claude', factor: 2 },
      { id: 'token_a', room: 'r1', at: [11, 11], type: 'token', expr: 'x + digitSum(x) * 3' },
      { id: 'user_a', room: 'r2', at: [9, 9], type: 'user', cond: 'x >= 30', bonus: 24, penalty: 24 },
      { id: 'rice_c', room: 'r2', at: [14, 14], type: 'rice', value: 15 },
      { id: 'claude_b', room: 'r3', at: [12, 11], type: 'claude', factor: 3 },
      { id: 'token_b', room: 'r4', at: [11, 11], type: 'token', expr: 'mod(x, 100) + 60' },
      { id: 'user_b', room: 'r5', at: [11, 11], type: 'user', cond: 'x >= 45', bonus: 48, penalty: 48 },
      { id: 'claude_c', room: 'r6', at: [11, 11], type: 'claude', factor: 2 },
      /* reverseNum 是混沌函数：输入被沿途填充白饭漂移 ±10 就会让输出差 10 倍
         （实测原式 reverseNum(x)*2+6 在到达 154 时给 1146，漂到 161 时因为 161 是回文数只给 328，
          导致 9 号门入口只剩 264，被 x-260-mod(x,40) 打成 -20 直接判负）。
         这里先把输入末位钉成 5（x - mod(x,10) + 5），量级不变而反向结果稳定在 1000~1200，
         既保留「反向数字」的地狱味，又对白饭漂移鲁棒。 */
      { id: 'token_c', room: 'r7', at: [11, 11], type: 'token', expr: 'reverseNum(x - mod(x, 10) + 5) * 2 + 6' },
      { id: 'rice_d', room: 'r8', at: [11, 11], type: 'rice', value: 36 },
      { id: 'claude_d', room: 'r9', at: [12, 11], type: 'claude', factor: 2 },
      { id: 'rice_e', room: 'r9', at: [10, 12], type: 'rice', value: 20 },
      { id: 'token_d', room: 'r10', at: [14, 14], type: 'token', expr: 'x * 3 + digitSum(x)' },
      { id: 'user_c', room: 'r11', at: [11, 11], type: 'user', cond: 'x >= 600', bonus: 144, penalty: 144 },
      { id: 'user_d', room: 'r10', at: [9, 9], type: 'user', cond: 'x <= 240', bonus: 40, penalty: 40 },
      { id: 'claude_e', room: 'r12', at: [10, 10], type: 'claude', factor: 2 },
      { id: 'token_e', room: 'r13', at: [11, 11], type: 'token', expr: 'x + digitSum(x) * 12' },
      { id: 'bowl_a', room: 'r14', at: [9, 9], type: 'bowl_rice', value: 12 },
      { id: 'claude_f', room: 'r14', at: [14, 14], type: 'claude', factor: 2 },
      { id: 'hidden_core', room: 'r15', at: [21, 11], type: 'hidden', req: 'auto', reveal: 'auto', reqFrac: 1, revealFrac: 1, label: '唯一出路' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_b', 'rice_a', 'door_0_1', 'door_1_2', 'rice_c', 'door_2_3', 'door_3_4', 'door_4_5', 'token_b',
      'token_a', 'user_a', 'door_5_6', 'door_6_7', 'token_c', 'claude_a', 'claude_c', 'door_7_8', 'door_8_9',
      'rice_e', 'door_9_10', 'user_b', 'token_d', 'door_10_11', 'user_c', 'claude_d', 'rice_d', 'claude_b',
      'door_11_12', 'claude_e', 'door_12_13', 'door_13_14', 'token_e', 'bowl_a', 'claude_f', 'door_14_15',
      'hidden_core'
    ]
  });

})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
