/* ============================================================================
 * VirtuaLab Pro — canvas.js
 * ----------------------------------------------------------------------------
 * HTML5 Canvas Graphics & Particle Physics Engine
 * Author: VirtuaLab Pro Frontend Graphics Core
 * ----------------------------------------------------------------------------
 * EXPORTS: window.CanvasRenderer  (singleton)
 *
 * RENDERS (into #labCanvas):
 *   • 500 mL borosilicate beaker with glass highlights & graduation marks
 *   • Dynamic fluid column with wave physics + meniscus curvature
 *   • Colour-blended solution tinting (indicator-aware)
 *   • Realistic Bunsen burner flame below the beaker (heatIntensity > 0)
 *     — outer cone tint shifts per active metal (Na/K/Cu/Li flame tests)
 *   • Volumetric smoke clouds for NO2 / Cl2 / SO2 / NH3
 *   • Bubble effervescence during gas evolution & boiling
 *   • Precipitate sediment settling with Stokes-like fall physics
 *   • Ambient steam wisps when T ≥ 60 °C
 *
 * DEPENDS ON: window.ChemistryEngine, window.ChemicalsDB
 * ==========================================================================*/

(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  /* ==========================================================================
   * 1. DESIGN CONSTANTS
   * ========================================================================*/
  const VESSEL = {
    WIDTH_RATIO:  0.42,     // beaker width / canvas min dimension
    HEIGHT_RATIO: 0.62,     // beaker height / canvas height
    WALL:         4,        // glass thickness (px)
    LIP:          14,       // rim lip width (px)
    BOTTOM_R:     10,       // bottom corner radius
    MAX_VOLUME:   500       // mL capacity
  };

  const FLUID = {
    SURFACE_WAVES:  5,
    WAVE_AMP:       2.2,
    WAVE_SPEED:     0.9,
    MENISCUS_DEPTH: 6,
    MENISCUS_WIDTH: 14,
    OPACITY:        0.72
  };

  const COLORS = {
    bgTop:      '#020617',
    bgBottom:   '#0f172a',
    tableTop:   '#1e293b',
    tableEdge:  '#0f172a',
    glass:      'rgba(226,232,240,0.16)',
    glassEdge:  'rgba(148,163,184,0.65)',
    glassHi:    'rgba(255,255,255,0.22)',
    glassLow:   'rgba(15,23,42,0.35)',
    meniscus:   'rgba(255,255,255,0.28)',
    graduation:'rgba(203,213,225,0.45)',
    flameCore:  '#bfdbfe',
    flameMid:   '#60a5fa',
    flameOut:   '#3b82f6',
    flameTip:   'rgba(59,130,246,0.0)'
  };

  /* ==========================================================================
   * 2. MATH HELPERS
   * ========================================================================*/
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const rand  = (a, b) => a + Math.random() * (b - a);

  function hexToRgb(hex) {
    if (!hex) return { r: 200, g: 220, b: 240 };
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      const m = hex.match(/[\d.]+/g);
      return { r: +m[0], g: +m[1], b: +m[2] };
    }
    const h = hex.replace('#', '');
    const v = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
    return { r: v[0]||0, g: v[1]||0, b: v[2]||0 };
  }

  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  /* ==========================================================================
   * 3. PARTICLE CLASSES
   * ========================================================================*/

  /* ---- Bubble (effervescence / boiling) ------------------------------- */
  function Bubble(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.r = radius;
    this.vx = rand(-6, 6);
    this.vy = rand(-55, -25);
    this.wobble = rand(0, Math.PI * 2);
    this.wobbleSpeed = rand(1.5, 3.0);
    this.age = 0;
    this.life = rand(0.9, 2.2);
    this.color = color || '#e2e8f0';
    this.dead = false;
  }
  Bubble.prototype.update = function (dt, surfaceY) {
    this.age += dt;
    this.wobble += this.wobbleSpeed * dt;
    this.x += (this.vx + Math.sin(this.wobble) * 8) * dt;
    this.y += this.vy * dt;
    if (this.y - this.r <= surfaceY || this.age >= this.life) this.dead = true;
  };
  Bubble.prototype.draw = function (ctx) {
    const alpha = clamp(1 - (this.age / this.life), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    // bubble shell
    const g = ctx.createRadialGradient(
      this.x - this.r * 0.3, this.y - this.r * 0.3, this.r * 0.1,
      this.x, this.y, this.r
    );
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, rgba(this.color, 0.35));
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    // rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  };

  /* ---- Smoke puff (NO2 / Cl2 / SO2 / steam) --------------------------- */
  function Smoke(x, y, color, opts) {
    opts = opts || {};
    this.x = x;
    this.y = y;
    this.vx = opts.vx !== undefined ? opts.vx : rand(-18, 18);
    this.vy = opts.vy !== undefined ? opts.vy : rand(-38, -22);
    this.r = opts.r || rand(14, 26);
    this.rGrow = opts.rGrow || rand(12, 22);
    this.color = color || '#b45309';
    this.age = 0;
    this.life = opts.life || rand(2.4, 4.5);
    this.rot = rand(0, Math.PI * 2);
    this.rotSpd = rand(-0.6, 0.6);
    this.dead = false;
    this.alpha0 = opts.alpha !== undefined ? opts.alpha : 0.32;
  }
  Smoke.prototype.update = function (dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.r += this.rGrow * dt;
    this.rot += this.rotSpd * dt;
    this.vy *= 0.985;   // buoyancy decay
    if (this.age >= this.life) this.dead = true;
  };
  Smoke.prototype.draw = function (ctx) {
    const t = this.age / this.life;
    const alpha = this.alpha0 * (1 - t) * Math.min(1, t * 6);
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const c = hexToRgb(this.color);
    const g = ctx.createRadialGradient(0, 0, this.r * 0.15, 0, 0, this.r);
    g.addColorStop(0,   `rgba(${c.r},${c.g},${c.b},0.9)`);
    g.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},0.45)`);
    g.addColorStop(1,   `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ---- Sediment flake (precipitate settling) -------------------------- */
  function Sediment(x, y, size, color) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = color || '#ffffff';
    this.vy = rand(4, 12);          // settle velocity
    this.vx = rand(-3, 3);
    this.rot = rand(0, Math.PI * 2);
    this.rotSpd = rand(-1.2, 1.2);
    this.dead = false;
    this.settled = false;
    this.restY = 0;
  }
  Sediment.prototype.update = function (dt, floorY) {
    if (this.settled) {
      this.rot += this.rotSpd * dt * 0.15;
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpd * dt;
    this.vy = Math.min(this.vy + 6 * dt, 40);
    if (this.y >= floorY - this.size) {
      this.y = floorY - this.size;
      this.settled = true;
    }
  };
  Sediment.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalAlpha = this.settled ? 0.9 : 0.7;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.rect(-this.size / 2, -this.size / 2, this.size, this.size * 0.85);
    ctx.fill();
    ctx.restore();
  };

  /* ---- Metal chunk / solid crystal ------------------------------------ */
  function SolidChip(x, y, size, color, isMetal) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = color;
    this.isMetal = !!isMetal;
    this.rot = rand(0, Math.PI * 2);
    this.rotSpd = rand(-0.4, 0.4);
    this.settled = false;
    this.bobPhase = rand(0, Math.PI * 2);
    this.dead = false;
  }
  SolidChip.prototype.update = function (dt, floorY, fluidTopY, fluidBotY, isDry) {
    if (isDry) {
      // stays put as crystal on bottom
      this.settled = true;
      this.rot += this.rotSpd * dt * 0.2;
      return;
    }
    if (!this.settled) {
      this.y += 90 * dt;
      this.rot += this.rotSpd * dt;
      if (this.y >= floorY - this.size * 0.5) {
        this.y = floorY - this.size * 0.5;
        this.settled = true;
      }
    } else {
      // gentle thermal jitter when fluid is present
      this.bobPhase += dt * 1.2;
      this.x += Math.sin(this.bobPhase) * 0.15;
    }
  };
  SolidChip.prototype.draw = function (ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const s = this.size;
    // body
    const g = ctx.createLinearGradient(-s, -s, s, s);
    const base = hexToRgb(this.color);
    g.addColorStop(0, `rgba(${Math.min(255,base.r+30)},${Math.min(255,base.g+30)},${Math.min(255,base.b+30)},1)`);
    g.addColorStop(1, `rgba(${base.r},${base.g},${base.b},1)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (this.isMetal) {
      // irregular polygon chip
      ctx.moveTo(-s, 0);
      ctx.lineTo(-s * 0.4, -s * 0.8);
      ctx.lineTo(s * 0.6, -s * 0.5);
      ctx.lineTo(s, s * 0.2);
      ctx.lineTo(s * 0.3, s * 0.9);
      ctx.lineTo(-s * 0.7, s * 0.6);
      ctx.closePath();
    } else {
      // crystal rhombus
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.75, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.75, 0);
      ctx.closePath();
    }
    ctx.fill();
    // specular highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  };

  /* ==========================================================================
   * 4. CANVAS RENDERER SINGLETON
   * ========================================================================*/
  function CanvasRenderer() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.running = false;
    this.lastT = 0;
    this.time = 0;

    // particle pools
    this.bubbles  = [];
    this.smokes   = [];
    this.sediments = [];
    this.chips    = [];

    // fluid surface wave state (phase per wave component)
    this.wavePhase = [0, 1.3, 2.5, 3.7, 4.9];

    // cached geometry (recomputed on resize)
    this.geo = null;

    // smoke spawn accumulators
    this._smokeAccum = {};
    this._bubbleAccum = 0;
    this._steamAccum = 0;

    // flame flicker
    this._flameT = 0;

    this._raf = null;
  }

  /* ----------------------------------------------------------------------
   * 4.1  ATTACH / RESIZE
   * --------------------------------------------------------------------*/
  CanvasRenderer.prototype.attach = function (canvasEl) {
    if (!canvasEl) {
      console.error('[CanvasRenderer] attach: null canvas');
      return false;
    }
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { alpha: false });
    this._resize();
    global.addEventListener('resize', () => this._resize());
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this._resize());
      ro.observe(canvasEl.parentElement || canvasEl);
    }
    return true;
  };

  CanvasRenderer.prototype._resize = function () {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.width  = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width  = Math.floor(this.width  * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._computeGeometry();
  };

  CanvasRenderer.prototype._computeGeometry = function () {
    const W = this.width, H = this.height;
    const minDim = Math.min(W, H);

    const beakerW = Math.floor(minDim * VESSEL.WIDTH_RATIO * (W > H ? 1.05 : 1.0));
    const beakerH = Math.floor(H * VESSEL.HEIGHT_RATIO);
    const beakerX = Math.floor(W / 2 - beakerW / 2);
    const beakerY = Math.floor(H * 0.14);

    const innerX = beakerX + VESSEL.WALL;
    const innerY = beakerY + VESSEL.WALL;
    const innerW = beakerW - VESSEL.WALL * 2;
    const innerH = beakerH - VESSEL.WALL * 2;
    const floorY = beakerY + beakerH - VESSEL.WALL;

    this.geo = {
      beakerX, beakerY, beakerW, beakerH,
      innerX, innerY, innerW, innerH,
      floorY,
      tableY: beakerY + beakerH + 4,
      burnerY: beakerY + beakerH + 44
    };
  };

  /* ----------------------------------------------------------------------
   * 4.2  START / STOP ANIMATION LOOP
   * --------------------------------------------------------------------*/
  CanvasRenderer.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.05);
      this.lastT = t;
      this.time += dt;
      this._frame(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  CanvasRenderer.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  /* ----------------------------------------------------------------------
   * 4.3  FRAME ORCHESTRATION
   * --------------------------------------------------------------------*/
  CanvasRenderer.prototype._frame = function (dt) {
    const ctx = this.ctx;
    if (!ctx || !this.geo) return;

    const engine = global.ChemistryEngine;
    const cs = engine ? engine.getCanvasState() : null;

    // 1. Update wave phases
    for (let i = 0; i < this.wavePhase.length; i++) {
      this.wavePhase[i] += FLUID.WAVE_SPEED * (1 + i * 0.15) * dt;
    }

    // 2. Sync particles from engine state
    if (cs) this._syncParticles(cs, dt);

    // 3. Update particles
    const fluidTop = cs && cs.waterVolume > 0
      ? this._fluidTopY(cs.waterVolume)
      : this.geo.floorY;
    for (const b of this.bubbles)   b.update(dt, fluidTop);
    for (const s of this.smokes)    s.update(dt);
    for (const s of this.sediments) s.update(dt, this.geo.floorY - 2);
    for (const c of this.chips)     c.update(dt, this.geo.floorY,
                                            fluidTop, this.geo.floorY,
                                            cs && cs.waterVolume <= 0);

    // 4. Cull dead particles
    this.bubbles   = this.bubbles.filter(p => !p.dead);
    this.smokes    = this.smokes.filter(p => !p.dead);
    this.sediments = this.sediments.filter(p => !p.dead);
    this.chips     = this.chips.filter(p => !p.dead);

    // 5. Draw
    this._drawBackground(ctx);
    this._drawTable(ctx);
    if (cs && cs.heatIntensity > 0) this._drawBurner(ctx, cs);
    this._drawBeakerBack(ctx);
    if (cs) {
      this._drawFluid(ctx, cs);
      this._drawSolidChips(ctx);
      this._drawSediments(ctx);
      this._drawBubbles(ctx);
    }
    this._drawBeakerFront(ctx, cs);
    if (cs) this._drawSmokes(ctx, cs);
    this._drawTemperatureGlow(ctx, cs);
  };

  /* ----------------------------------------------------------------------
   * 4.4  PARTICLE SPAWNING FROM ENGINE STATE
   * --------------------------------------------------------------------*/
  CanvasRenderer.prototype._syncParticles = function (cs, dt) {
    const geo = this.geo;

    /* ---- Boiling bubbles ------------------------------------------- */
    if (cs.boiling && cs.waterVolume > 0) {
      const rate = 30 + cs.boilingRate * 40;
      this._bubbleAccum += rate * dt;
      const n = Math.floor(this._bubbleAccum);
      this._bubbleAccum -= n;
      const top = this._fluidTopY(cs.waterVolume);
      for (let i = 0; i < n; i++) {
        const x = rand(geo.innerX + 8, geo.innerX + geo.innerW - 8);
        const y = geo.floorY - rand(2, 12);
        this.bubbles.push(new Bubble(x, y, rand(2, 5), '#cbd5e1'));
      }
    }

    /* ---- Gas evolution bubbles (H2, CO2, Cl2, O2) ----------------- */
    for (const gasId in cs.gases) {
      const g = cs.gases[gasId];
      if (g.moles < 1e-6) continue;
      const rate = Math.min(60, 8 + Math.log10(g.moles * 1e4 + 1) * 25);
      const n = Math.floor(rate * dt + Math.random() * rate * dt);
      const top = this._fluidTopY(cs.waterVolume);
      for (let i = 0; i < n; i++) {
        const x = rand(geo.innerX + 10, geo.innerX + geo.innerW - 10);
        const y = geo.floorY - rand(2, 14);
        this.bubbles.push(new Bubble(x, y, rand(1.5, 4), g.bubbleColor));
      }
      // Dense fume cloud for toxic gases
      if (g.fumeColor && g.moles > 2e-4) {
        const accum = this._smokeAccum[gasId] || 0;
        const smokeRate = Math.min(30, 6 + Math.log10(g.moles * 1e5 + 1) * 10);
        const newAccum = accum + smokeRate * dt;
        const count = Math.floor(newAccum);
        this._smokeAccum[gasId] = newAccum - count;
        for (let i = 0; i < count; i++) {
          const sx = rand(geo.innerX + 12, geo.innerX + geo.innerW - 12);
          const sy = this._fluidTopY(cs.waterVolume) - rand(2, 10);
          this.smokes.push(new Smoke(sx, sy, g.fumeColor, {
            r: rand(10, 22), rGrow: rand(14, 26),
            life: rand(2.5, 5.0),
            alpha: 0.28
          }));
        }
      }
    }

    /* ---- Steam wisps (T ≥ 60 °C) ---------------------------------- */
    if (cs.temperature >= 60 && cs.waterVolume > 0) {
      const rate = (cs.temperature - 55) * 0.25;
      this._steamAccum += rate * dt;
      const n = Math.floor(this._steamAccum);
      this._steamAccum -= n;
      for (let i = 0; i < n; i++) {
        const sx = rand(geo.innerX + 12, geo.innerX + geo.innerW - 12);
        const sy = this._fluidTopY(cs.waterVolume) - rand(0, 6);
        this.smokes.push(new Smoke(sx, sy, '#e2e8f0', {
          r: rand(6, 12), rGrow: rand(10, 18),
          life: rand(1.8, 3.2),
          vy: rand(-30, -18),
          alpha: 0.18
        }));
      }
    }

    /* ---- Precipitate sediment spawn -------------------------------- */
    const precip = cs.solids.filter(s => s.kind === 'precipitate');
    for (const p of precip) {
      const want = Math.min(80, Math.floor(p.moles * 8e4));
      const have = this.sediments.filter(s => s._pid === p.id).length;
      const toSpawn = want - have;
      for (let i = 0; i < Math.min(toSpawn, 3); i++) {
        const sx = rand(geo.innerX + 10, geo.innerX + geo.innerW - 10);
        const sy = this._fluidTopY(cs.waterVolume) + rand(10, 40);
        const s = new Sediment(sx, sy, rand(1.4, 3.0), p.color);
        s._pid = p.id;
        this.sediments.push(s);
      }
    }

    /* ---- Solid metal chips / crystals ----------------------------- */
    const chipTargets = cs.solids.filter(s => s.kind === 'metal' || s.kind === 'solid');
    for (const target of chipTargets) {
      const want = Math.min(10, Math.max(1, Math.floor(target.moles * 5e3)));
      const have = this.chips.filter(c => c._cid === target.id).length;
      const toSpawn = want - have;
      for (let i = 0; i < Math.min(toSpawn, 2); i++) {
        const cx = rand(geo.innerX + 20, geo.innerX + geo.innerW - 20);
        const cy = cs.waterVolume > 0
          ? this._fluidTopY(cs.waterVolume) + rand(0, 20)
          : geo.floorY - 12;
        const chip = new SolidChip(cx, cy, rand(3.5, 6.5), target.color, target.kind === 'metal');
        chip._cid = target.id;
        chip.settled = cs.waterVolume <= 0;
        chip.y = cs.waterVolume <= 0 ? geo.floorY - chip.size * 0.5 : chip.y;
        this.chips.push(chip);
      }
    }

    /* ---- Prune chips/sediments for removed solids ------------------ */
    const liveIds = new Set(cs.solids.map(s => s.id));
    this.chips     = this.chips.filter(c => liveIds.has(c._cid));
    this.sediments = this.sediments.filter(s => liveIds.has(s._pid));
  };

  /* ----------------------------------------------------------------------
   * 4.5  FLUID TOP POSITION
   * --------------------------------------------------------------------*/
  CanvasRenderer.prototype._fluidTopY = function (volume) {
    const geo = this.geo;
    const frac = clamp(volume / VESSEL.MAX_VOLUME, 0, 1);
    return geo.floorY - frac * geo.innerH;
  };

  /* ==========================================================================
   * 5. DRAW ROUTINES
   * ========================================================================*/

  /* ---- 5.1 BACKGROUND ---------------------------------------------- */
  CanvasRenderer.prototype._drawBackground = function (ctx) {
    const { width: W, height: H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // soft radial vignette
    const r = Math.max(W, H) * 0.75;
    const rg = ctx.createRadialGradient(W / 2, H * 0.35, r * 0.15, W / 2, H * 0.35, r);
    rg.addColorStop(0, 'rgba(56,189,248,0.08)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };

  /* ---- 5.2 TABLE --------------------------------------------------- */
  CanvasRenderer.prototype._drawTable = function (ctx) {
    const geo = this.geo;
    const W = this.width;
    const y = geo.tableY;
    const h = this.height - y;

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, COLORS.tableTop);
    g.addColorStop(1, COLORS.tableEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, h);

    // surface highlight line
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  };

  /* ---- 5.3 BUNSEN BURNER FLAME ------------------------------------- */
  CanvasRenderer.prototype._drawBurner = function (ctx, cs) {
    const geo = this.geo;
    const intensity = clamp(cs.heatIntensity, 0, 1);
    if (intensity <= 0.001) return;

    const cx = geo.beakerX + geo.beakerW / 2;
    const baseY = geo.burnerY;
    const beakerBottom = geo.beakerY + geo.beakerH;

    /* ---- Burner barrel ------------------------------------------- */
    ctx.save();
    const barrelW = 20;
    const barrelTopY = baseY - 4;
    const barrelBotY = baseY + 58;
    const bg = ctx.createLinearGradient(cx - barrelW / 2, 0, cx + barrelW / 2, 0);
    bg.addColorStop(0, '#1e293b');
    bg.addColorStop(0.5, '#475569');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(cx - barrelW / 2, barrelTopY, barrelW, barrelBotY - barrelTopY);
    // base plate
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(cx, barrelBotY, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* ---- Flame cone ---------------------------------------------- */
    this._flameT += 0.016;
    const flicker = Math.sin(this._flameT * 8) * 0.08 +
                    Math.sin(this._flameT * 17 + 1.3) * 0.05 +
                    Math.random() * 0.04;
    const flameH = (beakerBottom - barrelTopY) * (0.5 + intensity * 0.55) * (1 + flicker);
    const flameW = (18 + intensity * 26) * (1 + flicker * 0.5);
    const flameTipY = beakerBottom - flameH;

    // Metal flame test tint (if any)
    const tintColor = cs.flameColor || null;
    const baseOuter = tintColor || COLORS.flameOut;
    const baseMid   = tintColor ? this._tintShift(tintColor, -10) : COLORS.flameMid;
    const baseCore  = tintColor ? this._tintShift(tintColor, 40)  : COLORS.flameCore;

    // Outer glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const outerGrad = ctx.createRadialGradient(
      cx, beakerBottom - flameH * 0.35, 4,
      cx, beakerBottom - flameH * 0.35, flameH * 0.85
    );
    outerGrad.addColorStop(0,   rgba(baseOuter, 0.35 * intensity));
    outerGrad.addColorStop(0.5, rgba(baseOuter, 0.15 * intensity));
    outerGrad.addColorStop(1,   rgba(baseOuter, 0));
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.ellipse(cx, beakerBottom - flameH * 0.35, flameW * 2.2, flameH * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer cone
    this._drawFlameCone(ctx, cx, beakerBottom + 2, flameW * 1.05, flameH,
                        baseOuter, 0.55 * intensity);

    // Mid cone
    this._drawFlameCone(ctx, cx, beakerBottom, flameW * 0.75, flameH * 0.82,
                        baseMid, 0.7 * intensity);

    // Inner hot core
    this._drawFlameCone(ctx, cx, beakerBottom - 2, flameW * 0.4, flameH * 0.55,
                        baseCore, 0.95 * intensity);

    // Inner white-hot nucleus
    this._drawFlameCone(ctx, cx, beakerBottom - 6, flameW * 0.2, flameH * 0.32,
                        '#ffffff', 0.75 * intensity);

    ctx.restore();
  };

  CanvasRenderer.prototype._drawFlameCone = function (ctx, cx, baseY, w, h, color, alpha) {
    const c = hexToRgb(color);
    ctx.save();
    const g = ctx.createLinearGradient(cx, baseY, cx, baseY - h);
    g.addColorStop(0,   `rgba(${c.r},${c.g},${c.b},${alpha * 0.9})`);
    g.addColorStop(0.6, `rgba(${c.r},${c.g},${c.b},${alpha * 0.5})`);
    g.addColorStop(1,   `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, baseY);
    // smooth S-curve flame profile
    ctx.bezierCurveTo(
      cx - w * 0.6, baseY - h * 0.35,
      cx - w * 0.15, baseY - h * 0.75,
      cx, baseY - h
    );
    ctx.bezierCurveTo(
      cx + w * 0.15, baseY - h * 0.75,
      cx + w * 0.6, baseY - h * 0.35,
      cx + w / 2, baseY
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  CanvasRenderer.prototype._tintShift = function (hex, delta) {
    const c = hexToRgb(hex);
    const f = v => clamp(v + delta, 0, 255).toString(16).padStart(2, '0');
    return '#' + f(c.r) + f(c.g) + f(c.b);
  };

  /* ---- 5.4 BEAKER (BACK WALL) -------------------------------------- */
  CanvasRenderer.prototype._drawBeakerBack = function (ctx) {
    const g = this.geo;
    ctx.save();
    // interior faint tint (glass back wall seen through fluid later)
    ctx.fillStyle = 'rgba(15,23,42,0.35)';
    ctx.beginPath();
    this._beakerPath(ctx, g.beakerX + 2, g.beakerY + 2, g.beakerW - 4, g.beakerH - 4);
    ctx.fill();
    ctx.restore();
  };

  CanvasRenderer.prototype._beakerPath = function (ctx, x, y, w, h) {
    const r = VESSEL.BOTTOM_R;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + w - r, y + h);
    ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    ctx.lineTo(x + w, y);
  };

  /* ---- 5.5 FLUID COLUMN WITH WAVES + MENISCUS ---------------------- */
  CanvasRenderer.prototype._drawFluid = function (ctx, cs) {
    if (cs.waterVolume <= 0) return;
    const g = this.geo;
    const topY = this._fluidTopY(cs.waterVolume);
    const botY = g.floorY;
    const leftX = g.innerX;
    const rightX = g.innerX + g.innerW;

    // Final color (indicator overrides base chromophore blend)
    const baseColor = cs.indicatorColor
      ? this._blendColors(cs.fluidColor, cs.indicatorColor, 0.55)
      : cs.fluidColor;

    ctx.save();

    // Clip to inner beaker shape so fluid stays inside glass
    ctx.beginPath();
    this._beakerPath(ctx, g.innerX, g.innerY, g.innerW, g.innerH);
    ctx.lineTo(g.innerX + g.innerW, g.innerY);
    ctx.closePath();
    ctx.clip();

    // --- Wave surface path ---
    const wavePts = [];
    const steps = 40;
    const amp = FLUID.WAVE_AMP * (1 + cs.stirring * 3 + (cs.boiling ? 2 : 0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(leftX, rightX, t);
      let yOff = 0;
      for (let k = 0; k < FLUID.SURFACE_WAVES; k++) {
        yOff += Math.sin(this.wavePhase[k] + t * Math.PI * (2 + k) + k) *
                (amp / (k + 1.4));
      }
      // meniscus curvature (edges higher)
      const edgeT = Math.min(t, 1 - t) * 2;   // 0 at edges, 1 at center
      const meniscus = (1 - edgeT) * FLUID.MENISCUS_DEPTH;
      // boiling jitter
      if (cs.boiling) yOff += (Math.random() - 0.5) * 3;
      wavePts.push({ x, y: topY + yOff + meniscus });
    }

    // --- Fluid body path ---
    ctx.beginPath();
    ctx.moveTo(wavePts[0].x, wavePts[0].y);
    for (let i = 1; i < wavePts.length; i++) {
      // smooth via quadratic midpoints
      const p = wavePts[i - 1], q = wavePts[i];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      ctx.quadraticCurveTo(p.x, p.y, mx, my);
    }
    ctx.lineTo(rightX, botY);
    ctx.lineTo(leftX, botY);
    ctx.closePath();

    // --- Fluid gradient fill ---
    const c = hexToRgb(baseColor);
    const fg = ctx.createLinearGradient(0, topY, 0, botY);
    fg.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${FLUID.OPACITY * 0.85})`);
    fg.addColorStop(0.5, `rgba(${Math.max(0,c.r-15)},${Math.max(0,c.g-15)},${Math.max(0,c.b-15)},${FLUID.OPACITY})`);
    fg.addColorStop(1, `rgba(${Math.max(0,c.r-30)},${Math.max(0,c.g-30)},${Math.max(0,c.b-30)},${FLUID.OPACITY})`);
    ctx.fillStyle = fg;
    ctx.fill();

    // --- Surface highlight line ---
    ctx.beginPath();
    ctx.moveTo(wavePts[0].x, wavePts[0].y);
    for (let i = 1; i < wavePts.length; i++) {
      const p = wavePts[i - 1], q = wavePts[i];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      ctx.quadraticCurveTo(p.x, p.y, mx, my);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Meniscus highlights at edges ---
    ctx.beginPath();
    ctx.arc(leftX + 1, wavePts[0].y + 2, FLUID.MENISCUS_WIDTH, -Math.PI * 0.6, Math.PI * 0.1);
    ctx.strokeStyle = COLORS.meniscus;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rightX - 1, wavePts[wavePts.length - 1].y + 2, FLUID.MENISCUS_WIDTH, Math.PI * 0.9, Math.PI * 1.6);
    ctx.stroke();

    // --- Temperature heat shimmer (subtle upward tint gradient) ---
    if (cs.temperature > 60) {
      const heat = clamp((cs.temperature - 60) / 60, 0, 1);
      const hg = ctx.createLinearGradient(0, botY, 0, topY);
      hg.addColorStop(0, `rgba(251,146,60,${0.10 * heat})`);
      hg.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      this._beakerPath(ctx, g.innerX, g.innerY, g.innerW, g.innerH);
      ctx.lineTo(g.innerX + g.innerW, g.innerY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  };

  CanvasRenderer.prototype._blendColors = function (a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(lerp(A.r, B.r, t));
    const g = Math.round(lerp(A.g, B.g, t));
    const bl = Math.round(lerp(A.b, B.b, t));
    return `rgb(${r},${g},${bl})`;
  };

  /* ---- 5.6 SOLID CHIPS -------------------------------------------- */
  CanvasRenderer.prototype._drawSolidChips = function (ctx) {
    for (const c of this.chips) c.draw(ctx);
  };

  /* ---- 5.7 SEDIMENTS ---------------------------------------------- */
  CanvasRenderer.prototype._drawSediments = function (ctx) {
    // draw settled ones first (below), suspended ones above
    const settled  = this.sediments.filter(s => s.settled);
    const floating = this.sediments.filter(s => !s.settled);
    for (const s of floating) s.draw(ctx);
    for (const s of settled)  s.draw(ctx);
  };

  /* ---- 5.8 BUBBLES ------------------------------------------------- */
  CanvasRenderer.prototype._drawBubbles = function (ctx) {
    for (const b of this.bubbles) b.draw(ctx);
  };

  /* ---- 5.9 SMOKES -------------------------------------------------- */
  CanvasRenderer.prototype._drawSmokes = function (ctx, cs) {
    // Draw smokes above the beaker rim so they waft upward and out
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.smokes) s.draw(ctx);
    ctx.restore();
  };

  /* ---- 5.10 BEAKER FRONT (glass overlay, rim, graduations) -------- */
  CanvasRenderer.prototype._drawBeakerFront = function (ctx, cs) {
    const g = this.geo;
    ctx.save();

    /* --- Rim (top lip) --- */
    ctx.beginPath();
    ctx.ellipse(
      g.beakerX + g.beakerW / 2,
      g.beakerY,
      g.beakerW / 2,
      VESSEL.LIP * 0.55,
      0, 0, Math.PI * 2
    );
    ctx.strokeStyle = COLORS.glassEdge;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      g.beakerX + g.beakerW / 2,
      g.beakerY,
      g.beakerW / 2 - 2,
      VESSEL.LIP * 0.55 - 1,
      0, 0, Math.PI * 2
    );
    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    /* --- Beaker outline (front wall) --- */
    ctx.beginPath();
    this._beakerPath(ctx, g.beakerX, g.beakerY, g.beakerW, g.beakerH);
    ctx.strokeStyle = COLORS.glassEdge;
    ctx.lineWidth = VESSEL.WALL;
    ctx.lineJoin = 'round';
    ctx.stroke();

    /* --- Vertical glass highlight --- */
    const hx = g.beakerX + 12;
    const hg = ctx.createLinearGradient(hx, g.beakerY, hx + 6, g.beakerY);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(hx, g.beakerY + 8, 6, g.beakerH - 20);

    /* --- Bottom spill shadow inside beaker --- */
    const botG = ctx.createLinearGradient(0, g.floorY - 16, 0, g.floorY);
    botG.addColorStop(0, 'rgba(15,23,42,0)');
    botG.addColorStop(1, 'rgba(15,23,42,0.45)');
    ctx.fillStyle = botG;
    ctx.fillRect(g.innerX, g.floorY - 16, g.innerW, 16);

    /* --- Graduation marks (every 100 mL) --- */
    const marks = [100, 200, 300, 400, 500];
    ctx.strokeStyle = COLORS.graduation;
    ctx.fillStyle = 'rgba(226,232,240,0.6)';
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const v of marks) {
      const y = this._fluidTopY(v);
      const markW = 20;
      ctx.beginPath();
      ctx.moveTo(g.beakerX + 8, y);
      ctx.lineTo(g.beakerX + 8 + markW, y);
      ctx.stroke();
      ctx.fillText(`${v}`, g.beakerX + 32, y);
    }

    /* --- Corner reflections --- */
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.beakerX + 3, g.beakerY + 20);
    ctx.lineTo(g.beakerX + 3, g.beakerY + g.beakerH - 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(g.beakerX + g.beakerW - 3, g.beakerY + 20);
    ctx.lineTo(g.beakerX + g.beakerW - 3, g.beakerY + g.beakerH - 20);
    ctx.stroke();

    ctx.restore();
  };

  /* ---- 5.11 TEMPERATURE GLOW AROUND BEAKER ------------------------ */
  CanvasRenderer.prototype._drawTemperatureGlow = function (ctx, cs) {
    if (!cs) return;
    if (cs.temperature < 55) return;
    const g = this.geo;
    const heat = clamp((cs.temperature - 55) / 55, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(
      g.beakerX + g.beakerW / 2, g.beakerY + g.beakerH,
      10,
      g.beakerX + g.beakerW / 2, g.beakerY + g.beakerH,
      g.beakerW
    );
    grad.addColorStop(0, `rgba(251,146,60,${0.22 * heat})`);
    grad.addColorStop(0.6, `rgba(249,115,22,${0.08 * heat})`);
    grad.addColorStop(1, 'rgba(249,115,22,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.beakerX + g.beakerW / 2, g.beakerY + g.beakerH,
            g.beakerW * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ==========================================================================
   * 6. PUBLIC UTILITIES
   * ========================================================================*/

  /** Clear every particle (used on vessel clear/flush). */
  CanvasRenderer.prototype.purgeParticles = function () {
    this.bubbles.length = 0;
    this.smokes.length = 0;
    this.sediments.length = 0;
    this.chips.length = 0;
    this._smokeAccum = {};
    this._bubbleAccum = 0;
    this._steamAccum = 0;
  };

  /** Manual FX trigger — e.g. explosion burst from app.js. */
  CanvasRenderer.prototype.burstExplosion = function (x, y, color) {
    if (!this.geo) return;
    const cx = x !== undefined ? x : this.geo.beakerX + this.geo.beakerW / 2;
    const cy = y !== undefined ? y : this.geo.beakerY + this.geo.beakerH / 2;
    const col = color || '#fb923c';
    for (let i = 0; i < 22; i++) {
      this.smokes.push(new Smoke(cx + rand(-20, 20), cy + rand(-20, 20), col, {
        r: rand(12, 26), rGrow: rand(30, 60),
        life: rand(0.7, 1.4),
        vx: rand(-80, 80), vy: rand(-90, -30),
        alpha: 0.5
      }));
    }
    for (let i = 0; i < 30; i++) {
      this.bubbles.push(new Bubble(cx + rand(-25, 25), cy + rand(-10, 25),
                                   rand(2, 6), col));
    }
  };

  /* ==========================================================================
   * 7. SINGLETON EXPORT + AUTOWIRE
   * ========================================================================*/
  global.CanvasRenderer = new CanvasRenderer();
  global.CanvasRenderer.VERSION = VERSION;

  // Auto-attach + start when DOM is ready
  function autowire() {
    const cv = document.getElementById('labCanvas');
    if (!cv) {
      console.warn('[CanvasRenderer] #labCanvas not found — call attach() manually.');
      return;
    }
    global.CanvasRenderer.attach(cv);
    global.CanvasRenderer.start();

    // Purge particles on vessel clear/flush
    if (global.ChemistryEngine && global.ChemistryEngine.on) {
      global.ChemistryEngine.on((event) => {
        if (event === 'vessel:cleared' || event === 'vessel:flushed') {
          global.CanvasRenderer.purgeParticles();
        }
        if (event === 'reaction:alkali') {
          global.CanvasRenderer.burstExplosion(undefined, undefined, '#fb923c');
        }
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autowire);
    } else {
      autowire();
    }
  }

  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[CanvasRenderer v${VERSION}] Online — beaker, flame, particles armed.`);
  }

})(typeof window !== 'undefined' ? window : globalThis);
