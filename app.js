/* ============================================================================
 * VirtuaLab Pro — app.js
 * ----------------------------------------------------------------------------
 * DOM bindings, UI controllers, Web Audio synthesizer and telemetry sync.
 *
 * GLOBAL NAMESPACE : window.VirtuaLabApp
 * DEPENDS ON       : window.ChemicalsDB, window.ChemistryEngine, window.CanvasRenderer
 *
 * MANDATED IDS
 * ----------------------------------------------------------------------------
 *   openReagentModalBtn, closeReagentModalBtn, reagentModal
 *   labCanvas, logTerminal, formulaBanner
 *   clearVesselBtn, refillBtn, stirBtn, flushBtn, addWaterBtn, waterInput
 *   flameSlider, stirrerSlider, titrationSlider
 *
 * OPTIONAL IDS (used when present, gracefully skipped when absent)
 * ----------------------------------------------------------------------------
 *   reagentSearch, reagentCategoryFilter, reagentList, reagentAmount,
 *   reagentUnitBadge, reagentAddBtn, reagentCloseBtn, telemetry fields
 *   with [data-telemetry="..."] attributes.
 * ==========================================================================*/

window.VirtuaLabApp = (function () {
  "use strict";

  /* ==========================================================================
   * 0. TINY DOM HELPERS
   * ========================================================================*/

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.indexOf("data-") === 0) node.setAttribute(k, attrs[k]);
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function fmtNum(n, dp) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    if (dp === undefined) dp = 2;
    var a = Math.abs(n);
    if (a !== 0 && (a < 1e-4 || a >= 1e6)) return n.toExponential(2);
    return Number(n.toFixed(dp)).toString();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ==========================================================================
   * 1. WEB AUDIO SYNTHESIZER
   * ------------------------------------------------------------------------
   * Fully procedural — no external audio files. Every sound is generated
   * from oscillators, noise buffers, biquad filters and ADSR envelopes.
   * ========================================================================*/

  function AudioSynth() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this._ready = false;
    this._noiseBuffer = null;
    this._loops = {};
    this._lastPlay = {};
  }

  AudioSynth.prototype._ensure = function () {
    if (this._ready) return true;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;

      /* Gentle master compressor so explosions never clip harshly */
      var comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.22;

      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      this._noiseBuffer = this._makeNoiseBuffer(2.0);
      this._ready = true;
      return true;
    } catch (e) {
      this._ready = false;
      return false;
    }
  };

  AudioSynth.prototype.resume = function () {
    if (!this._ensure()) return;
    if (this.ctx.state === "suspended") {
      try { this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  };

  AudioSynth.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
  };

  AudioSynth.prototype._throttle = function (key, ms) {
    var now = performance.now();
    if (this._lastPlay[key] && now - this._lastPlay[key] < ms) return false;
    this._lastPlay[key] = now;
    return true;
  };

  AudioSynth.prototype._makeNoiseBuffer = function (seconds) {
    var len = Math.floor(this.ctx.sampleRate * seconds);
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  };

  /* ---------------------------------------------------------------- */
  /* CLICK — short crisp UI tick                                      */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.click = function (pitch) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();
    if (!this._throttle("click", 45)) return;

    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    var filter = this.ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(pitch || 880, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.06);

    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 1.4;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.24, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.11);
  };

  /* ---------------------------------------------------------------- */
  /* WATER SPLASH — filtered noise burst                              */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.splash = function (strength) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();

    strength = Math.max(0.2, Math.min(1.0, strength || 0.6));
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    var filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    filter.Q.value = 1.1;

    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22 * strength, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.36);
  };

  /* ---------------------------------------------------------------- */
  /* FIZZ — sharp high-passed noise crackle (gas evolution)           */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.fizzBurst = function (duration, intensity) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();

    duration = duration || 0.6;
    intensity = Math.max(0.2, Math.min(1.2, intensity || 0.7));
    var t = this.ctx.currentTime;

    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;

    var hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2800;

    var bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 0.7;

    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14 * intensity, t + 0.06);
    gain.gain.linearRampToValueAtTime(0.10 * intensity, t + duration * 0.55);
    gain.gain.linearRampToValueAtTime(0.0001, t + duration);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  };

  /* ---------------------------------------------------------------- */
  /* EXPLOSION — low thump + noise tail + sub-bass punch              */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.explosion = function (power) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();

    power = Math.max(0.4, Math.min(2.0, power || 1.0));
    var t = this.ctx.currentTime;

    /* --- sub-bass punch --- */
    var sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.42);

    var subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.62 * power, t + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

    sub.connect(subGain);
    subGain.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.6);

    /* --- noise burst --- */
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    var lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.7);

    var noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.42 * power, t + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

    src.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(this.master);
    src.start(t);
    src.stop(t + 0.9);

    /* --- crackle layer --- */
    var crackle = this.ctx.createBufferSource();
    crackle.buffer = this._noiseBuffer;
    var hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4200;
    var cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t + 0.02);
    cg.gain.exponentialRampToValueAtTime(0.12 * power, t + 0.06);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    crackle.connect(hp);
    hp.connect(cg);
    cg.connect(this.master);
    crackle.start(t + 0.02);
    crackle.stop(t + 0.32);
  };

  /* ---------------------------------------------------------------- */
  /* IGNITION — sharp crack + bright chirp                            */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.ignition = function () {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();

    var t = this.ctx.currentTime;

    var osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);

    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    var bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600;
    bp.Q.value = 1.6;

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);

    this.explosion(0.75);
  };

  /* ---------------------------------------------------------------- */
  /* PRECIPITATE — soft sprinkling rain                               */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.precipitate = function () {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();
    if (!this._throttle("precip", 220)) return;

    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    var bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 6200;
    bp.Q.value = 2.0;

    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.75);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.78);
  };

  /* ---------------------------------------------------------------- */
  /* DING — UI success chime                                         */
  /* ---------------------------------------------------------------- */
  AudioSynth.prototype.ding = function (freq) {
    if (!this.enabled) return;
    if (!this._ensure()) return;
    this.resume();

    var t = this.ctx.currentTime;
    var base = freq || 880;

    [1, 2, 3].forEach(function (mult, idx) {
      var osc = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = base * mult;
      var amp = 0.14 / (idx + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.82);
    }, this);
  };

  /* ---------------------------------------------------------------- */
  /* CONTINUOUS LOOPS — burner hiss, boiling rumble, gas fizz         */
  /* ---------------------------------------------------------------- */

  AudioSynth.prototype._startNoiseLoop = function (key, opts) {
    if (this._loops[key]) return this._loops[key];
    if (!this._ensure()) return null;

    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;

    var filter = this.ctx.createBiquadFilter();
    filter.type = opts.filterType || "bandpass";
    filter.frequency.value = opts.frequency || 1000;
    filter.Q.value = opts.q || 1;

    var gain = this.ctx.createGain();
    gain.gain.value = 0;

    var lfo = null, lfoGain = null;
    if (opts.lfoRate) {
      lfo = this.ctx.createOscillator();
      lfo.frequency.value = opts.lfoRate;
      lfoGain = this.ctx.createGain();
      lfoGain.gain.value = opts.lfoDepth || 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();

    var loop = { src: src, gain: gain, filter: filter, lfo: lfo, lfoGain: lfoGain, base: opts.base || 0 };
    this._loops[key] = loop;
    return loop;
  };

  AudioSynth.prototype._setLoopGain = function (key, target, ramp) {
    var loop = this._loops[key];
    if (!loop || !this.ctx) return;
    var t = this.ctx.currentTime;
    var g = loop.gain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(Math.max(0, target), t + (ramp || 0.3));
    } catch (e) {
      g.value = Math.max(0, target);
    }
  };

  AudioSynth.prototype.setBurnerHiss = function (intensity) {
    if (!this.enabled) { this._setLoopGain("hiss", 0, 0.2); return; }
    if (intensity <= 0.001) { this._setLoopGain("hiss", 0, 0.4); return; }
    if (!this._loops.hiss) {
      this._startNoiseLoop("hiss", {
        filterType: "highpass",
        frequency: 3400,
        q: 0.7,
        lfoRate: 6.2,
        lfoDepth: 0.008,
        base: 0.12
      });
    }
    this._setLoopGain("hiss", 0.14 * intensity, 0.25);
  };

  AudioSynth.prototype.setBoiling = function (intensity) {
    if (!this.enabled) { this._setLoopGain("boil", 0, 0.2); return; }
    if (intensity <= 0.001) { this._setLoopGain("boil", 0, 0.5); return; }
    if (!this._loops.boil) {
      this._startNoiseLoop("boil", {
        filterType: "lowpass",
        frequency: 620,
        q: 0.9,
        lfoRate: 2.1,
        lfoDepth: 0.03,
        base: 0.18
      });
    }
    this._setLoopGain("boil", 0.20 * intensity, 0.35);
  };

  AudioSynth.prototype.setGasFizz = function (intensity) {
    if (!this.enabled) { this._setLoopGain("gas", 0, 0.2); return; }
    if (intensity <= 0.001) { this._setLoopGain("gas", 0, 0.35); return; }
    if (!this._loops.gas) {
      this._startNoiseLoop("gas", {
        filterType: "bandpass",
        frequency: 4800,
        q: 0.8,
        lfoRate: 3.7,
        lfoDepth: 0.02,
        base: 0.15
      });
    }
    this._setLoopGain("gas", 0.16 * intensity, 0.3);
  };

  AudioSynth.prototype.stopAllLoops = function () {
    this.setBurnerHiss(0);
    this.setBoiling(0);
    this.setGasFizz(0);
  };

  /* ==========================================================================
   * 2. APP CONTROLLER
   * ========================================================================*/

  function App() {
    this.engine = null;
    this.renderer = null;
    this.audio = new AudioSynth();

    this.ui = {};
    this.selectedSpeciesId = null;
    this.activeCategory = "all";
    this.searchQuery = "";

    this._lastReactionCount = 0;
    this._lastGasMoles = 0;
    this._lastTempK = 273.15;
    this._telemetryTimer = null;
    this._titrationTimer = null;
    this._titrantId = "NaOH";
    this._titrantMolarity = 0.1;
    this._titrantVolumeAccumulated = 0;
    this._logCount = 0;

    this._lastEventCount = 0;
  }

  /* ----------------------------------------------------------------------
   * 2.1 Boot
   * -------------------------------------------------------------------- */

  App.prototype.boot = function () {
    var self = this;

    /* --- instantiate engine + renderer --- */
    if (!window.ChemistryEngine) {
      console.error("[VirtuaLabApp] ChemistryEngine missing — cannot boot.");
      return;
    }
    this.engine = window.ChemistryEngine.createEngine();

    var canvas = document.getElementById("labCanvas");
    if (canvas && window.CanvasRenderer) {
      this.renderer = new window.CanvasRenderer(canvas, this.engine);
      this.renderer.start();
    }

    /* --- cache DOM handles --- */
    this._cacheDom();

    /* --- bind every control --- */
    this._bindControls();

    /* --- build the reagent modal contents --- */
    this._buildModalContents();

    /* --- initial telemetry render --- */
    this._syncTelemetry();

    /* --- start the telemetry heartbeat --- */
    this._telemetryTimer = setInterval(function () {
      self._syncTelemetry();
      self._syncAudioLoops();
      self._drainEngineEvents();
    }, 220);

    /* --- unlock audio on the first user gesture --- */
    var unlock = function () {
      self.audio._ensure();
      self.audio.resume();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    this._log("system", "VirtuaLab Pro initialised. " +
      (window.ChemicalsDB ? window.ChemicalsDB.count() : 0) + " reagents ready.");

    /* --- welcome banner --- */
    this._setFormulaBanner("Ready — add a reagent to begin.", "idle");
  };

  App.prototype._cacheDom = function () {
    var ids = [
      "openReagentModalBtn", "closeReagentModalBtn", "reagentModal",
      "labCanvas", "logTerminal", "formulaBanner",
      "clearVesselBtn", "refillBtn", "stirBtn", "flushBtn",
      "addWaterBtn", "waterInput",
      "flameSlider", "stirrerSlider", "titrationSlider"
    ];
    for (var i = 0; i < ids.length; i++) {
      this.ui[ids[i]] = document.getElementById(ids[i]);
    }

    /* Optional modal internals */
    this.ui.reagentSearch = document.getElementById("reagentSearch");
    this.ui.reagentCategoryFilter = document.getElementById("reagentCategoryFilter");
    this.ui.reagentList = document.getElementById("reagentList");
    this.ui.reagentAmount = document.getElementById("reagentAmount");
    this.ui.reagentUnitBadge = document.getElementById("reagentUnitBadge");
    this.ui.reagentAddBtn = document.getElementById("reagentAddBtn");
    this.ui.reagentSelectedLabel = document.getElementById("reagentSelectedLabel");
    this.ui.reagentSetTitrantBtn = document.getElementById("reagentSetTitrantBtn");
  };

  /* ----------------------------------------------------------------------
   * 2.2 Bind every control
   * -------------------------------------------------------------------- */

  App.prototype._bindControls = function () {
    var self = this;
    var ui = this.ui;

    /* ---------- MODAL OPEN / CLOSE ---------- */
    if (ui.openReagentModalBtn) {
      ui.openReagentModalBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.audio.click(960);
        self.openModal();
      });
    }
    if (ui.closeReagentModalBtn) {
      ui.closeReagentModalBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.audio.click(620);
        self.closeModal();
      });
    }
    if (ui.reagentModal) {
      ui.reagentModal.addEventListener("click", function (e) {
        if (e.target === ui.reagentModal) self.closeModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ui.reagentModal && !ui.reagentModal.classList.contains("hidden")) {
        self.closeModal();
      }
    });

    /* ---------- VESSEL CONTROLS ---------- */
    if (ui.clearVesselBtn) {
      ui.clearVesselBtn.addEventListener("click", function () {
        self.audio.click(500);
        self.audio.splash(0.5);
        var snap = self.engine.clear();
        self._log("action", "Vessel cleared — all contents purged.");
        self._setFormulaBanner("Vessel empty.", "idle");
        self._lastEventCount = 0;
        self._syncTelemetry();
        if (self.renderer) {
          self.renderer.triggerShockwave(
            self.renderer.geom ? self.renderer.geom.beakerX : 0,
            self.renderer.geom ? self.renderer.geom.gauzeY - 40 : 0,
            "#80c8ff", 140
          );
        }
        return snap;
      });
    }

    if (ui.refillBtn) {
      ui.refillBtn.addEventListener("click", function () {
        self.audio.click(700);
        self.audio.splash(0.8);
        var mL = 250;
        if (ui.waterInput) {
          var parsed = parseFloat(ui.waterInput.value);
          if (!isNaN(parsed) && parsed > 0) mL = Math.min(parsed, 500);
        }
        self.engine.refill(mL);
        self._log("action", "Refilled vessel to " + mL + " mL of distilled water.");
        self._setFormulaBanner("H₂O — pure distilled water, pH ≈ 7.00", "info");
        self._syncTelemetry();
      });
    }

    if (ui.stirBtn) {
      ui.stirBtn.addEventListener("click", function () {
        self.audio.click(880);
        var on = self.engine.toggleStir();
        if (ui.stirrerSlider) ui.stirrerSlider.value = String(Math.round((on ? 0.6 : 0) * 100));
        self._log("action", "Magnetic stirrer " + (on ? "ON" : "OFF") + ".");
      });
    }

    if (ui.flushBtn) {
      ui.flushBtn.addEventListener("click", function () {
        self.audio.click(520);
        self.audio.splash(1.0);
        self.engine.flush();
        self._log("action", "Vessel flushed with fresh water.");
        self._setFormulaBanner("Flushed — fresh H₂O.", "info");
        self._syncTelemetry();
      });
    }

    if (ui.addWaterBtn) {
      ui.addWaterBtn.addEventListener("click", function () {
        var mL = 25;
        if (ui.waterInput) {
          var parsed = parseFloat(ui.waterInput.value);
          if (!isNaN(parsed) && parsed > 0) mL = parsed;
        }
        self.audio.click(760);
        self.audio.splash(Math.min(1, mL / 100));
        var report = self.engine.addWater(mL);
        self._log("action", "Added " + mL + " mL of water. Volume = " +
          fmtNum(self.engine.vessel.waterVolume * 1000, 1) + " mL.");
        self._drainEngineEvents(report);
        self._syncTelemetry();
      });
    }

    if (ui.waterInput) {
      ui.waterInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && ui.addWaterBtn) ui.addWaterBtn.click();
      });
    }

    /* ---------- SLIDERS ---------- */
    if (ui.flameSlider) {
      var onFlame = function () {
        var val = parseFloat(ui.flameSlider.value);
        if (isNaN(val)) val = 0;
        var power = Math.max(0, Math.min(100, val)) / 100;
        self.engine.setFlame(power);
        self.audio.setBurnerHiss(power);
        if (power > 0.02 && self.audio._throttle("flameclick", 400)) {
          self.audio.click(420);
        }
      };
      ui.flameSlider.addEventListener("input", onFlame);
      ui.flameSlider.addEventListener("change", onFlame);
      onFlame();
    }

    if (ui.stirrerSlider) {
      var onStir = function () {
        var val = parseFloat(ui.stirrerSlider.value);
        if (isNaN(val)) val = 0;
        var rate = Math.max(0, Math.min(100, val)) / 100;
        self.engine.setStirrer(rate);
        if (rate > 0.02 && self.audio._throttle("stirclick", 500)) {
          self.audio.click(1100);
        }
      };
      ui.stirrerSlider.addEventListener("input", onStir);
      ui.stirrerSlider.addEventListener("change", onStir);
      onStir();
    }

    if (ui.titrationSlider) {
      var onTitrate = function () {
        var val = parseFloat(ui.titrationSlider.value);
        if (isNaN(val)) val = 0;
        var rate = Math.max(0, Math.min(100, val)) / 100;
        self._setTitrationRate(rate);
      };
      ui.titrationSlider.addEventListener("input", onTitrate);
      ui.titrationSlider.addEventListener("change", onTitrate);
    }

    /* ---------- MODAL INTERNAL CONTROLS ---------- */
    if (ui.reagentSearch) {
      ui.reagentSearch.addEventListener("input", function () {
        self.searchQuery = ui.reagentSearch.value || "";
        self._renderReagentList();
      });
    }
    if (ui.reagentCategoryFilter) {
      ui.reagentCategoryFilter.addEventListener("change", function () {
        self.activeCategory = ui.reagentCategoryFilter.value || "all";
        self._renderReagentList();
      });
    }
    if (ui.reagentAddBtn) {
      ui.reagentAddBtn.addEventListener("click", function () {
        self._commitAddFromModal();
      });
    }
    if (ui.reagentAmount) {
      ui.reagentAmount.addEventListener("keydown", function (e) {
        if (e.key === "Enter") self._commitAddFromModal();
      });
    }
    if (ui.reagentSetTitrantBtn) {
      ui.reagentSetTitrantBtn.addEventListener("click", function () {
        if (!self.selectedSpeciesId) return;
        self._titrantId = self.selectedSpeciesId;
        var sp = window.ChemicalsDB.get(self._titrantId);
        self.audio.ding(720);
        self._log("system", "Titrant set to " + (sp ? sp.name : self._titrantId) + " (0.10 M).");
      });
    }
  };

  /* ----------------------------------------------------------------------
   * 2.3 Modal open / close
   * -------------------------------------------------------------------- */

  App.prototype.openModal = function () {
    var m = this.ui.reagentModal;
    if (!m) return;
    m.classList.remove("hidden");
    m.style.display = "";
    m.setAttribute("aria-hidden", "false");
    if (!this.ui.reagentList) this._buildModalContents();
    this._renderReagentList();
    if (this.ui.reagentSearch) {
      setTimeout(function () { try { this.ui.reagentSearch.focus(); } catch (e) {} }.bind(this), 40);
    }
  };

  App.prototype.closeModal = function () {
    var m = this.ui.reagentModal;
    if (!m) return;
    m.classList.add("hidden");
    m.style.display = "none";
    m.setAttribute("aria-hidden", "true");
  };

  /* ----------------------------------------------------------------------
   * 2.4 Build the reagent modal body (if not already present)
   * -------------------------------------------------------------------- */

  App.prototype._buildModalContents = function () {
    var modal = this.ui.reagentModal;
    if (!modal) return;

    /* If the HTML already supplies #reagentList, keep everything as-is */
    if (document.getElementById("reagentList")) {
      this.ui.reagentList = document.getElementById("reagentList");
      this.ui.reagentSearch = document.getElementById("reagentSearch");
      this.ui.reagentCategoryFilter = document.getElementById("reagentCategoryFilter");
      this.ui.reagentAmount = document.getElementById("reagentAmount");
      this.ui.reagentUnitBadge = document.getElementById("reagentUnitBadge");
      this.ui.reagentAddBtn = document.getElementById("reagentAddBtn");
      this.ui.reagentSelectedLabel = document.getElementById("reagentSelectedLabel");
      return;
    }

    /* --- locate or create the modal body --- */
    var body = modal.querySelector("[data-modal-body]") || modal.querySelector(".modal-body");
    if (!body) {
      body = el("div", { class: "modal-body", "data-modal-body": "" });
      modal.appendChild(body);
    }

    /* --- header / search row --- */
    var search = el("input", {
      type: "text",
      id: "reagentSearch",
      class: "vl-input text-slate-100 bg-slate-800",
      placeholder: "Search reagents by name, formula or ID…",
      autocomplete: "off",
      spellcheck: "false"
    });
    var catSelect = el("select", {
      id: "reagentCategoryFilter",
      class: "vl-select text-slate-100 bg-slate-800"
    });
    catSelect.appendChild(el("option", { value: "all", text: "All categories" }));
    var cats = window.ChemicalsDB ? window.ChemicalsDB.categories : {};
    for (var ck in cats) {
      if (!Object.prototype.hasOwnProperty.call(cats, ck)) continue;
      catSelect.appendChild(el("option", {
        value: ck,
        text: (cats[ck].icon ? cats[ck].icon + "  " : "") + cats[ck].label
      }));
    }

    var tools = el("div", { class: "vl-modal-tools" }, [search, catSelect]);
    body.appendChild(tools);

    /* --- list container --- */
    var list = el("div", { id: "reagentList", class: "vl-reagent-list" });
    body.appendChild(list);

    /* --- add panel --- */
    var amount = el("input", {
      type: "number",
      id: "reagentAmount",
      class: "vl-input text-slate-100 bg-slate-800",
      value: "1",
      min: "0.01",
      step: "0.1"
    });
    var unitBadge = el("span", {
      id: "reagentUnitBadge",
      class: "vl-unit-badge",
      text: "g"
    });
    var selectedLabel = el("span", {
      id: "reagentSelectedLabel",
      class: "vl-selected-label",
      text: "No reagent selected"
    });
    var addBtn = el("button", {
      id: "reagentAddBtn",
      type: "button",
      class: "vl-btn vl-btn-primary",
      text: "Add to Vessel"
    });
    var setTitrant = el("button", {
      id: "reagentSetTitrantBtn",
      type: "button",
      class: "vl-btn vl-btn-ghost",
      text: "Set as Titrant"
    });

    var addPanel = el("div", { class: "vl-add-panel" }, [
      el("div", { class: "vl-add-row" }, [selectedLabel]),
      el("div", { class: "vl-add-row vl-add-inputs" }, [
        amount, unitBadge, addBtn, setTitrant
      ])
    ]);
    body.appendChild(addPanel);

    /* cache */
    this.ui.reagentSearch = search;
    this.ui.reagentCategoryFilter = catSelect;
    this.ui.reagentList = list;
    this.ui.reagentAmount = amount;
    this.ui.reagentUnitBadge = unitBadge;
    this.ui.reagentAddBtn = addBtn;
    this.ui.reagentSelectedLabel = selectedLabel;
    this.ui.reagentSetTitrantBtn = setTitrant;
  };

  /* ----------------------------------------------------------------------
   * 2.5 Reagent list rendering
   * -------------------------------------------------------------------- */

  App.prototype._renderReagentList = function () {
    var list = this.ui.reagentList;
    if (!list || !window.ChemicalsDB) return;

    var items = window.ChemicalsDB.list();
    var cat = this.activeCategory;
    var q = (this.searchQuery || "").trim().toLowerCase();

    items = items.filter(function (sp) {
      if (cat !== "all" && sp.category !== cat) return false;
      if (!q) return true;
      return (
        sp.id.toLowerCase().indexOf(q) !== -1 ||
        sp.name.toLowerCase().indexOf(q) !== -1 ||
        String(sp.formula).toLowerCase().indexOf(q) !== -1
      );
    });

    items.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    /* -------- build DOM -------- */
    var frag = document.createDocumentFragment();
    var self = this;

    if (items.length === 0) {
      frag.appendChild(el("div", {
        class: "vl-empty",
        text: "No reagents match your search."
      }));
    }

    for (var i = 0; i < items.length; i++) {
      var sp = items[i];
      var catInfo = window.ChemicalsDB.categories[sp.category] || { accent: "#7dd3fc", label: sp.category };

      var row = el("button", {
        type: "button",
        class: "vl-reagent-row",
        "data-id": sp.id,
        "data-state": sp.state
      });

      var swatch = el("span", {
        class: "vl-reagent-swatch",
        style: "background:" + (sp.color || "#cccccc") + ";border-color:" + catInfo.accent
      });

      var main = el("span", { class: "vl-reagent-main" }, [
        el("span", { class: "vl-reagent-name", text: sp.name }),
        el("span", { class: "vl-reagent-formula", text: sp.formula }),
        el("span", {
          class: "vl-reagent-meta",
          text: (sp.molarMass ? sp.molarMass.toFixed(2) + " g/mol" : "—") +
                " · " + (sp.state || "—") +
                (sp.pH !== null && sp.pH !== undefined ? " · pH " + sp.pH.toFixed(1) : "")
        })
      ]);

      var badge = el("span", {
        class: "vl-reagent-cat",
        style: "color:" + catInfo.accent,
        text: (catInfo.icon || "") + " " + catInfo.label
      });

      row.appendChild(swatch);
      row.appendChild(main);
      row.appendChild(badge);

      if (sp.id === this.selectedSpeciesId) {
        row.classList.add("is-selected");
      }

      row.addEventListener("click", (function (species) {
        return function (e) {
          e.preventDefault();
          self._selectSpecies(species);
        };
      })(sp));

      frag.appendChild(row);
    }

    list.innerHTML = "";
    list.appendChild(frag);
  };

  /* ----------------------------------------------------------------------
   * 2.6 Species selection + unit badge logic
   * -------------------------------------------------------------------- */

  App.prototype._selectSpecies = function (sp) {
    this.selectedSpeciesId = sp.id;
    this.audio.click(880);

    /* --- highlight the chosen row --- */
    var rows = $$(".vl-reagent-row", this.ui.reagentList);
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("is-selected", rows[i].getAttribute("data-id") === sp.id);
    }

    /* --- unit badge: 'g' for solids, 'mL' for liquids/aqueous, 'mol' for gases --- */
    var unit = this._preferredUnitFor(sp);
    if (this.ui.reagentUnitBadge) {
      this.ui.reagentUnitBadge.textContent = unit;
      this.ui.reagentUnitBadge.setAttribute("data-unit", unit);
    }

    /* --- default amount per unit class --- */
    if (this.ui.reagentAmount) {
      if (unit === "g") this.ui.reagentAmount.value = "5";
      else if (unit === "mL") this.ui.reagentAmount.value = "25";
      else this.ui.reagentAmount.value = "0.1";
      this.ui.reagentAmount.step = unit === "mol" ? "0.01" : "0.5";
      /* enforce required contrast classes */
      this.ui.reagentAmount.classList.add("text-slate-100");
      this.ui.reagentAmount.classList.add("bg-slate-800");
    }

    /* --- label --- */
    if (this.ui.reagentSelectedLabel) {
      this.ui.reagentSelectedLabel.innerHTML =
        "<strong>" + escapeHtml(sp.name) + "</strong> " +
        "<span class='vl-inline-formula'>" + escapeHtml(sp.formula) + "</span> " +
        "<span class='vl-inline-meta'>· " + escapeHtml(sp.state) +
        " · M = " + sp.molarMass.toFixed(2) + " g/mol</span>";
    }

    if (this.ui.reagentAddBtn) {
      this.ui.reagentAddBtn.disabled = false;
    }
  };

  /**
   * Decide the unit to present in the modal.
   *   solid              → "g"
   *   liquid / aqueous   → "mL"
   *   gas                → "mol"
   */
  App.prototype._preferredUnitFor = function (sp) {
    if (!sp) return "g";
    switch (sp.state) {
      case "solid":   return "g";
      case "liquid":  return "mL";
      case "aqueous": return "mL";
      case "gas":     return "mol";
      default:        return "g";
    }
  };

  /* ----------------------------------------------------------------------
   * 2.7 Commit an addition from the modal
   * -------------------------------------------------------------------- */

  App.prototype._commitAddFromModal = function () {
    if (!this.selectedSpeciesId) {
      this._log("warn", "No reagent selected.");
      return;
    }
    var sp = window.ChemicalsDB.get(this.selectedSpeciesId);
    if (!sp) {
      this._log("warn", "Selected reagent no longer exists.");
      return;
    }

    var amount = 1;
    if (this.ui.reagentAmount) {
      var parsed = parseFloat(this.ui.reagentAmount.value);
      if (isNaN(parsed) || parsed <= 0) {
        this._log("warn", "Amount must be a positive number.");
        this.audio.click(300);
        return;
      }
      amount = parsed;
    }

    var unit = this._preferredUnitFor(sp);
    this._dispatchAdd(sp.id, amount, unit);
    this.closeModal();
  };

  /* ----------------------------------------------------------------------
   * 2.8 Dispatch an addition and react to the report
   * -------------------------------------------------------------------- */

  App.prototype._dispatchAdd = function (id, amount, unit) {
    var sp = window.ChemicalsDB.get(id);
    if (!sp) return;

    var report;
    try {
      report = this.engine.addChemical(id, amount, unit);
    } catch (err) {
      console.error("[VirtuaLabApp] addChemical threw:", err);
      this._log("error", "Engine error while adding " + id + ": " + err.message);
      return;
    }

    /* --- user-visible log line --- */
    var unitLabel = unit === "g" ? " g" : unit === "mL" ? " mL" : " mol";
    this._log("add", "Added " + fmtNum(amount, 3) + unitLabel + " of " + sp.name +
      " (" + sp.formula + ").");

    /* --- audio feedback for the addition itself --- */
    if (sp.state === "liquid" || sp.state === "aqueous") {
      this.audio.splash(Math.min(1, amount / 50));
    } else if (sp.state === "gas") {
      this.audio.fizzBurst(0.25, 0.4);
    } else {
      this.audio.click(640);
    }

    /* --- process each event that came back --- */
    this._handleReport(report);

    /* --- drain any residual events that arrived between ticks --- */
    this._drainEngineEvents(report);

    this._syncTelemetry();
    return report;
  };

  /* ----------------------------------------------------------------------
   * 2.9 Handle a single engine report
   * -------------------------------------------------------------------- */

  App.prototype._handleReport = function (report) {
    if (!report) return;

    var events = report.events || [];
    var bannerSet = false;

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e) continue;

      /* --- console-style log line --- */
      var level = "info";
      if (e.type === "reaction") level = "reaction";
      if (e.type === "combustion") level = "danger";
      if (e.enthalpyFlag === "EXOTHERMIC" && e.totalHeatJ > 8000) level = "danger";
      if (e.toxicGas) level = "warn";

      this._log(level, this._formatEventMessage(e));

      /* --- equation → formula banner --- */
      if (e.equation && !bannerSet) {
        var tone = "reaction";
        if (e.enthalpyFlag === "EXOTHERMIC") tone = "exo";
        else if (e.enthalpyFlag === "ENDOTHERMIC") tone = "endo";
        if (e.toxicGas) tone = "toxic";
        if (e.ignition) tone = "danger";

        this._setFormulaBanner(e.equation, tone, e);
        bannerSet = true;
      }

      /* --- renderer FX --- */
      if (this.renderer) {
        this.renderer.handleEvents([e]);
      }

      /* --- audio reaction per event subtype --- */
      this._playEventAudio(e);
    }

    if (!bannerSet && report.ok && report.species) {
      var sp = report.species;
      this._setFormulaBanner(
        sp.formula + " — " + sp.name + " (" + sp.state + ")",
        "info"
      );
    }
  };

  App.prototype._formatEventMessage = function (e) {
    if (!e) return "";
    if (e.message) return e.message;

    switch (e.type) {
      case "addition":      return e.message || "Reagent added.";
      case "dissolution":   return e.message || "Dissolution.";
      case "combustion":    return "Combustion: " + (e.equation || "");
      case "reaction":      return (e.subtype || "reaction") + ": " + (e.equation || "");
      default:              return e.equation || e.type || "event";
    }
  };

  /* ----------------------------------------------------------------------
   * 2.10 Per-event audio cues
   * -------------------------------------------------------------------- */

  App.prototype._playEventAudio = function (e) {
    if (!e) return;

    if (e.type === "combustion") {
      this.audio.ignition();
      this.audio.explosion(1.2);
      return;
    }

    if (e.type === "reaction") {
      switch (e.subtype) {
        case "alkali-metal-water":
          if (e.ignition) {
            this.audio.ignition();
            this.audio.explosion(1.4);
          } else {
            this.audio.fizzBurst(0.9, 1.0);
          }
          break;

        case "alkaline-earth-water":
          this.audio.fizzBurst(0.8, 0.8);
          break;

        case "metal-acid":
          this.audio.fizzBurst(0.8, 0.9);
          break;

        case "carbonate-acid":
          this.audio.fizzBurst(0.7, 0.85);
          break;

        case "sulfide-acid":
        case "sulfite-acid":
          this.audio.fizzBurst(0.6, 0.7);
          break;

        case "ammonium-base":
          this.audio.fizzBurst(0.5, 0.6);
          break;

        case "catalytic-decomposition":
          this.audio.fizzBurst(0.75, 0.9);
          break;

        case "precipitation":
          this.audio.precipitate();
          break;

        case "halogen-displacement":
          this.audio.fizzBurst(0.4, 0.5);
          break;

        case "metal-displacement":
          this.audio.click(520);
          break;

        case "neutralisation":
          this.audio.splash(0.35);
          if (e.deltaT > 8) this.audio.click(700);
          break;

        default:
          break;
      }
    }

    /* --- heat-driven audio --- */
    if (e.deltaT && e.deltaT > 20) {
      this.audio.explosion(Math.min(1.6, e.deltaT / 30));
    }
  };

  /* ----------------------------------------------------------------------
   * 2.11 Continuous audio loop sync
   * -------------------------------------------------------------------- */

  App.prototype._syncAudioLoops = function () {
    if (!this.engine) return;
    var v = this.engine.vessel;

    /* --- burner hiss tracks flame power --- */
    this.audio.setBurnerHiss(v.flamePower);

    /* --- boiling rumble tracks temperature --- */
    var boiling = 0;
    if (v.waterVolume > 0) {
      if (v.temperature >= 373.15) boiling = 1.0;
      else if (v.temperature > 358) boiling = (v.temperature - 358) / 15;
    }
    this.audio.setBoiling(boiling);

    /* --- gas fizz tracks headspace gas accumulation rate --- */
    var totalGas = 0;
    for (var g in v.gases) {
      if (Object.prototype.hasOwnProperty.call(v.gases, g)) totalGas += v.gases[g];
    }
    var delta = totalGas - this._lastGasMoles;
    var fizz = 0;
    if (delta > 0.005) fizz = Math.min(1, delta * 4);
    else if (totalGas > 0.02 && this.engine.vessel.reactionCount > 0) fizz = 0.15;
    this.audio.setGasFizz(fizz);

    this._lastGasMoles = totalGas;
  };

  /* ----------------------------------------------------------------------
   * 2.12 Drain engine events that may not have been captured yet
   * -------------------------------------------------------------------- */

  App.prototype._drainEngineEvents = function (freshReport) {
    if (!this.engine || !this.engine.vessel) return;

    var events = null;
    if (freshReport && freshReport.events && freshReport.events.length) {
      events = freshReport.events;
    } else if (this.engine.vessel.lastEvents && this.engine.vessel.lastEvents.length) {
      events = this.engine.vessel.lastEvents;
    }
    if (!events) return;

    /* Only new events are forwarded; track by count so nothing is doubled */
    if (this._lastEventCount === events.length) return;

    var slice = events.slice(this._lastEventCount);
    this._lastEventCount = events.length;

    for (var i = 0; i < slice.length; i++) {
      this._log("event", this._formatEventMessage(slice[i]));
      if (this.renderer) this.renderer.handleEvents([slice[i]]);
    }
  };

  /* ----------------------------------------------------------------------
   * 2.13 Titration
   * -------------------------------------------------------------------- */

  App.prototype._setTitrationRate = function (rate) {
    var self = this;
    if (this._titrationTimer) {
      clearInterval(this._titrationTimer);
      this._titrationTimer = null;
    }
    if (!(rate > 0.001)) {
      this._log("system", "Titration stopped. Delivered " +
        fmtNum(this._titrantVolumeAccumulated, 2) + " mL total.");
      this._titrantVolumeAccumulated = 0;
      return;
    }

    this._log("system", "Titration started at rate " + (rate * 100).toFixed(0) +
      " % with " + this._titrantId + " (" + this._titrantMolarity + " M).");

    this._titrationTimer = setInterval(function () {
      if (!self.engine) return;
      var mL = rate * 0.4;                     // up to 0.4 mL per 250 ms at full rate
      var moles = (mL / 1000) * self._titrantMolarity;
      if (moles <= 0) return;

      var report = self.engine.addChemical(self._titrantId, moles, "mol");
      self._titrantVolumeAccumulated += mL;

      /* Audio: repeated drip */
      if (self.audio._throttle("drip", 180)) {
        self.audio.splash(0.25);
      }

      /* Log only meaningful events, not every single drip */
      if (report && report.events) {
        for (var i = 0; i < report.events.length; i++) {
          var e = report.events[i];
          if (e.type === "reaction" || e.type === "combustion") {
            self._handleReport({ events: [e], ok: true, species: null });
          }
        }
      }

      self._syncTelemetry();
    }, 250);
  };

  /* ----------------------------------------------------------------------
   * 2.14 Telemetry sync
   * -------------------------------------------------------------------- */

  App.prototype._syncTelemetry = function () {
    if (!this.engine) return;
    var v = this.engine.vessel;

    var snap = {
      temperatureC: v.temperature - 273.15,
      temperatureK: v.temperature,
      pH: v.pH,
      volumeML: v.waterVolume * 1000,
      molarity: v.molarity || {},
      precipMass: v.precipitates.reduce(function (a, b) { return a + b.mass; }, 0),
      solidMass: v.solids.reduce(function (a, b) { return a + b.mass; }, 0),
      gasMoles: 0,
      gasVolumeL: 0,
      heatJ: v.heatExchanged,
      reactionCount: v.reactionCount,
      turbidity: v.turbidity,
      colour: v.colour,
      stirring: v.stirring,
      stirRate: v.stirRate,
      flamePower: v.flamePower
    };

    for (var g in v.gases) {
      if (Object.prototype.hasOwnProperty.call(v.gases, g)) {
        snap.gasMoles += v.gases[g];
      }
    }
    snap.gasVolumeL = snap.gasMoles * 22.4136;

    /* ---- update DOM fields ---- */
    this._setField("temperature", fmtNum(snap.temperatureC, 1) + " °C");
    this._setField("temperatureK", fmtNum(snap.temperatureK, 2) + " K");
    this._setField("ph", snap.pH === null ? "—" : snap.pH.toFixed(2));
    this._setField("volume", fmtNum(snap.volumeML, 1) + " mL");
    this._setField("precipitate", fmtNum(snap.precipMass, 3) + " g");
    this._setField("solid", fmtNum(snap.solidMass, 3) + " g");
    this._setField("gas", fmtNum(snap.gasMoles, 4) + " mol");
    this._setField("gasVolume", fmtNum(snap.gasVolumeL, 3) + " L");
    this._setField("heat", fmtNum(snap.heatJ / 1000, 2) + " kJ");
    this._setField("reactions", String(snap.reactionCount));
    this._setField("turbidity", (snap.turbidity * 100).toFixed(0) + " %");
    this._setField("stirring", snap.stirring ? (snap.stirRate * 100).toFixed(0) + " %" : "off");
    this._setField("flame", snap.flamePower > 0.02 ? (snap.flamePower * 100).toFixed(0) + " %" : "off");

    /* ---- direct-ID variants ---- */
    this._setById("tempReadout", fmtNum(snap.temperatureC, 1) + " °C");
    this._setById("phReadout", snap.pH === null ? "—" : snap.pH.toFixed(2));
    this._setById("volumeReadout", fmtNum(snap.volumeML, 1) + " mL");
    this._setById("gasReadout", fmtNum(snap.gasVolumeL, 3) + " L");
    this._setById("precipReadout", fmtNum(snap.precipMass, 3) + " g");

    /* ---- colour the pH readout ---- */
    var phEls = $$("[data-telemetry='ph'], #phReadout");
    for (var i = 0; i < phEls.length; i++) {
      var el2 = phEls[i];
      var ph = snap.pH;
      var col = "#e6f4ff";
      if (ph !== null) {
        if (ph < 3) col = "#ff7050";
        else if (ph < 6) col = "#ffb060";
        else if (ph > 11) col = "#8080ff";
        else if (ph > 8) col = "#80b0ff";
        else col = "#80e0a0";
      }
      el2.style.color = col;
    }

    /* ---- solution swatch ---- */
    var swatch = document.getElementById("solutionSwatch");
    if (swatch) {
      swatch.style.background = snap.colour || "#cfe8ff";
    }
  };

  App.prototype._setField = function (name, value) {
    var nodes = $$("[data-telemetry='" + name + "']");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = value;
    }
  };

  App.prototype._setById = function (id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  /* ----------------------------------------------------------------------
   * 2.15 Formula banner
   * -------------------------------------------------------------------- */

  App.prototype._setFormulaBanner = function (text, tone, meta) {
    var banner = this.ui.formulaBanner;
    if (!banner) return;

    var toneClass = "vl-banner-" + (tone || "idle");
    var tones = ["vl-banner-idle", "vl-banner-info", "vl-banner-reaction",
                 "vl-banner-exo", "vl-banner-endo", "vl-banner-toxic",
                 "vl-banner-danger"];

    for (var i = 0; i < tones.length; i++) {
      banner.classList.remove(tones[i]);
    }
    banner.classList.add(toneClass);

    var html = "<span class='vl-banner-text'>" + escapeHtml(text) + "</span>";

    if (meta) {
      var badges = [];
      if (meta.enthalpyFlag) {
        var flagClass = meta.enthalpyFlag === "EXOTHERMIC" ? "vl-tag-exo"
                      : meta.enthalpyFlag === "ENDOTHERMIC" ? "vl-tag-endo"
                      : "vl-tag-neutral";
        badges.push("<span class='vl-tag " + flagClass + "'>" + escapeHtml(meta.enthalpyFlag) + "</span>");
      }
      if (meta.deltaH !== null && meta.deltaH !== undefined && !isNaN(meta.deltaH)) {
        var sign = meta.deltaH > 0 ? "+" : "";
        badges.push("<span class='vl-tag vl-tag-dh'>ΔH° " + sign + fmtNum(meta.deltaH, 1) + " kJ/mol</span>");
      }
      if (meta.gasVolumeL) {
        badges.push("<span class='vl-tag vl-tag-gas'>" + fmtNum(meta.gasVolumeL, 3) + " L gas @ STP</span>");
      }
      if (meta.precipitateMassG) {
        badges.push("<span class='vl-tag vl-tag-precip'>" + fmtNum(meta.precipitateMassG, 3) + " g precipitate</span>");
      }
      if (meta.toxicGas) {
        badges.push("<span class='vl-tag vl-tag-toxic'>⚠ " + escapeHtml(meta.toxicGas) + "</span>");
      }
      if (meta.ignition) {
        badges.push("<span class='vl-tag vl-tag-danger'>🔥 IGNITION</span>");
      }
      if (badges.length) {
        html += "<span class='vl-banner-tags'>" + badges.join("") + "</span>";
      }
    }

    banner.innerHTML = html;

    /* brief pulse to draw attention */
    banner.classList.remove("vl-banner-pulse");
    /* force reflow to restart the animation */
    void banner.offsetWidth;
    banner.classList.add("vl-banner-pulse");
  };

  /* ----------------------------------------------------------------------
   * 2.16 Log terminal
   * -------------------------------------------------------------------- */

  App.prototype._log = function (level, message) {
    var term = this.ui.logTerminal;
    if (!term) return;

    var ts = new Date();
    var hh = ("0" + ts.getHours()).slice(-2);
    var mm = ("0" + ts.getMinutes()).slice(-2);
    var ss = ("0" + ts.getSeconds()).slice(-2);
    var time = hh + ":" + mm + ":" + ss;

    var line = el("div", {
      class: "vl-log-line vl-log-" + (level || "info")
    }, [
      el("span", { class: "vl-log-time", text: time }),
      el("span", { class: "vl-log-msg", text: message })
    ]);

    term.appendChild(line);
    this._logCount++;

    /* cap the log at 240 lines */
    while (term.children.length > 240) {
      term.removeChild(term.firstChild);
    }

    /* autoscroll if the user hasn't scrolled up */
    var nearBottom = term.scrollHeight - term.scrollTop - term.clientHeight < 80;
    if (nearBottom) {
      term.scrollTop = term.scrollHeight;
    }
  };

  /* ----------------------------------------------------------------------
   * 2.17 Public teardown
   * -------------------------------------------------------------------- */

  App.prototype.destroy = function () {
    if (this._telemetryTimer) {
      clearInterval(this._telemetryTimer);
      this._telemetryTimer = null;
    }
    if (this._titrationTimer) {
      clearInterval(this._titrationTimer);
      this._titrationTimer = null;
    }
    this.audio.stopAllLoops();
    if (this.renderer) this.renderer.stop();
    if (this.audio.ctx) {
      try { this.audio.ctx.close(); } catch (e) { /* ignore */ }
    }
  };

  /* ==========================================================================
   * 3. BOOTSTRAP
   * ========================================================================*/

  function bootstrap() {
    var app = new App();
    window.__virtuaLabApp = app;
    try {
      app.boot();
    } catch (err) {
      console.error("[VirtuaLabApp] Boot failure:", err);
      var term = document.getElementById("logTerminal");
      if (term) {
        var line = document.createElement("div");
        line.className = "vl-log-line vl-log-error";
        line.textContent = "Boot error: " + err.message;
        term.appendChild(line);
      }
    }
    return app;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    /* DOM already parsed (e.g. defer order guarantees it) */
    bootstrap();
  }

  /* ==========================================================================
   * 4. PUBLIC NAMESPACE
   * ========================================================================*/

  var API = App;
  API.AudioSynth = AudioSynth;
  API.helpers = { $: $, $$: $$, el: el };
  API.bootstrap = bootstrap;

  if (typeof console !== "undefined" && console.log) {
    console.log(
      "%c VirtuaLab Pro %c app.js loaded — DOM bindings, Web Audio synth and telemetry ready.",
      "background:#0b7285;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
      "background:#e3fafc;color:#0b7285;padding:2px 6px;border-radius:0 3px 3px 0"
    );
  }

  return API;
})();
