/* ============================================================================
   VIRTUALAB PRO — app.js
   Standalone Application Controller
   ----------------------------------------------------------------------------
   Responsibilities:
     1. Web Audio API procedural synthesizer (zero external audio files)
     2. Reagent Library overlay modal + apparatus control bindings
     3. Hazard Intercept Safety System
     4. Live telemetry, analytics, log terminal & state banner DOM bindings
     5. Integrated AI Lab Tutor panel
   ----------------------------------------------------------------------------
   Globals consumed: window.ChemistryEngine, window.CanvasRenderer,
                     window.ChemicalsDB
   ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
     0. MICRO-UTILITIES
     ========================================================================== */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** Return the first matching element from a list of candidate selectors. */
  function pick(selectors, root) {
    const scope = root || document;
    for (let i = 0; i < selectors.length; i++) {
      const el = scope.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  /** Find an element by its visible text content (normalised, case-insensitive). */
  function findByText(text, root, selector) {
    const scope = root || document;
    const sel = selector || 'button, a, [role="button"], .btn, .action-btn';
    const needle = String(text).replace(/\s+/g, ' ').trim().toUpperCase();
    const nodes = $$(sel, scope);
    for (let i = 0; i < nodes.length; i++) {
      const hay = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (hay.indexOf(needle) !== -1) return nodes[i];
    }
    return null;
  }

  /** Escape a string for safe innerHTML interpolation. */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Numeric formatter that never throws on bad input. */
  function fmt(value, decimals) {
    const d = typeof decimals === 'number' ? decimals : 2;
    const n = Number(value);
    if (!isFinite(n)) return '—';
    if (n === 0) return (0).toFixed(d);
    const abs = Math.abs(n);
    if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return n.toExponential(3);
    return n.toFixed(d);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function setText(el, text) {
    if (!el) return;
    const next = text == null ? '—' : String(text);
    if (el.textContent !== next) el.textContent = next;
  }

  function setHTML(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return '[' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ']';
  }

  function safeCall(fn, ctx, args, fallback) {
    if (typeof fn !== 'function') return fallback;
    try {
      return fn.apply(ctx || null, args || []);
    } catch (err) {
      console.warn('[VirtuaLab] Engine call failed:', err);
      return fallback;
    }
  }

  /* ==========================================================================
     1. WEB AUDIO API PROCEDURAL SYNTHESIZER
     ========================================================================== */

  const AudioSynth = (function () {
    let ctx = null;
    let master = null;
    let compressor = null;
    let noiseBufferCache = null;
    let burnerNodes = null;      // { source, gain, bandpass, highpass }
    let muted = false;
    let unlocked = false;

    /* ---------- internal plumbing ---------- */

    function ensure() {
      if (ctx) {
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          ctx.resume().catch(function () { /* ignore */ });
        }
        return ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;

      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0.85;

      compressor = ctx.createDynamicsCompressor();
      if (compressor.threshold) compressor.threshold.value = -14;
      if (compressor.knee) compressor.knee.value = 26;
      if (compressor.ratio) compressor.ratio.value = 9;
      if (compressor.attack) compressor.attack.value = 0.003;
      if (compressor.release) compressor.release.value = 0.24;

      master.connect(compressor);
      compressor.connect(ctx.destination);
      return ctx;
    }

    function noiseBuffer(seconds) {
      if (!ctx) return null;
      if (noiseBufferCache && noiseBufferCache.duration >= seconds) return noiseBufferCache;
      const len = Math.max(1, Math.floor(ctx.sampleRate * Math.max(seconds, 0.5)));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      noiseBufferCache = buf;
      return buf;
    }

    function noiseSource(seconds) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(seconds);
      src.loop = true;
      return src;
    }

    function makeDistortionCurve(amount) {
      const k = amount || 20;
      const n = 1024;
      const curve = new Float32Array(n);
      const deg = Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      return curve;
    }

    function initOnGesture() {
      if (unlocked) return;
      unlocked = true;
      ensure();
      window.removeEventListener('pointerdown', initOnGesture);
      window.removeEventListener('keydown', initOnGesture);
      window.removeEventListener('touchstart', initOnGesture);
    }

    /* ---------- public sound generators ---------- */

    /**
     * Deep percussive blast: sub-oscillator punch + filtered white-noise burst
     * + saturation transient, all with exponential decay.
     * @param {number} intensity 0.2 – 3
     */
    function playExplosion(intensity) {
      const c = ensure();
      if (!c || muted) return;

      const I = clamp(Number(intensity) || 1, 0.2, 3);
      const t = c.currentTime;

      /* --- 1. Sub-bass punch --- */
      const sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140 * I, t);
      sub.frequency.exponentialRampToValueAtTime(16, t + 0.75);

      const subGain = c.createGain();
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(0.95 * Math.min(I, 1.7), t + 0.014);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

      const shaper = c.createWaveShaper();
      shaper.curve = makeDistortionCurve(12);
      shaper.oversample = '2x';

      sub.connect(shaper);
      shaper.connect(subGain);
      subGain.connect(master);
      sub.start(t);
      sub.stop(t + 0.95);

      /* --- 2. White-noise debris burst --- */
      const burst = noiseSource(1.0);
      const burstFilter = c.createBiquadFilter();
      burstFilter.type = 'lowpass';
      burstFilter.frequency.setValueAtTime(clamp(3200 * I, 400, 12000), t);
      burstFilter.frequency.exponentialRampToValueAtTime(110, t + 0.85);
      burstFilter.Q.value = 0.9;

      const burstGain = c.createGain();
      burstGain.gain.setValueAtTime(0.0001, t);
      burstGain.gain.exponentialRampToValueAtTime(0.85 * Math.min(I, 1.6), t + 0.008);
      burstGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.88);

      burst.connect(burstFilter);
      burstFilter.connect(burstGain);
      burstGain.connect(master);
      burst.start(t);
      burst.stop(t + 0.92);

      /* --- 3. High crack transient --- */
      const crack = noiseSource(0.2);
      const crackFilter = c.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.value = 2400;

      const crackGain = c.createGain();
      crackGain.gain.setValueAtTime(0.55 * Math.min(I, 1.4), t);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(master);
      crack.start(t);
      crack.stop(t + 0.18);

      /* --- 4. Rumble tail --- */
      const rumble = c.createOscillator();
      rumble.type = 'triangle';
      rumble.frequency.setValueAtTime(52, t);
      rumble.frequency.exponentialRampToValueAtTime(24, t + 1.4);

      const rumbleGain = c.createGain();
      rumbleGain.gain.setValueAtTime(0.0001, t + 0.05);
      rumbleGain.gain.exponentialRampToValueAtTime(0.28, t + 0.16);
      rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);

      rumble.connect(rumbleGain);
      rumbleGain.connect(master);
      rumble.start(t + 0.05);
      rumble.stop(t + 1.55);
    }

    /**
     * Boiling-liquid bubbling: randomised sine "clicks" with rising pitch.
     * @param {number} duration seconds
     */
    function playBubbling(duration) {
      const c = ensure();
      if (!c || muted) return;

      const dur = clamp(Number(duration) || 2, 0.1, 30);
      const start = c.currentTime;
      const end = start + dur;
      let t = start;

      while (t < end) {
        const osc = c.createOscillator();
        osc.type = 'sine';

        const base = 300 + Math.random() * 700;
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * (1.6 + Math.random() * 0.8), t + 0.055);

        const g = c.createGain();
        const peak = 0.05 + Math.random() * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

        const pan = c.createStereoPanner ? c.createStereoPanner() : null;
        if (pan) {
          pan.pan.value = (Math.random() * 2 - 1) * 0.6;
          osc.connect(g);
          g.connect(pan);
          pan.connect(master);
        } else {
          osc.connect(g);
          g.connect(master);
        }

        osc.start(t);
        osc.stop(t + 0.09);

        t += 0.04 + Math.random() * 0.12;
      }
    }

    /**
     * Effervescent gas evolution: high-pass filtered noise with a soft envelope.
     * @param {number} duration seconds
     */
    function playGasFizz(duration) {
      const c = ensure();
      if (!c || muted) return;

      const dur = clamp(Number(duration) || 1.5, 0.1, 30);
      const t = c.currentTime;

      const src = noiseSource(2.0);

      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;

      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4400;
      bp.Q.value = 0.55;

      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.09);
      g.gain.setValueAtTime(0.13, t + Math.max(0.12, dur - 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(hp);
      hp.connect(bp);
      bp.connect(g);
      g.connect(master);

      src.start(t);
      src.stop(t + dur + 0.08);
    }

    /**
     * Continuous Bunsen burner hiss (band-passed noise loop).
     * @param {number} volume 0 – 1
     */
    function playBurnerHiss(volume) {
      const c = ensure();
      if (!c) return;

      const vol = clamp(Number(volume) || 0, 0, 1);

      if (!burnerNodes) {
        const src = noiseSource(2.0);

        const hp = c.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 700;

        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 0.7;

        const g = c.createGain();
        g.gain.value = 0.0001;

        src.connect(hp);
        hp.connect(bp);
        bp.connect(g);
        g.connect(master);

        src.start(c.currentTime);

        burnerNodes = { source: src, gain: g, bandpass: bp, highpass: hp };
      }

      // Subtle timbre shift with intensity
      if (burnerNodes.bandpass && burnerNodes.bandpass.frequency) {
        burnerNodes.bandpass.frequency.setTargetAtTime(1100 + vol * 1400, c.currentTime, 0.15);
      }

      const target = muted ? 0.0001 : Math.max(0.0001, vol * 0.2);
      burnerNodes.gain.gain.cancelScheduledValues(c.currentTime);
      burnerNodes.gain.gain.setTargetAtTime(target, c.currentTime, 0.09);
    }

    /** Fade the burner hiss to silence. */
    function stopBurnerHiss() {
      if (!ctx || !burnerNodes) return;
      burnerNodes.gain.gain.cancelScheduledValues(ctx.currentTime);
      burnerNodes.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    }

    /** Short resonant glass/UI click. */
    function playGlassClick() {
      const c = ensure();
      if (!c || muted) return;

      const t = c.currentTime;

      const osc = c.createOscillator();
      osc.type = 'triangle';
      const f0 = 1900 + Math.random() * 900;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.075);

      const partial = c.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(f0 * 2.02, t);
      partial.frequency.exponentialRampToValueAtTime(f0 * 1.2, t + 0.06);

      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

      const pg = c.createGain();
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.05, t + 0.003);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      osc.connect(g);
      g.connect(master);
      partial.connect(pg);
      pg.connect(master);

      osc.start(t); osc.stop(t + 0.1);
      partial.start(t); partial.stop(t + 0.07);
    }

    /** Two-tone descending hazard alert. */
    function playWarning() {
      const c = ensure();
      if (!c || muted) return;

      const t = c.currentTime;
      const tones = [
        { f: 980, at: 0.0, dur: 0.18 },
        { f: 740, at: 0.22, dur: 0.18 },
        { f: 980, at: 0.44, dur: 0.18 },
        { f: 560, at: 0.66, dur: 0.34 }
      ];

      tones.forEach(function (tone) {
        const start = t + tone.at;
        const osc = c.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(tone.f, start);

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.09, start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);

        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;

        osc.connect(lp);
        lp.connect(g);
        g.connect(master);

        osc.start(start);
        osc.stop(start + tone.dur + 0.02);
      });
    }

    /** Soft affirmative chime for successful operations. */
    function playConfirm() {
      const c = ensure();
      if (!c || muted) return;
      const t = c.currentTime;
      [660, 990].forEach(function (f, i) {
        const start = t + i * 0.08;
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, start);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.11, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    }

    /** Metallic "clank" for apparatus interactions. */
    function playClank() {
      const c = ensure();
      if (!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      osc.connect(lp);
      lp.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.22);
    }

    /* ---------- lifecycle ---------- */

    window.addEventListener('pointerdown', initOnGesture, { passive: true });
    window.addEventListener('keydown', initOnGesture, { passive: true });
    window.addEventListener('touchstart', initOnGesture, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) {
        stopBurnerHiss();
        if (typeof ctx.suspend === 'function') ctx.suspend().catch(function () {});
      } else if (typeof ctx.resume === 'function') {
        ctx.resume().catch(function () {});
      }
    });

    return {
      ensure: ensure,
      playExplosion: playExplosion,
      playBubbling: playBubbling,
      playGasFizz: playGasFizz,
      playBurnerHiss: playBurnerHiss,
      stopBurnerHiss: stopBurnerHiss,
      playGlassClick: playGlassClick,
      playWarning: playWarning,
      playConfirm: playConfirm,
      playClank: playClank,
      isMuted: function () { return muted; },
      setMuted: function (state) {
        muted = !!state;
        if (muted) stopBurnerHiss();
        return muted;
      },
      toggleMuted: function () {
        muted = !muted;
        if (muted) stopBurnerHiss();
        return muted;
      }
    };
  })();

  /* ==========================================================================
     2. GLOBAL APPLICATION STATE
     ========================================================================== */

  const AppState = {
    booted: false,
    currentState: null,
    pendingHazard: null,
    activeCategory: 'All',
    libraryOpen: false,
    hazardOpen: false,
    tutorOpen: false,
    lastReaction: null,
    enginePaused: false,
    pollHandle: null,
    waterAmount: 50
  };

  const dom = {};

  const LOG_TAGS = {
    info: 'INFO',
    reaction: 'REACTION',
    exo: 'EXOTHERMIC',
    hazard: 'HAZARD',
    warn: 'WARNING',
    success: 'OK',
    system: 'SYSTEM'
  };

  const CATEGORY_ORDER = [
    'All',
    'Elements',
    'Metals',
    'Non-Metals',
    'Oxides',
    'Acids',
    'Bases',
    'Salts',
    'Solvents',
    'Indicators'
  ];

  const CATEGORY_ALIASES = {
    'Elements': ['element', 'elements', 'atom', 'atoms'],
    'Metals': ['metal', 'metals', 'alkali metal', 'alkaline earth', 'transition metal', 'lanthanide', 'actinide'],
    'Non-Metals': ['non-metal', 'nonmetal', 'nonmetals', 'non-metals', 'halogen', 'noble gas', 'noble gases'],
    'Oxides': ['oxide', 'oxides'],
    'Acids': ['acid', 'acids', 'oxyacid', 'oxyacids'],
    'Bases': ['base', 'bases', 'alkali', 'hydroxide', 'hydroxides'],
    'Salts': ['salt', 'salts', 'ionic', 'ionic compound'],
    'Solvents': ['solvent', 'solvents', 'water', 'organic solvent'],
    'Indicators': ['indicator', 'indicators', 'dye', 'dyes']
  };

  /* ==========================================================================
     3. LOG TERMINAL
     ========================================================================== */

  function addLog(message, tag) {
    const terminal = dom.logTerminal;
    if (!terminal) return;

    const kind = LOG_TAGS[tag] ? tag : 'info';
    const line = document.createElement('div');
    line.className = 'log-line log-' + kind;

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = nowStamp() + ' ';

    const tagEl = document.createElement('span');
    tagEl.className = 'log-tag';
    tagEl.textContent = '[' + LOG_TAGS[kind] + '] ';

    const msgEl = document.createElement('span');
    msgEl.className = 'log-msg';
    msgEl.textContent = String(message == null ? '' : message);

    line.appendChild(ts);
    line.appendChild(tagEl);
    line.appendChild(msgEl);

    terminal.insertBefore(line, terminal.firstChild);

    // Cap the terminal to 400 lines
    while (terminal.children.length > 400) {
      terminal.removeChild(terminal.lastChild);
    }
  }

  /* ==========================================================================
     4. DOM CACHE
     ========================================================================== */

  function cacheDom() {
    /* --- Banners / state --- */
    dom.stateBanner = pick([
      '[data-role="state-banner"]', '#state-banner', '.state-banner',
      '#reaction-state', '.reaction-state'
    ]);
    dom.equation = pick([
      '[data-role="equation"]', '#equation', '#balanced-equation',
      '.balanced-equation', '#equation-display'
    ]);
    dom.ions = pick([
      '[data-role="ions"]', '#ions', '#ion-species', '.ion-species',
      '#active-ions'
    ]);
    dom.physicalState = pick([
      '[data-role="physical-state"]', '#physical-state', '.physical-state',
      '#solution-state'
    ]);

    /* --- Analytics --- */
    dom.mass = pick(['[data-role="mass"]', '#mass', '#stat-mass', '.stat-mass']);
    dom.volume = pick(['[data-role="volume"]', '#volume', '#stat-volume', '.stat-volume']);
    dom.molarity = pick(['[data-role="molarity"]', '#molarity', '#stat-molarity', '.stat-molarity']);
    dom.heat = pick(['[data-role="heat"]', '#heat', '#heat-exchange', '#stat-heat', '.stat-heat']);
    dom.enthalpy = pick(['[data-role="enthalpy"]', '#enthalpy', '#delta-h', '#stat-enthalpy', '.stat-enthalpy']);
    dom.gasVolume = pick(['[data-role="gas-volume"]', '#gas-volume', '#stp-gas', '#stat-gas', '.stat-gas']);
    dom.phValue = pick(['[data-role="ph-value"]', '#ph-value', '#ph-readout', '.ph-readout']);
    dom.phFill = pick(['[data-role="ph-fill"]', '#ph-meter-fill', '.ph-meter-fill', '#ph-fill']);
    dom.phMeter = pick(['[data-role="ph-meter"]', '#ph-meter', '.ph-meter']);

    /* --- Log terminal --- */
    dom.logTerminal = pick([
      '[data-role="log-terminal"]', '#log-terminal', '.log-terminal',
      '#reaction-log', '.reaction-log'
    ]);

    /* --- Sliders --- */
    dom.phSlider = pick(['[data-role="ph-slider"]', '#ph-slider', '#ph-control', 'input[name="ph"]']);
    dom.flameSlider = pick(['[data-role="flame-slider"]', '#flame-slider', '#burner-slider', 'input[name="flame"]']);
    dom.stirrerSlider = pick(['[data-role="stirrer-slider"]', '#stirrer-slider', '#rpm-slider', 'input[name="stirrer"]']);
    dom.dripSlider = pick(['[data-role="drip-slider"]', '#drip-slider', '#titration-slider', 'input[name="drip"]']);

    dom.phLabel = pick(['[data-role="ph-slider-value"]', '#ph-slider-value', '#ph-output']);
    dom.flameLabel = pick(['[data-role="flame-slider-value"]', '#flame-slider-value', '#flame-output']);
    dom.stirrerLabel = pick(['[data-role="stirrer-slider-value"]', '#stirrer-slider-value', '#stirrer-output']);
    dom.dripLabel = pick(['[data-role="drip-slider-value"]', '#drip-slider-value', '#drip-output']);

    /* --- Buttons --- */
    dom.btnOpenLibrary = pick(['[data-action="open-library"]', '#open-library', '#btn-open-library']);
    dom.btnClearVessel = pick(['[data-action="clear-vessel"]', '#clear-vessel', '#btn-clear']);
    dom.btnRefill = pick(['[data-action="refill"]', '#refill', '#btn-refill']);
    dom.btnStirPulse = pick(['[data-action="stir-pulse"]', '#stir-pulse', '#btn-stir']);
    dom.btnFlush = pick(['[data-action="flush"]', '#flush', '#btn-flush']);
    dom.btnAddWater = pick(['[data-action="add-water"]', '#add-water', '#btn-add-water']);
    dom.waterInput = pick(['[data-role="water-amount"]', '#water-amount', 'input[name="water-amount"]']);
    dom.btnMute = pick(['[data-action="toggle-mute"]', '#mute-toggle', '#btn-mute']);
    dom.btnTutor = pick(['[data-action="toggle-tutor"]', '#ai-tutor-toggle', '#btn-tutor']);

    /* --- AI Tutor --- */
    dom.tutorDrawer = pick(['[data-role="ai-tutor"]', '#ai-tutor', '#ai-tutor-drawer', '.ai-tutor-drawer']);
    dom.tutorBody = pick(['[data-role="ai-tutor-body"]', '#ai-tutor-body', '.ai-tutor-body', '#ai-tutor-content']);

    /* --- Modals (may be created later) --- */
    dom.libraryModal = pick(['[data-role="library-modal"]', '#library-modal', '#reagent-modal', '.library-modal']);
    dom.libraryTabs = pick(['[data-role="library-tabs"]', '#library-tabs', '.library-tabs']);
    dom.libraryList = pick(['[data-role="library-list"]', '#library-list', '#reagent-list', '.library-list']);

    dom.hazardModal = pick(['[data-role="hazard-modal"]', '#hazard-modal', '.hazard-modal']);
  }

  /* ==========================================================================
     5. CHEMICAL DATABASE ACCESS
     ========================================================================== */

  function getChemicals() {
    const db = window.ChemicalsDB;
    if (!db) return [];

    if (Array.isArray(db)) return db.filter(Boolean);
    if (Array.isArray(db.chemicals)) return db.chemicals.filter(Boolean);
    if (Array.isArray(db.reagents)) return db.reagents.filter(Boolean);
    if (Array.isArray(db.items)) return db.items.filter(Boolean);
    if (typeof db.getAll === 'function') {
      const out = safeCall(db.getAll, db, [], []);
      if (Array.isArray(out)) return out.filter(Boolean);
    }

    // Plain object map: { hcl: {...}, naoh: {...} }
    const out = [];
    Object.keys(db).forEach(function (key) {
      const val = db[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const clone = Object.assign({}, val);
        if (!clone.id) clone.id = key;
        out.push(clone);
      }
    });
    return out;
  }

  function chemCategory(chem) {
    if (!chem) return 'Uncategorised';
    const raw = chem.category || chem.group || chem.type || chem.class || '';
    return String(raw).trim() || 'Uncategorised';
  }

  function matchesCategory(chem, category) {
    if (category === 'All') return true;
    const aliases = CATEGORY_ALIASES[category] || [category.toLowerCase()];
    const raw = chemCategory(chem).toLowerCase();
    for (let i = 0; i < aliases.length; i++) {
      const a = aliases[i];
      if (raw === a || raw.indexOf(a) !== -1) return true;
    }
    // Fallback: also scan tags array
    const tags = chem.tags || chem.keywords;
    if (Array.isArray(tags)) {
      for (let i = 0; i < tags.length; i++) {
        const t = String(tags[i]).toLowerCase();
        if (aliases.indexOf(t) !== -1) return true;
      }
    }
    return false;
  }

  function chemName(chem) {
    return chem.name || chem.label || chem.title || chem.id || 'Unknown Reagent';
  }

  function chemFormula(chem) {
    return chem.formula || chem.chemicalFormula || chem.symbol || '';
  }

  function chemUnit(chem) {
    return chem.unit || chem.defaultUnit || 'mL';
  }

  function chemHazardLabel(chem) {
    if (chem.hazardLabel) return String(chem.hazardLabel);
    if (chem.isExplosive || chem.explosive) return 'Explosive';
    const h = chem.hazard || chem.hazardLevel || chem.risk;
    if (h == null) return '';
    if (typeof h === 'string') return h;
    if (typeof h === 'number') {
      if (h >= 4) return 'Severe Hazard';
      if (h >= 3) return 'High Hazard';
      if (h >= 2) return 'Moderate Hazard';
      if (h >= 1) return 'Low Hazard';
      return 'Non-Hazardous';
    }
    return '';
  }

  function isHighHazard(chem) {
    if (!chem) return false;
    if (chem.isExplosive || chem.explosive || chem.radioactive) return true;
    const h = chem.hazardLevel != null ? chem.hazardLevel : chem.hazard;
    if (typeof h === 'number' && h >= 3) return true;
    if (typeof h === 'string') {
      const s = h.toLowerCase();
      if (s.indexOf('explos') !== -1 || s.indexOf('severe') !== -1 || s.indexOf('high') !== -1) return true;
    }
    return false;
  }

  /* ==========================================================================
     6. REAGENT LIBRARY MODAL
     ========================================================================== */

  function ensureLibraryModal() {
    if (dom.libraryModal) return dom.libraryModal;

    const modal = document.createElement('div');
    modal.id = 'library-modal';
    modal.className = 'modal-overlay library-modal hidden';
    modal.setAttribute('data-role', 'library-modal');
    modal.innerHTML =
      '<div class="modal-panel library-panel" role="dialog" aria-modal="true" aria-label="Reagent and Element Library">' +
        '<header class="modal-header">' +
          '<h2 class="modal-title">🧪 Reagent &amp; Element Library</h2>' +
          '<button type="button" class="btn btn-close" data-action="close-library">❌ CLOSE</button>' +
        '</header>' +
        '<nav class="library-tabs" data-role="library-tabs" id="library-tabs"></nav>' +
        '<div class="library-list" data-role="library-list" id="library-list"></div>' +
      '</div>';

    document.body.appendChild(modal);

    dom.libraryModal = modal;
    dom.libraryTabs = modal.querySelector('[data-role="library-tabs"]');
    dom.libraryList = modal.querySelector('[data-role="library-list"]');
    return modal;
  }

  function buildCategoryTabs() {
    const tabsRoot = dom.libraryTabs;
    if (!tabsRoot) return;

    const chemicals = getChemicals();
    const present = CATEGORY_ORDER.filter(function (cat) {
      if (cat === 'All') return chemicals.length > 0;
      return chemicals.some(function (c) { return matchesCategory(c, cat); });
    });

    // Ensure "All" always present
    if (present.indexOf('All') === -1) present.unshift('All');

    tabsRoot.innerHTML = '';

    present.forEach(function (cat) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'library-tab' + (cat === AppState.activeCategory ? ' active' : '');
      btn.setAttribute('data-category', cat);
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        AppState.activeCategory = cat;
        AudioSynth.playGlassClick();
        buildCategoryTabs();
        renderLibraryItems();
      });
      tabsRoot.appendChild(btn);
    });
  }

  function renderLibraryItems() {
    const listRoot = dom.libraryList;
    if (!listRoot) return;

    const chemicals = getChemicals();
    const filtered = chemicals.filter(function (c) {
      return matchesCategory(c, AppState.activeCategory);
    });

    listRoot.innerHTML = '';

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = 'No reagents available in this category.';
      listRoot.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    filtered.forEach(function (chem, index) {
      const id = chem.id != null ? String(chem.id) : ('chem-' + index);
      const hazard = chemHazardLabel(chem);
      const high = isHighHazard(chem);

      const card = document.createElement('div');
      card.className = 'reagent-card' + (high ? ' reagent-card--hazard' : '');
      card.setAttribute('data-chem-id', id);

      const hazardTag = hazard
        ? '<span class="tag tag-hazard' + (high ? ' tag-hazard--high' : '') + '">' + esc(hazard) + '</span>'
        : '<span class="tag tag-safe">Stable</span>';

      card.innerHTML =
        '<div class="reagent-head">' +
          '<span class="reagent-name">' + esc(chemName(chem)) + '</span>' +
          '<span class="reagent-formula">' + esc(chemFormula(chem)) + '</span>' +
        '</div>' +
        '<div class="reagent-meta">' +
          '<span class="tag tag-category">' + esc(chemCategory(chem)) + '</span>' +
          hazardTag +
        '</div>' +
        '<div class="reagent-controls">' +
          '<input type="number" class="reagent-qty" value="10" min="0.1" max="5000" step="0.1" ' +
            'aria-label="Quantity for ' + esc(chemName(chem)) + '">' +
          '<span class="reagent-unit">' + esc(chemUnit(chem)) + '</span>' +
          '<button type="button" class="btn btn-add" data-add-id="' + esc(id) + '">+ ADD</button>' +
        '</div>';

      frag.appendChild(card);
    });

    listRoot.appendChild(frag);
  }

  function openLibrary() {
    const modal = ensureLibraryModal();
    if (!modal) return;

    AppState.libraryOpen = true;
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    buildCategoryTabs();
    renderLibraryItems();

    AudioSynth.playGlassClick();
    addLog('Reagent Library opened.', 'system');
  }

  function closeLibrary() {
    if (!dom.libraryModal) return;
    AppState.libraryOpen = false;
    dom.libraryModal.classList.add('hidden');
    dom.libraryModal.classList.remove('visible');
    dom.libraryModal.setAttribute('aria-hidden', 'true');
    if (!AppState.hazardOpen) document.body.classList.remove('modal-open');
    AudioSynth.playGlassClick();
  }

  function findChemicalById(id) {
    const chemicals = getChemicals();
    for (let i = 0; i < chemicals.length; i++) {
      const c = chemicals[i];
      if (c && (String(c.id) === String(id) || String(c.key) === String(id))) return c;
    }
    return null;
  }

  /* ==========================================================================
     7. HAZARD INTERCEPT SAFETY SYSTEM
     ========================================================================== */

  function ensureHazardModal() {
    if (dom.hazardModal) return dom.hazardModal;

    const modal = document.createElement('div');
    modal.id = 'hazard-modal';
    modal.className = 'modal-overlay hazard-modal hidden';
    modal.setAttribute('data-role', 'hazard-modal');
    modal.innerHTML =
      '<div class="modal-panel hazard-panel" role="alertdialog" aria-modal="true" aria-label="Hazard Intercept">' +
        '<div class="hazard-stripes"></div>' +
        '<h2 class="hazard-title">⚠️ HAZARD INTERCEPT</h2>' +
        '<p class="hazard-desc" data-role="hazard-desc">A potentially dangerous reaction has been detected.</p>' +
        '<div class="hazard-detail" data-role="hazard-detail"></div>' +
        '<div class="hazard-actions">' +
          '<button type="button" class="btn btn-danger" data-hazard="allow">⚠️ ALLOW &amp; EXECUTE</button>' +
          '<button type="button" class="btn btn-safe" data-hazard="cancel">🛑 CANCEL &amp; ABORT</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    dom.hazardModal = modal;
    return modal;
  }

  function showHazardModal(payload) {
    const modal = ensureHazardModal();
    if (!modal) return;

    AppState.hazardOpen = true;

    const desc = modal.querySelector('[data-role="hazard-desc"]');
    const detail = modal.querySelector('[data-role="hazard-detail"]');

    const chem = payload && payload.chemical ? payload.chemical : null;
    const name = chem ? chemName(chem) : (payload && payload.name ? payload.name : 'Unknown reagent');
    const formula = chem ? chemFormula(chem) : '';
    const label = payload && payload.message ? payload.message : 'Reaction flagged as explosive / high hazard.';

    setText(desc, label);

    if (detail) {
      const rows = [];
      rows.push('<div class="hazard-row"><span>Reagent</span><strong>' + esc(name) + '</strong></div>');
      if (formula) rows.push('<div class="hazard-row"><span>Formula</span><strong>' + esc(formula) + '</strong></div>');
      if (payload && payload.quantity != null) {
        rows.push('<div class="hazard-row"><span>Quantity</span><strong>' + esc(payload.quantity) + ' ' + esc(payload.unit || 'mL') + '</strong></div>');
      }
      const risk = payload && payload.risk ? payload.risk : (chem ? chemHazardLabel(chem) : 'High');
      rows.push('<div class="hazard-row"><span>Risk Class</span><strong class="hazard-risk">' + esc(risk) + '</strong></div>');
      detail.innerHTML = rows.join('');
    }

    modal.classList.remove('hidden');
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.body.classList.add('hazard-active');
  }

  function hideHazardModal() {
    if (!dom.hazardModal) return;
    AppState.hazardOpen = false;
    dom.hazardModal.classList.add('hidden');
    dom.hazardModal.classList.remove('visible');
    dom.hazardModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hazard-active');
    if (!AppState.libraryOpen) document.body.classList.remove('modal-open');
  }

  /**
   * Intercept a reagent addition flagged as hazardous.
   * Pauses simulation and rendering, plays alert, shows modal.
   */
  function triggerHazardIntercept(payload) {
    const engine = window.ChemistryEngine;
    const renderer = window.CanvasRenderer;

    AppState.pendingHazard = payload || {};

    // 1. Pause simulation + rendering
    AppState.enginePaused = true;
    safeCall(engine && engine.pause, engine, []);
    safeCall(engine && engine.setPaused, engine, [true]);
    safeCall(renderer && renderer.pause, renderer, []);

    // 2. Warning sound
    AudioSynth.playWarning();
    AudioSynth.stopBurnerHiss();

    // 3. Modal
    showHazardModal(AppState.pendingHazard);

    const chem = AppState.pendingHazard.chemical;
    addLog('HAZARD INTERCEPT — ' + (chem ? chemName(chem) : 'unknown reagent') +
      ' flagged as explosive/high hazard. Simulation paused.', 'hazard');
  }

  function resumeEngineAfterHazard() {
    const engine = window.ChemistryEngine;
    const renderer = window.CanvasRenderer;

    AppState.enginePaused = false;
    safeCall(engine && engine.resume, engine, []);
    safeCall(engine && engine.setPaused, engine, [false]);
    safeCall(renderer && renderer.resume, renderer, []);
  }

  function allowHazardExecution() {
    const payload = AppState.pendingHazard || {};
    const engine = window.ChemistryEngine;
    const renderer = window.CanvasRenderer;

    hideHazardModal();
    AppState.pendingHazard = null;

    // Resume engine and commit the pending addition
    resumeEngineAfterHazard();

    let committed = false;
    if (typeof engine.confirmPending === 'function') {
      safeCall(engine.confirmPending, engine, []);
      committed = true;
    } else if (typeof engine.executePendingHazard === 'function') {
      safeCall(engine.executePendingHazard, engine, []);
      committed = true;
    } else if (typeof engine.commitPendingAddition === 'function') {
      safeCall(engine.commitPendingAddition, engine, []);
      committed = true;
    }

    if (!committed && payload.chemical) {
      // Re-issue the addition with the hazard bypass flag
      safeCall(engine && engine.addChemical, engine, [payload.chemical.id, payload.quantity, { force: true }]);
    }

    // === VISUAL FX ===
    const intensity = payload.intensity != null ? payload.intensity : 1.6;

    safeCall(renderer && renderer.triggerExplosion, renderer, [intensity, payload.position]);
    safeCall(renderer && renderer.explode, renderer, [intensity]);
    safeCall(renderer && renderer.spawnSmoke, renderer, [intensity]);
    safeCall(renderer && renderer.shakeScreen, renderer, [intensity]);
    safeCall(renderer && renderer.flash, renderer, [0.85]);

    // Screen shake (CSS class + inline fallback)
    document.body.classList.add('screen-shake');
    const canvas = pick(['#lab-canvas', '#canvas', 'canvas']);
    if (canvas && canvas.animate) {
      try {
        canvas.animate(
          [
            { transform: 'translate(0px, 0px) rotate(0deg)' },
            { transform: 'translate(-14px, 8px) rotate(-0.8deg)' },
            { transform: 'translate(12px, -9px) rotate(0.9deg)' },
            { transform: 'translate(-8px, 6px) rotate(-0.5deg)' },
            { transform: 'translate(6px, -4px) rotate(0.3deg)' },
            { transform: 'translate(0px, 0px) rotate(0deg)' }
          ],
          { duration: 720, easing: 'cubic-bezier(.36,.07,.19,.97)' }
        );
      } catch (e) { /* no-op */ }
    }
    setTimeout(function () { document.body.classList.remove('screen-shake'); }, 760);

    // Audio blast
    AudioSynth.playExplosion(intensity);

    addLog('⚠️ ALLOW & EXECUTE — Detonation authorised. Blast FX triggered.', 'hazard');
    addLog('Exothermic runaway recorded in the reaction vessel.', 'exo');

    updateTutorFromState(AppState.currentState, 'explosion');
  }

  function cancelHazardExecution() {
    const payload = AppState.pendingHazard || {};
    const engine = window.ChemistryEngine;
    const renderer = window.CanvasRenderer;

    hideHazardModal();
    AppState.pendingHazard = null;

    // Revert the addition safely
    let reverted = false;
    if (typeof engine.cancelPending === 'function') {
      safeCall(engine.cancelPending, engine, []);
      reverted = true;
    } else if (typeof engine.abortPendingHazard === 'function') {
      safeCall(engine.abortPendingHazard, engine, []);
      reverted = true;
    } else if (typeof engine.revertLastAddition === 'function') {
      safeCall(engine.revertLastAddition, engine, []);
      reverted = true;
    }

    if (!reverted && payload.chemical && typeof engine.removeChemical === 'function') {
      safeCall(engine.removeChemical, engine, [payload.chemical.id, payload.quantity]);
      reverted = true;
    }

    // Resume simulation without executing the reaction
    resumeEngineAfterHazard();
    safeCall(renderer && renderer.clearEffects, renderer, []);
    safeCall(renderer && renderer.setExplosionPending, renderer, [false]);

    AudioSynth.playConfirm();
    addLog('🛑 CANCEL & ABORT — Reagent addition reverted. Vessel remains safe.', 'warn');
  }

  /* ==========================================================================
     8. CHEMICAL ADDITION PIPELINE
     ========================================================================== */

  function normaliseAddResult(result) {
    if (!result || typeof result !== 'object') return null;

    const explosive = result.isExplosive === true ||
      result.explosive === true ||
      result.requiresConfirmation === true ||
      result.hazard === 'high' ||
      result.hazard === 'severe' ||
      result.hazardLevel >= 3;

    if (!explosive) return null;

    return {
      raw: result,
      intensity: result.intensity != null ? result.intensity : 1.6,
      message: result.message || result.hazardMessage || 'Explosive reaction pathway detected.',
      risk: result.risk || result.hazardLabel || 'Explosive / Severe',
      position: result.position || null
    };
  }

  function attemptAddChemical(chemId, quantity) {
    const engine = window.ChemistryEngine;
    const chem = findChemicalById(chemId);
    const qty = Number(quantity);
    const safeQty = isFinite(qty) && qty > 0 ? qty : 10;
    const unit = chem ? chemUnit(chem) : 'mL';

    if (!engine || typeof engine.addChemical !== 'function') {
      addLog('ChemistryEngine is unavailable — cannot add reagent.', 'warn');
      return;
    }

    // Pre-emptive hazard scan (engine may not return flags)
    const preHazard = chem && isHighHazard(chem);

    let result;
    try {
      result = engine.addChemical(chem ? chem.id : chemId, safeQty);
    } catch (err) {
      console.error('[VirtuaLab] addChemical threw:', err);
      addLog('Reagent addition failed: ' + err.message, 'warn');
      return;
    }

    // Handle async engines
    if (result && typeof result.then === 'function') {
      result.then(function (resolved) {
        handleAddOutcome(chem, safeQty, unit, resolved, preHazard);
      }).catch(function (err) {
        console.error('[VirtuaLab] addChemical rejected:', err);
        addLog('Reagent addition failed: ' + (err && err.message ? err.message : 'unknown error'), 'warn');
      });
      return;
    }

    handleAddOutcome(chem, safeQty, unit, result, preHazard);
  }

  function handleAddOutcome(chem, qty, unit, result, preHazard) {
    const hazardInfo = normaliseAddResult(result);

    if (hazardInfo) {
      triggerHazardIntercept({
        chemical: chem,
        chemicalId: chem ? chem.id : null,
        quantity: qty,
        unit: unit,
        intensity: hazardInfo.intensity,
        message: hazardInfo.message,
        risk: hazardInfo.risk,
        position: hazardInfo.position,
        result: result
      });
      return;
    }

    if (preHazard) {
      // Engine did not self-report, but our database scan flagged it
      triggerHazardIntercept({
        chemical: chem,
        chemicalId: chem ? chem.id : null,
        quantity: qty,
        unit: unit,
        intensity: 1.6,
        message: 'Database hazard classification: ' + chemHazardLabel(chem) + '. Confirm before proceeding.',
        risk: chemHazardLabel(chem)
      });
      return;
    }

    // Normal, safe addition
    AudioSynth.playGlassClick();
    addLog('Added ' + qty + ' ' + unit + ' of ' + (chem ? chemName(chem) : 'reagent') + '.', 'reaction');

    if (result && result.state) {
      applyState(result.state);
    }
    if (result && result.reaction) {
      AppState.lastReaction = result.reaction;
      updateTutorFromState(result.state || AppState.currentState, result.reaction);
    }

    maybePlayReactionAudio(result);
  }

  function maybePlayReactionAudio(result) {
    if (!result || typeof result !== 'object') return;

    const flags = result.effects || result;
    if (flags.gas || flags.gasEvolution) {
      AudioSynth.playGasFizz(flags.gasDuration || 1.8);
    }
    if (flags.bubbles || flags.boiling || flags.effervescence) {
      AudioSynth.playBubbling(flags.bubbleDuration || 2.0);
    }
    if (flags.explosion || flags.explosive) {
      AudioSynth.playExplosion(flags.intensity || 1.5);
    }
  }

  /* ==========================================================================
     9. APPARATUS CONTROLS
     ========================================================================== */

  function bindSlider(slider, labelEl, formatter, onChange) {
    if (!slider) return;

    const handler = function () {
      const value = Number(slider.value);
      if (labelEl) setText(labelEl, formatter(value));
      onChange(value);
    };

    slider.addEventListener('input', handler);
    slider.addEventListener('change', handler);
    handler(); // initial sync
  }

  function bindApparatusControls() {
    const engine = window.ChemistryEngine;

    /* --- pH slider --- */
    bindSlider(
      dom.phSlider,
      dom.phLabel,
      function (v) { return 'pH ' + fmt(v, 2); },
      function (v) {
        safeCall(engine && engine.setPH, engine, [v]);
        safeCall(engine && engine.setPh, engine, [v]);
        updatePhMeter(v);
      }
    );

    /* --- Bunsen flame intensity --- */
    bindSlider(
      dom.flameSlider,
      dom.flameLabel,
      function (v) { return fmt(v, 0) + '%'; },
      function (v) {
        safeCall(engine && engine.setFlame, engine, [v]);
        safeCall(engine && engine.setFlameIntensity, engine, [v]);
        AudioSynth.playBurnerHiss(clamp(v / 100, 0, 1));
        if (v <= 0) AudioSynth.stopBurnerHiss();
      }
    );

    /* --- Magnetic stirrer RPM --- */
    bindSlider(
      dom.stirrerSlider,
      dom.stirrerLabel,
      function (v) { return fmt(v, 0) + ' RPM'; },
      function (v) {
        safeCall(engine && engine.setStirrer, engine, [v]);
        safeCall(engine && engine.setStirSpeed, engine, [v]);
        safeCall(engine && engine.setRPM, engine, [v]);
      }
    );

    /* --- Titration drip valve --- */
    bindSlider(
      dom.dripSlider,
      dom.dripLabel,
      function (v) { return fmt(v, 1) + ' mL/s'; },
      function (v) {
        safeCall(engine && engine.setDripRate, engine, [v]);
        safeCall(engine && engine.setTitrationRate, engine, [v]);
      }
    );

    /* --- Buttons --- */
    if (dom.btnClearVessel) {
      dom.btnClearVessel.addEventListener('click', function () {
        AudioSynth.playClank();
        safeCall(engine && engine.resetVessel, engine, []);
        safeCall(engine && engine.clear, engine, []);
        safeCall(window.CanvasRenderer && window.CanvasRenderer.clear, window.CanvasRenderer, []);
        AudioSynth.stopBurnerHiss();
        addLog('Vessel cleared. All contents flushed to neutral.', 'system');
        AppState.lastReaction = null;
        updateTutorFromState(null, null);
      });
    }

    if (dom.btnRefill) {
      dom.btnRefill.addEventListener('click', function () {
        AudioSynth.playGlassClick();
        safeCall(engine && engine.refill, engine, []);
        safeCall(engine && engine.refillVessel, engine, []);
        addLog('Vessel refilled with distilled water.', 'system');
      });
    }

    if (dom.btnStirPulse) {
      dom.btnStirPulse.addEventListener('click', function () {
        AudioSynth.playBubbling(0.9);
        safeCall(engine && engine.stirPulse, engine, []);
        safeCall(engine && engine.pulseStir, engine, []);
        addLog('Magnetic stirrer pulse engaged.', 'info');
      });
    }

    if (dom.btnFlush) {
      dom.btnFlush.addEventListener('click', function () {
        AudioSynth.playGasFizz(1.2);
        safeCall(engine && engine.flushSystem, engine, []);
        safeCall(engine && engine.flush, engine, []);
        addLog('System flushed. Residual reagents neutralised and drained.', 'system');
      });
    }

    if (dom.waterInput) {
      dom.waterInput.addEventListener('input', function () {
        const v = Number(dom.waterInput.value);
        if (isFinite(v) && v > 0) AppState.waterAmount = v;
      });
      const init = Number(dom.waterInput.value);
      if (isFinite(init) && init > 0) AppState.waterAmount = init;
    }

    if (dom.btnAddWater) {
      dom.btnAddWater.addEventListener('click', function () {
        const amount = AppState.waterAmount || 50;
        AudioSynth.playGlassClick();
        safeCall(engine && engine.addWater, engine, [amount]);
        safeCall(engine && engine.addMeasuredWater, engine, [amount]);
        addLog('Dispensed ' + amount + ' mL of measured distilled water.', 'info');
      });
    }

    if (dom.btnMute) {
      dom.btnMute.addEventListener('click', function () {
        const muted = AudioSynth.toggleMuted();
        dom.btnMute.classList.toggle('muted', muted);
        dom.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
        setText(dom.btnMute, muted ? '🔇 MUTED' : '🔊 SOUND');
        addLog(muted ? 'Audio output muted.' : 'Audio output enabled.', 'system');
        if (!muted) AudioSynth.playGlassClick();
      });
    }

    /* --- Text-based fallbacks for buttons without data-action --- */
    if (!dom.btnClearVessel) {
      const el = findByText('CLEAR VESSEL') || findByText('CLEAR');
      if (el) {
        el.addEventListener('click', function () {
          AudioSynth.playClank();
          safeCall(engine && engine.resetVessel, engine, []);
          addLog('Vessel cleared.', 'system');
        });
      }
    }

    if (!dom.btnRefill) {
      const el = findByText('REFILL');
      if (el) {
        el.addEventListener('click', function () {
          AudioSynth.playGlassClick();
          safeCall(engine && engine.refill, engine, []);
          addLog('Vessel refilled.', 'system');
        });
      }
    }

    if (!dom.btnStirPulse) {
      const el = findByText('STIR PULSE') || findByText('STIR');
      if (el) {
        el.addEventListener('click', function () {
          AudioSynth.playBubbling(0.9);
          safeCall(engine && engine.stirPulse, engine, []);
          addLog('Stir pulse engaged.', 'info');
        });
      }
    }

    if (!dom.btnFlush) {
      const el = findByText('FLUSH SYSTEM') || findByText('FLUSH');
      if (el) {
        el.addEventListener('click', function () {
          AudioSynth.playGasFizz(1.2);
          safeCall(engine && engine.flushSystem, engine, []);
          addLog('System flushed.', 'system');
        });
      }
    }

    if (!dom.btnAddWater) {
      const el = findByText('ADD MEASURED WATER') || findByText('MEASURED WATER');
      if (el) {
        el.addEventListener('click', function () {
          const amount = AppState.waterAmount || 50;
          AudioSynth.playGlassClick();
          safeCall(engine && engine.addWater, engine, [amount]);
          addLog('Dispensed ' + amount + ' mL of water.', 'info');
        });
      }
    }
  }

  /* ==========================================================================
     10. TELEMETRY / STATE BANNER BINDINGS
     ========================================================================== */

  function updatePhMeter(ph) {
    const value = clamp(Number(ph), 0, 14);
    if (!isFinite(value)) return;

    if (dom.phFill) {
      const pct = (value / 14) * 100;
      dom.phFill.style.width = pct + '%';

      let color;
      if (value < 3) color = '#ff2d2d';
      else if (value < 5.5) color = '#ff8a1f';
      else if (value < 7.5) color = '#3ddc84';
      else if (value < 9.5) color = '#2fa8ff';
      else if (value < 12) color = '#7a5cff';
      else color = '#c026d3';

      dom.phFill.style.background = color;
      dom.phFill.style.boxShadow = '0 0 12px ' + color;
    }

    if (dom.phValue) {
      setText(dom.phValue, fmt(value, 2));
    }

    if (dom.phMeter) {
      dom.phMeter.setAttribute('data-ph', String(value.toFixed(2)));
    }
  }

  function applyState(state) {
    if (!state || typeof state !== 'object') return;
    AppState.currentState = state;

    const a = state.analytics || state.metrics || state;

    /* --- Reaction banner --- */
    setText(dom.equation, state.equation || state.balancedEquation || state.reactionEquation || '—');

    const ions = state.ions || state.ionSpecies || state.activeIons;
    if (Array.isArray(ions) && ions.length) {
      setText(dom.ions, ions.join('  •  '));
    } else if (typeof ions === 'string' && ions.trim()) {
      setText(dom.ions, ions);
    } else {
      setText(dom.ions, 'None detected');
    }

    setText(dom.physicalState, state.physicalState || state.solutionState || state.state || 'Idle');

    if (dom.stateBanner) {
      const label = state.banner || state.physicalState || state.state || 'Idle';
      setText(dom.stateBanner, label);
      const tone = state.tone || (state.exothermic ? 'exo' : (state.hazard ? 'hazard' : 'neutral'));
      dom.stateBanner.setAttribute('data-tone', tone);
    }

    /* --- Analytics --- */
    setText(dom.mass, fmt(a.mass != null ? a.mass : state.mass, 2) + ' g');
    setText(dom.volume, fmt(a.volume != null ? a.volume : state.volume, 2) + ' mL');
    setText(dom.molarity, fmt(a.molarity != null ? a.molarity : state.molarity, 4) + ' M');

    const q = a.heat != null ? a.heat : (a.q != null ? a.q : state.heat);
    setText(dom.heat, (q != null && isFinite(Number(q)))
      ? (Number(q) >= 0 ? '+' : '') + fmt(q, 3) + ' kJ'
      : '—');

    const dh = a.enthalpy != null ? a.enthalpy : (state.enthalpy != null ? state.enthalpy : state.deltaH);
    setText(dom.enthalpy, (dh != null && isFinite(Number(dh)))
      ? (Number(dh) >= 0 ? '+' : '') + fmt(dh, 2) + ' kJ/mol'
      : '—');

    const gasVol = a.gasVolume != null ? a.gasVolume : state.gasVolume;
    setText(dom.gasVolume, (gasVol != null && isFinite(Number(gasVol)))
      ? fmt(gasVol, 3) + ' L'
      : '—');

    if (dom.enthalpy) {
      const n = Number(dh);
      dom.enthalpy.setAttribute('data-sign', isFinite(n) ? (n >= 0 ? 'positive' : 'negative') : 'none');
    }

    /* --- pH meter --- */
    const ph = a.pH != null ? a.pH : (state.pH != null ? state.pH : state.ph);
    if (ph != null && isFinite(Number(ph))) updatePhMeter(Number(ph));

    /* --- Reaction detection for logs & tutor --- */
    const reaction = state.reaction || state.lastReaction;
    if (reaction && reaction !== AppState.lastReaction) {
      AppState.lastReaction = reaction;
      const label = typeof reaction === 'string' ? reaction : (reaction.name || reaction.type || 'Reaction');
      addLog('Reaction detected: ' + label, 'reaction');

      if (state.exothermic || (reaction && reaction.exothermic)) {
        addLog('Exothermic heat release — vessel temperature rising.', 'exo');
      }
      if (state.gasEvolution || (reaction && reaction.gas)) {
        AudioSynth.playGasFizz(1.6);
      }
      if (state.boiling || (reaction && reaction.bubbles)) {
        AudioSynth.playBubbling(1.8);
      }

      updateTutorFromState(state, reaction);
    }
  }

  /* ==========================================================================
     11. AI LAB TUTOR PANEL
     ========================================================================== */

  const TUTOR_KNOWLEDGE = {
    neutralisation: {
      title: 'Acid–Base Neutralisation',
      mechanism: 'H⁺ (aq) + OH⁻ (aq) → H₂O (l). Proton transfer from the acid to the hydroxide ion forms water while the spectator ions remain in solution.',
      electron: 'No electron transfer occurs — this is a proton-transfer (Brønsted–Lowry) process. Oxidation states remain unchanged.',
      enthalpy: 'Neutralisation is exothermic (ΔH ≈ −57.1 kJ/mol for strong acid + strong base) because the formation of the O–H bond in water releases more energy than was consumed breaking the H–A and M–OH bonds.'
    },
    combustion: {
      title: 'Combustion',
      mechanism: 'Fuel + O₂ → CO₂ + H₂O. The hydrocarbon is oxidised completely, releasing carbon dioxide and water vapour.',
      electron: 'Carbon is oxidised (loses electrons, oxidation state rises) while oxygen is reduced (gains electrons). This is a classic redox couple.',
      enthalpy: 'Strongly exothermic. The C–H and O=O bonds broken require less energy than the C=O and O–H bonds formed, so ΔH is large and negative.'
    },
    redox: {
      title: 'Oxidation–Reduction (Redox)',
      mechanism: 'Electrons are transferred from the reducing agent (oxidised) to the oxidising agent (reduced). Balancing requires equal electron loss and gain.',
      electron: 'Track oxidation states: an increase signals oxidation (anode), a decrease signals reduction (cathode). The total electron count must balance.',
      enthalpy: 'Enthalpy depends on the relative bond strengths and lattice/solvation energies of the products versus reactants.'
    },
    displacement: {
      title: 'Single Displacement',
      mechanism: 'A + BC → AC + B. A more reactive element displaces a less reactive one from its compound.',
      electron: 'The displaced metal is reduced (gains electrons) while the displacing metal is oxidised (loses electrons).',
      enthalpy: 'Usually exothermic when the displacing metal has a more negative standard reduction potential.'
    },
    precipitation: {
      title: 'Precipitation (Double Displacement)',
      mechanism: 'AB (aq) + CD (aq) → AD (s) + CB (aq). Ions recombine to form an insoluble solid driven by lattice energy.',
      electron: 'No electron transfer. This is an ion-exchange metathesis reaction.',
      enthalpy: 'Enthalpy is often small; the driving force is the large negative entropy change of forming an ordered solid lattice.'
    },
    decomposition: {
      title: 'Decomposition',
      mechanism: 'AB → A + B. A single compound breaks into simpler substances, usually driven by heating, light, or electrolysis.',
      electron: 'Oxidation states redistribute among the products; often a disproportionation if one element appears in multiple states.',
      enthalpy: 'Typically endothermic — energy must be supplied to break the bonds holding the compound together.'
    },
    synthesis: {
      title: 'Synthesis (Combination)',
      mechanism: 'A + B → AB. Two or more reactants combine to form a single product.',
      electron: 'If a metal and non-metal combine, the metal is oxidised and the non-metal is reduced to form an ionic lattice.',
      enthalpy: 'Generally exothermic due to the formation of strong new bonds and lattice energy release.'
    },
    general: {
      title: 'Reaction Analysis',
      mechanism: 'Reactant species collide with sufficient activation energy and correct orientation to rearrange into products.',
      electron: 'Evaluate oxidation states on both sides to determine whether electron transfer (redox) is occurring.',
      enthalpy: 'Compare total bond energies broken versus formed. Net release → exothermic; net absorption → endothermic.'
    }
  };

  function classifyReaction(state, reaction) {
    const text = [
      typeof reaction === 'string' ? reaction : '',
      reaction && reaction.type ? reaction.type : '',
      reaction && reaction.name ? reaction.name : '',
      state && state.reaction ? (typeof state.reaction === 'string' ? state.reaction : '') : '',
      state && state.equation ? state.equation : ''
    ].join(' ').toLowerCase();

    if (text.indexOf('neutralis') !== -1 || text.indexOf('neutraliz') !== -1 ||
        (text.indexOf('acid') !== -1 && text.indexOf('base') !== -1)) return 'neutralisation';
    if (text.indexOf('combust') !== -1 || text.indexOf('burn') !== -1) return 'combustion';
    if (text.indexOf('precipit') !== -1 || text.indexOf('insoluble') !== -1) return 'precipitation';
    if (text.indexOf('displac') !== -1 || text.indexOf('single replacement') !== -1) return 'displacement';
    if (text.indexOf('decompos') !== -1) return 'decomposition';
    if (text.indexOf('synthesis') !== -1 || text.indexOf('combination') !== -1) return 'synthesis';
    if (text.indexOf('redox') !== -1 || text.indexOf('oxid') !== -1 || text.indexOf('reduc') !== -1) return 'redox';
    return 'general';
  }

  function buildTutorHTML(state, reaction) {
    const key = classifyReaction(state, reaction);
    const kb = TUTOR_KNOWLEDGE[key] || TUTOR_KNOWLEDGE.general;

    const eq = (state && (state.equation || state.balancedEquation)) || '—';
    const ions = state && Array.isArray(state.ions) && state.ions.length ? state.ions.join(', ') : 'None detected';
    const ph = state && (state.pH != null ? state.pH : state.ph);
    const dh = state && state.enthalpy != null ? state.enthalpy : null;
    const q = state && state.heat != null ? state.heat : null;
    const molarity = state && state.molarity != null ? state.molarity : null;
    const gasVolume = state && state.gasVolume != null ? state.gasVolume : null;

    let html = '';
    html += '<div class="tutor-section">';
    html += '<h3 class="tutor-heading">🔬 ' + esc(kb.title) + '</h3>';
    html += '<p class="tutor-para"><strong>Balanced equation:</strong> <code>' + esc(eq) + '</code></p>';
    html += '</div>';

    html += '<div class="tutor-section">';
    html += '<h4 class="tutor-sub">Mechanism</h4>';
    html += '<p class="tutor-para">' + esc(kb.mechanism) + '</p>';
    html += '</div>';

    html += '<div class="tutor-section">';
    html += '<h4 class="tutor-sub">Electron Transfer</h4>';
    html += '<p class="tutor-para">' + esc(kb.electron) + '</p>';
    html += '</div>';

    html += '<div class="tutor-section">';
    html += '<h4 class="tutor-sub">Enthalpy Driving Forces</h4>';
    html += '<p class="tutor-para">' + esc(kb.enthalpy) + '</p>';
    html += '</div>';

    html += '<div class="tutor-section tutor-data">';
    html += '<h4 class="tutor-sub">Live Measurements</h4>';
    html += '<ul class="tutor-list">';
    html += '<li><span>Active ions</span><strong>' + esc(ions) + '</strong></li>';
    html += '<li><span>pH</span><strong>' + (ph != null && isFinite(Number(ph)) ? fmt(ph, 2) : '—') + '</strong></li>';
    html += '<li><span>Molarity</span><strong>' + (molarity != null && isFinite(Number(molarity)) ? fmt(molarity, 4) + ' M' : '—') + '</strong></li>';
    html += '<li><span>Heat exchange (q)</span><strong>' + (q != null && isFinite(Number(q)) ? fmt(q, 3) + ' kJ' : '—') + '</strong></li>';
    html += '<li><span>Enthalpy (ΔH)</span><strong>' + (dh != null && isFinite(Number(dh)) ? fmt(dh, 2) + ' kJ/mol' : '—') + '</strong></li>';
    html += '<li><span>STP gas volume</span><strong>' + (gasVolume != null && isFinite(Number(gasVolume)) ? fmt(gasVolume, 3) + ' L' : '—') + '</strong></li>';
    html += '</ul>';
    html += '</div>';

    return html;
  }

  function updateTutorFromState(state, reaction) {
    if (!dom.tutorBody) return;
    dom.tutorBody.innerHTML = buildTutorHTML(state, reaction);
  }

  function openTutor() {
    if (!dom.tutorDrawer) return;
    AppState.tutorOpen = true;
    dom.tutorDrawer.classList.add('open');
    dom.tutorDrawer.classList.remove('closed');
    dom.tutorDrawer.setAttribute('aria-hidden', 'false');
    if (dom.btnTutor) dom.btnTutor.setAttribute('aria-expanded', 'true');
    updateTutorFromState(AppState.currentState, AppState.lastReaction);
    AudioSynth.playGlassClick();
  }

  function closeTutor() {
    if (!dom.tutorDrawer) return;
    AppState.tutorOpen = false;
    dom.tutorDrawer.classList.remove('open');
    dom.tutorDrawer.classList.add('closed');
    dom.tutorDrawer.setAttribute('aria-hidden', 'true');
    if (dom.btnTutor) dom.btnTutor.setAttribute('aria-expanded', 'false');
    AudioSynth.playGlassClick();
  }

  function toggleTutor() {
    if (AppState.tutorOpen) closeTutor();
    else openTutor();
  }

  /* ==========================================================================
     12. EVENT LISTENERS — MODALS, DELEGATION, GLOBAL KEYS
     ========================================================================== */

  function bindLibraryEvents() {
    const modal = ensureLibraryModal();

    /* Open trigger */
    let openBtn = dom.btnOpenLibrary;
    if (!openBtn) {
      openBtn = findByText('OPEN REAGENT') || findByText('REAGENT & ELEMENT LIBRARY') || findByText('LIBRARY');
    }
    if (openBtn) {
      openBtn.addEventListener('click', function (evt) {
        evt.preventDefault();
        openLibrary();
      });
    }

    /* Close triggers inside the modal */
    modal.addEventListener('click', function (evt) {
      const target = evt.target;

      if (target.closest('[data-action="close-library"]') ||
          target.closest('.btn-close') ||
          target.classList.contains('modal-overlay')) {
        closeLibrary();
        return;
      }

      const addBtn = target.closest('[data-add-id]');
      if (addBtn) {
        evt.preventDefault();
        const chemId = addBtn.getAttribute('data-add-id');
        const card = addBtn.closest('.reagent-card');
        const input = card ? card.querySelector('.reagent-qty') : null;
        const qty = input ? Number(input.value) : 10;

        if (!isFinite(qty) || qty <= 0) {
          addLog('Invalid quantity entered for reagent.', 'warn');
          AudioSynth.playWarning();
          return;
        }

        AudioSynth.playGlassClick();
        attemptAddChemical(chemId, qty);
        return;
      }
    });

    /* Backdrop click */
    modal.addEventListener('mousedown', function (evt) {
      if (evt.target === modal) closeLibrary();
    });
  }

  function bindHazardEvents() {
    const modal = ensureHazardModal();

    modal.addEventListener('click', function (evt) {
      const allow = evt.target.closest('[data-hazard="allow"]');
      const cancel = evt.target.closest('[data-hazard="cancel"]');

      if (allow) {
        evt.preventDefault();
        allowHazardExecution();
        return;
      }
      if (cancel) {
        evt.preventDefault();
        cancelHazardExecution();
      }
    });

    /* Backdrop click on hazard modal = safe abort */
    modal.addEventListener('mousedown', function (evt) {
      if (evt.target === modal) cancelHazardExecution();
    });
  }

  function bindGlobalEvents() {
    /* Escape key closes modals / tutor */
    document.addEventListener('keydown', function (evt) {
      if (evt.key !== 'Escape' && evt.key !== 'Esc') return;

      if (AppState.hazardOpen) {
        cancelHazardExecution();
        return;
      }
      if (AppState.libraryOpen) {
        closeLibrary();
        return;
      }
      if (AppState.tutorOpen) {
        closeTutor();
      }
    });

    /* AI Tutor toggle */
    if (dom.btnTutor) {
      dom.btnTutor.addEventListener('click', function (evt) {
        evt.preventDefault();
        toggleTutor();
      });
    } else {
      const el = findByText('AI TUTOR') || findByText('TUTOR');
      if (el) {
        el.addEventListener('click', function (evt) {
          evt.preventDefault();
          toggleTutor();
        });
      }
    }

    /* Delegated clicks for any data-action buttons that appear later */
    document.addEventListener('click', function (evt) {
      const trigger = evt.target.closest('[data-action]');
      if (!trigger) return;

      const action = trigger.getAttribute('data-action');

      switch (action) {
        case 'open-library':
          evt.preventDefault();
          openLibrary();
          break;
        case 'close-library':
          evt.preventDefault();
          closeLibrary();
          break;
        case 'toggle-tutor':
          evt.preventDefault();
          toggleTutor();
          break;
        case 'clear-vessel':
          AudioSynth.playClank();
          safeCall(window.ChemistryEngine && window.ChemistryEngine.resetVessel, window.ChemistryEngine, []);
          addLog('Vessel cleared.', 'system');
          break;
        case 'refill':
          AudioSynth.playGlassClick();
          safeCall(window.ChemistryEngine && window.ChemistryEngine.refill, window.ChemistryEngine, []);
          addLog('Vessel refilled.', 'system');
          break;
        case 'stir-pulse':
          AudioSynth.playBubbling(0.9);
          safeCall(window.ChemistryEngine && window.ChemistryEngine.stirPulse, window.ChemistryEngine, []);
          addLog('Stir pulse engaged.', 'info');
          break;
        case 'flush':
          AudioSynth.playGasFizz(1.2);
          safeCall(window.ChemistryEngine && window.ChemistryEngine.flushSystem, window.ChemistryEngine, []);
          addLog('System flushed.', 'system');
          break;
        case 'add-water':
          AudioSynth.playGlassClick();
          safeCall(window.ChemistryEngine && window.ChemistryEngine.addWater, window.ChemistryEngine, [AppState.waterAmount || 50]);
          addLog('Dispensed ' + (AppState.waterAmount || 50) + ' mL of water.', 'info');
          break;
        default:
          break;
      }
    });

    /* Auto-open tutor on high-interest reaction */
    document.addEventListener('virtualab:reaction', function (evt) {
      const detail = evt.detail || {};
      if (detail.autoTutor && !AppState.tutorOpen) openTutor();
      updateTutorFromState(detail.state || AppState.currentState, detail.reaction || null);
    });

    /* Unlock audio on any first interaction */
    window.addEventListener('pointerdown', function once() {
      AudioSynth.ensure();
      window.removeEventListener('pointerdown', once);
    }, { passive: true });
  }

  /* ==========================================================================
     13. ENGINE EVENT BRIDGE
     ========================================================================== */

  function bindEngineEvents() {
    const engine = window.ChemistryEngine;
    if (!engine) {
      addLog('ChemistryEngine not detected — running in display-only mode.', 'warn');
      return;
    }

    const handlers = {
      log: function (payload) {
        if (!payload) return;
        if (typeof payload === 'string') {
          addLog(payload, 'info');
          return;
        }
        addLog(payload.message || payload.text || '', payload.tag || payload.level || 'info');
      },
      reaction: function (payload) {
        if (!payload) return;
        const label = typeof payload === 'string' ? payload : (payload.name || payload.type || 'Reaction');
        AppState.lastReaction = payload;
        addLog('Reaction: ' + label, 'reaction');
        maybePlayReactionAudio(payload);
        updateTutorFromState(payload.state || AppState.currentState, payload);
      },
      exothermic: function (payload) {
        const msg = (payload && payload.message) || 'Exothermic event — heat released.';
        addLog(msg, 'exo');
      },
      hazard: function (payload) {
        const chem = payload && payload.chemical ? payload.chemical :
          (payload && payload.chemicalId ? findChemicalById(payload.chemicalId) : null);

        triggerHazardIntercept({
          chemical: chem,
          chemicalId: payload ? payload.chemicalId : null,
          quantity: payload ? payload.quantity : null,
          unit: payload ? payload.unit : 'mL',
          intensity: payload && payload.intensity != null ? payload.intensity : 1.6,
          message: (payload && payload.message) || 'Hazardous reaction pathway detected.',
          risk: (payload && payload.risk) || 'High'
        });
      },
      explosion: function (payload) {
        const intensity = payload && payload.intensity != null ? payload.intensity : 1.6;
        safeCall(window.CanvasRenderer && window.CanvasRenderer.triggerExplosion, window.CanvasRenderer, [intensity]);
        safeCall(window.CanvasRenderer && window.CanvasRenderer.spawnSmoke, window.CanvasRenderer, [intensity]);
        safeCall(window.CanvasRenderer && window.CanvasRenderer.shakeScreen, window.CanvasRenderer, [intensity]);
        AudioSynth.playExplosion(intensity);
        document.body.classList.add('screen-shake');
        setTimeout(function () { document.body.classList.remove('screen-shake'); }, 760);
        addLog('Detonation occurred in the reaction vessel!', 'hazard');
      },
      gas: function (payload) {
        AudioSynth.playGasFizz((payload && payload.duration) || 1.8);
      },
      bubbling: function (payload) {
        AudioSynth.playBubbling((payload && payload.duration) || 2.0);
      },
      state: function (state) {
        applyState(state);
      },
      update: function (state) {
        applyState(state);
      },
      tick: function (state) {
        applyState(state);
      },
      reset: function () {
        AppState.lastReaction = null;
        updateTutorFromState(null, null);
        addLog('Engine state reset.', 'system');
      }
    };

    if (typeof engine.on === 'function') {
      Object.keys(handlers).forEach(function (evt) {
        safeCall(engine.on, engine, [evt, handlers[evt]]);
      });
      return;
    }

    if (typeof engine.addEventListener === 'function') {
      Object.keys(handlers).forEach(function (evt) {
        safeCall(engine.addEventListener, engine, [evt, handlers[evt]]);
      });
      return;
    }

    if (typeof engine.subscribe === 'function') {
      safeCall(engine.subscribe, engine, [function (payload) {
        if (!payload) return;
        if (payload.type && handlers[payload.type]) handlers[payload.type](payload.data || payload);
        else if (payload.state) applyState(payload.state);
      }]);
    }
  }

  /* ==========================================================================
     14. TELEMETRY POLLING LOOP
     ========================================================================== */

  function startTelemetryPoll() {
    if (AppState.pollHandle) clearInterval(AppState.pollHandle);

    AppState.pollHandle = setInterval(function () {
      if (AppState.enginePaused) return;

      const engine = window.ChemistryEngine;
      if (!engine) return;

      let state = null;
      if (typeof engine.getState === 'function') {
        state = safeCall(engine.getState, engine, [], null);
      } else if (engine.state) {
        state = engine.state;
      }

      if (state) applyState(state);
    }, 300);
  }

  /* ==========================================================================
     15. BOOT SEQUENCE
     ========================================================================== */

  function boot() {
    if (AppState.booted) return;
    AppState.booted = true;

    /* --- Cache DOM --- */
    cacheDom();

    /* --- Log terminal ready --- */
    addLog('VirtuaLab Pro controller initialised.', 'system');
    addLog('Procedural audio synthesizer online.', 'system');

    /* --- Build / verify modals --- */
    ensureLibraryModal();
    ensureHazardModal();

    /* --- Wire everything --- */
    bindEngineEvents();
    bindLibraryEvents();
    bindHazardEvents();
    bindGlobalEvents();
    bindApparatusControls();

    /* --- AI tutor initial content --- */
    if (dom.tutorDrawer) {
      dom.tutorDrawer.classList.add('closed');
      dom.tutorDrawer.setAttribute('aria-hidden', 'true');
    }
    updateTutorFromState(null, null);

    /* --- Live telemetry --- */
    startTelemetryPoll();

    /* --- Initial engine handshake --- */
    const engine = window.ChemistryEngine;
    if (engine && typeof engine.getState === 'function') {
      const initial = safeCall(engine.getState, engine, [], null);
      if (initial) applyState(initial);
    }

    /* --- Mute button initial state --- */
    if (dom.btnMute) {
      dom.btnMute.setAttribute('aria-pressed', 'false');
      setText(dom.btnMute, '🔊 SOUND');
    }

    /* --- pH meter initial state --- */
    updatePhMeter(dom.phSlider ? Number(dom.phSlider.value) : 7);

    addLog('System ready. Open the Reagent Library to begin.', 'success');
  }

  /* ==========================================================================
     16. PUBLIC API SURFACE
     ========================================================================== */

  window.VirtuaLab = {
    AudioSynth: AudioSynth,
    addLog: addLog,
    applyState: applyState,
    openLibrary: openLibrary,
    closeLibrary: closeLibrary,
    openTutor: openTutor,
    closeTutor: closeTutor,
    toggleTutor: toggleTutor,
    attemptAddChemical: attemptAddChemical,
    triggerHazardIntercept: triggerHazardIntercept,
    allowHazardExecution: allowHazardExecution,
    cancelHazardExecution: cancelHazardExecution,
    getChemicals: getChemicals,
    state: AppState
  };

  /* ==========================================================================
     17. ENTRY POINT
     ========================================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
