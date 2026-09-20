/* ============================================================================
 *  VirtuaLab Pro — canvas.js
 *  Module: Canvas Renderer (window.CanvasRenderer)
 *  Target: <canvas id="labCanvas">
 *  Build:  1.0.0
 * ----------------------------------------------------------------------------
 *  GLOBAL DATA CONTRACT:
 *      window.ChemicalsDB     -> step 1 (read-only)
 *      window.ChemistryEngine -> step 2 (read-only state source)
 *      window.CanvasRenderer  -> this module
 * ----------------------------------------------------------------------------
 *  RENDER PIPELINE (60 fps, DPR-aware)
 *      backdrop → bench → burner → flame → beaker-back → liquid
 *      → sediment → grains → bubbles → beaker-front → fumes → HUD
 *      → screen-space FX (shake / flash)
 * ==========================================================================*/

(function (global) {
  'use strict';

  const DB     = global.ChemicalsDB;
  const ENGINE = global.ChemistryEngine;
  const VERSION = '1.0.0';

  /* ================================================================== *
   * 0. DESIGN SPACE
   * ================================================================== */
  const DESIGN_W = 1200;
  const DESIGN_H = 800;

  const BEAKER = Object.freeze({
    cx: 600, cy: 400,
    outerW: 260, outerH: 340,
    wall: 9,
    cornerR: 14,
    maxML: 500,
    graduations: [100, 200, 300, 400, 500],
  });

  const BURNER = Object.freeze({
    cx: 600,
    nozzleY: 615, nozzleW: 26, nozzleH: 18,
    stemTopY: 633, stemBotY: 690, stemW: 22,
    baseY: 692, baseW: 100, baseH: 16,
  });

  /* ================================================================== *
   * 1. MATH / COLOR UTILITIES
   * ================================================================== */
  const lerp  = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease  = t => 1 - Math.pow(1 - t, 3);
  const rand  = (a, b) => a + Math.random() * (b - a);

  function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 255, b: 255 };
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixRgb(a, b, t) {
    return {
      r: lerp(a.r, b.r, t),
      g: lerp(a.g, b.g, t),
      b: lerp(a.b, b.b, t),
    };
  }

  function rgba(c, a) {
    return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }

  function noise(t) {
    return Math.sin(t * 1.7) * 0.5
         + Math.sin(t * 4.3 + 1.1) * 0.3
         + Math.sin(t * 11.7 + 0.7) * 0.2;
  }

  /* ================================================================== *
   * 2. RENDERER
   * ================================================================== */
  const CanvasRenderer = {

    version: VERSION,
    canvas: null,
    ctx: null,

    W: 0, H: 0, DPR: 1,
    scale: 1, ox: 0, oy: 0,

    running: false,
    rafId: 0,
    lastT: 0,
    time: 0,

    /* Effects ----------------------------------------------------- */
    shake: { mag: 0 },
    flash: { a: 0, color: { r: 255, g: 255, b: 255 } },

    /* Particle systems -------------------------------------------- */
    bubbles: [],
    fumes: [],
    grains: [],
    sparks: [],

    /* Flame state -------------------------------------------------- */
    flame: {
      intensity: 0,
      targetIntensity: 0,
      flicker: 0,
      colorOverride: null,
    },

    /* Solution color (smoothed) ----------------------------------- */
    solutionColor: { r: 210, g: 228, b: 240, a: 0.18 },

    /* State caches ------------------------------------------------- */
    state: null,
    prevState: null,
    _prevPrecipTotal: 0,

    /* ============================================================== *
     * INIT / LIFECYCLE
     * ============================================================== */
    init(canvasEl) {
      const el = canvasEl || (typeof document !== 'undefined'
        ? document.getElementById('labCanvas') : null);
      if (!el) {
        console.error('[CanvasRenderer] #labCanvas not found in DOM.');
        return this;
      }
      this.canvas = el;
      this.ctx = el.getContext('2d', { alpha: false });
      this._resize();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => this._resize());
      }
      if (ENGINE) {
        this.state = ENGINE.getState();
        this.prevState = this.state;
      }
      return this;
    },

    _resize() {
      const el = this.canvas;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      this.DPR = dpr;
      this.W = rect.width  || DESIGN_W;
      this.H = rect.height || DESIGN_H;
      el.width  = Math.max(1, Math.floor(this.W * dpr));
      el.height = Math.max(1, Math.floor(this.H * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.scale = Math.min(this.W / DESIGN_W, this.H / DESIGN_H);
      this.ox = (this.W - DESIGN_W * this.scale) / 2;
      this.oy = (this.H - DESIGN_H * this.scale) / 2;
    },

    start() {
      if (this.running) return this;
      this.running = true;
      this.lastT = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      const loop = (t) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (t - this.lastT) / 1000);
        this.lastT = t;
        this.time += dt;
        this._update(dt);
        this._draw();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
      return this;
    },

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      return this;
    },

    destroy() {
      this.stop();
      this.canvas = null;
      this.ctx = null;
      return this;
    },

    /* ============================================================== *
     * UPDATE
     * ============================================================== */
    _update(dt) {
      if (ENGINE) {
        this.prevState = this.state;
        this.state = ENGINE.getState();
      }
      const s = this.state;
      if (!s) return;

      /* --- Flame target ---------------------------------------- */
      this.flame.targetIntensity = (s.heatIntensity || 0) / 100;
      this.flame.colorOverride = this._detectFlameColor(s);
      this.flame.intensity = lerp(this.flame.intensity, this.flame.targetIntensity, dt * 4);
      this.flame.flicker += dt * (6 + this.flame.intensity * 10);

      /* --- Solution color --------------------------------------- */
      const target = this._computeSolutionColor(s);
      const k = 1 - Math.pow(0.0005, dt);
      this.solutionColor.r = lerp(this.solutionColor.r, target.r, k);
      this.solutionColor.g = lerp(this.solutionColor.g, target.g, k);
      this.solutionColor.b = lerp(this.solutionColor.b, target.b, k);
      this.solutionColor.a = lerp(this.solutionColor.a, target.a, k);

      /* --- Explosion detection ---------------------------------- */
      if (s.explosionFlag && (!this.prevState || !this.prevState.explosionFlag)) {
        this.triggerExplosion(1.1);
      }

      /* --- Particle spawning ------------------------------------ */
      this._spawnPrecipGrains(s);
      this._spawnBubbles(dt, s);
      this._spawnFumes(dt, s);

      /* --- Particle integration --------------------------------- */
      this._stepParticles(dt);

      /* --- Effect decay ----------------------------------------- */
      this.shake.mag *= Math.pow(0.015, dt);
      if (this.shake.mag < 0.001) this.shake.mag = 0;
      this.flash.a *= Math.pow(0.008, dt);
      if (this.flash.a < 0.002) this.flash.a = 0;
    },

    /* ============================================================== *
     * FLAME COLOR DETECTION (flame test from DB)
     * ============================================================== */
    _detectFlameColor(state) {
      if (!DB) return null;

      const FLAME_MAP = {
        'lithium': 'Li', 'sodium': 'Na', 'potassium': 'K',
        'rubidium': 'Rb', 'cesium': 'Cs',
        'calcium': 'Ca', 'barium': 'Ba',
        'copper': 'Cu',
        'copper_sulfate_pentahydrate': 'Cu',
        'copper_sulfate_anhydrous': 'Cu',
        'copper_chloride': 'Cu',
        'copper_nitrate': 'Cu',
        'zinc': 'Zn', 'iron': 'Fe', 'magnesium': 'Mg',
        'lead_nitrate': 'Pb',
      };

      let best = null, bestScore = 0;
      for (const c of state.contents) {
        const el = FLAME_MAP[c.id];
        if (!el) continue;
        const info = DB.getFlameColor(el);
        if (!info || !info.hex) continue;
        if (c.moles > bestScore) {
          bestScore = c.moles;
          best = info;
        }
      }
      if (!best || bestScore < 1e-5) return null;

      return {
        rgb: hexToRgb(best.hex),
        name: best.name,
        intensity: clamp(0.35 + this.flame.intensity * 0.65, 0, 1),
      };
    },

    /* ============================================================== *
     * SOLUTION COLOR ENGINE
     * ============================================================== */
    _computeSolutionColor(state) {
      const base = { r: 205, g: 225, b: 240, a: 0.20 };

      let rS = 0, gS = 0, bS = 0, wS = 0;
      let maxA = 0.15;

      const volL = Math.max(state.waterVolume / 1000, 0.001);

      for (const c of state.contents) {
        if (c.phase !== 'dissolved' && c.phase !== 'aqueous' && c.phase !== 'liquid') continue;

        /* Virtual species carry their own color */
        if (c.virtual && c.colorHex) {
          const rgb = hexToRgb(c.colorHex);
          const w = c.moles;
          rS += rgb.r * w; gS += rgb.g * w; bS += rgb.b * w; wS += w;
          maxA = Math.max(maxA, 0.85);
          continue;
        }

        const chem = DB ? DB.get(c.id) : null;
        if (!chem) continue;
        const sc = chem.solutionColor;
        if (!sc || !sc.hex) continue;
        if (sc.visible === false || (sc.alpha !== undefined && sc.alpha === 0)) continue;

        const rgb = hexToRgb(sc.hex);
        const w = c.moles;
        rS += rgb.r * w; gS += rgb.g * w; bS += rgb.b * w; wS += w;

        const conc = c.moles / volL;
        maxA = Math.max(maxA, clamp(0.28 + conc * 0.85, 0.25, 0.9));
      }

      let blended = (wS > 0)
        ? { r: rS / wS, g: gS / wS, b: bS / wS, a: maxA }
        : base;

      /* Indicator tint (phenolphthalein / universal / MO / litmus) */
      const tint = this._computeIndicatorTint(state);
      if (tint) {
        const mixed = mixRgb(blended, tint, tint.a);
        blended = { r: mixed.r, g: mixed.g, b: mixed.b, a: Math.max(blended.a, tint.a) };
      }

      return blended;
    },

    _computeIndicatorTint(state) {
      const has = (id) => state.contents.some(c => c.id === id);
      const pH = state.pH;

      /* --- Phenolphthalein --- */
      if (has('phenolphthalein')) {
        if (pH >= 8.2) {
          const t = clamp((pH - 8.2) / 1.8, 0, 1);
          return { r: 224, g: 33, b: 138, a: 0.82 * ease(t) };
        }
        return null;
      }

      /* --- Methyl orange --- */
      if (has('methyl_orange')) {
        if (pH <= 3.1) return { r: 231, g: 76, b: 60, a: 0.75 };
        if (pH >= 4.4) return { r: 241, g: 196, b: 15, a: 0.70 };
        const t = (pH - 3.1) / 1.3;
        return { r: lerp(231, 241, t), g: lerp(76, 196, t), b: lerp(60, 15, t), a: 0.72 };
      }

      /* --- Litmus --- */
      if (has('litmus')) {
        if (pH < 4.5) return { r: 231, g: 76, b: 60, a: 0.65 };
        if (pH > 8.3) return { r: 46, g: 134, b: 193, a: 0.65 };
        const t = (pH - 4.5) / 3.8;
        return { r: lerp(231, 46, t), g: lerp(76, 134, t), b: lerp(60, 193, t), a: 0.65 };
      }

      /* --- Universal indicator --- */
      if (has('universal_indicator') && DB) {
        const chem = DB.get('universal_indicator');
        const scale = chem && chem.indicator && chem.indicator.phColorScale;
        if (!scale) return null;
        const p = clamp(pH, 0, 14);
        let lo = scale[0], hi = scale[scale.length - 1];
        for (let i = 0; i < scale.length - 1; i++) {
          if (p >= scale[i].ph && p <= scale[i + 1].ph) {
            lo = scale[i]; hi = scale[i + 1]; break;
          }
        }
        const t = (hi.ph === lo.ph) ? 0 : (p - lo.ph) / (hi.ph - lo.ph);
        const c1 = hexToRgb(lo.hex), c2 = hexToRgb(hi.hex);
        const mixed = mixRgb(c1, c2, t);
        return { r: mixed.r, g: mixed.g, b: mixed.b, a: 0.72 };
      }

      return null;
    },

    /* ============================================================== *
     * PARTICLE SPAWNERS
     * ============================================================== */
    _spawnPrecipGrains(state) {
      const total = state.precipitates.reduce((a, p) => a + p.moles, 0);
      const dMoles = total - this._prevPrecipTotal;
      this._prevPrecipTotal = total;
      if (dMoles <= 1e-5) return;

      const p0 = state.precipitates[0];
      const rgb = hexToRgb(p0 ? p0.hex : '#cccccc');

      const n = Math.min(70, Math.ceil(dMoles * 5e4) + 10);
      for (let i = 0; i < n; i++) {
        this.grains.push({
          x: rand(-0.9, 0.9),
          y: rand(0, 0.35),
          vx: rand(-0.08, 0.08),
          vy: rand(0.25, 0.6),
          size: rand(1.1, 3.0),
          settleY: rand(0.82, 0.98),
          settled: false,
          life: 1,
          rgb: rgb,
        });
      }
    },

    _spawnBubbles(dt, state) {
      if (state.waterVolume < 5) return;
      const totalGas = state.gases.reduce((a, g) => a + g.moles, 0);
      if (totalGas < 1e-6) return;

      const isH2   = state.gases.some(g => g.id === 'hydrogen_gas');
      const isCO2  = state.gases.some(g => g.id === 'carbon_dioxide');
      const isO2   = state.gases.some(g => g.id === 'oxygen_gas');

      const rate = Math.min(90, totalGas * 2200);
      const count = Math.floor(rate * dt) + (Math.random() < (rate * dt) ? 1 : 0);

      for (let i = 0; i < count; i++) {
        const r = isCO2 ? rand(2.5, 5.5) : rand(1.6, 3.4);
        this.bubbles.push({
          x: rand(-0.88, 0.88),
          y: 0.98,
          r: r,
          vy: rand(0.18, 0.42) * (isH2 ? 1.9 : isO2 ? 1.05 : 1.0),
          wobble: rand(0, Math.PI * 2),
          life: 1,
          kind: isH2 ? 'h2' : isCO2 ? 'co2' : 'gas',
        });
      }
    },

    _spawnFumes(dt, state) {
      if (state.waterVolume <= 0) return;
      const T = state.temperature;
      const boiling = state.boiling;

      /* --- Water vapor --- */
      if (T > 70 || boiling) {
        const rate = boiling ? 70 : (T - 70) * 2.2;
        const n = Math.floor(rate * dt) + (Math.random() < rate * dt ? 1 : 0);
        for (let i = 0; i < n; i++) {
          this.fumes.push({
            x: rand(-0.45, 0.45),
            y: rand(-0.02, 0.10),
            vx: rand(-0.04, 0.04),
            vy: rand(-0.28, -0.16),
            r: rand(5, 13),
            life: 1,
            decay: rand(0.35, 0.6),
            rgb: { r: 220, g: 228, b: 240 },
            a: 0.32,
          });
        }
      }

      /* --- Colored fumes from specific gases --- */
      for (const g of state.gases) {
        if (g.ignited) continue;
        let rgb = null, alpha = 0.4;

        if (g.id === 'chlorine_gas') {
          rgb = { r: 210, g: 225, b: 90 }; alpha = 0.50;
        } else if (g.id === 'sulfur_dioxide') {
          rgb = { r: 250, g: 235, b: 170 }; alpha = 0.28;
        } else if (g.id === 'nitrogen_dioxide') {
          rgb = { r: 175, g: 82,  b: 40  }; alpha = 0.55;
        }

        if (!rgb) continue;

        const rate = Math.min(45, g.moles * 3500) * dt;
        const n = Math.floor(rate) + (Math.random() < rate ? 1 : 0);
        for (let i = 0; i < n; i++) {
          this.fumes.push({
            x: rand(-0.5, 0.5),
            y: rand(-0.05, 0.18),
            vx: rand(-0.09, 0.09),
            vy: rand(-0.32, -0.18),
            r: rand(7, 17),
            life: 1,
            decay: rand(0.28, 0.48),
            rgb: rgb,
            a: alpha,
          });
        }
      }
    },

    /* ============================================================== *
     * PARTICLE INTEGRATION
     * ============================================================== */
    _stepParticles(dt) {
      /* Bubbles */
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.y -= b.vy * dt;
        b.wobble += dt * 4;
        b.x += Math.sin(b.wobble) * 0.006;
        if (b.y < 0.02) b.life -= dt * 4.5;
        if (b.life <= 0) this.bubbles.splice(i, 1);
      }

      /* Fumes */
      for (let i = this.fumes.length - 1; i >= 0; i--) {
        const f = this.fumes[i];
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.r += dt * 9;
        f.life -= f.decay * dt;
        if (f.life <= 0) this.fumes.splice(i, 1);
      }

      /* Sediment grains */
      for (let i = this.grains.length - 1; i >= 0; i--) {
        const g = this.grains[i];
        if (!g.settled) {
          g.y += g.vy * dt;
          g.x += g.vx * dt;
          g.vx *= Math.pow(0.08, dt);
          if (g.y >= g.settleY) { g.y = g.settleY; g.settled = true; }
        }
        if (g.settled) g.life -= dt * 0.012;
        if (g.life <= 0) this.grains.splice(i, 1);
      }

      /* Sparks */
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 500 * dt;
        s.life -= dt * 1.35;
        if (s.life <= 0) this.sparks.splice(i, 1);
      }

      /* Capacity caps */
      if (this.bubbles.length > 180) this.bubbles.splice(0, this.bubbles.length - 180);
      if (this.fumes.length   > 240) this.fumes.splice(0, this.fumes.length - 240);
      if (this.grains.length  > 420) this.grains.splice(0, this.grains.length - 420);
      if (this.sparks.length  > 200) this.sparks.splice(0, this.sparks.length - 200);
    },

    /* ============================================================== *
     * DRAW
     * ============================================================== */
    _draw() {
      const ctx = this.ctx;
      if (!ctx) return;

      /* Clear */
      ctx.save();
      ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      ctx.fillStyle = '#05080d';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();

      /* World transform (+ shake) */
      const sx = this.shake.mag > 0.001 ? Math.sin(this.time * 47) * this.shake.mag * 20 : 0;
      const sy = this.shake.mag > 0.001 ? Math.cos(this.time * 53) * this.shake.mag * 14 : 0;

      ctx.save();
      ctx.translate(this.ox + sx, this.oy + sy);
      ctx.scale(this.scale, this.scale);

      this._drawBackdrop(ctx);
      this._drawBench(ctx);
      this._drawBurner(ctx);
      this._drawFlame(ctx);
      this._drawBeakerBack(ctx);
      this._drawLiquid(ctx);
      this._drawPrecipitateMound(ctx);
      this._drawGrains(ctx);
      this._drawBubbles(ctx);
      this._drawSparks(ctx);
      this._drawBeakerFront(ctx);
      this._drawFumes(ctx);
      this._drawHUD(ctx);

      ctx.restore();

      /* Screen-space flash overlay */
      if (this.flash.a > 0.002) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const c = this.flash.color;
        ctx.fillStyle = 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + this.flash.a + ')';
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.restore();
      }
    },

    /* ---------------- Backdrop ---------------- */
    _drawBackdrop(ctx) {
      const g = ctx.createRadialGradient(600, 420, 80, 600, 420, 950);
      g.addColorStop(0, '#1a2333');
      g.addColorStop(0.55, '#0e1520');
      g.addColorStop(1, '#04070b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

      /* Faint grid */
      ctx.strokeStyle = 'rgba(90,120,170,0.045)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= DESIGN_W; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, DESIGN_H); ctx.stroke();
      }
      for (let y = 0; y <= DESIGN_H; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DESIGN_W, y); ctx.stroke();
      }

      /* Vignette */
      const v = ctx.createRadialGradient(600, 400, 350, 600, 400, 850);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    },

    /* ---------------- Bench ---------------- */
    _drawBench(ctx) {
      const g = ctx.createLinearGradient(0, 640, 0, DESIGN_H);
      g.addColorStop(0, '#141b26');
      g.addColorStop(0.35, '#0d121b');
      g.addColorStop(1, '#05080d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 640, DESIGN_W, DESIGN_H - 640);

      /* Bench edge highlight */
      ctx.fillStyle = 'rgba(70,100,140,0.35)';
      ctx.fillRect(0, 640, DESIGN_W, 1);

      /* Reflection pool under beaker */
      ctx.save();
      ctx.globalAlpha = 0.28;
      const rg = ctx.createRadialGradient(600, 665, 10, 600, 665, 160);
      rg.addColorStop(0, 'rgba(110,160,210,0.45)');
      rg.addColorStop(1, 'rgba(110,160,210,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(600, 665, 150, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /* ---------------- Bunsen Burner ---------------- */
    _drawBurner(ctx) {
      const B = BURNER;

      /* Base shadow */
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(B.cx, B.baseY + B.baseH + 4, B.baseW * 0.6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* Base (elliptical) */
      const bg = ctx.createLinearGradient(0, B.baseY - 4, 0, B.baseY + B.baseH);
      bg.addColorStop(0, '#4a5568');
      bg.addColorStop(0.5, '#2a3444');
      bg.addColorStop(1, '#151b26');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(B.cx, B.baseY + B.baseH / 2, B.baseW / 2, B.baseH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,155,190,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      /* Base highlight */
      ctx.fillStyle = 'rgba(190,210,235,0.16)';
      ctx.beginPath();
      ctx.ellipse(B.cx - 6, B.baseY + 3, B.baseW * 0.35, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      /* Stem */
      const sg = ctx.createLinearGradient(B.cx - B.stemW / 2, 0, B.cx + B.stemW / 2, 0);
      sg.addColorStop(0, '#11171f');
      sg.addColorStop(0.35, '#4c5867');
      sg.addColorStop(0.5, '#7a8798');
      sg.addColorStop(0.65, '#4c5867');
      sg.addColorStop(1, '#0e131a');
      ctx.fillStyle = sg;
      ctx.fillRect(B.cx - B.stemW / 2, B.stemTopY, B.stemW, B.stemBotY - B.stemTopY);

      /* Collar */
      ctx.fillStyle = '#2c3542';
      ctx.fillRect(B.cx - B.stemW / 2 - 4, B.stemTopY - 4, B.stemW + 8, 7);
      ctx.fillStyle = 'rgba(190,210,235,0.18)';
      ctx.fillRect(B.cx - B.stemW / 2 - 4, B.stemTopY - 4, B.stemW + 8, 1.4);

      /* Nozzle */
      const ng = ctx.createLinearGradient(B.cx - B.nozzleW / 2, 0, B.cx + B.nozzleW / 2, 0);
      ng.addColorStop(0, '#1a202b');
      ng.addColorStop(0.5, '#8593a5');
      ng.addColorStop(1, '#141a24');
      ctx.fillStyle = ng;
      ctx.fillRect(B.cx - B.nozzleW / 2, B.nozzleY, B.nozzleW, B.nozzleH);
      ctx.fillStyle = 'rgba(200,220,240,0.22)';
      ctx.fillRect(B.cx - B.nozzleW / 2, B.nozzleY, B.nozzleW, 1.4);

      /* Air inlet holes */
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(B.cx - 6 + i * 6, B.nozzleY + 9, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /* ---------------- Flame ---------------- */
    _drawFlame(ctx) {
      const B = BURNER;
      const I = this.flame.intensity;
      if (I < 0.02) return;

      const flicker = this.flame.flicker;
      const h = 44 + I * 168;
      const baseY = B.nozzleY;
      const baseW = 13 + I * 9;

      /* Base flame colors: blue outer, yellow-orange inner */
      let oR = 62, oG = 132, oB = 255;
      let iR = 255, iG = 224, iB = 138;

      /* Flame-test override */
      if (this.flame.colorOverride && this.flame.colorOverride.intensity > 0.25) {
        const ov = this.flame.colorOverride;
        const t = ov.intensity;
        oR = lerp(oR, ov.rgb.r, t);
        oG = lerp(oG, ov.rgb.g, t);
        oB = lerp(oB, ov.rgb.b, t);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      /* Soft outer glow */
      const glowR = h * 1.5;
      const glow = ctx.createRadialGradient(B.cx, baseY - h * 0.35, 6, B.cx, baseY - h * 0.35, glowR);
      glow.addColorStop(0,    'rgba(' + (oR | 0) + ',' + (oG | 0) + ',' + (oB | 0) + ',' + (0.30 * I) + ')');
      glow.addColorStop(0.45, 'rgba(' + (oR | 0) + ',' + (oG | 0) + ',' + (oB | 0) + ',' + (0.10 * I) + ')');
      glow.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(B.cx, baseY - h * 0.35, glowR, 0, Math.PI * 2);
      ctx.fill();

      /* Outer flame body */
      const wobble = noise(flicker) * 4.5 * I;
      const outerGrad = ctx.createLinearGradient(0, baseY, 0, baseY - h);
      outerGrad.addColorStop(0,    'rgba(' + (oR | 0) + ',' + (oG | 0) + ',' + (oB | 0) + ',0.92)');
      outerGrad.addColorStop(0.55, 'rgba(' + (oR | 0) + ',' + (oG | 0) + ',' + (oB | 0) + ',0.55)');
      outerGrad.addColorStop(1,    'rgba(' + (Math.min(255, oR * 1.2) | 0) + ',' + (Math.min(255, oG * 1.15) | 0) + ',' + (255) + ',0.04)');

      ctx.beginPath();
      ctx.moveTo(B.cx - baseW, baseY);
      ctx.bezierCurveTo(
        B.cx - baseW * 1.05, baseY - h * 0.35,
        B.cx - baseW * 0.4,  baseY - h * 0.75,
        B.cx + wobble,       baseY - h
      );
      ctx.bezierCurveTo(
        B.cx + baseW * 0.4,  baseY - h * 0.75,
        B.cx + baseW * 1.05, baseY - h * 0.35,
        B.cx + baseW,        baseY
      );
      ctx.closePath();
      ctx.fillStyle = outerGrad;
      ctx.fill();

      /* Inner flame */
      const ih = h * 0.62;
      const iw = baseW * 0.55;
      const wobble2 = noise(flicker * 1.4 + 0.9) * 2.5 * I;
      const innerGrad = ctx.createLinearGradient(0, baseY, 0, baseY - ih);
      innerGrad.addColorStop(0,   'rgba(' + (iR | 0) + ',' + (iG | 0) + ',' + (iB | 0) + ',0.95)');
      innerGrad.addColorStop(0.7, 'rgba(' + (iR | 0) + ',' + ((iG * 0.85) | 0) + ',' + ((iB * 0.6) | 0) + ',0.5)');
      innerGrad.addColorStop(1,   'rgba(255,255,220,0)');

      ctx.beginPath();
      ctx.moveTo(B.cx - iw, baseY);
      ctx.bezierCurveTo(
        B.cx - iw * 0.95, baseY - ih * 0.3,
        B.cx - iw * 0.35, baseY - ih * 0.7,
        B.cx + wobble2,   baseY - ih
      );
      ctx.bezierCurveTo(
        B.cx + iw * 0.35, baseY - ih * 0.7,
        B.cx + iw * 0.95, baseY - ih * 0.3,
        B.cx + iw,        baseY
      );
      ctx.closePath();
      ctx.fillStyle = innerGrad;
      ctx.fill();

      /* Hot core */
      const ch = ih * 0.5;
      const cg = ctx.createLinearGradient(0, baseY, 0, baseY - ch);
      cg.addColorStop(0, 'rgba(255,244,210,1)');
      cg.addColorStop(0.6, 'rgba(255,200,110,0.75)');
      cg.addColorStop(1, 'rgba(255,160,70,0)');
      ctx.beginPath();
      ctx.ellipse(B.cx + wobble2 * 0.4, baseY - ch * 0.45, iw * 0.55, ch * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.fill();

      ctx.restore();
    },

    /* ---------------- Beaker back (interior) ---------------- */
    _drawBeakerBack(ctx) {
      const B = BEAKER;
      const x0 = B.cx - B.outerW / 2;
      const y0 = B.cy - B.outerH / 2;
      const w = B.outerW;
      const h = B.outerH;

      ctx.save();
      /* Inner wall shadow */
      const ig = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      ig.addColorStop(0,    'rgba(90,130,180,0.20)');
      ig.addColorStop(0.08, 'rgba(160,195,230,0.05)');
      ig.addColorStop(0.5,  'rgba(120,155,200,0.02)');
      ig.addColorStop(0.92, 'rgba(160,195,230,0.05)');
      ig.addColorStop(1,    'rgba(90,130,180,0.20)');

      this._roundRect(ctx, x0 + B.wall, y0 + B.wall, w - B.wall * 2, h - B.wall * 2, B.cornerR * 0.6);
      ctx.fillStyle = ig;
      ctx.fill();
      ctx.restore();
    },

    /* ---------------- Liquid ---------------- */
    _drawLiquid(ctx) {
      const B = BEAKER;
      const s = this.state;
      if (!s || s.waterVolume <= 0) return;

      const x0 = B.cx - B.outerW / 2 + B.wall;
      const y0 = B.cy - B.outerH / 2 + B.wall;
      const w  = B.outerW - B.wall * 2;
      const h  = B.outerH - B.wall * 2;

      const volFrac = clamp(s.waterVolume / B.maxML, 0, 1.35);
      const liquidH = volFrac * (h - 8);
      const liquidTop = y0 + h - liquidH;
      const liquidBot = y0 + h;

      const c = this.solutionColor;

      ctx.save();
      this._roundRect(ctx, x0, y0, w, h, B.cornerR * 0.6);
      ctx.clip();

      /* --- Liquid body with concave meniscus top --- */
      const topY_edge   = liquidTop - 1;
      const topY_center = liquidTop + 14;

      const grad = ctx.createLinearGradient(0, topY_edge, 0, liquidBot);
      grad.addColorStop(0,    rgba({ r: Math.min(255, c.r + 32), g: Math.min(255, c.g + 30), b: Math.min(255, c.b + 25) }, c.a));
      grad.addColorStop(0.55, rgba(c, c.a));
      grad.addColorStop(1,    rgba({ r: Math.max(0, c.r - 22), g: Math.max(0, c.g - 22), b: Math.max(0, c.b - 18) }, Math.min(1, c.a + 0.12)));

      ctx.beginPath();
      ctx.moveTo(x0, liquidBot);
      ctx.lineTo(x0, topY_edge);
      ctx.quadraticCurveTo(B.cx, topY_center, x0 + w, topY_edge);
      ctx.lineTo(x0 + w, liquidBot);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      /* --- Depth darkening --- */
      const dg = ctx.createLinearGradient(0, liquidBot - liquidH * 0.35, 0, liquidBot);
      dg.addColorStop(0, 'rgba(0,0,0,0)');
      dg.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = dg;
      ctx.fillRect(x0 - 2, liquidBot - liquidH * 0.35, w + 4, liquidH * 0.35);

      /* --- Meniscus shimmer (light reflection on the curved surface) --- */
      const shimAlpha = 0.28 + 0.10 * Math.sin(this.time * 1.7);
      const shim = ctx.createLinearGradient(0, topY_edge - 4, 0, topY_center);
      shim.addColorStop(0, 'rgba(255,255,255,0)');
      shim.addColorStop(0.5, 'rgba(255,255,255,' + shimAlpha + ')');
      shim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.moveTo(x0 + 3, topY_edge + 2);
      ctx.quadraticCurveTo(B.cx, topY_center - 2, x0 + w - 3, topY_edge + 2);
      ctx.quadraticCurveTo(B.cx, topY_center + 3, x0 + 3, topY_edge + 2);
      ctx.closePath();
      ctx.fillStyle = shim;
      ctx.fill();

      /* --- Caustic pattern near bottom --- */
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.10;
      for (let i = 0; i < 5; i++) {
        const t = this.time * 0.4 + i * 1.3;
        const cx2 = B.cx + Math.sin(t) * (w * 0.35);
        const cy2 = liquidBot - 8 - i * 2;
        const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 22);
        g2.addColorStop(0, 'rgba(180,220,255,0.5)');
        g2.addColorStop(1, 'rgba(180,220,255,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.restore();
    },

    /* ---------------- Precipitate mound ---------------- */
    _drawPrecipitateMound(ctx) {
      const B = BEAKER;
      const s = this.state;
      if (!s || !s.precipitates || s.precipitates.length === 0) return;

      const x0 = B.cx - B.outerW / 2 + B.wall;
      const y0 = B.cy - B.outerH / 2 + B.wall;
      const w  = B.outerW - B.wall * 2;
      const h  = B.outerH - B.wall * 2;

      const total = s.precipitates.reduce((a, p) => a + p.moles, 0);
      if (total < 1e-6) return;

      const moundH = Math.min(h * 0.24, 6 + Math.log10(1 + total * 1e5) * 11);
      const p0 = s.precipitates[0];
      const rgb = hexToRgb(p0.hex || '#cccccc');

      ctx.save();
      this._roundRect(ctx, x0, y0, w, h, B.cornerR * 0.6);
      ctx.clip();

      const baseY = y0 + h;

      /* Mound silhouette */
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.lineTo(x0, baseY - moundH * 0.4);
      ctx.quadraticCurveTo(B.cx, baseY - moundH * 1.35, x0 + w, baseY - moundH * 0.4);
      ctx.lineTo(x0 + w, baseY);
      ctx.closePath();

      const pg = ctx.createLinearGradient(0, baseY - moundH * 1.2, 0, baseY);
      pg.addColorStop(0, rgba(rgb, 0.88));
      pg.addColorStop(1, rgba({
        r: Math.max(0, rgb.r - 55),
        g: Math.max(0, rgb.g - 55),
        b: Math.max(0, rgb.b - 55),
      }, 0.96));
      ctx.fillStyle = pg;
      ctx.fill();

      /* Speckle for granular texture */
      const seed = Math.floor(total * 1e6);
      for (let i = 0; i < 46; i++) {
        const px = x0 + ((i * 73 + seed) % w);
        const py = baseY - ((i * 41 + seed * 3) % Math.max(1, moundH * 0.95));
        const shade = ((i * 37 + seed) % 2 === 0) ? 1.15 : 0.62;
        ctx.fillStyle = rgba({
          r: Math.min(255, rgb.r * shade),
          g: Math.min(255, rgb.g * shade),
          b: Math.min(255, rgb.b * shade),
        }, 0.55);
        ctx.fillRect(px, py, 1.6, 1.6);
      }

      /* Surface sheen */
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(B.cx, baseY - moundH * 0.85, w * 0.42, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.restore();
    },

    /* ---------------- Falling sediment grains ---------------- */
    _drawGrains(ctx) {
      const B = BEAKER;
      const s = this.state;
      if (!s || s.waterVolume <= 0 || this.grains.length === 0) return;

      const x0 = B.cx - B.outerW / 2 + B.wall;
      const y0 = B.cy - B.outerH / 2 + B.wall;
      const w  = B.outerW - B.wall * 2;
      const h  = B.outerH - B.wall * 2;

      const volFrac = clamp(s.waterVolume / B.maxML, 0, 1.35);
      const liquidH = volFrac * (h - 8);
      const liquidTop = y0 + h - liquidH;

      ctx.save();
      this._roundRect(ctx, x0, y0, w, h, B.cornerR * 0.6);
      ctx.clip();

      for (const g of this.grains) {
        const px = B.cx + g.x * (w / 2 - 5);
        const py = liquidTop + g.y * liquidH;
        const alpha = clamp(g.life, 0, 1) * 0.9;
        ctx.fillStyle = rgba(g.rgb, alpha);
        ctx.beginPath();
        ctx.arc(px, py, g.size, 0, Math.PI * 2);
        ctx.fill();
        if (g.size > 1.8) {
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.arc(px - g.size * 0.35, py - g.size * 0.35, g.size * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* ---------------- Bubbles ---------------- */
    _drawBubbles(ctx) {
      const B = BEAKER;
      const s = this.state;
      if (!s || s.waterVolume <= 0 || this.bubbles.length === 0) return;

      const x0 = B.cx - B.outerW / 2 + B.wall;
      const y0 = B.cy - B.outerH / 2 + B.wall;
      const w  = B.outerW - B.wall * 2;
      const h  = B.outerH - B.wall * 2;

      const volFrac = clamp(s.waterVolume / B.maxML, 0, 1.35);
      const liquidH = volFrac * (h - 8);
      const liquidTop = y0 + h - liquidH;

      ctx.save();
      this._roundRect(ctx, x0, y0, w, h, B.cornerR * 0.6);
      ctx.clip();

      for (const b of this.bubbles) {
        const px = B.cx + b.x * (w / 2 - 5);
        const py = liquidTop + b.y * liquidH;
        const alpha = clamp(b.life, 0, 1);

        /* Bubble body (radial gradient) */
        const bg = ctx.createRadialGradient(
          px - b.r * 0.35, py - b.r * 0.35, 0,
          px, py, b.r
        );
        bg.addColorStop(0, 'rgba(255,255,255,' + (alpha * 0.8) + ')');
        bg.addColorStop(0.6, 'rgba(220,238,255,' + (alpha * 0.22) + ')');
        bg.addColorStop(1, 'rgba(170,205,240,' + (alpha * 0.12) + ')');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(px, py, b.r, 0, Math.PI * 2);
        ctx.fill();

        /* Rim */
        ctx.strokeStyle = 'rgba(240,248,255,' + (alpha * 0.65) + ')';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        /* Specular dot */
        ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.95) + ')';
        ctx.beginPath();
        ctx.arc(px - b.r * 0.38, py - b.r * 0.4, b.r * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    /* ---------------- Sparks (explosion) ---------------- */
    _drawSparks(ctx) {
      if (this.sparks.length === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.sparks) {
        const a = clamp(s.life, 0, 1);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 4);
        g.addColorStop(0,   'rgba(255,240,190,' + a + ')');
        g.addColorStop(0.4, 'rgba(255,160,80,'  + (a * 0.6) + ')');
        g.addColorStop(1,   'rgba(255,80,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    /* ---------------- Beaker front (glass) ---------------- */
    _drawBeakerFront(ctx) {
      const B = BEAKER;
      const x0 = B.cx - B.outerW / 2;
      const y0 = B.cy - B.outerH / 2;
      const w  = B.outerW;
      const h  = B.outerH;
      const r  = B.cornerR;

      ctx.save();

      /* Main glass overlay */
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0.00, 'rgba(180,215,245,0.24)');
      g.addColorStop(0.03, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.08, 'rgba(180,215,245,0.10)');
      g.addColorStop(0.45, 'rgba(200,225,250,0.05)');
      g.addColorStop(0.5,  'rgba(230,245,255,0.06)');
      g.addColorStop(0.92, 'rgba(180,215,245,0.10)');
      g.addColorStop(0.97, 'rgba(255,255,255,0.42)');
      g.addColorStop(1.00, 'rgba(180,215,245,0.24)');

      this._roundRect(ctx, x0, y0, w, h, r);
      ctx.fillStyle = g;
      ctx.fill();

      /* Inner vertical highlight streaks */
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 + 18, y0 + 26);
      ctx.lineTo(x0 + 18, y0 + h - 26);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x0 + 26, y0 + 48);
      ctx.lineTo(x0 + 26, y0 + h - 48);
      ctx.stroke();

      /* Outer stroke */
      ctx.strokeStyle = 'rgba(205,230,255,0.58)';
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, x0, y0, w, h, r);
      ctx.stroke();

      /* Spout (upper-left pouring lip) */
      const sx = x0 + 8;
      const sy = y0;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 6);
      ctx.bezierCurveTo(sx - 12, sy - 6, sx - 26, sy - 4, sx - 34, sy + 8);
      ctx.bezierCurveTo(sx - 24, sy + 4, sx - 10, sy + 6, sx, sy + 16);
      ctx.closePath();

      const sg = ctx.createLinearGradient(sx - 34, 0, sx, 0);
      sg.addColorStop(0, 'rgba(180,215,245,0.16)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.42)');
      sg.addColorStop(1, 'rgba(180,215,245,0.28)');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(205,230,255,0.58)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      /* Rim ellipse (top) */
      ctx.beginPath();
      ctx.ellipse(B.cx, y0 + 3, w / 2 - 1, 7, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(220,240,255,0.62)';
      ctx.lineWidth = 1.7;
      ctx.stroke();

      /* Secondary inner rim */
      ctx.beginPath();
      ctx.ellipse(B.cx, y0 + 5, w / 2 - 5, 4.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180,210,240,0.30)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      /* Bottom inner curve */
      ctx.beginPath();
      ctx.ellipse(B.cx, y0 + h - 4, w / 2 - 6, 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180,210,240,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      /* Graduation marks */
      ctx.save();
      ctx.strokeStyle = 'rgba(205,230,255,0.5)';
      ctx.fillStyle = 'rgba(220,238,255,0.72)';
      ctx.font = 'bold 10px "JetBrains Mono", "Consolas", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineCap = 'round';

      const interiorTop = y0 + B.wall + 8;
      const interiorBot = y0 + h - B.wall - 6;

      for (const ml of B.graduations) {
        const frac = ml / B.maxML;
        const my = interiorBot - frac * (interiorBot - interiorTop);
        const isMajor = ml % 100 === 0;
        const len = isMajor ? 20 : 12;

        ctx.lineWidth = isMajor ? 1.5 : 0.9;
        ctx.beginPath();
        ctx.moveTo(x0 + w - B.wall - 4, my);
        ctx.lineTo(x0 + w - B.wall - 4 - len, my);
        ctx.stroke();

        if (isMajor) {
          ctx.fillText(String(ml), x0 + w - B.wall - 4 - len - 26, my);
        }
      }
      ctx.restore();

      /* Ambient temperature label near beaker */
      if (this.state) {
        const T = this.state.temperature;
        ctx.save();
        ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
        ctx.fillStyle = 'rgba(220,235,255,0.65)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tempStr = T.toFixed(1) + ' °C';
        const tx = B.cx;
        const ty = y0 - 26;
        const tw = ctx.measureText(tempStr).width + 16;
        ctx.fillStyle = 'rgba(12,20,32,0.72)';
        this._roundRect(ctx, tx - tw / 2, ty - 4, tw, 20, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,170,220,0.35)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, tx - tw / 2, ty - 4, tw, 20, 6);
        ctx.stroke();
        ctx.fillStyle = T > 90 ? '#ff7a4a' : T > 50 ? '#ffb84a' : 'rgba(220,235,255,0.85)';
        ctx.fillText(tempStr, tx, ty);
        ctx.restore();
      }

      ctx.restore();
    },

    /* ---------------- Fumes above beaker ---------------- */
    _drawFumes(ctx) {
      if (this.fumes.length === 0) return;
      const B = BEAKER;
      const topY = B.cy - B.outerH / 2;

      ctx.save();
      for (const f of this.fumes) {
        const px = B.cx + f.x * 220;
        const py = topY + f.y * 280 - 20;
        const alpha = clamp(f.life, 0, 1) * f.a;

        const g = ctx.createRadialGradient(px, py, 0, px, py, f.r);
        g.addColorStop(0,    rgba(f.rgb, alpha));
        g.addColorStop(0.55, rgba(f.rgb, alpha * 0.45));
        g.addColorStop(1,    rgba(f.rgb, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    /* ---------------- HUD overlays ---------------- */
    _drawHUD(ctx) {
      const s = this.state;
      if (!s) return;
      const B = BEAKER;

      /* Right side: volume / temp */
      const rx = B.cx + B.outerW / 2 + 46;
      const ry = B.cy + 20;

      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      /* Volume */
      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.7)';
      ctx.fillText('VOLUME', rx, ry - 30);

      ctx.font = 'bold 24px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = '#90d0ff';
      const volStr = s.waterVolume.toFixed(1);
      ctx.fillText(volStr, rx, ry - 6);
      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.7)';
      const vw = ctx.measureText(volStr).width;
      ctx.font = 'bold 24px "JetBrains Mono", "Consolas", monospace';
      const vw24 = ctx.measureText(volStr).width;
      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillText('mL', rx + vw24 + 6, ry - 2);

      /* Temperature */
      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.7)';
      ctx.fillText('TEMP', rx, ry + 34);

      const T = s.temperature;
      const tColor = T > 90 ? '#ff7a4a' : T > 50 ? '#ffb84a' : '#ffd28a';
      ctx.font = 'bold 22px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = tColor;
      const tStr = T.toFixed(1);
      ctx.fillText(tStr, rx, ry + 58);
      const tw22 = ctx.measureText(tStr).width;
      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.7)';
      ctx.fillText('°C', rx + tw22 + 6, ry + 62);

      /* Left side: pH */
      const lx = B.cx - B.outerW / 2 - 150;
      const ly = B.cy + 20;

      ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.7)';
      ctx.fillText('pH', lx, ly - 30);

      const pH = s.pH;
      const pColor = pH < 3 ? '#e74c3c'
                   : pH < 6 ? '#f39c12'
                   : pH < 8 ? '#2ecc71'
                   : pH < 11 ? '#3498db'
                   : '#9b59b6';
      ctx.font = 'bold 28px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = pColor;
      ctx.fillText(pH.toFixed(2), lx, ly - 4);

      /* pH bar */
      const barW = 118;
      const barY = ly + 26;
      ctx.fillStyle = 'rgba(30,45,65,0.6)';
      this._roundRect(ctx, lx, barY, barW, 9, 4);
      ctx.fill();

      const barGrad = ctx.createLinearGradient(lx, 0, lx + barW, 0);
      barGrad.addColorStop(0.00, '#e74c3c');
      barGrad.addColorStop(0.25, '#f39c12');
      barGrad.addColorStop(0.50, '#2ecc71');
      barGrad.addColorStop(0.75, '#3498db');
      barGrad.addColorStop(1.00, '#9b59b6');
      ctx.fillStyle = barGrad;
      this._roundRect(ctx, lx, barY, barW, 9, 4);
      ctx.fill();

      const mx = lx + (pH / 14) * barW;
      ctx.fillStyle = '#fdfefe';
      this._roundRect(ctx, mx - 1.5, barY - 4, 3, 17, 1.5);
      ctx.fill();

      /* Secondary stats */
      ctx.font = 'bold 10px "JetBrains Mono", "Consolas", monospace';
      ctx.fillStyle = 'rgba(130,170,215,0.55)';
      const totalMoles = s.contents.reduce((a, c) => a + c.moles, 0);
      ctx.fillText('Σn = ' + totalMoles.toFixed(4) + ' mol', lx, ly + 56);
      ctx.fillText('I  = ' + (s.ionicStrength || 0).toFixed(3) + ' M', lx, ly + 72);
      if (s.precipitates.length) {
        const pt = s.precipitates.reduce((a, p) => a + p.moles, 0);
        ctx.fillText('ppt = ' + pt.toExponential(2) + ' mol', lx, ly + 88);
      }

      ctx.restore();

      /* Dry vessel banner */
      if (s.isDry) {
        ctx.save();
        ctx.font = 'bold 12px "JetBrains Mono", "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const msg = '⚠  DRY VESSEL  —  waterVolume = 0 · reagents inert';
        const mw = ctx.measureText(msg).width + 30;
        const mx2 = B.cx;
        const my2 = B.cy + B.outerH / 2 + 46;
        ctx.fillStyle = 'rgba(60, 40, 10, 0.75)';
        this._roundRect(ctx, mx2 - mw / 2, my2 - 12, mw, 24, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,180,80,0.65)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, mx2 - mw / 2, my2 - 12, mw, 24, 6);
        ctx.stroke();
        ctx.fillStyle = '#ffcc80';
        ctx.fillText(msg, mx2, my2);
        ctx.restore();
      }

      /* Explosion banner */
      if (s.explosionFlag) {
        ctx.save();
        const a = clamp(this.shake.mag * 1.5, 0.3, 1.0);
        ctx.font = 'bold 30px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 70, 50, ' + a + ')';
        ctx.fillText('⚠  VIOLENT REACTION  ⚠', B.cx, 130);
        ctx.restore();
      }
    },

    /* ============================================================== *
     * ROUNDED RECT HELPERS
     * ============================================================== */
    _roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    /* ============================================================== *
     * PUBLIC FX API
     * ============================================================== */
    triggerExplosion(intensity) {
      const I = clamp(intensity || 1, 0.2, 2.0);
      this.shake.mag = I;
      this.flash.a = Math.min(0.88, 0.55 * I);
      this.flash.color = { r: 255, g: 208, b: 140 };

      /* Burst of sparks from the beaker center */
      const n = Math.floor(46 * I);
      for (let i = 0; i < n; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(90, 420) * I;
        this.sparks.push({
          x: 600 + rand(-30, 30),
          y: 420 + rand(-30, 30),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 120,
          size: rand(1.2, 3.6),
          life: 1,
        });
      }
      return this;
    },

    triggerFlash(rgb, alpha) {
      this.flash.color = rgb || { r: 255, g: 255, b: 255 };
      this.flash.a = clamp(alpha || 0.5, 0, 1);
      return this;
    },

    setFlameColor(hex) {
      if (!hex) { this.flame.colorOverride = null; return this; }
      this.flame.colorOverride = {
        rgb: hexToRgb(hex),
        name: 'external',
        intensity: 1,
      };
      return this;
    },

    /* ============================================================== *
     * DIAGNOSTICS
     * ============================================================== */
    stats() {
      return {
        version: VERSION,
        running: this.running,
        width: this.W, height: this.H, dpr: this.DPR, scale: +this.scale.toFixed(3),
        particles: {
          bubbles: this.bubbles.length,
          fumes: this.fumes.length,
          grains: this.grains.length,
          sparks: this.sparks.length,
        },
        flameIntensity: +this.flame.intensity.toFixed(3),
        flameColor: this.flame.colorOverride ? this.flame.colorOverride.name : 'natural',
        shake: +this.shake.mag.toFixed(3),
        flash: +this.flash.a.toFixed(3),
      };
    },
  };

  /* ================================================================== *
   * 3. BIND + AUTO-BOOT
   * ================================================================== */
  global.CanvasRenderer = CanvasRenderer;

  if (global.console && console.log) {
    console.log(
      '%c[VirtuaLab Pro] CanvasRenderer v' + VERSION + ' ready — ' +
      'photoreal beaker · fluid color mixing · flame-test FX',
      'color:#9B59B6;font-weight:bold;'
    );
  }

  if (typeof document !== 'undefined') {
    const boot = () => {
      CanvasRenderer.init(document.getElementById('labCanvas'));
      CanvasRenderer.start();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

})(typeof window !== 'undefined' ? window : this);
