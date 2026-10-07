/* ─────────────────────────────────────────────────────────────
   audio.js —— 纯 WebAudio 合成音效（不依赖任何音频文件）
   ───────────────────────────────────────────────────────────── */
(function (G) {
  'use strict';

  var ctx = null, muted = false, master = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.24;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    var c = ensure();
    if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? 0.5 : vol, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    var c = ensure();
    if (!c || muted) return;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1400;
    var g = c.createGain();
    g.gain.value = vol === undefined ? 0.5 : vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  var SOUNDS = {
    step:    function () { tone(180, 0.05, 'triangle', 0.12); },
    eat:     function () { tone(520, 0.09, 'square', 0.3, 780); noise(0.06, 0.14, 2200); },
    bowl:    function () { tone(300, 0.12, 'square', 0.3, 520); tone(880, 0.22, 'triangle', 0.26, 1320, 0.05); },
    coin:    function () { tone(760, 0.08, 'square', 0.3, 1180); tone(1180, 0.14, 'sine', 0.24, 1560, 0.05); },
    mul:     function () { tone(420, 0.1, 'sawtooth', 0.24, 840); tone(840, 0.16, 'sine', 0.22, 1260, 0.07); },
    'if-ok': function () { tone(660, 0.1, 'sine', 0.34, 990); tone(990, 0.16, 'sine', 0.3, 1320, 0.08); },
    'if-bad':function () { tone(300, 0.16, 'sawtooth', 0.3, 130); noise(0.12, 0.2, 900); },
    door:    function () { tone(240, 0.22, 'sawtooth', 0.24, 120); tone(180, 0.3, 'sine', 0.2, 90, 0.04); noise(0.18, 0.18, 700); },
    bowlbreak: function () { noise(0.28, 0.5, 3200); tone(1400, 0.16, 'square', 0.26, 500); tone(900, 0.26, 'triangle', 0.2, 260, 0.03); },
    fail:    function () { tone(220, 0.5, 'sawtooth', 0.34, 60); tone(160, 0.6, 'square', 0.24, 44, 0.05); noise(0.4, 0.3, 500); },
    win:     function () {
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.34, 'triangle', 0.3, f * 1.01, i * 0.085); });
    },
    click:   function () { tone(660, 0.045, 'square', 0.16); },
    undo:    function () { tone(420, 0.08, 'sine', 0.2, 300); },
    warn:    function () { tone(320, 0.14, 'square', 0.24, 240); }
  };

  function play(name) {
    if (muted) return;
    var f = SOUNDS[name];
    if (f) { try { f(); } catch (e) { } }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.24;
    return muted;
  }
  function toggle() { return setMuted(!muted); }
  function isMuted() { return muted; }
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { } }
  }

  G.audio = { play: play, setMuted: setMuted, toggle: toggle, isMuted: isMuted, unlock: unlock };
})(typeof window !== 'undefined' ? (window.DSF = window.DSF || {}) : (globalThis.DSF = globalThis.DSF || {}));
