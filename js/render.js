/* ─────────────────────────────────────────────────────────────
   render.js —— Canvas 渲染器
   ------------------------------------------------------------------
   · 相机默认「放大 + 跟随大肥鱼」，超出窗口的地图随鱼滚动（Z 键切全图）
   · 静态层按视口烘焙：无论 34×34 还是 124×124，地板/墙都是 1:1 清晰
   · 每颗大白饭身上标出它自己的数值（数值由关卡数据逐个指定）
   · 元素标签气泡宽度 = 文字实测宽度 + 内边距（随表达式长度自适应）
   · 屏幕边缘有指向终点的箭头 + 左下角小地图
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var M = G.map, S = G.sprites, FX = G.fx, R = G.rules;

  /* 跟随模式一屏显示多少格（越小放得越大；默认一屏约 16×9.5 格） */
  var TILES_X = 16, TILES_Y = 9.5;
  var TILE_MIN = 30, TILE_MAX = 76;
  /* 全图模式下限：整张图能塞进窗口且每格不小于这个像素才用全图 */
  var FIT_MIN_TILE = 30;
  /* 视口烘焙时向外多烘焙几格，避免镜头一动就重烘 */
  var BAKE_MARGIN = 6, BAKE_TRIGGER = 4;
  /* 烘焙瓦片尺寸上限（放大到 76px/格时也要 1:1 清晰） */
  var BAKE_MAX_TILE = 64;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0; this.h = 0;
    this.insets = { top: 74, bottom: 20, left: 0, right: 0 };
    this.tile = 24;
    this.camX = 0; this.camY = 0;
    this.fitUser = null;            /* null=自动, true=强制全图, false=强制跟随 */
    this.zoom = 1;                  /* 缩放偏好（+/- 可调，存 localStorage） */
    this.following = true;
    this.t = 0;
    this.level = null;
    this.engine = null;
    this.bake = null;
    this._bakeCanvas = null;
    this.mini = null;
    this.miniRooms = null;
    this.playerPos = null;          /* 连续坐标（格为单位），由 main 每帧写入 */
    this.playerAnim = { stepT: 0, spawn: 1, winT: 0, deadT: 0 };
    this.moving = false;
    this.bubbles = [];
    this.visible = null;
    this.lunge = null;
    this.hurt = 0;
    this.showLabels = true;
    this.centerOn = null;
    this.roomColorOf = {};
    this._tw = {};                  /* 文字宽度缓存 */
  }

  var ROOM_HUES = ['#22375c', '#1f4550', '#3a2f52', '#254a3c', '#4a3524', '#2b3f6b', '#452b3f', '#2f4a2a'];

  /* ── 尺寸 ─────────────────────────────────────────────── */
  Renderer.prototype.resize = function () {
    var cw = this.canvas.clientWidth || window.innerWidth;
    var ch = this.canvas.clientHeight || window.innerHeight;
    this.w = cw; this.h = ch;
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.view = {
      x: this.insets.left,
      y: this.insets.top,
      w: Math.max(40, cw - this.insets.left - this.insets.right),
      h: Math.max(40, ch - this.insets.top - this.insets.bottom)
    };
    if (this.level) { this.layout(); this.refreshOrigin(); }
  };

  Renderer.prototype.setInsets = function (i) {
    for (var k in i) this.insets[k] = i[k];
    this.resize();
  };

  /* ── 关卡 ─────────────────────────────────────────────── */
  Renderer.prototype.setLevel = function (engine, level) {
    this.engine = engine;
    this.level = level;
    this.lunge = null;
    this.hurt = 0;
    this.centerOn = null;
    this.playerPos = { x: engine.px, y: engine.py };
    this.roomColorOf = {};
    (level.rooms || []).forEach(function (r, i) {
      this.roomColorOf[r.id] = r.color || ROOM_HUES[i % ROOM_HUES.length];
    }, this);
    if (!this.view) this.resize();
    this.layout();
    if (this.following) { this.camX = engine.px + 0.5; this.camY = engine.py + 0.5; }
    this.refreshOrigin();
    this.buildMini();
    this.bakeStatic();
  };

  /* 主循环每帧把大肥鱼的连续位置写进来（平滑移动的核心） */
  Renderer.prototype.setPlayerPos = function (x, y) {
    if (!this.playerPos) this.playerPos = { x: x, y: y };
    else { this.playerPos.x = x; this.playerPos.y = y; }
  };

  /** 主循环每帧把动画进度写进来：走格进度 / 出生 / 通关 / 翻倒 */
  Renderer.prototype.setPlayerAnim = function (a) {
    if (!a) return;
    if (a.stepT !== undefined) this.playerAnim.stepT = a.stepT;
    if (a.spawn !== undefined) this.playerAnim.spawn = a.spawn;
    if (a.winT !== undefined) this.playerAnim.winT = a.winT;
    if (a.deadT !== undefined) this.playerAnim.deadT = a.deadT;
  };

  /** 把镜头立刻对准大肥鱼（切视角 / 撤销 / 换关时用，避免长距离滑动） */
  Renderer.prototype.snapCamera = function () {
    if (!this.following || !this.engine) return;
    var p = this.playerPos || { x: this.engine.px, y: this.engine.py };
    this.camX = p.x + 0.5;
    this.camY = p.y + 0.5;
    this.refreshOrigin();
    if (this.level) this.bakeViewport();
  };

  /* ── 相机 / 瓦片尺寸 ──────────────────────────────────── */
  Renderer.prototype.autoFit = function () {
    if (this.fitUser !== null) return this.fitUser;
    if (!this.level) return true;
    var v = this.view;
    var fitTile = Math.min(v.w / (this.level.w + 2), v.h / (this.level.h + 2));
    /* 整张图能塞进窗口、而且每格还够大 → 才用全图，否则放大跟随 */
    return fitTile >= FIT_MIN_TILE;
  };

  Renderer.prototype.layout = function () {
    var lv = this.level, v = this.view;
    if (!lv || !v) return;
    if (this.autoFit()) {
      this.tile = clamp(Math.min(v.w / (lv.w + 2), v.h / (lv.h + 2)), 4, 64);
      this.following = false;
      this.camX = lv.w / 2;
      this.camY = lv.h / 2;
    } else {
      this.tile = clamp(Math.min(v.w / TILES_X, v.h / TILES_Y) * this.zoom, TILE_MIN, TILE_MAX);
      this.following = true;
      var p = this.playerPos || { x: lv.start.x, y: lv.start.y };
      this.camX = p.x + 0.5; this.camY = p.y + 0.5;
    }
    this.refreshOrigin();
  };

  Renderer.prototype.refreshOrigin = function () {
    if (!this.view) return;
    this.originX = this.view.x + this.view.w / 2 - this.camX * this.tile;
    this.originY = this.view.y + this.view.h / 2 - this.camY * this.tile;
  };

  Renderer.prototype.screenOf = function (cx, cy) {
    return {
      x: this.originX + (cx + 0.5) * this.tile,
      y: this.originY + (cy + 0.5) * this.tile
    };
  };
  Renderer.prototype.cellAt = function (sx, sy) {
    return {
      x: Math.floor((sx - this.originX) / this.tile),
      y: Math.floor((sy - this.originY) / this.tile)
    };
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ── 静态层烘焙 ───────────────────────────────────────── */
  Renderer.prototype.bakeStatic = function () {
    if (!this.level) return;
    if (this.following) this.bakeViewport(); else this.bakeWhole();
  };

  /* 全图模式：整张图烘一次（此时格子很小，内存可控） */
  Renderer.prototype.bakeWhole = function () {
    var lv = this.level;
    var bt = Math.min(this.tile, Math.max(3, Math.min(48, 2048 / Math.max(lv.w, lv.h))));
    var cv = document.createElement('canvas');
    cv.width = Math.round(lv.w * bt);
    cv.height = Math.round(lv.h * bt);
    var c = cv.getContext('2d');
    this.paintTiles(c, bt, 0, 0, lv.w, lv.h);
    this.bake = { canvas: cv, tile: bt, ox: 0, oy: 0, w: lv.w, h: lv.h, whole: true };
    this.bakeAnchor = { x: lv.w / 2, y: lv.h / 2 };
  };

  /* 跟随模式：只烘视口 + 一圈余量，保证任何缩放都是 1:1 清晰 */
  Renderer.prototype.bakeViewport = function () {
    var lv = this.level, v = this.view;
    if (!v) return;
    var bt = Math.min(this.tile, BAKE_MAX_TILE);
    var visW = v.w / this.tile, visH = v.h / this.tile;
    var x0 = Math.max(0, Math.floor(this.camX - visW / 2) - BAKE_MARGIN);
    var y0 = Math.max(0, Math.floor(this.camY - visH / 2) - BAKE_MARGIN);
    var x1 = Math.min(lv.w, Math.ceil(this.camX + visW / 2) + BAKE_MARGIN);
    var y1 = Math.min(lv.h, Math.ceil(this.camY + visH / 2) + BAKE_MARGIN);
    var rw = Math.max(1, x1 - x0), rh = Math.max(1, y1 - y0);
    var cv = this._bakeCanvas || (this._bakeCanvas = document.createElement('canvas'));
    var pw = Math.round(rw * bt), ph = Math.round(rh * bt);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw, ph);
    this.paintTiles(c, bt, x0, y0, x1, y1);
    this.bake = { canvas: cv, tile: bt, ox: x0, oy: y0, w: rw, h: rh, whole: false };
    this.bakeAnchor = { x: this.camX, y: this.camY };
  };

  Renderer.prototype.paintTiles = function (c, bt, x0, y0, x1, y1) {
    var lv = this.level;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var slow = false;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var k = y * lv.w + x;
        var t = lv.tiles[k];
        if (t === M.VOID) continue;
        var room = M.roomAt(lv, x, y);
        var rc = room ? this.roomColorOf[room.id] : null;
        var px = (x - x0) * bt, py = (y - y0) * bt;
        if (!slow && ((x + y) & 3) === 0) {
          var tn = (window.performance && performance.now) ? performance.now() : Date.now();
          if (tn - t0 > 90) slow = true;
        }
        if (slow) {
          if (t === M.FLOOR) {
            c.fillStyle = rc || '#22375c';
            c.fillRect(px, py, bt, bt);
            if (((x + y) & 1) === 0) { c.fillStyle = 'rgba(255,255,255,.03)'; c.fillRect(px, py, bt, bt); }
          } else {
            c.fillStyle = (this.level && this.level.theme) ? this.level.theme.void : '#0a1120'; c.fillRect(px, py, bt, bt);
            c.fillStyle = 'rgba(122,170,255,.10)'; c.fillRect(px, py, bt, Math.max(1, bt * 0.16));
          }
          continue;
        }
        if (t === M.FLOOR) {
          S.floor(c, px + bt / 2, py + bt / 2, bt, {
            t: 0, roomColor: rc, checker: (x + y) & 1, x: x, y: y,
            seed: (x * 73856093 ^ y * 19349663) & 1023
          });
        } else {
          var edgeTop = (y > 0 && lv.tiles[k - lv.w] === M.FLOOR);
          S.wall(c, px + bt / 2, py + bt / 2, bt, {
            t: 0, roomColor: rc, edgeTop: edgeTop,
            seed: (x * 83492791 ^ y * 2654435761) & 1023
          });
        }
      }
    }
  };

  /* ── 小地图（跟随模式下防迷路） ───────────────────────── */
  Renderer.prototype.buildMini = function () {
    var lv = this.level;
    var cv = document.createElement('canvas');
    cv.width = lv.w; cv.height = lv.h;
    var c = cv.getContext('2d');
    var img = null;
    try { img = c.createImageData(lv.w, lv.h); } catch (e) { this.mini = null; return; }
    var cache = {};
    for (var y = 0; y < lv.h; y++) {
      for (var x = 0; x < lv.w; x++) {
        var k = y * lv.w + x, t = lv.tiles[k];
        var o = k * 4;
        if (t === M.VOID) { img.data[o + 3] = 0; continue; }
        if (t === M.WALL) { img.data[o] = 26; img.data[o + 1] = 36; img.data[o + 2] = 60; img.data[o + 3] = 235; continue; }
        var room = M.roomAt(lv, x, y);
        var hex = (room && this.roomColorOf[room.id]) || '#22375c';
        var rgb = cache[hex] || (cache[hex] = parseHex(hex));
        img.data[o] = Math.min(255, rgb[0] + 62);
        img.data[o + 1] = Math.min(255, rgb[1] + 62);
        img.data[o + 2] = Math.min(255, rgb[2] + 62);
        img.data[o + 3] = 235;
      }
    }
    c.putImageData(img, 0, 0);
    this.mini = cv;
  };

  function parseHex(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return [34, 55, 92];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ── 更新 ─────────────────────────────────────────────── */
  Renderer.prototype.update = function (dt) {
    this.t += dt;
    var eng = this.engine, lv = this.level;
    if (!eng || !lv) return;

    if (this.lunge) {
      this.lunge.t += dt / 0.34;
      if (this.lunge.t >= 1) this.lunge = null;
    }
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 1.8);

    if (this.following) {
      var v = this.view;
      var p = this.playerPos || { x: eng.px, y: eng.py };
      var tx = p.x + 0.5, ty = p.y + 0.5;
      if (this.centerOn) { tx = this.centerOn.x + 0.5; ty = this.centerOn.y + 0.5; }
      var visW = v.w / this.tile, visH = v.h / this.tile;
      if (visW < lv.w) tx = clamp(tx, visW / 2, lv.w - visW / 2); else tx = lv.w / 2;
      if (visH < lv.h) ty = clamp(ty, visH / 2, lv.h - visH / 2); else ty = lv.h / 2;
      var k = Math.min(1, dt * 11);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
      /* 镜头走远了就重烘视口 */
      if (this.bake && !this.bake.whole && this.bakeAnchor) {
        if (Math.abs(this.camX - this.bakeAnchor.x) > BAKE_TRIGGER ||
            Math.abs(this.camY - this.bakeAnchor.y) > BAKE_TRIGGER) {
          this.bakeViewport();
        }
      }
    }
    this.refreshOrigin();
  };

  /** 大肥鱼的绘制位置：连续位置 + 铁盆击退位移 */
  Renderer.prototype.playerDrawPos = function () {
    var eng = this.engine;
    var p = this.playerPos || { x: eng.px, y: eng.py };
    var x = p.x, y = p.y;
    if (this.lunge) {
      var s = Math.sin(Math.PI * Math.min(1, this.lunge.t)) * 0.55;
      x += this.lunge.dx * s;
      y += this.lunge.dy * s;
    }
    return { x: x, y: y };
  };

  /* ── 绘制 ─────────────────────────────────────────────── */
  Renderer.prototype.draw = function () {
    var ctx = this.ctx, lv = this.level, eng = this.engine;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!lv || !eng) return;

    var sh = FX.shakeOffset();
    ctx.save();
    ctx.translate(sh[0], sh[1]);

    if (this.bake) {
      var b = this.bake;
      ctx.imageSmoothingEnabled = b.tile > this.tile * 1.02;
      ctx.drawImage(b.canvas,
        this.originX + b.ox * this.tile, this.originY + b.oy * this.tile,
        b.w * this.tile, b.h * this.tile);
    }

    var v = this.view;
    var x0 = Math.floor((v.x - this.originX) / this.tile) - 1;
    var y0 = Math.floor((v.y - this.originY) / this.tile) - 1;
    var x1 = Math.ceil((v.x + v.w - this.originX) / this.tile) + 1;
    var y1 = Math.ceil((v.y + v.h - this.originY) / this.tile) + 1;
    this.visible = { x0: x0, y0: y0, x1: x1, y1: y1 };

    var tile = this.tile;
    var detail = tile >= 12;
    var showRiceValue = tile >= 13;
    var els = lv.elements;
    if (!this.bubbles) this.bubbles = [];

    /* 元素：先画不显示数值的，再画白饭（数值标在饭上） */
    this.bubbles.length = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.x < x0 || el.x > x1 || el.y < y0 || el.y > y1) continue;
      if (eng.gone[el.id]) continue;
      var p = this.screenOf(el.x, el.y);
      var o = { t: this.t, revealed: eng.isRevealed(el), value: eng.value };
      if (el.type === 'door' || el.type === 'goal') {
        o.tier = el.tier || R.doorTier(el);
        o.req = el.req;
        o.isGoal = el.type === 'goal';
        o.passed = false;
      }
      if (el.type === 'claude') o.factor = el.factor;
      if (el.type === 'user') o.happy = null;
      if (el.type === 'token') o.expr = el.expr;
      S.element(ctx, el, p.x, p.y, tile, o);
      if (showRiceValue && (el.type === 'rice' || el.type === 'bowl_rice')) {
        this.drawValueOnRice(ctx, p.x, p.y, tile, el);
      }
    }

    /* 已通过的门留一圈淡痕 */
    for (var g = 0; g < lv.doors.length; g++) {
      var dr = lv.doors[g];
      if (!eng.gone[dr.id]) continue;
      if (dr.x < x0 || dr.x > x1 || dr.y < y0 || dr.y > y1) continue;
      var pp = this.screenOf(dr.x, dr.y);
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#7aa9ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, tile * 0.36, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* 大肥鱼 */
    var pos = this.playerDrawPos();
    var sp = this.screenOf(pos.x - 0.5, pos.y - 0.5);
    this._playerScreen = sp;
    S.fish(ctx, sp.x, sp.y, tile * 1.12, {
      t: this.t,
      value: eng.value,
      facing: eng.facing,
      bowl: eng.bowl,
      moving: !!this.moving,
      stepT: this.playerAnim.stepT,
      spawn: this.playerAnim.spawn,
      winT: this.playerAnim.winT,
      deadT: this.playerAnim.deadT,
      hurt: this.hurt,
      dead: eng.status === 'lost'
    });

    if (detail) this.drawDoorLabels(ctx, x0, y0, x1, y1);

    var goal = lv.goal;
    if (goal && goal.type === 'hidden' && eng.isRevealed(goal) && !eng.gone[goal.id]) {
      var gp = this.screenOf(goal.x, goal.y);
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(this.t * 4);
      ctx.strokeStyle = '#a06bff';
      ctx.lineWidth = Math.max(1.4, tile * 0.07);
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, tile * (0.55 + 0.08 * Math.sin(this.t * 4)), 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (this.following) {
      if (lv.goal && !eng.gone[lv.goal.id]) this.drawGoalArrow(ctx);
      this.drawMini(ctx);
    }

    ctx.save();
    FX.draw(ctx);
    ctx.restore();
    FX.drawFlash(ctx, this.w, this.h);
  };

  /* 白饭身上的数值：每颗饭的数值都是关卡数据单独给的 */
  Renderer.prototype.drawValueOnRice = function (ctx, cx, cy, tile, el) {
    var txt = G.expr.fmtNum(el.value);
    var fs = Math.max(7, Math.min(19, tile * 0.42));
    var key = (fs | 0) + '|' + txt;
    var tw = this._tw[key];
    ctx.font = '800 ' + fs + 'px ui-monospace, "Cascadia Mono", Consolas, monospace';
    if (tw === undefined) { tw = ctx.measureText(txt).width; this._tw[key] = tw; }
    /* 数字太宽就缩一号，保证不糊出格子 */
    if (tw > tile * 1.05 && fs > 7) {
      fs = Math.max(7, fs * (tile * 1.05) / tw);
      ctx.font = '800 ' + fs + 'px ui-monospace, "Cascadia Mono", Consolas, monospace';
      tw = ctx.measureText(txt).width;
    }
    var y = cy + tile * (el.type === 'bowl_rice' ? 0.06 : 0.04);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (tile >= 22) {
      /* 格子够大：给个随文字宽度自适应的底 */
      var padX = fs * 0.34, padY = fs * 0.16, w = tw + padX * 2, h = fs + padY * 2;
      var rx = cx - w / 2, ry = y - h / 2, rr = Math.min(h / 2, 6);
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.arcTo(rx + w, ry, rx + w, ry + h, rr);
      ctx.arcTo(rx + w, ry + h, rx, ry + h, rr);
      ctx.arcTo(rx, ry + h, rx, ry, rr);
      ctx.arcTo(rx, ry, rx + w, ry, rr);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,16,28,.55)';
      ctx.fill();
    }
    ctx.lineWidth = Math.max(2, fs * 0.3);
    ctx.strokeStyle = 'rgba(5,9,18,.92)';
    ctx.strokeText(txt, cx, y);
    ctx.fillStyle = el.value < 0 ? '#ffd7db' : '#ffffff';
    ctx.fillText(txt, cx, y);
  };

  /* 文字气泡：背景宽度 = 实测文字宽度 + 内边距 */
  Renderer.prototype.textBubble = function (ctx, cx, cy, text, opts) {
    opts = opts || {};
    var fs = opts.fs || 10;
    ctx.font = (opts.bold === false ? '' : '700 ') + fs + 'px ui-monospace, "Cascadia Mono", Consolas, monospace';
    var tw = ctx.measureText(text).width;
    var padX = fs * 0.62, padY = fs * 0.38;
    var w = tw + padX * 2, h = fs + padY * 2;
    var x = cx - w / 2, y = cy - h / 2;
    var r = Math.min(h / 2, 6);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = opts.bg || 'rgba(8,14,26,.86)';
    ctx.fill();
    if (opts.stroke) { ctx.strokeStyle = opts.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = opts.fg || '#dce9ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + fs * 0.04);
    return w;
  };

  Renderer.prototype.drawDoorLabels = function (ctx, x0, y0, x1, y1) {
    var lv = this.level, eng = this.engine;
    var fs = Math.max(8, Math.min(14, this.tile * 0.30));
    /* 只写明"门槛 + 通过后怎么运算"，不透露当前数值能不能过 —— 让玩家自己算 */
    for (var i = 0; i < lv.doors.length; i++) {
      var d = lv.doors[i];
      if (eng.gone[d.id]) continue;
      if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
      var p = this.screenOf(d.x, d.y);
      var txt = '≥' + d.req + '　' + R.doorFormula(d);
      this.textBubble(ctx, p.x, p.y + this.tile * 0.74, txt, {
        fs: fs,
        bg: 'rgba(10,18,32,.90)',
        fg: '#dce9ff',
        stroke: 'rgba(122,170,255,.5)'
      });
    }
    var goal = lv.goal;
    if (goal && !eng.gone[goal.id] && !(goal.type === 'hidden' && !eng.isRevealed(goal))) {
      if (goal.x >= x0 && goal.x <= x1 && goal.y >= y0 && goal.y <= y1) {
        var gp = this.screenOf(goal.x, goal.y);
        this.textBubble(ctx, gp.x, gp.y + this.tile * 0.74, '终点 ≥' + goal.req, {
          fs: fs, bg: 'rgba(30,22,6,.92)', fg: '#ffe6a8', stroke: 'rgba(255,206,92,.55)'
        });
      }
    }
  };

  Renderer.prototype.drawGoalArrow = function (ctx) {
    var lv = this.level, v = this.view;
    var g = this.screenOf(lv.goal.x, lv.goal.y);
    if (g.x > v.x + 30 && g.x < v.x + v.w - 30 && g.y > v.y + 30 && g.y < v.y + v.h - 30) return;
    var cxp = v.x + v.w / 2, cyp = v.y + v.h / 2;
    var ang = Math.atan2(g.y - cyp, g.x - cxp);
    var rx = v.w / 2 - 26, ry = v.h / 2 - 26;
    var t = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)));
    var ax = cxp + Math.cos(ang) * t, ay = cyp + Math.sin(ang) * t;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffce5c';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, 0); ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.9;
    ctx.font = '700 11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffe6a8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('终点 ≥' + lv.goal.req, ax + Math.cos(ang) * -34, ay + Math.sin(ang) * -34);
    ctx.globalAlpha = 1;
  };

  /* 左下角小地图 */
  Renderer.prototype.drawMini = function (ctx) {
    var lv = this.level, eng = this.engine, v = this.view;
    if (!this.mini) return;
    var maxW = Math.min(190, v.w * 0.26), maxH = Math.min(190, v.h * 0.30);
    var scale = Math.min(maxW / lv.w, maxH / lv.h);
    var mw = lv.w * scale, mh = lv.h * scale;
    var mx = v.x + 12, my = v.y + v.h - mh - 12;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(6,10,20,.72)';
    rrect(ctx, mx - 5, my - 5, mw + 10, mh + 10, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122,170,255,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mini, mx, my, mw, mh);
    ctx.imageSmoothingEnabled = true;

    /* 视口框 */
    var visW = v.w / this.tile, visH = v.h / this.tile;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mx + (this.camX - visW / 2) * scale, my + (this.camY - visH / 2) * scale,
      visW * scale, visH * scale
    );

    /* 终点 */
    if (lv.goal && !eng.gone[lv.goal.id]) {
      ctx.fillStyle = '#ffce5c';
      ctx.beginPath();
      ctx.arc(mx + (lv.goal.x + 0.5) * scale, my + (lv.goal.y + 0.5) * scale, Math.max(2.4, scale), 0, 6.2832);
      ctx.fill();
    }
    /* 未通过的门（统一颜色，不透露数值够不够） */
    for (var i = 0; i < lv.doors.length; i++) {
      var d = lv.doors[i];
      if (eng.gone[d.id]) continue;
      ctx.fillStyle = '#7aa9ff';
      ctx.fillRect(mx + d.x * scale - 1, my + d.y * scale - 1, Math.max(2, scale * 1.6), Math.max(2, scale * 1.6));
    }
    /* 大肥鱼 */
    var p = this.playerPos || { x: eng.px, y: eng.py };
    ctx.fillStyle = '#7cc0ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx + (p.x + 0.5) * scale, my + (p.y + 0.5) * scale, Math.max(2.6, scale * 1.5), 0, 6.2832);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ── 给 UI 用的：需要显示气泡的元素 ─────────────────────
     返回 [{el, x, y, cls, text}]，UI 负责渲染成 DOM 气泡
     （DOM 气泡宽度用 max-content，天然适配表达式长度）
     ────────────────────────────────────────────────────── */
  Renderer.prototype.focusBubbles = function () {
    var out = [];
    var lv = this.level, eng = this.engine;
    if (!lv || !eng) return out;
    var near = this.following ? 2 : 1;
    var tile = this.tile;
    var needDom = tile < 15;
    var list = [];
    for (var i = 0; i < lv.elements.length; i++) {
      var el = lv.elements[i];
      if (eng.gone[el.id]) continue;
      if (el.type === 'rice' || el.type === 'bowl_rice') continue;   /* 数值已经画在饭上了 */
      if (el.type === 'hidden' && !eng.isRevealed(el)) continue;
      var d = Math.max(Math.abs(el.x - eng.px), Math.abs(el.y - eng.py));
      if (d <= near || (el.type === 'goal' && d <= near + 2)) list.push({ el: el, d: d });
    }
    list.sort(function (a, b) { return a.d - b.d; });
    var max = needDom ? 4 : 2;
    for (var k = 0; k < list.length && out.length < max; k++) {
      var el2 = list[k].el;
      var p = this.screenOf(el2.x, el2.y);
      out.push({
        el: el2, x: p.x, y: p.y - tile * 0.66,
        cls: el2.type === 'claude' ? 'claude' : (el2.type === 'user' ? 'user' : (R.isDoorType(el2.type) ? 'door' : '')),
        text: bubbleText(el2, eng)
      });
    }
    return out;
  };

  /* 元素气泡：只写规则（门槛 / 表达式 / 倍率 / 条件），
     绝不预告"算出来是多少"或"现在能不能过" —— 那是玩家自己要算的部分 */
  function bubbleText(el, eng) {
    switch (el.type) {
      case 'rice': return '🍚 +' + el.value;
      case 'bowl_rice': return '🍚+' + el.value + ' +🥣';
      case 'token': return '<b>x =</b> ' + el.expr;
      case 'claude': return '<b>x × ' + el.factor + '</b>';
      case 'user': {
        var pen = typeof el.penalty === 'number' ? el.penalty : el.bonus;
        return '若 <b>' + el.cond + '</b>　则 <b style="color:#48e5a3">+' + el.bonus +
          '</b>，否则 <b style="color:#ff5d6c">−' + pen + '</b>';
      }
      case 'door':
        return R.doorTierName(el) + ' <b>≥' + el.req + '</b>　通过后 <b>' + R.doorFormula(el) + '</b>';
      case 'goal':
        return '终点门 <b>≥' + el.req + '</b>';
      case 'hidden':
        return '隐藏通关格 <b>≥' + el.req + '</b>　(数值到 ' + el.reveal + ' 显形)';
      default: return R.formula(el);
    }
  }

  G.Renderer = Renderer;
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
