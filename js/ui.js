/* ─────────────────────────────────────────────────────────────
   ui.js —— HUD / 气泡 / 弹窗 / 判定范围 / 飘字 / 图鉴 / 关卡选择 / 校验面板
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var R = G.rules, E = G.expr;
  var game = null;
  var dom = {};
  var bubbles = {};
  var judgeEl = null, judgeTimer = 0;
  var overlayOpen = false;

  /* ── 元素缩略图 ───────────────────────────────────────── */
  function sampleEl(type) {
    var s = { type: type, id: 'sample', x: 0, y: 0 };
    switch (type) {
      case 'rice': s.value = 8; break;
      case 'bowl_rice': s.value = 8; break;
      case 'token': s.expr = '(x + 4) * 2'; break;
      case 'claude': s.factor = 3; break;
      case 'user': s.cond = 'x >= 20'; s.bonus = 15; s.penalty = 15; break;
      case 'door': s.op = 'sub'; s.amount = 7; s.req = 30; s.tier = 1; break;
      case 'goal': s.req = 60; break;
      case 'hidden': s.req = 60; s.reveal = 30; break;
    }
    return s;
  }

  function iconCanvas(el, size) {
    size = size || 54;
    if (G.sprites && G.sprites.icon) {
      try { return G.sprites.icon(el, size); } catch (e) { }
    }
    var cv = document.createElement('canvas');
    var dpr = 2;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    var t = R.TYPES[el.type] || { color: '#888', tag: '?' };
    c.fillStyle = t.color;
    c.globalAlpha = 0.22;
    c.fillRect(0, 0, size, size);
    c.globalAlpha = 1;
    c.fillStyle = t.color;
    c.font = '700 ' + Math.round(size * 0.5) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t.tag || '?', size / 2, size / 2);
    return cv;
  }

  /* ── 初始化 ───────────────────────────────────────────── */
  function init(g) {
    game = g;
    dom.app = document.getElementById('app');
    dom.valueNum = document.getElementById('value-num');
    dom.valueBox = document.getElementById('value-box');
    dom.valueSub = document.getElementById('value-sub');
    dom.bowlChip = document.getElementById('bowl-chip');
    dom.levelNo = document.getElementById('level-no');
    dom.levelName = document.getElementById('level-name');
    dom.bubbleLayer = document.getElementById('canvas-layer');
    dom.overlay = document.getElementById('overlay');
    dom.card = document.getElementById('overlay-card');
    dom.toastLayer = document.getElementById('toast-layer');
    dom.hintBar = document.getElementById('hint-bar');
    dom.pad = document.getElementById('pad');

    var bind = function (id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { G.audio.unlock(); G.audio.play('click'); fn(); });
    };
    bind('btn-reset', function () { game.restart(); });
    bind('btn-codex', function () { showCodex(); });
    bind('btn-zoom', function () { game.toggleZoom(); });
    bind('btn-mute', function () { var m = game.toggleMute(); syncMute(m); });
    bind('btn-levels', function () { showLevels(); });

    initArtDrop();

    dom.overlay.addEventListener('click', function (e) {
      if (e.target === dom.overlay && game.canDismissOverlay && game.canDismissOverlay()) closeOverlay();
    });
  }

  function syncMute(muted) {
    var b = document.getElementById('btn-mute');
    if (b) { b.textContent = muted ? '🔇' : '🔊'; b.classList.toggle('off', muted); }
  }

  /* ── HUD ──────────────────────────────────────────────── */
  var lastValue = null;
  function sync(engine, level) {
    if (!engine || !level) return;
    dom.levelNo.textContent = (level.id < 10 ? '0' : '') + level.id;
    dom.levelName.textContent = level.name;
    var v = E.fmtNum(engine.value);
    if (lastValue !== v) {
      dom.valueNum.textContent = v;
      var gi = game && game.lastGain !== undefined ? game.lastGain : 0;
      dom.valueBox.classList.remove('good', 'bad');
      if (lastValue !== null && gi > 0) dom.valueBox.classList.add('good');
      else if (lastValue !== null && gi < 0) dom.valueBox.classList.add('bad');
      dom.valueBox.classList.add('pop');
      setTimeout(function () { dom.valueBox.classList.remove('pop'); }, 140);
      lastValue = v;
    }
    dom.bowlChip.classList.toggle('hidden', !engine.bowl);
    if (level.spec && level.spec.hint) setHint(level.spec.hint);
  }

  function setValueSub(t) { if (dom.valueSub) dom.valueSub.textContent = t || ''; }

  var lastHintHTML = null;
  function setHint(t) {
    if (!dom.hintBar) return;
    if (t === lastHintHTML) return;
    lastHintHTML = t;
    if (!t) { dom.hintBar.classList.add('hidden'); dom.hintBar.innerHTML = ''; return; }
    dom.hintBar.classList.remove('hidden');
    dom.hintBar.innerHTML = t;
  }

  /* ── 飘字 ─────────────────────────────────────────────── */
  function float(text, cls, sx, sy) {
    if (!dom.bubbleLayer) return;
    var d = document.createElement('div');
    d.className = 'float-num ' + (cls || 'good');
    d.textContent = text;
    d.style.left = sx + 'px';
    d.style.top = sy + 'px';
    dom.bubbleLayer.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1050);
  }

  /* ── Toast ────────────────────────────────────────────── */
  function toast(text, cls) {
    if (!dom.toastLayer) return;
    var d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    dom.toastLayer.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2600);
  }

  /* ── 画布气泡（表达式宽度自适应） ─────────────────────── */
  function syncBubbles(list) {
    if (!dom.bubbleLayer) return;
    var seen = {};
    (list || []).forEach(function (b) {
      var id = b.el.id;
      seen[id] = true;
      var d = bubbles[id];
      if (!d) {
        d = document.createElement('div');
        d.className = 'expr-bubble';
        dom.bubbleLayer.appendChild(d);
        bubbles[id] = d;
      }
      if (d._html !== b.text) { d.innerHTML = b.text; d._html = b.text; }
      d.className = 'expr-bubble ' + (b.cls || '');
      d.style.left = Math.round(b.x) + 'px';
      d.style.top = Math.round(b.y) + 'px';
    });
    for (var k in bubbles) {
      if (!seen[k]) { if (bubbles[k].parentNode) bubbles[k].parentNode.removeChild(bubbles[k]); delete bubbles[k]; }
    }
  }
  function clearBubbles() {
    for (var k in bubbles) { if (bubbles[k].parentNode) bubbles[k].parentNode.removeChild(bubbles[k]); delete bubbles[k]; }
  }

  /* ── 判定范围弹出（失败时） ───────────────────────────── */
  function judge(sx, sy, o) {
    clearJudge();
    o = o || {};
    var d = document.createElement('div');
    d.className = 'judge';
    var html = '';
    html += '<div class="jt">' + (o.title || '判定失败') + '</div>';
    if (o.formula) html += '<div class="jr">' + o.formula + '</div>';
    if (typeof o.need === 'number' && typeof o.have === 'number') {
      var max = Math.max(o.need, o.have, 1);
      var pw = Math.max(2, Math.min(100, (o.have / max) * 100));
      var nw = Math.max(2, Math.min(100, (o.need / max) * 100));
      html += '<div class="range-bar"><i class="need" style="width:' + nw + '%"></i>' +
        '<i class="have" style="width:' + pw + '%"></i></div>' +
        '<div class="range-legend"><span>当前 <b class="jv">' + E.fmtNum(o.have) + '</b></span>' +
        '<span>要求 <b class="jp">' + E.fmtNum(o.need) + '</b></span></div>';
    } else if (o.text) {
      html += '<div class="jr">' + o.text + '</div>';
    }
    d.innerHTML = html;
    d.style.left = Math.round(sx) + 'px';
    d.style.top = Math.round(sy) + 'px';
    dom.bubbleLayer.appendChild(d);
    judgeEl = d;
    /* 把弹窗夹在视口里，别飞出屏幕 */
    requestAnimationFrame(function () {
      var r = d.getBoundingClientRect();
      var w = window.innerWidth, h = window.innerHeight;
      var dx = 0, dy = 0;
      if (r.left < 8) dx = 8 - r.left;
      if (r.right > w - 8) dx = (w - 8) - r.right;
      if (r.top < 8) dy = 8 - r.top;
      if (r.bottom > h - 8) dy = (h - 8) - r.bottom;
      if (dx || dy) {
        d.style.left = (parseFloat(d.style.left) + dx) + 'px';
        d.style.top = (parseFloat(d.style.top) + dy) + 'px';
      }
    });
    clearTimeout(judgeTimer);
    judgeTimer = setTimeout(clearJudge, 3200);
  }
  function clearJudge() {
    if (judgeEl && judgeEl.parentNode) judgeEl.parentNode.removeChild(judgeEl);
    judgeEl = null;
  }

  /* ── 弹窗基础 ─────────────────────────────────────────── */
  function openOverlay(html, wire, dismissible) {
    dom.card.innerHTML = html;
    dom.overlay.classList.remove('hidden');
    dom.overlay.dataset.dismissible = dismissible ? '1' : '0';
    overlayOpen = true;
    if (wire) wire(dom.card);
    G.audio.play('click');
  }
  function closeOverlay() {
    dom.overlay.classList.add('hidden');
    dom.card.innerHTML = '';
    overlayOpen = false;
  }
  function isOverlayOpen() { return overlayOpen; }

  /* ── 关卡介绍 ─────────────────────────────────────────── */
  function seenTypesBefore(id) {
    var seen = {};
    G.levels.specs().forEach(function (sp) {
      if (sp.id >= id) return;
      (sp.intro || []).forEach(function (it) {
        if (typeof it === 'string') seen[it] = 1;
        else if (it && it.icon) seen[it.icon + '@' + (it.key || it.title)] = 1;
      });
    });
    return seen;
  }

  function introItemHTML(el, isNew, titleOverride, descOverride) {
    var t = R.TYPES[el.type] || {};
    var html = '<div class="intro-item' + (isNew ? ' new' : '') + '" data-icon="' + el.type + '">';
    html += '<div class="it-body"><div class="it-t">' + (titleOverride || t.name) +
      (isNew ? ' <em>NEW</em>' : '') + '</div>';
    html += '<div class="it-d">' + (descOverride || t.rule || '') + '</div>';
    html += '</div></div>';
    return html;
  }

  function showIntro(level, onStart) {
    var seen = seenTypesBefore(level.id);
    var html = '<h1>第 ' + level.id + ' 关 · ' + level.name + '</h1>';
    html += '<div class="sub">' + (level.subtitle || '') +
      '　地图 ' + level.w + '×' + level.h + '　·　元素 ' + level.elements.length +
      '　·　门 ' + level.doors.length + '</div>';

    var items = '', hasNew = false;
    (level.intro || []).forEach(function (it) {
      if (typeof it === 'string') {
        var isNew = !seen[it];
        if (isNew) hasNew = true;
        items += introItemHTML(sampleEl(it), isNew);
      } else if (it && it.icon) {
        var key = it.icon + '@' + (it.key || it.title);
        var nw = it.new === true && !seen[key];
        if (nw) hasNew = true;
        var el = sampleEl(it.icon);
        items += introItemHTML(el, nw, it.title, (it.desc || '') + (it.formula ? '<br><code>' + it.formula + '</code>' : ''));
      }
    });
    if (items) html += '<div class="intro-grid">' + items + '</div>';

    if (level.tips && level.tips.length) {
      html += '<div class="sub" style="margin-top:12px">';
      level.tips.forEach(function (t) { html += '· ' + t + '<br>'; });
      html += '</div>';
    }
    html += '<div class="row right">' +
      '<button class="btn ghost" data-act="codex">元素图鉴</button>' +
      '<button class="btn" data-act="start">' + (hasNew ? '开始（有新元素）' : '开始') + '</button></div>';

    openOverlay(html, function (card) {
      Array.prototype.forEach.call(card.querySelectorAll('.intro-item'), function (node) {
        var cv = iconCanvas(sampleEl(node.getAttribute('data-icon')), 54);
        node.insertBefore(cv, node.firstChild);
      });
      card.querySelector('[data-act="codex"]').onclick = function () { showCodex(function () { showIntro(level, onStart); }); };
      card.querySelector('[data-act="start"]').onclick = function () { closeOverlay(); onStart && onStart(); };
    }, false);
  }

  /* ── 失败 / 通关 ──────────────────────────────────────── */
  function showFail(engine, level, ev, cb) {
    var d = (ev && ev.detail) || {};
    var html = '<h2 class="fail-big">✖ 失败</h2>';
    html += '<div class="sub">' + (d.title || '判定未通过') + '　—— ' + (ev && ev.reason ? ev.reason : '') + '</div>';
    if (typeof d.need === 'number') {
      var max = Math.max(d.need, d.have, 1);
      html += '<div class="range-bar" style="margin-top:14px"><i class="need" style="width:' +
        Math.max(2, Math.min(100, d.need / max * 100)) + '%"></i><i class="have" style="width:' +
        Math.max(2, Math.min(100, d.have / max * 100)) + '%"></i></div>';
      html += '<div class="range-legend"><span>当前数值 <b class="jv">' + E.fmtNum(d.have) +
        '</b></span><span>要求 <b class="jp">' + E.fmtNum(d.need) + '</b></span></div>';
    }
    if (d.formula) html += '<div class="sub" style="margin-top:12px"><code>' + d.formula + '</code></div>';
    html += '<div class="sub" style="margin-top:10px">提示：' + (level.spec.tips && level.spec.tips[0] ? level.spec.tips[0] : '数值 ≤ 0 或撞上过不去的门都会失败。') + '</div>';
    html += '<div class="row right">' +
      '<button class="btn ghost" data-act="levels">关卡选择</button>' +
      '<button class="btn warn" data-act="restart">重开本关</button></div>';
    openOverlay(html, function (card) {
      card.querySelector('[data-act="restart"]').onclick = function () { closeOverlay(); cb && cb('restart'); };
      card.querySelector('[data-act="levels"]').onclick = function () { closeOverlay(); cb && cb('levels'); };
    }, false);
  }

  function showWin(engine, level, cb) {
    var goal = level.goal;
    var req = goal ? goal.req : '?';
    var perfect = goal && engine.value >= req;
    var html = '<h2 class="big-end">🏁 通关！</h2>';
    html += '<div class="sub">第 ' + level.id + ' 关 · ' + level.name + '　·　用了 ' + engine.steps + ' 步</div>';
    html += '<div class="big-end">数值 ' + E.fmtNum(engine.value) + '</div>';
    html += '<div class="sub">终点门槛（本关最优解标准值）：<code>' + E.fmtNum(req) + '</code>' +
      (perfect ? '　✅ 达标' : '') + '</div>';
    if (engine.bowl) html += '<div class="sub">🥣 通关时铁盆还完好</div>';
    var last = level.id >= G.levels.count();
    html += '<div class="row right"><button class="btn ghost" data-act="replay">再玩玩</button>' +
      '<button class="btn ghost" data-act="levels">关卡选择</button>' +
      (last ? '<button class="btn" data-act="levels">全部关卡完成 🎉</button>'
            : '<button class="btn" data-act="next">下一关 →</button>') + '</div>';
    openOverlay(html, function (card) {
      card.querySelector('[data-act="replay"]').onclick = function () { closeOverlay(); cb && cb('replay'); };
      card.querySelector('[data-act="levels"]').onclick = function () { closeOverlay(); cb && cb('levels'); };
      var nx = card.querySelector('[data-act="next"]');
      if (nx) nx.onclick = function () { closeOverlay(); cb && cb('next'); };
    }, false);
  }

  /* ── 关卡选择 ─────────────────────────────────────────── */
  function showLevels() {
    var total = G.levels.count();
    var html = '<h1>关卡选择</h1><div class="sub">共 ' + total + ' 关　·　已通关 ' +
      Object.keys(G.levels.progress.cleared).length + ' 关</div><div class="level-grid">';
    G.levels.specs().forEach(function (sp) {
      var unlocked = G.levels.isUnlocked(sp.id);
      var done = G.levels.isCleared(sp.id);
      html += '<button class="level-cell' + (done ? ' done' : '') + (unlocked ? '' : ' locked') + '" data-id="' + sp.id + '">' +
        '<div class="lc-no">LEVEL ' + (sp.id < 10 ? '0' : '') + sp.id + '</div>' +
        '<div class="lc-nm">' + sp.name + '</div>' +
        '<div class="lc-meta">' + (sp.tier || '') + '　' + sp.size[0] + '×' + sp.size[1] + '</div>' +
        '</button>';
    });
    html += '</div><div class="row right">' +
      '<button class="btn ghost" data-act="unlock">解锁全部</button>' +
      '<button class="btn ghost" data-act="reset">重置进度</button>' +
      '<button class="btn" data-act="close">返回游戏</button></div>';
    openOverlay(html, function (card) {
      Array.prototype.forEach.call(card.querySelectorAll('.level-cell'), function (node) {
        node.onclick = function () {
          var id = parseInt(node.getAttribute('data-id'), 10);
          if (!G.levels.isUnlocked(id)) { toast('这一关还没解锁，先通关前面的关卡吧', 'warn'); G.audio.play('warn'); return; }
          closeOverlay();
          game.goLevel(id);
        };
      });
      card.querySelector('[data-act="unlock"]').onclick = function () {
        G.levels.unlockAll(); toast('已解锁全部关卡', 'good'); showLevels();
      };
      card.querySelector('[data-act="reset"]').onclick = function () {
        G.levels.resetProgress(); toast('进度已重置', 'warn'); showLevels();
      };
      card.querySelector('[data-act="close"]').onclick = closeOverlay;
    }, true);
  }

  /* ── 图鉴 ─────────────────────────────────────────────── */
  function showCodex(onBack) {
    var html = '<h1>元素图鉴</h1><div class="sub">大肥鱼碰到元素后，用自己的数值参与该元素的运算。</div><div class="codex-list">';
    R.ORDER.forEach(function (t) {
      var T = R.TYPES[t];
      html += '<div class="codex-row" data-icon="' + t + '"><div>' +
        '<div class="cx-t">' + T.name + '</div>' +
        '<div class="cx-d">' + T.rule + '<br>示例：<code>' + T.example + '</code></div>' +
        '</div></div>';
    });
    html += '</div>';
    html += '<div class="sub" style="margin-top:14px">表达式可用：<code>+ - * / % **</code>、比较 <code>== != &lt; &lt;= &gt; &gt;=</code>、' +
      '逻辑 <code>&amp;&amp; || !</code>、变量 <code>x</code>、常量 <code>pi e</code>。<br>' +
      '函数：<code>' + E.funcList.join(' ') + '</code><br>' +
      '<b>除法是向下取整的整数除法</b>，取模结果永远非负，所有结果四舍五入到 3 位小数。</div>';
    html += '<div class="sub" style="margin-top:10px">🥣 铁盆：可免疫一次失败（数值不变、元素不消失、大肥鱼被弹出），最多同时持有 1 个。</div>';
    html += '<div class="row right">' +
      '<button class="btn ghost" data-act="art">换形象素材</button>' +
      '<button class="btn" data-act="close">返回</button></div>';
    openOverlay(html, function (card) {
      Array.prototype.forEach.call(card.querySelectorAll('.codex-row'), function (node) {
        var cv = iconCanvas(sampleEl(node.getAttribute('data-icon')), 48);
        node.insertBefore(cv, node.firstChild);
      });
      card.querySelector('[data-act="art"]').onclick = function () { showArt(); };
      card.querySelector('[data-act="close"]').onclick = function () {
        if (onBack) { onBack(); } else closeOverlay();
      };
    }, true);
  }

  /* ── 长按元素：看它的公式（只给规则，不给算好的结果） ─────── */
  function showElement(el, engine) {
    if (!el) return;
    var E2 = G.expr, R2 = G.rules;
    var name = (R2.TYPES[el.type] && R2.TYPES[el.type].name) || el.type;
    var formula = el.type === 'door' ? R2.doorFormula(el)
                : (el.type === 'user' ? el.cond : (el.expr || R2.formula(el)));
    var html = '<h1>' + name + '</h1>';
    html += '<div class="sub" style="margin-top:6px"><code>' + String(formula).replace(/</g, '&lt;') + '</code></div>';
    if (el.type === 'door') {
      html += '<div class="sub" style="margin-top:8px">门槛 <b>≥' + el.req + '</b>　（数值够才能过；不够就是失败）</div>';
    } else if (el.type === 'rice' || el.type === 'bowl_rice') {
      html += '<div class="sub" style="margin-top:8px">吃下去数值 <b>+' + el.value + '</b></div>';
    } else if (el.type === 'claude') {
      html += '<div class="sub" style="margin-top:8px">把当前数值 <b>乘以 ' + el.factor + '</b>，越晚吃越赚</div>';
    } else if (el.type === 'user') {
      html += '<div class="sub" style="margin-top:8px">条件成立 <b style="color:#48e5a3">+' + el.bonus +
        '</b>，不成立 <b style="color:#ff5d6c">−' + (el.penalty !== undefined ? el.penalty : el.bonus) + '</b></div>';
    } else if (el.type === 'goal') {
      html += '<div class="sub" style="margin-top:8px">数值 <b>≥' + el.req + '</b> 走进去即通关</div>';
    } else if (el.type === 'hidden') {
      html += '<div class="sub" style="margin-top:8px">数值 <b>≥' + el.req + '</b> 显形，显形后走进去通关</div>';
    }
    html += '<div class="sub" style="margin-top:10px;opacity:.72">长按只是查看，不会触发这个元素。</div>';
    /* 顺带把这条公式用到的函数讲清楚（每个函数一句话原理 + 一个例子） */
    var srcForHelp = (el.type === 'user') ? el.cond : el.expr;
    if (srcForHelp) {
      var list = E2.explain(srcForHelp);
      if (list.length) {
        html += '<div class="sub" style="margin-top:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px">' +
          '这条式子用到的算法：</div>';
        for (var k = 0; k < list.length; k++) {
          var h = list[k];
          html += '<div style="margin-top:8px;font-size:12.5px;line-height:1.7">' +
            '<code>' + h.name + '()</code> <b>' + h.title + '</b>' +
            (h.eg ? '<br><span style="opacity:.85">例：' + h.eg + '</span>' : '') +
            (h.desc ? '<br><span style="opacity:.7">' + h.desc + '</span>' : '') +
            '</div>';
        }
      }
    }
    html += '<div class="row right"><button class="btn" data-act="close">知道了</button></div>';
    openOverlay(html, function (card) {
      card.querySelector('[data-act="close"]').onclick = closeOverlay;
    }, true);
  }

  /* ── 元素生效后：把这一步的运算过程摊开 ───────────────────── */
  function showSteps(el, before, after) {
    if (!el || !el.expr || before === undefined) return;
    var E2 = G.expr;
    var tr = E2.trace(el.expr, before);
    if (!tr) return;
    var html = '<h1>运算过程</h1>';
    html += '<div class="sub" style="margin-top:6px"><code>' + String(el.expr).replace(/</g, '&lt;') + '</code></div>';
    html += '<div class="sub" style="margin-top:8px">代入 x = <b>' + E2.fmtNum(before) + '</b></div>';
    html += '<ol style="margin:10px 0 0 18px;font-size:13px;line-height:1.85">';
    for (var i = 0; i < tr.steps.length; i++) {
      html += '<li><code>' + String(tr.steps[i].text).replace(/</g, '&lt;') + '</code> = <b>' +
        E2.fmtNum(tr.steps[i].value) + '</b></li>';
    }
    html += '</ol>';
    html += '<div class="sub" style="margin-top:10px">结果：<b>' + E2.fmtNum(before) + '</b> → <b style="color:#ffce5c">' +
      E2.fmtNum(after !== undefined ? after : tr.value) + '</b></div>';
    html += '<div class="row right"><button class="btn" data-act="close">知道了</button></div>';
    openOverlay(html, function (card) {
      card.querySelector('[data-act="close"]').onclick = closeOverlay;
    }, true);
  }

  /* ── 校验面板（开发用，按 V） ─────────────────────────── */
  function showVerify() {
    openOverlay('<h1>关卡校验</h1><div class="sub" id="vf-status">正在构建 ' + G.levels.count() + ' 张地图并追踪最优解路线……</div>' +
      '<pre id="vf-out" style="max-height:52vh;overflow:auto;font-size:11.5px;line-height:1.6;white-space:pre-wrap;' +
      'background:rgba(0,0,0,.32);padding:12px;border-radius:12px;margin-top:12px"></pre>' +
      '<div class="row right"><button class="btn" data-act="close">关闭</button></div>',
      function (card) {
        card.querySelector('[data-act="close"]').onclick = closeOverlay;
        setTimeout(function () {
          var t0 = Date.now();
          var reports, err = null;
          try { reports = G.levels.checkAll(); } catch (e) { err = e; }
          var out = document.getElementById('vf-out');
          var st = document.getElementById('vf-status');
          if (err) { out.textContent = '校验器异常：' + err.message + '\n' + (err.stack || ''); return; }
          st.textContent = '耗时 ' + (Date.now() - t0) + ' ms　（✅ 可通关 / ❌ 有问题）';
          out.textContent = G.verify.formatReport(reports);
          var bad = reports.filter(function (r) { return !r.ok; }).length;
          toast(bad ? (bad + ' 关有问题，看面板详情') : (reports.length + ' 关全部可通关 ✅'), bad ? 'warn' : 'good');
        }, 60);
      }, true);
  }

  /* ── 受击闪屏 ─────────────────────────────────────────── */
  function flashHit() {
    dom.app.classList.remove('hit');
    void dom.app.offsetWidth;
    dom.app.classList.add('hit');
    setTimeout(function () { dom.app.classList.remove('hit'); }, 460);
  }

  /* ── 形象素材：拖图进来自动替换立绘 ───────────────────── */
  var ART_LABEL = { fish: '常态形象', fish_bowl: '头顶铁盆形态' };
  function artLS(k) { return 'dsf.art.' + k; }

  function readImageFile(file, cb) {
    if (!file || typeof FileReader === 'undefined') { cb(null); return; }
    try {
      var fr = new FileReader();
      fr.onload = function () { cb(String(fr.result || '')); };
      fr.onerror = function () { cb(null); };
      fr.readAsDataURL(file);
    } catch (e) { cb(null); }
  }

  function applyArt(key, dataURL, cb, noSave) {
    if (!G.sprites || !G.sprites.installArt) { cb && cb(false); return; }
    G.sprites.installArt(key, dataURL, function (ok) {
      if (ok && !noSave) { try { window.localStorage.setItem(artLS(key), dataURL); } catch (e) { } }
      if (ok) toast('已换上新形象：' + (ART_LABEL[key] || key), 'good');
      else toast('这张图读不出来，换一张试试', 'warn');
      cb && cb(ok);
    });
  }

  function loadSavedArt() {
    ['fish', 'fish_bowl'].forEach(function (k) {
      var v = null;
      try { v = window.localStorage.getItem(artLS(k)); } catch (e) { }
      if (v && G.sprites && G.sprites.installArt) G.sprites.installArt(k, v, function () { });
    });
  }

  function clearArt() {
    ['fish', 'fish_bowl'].forEach(function (k) {
      try { window.localStorage.removeItem(artLS(k)); } catch (e) { }
    });
    if (G.sprites && G.sprites.installArt) {
      /* 装一个必然失败的地址 → 回到程序化画法 */
      G.sprites.installArt('fish', '', function () { });
      G.sprites.installArt('fish_bowl', '', function () { });
    }
    toast('已恢复程序化形象', 'good');
  }

  function artPreview(key, size) {
    var cv = document.createElement('canvas');
    var dpr = 2;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    var c = cv.getContext('2d');
    if (c) {
      c.scale(dpr, dpr);
      c.fillStyle = 'rgba(255,255,255,.05)';
      c.fillRect(0, 0, size, size);
      try {
        G.sprites.fish(c, size / 2, size * 0.60, size * 0.82, { t: 1.1, bowl: key === 'fish_bowl', value: 8 });
      } catch (e) { }
    }
    return cv;
  }

  function refreshArtPreviews(card) {
    Array.prototype.forEach.call(card.querySelectorAll('[data-prev]'), function (node) {
      var k = node.getAttribute('data-prev');
      node.innerHTML = '';
      node.appendChild(artPreview(k, 92));
    });
  }

  /** pendingURL 不为空时，面板顶部会多出"刚才拖进来的那张图"的选择条 */
  function showArt(pendingURL) {
    var html = '<h1>形象素材</h1><div class="sub">' +
      '把图片<b>直接拖到游戏画面上</b>，或者点下面的按钮选图，就能换成你自己的立绘。<br>' +
      '带场景背景的图（例如 3D 渲染）会<b>自动抠掉背景</b>并裁到角色外框；' +
      '只给常态立绘、不给铁盆立绘时，铁盆会由程序化画法扣上去，玩法不受影响。</div>';
    if (pendingURL) {
      html += '<div class="art-pending"><div class="ap-t">刚才那张图要装在哪里？</div>' +
        '<div class="row"><button class="btn" data-use="fish">设为常态形象</button>' +
        '<button class="btn ghost" data-use="fish_bowl">设为铁盆形态</button></div></div>';
    }
    html += '<div class="art-slots">';
    ['fish', 'fish_bowl'].forEach(function (k) {
      html += '<div class="art-slot"><div class="as-t">' + ART_LABEL[k] + '</div>' +
        '<div class="as-prev" data-prev="' + k + '"></div>' +
        '<button class="btn ghost" data-pick="' + k + '">选择图片…</button></div>';
    });
    html += '</div><div class="row right">' +
      '<button class="btn ghost" data-act="reset">恢复程序化形象</button>' +
      '<button class="btn" data-act="close">返回</button></div>';

    openOverlay(html, function (card) {
      refreshArtPreviews(card);
      Array.prototype.forEach.call(card.querySelectorAll('[data-pick]'), function (btn) {
        btn.onclick = function () {
          var key = btn.getAttribute('data-pick');
          var inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            readImageFile(f, function (url) { if (url) applyArt(key, url, function () { showArt(); }); });
          };
          inp.click();
        };
      });
      Array.prototype.forEach.call(card.querySelectorAll('[data-use]'), function (btn) {
        btn.onclick = function () {
          var key = btn.getAttribute('data-use');
          applyArt(key, pendingURL, function () { showArt(); });
        };
      });
      card.querySelector('[data-act="reset"]').onclick = function () { clearArt(); showArt(); };
      card.querySelector('[data-act="close"]').onclick = closeOverlay;
    }, true);
  }

  /** 拖拽换图：拖到画面上松手即可 */
  function initArtDrop() {
    if (!dom.app || dom.app._artDrop) return;
    dom.app._artDrop = true;
    var hint = document.createElement('div');
    hint.className = 'drop-hint hidden';
    hint.textContent = '松手 → 用这张图替换大肥鱼形象';
    dom.app.appendChild(hint);
    var depth = 0;
    var show = function (v) { hint.classList.toggle('hidden', !v); };
    window.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault(); depth++; show(true);
    });
    window.addEventListener('dragover', function (e) { if (e.dataTransfer) { e.preventDefault(); } });
    window.addEventListener('dragleave', function (e) { depth = Math.max(0, depth - 1); if (!depth) show(false); });
    window.addEventListener('drop', function (e) {
      depth = 0; show(false);
      if (!e.dataTransfer) return;
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || !/^image\//.test(f.type || '')) { toast('请拖一张图片进来', 'warn'); return; }
      readImageFile(f, function (url) {
        if (!url) { toast('这张图读不出来', 'warn'); return; }
        showArt(url);
      });
    });
  }

  G.ui = {
    init: init, sync: sync, setHint: setHint, setValueSub: setValueSub,
    toast: toast, float: float, judge: judge, clearJudge: clearJudge,
    syncBubbles: syncBubbles, clearBubbles: clearBubbles,
    showIntro: showIntro, showFail: showFail, showWin: showWin,
    showLevels: showLevels, showCodex: showCodex, showVerify: showVerify,
    showArt: showArt, loadSavedArt: loadSavedArt, applyArt: applyArt,
    showElement: showElement, showSteps: showSteps,
    closeOverlay: closeOverlay, isOverlayOpen: isOverlayOpen,
    syncMute: syncMute, flashHit: flashHit, iconCanvas: iconCanvas, sampleEl: sampleEl
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
