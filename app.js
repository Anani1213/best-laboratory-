/* ============================================================================
 *  VirtuaLab Pro — app.js
 *  Module: Application Controller (DOM Bindings + Procedural Audio)
 *  Build:  1.0.0
 * ----------------------------------------------------------------------------
 *  GLOBAL DATA CONTRACT (read-only consumers):
 *      window.ChemicalsDB      (step 1)
 *      window.ChemistryEngine  (step 2)
 *      window.CanvasRenderer   (step 3)
 *
 *  REQUIRED UI IDS (all accessed via strict optional chaining):
 *      #labCanvas  #openReagentModalBtn  #reagentModal
 *      #flameSlider  #formulaBanner  #logTerminal  #phDisplay
 * ==========================================================================*/

(function (global) {
  'use strict';

  const DB     = global.ChemicalsDB;
  const ENGINE = global.ChemistryEngine;
  const RND    = global.CanvasRenderer;

  if (!DB || !ENGINE) {
    console.error('[VirtuaLab Pro] app.js: missing ChemicalsDB or ChemistryEngine. Aborting.');
    return;
  }

  const VERSION = '1.0.0';
  const doc = global.document;

  /* ================================================================== *
   * 1. SMALL UTILITIES
   * ================================================================== */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const $     = (id) => (doc ? doc.getElementById(id) : null);

  function hexToRgb(hex) {
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(c) {
    const f = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + f(c.r) + f(c.g) + f(c.b);
  }

  /* ---- Unicode formula prettifier --------------------------------- */
  const SUB = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
  const SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };

  function toUnicodeFormula(s) {
    if (!s) return '';
    let out = String(s).replace(/([A-Za-z\)\]])(\d+)/g, (_, a, d) =>
      a + d.split('').map(c => SUB[c] || c).join(''));
    out = out.replace(/\^\{([^}]*)\}/g, (_, g) =>
      g.split('').map(c => SUP[c] || c).join(''));
    out = out.replace(/\^(\d)/g, (_, d) => SUP[d] || d);
    return out;
  }

  function latexToText(latex) {
    if (!latex) return '';
    return String(latex)
      .replace(/\\text\{([^}]*)\}/g, (_, g) => toUnicodeFormula(g))
      .replace(/\\rightarrow|\\to/g, ' → ')
      .replace(/\\rightleftharpoons|\\leftrightarrow/g, ' ⇌ ')
      .replace(/\\uparrow/g, '↑')
      .replace(/\\downarrow/g, '↓')
      .replace(/\\cdot/g, '·')
      .replace(/\\;/g, ' ')
      .replace(/\\,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ================================================================== *
   * 2. PROCEDURAL AUDIO SYNTHESIS (Web Audio API — zero external files)
   * ================================================================== */
  class LabAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuf = null;
      this.fizz = null;
      this.enabled = true;
      this.volume = 0.55;
      this._lastBubble = 0;
      this._lastHiss = 0;
      this._lastThud = 0;
    }

    init() {
      if (this.ctx) return this;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return this; }

      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.volume;

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 20;
        comp.ratio.value = 9;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        master.connect(comp);
        comp.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }

      this.master = master;
      this.noiseBuf = this._buildNoise(2.0);
      return this;
    }

    resume() { try { this.ctx?.resume?.(); } catch (e) { /* noop */ } return this; }
    suspend() { try { this.ctx?.suspend?.(); } catch (e) { /* noop */ } return this; }
    setEnabled(on) { this.enabled = !!on; return this; }

    setVolume(v) {
      this.volume = clamp(v, 0, 1);
      if (this.master) {
        this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
      }
      return this;
    }

    _buildNoise(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;   // gentle brown-noise bias
        d[i] = w * 0.72 + last * 0.9;
      }
      return buf;
    }

    _noise() {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      return s;
    }

    get _ready() {
      return this.enabled && this.ctx && this.master && this.ctx.state !== 'closed';
    }

    /* ---------------------------------------------------------------- *
     * DEEP EXPLOSION THUD
     * Sub-sine pitch drop + saturated crack + rumble tail.
     * ---------------------------------------------------------------- */
    thud(intensity) {
      if (!this._ready) return;
      const I = clamp(intensity || 1, 0.15, 1.6);
      const ctx = this.ctx, t = ctx.currentTime;
      if (t - this._lastThud < 0.08) return;
      this._lastThud = t;

      /* --- Layer 1: sub-bass drop --- */
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(150 * I + 45, t);
      sub.frequency.exponentialRampToValueAtTime(22, t + 0.75);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(0.95 * I, t + 0.014);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);

      sub.connect(subGain);
      subGain.connect(this.master);
      sub.start(t);
      sub.stop(t + 1.0);

      /* --- Layer 2: detuned body for "weight" --- */
      const body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(88 * I + 30, t + 0.01);
      body.frequency.exponentialRampToValueAtTime(38, t + 0.5);

      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.0001, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.35 * I, t + 0.02);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

      body.connect(bodyGain);
      bodyGain.connect(this.master);
      body.start(t + 0.01);
      body.stop(t + 0.6);

      /* --- Layer 3: broadband crack --- */
      const n = this._noise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(150, t + 0.4);
      lp.Q.value = 0.9;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 45;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.6 * I, t);
      nGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);

      n.connect(lp);
      lp.connect(hp);
      hp.connect(nGain);
      nGain.connect(this.master);
      n.start(t);
      n.stop(t + 0.55);

      /* --- Layer 4: delayed rumble tail --- */
      const rum = this._noise();
      const rlp = ctx.createBiquadFilter();
      rlp.type = 'lowpass';
      rlp.frequency.value = 90;
      const rGain = ctx.createGain();
      rGain.gain.setValueAtTime(0.0001, t + 0.06);
      rGain.gain.linearRampToValueAtTime(0.22 * I, t + 0.18);
      rGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      rum.connect(rlp);
      rlp.connect(rGain);
      rGain.connect(this.master);
      rum.start(t + 0.06);
      rum.stop(t + 1.4);
    }

    /* ---------------------------------------------------------------- *
     * GAS HISS  (NO₂, Cl₂, SO₂ venting, acid fumes)
     * ---------------------------------------------------------------- */
    hiss(duration, level) {
      if (!this._ready) return;
      const dur = clamp(duration || 0.7, 0.12, 3.0);
      const lv  = clamp(level === undefined ? 0.24 : level, 0.02, 0.7);
      const ctx = this.ctx, t = ctx.currentTime;
      if (t - this._lastHiss < 0.09) return;
      this._lastHiss = t;

      const n = this._noise();

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3600, t);
      bp.frequency.linearRampToValueAtTime(2600, t + dur);
      bp.Q.value = 0.65;

      const shape = ctx.createBiquadFilter();
      shape.type = 'highpass';
      shape.frequency.value = 900;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(lv, t + dur * 0.22);
      g.gain.linearRampToValueAtTime(lv * 0.7, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      n.connect(bp);
      bp.connect(shape);
      shape.connect(g);
      g.connect(this.master);
      n.start(t);
      n.stop(t + dur + 0.05);

      /* Airy low body underneath */
      const n2 = this._noise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(lv * 0.55, t + dur * 0.3);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n2.connect(lp);
      lp.connect(g2);
      g2.connect(this.master);
      n2.start(t);
      n2.stop(t + dur + 0.05);
    }

    /* ---------------------------------------------------------------- *
     * BOILING BUBBLE CLICK
     * ---------------------------------------------------------------- */
    bubble(size) {
      if (!this._ready) return;
      const s = clamp(size || 1, 0.3, 2.2);
      const ctx = this.ctx, t = ctx.currentTime;
      if (t - this._lastBubble < 0.035) return;
      this._lastBubble = t;

      const f0 = 180 + Math.random() * 620 + s * 200;

      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.055);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * s, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.1);

      /* Small transient click for "wet" quality */
      const n = this._noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.05 * s, t);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(this.master);
      n.start(t);
      n.stop(t + 0.05);
    }

    /* ---------------------------------------------------------------- *
     * SUSTAINED FIZZ LOOP (boiling / vigorous effervescence)
     * ---------------------------------------------------------------- */
    fizzStart() {
      if (!this._ready || this.fizz) return;
      const ctx = this.ctx, t = ctx.currentTime;

      const n = this._noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 0.8;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.001, t + 0.2);

      n.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      n.start(t);

      this.fizz = { src: n, gain: g, filter: bp };
    }

    fizzLevel(x) {
      if (!this.fizz || !this._ready) return;
      const lv = clamp(x, 0, 1);
      const t = this.ctx.currentTime;
      this.fizz.gain.gain.setTargetAtTime(0.0001 + lv * 0.11, t, 0.12);
      this.fizz.filter.frequency.setTargetAtTime(1100 + lv * 1600, t, 0.25);
    }

    fizzStop() {
      if (!this.fizz || !this.ctx) return;
      const f = this.fizz;
      this.fizz = null;
      try {
        const t = this.ctx.currentTime;
        f.gain.gain.cancelScheduledValues(t);
        f.gain.gain.setTargetAtTime(0.0001, t, 0.15);
        f.src.stop(t + 0.6);
      } catch (e) { /* noop */ }
    }

    /* ---------------------------------------------------------------- *
     * SHORT UI / MECHANICAL TRANSIENTS
     * ---------------------------------------------------------------- */
    click() {
      if (!this._ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.05);
    }

    pop() {
      if (!this._ready) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(980, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.08);
    }

    /** Sharp metal-on-glass pour for reagent insertion. */
    pour() {
      if (!this._ready) return;
      const dur = 0.42;
      this.hiss(dur, 0.11);
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1500, t + 0.02);
      o.frequency.exponentialRampToValueAtTime(400, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  const AUDIO = new LabAudio();

  /* ================================================================== *
   * 3. pH COLOR SCALE (0 – 14 rainbow)
   * ================================================================== */
  const PH_STOPS = [
    [0.0,  '#e74c3c'], [1.5, '#e67e22'], [3.0, '#f1c40f'], [5.0, '#a3e635'],
    [7.0,  '#2ecc71'], [8.5, '#1abc9c'], [10.0, '#3498db'], [12.0, '#8e44ad'],
    [14.0, '#4a235a']
  ];

  function phColor(pH) {
    const p = clamp(pH, 0, 14);
    for (let i = 0; i < PH_STOPS.length - 1; i++) {
      const [p0, c0] = PH_STOPS[i];
      const [p1, c1] = PH_STOPS[i + 1];
      if (p >= p0 && p <= p1) {
        const t = (p1 === p0) ? 0 : (p - p0) / (p1 - p0);
        const a = hexToRgb(c0), b = hexToRgb(c1);
        return rgbToHex({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
      }
    }
    return PH_STOPS[PH_STOPS.length - 1][1];
  }

  function phLabel(pH) {
    if (pH < 2.0) return 'STRONG ACID';
    if (pH < 6.5) return 'ACIDIC';
    if (pH <= 7.5) return 'NEUTRAL';
    if (pH < 11.0) return 'BASIC';
    return 'STRONG BASE';
  }

  /* ================================================================== *
   * 4. STYLE INJECTION (for elements this module creates)
   * ================================================================== */
  const STYLE_ID = 'vl-app-styles';
  function injectStyles() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .vl-panel{font-family:"JetBrains Mono","Consolas",ui-monospace,monospace;color:#cfe2f7}
      .vl-row{display:flex;align-items:center;gap:8px}
      .vl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
        gap:8px;max-height:46vh;overflow-y:auto;padding:4px;margin:10px 0}
      .vl-item{background:linear-gradient(160deg,#111a26,#0a1119);
        border:1px solid rgba(110,150,200,.18);border-radius:10px;padding:9px 10px;
        cursor:pointer;transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease}
      .vl-item:hover{transform:translateY(-2px);border-color:rgba(140,190,255,.45);
        box-shadow:0 6px 18px rgba(0,0,0,.45)}
      .vl-item.sel{border-color:#4fc3f7;box-shadow:0 0 0 1px #4fc3f7,0 8px 22px rgba(79,195,247,.25)}
      .vl-item .nm{font-size:12px;font-weight:700;color:#e8f2ff;line-height:1.25}
      .vl-item .fm{font-size:13px;color:#7fd3ff;margin-top:3px}
      .vl-item .meta{font-size:10px;color:#7c93ac;margin-top:5px;display:flex;justify-content:space-between}
      .vl-btn{background:linear-gradient(180deg,#1b2942,#101a29);color:#d8ecff;
        border:1px solid rgba(120,170,230,.35);border-radius:8px;padding:7px 13px;
        font:600 12px/1 "JetBrains Mono",monospace;cursor:pointer;transition:all .13s ease}
      .vl-btn:hover{background:linear-gradient(180deg,#24395c,#152238);border-color:#4fc3f7}
      .vl-btn.primary{background:linear-gradient(180deg,#0a6ebd,#064a80);border-color:#4fc3f7;color:#fff}
      .vl-btn.danger{background:linear-gradient(180deg,#7a1f1f,#4a1010);border-color:#e74c3c;color:#ffd9d9}
      .vl-btn:disabled{opacity:.4;cursor:not-allowed}
      .vl-input,.vl-select{background:#0b1420;border:1px solid rgba(120,170,230,.28);
        color:#dcefff;border-radius:7px;padding:6px 9px;font:600 12px/1.2 "JetBrains Mono",monospace;outline:none}
      .vl-input:focus,.vl-select:focus{border-color:#4fc3f7;box-shadow:0 0 0 2px rgba(79,195,247,.15)}
      .vl-label{font-size:10px;letter-spacing:.14em;color:#7c93ac;text-transform:uppercase}
      .vl-sep{height:1px;background:rgba(120,170,230,.14);margin:12px 0}
      .vl-telemetry{position:fixed;top:14px;right:14px;z-index:40;
        background:rgba(8,14,22,.88);border:1px solid rgba(110,160,220,.22);
        border-radius:12px;padding:12px 14px;min-width:186px;
        font-family:"JetBrains Mono",monospace;backdrop-filter:blur(9px);
        box-shadow:0 10px 34px rgba(0,0,0,.55)}
      .vl-telemetry .ttl{font-size:9px;letter-spacing:.2em;color:#5f7a95;
        text-transform:uppercase;margin-bottom:9px}
      .vl-trow{display:flex;justify-content:space-between;align-items:baseline;
        font-size:11px;padding:2.5px 0}
      .vl-trow .k{color:#7c93ac}
      .vl-trow .v{color:#8fe3ff;font-weight:700;font-variant-numeric:tabular-nums}
      .vl-ph-track{position:relative;height:12px;border-radius:6px;overflow:hidden;
        box-shadow:inset 0 1px 3px rgba(0,0,0,.6)}
      .vl-ph-marker{position:absolute;top:-3px;width:3px;height:18px;border-radius:2px;
        background:#fff;box-shadow:0 0 10px rgba(255,255,255,.9);
        transform:translateX(-1.5px);transition:left .16s ease}
      .vl-ph-value{font:700 20px/1 "JetBrains Mono",monospace;
        font-variant-numeric:tabular-nums;transition:color .2s ease}
      .vl-ph-sub{font:600 9px/1 "JetBrains Mono",monospace;letter-spacing:.18em;
        color:#7c93ac;text-transform:uppercase;margin-top:4px}
      .vl-logline{font:11px/1.5 "JetBrains Mono",monospace;white-space:pre-wrap;
        padding:1px 0;border-bottom:1px solid rgba(255,255,255,.025)}
      .vl-logline .ts{color:#4e6a85;margin-right:7px}
      .vl-eq{font:600 13px/1.5 "JetBrains Mono",monospace;padding:3px 0;
        color:#9fe6ff;animation:vlEqIn .35s ease}
      .vl-eq .dh{color:#f5c26b;font-size:10px;margin-left:8px}
      .vl-eq.fresh{color:#fff;text-shadow:0 0 14px rgba(120,220,255,.7)}
      @keyframes vlEqIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
      .vl-chip{display:inline-block;font-size:9px;letter-spacing:.1em;padding:2px 7px;
        border-radius:99px;background:rgba(79,195,247,.14);border:1px solid rgba(79,195,247,.3);
        color:#8fd8ff;margin-right:5px}
      .vl-modal-body{max-height:78vh;overflow-y:auto;padding:2px}
    `;
    doc.head?.appendChild(style);
  }

  /* ================================================================== *
   * 5. DOM CACHE + LAZY ELEMENT FACTORY
   * ================================================================== */
  const UI = {
    canvas:       null,
    flameSlider:  null,
    phDisplay:    null,
    formulaBanner:null,
    logTerminal:  null,
    modal:        null,
    openModalBtn: null,
    /* created lazily */
    phTrack: null, phMarker: null, phValue: null, phSub: null,
    telemetry: {},
    reagentGrid: null,
    reagentSearch: null,
    reagentCategory: null,
    reagentAmount: null,
    reagentUnit: null,
    reagentSelectedLabel: null,
    addReagentBtn: null,
    waterInput: null,
    addWaterBtn: null,
    removeWaterBtn: null,
    resetBtn: null,
    muteBtn: null,
  };

  function ensureEl(id, tag, parent, className) {
    let el = $(id);
    if (el) return el;
    if (!doc) return null;
    el = doc.createElement(tag || 'div');
    el.id = id;
    if (className) el.className = className;
    (parent || doc.body)?.appendChild(el);
    return el;
  }

  /* ================================================================== *
   * 6. pH DISPLAY WIDGET
   * ================================================================== */
  function buildPHDisplay() {
    const host = UI.phDisplay;
    if (!host) return;

    /* If the host is an <input type=range>, use it natively. */
    if (host.tagName === 'INPUT') {
      host.min = '0'; host.max = '14'; host.step = '0.01';
      host.style.background = 'linear-gradient(90deg,' +
        PH_STOPS.map(([p, c]) => c + ' ' + ((p / 14) * 100).toFixed(1) + '%').join(',') + ')';
      return;
    }

    if (host.querySelector('.vl-ph-track')) {
      UI.phTrack  = host.querySelector('.vl-ph-track');
      UI.phMarker = host.querySelector('.vl-ph-marker');
      UI.phValue  = host.querySelector('.vl-ph-value');
      UI.phSub    = host.querySelector('.vl-ph-sub');
      return;
    }

    host.classList.add('vl-panel');

    const track = doc.createElement('div');
    track.className = 'vl-ph-track';
    track.style.background = 'linear-gradient(90deg,' +
      PH_STOPS.map(([p, c]) => c + ' ' + ((p / 14) * 100).toFixed(1) + '%').join(',') + ')';

    const marker = doc.createElement('div');
    marker.className = 'vl-ph-marker';
    marker.style.left = '50%';
    track.appendChild(marker);

    const value = doc.createElement('div');
    value.className = 'vl-ph-value';
    value.textContent = '7.00';

    const sub = doc.createElement('div');
    sub.className = 'vl-ph-sub';
    sub.textContent = 'NEUTRAL';

    host.appendChild(track);
    host.appendChild(value);
    host.appendChild(sub);

    UI.phTrack = track;
    UI.phMarker = marker;
    UI.phValue = value;
    UI.phSub = sub;
  }

  function updatePHDisplay(pH) {
    const p = clamp(pH, 0, 14);
    const col = phColor(p);

    if (UI.phDisplay?.tagName === 'INPUT') {
      UI.phDisplay.value = String(p);
      UI.phDisplay.style.setProperty('--vl-ph-color', col);
      return;
    }
    if (UI.phMarker) {
      UI.phMarker.style.left = ((p / 14) * 100).toFixed(2) + '%';
      UI.phMarker.style.boxShadow = '0 0 10px ' + col + ', 0 0 18px rgba(255,255,255,.6)';
    }
    if (UI.phValue) {
      UI.phValue.textContent = p.toFixed(2);
      UI.phValue.style.color = col;
    }
    if (UI.phSub) UI.phSub.textContent = phLabel(p);
    UI.phDisplay?.style?.setProperty('--vl-ph-color', col);
  }

  /* ================================================================== *
   * 7. TELEMETRY PANEL
   * ================================================================== */
  const TELEMETRY_IDS = [
    ['telemetryMass',     'MASS'],
    ['telemetryVolume',   'VOLUME'],
    ['telemetryMolarity', 'MOLARITY'],
    ['telemetryTemp',     'TEMP'],
    ['telemetrySpecies',  'SPECIES'],
    ['telemetryTime',     'SIM TIME']
  ];

  function buildTelemetry() {
    const missing = TELEMETRY_IDS.filter(([id]) => !$(id));
    if (!missing.length) {
      TELEMETRY_IDS.forEach(([id]) => { UI.telemetry[id] = $(id); });
      return;
    }
    if (!doc) return;

    let panel = $('telemetryPanel');
    if (!panel) {
      panel = doc.createElement('div');
      panel.id = 'telemetryPanel';
      panel.className = 'vl-telemetry';
      doc.body?.appendChild(panel);
    }

    const title = doc.createElement('div');
    title.className = 'ttl';
    title.textContent = 'Live Telemetry';
    panel.appendChild(title);

    TELEMETRY_IDS.forEach(([id, label]) => {
      let valEl = $(id);
      if (!valEl) {
        const row = doc.createElement('div');
        row.className = 'vl-trow';
        const k = doc.createElement('span');
        k.className = 'k';
        k.textContent = label;
        valEl = doc.createElement('span');
        valEl.className = 'v';
        valEl.id = id;
        valEl.textContent = '—';
        row.appendChild(k);
        row.appendChild(valEl);
        panel.appendChild(row);
      }
      UI.telemetry[id] = valEl;
    });
  }

  function setTelemetry(id, text) {
    const el = UI.telemetry[id] || $(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  /* ================================================================== *
   * 8. FORMULA BANNER
   * ================================================================== */
  let lastEquationCount = 0;
  let lastEquationKey = '';

  function updateFormulaBanner(state) {
    const host = UI.formulaBanner;
    if (!host) return;

    const eqs = state.equations || [];
    const key = eqs.length + '|' + (eqs.length ? eqs[eqs.length - 1].latex : '');
    if (key === lastEquationKey) return;
    lastEquationKey = key;

    if (!eqs.length) {
      host.innerHTML = '';
      const idle = doc.createElement('div');
      idle.className = 'vl-eq';
      idle.style.color = '#4e6a85';
      idle.textContent = state.isDry
        ? '◌ Vessel dry — add water to initiate chemistry'
        : '◌ No reaction in progress';
      host.appendChild(idle);
      lastEquationCount = 0;
      return;
    }

    /* Render the most recent 3 equations (newest first) */
    const recent = eqs.slice(-3).reverse();
    host.innerHTML = '';

    recent.forEach((eq, i) => {
      const line = doc.createElement('div');
      line.className = 'vl-eq' + (i === 0 && eqs.length !== lastEquationCount ? ' fresh' : '');

      const txt = doc.createElement('span');
      txt.textContent = latexToText(eq.latex);

      const dh = doc.createElement('span');
      dh.className = 'dh';
      const dH = typeof eq.dH === 'number' ? eq.dH : null;
      dh.textContent = dH === null ? '' :
        (dH < 0 ? 'ΔH = ' + dH.toFixed(1) + ' kJ/mol (exothermic)'
                : dH > 0 ? 'ΔH = +' + dH.toFixed(1) + ' kJ/mol (endothermic)'
                : 'ΔH ≈ 0');

      line.appendChild(txt);
      if (dh.textContent) line.appendChild(dh);
      host.appendChild(line);
    });

    lastEquationCount = eqs.length;
  }

  /* ================================================================== *
   * 9. LOG TERMINAL
   * ================================================================== */
  let logPointer = 0;
  const LOG_COLORS = {
    info:   '#8ab4f8',
    warn:   '#f5c26b',
    error:  '#ff6b6b',
    danger: '#ff4d4d',
  };

  function updateLogTerminal(state) {
    const host = UI.logTerminal;
    if (!host) return;
    const log = state.log || [];
    if (log.length < logPointer) logPointer = 0;
    if (log.length === logPointer) return;

    for (let i = logPointer; i < log.length; i++) {
      const entry = log[i];
      const line = doc.createElement('div');
      line.className = 'vl-logline';

      const ts = doc.createElement('span');
      ts.className = 'ts';
      ts.textContent = '[' + (entry.simTime || 0).toFixed(1) + 's]';

      const msg = doc.createElement('span');
      msg.textContent = entry.message;
      msg.style.color = LOG_COLORS[entry.level] || '#9fb6cc';

      line.appendChild(ts);
      line.appendChild(msg);
      host.appendChild(line);
    }

    logPointer = log.length;
    while (host.childElementCount > 220) host.removeChild(host.firstChild);
    host.scrollTop = host.scrollHeight;
  }

  /* ================================================================== *
   * 10. REAGENT MODAL
   * ================================================================== */
  let selectedReagent = null;
  let reagentFilter = { q: '', cat: 'all' };

  function unitForChemical(chem) {
    if (!chem) return 'g';
    if (chem.state === 'solid') return 'g';
    if (chem.state === 'liquid' || chem.state === 'aqueous') return 'mL';
    if (chem.state === 'gas') return 'mL';
    return 'g';
  }

  function buildModal() {
    const modal = UI.modal;
    if (!modal || !doc) return;

    /* Locate a sensible insertion point without destroying existing markup. */
    const body = modal.querySelector('[data-vl-body]')
              || modal.querySelector('.vl-modal-body')
              || modal.querySelector('.modal-body')
              || modal.querySelector('.modal-content')
              || modal;

    const panel = doc.createElement('div');
    panel.className = 'vl-panel vl-modal-body';
    body.appendChild(panel);

    /* --- Search + category filter --- */
    const filters = doc.createElement('div');
    filters.className = 'vl-row';
    filters.style.flexWrap = 'wrap';

    UI.reagentSearch = ensureEl('reagentSearch', 'input', filters, 'vl-input');
    UI.reagentSearch.type = 'text';
    UI.reagentSearch.placeholder = 'Search reagent or formula…';
    UI.reagentSearch.style.flex = '1 1 180px';

    UI.reagentCategory = ensureEl('reagentCategory', 'select', filters, 'vl-select');
    const optAll = doc.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All categories';
    UI.reagentCategory.appendChild(optAll);

    const cats = DB.categories || {};
    Object.keys(cats).forEach((k) => {
      const count = DB.byCategory(k).length;
      if (!count) return;
      const o = doc.createElement('option');
      o.value = k;
      o.textContent = cats[k].label + ' (' + count + ')';
      UI.reagentCategory.appendChild(o);
    });

    panel.appendChild(filters);

    /* --- Grid --- */
    UI.reagentGrid = ensureEl('reagentGrid', 'div', panel, 'vl-grid');
    UI.reagentGrid.style.display = 'grid';

    /* --- Selection readout --- */
    UI.reagentSelectedLabel = ensureEl('reagentSelected', 'div', panel, 'vl-label');
    UI.reagentSelectedLabel.textContent = 'No reagent selected';

    /* --- Amount + unit + add --- */
    const amountRow = doc.createElement('div');
    amountRow.className = 'vl-row';
    amountRow.style.marginTop = '8px';

    UI.reagentAmount = ensureEl('reagentAmount', 'input', amountRow, 'vl-input');
    UI.reagentAmount.type = 'number';
    UI.reagentAmount.min = '0.001';
    UI.reagentAmount.step = '0.1';
    UI.reagentAmount.value = '10';
    UI.reagentAmount.style.width = '92px';

    UI.reagentUnit = ensureEl('reagentUnit', 'select', amountRow, 'vl-select');
    ['g', 'mL', 'mol'].forEach((u) => {
      const o = doc.createElement('option');
      o.value = u;
      o.textContent = u;
      UI.reagentUnit.appendChild(o);
    });
    UI.reagentUnit.value = 'g';

    UI.addReagentBtn = ensureEl('addReagentBtn', 'button', amountRow, 'vl-btn primary');
    UI.addReagentBtn.textContent = '+ Add to Vessel';

    panel.appendChild(amountRow);

    /* --- Separator + water controls --- */
    const sep = doc.createElement('div');
    sep.className = 'vl-sep';
    panel.appendChild(sep);

    const waterTitle = doc.createElement('div');
    waterTitle.className = 'vl-label';
    waterTitle.textContent = 'Solvent — required for any reaction';
    panel.appendChild(waterTitle);

    const waterRow = doc.createElement('div');
    waterRow.className = 'vl-row';
    waterRow.style.marginTop = '7px';

    UI.waterInput = ensureEl('waterVolumeInput', 'input', waterRow, 'vl-input');
    UI.waterInput.type = 'number';
    UI.waterInput.min = '0';
    UI.waterInput.step = '5';
    UI.waterInput.value = '100';
    UI.waterInput.style.width = '92px';

    const mLTag = doc.createElement('span');
    mLTag.className = 'vl-label';
    mLTag.textContent = 'mL H₂O';
    waterRow.appendChild(mLTag);

    UI.addWaterBtn = ensureEl('addWaterBtn', 'button', waterRow, 'vl-btn');
    UI.addWaterBtn.textContent = '+ Water';

    UI.removeWaterBtn = ensureEl('removeWaterBtn', 'button', waterRow, 'vl-btn');
    UI.removeWaterBtn.textContent = '− Water';

    UI.resetBtn = ensureEl('resetVesselBtn', 'button', waterRow, 'vl-btn danger');
    UI.resetBtn.textContent = '⟲ Reset';

    UI.muteBtn = ensureEl('muteBtn', 'button', waterRow, 'vl-btn');
    UI.muteBtn.textContent = '🔊 Audio';

    panel.appendChild(waterRow);

    /* --- Hints --- */
    const hint = doc.createElement('div');
    hint.className = 'vl-label';
    hint.style.marginTop = '10px';
    hint.style.lineHeight = '1.7';
    hint.style.textTransform = 'none';
    hint.style.letterSpacing = '0';
    hint.innerHTML =
      '<span class="vl-chip">DRY VESSEL</span>' +
      'Group 1 / 2 metals stay inert until water is added. ' +
      'Use the flame slider to heat; boiling occurs at exactly 100.00 °C.';
    panel.appendChild(hint);

    /* --- Wire events (strict optional chaining) --- */
    UI.reagentSearch?.addEventListener('input', (e) => {
      reagentFilter.q = e.target.value || '';
      renderReagentGrid();
    });

    UI.reagentCategory?.addEventListener('change', (e) => {
      reagentFilter.cat = e.target.value || 'all';
      renderReagentGrid();
    });

    UI.addReagentBtn?.addEventListener('click', () => {
      AUDIO.init(); AUDIO.resume();
      addSelectedReagent();
    });

    UI.addWaterBtn?.addEventListener('click', () => {
      AUDIO.init(); AUDIO.resume();
      const v = parseFloat(UI.waterInput?.value) || 0;
      if (v > 0) {
        ENGINE.addWater(v);
        AUDIO.pour();
      }
    });

    UI.removeWaterBtn?.addEventListener('click', () => {
      const v = parseFloat(UI.waterInput?.value) || 0;
      if (v > 0) ENGINE.removeWater(v);
    });

    UI.resetBtn?.addEventListener('click', () => {
      ENGINE.reset();
      logPointer = 0;
      lastEquationCount = 0;
      lastEquationKey = '';
      if (UI.logTerminal) UI.logTerminal.innerHTML = '';
      if (UI.formulaBanner) UI.formulaBanner.innerHTML = '';
      AUDIO.fizzStop();
      AUDIO.click();
    });

    UI.muteBtn?.addEventListener('click', () => {
      AUDIO.setEnabled(!AUDIO.enabled);
      if (!AUDIO.enabled) AUDIO.fizzStop();
      if (UI.muteBtn) UI.muteBtn.textContent = AUDIO.enabled ? '🔊 Audio' : '🔇 Muted';
    });

    renderReagentGrid();
  }

  function renderReagentGrid() {
    const grid = UI.reagentGrid;
    if (!grid) return;

    let list;
    if (reagentFilter.q) {
      list = DB.search(reagentFilter.q);
      if (reagentFilter.cat !== 'all') {
        list = list.filter((c) => c.category === reagentFilter.cat);
      }
    } else if (reagentFilter.cat !== 'all') {
      list = DB.byCategory(reagentFilter.cat);
    } else {
      list = DB.all();
    }

    grid.innerHTML = '';

    if (!list.length) {
      const empty = doc.createElement('div');
      empty.className = 'vl-label';
      empty.textContent = 'No reagents match the filter.';
      grid.appendChild(empty);
      return;
    }

    const frag = doc.createDocumentFragment();
    list.forEach((chem) => {
      const item = doc.createElement('div');
      item.className = 'vl-item' + (selectedReagent && selectedReagent.id === chem.id ? ' sel' : '');
      item.dataset.id = chem.id;

      const nm = doc.createElement('div');
      nm.className = 'nm';
      nm.textContent = chem.name;

      const fm = doc.createElement('div');
      fm.className = 'fm';
      fm.textContent = toUnicodeFormula(chem.formulaPlain || chem.formula);

      const meta = doc.createElement('div');
      meta.className = 'meta';
      const left = doc.createElement('span');
      left.textContent = chem.state.toUpperCase();
      const right = doc.createElement('span');
      right.textContent = chem.molarMass ? chem.molarMass.toFixed(2) + ' g/mol' : '—';
      meta.appendChild(left);
      meta.appendChild(right);

      item.appendChild(nm);
      item.appendChild(fm);
      item.appendChild(meta);

      item.addEventListener('click', () => selectReagent(chem));
      frag.appendChild(item);
    });

    grid.appendChild(frag);
  }

  function selectReagent(chem) {
    selectedReagent = chem;
    AUDIO.init(); AUDIO.resume(); AUDIO.click();

    /* Auto-unit: g for solids, mL for liquids/aqueous/gas */
    const u = unitForChemical(chem);
    if (UI.reagentUnit) UI.reagentUnit.value = u;

    if (UI.reagentSelectedLabel) {
      UI.reagentSelectedLabel.textContent =
        '▸ ' + chem.name + '  ·  ' + toUnicodeFormula(chem.formulaPlain) +
        '  ·  unit: ' + u + '  ·  ' + chem.state;
    }

    /* Highlight */
    UI.reagentGrid?.querySelectorAll('.vl-item').forEach((el) => {
      el.classList.toggle('sel', el.dataset.id === chem.id);
    });
  }

  function addSelectedReagent() {
    if (!selectedReagent) {
      if (UI.reagentSelectedLabel) {
        UI.reagentSelectedLabel.textContent = '⚠ Select a reagent first';
      }
      return;
    }
    const amount = parseFloat(UI.reagentAmount?.value) || 1;
    const unit = UI.reagentUnit?.value || unitForChemical(selectedReagent);

    const res = ENGINE.addChemical(selectedReagent.id, amount, unit);

    if (res && res.ok) {
      AUDIO.pour();
      if (res.reactions && res.reactions.length) {
        res.reactions.forEach((r) => {
          if (r.explosive) AUDIO.thud(1.25);
          else if (r.type === 'metal_water') AUDIO.hiss(0.9, 0.3);
          else if (r.type === 'carbonate_acid') AUDIO.hiss(0.7, 0.22);
        });
      }
    } else if (UI.reagentSelectedLabel) {
      UI.reagentSelectedLabel.textContent = '⚠ ' + ((res && res.error) || 'could not add reagent');
    }
  }

  function openModal() {
    const m = UI.modal;
    if (!m) return;
    AUDIO.init(); AUDIO.resume(); AUDIO.click();
    m.classList.add('open');
    m.style.display = 'flex';
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const m = UI.modal;
    if (!m) return;
    m.classList.remove('open');
    m.style.display = 'none';
    m.setAttribute('aria-hidden', 'true');
  }

  /* ================================================================== *
   * 11. TELEMETRY UPDATE
   * ================================================================== */
  function updateTelemetry(state) {
    /* --- Mass (g): water + all solutes & solids --- */
    let mass = 0;
    if (state.waterVolume > 0) mass += state.waterVolume * 0.99705;
    let dissolvedMoles = 0;
    (state.contents || []).forEach((c) => {
      const chem = DB.get(c.id);
      if (chem && chem.molarMass) mass += c.moles * chem.molarMass;
      if (c.phase === 'dissolved' || c.phase === 'aqueous') dissolvedMoles += c.moles;
    });
    (state.precipitates || []).forEach((p) => {
      const ppt = DB.getPrecipitate(p.formula);
      if (ppt && ppt.molarMass) mass += p.moles * ppt.molarMass;
    });

    setTelemetry('telemetryMass', mass.toFixed(2) + ' g');
    setTelemetry('telemetryVolume', state.waterVolume.toFixed(1) + ' mL');

    const volL = state.waterVolume / 1000;
    const molarity = volL > 0 ? dissolvedMoles / volL : 0;
    setTelemetry('telemetryMolarity', molarity > 0
      ? (molarity >= 0.01 ? molarity.toFixed(4) : molarity.toExponential(2)) + ' M'
      : '0.0000 M');

    setTelemetry('telemetryTemp', state.temperature.toFixed(1) + ' °C');
    setTelemetry('telemetrySpecies', String((state.contents || []).length));
    setTelemetry('telemetryTime', state.simTime.toFixed(1) + ' s');
  }

  /* ================================================================== *
   * 12. AUDIO STATE MACHINE
   * ================================================================== */
  const audioState = {
    prevExplosion: false,
    prevBoiling: false,
    prevGasTotal: 0,
    prevIgnited: 0,
    bubbleAccum: 0,
    hissCooldown: 0,
  };

  function updateAudio(state, dt) {
    if (!AUDIO.enabled || !AUDIO.ctx) return;

    /* --- Explosion rising edge --- */
    if (state.explosionFlag && !audioState.prevExplosion) {
      AUDIO.thud(1.35);
    }
    audioState.prevExplosion = !!state.explosionFlag;

    /* --- H₂ ignition events --- */
    const ignited = (state.gases || []).filter((g) => g.ignited).length;
    if (ignited > audioState.prevIgnited) {
      AUDIO.thud(0.9);
    }
    audioState.prevIgnited = ignited;

    /* --- Boiling / sustained fizz --- */
    const boiling = !!state.boiling;
    const hot = state.temperature > 82 && state.waterVolume > 0;

    if ((boiling || hot) && !audioState.prevBoiling) AUDIO.fizzStart();
    if (!boiling && !hot && audioState.prevBoiling) AUDIO.fizzStop();
    audioState.prevBoiling = boiling || hot;

    if (boiling || hot) {
      const lvl = boiling
        ? clamp(0.35 + (state.heatIntensity / 100) * 0.65, 0, 1)
        : clamp((state.temperature - 82) / 18, 0, 0.4);
      AUDIO.fizzLevel(lvl);

      /* Stochastic bubble clicks, faster when boiling */
      const rate = boiling ? 14 + (state.heatIntensity / 100) * 22 : 2.5;
      audioState.bubbleAccum += rate * dt;
      while (audioState.bubbleAccum >= 1) {
        audioState.bubbleAccum -= 1;
        AUDIO.bubble(boiling ? 1.35 : 0.8);
      }
    } else {
      audioState.bubbleAccum = 0;
    }

    /* --- Gas evolution hiss --- */
    const gasTotal = (state.gases || []).reduce((a, g) => a + g.moles, 0);
    const dGas = gasTotal - audioState.prevGasTotal;
    audioState.prevGasTotal = gasTotal;

    audioState.hissCooldown -= dt;
    if (dGas > 1e-6 && audioState.hissCooldown <= 0) {
      const intensity = clamp(Math.log10(1 + dGas * 1e5) / 3, 0.05, 1);
      AUDIO.hiss(0.35 + intensity * 0.9, 0.06 + intensity * 0.28);
      if (intensity > 0.6) AUDIO.pop();
      audioState.hissCooldown = 0.35 + Math.random() * 0.5;
    }
  }

  /* ================================================================== *
   * 13. FLAME SLIDER BINDING
   * ================================================================== */
  function bindFlameSlider() {
    const slider = UI.flameSlider;
    if (!slider) return;

    /* Compatibility shim for the renderer's flame intensity API. */
    if (RND && typeof RND.setFlameIntensity !== 'function') {
      RND.setFlameIntensity = function (v) {
        const x = clamp(Number(v) || 0, 0, 1);
        if (this.flame) {
          this.flame.targetIntensity = x;
          this.flame.intensity += (x - this.flame.intensity) * 0.6;
        }
        return this;
      };
    }

    const apply = (raw) => {
      const v = Number(raw);
      ENGINE.applyHeat(v);
      const norm = clamp(v / 100, 0, 1);
      RND?.setFlameIntensity?.(norm);

      const out = $('flameValue');
      if (out) out.textContent = v.toFixed(0) + '%';

      /* Ignition transient */
      if (v > 0 && !apply._lit) {
        apply._lit = true;
        AUDIO.init(); AUDIO.resume();
        AUDIO.hiss(0.4, 0.12);
      } else if (v === 0) {
        apply._lit = false;
        AUDIO.fizzStop();
      }
    };

    slider.addEventListener('input', (e) => apply(e.target.value));
    slider.addEventListener('change', (e) => apply(e.target.value));
    apply(slider.value || 0);
  }

  /* ================================================================== *
   * 14. MISC BINDINGS
   * ================================================================== */
  function bindMisc() {
    UI.openModalBtn?.addEventListener('click', openModal);

    UI.modal?.addEventListener('click', (e) => {
      if (e.target === UI.modal) closeModal();
    });

    doc?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'm' || e.key === 'M') {
        AUDIO.setEnabled(!AUDIO.enabled);
        if (!AUDIO.enabled) AUDIO.fizzStop();
        if (UI.muteBtn) UI.muteBtn.textContent = AUDIO.enabled ? '🔊 Audio' : '🔇 Muted';
      }
    });

    /* Unlock audio on the first user gesture (browser autoplay policy). */
    const unlock = () => {
      AUDIO.init(); AUDIO.resume();
      doc?.removeEventListener('pointerdown', unlock);
      doc?.removeEventListener('keydown', unlock);
    };
    doc?.addEventListener('pointerdown', unlock, { once: true });
    doc?.addEventListener('keydown', unlock, { once: true });
  }

  /* ================================================================== *
   * 15. MAIN LOOP
   * ================================================================== */
  let uiAccumulator = 0;
  let lastFrameTime = 0;
  let crashed = false;

  function frame(now) {
    if (crashed) return;

    const t = now || (global.performance?.now?.() ?? Date.now());
    const dt = lastFrameTime ? Math.min(0.05, (t - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = t;

    try {
      /* --- Advance physics/logic --- */
      const tickResult = ENGINE.tick(dt);
      const state = ENGINE.getState();

      /* --- Audio reacts every frame --- */
      updateAudio(state, dt);

      /* --- DOM updates throttled to ~12 Hz --- */
      uiAccumulator += dt;
      if (uiAccumulator >= 0.08) {
        uiAccumulator = 0;
        updatePHDisplay(state.pH);
        updateTelemetry(state);
        updateFormulaBanner(state);
        updateLogTerminal(state);
      }
    } catch (err) {
      crashed = true;
      console.error('[VirtuaLab Pro] Simulation loop halted:', err);
      return;
    }

    global.requestAnimationFrame?.(frame);
  }

  /* ================================================================== *
   * 16. BOOTSTRAP
   * ================================================================== */
  function boot() {
    injectStyles();

    /* --- Cache required contract IDs (strict optional chaining) --- */
    UI.canvas        = $('labCanvas');
    UI.flameSlider   = $('flameSlider');
    UI.phDisplay     = $('phDisplay');
    UI.formulaBanner = $('formulaBanner');
    UI.logTerminal   = $('logTerminal');
    UI.modal         = $('reagentModal');
    UI.openModalBtn  = $('openReagentModalBtn');

    /* --- Warn (never throw) about missing contract elements --- */
    const required = ['labCanvas', 'flameSlider', 'phDisplay', 'formulaBanner',
                      'logTerminal', 'reagentModal', 'openReagentModalBtn'];
    const missing = required.filter((id) => !$(id));
    if (missing.length) {
      console.warn('[VirtuaLab Pro] Missing UI elements: ' + missing.join(', '));
    }

    /* --- Build widgets --- */
    buildPHDisplay();
    buildTelemetry();
    buildModal();
    bindFlameSlider();
    bindMisc();

    /* --- Modal starts hidden --- */
    if (UI.modal) {
      UI.modal.style.display = 'none';
      UI.modal.setAttribute('aria-hidden', 'true');
    }

    /* --- Prime the UI --- */
    const s0 = ENGINE.getState();
    updatePHDisplay(s0.pH);
    updateTelemetry(s0);
    updateFormulaBanner(s0);
    updateLogTerminal(s0);

    /* --- Kick off the loop --- */
    global.requestAnimationFrame?.(frame);

    console.log(
      '%c[VirtuaLab Pro] app.js v' + VERSION + ' bound — ' +
      'flame · pH · telemetry · procedural Web Audio',
      'color:#2ECC71;font-weight:bold;'
    );
  }

  /* Expose for debugging / external integration */
  global.VirtuaLabApp = {
    version: VERSION,
    audio: AUDIO,
    ui: UI,
    openModal: openModal,
    closeModal: closeModal,
    addReagent: addSelectedReagent,
    selectReagent: selectReagent,
    phColor: phColor,
    latexToText: latexToText,
    stats: () => ({
      version: VERSION,
      audioEnabled: AUDIO.enabled,
      audioReady: !!AUDIO.ctx,
      audioState: AUDIO.ctx ? AUDIO.ctx.state : 'uninitialised',
      selectedReagent: selectedReagent ? selectedReagent.id : null,
      uiBound: Object.keys(UI).filter((k) => !!UI[k]).length,
    }),
  };

  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

})(typeof window !== 'undefined' ? window : this);
