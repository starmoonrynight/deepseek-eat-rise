/* ─────────────────────────────────────────────────────────────
   act1.js —— 第 1~6 关关卡数据（1~5 关「入门」，第 6 关「初级」）
   ------------------------------------------------------------------
   教学主线（每关只引入一个新元素 / 一个新机制）：
     L1 白饭初尝      rice、减法门、终点门      —— 数值门槛
     L2 铁盆护体      bowl_rice                —— 铁盆免疫一次失败（故意撞门）
     L3 倍率之宴      claude、除法门            —— 除法门在最前面，倍率留在门后
     L4 变量重写      token                   —— x = 表达式，堆最大值不再是唯一解
     L5 用户的审视    user、复杂运算门          —— 条件判断 + 三级门齐全
     L6 铁盆与隐藏格  hidden                  —— 先故意碎盆、再靠隐藏格通关
   ------------------------------------------------------------------
   与 docs/LEVEL_SCHEMA.md、js/map.js 对齐的写法约定：
     · 房间用 rect / round(k)（含切角），房间矩形之间至少留 3 格；
       房间之间一律靠 links 连接（不互相接触），门由构建器放在走廊中段（房间之外）。
     · 填充：fill { type:'rice', value:1, density:0.15, clearance:1 }
       → 每个房间最终密度 = round(格数 × 0.15) / 格数 ≈ 14.7% ~ 15.5%，落在 (10%, 30%) 内。
     · 每关手放的特殊元素彼此至少隔 2 格（不紧贴），且都不落在被切掉的角上。
     · 门的 req 全部写死具体数字（每关 3~4 扇门，满足「至少 2 扇写死」）；
       终点 goal 的 req 统一写 'auto'，由构建器按最优解路线把真实数值写成门槛。
     · 每关的手算过程写在该关 spec 之前的块注释里；所有门槛都保证
       「一口填充白饭都不吃」也能按 solution 顺序通过（填充只会让数值更高），
       因此即使填充随机结果不理想，六关依然可通关。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';
  G.levelSpecs = G.levelSpecs || [];

  /* ── 第 1 关 白饭初尝 ─────────────────────────────────────────
     尺寸 34×34 ｜ 3 房间 3 门
     房间：r0 前厅   [2,2]  12×10 矩形（120 格）
           r1 中庭   [21,2] 11×11 round k=3（97 格）
           r2 终点厅 [2,17] 16×13 矩形（208 格）
     门：  door_r0_r1 @(17,5)  减法门 需 x≥12，通过后 x−4
           door_r1_r2 @(17,11) 减法门 需 x≥34，通过后 x−7
           door_r0_r2 @(2,14)  减法门 需 x≥40，通过后 x−12（后门，非最优解路线）
     最优解：rice_a1(+5) → rice_a2(+9) → door_r0_r1(需≥12，−4) → rice_b1(+12) → rice_b2(+14)
             → door_r1_r2(需≥34，−7) → rice_c1(+16) → rice_c2(+18) → goal(req:'auto')
     手算： 1 +5=6 +9=15 ≥12 ✔ −4=11 +12=23 +14=37 ≥34 ✔ −7=30 +16=46 +18=64
            → 到终点时 = 64 + 沿途吃到的填充白饭（goal.req:'auto' 写入真实值）
     门槛设计：12 ≈ 15 的 80%；34 ≈ 37 的 92%；40 让 r0 单独吃满
               （1 + 5 + 9 + 16 颗填充 = 31）也过不去，只能走 r1 正门。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 1,
    name: '白饭初尝',
    subtitle: '第 1 关',
    tier: '入门',
    size: [34, 34],
    sizeClass: '>30x30',
    seed: 1001,
    intro: [
      'rice',
      'door',
      'goal',
      {
        key: 'l1_gate', new: true,
        title: '新机制：数值门槛',
        icon: 'door',
        desc: '中转站门会检查你的数值：达到门槛才放行，否则撞上去就是失败。通过后门会变成平地，但你的数值要按门的运算减少 —— 所以先吃够、再进门。',
        formula: 'x ≥ 门槛 → x = x − 消耗'
      }
    ],
    tips: [
      '门只要凑够门槛就能过 —— 不必把一个房间吃空再去撞',
      '撞不动就换个房间吃，回头再来（门开着，路是通的）',
      '终点门也是门，数值达标走进去才算通关'
    ],
    hint: '吃白饭涨数值 → 过门会掉数值 → 攒够了再闯终点门',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [12, 10], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '中庭', at: [21, 2], wh: [11, 11], shape: 'round', k: 3, color: '#2f4a3a' },
      { id: 'r2', name: '终点厅', at: [2, 17], wh: [16, 13], shape: 'rect', color: '#4a3a2f' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'sub', amount: 4, req: 'auto' } },
      { a: 'r1', b: 'r2', door: { id: 'door_r1_r2', type: 'door', op: 'sub', amount: 7, req: 'auto' } },
      { a: 'r0', b: 'r2', door: { id: 'door_r0_r2', type: 'door', op: 'sub', amount: 12, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [3, 3], type: 'rice', value: 5 },
      { id: 'rice_a2', room: 'r0', at: [9, 7], type: 'rice', value: 9 },
      { id: 'rice_b1', room: 'r1', at: [2, 3], type: 'rice', value: 12 },
      { id: 'rice_b2', room: 'r1', at: [6, 7], type: 'rice', value: 14 },
      { id: 'rice_c1', room: 'r2', at: [6, 6], type: 'rice', value: 16 },
      { id: 'rice_c2', room: 'r2', at: [11, 4], type: 'rice', value: 18 },
      { id: 'goal', room: 'r2', at: [13, 10], type: 'goal', req: 'auto' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a2', 'door_r0_r1', 'rice_b2', 'door_r1_r2', 'rice_c2', 'rice_c1', 'rice_b1', 'rice_a1', 'goal'
    ]
  });

  /* ── 第 2 关 铁盆护体 ─────────────────────────────────────────
     尺寸 34×34 ｜ 3 房间 3 门（环形：r0 有两个门）
     房间：r0 前厅   [2,2]  12×10 矩形（120 格）
           r1 灶间   [21,2] 11×11 round k=3（97 格）
           r2 后厨   [2,17] 16×13 round k=4（168 格）
     门：  door_r0_r1 @(17,5)  减法门 需 x≥38，通过后 x−10 ← 一开始绝对撞不过去的「陷阱门」
           door_r0_r2 @(6,14)  减法门 需 x≥15，通过后 x−6
           door_r2_r1 @(21,17) 减法门 需 x≥48，通过后 x−12（侧路，比正门更亏，非最优）
     最优解：rice_a1(+6) → bowl1(+10，拿到铁盆) → door_r0_r2(需≥15，−6) → rice_b1(+10)
             → rice_b2(+9) → rice_b3(+12) → door_r0_r1(需≥38，−10) → rice_c1(+13) → goal(req:'auto')
     手算： 1 +6=7 +10=17 ≥15 ✔ −6=11 +10=21 +9=30 +12=42 ≥38 ✔ −10=32 +13=45
            → 到终点时 = 45 + 沿途填充白饭（goal.req:'auto' 写入真实值）
     铁盆教学：r0 吃满也只有 1 + 6 + 10 + 16 颗填充 = 33 < 38 ⇒ 拿盆后必定撞不过 door_r0_r1，
               铁盆碎掉（元素还在、数值不变），只能走后厨绕一圈再回来过这扇门。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 2,
    name: '铁盆护体',
    subtitle: '第 2 关',
    tier: '入门',
    size: [34, 34],
    sizeClass: '>30x30',
    seed: 1002,
    intro: [
      'bowl_rice',
      {
        key: 'l2_bowl', new: true,
        title: '新机制：铁盆免疫',
        icon: 'bowl_rice',
        desc: '吃掉铁盆大白饭会顶一个铁盆。撞上数值不够的门时，铁盆会碎掉替你挡下这次失败：数值不变、门也还在原地 —— 所以你可以放心去试那扇过不去的门。',
        formula: '失败 → 铁盆碎 · x 不变'
      }
    ],
    tips: [
      '铁盆同时只能顶 1 个，碎了就没了',
      '这关有一扇门你一开始肯定撞不过去 —— 先去撞一下，看看铁盆怎么用',
      '撞碎盆不亏：数值没变，回头绕路把饭吃完再回来'
    ],
    hint: '铁盆替你挡一次失败；撞不过的门先记住位置，绕路吃够再回来',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [12, 10], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '灶间', at: [21, 2], wh: [11, 11], shape: 'round', k: 3, color: '#4a2f3a' },
      { id: 'r2', name: '后厨', at: [2, 17], wh: [16, 13], shape: 'round', k: 4, color: '#3a4a2f' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'sub', amount: 10, req: 'auto' } },
      { a: 'r0', b: 'r2', door: { id: 'door_r0_r2', type: 'door', op: 'sub', amount: 6, req: 'auto' } },
      { a: 'r2', b: 'r1', door: { id: 'door_r2_r1', type: 'door', op: 'sub', amount: 12, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [9, 3], type: 'rice', value: 6 },
      { id: 'bowl1', room: 'r0', at: [3, 4], type: 'bowl_rice', value: 10 },
      { id: 'rice_b1', room: 'r2', at: [5, 5], type: 'rice', value: 10 },
      { id: 'rice_b2', room: 'r2', at: [9, 4], type: 'rice', value: 9 },
      { id: 'rice_b3', room: 'r2', at: [6, 9], type: 'rice', value: 12 },
      { id: 'rice_c1', room: 'r1', at: [2, 4], type: 'rice', value: 13 },
      { id: 'goal', room: 'r1', at: [7, 7], type: 'goal', req: 'auto' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'bowl1', 'door_r0_r1', 'rice_c1', 'door_r0_r2', 'rice_b3', 'rice_b1', 'rice_b2', 'rice_a1', 'goal'
    ]
  });

  /* ── 第 3 关 倍率之宴 ─────────────────────────────────────────
     尺寸 36×36 ｜ 4 房间 3 门（链式 r0→r1→r2→r3）
     房间：r0 前厅   [2,2]  12×10 矩形（120 格）
           r1 宴会厅 [21,2] 13×12 round k=3（132 格）
           r2 酒窖   [20,18] 15×12 矩形（180 格）
           r3 终点厅 [2,18] 14×12 round k=3（144 格）
     门：  door_r0_r1 @(17,5)  除法门 ⌊x÷3⌋ 需 x≥18
           door_r1_r2 @(24,16) 减法门 需 x≥80，通过后 x−20
           door_r2_r3 @(17,21) 减法门 需 x≥150，通过后 x−25
     最优解：rice_a1(+9) → rice_a2(+11) → door_r0_r1(需≥18，÷3) → rice_b1(+12) → rice_b2(+14)
             → claude1(×3) → door_r1_r2(需≥80，−20) → rice_c1(+16) → claude2(×2)
             → door_r2_r3(需≥150，−25) → rice_d1(+18) → goal(req:'auto')
     手算： 1 +9=10 +11=21 ≥18 ✔ ⌊21÷3⌋=7 +12=19 +14=33 ×3=99 ≥80 ✔ −20=79
            +16=95 ×2=190 ≥150 ✔ −25=165 +18=183
            → 到终点时 = 183 + 沿途填充白饭（goal.req:'auto' 写入真实值）
     教学：除法门被放在最前面（所有 Claude 娘都在它后面）—— 倍率永远不会被除法门砍掉；
           进门前的每一口饭都只是「凑够 18」，真正的数值增长发生在门后。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 3,
    name: '倍率之宴',
    subtitle: '第 3 关',
    tier: '入门',
    size: [36, 36],
    sizeClass: '>30x30',
    seed: 1003,
    intro: [
      'claude',
      {
        key: 'l3_div', new: true,
        title: '新机制：除法门',
        icon: 'door',
        desc: '除法门不扣固定数值，而是把你的数值直接除以一个数（向下取整）。所以过它之前堆的数值会被砍掉一大截 —— 正确的顺序是先过除法门，再吃 Claude 娘。',
        formula: 'x → ⌊x ÷ 3⌋'
      }
    ],
    tips: [
      'Claude 娘会把你整个数值乘以她的倍率：越晚吃、数值越大越赚',
      '除法门会把数值砍成三分之一：进门前的数值越大，被砍掉的绝对量越多',
      '先把门口的饭吃到刚好够门槛，过了门再让 Claude 娘放大'
    ],
    hint: '除法门在最前面 —— 先过门，再把倍率吃到手',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [12, 10], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '宴会厅', at: [21, 2], wh: [13, 12], shape: 'round', k: 3, color: '#4a3a5c' },
      { id: 'r2', name: '酒窖', at: [20, 18], wh: [15, 12], shape: 'rect', color: '#3f4a2a' },
      { id: 'r3', name: '终点厅', at: [2, 18], wh: [14, 12], shape: 'round', k: 3, color: '#4a3a2f' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'div', divisor: 3, req: 'auto' } },
      { a: 'r1', b: 'r2', door: { id: 'door_r1_r2', type: 'door', op: 'sub', amount: 20, req: 'auto' } },
      { a: 'r2', b: 'r3', door: { id: 'door_r2_r3', type: 'door', op: 'sub', amount: 25, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [9, 3], type: 'rice', value: 9 },
      { id: 'rice_a2', room: 'r0', at: [3, 7], type: 'rice', value: 11 },
      { id: 'rice_b1', room: 'r1', at: [3, 3], type: 'rice', value: 12 },
      { id: 'rice_b2', room: 'r1', at: [7, 6], type: 'rice', value: 14 },
      { id: 'claude1', room: 'r1', at: [4, 8], type: 'claude', factor: 3 },
      { id: 'rice_c1', room: 'r2', at: [3, 4], type: 'rice', value: 16 },
      { id: 'claude2', room: 'r2', at: [9, 7], type: 'claude', factor: 2 },
      { id: 'rice_d1', room: 'r3', at: [6, 5], type: 'rice', value: 18 },
      { id: 'goal', room: 'r3', at: [9, 8], type: 'goal', req: 'auto' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a1', 'door_r0_r1', 'rice_b2', 'rice_b1', 'rice_a2', 'claude1', 'door_r1_r2', 'rice_c1',
      'claude2', 'door_r2_r3', 'rice_d1', 'goal'
    ]
  });

  /* ── 第 4 关 变量重写 ─────────────────────────────────────────
     尺寸 36×36 ｜ 4 房间 3 门（链式 r0→r1→r2→r3）
     房间：r0 前厅   [2,2]  12×10 矩形（120 格）
           r1 改写间 [21,2] 13×12 round k=3（132 格）
           r2 回廊   [20,18] 15×12 矩形（180 格）
           r3 终点厅 [2,18] 14×12 round k=3（144 格）
     门：  door_r0_r1 @(17,5)  减法门 需 x≥18，通过后 x−8
           door_r1_r2 @(24,16) 除法门 ⌊x÷2⌋ 需 x≥110
           door_r2_r3 @(17,21) 减法门 需 x≥200，通过后 x−40
     最优解：rice_a1(+9) → rice_a2(+11) → door_r0_r1(需≥18，−8) → token1(x = 50 + x % 12)
             → rice_b1(+12) → claude1(×2) → door_r1_r2(需≥110，÷2) → token2(x = 80 + x % 7)
             → rice_c1(+15) → claude2(×3) → door_r2_r3(需≥200，−40) → rice_d1(+16) → goal(req:'auto')
     手算： 1 +9=10 +11=21 ≥18 ✔ −8=13
            token1：13 % 12 = 1 → 50+1 = 51 ；+12=63 ；×2=126 ≥110 ✔ ⌊126÷2⌋=63
            token2：63 % 7 = 0 → 80+0 = 80 ；+15=95 ；×3=285 ≥200 ✔ −40=245 ；+16=261
            → 到终点时 = 261 + 沿途填充白饭（goal.req:'auto' 写入真实值）
     教学：token 是「改写」而不是「相加」—— 进门前的数值只通过取余影响结果，
           token1 的结果恒在 [50,61]、token2 恒在 [80,86]，堆最大值不再是唯一解法。
           区间保证：token1 后 51~61 → +12 → 63~73 → ×2 → 126~146 ≥ 110（最小值也过门）。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 4,
    name: '变量重写',
    subtitle: '第 4 关',
    tier: '入门',
    size: [36, 36],
    sizeClass: '>30x30',
    seed: 1004,
    intro: [
      'token',
      {
        key: 'l4_token', new: true,
        title: '新机制：token 改写',
        icon: 'token',
        desc: 'token 不看你现在有多少，直接把你的数值改写成表达式的结果。堆数值到 token 前面可能白费 —— 先算清楚 token 出来是多少，再把后面的饭和倍率留到改写之后。',
        formula: 'x = 50 + x % 12'
      }
    ],
    tips: [
      'token 会直接改写数值：堆最大值不再是唯一解法',
      'token 里的 % 是取余：进门前的数值只决定改写后的零头',
      '改写之后再吃 Claude 娘，收益才不会被覆盖掉'
    ],
    hint: 'token 面前人人平等 —— 先过 token，再把后面的数值堆起来',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [12, 10], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '改写间', at: [21, 2], wh: [13, 12], shape: 'round', k: 3, color: '#5c4a2a' },
      { id: 'r2', name: '回廊', at: [20, 18], wh: [15, 12], shape: 'rect', color: '#2a4a5c' },
      { id: 'r3', name: '终点厅', at: [2, 18], wh: [14, 12], shape: 'round', k: 3, color: '#4a3a2f' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'sub', amount: 8, req: 'auto' } },
      { a: 'r1', b: 'r2', door: { id: 'door_r1_r2', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r2', b: 'r3', door: { id: 'door_r2_r3', type: 'door', op: 'sub', amount: 40, req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [9, 3], type: 'rice', value: 9 },
      { id: 'rice_a2', room: 'r0', at: [3, 7], type: 'rice', value: 11 },
      { id: 'token1', room: 'r1', at: [3, 3], type: 'token', expr: '50 + x % 12' },
      { id: 'rice_b1', room: 'r1', at: [8, 4], type: 'rice', value: 12 },
      { id: 'claude1', room: 'r1', at: [4, 8], type: 'claude', factor: 2 },
      { id: 'token2', room: 'r2', at: [3, 4], type: 'token', expr: '80 + x % 7' },
      { id: 'rice_c1', room: 'r2', at: [8, 8], type: 'rice', value: 15 },
      { id: 'claude2', room: 'r2', at: [11, 5], type: 'claude', factor: 3 },
      { id: 'rice_d1', room: 'r3', at: [6, 5], type: 'rice', value: 16 },
      { id: 'goal', room: 'r3', at: [9, 8], type: 'goal', req: 'auto' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a1', 'door_r0_r1', 'door_r1_r2', 'token1', 'door_r2_r3', 'token2', 'rice_d1', 'rice_c1',
      'rice_b1', 'rice_a2', 'claude2', 'claude1', 'goal'
    ]
  });

  /* ── 第 5 关 用户的审视 ───────────────────────────────────────
     尺寸 38×38 ｜ 4 房间 3 门（链式 r0→r1→r2→r3，三级门齐全：减法 / 除法 / 复杂运算）
     房间：r0 前厅   [2,2]  12×10 矩形（120 格）
           r1 会客厅 [21,2] 14×12 round k=3（144 格）
           r2 审核室 [20,18] 16×13 矩形（208 格）
           r3 终点厅 [2,18] 14×12 round k=3（144 格）
     门：  door_r0_r1 @(17,5)  减法门   需 x≥38，通过后 x−12
           door_r1_r2 @(24,16) 除法门   ⌊x÷3⌋，需 x≥80
           door_r2_r3 @(17,21) 复杂运算门 x = max(15, x − 60)，需 x≥110
     最优解：rice_a1(+10) → rice_a2(+12) → user1(x≥22？→ +20) → door_r0_r1(需≥38，−12)
             → rice_b1(+14) → claude1(×2) → door_r1_r2(需≥80，÷3) → rice_c1(+16)
             → user2(x≥45？→ +24) → claude2(×2) → door_r2_r3(需≥110，max(15,x−60))
             → rice_d1(+18) → goal(req:'auto')
     手算： 1 +10=11 +12=23 → user1：23 ≥ 22 ✔ +20 = 43 ≥38 ✔ −12=31
            +14=45 ×2=90 ≥80 ✔ ⌊90÷3⌋=30 ；+16=46 → user2：46 ≥ 45 ✔ +24 = 70 ×2=140 ≥110 ✔
            → max(15, 140−60) = 80 ；+18=98
            → 到终点时 = 98 + 沿途填充白饭（goal.req:'auto' 写入真实值）
     条件教学：user1 差一点就变惩罚（只吃 rice_a1 时是 11，会被扣 8 只剩 3）；
               user2 必须先把 rice_c1 吃掉（30 → 46）才能满足 x ≥ 45。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 5,
    name: '用户的审视',
    subtitle: '第 5 关',
    tier: '入门',
    size: [38, 38],
    sizeClass: '>30x30',
    seed: 1005,
    intro: [
      'user',
      {
        key: 'l5_expr', new: true,
        title: '新机制：复杂运算门',
        icon: 'door',
        desc: '三级门里最高级的一种：门上直接写表达式，通过时按表达式结算。它保证结果一定比进门时小，但比减法门更「讲道理」—— 数值高的时候扣得多，数值低的时候有保底。',
        formula: 'x = max(15, x − 60)'
      }
    ],
    tips: [
      '用户会检查你的数值：满足条件给奖励，不满足就扣你的数值',
      '先补够条件再去找用户 —— 差一点就变成惩罚',
      '这一关三种门都齐了：减法门、除法门、复杂运算门'
    ],
    hint: '满足用户的条件再进门；条件不够就先回去补数值',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [12, 10], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '会客厅', at: [21, 2], wh: [14, 12], shape: 'round', k: 3, color: '#2f4a3a' },
      { id: 'r2', name: '审核室', at: [20, 18], wh: [16, 13], shape: 'rect', color: '#4a2f3a' },
      { id: 'r3', name: '终点厅', at: [2, 18], wh: [14, 12], shape: 'round', k: 3, color: '#4a3a2f' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'sub', amount: 12, req: 'auto' } },
      { a: 'r1', b: 'r2', door: { id: 'door_r1_r2', type: 'door', op: 'div', divisor: 3, req: 'auto' } },
      { a: 'r2', b: 'r3', door: { id: 'door_r2_r3', type: 'door', op: 'expr', expr: 'max(15, x - 60)', req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [9, 3], type: 'rice', value: 10 },
      { id: 'rice_a2', room: 'r0', at: [3, 3], type: 'rice', value: 12 },
      { id: 'user1', room: 'r0', at: [7, 8], type: 'user', cond: 'x >= 22', bonus: 20, penalty: 8 },
      { id: 'rice_b1', room: 'r1', at: [4, 4], type: 'rice', value: 14 },
      { id: 'claude1', room: 'r1', at: [9, 6], type: 'claude', factor: 2 },
      { id: 'rice_c1', room: 'r2', at: [3, 4], type: 'rice', value: 16 },
      { id: 'user2', room: 'r2', at: [10, 7], type: 'user', cond: 'x >= 45', bonus: 24, penalty: 15 },
      { id: 'claude2', room: 'r2', at: [13, 3], type: 'claude', factor: 2 },
      { id: 'rice_d1', room: 'r3', at: [6, 5], type: 'rice', value: 18 },
      { id: 'goal', room: 'r3', at: [9, 8], type: 'goal', req: 'auto' }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a2', 'rice_a1', 'door_r0_r1', 'door_r1_r2', 'rice_b1', 'door_r2_r3', 'rice_d1', 'user1', 'user2',
      'rice_c1', 'claude1', 'claude2', 'goal'
    ]
  });

  /* ── 第 6 关 铁盆与隐藏格 ─────────────────────────────────────
     尺寸 44×44 ｜ 4 房间 4 门（环形：r0 两扇、r1 两扇）｜ 初级
     房间：r0 前厅 [2,2]   13×11 矩形（143 格）
           r1 密室 [22,2]  14×13 round k=3（158 格）← 隐藏通关格在这里
           r2 灶间 [22,21] 16×14 round k=3（200 格）
           r3 回廊 [2,21]  15×14 round k=3（186 格）
     门：  door_r0_r1 @(18,5)  减法门     需 x≥40，通过后 x−12  ← 故意撞的「陷阱门」
           door_r0_r3 @(5,17)  减法门     需 x≥16，通过后 x−6
           door_r3_r2 @(19,24) 除法门     ⌊x÷2⌋，需 x≥70
           door_r2_r1 @(25,17) 复杂运算门 x = max(20, x − 110)，需 x≥140
     最优解：rice_a1(+7) → bowl1(+10，拿铁盆) → door_r0_r3(需≥16，−6) → rice_b1(+13) → rice_b2(+15)
             → claude1(×2) → door_r3_r2(需≥70，÷2) → rice_c1(+16) → user1(x≥54？→ +22)
             → claude2(×2) → door_r2_r1(需≥140，max(20,x−110)) → rice_d1(+18) → hidden1
     手算： 1 +7=8 +10=18 ≥16 ✔ −6=12 ；+13=25 +15=40 ×2=80 ≥70 ✔ ⌊80÷2⌋=40
            ；+16=56 → user1：56 ≥ 54 ✔ +22 = 78 ×2=156 ≥140 ✔ → max(20, 156−110) = 46
            ；+18=64 → hidden1：reveal 60（64 ≥ 60 ✔ 显形）→ req 60（64 ≥ 60 ✔）通关
            （隐藏格的 req/reveal 是写死的数字，不参与 goal.req:'auto' 机制；
              实到手数值 = 64 + 沿途填充白饭，只会更高，所以一定显形、一定通关。）
     铁盆教学：r0 吃满 = 1 + 7 + 10 + 19 颗填充 = 37 < 40 ⇒ 拿盆后撞 door_r0_r1 必定失败，
               铁盆碎掉（x 不变、门还在），必须绕 door_r0_r3 → r3 → r2 → r1 才能进密室。
     ──────────────────────────────────────────────────────────── */
  G.levelSpecs.push({
    id: 6,
    name: '铁盆与隐藏格',
    subtitle: '第 6 关',
    tier: '初级',
    size: [44, 44],
    sizeClass: '>40x40',
    seed: 1006,
    intro: [
      'hidden',
      {
        key: 'l6_hidden', new: true,
        title: '新机制：先碎盆，再找隐藏格',
        icon: 'hidden',
        desc: '铁盆让你敢去撞那扇过不去的门：碎了也不亏，数值不变、门还留着，回头吃够再来。真正的出口藏在地板里 —— 数值达标才会显形，踩上去才算通关。',
        formula: 'x ≥ 显形值 → 隐藏通关格浮现'
      }
    ],
    tips: [
      '先去撞那扇高门槛的门 —— 撞不过正好看看铁盆怎么用',
      '碎盆不亏：数值不变、门也不会消失，回头吃够再来',
      '最后别只盯着门看 —— 出口可能藏在地板里，数值够了才显形'
    ],
    hint: '铁盆挡一次失败；这一关真正的出口是隐藏通关格',
    fill: { type: 'rice', value: 1, density: 0.15, clearance: 1 },
    rooms: [
      { id: 'r0', name: '前厅', at: [2, 2], wh: [13, 11], shape: 'rect', color: '#2a3f66' },
      { id: 'r1', name: '密室', at: [22, 2], wh: [14, 13], shape: 'round', k: 3, color: '#3a2a5c' },
      { id: 'r2', name: '灶间', at: [22, 21], wh: [16, 14], shape: 'round', k: 3, color: '#4a2f3a' },
      { id: 'r3', name: '回廊', at: [2, 21], wh: [15, 14], shape: 'round', k: 3, color: '#2f4a3a' }
    ],
    links: [
      { a: 'r0', b: 'r1', door: { id: 'door_r0_r1', type: 'door', op: 'sub', amount: 12, req: 'auto' } },
      { a: 'r0', b: 'r3', door: { id: 'door_r0_r3', type: 'door', op: 'sub', amount: 6, req: 'auto' } },
      { a: 'r3', b: 'r2', door: { id: 'door_r3_r2', type: 'door', op: 'div', divisor: 2, req: 'auto' } },
      { a: 'r2', b: 'r1', door: { id: 'door_r2_r1', type: 'door', op: 'expr', expr: 'max(20, x - 110)', req: 'auto' } }
    ],
    elements: [
      { id: 'rice_a1', room: 'r0', at: [10, 3], type: 'rice', value: 7 },
      { id: 'bowl1', room: 'r0', at: [3, 4], type: 'bowl_rice', value: 10 },
      { id: 'rice_b1', room: 'r3', at: [5, 5], type: 'rice', value: 13 },
      { id: 'rice_b2', room: 'r3', at: [9, 8], type: 'rice', value: 15 },
      { id: 'claude1', room: 'r3', at: [10, 5], type: 'claude', factor: 2 },
      { id: 'rice_c1', room: 'r2', at: [5, 6], type: 'rice', value: 16 },
      { id: 'user1', room: 'r2', at: [9, 7], type: 'user', cond: 'x >= 54', bonus: 22, penalty: 14 },
      { id: 'claude2', room: 'r2', at: [10, 9], type: 'claude', factor: 2 },
      { id: 'rice_d1', room: 'r1', at: [4, 4], type: 'rice', value: 18 },
      { id: 'hidden1', room: 'r1', at: [7, 8], type: 'hidden', req: 'auto', reveal: 'auto', reqFrac: 1, revealFrac: 1 }
    ],
    start: { room: 'r0', at: [2, 2] },
    solution: [
      'rice_a1', 'door_r0_r3', 'door_r3_r2', 'rice_b1', 'bowl1', 'door_r2_r1', 'rice_d1', 'rice_c1', 'user1',
      'rice_b2', 'claude1', 'claude2', 'hidden1'
    ]
  });

})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
