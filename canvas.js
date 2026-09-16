/* ============================================================================
 * VirtuaLab Pro — canvas.js
 * ----------------------------------------------------------------------------
 * High-performance HTML5 Canvas rendering engine + particle physics system.
 *
 * Responsibilities
 *   • 500 mL laboratory beaker with meniscus, graduation ticks, glass highlights
 *   • Fluid color blending (solution color + pH indicators + turbidity)
 *   • Liquid surface wave dynamics (stirring, additions, vortex)
 *   • Bunsen burner flame with flame-test ion tinting
 *   • Magnetic stirrer bar + vortex funnel
 *   • Volumetric gas / smoke / steam clouds
 *   • Precipitate particle physics with sedimentation
 *   • Effervescence + boiling bubbles
 *   • Explosions: screen shake, shockwaves, flash, sparks
 *
 * Public API (window.CanvasRenderer)
 *   init(canvasElement|string)   -> boots the render loop
 *   triggerExplosion(intensity)  -> detonates hazard FX
 *   setFlameColor(color)         -> override flame tint (hex/rgb/object)
 *   setGasType(type)             -> manual gas override
 *   setPrecipitateType(type)     -> manual precipitate override
 *   setVolume(ml) / getVolume()  -> manual fluid control
 *   pause() / resume() / destroy()
 *   onResize()                   -> force layout recompute
 * ========================================================================== */

