/* ─────────────────────────────────────────────────────────────
   levelkit.js —— 关卡数据的紧凑写法工具
   ------------------------------------------------------------------
   后面几幕的关卡房间多、每个房间的元素也多，一行一个元素写会又长又容易写错
   （重叠、越界、id 撞车）。这里提供三个小工具：

     · L.gridRooms(cols, rows, list)  按「列坐标 / 行坐标」网格摆房间
     · L.link(a, b, opts)             造一条房间连线（含一扇门，门槛走 auto）
     · L.autoEls(rooms, table)        把每个房间的元素写成紧凑表，
                                      位置按槽位自动排开，id 自动编号

   元素紧凑表写法（每个房间一条）：
     r0: [['rice', 14], ['claude', 2], ['token', 'x + digitSum(x) * 7'],
          ['user', '(x % 4 == 3 && x > 8)', 25, 30], ['bowl', 9], ['goal']]
   展开成完整元素对象，交给 js/map.js 的 buildLevel。
   位置只是"建议槽位"：落在房间地板外时，map.js 的 ensurePlaceable 会自动就近挪。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  /* ── 网格摆房间：list 里只写网格下标 (c, r)，也支持 at 直接覆盖 ── */
  function gridRooms(cols, rows, list) {
    var out = [], i, d, r;
    for (i = 0; i < list.length; i++) {
      d = list[i];
      r = {
        id: d.id, name: d.name, shape: d.shape || 'rect',
        at: d.at ? [d.at[0], d.at[1]] : [cols[d.c], rows[d.r]],
        wh: d.wh
      };
      if (d.k) r.k = d.k;
      if (d.seed) r.seed = d.seed;
      if (d.cuts) r.cuts = d.cuts;
      if (d.fill !== undefined) r.fill = d.fill;
      out.push(r);
    }
    return out;
  }

  /* ── 房间连线（一扇门）。门槛一律 auto：由最优解反推成极限数值 ── */
  var doorSeq = 0;
  function link(a, b, opts) {
    opts = opts || {};
    var id = opts.id || ('door_' + a + '_' + b);
    var door = { id: id, type: 'door', req: 'auto', reqFrac: 1 };
    if (opts.op) door.op = opts.op;
    if (opts.amount !== undefined) door.amount = opts.amount;
    if (opts.divisor !== undefined) door.divisor = opts.divisor;
    if (opts.expr) door.expr = opts.expr;
    if (opts.label) door.label = opts.label;
    doorSeq++;
    return { a: a, b: b, door: door };
  }

  /* ── 元素紧凑表 → 完整元素列表 ────────────────────────────
     槽位：房间内部按比例取 5 个点，最多放 5 个元素；
     元素类型 → 字段映射写在下面，id 是「房间_类型序号」。 */
  var SLOTS = [
    [0.30, 0.32], [0.66, 0.32], [0.30, 0.66], [0.66, 0.66], [0.48, 0.48],
    [0.48, 0.22], [0.48, 0.78], [0.20, 0.48], [0.80, 0.48]
  ];
  function autoEls(rooms, table) {
    var byId = {}, i;
    for (i = 0; i < rooms.length; i++) byId[rooms[i].id] = rooms[i];
    var out = [], seq = {};
    Object.keys(table).forEach(function (roomId) {
      var room = byId[roomId];
      if (!room) throw new Error('autoEls：没有这个房间 ' + roomId);
      var list = table[roomId] || [];
      for (var j = 0; j < list.length; j++) {
        var d = list[j], type = d[0], el;
        var key = roomId + '_' + type;
        seq[key] = (seq[key] || 0) + 1;
        var id = key + seq[key];
        var s = SLOTS[j % SLOTS.length];
        var at = [
          Math.max(1, Math.min(room.wh[0] - 2, Math.round(room.wh[0] * s[0]))),
          Math.max(1, Math.min(room.wh[1] - 2, Math.round(room.wh[1] * s[1])))
        ];
        switch (type) {
          case 'rice': el = { id: id, room: roomId, at: at, type: 'rice', value: d[1] }; break;
          case 'bowl': el = { id: id, room: roomId, at: at, type: 'bowl_rice', value: d[1] }; break;
          case 'claude': el = { id: id, room: roomId, at: at, type: 'claude', factor: d[1] }; break;
          case 'token': el = { id: id, room: roomId, at: at, type: 'token', expr: d[1] }; break;
          case 'user': el = { id: id, room: roomId, at: at, type: 'user', cond: d[1], bonus: d[2], penalty: d[3] }; break;
          case 'goal': el = { id: id, room: roomId, at: at, type: 'goal', req: 'auto', reqFrac: 1 }; break;
          case 'hidden': el = { id: id, room: roomId, at: at, type: 'hidden', req: 'auto', reveal: 'auto', reqFrac: 1, revealFrac: 1, label: d[1] || '唯一出路' }; break;
          default: throw new Error('autoEls：未知元素类型 ' + type);
        }
        if (type === 'goal' && d[1]) { el.label = d[1]; }
        out.push(el);
      }
    });
    return out;
  }

  /* ── 从元素表里找出某一类的 id（写提示/说明时用） ────────── */
  function idsOf(els, type) {
    return els.filter(function (e) { return e.type === type; }).map(function (e) { return e.id; });
  }

  G.levelKit = { gridRooms: gridRooms, link: link, autoEls: autoEls, idsOf: idsOf };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
