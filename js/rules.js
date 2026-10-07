/* ─────────────────────────────────────────────────────────────
   rules.js —— 元素与运算规则（纯函数层，不碰 DOM / 渲染）
   ------------------------------------------------------------------
   元素类型：
     rice       大白饭       吃掉 -> x + value
     bowl_rice  铁盆大白饭   吃掉 -> x + value，并得到一个铁盆（最多 1 个）
     token      token        吃掉 -> x = 表达式(x)          「任意复杂运算」
     claude     Claude娘     吃掉 -> x * factor             「倍乘」
     user       用户         判断 cond(x)：真 -> x + bonus，假 -> x - penalty
     door       中转站门     x >= req 才可通过；通过后 x = op(x)，门消失变平地
     goal       终点门       x >= req 且 x > 0 判定通关
     hidden     隐藏通关格   达到 reveal 值后显形，踏入时按终点门规则判定
   ------------------------------------------------------------------
   所有元素都只描述"数据"，数值与表达式由关卡数据给出，可随时调节难度。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var E = G.expr;

  /* ── 元素元数据（图鉴 / 关卡介绍 / 渲染配色共用） ────────── */
  var TYPES = {
    rice: {
      key: 'rice', name: '大白饭', tag: '饭', color: '#f6f1e2', accent: '#c9c0a4',
      rule: '直接吃掉，数值加上饭的数值：<code>x + 数值</code>',
      intro: '大白饭是这个世界的基础食粮。吃掉它，你的数值就会增加。',
      example: 'x + 3'
    },
    bowl_rice: {
      key: 'bowl_rice', name: '铁盆大白饭', tag: '盆', color: '#cfd6e2', accent: '#8b95a8',
      rule: '等同于大白饭，额外获得一个<code>铁盆</code>，并改变大肥鱼形象。<br>铁盆可免疫一次失败：元素不消失、数值不变、大肥鱼被弹出，最多同时持有 1 个。',
      intro: '带铁盆的大白饭！吃掉它既能加数值，又能顶一个铁盆在头上。铁盆能替你挡一次致命失败。',
      example: 'x + 8 ，并获得铁盆'
    },
    token: {
      key: 'token', name: 'token', tag: 'T', color: '#ffce5c', accent: '#a97b16',
      rule: '任意复杂运算：把大肥鱼的数值<code>直接变成表达式的计算结果</code>。',
      intro: 'token 是一枚改写命运的硬币：它不听你现在的数值，直接把你的数值改写成表达式的结果。',
      example: 'x = (x + 4) * 2'
    },
    claude: {
      key: 'claude', name: 'Claude娘', tag: '×', color: '#d97757', accent: '#8c4630',
      rule: '倍乘运算：<code>x = x * 倍率</code>',
      intro: 'Claude 娘会把你整个数值乘上她的倍率——数值越大，她给你的越多。',
      example: 'x * 3'
    },
    user: {
      key: 'user', name: '用户', tag: '?', color: '#48e5a3', accent: '#1c7f5a',
      rule: '判断运算：条件为真 -> <code>x + 奖励</code>；条件为假 -> <code>x - 惩罚</code>',
      intro: '用户会检查你的数值是否满足条件。满足就奖励你，不满足就责备你、扣掉你的数值。',
      example: '若 x >= 20 则 +15，否则 -15'
    },
    door: {
      key: 'door', name: '中转站门', tag: '门', color: '#7aa9ff', accent: '#2b56b8',
      rule: '数值 <code>≥ 门槛</code> 才能通过；通过后门消失变成平地，且运算后数值一定减少。<br>三级：减法门、除法门、复杂运算门。数值不达标触碰即失败。',
      intro: '中转站门是房间之间的关卡。它有三个等级：减法门、除法门、复杂运算门。数值不达标就撞死在门上。',
      example: 'x >= 30 才能通过，通过后 x = x - 7'
    },
    goal: {
      key: 'goal', name: '终点门', tag: '终', color: '#ffb347', accent: '#b06a00',
      rule: '终点：数值 <code>≥ 门槛</code> 且 <code>数值 > 0</code> 即通关。数值不足则失败。',
      intro: '终点门。达到它的数值要求，走进去，这一关就通了。',
      example: 'x >= 门槛'
    },
    hidden: {
      key: 'hidden', name: '隐藏通关格', tag: '隐', color: '#a06bff', accent: '#5a2fb0',
      rule: '平时伪装成普通地板，当数值达到<code>显形值</code>后浮现。踏入并按终点门规则判定通关。',
      intro: '有些通关格藏在地板里，只有数值足够高时才会显形。别漏看脚下的路。',
      example: 'x >= 显形值 时浮现'
    }
  };

  var ORDER = ['rice', 'bowl_rice', 'token', 'claude', 'user', 'door', 'goal', 'hidden'];

  /* ── 工具 ─────────────────────────────────────────────── */
  function fnum(v) { return E.fmtNum(v); }

  /** 门 / 终点门的运算结果 */
  function doorValue(v, el) {
    var r;
    if (el.op === 'sub') {
      r = v - (typeof el.amount === 'number' ? el.amount : 0);
    } else if (el.op === 'div') {
      r = (el.divisor ? Math.floor(v / el.divisor) : NaN);
    } else if (el.op === 'mul') {
      r = v * (typeof el.factor === 'number' ? el.factor : 1);
    } else if (el.op === 'expr') {
      r = E.evaluate(el.expr, v);
    } else if (el.op === 'none' || el.op === undefined) {
      r = v;
    } else {
      return NaN;
    }
    return E.sanitize(r);
  }

  /** 门的运算式人类可读文本 */
  function doorFormula(el) {
    switch (el.op) {
      case 'sub': return 'x − ' + fnum(el.amount || 0);
      case 'div': return '⌊x ÷ ' + fnum(el.divisor || 1) + '⌋';
      case 'mul': return 'x × ' + fnum(el.factor || 1);
      case 'expr': return el.expr;
      default: return 'x';
    }
  }

  /** 门等级：1 减法 / 2 除法 / 3 复杂运算 */
  function doorTier(el) {
    if (el.op === 'sub') return 1;
    if (el.op === 'div') return 2;
    return 3;
  }
  function doorTierName(el) {
    var t = doorTier(el);
    return t === 1 ? '减法门' : t === 2 ? '除法门' : '复杂运算门';
  }

  /** 元素效果预览文本（用于图鉴 / 悬停气泡 / 判定弹窗） */
  function describe(el) {
    switch (el.type) {
      case 'rice': return '吃掉 +' + fnum(el.value) + '　(x + ' + fnum(el.value) + ')';
      case 'bowl_rice': return '吃掉 +' + fnum(el.value) + '，并获得铁盆　(x + ' + fnum(el.value) + ')';
      case 'token': return 'x = ' + el.expr;
      case 'claude': return 'x = x × ' + fnum(el.factor);
      case 'user': {
        var pen = (typeof el.penalty === 'number') ? el.penalty : el.bonus;
        return '若 (' + el.cond + ') 则 +' + fnum(el.bonus) + '，否则 −' + fnum(pen);
      }
      case 'door': return doorTierName(el) + '　需 x ≥ ' + fnum(el.req) + '　通过后 x = ' + doorFormula(el);
      case 'goal': return '终点门　需 x ≥ ' + fnum(el.req) + (el.op && el.op !== 'none' ? '　通过后 x = ' + doorFormula(el) : '');
      case 'hidden': return '隐藏通关格　x ≥ ' + fnum(el.reveal) + ' 显形，需 x ≥ ' + fnum(el.req);
      default: return '';
    }
  }

  /** 元素在图鉴里展示的"表达式"（用于自适应气泡宽度） */
  function formula(el) {
    switch (el.type) {
      case 'rice': return 'x + ' + fnum(el.value);
      case 'bowl_rice': return 'x + ' + fnum(el.value) + '  +🥣';
      case 'token': return 'x = ' + el.expr;
      case 'claude': return 'x × ' + fnum(el.factor);
      case 'user': return '(' + el.cond + ') ? x+' + fnum(el.bonus) + ' : x−' + fnum(typeof el.penalty === 'number' ? el.penalty : el.bonus);
      case 'door': return doorFormula(el) + '　≥' + fnum(el.req);
      case 'goal': return '≥' + fnum(el.req);
      case 'hidden': return '≥' + fnum(el.req) + ' (显形 ' + fnum(el.reveal) + ')';
      default: return '';
    }
  }

  /* ── 核心：把一个元素作用到当前状态上 ─────────────────────
     state: {value, bowl, has(type)}
     返回：
       { kind, consume, value, bowl, win, fatal, gainBowl, detail }
     fatal=true 表示触发失败判定（是否被铁盆抵消由 engine 决定）
     ─────────────────────────────────────────────────────── */
  function apply(state, el) {
    var v = state.value, bowl = !!state.bowl;
    switch (el.type) {

      case 'rice': {
        var nv = E.sanitize(v + el.value);
        return res('rice', nv, bowl, false, {
          title: '吃掉大白饭', delta: E.sanitize(nv - v),
          formula: el.value >= 0 ? ('x + ' + fnum(el.value)) : ('x − ' + fnum(-el.value))
        });
      }

      case 'bowl_rice': {
        var nv2 = E.sanitize(v + el.value);
        return res('bowl_rice', nv2, true, false, {
          title: '吃掉铁盆大白饭', delta: E.sanitize(nv2 - v), gainBowl: !bowl,
          formula: 'x + ' + fnum(el.value) + '　+🥣'
        });
      }

      case 'token': {
        var tv = E.evaluate(el.expr, v);
        if (!isFinite(tv)) {
          return { kind: 'token', consume: false, value: v, bowl: bowl, win: false, fatal: false, error: '表达式无法求值',
            detail: { title: 'token 没有响应', formula: String(el.expr) } };
        }
        return res('token', tv, bowl, false, {
          title: 'token 改写', from: v, to: tv, delta: E.sanitize(tv - v),
          formula: 'x = ' + el.expr
        });
      }

      case 'claude': {
        var cv = E.sanitize(v * el.factor);
        return res('claude', cv, bowl, false, {
          title: 'Claude娘 倍乘', from: v, to: cv, factor: el.factor,
          formula: 'x × ' + fnum(el.factor)
        });
      }

      case 'user': {
        var condVal = E.evaluate(el.cond, v);
        var pen = (typeof el.penalty === 'number') ? el.penalty : el.bonus;
        var truthy = (condVal > 0);
        var uv = E.sanitize(truthy ? v + el.bonus : v - pen);
        return res(truthy ? 'user-ok' : 'user-bad', uv, bowl, false, {
          title: truthy ? '用户满意了' : '用户开始责备',
          truthy: truthy, cond: el.cond, condValue: condVal,
          delta: E.sanitize(uv - v), bonus: el.bonus, penalty: pen,
          formula: '(' + el.cond + ') → ' + (truthy ? '+' + fnum(el.bonus) : '−' + fnum(pen))
        });
      }

      case 'door': {
        if (!(v >= el.req)) {
          return fail('door', el, {
            title: doorTierName(el) + ' 拒绝放行',
            reason: '数值不足',
            need: el.req, have: v,
            formula: '需要 x ≥ ' + fnum(el.req) + '，当前 x = ' + fnum(v)
          });
        }
        var dv = doorValue(v, el);
        if (!isFinite(dv)) {
          return { kind: 'door', consume: true, value: v, bowl: bowl, win: false, fatal: false, error: '门的表达式无法求值',
            detail: { title: '门出现了故障', formula: String(el.expr) } };
        }
        return res('door', dv, bowl, false, {
          title: doorTierName(el) + ' 开启',
          from: v, to: dv, delta: E.sanitize(dv - v), tier: doorTier(el),
          formula: 'x ≥ ' + fnum(el.req) + ' ✔　x → ' + doorFormula(el)
        });
      }

      case 'goal': {
        if (!(v >= el.req)) {
          return fail('goal', el, {
            title: '终点门判定失败',
            reason: '数值不足',
            need: el.req, have: v,
            formula: '需要 x ≥ ' + fnum(el.req) + '，当前 x = ' + fnum(v)
          });
        }
        if (!(v > 0)) {
          return fail('goal', el, {
            title: '终点门判定失败', reason: '数值不大于 0', need: 1, have: v,
            formula: '需要 x > 0，当前 x = ' + fnum(v)
          });
        }
        var gv = (el.op && el.op !== 'none') ? doorValue(v, el) : v;
        return {
          kind: 'goal', consume: true, value: E.sanitize(gv), bowl: bowl,
          win: true, fatal: false,
          detail: { title: '通关！', from: v, to: E.sanitize(gv), formula: 'x ≥ ' + fnum(el.req) + ' ✔' }
        };
      }

      case 'hidden': {
        if (!(v >= el.reveal)) {
          return { kind: 'hidden', consume: false, value: v, bowl: bowl, win: false, fatal: false,
            detail: { title: '好像踩到了什么', formula: '这里似乎需要 ' + fnum(el.reveal) + ' 才能显形' } };
        }
        if (!(v >= el.req)) {
          return fail('hidden', el, {
            title: '隐藏通关格判定失败', reason: '数值不足', need: el.req, have: v,
            formula: '需要 x ≥ ' + fnum(el.req) + '，当前 x = ' + fnum(v)
          });
        }
        return {
          kind: 'hidden', consume: true, value: v, bowl: bowl, win: true, fatal: false,
          detail: { title: '隐藏通关格！', from: v, to: v, formula: 'x ≥ ' + fnum(el.req) + ' ✔' }
        };
      }
    }
    return { kind: 'none', consume: false, value: v, bowl: bowl, win: false, fatal: false, detail: {} };
  }

  function res(kind, value, bowl, win, detail) {
    return { kind: kind, consume: true, value: value, bowl: bowl, win: !!win, fatal: false, detail: detail || {} };
  }
  function fail(kind, el, detail) {
    return {
      kind: kind, consume: false, value: null, bowl: false,
      win: false, fatal: true, element: el, detail: detail || {}
    };
  }

  /** 铁盆免疫：元素不消失、数值不变、弹出碰撞范围 */
  function bowlBlock(state, el) {
    return {
      kind: 'bowl-block', consume: false, value: state.value, bowl: false,
      win: false, fatal: false, knocked: true,
      detail: {
        title: '铁盆碎了！',
        text: '铁盆替你挡下了这次失败：数值不变，' + (TYPES[el.type] ? TYPES[el.type].name : '元素') + '还在原地。',
        formula: '免疫一次失败',
        blockTarget: el
      }
    };
  }

  /* ── 校验单个元素定义（关卡自检用） ───────────────────── */
  function checkElement(el) {
    var errs = [];
    if (!el || !el.type) { errs.push('元素缺少 type'); return errs; }
    if (!TYPES[el.type]) { errs.push('未知元素类型：' + el.type); return errs; }
    var num = function (k, min) {
      if (typeof el[k] !== 'number' || !isFinite(el[k])) errs.push(el.type + ' 缺少数值字段 ' + k);
      else if (min !== undefined && el[k] < min) errs.push(el.type + '.' + k + ' 必须 ≥ ' + min + '（当前 ' + el[k] + '）');
    };
    switch (el.type) {
      case 'rice': case 'bowl_rice':
        num('value');
        if (typeof el.value === 'number' && el.value <= 0) errs.push('大白饭数值必须 > 0（否则吃掉必然失败）');
        break;
      case 'token': {
        if (typeof el.expr !== 'string' || !el.expr.trim()) { errs.push('token 缺少表达式 expr'); break; }
        var c = E.check(el.expr);
        if (!c.ok) errs.push('token 表达式非法：' + c.error);
        else if (!E.usesX(el.expr)) errs.push('token 表达式未引用变量 x：' + el.expr);
        break;
      }
      case 'claude':
        num('factor');
        if (el.factor <= 0) errs.push('Claude娘 倍率必须 > 0');
        break;
      case 'user': {
        if (typeof el.cond !== 'string' || !el.cond.trim()) { errs.push('用户缺少判断表达式 cond'); break; }
        var cc = E.check(el.cond);
        if (!cc.ok) errs.push('用户判断表达式非法：' + cc.error);
        num('bonus');
        if (typeof el.penalty === 'number' && el.penalty < 0) errs.push('用户惩罚值不能为负');
        break;
      }
      case 'door': {
        num('req', 0);
        if (el.op === 'sub') num('amount', 1);
        else if (el.op === 'div') { num('divisor', 2); }
        else if (el.op === 'expr') {
          if (typeof el.expr !== 'string' || !el.expr.trim()) errs.push('复杂运算门缺少表达式');
          else { var ce = E.check(el.expr); if (!ce.ok) errs.push('门表达式非法：' + ce.error); }
        } else if (el.op !== 'mul') errs.push('门的 op 只能是 sub / div / expr（当前 ' + el.op + '）');
        if (el.op === 'mul') num('factor', 0.0001);
        break;
      }
      case 'goal': {
        num('req', 0);
        if (el.op === 'sub') num('amount', 0);
        else if (el.op === 'div') num('divisor', 2);
        else if (el.op === 'expr') { var cg = E.check(el.expr); if (!cg.ok) errs.push('终点门表达式非法：' + cg.error); }
        break;
      }
      case 'hidden':
        num('req', 0); num('reveal', 0);
        if (el.reveal < el.req) errs.push('hidden.reveal 应 ≥ req');
        break;
    }
    return errs;
  }

  /** 门的运算是否"一定减少"：在采样区间里检查 f(x) < x */
  function checkDoorDecreasing(el, lo, hi) {
    var bad = [];
    var samples = [];
    var step = Math.max(1, Math.floor((hi - lo) / 400));
    for (var v = lo; v <= hi; v += step) samples.push(v);
    samples.push(hi);
    for (var i = 0; i < samples.length; i++) {
      var x = samples[i];
      if (x < el.req) continue;
      var y = doorValue(x, el);
      if (!isFinite(y)) { bad.push({ x: x, y: y, why: '结果非有限值' }); continue; }
      if (!(y < x)) bad.push({ x: x, y: y, why: '未减少' });
    }
    return bad;
  }

  /** 一扇门的「物理下限」：能让这扇门成立的最小数值。
      门有两条硬规则：① 过完一定减少；② 过门不能把自己算死（结果 > 0）。
      返回满足这两条的最小 x —— 也就是这扇门的极限数值。
      用途：不在最优解路线上的门（没有"到达值"可反推）用这个兜底，
      否则门槛会退化成 0，变成"随便什么数值都能过、过完就死"的陷阱门。 */
  function doorFloor(el, hi) {
    hi = hi || 40000;
    function okFrom(x0) {
      var step = Math.max(1, Math.floor((hi - x0) / 240));
      for (var v = x0; v <= hi; v += step) {
        var y = doorValue(v, el);
        if (!(isFinite(y) && y < v && y > 0)) return false;
      }
      return true;
    }
    for (var x = 1; x <= 400; x++) if (okFrom(x)) return x;
    return 400;
  }

  G.rules = {
    TYPES: TYPES,
    ORDER: ORDER,
    apply: apply,
    bowlBlock: bowlBlock,
    doorValue: doorValue,
    doorFormula: doorFormula,
    doorTier: doorTier,
    doorTierName: doorTierName,
    doorFloor: doorFloor,
    describe: describe,
    formula: formula,
    checkElement: checkElement,
    checkDoorDecreasing: checkDoorDecreasing,
    isDoorType: function (t) { return t === 'door' || t === 'goal' || t === 'hidden'; }
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