(function (global) {
  'use strict';

  /* ==========================================================================
   * 0. MATH / UTILITY HELPERS
   * ======================================================================== */

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function num(v, d) {
    var n = (typeof v === 'string') ? parseFloat(v) : v;
    return (typeof n === 'number' && isFinite(n)) ? n : d;
  }
  function bool(v, d) { return (v === undefined || v === null) ? d : !!v; }
  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  /* ==========================================================================
   * 1. COLOR ENGINE
   * ======================================================================== */

  var NAMED_COLORS = {
    white: [255, 255, 255], black: [0, 0, 0], red: [230, 40, 40],
    green: [40, 190, 90], blue: [50, 110, 230], yellow: [245, 215, 50],
    orange: [245, 140, 30], purple: [140, 70, 200], pink: [235, 90, 160],
    cyan: [60, 210, 230], gray: [140, 140, 140], grey: [140, 140, 140],
    brown: [130, 85, 50], violet: [150, 90, 220], lilac: [190, 140, 235],
    colorless: [215, 232, 245], clear: [215, 232, 245], water: [150, 205, 235]
  };

  function parseColor(c, fallback) {
    var fb = fallback || { r: 150, g: 200, b: 235 };
    if (c === undefined || c === null) return { r: fb.r, g: fb.g, b: fb.b };

    if (typeof c === 'object') {
      if (Array.isArray(c) && c.length >= 3) {
        return { r: clamp(num(c[0], 0), 0, 255), g: clamp(num(c[1], 0), 0, 255), b: clamp(num(c[2], 0), 0, 255) };
      }
      if (typeof c.r === 'number') {
        return { r: clamp(c.r, 0, 255), g: clamp(c.g === undefined ? c.r : c.g, 0, 255), b: clamp(c.b === undefined ? c.r : c.b, 0, 255) };
      }
      if (typeof c.hex === 'string') return parseColor(c.hex, fb);
      if (typeof c.color === 'string') return parseColor(c.color, fb);
      return { r: fb.r, g: fb.g, b: fb.b };
    }

    if (typeof c === 'string') {
      var s = c.trim().toLowerCase();

      if (s.charAt(0) === '#') {
        var h = s.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length === 8) h = h.slice(0, 6);
        if (h.length >= 6) {
          var n = parseInt(h.slice(0, 6), 16);
          if (!isNaN(n)) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }
      }

      var m = s.match(/rgba?\(([^)]+)\)/);
      if (m) {
        var p = m[1].split(',').map(function (x) { return parseFloat(x); });
        return {
          r: clamp(num(p[0], fb.r), 0, 255),
          g: clamp(num(p[1], fb.g), 0, 255),
          b: clamp(num(p[2], fb.b), 0, 255)
        };
      }

      if (NAMED_COLORS[s]) {
        var nc = NAMED_COLORS[s];
        return { r: nc[0], g: nc[1], b: nc[2] };
      }
    }

    return { r: fb.r, g: fb.g, b: fb.b };
  }

  function rgba(c, a) {
    return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function rgbStr(c) { return 'rgb(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ')'; }
  function mixColor(a, b, t) {
    t = clamp(t, 0, 1);
    return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
  }
  function scaleColor(c, k) {
    return { r: clamp(c.r * k, 0, 255), g: clamp(c.g * k, 0, 255), b: clamp(c.b * k, 0, 255) };
  }
  function lighten(c, k) { return mixColor(c, { r: 255, g: 255, b: 255 }, k); }
  function darken(c, k) { return mixColor(c, { r: 0, g: 0, b: 0 }, k); }

  /* ==========================================================================
   * 2. SPRITE CACHE (soft volumetric blobs — avoids per-particle gradients)
   * ======================================================================== */

  var _spriteCache = Object.create(null);

  function blobSprite(key, col) {
    var cached = _spriteCache[key];
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    var SZ = 64;
    var cv = document.createElement('canvas');
    cv.width = SZ;
    cv.height = SZ;
    var g = cv.getContext('2d');
    var grd = g.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);

    var r = col.r | 0, gg = col.g | 0, b = col.b | 0;
    grd.addColorStop(0.00, 'rgba(' + r + ',' + gg + ',' + b + ',1)');
    grd.addColorStop(0.28, 'rgba(' + r + ',' + gg + ',' + b + ',0.72)');
    grd.addColorStop(0.55, 'rgba(' + r + ',' + gg + ',' + b + ',0.32)');
    grd.addColorStop(0.80, 'rgba(' + r + ',' + gg + ',' + b + ',0.09)');
    grd.addColorStop(1.00, 'rgba(' + r + ',' + gg + ',' + b + ',0)');

    g.fillStyle = grd;
    g.fillRect(0, 0, SZ, SZ);

    _spriteCache[key] = cv;
    return cv;
  }

  /* ==========================================================================
   * 3. CHEMISTRY LOOKUP TABLES
   * ======================================================================== */

  /* ---- pH indicators ---------------------------------------------------- */

  function applyIndicator(base, indicator, pH) {
    if (!indicator) return base;
    var name = String(indicator).toLowerCase();

    function has(s) { return name.indexOf(s) !== -1; }

    if (has('phenolphthalein') || has('phenolphtalein') || has('酚酞')) {
      if (pH <= 8.2) return base;
      var t1 = clamp((pH - 8.2) / 1.8, 0, 1);
      return mixColor(base, { r: 232, g: 42, b: 138 }, t1 * 0.88);
    }

    if (has('methyl orange') || has('methylorange') || has('甲基橙')) {
      var acid = mixColor(base, { r: 220, g: 58, b: 42 }, 0.86);
      var basi = mixColor(base, { r: 250, g: 196, b: 44 }, 0.82);
      if (pH < 3.1) return acid;
      if (pH > 4.4) return basi;
      return mixColor(acid, basi, (pH - 3.1) / 1.3);
    }

    if (has('bromothymol') || has('bromthymol') || has('溴百里酚蓝') || has('btb')) {
      var yel = mixColor(base, { r: 240, g: 212, b: 44 }, 0.82);
      var blu = mixColor(base, { r: 32, g: 96, b: 224 }, 0.82);
      if (pH < 6.0) return yel;
      if (pH > 7.6) return blu;
      return mixColor(yel, blu, (pH - 6.0) / 1.6);
    }

    if (has('litmus') || has('石蕊')) {
      if (pH < 4.5) return mixColor(base, { r: 212, g: 44, b: 56 }, 0.86);
      if (pH > 8.3) return mixColor(base, { r: 44, g: 84, b: 212 }, 0.86);
      return mixColor(base, { r: 132, g: 92, b: 182 }, 0.22);
    }

    if (has('universal') || has('广泛') || has('ph paper')) {
      var stops = [
        [0, { r: 198, g: 24, b: 34 }],
        [2, { r: 226, g: 62, b: 26 }],
        [4, { r: 236, g: 128, b: 24 }],
        [6, { r: 240, g: 214, b: 44 }],
        [7, { r: 76, g: 186, b: 88 }],
        [9, { r: 38, g: 108, b: 214 }],
        [11, { r: 88, g: 44, b: 182 }],
        [14, { r: 122, g: 22, b: 142 }]
      ];
      var p = clamp(pH, 0, 14);
      for (var i = 0; i < stops.length - 1; i++) {
        var a = stops[i], b = stops[i + 1];
        if (p >= a[0] && p <= b[0]) {
          var tt = (p - a[0]) / (b[0] - a[0] || 1);
          return mixColor(base, mixColor(a[1], b[1], tt), 0.85);
        }
      }
      return mixColor(base, stops[stops.length - 1][1], 0.85);
    }

    return base;
  }

  /* ---- Flame test ions -------------------------------------------------- */

  var FLAME_IONS = {
    li: { outer: { r: 255, g: 46, b: 46 }, mid: { r: 255, g: 140, b: 130 }, core: { r: 255, g: 230, b: 220 }, name: 'lithium' },
    na: { outer: { r: 255, g: 152, b: 18 }, mid: { r: 255, g: 214, b: 82 }, core: { r: 255, g: 250, b: 205 }, name: 'sodium' },
    k: { outer: { r: 190, g: 118, b: 255 }, mid: { r: 220, g: 178, b: 255 }, core: { r: 244, g: 232, b: 255 }, name: 'potassium' },
    rb: { outer: { r: 210, g: 90, b: 230 }, mid: { r: 236, g: 160, b: 250 }, core: { r: 250, g: 230, b: 255 }, name: 'rubidium' },
    cs: { outer: { r: 130, g: 140, b: 255 }, mid: { r: 180, g: 190, b: 255 }, core: { r: 235, g: 238, b: 255 }, name: 'caesium' },
    cu: { outer: { r: 0, g: 226, b: 138 }, mid: { r: 60, g: 250, b: 220 }, core: { r: 214, g: 255, b: 250 }, name: 'copper' },
    sr: { outer: { r: 255, g: 58, b: 28 }, mid: { r: 255, g: 142, b: 92 }, core: { r: 255, g: 226, b: 200 }, name: 'strontium' },
    ca: { outer: { r: 250, g: 96, b: 26 }, mid: { r: 255, g: 168, b: 84 }, core: { r: 255, g: 234, b: 196 }, name: 'calcium' },
    ba: { outer: { r: 176, g: 236, b: 62 }, mid: { r: 214, g: 250, b: 140 }, core: { r: 244, g: 255, b: 216 }, name: 'barium' },
    pb: { outer: { r: 150, g: 190, b: 255 }, mid: { r: 196, g: 222, b: 255 }, core: { r: 238, g: 246, b: 255 }, name: 'lead' },
    as: { outer: { r: 120, g: 180, b: 240 }, mid: { r: 176, g: 214, b: 250 }, core: { r: 230, g: 244, b: 255 }, name: 'arsenic' },
    b: { outer: { r: 96, g: 230, b: 120 }, mid: { r: 168, g: 248, b: 170 }, core: { r: 232, g: 255, b: 232 }, name: 'boron' },
    fe: { outer: { r: 255, g: 190, b: 60 }, mid: { r: 255, g: 224, b: 140 }, core: { r: 255, g: 250, b: 225 }, name: 'iron' },
    zn: { outer: { r: 150, g: 220, b: 250 }, mid: { r: 200, g: 240, b: 255 }, core: { r: 240, g: 252, b: 255 }, name: 'zinc' },
    mg: { outer: { r: 255, g: 255, b: 255 }, mid: { r: 250, g: 250, b: 255 }, core: { r: 255, g: 255, b: 255 }, name: 'magnesium' }
  };

  var DEFAULT_FLAME = {
    outer: { r: 255, g: 138, b: 26 },
    mid: { r: 255, g: 196, b: 72 },
    core: { r: 255, g: 246, b: 206 },
    name: 'default'
  };

  function lookupFlameIon(ion) {
    if (!ion) return DEFAULT_FLAME;
    var s = String(ion).toLowerCase().replace(/[^a-z]/g, '');
    // Direct symbol match first (e.g. "na", "cu2+")
    for (var key in FLAME_IONS) {
      if (!FLAME_IONS.hasOwnProperty(key)) continue;
      if (s === key) return FLAME_IONS[key];
    }
    // Substring match
    var ordered = ['li', 'na', 'k', 'rb', 'cs', 'cu', 'sr', 'ca', 'ba', 'pb', 'as', 'fe', 'zn', 'mg', 'b'];
    for (var i = 0; i < ordered.length; i++) {
      var k = ordered[i];
      if (s.indexOf(k) !== -1) return FLAME_IONS[k];
    }
    // Full names
    for (var k2 in FLAME_IONS) {
      if (!FLAME_IONS.hasOwnProperty(k2)) continue;
      if (s.indexOf(FLAME_IONS[k2].name) !== -1) return FLAME_IONS[k2];
    }
    return DEFAULT_FLAME;
  }

  /* ---- Gas styles -------------------------------------------------------- */

  var GAS_STYLES = {
    no2: { key: 'no2', color: { r: 148, g: 78, b: 38 }, alpha: 0.62, size: 16, growth: 26, life: 3.4, rise: 30, sprite: true },
    n2o4: { key: 'n2o4', color: { r: 160, g: 92, b: 48 }, alpha: 0.55, size: 15, growth: 24, life: 3.2, rise: 28, sprite: true },
    cl2: { key: 'cl2', color: { r: 196, g: 224, b: 62 }, alpha: 0.5, size: 15, growth: 22, life: 3.2, rise: 26, sprite: true },
    p4o10: { key: 'p4o10', color: { r: 250, g: 250, b: 250 }, alpha: 0.68, size: 19, growth: 30, life: 3.8, rise: 22, sprite: true },
    steam: { key: 'steam', color: { r: 224, g: 238, b: 255 }, alpha: 0.3, size: 17, growth: 28, life: 2.9, rise: 34, sprite: true },
    so2: { key: 'so2', color: { r: 226, g: 226, b: 198 }, alpha: 0.34, size: 14, growth: 21, life: 2.7, rise: 24, sprite: true },
    so3: { key: 'so3', color: { r: 240, g: 240, b: 232 }, alpha: 0.42, size: 15, growth: 23, life: 3.0, rise: 24, sprite: true },
    h2s: { key: 'h2s', color: { r: 212, g: 206, b: 148 }, alpha: 0.34, size: 14, growth: 20, life: 2.6, rise: 22, sprite: true },
    nh3: { key: 'nh3', color: { r: 230, g: 240, b: 250 }, alpha: 0.26, size: 14, growth: 22, life: 2.6, rise: 30, sprite: true },
    co2: { key: 'co2', color: { r: 238, g: 242, b: 248 }, alpha: 0.16, size: 12, growth: 18, life: 2.2, rise: 28, sprite: true },
    h2: { key: 'h2', color: { r: 236, g: 246, b: 255 }, alpha: 0.14, size: 11, growth: 16, life: 2.0, rise: 34, sprite: true },
    o2: { key: 'o2', color: { r: 236, g: 246, b: 255 }, alpha: 0.14, size: 11, growth: 16, life: 2.0, rise: 30, sprite: true },
    br2: { key: 'br2', color: { r: 186, g: 58, b: 36 }, alpha: 0.58, size: 16, growth: 24, life: 3.2, rise: 24, sprite: true },
    i2: { key: 'i2', color: { r: 146, g: 62, b: 158 }, alpha: 0.5, size: 15, growth: 22, life: 3.0, rise: 24, sprite: true },
    default: { key: 'default', color: { r: 220, g: 228, b: 238 }, alpha: 0.24, size: 14, growth: 20, life: 2.6, rise: 26, sprite: true }
  };

  function lookupGas(type) {
    if (!type) return GAS_STYLES.default;
    var s = String(type).toLowerCase().replace(/[^a-z0-9]/g, '');
    var table = [
      ['no2', 'no2'], ['nitrogendioxide', 'no2'], ['brownfume', 'no2'], ['brown', 'no2'],
      ['n2o4', 'n2o4'],
      ['cl2', 'cl2'], ['chlorine', 'cl2'], ['yellowgreen', 'cl2'],
      ['p4o10', 'p4o10'], ['phosphoruspentoxide', 'p4o10'], ['whitesmoke', 'p4o10'],
      ['steam', 'steam'], ['watervapour', 'steam'], ['watervapor', 'steam'], ['h2o(g)', 'steam'],
      ['so2', 'so2'], ['sulphurdioxide', 'so2'], ['sulfurdioxide', 'so2'],
      ['so3', 'so3'], ['sulphurtrioxide', 'so3'], ['sulfurtrioxide', 'so3'],
      ['h2s', 'h2s'], ['hydrogensulphide', 'h2s'], ['hydrogensulfide', 'h2s'],
      ['nh3', 'nh3'], ['ammonia', 'nh3'],
      ['co2', 'co2'], ['carbondioxide', 'co2'],
      ['h2', 'h2'], ['hydrogen', 'h2'],
      ['o2', 'o2'], ['oxygen', 'o2'],
      ['br2', 'br2'], ['bromine', 'br2'],
      ['i2', 'i2'], ['iodine', 'i2']
    ];
    for (var i = 0; i < table.length; i++) {
      if (s.indexOf(table[i][0]) !== -1) return GAS_STYLES[table[i][1]];
    }
    return GAS_STYLES.default;
  }

  /* ---- Precipitate styles ------------------------------------------------ */

  var PRECIP_STYLES = {
    agcl: { key: 'agcl', color: { r: 246, g: 246, b: 246 }, size: 3.4, settle: 1.0 },
    pbcl2: { key: 'pbcl2', color: { r: 250, g: 250, b: 250 }, size: 3.2, settle: 1.0 },
    pbi2: { key: 'pbi2', color: { r: 250, g: 208, b: 24 }, size: 3.6, settle: 1.05 },
    cuoh2: { key: 'cuoh2', color: { r: 62, g: 148, b: 226 }, size: 3.8, settle: 0.85 },
    feoh3: { key: 'feoh3', color: { r: 158, g: 72, b: 42 }, size: 4.0, settle: 0.8 },
    aloh3: { key: 'aloh3', color: { r: 240, g: 240, b: 246 }, size: 3.4, settle: 0.7 },
    mgoh2: { key: 'mgoh2', color: { r: 246, g: 246, b: 248 }, size: 3.2, settle: 0.75 },
    caco3: { key: 'caco3', color: { r: 248, g: 248, b: 244 }, size: 3.3, settle: 0.9 },
    baso4: { key: 'baso4', color: { r: 250, g: 250, b: 252 }, size: 3.2, settle: 1.15 },
    caso4: { key: 'caso4', color: { r: 248, g: 248, b: 250 }, size: 3.1, settle: 1.0 },
    agi: { key: 'agi', color: { r: 240, g: 228, b: 118 }, size: 3.4, settle: 1.0 },
    agbr: { key: 'agbr', color: { r: 244, g: 238, b: 196 }, size: 3.4, settle: 1.0 },
    s: { key: 's', color: { r: 240, g: 228, b: 110 }, size: 3.4, settle: 0.85 },
    cus: { key: 'cus', color: { r: 40, g: 34, b: 30 }, size: 3.4, settle: 1.1 },
    feco3: { key: 'feco3', color: { r: 120, g: 140, b: 110 }, size: 3.4, settle: 0.9 },
    default: { key: 'default', color: { r: 236, g: 236, b: 238 }, size: 3.3, settle: 1.0 }
  };

  function lookupPrecip(type) {
    if (!type) return PRECIP_STYLES.default;
    var s = String(type).toLowerCase().replace(/[^a-z0-9]/g, '');
    var table = [
      ['agcl', 'agcl'], ['silverchloride', 'agcl'],
      ['pbcl2', 'pbcl2'], ['leadchloride', 'pbcl2'],
      ['pbi2', 'pbi2'], ['leadiodide', 'pbi2'], ['leadiiodide', 'pbi2'],
      ['cuoh2', 'cuoh2'], ['copperhydroxide', 'cuoh2'],
      ['feoh3', 'feoh3'], ['ironhydroxide', 'feoh3'],
      ['aloh3', 'aloh3'], ['aluminiumhydroxide', 'aloh3'],
      ['mgoh2', 'mgoh2'], ['magnesiumhydroxide', 'mgoh2'],
      ['caco3', 'caco3'], ['calciumcarbonate', 'caco3'],
      ['baso4', 'baso4'], ['bariumsulphate', 'baso4'], ['bariumsulfate', 'baso4'],
      ['caso4', 'caso4'], ['calciumsulphate', 'caso4'], ['calciumsulfate', 'caso4'],
      ['agi', 'agi'], ['silveriodide', 'agi'],
      ['agbr', 'agbr'], ['silverbromide', 'agbr'],
      ['cus', 'cus'], ['coppersulphide', 'cus'], ['coppersulfide', 'cus'],
      ['feco3', 'feco3'],
      ['sulfur', 's'], ['sulphur', 's']
    ];
    for (var i = 0; i < table.length; i++) {
      if (s.indexOf(table[i][0]) !== -1) return PRECIP_STYLES[table[i][1]];
    }
    return PRECIP_STYLES.default;
  }

  /* ==========================================================================
   * 4. PARTICLE SYSTEM
   * ======================================================================== */

  function Particle(o) {
    this.x = o.x || 0;
    this.y = o.y || 0;
    this.vx = o.vx || 0;
    this.vy = o.vy || 0;
    this.life = 0;
    this.maxLife = o.maxLife || 1;
    this.size = o.size || 3;
    this.growth = o.growth || 0;
    this.color = o.color || { r: 255, g: 255, b: 255 };
    this.alpha = (o.alpha === undefined) ? 1 : o.alpha;
    this.type = o.type || 'gas';
    this.spriteKey = o.spriteKey || 'default';
    this.phase = Math.random() * TAU;
    this.rot = Math.random() * TAU;
    this.spin = o.spin || 0;
    this.drag = (o.drag === undefined) ? 1 : o.drag;
    this.buoy = (o.buoy === undefined) ? 1 : o.buoy;
    this.dead = false;
    this.wobble = o.wobble || 0;
    this.glow = o.glow || 0;
    this.fadeIn = o.fadeIn || 0.12;
  }

  Particle.prototype.update = function (dt) {
    this.life += dt;
    if (this.life >= this.maxLife) { this.dead = true; return; }

    switch (this.type) {
      case 'gas':
      case 'smoke':
        this.vy -= 26 * dt * this.buoy;
        this.vx += Math.sin(this.life * 2.4 + this.phase) * 20 * dt;
        this.vx *= (1 - Math.min(1, 1.1 * dt * this.drag));
        this.vy *= (1 - Math.min(1, 0.7 * dt * this.drag));
        this.size += this.growth * dt;
        this.rot += this.spin * dt;
        break;

      case 'bubble':
        this.vy -= (34 + this.size * 3.2) * dt * this.buoy;
        this.vx += Math.sin(this.life * 5.0 + this.phase) * 30 * dt;
        this.vx *= (1 - Math.min(1, 2.2 * dt));
        this.size += this.growth * dt;
        break;

      case 'precipitate':
        this.vy += 30 * dt * this.buoy;
        this.vx += Math.sin(this.life * 1.7 + this.phase) * 22 * dt;
        this.vx *= (1 - Math.min(1, 2.0 * dt));
        this.vy *= (1 - Math.min(1, 2.1 * dt));
        break;

      case 'spark':
        this.vy += 260 * dt;
        this.vx *= (1 - Math.min(1, 0.9 * dt));
        this.vy *= (1 - Math.min(1, 0.9 * dt));
        this.rot += this.spin * dt;
        break;

      case 'droplet':
        this.vy += 520 * dt;
        break;

      case 'shard':
        this.vy += 420 * dt;
        this.vx *= (1 - Math.min(1, 0.5 * dt));
        break;

      default:
        break;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  };

  function ParticleSystem() {
    this.particles = [];
    this.sediment = [];
    this.maxParticles = 1400;
    this.maxSediment = 320;
    this._gasAccum = 0;
    this._precipAccum = 0;
    this._bubbleAccum = 0;
    this._steamAccum = 0;
  }

  ParticleSystem.prototype.add = function (p) {
    if (this.particles.length >= this.maxParticles) {
      // Recycle the oldest low-priority particle
      this.particles.shift();
    }
    this.particles.push(p);
    return p;
  };

  ParticleSystem.prototype.clear = function () {
    this.particles.length = 0;
    this.sediment.length = 0;
    this._gasAccum = 0;
    this._precipAccum = 0;
    this._bubbleAccum = 0;
    this._steamAccum = 0;
  };

  /* ---- Emitters ---------------------------------------------------------- */

  ParticleSystem.prototype.emitGas = function (x, y, style, intensity) {
    var spread = style.key === 'p4o10' ? 26 : 34;
    this.add(new Particle({
      x: x + rnd(-8, 8),
      y: y + rnd(-3, 3),
      vx: rnd(-spread, spread),
      vy: rnd(-style.rise * 0.75, -style.rise * 0.25),
      size: style.size * rnd(0.7, 1.15),
      growth: style.growth * rnd(0.75, 1.25) * (0.6 + intensity * 0.6),
      maxLife: style.life * rnd(0.8, 1.25),
      color: style.color,
      alpha: style.alpha,
      type: 'gas',
      spriteKey: 'gas_' + style.key,
      spin: rnd(-1.2, 1.2),
      drag: 0.9,
      buoy: 0.85
    }));
  };

  ParticleSystem.prototype.emitSmoke = function (x, y, style, intensity) {
    this.emitGas(x, y, style, intensity);
  };

  ParticleSystem.prototype.emitBubble = function (x, y, radius, speed) {
    this.add(new Particle({
      x: x,
      y: y,
      vx: rnd(-9, 9),
      vy: -rnd(28, 70) * (speed || 1),
      size: radius || rnd(1.8, 4.6),
      growth: rnd(1.2, 3.4),
      maxLife: rnd(1.6, 3.4),
      color: { r: 235, g: 248, b: 255 },
      alpha: 0.55,
      type: 'bubble',
      buoy: rnd(0.75, 1.3)
    }));
  };

  ParticleSystem.prototype.emitPrecipitate = function (x, y, style, intensity) {
    this.add(new Particle({
      x: x + rnd(-4, 4),
      y: y + rnd(-4, 4),
      vx: rnd(-16, 16),
      vy: rnd(4, 26),
      size: style.size * rnd(0.65, 1.25),
      growth: rnd(0, 0.5),
      maxLife: rnd(5.0, 11.0),
      color: style.color,
      alpha: 0.9,
      type: 'precipitate',
      buoy: style.settle * rnd(0.8, 1.2)
    }));
  };

  ParticleSystem.prototype.emitSpark = function (x, y, opts) {
    opts = opts || {};
    var speed = opts.speed || rnd(120, 420);
    var ang = opts.angle !== undefined ? opts.angle : rnd(0, TAU);
    this.add(new Particle({
      x: x,
      y: y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - rnd(30, 140),
      size: opts.size || rnd(1.2, 3.4),
      growth: -0.6,
      maxLife: rnd(0.45, 1.35),
      color: opts.color || { r: 255, g: 210, b: 120 },
      alpha: 1,
      type: 'spark',
      spin: rnd(-8, 8),
      glow: 1
    }));
  };

  ParticleSystem.prototype.emitShard = function (x, y, color) {
    this.add(new Particle({
      x: x,
      y: y,
      vx: rnd(-260, 260),
      vy: rnd(-460, -120),
      size: rnd(1.5, 4),
      growth: 0,
      maxLife: rnd(0.9, 1.9),
      color: color || { r: 220, g: 245, b: 255 },
      alpha: 0.85,
      type: 'shard',
      spin: rnd(-10, 10)
    }));
  };

  /* ---- Update ------------------------------------------------------------ */

  ParticleSystem.prototype.update = function (dt, env) {
    var list = this.particles;
    var i, p;

    for (i = list.length - 1; i >= 0; i--) {
      p = list[i];
      p.update(dt);

      if (p.dead) {
        list.splice(i, 1);
        continue;
      }

      // --- Bubbles pop at the fluid surface
      if (p.type === 'bubble') {
        if (p.y <= env.surfaceAtX(p.x)) {
          list.splice(i, 1);
          env.onBubblePop && env.onBubblePop(p);
          continue;
        }
        if (p.x < env.innerLeft - 4 || p.x > env.innerRight + 4) {
          list.splice(i, 1);
          continue;
        }
      }

      // --- Precipitate settles on the beaker floor
      if (p.type === 'precipitate') {
        if (p.y >= env.innerBottom - p.size * 0.5) {
          this._settle(p, env);
          list.splice(i, 1);
          continue;
        }
        if (p.x < env.innerLeft + p.size) { p.x = env.innerLeft + p.size; p.vx = Math.abs(p.vx) * 0.5; }
        if (p.x > env.innerRight - p.size) { p.x = env.innerRight - p.size; p.vx = -Math.abs(p.vx) * 0.5; }
      }

      // --- Gas / smoke horizontal containment (soft)
      if (p.type === 'gas' || p.type === 'smoke') {
        if (p.x < env.innerLeft - 40) { p.x = env.innerLeft - 40; p.vx = Math.abs(p.vx) * 0.4; }
        if (p.x > env.innerRight + 40) { p.x = env.innerRight + 40; p.vx = -Math.abs(p.vx) * 0.4; }
        if (p.y < -60) { list.splice(i, 1); continue; }
      }

      // --- Sparks / shards culling
      if ((p.type === 'spark' || p.type === 'shard') && (p.y > env.canvasH + 80 || p.x < -120 || p.x > env.canvasW + 120)) {
        list.splice(i, 1);
        continue;
      }
    }

    // Fade out old sediment slowly (keeps the layer fresh but bounded)
    if (this.sediment.length > this.maxSediment) {
      this.sediment.splice(0, this.sediment.length - this.maxSediment);
    }
  };

  ParticleSystem.prototype._settle = function (p, env) {
    var depth = clamp(this.sediment.length / this.maxSediment, 0, 1);
    var maxH = (env.innerBottom - env.innerTop) * 0.14;
    var y = env.innerBottom - rnd(0, depth * maxH) - p.size * 0.4;
    this.sediment.push({
      x: clamp(p.x, env.innerLeft + 2, env.innerRight - 2),
      y: y,
      r: p.size * rnd(0.8, 1.4),
      color: p.color
    });
  };

  /* ---- Draw -------------------------------------------------------------- */

  ParticleSystem.prototype.drawSediment = function (ctx, env) {
    var s = this.sediment;
    if (!s.length) return;

    ctx.save();
    for (var i = 0; i < s.length; i++) {
      var b = s[i];
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = rgbStr(b.color);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    for (var j = 0; j < s.length; j += 3) {
      var bb = s[j];
      ctx.beginPath();
      ctx.arc(bb.x - bb.r * 0.3, bb.y - bb.r * 0.4, bb.r * 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  ParticleSystem.prototype.drawInside = function (ctx, env) {
    var list = this.particles;
    var i, p, t, fade;

    // --- Pass 1: precipitate (source-over)
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.type !== 'precipitate') continue;
      t = p.life / p.maxLife;
      fade = t < 0.08 ? (t / 0.08) : (1 - Math.pow(t, 3));
      ctx.globalAlpha = clamp(p.alpha * fade, 0, 1);
      ctx.fillStyle = rgbStr(p.color);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }

    // --- Pass 2: bubbles
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.type !== 'bubble') continue;
      t = p.life / p.maxLife;
      fade = (1 - t * t) * 0.9;

      ctx.globalAlpha = clamp(fade * 0.85, 0, 1);
      ctx.strokeStyle = 'rgba(240,252,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.stroke();

      ctx.globalAlpha = clamp(fade * 0.35, 0, 1);
      ctx.fillStyle = 'rgba(200,238,255,0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.72, 0, TAU);
      ctx.fill();

      // Specular dot
      ctx.globalAlpha = clamp(fade * 0.8, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(p.x - p.size * 0.32, p.y - p.size * 0.34, Math.max(0.6, p.size * 0.20), 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  ParticleSystem.prototype.drawOutside = function (ctx, env) {
    var list = this.particles;
    var i, p, t, fade, sprite;

    // --- Volumetric gas / smoke (source-over, soft sprites)
    ctx.save();
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.type !== 'gas' && p.type !== 'smoke') continue;

      t = p.life / p.maxLife;
      var fadeIn = clamp(p.life / p.fadeIn, 0, 1);
      fade = fadeIn * (1 - Math.pow(t, 2.4));

      sprite = blobSprite(p.spriteKey, p.color);
      if (!sprite) continue;

      ctx.globalAlpha = clamp(p.alpha * fade, 0, 1);
      var r = p.size;
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();

    // --- Sparks / shards (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.type !== 'spark' && p.type !== 'shard') continue;

      t = p.life / p.maxLife;
      fade = Math.pow(1 - t, 1.8);

      ctx.globalAlpha = clamp(fade, 0, 1);

      if (p.type === 'spark') {
        sprite = blobSprite('spark_' + p.spriteKey + '_' + (p.color.r | 0) + '_' + (p.color.g | 0) + '_' + (p.color.b | 0), p.color);
        if (sprite) {
          var sr = p.size * 3.2;
          ctx.drawImage(sprite, p.x - sr, p.y - sr, sr * 2, sr * 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * 0.5), 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(lighten(p.color, 0.25), 0.8);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* ==========================================================================
   * 5. EXPLOSION / HAZARD FX
   * ======================================================================== */

  function ExplosionFX() {
    this.shake = 0;
    this.shakeSeed = Math.random() * 1000;
    this.flash = 0;
    this.flashColor = { r: 255, g: 226, b: 168 };
    this.waves = [];
    this.blastGlow = 0;
    this.blastX = 0;
    this.blastY = 0;
    this.cooldown = 0;
  }

  ExplosionFX.prototype.trigger = function (intensity, cx, cy, systems) {
    var I = clamp(num(intensity, 1), 0.15, 3.0);

    this.shake = Math.min(2.0, this.shake + 0.62 * I);
    this.flash = Math.min(1.0, this.flash + 0.62 * I);
    this.blastGlow = Math.min(1.4, this.blastGlow + 0.9 * I);
    this.blastX = cx;
    this.blastY = cy;

    var hueChoice = Math.random();
    if (hueChoice < 0.34) this.flashColor = { r: 255, g: 232, b: 176 };
    else if (hueChoice < 0.67) this.flashColor = { r: 255, g: 168, b: 84 };
    else this.flashColor = { r: 186, g: 224, b: 255 };

    // Shockwave rings
    this.waves.push({ x: cx, y: cy, r: 8, maxR: 210 * I, life: 0, dur: 0.62 + 0.18 * I, w: 9 * I, color: { r: 255, g: 236, b: 190 } });
    this.waves.push({ x: cx, y: cy, r: 8, maxR: 320 * I, life: 0, dur: 0.95 + 0.25 * I, w: 5 * I, color: { r: 255, g: 176, b: 96 } });
    this.waves.push({ x: cx, y: cy, r: 8, maxR: 150 * I, life: 0, dur: 0.45, w: 14 * I, color: { r: 255, g: 255, b: 255 } });

    if (systems) {
      var count = Math.round(46 * I);
      for (var i = 0; i < count; i++) {
        var ang = rnd(0, TAU);
        var spd = rnd(140, 520) * (0.6 + I * 0.5);
        systems.emitSpark(cx, cy, {
          angle: ang,
          speed: spd,
          size: rnd(1.4, 3.8),
          color: Math.random() < 0.5
            ? { r: 255, g: 214, b: 110 }
            : { r: 255, g: 132, b: 52 }
        });
      }

      var shardCount = Math.round(18 * I);
      for (var s = 0; s < shardCount; s++) {
        systems.emitShard(cx + rnd(-14, 14), cy + rnd(-14, 14), { r: 226, g: 246, b: 255 });
      }

      var smokeStyle = GAS_STYLES.default;
      var smokeCount = Math.round(16 * I);
      for (var m = 0; m < smokeCount; m++) {
        systems.emitGas(cx + rnd(-26, 26), cy + rnd(-18, 12), smokeStyle, 1.4);
      }
    }
  };

  ExplosionFX.prototype.update = function (dt) {
    this.shake = Math.max(0, this.shake - dt * (2.4 + this.shake * 1.4));
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.blastGlow = Math.max(0, this.blastGlow - dt * 2.6);
    this.cooldown = Math.max(0, this.cooldown - dt);

    for (var i = this.waves.length - 1; i >= 0; i--) {
      var w = this.waves[i];
      w.life += dt;
      if (w.life >= w.dur) { this.waves.splice(i, 1); continue; }
      w.r = lerp(8, w.maxR, easeOut(w.life / w.dur));
    }
  };

  ExplosionFX.prototype.getShakeOffset = function () {
    if (this.shake <= 0.001) return { x: 0, y: 0 };
    var s = this.shake * 16;
    var t = performance.now() * 0.001;
    return {
      x: (Math.sin(t * 47.3 + this.shakeSeed) + Math.sin(t * 91.7) * 0.5) * s,
      y: (Math.cos(t * 53.1 + this.shakeSeed * 1.7) + Math.sin(t * 77.3) * 0.5) * s
    };
  };

  ExplosionFX.prototype.drawWorld = function (ctx) {
    var i, w, t, alpha;

    // --- Blast radiance glow
    if (this.blastGlow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gr = 220 * this.blastGlow;
      var g = ctx.createRadialGradient(this.blastX, this.blastY, 0, this.blastX, this.blastY, gr);
      g.addColorStop(0, 'rgba(255,244,214,' + (0.75 * this.blastGlow) + ')');
      g.addColorStop(0.35, 'rgba(255,186,96,' + (0.34 * this.blastGlow) + ')');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.blastX, this.blastY, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // --- Shockwave rings
    if (this.waves.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < this.waves.length; i++) {
        w = this.waves[i];
        t = w.life / w.dur;
        alpha = Math.pow(1 - t, 1.6);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.strokeStyle = rgba(w.color, 0.9);
        ctx.lineWidth = Math.max(0.5, w.w * (1 - t * 0.65));
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  ExplosionFX.prototype.drawScreenFlash = function (ctx, w, h) {
    if (this.flash <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(this.flashColor, clamp(this.flash * 0.42, 0, 1));
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  /* ==========================================================================
   * 6. LAYOUT
   * ======================================================================== */

  function computeLayout(w, h) {
    var beakerH = clamp(h * 0.56, 170, 430);
    var beakerW = beakerH * 0.66;

    var cx = w * 0.5;
    var bottom = h * 0.80;
    var top = bottom - beakerH;

    var wall = Math.max(3.5, beakerW * 0.024);
    var corner = beakerW * 0.10;

    var left = cx - beakerW / 2;
    var right = cx + beakerW / 2;

    var burnerGap = clamp(beakerH * 0.17, 34, 96);

    return {
      cx: cx,
      top: top,
      bottom: bottom,
      left: left,
      right: right,
      width: beakerW,
      height: beakerH,
      wall: wall,
      corner: corner,
      innerLeft: left + wall,
      innerRight: right - wall,
      innerTop: top + wall * 0.35,
      innerBottom: bottom - wall,
      burnerGap: burnerGap,
      burnerTop: bottom + burnerGap,
      canvasW: w,
      canvasH: h
    };
  }

  function volToY(L, v) {
    return L.innerBottom - clamp(v / 500, 0, 1) * (L.innerBottom - L.innerTop);
  }

  /* ==========================================================================
   * 7. MODULE STATE
   * ======================================================================== */

  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var cssW = 800;
  var cssH = 600;
  var running = false;
  var rafId = 0;
  var lastTimestamp = 0;
  var time = 0;
  var layout = null;
  var resizeObserver = null;

  var particles = new ParticleSystem();
  var fx = new ExplosionFX();

  var sim = {
    volume: 250,
    temperature: 25,
    pH: 7,
    heating: false,
    rpm: 0,
    stirring: false,
    baseColor: { r: 150, g: 205, b: 235 },
    fluidColor: { r: 150, g: 205, b: 235 },
    fluidAlpha: 0.62,
    turbidity: 0,
    ion: null,
    gasType: null,
    gasRate: 0,
    precipType: null,
    precipRate: 0,
    boiling: false,
    wave: 0,
    vortexDepth: 0,
    vortexSpin: 0,
    indicator: null
  };

  var overrides = {
    volume: null,
    gasType: null,
    precipType: null,
    flameColor: null,
    heating: null,
    rpm: null
  };

  var stirPhase = 0;
  var prevVolume = null;
  var prevExplosionFlag = false;
  var explosionArmed = true;

  /* ==========================================================================
   * 8. ENGINE BRIDGE — reads live state from window.ChemistryEngine
   * ======================================================================== */

  function readEngineState() {
    var E = global.ChemistryEngine;
    var S = {};

    if (E && typeof E === 'object') {
      // Base object properties first...
      for (var k in E) {
        if (Object.prototype.hasOwnProperty.call(E, k)) {
          try { S[k] = E[k]; } catch (e) { /* ignore getters that throw */ }
        }
      }
      // ...then fresh state from getState() takes precedence.
      if (typeof E.getState === 'function') {
        try {
          var st = E.getState();
          if (st && typeof st === 'object') {
            for (var k2 in st) {
              if (Object.prototype.hasOwnProperty.call(st, k2)) S[k2] = st[k2];
            }
          }
        } catch (e2) { /* ignore */ }
      }
    }

    var sol = S.solution || S.mixture || S.content || {};
    var vessel = S.vessel || S.beaker || S.container || {};
    var app = S.apparatus || S.equipment || {};
    var burner = S.burner || app.burner || {};
    var stirrer = S.stirrer || app.stirrer || {};

    /* --- Volume --------------------------------------------------------- */
    var volume = num(pick(
      overrides.volume,
      S.volume, S.volumeML, S.volumeMl, S.volumeMl, S.currentVolume, S.totalVolume, S.liquidVolume,
      sol.volume, vessel.volume, vessel.volumeML
    ), 250);
    volume = clamp(volume, 0, 500);

    /* --- Temperature ---------------------------------------------------- */
    var temperature = num(pick(
      S.temperature, S.temp, S.temperatureC, S.temperature_c, S.temperatureCelsius,
      sol.temperature, vessel.temperature
    ), 25);
    temperature = clamp(temperature, -50, 2000);

    /* --- pH -------------------------------------------------------------- */
    var pH = num(pick(
      S.pH, S.ph, S.PH, S.acidity, S.pHValue,
      sol.pH, sol.ph
    ), 7);
    if (typeof S.getPH === 'function') { try { pH = num(S.getPH(), pH); } catch (e) { } }
    pH = clamp(pH, 0, 14);

    /* --- Heating --------------------------------------------------------- */
    var heating = bool(pick(
      overrides.heating,
      S.heating, S.isHeating, S.heatOn, S.burnerOn, S.burnerActive,
      burner.on, burner.active, app.heating, app.burnerOn,
      (temperature > 60 ? true : undefined)
    ), false);

    /* --- Stirring -------------------------------------------------------- */
    var rpm = num(pick(
      overrides.rpm,
      S.rpm, S.RPM, S.stirRPM, S.stirringRPM, S.stirSpeed, S.stirrerRPM,
      stirrer.rpm, stirrer.speed, app.rpm
    ), 0);
    var stirring = bool(pick(
      S.stirring, S.isStirring, S.stirrerOn, S.magneticStirrer,
      stirrer.on, stirrer.active, app.stirring
    ), rpm > 0);

    if (stirring && rpm <= 0) rpm = 420;
    if (!stirring) rpm = 0;
    rpm = clamp(rpm, 0, 2000);

    /* --- Solution colour + indicator ------------------------------------- */
    var rawColor = pick(
      S.color, S.colour, S.solutionColor, S.solutionColour, S.liquidColor,
      sol.color, sol.colour, vessel.color, S.indicatorColor
    );
    var baseColor = parseColor(rawColor, { r: 150, g: 205, b: 235 });

    var indicator = pick(S.indicator, S.indicatorName, S.pHIndicator, sol.indicator, S.indicatorType);
    var fluidColor = applyIndicator(baseColor, indicator, pH);

    /* --- Turbidity / suspended solids ------------------------------------ */
    var turbidity = num(pick(S.turbidity, S.cloudiness, sol.turbidity), 0);
    turbidity = clamp(turbidity, 0, 1);

    /* --- Gas ------------------------------------------------------------- */
    var gasType = pick(overrides.gasType, S.gasType, S.gas, S.evolvingGas, S.gasName, sol.gasType, S.effervescence);
    var gasRate = num(pick(S.gasRate, S.gasProduction, S.gasIntensity, S.effervescenceRate, S.bubbling), 0);
    if (gasType && gasRate <= 0) gasRate = 0.55;
    if (!gasType) gasRate = 0;
    gasRate = clamp(gasRate, 0, 1.6);

    /* --- Precipitate ------------------------------------------------------ */
    var precipType = pick(overrides.precipType, S.precipitateType, S.precipitate, S.precipitateName, S.solid, sol.precipitate);
    var precipRate = num(pick(S.precipitateRate, S.precipitationRate, S.precipitateAmount), 0);
    if (precipType && precipRate <= 0) precipRate = 0.5;
    if (!precipType) precipRate = 0;
    precipRate = clamp(precipRate, 0, 1.6);

    if (turbidity < precipRate * 0.55) turbidity = Math.min(1, precipRate * 0.55);

    /* --- Metal ion (flame test) ------------------------------------------ */
    var ion = pick(
      S.metalIon, S.flameTestIon, S.flameIon, S.ion, S.cation, S.metal,
      sol.metalIon, sol.ion, S.flameColorIon
    );

    /* --- Boiling ---------------------------------------------------------- */
    var boiling = bool(pick(S.boiling, S.isBoiling), temperature >= 99.5);

    /* --- Hazard / explosion ---------------------------------------------- */
    var explosionValue = num(pick(S.explosion, S.explosionIntensity, S.blast, S.hazard), 0);
    if (typeof S.explosion === 'boolean' && S.explosion) explosionValue = 1.2;

    return {
      volume: volume,
      temperature: temperature,
      pH: pH,
      heating: heating,
      rpm: rpm,
      stirring: stirring,
      baseColor: baseColor,
      fluidColor: fluidColor,
      indicator: indicator,
      turbidity: turbidity,
      ion: ion,
      gasType: gasType,
      gasRate: gasRate,
      precipType: precipType,
      precipRate: precipRate,
      boiling: boiling,
      explosionValue: explosionValue
    };
  }

  /* ==========================================================================
   * 9. SURFACE GEOMETRY
   * ======================================================================== */

  function surfaceYAtU(u) {
    if (!layout) return 0;

    var volFrac = clamp(sim.volume / 500, 0, 1);
    var base = layout.innerBottom - volFrac * (layout.innerBottom - layout.innerTop);

    // Meniscus curvature (concave — edges rise, centre dips)
    var meniscus = Math.sin(u * Math.PI) * 3.4 * clamp(volFrac * 8, 0, 1);

    // Vortex funnel dip
    var dip = sim.vortexDepth * Math.exp(-Math.pow((u - 0.5) / 0.20, 2));

    // Multi-octave surface waves
    var wave =
      Math.sin(u * 9.0 + time * 3.4) * sim.wave +
      Math.sin(u * 15.0 - time * 2.2 + 1.3) * sim.wave * 0.55 +
      Math.sin(u * 23.0 + time * 4.6) * sim.wave * 0.25 +
      Math.sin(u * 37.0 - time * 6.1) * sim.wave * 0.12;

    return base + meniscus + dip + wave;
  }

  function surfaceYAtX(x) {
    if (!layout) return 0;
    var u = clamp((x - layout.innerLeft) / Math.max(1, (layout.innerRight - layout.innerLeft)), 0, 1);
    return surfaceYAtU(u);
  }

  function fluidSurfaceBaseY() {
    var volFrac = clamp(sim.volume / 500, 0, 1);
    return layout.innerBottom - volFrac * (layout.innerBottom - layout.innerTop);
  }

  /* ==========================================================================
   * 10. BACKGROUND
   * ======================================================================== */

  function drawBackground(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#0a101d');
    g.addColorStop(0.48, '#0e1526');
    g.addColorStop(1.00, '#05080f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stage light
    var rg = ctx.createRadialGradient(w * 0.5, h * 0.40, 8, w * 0.5, h * 0.40, Math.max(w, h) * 0.72);
    rg.addColorStop(0.00, 'rgba(84,146,224,0.16)');
    rg.addColorStop(0.45, 'rgba(52,92,164,0.07)');
    rg.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // Faint grid
    ctx.save();
    ctx.strokeStyle = 'rgba(120,170,230,0.045)';
    ctx.lineWidth = 1;
    var step = 44;
    ctx.beginPath();
    for (var x = (w % step) / 2; x < w; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (var y = (h % step) / 2; y < h; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    // Bench surface
    if (layout) {
      var benchY = layout.bottom + layout.burnerGap + clamp(layout.height * 0.13, 26, 60) + 18;
      var bg = ctx.createLinearGradient(0, benchY, 0, benchY + 70);
      bg.addColorStop(0, 'rgba(150,190,240,0.10)');
      bg.addColorStop(0.12, 'rgba(90,130,190,0.05)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, benchY, w, 70);

      ctx.strokeStyle = 'rgba(160,205,255,0.18)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, benchY + 0.5);
      ctx.lineTo(w, benchY + 0.5);
      ctx.stroke();
    }

    // Vignette
    var vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.34, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /* ==========================================================================
   * 11. BEAKER PATHS
   * ======================================================================== */

  function beakerOuterPath(ctx, L) {
    var l = L.left, r = L.right, t = L.top, b = L.bottom, c = L.corner;
    ctx.beginPath();
    ctx.moveTo(l, t);
    ctx.lineTo(l, b - c);
    ctx.quadraticCurveTo(l, b, l + c, b);
    ctx.lineTo(r - c, b);
    ctx.quadraticCurveTo(r, b, r, b - c);
    ctx.lineTo(r, t);
  }

  function beakerInnerPath(ctx, L) {
    var l = L.innerLeft, r = L.innerRight, t = L.innerTop, b = L.innerBottom;
    var c = L.corner * 0.78;
    ctx.beginPath();
    ctx.moveTo(l, t);
    ctx.lineTo(l, b - c);
    ctx.quadraticCurveTo(l, b, l + c, b);
    ctx.lineTo(r - c, b);
    ctx.quadraticCurveTo(r, b, r, b - c);
    ctx.lineTo(r, t);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
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
  }

  /* ==========================================================================
   * 12. BURNER + FLAME
   * ======================================================================== */

  function currentFlameTint() {
    if (overrides.flameColor) {
      var c = parseColor(overrides.flameColor, DEFAULT_FLAME.outer);
      return {
        outer: c,
        mid: lighten(c, 0.34),
        core: lighten(c, 0.72),
        name: 'override'
      };
    }
    return lookupFlameIon(sim.ion);
  }

  function drawBurner(ctx, L) {
    var cx = L.cx;
    var bodyTop = L.burnerTop;
    var bodyH = clamp(L.height * 0.13, 26, 62);
    var bodyW = L.width * 0.30;
    var baseW = L.width * 0.62;
    var baseH = Math.max(7, L.height * 0.032);

    /* --- Base plate ----------------------------------------------------- */
    var baseY = bodyTop + bodyH;
    var bg = ctx.createLinearGradient(0, baseY, 0, baseY + baseH);
    bg.addColorStop(0, '#4c5a6b');
    bg.addColorStop(0.35, '#7d8ea3');
    bg.addColorStop(0.6, '#3d4855');
    bg.addColorStop(1, '#1d242e');
    ctx.fillStyle = bg;
    roundRectPath(ctx, cx - baseW / 2, baseY, baseW, baseH, baseH * 0.4);
    ctx.fill();

    ctx.fillStyle = 'rgba(180,215,255,0.16)';
    roundRectPath(ctx, cx - baseW / 2 + 2, baseY + 1.2, baseW - 4, baseH * 0.28, baseH * 0.2);
    ctx.fill();

    /* --- Barrel --------------------------------------------------------- */
    var bg2 = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
    bg2.addColorStop(0.00, '#2b333e');
    bg2.addColorStop(0.16, '#68788c');
    bg2.addColorStop(0.42, '#9db0c6');
    bg2.addColorStop(0.62, '#5d6c80');
    bg2.addColorStop(0.86, '#39434f');
    bg2.addColorStop(1.00, '#20262f');
    ctx.fillStyle = bg2;
    roundRectPath(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, 4);
    ctx.fill();

    /* --- Collar --------------------------------------------------------- */
    var collarH = Math.max(4, bodyH * 0.16);
    var cg = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
    cg.addColorStop(0, '#2a323c');
    cg.addColorStop(0.4, '#8b9db2');
    cg.addColorStop(0.6, '#6a7a8e');
    cg.addColorStop(1, '#232a33');
    ctx.fillStyle = cg;
    roundRectPath(ctx, cx - bodyW * 0.58, bodyTop - collarH * 0.5, bodyW * 1.16, collarH, 2);
    ctx.fill();

    /* --- Air holes ------------------------------------------------------ */
    ctx.fillStyle = 'rgba(10,14,20,0.75)';
    for (var i = 0; i < 3; i++) {
      var hy = bodyTop + bodyH * (0.42 + i * 0.15);
      ctx.beginPath();
      ctx.ellipse(cx, hy, bodyW * 0.10, Math.max(1, bodyH * 0.028), 0, 0, TAU);
      ctx.fill();
    }

    /* --- Flame ---------------------------------------------------------- */
    if (sim.heating) drawFlame(ctx, L, bodyTop);
  }

  function drawFlame(ctx, L, burnerTopY) {
    var tint = currentFlameTint();
    var cx = L.cx;

    var baseY = burnerTopY - 1;
    var tipY = L.bottom + 3;
    var height = Math.max(24, baseY - tipY);

    // Flicker
    var f1 = Math.sin(time * 12.7) * 0.5 + Math.sin(time * 21.3 + 1.1) * 0.3 + Math.sin(time * 7.9 + 2.4) * 0.2;
    var f2 = Math.sin(time * 17.3 + 0.7) * 0.5 + Math.sin(time * 29.1 + 2.9) * 0.5;

    var wob = f1 * L.width * 0.035;
    var halfW = L.width * 0.15 * (1 + f2 * 0.06);

    // Thermal glow behind
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glowR = height * 1.35;
    var gg = ctx.createRadialGradient(cx, baseY - height * 0.35, 2, cx, baseY - height * 0.35, glowR);
    gg.addColorStop(0, rgba(tint.mid, 0.34));
    gg.addColorStop(0.38, rgba(tint.outer, 0.16));
    gg.addColorStop(1, rgba(tint.outer, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(cx - glowR, baseY - height * 0.35 - glowR, glowR * 2, glowR * 2);
    ctx.restore();

    // --- Outer flame
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(tint.outer, 0.55);
    flamePath(ctx, cx + wob * 0.6, baseY, tipY, halfW, height, f1);
    ctx.fill();

    // --- Mid flame
    ctx.fillStyle = rgba(tint.mid, 0.72);
    flamePath(ctx, cx + wob * 0.4, baseY - height * 0.03, tipY + height * 0.13, halfW * 0.63, height * 0.86, f2);
    ctx.fill();

    // --- Inner core
    ctx.fillStyle = rgba(tint.core, 0.88);
    flamePath(ctx, cx + wob * 0.2, baseY - height * 0.06, tipY + height * 0.32, halfW * 0.29, height * 0.66, f1 * 0.6);
    ctx.fill();

    // --- Blue combustion base cone
    ctx.fillStyle = 'rgba(120,190,255,0.42)';
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.85, baseY);
    ctx.quadraticCurveTo(cx - halfW * 0.4, baseY - height * 0.24, cx, baseY - height * 0.28);
    ctx.quadraticCurveTo(cx + halfW * 0.4, baseY - height * 0.24, cx + halfW * 0.85, baseY);
    ctx.quadraticCurveTo(cx, baseY + halfW * 0.22, cx - halfW * 0.85, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function flamePath(ctx, cx, baseY, tipY, halfW, height, wobble) {
    var wob = wobble * halfW * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);

    // Left side up to tip
    ctx.bezierCurveTo(
      cx - halfW * 1.12, baseY - height * 0.40,
      cx - halfW * 0.62 + wob, tipY + height * 0.28,
      cx + wob * 1.5, tipY
    );
    // Right side back down
    ctx.bezierCurveTo(
      cx + halfW * 0.62 + wob, tipY + height * 0.28,
      cx + halfW * 1.12, baseY - height * 0.40,
      cx + halfW, baseY
    );
    // Rounded base
    ctx.quadraticCurveTo(cx, baseY + halfW * 0.42, cx - halfW, baseY);
    ctx.closePath();
  }

  /* ==========================================================================
   * 13. BEAKER — BACK GLASS
   * ======================================================================== */

  function drawBeakerBack(ctx, L) {
    ctx.save();
    beakerInnerPath(ctx, L);

    var g = ctx.createLinearGradient(L.innerLeft, 0, L.innerRight, 0);
    g.addColorStop(0.00, 'rgba(150,195,240,0.055)');
    g.addColorStop(0.30, 'rgba(200,230,255,0.028)');
    g.addColorStop(0.70, 'rgba(200,230,255,0.022)');
    g.addColorStop(1.00, 'rgba(150,195,240,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(L.innerLeft, L.innerTop, L.innerRight - L.innerLeft, L.innerBottom - L.innerTop);

    ctx.restore();

    // Back wall inner shadow line
    ctx.save();
    beakerInnerPath(ctx, L);
    ctx.strokeStyle = 'rgba(190,225,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /* ==========================================================================
   * 14. FLUID
   * ======================================================================== */

  function drawFluid(ctx, L) {
    if (sim.volume <= 0.5) return;

    var volFrac = clamp(sim.volume / 500, 0, 1);
    var baseY = L.innerBottom - volFrac * (L.innerBottom - L.innerTop);
    var segments = 34;
    var i, u, x, y;

    ctx.save();
    beakerInnerPath(ctx, L);
    ctx.clip();

    // --- Body path
    ctx.beginPath();
    ctx.moveTo(L.innerLeft, L.innerBottom);
    for (i = 0; i <= segments; i++) {
      u = i / segments;
      x = lerp(L.innerLeft, L.innerRight, u);
      y = surfaceYAtU(u);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(L.innerRight, L.innerBottom);
    ctx.closePath();

    var col = sim.fluidColor;
    var alpha = sim.fluidAlpha;

    var grad = ctx.createLinearGradient(0, baseY, 0, L.innerBottom);
    grad.addColorStop(0.00, rgba(lighten(col, 0.20), alpha * 0.92));
    grad.addColorStop(0.28, rgba(col, alpha * 0.98));
    grad.addColorStop(0.72, rgba(scaleColor(col, 0.86), alpha));
    grad.addColorStop(1.00, rgba(darken(col, 0.34), alpha));
    ctx.fillStyle = grad;
    ctx.fill();

    // --- Glass curvature overlay (darker edges, bright centre-left)
    var cv = ctx.createLinearGradient(L.innerLeft, 0, L.innerRight, 0);
    cv.addColorStop(0.00, 'rgba(0,0,0,0.26)');
    cv.addColorStop(0.12, 'rgba(255,255,255,0.09)');
    cv.addColorStop(0.34, 'rgba(255,255,255,0.02)');
    cv.addColorStop(0.62, 'rgba(0,0,0,0.03)');
    cv.addColorStop(0.88, 'rgba(255,255,255,0.07)');
    cv.addColorStop(1.00, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = cv;
    ctx.fill();

    // --- Turbidity veil
    if (sim.turbidity > 0.01) {
      ctx.fillStyle = 'rgba(248,250,255,' + (0.20 * sim.turbidity) + ')';
      ctx.fill();
    }

    // --- Depth shading near the bottom
    var dg = ctx.createLinearGradient(0, L.innerBottom - (L.innerBottom - baseY) * 0.32, 0, L.innerBottom);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(1, 'rgba(0,10,25,0.22)');
    ctx.fillStyle = dg;
    ctx.fill();

    // --- Surface highlight line
    ctx.beginPath();
    for (i = 0; i <= segments; i++) {
      u = i / segments;
      x = lerp(L.innerLeft, L.innerRight, u);
      y = surfaceYAtU(u);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(lighten(col, 0.72), 0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Secondary caustic highlight
    ctx.beginPath();
    for (i = 0; i <= segments; i++) {
      u = i / segments;
      x = lerp(L.innerLeft, L.innerRight, u);
      y = surfaceYAtU(u) + 2.6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(lighten(col, 0.95), 0.18);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.restore();
  }

  /* ==========================================================================
   * 15. STIRRER BAR + VORTEX
   * ======================================================================== */

  function drawStirBar(ctx, L) {
    var active = sim.rpm > 1;
    var y = L.innerBottom - Math.max(4, L.height * 0.018);
    var barLen = L.width * 0.36;
    var barThick = Math.max(3.2, L.height * 0.014);

    var foreshorten = active ? Math.abs(Math.cos(stirPhase)) : 0.92;
    var rx = Math.max(barLen * 0.10, (barLen * 0.5) * foreshorten);
    var ry = barThick * 0.5;

    ctx.save();
    beakerInnerPath(ctx, L);
    ctx.clip();

    // Contact shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.ellipse(L.cx, y + barThick * 0.5, rx * 1.06, ry * 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bar body
    var bg = ctx.createLinearGradient(L.cx - rx, 0, L.cx + rx, 0);
    bg.addColorStop(0.00, '#c9d4e0');
    bg.addColorStop(0.28, '#ffffff');
    bg.addColorStop(0.55, '#e2eaf3');
    bg.addColorStop(0.80, '#9aa8b8');
    bg.addColorStop(1.00, '#6d7a8a');

    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(L.cx, y, rx, ry, 0, 0, TAU);
    ctx.fill();

    // White PTFE centre band
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(L.cx, y - ry * 0.15, rx * 0.44, ry * 0.62, 0, 0, TAU);
    ctx.fill();

    // Rotation smear when spinning fast
    if (active && sim.rpm > 180) {
      var sm = clamp(sim.rpm / 900, 0, 0.5);
      ctx.globalAlpha = sm;
      ctx.strokeStyle = 'rgba(230,245,255,0.7)';
      ctx.lineWidth = 1.2;
      for (var s = 0; s < 3; s++) {
        ctx.beginPath();
        ctx.ellipse(L.cx, y, rx * (1 + s * 0.10), ry * (1 + s * 0.35), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawVortex(ctx, L) {
    if (sim.vortexDepth < 0.4) return;

    var intensity = clamp(sim.vortexDepth / 20, 0, 1);
    var segments = 30;
    var i, u, x, y;

    ctx.save();
    beakerInnerPath(ctx, L);
    ctx.clip();

    ctx.globalCompositeOperation = 'lighter';

    // Swirl arcs layered just under the surface
    for (var ring = 0; ring < 4; ring++) {
      var depth = 6 + ring * 13;
      var alpha = (0.20 - ring * 0.038) * intensity;
      if (alpha <= 0.002) continue;

      ctx.beginPath();
      for (i = 0; i <= segments; i++) {
        u = i / segments;
        x = lerp(L.innerLeft + 6, L.innerRight - 6, u);
        var surf = surfaceYAtU(u);
        y = surf + depth + Math.sin(u * 11 + stirPhase * (2 + ring) + ring * 1.7) * (3 + ring * 2.2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(226,244,255,' + alpha + ')';
      ctx.lineWidth = 1.4 + ring * 0.5;
      ctx.stroke();
    }

    // Central funnel column
    var cx = L.cx;
    var topY = surfaceYAtU(0.5);
    var funnelH = sim.vortexDepth * 2.6;
    var fg = ctx.createLinearGradient(cx, topY, cx, topY + funnelH);
    fg.addColorStop(0, 'rgba(255,255,255,0.20)');
    fg.addColorStop(0.5, 'rgba(190,230,255,0.10)');
    fg.addColorStop(1, 'rgba(120,180,240,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(cx - L.width * 0.13, topY);
    ctx.quadraticCurveTo(cx - L.width * 0.05, topY + funnelH * 0.55, cx, topY + funnelH);
    ctx.quadraticCurveTo(cx + L.width * 0.05, topY + funnelH * 0.55, cx + L.width * 0.13, topY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ==========================================================================
   * 16. BEAKER — FRONT GLASS, TICKS, LABELS
   * ======================================================================== */

  function drawBeakerFront(ctx, L) {
    var i;

    /* --- Spout (pour lip on the right) ---------------------------------- */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(L.right - L.width * 0.16, L.top);
    ctx.quadraticCurveTo(L.right + L.width * 0.03, L.top - L.height * 0.035, L.right + L.width * 0.10, L.top - L.height * 0.012);
    ctx.quadraticCurveTo(L.right + L.width * 0.01, L.top + L.height * 0.012, L.right, L.top + L.wall * 0.5);
    ctx.strokeStyle = 'rgba(215,240,255,0.72)';
    ctx.lineWidth = Math.max(2, L.wall * 0.62);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    /* --- Outer glass edge ------------------------------------------------ */
    ctx.save();
    beakerOuterPath(ctx, L);
    var eg = ctx.createLinearGradient(L.left, 0, L.right, 0);
    eg.addColorStop(0.00, 'rgba(170,215,255,0.50)');
    eg.addColorStop(0.09, 'rgba(238,250,255,0.90)');
    eg.addColorStop(0.30, 'rgba(150,192,232,0.34)');
    eg.addColorStop(0.70, 'rgba(150,192,232,0.30)');
    eg.addColorStop(0.91, 'rgba(238,250,255,0.85)');
    eg.addColorStop(1.00, 'rgba(170,215,255,0.50)');
    ctx.strokeStyle = eg;
    ctx.lineWidth = Math.max(2, L.wall * 0.72);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    /* --- Top rim ellipse -------------------------------------------------- */
    ctx.save();
    var rimRy = Math.max(3.5, L.width * 0.030);
    ctx.beginPath();
    ctx.ellipse(L.cx, L.top, L.width * 0.5, rimRy, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(222,244,255,0.72)';
    ctx.lineWidth = Math.max(1.6, L.wall * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(L.cx, L.top, L.width * 0.5 - L.wall * 0.5, rimRy * 0.72, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(180,220,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    /* --- Left specular highlight ----------------------------------------- */
    ctx.save();
    var hlX = L.left + L.wall * 0.85;
    var hlW = L.width * 0.115;
    var hlGrad = ctx.createLinearGradient(hlX, 0, hlX + hlW, 0);
    hlGrad.addColorStop(0.00, 'rgba(255,255,255,0.30)');
    hlGrad.addColorStop(0.45, 'rgba(255,255,255,0.13)');
    hlGrad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    roundRectPath(ctx, hlX, L.top + L.height * 0.055, hlW, L.height * 0.87, hlW * 0.5);
    ctx.fill();
    ctx.restore();

    /* --- Right specular highlight (thinner) ------------------------------ */
    ctx.save();
    var hrW = L.width * 0.055;
    var hrX = L.right - L.wall * 0.9 - hrW;
    var hrGrad = ctx.createLinearGradient(hrX + hrW, 0, hrX, 0);
    hrGrad.addColorStop(0.00, 'rgba(255,255,255,0.24)');
    hrGrad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = hrGrad;
    roundRectPath(ctx, hrX, L.top + L.height * 0.10, hrW, L.height * 0.78, hrW * 0.5);
    ctx.fill();
    ctx.restore();

    /* --- Graduation ticks ------------------------------------------------ */
    ctx.save();
    ctx.lineCap = 'round';

    var tickFontSize = Math.max(9, Math.round(L.width * 0.072));
    ctx.font = '600 ' + tickFontSize + 'px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (var v = 50; v <= 500; v += 50) {
      var major = (v % 100 === 0);
      var ty = volToY(L, v);

      if (ty < L.innerTop + 2 || ty > L.innerBottom - 2) continue;

      var x0 = L.innerLeft + 3.5;
      var len = major ? L.width * 0.145 : L.width * 0.082;

      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x0 + len, ty);
      ctx.strokeStyle = major ? 'rgba(228,246,255,0.68)' : 'rgba(198,224,246,0.34)';
      ctx.lineWidth = major ? 1.7 : 1;
      ctx.stroke();

      if (major) {
        ctx.fillStyle = 'rgba(224,242,255,0.78)';
        ctx.fillText(String(v), x0 + len + 5, ty);
      }

      // Short right-side ticks (no labels)
      var rx0 = L.innerRight - 3.5;
      var rlen = major ? L.width * 0.085 : L.width * 0.05;
      ctx.beginPath();
      ctx.moveTo(rx0, ty);
      ctx.lineTo(rx0 - rlen, ty);
      ctx.strokeStyle = major ? 'rgba(228,246,255,0.48)' : 'rgba(198,224,246,0.22)';
      ctx.lineWidth = major ? 1.4 : 0.9;
      ctx.stroke();
    }

    /* --- Unit label ------------------------------------------------------- */
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,230,255,0.42)';
    ctx.font = '700 ' + Math.max(9, Math.round(L.width * 0.078)) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('mL', L.innerLeft + L.width * 0.145 + 30, volToY(L, 500) - L.height * 0.045);

    ctx.restore();

    /* --- Base shadow ------------------------------------------------------ */
    ctx.save();
    var shGrad = ctx.createRadialGradient(L.cx, L.bottom + 4, 2, L.cx, L.bottom + 4, L.width * 0.78);
    shGrad.addColorStop(0, 'rgba(0,0,0,0.42)');
    shGrad.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    shGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.bottom + 4, L.width * 0.78, Math.max(6, L.height * 0.045), 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* --- Beaker bottom rim ------------------------------------------------ */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(L.left, L.bottom);
    ctx.lineTo(L.right, L.bottom);
    ctx.strokeStyle = 'rgba(210,238,255,0.45)';
    ctx.lineWidth = Math.max(1.6, L.wall * 0.5);
    ctx.stroke();
    ctx.restore();

    /* --- Heat shimmer when heating ---------------------------------------- */
    if (sim.heating) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var heatAlpha = 0.05 + 0.035 * Math.sin(time * 6.1);
      var hg = ctx.createLinearGradient(0, L.bottom, 0, L.bottom + L.burnerGap);
      hg.addColorStop(0, 'rgba(255,190,110,' + heatAlpha + ')');
      hg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(L.left, L.bottom, L.width, L.burnerGap);
      ctx.restore();
    }

    /* --- Liquid level glow ------------------------------------------------ */
    if (sim.volume > 1) {
      var sy = surfaceYAtU(0.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lg = ctx.createLinearGradient(0, sy - 12, 0, sy + 12);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, rgba(lighten(sim.fluidColor, 0.6), 0.07));
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(L.innerLeft, sy - 12, L.innerRight - L.innerLeft, 24);
      ctx.restore();
    }
  }

  /* ==========================================================================
   * 17. PARTICLE EMISSION ORCHESTRATION
   * ======================================================================== */

  function emitAmbient(dt, L) {
    if (sim.volume <= 1) return;

    var surfaceBase = fluidSurfaceBaseY();
    var left = L.innerLeft + L.width * 0.12;
    var right = L.innerRight - L.width * 0.12;

    /* --- Reaction gas ---------------------------------------------------- */
    if (sim.gasRate > 0 && sim.gasType) {
      var style = lookupGas(sim.gasType);
      var perSec = 44 * sim.gasRate;
      particles._gasAccum += perSec * dt;

      var budget = 14;
      while (particles._gasAccum >= 1 && budget-- > 0) {
        particles._gasAccum -= 1;
        var gx = rnd(left, right);
        var gy = surfaceYAtX(gx) - rnd(0, 3);
        particles.emitGas(gx, gy, style, sim.gasRate);
      }
      if (particles._gasAccum > 40) particles._gasAccum = 0;
    } else {
      particles._gasAccum *= (1 - Math.min(1, 4 * dt));
    }

    /* --- Boiling steam + bubbles ----------------------------------------- */
    if (sim.boiling && sim.temperature > 96) {
      var heat = clamp((sim.temperature - 96) / 24, 0, 1);

      particles._steamAccum += (34 * (0.35 + heat)) * dt;
      var sBudget = 10;
      while (particles._steamAccum >= 1 && sBudget-- > 0) {
        particles._steamAccum -= 1;
        var sx = rnd(left, right);
        particles.emitGas(sx, surfaceYAtX(sx) - rnd(0, 6), GAS_STYLES.steam, 0.5 + heat);
      }
      if (particles._steamAccum > 30) particles._steamAccum = 0;

      particles._bubbleAccum += (28 * (0.3 + heat)) * dt;
      var bBudget = 8;
      while (particles._bubbleAccum >= 1 && bBudget-- > 0) {
        particles._bubbleAccum -= 1;
        var bx = rnd(left, right);
        particles.emitBubble(bx, L.innerBottom - rnd(2, 10), rnd(2.0, 4.8), 1.25);
      }
      if (particles._bubbleAccum > 24) particles._bubbleAccum = 0;
    } else {
      particles._steamAccum *= (1 - Math.min(1, 4 * dt));
      particles._bubbleAccum *= (1 - Math.min(1, 4 * dt));
    }

    /* --- Effervescence bubbles -------------------------------------------- */
    if (sim.gasRate > 0) {
      var effRate = 22 * sim.gasRate;
      if (Math.random() < effRate * dt) {
        var ex = rnd(left, right);
        particles.emitBubble(ex, L.innerBottom - rnd(2, 12), rnd(1.4, 3.4), 1.0);
      }
    }

    /* --- Precipitate ------------------------------------------------------ */
    if (sim.precipRate > 0 && sim.precipType) {
      var pstyle = lookupPrecip(sim.precipType);
      particles._precipAccum += (26 * sim.precipRate) * dt;
      var pBudget = 8;
      while (particles._precipAccum >= 1 && pBudget-- > 0) {
        particles._precipAccum -= 1;
        var px = rnd(left, right);
        var py = surfaceYAtX(px) + rnd(4, 26);
        particles.emitPrecipitate(px, py, pstyle, sim.precipRate);
      }
      if (particles._precipAccum > 20) particles._precipAccum = 0;
    } else {
      particles._precipAccum *= (1 - Math.min(1, 4 * dt));
    }
  }

  /* ==========================================================================
   * 18. STATE UPDATE
   * ======================================================================== */

  function updateSimulation(dt) {
    var s = readEngineState();

    /* --- Volume change → surface splash wave ----------------------------- */
    if (prevVolume !== null) {
      var delta = s.volume - prevVolume;
      if (delta > 0.6) {
        sim.wave = Math.min(9, sim.wave + delta * 0.085);
      } else if (delta < -0.6) {
        sim.wave = Math.min(9, sim.wave + Math.abs(delta) * 0.05);
      }
    }
    prevVolume = s.volume;

    sim.volume = s.volume;
    sim.temperature = s.temperature;
    sim.pH = s.pH;
    sim.heating = s.heating;
    sim.rpm = s.rpm;
    sim.stirring = s.stirring;
    sim.baseColor = s.baseColor;
    sim.indicator = s.indicator;
    sim.ion = s.ion;
    sim.gasType = s.gasType;
    sim.gasRate = s.gasRate;
    sim.precipType = s.precipType;
    sim.precipRate = s.precipRate;
    sim.boiling = s.boiling;

    /* --- Fluid colour (smoothed for a natural transition) ---------------- */
    var target = s.fluidColor;
    sim.fluidColor = mixColor(sim.fluidColor, target, clamp(dt * 3.2, 0, 1));

    /* --- Fluid opacity from concentration / turbidity --------------------- */
    var targetAlpha = 0.44 + clamp(s.volume / 500, 0, 1) * 0.16 + s.turbidity * 0.30;
    sim.fluidAlpha = lerp(sim.fluidAlpha, clamp(targetAlpha, 0.28, 0.94), clamp(dt * 2.6, 0, 1));
    sim.turbidity = lerp(sim.turbidity, clamp(s.turbidityTarget !== undefined ? s.turbidityTarget : s.turbidity, 0, 1), clamp(dt * 2.0, 0, 1));
    sim.turbidity = s.turbidity;

    /* --- Wave amplitude decay + stirring maintenance ----------------------- */
    sim.wave *= Math.exp(-2.4 * dt);
    if (sim.stirring) {
      var stirWave = clamp(sim.rpm / 1200, 0, 1) * 5.2;
      sim.wave = Math.max(sim.wave, stirWave);
    }
    sim.wave = clamp(sim.wave, 0, 11);

    /* --- Vortex depth ------------------------------------------------------ */
    var targetVortex = sim.stirring ? clamp(sim.rpm / 900, 0, 1) * 17 : 0;
    sim.vortexDepth = lerp(sim.vortexDepth, targetVortex, clamp(dt * 2.6, 0, 1));

    /* --- Stir phase -------------------------------------------------------- */
    if (sim.rpm > 0) {
      stirPhase += dt * (sim.rpm / 60) * TAU * 0.5;
      if (stirPhase > TAU * 1000) stirPhase -= TAU * 1000;
    }

    /* --- Explosion auto-trigger from engine -------------------------------- */
    var exVal = s.explosionValue;
    if (exVal > 0.05 && explosionArmed && !prevExplosionFlag) {
      var I = clamp(exVal, 0.2, 3);
      CanvasRenderer.triggerExplosion(I);
      explosionArmed = false;
    }
    if (exVal <= 0.05) explosionArmed = true;
    prevExplosionFlag = exVal > 0.05;

    /* --- Random ambient instability during violent boiling ---------------- */
    if (sim.temperature > 130 && Math.random() < dt * 0.35) {
      fx.shake = Math.max(fx.shake, 0.06);
    }

    /* --- Particle updates -------------------------------------------------- */
    var env = {
      innerLeft: layout.innerLeft,
      innerRight: layout.innerRight,
      innerTop: layout.innerTop,
      innerBottom: layout.innerBottom,
      canvasW: cssW,
      canvasH: cssH,
      surfaceAtX: surfaceYAtX,
      onBubblePop: null
    };

    particles.update(dt, env);
    emitAmbient(dt, layout);
    fx.update(dt);
  }

  /* ==========================================================================
   * 19. RENDER PIPELINE
   * ======================================================================== */

  function render() {
    if (!ctx || !canvas) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    layout = computeLayout(cssW, cssH);

    drawBackground(ctx, cssW, cssH);

    var shake = fx.getShakeOffset();

    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 1. Burner + flame (behind the glass)
    drawBurner(ctx, layout);

    // 2. Beaker back glass
    drawBeakerBack(ctx, layout);

    // 3. Fluid body
    drawFluid(ctx, layout);

    // 4. Beaker interior contents (sediment, stir bar, inner particles)
    ctx.save();
    beakerInnerPath(ctx, layout);
    ctx.clip();

    particles.drawSediment(ctx, layout);
    drawStirBar(ctx, layout);
    particles.drawInside(ctx, layout);

    ctx.restore();

    // 5. Vortex overlay (clipped internally)
    drawVortex(ctx, layout);

    // 6. Front glass, ticks, labels
    drawBeakerFront(ctx, layout);

    // 7. Exterior particles (gas, smoke, sparks)
    particles.drawOutside(ctx, layout);

    // 8. Explosion world FX (shockwaves, blast glow)
    fx.drawWorld(ctx);

    ctx.restore();

    // 9. Full-screen flash (unaffected by shake)
    fx.drawScreenFlash(ctx, cssW, cssH);

    // 10. Ambient occlusion corner darkening when flashing
    ctx.globalAlpha = 1;
  }

  /* ==========================================================================
   * 20. ANIMATION LOOP
   * ======================================================================== */

  function animate(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(animate);

    if (!lastTimestamp) lastTimestamp = ts;
    var dt = (ts - lastTimestamp) / 1000;
    lastTimestamp = ts;

    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    time += dt;

    if (!layout) layout = computeLayout(cssW, cssH);

    updateSimulation(dt);
    render();
  }

  /* ==========================================================================
   * 21. CANVAS LIFECYCLE / DPI
   * ======================================================================== */

  function measureCanvas() {
    if (!canvas) return;

    var rect = null;
    if (typeof canvas.getBoundingClientRect === 'function') {
      rect = canvas.getBoundingClientRect();
    }

    var w = (rect && rect.width > 0) ? rect.width : (canvas.clientWidth || 0);
    var h = (rect && rect.height > 0) ? rect.height : (canvas.clientHeight || 0);

    if (!w || !h) {
      // Fall back to attributes, then to parent, then to defaults.
      w = num(canvas.width, 0) || 800;
      h = num(canvas.height, 0) || 600;
      if (canvas.parentElement) {
        var pr = canvas.parentElement.getBoundingClientRect();
        if (pr && pr.width > 0) w = pr.width;
        if (pr && pr.height > 0) h = pr.height;
      }
    }

    cssW = Math.max(200, Math.round(w));
    cssH = Math.max(200, Math.round(h));

    dpr = Math.min(global.devicePixelRatio || 1, 3);

    var targetW = Math.round(cssW * dpr);
    var targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    layout = computeLayout(cssW, cssH);
  }

  function handleResize() {
    if (!canvas) return;
    measureCanvas();
  }

  /* ==========================================================================
   * 22. PUBLIC API
   * ======================================================================== */

  var CanvasRenderer = {
    version: '1.0.0',
    canvas: null,
    ctx: null,

    /* ---- init ----------------------------------------------------------- */
    init: function (canvasElement) {
      var el = canvasElement;

      if (typeof el === 'string') {
        el = document.getElementById(el) || document.querySelector(el);
      }

      if (!el || typeof el.getContext !== 'function') {
        console.warn('[CanvasRenderer] init() requires a <canvas> element.');
        return false;
      }

      canvas = el;
      ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

      if (!ctx) {
        console.warn('[CanvasRenderer] 2D context unavailable.');
        return false;
      }

      this.canvas = canvas;
      this.ctx = ctx;

      measureCanvas();

      // Seed defaults from the engine, then start the loop.
      try {
        var s0 = readEngineState();
        sim.volume = s0.volume;
        sim.fluidColor = s0.fluidColor;
        sim.baseColor = s0.baseColor;
        sim.temperature = s0.temperature;
        sim.pH = s0.pH;
        prevVolume = s0.volume;
      } catch (e) { /* keep defaults */ }

      if (typeof global.addEventListener === 'function') {
        global.addEventListener('resize', handleResize, { passive: true });
        global.addEventListener('orientationchange', handleResize, { passive: true });
      }

      if (typeof global.ResizeObserver === 'function' && canvas.parentElement) {
        try {
          resizeObserver = new global.ResizeObserver(handleResize);
          resizeObserver.observe(canvas.parentElement);
        } catch (e) { resizeObserver = null; }
      }

      if (!running) {
        running = true;
        lastTimestamp = 0;
        rafId = requestAnimationFrame(animate);
      }

      return true;
    },

    /* ---- explosion ------------------------------------------------------ */
    triggerExplosion: function (intensity) {
      if (!layout) layout = computeLayout(cssW, cssH);
      fx.trigger(intensity === undefined ? 1 : intensity, layout.cx, layout.bottom - layout.height * 0.18, particles);
      return this;
    },

    /* ---- flame colour --------------------------------------------------- */
    setFlameColor: function (color) {
      overrides.flameColor = color || null;
      return this;
    },

    clearFlameColor: function () {
      overrides.flameColor = null;
      return this;
    },

    /* ---- manual overrides ----------------------------------------------- */
    setGasType: function (type) {
      overrides.gasType = type || null;
      return this;
    },

    setPrecipitateType: function (type) {
      overrides.precipType = type || null;
      return this;
    },

    setVolume: function (ml) {
      overrides.volume = (ml === null || ml === undefined) ? null : clamp(num(ml, 250), 0, 500);
      return this;
    },

    setHeating: function (on) {
      overrides.heating = (on === null || on === undefined) ? null : !!on;
      return this;
    },

    setRPM: function (rpm) {
      overrides.rpm = (rpm === null || rpm === undefined) ? null : clamp(num(rpm, 0), 0, 2000);
      return this;
    },

    /* ---- introspection --------------------------------------------------- */
    getVolume: function () { return sim.volume; },
    getState: function () {
      return {
        volume: sim.volume,
        temperature: sim.temperature,
        pH: sim.pH,
        heating: sim.heating,
        rpm: sim.rpm,
        fluidColor: { r: sim.fluidColor.r, g: sim.fluidColor.g, b: sim.fluidColor.b },
        turbidity: sim.turbidity,
        wave: sim.wave,
        vortexDepth: sim.vortexDepth,
        particles: particles.particles.length,
        sediment: particles.sediment.length
      };
    },

    /* ---- particle helpers ------------------------------------------------ */
    spawnGas: function (type, count, x, y) {
      var style = lookupGas(type);
      var n = Math.max(1, count || 12);
      var sx = (x === undefined) ? (layout ? rnd(layout.innerLeft + 20, layout.innerRight - 20) : 0) : x;
      var sy = (y === undefined) ? surfaceYAtX(sx) : y;
      for (var i = 0; i < n; i++) particles.emitGas(sx, sy, style, 0.8);
      return this;
    },

    spawnBubbles: function (count) {
      if (!layout) return this;
      var n = Math.max(1, count || 12);
      for (var i = 0; i < n; i++) {
        var bx = rnd(layout.innerLeft + 12, layout.innerRight - 12);
        particles.emitBubble(bx, layout.innerBottom - rnd(2, 10), rnd(1.6, 4.2), 1);
      }
      return this;
    },

    spawnPrecipitate: function (type, count) {
      if (!layout) return this;
      var style = lookupPrecip(type);
      var n = Math.max(1, count || 20);
      for (var i = 0; i < n; i++) {
        var px = rnd(layout.innerLeft + 12, layout.innerRight - 12);
        particles.emitPrecipitate(px, surfaceYAtX(px) + rnd(4, 30), style, 1);
      }
      return this;
    },

    spawnSparks: function (count, x, y) {
      if (!layout) return this;
      var n = Math.max(1, count || 24);
      var sx = (x === undefined) ? layout.cx : x;
      var sy = (y === undefined) ? (layout.bottom - layout.height * 0.3) : y;
      for (var i = 0; i < n; i++) particles.emitSpark(sx, sy, {});
      return this;
    },

    /* ---- lifecycle ------------------------------------------------------- */
    pause: function () {
      if (!running) return this;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      return this;
    },

    resume: function () {
      if (running) return this;
      if (!canvas) return this;
      running = true;
      lastTimestamp = 0;
      rafId = requestAnimationFrame(animate);
      return this;
    },

    clearParticles: function () {
      particles.clear();
      return this;
    },

    onResize: function () {
      handleResize();
      return this;
    },

    destroy: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;

      if (typeof global.removeEventListener === 'function') {
        global.removeEventListener('resize', handleResize);
        global.removeEventListener('orientationchange', handleResize);
      }

      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (e) { /* ignore */ }
        resizeObserver = null;
      }

      particles.clear();
      fx.waves.length = 0;
      canvas = null;
      ctx = null;
      this.canvas = null;
      this.ctx = null;

      return this;
    }
  };

  /* ==========================================================================
   * 23. AUTO-BOOT
   * ======================================================================== */

  global.CanvasRenderer = CanvasRenderer;

  if (typeof document !== 'undefined') {
    var boot = function () {
      var auto = document.querySelector('canvas[data-virtualab], canvas#labCanvas, canvas#canvas, canvas.virtualab-canvas');
      if (auto && !CanvasRenderer.canvas) {
        CanvasRenderer.init(auto);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

})(typeof window !== 'undefined' ? window : this);
