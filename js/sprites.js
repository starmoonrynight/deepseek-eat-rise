/* ─────────────────────────────────────────────────────────────
   sprites.js —— 纯 Canvas 2D 程序化美术层（无外部图片依赖 / 无 ES module / 无第三方库）
   ------------------------------------------------------------------
   坐标约定：x, y 是「格子中心」的像素坐标，s 是格子边长（像素）。
   对外契约：
     · 每个函数自己 save()/restore()，绝不污染外部 ctx（变换 / alpha / 样式）
     · s <= 0、坐标非有限值、o 缺字段、ctx 缺失 —— 一律安全返回
     · 全部动画由 o.t（秒）驱动，不使用 setInterval / 定时器
   性能策略（120x120 地狱关每帧上千次调用也扛得住）：
     · s < 12  → element() 走低配路径：2~3 个填充色块 + 最多 1 个符号，
                 无渐变、无阴影、无粒子、最多 1 次 fillText
     · s >= 12 → 画细节；shadowBlur 只在 s >= 24 出现，且半径随 s 线性缩放
     · 内部统一用「单位坐标」（格子边长 = 1.0），靠 ctx.scale(px, px) 映射到设备，
       于是渐变可以在单位空间里按「配色变体」缓存，与格子大小无关
     · 每帧路径不 new 数组 / 不拼字符串（配色串、随机表、字体串全部预计算或缓存）
   ------------------------------------------------------------------
   门的门槛文字（≥req 与运算式）不在这里画 —— render.js 用 DOM 气泡绘制（宽度自适应），
   所以 o.req / o.expr / o.cond 只做兼容性接收，不参与绘制。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  /* ════════════════════════════════════════════════════════════
     0. 配色常量（与 css/style.css 里 :root 的变量一一对应）
     ════════════════════════════════════════════════════════════ */
  var PI = Math.PI, TAU = PI * 2;

  var C = {
    /* 深海蓝（大肥鱼） */
    blue: '#4d9bff', blueLight: '#6ea8ff', blueDeep: '#1d5fd6', blueDark: '#133f96',
    /* 米白（大白饭 / 肚皮） */
    rice: '#f6f1e2', riceShade: '#ddd6c0', riceDark: '#b9b096',
    /* Claude 橙 */
    orange: '#d97757', orangeDeep: '#b35a3c', orangeDark: '#8c4630',
    /* 金（token / 终点门） */
    gold: '#ffce5c', goldLight: '#ffe9a8', goldDeep: '#b8801a', goldDark: '#6b4a08',
    /* 铁盆 / 金属 */
    steel: '#cfd6e2', steelLight: '#eef3fa', steelDark: '#5c6579', steelDeep: '#39415a',
    /* 危险红 / 成功绿 */
    danger: '#ff5d6c', dangerDeep: '#c03a48',
    ok: '#48e5a3', okDeep: '#1c7f5a',
    /* 隐藏格紫 */
    purple: '#a06bff', purpleDeep: '#5a2fb0', purpleLight: '#e5d8ff',
    /* 中性 */
    ink: '#e8f0ff', inkDim: '#8fa4c8',
    night: '#070c17', slate: '#16223a', slateDeep: '#0d1526',
    stone: '#1b2437', stoneEdge: '#46587a',
    skin: '#f3d3bd', skinShade: '#e0b79c', eye: '#101c2e'
  };

  /* 门等级配色：1 减法门 2 除法门 3 复杂运算门 */
  var TIER_COLOR = ['#7aa9ff', '#a06bff', '#ffce5c'];
  /* 三级门流动条纹用的彩虹带（预计算，避免每帧拼 hsl 字符串） */
  var RAINBOW = ['#ff6b6b', '#ffb347', '#ffce5c', '#7ee787', '#48e5a3', '#4d9bff', '#a06bff', '#ff8fd0'];

  var SANS_FONT = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
  var MONO_FONT = 'ui-monospace,"Cascadia Mono",Consolas,"Segoe UI Mono",monospace';

  var LOW_S = 12;      /* < 12px：低配路径 */
  var DETAIL_S = 22;   /* >= 22px：开始画米粒 / 腮红 / 碎纹等微细节 */
  var SHADOW_S = 24;   /* >= 24px：才允许用 shadowBlur */

  /* 预计算的静态半透明色串（每帧复用，不做字符串拼接） */
  var A_DENT = 'rgba(52,62,84,0.55)';

  /* 蒸汽 / 星光 / 终点粒子 / 隐藏格尘点的固定随机表（模块顶层，只建一次） */
  var STEAM_X = [-0.17, 0.0, 0.17];
  var SPARK = [];
  var GOAL_P = [];
  var DUST = [];
  var STAR_X = [-0.17, 0.02, 0.19];
  var DASH_FAINT = [0.10, 0.13];
  var EMPTY_DASH = [];
  (function buildTables() {
    var i, g = 0.6180339887;
    for (i = 0; i < 8; i++) {
      var a1 = (i * g) % 1, a2 = (i * g * 1.7 + 0.31) % 1;
      SPARK.push({
        x: (a1 - 0.5) * 0.86,
        y: (a2 - 0.5) * 0.82,
        r: 0.05 + a2 * 0.05,
        ph: (i * 0.37) % 1
      });
    }
    for (i = 0; i < 6; i++) {
      var b1 = (i * g * 1.3) % 1;
      GOAL_P.push({ x: (b1 - 0.5) * 0.62, ph: (i / 6 + b1 * 0.1) % 1 });
    }
    for (i = 0; i < 3; i++) {
      var c1 = (i * g * 2.1 + 0.17) % 1, c2 = (i * g * 3.3 + 0.53) % 1;
      DUST.push({ x: (c1 - 0.5) * 0.6, y: (c2 - 0.5) * 0.6 });
    }
  })();

  /* ════════════════════════════════════════════════════════════
     1. 小工具
     ════════════════════════════════════════════════════════════ */
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function finite2(v) { return typeof v === 'number' && isFinite(v); }

  /** o.t 缺失时退回高性能时钟（仍然不是定时器，不产生累积状态） */
  function timeOf(o) {
    if (o && finite2(o.t)) return o.t;
    if (typeof performance !== 'undefined' && performance && performance.now) return performance.now() / 1000;
    return Date.now() / 1000;
  }

  /** 取元素类型：兼容「元素对象」「类型名字符串」「G.rules.TYPES 里的元数据（用 key）」 */
  function elType(el) {
    if (!el) return 'rice';
    if (typeof el === 'string') return el;
    return el.type || el.key || 'rice';
  }

  /* ── 颜色解析 / 混色（带缓存，避免重复 parseInt） ─────────── */
  var rgbCache = {};
  function rgbOf(hex) {
    var v = rgbCache[hex];
    if (v) return v;
    var s = String(hex), r = 0, g = 0, b = 0, t;
    if (s.charAt(0) === '#') {
      if (s.length >= 7) {
        r = parseInt(s.substr(1, 2), 16); g = parseInt(s.substr(3, 2), 16); b = parseInt(s.substr(5, 2), 16);
      } else if (s.length >= 4) {
        t = s.charAt(1); r = parseInt(t + t, 16);
        t = s.charAt(2); g = parseInt(t + t, 16);
        t = s.charAt(3); b = parseInt(t + t, 16);
      }
    }
    v = { r: r || 0, g: g || 0, b: b || 0 };
    rgbCache[hex] = v;
    return v;
  }
  function hex2(v) { var s = (v | 0).toString(16); return s.length < 2 ? '0' + s : s; }
  function rgbStr(r, g, b) { return '#' + hex2(clamp(Math.round(r), 0, 255)) + hex2(clamp(Math.round(g), 0, 255)) + hex2(clamp(Math.round(b), 0, 255)); }
  /** k > 0 提亮，k < 0 压暗 */
  function shadeHex(hex, k) {
    var c = rgbOf(hex);
    if (k >= 0) return rgbStr(c.r + (255 - c.r) * k, c.g + (255 - c.g) * k, c.b + (255 - c.b) * k);
    var f = 1 + k;
    return rgbStr(c.r * f, c.g * f, c.b * f);
  }
  function mixHex(a, b, k) {
    var ca = rgbOf(a), cb = rgbOf(b);
    return rgbStr(ca.r + (cb.r - ca.r) * k, ca.g + (cb.g - ca.g) * k, ca.b + (cb.b - ca.b) * k);
  }

  /* ── 每个 ctx 一份缓存（渐变 / 字体 / 调色板） ─────────────
     注意：CanvasGradient 与创建它的 ctx 配套使用最安全，
     所以按 ctx 分桶；图鉴的离屏 canvas 会不断新增 ctx，桶数封顶后整体重置防止无限增长。 */
  var stores = [];
  function storeFor(ctx) {
    for (var i = 0; i < stores.length; i++) {
      if (stores[i].ctx === ctx) return stores[i];
    }
    if (stores.length >= 24) stores.length = 0;
    var st = { ctx: ctx, grads: {}, fonts: {}, pal: {} };
    stores.push(st);
    return st;
  }
  function fontOf(ctx, px, weight, mono) {
    var size = Math.max(3, Math.round(px));
    var key = (weight || 700) + '|' + size + '|' + (mono ? 1 : 0);
    var st = storeFor(ctx), f = st.fonts[key];
    if (!f) {
      f = (weight || 700) + ' ' + size + 'px ' + (mono ? MONO_FONT : SANS_FONT);
      st.fonts[key] = f;
    }
    return f;
  }

  /* ── 路径工具（全部在单位空间：格子边长 = 1.0） ───────────── */
  var HAS_ELLIPSE = (typeof CanvasRenderingContext2D !== 'undefined') &&
                    !!CanvasRenderingContext2D.prototype.ellipse;

  function epath(ctx, cx, cy, rx, ry) {
    var a = Math.abs(rx) || 0.001, b = Math.abs(ry) || 0.001;
    if (HAS_ELLIPSE) { ctx.beginPath(); ctx.ellipse(cx, cy, a, b, 0, 0, TAU); return; }
    ctx.beginPath();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(a / b, 1); ctx.arc(0, 0, b, 0, TAU); ctx.restore();
  }
  function epathRot(ctx, cx, cy, rx, ry, rot) {
    var a = Math.abs(rx) || 0.001, b = Math.abs(ry) || 0.001;
    if (HAS_ELLIPSE) { ctx.beginPath(); ctx.ellipse(cx, cy, a, b, rot || 0, 0, TAU); return; }
    ctx.beginPath();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot || 0); ctx.scale(a / b, 1); ctx.arc(0, 0, b, 0, TAU); ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    if (!(rr > 0)) { ctx.beginPath(); ctx.rect(x, y, w, h); return; }
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
  /** 线宽：单位空间下不小于 minPx 像素（防止小格子里的线糊掉） */
  function lw(ctx, px, unit, minPx) { ctx.lineWidth = Math.max(unit, (minPx || 0.9) / (px || 1)); }

  /** 在已 scale(px,px) 的坐标系里按「像素」写字：字号可控、小字清晰 */
  function textPx(ctx, px, str, size, ux, uy, weight, mono) {
    ctx.save();
    ctx.scale(1 / px, 1 / px);
    ctx.font = fontOf(ctx, size, weight, mono);
    ctx.fillText(str, ux * px, uy * px);
    ctx.restore();
  }
  /** 四芒星闪光 */
  function star4(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(r * 0.30, 0.004);
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  function star8(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(r * 0.26, 0.004);
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    var d = r * 0.62, s2 = d * 0.7071;
    ctx.moveTo(x - s2, y - s2); ctx.lineTo(x + s2, y + s2);
    ctx.moveTo(x + s2, y - s2); ctx.lineTo(x - s2, y + s2);
    ctx.stroke();
  }
  /** 可复现哈希（墙 / 地板的噪点、石缝错位） */
  function hash2(x, y, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ════════════════════════════════════════════════════════════
     2. 缓存的单位空间渐变（按配色变体，与 s 无关）
     ════════════════════════════════════════════════════════════ */
  function fishGrad(ctx, cold) {
    var key = cold ? 'fishCold' : 'fish';
    var st = storeFor(ctx), g = st.grads[key];
    if (!g) {
      g = ctx.createLinearGradient(0, -0.42, 0, 0.44);
      if (cold) {
        g.addColorStop(0, '#bcd8ff'); g.addColorStop(0.32, '#6f9fe0');
        g.addColorStop(0.74, '#35619f'); g.addColorStop(1, '#20406e');
      } else {
        g.addColorStop(0, '#8ec2ff'); g.addColorStop(0.30, '#5b9bf5');
        g.addColorStop(0.72, '#2d6fe0'); g.addColorStop(1, '#1d5fd6');
      }
      st.grads[key] = g;
    }
    return g;
  }
  function finGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.fin;
    if (!g) {
      g = ctx.createLinearGradient(0, -0.4, 0, 0.4);
      g.addColorStop(0, '#4f8ef0'); g.addColorStop(1, '#1c50b4');
      st.grads.fin = g;
    }
    return g;
  }
  function riceGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.rice;
    if (!g) {
      g = ctx.createLinearGradient(-0.2, -0.44, 0.16, 0.24);
      g.addColorStop(0, '#fffdf6'); g.addColorStop(0.45, C.rice); g.addColorStop(1, C.riceShade);
      st.grads.rice = g;
    }
    return g;
  }
  function bowlGrad(ctx, metal) {
    var key = metal ? 'bowlM' : 'bowlP';
    var st = storeFor(ctx), g = st.grads[key];
    if (!g) {
      g = ctx.createLinearGradient(-0.2, 0.04, 0.2, 0.5);
      if (metal) {
        g.addColorStop(0, '#eef3fa'); g.addColorStop(0.35, '#aab4c6');
        g.addColorStop(0.72, '#69738a'); g.addColorStop(1, '#3f4660');
      } else {
        g.addColorStop(0, '#f2f4f8'); g.addColorStop(0.55, '#d5d9e2'); g.addColorStop(1, '#a9aebd');
      }
      st.grads[key] = g;
    }
    return g;
  }
  function steelGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.steel;
    if (!g) {
      g = ctx.createLinearGradient(-0.3, -0.4, 0.25, 0.15);
      g.addColorStop(0, '#f4f7fc'); g.addColorStop(0.34, '#c3ccdb');
      g.addColorStop(0.7, '#7d8ba3'); g.addColorStop(1, '#47536b');
      st.grads.steel = g;
    }
    return g;
  }
  function coinGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.coin;
    if (!g) {
      g = ctx.createLinearGradient(-0.3, -0.4, 0.3, 0.4);
      g.addColorStop(0, '#fff4c9'); g.addColorStop(0.32, C.gold);
      g.addColorStop(0.74, '#e0a52c'); g.addColorStop(1, C.goldDeep);
      st.grads.coin = g;
    }
    return g;
  }
  function hairGrad(ctx, dark) {
    var key = dark ? 'hairD' : 'hair';
    var st = storeFor(ctx), g = st.grads[key];
    if (!g) {
      g = ctx.createLinearGradient(-0.2, -0.5, 0.2, 0.2);
      if (dark) { g.addColorStop(0, '#c2674a'); g.addColorStop(1, C.orangeDark); }
      else { g.addColorStop(0, '#e8916f'); g.addColorStop(0.5, C.orange); g.addColorStop(1, C.orangeDeep); }
      st.grads[key] = g;
    }
    return g;
  }
  function stoneGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.stone;
    if (!g) {
      g = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
      g.addColorStop(0, '#3b4866'); g.addColorStop(0.45, '#2a3450');
      g.addColorStop(1, '#1a2338');
      st.grads.stone = g;
    }
    return g;
  }
  function goldArchGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.goldArch;
    if (!g) {
      g = ctx.createLinearGradient(0, -0.55, 0, 0.5);
      g.addColorStop(0, '#fff0bf'); g.addColorStop(0.4, C.gold);
      g.addColorStop(0.8, '#e0a52c'); g.addColorStop(1, '#9a6a12');
      st.grads.goldArch = g;
    }
    return g;
  }
  function dressGrad(ctx) {
    var st = storeFor(ctx), g = st.grads.dress;
    if (!g) {
      g = ctx.createLinearGradient(-0.2, -0.1, 0.2, 0.32);
      g.addColorStop(0, '#e8916f'); g.addColorStop(0.55, C.orange); g.addColorStop(1, C.orangeDeep);
      st.grads.dress = g;
    }
    return g;
  }
  function bodyGradTeal(ctx, blame) {
    var key = blame ? 'tealBad' : 'teal';
    var st = storeFor(ctx), g = st.grads[key];
    if (!g) {
      g = ctx.createLinearGradient(0, -0.4, 0, 0.45);
      if (blame) { g.addColorStop(0, '#ffc3c9'); g.addColorStop(0.5, '#ff8f98'); g.addColorStop(1, '#c03a48'); }
      else { g.addColorStop(0, '#8bf3c9'); g.addColorStop(0.45, C.ok); g.addColorStop(1, '#1c9c6d'); }
      st.grads[key] = g;
    }
    return g;
  }

  /* ── 墙 / 地板调色板（按 roomColor + checker 缓存，每关只算一次） ── */
  function floorPal(ctx, roomColor, checker) {
    var key = 'F|' + (roomColor || '-') + '|' + checker;
    var st = storeFor(ctx), p = st.pal[key];
    if (p) return p;
    var main = mixHex(C.slate, roomColor || C.blue, 0.20);
    if (checker === 1) main = shadeHex(main, 0.11);
    else if (checker === 2) main = shadeHex(main, -0.13);
    var g = ctx.createLinearGradient(0, -0.5, 0, 0.5);
    g.addColorStop(0, shadeHex(main, 0.16));
    g.addColorStop(0.55, main);
    g.addColorStop(1, shadeHex(main, -0.20));
    p = {
      main: main,
      grad: g,
      edge: shadeHex(main, 0.26),
      dark: shadeHex(main, -0.40),
      speck: shadeHex(main, 0.36),
      crack: shadeHex(main, -0.52)
    };
    st.pal[key] = p;
    return p;
  }
  function wallPal(ctx, roomColor) {
    var key = 'W|' + (roomColor || '-');
    var st = storeFor(ctx), p = st.pal[key];
    if (p) return p;
    var main = mixHex(C.stone, roomColor || C.blue, 0.12);
    var g = ctx.createLinearGradient(0, -0.5, 0, 0.5);
    g.addColorStop(0, shadeHex(main, 0.20));
    g.addColorStop(0.42, main);
    g.addColorStop(1, shadeHex(main, -0.34));
    p = {
      main: main,
      grad: g,
      top: shadeHex(main, 0.34),
      topStrong: shadeHex(main, 0.62),
      bottom: shadeHex(main, -0.52),
      speck: shadeHex(main, 0.30),
      seam: shadeHex(main, -0.58)
    };
    st.pal[key] = p;
    return p;
  }

  /* ════════════════════════════════════════════════════════════
     3. 低配路径素材表（s < 12 用；颜色 / 符号优先对齐 G.rules.TYPES）
     ════════════════════════════════════════════════════════════ */
  var LOW = {
    rice: { fill: C.rice, ink: '#4a4433', tag: '饭', shape: 'tri' },
    bowl_rice: { fill: C.steel, ink: '#2b3244', tag: '盆', shape: 'tri' },
    token: { fill: C.gold, ink: '#5c3f00', tag: 'T', shape: 'circle' },
    claude: { fill: C.orange, ink: '#3a1a10', tag: '×', shape: 'circle' },
    user: { fill: C.ok, ink: '#0d3b2a', tag: '?', shape: 'circle' },
    door: { fill: '#7aa9ff', ink: '#0d2145', tag: '门', shape: 'square' },
    goal: { fill: '#ffb347', ink: '#4a2600', tag: '终', shape: 'square' },
    /* 隐藏格刻意不取 TYPES 的紫色：未显形时必须像地板 */
    hidden: { fill: '#16223a', ink: C.purpleLight, tag: '隐', shape: 'square' }
  };
  (function alignLowWithRules() {
    var TYPES = (G.rules && G.rules.TYPES) || {};
    var keys = ['rice', 'bowl_rice', 'token', 'claude', 'user', 'door', 'goal'];
    for (var i = 0; i < keys.length; i++) {
      var m = LOW[keys[i]], T = TYPES[keys[i]];
      if (!T) continue;
      if (T.color) m.fill = T.color;
      if (T.accent) m.edge = T.accent;
      if (T.tag) m.tag = T.tag;
    }
    LOW.hidden.edge = C.purple;
  })();

  /* ════════════════════════════════════════════════════════════
     4. 大肥鱼
     ════════════════════════════════════════════════════════════ */
  function fishBodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0.44, 0.00);
    ctx.bezierCurveTo(0.47, -0.22, 0.26, -0.39, 0.02, -0.39);
    ctx.bezierCurveTo(-0.22, -0.39, -0.35, -0.24, -0.34, -0.02);
    ctx.bezierCurveTo(-0.33, 0.20, -0.16, 0.37, 0.06, 0.38);
    ctx.bezierCurveTo(0.27, 0.39, 0.42, 0.24, 0.44, 0.00);
    ctx.closePath();
  }

  function fishEye(ctx, px, cx, cy, r, closed, squint) {
    if (closed) {
      ctx.strokeStyle = C.eye;
      lw(ctx, px, 0.024, 1);
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.1);
      ctx.quadraticCurveTo(cx, cy + r * 1.05, cx + r, cy - r * 0.1);
      ctx.stroke();
      return;
    }
    var ry = r * (squint ? 0.60 : 1.02);
    ctx.fillStyle = '#ffffff';
    epath(ctx, cx, cy, r, ry);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,26,48,0.55)';
    lw(ctx, px, 0.012, 0.5);
    ctx.stroke();
    ctx.fillStyle = C.eye;
    epath(ctx, cx + r * 0.18, cy + ry * 0.10, r * 0.52, ry * 0.62);
    ctx.fill();
    if (!squint) {
      ctx.fillStyle = '#ffffff';
      epath(ctx, cx - r * 0.26, cy - ry * 0.36, r * 0.22, r * 0.22);
      ctx.fill();
    }
  }
  function fishEyeX(ctx, px, cx, cy, r) {
    ctx.strokeStyle = C.eye;
    lw(ctx, px, 0.032, 1.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
  }

  /** 铁盆（戴在头上）—— 单位空间，调用前 ctx 已 translate 到格子中心 */
  function drawBasin(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    ctx.save();
    ctx.translate(0.04, -0.34);
    ctx.rotate(Math.sin(t * 4.3) * 0.055 + Math.cos(t * 3.1) * 0.028);

    /* 盆体：倒扣的半圆 */
    ctx.beginPath();
    ctx.arc(0, 0.06, 0.35, PI, TAU);
    ctx.closePath();
    ctx.fillStyle = steelGrad(ctx);
    ctx.fill();

    /* 盆底反光（两条斜高光） */
    ctx.save();
    ctx.globalAlpha = A * 0.55;
    ctx.fillStyle = '#ffffff';
    epathRot(ctx, -0.13, -0.09, 0.115, 0.042, -0.55);
    ctx.fill();
    ctx.globalAlpha = A * 0.30;
    epathRot(ctx, 0.06, -0.16, 0.085, 0.030, -0.55);
    ctx.fill();
    ctx.restore();

    /* 两道凹痕 */
    ctx.strokeStyle = A_DENT;
    lw(ctx, px, 0.024, 0.9);
    ctx.beginPath(); ctx.arc(0, 0.06, 0.245, PI * 1.10, PI * 1.90); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.06, 0.145, PI * 1.12, PI * 1.88); ctx.stroke();

    /* 盆沿：一圈亮边 + 内侧高光 */
    ctx.fillStyle = '#c9d3e2';
    epath(ctx, 0, 0.062, 0.372, 0.086);
    ctx.fill();
    ctx.fillStyle = C.steelLight;
    epath(ctx, 0, 0.046, 0.345, 0.050);
    ctx.fill();
    ctx.globalAlpha = A * 0.75;
    ctx.fillStyle = '#ffffff';
    epath(ctx, -0.20, 0.040, 0.055, 0.022);
    ctx.fill();
    ctx.globalAlpha = A;
    ctx.restore();
  }

  /** 鱼本体（已 translate 到格心 + scale 到单位空间 + 已按 facing 镜像/旋转） */
  function drawFish(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var moving = !!o.moving;
    var hurt = clamp01(num(o.hurt, 0));
    var bowl = !!o.bowl;
    var dead = !!o.dead;
    var blind = !!o.blink;
    var facing = o.facing;
    if (facing !== 'up' && facing !== 'down' && facing !== 'left' && facing !== 'right') facing = 'down';
    var value = num(o.value, 0);

    /* ── 动画参数：全部由 t 驱动 ─────────────────────────── */
    var bob = moving ? Math.sin(t * 9.0) * 0.02 : Math.sin(t * 2.1) * 0.06;   /* 待机 ±6% s */
    var sq = moving ? Math.sin(t * 11.0) : 0;
    var br = Math.sin(t * 2.1) * 0.02;
    var sx = moving ? 1 + 0.07 * sq : 1 + br;
    var sy = moving ? 1 - 0.07 * sq : 1 - br;
    if (value > 999) sx *= 1.10;                                             /* 数值太大 → 撑胖一点 */
    var roll = moving ? Math.sin(t * 7.5) * 0.055 : Math.sin(t * 1.6) * 0.02;
    var tilt = facing === 'up' ? -0.20 : (facing === 'down' ? 0.14 : 0);
    if (dead) roll += Math.sin(t * 1.7) * 0.12 - 0.10;
    var shakeX = hurt > 0 ? Math.sin(t * 52) * 0.045 * hurt : 0;
    var shakeY = hurt > 0 ? Math.cos(t * 61) * 0.035 * hurt : 0;

    ctx.translate(shakeX, bob + shakeY);
    ctx.rotate(roll + tilt);
    ctx.scale(sx, sy);

    /* ── 水下投影 ─────────────────────────────────────────── */
    if (px >= 20) {
      ctx.globalAlpha = A * 0.22;
      ctx.fillStyle = '#04070f';
      epath(ctx, 0, 0.47 - bob, 0.33, 0.06);
      ctx.fill();
      ctx.globalAlpha = A;
    }

    var wag = Math.sin(t * (moving ? 10 : 2.4)) * (moving ? 0.34 : 0.17);
    var tailDip = facing === 'up' ? 0.28 : (facing === 'down' ? -0.24 : 0);

    /* ── 尾鳍（月牙，画在身体后） ─────────────────────────── */
    ctx.save();
    ctx.translate(-0.30, 0.03);
    ctx.rotate(wag * 0.55 + tailDip * 0.5 + (dead ? 0.18 : 0));
    ctx.beginPath();
    ctx.moveTo(0.02, 0);
    ctx.quadraticCurveTo(-0.12, -0.11, -0.23, -0.31);
    ctx.quadraticCurveTo(-0.10, -0.06, -0.05, 0.00);
    ctx.quadraticCurveTo(-0.10, 0.07, -0.23, 0.31);
    ctx.quadraticCurveTo(-0.12, 0.11, 0.02, 0);
    ctx.closePath();
    ctx.fillStyle = finGrad(ctx);
    ctx.fill();
    ctx.globalAlpha = A * 0.35;
    ctx.fillStyle = '#8ec2ff';
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.01);
    ctx.quadraticCurveTo(-0.10, -0.08, -0.18, -0.22);
    ctx.quadraticCurveTo(-0.09, -0.05, -0.04, 0.0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = A;
    ctx.restore();

    /* ── 背鳍 ─────────────────────────────────────────────── */
    ctx.save();
    ctx.translate(-0.03, -0.30);
    ctx.rotate(Math.sin(t * 3.1) * 0.06 + tailDip * 0.2);
    ctx.beginPath();
    ctx.moveTo(-0.10, 0.03);
    ctx.quadraticCurveTo(-0.02, -0.24, 0.16, 0.02);
    ctx.quadraticCurveTo(0.03, -0.03, -0.10, 0.03);
    ctx.closePath();
    ctx.fillStyle = finGrad(ctx);
    ctx.fill();
    ctx.restore();

    /* ── 身体 ─────────────────────────────────────────────── */
    fishBodyPath(ctx);
    ctx.fillStyle = fishGrad(ctx, bowl);
    ctx.fill();

    /* 肚皮（裁剪在身体内的米白） */
    ctx.save();
    fishBodyPath(ctx);
    ctx.clip();
    ctx.fillStyle = C.rice;
    epath(ctx, 0.06, 0.235, 0.35, 0.20);
    ctx.fill();
    ctx.globalAlpha = A * 0.55;
    ctx.fillStyle = '#ffffff';
    epath(ctx, 0.10, 0.18, 0.27, 0.10);
    ctx.fill();
    ctx.globalAlpha = A;
    if (px >= DETAIL_S) {
      /* 肚皮褶 */
      ctx.strokeStyle = 'rgba(185,176,150,0.55)';
      lw(ctx, px, 0.012, 0.6);
      for (var i = 0; i < 3; i++) {
        var gx = -0.16 + i * 0.16;
        ctx.beginPath();
        ctx.moveTo(gx, 0.13);
        ctx.quadraticCurveTo(gx + 0.02, 0.24, gx - 0.01, 0.34);
        ctx.stroke();
      }
    }
    /* 背部高光 */
    ctx.globalAlpha = A * 0.22;
    ctx.fillStyle = '#ffffff';
    epathRot(ctx, 0.14, -0.26, 0.22, 0.075, -0.30);
    ctx.fill();
    ctx.globalAlpha = A;
    /* 盆沿压在头上的阴影 */
    if (bowl) {
      ctx.globalAlpha = A * 0.30;
      ctx.fillStyle = '#050a14';
      epath(ctx, 0.04, -0.24, 0.30, 0.075);
      ctx.fill();
      ctx.globalAlpha = A;
    }
    ctx.restore();

    /* ── 胸鳍 ─────────────────────────────────────────────── */
    var flap = Math.sin(t * (moving ? 8.5 : 2.2)) * 0.22;
    ctx.save();
    ctx.translate(0.12, 0.14);
    ctx.rotate(0.55 + flap);
    ctx.fillStyle = finGrad(ctx);
    epath(ctx, 0, 0, 0.115, 0.058);
    ctx.fill();
    ctx.restore();
    if (!moving) {
      ctx.save();
      ctx.translate(-0.12, 0.12);
      ctx.rotate(0.35 - flap * 0.7);
      ctx.globalAlpha = A * 0.85;
      ctx.fillStyle = finGrad(ctx);
      epath(ctx, 0, 0, 0.095, 0.05);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = A;
    }

    /* ── 眼睛 / 嘴 / 腮红 ─────────────────────────────────── */
    var eyeShift = facing === 'up' ? -0.075 : (facing === 'down' ? 0.05 : 0);
    var eyeK = facing === 'up' ? 0.86 : (facing === 'down' ? 0.96 : 1);
    var eyeY = -0.07 + eyeShift;
    var closed = blind || (t % 3.7) > 3.58;
    var squint = bowl && !closed;
    var eyesX = (hurt > 0.35 || dead);
    if (eyesX) {
      fishEyeX(ctx, px, 0.24, eyeY + 0.01, 0.085 * eyeK);
      fishEyeX(ctx, px, 0.02, eyeY - 0.01, 0.075 * eyeK);
    } else {
      fishEye(ctx, px, 0.24, eyeY + 0.01, 0.10 * eyeK, closed, squint);
      fishEye(ctx, px, 0.02, eyeY - 0.01, 0.086 * eyeK, closed, squint);
    }
    /* 嘴 */
    if (dead || hurt > 0.6) {
      ctx.fillStyle = '#3d1420';
      epath(ctx, 0.355, 0.075, 0.045, 0.055);
      ctx.fill();
    } else if (squint) {
      ctx.strokeStyle = 'rgba(14,28,48,0.85)';
      lw(ctx, px, 0.020, 0.9);
      ctx.beginPath();
      ctx.moveTo(0.30, 0.075); ctx.lineTo(0.40, 0.075);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(14,28,48,0.9)';
      lw(ctx, px, 0.020, 0.9);
      ctx.beginPath();
      ctx.moveTo(0.42, 0.02);
      ctx.quadraticCurveTo(0.37, 0.10, 0.29, 0.075);
      ctx.stroke();
    }
    if (px >= DETAIL_S && !eyesX) {
      ctx.globalAlpha = A * 0.30;
      ctx.fillStyle = '#ff9d8a';
      epath(ctx, 0.315, 0.145, 0.055, 0.033);
      ctx.fill();
      ctx.globalAlpha = A;
    }

    /* ── 受击：红色描边闪 ─────────────────────────────────── */
    if (hurt > 0) {
      fishBodyPath(ctx);
      ctx.strokeStyle = C.danger;
      lw(ctx, px, 0.035, 1.4);
      ctx.globalAlpha = A * (0.35 + 0.65 * hurt);
      if (px >= SHADOW_S) {
        ctx.shadowColor = 'rgba(255,93,108,0.85)';
        ctx.shadowBlur = clamp(px * 0.45 * hurt, 0, 26);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = A;
    }
    /* ── 死亡：整体偏灰 ───────────────────────────────────── */
    if (dead) {
      fishBodyPath(ctx);
      ctx.globalAlpha = A * 0.38;
      ctx.fillStyle = '#7f93b5';
      ctx.fill();
      ctx.globalAlpha = A;
    }

    /* ── 铁盆 ─────────────────────────────────────────────── */
    if (bowl) drawBasin(ctx, o, t, px);
  }

  /* ════════════════════════════════════════════════════════════
     4b. 蓝色大肥鱼 · Q 版蓝发少女（照立绘重制）
     ────────────────────────────────────────────────────────────
     造型：深蓝长卷发 + 头顶呆毛 + 白色蕾丝发带 + 发侧蓝蝴蝶结
           两侧鱼鳍耳 + 身后鲸鱼尾 + 深蓝女仆裙（白围裙绣蓝鲸）
           胸口蓝宝石领结 + 白袜深蓝小皮鞋
     铁盆形态：一整个不锈钢盆倒扣在头上，盆沿压到眉毛上方
     ════════════════════════════════════════════════════════════ */
  var G_HAIR_TOP = '#6577d4', G_HAIR_MID = '#3b479f', G_HAIR_DARK = '#1e2559';
  var G_HAIR_LIT = '#8fa2ea';
  var G_SKIN = '#ffe4d7', G_SKIN_SH = '#eec2b1';
  var G_DRESS = '#232a5e', G_DRESS_L = '#39428f';
  var G_WHITE = '#f7f8ff', G_WHITE_SH = '#cfd5ee';
  var G_EYE_TOP = '#16204e', G_EYE_MID = '#2f4cc0', G_EYE_LOW = '#7fb0ff';
  var G_GEM = '#86b6ff';
  var G_LINE = '#131a42';

  function gHairGrad(ctx) {
    var g = ctx.createLinearGradient(0, -0.50, 0.06, 0.48);
    g.addColorStop(0, G_HAIR_TOP);
    g.addColorStop(0.38, G_HAIR_MID);
    g.addColorStop(1, G_HAIR_DARK);
    return g;
  }
  function gDressGrad(ctx) {
    var g = ctx.createLinearGradient(0, -0.02, 0, 0.34);
    g.addColorStop(0, G_DRESS_L);
    g.addColorStop(1, G_DRESS);
    return g;
  }

  /* 身后的大团长发（带波浪下摆） */
  function gBackHairPath(ctx, sway) {
    ctx.beginPath();
    ctx.moveTo(0, -0.45);
    ctx.bezierCurveTo(-0.26, -0.46, -0.38, -0.28, -0.37, -0.04);
    ctx.bezierCurveTo(-0.36, 0.16, -0.35, 0.30, -0.30, 0.42 + sway * 0.03);
    ctx.quadraticCurveTo(-0.21, 0.34 + sway * 0.02, -0.13, 0.45 + sway * 0.03);
    ctx.quadraticCurveTo(-0.03, 0.35, 0.07, 0.45 + sway * 0.03);
    ctx.quadraticCurveTo(0.17, 0.34 + sway * 0.02, 0.27, 0.42 + sway * 0.03);
    ctx.bezierCurveTo(0.34, 0.28, 0.37, 0.12, 0.37, -0.06);
    ctx.bezierCurveTo(0.39, -0.28, 0.27, -0.46, 0, -0.45);
    ctx.closePath();
  }

  /* 脸（略扁的圆脸 + 小下巴） */
  function gFacePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.205, -0.22);
    ctx.bezierCurveTo(-0.225, -0.06, -0.17, 0.045, 0, 0.065);
    ctx.bezierCurveTo(0.17, 0.045, 0.225, -0.06, 0.205, -0.22);
    ctx.bezierCurveTo(0.19, -0.37, -0.19, -0.37, -0.205, -0.22);
    ctx.closePath();
  }

  /* 刘海（斜分 + 三个尖） */
  function gBangsPath(ctx, sway) {
    ctx.beginPath();
    ctx.moveTo(-0.225, -0.16 + sway * 0.01);
    ctx.bezierCurveTo(-0.285, -0.34, -0.16, -0.47, 0.005, -0.465);
    ctx.bezierCurveTo(0.16, -0.47, 0.285, -0.34, 0.225, -0.15 + sway * 0.01);
    ctx.quadraticCurveTo(0.175, -0.27, 0.115, -0.135);
    ctx.quadraticCurveTo(0.055, -0.28, -0.005, -0.145);
    ctx.quadraticCurveTo(-0.075, -0.285, -0.135, -0.155);
    ctx.quadraticCurveTo(-0.185, -0.28, -0.225, -0.16 + sway * 0.01);
    ctx.closePath();
  }

  /* 垂到胸前的侧发 */
  function gLockPath(ctx, dir, sway) {
    ctx.beginPath();
    ctx.moveTo(dir * 0.195, -0.24);
    ctx.bezierCurveTo(dir * 0.30, -0.08, dir * 0.315, 0.12, dir * (0.255 + sway * 0.02), 0.36 + sway * 0.02);
    ctx.quadraticCurveTo(dir * (0.16 + sway * 0.02), 0.26, dir * 0.135, 0.08);
    ctx.bezierCurveTo(dir * 0.115, -0.08, dir * 0.145, -0.19, dir * 0.195, -0.24);
    ctx.closePath();
  }

  /* 鱼鳍耳 */
  function gFinEar(ctx, px, dir, flap) {
    ctx.save();
    ctx.translate(dir * 0.185, -0.13);
    ctx.rotate(dir * (0.24 + flap));
    ctx.beginPath();
    ctx.moveTo(0, -0.035);
    ctx.quadraticCurveTo(dir * 0.155, -0.145, dir * 0.215, -0.005);
    ctx.quadraticCurveTo(dir * 0.15, 0.10, dir * 0.015, 0.065);
    ctx.closePath();
    ctx.fillStyle = finGrad(ctx);
    ctx.fill();
    if (px >= DETAIL_S) {
      ctx.strokeStyle = 'rgba(150,200,255,0.75)';
      lw(ctx, px, 0.010, 0.5);
      for (var i = 0; i < 3; i++) {
        var a = -0.30 + i * 0.30;
        ctx.beginPath();
        ctx.moveTo(dir * 0.03, 0.01);
        ctx.lineTo(dir * (0.14 + i * 0.02), Math.sin(a) * 0.075);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 身后的鲸鱼尾（两瓣，会摆） */
  function gWhaleTail(ctx, px, t, moving) {
    var sw = Math.sin(t * (moving ? 9 : 2.2)) * 0.22;
    ctx.save();
    ctx.translate(0.30, 0.20);
    ctx.rotate(-0.30 + sw);
    ctx.beginPath();
    ctx.moveTo(-0.03, 0.03);
    ctx.quadraticCurveTo(0.05, -0.02, 0.11, -0.05);
    ctx.lineTo(0.075, 0.02);
    ctx.quadraticCurveTo(0.05, 0.04, -0.03, 0.03);
    ctx.closePath();
    ctx.fillStyle = '#2b3a86';
    ctx.fill();
    /* 两瓣尾鳍 */
    ctx.beginPath();
    ctx.moveTo(0.09, -0.04);
    ctx.quadraticCurveTo(0.20, -0.16, 0.235, -0.055);
    ctx.quadraticCurveTo(0.16, 0.01, 0.09, -0.02);
    ctx.closePath();
    ctx.fillStyle = '#3d55b8';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.09, -0.02);
    ctx.quadraticCurveTo(0.19, 0.03, 0.20, 0.115);
    ctx.quadraticCurveTo(0.12, 0.06, 0.085, 0.005);
    ctx.closePath();
    ctx.fillStyle = '#31459c';
    ctx.fill();
    ctx.restore();
  }

  /* Q 版大眼睛 */
  function gEye(ctx, px, cx, cy, rx, ry, look, closed, xeye) {
    if (xeye) {
      ctx.strokeStyle = G_LINE;
      ctx.lineCap = 'round';
      lw(ctx, px, 0.026, 1);
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.8, cy - ry * 0.8); ctx.lineTo(cx + rx * 0.8, cy + ry * 0.8);
      ctx.moveTo(cx + rx * 0.8, cy - ry * 0.8); ctx.lineTo(cx - rx * 0.8, cy + ry * 0.8);
      ctx.stroke();
      return;
    }
    if (closed) {
      ctx.strokeStyle = G_LINE;
      ctx.lineCap = 'round';
      lw(ctx, px, 0.020, 1);
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy - ry * 0.15);
      ctx.quadraticCurveTo(cx, cy + ry * 1.0, cx + rx, cy - ry * 0.15);
      ctx.stroke();
      return;
    }
    /* 眼白 */
    ctx.fillStyle = '#ffffff';
    epath(ctx, cx, cy, rx, ry);
    ctx.fill();
    /* 虹膜 */
    ctx.save();
    epath(ctx, cx, cy, rx, ry);
    ctx.clip();
    var g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    g.addColorStop(0, G_EYE_TOP);
    g.addColorStop(0.42, G_EYE_MID);
    g.addColorStop(0.80, G_EYE_LOW);
    g.addColorStop(1, '#d8e8ff');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    /* 瞳孔 */
    ctx.fillStyle = 'rgba(10,14,40,0.88)';
    epath(ctx, cx + look * rx * 0.22, cy + ry * 0.16, rx * 0.44, ry * 0.48);
    ctx.fill();
    /* 下部反光带 */
    ctx.fillStyle = 'rgba(200,230,255,0.72)';
    epath(ctx, cx + look * rx * 0.22, cy + ry * 0.50, rx * 0.56, ry * 0.24);
    ctx.fill();
    /* 高光两点 */
    ctx.fillStyle = '#ffffff';
    epath(ctx, cx - rx * 0.36, cy - ry * 0.44, rx * 0.34, ry * 0.28);
    ctx.fill();
    epath(ctx, cx + rx * 0.42, cy + ry * 0.26, rx * 0.18, ry * 0.15);
    ctx.fill();
    ctx.restore();
    /* 上睫毛 */
    ctx.strokeStyle = G_LINE;
    ctx.lineCap = 'round';
    lw(ctx, px, 0.020, 1);
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.06, cy - ry * 0.34);
    ctx.quadraticCurveTo(cx, cy - ry * 1.42, cx + rx * 1.06, cy - ry * 0.30);
    ctx.stroke();
  }

  /* 围裙上的小蓝鲸（px 够大才画） */
  function gWhaleMark(ctx, px, cx, cy, k) {
    if (px < 30) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.fillStyle = '#4a6fd0';
    epath(ctx, 0, 0, 0.055, 0.036);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.048, -0.004);
    ctx.quadraticCurveTo(0.082, -0.036, 0.086, 0.004);
    ctx.quadraticCurveTo(0.062, 0.014, 0.048, 0.010);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    epath(ctx, -0.018, -0.006, 0.008, 0.008);
    ctx.fill();
    ctx.strokeStyle = '#4a6fd0';
    lw(ctx, px, 0.007, 0.5);
    ctx.beginPath();
    ctx.moveTo(-0.012, -0.038);
    ctx.quadraticCurveTo(-0.02, -0.062, -0.004, -0.058);
    ctx.stroke();
    ctx.restore();
  }

  /** 倒扣在头上的不锈钢盆 */
  function drawGirlBasin(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    ctx.save();
    ctx.translate(0, -0.215);
    ctx.rotate(Math.sin(t * 4.1) * 0.045 + 0.05);
    /* 盆体（上半圆 = 倒扣的盆） */
    ctx.beginPath();
    ctx.arc(0, 0.10, 0.295, PI, TAU);
    ctx.closePath();
    ctx.fillStyle = steelGrad(ctx);
    ctx.fill();
    /* 盆底斜高光 */
    ctx.save();
    ctx.globalAlpha = A * 0.55;
    ctx.fillStyle = '#ffffff';
    epathRot(ctx, -0.11, -0.10, 0.135, 0.042, -0.52);
    ctx.fill();
    ctx.globalAlpha = A * 0.26;
    epathRot(ctx, 0.07, -0.16, 0.095, 0.028, -0.52);
    ctx.fill();
    ctx.restore();
    /* 两道凹痕 */
    ctx.strokeStyle = A_DENT;
    lw(ctx, px, 0.022, 0.9);
    ctx.beginPath(); ctx.arc(0, 0.10, 0.225, PI * 1.12, PI * 1.88); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.10, 0.135, PI * 1.14, PI * 1.86); ctx.stroke();
    /* 盆沿 */
    ctx.fillStyle = '#c9d3e2';
    epath(ctx, 0, 0.10, 0.318, 0.070);
    ctx.fill();
    ctx.fillStyle = C.steelLight;
    epath(ctx, 0, 0.082, 0.298, 0.040);
    ctx.fill();
    ctx.globalAlpha = A * 0.72;
    ctx.fillStyle = '#ffffff';
    epath(ctx, -0.17, 0.078, 0.052, 0.019);
    ctx.fill();
    ctx.globalAlpha = A;
    ctx.restore();
    /* 盆沿压在脸上的阴影 */
    ctx.globalAlpha = A * 0.28;
    ctx.fillStyle = '#2a1a1c';
    epath(ctx, 0, -0.135, 0.24, 0.045);
    ctx.fill();
    ctx.globalAlpha = A;
  }

  /* ── 大肥鱼的动画状态（图片立绘与程序化画法共用同一套） ──────
     全部由 t 和下面这些进度值驱动，不占用额外状态：
       o.stepT  0..1  当前这一格的行走进度（每走一格 = 一个小跳）
       o.moving       是否正在走
       o.spawn  0..1  出生动画进度（1 = 已经站好）
       o.winT   0..1  通关动画进度
       o.deadT  0..1  失败翻倒进度
       o.hurt   0..1  受击强度
       o.bowl         头顶铁盆（会额外晃）
     返回 {dx, dy, sx, sy, rot, alpha}，单位都是"格"
     ─────────────────────────────────────────────────────── */
  function charAnim(o, t, anim) {
    var out = anim || { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1 };
    var moving = !!o.moving;
    var hurt = clamp01(num(o.hurt, 0));
    var value = num(o.value, 0);
    var stepT = clamp01(num(o.stepT, 0.5));
    var spawn = clamp01(num(o.spawn, 1));
    var winT = clamp01(num(o.winT, 0));
    var deadT = clamp01(num(o.deadT, 0));

    /* 待机：上下浮动 + 呼吸（胸口起伏） */
    var ib = Math.sin(t * 2.05);
    var dy = ib * 0.022;
    var sx = 1 + ib * 0.015;
    var sy = 1 - ib * 0.015;

    /* 走路：每格一个小跳，顶点拉长、落地压扁 */
    if (moving) {
      var swing = Math.sin(PI * stepT);              /* 0 → 1 → 0 */
      var landK = Math.max(0, 1 - stepT * 5);        /* 刚落地那一瞬 */
      dy += -swing * 0.085;
      sy += 0.055 * swing - 0.05 * landK;
      sx += -0.05 * swing + 0.05 * landK;
    }
    /* 裙摆/头发随走动左右摇 */
    var rot = moving ? Math.sin(stepT * TAU) * 0.055 : Math.sin(t * 1.4) * 0.014;

    /* 出生：从小弹到大 */
    if (spawn < 1) {
      var s = spawn < 1 ? 1 - Math.pow(1 - spawn, 3) : 1;
      var overshoot = Math.sin(spawn * PI) * 0.16;   /* 过冲一下更弹 */
      var k = 0.35 + 0.65 * s + overshoot;
      sx *= k; sy *= k;
      out.alpha = Math.min(1, spawn * 1.6);
    }

    /* 通关：跳起来转一圈 */
    if (winT > 0) {
      var w = Math.min(1, winT);
      dy += -Math.sin(PI * w) * 0.42;
      rot += w * TAU;
      var sq2 = Math.sin(PI * w);
      sy += 0.10 * sq2 - Math.max(0, (w - 0.85) * 2) * 0.18;
      sx += -0.10 * sq2 + Math.max(0, (w - 0.85) * 2) * 0.18;
    }

    /* 失败：向侧面翻倒 + 下沉 */
    if (deadT > 0) {
      var d = Math.min(1, deadT);
      var e = 1 - Math.pow(1 - d, 3);
      rot += -1.45 * e;
      out.dx += -0.16 * e;
      dy += 0.16 * e;
      sx *= 1 - 0.12 * e;
    }

    /* 头顶铁盆：头重脚轻，晃得比平时明显 */
    if (o.bowl) {
      rot += Math.sin(t * 4.1) * 0.030 + (moving ? Math.sin(stepT * PI) * 0.03 : 0);
      dy += Math.sin(t * 4.1) * 0.006;
    }

    /* 受击抖动 */
    if (hurt > 0) {
      out.dx = Math.sin(t * 52) * 0.045 * hurt;
      dy += Math.cos(t * 61) * 0.035 * hurt;
    }
    if (value > 999) { sx *= 1.06; sy *= 0.97; }     /* 数值太大 → 撑胖一点 */

    out.dy = dy; out.sx = sx; out.sy = sy; out.rot = rot;
    if (!(out.alpha >= 0)) out.alpha = 1;
    return out;
  }

  /** Q 版少女本体（已 translate 到格心 + scale 到单位空间） */
  function drawGirl(ctx, o, t, px, anim) {
    var A = ctx.globalAlpha;
    var moving = !!o.moving;
    var hurt = clamp01(num(o.hurt, 0));
    var bowl = !!o.bowl;
    var dead = !!o.dead;
    var facing = o.facing;
    if (facing !== 'up' && facing !== 'down' && facing !== 'left' && facing !== 'right') facing = 'down';
    var back = (facing === 'up');
    var value = num(o.value, 0);

    /* ── 动画：和图片立绘共用同一套 charAnim ─────────────── */
    var an = charAnim(o, t, anim);
    ctx.globalAlpha *= an.alpha;
    ctx.translate(an.dx, an.dy);
    /* 与图片立绘保持一致：往右走才镜像（尾巴拖在身后） */
    if (facing === 'right') ctx.scale(-1, 1);
    ctx.rotate(an.rot);
    ctx.translate(0, 0.47);              /* 以"脚"为支点做压扁拉伸 */
    ctx.scale(an.sx, an.sy);
    ctx.translate(0, -0.47);
    var bob = 0;                          /* 位移已经在 an 里了 */
    var sway = Math.sin(t * (moving ? 8.2 : 1.8)) * (moving ? 1.0 : 0.45);   /* 头发/裙摆摆幅 */

    /* ── 落地投影 ── */
    if (px >= 20) {
      ctx.globalAlpha = A * 0.24;
      ctx.fillStyle = '#04070f';
      epath(ctx, 0, 0.475 - bob, 0.28, 0.055);
      ctx.fill();
      ctx.globalAlpha = A;
    }

    /* ── 鲸鱼尾（身后） ── */
    gWhaleTail(ctx, px, t, moving);

    /* ── 背后的大团长发 ── */
    gBackHairPath(ctx, sway);
    ctx.fillStyle = gHairGrad(ctx);
    ctx.fill();
    if (px >= DETAIL_S) {
      ctx.save();
      gBackHairPath(ctx, sway);
      ctx.clip();
      ctx.globalAlpha = A * 0.30;
      ctx.fillStyle = G_HAIR_LIT;
      for (var hs = 0; hs < 3; hs++) {
        var hx = -0.30 + hs * 0.24 + sway * 0.02;
        epathRot(ctx, hx, 0.06, 0.035, 0.30, 0.10);
        ctx.fill();
      }
      ctx.globalAlpha = A;
      ctx.restore();
    }

    /* ── 鱼鳍耳（两侧） ── */
    var flap = Math.sin(t * (moving ? 9.0 : 2.4)) * 0.16;
    gFinEar(ctx, px, -1, -flap);
    gFinEar(ctx, px, 1, flap);

    /* ── 腿 / 白袜 / 小皮鞋 ── */
    ctx.fillStyle = G_WHITE;
    rrect(ctx, -0.105, 0.36, 0.075, 0.09, 0.022); ctx.fill();
    rrect(ctx, 0.030, 0.36, 0.075, 0.09, 0.022); ctx.fill();
    ctx.fillStyle = '#20264f';
    rrect(ctx, -0.115, 0.425, 0.095, 0.048, 0.020); ctx.fill();
    rrect(ctx, 0.020, 0.425, 0.095, 0.048, 0.020); ctx.fill();

    /* ── 裙子 ── */
    ctx.beginPath();
    ctx.moveTo(-0.125, -0.005);
    ctx.lineTo(0.125, -0.005);
    ctx.bezierCurveTo(0.155, 0.09, 0.20, 0.19, 0.255, 0.285);
    ctx.quadraticCurveTo(0, 0.365, -0.255, 0.285);
    ctx.bezierCurveTo(-0.20, 0.19, -0.155, 0.09, -0.125, -0.005);
    ctx.closePath();
    ctx.fillStyle = gDressGrad(ctx);
    ctx.fill();
    /* 裙摆白荷叶边 */
    ctx.fillStyle = G_WHITE;
    ctx.beginPath();
    ctx.moveTo(-0.255, 0.285);
    ctx.quadraticCurveTo(0, 0.365, 0.255, 0.285);
    ctx.quadraticCurveTo(0.25, 0.345, 0.215, 0.345);
    ctx.quadraticCurveTo(0, 0.40, -0.215, 0.345);
    ctx.quadraticCurveTo(-0.25, 0.345, -0.255, 0.285);
    ctx.closePath();
    ctx.fill();
    if (px >= DETAIL_S) {
      ctx.strokeStyle = G_WHITE_SH;
      lw(ctx, px, 0.008, 0.5);
      for (var f = -2; f <= 2; f++) {
        ctx.beginPath();
        ctx.moveTo(f * 0.085, 0.30);
        ctx.quadraticCurveTo(f * 0.085, 0.345, f * 0.085 + 0.03, 0.355);
        ctx.stroke();
      }
    }
    /* 泡泡袖 */
    ctx.fillStyle = G_DRESS_L;
    epath(ctx, -0.145, 0.045, 0.055, 0.052); ctx.fill();
    epath(ctx, 0.145, 0.045, 0.055, 0.052); ctx.fill();
    /* 手 */
    ctx.fillStyle = G_SKIN;
    epath(ctx, -0.165, 0.105, 0.035, 0.040); ctx.fill();
    epath(ctx, 0.165, 0.105, 0.035, 0.040); ctx.fill();

    /* ── 白围裙 ── */
    if (!back) {
      ctx.beginPath();
      ctx.moveTo(-0.072, 0.005);
      ctx.lineTo(0.072, 0.005);
      ctx.bezierCurveTo(0.10, 0.09, 0.13, 0.16, 0.165, 0.245);
      ctx.quadraticCurveTo(0, 0.31, -0.165, 0.245);
      ctx.bezierCurveTo(-0.13, 0.16, -0.10, 0.09, -0.072, 0.005);
      ctx.closePath();
      ctx.fillStyle = G_WHITE;
      ctx.fill();
      if (px >= DETAIL_S) {
        ctx.strokeStyle = G_WHITE_SH;
        lw(ctx, px, 0.008, 0.5);
        ctx.stroke();
      }
      gWhaleMark(ctx, px, 0, 0.155, 1);
    }

    /* ── 胸口领结 + 蓝宝石 ── */
    if (!back) {
      ctx.fillStyle = G_DRESS_L;
      ctx.beginPath();
      ctx.moveTo(-0.005, 0.005);
      ctx.lineTo(-0.062, -0.026);
      ctx.lineTo(-0.055, 0.036);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0.005, 0.005);
      ctx.lineTo(0.062, -0.026);
      ctx.lineTo(0.055, 0.036);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = G_GEM;
      epath(ctx, 0, 0.006, 0.024, 0.024);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      epath(ctx, -0.008, -0.004, 0.008, 0.008);
      ctx.fill();
    }

    /* ── 头 ── */
    gFacePath(ctx);
    ctx.fillStyle = G_SKIN;
    ctx.fill();
    if (!back && px >= DETAIL_S) {
      ctx.save();
      gFacePath(ctx);
      ctx.clip();
      ctx.globalAlpha = A * 0.35;
      ctx.fillStyle = G_SKIN_SH;
      epath(ctx, 0.10, 0.0, 0.10, 0.10);
      ctx.fill();
      ctx.globalAlpha = A;
      ctx.restore();
    }

    if (!back) {
      /* ── 五官 ── */
      /* 眼球朝向：镜像是"往右走才翻"，所以左右两个方向都要往本地 -x 偏，
         翻过来之后才正好看向行进方向 */
      var look = (facing === 'left' || facing === 'right') ? -0.62 : 0;
      var closed = !!o.blink || (t % 3.9) > 3.78;
      var xeye = (hurt > 0.35 || dead);
      var ey = -0.155;
      var squint = bowl && !closed && !xeye;
      gEye(ctx, px, -0.088, ey, 0.052, squint ? 0.042 : 0.070, look, closed, xeye);
      gEye(ctx, px, 0.088, ey, 0.052, squint ? 0.042 : 0.070, look, closed, xeye);
      /* 嘴 */
      if (dead || hurt > 0.6) {
        ctx.fillStyle = '#4a1522';
        epath(ctx, 0, -0.045, 0.026, 0.020);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(120,60,60,0.85)';
        ctx.lineCap = 'round';
        lw(ctx, px, 0.012, 0.7);
        ctx.beginPath();
        ctx.moveTo(-0.022, -0.052);
        ctx.quadraticCurveTo(0, -0.028, 0.022, -0.052);
        ctx.stroke();
      }
      /* 腮红 */
      if (px >= DETAIL_S && !xeye) {
        ctx.globalAlpha = A * 0.42;
        ctx.fillStyle = '#ff9d9d';
        epath(ctx, -0.155, -0.085, 0.040, 0.024);
        ctx.fill();
        epath(ctx, 0.155, -0.085, 0.040, 0.024);
        ctx.fill();
        ctx.globalAlpha = A;
      }
    }

    /* ── 刘海 ── */
    gBangsPath(ctx, sway);
    ctx.fillStyle = gHairGrad(ctx);
    ctx.fill();
    if (px >= DETAIL_S) {
      ctx.save();
      gBangsPath(ctx, sway);
      ctx.clip();
      ctx.globalAlpha = A * 0.35;
      ctx.fillStyle = G_HAIR_LIT;
      epathRot(ctx, -0.02, -0.34, 0.15, 0.038, -0.12);
      ctx.fill();
      ctx.globalAlpha = A;
      ctx.restore();
    }
    /* ── 侧发 ── */
    gLockPath(ctx, -1, sway);
    ctx.fillStyle = gHairGrad(ctx);
    ctx.fill();
    gLockPath(ctx, 1, sway);
    ctx.fill();

    if (!back) {
      /* ── 蕾丝发带（白色扇贝边） ── */
      ctx.save();
      ctx.strokeStyle = G_WHITE;
      ctx.lineCap = 'round';
      lw(ctx, px, 0.052, 1.2);
      ctx.beginPath();
      ctx.arc(0, -0.185, 0.222, PI * 1.16, PI * 1.84);
      ctx.stroke();
      if (px >= DETAIL_S) {
        ctx.fillStyle = '#ffffff';
        for (var s = 0; s <= 7; s++) {
          var ang = PI * 1.16 + (PI * 0.68) * (s / 7);
          epath(ctx, Math.cos(ang) * 0.222, -0.185 + Math.sin(ang) * 0.222, 0.030, 0.030);
          ctx.fill();
        }
        ctx.strokeStyle = G_WHITE_SH;
        lw(ctx, px, 0.008, 0.4);
        ctx.beginPath();
        ctx.arc(0, -0.185, 0.196, PI * 1.16, PI * 1.84);
        ctx.stroke();
      }
      ctx.restore();
      /* ── 发侧蓝蝴蝶结 ── */
      ctx.save();
      ctx.translate(0.20, -0.27);
      ctx.rotate(-0.25);
      ctx.fillStyle = '#4f7fe0';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-0.075, -0.048); ctx.lineTo(-0.075, 0.048); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0.075, -0.048); ctx.lineTo(0.075, 0.048); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f4fae';
      epath(ctx, 0, 0, 0.018, 0.022);
      ctx.fill();
      ctx.restore();
    }

    /* ── 呆毛 ── */
    ctx.strokeStyle = G_HAIR_MID;
    ctx.lineCap = 'round';
    lw(ctx, px, 0.028, 1);
    var ah = Math.sin(t * 2.6) * 0.02;
    ctx.beginPath();
    ctx.moveTo(0.01, -0.43);
    ctx.quadraticCurveTo(-0.10 + ah, -0.53, 0.03 + ah, -0.575);
    ctx.stroke();

    /* ── 铁盆 ── */
    if (bowl) drawGirlBasin(ctx, o, t, px);

    /* ── 受击红描边 / 死亡灰化 ── */
    if (hurt > 0) {
      ctx.save();
      ctx.strokeStyle = C.danger;
      lw(ctx, px, 0.030, 1.3);
      ctx.globalAlpha = A * (0.35 + 0.65 * hurt);
      if (px >= SHADOW_S) {
        ctx.shadowColor = 'rgba(255,93,108,0.85)';
        ctx.shadowBlur = clamp(px * 0.40 * hurt, 0, 24);
      }
      ctx.beginPath();
      ctx.arc(0, -0.17, 0.225, PI * 1.02, PI * 1.98);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.24, 0.02);
      ctx.quadraticCurveTo(0, 0.40, 0.24, 0.02);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = A;
      ctx.restore();
    }
    if (dead) {
      ctx.globalAlpha = A * 0.40;
      ctx.fillStyle = '#7f93b5';
      ctx.beginPath();
      ctx.arc(0, -0.17, 0.23, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.24, 0.0);
      ctx.quadraticCurveTo(0, 0.40, 0.24, 0.0);
      ctx.lineTo(0.24, -0.10);
      ctx.lineTo(-0.24, -0.10);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = A;
    }
  }

  function drawAssetImage(ctx, entry, px, hurt) {
    var img = entry.img;
    var iw = img.naturalWidth || img.width || 0;
    var ih = img.naturalHeight || img.height || 0;
    if (!(iw > 0) || !(ih > 0)) return;
    var b = entry.box || { sx: 0, sy: 0, sw: iw, sh: ih };
    /* 高度按 1.06 格缩放到格子上，底边压住格子下沿（脚踩在地上），水平居中 */
    var k = (px * 1.06) / b.sh;
    var w = b.sw * k, h = b.sh * k;
    if (w > px * 1.55) { k *= (px * 1.55) / w; w = b.sw * k; h = b.sh * k; }
    var dx = -w / 2, dy = px * 0.47 - h;
    ctx.save();
    /* 注意：这里已经是"以格心为原点、单位 = 1 CSS 像素"的坐标系（调用方 scale(px,px)
       只用在程序化画法那条分支上），所以 dx/dy/w/h 直接就是像素值，不能再除以 px，
       否则整张立绘会被画成 1 像素高、看着像没显示。 */
    ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, dx, dy, w, h);
    if (hurt > 0.02 && entry.tint) {
      ctx.globalAlpha *= clamp01(hurt) * 0.95;
      ctx.drawImage(entry.tint, b.sx, b.sy, b.sw, b.sh, dx, dy, w, h);
    }
    ctx.restore();
  }

  function fish(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      var plain = assetEntry('fish');
      var bowlArt = o.bowl ? assetEntry('fish_bowl') : null;
      var entry = bowlArt || plain;
      if (entry) {
        /* 图片立绘：所有动画都靠变换做（浮动 / 小跳 / 压扁拉伸 / 摇摆 / 翻倒 / 出生弹入）
           注意坐标系：这里单位是 CSS 像素，而 charAnim 的位移是以"格"为单位的，所以要乘 px
           镜像方向：立绘的鲸鱼尾/蝴蝶结画在画面右侧（即"背后"朝右），
           所以往右走才镜像，让尾巴始终拖在身后 */
        var an = charAnim(o, t);
        ctx.globalAlpha *= an.alpha;
        ctx.translate(an.dx * px, an.dy * px);
        if (o.facing === 'right') ctx.scale(-1, 1);
        ctx.rotate(an.rot);
        ctx.translate(0, px * 0.47);          /* 以"脚"为支点 */
        ctx.scale(an.sx, an.sy);
        ctx.translate(0, -px * 0.47);
        drawAssetImage(ctx, entry, px, num(o.hurt, 0));
        if (o.bowl && !bowlArt) {
          /* 只给了常态立绘、没给戴盆立绘时，把程序化的不锈钢盆扣上去 */
          ctx.scale(px, px);
          drawGirlBasin(ctx, o, t, px);
        }
        return;
      }
      ctx.scale(px, px);
      drawGirl(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     5. 大白饭 / 铁盆大白饭
     ════════════════════════════════════════════════════════════ */
  function drawMound(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var value = num(o.value, 1);

    /* 饭团本体：顶部尖尖的米白山形 */
    ctx.beginPath();
    ctx.moveTo(-0.35, 0.20);
    ctx.bezierCurveTo(-0.31, -0.10, -0.21, -0.34, 0.00, -0.44);
    ctx.bezierCurveTo(0.21, -0.34, 0.31, -0.10, 0.35, 0.20);
    ctx.closePath();
    ctx.fillStyle = riceGrad(ctx);
    ctx.fill();

    /* 受光面 + 暗面（用裁剪内的两块色，替代每帧新建渐变） */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-0.35, 0.20);
    ctx.bezierCurveTo(-0.31, -0.10, -0.21, -0.34, 0.00, -0.44);
    ctx.bezierCurveTo(0.21, -0.34, 0.31, -0.10, 0.35, 0.20);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = A * 0.85;
    ctx.fillStyle = C.riceDark;
    epathRot(ctx, 0.30, 0.10, 0.24, 0.30, 0.35);
    ctx.fill();
    ctx.globalAlpha = A * 0.75;
    ctx.fillStyle = '#fffdf6';
    epathRot(ctx, -0.16, -0.20, 0.16, 0.22, -0.25);
    ctx.fill();
    ctx.globalAlpha = A;

    /* 米粒细节 */
    if (px >= DETAIL_S) {
      var grains = 3 + (value >= 5 ? 1 : 0) + (value >= 20 ? 1 : 0);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var i = 0; i < grains; i++) {
        var gx = -0.16 + i * 0.085, gy = -0.22 + Math.sin(i * 2.1) * 0.10;
        epathRot(ctx, gx, gy, 0.030, 0.016, -0.5);
        ctx.fill();
      }
      ctx.globalAlpha = A * 0.5;
      ctx.fillStyle = C.riceDark;
      epathRot(ctx, 0.14, 0.02, 0.032, 0.017, -0.4);
      ctx.fill();
      ctx.globalAlpha = A;
    }
    ctx.restore();
  }

  function drawBowl(ctx, metal, t, px) {
    var A = ctx.globalAlpha;
    /* 碗体（浅灰 / 金属） */
    ctx.beginPath();
    ctx.moveTo(-0.45, 0.10);
    ctx.lineTo(0.45, 0.10);
    ctx.quadraticCurveTo(0.38, 0.47, 0.00, 0.47);
    ctx.quadraticCurveTo(-0.38, 0.47, -0.45, 0.10);
    ctx.closePath();
    ctx.fillStyle = bowlGrad(ctx, metal);
    ctx.fill();

    if (metal) {
      /* 金属：竖向高光条 + 底部反光 + 两道凹痕 */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-0.45, 0.10);
      ctx.lineTo(0.45, 0.10);
      ctx.quadraticCurveTo(0.38, 0.47, 0.00, 0.47);
      ctx.quadraticCurveTo(-0.38, 0.47, -0.45, 0.10);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = A * 0.55;
      ctx.fillStyle = '#ffffff';
      rrect(ctx, -0.20, 0.12, 0.075, 0.34, 0.035);
      ctx.fill();
      ctx.globalAlpha = A * 0.30;
      rrect(ctx, 0.07, 0.14, 0.045, 0.26, 0.022);
      ctx.fill();
      ctx.globalAlpha = A * 0.35;
      ctx.fillStyle = '#e9eef7';
      epath(ctx, 0.0, 0.44, 0.26, 0.045);
      ctx.fill();
      ctx.globalAlpha = A;
      ctx.restore();
      ctx.strokeStyle = A_DENT;
      lw(ctx, px, 0.016, 0.7);
      ctx.beginPath(); ctx.moveTo(-0.34, 0.26); ctx.quadraticCurveTo(0, 0.34, 0.34, 0.26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.22, 0.38); ctx.quadraticCurveTo(0, 0.44, 0.22, 0.38); ctx.stroke();
    } else {
      /* 陶碗：一条淡淡的暗边 */
      ctx.strokeStyle = 'rgba(120,126,146,0.45)';
      lw(ctx, px, 0.014, 0.6);
      ctx.beginPath(); ctx.moveTo(-0.30, 0.32); ctx.quadraticCurveTo(0, 0.38, 0.30, 0.32); ctx.stroke();
    }

    /* 碗沿：一圈亮边 */
    ctx.fillStyle = metal ? '#dfe6f1' : '#f4f6fa';
    epath(ctx, 0, 0.085, 0.465, 0.055);
    ctx.fill();
    if (metal) {
      ctx.strokeStyle = '#ffffff';
      lw(ctx, px, 0.016, 0.7);
      ctx.globalAlpha = A * 0.85;
      ctx.beginPath();
      if (HAS_ELLIPSE) {
        ctx.ellipse(0, 0.078, 0.452, 0.042, 0, PI, TAU);
      } else {
        ctx.arc(0, 0.078, 0.30, PI, TAU);
      }
      ctx.stroke();
      ctx.globalAlpha = A;
    }
  }

  function drawSteam(ctx, t, px) {
    if (px < 18) return;
    var A = ctx.globalAlpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    lw(ctx, px, 0.028, 0.9);
    for (var i = 0; i < 3; i++) {
      var ph = ((t * 0.55) + i * 0.33) % 1;
      var y0 = -0.42 - ph * 0.62;
      var x0 = STEAM_X[i] + Math.sin(ph * 6.4 + i * 1.7) * 0.055;
      ctx.globalAlpha = A * Math.sin(ph * PI) * 0.40;
      ctx.beginPath();
      ctx.moveTo(x0 - 0.015, y0 + 0.16);
      ctx.quadraticCurveTo(x0 + 0.065, y0 + 0.08, x0 - 0.010, y0);
      ctx.quadraticCurveTo(x0 - 0.065, y0 - 0.08, x0 + 0.020, y0 - 0.17);
      ctx.stroke();
    }
    ctx.globalAlpha = A;
  }

  function drawRiceGlow(ctx, o, t) {
    var glow = clamp01(num(o.glow, 0));
    if (glow <= 0) return;
    var A = ctx.globalAlpha;
    ctx.fillStyle = C.gold;
    ctx.globalAlpha = A * 0.18 * glow;
    epath(ctx, 0, -0.06, 0.60 + 0.04 * Math.sin(t * 4), 0.60);
    ctx.fill();
    ctx.globalAlpha = A * 0.22 * glow;
    epath(ctx, 0, -0.06, 0.46, 0.46);
    ctx.fill();
    ctx.globalAlpha = A;
  }

  function rice(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(px, px);
      drawRiceGlow(ctx, o, t);
      drawMound(ctx, o, t, px);
      drawBowl(ctx, false, t, px);
      drawSteam(ctx, t, px);
    } finally {
      ctx.restore();
    }
  }

  function bowlRice(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(px, px);
      drawRiceGlow(ctx, o, t);
      drawMound(ctx, o, t, px);
      drawBowl(ctx, true, t, px);
      drawSteam(ctx, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     6. token（金色硬币）
     ════════════════════════════════════════════════════════════ */
  function drawToken(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var spin = Math.cos(t * 2.1);
    var rx = Math.abs(spin);
    var R = 0.40;
    var w = R * (0.10 + 0.90 * rx);

    /* 光晕 */
    if (px >= 16) {
      ctx.fillStyle = C.gold;
      ctx.globalAlpha = A * (0.12 + 0.05 * Math.sin(t * 3));
      epath(ctx, 0, 0, R * 1.55, R * 1.55);
      ctx.fill();
      ctx.globalAlpha = A * 0.14;
      epath(ctx, 0, 0, R * 1.20, R * 1.20);
      ctx.fill();
      ctx.globalAlpha = A;
    }

    /* 侧面厚度（转到侧面时露出的金边） */
    if (rx > 0.30) {
      ctx.fillStyle = C.goldDeep;
      epath(ctx, 0.022 * spin, 0, w, R);
      ctx.fill();
    }

    /* 币面 */
    epath(ctx, 0, 0, w, R);
    ctx.fillStyle = coinGrad(ctx);
    ctx.fill();
    ctx.strokeStyle = C.goldDeep;
    lw(ctx, px, 0.022, 0.9);
    ctx.stroke();

    if (rx > 0.42) {
      /* 内圈 */
      ctx.strokeStyle = 'rgba(184,128,26,0.75)';
      lw(ctx, px, 0.016, 0.7);
      epath(ctx, 0, 0, w * 0.80, R * 0.80);
      ctx.stroke();

      /* 旋转高光：一条扫过的斜光带 */
      if (px >= 16) {
        ctx.save();
        epath(ctx, 0, 0, w * 0.97, R * 0.97);
        ctx.clip();
        var sweep = ((t * 0.42) % 1) * 2.4 - 1.2;
        ctx.globalAlpha = A * 0.42;
        ctx.fillStyle = '#ffffff';
        ctx.save();
        ctx.translate(sweep * 0.5, 0);
        ctx.rotate(-0.5);
        ctx.fillRect(-0.09, -0.6, 0.18, 1.2);
        ctx.restore();
        ctx.restore();
        ctx.globalAlpha = A;
      }

      /* x 与 = 两个符号（跟着硬币一起透视压缩） */
      if (px >= 14 && rx > 0.48) {
        ctx.save();
        epath(ctx, 0, 0, w * 0.96, R * 0.96);
        ctx.clip();
        ctx.scale(Math.max(0.35, rx), 1);
        ctx.fillStyle = C.goldDark;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var fs = Math.round(px * 0.42);
        textPx(ctx, px, 'x', fs, -R * 0.38, 0.01, 800, 1);
        textPx(ctx, px, '=', fs, R * 0.38, 0.01, 800, 1);
        ctx.restore();
      }
    }

    /* 随机星点闪光（确定性伪随机，s 不够大就不画粒子） */
    if (px >= 20) {
      ctx.strokeStyle = '#fff6d0';
      for (var i = 0; i < SPARK.length; i++) {
        var sp = SPARK[i];
        var ph = ((t * 0.42) + sp.ph) % 1;
        if (ph > 0.32) continue;
        var a2 = Math.sin(ph / 0.32 * PI);
        var sxp = sp.x * (0.55 + 0.85 * rx);
        star4(ctx, sxp, sp.y, sp.r * (0.55 + 0.55 * a2), A * a2 * 0.95);
      }
      ctx.globalAlpha = A;
    }
  }

  function token(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(px, px);
      drawToken(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     7. Claude 娘
     ════════════════════════════════════════════════════════════ */
  var fmtCache = {};
  function fmtFactor(f) {
    var v = num(f, 1);
    var hit = fmtCache[v];
    if (hit !== undefined) return hit;
    var out;
    if (G.expr && typeof G.expr.fmtNum === 'function') {
      try { out = String(G.expr.fmtNum(v)); } catch (e) { out = null; }
    }
    if (out === null || out === undefined) {
      out = (Math.abs(v - Math.round(v)) < 1e-9) ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
    }
    var n = 0;
    for (var k in fmtCache) { if (Object.prototype.hasOwnProperty.call(fmtCache, k)) n++; }
    if (n > 64) fmtCache = {};
    fmtCache[v] = out;
    return out;
  }

  /** 星芒发饰：8 根短射线（米白） */
  function drawStarPin(ctx, px, t, happy) {
    var A = ctx.globalAlpha;
    ctx.save();
    ctx.translate(0.09, -0.40);
    ctx.rotate(t * 0.28);
    ctx.strokeStyle = C.rice;
    ctx.lineCap = 'round';
    lw(ctx, px, 0.026, 0.8);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * TAU / 8;
      var r0 = 0.036, r1 = 0.036 + (i % 2 === 0 ? 0.062 : 0.040);
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.fillStyle = happy ? C.gold : C.rice;
    epath(ctx, 0, 0, 0.030, 0.030);
    ctx.fill();
    ctx.globalAlpha = A * 0.55;
    ctx.strokeStyle = '#ffffff';
    lw(ctx, px, 0.012, 0.5);
    epath(ctx, 0, 0, 0.014, 0.014);
    ctx.stroke();
    ctx.globalAlpha = A;
    ctx.restore();
  }

  function drawClaude(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var happy = !!o.happy;
    var factorTxt = '×' + fmtFactor(o.factor);
    var bob = Math.sin(t * 1.8) * 0.035;
    var sway = Math.sin(t * 1.3) * 0.022;

    ctx.translate(0, bob);
    ctx.rotate(sway);

    /* ── 腿 / 鞋 ─────────────────────────────────────────── */
    ctx.fillStyle = C.skin;
    rrect(ctx, -0.105, 0.20, 0.075, 0.20, 0.036); ctx.fill();
    rrect(ctx, 0.030, 0.20, 0.075, 0.20, 0.036); ctx.fill();
    ctx.fillStyle = '#4a3340';
    rrect(ctx, -0.125, 0.375, 0.115, 0.085, 0.038); ctx.fill();
    rrect(ctx, 0.015, 0.375, 0.115, 0.085, 0.038); ctx.fill();

    /* ── 后发（在身体后面） ───────────────────────────────── */
    ctx.fillStyle = hairGrad(ctx, true);
    ctx.beginPath();
    ctx.moveTo(-0.235, -0.24);
    ctx.quadraticCurveTo(-0.31, -0.02, -0.22, 0.12);
    ctx.quadraticCurveTo(-0.10, 0.18, 0.00, 0.12);
    ctx.quadraticCurveTo(0.10, 0.18, 0.22, 0.12);
    ctx.quadraticCurveTo(0.31, -0.02, 0.235, -0.24);
    ctx.quadraticCurveTo(0.0, -0.44, -0.235, -0.24);
    ctx.closePath();
    ctx.fill();

    /* ── 吊带裙（橙色） + 白衬衫 ─────────────────────────── */
    ctx.fillStyle = '#fbf8f0';
    rrect(ctx, -0.155, -0.11, 0.31, 0.20, 0.055); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.045, -0.10); ctx.lineTo(0.0, -0.01); ctx.lineTo(0.045, -0.10);
    ctx.lineTo(0.0, -0.06); ctx.closePath();
    ctx.fillStyle = '#e9e2d2';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-0.135, -0.02);
    ctx.lineTo(0.135, -0.02);
    ctx.quadraticCurveTo(0.20, 0.18, 0.245, 0.30);
    ctx.lineTo(-0.245, 0.30);
    ctx.quadraticCurveTo(-0.20, 0.18, -0.135, -0.02);
    ctx.closePath();
    ctx.fillStyle = dressGrad(ctx);
    ctx.fill();
    /* 裙摆暗边 + 褶 */
    ctx.fillStyle = 'rgba(140,70,48,0.55)';
    ctx.fillRect(-0.245, 0.268, 0.49, 0.034);
    if (px >= DETAIL_S) {
      ctx.strokeStyle = 'rgba(140,70,48,0.40)';
      lw(ctx, px, 0.010, 0.5);
      ctx.beginPath();
      ctx.moveTo(-0.09, 0.02); ctx.lineTo(-0.13, 0.28);
      ctx.moveTo(0.09, 0.02); ctx.lineTo(0.13, 0.28);
      ctx.stroke();
    }
    /* 吊带 */
    ctx.strokeStyle = C.orangeDeep;
    lw(ctx, px, 0.020, 0.7);
    ctx.beginPath();
    ctx.moveTo(-0.10, -0.10); ctx.lineTo(-0.075, 0.02);
    ctx.moveTo(0.10, -0.10); ctx.lineTo(0.075, 0.02);
    ctx.stroke();

    /* ── 手臂（把牌子抱在胸前） ───────────────────────────── */
    ctx.strokeStyle = C.skin;
    ctx.lineCap = 'round';
    lw(ctx, px, 0.062, 1.6);
    ctx.beginPath();
    ctx.moveTo(-0.145, -0.045); ctx.lineTo(-0.20, 0.14);
    ctx.moveTo(0.145, -0.045); ctx.lineTo(0.20, 0.14);
    ctx.stroke();
    /* 白衬衫袖口 */
    ctx.strokeStyle = '#fbf8f0';
    lw(ctx, px, 0.075, 1.8);
    ctx.beginPath();
    ctx.moveTo(-0.165, 0.015); ctx.lineTo(-0.185, 0.075);
    ctx.moveTo(0.165, 0.015); ctx.lineTo(0.185, 0.075);
    ctx.stroke();

    /* ── 牌子 ─────────────────────────────────────────────── */
    var sw = 0.50, sh = 0.235, sy = 0.115;
    ctx.save();
    ctx.translate(0, sy);
    ctx.rotate(Math.sin(t * 2.4) * 0.02);
    ctx.fillStyle = 'rgba(8,14,26,0.30)';
    rrect(ctx, -sw / 2 + 0.012, -sh / 2 + 0.020, sw, sh, 0.045); ctx.fill();
    ctx.fillStyle = C.rice;
    rrect(ctx, -sw / 2, -sh / 2, sw, sh, 0.045); ctx.fill();
    ctx.strokeStyle = C.orangeDeep;
    lw(ctx, px, 0.020, 0.8);
    rrect(ctx, -sw / 2, -sh / 2, sw, sh, 0.045); ctx.stroke();
    ctx.fillStyle = C.orangeDeep;
    ctx.fillRect(-sw / 2 + 0.025, -sh / 2 + 0.030, sw - 0.05, 0.018);
    if (px >= 14) {
      var fs = px * 0.20 * Math.min(1, 3.4 / (factorTxt.length + 0.8));
      ctx.fillStyle = C.orangeDark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textPx(ctx, px, factorTxt, fs, 0, 0.020, 800, 0);
    }
    ctx.restore();
    /* 手（抱牌） */
    ctx.fillStyle = C.skin;
    epath(ctx, -0.235, 0.135, 0.038, 0.038); ctx.fill();
    epath(ctx, 0.235, 0.135, 0.038, 0.038); ctx.fill();

    /* ── 头 ───────────────────────────────────────────────── */
    ctx.fillStyle = C.skin;
    epath(ctx, 0, -0.225, 0.185, 0.195); ctx.fill();
    ctx.fillStyle = 'rgba(224,183,156,0.55)';
    epath(ctx, 0.0, -0.13, 0.12, 0.06); ctx.fill();

    /* 侧发（会轻轻飘） */
    var swayH = Math.sin(t * 1.6) * 0.055;
    ctx.fillStyle = hairGrad(ctx, false);
    ctx.save();
    ctx.translate(-0.175, -0.24); ctx.rotate(swayH * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-0.075, 0.14, -0.055, 0.30);
    ctx.quadraticCurveTo(0.005, 0.22, 0.035, 0.03);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(0.175, -0.24); ctx.rotate(-swayH * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(0.075, 0.14, 0.055, 0.30);
    ctx.quadraticCurveTo(-0.005, 0.22, -0.035, 0.03);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    /* 刘海：三团蓬松的弧 + 呆毛 */
    ctx.fillStyle = hairGrad(ctx, false);
    epath(ctx, -0.095, -0.290, 0.115, 0.105); ctx.fill();
    epath(ctx, 0.095, -0.290, 0.115, 0.105); ctx.fill();
    epath(ctx, 0.0, -0.320, 0.135, 0.115); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.19, -0.30);
    ctx.quadraticCurveTo(-0.02, -0.46, 0.19, -0.30);
    ctx.quadraticCurveTo(0.02, -0.38, -0.19, -0.30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hairGrad(ctx, false);
    lw(ctx, px, 0.026, 0.8);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.03, -0.40);
    ctx.quadraticCurveTo(0.10 + swayH, -0.50, 0.055, -0.55);
    ctx.stroke();

    /* 星芒发饰 */
    drawStarPin(ctx, px, t, happy);
    /* 高兴时发饰周围冒两点八芒星 */
    if (happy && px >= 18) {
      ctx.strokeStyle = C.goldLight;
      for (var hi = 0; hi < 2; hi++) {
        var hph = ((t * 0.6) + hi * 0.5) % 1;
        star8(ctx, -0.10 + hi * 0.30, -0.42 - Math.sin(hph * PI) * 0.10, 0.05, A * Math.sin(hph * PI) * 0.9);
      }
      ctx.globalAlpha = A;
    }

    /* ── 脸 ───────────────────────────────────────────────── */
    var blink = (t % 3.3) > 3.18;
    if (happy && !blink) {
      ctx.strokeStyle = C.eye;
      lw(ctx, px, 0.020, 0.7);
      ctx.beginPath();
      ctx.moveTo(-0.105, -0.205); ctx.quadraticCurveTo(-0.075, -0.245, -0.045, -0.205);
      ctx.moveTo(0.045, -0.205); ctx.quadraticCurveTo(0.075, -0.245, 0.105, -0.205);
      ctx.stroke();
    } else if (blink) {
      ctx.strokeStyle = C.eye;
      lw(ctx, px, 0.018, 0.7);
      ctx.beginPath();
      ctx.moveTo(-0.105, -0.215); ctx.lineTo(-0.045, -0.215);
      ctx.moveTo(0.045, -0.215); ctx.lineTo(0.105, -0.215);
      ctx.stroke();
    } else {
      ctx.fillStyle = C.eye;
      epath(ctx, -0.075, -0.215, 0.028, 0.034); ctx.fill();
      epath(ctx, 0.075, -0.215, 0.028, 0.034); ctx.fill();
      ctx.fillStyle = '#ffffff';
      epath(ctx, -0.084, -0.228, 0.011, 0.010); ctx.fill();
      epath(ctx, 0.066, -0.228, 0.011, 0.010); ctx.fill();
    }
    if (px >= DETAIL_S) {
      ctx.globalAlpha = A * 0.35;
      ctx.fillStyle = '#f08a72';
      epath(ctx, -0.125, -0.165, 0.038, 0.024); ctx.fill();
      epath(ctx, 0.125, -0.165, 0.038, 0.024); ctx.fill();
      ctx.globalAlpha = A;
    }
    ctx.strokeStyle = 'rgba(90,42,30,0.9)';
    lw(ctx, px, 0.017, 0.7);
    ctx.beginPath();
    if (happy) {
      ctx.moveTo(-0.030, -0.150);
      ctx.quadraticCurveTo(0.0, -0.100, 0.030, -0.150);
    } else {
      ctx.moveTo(-0.026, -0.140);
      ctx.quadraticCurveTo(0.0, -0.165, 0.026, -0.140);
    }
    ctx.stroke();
  }

  function claude(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      var entry = assetEntry('claude');
      if (entry) { drawAssetImage(ctx, entry, px, num(o.hurt, 0)); return; }
      ctx.scale(px, px);
      drawClaude(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     8. 用户（深青绿小人剪影 + 判定气泡标记）
     ════════════════════════════════════════════════════════════ */
  function userBodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.150, -0.015);
    ctx.quadraticCurveTo(-0.215, 0.10, -0.195, 0.26);
    ctx.quadraticCurveTo(-0.170, 0.44, 0.0, 0.44);
    ctx.quadraticCurveTo(0.170, 0.44, 0.195, 0.26);
    ctx.quadraticCurveTo(0.215, 0.10, 0.150, -0.015);
    ctx.closePath();
  }

  function drawUser(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var happy = (o.happy === true) ? 1 : (o.happy === false ? -1 : 0);
    var blame = happy < 0;
    var bob = Math.sin(t * 2.2) * 0.028;
    ctx.translate(0, bob);

    /* 影子 */
    if (px >= 20) {
      ctx.globalAlpha = A * 0.20;
      ctx.fillStyle = '#04070f';
      epath(ctx, 0, 0.47, 0.22, 0.045);
      ctx.fill();
      ctx.globalAlpha = A;
    }

    /* 身体 */
    userBodyPath(ctx);
    ctx.fillStyle = bodyGradTeal(ctx, blame);
    ctx.fill();
    ctx.strokeStyle = blame ? C.dangerDeep : C.okDeep;
    lw(ctx, px, 0.022, 0.8);
    ctx.stroke();

    /* 手臂 */
    if (px >= 16) {
      ctx.strokeStyle = blame ? '#ffb0b7' : '#8bf3c9';
      ctx.lineCap = 'round';
      lw(ctx, px, 0.075, 1.6);
      ctx.beginPath();
      ctx.moveTo(-0.150, 0.055); ctx.lineTo(-0.215, 0.20);
      ctx.moveTo(0.150, 0.055); ctx.lineTo(0.215, 0.20);
      ctx.stroke();
    }

    /* 头 */
    ctx.fillStyle = bodyGradTeal(ctx, blame);
    epath(ctx, 0, -0.17, 0.145, 0.150);
    ctx.fill();
    ctx.strokeStyle = blame ? C.dangerDeep : C.okDeep;
    lw(ctx, px, 0.022, 0.8);
    ctx.stroke();

    /* 胸口的 ? 标记（未知时呼吸闪烁） */
    var qa = (happy === 0) ? (0.55 + 0.42 * Math.sin(t * 2.4)) : 1;
    if (px >= 13) {
      ctx.fillStyle = blame ? '#4a1220' : '#0b3327';
      ctx.globalAlpha = A * clamp01(qa);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textPx(ctx, px, '?', Math.round(px * 0.30), 0, 0.15, 800, 1);
      ctx.globalAlpha = A;
    }

    var markY = -0.40;
    if (happy === 0) {
      /* 未知：头顶一个缓慢呼吸的 ? 气泡 */
      if (px >= 14) {
        ctx.globalAlpha = A * clamp01(0.30 + 0.35 * Math.sin(t * 2.4));
        ctx.fillStyle = '#ffffff';
        epath(ctx, 0, markY, 0.135, 0.115);
        ctx.fill();
        ctx.globalAlpha = A * clamp01(qa);
        ctx.fillStyle = C.okDeep;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        textPx(ctx, px, '?', Math.round(px * 0.24), 0, markY + 0.005, 800, 0);
        ctx.globalAlpha = A;
      }
    } else if (happy > 0) {
      /* 满意：绿色对勾 + 小星星 */
      ctx.strokeStyle = C.ok;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      lw(ctx, px, 0.050, 1.6);
      ctx.beginPath();
      ctx.moveTo(-0.105, markY + 0.005);
      ctx.lineTo(-0.030, markY + 0.075);
      ctx.lineTo(0.115, markY - 0.085);
      ctx.stroke();
      if (px >= 18) {
        ctx.strokeStyle = C.gold;
        for (var i = 0; i < 3; i++) {
          var ph = ((t * 0.55) + i / 3) % 1;
          var sy2 = markY - 0.06 - ph * 0.28;
          var sx2 = STAR_X[i] + Math.sin(ph * 6.0 + i) * 0.045;
          star4(ctx, sx2, sy2, 0.045 * (0.6 + 0.4 * Math.sin(ph * PI)), A * Math.sin(ph * PI) * 0.95);
        }
        ctx.globalAlpha = A;
      }
    } else {
      /* 责备：红色叉 + 怒气符号 */
      ctx.strokeStyle = C.danger;
      ctx.lineCap = 'round';
      lw(ctx, px, 0.050, 1.6);
      ctx.beginPath();
      ctx.moveTo(-0.095, markY - 0.080); ctx.lineTo(0.095, markY + 0.085);
      ctx.moveTo(0.095, markY - 0.080); ctx.lineTo(-0.095, markY + 0.085);
      ctx.stroke();
      if (px >= 16) {
        ctx.save();
        ctx.translate(0.235, markY - 0.01);
        ctx.strokeStyle = C.danger;
        lw(ctx, px, 0.026, 1.0);
        for (var k = 0; k < 3; k++) {
          ctx.save();
          ctx.rotate(-0.6 + k * 1.05 + Math.sin(t * 6 + k) * 0.05);
          ctx.beginPath();
          ctx.moveTo(0.075, 0.075);
          ctx.lineTo(0.075, 0.020);
          ctx.moveTo(0.075, 0.075);
          ctx.lineTo(0.130, 0.075);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  function user(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      var entry = assetEntry('user');
      if (entry) { drawAssetImage(ctx, entry, px, num(o.hurt, 0)); return; }
      ctx.scale(px, px);
      drawUser(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     9. 中转站门 / 终点门
     ════════════════════════════════════════════════════════════ */
  function drawDoorFrame(ctx, px, gold) {
    var A = ctx.globalAlpha;
    ctx.fillStyle = gold ? goldArchGrad(ctx) : stoneGrad(ctx);
    rrect(ctx, -0.50, -0.44, 0.20, 0.92, 0.07); ctx.fill();
    rrect(ctx, 0.30, -0.44, 0.20, 0.92, 0.07); ctx.fill();
    rrect(ctx, -0.52, -0.52, 1.04, 0.15, 0.06); ctx.fill();
    /* 柱身高光 + 上沿压暗 */
    ctx.globalAlpha = A * 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.475, -0.40, 0.045, 0.84);
    ctx.fillRect(0.325, -0.40, 0.045, 0.84);
    ctx.fillRect(-0.50, -0.50, 1.00, 0.030);
    ctx.globalAlpha = A * 0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-0.52, -0.40, 1.04, 0.028);
    ctx.globalAlpha = A;
    /* 顶石 */
    ctx.fillStyle = gold ? C.goldLight : '#54658a';
    if (gold) {
      ctx.beginPath();
      ctx.moveTo(0, -0.62);
      ctx.lineTo(0.085, -0.50);
      ctx.lineTo(0, -0.40);
      ctx.lineTo(-0.085, -0.50);
      ctx.closePath();
      ctx.fill();
    } else {
      rrect(ctx, -0.075, -0.575, 0.15, 0.075, 0.02);
      ctx.fill();
    }
  }

  function drawDoor(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    var isGoal = !!o.isGoal;
    var tier = clamp(num(o.tier, 1) | 0, 1, 3);
    var known = (o.revealed !== false);
    var passed = !!o.passed;
    var col = (typeof o.tint === 'string' && o.tint) ? o.tint : (isGoal ? C.gold : TIER_COLOR[tier - 1]);

    /* ── 已通过：只剩一点石框残影 ─────────────────────────── */
    if (passed) {
      ctx.globalAlpha = A * 0.30;
      drawDoorFrame(ctx, px, false);
      ctx.globalAlpha = A * 0.16;
      ctx.fillStyle = col;
      epath(ctx, 0, 0.42, 0.34, 0.075);
      ctx.fill();
      ctx.globalAlpha = A;
      return;
    }

    /* ── 终点门：放射光线（画在门框后面） ─────────────────── */
    if (isGoal) {
      if (px >= SHADOW_S) {
        ctx.shadowColor = 'rgba(255,206,92,0.75)';
        ctx.shadowBlur = clamp(px * 0.55, 0, 26);
      }
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      lw(ctx, px, 0.030, 1.0);
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var ang = i * TAU / 8 + t * 0.45;
        var len = 0.36 + 0.055 * Math.sin(t * 2.4 + i * 1.7);
        ctx.moveTo(Math.cos(ang) * 0.24, Math.sin(ang) * 0.24);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      }
      ctx.globalAlpha = A * 0.42;
      ctx.stroke();
      ctx.globalAlpha = A;
      ctx.shadowBlur = 0;
    }

    /* ── 门框 ─────────────────────────────────────────────── */
    drawDoorFrame(ctx, px, isGoal);

    /* ── 能量场 ───────────────────────────────────────────── */
    ctx.save();
    rrect(ctx, -0.28, -0.32, 0.56, 0.78, 0.05);
    ctx.clip();
    ctx.globalAlpha = A * (known ? 0.22 + 0.05 * Math.sin(t * 2.6) : 0.10);
    ctx.fillStyle = col;
    ctx.fillRect(-0.28, -0.32, 0.56, 0.78);

    if (known) {
      /* 竖向流动的条纹 = 正在「运算」 */
      var n = (tier === 3) ? 5 : 4;
      var speed = (tier === 3) ? 1.25 : 0.85;
      ctx.fillStyle = '#ffffff';
      for (var b = 0; b < n; b++) {
        var ph = ((t * speed) + b / n) % 1;
        var yy = 0.50 - ph * 0.86;
        ctx.globalAlpha = A * (0.05 + 0.17 * Math.sin(ph * PI));
        ctx.fillRect(-0.30, yy, 0.60, 0.045);
      }
      /* 两侧竖直光条 */
      ctx.globalAlpha = A * 0.35;
      ctx.fillStyle = col;
      ctx.fillRect(-0.255, -0.32, 0.032, 0.78);
      ctx.fillRect(0.223, -0.32, 0.032, 0.78);

      /* 三级复杂运算门：斜向彩虹条纹（终点门不用彩虹，保持金色） */
      if (tier === 3 && !isGoal) {
        ctx.lineCap = 'butt';
        for (var q = 0; q < 4; q++) {
          var idx = ((((t * 7) | 0) + q * 2) % RAINBOW.length + RAINBOW.length) % RAINBOW.length;
          ctx.fillStyle = RAINBOW[idx];
          ctx.globalAlpha = A * 0.30;
          var oy = ((t * 0.75 + q * 0.25) % 1) * 0.94 - 0.47;
          ctx.save();
          ctx.translate(0, oy);
          ctx.rotate(-0.5);
          ctx.fillRect(-0.45, 0, 0.90, 0.055);
          ctx.restore();
        }
      } else if (isGoal) {
        /* 终点门：能量场里的金色脉冲圈 */
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = A * 0.30;
        lw(ctx, px, 0.018, 0.6);
        var pr = ((t * 0.6) % 1);
        epath(ctx, 0, 0.06, 0.30 * pr, 0.34 * pr);
        ctx.stroke();
      }
      ctx.globalAlpha = A;
    }
    ctx.restore();

    /* 场内边框 */
    ctx.globalAlpha = A * (known ? 0.85 : 0.35);
    ctx.strokeStyle = col;
    lw(ctx, px, 0.030, 1.0);
    rrect(ctx, -0.28, -0.32, 0.56, 0.78, 0.05);
    ctx.stroke();
    ctx.globalAlpha = A;

    /* ── 终点门：上升粒子 + 地面金光 ─────────────────────── */
    if (isGoal && px >= 16) {
      ctx.fillStyle = col;
      for (var p = 0; p < GOAL_P.length; p++) {
        var pp = GOAL_P[p];
        var f = ((t * 0.32) + pp.ph) % 1;
        var yy2 = 0.46 - f * 0.98;
        var xx2 = pp.x + Math.sin(f * 5.2 + p) * 0.05;
        var rr2 = 0.030 * (1 - f * 0.55);
        ctx.globalAlpha = A * (1 - f) * 0.85;
        epath(ctx, xx2, yy2, rr2, rr2);
        ctx.fill();
      }
      ctx.globalAlpha = A * 0.22;
      epath(ctx, 0, 0.44, 0.38, 0.09);
      ctx.fill();
      ctx.globalAlpha = A;
    }
  }

  function door(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(px, px);
      drawDoor(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     10. 隐藏通关格
     ════════════════════════════════════════════════════════════ */
  function drawHidden(ctx, o, t, px) {
    var A = ctx.globalAlpha;
    if (!o.revealed) {
      /* 未显形：地板已经由烘焙层画好，这里只留「一点噪点 + 极淡紫轮廓」。
         刻意不铺底色，否则会和房间色相偏移的地板对不上。 */
      ctx.globalAlpha = A * 0.10;
      ctx.strokeStyle = C.purple;
      lw(ctx, px, 0.026, 0.9);
      if (ctx.setLineDash) ctx.setLineDash(DASH_FAINT);
      rrect(ctx, -0.36, -0.36, 0.72, 0.72, 0.10);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash(EMPTY_DASH);
      ctx.globalAlpha = A * 0.18;
      ctx.fillStyle = C.purple;
      for (var i = 0; i < 2; i++) {
        var d = DUST[i];
        epath(ctx, d.x, d.y, 0.012, 0.012);
        ctx.fill();
      }
      ctx.globalAlpha = A;
      return;
    }

    /* 已显形：紫色柔光 + 旋转菱形符文 + 光环 */
    ctx.fillStyle = C.purple;
    ctx.globalAlpha = A * (0.20 + 0.06 * Math.sin(t * 2.2));
    epath(ctx, 0, 0, 0.46, 0.46);
    ctx.fill();
    ctx.globalAlpha = A * 0.20;
    epath(ctx, 0, 0, 0.30, 0.30);
    ctx.fill();
    ctx.globalAlpha = A;

    /* 缓慢旋转的光环（三段弧） */
    ctx.strokeStyle = C.purple;
    lw(ctx, px, 0.026, 1.0);
    for (var k = 0; k < 3; k++) {
      var a0 = t * 0.7 + k * TAU / 3;
      ctx.globalAlpha = A * (0.32 + 0.26 * Math.sin(t * 2 + k * 2.1));
      ctx.beginPath();
      ctx.arc(0, 0, 0.405, a0, a0 + 0.85);
      ctx.stroke();
    }
    ctx.globalAlpha = A;

    /* 菱形符文 */
    if (px >= SHADOW_S) {
      ctx.shadowColor = 'rgba(160,107,255,0.85)';
      ctx.shadowBlur = clamp(px * 0.40, 0, 22);
    }
    ctx.save();
    ctx.rotate(t * 0.45);
    ctx.beginPath();
    ctx.moveTo(0, -0.255);
    ctx.lineTo(0.185, 0);
    ctx.lineTo(0, 0.255);
    ctx.lineTo(-0.185, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(160,107,255,0.85)';
    ctx.fill();
    ctx.strokeStyle = C.purpleLight;
    lw(ctx, px, 0.026, 1.0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.135);
    ctx.lineTo(0.095, 0);
    ctx.lineTo(0, 0.135);
    ctx.lineTo(-0.095, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(24,12,48,0.65)';
    ctx.fill();
    ctx.strokeStyle = C.purpleLight;
    lw(ctx, px, 0.014, 0.6);
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;

    /* 四角小符文 */
    ctx.fillStyle = C.purpleLight;
    for (var c = 0; c < 4; c++) {
      var ca = c * TAU / 4 + PI / 4 + t * 0.2;
      var cx2 = Math.cos(ca) * 0.325, cy2 = Math.sin(ca) * 0.325;
      ctx.globalAlpha = A * (0.55 + 0.35 * Math.sin(t * 3 + c));
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.rotate(t * 0.8 + c);
      ctx.beginPath();
      ctx.moveTo(0, -0.045); ctx.lineTo(0.032, 0); ctx.lineTo(0, 0.045); ctx.lineTo(-0.032, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = A * 0.9;
    epath(ctx, 0, 0, 0.035, 0.035);
    ctx.fill();
    ctx.globalAlpha = A;
  }

  function hidden(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var t = timeOf(o);
    ctx.save();
    try {
      ctx.globalAlpha *= a;
      ctx.translate(x, y);
      ctx.scale(px, px);
      drawHidden(ctx, o, t, px);
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     11. 墙 / 地板（每关烘焙一次，可以画得精致）
     ════════════════════════════════════════════════════════════ */
  function wall(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var pal = wallPal(ctx, o.roomColor);
    var h = hash2(num(o.x, 0), num(o.y, 0), num(o.seed, 1));

    ctx.save();
    try {
      var A = ctx.globalAlpha * a;
      ctx.globalAlpha = A;
      ctx.translate(x, y);
      ctx.scale(px, px);

      ctx.fillStyle = pal.grad;
      ctx.fillRect(-0.5, -0.5, 1, 1);

      /* 石缝：一条横缝 + 错缝的竖缝 */
      ctx.fillStyle = pal.seam;
      ctx.globalAlpha = A * 0.55;
      ctx.fillRect(-0.5, -0.055, 1, 0.042);
      ctx.fillRect(-0.5, 0.42, 1, 0.042);
      var vx = (h < 0.5) ? -0.5 : 0.03;
      ctx.globalAlpha = A * 0.50;
      ctx.fillRect(vx, 0.0, 0.038, 0.42);
      if (h > 0.45) ctx.fillRect(vx + 0.34, -0.5, 0.038, 0.445);

      /* 石面噪点 */
      if (px >= 18) {
        ctx.fillStyle = pal.speck;
        ctx.globalAlpha = A * 0.22;
        var s1 = hash2(num(o.x, 0) + 7, num(o.y, 0) - 3, num(o.seed, 1));
        var s2 = hash2(num(o.x, 0) - 5, num(o.y, 0) + 11, num(o.seed, 1));
        ctx.fillRect(-0.42 + s1 * 0.7, -0.30 + s2 * 0.55, 0.05, 0.038);
        ctx.fillRect(-0.10 + s2 * 0.6, 0.06 + s1 * 0.4, 0.035, 0.030);
      }

      /* 顶部高光边 */
      if (o.edgeTop) {
        ctx.fillStyle = pal.topStrong;
        ctx.globalAlpha = A * 0.55;
        ctx.fillRect(-0.5, -0.5, 1, 0.085);
        ctx.globalAlpha = A;
        ctx.fillStyle = pal.top;
        ctx.fillRect(-0.5, -0.415, 1, 0.045);
      } else {
        ctx.fillStyle = pal.top;
        ctx.globalAlpha = A * 0.30;
        ctx.fillRect(-0.5, -0.5, 1, 0.055);
        ctx.globalAlpha = A;
      }
      /* 底部压暗 */
      ctx.globalAlpha = A * 0.55;
      ctx.fillStyle = pal.bottom;
      ctx.fillRect(-0.5, 0.40, 1, 0.10);
      ctx.globalAlpha = A;
    } finally {
      ctx.restore();
    }
  }

  function floor(ctx, x, y, s, o) {
    if (!ctx || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || {};
    var a = clamp01(num(o.alpha, 1));
    if (a <= 0) return;
    var px = s * clamp(num(o.scale, 1), 0.05, 6);
    var checker = clamp(num(o.checker, 0) | 0, 0, 2);
    var pal = floorPal(ctx, o.roomColor, checker);
    var gx = num(o.x, 0), gy = num(o.y, 0), seed = num(o.seed, 1);
    var h = hash2(gx, gy, seed);

    ctx.save();
    try {
      var A = ctx.globalAlpha * a;
      ctx.globalAlpha = A;
      ctx.translate(x, y);
      ctx.scale(px, px);

      /* 石板（四周留 3% 缝 → 细网格线） */
      rrect(ctx, -0.47, -0.47, 0.94, 0.94, 0.10);
      ctx.fillStyle = pal.grad;
      ctx.fill();

      /* 上亮下暗的立体感 */
      ctx.fillStyle = pal.edge;
      ctx.globalAlpha = A * 0.5;
      ctx.fillRect(-0.44, -0.44, 0.88, 0.045);
      ctx.fillStyle = pal.dark;
      ctx.globalAlpha = A * 0.55;
      ctx.fillRect(-0.44, 0.395, 0.88, 0.045);

      /* 石板纹理（噪点 / 裂纹 / 偶尔一颗矿石晶粒） */
      if (px >= 16) {
        var h2 = hash2(gx + 13, gy + 29, seed);
        if (h2 > 0.62) {
          ctx.fillStyle = pal.speck;
          ctx.globalAlpha = A * 0.30;
          ctx.fillRect(-0.34 + h * 0.62, -0.30 + h2 * 0.35, 0.055, 0.026);
          ctx.fillRect(-0.06 + h2 * 0.42, 0.06 + h * 0.26, 0.030, 0.022);
        }
        if (h > 0.88) {
          ctx.strokeStyle = pal.crack;
          ctx.globalAlpha = A * 0.45;
          lw(ctx, px, 0.016, 0.6);
          ctx.beginPath();
          ctx.moveTo(-0.30 + h2 * 0.3, 0.30);
          ctx.lineTo(-0.14 + h2 * 0.3, 0.10);
          ctx.lineTo(-0.04 + h2 * 0.3, 0.16);
          ctx.stroke();
        }
        if (h2 > 0.965 && px >= 26) {
          ctx.fillStyle = '#cfe4ff';
          ctx.globalAlpha = A * 0.55;
          epathRot(ctx, -0.22 + h * 0.5, -0.20 + h2 * 0.32, 0.035, 0.016, 0.6);
          ctx.fill();
        }
      }
      ctx.globalAlpha = A;
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     12. 低配路径（s < 12）：2~3 个填充块 + 最多 1 个符号
         没有渐变 / 阴影 / 粒子 / 裁剪，最多 1 次 fillText
     ════════════════════════════════════════════════════════════ */
  var LOW_TIER = [
    { fill: '#7aa9ff', ink: '#0d2145', tag: '门' },
    { fill: '#a06bff', ink: '#1b0b3a', tag: '门' },
    { fill: '#ffce5c', ink: '#4a2600', tag: '门' }
  ];
  var LOW_USER_BAD = { fill: C.danger, ink: '#3a0a12', tag: '?' };

  function elementLow(ctx, el, x, y, s, o, t) {
    var type = elType(el);
    var m = LOW[type] || LOW.rice;
    var revealed = (o.revealed === true) ||
                   (o.revealed === undefined && !!el && el.revealed === true);
    var isGoal = (type === 'goal') || (!!o.isGoal);
    if (type === 'door' && !isGoal) m = LOW_TIER[clamp(num(o.tier, 1) | 0, 1, 3) - 1];
    else if (type === 'user' && o.happy === false) m = LOW_USER_BAD;

    var A = ctx.globalAlpha * clamp01(num(o.alpha, 1));
    var sc = clamp(num(o.scale, 1), 0.05, 6);
    var px = s * sc;

    ctx.save();
    try {
      ctx.globalAlpha = A;
      ctx.translate(x, y);
      ctx.scale(px, px);            /* 之后全部用单位坐标（格子边长 = 1.0） */
      ctx.lineJoin = 'round';

      /* ── 隐藏格：未显形时几乎等同地板，只留一点噪点 ─────── */
      if (type === 'hidden' && !revealed) {
        ctx.globalAlpha = A * 0.20;
        ctx.fillStyle = C.purple;
        ctx.fillRect(-0.20, -0.12, 0.055, 0.055);
        ctx.fillRect(0.08, 0.10, 0.045, 0.045);
        return;
      }

      /* ── 第 1 块：主体 ───────────────────────────────────── */
      if (type === 'hidden') {
        ctx.fillStyle = C.purple;
        ctx.beginPath();
        ctx.moveTo(0, -0.42); ctx.lineTo(0.34, 0); ctx.lineTo(0, 0.42); ctx.lineTo(-0.34, 0);
        ctx.closePath();
        ctx.fill();
      } else if (m.shape === 'circle') {
        ctx.fillStyle = m.fill;
        epath(ctx, 0, -0.03, 0.38, 0.38);
        ctx.fill();
      } else if (m.shape === 'tri') {
        ctx.fillStyle = m.fill;
        ctx.beginPath();
        ctx.moveTo(0, -0.42); ctx.lineTo(0.42, 0.30); ctx.lineTo(-0.42, 0.30);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = m.fill;
        rrect(ctx, -0.40, -0.40, 0.80, 0.80, 0.14);
        ctx.fill();
      }

      /* ── 第 2 块：底座 / 边缘暗块，制造轮廓 ─────────────── */
      ctx.globalAlpha = A * 0.55;
      ctx.fillStyle = m.edge || '#0d1526';
      ctx.fillRect(-0.42, 0.30, 0.84, 0.13);

      /* ── 最多 1 个符号（s < 8 干脆不写字） ─────────────── */
      if (s >= 8 && m.tag) {
        ctx.globalAlpha = A;
        ctx.fillStyle = m.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        textPx(ctx, px, m.tag, Math.round(px * 0.56), 0, -0.03, 700, 0);
      }
    } finally {
      ctx.restore();
    }
  }

  /* ════════════════════════════════════════════════════════════
     13. element() 统一分发（每帧每个可见元素一次）
     ════════════════════════════════════════════════════════════ */
  var SCR = {
    fish: { t: 0, value: 0, facing: 'down', bowl: false, moving: false, hurt: 0, alpha: 1, scale: 1, blink: false, dead: false },
    rice: { t: 0, value: 1, glow: 0, alpha: 1, scale: 1 },
    bowlRice: { t: 0, value: 1, glow: 0, alpha: 1, scale: 1 },
    token: { t: 0, expr: '', alpha: 1, scale: 1, hurt: 0 },
    claude: { t: 0, factor: 2, happy: false, alpha: 1, scale: 1, hurt: 0 },
    user: { t: 0, happy: null, cond: '', alpha: 1, scale: 1, hurt: 0 },
    door: { t: 0, tier: 1, req: 0, isGoal: false, revealed: true, passed: false, tint: null, alpha: 1, scale: 1 },
    hidden: { t: 0, revealed: false, req: 0, alpha: 1, scale: 1 }
  };
  var EMPTY = {};

  function tierOf(el, o) {
    if (o && finite2(o.tier)) return clamp(o.tier | 0, 1, 3);
    if (el && finite2(el.tier)) return clamp(el.tier | 0, 1, 3);
    if (el && G.rules && typeof G.rules.doorTier === 'function') {
      try { return clamp(G.rules.doorTier(el) | 0, 1, 3); } catch (e) { /* 忽略 */ }
    }
    return 1;
  }

  function element(ctx, el, x, y, s, o) {
    if (!ctx || !el || !(s > 0) || !finite2(x) || !finite2(y)) return;
    o = o || EMPTY;
    var a = num(o.alpha, 1);
    if (a <= 0) return;
    var type = elType(el);
    var t = timeOf(o);

    /* ── 低配路径：s < 12 ─────────────────────────────────── */
    if (s < LOW_S) { elementLow(ctx, el, x, y, s, o, t); return; }

    switch (type) {
      case 'fish': {
        var f = SCR.fish;
        f.t = t;
        f.value = num(o.value, 0);
        f.facing = o.facing || 'down';
        f.bowl = !!o.bowl;
        f.moving = !!o.moving;
        f.hurt = clamp01(num(o.hurt, 0));
        f.alpha = a; f.scale = num(o.scale, 1);
        f.blink = !!o.blink; f.dead = !!o.dead;
        fish(ctx, x, y, s, f);
        return;
      }
      case 'bowl_rice': {
        var br = SCR.bowlRice;
        br.t = t;
        br.value = num(o.value, num(el.value, 1));
        br.glow = clamp01(num(o.glow, 0));
        br.alpha = a; br.scale = num(o.scale, 1);
        bowlRice(ctx, x, y, s, br);
        return;
      }
      case 'token': {
        var tk = SCR.token;
        tk.t = t;
        tk.expr = o.expr !== undefined ? o.expr : el.expr;
        tk.alpha = a; tk.scale = num(o.scale, 1);
        tk.hurt = clamp01(num(o.hurt, 0));
        token(ctx, x, y, s, tk);
        return;
      }
      case 'claude': {
        var cl = SCR.claude;
        cl.t = t;
        cl.factor = num(o.factor, num(el.factor, 2));
        cl.happy = !!o.happy;
        cl.alpha = a; cl.scale = num(o.scale, 1);
        cl.hurt = clamp01(num(o.hurt, 0));
        claude(ctx, x, y, s, cl);
        return;
      }
      case 'user': {
        var us = SCR.user;
        us.t = t;
        us.happy = (o.happy === true) ? true : (o.happy === false ? false : null);
        us.cond = o.cond !== undefined ? o.cond : el.cond;
        us.alpha = a; us.scale = num(o.scale, 1);
        us.hurt = clamp01(num(o.hurt, 0));
        user(ctx, x, y, s, us);
        return;
      }
      case 'door':
      case 'goal': {
        var dr = SCR.door;
        dr.t = t;
        dr.isGoal = (type === 'goal') || !!o.isGoal;
        dr.tier = tierOf(el, o);
        dr.req = num(o.req, num(el.req, 0));
        dr.revealed = (o.revealed === undefined) ? true : !!o.revealed;
        dr.passed = !!o.passed;
        dr.tint = o.tint || null;
        dr.alpha = a; dr.scale = num(o.scale, 1);
        door(ctx, x, y, s, dr);
        return;
      }
      case 'hidden': {
        var hd = SCR.hidden;
        hd.t = t;
        hd.revealed = (o.revealed === undefined) ? !!el.revealed : !!o.revealed;
        hd.req = num(o.req, num(el.req, 0));
        hd.alpha = a; hd.scale = num(o.scale, 1);
        hidden(ctx, x, y, s, hd);
        return;
      }
      case 'rice':
      default: {
        var rc = SCR.rice;
        rc.t = t;
        rc.value = num(o.value, num(el.value, 1));
        rc.glow = clamp01(num(o.glow, 0));
        rc.alpha = a; rc.scale = num(o.scale, 1);
        rice(ctx, x, y, s, rc);
        return;
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
     14. 资源覆盖（assets/ 里有图就用图，加载失败静默忽略）
     ════════════════════════════════════════════════════════════ */
  var assets = {};       /* key → { img, tint, ready, box } */

  /* ── 把用户提供的立绘处理成可直接用的精灵 ────────────────
     ① 整张图没有透明像素（例如 3D 渲染带场景）：从四边做一次
        "与边缘同色"的洪水填充，把背景抠成透明；
     ② 裁到角色的不透明外框，这样缩放比例才对。
     结果不合理（抠掉太多/太少、裁出来太小）就保持原图不动。
     ──────────────────────────────────────────────────── */
  function alphaBox(d, iw, ih) {
    var x0 = iw, y0 = ih, x1 = -1, y1 = -1;
    for (var y = 0; y < ih; y++) {
      var row = y * iw;
      for (var x = 0; x < iw; x++) {
        if (d[(row + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function keyOutBackground(d, iw, ih) {
    var total = iw * ih;
    if (total <= 0 || total > 6000000) return false;
    var q = function (i) { return ((d[i] >> 4) * 17 + (d[i + 1] >> 4)) * 17 + (d[i + 2] >> 4); };
    var edge = {};
    var seeds = [], i, x, y;
    for (x = 0; x < iw; x++) { seeds.push(x); seeds.push((ih - 1) * iw + x); }
    for (y = 0; y < ih; y++) { seeds.push(y * iw); seeds.push(y * iw + iw - 1); }
    for (i = 0; i < seeds.length; i++) {
      var o = seeds[i] * 4;
      if (d[o + 3] > 8) edge[q(o)] = 1;
    }
    var seen = new Uint8Array(total);
    var stack = [];
    for (i = 0; i < seeds.length; i++) {
      var p0 = seeds[i];
      if (!seen[p0]) { seen[p0] = 1; stack.push(p0); }
    }
    var removed = 0;
    while (stack.length) {
      var p = stack.pop();
      var o3 = p * 4;
      var kill = false;
      if (d[o3 + 3] === 0) kill = true;
      else if (edge[q(o3)]) kill = true;
      if (kill) { if (d[o3 + 3] !== 0) d[o3 + 3] = 0; removed++; }
      else { continue; }
      var px2 = p % iw, py2 = (p - px2) / iw;
      if (px2 > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (px2 < iw - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (py2 > 0 && !seen[p - iw]) { seen[p - iw] = 1; stack.push(p - iw); }
      if (py2 < ih - 1 && !seen[p + iw]) { seen[p + iw] = 1; stack.push(p + iw); }
    }
    var ratio = removed / total;
    return ratio > 0.05 && ratio < 0.94;
  }

  function processArt(img) {
    try {
      if (typeof document === 'undefined') return null;
      var iw = img.naturalWidth || img.width || 0, ih = img.naturalHeight || img.height || 0;
      if (!(iw > 0) || !(ih > 0)) return null;
      var cv = document.createElement('canvas');
      cv.width = iw; cv.height = ih;
      var c = cv.getContext('2d');
      if (!c) return null;
      c.drawImage(img, 0, 0);
      var id;
      try { id = c.getImageData(0, 0, iw, ih); } catch (e) { return null; }
      var d = id.data, i;
      var hasAlpha = false;
      for (i = 3; i < d.length; i += 4) { if (d[i] < 246) { hasAlpha = true; break; } }
      var cut = false;
      if (!hasAlpha) {
        if (!keyOutBackground(d, iw, ih)) return null;   /* 抠不出来就原样用 */
        c.putImageData(id, 0, 0);
        cut = true;
      }
      var box = alphaBox(d, iw, ih);
      if (!box) return null;
      var pad = Math.round(Math.max(box.w, box.h) * 0.03);
      var sx = Math.max(0, box.x - pad), sy = Math.max(0, box.y - pad);
      var sw = Math.min(iw - sx, box.w + pad * 2), sh = Math.min(ih - sy, box.h + pad * 2);
      if (sw < 8 || sh < 8) return null;
      if (!cut && sw >= iw && sh >= ih) return null;      /* 本来就裁好了，不用动 */
      return { canvas: cv, sx: sx, sy: sy, sw: sw, sh: sh, cut: cut };
    } catch (e) {
      return null;
    }
  }

  function makeTint(img, color) {
    try {
      if (typeof document === 'undefined') return null;
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!(iw > 0) || !(ih > 0)) return null;
      var c = document.createElement('canvas');
      c.width = iw; c.height = ih;
      var cx = c.getContext('2d');
      if (!cx) return null;
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'source-atop';
      cx.fillStyle = color;
      cx.fillRect(0, 0, iw, ih);
      return c;
    } catch (e) {
      return null;   /* file:// 下的任何限制都不影响程序化绘制 */
    }
  }

  function assetEntry(key) {
    var e = assets[key];
    if (!e || !e.ready || !e.img) return null;
    var img = e.img;
    if (img.complete === false) return null;
    if (!((img.naturalWidth || img.width || 0) > 0)) return null;
    return e;
  }

  /** 装载一张立绘（URL 或 dataURL）。key: 'fish' | 'fish_bowl' | 'claude' | 'user'
      传 null / undefined / 空串表示**卸载**，回到程序化画法。 */
  function installArt(key, src, cb) {
    if (src === null || src === undefined || src === '') {
      delete assets[key];
      if (cb) cb(false);
      return;
    }
    if (typeof src !== 'string' || typeof Image === 'undefined') { if (cb) cb(false); return; }
    var e = assets[key];
    if (!e) { e = { img: null, tint: null, ready: false, box: null }; assets[key] = e; }
    var img = new Image();
    e.img = img; e.ready = false; e.tint = null; e.box = null;
    img.onload = function () {
      try {
        e.ready = ((img.naturalWidth || img.width || 0) > 0);
        if (e.ready) {
          var proc = processArt(img);
          if (proc) { e.img = proc.canvas; e.box = proc; }
          e.tint = makeTint(e.img, 'rgba(255,64,84,0.72)');
        }
      } catch (err) { e.ready = false; }
      if (cb) cb(e.ready);
    };
    img.onerror = function () {
      e.ready = false; e.tint = null; e.box = null;   /* 静默忽略 → 继续程序化画法 */
      if (cb) cb(false);
    };
    try { img.src = src; } catch (e2) { e.ready = false; if (cb) cb(false); }
  }

  function preloadAssets(files, onDone) {
    var total = 0, loaded = 0, settled = 0, key;
    var cb = (typeof onDone === 'function') ? onDone : null;
    if (!files) { if (cb) cb(0, 0); return; }
    for (key in files) {
      if (Object.prototype.hasOwnProperty.call(files, key)) total++;
    }
    if (!total) { if (cb) cb(0, 0); return; }

    function settle() {
      settled++;
      if (settled >= total && cb) cb(loaded, total);
    }
    for (key in files) {
      if (!Object.prototype.hasOwnProperty.call(files, key)) continue;
      (function (k) {
        installArt(k, files[k], function (ok) { if (ok) loaded++; settle(); });
      })(key);
    }
  }

  function assetReady(key) {
    var e = assetEntry(key);
    return e ? e.img : null;
  }

  /* ════════════════════════════════════════════════════════════
     15. icon()：给图鉴 / 关卡介绍卡画一张独立小图
     ════════════════════════════════════════════════════════════ */
  var ICON_T = {
    rice: 0.80, bowl_rice: 0.20, token: 0.35, claude: 1.10,
    user: 0.60, door: 1.00, goal: 0.50, hidden: 0.90, fish: 0.00
  };

  function icon(el, size) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var sz = Math.max(8, Math.round(num(size, 64)));
    var type = elType(el);
    var cv = document.createElement('canvas');
    var dpr = 2;                                  /* 2 倍 DPR：缩放到 CSS 尺寸后依然锐利 */
    cv.width = Math.round(sz * dpr);
    cv.height = Math.round(sz * dpr);
    if (cv.style) { cv.style.width = sz + 'px'; cv.style.height = sz + 'px'; }
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return cv;
    ctx.scale(dpr, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var s = sz * 0.82;
    var o = {
      t: (ICON_T[type] !== undefined) ? ICON_T[type] : 0.8,
      alpha: 1, scale: 1,
      isGoal: (type === 'goal'),
      revealed: (type === 'hidden') ? true : undefined,
      value: num(el && el.value, 3),
      factor: num(el && el.factor, 3),
      tier: tierOf(el, null),
      happy: (el && el.happy === true) ? true : null
    };
    if (type === 'fish') {
      o.value = num(el && el.value, 1200);
      o.bowl = !!(el && el.bowl);
      o.moving = false;
      fish(ctx, sz / 2, sz / 2, s, o);
      return cv;
    }
    var payload = el;
    if (typeof el === 'string' || !el) payload = { type: type };
    else if (!el.type && el.key) payload = { type: type, value: el.value, factor: el.factor, expr: el.expr, cond: el.cond, req: el.req, op: el.op, tier: el.tier };
    element(ctx, payload, sz / 2, sz / 2, s, o);
    return cv;
  }

  /* ════════════════════════════════════════════════════════════
     16. 导出
     ════════════════════════════════════════════════════════════ */
  G.sprites = {
    fish: fish,
    rice: rice,
    bowlRice: bowlRice,
    token: token,
    claude: claude,
    user: user,
    door: door,
    hidden: hidden,
    wall: wall,
    floor: floor,
    element: element,
    icon: icon,
    preloadAssets: preloadAssets,
    installArt: installArt,
    assetReady: assetReady
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
