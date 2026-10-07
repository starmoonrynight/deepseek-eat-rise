/* ─────────────────────────────────────────────────────────────
   engine.js —— 游戏状态机（纯逻辑，可脱离 DOM 运行）
   ------------------------------------------------------------------
   · 网格步进移动，走到的格子若有元素就触发运算
   · 失败：数值 ≤ 0，或数值 < 门要求
   · 带铁盆时的一次失败会被抵消：元素不消失、数值不变、大肥鱼被弹出
   · 门从任意方向进入都有效；通过后消失变为平地
   · 支持快照 / 撤销
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var M = G.map, R = G.rules, E = G.expr;

  function Engine(level) {
    this.level = level;
    this.reset();
  }

  Engine.prototype.reset = function () {
    var lv = this.level;
    this.px = lv.start.x;
    this.py = lv.start.y;
    this.value = 1;                 /* 初始数字 1 */
    this.bowl = false;
    this.status = 'playing';        /* playing | won | lost */
    this.steps = 0;
    this.reason = '';
    this.gone = {};                 /* 已消失元素的 id */
    this.eaten = 0;
    this.lastEvent = null;
    this.history = [];
    this.facing = 'down';
    this.anim = { t: 0 };
    this.visitedRooms = {};
    var r0 = M.roomAt(lv, this.px, this.py);
    if (r0) this.visitedRooms[r0.id] = true;
    return this;
  };

  Engine.prototype.snapshot = function () {
    var g = {};
    for (var k in this.gone) g[k] = 1;
    return {
      px: this.px, py: this.py, value: this.value, bowl: this.bowl,
      status: this.status, steps: this.steps, gone: g, eaten: this.eaten,
      reason: this.reason, facing: this.facing, visitedRooms: Object.assign({}, this.visitedRooms)
    };
  };

  Engine.prototype.restore = function (s) {
    this.px = s.px; this.py = s.py; this.value = s.value; this.bowl = s.bowl;
    this.status = s.status; this.steps = s.steps; this.gone = Object.assign({}, s.gone);
    this.eaten = s.eaten; this.reason = s.reason; this.facing = s.facing;
    this.visitedRooms = Object.assign({}, s.visitedRooms);
    this.lastEvent = null;
    return this;
  };

  Engine.prototype.canUndo = function () { return this.history.length > 0; };

  Engine.prototype.undo = function () {
    if (!this.history.length) return false;
    var s = this.history.pop();
    this.restore(s);
    return true;
  };

  /** 某格当前是否还有元素（已被吃掉的就没有了） */
  Engine.prototype.elementAt = function (x, y) {
    var lv = this.level;
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return null;
    var el = lv.cellMap[y * lv.w + x];
    if (!el) return null;
    if (this.gone[el.id]) return null;
    return el;
  };

  Engine.prototype.tileAt = function (x, y) { return M.tileAt(this.level, x, y); };
  Engine.prototype.isWalkable = function (x, y) { return M.tileAt(this.level, x, y) === M.FLOOR; };

  /** 隐藏通关格是否已经显形 */
  Engine.prototype.isRevealed = function (el) {
    if (!el) return false;
    if (el.type !== 'hidden') return true;
    return this.value >= el.reveal;
  };

  /**
   * 尝试走一步。
   * @returns {object} event
   *   { moved, kind, el, detail, valueBefore, valueAfter, bowlGained, bowlUsed, status, win, lost, reason }
   */
  Engine.prototype.step = function (dx, dy) {
    var lv = this.level;
    if (this.status !== 'playing') {
      return { moved: false, kind: 'idle', status: this.status, reason: '本局已结束' };
    }
    if (!dx && !dy) return { moved: false, kind: 'idle' };

    this.facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';

    var nx = this.px + dx, ny = this.py + dy;
    if (!this.isWalkable(nx, ny)) {
      return { moved: false, kind: 'wall', status: this.status, reason: '前面是墙', facing: this.facing };
    }

    var before = this.snapshot();
    var el = this.elementAt(nx, ny);
    var ev = {
      moved: true, kind: 'move', el: el, dx: dx, dy: dy,
      valueBefore: this.value, valueAfter: this.value,
      bowlGained: false, bowlUsed: false,
      status: 'playing', win: false, lost: false, reason: '', facing: this.facing,
      from: { x: this.px, y: this.py }, to: { x: nx, y: ny }, detail: null
    };

    if (el) {
      var res = R.apply({ value: this.value, bowl: this.bowl }, el);

      /* ── 先判"这一下会不会死" ─────────────────────────────
         两种情况：① 门不放行（res.fatal）
                   ② 元素运算完数值 ≤ 0
         通关（res.win）优先，过终点门不会再被当成失败。
         ─────────────────────────────────────────────────── */
      var newValue = (typeof res.value === 'number' && isFinite(res.value)) ? res.value : this.value;
      var wouldDie = !res.win && (res.fatal || !(newValue > 0));

      if (wouldDie) {
        /* 铁盆免疫一次失败：元素不消失、数值不变、大肥鱼被弹出碰撞范围 */
        if (this.bowl) {
          var blk = R.bowlBlock({ value: this.value, bowl: this.bowl }, el);
          this.bowl = false;
          ev.kind = 'bowl-block';
          ev.moved = false;
          ev.bowlUsed = true;
          ev.detail = blk.detail;
          ev.el = el;
          ev.valueAfter = this.value;
          ev.status = 'playing';
          ev.reason = '铁盆挡下了「' + (R.TYPES[el.type] ? R.TYPES[el.type].name : el.type) + '」的失败判定';
          this.history.push(before);
          this.lastEvent = ev;
          return ev;
        }
        /* 真的失败：走进格子再判定，动画更好看 */
        this.px = nx; this.py = ny;
        this.value = newValue;
        this.status = 'lost';
        ev.kind = 'lose';
        ev.cause = res.kind;
        ev.lost = true;
        ev.status = 'lost';
        ev.valueAfter = this.value;
        if (res.detail && res.detail.need !== undefined) {
          ev.detail = res.detail;
          this.reason = res.detail.reason || '失败';
        } else {
          this.reason = '数值 ≤ 0';
          ev.detail = {
            title: '数值 ≤ 0',
            reason: '数值变成了 ' + E.fmtNum(this.value),
            formula: '数值 ≤ 0 就出局（当前 ' + E.fmtNum(this.value) + '）',
            value: this.value
          };
        }
        ev.reason = this.reason;
        this.history.push(before);
        this.lastEvent = ev;
        return ev;
      }

      /* 正常生效 */
      this.px = nx; this.py = ny;
      if (res.consume) {
        this.gone[el.id] = 1;
        this.eaten++;
      }
      this.value = newValue;
      if (res.bowl && !this.bowl) { this.bowl = true; ev.bowlGained = true; }
      ev.kind = res.kind;
      ev.detail = res.detail;
      ev.valueAfter = this.value;
      ev.win = !!res.win;
      if (res.win) {
        this.status = 'won';
        ev.status = 'won';
        ev.reason = '通关！';
      }
      var r = M.roomAt(lv, this.px, this.py);
      if (r) this.visitedRooms[r.id] = true;
    } else {
      this.px = nx; this.py = ny;
      var r2 = M.roomAt(lv, this.px, this.py);
      if (r2) this.visitedRooms[r2.id] = true;
    }

    this.steps++;
    this.history.push(before);
    if (this.history.length > 4000) this.history.shift();
    this.lastEvent = ev;
    return ev;
  };

  /** 当前所在房间 */
  Engine.prototype.room = function () { return M.roomAt(this.level, this.px, this.py); };

  /** 距离玩家最近的、尚未消失的元素（用于 UI 提示） */
  Engine.prototype.nearestElement = function (maxDist) {
    var lv = this.level, best = null, bd = (maxDist || 3) + 0.001;
    for (var i = 0; i < lv.elements.length; i++) {
      var el = lv.elements[i];
      if (this.gone[el.id]) continue;
      var d = Math.max(Math.abs(el.x - this.px), Math.abs(el.y - this.py));
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  };

  /* ── 用固定路线模拟一局（校验器用） ────────────────────
     path: [[x,y], ...] 从起点开始的完整路径（含起点）
     返回 { status, value, bowl, events, eaten }
     ────────────────────────────────────────────────────── */
  Engine.simulate = function (level, path, opts) {
    opts = opts || {};
    var eng = new Engine(level);
    if (opts.value !== undefined) eng.value = opts.value;
    var p = eng.px, q = eng.py;
    var events = [];
    for (var i = 0; i < path.length; i++) {
      var t = path[i];
      if (t[0] === p && t[1] === q) continue;
      var dx = t[0] - p, dy = t[1] - q;
      /* 只走单步，多步的路径自动展开成四邻域折线 */
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        var seg = orthoPath(p, q, t[0], t[1]);
        for (var s = 1; s < seg.length; s++) {
          var ev = eng.step(seg[s][0] - eng.px, seg[s][1] - eng.py);
          events.push(ev);
          if (eng.status !== 'playing') break;
        }
      } else {
        var ev2 = eng.step(dx, dy);
        events.push(ev2);
      }
      p = eng.px; q = eng.py;
      if (eng.status !== 'playing') break;
    }
    return {
      status: eng.status, value: eng.value, bowl: eng.bowl, eaten: eng.eaten,
      events: events, engine: eng, steps: eng.steps, reason: eng.reason
    };
  };

  function orthoPath(x0, y0, x1, y1) {
    var pts = [[x0, y0]], x = x0, y = y0;
    while (x !== x1) { x += x < x1 ? 1 : -1; pts.push([x, y]); }
    while (y !== y1) { y += y < y1 ? 1 : -1; pts.push([x, y]); }
    return pts;
  }
  G.Engine = Engine;
  G.orthoPath = orthoPath;
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
