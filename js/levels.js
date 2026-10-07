/* ─────────────────────────────────────────────────────────────
   levels.js —— 关卡注册表
   ------------------------------------------------------------------
   · 收集 js/levels/act*.js 里 push 进来的 spec
   · 懒构建：真正进入某一关时才生成地图 + 反推终点门槛（保证可通关）
   · 记录通关进度（localStorage）
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var M = G.map;
  var STORE_KEY = 'dsf.fish.rice.progress.v1';

  var cache = {};
  var specs = [];

  /* 校验器要延迟取（脚本加载顺序不能成为隐患） */
  function V() {
    var v = G.verify;
    if (!v) throw new Error('verify.js 还没加载：请确认 index.html 里它在 levels.js 之前');
    return v;
  }

  function refresh() {
    specs = (G.levelSpecs || []).slice().sort(function (a, b) { return a.id - b.id; });
    return specs;
  }

  function specById(id) {
    if (!specs.length) refresh();
    for (var i = 0; i < specs.length; i++) if (specs[i].id === id) return specs[i];
    return null;
  }

  function buildSpec(spec) {
    var lv = M.buildLevel(spec);
    lv.autoTuneReport = V().resolveAutoReqs(lv);
    return lv;
  }

  function get(id) {
    if (cache[id]) return cache[id];
    var spec = specById(id);
    if (!spec) return null;
    var lv = buildSpec(spec);
    cache[id] = lv;
    return lv;
  }

  /** 强制重建（改了 spec 之后用） */
  function rebuild(id) {
    delete cache[id];
    return get(id);
  }

  /* ── 进度 ─────────────────────────────────────────────── */
  var progress = { cleared: {}, unlocked: 1 };

  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          progress.cleared = p.cleared || {};
          progress.unlocked = p.unlocked || 1;
        }
      }
    } catch (e) { /* file:// 或隐私模式，忽略 */ }
    return progress;
  }

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { }
  }

  function markCleared(id) {
    progress.cleared[id] = 1;
    var next = Math.min(count(), id + 1);
    if (next > progress.unlocked) progress.unlocked = next;
    save();
  }

  function unlockAll() {
    progress.unlocked = count();
    save();
  }

  function resetProgress() {
    progress.cleared = {};
    progress.unlocked = 1;
    save();
  }

  function isUnlocked(id) { return id <= progress.unlocked; }
  function isCleared(id) { return !!progress.cleared[id]; }
  function count() { return specs.length || refresh().length; }

  /** 校验全部关卡（开发面板用） */
  function checkAll() {
    refresh();
    return V().checkAll(specs, buildSpec);
  }

  G.levels = {
    refresh: refresh,
    specs: function () { return specs.length ? specs : refresh(); },
    specById: specById,
    get: get,
    rebuild: rebuild,
    count: count,
    progress: progress,
    load: load,
    save: save,
    markCleared: markCleared,
    unlockAll: unlockAll,
    resetProgress: resetProgress,
    isUnlocked: isUnlocked,
    isCleared: isCleared,
    checkAll: checkAll,
    buildSpec: buildSpec
  };

  refresh();
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
