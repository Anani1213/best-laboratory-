/* ============================================================================
 * VirtuaLab Pro — canvas.js
 * ----------------------------------------------------------------------------
 * HTML5 canvas renderer: beaker, liquid, flame, stirrer vortex, precipitate
 * settling, gas clouds, ignition flashes, screen shake and shockwaves.
 *
 * GLOBAL NAMESPACE : window.CanvasRenderer
 * DEPENDS ON       : window.ChemicalsDB, window.ChemistryEngine
 *
 * PUBLIC API
 * ----------------------------------------------------------------------------
 *   var r = new CanvasRenderer(canvasElement, engineInstance);
 *   r.start();               // begin the requestAnimationFrame loop
 *   r.stop();                // halt the loop
 *   r.resize();              // re-measure the canvas (DPR-aware)
 *   r.handleEvents(events);  // feed engine.vessel.lastEvents for FX
 *   r.triggerShake(mag);     // screen shake amplitude in px
 *   r.triggerFlash(color, a) // full-screen colour flash
 *   r.triggerShockwave(x,y,c,r) // expanding particle ring
 * ==========================================================================*/

window.CanvasRenderer = (function () {
  "use strict";

  /* ==========================================================================
   * 1. SMALL MATH / COLOUR UTILITIES
   * ========================================================================*/

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function hexToRgb(hex) {
    if (typeof hex !== "string" || hex[0] !== "#") return { r: 200, g: 200, b: 200 };
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 200, g: 200, b: 200 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function mixHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(
      ca.r + (cb.r - ca.r) * t,
      ca.g + (cb.g - ca.g) * t,
      ca.b + (cb.b - ca.b) * t
    );
  }

  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + clamp(alpha, 0, 1) + ")";
  }

  /* ==========================================================================
   * 2. COLOUR REFERENCE TABLES
   * ========================================================================*/

  /* Characteristic flame emission colours for common metal ions. */
  var ION_FLAME_COLORS = {
    Li: { inner: "#ffe0d0", mid: "#ff6a5a", outer: "#d02020", glow: "#ff4030" },
    Na: { inner: "#fff4c0", mid: "#ffd24a", outer: "#ff8c00", glow: "#ffb000" },
    K:  { inner: "#f0e0ff", mid: "#d0a0ff", outer: "#a06ac0", glow: "#c08ae0" },
    Rb: { inner: "#ffe0ea", mid: "#ff80a0", outer: "#c03060", glow: "#e05080" },
    Cs: { inner: "#e0e0ff", mid: "#a0a0ff", outer: "#4040c0", glow: "#6060e0" },
    Ca: { inner: "#ffe0c0", mid: "#ff9a4a", outer: "#e04020", glow: "#ff6020" },
    Sr: { inner: "#ffe0e0", mid: "#ff5060", outer: "#c01030", glow: "#e03050" },
    Ba: { inner: "#eaf6c0", mid: "#a8e070", outer: "#60a030", glow: "#80c040" },
    Cu: { inner: "#d0fff0", mid: "#7ae0c0", outer: "#20a080", glow: "#40c0a0" }
  };

  /* Default Bunsen flame palette (no metal present). */
  var DEFAULT_FLAME = {
    inner: "#dff2ff",
    mid:   "#7ec8ff",
    outer: "#3a90e0",
    glow:  "#8ac8ff",
    tip:   "#ffb050"
  };

  /* Gas cloud colours keyed by species id. */
  var GAS_COLORS = {
    NO2:      { color: "#a04a20", dark: true,  density: 0.9 },
    N2O4:     { color: "#c0a080", dark: false, density: 0.8 },
    Cl2:      { color: "#d8e860", dark: false, density: 0.85 },
    Br2:      { color: "#b04020", dark: true,  density: 0.9 },
    I2:       { color: "#8040a0", dark: true,  density: 0.8 },
    SO2:      { color: "#d8dcc0", dark: false, density: 0.5 },
    H2S:      { color: "#e8e0a0", dark: false, density: 0.55 },
    NH3:      { color: "#e8f4ff", dark: false, density: 0.4 },
    CO2:      { color: "#e8e8e8", dark: false, density: 0.35 },
    CO:       { color: "#d0d0d0", dark: false, density: 0.3 },
    H2:       { color: "#f0f4ff", dark: false, density: 0.15 },
    O2:       { color: "#f0f8ff", dark: false, density: 0.15 },
    N2:       { color: "#eef6ff", dark: false, density: 0.15 },
    CH4:      { color: "#eef6ee", dark: false, density: 0.2 },
    C2H2:     { color: "#e8f4e8", dark: false, density: 0.2 },
    C2H4:     { color: "#eef8ee", dark: false, density: 0.2 },
    C3H8:     { color: "#f0f6ee", dark: false, density: 0.2 },
    C4H10:    { color: "#f2f8ee", dark: false, density: 0.2 },
    H2O:      { color: "#f8fcff", dark: false, density: 0.25 },
    steam:    { color: "#f8fcff", dark: false, density: 0.25 }
  };

  /* ==========================================================================
   * 3. PARTICLE CLASSES
   * ========================================================================*/

  function Particle(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.r = opts.r || 2;
    this.color = opts.color || "#cccccc";
    this.life = 1;
    this.decay = opts.decay || 0.35;
    this.settled = false;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = opts.rotationSpeed || rand(-2, 2);
    this.settleY = opts.settleY || 0;
    this.wobble = Math.random() * Math.PI * 2;
  }

  Particle.prototype.update = function (dt, geom) {
    if (this.settled) return;
    this.wobble += dt * 5;
    this.vy += 180 * dt;                                  // gravity
    this.vx += Math.sin(this.wobble) * 6 * dt;            // turbulence
    this.vx *= (1 - 1.4 * dt);
    this.vy *= (1 - 0.6 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;

    /* wall collisions */
    if (this.x < geom.innerLeft + this.r) {
      this.x = geom.innerLeft + this.r;
      this.vx = Math.abs(this.vx) * 0.4;
    }
    if (this.x > geom.innerRight - this.r) {
      this.x = geom.innerRight - this.r;
      this.vx = -Math.abs(this.vx) * 0.4;
    }

    /* settle at the bottom */
    if (this.y >= this.settleY - this.r) {
      this.y = this.settleY - this.r;
      this.vy = 0;
      this.vx = 0;
      this.settled = true;
    }
  };

  Particle.prototype.draw = function (ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    /* subtle highlight */
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(-this.r * 0.3, -this.r * 0.3, this.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------------------- */

  function Bubble(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.r = opts.r || 2;
    this.vy = opts.vy || rand(-55, -30);
    this.life = 1;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = rand(2, 5);
    this.riseLimit = opts.riseLimit || 0;
  }

  Bubble.prototype.update = function (dt, geom) {
    this.wobble += dt * this.wobbleSpeed;
    this.y += this.vy * dt;
    this.x += Math.sin(this.wobble) * 8 * dt;
    this.r *= (1 + 0.35 * dt);

    /* clamp inside the beaker walls */
    if (this.x < geom.innerLeft + this.r) this.x = geom.innerLeft + this.r;
    if (this.x > geom.innerRight - this.r) this.x = geom.innerRight - this.r;

    /* pop when reaching the surface */
    var surfaceY = this.surfaceY !== undefined ? this.surfaceY : geom.beakerTopY;
    if (this.y <= surfaceY + 4) this.life = 0;
  };

  Bubble.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalAlpha = 0.55 * this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1;
    ctx.stroke();
    /* highlight dot */
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------------------- */

  function GasPuff(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx !== undefined ? opts.vx : rand(-12, 12);
    this.vy = opts.vy !== undefined ? opts.vy : rand(-38, -22);
    this.r = opts.r || 6;
    this.maxR = opts.maxR || 42;
    this.life = 1;
    this.decay = opts.decay || 0.5;
    this.color = opts.color || "#e8e8e8";
    this.density = opts.density || 0.5;
    this.seed = Math.random() * 1000;
  }

  GasPuff.prototype.update = function (dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx += Math.sin((this.seed + performance.now() * 0.001) * 1.5) * 4 * dt;
    this.vy *= (1 - 0.25 * dt);
    this.vx *= (1 - 0.5 * dt);
    this.r += (this.maxR - this.r) * 1.4 * dt;
    this.life -= this.decay * dt;
  };

  GasPuff.prototype.draw = function (ctx) {
    if (this.life <= 0) return;
    var alpha = this.life * this.life * (0.35 + this.density * 0.45);
    var grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    grad.addColorStop(0, rgba(this.color, alpha));
    grad.addColorStop(0.55, rgba(this.color, alpha * 0.55));
    grad.addColorStop(1, rgba(this.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  };

  /* ---------------------------------------------------------------------- */

  function Spark(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.life = 1;
    this.decay = opts.decay || 1.6;
    this.color = opts.color || "#ffd24a";
    this.size = opts.size || 2.2;
    this.trailX = this.x;
    this.trailY = this.y;
  }

  Spark.prototype.update = function (dt) {
    this.trailX = this.x;
    this.trailY = this.y;
    this.vy += 90 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= this.decay * dt;
  };

  Spark.prototype.draw = function (ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.life, 0, 1);
    /* trail */
    var grad = ctx.createLinearGradient(this.trailX, this.trailY, this.x, this.y);
    grad.addColorStop(0, rgba(this.color, 0));
    grad.addColorStop(1, rgba(this.color, 0.85));
    ctx.strokeStyle = grad;
    ctx.lineWidth = this.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.trailX, this.trailY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    /* glowing head */
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------------------- */

  function Shockwave(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.r = opts.r || 8;
    this.maxR = opts.maxR || 220;
    this.life = 1;
    this.decay = opts.decay || 1.1;
    this.color = opts.color || "#ffffff";
    this.lineWidth = opts.lineWidth || 3;
  }

  Shockwave.prototype.update = function (dt) {
    var speed = (this.maxR - this.r) * 3.5 + 100;
    this.r += speed * dt;
    this.life -= this.decay * dt;
  };

  Shockwave.prototype.draw = function (ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.life, 0, 1) * 0.9;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth * this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    /* inner ring */
    if (this.r > 24) {
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = Math.max(1, this.lineWidth * 0.4 * this.life);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ==========================================================================
   * 4. GEOMETRY
   * ========================================================================*/

  function computeGeometry(W, H) {
    var cx = W * 0.5;

    /* Vertical layout — proportions of canvas height */
    var benchY   = H * 0.955;                        // top of the bench surface
    var benchH   = H * 0.055;

    /* Beaker sits on a wire gauze held above the burner */
    var beakerH  = Math.min(H * 0.46, 300);
    var beakerW  = beakerH * 0.72;
    var gauzeY   = Math.max(H * 0.62, benchY - 210); // beaker bottom / gauze line
    var beakerTopY = gauzeY - beakerH;

    /* Burner barrel */
    var burnerTopY = gauzeY + Math.max(45, (benchY - gauzeY) * 0.62);

    return {
      W: W,
      H: H,
      cx: cx,

      benchY: benchY,
      benchH: benchH,

      burnerBaseY: benchY,
      burnerTopY: burnerTopY,
      burnerW: 22,

      gauzeY: gauzeY,

      beakerX: cx,
      beakerW: beakerW,
      beakerH: beakerH,
      beakerTopY: beakerTopY,
      beakerBottomY: gauzeY,
      beakerLeft: cx - beakerW * 0.5,
      beakerRight: cx + beakerW * 0.5,

      innerLeft: cx - beakerW * 0.5 + 5,
      innerRight: cx + beakerW * 0.5 - 5,
      innerTopY: beakerTopY + 8,
      innerBottomY: gauzeY - 5,
      innerW: beakerW - 10,
      innerH: beakerH - 13,

      maxVolL: 0.5
    };
  }

  /* ==========================================================================
   * 5. RENDERER
   * ========================================================================*/

  function CanvasRenderer(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext ? canvas.getContext("2d") : null;
    this.engine = engine || null;

    this.particles   = [];
    this.bubbles     = [];
    this.gasPuffs    = [];
    this.sparks      = [];
    this.shockwaves  = [];

    this.shakeMag    = 0;
    this.flashColor  = "#ffffff";
    this.flashAlpha  = 0;

    this.t           = 0;
    this.lastTime    = 0;
    this._raf        = null;
    this._running    = false;

    this.W = 0;
    this.H = 0;
    this.geom = null;

    /* Tracking for engine-driven effect spawning */
    this._lastReactionCount = 0;
    this._lastPrecipMoles   = 0;
    this._lastGasMoles      = 0;
    this._lastWaterVolume   = 0;
    this._lastTemp          = 273.15;
    this._effervesceTimer   = 0;
    this._steamTimer        = 0;
    this._settleTimer       = 0;

    /* Smooth colour interpolation */
    this._currentColor = "#cfe8ff";

    /* Vortex animation phase */
    this._vortexAngle = 0;

    /* Bound loop for clean add/removeEventListener */
    this._boundLoop = this._loop.bind(this);
    this._boundResize = null;

    /* Cached flame palette per frame */
    this._flameTint = null;
  }

  /* ----------------------------------------------------------------------
   * 5.1 Lifecycle
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype.resize = function () {
    var c = this.canvas;
    if (!c) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
    var w = (rect && rect.width) || c.clientWidth || c.width || 800;
    var h = (rect && rect.height) || c.clientHeight || c.height || 600;

    c.width  = Math.max(1, Math.floor(w * dpr));
    c.height = Math.max(1, Math.floor(h * dpr));

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.W = w;
    this.H = h;
    this.geom = computeGeometry(w, h);

    /* Purge particles that were positioned for the old geometry */
    this.particles.length = 0;
    this.bubbles.length = 0;
    this.gasPuffs.length = 0;
    this.sparks.length = 0;
    this.shockwaves.length = 0;
  };

  CanvasRenderer.prototype.start = function () {
    if (this._running) return;
    if (!this.ctx) {
      console.warn("[CanvasRenderer] No 2D context — rendering disabled.");
      return;
    }
    this._running = true;
    this.resize();

    if (!this._boundResize) {
      this._boundResize = this.resize.bind(this);
      window.addEventListener("resize", this._boundResize);
    }
    if (typeof ResizeObserver !== "undefined" && this.canvas.parentElement) {
      try {
        this._ro = new ResizeObserver(this._boundResize);
        this._ro.observe(this.canvas.parentElement);
      } catch (e) { /* ignore */ }
    }

    this.lastTime = performance.now();
    this._raf = requestAnimationFrame(this._boundLoop);
  };

  CanvasRenderer.prototype.stop = function () {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._boundResize) {
      window.removeEventListener("resize", this._boundResize);
    }
    if (this._ro) {
      try { this._ro.disconnect(); } catch (e) { /* ignore */ }
      this._ro = null;
    }
  };

  /* ----------------------------------------------------------------------
   * 5.2 Public FX triggers
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype.triggerShake = function (magnitude) {
    this.shakeMag = Math.max(this.shakeMag, magnitude || 8);
  };

  CanvasRenderer.prototype.triggerFlash = function (color, alpha) {
    this.flashColor = color || "#ffffff";
    this.flashAlpha = Math.max(this.flashAlpha, alpha || 0.5);
  };

  CanvasRenderer.prototype.triggerShockwave = function (x, y, color, maxR) {
    this.shockwaves.push(new Shockwave({
      x: x, y: y,
      color: color || "#ffffff",
      maxR: maxR || 220,
      lineWidth: 3.2,
      decay: 1.05
    }));
  };

  /* ----------------------------------------------------------------------
   * 5.3 Event handling — spawn FX in response to engine reports
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype.handleEvents = function (events) {
    if (!events || !events.length || !this.geom) return;
    var geom = this.geom;

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e || !e.type) continue;

      switch (e.type) {

        case "combustion":
          this.triggerFlash("#ffb040", 0.55);
          this.triggerShake(16);
          this.triggerShockwave(geom.beakerX, geom.gauzeY - 20, "#ff9040", 260);
          this._spawnSparks(geom.beakerX, geom.gauzeY - 10, 34, "#ffb040");
          this._spawnSparks(geom.beakerX, geom.gauzeY - 10, 14, "#fff0c0");
          break;

        case "reaction":
          if (e.subtype === "alkali-metal-water" && e.ignition) {
            this.triggerFlash(e.flameColor ? "#ffe0a0" : "#ffcc80", 0.7);
            this.triggerShake(22);
            this.triggerShockwave(geom.beakerX, geom.gauzeY - 30, "#ff8040", 300);
            this._spawnSparks(geom.beakerX, geom.gauzeY - 40, 46, "#ffd060");
            this._spawnSparks(geom.beakerX, geom.gauzeY - 40, 20, "#ffffff");
          } else if (e.subtype === "alkaline-earth-water") {
            this.triggerShake(6);
            this._spawnSparks(geom.beakerX, geom.gauzeY - 30, 12, "#ffcc80");
          }

          /* big gas evolution → bubbles + puffs */
          if (e.gasVolumeL > 0.15) {
            var count = clamp(Math.floor(e.gasVolumeL * 10), 6, 40);
            var gasId = null;
            for (var gk in e.molesProduced) {
              if (GAS_COLORS[gk]) { gasId = gk; break; }
            }
            this._spawnBubbles(count, gasId);
            this._spawnGasPuffs(Math.min(count, 14), gasId);
          }

          /* explosive temperature jump → shockwave */
          if (e.deltaT > 25) {
            this.triggerShake(clamp(e.deltaT * 0.6, 8, 30));
            this.triggerShockwave(geom.beakerX, geom.gauzeY - 40,
              e.flameColor ? "#ffe0a0" : "#80c0ff", 220);
          }

          /* precipitation → falling particles */
          if (e.subtype === "precipitation" && e.precipitateMassG > 0.001) {
            this._spawnPrecipitateParticles(e.precipitateColor || "#e8e8e8", e.precipitateMassG);
          }
          break;

        case "precipitation":
          if (e.precipitateMassG > 0.001) {
            this._spawnPrecipitateParticles(e.precipitateColor || "#e8e8e8", e.precipitateMassG);
          }
          break;

        default:
          /* generic thermal / gas cues */
          if (e.deltaT && e.deltaT > 15) {
            this.triggerShake(clamp(e.deltaT * 0.4, 3, 14));
          }
          if (e.gasVolumeL && e.gasVolumeL > 0.2) {
            this._spawnGasPuffs(8, null);
          }
          break;
      }
    }
  };

  /* ----------------------------------------------------------------------
   * 5.4 FX spawn helpers
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._spawnSparks = function (x, y, count, color) {
    for (var i = 0; i < count; i++) {
      var angle = rand(-Math.PI, 0);
      var speed = rand(60, 240);
      this.sparks.push(new Spark({
        x: x + rand(-8, 8),
        y: y + rand(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(40, 120),
        color: color || "#ffd24a",
        size: rand(1.6, 3.0),
        decay: rand(1.1, 1.9)
      }));
    }
  };

  CanvasRenderer.prototype._spawnBubbles = function (count, gasId) {
    var geom = this.geom;
    if (!geom) return;
    var surfaceY = this._liquidSurfaceY();

    for (var i = 0; i < count; i++) {
      var bx = rand(geom.innerLeft + 8, geom.innerRight - 8);
      var by = geom.innerBottomY - rand(2, 12);
      var b = new Bubble({
        x: bx,
        y: by,
        r: rand(1.5, 4),
        vy: rand(-70, -32) * (1 + Math.random() * 0.6)
      });
      b.surfaceY = surfaceY;
      b.gasId = gasId || null;
      this.bubbles.push(b);
    }
  };

  CanvasRenderer.prototype._spawnGasPuffs = function (count, gasId) {
    var geom = this.geom;
    if (!geom) return;
    var info = gasId && GAS_COLORS[gasId] ? GAS_COLORS[gasId] : { color: "#e8e8e8", density: 0.4 };
    var surfaceY = this._liquidSurfaceY() - 4;

    for (var i = 0; i < count; i++) {
      this.gasPuffs.push(new GasPuff({
        x: rand(geom.beakerLeft + 12, geom.beakerRight - 12),
        y: surfaceY - rand(0, 20),
        vx: rand(-14, 14),
        vy: rand(-40, -22),
        r: rand(4, 9),
        maxR: rand(28, 52),
        color: info.color,
        density: info.density,
        decay: rand(0.35, 0.65)
      }));
    }
  };

  CanvasRenderer.prototype._spawnPrecipitateParticles = function (color, massG) {
    var geom = this.geom;
    if (!geom) return;
    var surfaceY = this._liquidSurfaceY();
    var count = clamp(Math.floor(massG * 14), 4, 26);

    for (var i = 0; i < count; i++) {
      var p = new Particle({
        x: rand(geom.innerLeft + 8, geom.innerRight - 8),
        y: rand(surfaceY + 6, geom.innerBottomY - 20),
        vx: rand(-10, 10),
        vy: rand(-4, 14),
        r: rand(1.2, 2.8),
        color: color,
        decay: 0.35
      });
      p.settleY = geom.innerBottomY - 2;
      this.particles.push(p);
    }
  };

  /* ----------------------------------------------------------------------
   * 5.5 Main loop
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._loop = function (ts) {
    if (!this._running) return;

    var dt = (ts - this.lastTime) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    this.lastTime = ts;

    this.t += dt;
    this._vortexAngle += dt * 6;

    if (!this.geom) this.resize();
    if (!this.geom) {
      this._raf = requestAnimationFrame(this._boundLoop);
      return;
    }

    this._scanEngine(dt);
    this._update(dt);
    this._draw();

    this._raf = requestAnimationFrame(this._boundLoop);
  };

  /* ----------------------------------------------------------------------
   * 5.6 Engine-driven automatic FX
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._scanEngine = function (dt) {
    if (!this.engine || !this.engine.vessel) return;
    var v = this.engine.vessel;

    /* ---- new reactions ---- */
    if (v.reactionCount !== this._lastReactionCount) {
      this._lastReactionCount = v.reactionCount;
      if (v.lastEvents && v.lastEvents.length) {
        this.handleEvents(v.lastEvents);
      }
    }

    /* ---- new precipitates → falling particles ---- */
    var totalPrecip = 0;
    for (var i = 0; i < v.precipitates.length; i++) totalPrecip += v.precipitates[i].moles;
    if (totalPrecip > this._lastPrecipMoles + 1e-6 && this._lastPrecipMoles > 0) {
      /* handled by events; nothing extra */
    }
    this._lastPrecipMoles = totalPrecip;

    /* ---- active gas evolution → continuous bubbles ---- */
    var totalGas = 0;
    for (var g in v.gases) {
      if (Object.prototype.hasOwnProperty.call(v.gases, g)) totalGas += v.gases[g];
    }
    if (totalGas > this._lastGasMoles + 1e-4 && v.waterVolume > 0) {
      this._effervesceTimer += 0.35;
    }
    this._lastGasMoles = totalGas;

    if (this._effervesceTimer > 0.08) {
      var burst = Math.min(3, Math.floor(this._effervesceTimer * 6));
      for (var b = 0; b < burst; b++) this._spawnBubbles(1, null);
      this._effervesceTimer *= 0.6;
      if (this._effervesceTimer < 0.08) this._effervesceTimer = 0;
    }

    /* ---- steam over a hot solution ---- */
    if (v.temperature > 353.15 && v.waterVolume > 0) {
      this._steamTimer += dt;
      if (this._steamTimer > 0.09) {
        this._steamTimer = 0;
        this._spawnGasPuffs(1, "H2O");
      }
    }

    /* ---- ambient gas puffs whenever a visible gas sits in the headspace ---- */
    var visibleGases = ["NO2", "N2O4", "Cl2", "Br2", "I2", "SO2", "H2S", "NH3"];
    for (var vi = 0; vi < visibleGases.length; vi++) {
      var gid = visibleGases[vi];
      if ((v.gases[gid] || 0) > 1e-5 && Math.random() < 0.08) {
        this._spawnGasPuffs(1, gid);
      }
    }
  };

  /* ----------------------------------------------------------------------
   * 5.7 Update particle systems
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._update = function (dt) {
    var geom = this.geom;
    var i;

    /* --- particles (precipitates) --- */
    var surfaceY = this._liquidSurfaceY();
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.update(dt, geom);
      /* settle against the current liquid surface as a floor */
      if (p.y > geom.innerBottomY - 2) {
        p.y = geom.innerBottomY - 2;
        p.settled = true;
      }
    }

    /* --- bubbles --- */
    for (i = this.bubbles.length - 1; i >= 0; i--) {
      var b = this.bubbles[i];
      b.surfaceY = surfaceY;
      b.update(dt, geom);
      if (b.life <= 0 || b.y < surfaceY - 6) {
        this.bubbles.splice(i, 1);
      }
    }

    /* --- gas puffs --- */
    for (i = this.gasPuffs.length - 1; i >= 0; i--) {
      var gp = this.gasPuffs[i];
      gp.update(dt);
      if (gp.life <= 0) this.gasPuffs.splice(i, 1);
    }

    /* --- sparks --- */
    for (i = this.sparks.length - 1; i >= 0; i--) {
      var sp = this.sparks[i];
      sp.update(dt);
      if (sp.life <= 0) this.sparks.splice(i, 1);
    }

    /* --- shockwaves --- */
    for (i = this.shockwaves.length - 1; i >= 0; i--) {
      var sw = this.shockwaves[i];
      sw.update(dt);
      if (sw.life <= 0) this.shockwaves.splice(i, 1);
    }

    /* --- shake decay --- */
    this.shakeMag *= Math.pow(0.06, dt);
    if (this.shakeMag < 0.15) this.shakeMag = 0;

    /* --- flash decay --- */
    this.flashAlpha *= Math.pow(0.02, dt);
    if (this.flashAlpha < 0.01) this.flashAlpha = 0;

    /* --- smooth liquid colour transition --- */
    if (this.engine && this.engine.vessel) {
      var target = this.engine.vessel.colour || "#cfe8ff";
      this._currentColor = mixHex(this._currentColor, target, clamp(dt * 4, 0, 1));
    }
  };

  /* ----------------------------------------------------------------------
   * 5.8 Convenience state reads
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._liquidSurfaceY = function () {
    var geom = this.geom;
    if (!geom) return 0;
    var v = this.engine && this.engine.vessel;
    var vol = v ? v.waterVolume : 0;
    var frac = clamp(vol / geom.maxVolL, 0, 1);
    if (frac <= 0) return geom.innerBottomY;
    return geom.innerBottomY - frac * geom.innerH;
  };

  CanvasRenderer.prototype._detectFlameTint = function () {
    var v = this.engine && this.engine.vessel;
    if (!v) return null;
    var decompose = window.ChemistryEngine && window.ChemistryEngine.utils
      ? window.ChemistryEngine.utils.decomposeSpecies
      : null;
    if (!decompose) return null;

    var best = null, bestMoles = 0;

    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      var n = v.soluteMoles[id];
      if (!(n > 1e-6)) continue;
      var d = decompose(id);
      if (!d) continue;
      if (ION_FLAME_COLORS[d.cation] && n > bestMoles) {
        bestMoles = n;
        best = d.cation;
      }
    }
    for (var i = 0; i < v.solids.length; i++) {
      var s = v.solids[i];
      if (!(s.moles > 1e-6)) continue;
      var d2 = decompose(s.id);
      if (!d2) continue;
      if (ION_FLAME_COLORS[d2.cation] && s.moles > bestMoles) {
        bestMoles = s.moles;
        best = d2.cation;
      }
    }
    return best ? ION_FLAME_COLORS[best] : null;
  };

  /* ==========================================================================
   * 6. DRAWING
   * ========================================================================*/

  CanvasRenderer.prototype._draw = function () {
    var ctx = this.ctx;
    var geom = this.geom;
    if (!ctx || !geom) return;

    /* reset transform and clear */
    ctx.save();
    ctx.setTransform(
      (window.devicePixelRatio || 1), 0, 0,
      (window.devicePixelRatio || 1), 0, 0
    );
    ctx.clearRect(0, 0, geom.W, geom.H);

    /* ---- background ---- */
    this._drawBackground(ctx, geom);

    /* ---- determine shake offset ---- */
    var shakeX = 0, shakeY = 0;
    if (this.shakeMag > 0.2) {
      shakeX = (Math.random() - 0.5) * this.shakeMag;
      shakeY = (Math.random() - 0.5) * this.shakeMag;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    /* ---- scene layers (back → front) ---- */
    this._drawBench(ctx, geom);
    this._drawBurner(ctx, geom);
    this._drawFlame(ctx, geom);
    this._drawTripod(ctx, geom);
    this._drawGauze(ctx, geom);

    this._drawBeakerBack(ctx, geom);
    this._drawLiquid(ctx, geom);
    this._drawPrecipitateBed(ctx, geom);
    this._drawBubbles(ctx, geom);
    this._drawFallingParticles(ctx, geom);
    this._drawMeniscus(ctx, geom);
    this._drawVortex(ctx, geom);
    this._drawBeakerGlass(ctx, geom);
    this._drawGraduations(ctx, geom);
    this._drawBeakerRim(ctx, geom);

    this._drawGasPuffs(ctx, geom);
    this._drawSparks(ctx, geom);
    this._drawShockwaves(ctx, geom);

    ctx.restore();

    /* ---- full-screen overlay effects (no shake) ---- */
    this._drawFlash(ctx, geom);

    /* ---- HUD ---- */
    this._drawHUD(ctx, geom);

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.1 Background
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBackground = function (ctx, geom) {
    var W = geom.W, H = geom.H;

    /* base gradient */
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0a1420");
    grad.addColorStop(0.5, "#0d1a2b");
    grad.addColorStop(1, "#050b13");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    /* subtle vignette glow behind the beaker */
    var cx = geom.beakerX;
    var cy = geom.beakerTopY + geom.beakerH * 0.4;
    var rad = Math.max(geom.beakerW * 2.2, 220);
    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    glow.addColorStop(0, "rgba(80, 140, 200, 0.14)");
    glow.addColorStop(0.5, "rgba(40, 80, 140, 0.06)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  };

  /* ----------------------------------------------------------------------
   * 6.2 Bench
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBench = function (ctx, geom) {
    var W = geom.W;
    var benchY = geom.benchY;
    var benchH = geom.benchH;

    /* bench surface — warm dark wood/metal */
    var grad = ctx.createLinearGradient(0, benchY, 0, benchY + benchH);
    grad.addColorStop(0, "#1a1f28");
    grad.addColorStop(0.4, "#14181f");
    grad.addColorStop(1, "#0a0d12");
    ctx.fillStyle = grad;
    ctx.fillRect(0, benchY, W, benchH);

    /* top highlight line */
    ctx.strokeStyle = "rgba(140, 180, 220, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, benchY + 0.5);
    ctx.lineTo(W, benchY + 0.5);
    ctx.stroke();

    /* subtle reflections */
    ctx.strokeStyle = "rgba(80, 120, 160, 0.08)";
    for (var i = 0; i < 3; i++) {
      var y = benchY + 6 + i * 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.08, y);
      ctx.lineTo(W * 0.92, y);
      ctx.stroke();
    }
  };

  /* ----------------------------------------------------------------------
   * 6.3 Bunsen burner
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBurner = function (ctx, geom) {
    var cx = geom.cx;
    var baseY = geom.burnerBaseY;
    var topY = geom.burnerTopY;
    var w = geom.burnerW;

    /* base plate */
    ctx.fillStyle = "#141a22";
    ctx.beginPath();
    ctx.moveTo(cx - 28, baseY);
    ctx.lineTo(cx + 28, baseY);
    ctx.lineTo(cx + 22, baseY - 6);
    ctx.lineTo(cx - 22, baseY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 150, 180, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* barrel */
    var barrelGrad = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    barrelGrad.addColorStop(0, "#1c232c");
    barrelGrad.addColorStop(0.35, "#39424d");
    barrelGrad.addColorStop(0.5, "#4a5663");
    barrelGrad.addColorStop(0.65, "#39424d");
    barrelGrad.addColorStop(1, "#1c232c");

    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, baseY - 6);
    ctx.lineTo(cx - w / 2 + 2, topY);
    ctx.lineTo(cx + w / 2 - 2, topY);
    ctx.lineTo(cx + w / 2, baseY - 6);
    ctx.closePath();
    ctx.fill();

    /* air intake holes near the bottom */
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    for (var i = 0; i < 3; i++) {
      var hx = cx - 5 + i * 5;
      var hy = baseY - 30;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    /* collar at the top */
    ctx.fillStyle = "#2a3340";
    ctx.fillRect(cx - w / 2 - 3, topY - 3, w + 6, 7);
    ctx.strokeStyle = "rgba(160, 190, 220, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2 - 3.5, topY - 3.5, w + 7, 8);

    /* nozzle opening glow */
    if (this.engine && this.engine.vessel && this.engine.vessel.flamePower > 0.02) {
      var pg = ctx.createRadialGradient(cx, topY - 2, 0, cx, topY - 2, 14);
      pg.addColorStop(0, "rgba(255, 200, 120, 0.55)");
      pg.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.fillStyle = pg;
      ctx.fillRect(cx - 14, topY - 16, 28, 16);
    }
  };

  /* ----------------------------------------------------------------------
   * 6.4 Flame
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawFlame = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v) return;
    var power = v.flamePower;
    if (power < 0.02) return;

    var cx = geom.cx;
    var baseY = geom.burnerTopY - 4;
    var maxH = geom.burnerTopY - geom.gauzeY - 8;
    if (maxH < 20) maxH = 20;

    var ionTint = this._detectFlameTint();
    var palette = ionTint
      ? {
          inner: ionTint.inner,
          mid: ionTint.mid,
          outer: ionTint.outer,
          glow: ionTint.glow,
          tip: ionTint.outer
        }
      : DEFAULT_FLAME;

    /* flicker */
    var flick = 0.93 + Math.sin(this.t * 18) * 0.05 + Math.sin(this.t * 33 + 1.7) * 0.04;
    var flameH = maxH * power * flick;
    var tipY = baseY - flameH;

    /* glow halo behind the flame */
    var glowGrad = ctx.createRadialGradient(cx, baseY - flameH * 0.5, 4, cx, baseY - flameH * 0.5, flameH * 1.4);
    glowGrad.addColorStop(0, rgba(palette.glow, 0.45 * power));
    glowGrad.addColorStop(0.5, rgba(palette.outer, 0.20 * power));
    glowGrad.addColorStop(1, rgba(palette.outer, 0));
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, baseY - flameH * 0.5, flameH * 1.4, 0, Math.PI * 2);
    ctx.fill();

    /* --- outer flame --- */
    this._drawFlameTongue(ctx, cx, baseY, tipY, geom.burnerW * 1.6, palette.outer, 0.75, this.t * 3.1);
    /* --- mid flame --- */
    this._drawFlameTongue(ctx, cx, baseY - 2, tipY + flameH * 0.14, geom.burnerW * 1.05, palette.mid, 0.9, this.t * 4.2);
    /* --- inner cone --- */
    this._drawFlameTongue(ctx, cx, baseY - 4, tipY + flameH * 0.30, geom.burnerW * 0.65, palette.inner, 1.0, this.t * 5.4);

    /* tip warm highlight */
    var tipGrad = ctx.createRadialGradient(cx, tipY + 6, 0, cx, tipY + 6, 22);
    tipGrad.addColorStop(0, rgba(palette.tip, 0.55 * power));
    tipGrad.addColorStop(1, rgba(palette.tip, 0));
    ctx.fillStyle = tipGrad;
    ctx.beginPath();
    ctx.arc(cx, tipY + 6, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  CanvasRenderer.prototype._drawFlameTongue = function (ctx, cx, baseY, tipY, width, color, alpha, phase) {
    var h = baseY - tipY;
    if (h <= 0) return;

    var w = width * (0.94 + Math.sin(phase) * 0.06);
    var wob = Math.sin(phase * 1.3) * 1.6;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();

    /* left side */
    ctx.moveTo(cx - w / 2, baseY);
    ctx.bezierCurveTo(
      cx - w / 2 - 1, baseY - h * 0.32,
      cx - w * 0.34 + wob, baseY - h * 0.65,
      cx + wob * 0.6, tipY
    );
    /* right side */
    ctx.bezierCurveTo(
      cx + w * 0.34 + wob, baseY - h * 0.65,
      cx + w / 2 + 1, baseY - h * 0.32,
      cx + w / 2, baseY
    );
    ctx.closePath();

    /* soft gradient fill so the tongue has depth */
    var grad = ctx.createLinearGradient(0, baseY, 0, tipY);
    grad.addColorStop(0, rgba(color, 0.95));
    grad.addColorStop(0.55, rgba(color, 0.75));
    grad.addColorStop(1, rgba(color, 0.05));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.5 Tripod stand
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawTripod = function (ctx, geom) {
    var cx = geom.cx;
    var topY = geom.gauzeY;
    var baseY = geom.benchY;
    var spread = geom.beakerW * 0.72;

    ctx.strokeStyle = "#2a3340";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    /* left leg */
    ctx.beginPath();
    ctx.moveTo(cx - spread * 0.5, topY + 2);
    ctx.lineTo(cx - spread * 0.85, baseY - 2);
    ctx.stroke();

    /* right leg */
    ctx.beginPath();
    ctx.moveTo(cx + spread * 0.5, topY + 2);
    ctx.lineTo(cx + spread * 0.85, baseY - 2);
    ctx.stroke();

    /* highlight on legs */
    ctx.strokeStyle = "rgba(180, 210, 240, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - spread * 0.5 + 1.2, topY + 3);
    ctx.lineTo(cx - spread * 0.85 + 1.2, baseY - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + spread * 0.5 + 1.2, topY + 3);
    ctx.lineTo(cx + spread * 0.85 + 1.2, baseY - 2);
    ctx.stroke();

    /* horizontal support ring at the top */
    ctx.strokeStyle = "#3a4552";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - spread * 0.55, topY);
    ctx.lineTo(cx + spread * 0.55, topY);
    ctx.stroke();
  };

  /* ----------------------------------------------------------------------
   * 6.6 Wire gauze
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawGauze = function (ctx, geom) {
    var left = geom.beakerLeft - 22;
    var right = geom.beakerRight + 22;
    var y = geom.gauzeY;
    var thick = 4;

    /* plate */
    ctx.fillStyle = "#1e242c";
    ctx.fillRect(left, y - thick, right - left, thick);

    /* mesh cross-hatch */
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y - thick, right - left, thick);
    ctx.clip();
    ctx.strokeStyle = "rgba(180, 200, 220, 0.4)";
    ctx.lineWidth = 1;
    for (var x = left; x <= right; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, y - thick);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(140, 170, 200, 0.32)";
    for (var yy = y - thick; yy <= y; yy += 2) {
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
    }
    ctx.restore();

    /* top and bottom outlines */
    ctx.strokeStyle = "#4a5663";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y - thick + 0.5);
    ctx.lineTo(right, y - thick + 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left, y - 0.5);
    ctx.lineTo(right, y - 0.5);
    ctx.stroke();
  };

  /* ----------------------------------------------------------------------
   * 6.7 Beaker back glass
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBeakerBack = function (ctx, geom) {
    var x = geom.beakerX;
    var w = geom.beakerW;
    var topY = geom.beakerTopY;
    var botY = geom.beakerBottomY;
    var r = 10;

    ctx.save();
    ctx.beginPath();
    this._beakerPath(ctx, geom, 0);
    /* glass interior — translucent cool blue */
    var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, "rgba(140, 200, 240, 0.09)");
    g.addColorStop(0.5, "rgba(180, 220, 250, 0.045)");
    g.addColorStop(1, "rgba(140, 200, 240, 0.09)");
    ctx.fillStyle = g;
    ctx.fill();

    /* inner shadow near the bottom */
    var shadow = ctx.createLinearGradient(0, botY - 30, 0, botY);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0.35)");
    ctx.fillStyle = shadow;
    ctx.fill();
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.8 Beaker path helper (used for clipping)
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._beakerPath = function (ctx, geom, inset) {
    var x = geom.beakerX;
    var w = geom.beakerW - inset * 2;
    var topY = geom.beakerTopY + inset;
    var botY = geom.beakerBottomY - inset;
    var r = 10;

    ctx.beginPath();
    ctx.moveTo(x - w / 2, topY);
    ctx.lineTo(x + w / 2, topY);
    ctx.lineTo(x + w / 2, botY - r);
    ctx.quadraticCurveTo(x + w / 2, botY, x + w / 2 - r, botY);
    ctx.lineTo(x - w / 2 + r, botY);
    ctx.quadraticCurveTo(x - w / 2, botY, x - w / 2, botY - r);
    ctx.closePath();
  };

  /* ----------------------------------------------------------------------
   * 6.9 Liquid body
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawLiquid = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v) return;
    if (!(v.waterVolume > 0)) return;

    var surfaceY = this._liquidSurfaceY();
    if (surfaceY >= geom.innerBottomY - 1) return;

    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();

    /* body gradient: slightly darker at the bottom */
    var colour = this._currentColor;
    var top = mixHex(colour, "#ffffff", 0.10);
    var bot = mixHex(colour, "#000000", 0.32);

    var grad = ctx.createLinearGradient(0, surfaceY, 0, geom.innerBottomY);
    grad.addColorStop(0, rgba(top, 0.78));
    grad.addColorStop(0.55, rgba(colour, 0.88));
    grad.addColorStop(1, rgba(bot, 0.94));

    ctx.fillStyle = grad;
    ctx.fillRect(geom.innerLeft - 2, surfaceY, geom.innerW + 4, geom.innerBottomY - surfaceY + 6);

    /* side shading inside the glass */
    var shade = ctx.createLinearGradient(geom.innerLeft, 0, geom.innerLeft + 22, 0);
    shade.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    shade.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shade;
    ctx.fillRect(geom.innerLeft - 2, surfaceY, 22, geom.innerBottomY - surfaceY + 6);

    var shadeR = ctx.createLinearGradient(geom.innerRight - 22, 0, geom.innerRight, 0);
    shadeR.addColorStop(0, "rgba(0, 0, 0, 0)");
    shadeR.addColorStop(1, "rgba(0, 0, 0, 0.22)");
    ctx.fillStyle = shadeR;
    ctx.fillRect(geom.innerRight - 22, surfaceY, 22, geom.innerBottomY - surfaceY + 6);

    /* turbidity overlay */
    if (v.turbidity > 0.05) {
      ctx.fillStyle = "rgba(240, 240, 240, " + clamp(v.turbidity * 0.28, 0, 0.4) + ")";
      ctx.fillRect(geom.innerLeft - 2, surfaceY, geom.innerW + 4, geom.innerBottomY - surfaceY + 6);
    }

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.10 Precipitate bed
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawPrecipitateBed = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v) return;
    if (!v.precipitates.length) return;

    /* total mass & weighted colour */
    var totalMass = 0;
    var rAcc = 0, gAcc = 0, bAcc = 0;
    for (var i = 0; i < v.precipitates.length; i++) {
      var p = v.precipitates[i];
      totalMass += p.mass;
      var c = hexToRgb(p.color);
      rAcc += c.r * p.mass;
      gAcc += c.g * p.mass;
      bAcc += c.b * p.mass;
    }
    if (totalMass < 0.001) return;

    var bedColor = rgbToHex(rAcc / totalMass, gAcc / totalMass, bAcc / totalMass);
    var bedH = clamp(totalMass * 4.5, 2, geom.innerH * 0.35);
    var bedTop = geom.innerBottomY - bedH;

    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();

    /* bed body */
    var grad = ctx.createLinearGradient(0, bedTop, 0, geom.innerBottomY);
    grad.addColorStop(0, rgba(mixHex(bedColor, "#ffffff", 0.18), 0.95));
    grad.addColorStop(0.4, rgba(bedColor, 1));
    grad.addColorStop(1, rgba(mixHex(bedColor, "#000000", 0.3), 1));
    ctx.fillStyle = grad;

    /* wavy top surface */
    ctx.beginPath();
    ctx.moveTo(geom.innerLeft, geom.innerBottomY + 2);
    ctx.lineTo(geom.innerLeft, bedTop);
    var steps = 14;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var x = geom.innerLeft + t * geom.innerW;
      var wob = Math.sin(t * Math.PI * 3 + this.t * 0.6) * 0.8;
      ctx.lineTo(x, bedTop + wob);
    }
    ctx.lineTo(geom.innerRight, geom.innerBottomY + 2);
    ctx.closePath();
    ctx.fill();

    /* subtle specular highlight along the surface */
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    var first = true;
    for (var s2 = 0; s2 <= steps; s2++) {
      var t2 = s2 / steps;
      var x2 = geom.innerLeft + t2 * geom.innerW;
      var wob2 = Math.sin(t2 * Math.PI * 3 + this.t * 0.6) * 0.8;
      if (first) { ctx.moveTo(x2, bedTop + wob2); first = false; }
      else ctx.lineTo(x2, bedTop + wob2);
    }
    ctx.stroke();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.11 Bubbles
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBubbles = function (ctx, geom) {
    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();
    for (var i = 0; i < this.bubbles.length; i++) {
      this.bubbles[i].draw(ctx);
    }
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.12 Falling precipitate particles
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawFallingParticles = function (ctx, geom) {
    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (!p.settled) p.draw(ctx);
    }
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.13 Meniscus
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawMeniscus = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v || !(v.waterVolume > 0)) return;
    var surfaceY = this._liquidSurfaceY();
    if (surfaceY >= geom.innerBottomY - 1) return;

    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();

    /* surface line — slight dip at the centre */
    var dip = 3.2;
    ctx.beginPath();
    ctx.moveTo(geom.innerLeft, surfaceY);
    ctx.quadraticCurveTo(geom.cx, surfaceY + dip * 2, geom.innerRight, surfaceY);
    ctx.lineTo(geom.innerRight, surfaceY + 6);
    ctx.quadraticCurveTo(geom.cx, surfaceY + dip * 2 + 6, geom.innerLeft, surfaceY + 6);
    ctx.closePath();

    /* highlight band */
    var highlight = ctx.createLinearGradient(0, surfaceY - 3, 0, surfaceY + 5);
    highlight.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    highlight.addColorStop(0.55, "rgba(255, 255, 255, 0.15)");
    highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = highlight;
    ctx.fill();

    /* thin bright edge line */
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(geom.innerLeft, surfaceY);
    ctx.quadraticCurveTo(geom.cx, surfaceY + dip * 2, geom.innerRight, surfaceY);
    ctx.stroke();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.14 Magnetic stirrer vortex
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawVortex = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v || !v.stirring || v.stirRate < 0.05) return;
    if (!(v.waterVolume > 0)) return;

    var rate = v.stirRate;
    var surfaceY = this._liquidSurfaceY();
    if (surfaceY >= geom.innerBottomY - 1) return;

    var funnelDepth = rate * geom.innerH * 0.20;
    var funnelW = geom.innerW * 0.55 * rate;

    ctx.save();
    this._beakerPath(ctx, geom, 2);
    ctx.clip();

    /* --- funnel: an ellipse with a deeper centre --- */
    ctx.beginPath();
    ctx.moveTo(geom.innerLeft, surfaceY + 2);
    ctx.quadraticCurveTo(geom.cx, surfaceY + funnelDepth * 2.1, geom.innerRight, surfaceY + 2);
    ctx.lineTo(geom.innerRight, surfaceY + 4);
    ctx.quadraticCurveTo(geom.cx, surfaceY + funnelDepth * 2.1 + 3, geom.innerLeft, surfaceY + 4);
    ctx.closePath();

    var grad = ctx.createRadialGradient(geom.cx, surfaceY + funnelDepth * 0.9, 2, geom.cx, surfaceY + funnelDepth * 0.9, funnelW);
    grad.addColorStop(0, "rgba(20, 30, 45, 0.55)");
    grad.addColorStop(0.6, "rgba(40, 70, 100, 0.35)");
    grad.addColorStop(1, "rgba(200, 230, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fill();

    /* --- rotating helical streaks --- */
    var streakAlpha = 0.35 + rate * 0.35;
    ctx.lineWidth = 1.2;
    for (var k = 0; k < 6; k++) {
      var phase = this._vortexAngle + (k / 6) * Math.PI * 2;
      var radius = funnelW * (0.35 + 0.6 * (k % 3) / 2);
      var cy = surfaceY + funnelDepth * 0.55;
      ctx.strokeStyle = "rgba(220, 240, 255, " + (streakAlpha * (0.5 + 0.5 * Math.sin(phase))) + ")";
      ctx.beginPath();
      ctx.ellipse(geom.cx, cy, radius, radius * 0.28, phase, 0, Math.PI * 1.2);
      ctx.stroke();
    }

    /* --- highlight ring at the funnel lip --- */
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(geom.cx, surfaceY + 1.5, funnelW * 0.85, funnelDepth * 0.22 + 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.15 Beaker glass front
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBeakerGlass = function (ctx, geom) {
    /* glass outline */
    ctx.save();
    this._beakerPath(ctx, geom, 0);

    /* outer stroke */
    ctx.strokeStyle = "rgba(200, 230, 255, 0.75)";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    /* inner stroke for depth */
    ctx.strokeStyle = "rgba(140, 180, 220, 0.35)";
    ctx.lineWidth = 1;
    this._beakerPath(ctx, geom, 3);
    ctx.stroke();

    /* left sheen */
    var sheen = ctx.createLinearGradient(geom.beakerLeft, 0, geom.beakerLeft + 40, 0);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.38)");
    sheen.addColorStop(0.65, "rgba(255, 255, 255, 0.10)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.save();
    this._beakerPath(ctx, geom, 0);
    ctx.clip();
    ctx.fillStyle = sheen;
    ctx.fillRect(geom.beakerLeft + 6, geom.beakerTopY + 4, 42, geom.beakerH - 8);
    ctx.restore();

    /* right subtle shadow */
    var shadow = ctx.createLinearGradient(geom.beakerRight - 30, 0, geom.beakerRight, 0);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0.30)");
    ctx.save();
    this._beakerPath(ctx, geom, 0);
    ctx.clip();
    ctx.fillStyle = shadow;
    ctx.fillRect(geom.beakerRight - 30, geom.beakerTopY + 4, 30, geom.beakerH - 8);
    ctx.restore();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.16 Graduation marks
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawGraduations = function (ctx, geom) {
    var marks = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
    var v = this.engine && this.engine.vessel;
    var volML = v ? v.waterVolume * 1000 : 0;

    ctx.save();

    for (var i = 0; i < marks.length; i++) {
      var mL = marks[i];
      var frac = mL / 500;
      var y = geom.innerBottomY - frac * geom.innerH;
      if (y < geom.beakerTopY + 6) continue;

      var isMajor = (mL % 100 === 0);
      var len = isMajor ? 26 : 14;

      /* tick mark on the right side */
      ctx.strokeStyle = isMajor
        ? "rgba(220, 240, 255, 0.85)"
        : "rgba(190, 210, 230, 0.55)";
      ctx.lineWidth = isMajor ? 1.6 : 1.1;
      ctx.beginPath();
      ctx.moveTo(geom.beakerRight - 6 - len, y);
      ctx.lineTo(geom.beakerRight - 6, y);
      ctx.stroke();

      /* label */
      if (isMajor) {
        ctx.fillStyle = "rgba(220, 240, 255, 0.85)";
        ctx.font = "10px 'SF Mono', Menlo, Consolas, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(String(mL), geom.beakerRight - 6 - len - 5, y);
      }

      /* highlighted tick at the current volume */
      if (Math.abs(volML - mL) < 18) {
        ctx.strokeStyle = "rgba(120, 220, 255, 0.9)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(geom.beakerRight - 6 - len - 4, y);
        ctx.lineTo(geom.beakerRight - 6, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.17 Beaker rim
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawBeakerRim = function (ctx, geom) {
    var x = geom.beakerX;
    var topY = geom.beakerTopY;
    var w = geom.beakerW;

    /* rim body */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, topY, w * 0.5 + 2, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200, 230, 255, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 240, 255, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    /* inner rim shadow */
    ctx.beginPath();
    ctx.ellipse(x, topY + 2.5, w * 0.5 - 2, 2.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(60, 100, 140, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* spout on the top-right */
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5 - 2, topY - 1);
    ctx.quadraticCurveTo(x + w * 0.5 + 12, topY - 6, x + w * 0.5 + 14, topY + 4);
    ctx.quadraticCurveTo(x + w * 0.5 + 6, topY + 4, x + w * 0.5 - 2, topY + 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(200, 230, 255, 0.55)";
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 240, 255, 0.9)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.18 Gas puffs
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawGasPuffs = function (ctx, geom) {
    for (var i = 0; i < this.gasPuffs.length; i++) {
      this.gasPuffs[i].draw(ctx);
    }
  };

  /* ----------------------------------------------------------------------
   * 6.19 Sparks
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawSparks = function (ctx, geom) {
    for (var i = 0; i < this.sparks.length; i++) {
      this.sparks[i].draw(ctx);
    }
  };

  /* ----------------------------------------------------------------------
   * 6.20 Shockwaves
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawShockwaves = function (ctx, geom) {
    for (var i = 0; i < this.shockwaves.length; i++) {
      this.shockwaves[i].draw(ctx);
    }
  };

  /* ----------------------------------------------------------------------
   * 6.21 Flash overlay
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawFlash = function (ctx, geom) {
    if (this.flashAlpha <= 0.005) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.flashAlpha, 0, 1);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, geom.W, geom.H);
    ctx.restore();
  };

  /* ----------------------------------------------------------------------
   * 6.22 HUD
   * -------------------------------------------------------------------- */

  CanvasRenderer.prototype._drawHUD = function (ctx, geom) {
    var v = this.engine && this.engine.vessel;
    if (!v) return;

    var pad = 14;
    var panelW = 168;
    var panelH = 132;
    var x = pad;
    var y = pad;

    ctx.save();

    /* panel background */
    ctx.fillStyle = "rgba(8, 16, 26, 0.72)";
    ctx.strokeStyle = "rgba(120, 180, 230, 0.35)";
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, panelW, panelH, 8);
    ctx.fill();
    ctx.stroke();

    /* title */
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "600 11px 'SF Pro Text', -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("VIRTUALAB PRO", x + 12, y + 10);

    /* divider */
    ctx.strokeStyle = "rgba(120, 180, 230, 0.22)";
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 26);
    ctx.lineTo(x + panelW - 10, y + 26);
    ctx.stroke();

    /* values */
    var tempC = v.temperature - 273.15;
    var volML = v.waterVolume * 1000;
    var ph = (v.pH !== null && v.pH !== undefined) ? v.pH.toFixed(2) : "—";

    var rows = [
      { label: "Temp",  value: (tempC).toFixed(1) + " °C" },
      { label: "pH",    value: ph },
      { label: "Vol",   value: volML.toFixed(1) + " mL" },
      { label: "Stir",  value: v.stirring ? (v.stirRate * 100).toFixed(0) + " %" : "off" },
      { label: "Flame", value: v.flamePower > 0.02 ? (v.flamePower * 100).toFixed(0) + " %" : "off" }
    ];

    ctx.font = "10.5px 'SF Mono', Menlo, Consolas, monospace";
    for (var i = 0; i < rows.length; i++) {
      var ry = y + 36 + i * 18;
      ctx.fillStyle = "rgba(160, 200, 240, 0.65)";
      ctx.textAlign = "left";
      ctx.fillText(rows[i].label, x + 12, ry);

      /* value — colour-coded for pH and temperature */
      var col = "#e6f4ff";
      if (rows[i].label === "pH" && v.pH !== null) {
        if (v.pH < 3) col = "#ff7050";
        else if (v.pH < 6) col = "#ffb060";
        else if (v.pH > 11) col = "#8080ff";
        else if (v.pH > 8) col = "#80b0ff";
        else col = "#80e0a0";
      }
      if (rows[i].label === "Temp" && tempC > 60) col = "#ffb060";
      if (rows[i].label === "Temp" && tempC > 90) col = "#ff6040";

      ctx.fillStyle = col;
      ctx.textAlign = "right";
      ctx.fillText(rows[i].value, x + panelW - 12, ry);
    }

    /* reactivity indicator (pulsing dot) */
    if (v.reactionCount > 0) {
      var pulse = 0.55 + 0.45 * Math.sin(this.t * 6);
      ctx.fillStyle = "rgba(255, 200, 100, " + pulse + ")";
      ctx.beginPath();
      ctx.arc(x + panelW - 12, y + 12, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* gas legend (bottom-right) */
    var gasIds = [];
    for (var gid in v.gases) {
      if (Object.prototype.hasOwnProperty.call(v.gases, gid) && v.gases[gid] > 1e-5) {
        gasIds.push(gid);
      }
    }
    if (gasIds.length > 0) {
      var lx = geom.W - pad - 130;
      var ly = geom.H - pad - (16 + gasIds.length * 15);
      var lw = 130;
      var lh = 14 + gasIds.length * 15;

      ctx.fillStyle = "rgba(8, 16, 26, 0.72)";
      ctx.strokeStyle = "rgba(120, 180, 230, 0.28)";
      ctx.lineWidth = 1;
      this._roundRect(ctx, lx, ly, lw, lh, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = "9.5px 'SF Mono', Menlo, Consolas, monospace";
      ctx.textBaseline = "middle";
      for (var k = 0; k < gasIds.length; k++) {
        var gid2 = gasIds[k];
        var info = GAS_COLORS[gid2] || { color: "#e0e0e0" };
        var gy = ly + 10 + k * 15;

        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(lx + 10, gy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(200, 225, 245, 0.9)";
        ctx.textAlign = "left";
        ctx.fillText(gid2, lx + 20, gy);

        ctx.fillStyle = "rgba(160, 200, 240, 0.7)";
        ctx.textAlign = "right";
        ctx.fillText(
          (v.gases[gid2] * 22.4136).toFixed(2) + " L",
          lx + lw - 8, gy
        );
      }
    }

    ctx.restore();
  };

  CanvasRenderer.prototype._roundRect = function (ctx, x, y, w, h, r) {
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
  };

  /* ==========================================================================
   * 7. PUBLIC NAMESPACE
   * ========================================================================*/

  var API = CanvasRenderer;
  API.utils = {
    clamp:     clamp,
    lerp:      lerp,
    rand:      rand,
    hexToRgb:  hexToRgb,
    rgbToHex:  rgbToHex,
    mixHex:    mixHex,
    rgba:      rgba,
    geometry:  computeGeometry
  };
  API.reference = {
    ionFlameColors: ION_FLAME_COLORS,
    gasColors:      GAS_COLORS,
    defaultFlame:   DEFAULT_FLAME
  };

  if (typeof console !== "undefined" && console.log) {
    console.log(
      "%c VirtuaLab Pro %c CanvasRenderer ready — " +
      Object.keys(ION_FLAME_COLORS).length + " ion flame palettes, " +
      Object.keys(GAS_COLORS).length + " gas cloud colours.",
      "background:#0b7285;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
      "background:#e3fafc;color:#0b7285;padding:2px 6px;border-radius:0 3px 3px 0"
    );
  }

  return API;
})();
