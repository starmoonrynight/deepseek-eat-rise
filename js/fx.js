/* ─────────────────────────────────────────────────────────────
   fx.js —— 粒子 / 屏幕震动 / 冲击环（全部屏幕空间，绘制在最后）
   ------------------------------------------------------------------
   受击、吃白饭、倍乘、门开启、通关都会有反馈。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var parts = [], rings = [];
  var shakeAmp = 0, shakeT = 0, flashColor = null, flashA = 0;
  var MAX_PARTS = 520;

  var PRESET = {
    rice:    { n: 9,  colors: ['#f6f1e2', '#ffffff', '#d9d0b6'], size: [2, 4.4], spd: [40, 170], life: [.35, .7], g: 340, shape: 'dot' },
    bowl:    { n: 20, colors: ['#cfd6e2', '#8b95a8', '#ffffff', '#6f7b90'], size: [2, 5], spd: [70, 280], life: [.5, 1.0], g: 500, shape: 'shard' },
    coin:    { n: 14, colors: ['#ffce5c', '#ffe9a8', '#b8801a'], size: [2, 4.6], spd: [60, 240], life: [.4, .85], g: 260, shape: 'shard' },
    claude:  { n: 18, colors: ['#d97757', '#ffb08c', '#fff0e8'], size: [2.5, 5.6], spd: [50, 260], life: [.5, 1.05], g: 180, shape: 'heart' },
    user:    { n: 14, colors: ['#48e5a3', '#c9ffe9', '#1c7f5a'], size: [2, 4.6], spd: [50, 220], life: [.4, .9], g: 200, shape: 'dot' },
    door:    { n: 22, colors: ['#7aa9ff', '#ffce5c', '#ffffff', '#a06bff'], size: [2, 5], spd: [80, 320], life: [.45, .95], g: 120, shape: 'spark' },
    hit:     { n: 26, colors: ['#ff5d6c', '#ffb3bb', '#ffffff', '#7a0f1a'], size: [2.4, 6], spd: [110, 430], life: [.4, .9], g: 420, shape: 'spark' },
    dust:    { n: 5,  colors: ['#8fa6c8', '#6a7f9e', '#c8d6ea'], size: [1.6, 3.4], spd: [18, 78], life: [.22, .46], g: -14, shape: 'dot' },
    win:     { n: 90, colors: ['#ffce5c', '#48e5a3', '#7aa9ff', '#ffffff', '#ff9ecd'], size: [2.5, 6.5], spd: [90, 460], life: [.9, 1.9], g: 260, shape: 'shard' },
    spark:   { n: 8,  colors: ['#ffffff', '#ffce5c'], size: [1.5, 3.4], spd: [40, 180], life: [.25, .5], g: 60, shape: 'spark' }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function burst(kind, x, y, o) {
    o = o || {};
    var pr = PRESET[kind] || PRESET.spark;
    var n = o.n || pr.n;
    for (var i = 0; i < n; i++) {
      if (parts.length >= MAX_PARTS) parts.shift();
      var ang = o.dir !== undefined ? o.dir + rand(-0.85, 0.85) : rand(0, Math.PI * 2);
      var spd = rand(pr.spd[0], pr.spd[1]) * (o.power || 1);
      parts.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (o.lift || 0),
        life: 0, max: rand(pr.life[0], pr.life[1]),
        size: rand(pr.size[0], pr.size[1]) * (o.scale || 1),
        color: pick(pr.colors), g: pr.g * (o.grav === undefined ? 1 : o.grav),
        shape: pr.shape, rot: rand(0, 6.28), vr: rand(-9, 9), drag: 0.92
      });
    }
  }

  function ring(x, y, color, r0, r1, life) {
    rings.push({ x: x, y: y, r: r0 || 6, r1: r1 || 60, color: color || '#fff', life: 0, max: life || .42 });
  }

  function shake(amp) {
    shakeAmp = Math.max(shakeAmp, amp || 6);
    shakeT = 0;
  }

  function flash(color, a) {
    flashColor = color || '#ff3b50';
    flashA = a === undefined ? 0.5 : a;
  }

  function update(dt) {
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      var d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.life += dt;
      if (r.life >= r.max) { rings.splice(i, 1); continue; }
      var k = r.life / r.max;
      r.cur = r.r + (r.r1 - r.r) * (1 - Math.pow(1 - k, 3));
    }
    if (shakeAmp > 0) {
      shakeT += dt;
      shakeAmp *= Math.pow(0.0016, dt);
      if (shakeAmp < 0.16) shakeAmp = 0;
    }
    if (flashA > 0) {
      flashA -= dt * 2.6;
      if (flashA < 0) flashA = 0;
    }
  }

  function shakeOffset() {
    if (shakeAmp <= 0) return [0, 0];
    var a = shakeAmp;
    return [
      Math.sin(shakeT * 61.3) * a,
      Math.cos(shakeT * 47.7) * a * 0.85
    ];
  }

  function draw(ctx) {
    var i;
    /* 冲击环 */
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      var k = r.life / r.max;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, 5 * (1 - k));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.cur || r.r, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* 粒子 */
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = p.life / p.max;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 1.8, -p.size * 0.32, p.size * 3.6, p.size * 0.64);
        ctx.restore();
      } else if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.7 + 1);
        ctx.restore();
      } else if (p.shape === 'heart') {
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.4, p.y, p.size * 0.55, 0, 6.2832);
        ctx.arc(p.x + p.size * 0.4, p.y, p.size * 0.55, 0, 6.2832);
        ctx.moveTo(p.x - p.size * 0.85, p.y + p.size * 0.2);
        ctx.lineTo(p.x, p.y + p.size * 1.25);
        ctx.lineTo(p.x + p.size * 0.85, p.y + p.size * 0.2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash(ctx, w, h) {
    if (flashA <= 0) return;
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexA(flashColor, flashA));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function clear() { parts.length = 0; rings.length = 0; shakeAmp = 0; flashA = 0; }
  function count() { return parts.length; }

  G.fx = {
    burst: burst, ring: ring, shake: shake, flash: flash,
    update: update, draw: draw, drawFlash: drawFlash,
    shakeOffset: shakeOffset, clear: clear, count: count, hexA: hexA
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
