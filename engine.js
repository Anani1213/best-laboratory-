/* ============================================================================
 * VirtuaLab Pro — engine.js
 * ----------------------------------------------------------------------------
 * Physical Chemistry & Reaction Logic Engine
 * Author: VirtuaLab Pro Computational Chemistry Core
 * ----------------------------------------------------------------------------
 * EXPORTS: window.ChemistryEngine  (singleton instance)
 *
 * RESPONSIBILITIES
 *   • Precise dynamic pH from first-principles ion charge balance
 *     (pH = -log10[H+], Kw = 1e-14, bisection on log[H+])
 *   • Pure-state logic: dry vessel = neutral (pH 7.00), zero solutes
 *   • Alkali metal + H2O reaction gating (inert when waterVolume === 0)
 *   • Bunsen burner thermodynamics:  q = m·c·ΔT  +  latent vaporization
 *   • Acid/base neutralization, carbonate+acid, metal+acid displacement,
 *     precipitation, single-replacement redox
 *   • Auto unit mapping: solid species => grams; liquid/aqueous => mL
 *   • Telemetry builder consumed by app.js readouts
 *
 * DEPENDS ON: window.ChemicalsDB  (must be loaded first)
 * ==========================================================================*/

(function (global) {
  'use strict';

  const DB = global.ChemicalsDB;
  if (!DB) {
    console.error('[ChemistryEngine] Fatal: window.ChemicalsDB not loaded.');
    return;
  }

  const VERSION = '1.0.0';

  /* ==========================================================================
   * 1. PHYSICAL CONSTANTS
   * ========================================================================*/
  const KW_25           = 1e-14;    // water ion product @ 25 °C
  const WATER_CP        = 4.184;    // J / (g·K)
  const WATER_LH_VAP    = 2260;     // J / g
  const WATER_DENSITY   = 1.000;    // g / mL
  const WATER_MM        = 18.015;   // g / mol
  const VESSEL_CAPACITY = 500;      // mL
  const AMBIENT_T       = 22;       // °C
  const BURNER_MAX_W    = 2200;     // W
  const HEAT_LOSS_K     = 3.5;      // W / K
  const MAX_T           = 1300;     // °C
  const EPS             = 1e-12;

  /* ==========================================================================
   * 2. ION CLASSIFICATION TABLE (drives the charge-balance pH solver)
   * --------------------------------------------------------------------------
   * type: 'h' | 'oh' | 'spectator' | 'weak_acid_cation' | 'weak_base_anion'
   * ========================================================================*/
  const ION_DB = {
    'H+'     : { charge: +1, type: 'h' },
    'OH-'    : { charge: -1, type: 'oh' },

    /* spectator cations -------------------------------------------------- */
    'Li+'    : { charge: +1, type: 'spectator' },
    'Na+'    : { charge: +1, type: 'spectator' },
    'K+'     : { charge: +1, type: 'spectator' },
    'Rb+'    : { charge: +1, type: 'spectator' },
    'Cs+'    : { charge: +1, type: 'spectator' },
    'Ag+'    : { charge: +1, type: 'spectator' },
    'Ca2+'   : { charge: +2, type: 'spectator' },
    'Ba2+'   : { charge: +2, type: 'spectator' },

    /* hydrolysing cations (weak acids in water) ------------------------- */
    'Mg2+'   : { charge: +2, type: 'weak_acid_cation', Ka: 2.6e-12 },
    'Al3+'   : { charge: +3, type: 'weak_acid_cation', Ka: 1.0e-5  },
    'Fe2+'   : { charge: +2, type: 'weak_acid_cation', Ka: 3.2e-10 },
    'Fe3+'   : { charge: +3, type: 'weak_acid_cation', Ka: 6.3e-3  },
    'Cu2+'   : { charge: +2, type: 'weak_acid_cation', Ka: 1.0e-8  },
    'Zn2+'   : { charge: +2, type: 'weak_acid_cation', Ka: 1.0e-9  },
    'Pb2+'   : { charge: +2, type: 'weak_acid_cation', Ka: 1.5e-8  },
    'NH4+'   : { charge: +1, type: 'weak_acid_cation', Ka: 5.6e-10 },

    /* spectator anions --------------------------------------------------- */
    'Cl-'    : { charge: -1, type: 'spectator' },
    'Br-'    : { charge: -1, type: 'spectator' },
    'I-'     : { charge: -1, type: 'spectator' },
    'NO3-'   : { charge: -1, type: 'spectator' },
    'ClO4-'  : { charge: -1, type: 'spectator' },
    'MnO4-'  : { charge: -1, type: 'spectator' },

    /* weak base anions --------------------------------------------------- */
    'SO4^2-' : { charge: -2, type: 'weak_base_anion', Kb: 1.0e-12 },
    'CH3COO-': { charge: -1, type: 'weak_base_anion', Kb: 5.6e-10 },
    'CO3^2-' : { charge: -2, type: 'weak_base_anion', Kb: 2.1e-4  },
    'HCO3-'  : { charge: -1, type: 'weak_base_anion', Kb: 2.3e-8  },
    'PO4^3-' : { charge: -3, type: 'weak_base_anion', Kb: 2.4e-2  }
  };

  /* ==========================================================================
   * 3. IONIC CHROMOPHORE TINTS (for fluid colour mixing in canvas.js)
   * ========================================================================*/
  const ION_COLORS = {
    'Cu2+'  : '#2563eb',
    'Fe2+'  : '#86efac',
    'Fe3+'  : '#b45309',
    'MnO4-' : '#6b21a8',
    'Ni2+'  : '#22c55e',
    'Co2+'  : '#ec4899',
    'Cr3+'  : '#16a34a',
    'Cr2O7^2-': '#f97316'
  };

  /* ==========================================================================
   * 4. VIRTUAL SPECIES (reaction products not present in ChemicalsDB)
   * ========================================================================*/
  const VIRTUAL = {
    lioh: {
      id:'lioh', name:'Lithium Hydroxide', formula:'LiOH', molarMass:23.95,
      category:'strong_base', defaultState:'aqueous', color:'#e9d5ff', opacity:0.14,
      ions:{ 'Li+':1, 'OH-':1 }, isAcid:false, isBase:true,
      pKa:null, pKb:-0.36, hydroxideCount:1, protonCount:0,
      hazardous:true, flameColor:'#dc2626'
    },
    rboh: {
      id:'rboh', name:'Rubidium Hydroxide', formula:'RbOH', molarMass:102.475,
      category:'strong_base', defaultState:'aqueous', color:'#e9d5ff', opacity:0.14,
      ions:{ 'Rb+':1, 'OH-':1 }, isAcid:false, isBase:true,
      pKa:null, pKb:-0.35, hydroxideCount:1, protonCount:0,
      hazardous:true, flameColor:'#f43f5e'
    },
    csoh: {
      id:'csoh', name:'Caesium Hydroxide', formula:'CsOH', molarMass:149.913,
      category:'strong_base', defaultState:'aqueous', color:'#e9d5ff', opacity:0.14,
      ions:{ 'Cs+':1, 'OH-':1 }, isAcid:false, isBase:true,
      pKa:null, pKb:-0.35, hydroxideCount:1, protonCount:0,
      hazardous:true, flameColor:'#3b82f6'
    },
    mgcl2: {
      id:'mgcl2', name:'Magnesium Chloride', formula:'MgCl₂', molarMass:95.211,
      category:'salt', defaultState:'aqueous', color:'#f1f5f9', opacity:0.04,
      ions:{ 'Mg2+':1, 'Cl-':2 }, isAcid:false, isBase:false, hazardous:false
    },
    alcl3: {
      id:'alcl3', name:'Aluminium Chloride', formula:'AlCl₃', molarMass:133.34,
      category:'salt', defaultState:'aqueous', color:'#fef3c7', opacity:0.06,
      ions:{ 'Al3+':1, 'Cl-':3 }, isAcid:true, isBase:false,
      pKa:2.5, pKb:null, protonCount:0, hydroxideCount:0, hazardous:true
    },
    zncl2: {
      id:'zncl2', name:'Zinc Chloride', formula:'ZnCl₂', molarMass:136.286,
      category:'salt', defaultState:'aqueous', color:'#f1f5f9', opacity:0.04,
      ions:{ 'Zn2+':1, 'Cl-':2 }, isAcid:false, isBase:false, hazardous:true
    },
    fecl2: {
      id:'fecl2', name:'Iron(II) Chloride', formula:'FeCl₂', molarMass:126.751,
      category:'salt', defaultState:'aqueous', color:'#86efac', opacity:0.35,
      ions:{ 'Fe2+':1, 'Cl-':2 }, isAcid:false, isBase:false, hazardous:true
    },
    mgso4: {
      id:'mgso4', name:'Magnesium Sulfate', formula:'MgSO₄', molarMass:120.366,
      category:'salt', defaultState:'aqueous', color:'#f1f5f9', opacity:0.03,
      ions:{ 'Mg2+':1, 'SO4^2-':1 }, isAcid:false, isBase:false, hazardous:false
    },
    k2so4: {
      id:'k2so4', name:'Potassium Sulfate', formula:'K₂SO₄', molarMass:174.259,
      category:'salt', defaultState:'aqueous', color:'#f1f5f9', opacity:0.04,
      ions:{ 'K+':2, 'SO4^2-':1 }, isAcid:false, isBase:false, hazardous:false
    },
    kno3: {
      id:'kno3', name:'Potassium Nitrate', formula:'KNO₃', molarMass:101.103,
      category:'salt', defaultState:'aqueous', color:'#f1f5f9', opacity:0.03,
      ions:{ 'K+':1, 'NO3-':1 }, isAcid:false, isBase:false, hazardous:false
    }
  };

  function getSpecies(id) { return DB.get(id) || VIRTUAL[id] || null; }

  /* ==========================================================================
   * 5. METAL & ALKALI LOOKUP TABLES
   * ========================================================================*/
  const ALKALI_METALS = { li:1, na:1, k:1, rb:1, cs:1 };
  const ALKALI_ION    = { li:'Li+', na:'Na+', k:'K+', rb:'Rb+', cs:'Cs+' };
  const ALKALI_HYD    = { li:'lioh', na:'naoh', k:'koh', rb:'rboh', cs:'csoh' };

  const ACTIVE_METALS = {
    mg: { ion:'Mg2+', charge:2, dHf:-462 },
    al: { ion:'Al3+', charge:3, dHf:-531 },
    zn: { ion:'Zn2+', charge:2, dHf:-153 },
    fe: { ion:'Fe2+', charge:2, dHf:-89  },
    pb: { ion:'Pb2+', charge:2, dHf:-1   }
  };
  const NOBLE_METALS = { cu:1, ag:1, au:1 };

  /* ==========================================================================
   * 6. PRECIPITATION REACTION TABLE
   * ========================================================================*/
  const PRECIP_RXNS = [
    { solid:'AgCl',    ca:'Ag+',  cN:1, an:'Cl-',     aN:1, color:'#f1f5f9' },
    { solid:'AgBr',    ca:'Ag+',  cN:1, an:'Br-',     aN:1, color:'#fef3c7' },
    { solid:'AgI',     ca:'Ag+',  cN:1, an:'I-',      aN:1, color:'#fef08a' },
    { solid:'PbCl2',   ca:'Pb2+', cN:1, an:'Cl-',     aN:2, color:'#ffffff' },
    { solid:'PbI2',    ca:'Pb2+', cN:1, an:'I-',      aN:2, color:'#facc15' },
    { solid:'PbSO4',   ca:'Pb2+', cN:1, an:'SO4^2-',  aN:1, color:'#ffffff' },
    { solid:'BaSO4',   ca:'Ba2+', cN:1, an:'SO4^2-',  aN:1, color:'#ffffff' },
    { solid:'Cu(OH)2', ca:'Cu2+', cN:1, an:'OH-',     aN:2, color:'#93c5fd' },
    { solid:'Fe(OH)3', ca:'Fe3+', cN:1, an:'OH-',     aN:3, color:'#7f1d1d' },
    { solid:'Fe(OH)2', ca:'Fe2+', cN:1, an:'OH-',     aN:2, color:'#4ade80' },
    { solid:'Mg(OH)2', ca:'Mg2+', cN:1, an:'OH-',     aN:2, color:'#ffffff' },
    { solid:'Al(OH)3', ca:'Al3+', cN:1, an:'OH-',     aN:3, color:'#ffffff' },
    { solid:'Zn(OH)2', ca:'Zn2+', cN:1, an:'OH-',     aN:2, color:'#ffffff' },
    { solid:'CaCO3',   ca:'Ca2+', cN:1, an:'CO3^2-',  aN:1, color:'#ffffff' },
    { solid:'BaCO3',   ca:'Ba2+', cN:1, an:'CO3^2-',  aN:1, color:'#ffffff' },
    { solid:'PbCO3',   ca:'Pb2+', cN:1, an:'CO3^2-',  aN:1, color:'#ffffff' },
    { solid:'Ag2CO3',  ca:'Ag+',  cN:2, an:'CO3^2-',  aN:1, color:'#fef3c7' }
  ];

  /* ==========================================================================
   * 7. UTILITIES
   * ========================================================================*/
  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 200, g: 220, b: 240 };
    const h = hex.replace('#', '');
    const v = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
    return { r: v[0] || 0, g: v[1] || 0, b: v[2] || 0 };
  }

  function rgbToHex(r, g, b) {
    const c = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  function lerpHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.r + (B.r-A.r)*t, A.g + (B.g-A.g)*t, A.b + (B.b-A.b)*t);
  }

  /* Universal indicator rainbow lookup ---------------------------------- */
  function universalColor(pH) {
    const stops = [
      { p:1,  c:'#dc2626' }, { p:3,  c:'#ea580c' }, { p:5,  c:'#eab308' },
      { p:6,  c:'#a3e635' }, { p:7,  c:'#22c55e' }, { p:8,  c:'#14b8a6' },
      { p:9,  c:'#0891b2' }, { p:11, c:'#2563eb' }, { p:13, c:'#7c3aed' },
      { p:14, c:'#6b21a8' }
    ];
    const p = Math.max(1, Math.min(14, pH));
    for (let i = 0; i < stops.length - 1; i++) {
      if (p >= stops[i].p && p <= stops[i+1].p) {
        const t = (p - stops[i].p) / (stops[i+1].p - stops[i].p);
        return lerpHex(stops[i].c, stops[i+1].c, t);
      }
    }
    return stops[stops.length-1].c;
  }

  /* ==========================================================================
   * 8. STATE FACTORY
   * ========================================================================*/
  function createFreshState() {
    return {
      waterVolume: 0,
      temperature: AMBIENT_T,
      ions:       {},   // { 'Na+': moles, 'Cl-': moles, ... }
      molecular:  {},   // { 'ch3cooh': moles, ... }  undissociated weak species
      indicators: {},   // { 'phenolphthalein': moles }
      solids:     [],   // [ { id, moles, kind:'metal'|'solid'|'precipitate', color } ]
      gases:      {},   // { 'h2': moles, 'co2': moles, ... }
      stirring:   0,
      heatIntensity: 0,
      boiling:    false,
      boilingRate: 0,
      totalMassAdded: 0,
      lastReaction: null,
      events: [],
      reactionCount: 0
    };
  }

  /* ==========================================================================
   * 9. ENGINE CONSTRUCTOR
   * ========================================================================*/
  function ChemistryEngine() {
    this.state = createFreshState();
    this._listeners = [];
  }

  ChemistryEngine.prototype.on = function (fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
  };

  ChemistryEngine.prototype._emit = function (event, data) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch (e) { /* swallow */ }
    }
  };

  /* ----------------------------------------------------------------------
   * 9.1 VESSEL LIFECYCLE
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype.clearVessel = function () {
    this.state = createFreshState();
    this._emit('vessel:cleared', {});
  };

  ChemistryEngine.prototype.flush = function () {
    this.state = createFreshState();
    this._emit('vessel:flushed', {});
  };

  ChemistryEngine.prototype.refill = function () {
    const added = Math.max(0, VESSEL_CAPACITY - this.state.waterVolume);
    this.state.waterVolume = VESSEL_CAPACITY;
    this._emit('vessel:refilled', { added });
    this.react();
  };

  /* ----------------------------------------------------------------------
   * 9.2 WATER INPUT
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype.addWater = function (mL) {
    if (!Number.isFinite(mL) || mL <= 0) return { ok: false, error: 'invalid volume' };
    const room = VESSEL_CAPACITY - this.state.waterVolume;
    const added = Math.min(mL, Math.max(0, room));
    this.state.waterVolume += added;
    this._emit('water:added', { mL: added });
    this.react();   // may trigger alkali metal runaway
    return { ok: true, added };
  };

  /* ----------------------------------------------------------------------
   * 9.3 ADD CHEMICAL  (auto unit mapping: solid -> g, liquid/aq -> mL)
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype.addChemical = function (id, quantity, unitHint) {
    const sp = getSpecies(id);
    if (!sp) return { ok: false, error: 'Unknown species: ' + id };
    if (!Number.isFinite(quantity) || quantity <= 0)
      return { ok: false, error: 'Quantity must be > 0' };

    /* Water special case ------------------------------------------------ */
    if (id === 'water' || sp.category === 'water') return this.addWater(quantity);

    /* Indicators -------------------------------------------------------- */
    if (sp.category === 'indicator') {
      const moles = quantity * 1e-5;   // trace amount
      this.state.indicators[id] = (this.state.indicators[id] || 0) + moles;
      this._emit('chemical:added', { id, moles, phase: 'indicator', unit: 'mL' });
      return { ok: true, moles, unit: 'mL' };
    }

    const isPureSolid = sp.defaultState === 'solid' && !sp.ions;
    let moles, unit, mass;

    if (isPureSolid) {
      /* ---------------------------- SOLID (g) ----------------------- */
      unit  = 'g';
      mass  = quantity;
      moles = mass / sp.molarMass;

      if (sp.category === 'alkali_metal') {
        // Store as reactive metal chunk
        this.state.solids.push({
          id, moles, kind: 'metal',
          color: sp.solidColor || sp.color || '#cbd5e1'
        });
      } else if (sp.category === 'metal') {
        this.state.solids.push({
          id, moles, kind: 'metal',
          color: sp.solidColor || sp.color || '#94a3b8'
        });
      } else if ((sp.solubility || 0) >= 1) {
        // Soluble salt -> dissolve into ions
        for (const [ion, n] of Object.entries(sp.ions || {}))
          this.state.ions[ion] = (this.state.ions[ion] || 0) + moles * n;
      } else {
        // Insoluble solid -> stays suspended
        this.state.solids.push({
          id, moles, kind: 'solid',
          color: sp.solidColor || sp.color || '#a8a29e'
        });
      }
    } else {
      /* ------------------------- LIQUID / AQUEOUS (mL) --------------- */
      unit  = 'mL';
      mass  = quantity * (sp.density || 1.0);
      moles = mass / sp.molarMass;

      if (sp.isAcid && sp.pKa !== null && sp.pKa >= 0) {
        // Weak acid — stays molecular (equilibrium handled in pH solver)
        this.state.molecular[id] = (this.state.molecular[id] || 0) + moles;
      } else if (sp.isBase && sp.pKb !== null && sp.pKb >= 0) {
        // Weak base — stays molecular
        this.state.molecular[id] = (this.state.molecular[id] || 0) + moles;
      } else if (sp.ions && Object.keys(sp.ions).length) {
        // Strong electrolyte — fully dissociates
        for (const [ion, n] of Object.entries(sp.ions))
          this.state.ions[ion] = (this.state.ions[ion] || 0) + moles * n;
      } else {
        this.state.molecular[id] = (this.state.molecular[id] || 0) + moles;
      }
    }

    this.state.totalMassAdded += mass || 0;
    this._emit('chemical:added', { id, moles, phase: isPureSolid ? 'solid' : 'aqueous', unit, mass });
    this.react();
    return { ok: true, moles, unit, mass };
  };

  /* ----------------------------------------------------------------------
   * 9.4 EXTERNAL STIMULI
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype.applyHeat = function (intensity) {
    this.state.heatIntensity = Math.max(0, Math.min(1, intensity));
  };

  ChemistryEngine.prototype.stir = function (intensity) {
    this.state.stirring = Math.max(0, Math.min(1, intensity));
  };

  /* ----------------------------------------------------------------------
   * 9.5 ADD HEAT DIRECTLY (from exothermic reactions)
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._addHeatJoules = function (J) {
    const m = Math.max(this.state.waterVolume * WATER_DENSITY, 1);
    if (this.state.waterVolume > 0) {
      this.state.temperature = Math.min(MAX_T,
        this.state.temperature + J / (m * WATER_CP));
    }
  };

  /* ==========================================================================
   * 10. pH SOLVER — pure first-principles charge balance
   * --------------------------------------------------------------------------
   *   f(h) = h + Σ[fixed cations] + Σ[BH+](h)
   *              - Kw/h - Σ[fixed anions] - Σ[A-](h)   = 0
   *
   *   Bisection on log10(h) over [1e-16, 10].  f is monotone increasing in h.
   *   Dry vessel => pH 7.00 (neutral / off).
   * ========================================================================*/
  ChemistryEngine.prototype.computePH = function () {
    const s = this.state;
    const V = s.waterVolume / 1000;
    if (V <= 0) return 7.00;

    let fixedPos = 0, fixedNeg = 0;
    const weakAcids = [];   // { C, Ka }
    const weakBases = [];   // { C, Kb }

    /* ---------- ions ---------- */
    for (const [ion, moles] of Object.entries(s.ions)) {
      if (moles <= EPS) continue;
      const info = ION_DB[ion];
      if (!info) continue;
      const c = moles / V;
      if (info.type === 'spectator') {
        if (info.charge > 0) fixedPos += c * info.charge;
        else fixedNeg += c * (-info.charge);
      } else if (info.type === 'weak_acid_cation') {
        weakAcids.push({ C: c, Ka: info.Ka });
      } else if (info.type === 'weak_base_anion') {
        weakBases.push({ C: c, Kb: info.Kb });
      }
    }

    /* ---------- molecular weak acids / bases ---------- */
    for (const [id, moles] of Object.entries(s.molecular)) {
      if (moles <= EPS) continue;
      const sp = getSpecies(id);
      if (!sp) continue;
      const c = moles / V;
      if (sp.isAcid && sp.pKa !== null && sp.pKa >= 0) {
        weakAcids.push({ C: c, Ka: Math.pow(10, -sp.pKa) });
      } else if (sp.isBase && sp.pKb !== null && sp.pKb >= 0) {
        weakBases.push({ C: c, Kb: Math.pow(10, -sp.pKb) });
      }
    }

    /* ---------- charge balance function ---------- */
    const f = (h) => {
      const oh = KW_25 / h;
      let sumA = 0;
      for (let i = 0; i < weakAcids.length; i++) {
        const wa = weakAcids[i];
        sumA += wa.C * wa.Ka / (wa.Ka + h);
      }
      let sumBH = 0;
      for (let i = 0; i < weakBases.length; i++) {
        const wb = weakBases[i];
        const Ka_conj = KW_25 / wb.Kb;
        sumBH += wb.C * h / (Ka_conj + h);
      }
      return h + fixedPos + sumBH - oh - fixedNeg - sumA;
    };

    /* ---------- bisection on log10(h) ---------- */
    let lo = 1e-16, hi = 10;
    if (f(lo) > 0) return 14.0;
    if (f(hi) < 0) return 0.0;
    for (let i = 0; i < 100; i++) {
      const mid = Math.sqrt(lo * hi);
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    const h = Math.sqrt(lo * hi);
    const pH = -Math.log10(h);
    return Math.max(0, Math.min(14, pH));
  };

  /* ==========================================================================
   * 11. REACTION ENGINE
   * ========================================================================*/
  ChemistryEngine.prototype.react = function () {
    let changed = true;
    let iter = 0;
    while (changed && iter < 6) {
      changed = false;
      if (this._rxPrecipitation())    changed = true;
      if (this._rxNeutralization())   changed = true;
      if (this._rxAlkaliWater())      changed = true;
      if (this._rxMetalAcid())        changed = true;
      if (this._rxCarbonateAcid())    changed = true;
      if (this._rxDisplacement())     changed = true;
      iter++;
    }
    if (iter > 0) this.state.reactionCount += 1;
  };

  /* ----------------------------------------------------------------------
   * 11.1  PRECIPITATION  (ionic metathesis)
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxPrecipitation = function () {
    const s = this.state;
    let any = false;
    for (const rxn of PRECIP_RXNS) {
      const cationMoles = s.ions[rxn.ca] || 0;
      const anionMoles  = s.ions[rxn.an] || 0;
      if (cationMoles < EPS || anionMoles < EPS) continue;

      // limited by stoichiometry
      const limCat = cationMoles / rxn.cN;
      const limAn  = anionMoles  / rxn.aN;
      const n = Math.min(limCat, limAn);
      if (n < 1e-9) continue;

      s.ions[rxn.ca] -= n * rxn.cN;
      s.ions[rxn.an] -= n * rxn.aN;

      // add / merge precipitate
      const existing = s.solids.find(sd => sd.id === rxn.solid && sd.kind === 'precipitate');
      if (existing) existing.moles += n;
      else s.solids.push({ id: rxn.solid, moles: n, kind: 'precipitate', color: rxn.color });

      s.lastReaction = `Precipitation: ${rxn.ca} + ${rxn.an} -> ${rxn.solid}(s)`;
      this._emit('reaction:precipitate', { product: rxn.solid, moles: n });
      any = true;
    }
    return any;
  };

  /* ----------------------------------------------------------------------
   * 11.2  ACID-BASE NEUTRALIZATION   H+ + OH- -> H2O
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxNeutralization = function () {
    const s = this.state;
    const h  = s.ions['H+'] || 0;
    const oh = s.ions['OH-'] || 0;
    if (h < EPS || oh < EPS) return false;

    const n = Math.min(h, oh);
    s.ions['H+']  = h - n;
    s.ions['OH-'] = oh - n;

    // Produces water; ΔH_neut ~ -57.3 kJ/mol
    s.waterVolume += n * WATER_MM;
    this._addHeatJoules(57300 * n);

    s.lastReaction = `Neutralization: H+ + OH- -> H2O  (${n.toFixed(4)} mol)`;
    this._emit('reaction:neutralize', { moles: n });
    return true;
  };

  /* ----------------------------------------------------------------------
   * 11.3  ALKALI METAL + WATER   (only if waterVolume > 0!)
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxAlkaliWater = function () {
    const s = this.state;
    if (s.waterVolume <= 0) return false;        // <-- PURE-STATE GUARD

    let any = false;
    const metalSolids = s.solids.filter(sd => ALKALI_METALS[sd.id] && sd.moles > EPS);
    if (!metalSolids.length) return false;

    for (const chunk of metalSolids) {
      const waterMoles = s.waterVolume / WATER_MM;
      if (waterMoles < EPS) break;

      const react = Math.min(chunk.moles, waterMoles);
      if (react < 1e-9) continue;

      chunk.moles -= react;
      s.waterVolume -= react * WATER_MM;

      const ion = ALKALI_ION[chunk.id];
      s.ions[ion]       = (s.ions[ion] || 0) + react;
      s.ions['OH-']     = (s.ions['OH-'] || 0) + react;
      s.gases['h2']     = (s.gases['h2'] || 0) + react * 0.5;

      // Strongly exothermic: ~ 184 kJ / mol (Na reference)
      this._addHeatJoules(184000 * react);

      s.lastReaction = `Alkali runaway: ${chunk.id.toUpperCase()}(s) + H2O -> ${ion} + OH- + ½H2↑`;
      this._emit('reaction:alkali', { metal: chunk.id, moles: react });
      any = true;
    }
    // purge consumed chunks
    s.solids = s.solids.filter(sd => sd.moles > 1e-9);
    return any;
  };

  /* ----------------------------------------------------------------------
   * 11.4  METAL + ACID   M + n H+ -> M^n+ + (n/2) H2↑
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxMetalAcid = function () {
    const s = this.state;
    const h = s.ions['H+'] || 0;
    if (h < EPS) return false;

    let any = false;
    for (const chunk of s.solids) {
      const info = ACTIVE_METALS[chunk.id];
      if (!info || chunk.moles < EPS) continue;

      const needed = chunk.moles * info.charge;
      const react  = Math.min(chunk.moles, h / info.charge);
      if (react < 1e-9) continue;

      chunk.moles -= react;
      s.ions['H+'] -= react * info.charge;
      s.ions[info.ion] = (s.ions[info.ion] || 0) + react;
      s.gases['h2'] = (s.gases['h2'] || 0) + react * info.charge / 2;

      // ΔH ~ -info.dHf kJ/mol (approximation)
      this._addHeatJoules(1000 * Math.abs(info.dHf) * react);

      s.lastReaction = `Metal dissolution: ${chunk.id.toUpperCase()} + ${info.charge}H+ -> ${info.ion} + ${info.charge/2}H2↑`;
      this._emit('reaction:metal-acid', { metal: chunk.id, moles: react });
      any = true;
    }
    s.solids = s.solids.filter(sd => sd.moles > 1e-9);
    return any;
  };

  /* ----------------------------------------------------------------------
   * 11.5  CARBONATE + ACID   CO3^2- + 2H+ -> CO2↑ + H2O
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxCarbonateAcid = function () {
    const s = this.state;
    const h = s.ions['H+'] || 0;
    if (h < EPS) return false;

    let any = false;

    // Aqueous carbonate
    const co3  = s.ions['CO3^2-'] || 0;
    const hco3 = s.ions['HCO3-']  || 0;

    if (co3 > EPS) {
      const react = Math.min(co3, h / 2);
      if (react > 1e-9) {
        s.ions['CO3^2-'] -= react;
        s.ions['H+']     -= react * 2;
        s.gases['co2']   = (s.gases['co2'] || 0) + react;
        s.waterVolume    += react * WATER_MM;
        s.lastReaction = `Effervescence: CO3^2- + 2H+ -> CO2↑ + H2O`;
        this._emit('reaction:gas', { gas: 'co2', moles: react });
        any = true;
      }
    }
    if (hco3 > EPS) {
      const react = Math.min(hco3, s.ions['H+'] || 0);
      if (react > 1e-9) {
        s.ions['HCO3-'] -= react;
        s.ions['H+']    -= react;
        s.gases['co2']  = (s.gases['co2'] || 0) + react;
        s.waterVolume   += react * WATER_MM;
        s.lastReaction = `Effervescence: HCO3- + H+ -> CO2↑ + H2O`;
        this._emit('reaction:gas', { gas: 'co2', moles: react });
        any = true;
      }
    }

    // Insoluble carbonates (CaCO3, etc.)
    for (const chunk of s.solids) {
      if (chunk.id !== 'caco3' && chunk.id !== 'baco3') continue;
      if (chunk.moles < EPS) continue;
      const hNow = s.ions['H+'] || 0;
      if (hNow < EPS) break;
      const react = Math.min(chunk.moles, hNow / 2);
      if (react < 1e-9) continue;

      chunk.moles   -= react;
      s.ions['H+']  -= react * 2;
      const cat = chunk.id === 'caco3' ? 'Ca2+' : 'Ba2+';
      s.ions[cat] = (s.ions[cat] || 0) + react;
      s.gases['co2'] = (s.gases['co2'] || 0) + react;
      s.waterVolume += react * WATER_MM;
      s.lastReaction = `Effervescence: ${chunk.id.toUpperCase()} + 2H+ -> ${cat} + CO2↑ + H2O`;
      this._emit('reaction:gas', { gas: 'co2', moles: react });
      any = true;
    }
    s.solids = s.solids.filter(sd => sd.moles > 1e-9);
    return any;
  };

  /* ----------------------------------------------------------------------
   * 11.6  SINGLE DISPLACEMENT  (Zn + Cu2+ -> Zn2+ + Cu etc.)
   * --------------------------------------------------------------------*/
  ChemistryEngine.prototype._rxDisplacement = function () {
    const s = this.state;
    let any = false;

    const pairs = [
      { metal:'mg', ion:'Mg2+', charge:2, target:'Cu2+', deposit:'cu' },
      { metal:'zn', ion:'Zn2+', charge:2, target:'Cu2+', deposit:'cu' },
      { metal:'fe', ion:'Fe2+', charge:2, target:'Cu2+', deposit:'cu' },
      { metal:'mg', ion:'Mg2+', charge:2, target:'Ag+',  deposit:'ag' },
      { metal:'zn', ion:'Zn2+', charge:2, target:'Ag+',  deposit:'ag' },
      { metal:'cu', ion:'Cu2+', charge:2, target:'Ag+',  deposit:'ag' }
    ];

    for (const p of pairs) {
      const targetMoles = s.ions[p.target] || 0;
      if (targetMoles < EPS) continue;

      const chunk = s.solids.find(sd => sd.id === p.metal && sd.moles > EPS);
      if (!chunk) continue;

      const targetCharge = (ION_DB[p.target] && ION_DB[p.target].charge) || 1;
      // electron balance: metal loses p.charge, target gains targetCharge
      const stoichMetal  = targetCharge / p.charge;   // moles metal per mole target
      const limMetal     = chunk.moles / stoichMetal;
      const react        = Math.min(limMetal, targetMoles);
      if (react < 1e-9) continue;

      chunk.moles       -= react * stoichMetal;
      s.ions[p.target]  -= react;
      s.ions[p.ion]      = (s.ions[p.ion] || 0) + react * stoichMetal;

      const depSp = DB.get(p.deposit);
      s.solids.push({
        id: p.deposit, moles: react,
        kind: 'precipitate',
        color: depSp ? (depSp.solidColor || depSp.color) : '#b45309'
      });
      s.lastReaction = `Displacement: ${p.metal.toUpperCase()} + ${p.target} -> ${p.ion} + ${p.deposit.toUpperCase()}(s)`;
      this._emit('reaction:displace', { metal: p.metal, target: p.target, moles: react });
      any = true;
    }
    s.solids = s.solids.filter(sd => sd.moles > 1e-9);
    return any;
  };

  /* ==========================================================================
   * 12. THERMODYNAMICS — Burner & Vaporization
   * ========================================================================*/
  ChemistryEngine.prototype._applyThermal = function (dt) {
    const s = this.state;
    if (s.waterVolume <= 0) {
      // Cool to ambient
      s.temperature += (AMBIENT_T - s.temperature) * Math.min(1, dt * 0.4);
      return;
    }
    const waterMass = s.waterVolume * WATER_DENSITY;

    const heatIn   = s.heatIntensity * BURNER_MAX_W;
    const heatLoss = HEAT_LOSS_K * (s.temperature - AMBIENT_T);
    const netW     = heatIn - heatLoss;

    const dT   = netW * dt / (waterMass * WATER_CP);
    let newT   = s.temperature + dT;

    if (newT > 100 && s.waterVolume > 0) {
      const excessT = newT - 100;
      const excessJ = excessT * waterMass * WATER_CP;
      const vapG    = Math.max(0, excessJ) / WATER_LH_VAP;
      s.waterVolume = Math.max(0, s.waterVolume - vapG);
      s.boiling     = true;
      s.boilingRate = vapG / Math.max(dt, 1e-6);
      if (s.waterVolume <= 0) {
        newT = 100 + excessT;   // all water gone — temp climbs
        s.boiling = false;
        s.boilingRate = 0;
      } else {
        newT = 100;
      }
    } else if (newT >= 99.5 && s.waterVolume > 0) {
      s.boiling = true;
      s.boilingRate = 0;
    } else {
      s.boiling = false;
      s.boilingRate = 0;
    }

    s.temperature = Math.max(AMBIENT_T, Math.min(MAX_T, newT));
  };

  /* ==========================================================================
   * 13. TICK  (called ~60 fps by app.js)
   * ========================================================================*/
  ChemistryEngine.prototype.tick = function (dt) {
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.1);   // clamp long frames

    this._applyThermal(dt);
    this.react();

    // Gas release / pressure relaxation
    const s = this.state;
    for (const id in s.gases) {
      if (s.gases[id] < 1e-9) delete s.gases[id];
    }

    this._emit('tick', { dt });
  };

  /* ==========================================================================
   * 14. FLAME TEST COLOR  (driven by metal ions in solution)
   * ========================================================================*/
  ChemistryEngine.prototype.getFlameColor = function () {
    if (this.state.heatIntensity <= 0) return null;
    const priority = ['Na+', 'K+', 'Li+', 'Rb+', 'Cs+',
                      'Cu2+', 'Ca2+', 'Ba2+', 'Pb2+', 'Mg2+'];
    for (const ion of priority) {
      if ((this.state.ions[ion] || 0) > 1e-6) {
        const entry = DB.flameColors[ion];
        if (entry) return entry.color;
      }
    }
    // Fallback: pure burner flame
    return null;
  };

  /* ==========================================================================
   * 15. TELEMETRY API (consumed by app.js readouts)
   * ========================================================================*/
  ChemistryEngine.prototype.getTelemetry = function () {
    const s = this.state;
    const pH = this.computePH();

    /* Solid mass (grams) ---------------------------------------------- */
    let mass = 0;
    for (const sd of s.solids) {
      const sp = getSpecies(sd.id);
      if (sp) mass += sd.moles * sp.molarMass;
    }

    /* Volume (mL) ------------------------------------------------------ */
    const volume = s.waterVolume;

    /* Total molarity (mol / L) ---------------------------------------- */
    let totalMoles = 0;
    for (const v of Object.values(s.ions))       totalMoles += v;
    for (const v of Object.values(s.molecular))  totalMoles += v;
    for (const v of Object.values(s.indicators)) totalMoles += v;
    const molarity = volume > 0 ? totalMoles / (volume / 1000) : 0;

    return {
      temperature: +s.temperature.toFixed(2),
      pH:          +pH.toFixed(2),
      mass:        +mass.toFixed(4),
      volume:      +volume.toFixed(2),
      molarity:    +molarity.toFixed(4),
      boiling:     s.boiling,
      heatIntensity: s.heatIntensity,
      stirring:    s.stirring,
      reactionCount: s.reactionCount
    };
  };

  /* ==========================================================================
   * 16. ACTIVE SPECIES LIST (for #activeSpeciesList readout)
   * ========================================================================*/
  ChemistryEngine.prototype.getActiveSpecies = function () {
    const s = this.state;
    const out = [];

    const push = (id, moles, phase) => {
      if (moles < 1e-8) return;
      const sp = getSpecies(id);
      out.push({
        id,
        name:   sp ? sp.name   : id,
        formula:sp ? sp.formula: id,
        moles,
        phase
      });
    };

    for (const [id, m] of Object.entries(s.molecular))  push(id, m, 'aq');
    for (const [id, m] of Object.entries(s.indicators)) push(id, m, 'aq');
    for (const [ion, m] of Object.entries(s.ions))      push(ion, m, 'ion');
    for (const [id, m] of Object.entries(s.gases))      push(id, m, 'g');
    for (const sd of s.solids)                          push(sd.id, sd.moles, sd.kind || 's');

    return out;
  };

  /* ==========================================================================
   * 17. CANVAS STATE (colour-blended fluid, solids, gas FX)
   * ========================================================================*/
  ChemistryEngine.prototype.getCanvasState = function () {
    const s = this.state;
    const pH = this.computePH();

    /* ---- blend aqueous colour from all dissolved chromophores -------- */
    let rAcc = 0, gAcc = 0, bAcc = 0, wAcc = 0;

    const addColor = (hex, weight) => {
      if (weight <= 0) return;
      const c = hexToRgb(hex);
      rAcc += c.r * weight;
      gAcc += c.g * weight;
      bAcc += c.b * weight;
      wAcc += weight;
    };

    for (const [ion, moles] of Object.entries(s.ions)) {
      if (moles <= EPS) continue;
      const col = ION_COLORS[ion];
      if (col) addColor(col, moles * 20);
    }
    for (const [id, moles] of Object.entries(s.molecular)) {
      if (moles <= EPS) continue;
      const sp = getSpecies(id);
      if (sp && sp.color) addColor(sp.color, moles * 5 * (sp.opacity || 0.3));
    }

    let fluidColor = '#a5f3fc';
    if (wAcc > 0) {
      fluidColor = rgbToHex(rAcc / wAcc, gAcc / wAcc, bAcc / wAcc);
    }

    /* ---- indicator override ---------------------------------------- */
    let indicatorColor = null;
    for (const [id, moles] of Object.entries(s.indicators)) {
      if (moles <= EPS) continue;
      const sp = getSpecies(id);
      if (!sp || !sp.indicator) continue;
      const ind = sp.indicator;
      if (ind.spectrum) {
        indicatorColor = universalColor(pH);
      } else if (pH <= ind.rangeLow) {
        indicatorColor = ind.low;
      } else if (pH >= ind.rangeHigh) {
        indicatorColor = ind.high;
      } else {
        const t = (pH - ind.rangeLow) / (ind.rangeHigh - ind.rangeLow);
        indicatorColor = lerpHex(ind.low, ind.high, t);
      }
      break;
    }

    /* ---- solids with colours --------------------------------------- */
    const solids = s.solids.map(sd => {
      const sp = getSpecies(sd.id);
      return {
        id:    sd.id,
        moles: sd.moles,
        kind:  sd.kind,
        color: sd.color || (sp && sp.solidColor) || '#cbd5e1'
      };
    });

    /* ---- gases with densities & fume colours ---------------------- */
    const gases = {};
    for (const [id, moles] of Object.entries(s.gases)) {
      const gp = DB.gasProperties[id];
      gases[id] = {
        moles,
        fumeColor: gp ? gp.fumeColor : null,
        bubbleColor: gp ? gp.bubbleColor : '#e2e8f0'
      };
    }

    return {
      waterVolume: s.waterVolume,
      vesselCapacity: VESSEL_CAPACITY,
      temperature: s.temperature,
      fluidColor,
      indicatorColor,
      solids,
      gases,
      boiling: s.boiling,
      boilingRate: s.boilingRate,
      stirring: s.stirring,
      heatIntensity: s.heatIntensity,
      flameColor: this.getFlameColor(),
      pH
    };
  };

  /* ==========================================================================
   * 18. LOG / STATE SNAPSHOT
   * ========================================================================*/
  ChemistryEngine.prototype.describeState = function () {
    const t = this.getTelemetry();
    return [
      `T=${t.temperature.toFixed(1)}°C`,
      `pH=${t.pH.toFixed(2)}`,
      `V=${t.volume.toFixed(1)}mL`,
      `m=${t.mass.toFixed(3)}g`,
      `M=${t.molarity.toFixed(3)}mol/L`
    ].join(' | ');
  };

  /* ==========================================================================
   * 19. GLOBAL SINGLETON EXPORT
   * ========================================================================*/
  global.ChemistryEngine = new ChemistryEngine();

  // Version tag for debugging
  global.ChemistryEngine.VERSION = VERSION;

  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[ChemistryEngine v${VERSION}] Online — pH solver, reactions, thermodynamics armed.`);
  }

})(typeof window !== 'undefined' ? window : globalThis);
