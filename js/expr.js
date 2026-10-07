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
    if: function (c, a, b) { return c > 0 ? a : b; },

    /* ── 下面这批是这一版新加的"创新运算"，专门给复杂门/复杂条件用 ── */

    /* 抹零：chunk(1234, 100) = 1200 —— 抹掉零头，做成"越接近整百越不亏"的门 */
    chunk: function (a, n) { n = Math.abs(n) || 1; return a - (a - Math.floor(a / n) * n); },
    /* 向上取整除法：ceilDiv(17, 5) = 4 */
    ceilDiv: function (a, b) { return b === 0 ? NaN : Math.ceil(a / b); },
    /* 第 i 位数字（从右往左，i 从 0 开始）：digitAt(90210, 2) = 2 */
    digitAt: function (a, i) {
      var s = String(Math.abs(Math.trunc(a)));
      i = Math.trunc(i || 0);
      if (i < 0 || i >= s.length) return 0;
      return +s.charAt(s.length - 1 - i);
    },
    /* 最高位数字：headDigit(90210) = 9 */
    headDigit: function (a) { return FUNCS.digitAt(a, String(Math.abs(Math.trunc(a))).length - 1); },
    /* 等差数列求和：sumRange(3, 7) = 3+4+5+6+7 = 25 */
    sumRange: function (a, b) {
      a = Math.trunc(a); b = Math.trunc(b);
      if (b < a) { var t = a; a = b; b = t; }
      var n = b - a + 1;
      return n * (a + b) / 2;
    },
    /* 三角数：tri(6) = 21 */
    tri: function (n) { n = Math.trunc(n); return n * (n + 1) / 2; },
    /* 斐波那契（第 n 项，n 从 0 开始，封顶 78 项防止爆掉） */
    fib: function (n) {
      n = Math.trunc(n);
      if (n < 0) return 0;
      if (n > 78) return Infinity;
      var a = 0, b = 1, i;
      for (i = 0; i < n; i++) { var c = a + b; a = b; b = c; }
      return a;
    },
    /* 质数判定：isPrime(97) = 1 */
    isPrime: function (n) {
      n = Math.trunc(n);
      if (n < 2) return 0;
      if (n % 2 === 0) return n === 2 ? 1 : 0;
      for (var d = 3; d * d <= n; d += 2) if (n % d === 0) return 0;
      return 1;
    },
    /* 第 k 个质数：nthPrime(1) = 2, nthPrime(10) = 29 */
    nthPrime: function (k) {
      k = Math.trunc(k);
      if (k < 1) return 0;
      if (k > 2000) return Infinity;
      var found = 0, n = 1;
      while (found < k) { n++; if (FUNCS.isPrime(n)) found++; }
      return n;
    },
    /* 二进制里 1 的个数：popcount(23) = 4 */
    popcount: function (n) {
      n = Math.abs(Math.trunc(n)); var c = 0;
      while (n) { c += n & 1; n >>= 1; }
      return c;
    },
    /* 二进制位数：bitLen(23) = 5 */
    bitLen: function (n) { return n === 0 ? 1 : String(Math.abs(Math.trunc(n)).toString(2)).length; },
    /* 位运算（关卡里做"异或门"用） */
    xor: function (a, b) { return (Math.trunc(a) ^ Math.trunc(b)); },
    band: function (a, b) { return (Math.trunc(a) & Math.trunc(b)); },
    bor: function (a, b) { return (Math.trunc(a) | Math.trunc(b)); },
    /* Collatz 一步：偶数减半、奇数变 3x+1 —— 最容易做出"忽大忽小"的门 */
    collatz: function (n) { n = Math.trunc(n); return (n % 2 === 0) ? n / 2 : n * 3 + 1; },
    /* 三数取中：median(9, 3, 5) = 5 */
    median: function (a, b, c) { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); },
    /* 变参平均：avg(3, 7, 11) = 7 */
    avg: function () {
      if (!arguments.length) return NaN;
      var s = 0;
      for (var i = 0; i < arguments.length; i++) s += arguments[i];
      return s / arguments.length;
    },
    /* 按步长吸附：snap(107, 25) = 100（就近取整到步长的倍数） */
    snap: function (a, n) { n = Math.abs(n) || 1; return Math.round(a / n) * n; },
    /* 折返：fold(x, n) 让 x 在 [0, n] 之间来回折 —— 天然满足"一定减少"的门 */
    fold: function (a, n) {
      n = Math.abs(n) || 1;
      var m = a - Math.floor(a / (2 * n)) * (2 * n);
      return m <= n ? m : 2 * n - m;
    }
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

  /* 这条表达式用到了哪些函数（给"新算法必须先介绍"的校验器用） */
  function funcsUsed(src) {
    var out = {};
    try {
      (function walk(n) {
        if (!n) return;
        if (n[0] === 'call') { out[n[1]] = true; n[2].forEach(walk); }
        else if (n[0] === 'bin') { walk(n[2]); walk(n[3]); }
        else if (n[0] === 'un') { walk(n[2]); }
      })(parse(src));
    } catch (e) { return null; }
    return out;
  }

  /* ── 逐步求值：把每个子表达式算出来的结果都记下来 ───────────
     给"显示每一步运算结果"用（元素生效之后才展示，不做提前剧透）。
     返回 { value, steps:[{ text, value }] }，解析失败返回 null。
     ─────────────────────────────────────────────────────── */
  function trace(src, x) {
    var ast;
    try { ast = parse(src); } catch (e) { return null; }
    var steps = [];
    function binop(op, a, b) {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? NaN : Math.floor(a / b);
        case '%': return b === 0 ? NaN : a - Math.floor(a / b) * b;
        case '**': return Math.pow(a, b);
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
      }
      return NaN;
    }
    function ev(n) {
      if (!n) return NaN;
      if (n[0] === 'num') return n[1];
      if (n[0] === 'var') {
        if (Object.prototype.hasOwnProperty.call(CONSTS, n[1])) return CONSTS[n[1]];
        return x;
      }
      if (n[0] === 'un') {
        var a = ev(n[2]);
        var v = n[1] === '-' ? -a : (a ? 0 : 1);
        steps.push({ text: n[1] + fmtNum(a), value: v });
        return v;
      }
      if (n[0] === 'call') {
        var args = n[2].map(ev);
        var f = FUNCS[n[1]];
        var v2 = sanitize(f ? f.apply(null, args) : NaN);
        steps.push({ text: n[1] + '(' + args.map(fmtNum).join(', ') + ')', value: v2 });
        return v2;
      }
      if (n[0] === 'bin') {
        var l = ev(n[2]);
        if (n[1] === '&&' && !l) { steps.push({ text: '左边为假 → 整体为假（不再算右边）', value: 0 }); return 0; }
        if (n[1] === '||' && l) { steps.push({ text: '左边为真 → 整体为真（不再算右边）', value: 1 }); return 1; }
        var r = ev(n[3]);
        /* 逻辑运算单独处理：结果为真/假（1/0），不能落到算术的 binop 里 */
        if (n[1] === '&&' || n[1] === '||') {
          var w = (n[1] === '&&' ? (l && r) : (l || r)) ? 1 : 0;
          steps.push({ text: (l ? '真' : '假') + ' ' + n[1] + ' ' + (r ? '真' : '假'), value: w });
          return w;
        }
        var vv = sanitize(binop(n[1], l, r));
        steps.push({ text: fmtNum(l) + ' ' + n[1] + ' ' + fmtNum(r), value: vv });
        return vv;
      }
      return NaN;
    }
    var out = sanitize(ev(ast));
    return { value: out, steps: steps };
  }

  /* ── 函数原理表：长按元素查看公式时，顺带把用到的函数讲清楚 ──
     每条一句话原理 + 一个例子（例子都可以口算验证）。
     ─────────────────────────────────────────────────────── */
  var FUNC_HELP = {
    min: { t: '取最小值', eg: 'min(12, 7) = 7', d: '可以接多个参数，谁小取谁' },
    max: { t: '取最大值', eg: 'max(12, 7) = 12', d: '谁大取谁' },
    abs: { t: '绝对值', eg: 'abs(0 - 9) = 9', d: '去掉正负号，只看离 0 多远' },
    floor: { t: '向下取整', eg: 'floor(17 / 5) = 3', d: '抹掉小数部分（不是四舍五入）' },
    ceil: { t: '向上取整', eg: 'ceil(17 / 5) = 4', d: '有小数就进一位' },
    round: { t: '四舍五入', eg: 'round(2.6) = 3', d: '可加第二个参数表示保留几位小数' },
    sqrt: { t: '平方根', eg: 'sqrt(144) = 12', d: '负数开方无意义' },
    sign: { t: '取符号', eg: 'sign(0 - 8) = -1', d: '正数返回 1，负数返回 -1，0 返回 0' },
    pow: { t: '乘方', eg: 'pow(3, 4) = 81', d: 'pow(a,b) 就是 a 的 b 次方' },
    clamp: { t: '夹在区间里', eg: 'clamp(250, 0, 100) = 100', d: 'clamp(x, 下限, 上限)：超出上限压到上限，低于下限抬到下限' },
    div: { t: '整除', eg: 'div(17, 5) = 3', d: '除完向下取整，丢掉余数' },
    mod: { t: '取余数', eg: 'mod(17, 5) = 2', d: '余数永远非负：mod(-1, 5) = 4（不是 -1）' },
    gcd: { t: '最大公约数', eg: 'gcd(72, 36) = 36', d: '能同时整除两个数的最大整数' },
    lcm: { t: '最小公倍数', eg: 'lcm(4, 6) = 12', d: '能同时被两个数整除的最小整数' },
    digitSum: { t: '各位数字之和', eg: 'digitSum(90210) = 12', d: '把每一位拆开相加：9+0+2+1+0' },
    sumDigits: { t: '各位数字之和（别名）', eg: 'sumDigits(47) = 11', d: '和 digitSum 完全一样' },
    digitCount: { t: '数字的位数', eg: 'digitCount(90210) = 5', d: '不看数值大小，只看有几个数字' },
    reverseNum: { t: '数位反转', eg: 'reverseNum(123) = 321', d: '把数字倒过来写；末尾的 0 会消失（120 → 21）' },
    if: { t: '条件取值', eg: 'if(x > 50, 1, 2)', d: 'if(条件, 条件成立取这个, 否则取那个) —— 表达式里没有 ? : 三目写法' },

    chunk: { t: '抹零', eg: 'chunk(1234, 100) = 1200', d: '抹掉不足 n 的零头（往下抹）' },
    snap: { t: '就近吸附', eg: 'snap(107, 25) = 100', d: '离哪个 n 的倍数近就取哪个（可上可下）：107 离 100 更近' },
    ceilDiv: { t: '向上取整除法', eg: 'ceilDiv(17, 5) = 4', d: '除完有余数就进位' },
    digitAt: { t: '取第 i 位数字', eg: 'digitAt(90210, 2) = 2', d: '从右往左数，i 从 0 开始；越界返回 0' },
    headDigit: { t: '取最高位数字', eg: 'headDigit(90210) = 9', d: '最左边那一位，和数值大小无关' },
    sumRange: { t: '等差数列求和', eg: 'sumRange(3, 7) = 25', d: '3+4+5+6+7；端点可以对调' },
    tri: { t: '三角数', eg: 'tri(6) = 21', d: '1+2+…+n，也就是 n×(n+1)÷2' },
    median: { t: '三数取中', eg: 'median(9, 3, 5) = 5', d: '三个数里排在中间的那个' },
    avg: { t: '平均值', eg: 'avg(3, 7, 11) = 7', d: '可以接任意多个参数' },
    fold: { t: '折返', eg: 'fold(31, 10) = 9', d: '让数值在 0~n 之间来回折：31 折过头再折回来落在 9' },
    collatz: { t: 'Collatz 一步', eg: 'collatz(7) = 22', d: '偶数减半，奇数变成 3x+1 —— 最容易做出忽大忽小的效果' },
    popcount: { t: '二进制里 1 的个数', eg: 'popcount(23) = 4', d: '23 写成二进制是 10111，有 4 个 1' },
    bitLen: { t: '二进制位数', eg: 'bitLen(23) = 5', d: '23 的二进制 10111 占 5 位' },
    isPrime: { t: '是不是质数', eg: 'isPrime(97) = 1', d: '是质数返回 1，否则 0' },
    nthPrime: { t: '第 k 个质数', eg: 'nthPrime(10) = 29', d: '质数从 2 数起：第 10 个是 29' },
    xor: { t: '按位异或', eg: 'xor(12, 10) = 6', d: '两个二进制位不同取 1、相同取 0' },
    band: { t: '按位与', eg: 'band(12, 10) = 8', d: '两个位都是 1 才是 1' },
    bor: { t: '按位或', eg: 'bor(12, 10) = 14', d: '只要有一个是 1 就是 1' },
    fib: { t: '斐波那契', eg: 'fib(12) = 144', d: '数列 0,1,1,2,3,5,8… 第 n 项，n 从 0 开始数' }
  };

  /* 运算符原理：有些式子（例如条件判断）一个函数都没有，但运算符本身也要讲 */
  var OP_HELP = {
    '+': { t: '加法', eg: '3 + 4 = 7' },
    '-': { t: '减法', eg: '9 - 4 = 5' },
    '*': { t: '乘法', eg: '6 * 7 = 42' },
    '/': { t: '整除（向下取整）', eg: '17 / 5 = 3', d: '注意不是普通除法：小数部分直接丢掉' },
    '%': { t: '取余数', eg: '17 % 5 = 2', d: '余数永远非负：-1 % 5 = 4' },
    '**': { t: '乘方', eg: '3 ** 4 = 81' },
    '==': { t: '等于判断', eg: '3 == 3 得 1', d: '成立得 1，不成立得 0' },
    '!=': { t: '不等于判断', eg: '3 != 4 得 1', d: '成立得 1，不成立得 0' },
    '<': { t: '小于', eg: '3 < 4 得 1' },
    '<=': { t: '小于等于', eg: '4 <= 4 得 1' },
    '>': { t: '大于', eg: '5 > 4 得 1' },
    '>=': { t: '大于等于', eg: '4 >= 4 得 1' },
    '&&': { t: '并且', eg: '真 && 假 得 0', d: '两边都成立才成立；左边不成立就直接停下，不再算右边（短路）' },
    '||': { t: '或者', eg: '真 || 假 得 1', d: '有一个成立就成立；左边成立就直接停下（短路）' },
    '!': { t: '取反', eg: '!0 得 1', d: '真变假、假变真' }
  };

  /* 取这条表达式用到哪些运算符 */
  function opsUsed(src) {
    var out = {};
    try {
      (function walk(n) {
        if (!n) return;
        if (n[0] === 'bin') { out[n[1]] = true; walk(n[2]); walk(n[3]); }
        else if (n[0] === 'un') { out[n[1]] = true; walk(n[2]); }
        else if (n[0] === 'call') { n[2].forEach(walk); }
      })(parse(src));
    } catch (e) { return null; }
    return out;
  }

  /* 取这条表达式用到哪些函数，并配上原理说明（给长按面板用）
     函数讲完再讲运算符 —— 条件式往往一个函数都没有，全靠运算符 */
  function explain(src) {
    var used = funcsUsed(src);
    if (!used) return [];
    var out = Object.keys(used).map(function (f) {
      var h = FUNC_HELP[f] || {};
      return { name: f, title: h.t || '内置函数', desc: h.d || '', eg: h.eg || '' };
    });
    var ops = opsUsed(src) || {};
    Object.keys(ops).forEach(function (op) {
      var h = OP_HELP[op];
      if (!h) return;
      out.push({ name: op, title: h.t, desc: h.d || '', eg: h.eg || '' });
    });
    return out;
  }

  G.expr = {
    FUNCS: FUNCS,
    CONSTS: CONSTS,
    MAX_ABS: MAX_ABS,
    FUNC_HELP: FUNC_HELP,
    parse: parse,
    evaluate: evaluate,
    evalAST: evalAST,
    check: check,
    usesX: usesX,
    funcsUsed: funcsUsed,
    explain: explain,
    trace: trace,
    sanitize: sanitize,
    fmtNum: fmtNum,
    /* 内置函数清单，给图鉴/说明用 */
    funcList: Object.keys(FUNCS)
  };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
