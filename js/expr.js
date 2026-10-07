/* ─────────────────────────────────────────────────────────────
   expr.js —— 安全表达式引擎（不使用 eval / new Function）
   ------------------------------------------------------------------
   支持：
     · 变量 x（大肥鱼当前数值）、常量 pi / e / true / false
     · 运算 + - * / % ** （除法为向下取整的整数除法）
     · 比较 == != < <= > >=    逻辑 && || !       一元 - + !
     · 函数 min max abs floor ceil round sqrt sign pow clamp
            div mod gcd lcm digitSum digitCount reverseNum sumDigits
            if(cond,a,b)  clamp(x,lo,hi)
   ------------------------------------------------------------------
   所有结果都会经过 sanitize()：非有限值 -> NaN；四舍五入到 3 位小数；
   绝对值上限 1e12。
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var MAX_ABS = 1e12;
  var cache = Object.create(null);

  /* ── 内置函数表 ───────────────────────────────────────── */
  var FUNCS = {
    min: function () { return Math.min.apply(null, arguments); },
    max: function () { return Math.max.apply(null, arguments); },
    abs: function (a) { return Math.abs(a); },
    floor: function (a) { return Math.floor(a); },
    ceil: function (a) { return Math.ceil(a); },
    round: function (a, d) { var m = Math.pow(10, d || 0); return Math.round(a * m) / m; },
    sqrt: function (a) { return a < 0 ? NaN : Math.sqrt(a); },
    sign: function (a) { return a > 0 ? 1 : (a < 0 ? -1 : 0); },
    pow: function (a, b) { return Math.pow(a, b); },
    clamp: function (a, lo, hi) { return Math.min(Math.max(a, lo), hi); },
    /* 整除（向下取整） */
    div: function (a, b) { return b === 0 ? NaN : Math.floor(a / b); },
    /* 取模（结果符号跟随除数，永远非负） */
    mod: function (a, b) { return b === 0 ? NaN : a - Math.floor(a / b) * b; },
    gcd: function (a, b) {
      a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b));
      while (b) { var t = a % b; a = b; b = t; }
      return a;
    },
    lcm: function (a, b) {
      if (a === 0 || b === 0) return 0;
      var g = FUNCS.gcd(a, b);
      return Math.abs(a * b) / g;
    },
    /* 十进制数位和：digitSum(123) = 6 */
    digitSum: function (a) {
      return String(Math.abs(Math.trunc(a))).split('')
        .reduce(function (s, c) { return s + (c >= '0' && c <= '9' ? +c : 0); }, 0);
    },
    digitCount: function (a) { return String(Math.abs(Math.trunc(a))).length; },
    /* 数位反转：reverseNum(123) = 321 */
    reverseNum: function (a) {
      var s = String(Math.abs(Math.trunc(a))).split('').reverse().join('');
      var v = parseInt(s, 10);
      if (!isFinite(v)) return 0;
      return a < 0 ? -v : v;
    },
    /* 各位数字之和的别名，便于关卡里写自然语言式子 */
    sumDigits: function (a) { return FUNCS.digitSum(a); },
    if: function (c, a, b) { return c > 0 ? a : b; }
  };

  var CONSTS = { pi: Math.PI, e: Math.E, true: 1, false: 0, yes: 1, no: 0 };

  /* ── 词法分析 ─────────────────────────────────────────── */
  var TOKEN_RE = /\s*([A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|<=|>=|==|!=|&&|\|\||\*\*|[-+*/%()<>,!])/y;

  function tokenize(src) {
    var out = [], i = 0, m;
    TOKEN_RE.lastIndex = 0;
    while (i < src.length) {
      TOKEN_RE.lastIndex = i;
      m = TOKEN_RE.exec(src);
      if (!m || m.index !== i) {
        var bad = src.slice(i).trim();
        throw new Error('无法识别的字符：' + (bad.charAt(0) || '?'));
      }
      out.push(m[1]);
      i = TOKEN_RE.lastIndex;
    }
    return out;
  }

  /* ── 语法分析（递归下降） ─────────────────────────────────
     产出 AST：['num',v] ['var',name] ['bin',op,a,b] ['un',op,a] ['call',name,args]
     ─────────────────────────────────────────────────────── */
  function parse(src) {
    if (typeof src !== 'string') throw new Error('表达式必须是字符串');
    var key = src;
    if (cache[key]) {
      if (cache[key].error) throw new Error(cache[key].error);
      return cache[key].ast;
    }
    try {
      var ast = parseUncached(src);
      cache[key] = { ast: ast };
      return ast;
    } catch (e) {
      cache[key] = { error: e.message };
      throw e;
    }
  }

  function parseUncached(src) {
    var toks = tokenize(src), p = 0;

    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function eat(t) {
      if (toks[p] !== t) throw new Error('期望 “' + t + '”，实际 “' + (toks[p] === undefined ? '表达式结束' : toks[p]) + '”');
      return toks[p++];
    }
    function isOp(t) {
      var c = toks[p];
      return c === t;
    }

    function parseExpr() { return parseOr(); }

    function parseOr() {
      var a = parseAnd();
      while (isOp('||')) { next(); a = ['bin', '||', a, parseAnd()]; }
      return a;
    }
    function parseAnd() {
      var a = parseCmp();
      while (isOp('&&')) { next(); a = ['bin', '&&', a, parseCmp()]; }
      return a;
    }
    function parseCmp() {
      var a = parseAdd();
      while (isOp('==') || isOp('!=') || isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) {
        var op = next();
        a = ['bin', op, a, parseAdd()];
      }
      return a;
    }
    function parseAdd() {
      var a = parseMul();
      while (isOp('+') || isOp('-')) { var op = next(); a = ['bin', op, a, parseMul()]; }
      return a;
    }
    function parseMul() {
      var a = parseUnary();
      while (isOp('*') || isOp('/') || isOp('%')) { var op = next(); a = ['bin', op, a, parseUnary()]; }
      return a;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return ['un', '-', parseUnary()]; }
      if (isOp('+')) { next(); return parseUnary(); }
      if (isOp('!')) { next(); return ['un', '!', parseUnary()]; }
      return parsePow();
    }
    function parsePow() {
      var base = parsePrimary();
      if (isOp('**')) { next(); return ['bin', '**', base, parseUnary()]; }
      return base;
    }
    function parsePrimary() {
      var t = next();
      if (t === undefined) throw new Error('表达式意外结束');
      if (/^\d/.test(t)) return ['num', parseFloat(t)];
      if (t === '(') {
        var inner = parseExpr();
        eat(')');
        return inner;
      }
      if (/^[A-Za-z_]/.test(t)) {
        if (isOp('(')) {
          next();
          var args = [];
          if (!isOp(')')) {
            args.push(parseExpr());
            while (isOp(',')) { next(); args.push(parseExpr()); }
          }
          eat(')');
          if (!FUNCS[t]) throw new Error('未知函数：' + t + '()');
          return ['call', t, args];
        }
        return ['var', t];
      }
      throw new Error('意外的符号：“' + t + '”');
    }

    var ast = parseExpr();
    if (p < toks.length) throw new Error('表达式尾部多余内容：“' + toks.slice(p).join(' ') + '”');
    return ast;
  }

  /* ── 求值 ─────────────────────────────────────────────── */
  function evalAST(node, scope) {
    switch (node[0]) {
      case 'num': return node[1];
      case 'var': {
        var n = node[1];
        if (scope && Object.prototype.hasOwnProperty.call(scope, n)) return scope[n];
        if (Object.prototype.hasOwnProperty.call(CONSTS, n)) return CONSTS[n];
        throw new Error('未知变量：' + n);
      }
      case 'un': {
        var v = evalAST(node[2], scope);
        if (node[1] === '-') return -v;
        if (node[1] === '!') return v ? 0 : 1;
        return v;
      }
      case 'bin': {
        var op = node[1];
        /* 短路 */
        if (op === '&&') { var la = evalAST(node[2], scope); return (la ? (evalAST(node[3], scope) ? 1 : 0) : 0); }
        if (op === '||') { var lo = evalAST(node[2], scope); return (lo ? 1 : (evalAST(node[3], scope) ? 1 : 0)); }
        var a = evalAST(node[2], scope), b = evalAST(node[3], scope);
        switch (op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? NaN : Math.floor(a / b);   /* 整数除法，向下取整 */
          case '%': return b === 0 ? NaN : a - Math.floor(a / b) * b;
          case '**': return Math.pow(a, b);
          case '==': return a === b ? 1 : 0;
          case '!=': return a !== b ? 1 : 0;
          case '<': return a < b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
        }
        throw new Error('未知运算符：' + op);
      }
      case 'call': {
        var fn = FUNCS[node[1]];
        var args = node[2].map(function (a) { return evalAST(a, scope); });
        return fn.apply(null, args);
      }
    }
    throw new Error('非法语法树节点');
  }

  /* ── 数值净化：整数化到 3 位小数，钳制上下限 ─────────────── */
  function sanitize(v) {
    if (typeof v !== 'number' || !isFinite(v)) return NaN;
    var r = Math.round(v * 1000) / 1000;
    if (r > MAX_ABS) r = MAX_ABS;
    if (r < -MAX_ABS) r = -MAX_ABS;
    return r;
  }

  /* 求值入口：失败返回 NaN */
  function evaluate(src, x, extraScope) {
    var ast;
    try { ast = parse(src); } catch (e) { return NaN; }
    var scope = { x: x };
    if (extraScope) for (var k in extraScope) scope[k] = extraScope[k];
    var v;
    try { v = evalAST(ast, scope); } catch (e) { return NaN; }
    return sanitize(v);
  }

  /* 语法自检：给校验器用 */
  function check(src) {
    try {
      var ast = parse(src);
      /* 用若干取样值试算，确保不会运行时抛错（例如除零之外的未知变量） */
      var samples = [1, 7, 42, 1000];
      for (var i = 0; i < samples.length; i++) {
        try { evalAST(ast, { x: samples[i] }); }
        catch (e) { return { ok: false, error: e.message }; }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* 是否引用了变量 x */
  function usesX(src) {
    try {
      var found = false;
      (function walk(n) {
        if (!n || found) return;
        if (n[0] === 'var' && n[1] === 'x') { found = true; return; }
        if (n[0] === 'bin') { walk(n[2]); walk(n[3]); }
        else if (n[0] === 'un') { walk(n[2]); }
        else if (n[0] === 'call') { n[2].forEach(walk); }
      })(parse(src));
      return found;
    } catch (e) { return false; }
  }

  /* 数字显示：整数直接显示，小数最多 3 位且去掉尾随 0 */
  function fmtNum(v) {
    if (!isFinite(v)) return '∞';
    if (Number.isInteger(v)) return String(v);
    var s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  G.expr = {
    FUNCS: FUNCS,
    CONSTS: CONSTS,
    MAX_ABS: MAX_ABS,
    parse: parse,
    evaluate: evaluate,
    evalAST: evalAST,
    check: check,
    usesX: usesX,
    sanitize: sanitize,
    fmtNum: fmtNum,
    /* 内置函数清单，给图鉴/说明用 */
    funcList: Object.keys(FUNCS)
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
