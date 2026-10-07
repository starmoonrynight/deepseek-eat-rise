/* ─────────────────────────────────────────────────────────────
   input.js —— 键盘(Windows) / 触屏(安卓) / 鼠标 三合一输入
   ------------------------------------------------------------------
   · 键盘：WASD、方向键、R 重开、U 撤销、C 图鉴、Z 视图、M 静音、L 关卡
   · 触屏：画布滑动（滑一下走一格，按住连续走）+ 右下角虚拟方向键
   · 鼠标：点击相邻格子走一步
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  var held = { up: false, down: false, left: false, right: false };
  var swipeQueue = [];
  var handlers = {};
  var padEl = null, canvasEl = null;
  var lastTouch = null, swipeLock = false;
  var touchStartT = 0;

  function init(opts) {
    handlers = opts || {};
    canvasEl = document.getElementById('stage');
    padEl = document.getElementById('pad');

    /* 键盘 */
    window.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var d = KEYMAP[e.key];
      if (d) { held[d] = true; e.preventDefault(); G.audio.unlock(); return; }
      var k = e.key.toLowerCase();
      if (k === 'r') handlers.onAction && handlers.onAction('restart');
      else if (k === 'c') handlers.onAction && handlers.onAction('codex');
      else if (k === 'z') handlers.onAction && handlers.onAction('zoom');
      else if (k === 'm') handlers.onAction && handlers.onAction('mute');
      else if (k === 'l') handlers.onAction && handlers.onAction('levels');
      else if (k === 'i') handlers.onAction && handlers.onAction('art');
      else if (k === 'v') handlers.onAction && handlers.onAction('verify');
      else if (k === 'escape') handlers.onAction && handlers.onAction('escape');
      else if (k === 'enter' || k === ' ') handlers.onAction && handlers.onAction('confirm');
      else if (k === 'p') handlers.onAction && handlers.onAction('pause');
    });
    window.addEventListener('keyup', function (e) {
      var d = KEYMAP[e.key];
      if (d) held[d] = false;
    });
    window.addEventListener('blur', function () {
      held.up = held.down = held.left = held.right = false;
    });

    /* 虚拟方向键 */
    if (padEl) {
      Array.prototype.forEach.call(padEl.querySelectorAll('.pad-btn'), function (btn) {
        var dir = btn.getAttribute('data-dir');
        var press = function (e) {
          e.preventDefault();
          held[dir] = true;
          G.audio.unlock();
          if (btn.setPointerCapture && e.pointerId !== undefined) { try { btn.setPointerCapture(e.pointerId); } catch (err) { } }
        };
        var release = function (e) { held[dir] = false; };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });
    }

    /* 画布：触屏滑动 + 鼠标点击 */
    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', function (e) {
        G.audio.unlock();
        lastTouch = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, id: e.pointerId };
        swipeLock = false;
      });
      canvasEl.addEventListener('pointermove', function (e) {
        if (!lastTouch || lastTouch.id !== e.pointerId) return;
        var dx = e.clientX - lastTouch.x, dy = e.clientY - lastTouch.y;
        var TH = 26;
        if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
        if (swipeLock) return;
        var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        swipeQueue.push(dir);
        /* 一次触摸可以连滑多格：把起点推到刚滑过的位置 */
        lastTouch = { x: e.clientX, y: e.clientY, t: Date.now(), moved: true, id: e.pointerId };
        if (swipeQueue.length > 3) swipeQueue.shift();
      });
      var endTouch = function (e) {
        if (!lastTouch) return;
        var quick = Date.now() - lastTouch.t < 260;
        if (!lastTouch.moved && quick && handlers.onTap) {
          var r = canvasEl.getBoundingClientRect();
          handlers.onTap(e.clientX - r.left, e.clientY - r.top);
        }
        lastTouch = null;
      };
      canvasEl.addEventListener('pointerup', endTouch);
      canvasEl.addEventListener('pointercancel', function () { lastTouch = null; });
      canvasEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    window.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.tagName === 'CANVAS') e.preventDefault();
    });
    /* 安卓：阻止双指缩放 / 下拉刷新 */
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('touchmove', function (e) {
      if (e.target && (e.target.id === 'stage' || (e.target.closest && e.target.closest('.pad')))) e.preventDefault();
    }, { passive: false });
  }

  /** 当前持续按住的方向 */
  function dir() {
    if (held.up) return 'up';
    if (held.down) return 'down';
    if (held.left) return 'left';
    if (held.right) return 'right';
    return null;
  }

  /** 取一个待处理的滑动方向 */
  function takeSwipe() { return swipeQueue.length ? swipeQueue.shift() : null; }
  function clearSwipes() { swipeQueue.length = 0; }
  function delta(d) { return DIRS[d] || [0, 0]; }

  G.input = {
    init: init, dir: dir, takeSwipe: takeSwipe, clearSwipes: clearSwipes, delta: delta, DIRS: DIRS,
    setPadVisible: function (v) { if (padEl) padEl.classList.toggle('hidden', !v); }
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
