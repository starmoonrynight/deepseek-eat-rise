/* ─────────────────────────────────────────────────────────────
   main.js —— 启动、主循环、事件联动
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var R = G.rules, E = G.expr;
  var canvas, renderer, engine, level;
  var state = 'boot';                 /* boot | intro | playing | won | lost */
  var last = 0;
  var MOVE_SPEED = 6.4;               /* 每秒走几格：连续平滑移动的速度 */
  var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var mv = { active: false, dir: null, t: 0, oneShot: false, recoil: 0, lastDir: null };
  var tapDir = null;                  /* 点屏幕走一格 */
  var lastBakeTile = 0;
  var currentId = 1;
  /* 动画计时：出生弹入 / 通关跳起转圈 / 失败翻倒 */
  var animT = { spawn: 1, win: -1, dead: -1 };
  var lastCell = { x: -1, y: -1 };

  /* 立绘素材：默认会去 assets/ 找图（找不到就静默用程序化画法，不会报错）。
     你也可以什么都不放——直接把图片拖到游戏画面上，或者按 I 打开「形象素材」面板。
     想把仓库里的 assets 关掉，把这里改成 false 即可。 */
  var USE_IMAGE_ASSETS = true;

  var game = {
    lastGain: 0,
    restart: function () { loadLevel(currentId, { skipIntro: true }); },
    goLevel: function (id) { currentId = id; loadLevel(id); },
    toggleZoom: function () {
      renderer.fitUser = renderer.autoFit() ? false : true;
      renderer.layout();
      renderer.snapCamera();
      renderer.bakeStatic();
      lastBakeTile = renderer.tile;
      G.ui.toast(renderer.following
        ? '放大跟随视角（按 Z 切回全图）　左下角有小地图'
        : '全图视角（按 Z 放大跟随）', 'good');
      G.ui.setHint(renderer.following ? '放大跟随：地图随大肥鱼滚动 · Z 看全图' : (level.spec.hint || ''));
    },
    toggleMute: function () { var m = G.audio.toggle(); return m; },
    zoomIn: function () { applyZoom(1.12); },
    zoomOut: function () { applyZoom(1 / 1.12); },
    canDismissOverlay: function () { return false; }
  };
  G.game = game;

  /* ── 缩放偏好（+ / - 调，存 localStorage） ─────────────── */
  var ZOOM_KEY = 'dsf.fish.zoom';
  function loadZoom() {
    var z = 1;
    try {
      var v = parseFloat(window.localStorage.getItem(ZOOM_KEY));
      if (isFinite(v) && v > 0) z = v;
    } catch (e) { }
    return Math.max(0.6, Math.min(1.8, z));
  }
  function applyZoom(f, quiet) {
    renderer.zoom = Math.max(0.6, Math.min(1.8, renderer.zoom * f));
    if (renderer.fitUser !== null) renderer.fitUser = null;   /* 从全图切回跟随，缩放才看得见 */
    renderer.layout();
    renderer.snapCamera();
    renderer.bakeStatic();
    lastBakeTile = renderer.tile;
    try { window.localStorage.setItem(ZOOM_KEY, String(renderer.zoom)); } catch (e) { }
    if (!quiet) G.ui.toast('缩放 ' + Math.round(renderer.tile) + ' px/格　（ + / − 可调，Z 看全图）', 'good');
  }

  /* ── 尺寸 / 视野内边距 ────────────────────────────────── */
  function computeInsets() {
    var hud = document.getElementById('hud');
    var hint = document.getElementById('hint-bar');
    var top = 76, bottom = 40;
    if (hud) { var hr = hud.getBoundingClientRect(); top = hr.bottom + 8; }
    if (hint && !hint.classList.contains('hidden')) {
      var nr = hint.getBoundingClientRect();
      if (nr.height > 0) bottom = Math.max(30, window.innerHeight - nr.top + 10);
    }
    if (window.innerWidth < 720) bottom = Math.max(bottom, 20);
    return { top: top, bottom: bottom, left: 6, right: 6 };
  }

  /* ── 加载关卡 ─────────────────────────────────────────── */
  function loadLevel(id, opts) {
    opts = opts || {};
    currentId = id;
    G.ui.clearBubbles();
    G.ui.clearJudge();
    G.ui.closeOverlay();
    state = 'boot';
    G.fx.clear();

    var heavy = (G.levels.specById(id) || {}).size;
    if (heavy && heavy[0] > 60) G.ui.toast('正在构建 ' + heavy[0] + '×' + heavy[1] + ' 的大地图…');

    setTimeout(function () {
      var t0 = Date.now();
      var lv;
      try {
        lv = G.levels.get(id);
      } catch (e) {
        G.ui.toast('关卡构建失败：' + e.message, 'warn');
        console.error(e);
        return;
      }
      if (!lv) { G.ui.toast('找不到第 ' + id + ' 关', 'warn'); return; }
      level = lv;
      engine = new G.Engine(level);
      resetMove();
      mv.recoil = 0; mv.lastDir = null; tapDir = null;
      renderer.moving = false;
      animT.spawn = 0; animT.win = -1; animT.dead = -1;
      lastCell = { x: -1, y: -1 };
      renderer.setInsets(computeInsets());
      renderer.setLevel(engine, level);
      lastBakeTile = renderer.tile;
      var cost = Date.now() - t0;
      if (cost > 220) console.log('[DSF] 第 ' + id + ' 关构建耗时 ' + cost + 'ms（' + level.w + '×' + level.h + '，元素 ' + level.elements.length + '）');

      /* 自动反推门槛的结果，出问题要能一眼看到 */
      var at = level.autoTuneReport;
      if (at && at.failed) {
        console.warn('[DSF] 第 ' + id + ' 关门槛反推失败：' + (at.reason || ''));
        G.ui.toast('注意：第 ' + id + ' 关的最优解路线校验没通过（按 V 看详情）', 'warn');
      }

      G.ui.sync(engine, level);
      refreshSub();
      if (opts.skipIntro) {
        state = 'playing';
        G.ui.setHint(level.spec.hint || '');
      } else {
        state = 'intro';
        setTimeout(function () {
          G.ui.showIntro(level, function () {
            state = 'playing';
            G.ui.setHint(level.spec.hint || '');
            G.ui.toast('第 ' + level.id + ' 关 · ' + level.name, 'good');
          });
        }, 30);
      }
    }, 40);
  }

  function refreshSub() {
    if (!engine || !level) return;
    var goal = level.goal;
    G.ui.setValueSub('终点门槛 ' + E.fmtNum(goal ? goal.req : 0) +
      '　·　步数 ' + engine.steps + (engine.bowl ? '　·　铁盆 1' : ''));
  }

  /* ── 连续平滑移动 ───────────────────────────────────────
     引擎的 px/py 仍然是"所在格"，规则层完全不变；
     这里额外维护一个 0..1 的格内进度 t，渲染时插值成连续位置，
     抵达下一格的那一刻才调用 engine.step() 结算元素。
     ─────────────────────────────────────────────────────── */
  function resetMove() { mv.active = false; mv.dir = null; mv.t = 0; mv.oneShot = false; }

  /** 当前位置（连续坐标，格为单位）：走格插值 + 铁盆击退的回弹 */
  function playerContinuous() {
    if (!engine) return { x: 0, y: 0 };
    if (mv.active) {
      var v = G.input.delta(mv.dir);
      var t = Math.min(1, mv.t);
      return { x: engine.px + v[0] * t, y: engine.py + v[1] * t };
    }
    if (mv.recoil > 0 && mv.lastDir) {
      var r = G.input.delta(mv.lastDir);
      return { x: engine.px + r[0] * mv.recoil, y: engine.py + r[1] * mv.recoil };
    }
    return { x: engine.px, y: engine.py };
  }

  function canGo(d) {
    if (!d || !engine) return false;
    var v = G.input.delta(d);
    return engine.isWalkable(engine.px + v[0], engine.py + v[1]);
  }

  function beginMove(d, oneShot) {
    if (!canGo(d)) return false;
    mv.active = true; mv.dir = d; mv.t = 0; mv.oneShot = !!oneShot;
    engine.facing = d;
    return true;
  }

  function updateMovement(dt) {
    if (!engine || engine.status !== 'playing' || state !== 'playing' || G.ui.isOverlayOpen()) {
      resetMove();
      G.input.clearSwipes();
      tapDir = null;
      renderer.moving = false;
      return;
    }
    var swipe = G.input.takeSwipe();
    if (swipe) tapDir = swipe;
    var hold = G.input.dir();

    if (!mv.active) {
      var start = hold || tapDir;
      if (!start || !beginMove(start)) { renderer.moving = false; tapDir = null; return; }
      tapDir = null;
    }

    mv.t += dt * MOVE_SPEED;
    if (mv.t < 1) { renderer.moving = true; return; }

    /* ── 抵达下一格：交给引擎结算（所有规则与校验都不变） ── */
    var carry = mv.t - 1;
    mv.t = 0;
    var v = G.input.delta(mv.dir);
    var ev = engine.step(v[0], v[1]);
    /* 注意：铁盆碎裂时 ev.moved=false，但特效/音效/弹窗照样要放，所以无条件调用 */
    handleEvent(ev);
    if (!ev.moved || engine.status !== 'playing') {
      resetMove();
      renderer.moving = false;
      return;
    }

    /* ── 到达格心后决定下一步 ────────────────────────────
       按住方向键 -> 继续走（想转弯被墙挡住就先直行）
       只点了一下/滑了一下 -> 走完这一格就停
       什么都没按 -> 滑到格心停住
       ─────────────────────────────────────────────────── */
    var next = null;
    if (hold) {
      if (hold === mv.dir) next = hold;
      else if (canGo(hold)) next = hold;
      else if (canGo(mv.dir)) next = mv.dir;
    } else if (tapDir && canGo(tapDir)) {
      next = tapDir;
    }
    tapDir = null;
    if (!next) { resetMove(); renderer.moving = false; return; }

    var turned = (next !== mv.dir);
    if (turned) engine.facing = next;
    mv.dir = next;
    mv.active = true;
    /* 直行时把这一帧多走的一点带过去，速度才连续；转弯就重新起步 */
    mv.t = turned ? 0 : Math.min(0.99, carry);
    renderer.moving = true;
  }

  function screenOfCell(x, y) {
    var p = renderer.screenOf(x, y);
    return p;
  }

  function handleEvent(ev) {
    if (!ev) return;
    var pp = screenOfCell(engine.px, engine.py);
    var detail = ev.detail || {};
    var before = ev.valueBefore, after = ev.valueAfter;
    game.lastGain = (typeof after === 'number' && typeof before === 'number') ? (after - before) : 0;

    /* 数值 ≤ 0 这种"运算失败"也要先把它本身的效果演出来（先演出，再处理失败） */
    var fxKind = (ev.kind === 'lose') ? (ev.cause || '') : ev.kind;
    switch (fxKind) {
      case 'move': break;

      case 'rice':
        G.audio.play('eat');
        G.fx.burst('rice', pp.x, pp.y, { n: 8 });
        G.ui.float('+' + E.fmtNum(detail.delta !== undefined ? detail.delta : 0), 'good', pp.x, pp.y - renderer.tile * 0.5);
        break;

      case 'bowl_rice':
        G.audio.play('bowl');
        G.fx.burst('bowl', pp.x, pp.y, { n: 12 });
        G.fx.ring(pp.x, pp.y, '#cfd6e2', 6, renderer.tile * 1.4, 0.5);
        G.ui.float('+' + E.fmtNum(detail.delta) + ' 🥣', 'good', pp.x, pp.y - renderer.tile * 0.5);
        if (detail.gainBowl) G.ui.toast('获得铁盆 🥣 可免疫一次失败', 'good');
        break;

      case 'token':
        G.audio.play('coin');
        G.fx.burst('coin', pp.x, pp.y, { n: 14 });
        G.ui.float('token 改写', 'mul', pp.x, pp.y - renderer.tile * 0.5);
        G.ui.toast('token 改写了数值', 'good');
        break;

      case 'claude':
        G.audio.play('mul');
        G.fx.burst('claude', pp.x, pp.y, { n: 16, lift: 40 });
        G.ui.float('×' + E.fmtNum(detail.factor), 'mul', pp.x, pp.y - renderer.tile * 0.5);
        break;

      case 'user-ok':
        G.audio.play('if-ok');
        G.fx.burst('user', pp.x, pp.y, { n: 14 });
        G.ui.float('✓ +' + E.fmtNum(detail.bonus), 'good', pp.x, pp.y - renderer.tile * 0.5);
        G.ui.toast('用户很满意：' + detail.cond + ' ✔', 'good');
        break;

      case 'user-bad':
        G.audio.play('if-bad');
        G.fx.burst('hit', pp.x, pp.y, { n: 12 });
        G.fx.shake(6);
        G.ui.float('✗ −' + E.fmtNum(detail.penalty), 'bad', pp.x, pp.y - renderer.tile * 0.5);
        G.ui.toast('用户开始责备：' + detail.cond + ' ✘', 'warn');
        break;

      case 'door':
        if (ev.lost) break;      /* 门拒绝放行时不要放"开门"音效 */
        G.audio.play('door');
        G.fx.burst('door', pp.x, pp.y, { n: 20 });
        G.fx.ring(pp.x, pp.y, '#7aa9ff', 6, renderer.tile * 1.8, 0.55);
        G.fx.shake(5);
        G.ui.float('通过', 'good', pp.x, pp.y - renderer.tile * 0.5);
        break;

      case 'bowl-block': {
        G.audio.play('bowlbreak');
        G.fx.burst('bowl', pp.x, pp.y, { n: 26, power: 1.3 });
        G.fx.shake(13);
        G.ui.flashHit();
        renderer.hurt = 1;
        /* 铁盆碎了：大肥鱼从门口被弹回自己那一格 */
        mv.lastDir = ev.dx > 0 ? 'right' : ev.dx < 0 ? 'left' : ev.dy > 0 ? 'down' : 'up';
        mv.recoil = 0.92;
        var target = engine.elementAt(ev.el.x, ev.el.y);
        var tp = target ? screenOfCell(target.x, target.y) : pp;
        G.ui.judge(tp.x, tp.y - renderer.tile * 0.7, {
          title: '🥣 铁盆碎了',
          formula: detail.formula || '免疫一次失败',
          text: (detail.text || '') + '<br>元素还在原地，数值不变。',
          need: detail.need, have: detail.have
        });
        G.ui.toast('铁盆替你挡下了这次失败！', 'warn');
        break;
      }

      case 'lose': break;   /* 统一由下面的 ev.lost 处理 */

    }

    /* 失败 / 通关：无论走的是哪种元素，只看引擎给的结果 */
    if (ev.lost) doLose(ev, pp, detail);
    else if (ev.win) doWin(pp);

    refreshSub();
  }

  /* ── 失败演出：受击动画 + 判定范围弹窗 + 失败面板 ───────── */
  function doLose(ev, pp, detail) {
    G.audio.play('fail');
    G.fx.burst('hit', pp.x, pp.y, { n: 30, power: 1.25 });
    G.fx.shake(16);
    G.fx.flash('#ff3b50', 0.55);
    G.ui.flashHit();
    renderer.hurt = 1;
    state = 'lost';
    animT.dead = 0;                 /* 翻倒动画 */
    var jx = pp.x, jy = pp.y;
    if (detail.need !== undefined && ev.el) { var q = screenOfCell(ev.el.x, ev.el.y); jx = q.x; jy = q.y; }
    var text = '';
    if (detail.need === undefined) {
      text = detail.text || ('数值变成了 ' + E.fmtNum(engine.value) + '，≤ 0 就出局');
    }
    G.ui.judge(jx, jy - renderer.tile * 0.7, {
      title: '✖ ' + (detail.title || '失败'),
      formula: detail.formula || ('数值 ' + E.fmtNum(engine.value)),
      need: detail.need, have: detail.have,
      text: text
    });
    setTimeout(function () {
      if (state === 'lost') {
        G.ui.showFail(engine, level, ev, function (act) {
          if (act === 'restart') loadLevel(currentId, { skipIntro: true });
          else if (act === 'levels') G.ui.showLevels();
        });
      }
    }, 950);
  }

  /* ── 通关演出 ─────────────────────────────────────────── */
  function doWin(pp) {
    G.audio.play('win');
    G.fx.burst('win', pp.x, pp.y, { n: 80, power: 1.2 });
    G.fx.ring(pp.x, pp.y, '#ffce5c', 8, renderer.tile * 3.2, 0.8);
    G.fx.shake(7);
    state = 'won';
    animT.win = 0;                  /* 跳起来转两圈 */
    G.levels.markCleared(level.id);
    setTimeout(function () {
      if (state === 'won') {
        G.ui.showWin(engine, level, function (act) {
          if (act === 'next') {
            var nid = level.id + 1;
            if (nid <= G.levels.count()) game.goLevel(nid);
            else G.ui.showLevels();
          } else if (act === 'replay') loadLevel(currentId, { skipIntro: true });
          else if (act === 'levels') G.ui.showLevels();
        });
      }
    }, 800);
  }

  /* ── 主循环 ───────────────────────────────────────────── */
  function loop(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;

    if (renderer && level && engine) {
      updateMovement(dt);
      if (!mv.active && mv.recoil > 0) mv.recoil = Math.max(0, mv.recoil - dt * 4.2);
      var pp = playerContinuous();
      renderer.setPlayerPos(pp.x, pp.y);

      /* ── 动画计时：出生弹入 / 通关跳起转圈 / 失败翻倒 ── */
      if (animT.spawn < 1) animT.spawn = Math.min(1, animT.spawn + dt / 0.42);
      if (animT.win >= 0) animT.win = Math.min(1, animT.win + dt / 0.85);
      if (animT.dead >= 0) animT.dead = Math.min(1, animT.dead + dt / 0.7);
      renderer.setPlayerAnim({
        stepT: mv.active ? Math.min(1, mv.t) : 0,
        spawn: animT.spawn,
        winT: animT.win < 0 ? 0 : animT.win,
        deadT: animT.dead < 0 ? 0 : animT.dead
      });

      /* 每走到一个新格子 → 脚下扬一小撮尘 */
      if (lastCell.x !== engine.px || lastCell.y !== engine.py) {
        if (lastCell.x >= 0 && mv.active && engine.status === 'playing') {
          var fp = renderer.screenOf(engine.px, engine.py);
          G.fx.burst('dust', fp.x, fp.y + renderer.tile * 0.34, { n: 3, lift: 6 });
        }
        lastCell.x = engine.px; lastCell.y = engine.py;
      }

      renderer.update(dt);
      renderer.draw();
      G.fx.update(dt);

      if (Math.abs(renderer.tile - lastBakeTile) / Math.max(1, lastBakeTile) > 0.14) {
        renderer.bakeStatic();
        lastBakeTile = renderer.tile;
      }
      G.ui.syncBubbles(state === 'playing' ? renderer.focusBubbles() : []);
      G.ui.sync(engine, level);
    }
    requestAnimationFrame(loop);
  }

  /* ── 启动 ─────────────────────────────────────────────── */
  function boot() {
    canvas = document.getElementById('stage');
    renderer = new G.Renderer(canvas);
    renderer.zoom = loadZoom();
    G.levels.load();

    /* 打开页面就告知玩法 */
    G.ui.init(game);
    G.ui.syncMute(G.audio.isMuted());

    if (G.levels.count() === 0) {
      document.getElementById('overlay').classList.remove('hidden');
      document.getElementById('overlay-card').innerHTML =
        '<h1>关卡数据没加载出来</h1><div class="sub">' +
        '请确认 <code>js/levels/act1.js</code> 与 <code>js/levels/act2.js</code> 存在，' +
        '并且是双击 <code>index.html</code> 打开（用浏览器打开文件夹里的 index.html，而不是直接打开 js 文件）。' +
        '</div><div class="sub">也可以跑 <code>node tools/serve.mjs</code> 起一个本地服务器再访问。</div>';
      return;
    }

    /* 立绘素材：
       ① 单文件版会把图片以 base64 内嵌到 window.DSF_ASSETS，优先用；
       ② 否则去 assets/ 找图（找不到就静默用程序化画法，不会报错）；
       ③ 最后再套上浏览器本地存的（拖拽换的）形象，优先级最高。 */
    var embedded = window.DSF_ASSETS || null;
    if (embedded && embedded.fish && G.sprites && G.sprites.installArt) {
      G.sprites.installArt('fish', embedded.fish, function (ok) {
        if (ok && embedded.fish_bowl) {
          G.sprites.installArt('fish_bowl', embedded.fish_bowl, function () { G.ui.loadSavedArt(); });
        } else {
          G.ui.loadSavedArt();
        }
      });
      if (embedded.claude) G.sprites.installArt('claude', embedded.claude, function () { });
      if (embedded.user) G.sprites.installArt('user', embedded.user, function () { });
    } else if (USE_IMAGE_ASSETS && G.sprites && G.sprites.installArt) {
      /* 带 ?v= 版本号：换过立绘之后浏览器不会再拿旧缓存 */
      var VV = '?v=3';
      G.sprites.installArt('fish', 'assets/fish.png' + VV, function (ok) {
        if (!ok) { G.ui.loadSavedArt(); return; }   /* 没有 assets 目录就静默走程序化画法 */
        G.sprites.installArt('claude', 'assets/claude.png' + VV, function () { });
        G.sprites.installArt('user', 'assets/user.png' + VV, function () { });
        G.sprites.installArt('fish_bowl', 'assets/fish_bowl.png' + VV, function () {
          G.ui.loadSavedArt();                     /* 本地拖拽保存的形象优先级最高 */
        });
      });
    } else {
      G.ui.loadSavedArt();
    }

    var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    G.input.setPadVisible(touch);
    G.ui.setHint(touch
      ? '按住方向键连续移动 · 滑动走一格 · 左下角是小地图'
      : '按住方向键 / WASD 连续移动 · 点相邻格走一格 · +/− 缩放 · Z 全图 · R 重开 · C 图鉴');

    G.input.init({
      onAction: function (act) {
        if (act === 'restart') game.restart();
        else if (act === 'codex') G.ui.showCodex();
        else if (act === 'zoom') game.toggleZoom();
        else if (act === 'zoom-in') game.zoomIn();
        else if (act === 'zoom-out') game.zoomOut();
        else if (act === 'mute') G.ui.syncMute(game.toggleMute());
        else if (act === 'levels') G.ui.showLevels();
        else if (act === 'verify') G.ui.showVerify();
        else if (act === 'art') G.ui.showArt();
        else if (act === 'escape') { if (G.ui.isOverlayOpen()) G.ui.closeOverlay(); else G.ui.showLevels(); }
        else if (act === 'confirm') { if (G.ui.isOverlayOpen()) { var b = document.querySelector('#overlay-card .btn'); if (b) b.click(); } }
      },
      onTap: function (x, y) {
        /* 点一下相邻的地板 = 朝那个方向走一格 */
        if (state !== 'playing' || G.ui.isOverlayOpen() || !engine) return;
        var c = renderer.cellAt(x, y);
        var dx = c.x - engine.px, dy = c.y - engine.py;
        if (Math.abs(dx) + Math.abs(dy) !== 1) return;
        tapDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      },
      /* 长按格子：查看这个位置上元素的公式（只给规则，不给算好的结果） */
      onHold: function (x, y) {
        if (!engine || !level) return;
        var c = renderer.cellAt(x, y);
        var el = null;
        for (var i = 0; i < level.elements.length; i++) {
          if (level.elements[i].x === c.x && level.elements[i].y === c.y) { el = level.elements[i]; break; }
        }
        if (!el) { G.ui.toast('这里没有可查看的元素', 'warn'); return; }
        G.ui.showElement(el, engine);
      }
    });

    var onResize = function () {
      renderer.setInsets(computeInsets());
      if (level) renderer.bakeStatic();
      lastBakeTile = renderer.tile;
    };
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(onResize, 180); });
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 260); });
    document.addEventListener('visibilitychange', function () { last = 0; });

    /* URL 支持：#7 直接进第 7 关；?all=1 解锁全部 */
    try {
      if (/[?&]all=1/.test(location.search)) G.levels.unlockAll();
    } catch (e) { }
    var m = /#(\d+)/.exec(location.hash || '');
    var startId = m ? Math.max(1, Math.min(G.levels.count(), parseInt(m[1], 10))) : 1;
    if (!G.levels.isUnlocked(startId)) startId = 1;

    loadLevel(startId);
    requestAnimationFrame(function (ts) { last = ts; requestAnimationFrame(loop); });

    /* 方便调试：控制台里执行 DSF.debugState() 就能看到实时状态 */
    window.DSF.debugState = function () {
      var p = renderer.playerPos;
      return {
        level: level && level.id, px: engine && engine.px, py: engine && engine.py,
        fx: p ? Math.round(p.x * 100) / 100 : null,
        fy: p ? Math.round(p.y * 100) / 100 : null,
        moving: !!mv.active, dir: mv.dir,
        value: engine && engine.value, bowl: engine && engine.bowl,
        status: engine && engine.status, state: state, tile: renderer.tile,
        following: renderer.following, elements: level && level.elements.length,
        particles: G.fx.count()
      };
    };
    window.DSF.debugRefs = { get engine() { return engine; }, get level() { return level; }, get renderer() { return renderer; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
