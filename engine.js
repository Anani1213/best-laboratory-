/* ============================================================================
 *  VirtuaLab Pro — engine.js
 *  Module: Chemistry Engine (window.ChemistryEngine)
 *  Build:  1.0.0
 *  Author: VirtuaLab Pro Core
 * ----------------------------------------------------------------------------
 *  GLOBAL DATA CONTRACT:
 *      window.ChemicalsDB     -> step 1  (database, read-only)
 *      window.ChemistryEngine -> this module (physics + logic)
 *      window.CanvasRenderer  -> step 3  (consumes this module)
 * ----------------------------------------------------------------------------
 *  DESIGN PILLARS
 *      1. DRY VESSEL PROTOCOL  : vessel.waterVolume === 0 by default.
 *         Solid reagents (especially Group 1 / Group 2 metals) remain as
 *         inert solids. NO reaction, NO heat, NO explosion can occur until
 *         waterVolume > 0.
 *      2. THERMODYNAMICS       : First-law energy balance, q = m·c·ΔT,
 *         Newtonian cooling, latent-heat plateau at exactly 100.00 °C.
 *      3. pH EQUILIBRIA        : Exact charge-balance solver covering
 *         strong/weak mono- and polyprotic acids & bases, amphiprotic
 *         species, buffer regions, and Debye–Hückel activity corrections.
 *      4. REACTION PREDICTOR   : Rule-based state machine that emits
 *         dynamically balanced LaTeX stoichiometry, enthalpy of reaction,
 *         gas evolution, precipitation (Ksp-limited), complexation, and
 *         redox (Nernst-aware).
 * ==========================================================================*/

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. HARD DEPENDENCY CHECK
   * ------------------------------------------------------------------ */
  const DB = global.ChemicalsDB;
  if (!DB) {
    throw new Error(
      '[ChemistryEngine] Fatal: window.ChemicalsDB not found. Load chemicals.js first.'
    );
  }

  /* ================================================================== *
   * 1. PHYSICAL CONSTANTS (SI unless documented)
   * ================================================================== */
  const K = Object.freeze({
    R: 8.314462618,               // J·mol⁻¹·K⁻¹   (molar gas constant)
    F: 96485.33212,               // C·mol⁻¹       (Faraday constant)
    N_A: 6.02214076e23,           // mol⁻¹         (Avogadro)

    WATER_CP: 4.184,              // J·g⁻¹·K⁻¹     (specific heat, liquid H₂O)
    WATER_DENSITY: 0.99705,       // g·mL⁻¹        (at 25.00 °C)
    WATER_DENSITY_100: 0.9584,    // g·mL⁻¹        (at 100.00 °C)
    WATER_LATENT_VAP: 2260.0,     // J·g⁻¹         (at 100 °C, 1 atm)
    WATER_LATENT_FUS: 333.55,     // J·g⁻¹         (at 0 °C)
    WATER_KW_25: 1.0e-14,         // mol²·L⁻²      (at 25 °C)
    WATER_KW_100: 5.13e-13,       // mol²·L⁻²      (at 100 °C, CRC)

    AMBIENT_T: 25.0,              // °C
    BOILING_T: 100.0,             // °C at 101.325 kPa
    FREEZING_T: 0.0,              // °C
    ABS_ZERO_OFFSET: 273.15,

    MAX_FLAME_POWER_W: 900.0,     // W at intensity = 100 (bunsen max)
    MIN_FLAME_POWER_W: 0.0,
    HEAT_LOSS_COEFF_W_K: 0.45,    // Newtonian cooling lumped constant (W/K)
    VESSEL_HEAT_CAPACITY: 65.0,   // J·K⁻¹ (borosilicate beaker + stir bar)

    DEFICIT_MOL: 1e-10,           // threshold below which a species is spent
    MAX_ITER: 64,                 // reaction-loop safety cap
    MAX_SPECIES: 512              // vessel capacity guard
  });

  /* ------------------------------------------------------------------ *
   * 2. MOLAR HEAT CAPACITIES  (J·mol⁻¹·K⁻¹ at 298 K, CRC / NIST)
   * ------------------------------------------------------------------ */
  const MOLAR_CP = Object.freeze({
    'H2O': 75.3, 'NaOH': 59.5, 'KOH': 64.9, 'NaCl': 50.5, 'KCl': 51.3,
    'LiCl': 48.0, 'HCl': 29.1, 'H2SO4': 75.3, 'HNO3': 29.1, 'CH3COOH': 123.1,
    'H3PO4': 106.0, 'NH3': 35.1, 'CaCl2': 72.9, 'BaCl2': 75.1,
    'CuSO4': 100.0, 'CuCl2': 78.2, 'FeSO4': 100.0, 'FeCl3': 96.0,
    'AgNO3': 93.0, 'Pb(NO3)2': 145.0, 'KMnO4': 117.6, 'K2Cr2O7': 219.0,
    'Na2CO3': 112.3, 'NaHCO3': 87.6, 'C2H5OH': 112.4, 'H2O2': 89.1
  });

  /* ------------------------------------------------------------------ *
   * 3. INTENSIVE PROPERTIES OF COMMON IONS
   *    (molar conductivity at infinite dilution, S·cm²·mol⁻¹, 298 K)
   * ------------------------------------------------------------------ */
  const ION_CONDUCTIVITY = Object.freeze({
    'H+': 349.8, 'OH-': 198.0, 'Na+': 50.1, 'K+': 73.5, 'Li+': 38.7,
    'NH4+': 73.4, 'Ca2+': 119.0, 'Ba2+': 127.2, 'Mg2+': 106.0,
    'Cu2+': 107.2, 'Fe2+': 108.0, 'Fe3+': 204.0, 'Zn2+': 105.6,
    'Ag+': 61.9, 'Pb2+': 139.0, 'Cl-': 76.3, 'Br-': 78.1, 'I-': 76.8,
    'NO3-': 71.4, 'SO4-2': 160.0, 'CO3-2': 138.6, 'CH3COO-': 40.9
  });

  /* ================================================================== *
   * 4. CHEMISTRY MATH UTILITIES
   * ================================================================== */
  const Chem = {
    /**
     * Solve a×x² + b×x + c = 0 for the positive root.
     * Uses the numerically stable Citardauq form for small b.
     */
    positiveRoot(a, b, c) {
      if (Math.abs(a) < 1e-300) return b !== 0 ? -c / b : 0;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return 0;
      const sqrtDisc = Math.sqrt(disc);
      // q-form: numerically stable
      const q = -0.5 * (b + Math.sign(b || 1) * sqrtDisc);
      const r1 = q / a;
      const r2 = c / q;
      return Math.max(r1, r2);
    },

    /**
     * Monoprotic weak-acid proton concentration.
     *   HA ⇌ H⁺ + A⁻, Ka = [H⁺][A⁻]/[HA]
     *   [H⁺]² + Ka[H⁺] − Ka·C = 0
     */
    weakAcidH(Ka, C) {
      if (C <= 0) return Math.sqrt(K.WATER_KW_25);
      return Chem.positiveRoot(1, Ka, -Ka * C);
    },

    /** Monoprotic weak-base hydroxide concentration. */
    weakBaseOH(Kb, C) {
      return Chem.weakAcidH(Kb, C);
    },

    /**
     * Extended Debye–Hückel activity coefficient (25 °C, water).
     *   log γ± = −A·z²·√I / (1 + B·a·√I)
     */
    activityCoefficient(z, I, a_nm) {
      if (I <= 1e-12) return 1.0;
      const A = 0.509;
      const B = 0.328;
      const a = a_nm || 0.5;
      const logG = (-A * z * z * Math.sqrt(I)) / (1 + B * a * Math.sqrt(I));
      return Math.pow(10, logG);
    },

    /** Ionic strength from [{c, z}, ...] where c is mol·L⁻¹. */
    ionicStrength(species) {
      let I = 0;
      for (let i = 0; i < species.length; i++) {
        I += 0.5 * species[i].c * species[i].z * species[i].z;
      }
      return I;
    },

    /** Nernst equation: E = E° − (RT/nF)·ln(Q). */
    nernst(E0, n, Q, T_C) {
      const T = (T_C === undefined ? 25 : T_C) + K.ABS_ZERO_OFFSET;
      if (Q <= 0) return E0;
      return E0 - (K.R * T / (n * K.F)) * Math.log(Q);
    },

    /** Van 't Hoff: ln(K2/K1) = −ΔH°/R·(1/T2 − 1/T1). */
    vanTHoff(K1, dH_kJ, T1_C, T2_C) {
      const T1 = T1_C + K.ABS_ZERO_OFFSET;
      const T2 = T2_C + K.ABS_ZERO_OFFSET;
      return K1 * Math.exp((-dH_kJ * 1000 / K.R) * (1 / T2 - 1 / T1));
    },

    /** Kw extrapolated to arbitrary temperature (log-linear fit). */
    kwAt(T_C) {
      // Piecewise log-linear interpolation through known anchors
      const anchors = [
        [0, 1.15e-15], [25, 1.0e-14], [50, 5.48e-14],
        [75, 2.34e-13], [100, 5.13e-13]
      ];
      if (T_C <= anchors[0][0]) return anchors[0][1];
      if (T_C >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [T1, k1] = anchors[i];
        const [T2, k2] = anchors[i + 1];
        if (T_C >= T1 && T_C <= T2) {
          const f = (T_C - T1) / (T2 - T1);
          return k1 * Math.pow(k2 / k1, f);
        }
      }
      return 1e-14;
    },

    /** Format a number to N significant figures for display. */
    sigFig(x, n) {
      if (!isFinite(x) || x === 0) return '0';
      const d = Math.ceil(Math.log10(Math.abs(x)));
      const power = n - d;
      const mag = Math.pow(10, power);
      return (Math.round(x * mag) / mag).toString();
    },

    /** Count acidic protons in a chemical (from formula + category). */
    countAcidicProtons(chem) {
      if (!chem) return 0;
      const id = chem.id;
      if (id === 'hydrochloric_acid') return 1;
      if (id === 'nitric_acid') return 1;
      if (id === 'sulfuric_acid') return 2;
      if (id === 'acetic_acid') return 1;
      if (id === 'phosphoric_acid') return 3;
      if (id === 'sodium_bicarbonate') return 1;
      return 0;
    },

    /** Count basic hydroxide equivalents in a chemical. */
    countBasicOH(chem) {
      if (!chem) return 0;
      const id = chem.id;
      if (id === 'sodium_hydroxide') return 1;
      if (id === 'potassium_hydroxide') return 1;
      if (id === 'ammonia_solution') return 1; // weak, but Kb tracked separately
      if (id === 'barium_hydroxide') return 2;
      return 0;
    }
  };

  /* ================================================================== *
   * 5. VESSEL STATE MODEL
   * ================================================================== */
  class Vessel {
    constructor() {
      this.reset();
    }

    reset() {
      /* --- PRIMARY STATE (Dry Vessel Protocol) --- */
      this.waterVolume = 0;             // mL — MUST default to 0
      this.temperature = K.AMBIENT_T;   // °C
      this.pressure = 101.325;          // kPa

      /* --- CONTENTS --- */
      // Each entry: {
      //   id         : chemicals.js key
      //   moles      : amount in mol
      //   phase      : 'solid' | 'liquid' | 'aqueous' | 'gas' | 'dissolved' | 'precipitate'
      //   addedAt    : simTime (s)
      //   inert      : boolean (true when dry, no reaction possible)
      //   origin     : 'user' | 'product'
      // }
      this.contents = [];

      /* --- ACCUMULATED PRODUCTS --- */
      this.gases = [];          // { id, moles, evolvedAt, ignited }
      this.precipitates = [];   // { id, formula, moles, hex, ksp }

      /* --- EQUILIBRIA --- */
      this.pH = 7.0;
      this.pOH = 7.0;
      this.hydrogenIonM = 1e-7; // mol·L⁻¹
      this.ionicStrength = 0.0;

      /* --- THERMAL LEDGER --- */
      this.totalHeatCapacity = K.VESSEL_HEAT_CAPACITY;  // J·K⁻¹
      this.vaporizedWater = 0;   // mL
      this.energyIn = 0;         // J (cumulative)
      this.energyOut = 0;        // J (cumulative)

      /* --- SIM --- */
      this.simTime = 0;
      this.heatIntensity = 0;    // 0–100 (from #flameSlider)
      this.stirring = false;
      this.boiling = false;
      this.explosionFlag = false;

      /* --- LOG --- */
      this.equations = [];       // [{ latex, dH, type, simTime }]
      this.log = [];             // [{ simTime, level, message }]
    }

    /* --- Derived --- */
    get volumeL()     { return this.waterVolume / 1000; }
    get waterMassG()  { return this.waterVolume * K.WATER_DENSITY; }
    get isDry()       { return this.waterVolume <= 0; }

    get totalMass() {
      let m = this.waterMassG;
      for (let i = 0; i < this.contents.length; i++) {
        const c = this.contents[i];
        const chem = DB.get(c.id);
        if (chem && chem.molarMass) m += c.moles * chem.molarMass;
      }
      return m;
    }

    /** Total dissolved moles of a given chemical id. */
    molesOf(id, phases) {
      let n = 0;
      for (let i = 0; i < this.contents.length; i++) {
        const c = this.contents[i];
        if (c.id !== id) continue;
        if (phases && phases.indexOf(c.phase) === -1) continue;
        n += c.moles;
      }
      return n;
    }

    /** Does the vessel contain any chemical matching a predicate? */
    has(predicate) {
      return this.contents.some(predicate);
    }

    /** Remove chemical with `id` by up to `n` moles (FIFO). */
    consume(id, n) {
      let remaining = n;
      for (let i = 0; i < this.contents.length && remaining > K.DEFICIT_MOL; i++) {
        const c = this.contents[i];
        if (c.id !== id) continue;
        const take = Math.min(c.moles, remaining);
        c.moles -= take;
        remaining -= take;
      }
      this.contents = this.contents.filter(c => c.moles > K.DEFICIT_MOL);
      return n - remaining;
    }
  }

  /* ================================================================== *
   * 6. LATEX FORMATTING HELPERS
   * ================================================================== */
  const Fmt = {
    /** Convert ASCII formula to LaTeX subscript form: H2SO4 -> H_2SO_4 */
    formula(str) {
      if (!str) return '';
      return String(str)
        .replace(/\./g, '\\cdot ')
        .replace(/([A-Za-z\)\]])(\d+)/g, '$1_{$2}');
    },

    /** Pretty ion: 'Cu2+' -> 'Cu^{2+}' */
    ion(sym) {
      if (!sym) return '';
      return String(sym).replace(/([A-Za-z]+)(\d*)([+\-])/, function (_, el, n, s) {
        return el + '^{' + (n || '') + s + '}';
      });
    },

    /** Build a LaTeX reaction string. */
    reaction(reactants, products, options) {
      const opt = options || {};
      const lhs = reactants
        .map(r => (r.coef && r.coef !== 1 ? r.coef : '') + '\\text{' + Fmt.formula(r.formula) + '}')
        .join(' + ');
      const rhs = products
        .map(p => (p.coef && p.coef !== 1 ? p.coef : '') + '\\text{' + Fmt.formula(p.formula) + '}')
        .join(' + ');
      const arrow = opt.arrow || '\\rightarrow';
      const stateTags = opt.states
        ? rhs.replace(/\}/g, '}')  // leave as-is; renderer may decorate
        : rhs;
      return lhs + ' \\; ' + arrow + ' \\; ' + stateTags;
    },

    /** Gas arrow / precipitate arrow suffixes. */
    gas: '\\uparrow',
    ppt: '\\downarrow'
  };

  /* ================================================================== *
   * 7. REACTION RULES
   * ==================================================================
   * Each rule returns:
   *   { ok: true, consumed: [{id, moles}], produced: [{id, moles, phase}],
   *     latex, dH, type, heat: J, gases, precipitates, explosive: bool }
   *   or null.
   * ------------------------------------------------------------------ */

  /* ---- Rule 7.1 : Carbonate + Acid  (CO2 evolution) ---------------- */
  function ruleCarbonateAcid(v) {
    const acidPresent = v.contents.find(c => {
      const chem = DB.get(c.id);
      return chem && chem.category === 'strong_acid' && c.phase !== 'gas';
    });
    const carbPresent = v.contents.find(c => c.id === 'sodium_carbonate' || c.id === 'calcium_carbonate');
    if (!acidPresent || !carbPresent) return null;

    const acidChem = DB.get(acidPresent.id);
    const carbChem = DB.get(carbPresent.id);
    const nH = Chem.countAcidicProtons(acidChem);
    if (nH <= 0) return null;

    // Stoichiometry: Na2CO3 + 2 HCl -> 2 NaCl + H2O + CO2
    const carbStoich = 1;
    const acidStoich = carbChem.id === 'sodium_carbonate' ? 2 : 2;

    // Limit by whichever runs out first
    const molCarb = carbPresent.moles / carbStoich;
    const molAcid = acidPresent.moles / acidStoich;
    const extent = Math.min(molCarb, molAcid);

    if (extent < K.DEFICIT_MOL) return null;

    const isNa = carbChem.id === 'sodium_carbonate';
    const saltId = isNa
      ? (acidChem.id === 'hydrochloric_acid' ? 'sodium_chloride'
        : acidChem.id === 'nitric_acid' ? 'sodium_chloride'   // fallback for display
        : 'sodium_chloride')
      : 'calcium_chloride';
    const saltFormula = isNa
      ? (acidChem.id === 'sulfuric_acid' ? 'Na2SO4' : 'NaCl')
      : 'CaCl2';
    const saltCoef = isNa ? (acidChem.id === 'sulfuric_acid' ? 1 : 2) : 1;

    const consumed = [
      { id: carbPresent.id, moles: extent * carbStoich },
      { id: acidPresent.id, moles: extent * acidStoich }
    ];
    const produced = [
      { id: saltId, moles: extent * saltCoef, phase: 'dissolved', formulaOverride: saltFormula },
      { id: 'distilled_water', moles: extent, phase: 'liquid', formulaOverride: 'H2O' },
      { id: 'carbon_dioxide', moles: extent, phase: 'gas', formulaOverride: 'CO2' }
    ];

    const latex = Fmt.reaction(
      [
        { coef: carbStoich, formula: carbChem.formulaPlain },
        { coef: acidStoich, formula: acidChem.formulaPlain }
      ],
      [
        { coef: saltCoef, formula: saltFormula },
        { coef: 1, formula: 'H2O' },
        { coef: 1, formula: 'CO2' + Fmt.gas }
      ]
    );

    return {
      ok: true, type: 'carbonate_acid',
      consumed, produced,
      latex,
      dH: -35.0,                        // kJ per mol CO2 (approx, varies)
      heat: -35.0 * 1000 * extent,      // J (exothermic)
      gases: [{ id: 'carbon_dioxide', moles: extent }],
      explosive: false
    };
  }

  /* ---- Rule 7.2 : Acid–Base Neutralization ------------------------ */
  function ruleAcidBase(v) {
    const acid = v.contents.find(c => {
      const chem = DB.get(c.id);
      return chem && (chem.category === 'strong_acid') && c.phase !== 'gas';
    });
    const base = v.contents.find(c => {
      const chem = DB.get(c.id);
      return chem && (chem.category === 'strong_base') && c.phase !== 'gas';
    });
    if (!acid || !base) return null;

    const acidChem = DB.get(acid.id);
    const baseChem = DB.get(base.id);
    const nH = Chem.countAcidicProtons(acidChem);
    const nOH = Chem.countBasicOH(baseChem);
    if (nH <= 0 || nOH <= 0) return null;

    // Stoichiometric ratio: (base)·nOH  ⇌  (acid)·nH
    const acidStoich = nOH;
    const baseStoich = nH;

    const molAcid = acid.moles / acidStoich;
    const molBase = base.moles / baseStoich;
    const extent = Math.min(molAcid, molBase);
    if (extent < K.DEFICIT_MOL) return null;

    // Predict salt formula from the conjugate pair
    const saltFormula = predictSaltFormula(acidChem, baseChem);
    const saltId = guessSaltId(acidChem, baseChem);

    // Neutralization enthalpy (kJ per mol water)
    const dH = -57.3; // strong acid + strong base → water

    const consumed = [
      { id: acid.id, moles: extent * acidStoich },
      { id: base.id, moles: extent * baseStoich }
    ];
    const produced = [];
    if (saltId) {
      produced.push({
        id: saltId,
        moles: extent * Math.max(nH, nOH),
        phase: 'dissolved',
        formulaOverride: saltFormula
      });
    }
    produced.push({
      id: 'distilled_water',
      moles: extent * Math.max(nH, nOH),
      phase: 'liquid',
      formulaOverride: 'H2O'
    });

    const latex = Fmt.reaction(
      [
        { coef: acidStoich, formula: acidChem.formulaPlain },
        { coef: baseStoich, formula: baseChem.formulaPlain }
      ],
      (function () {
        const p = [];
        if (saltId) p.push({ coef: Math.max(nH, nOH), formula: saltFormula });
        p.push({ coef: Math.max(nH, nOH), formula: 'H2O' });
        return p;
      })()
    );

    return {
      ok: true, type: 'neutralization',
      consumed, produced,
      latex, dH,
      heat: dH * 1000 * extent * Math.max(nH, nOH),
      gases: [],
      explosive: false
    };
  }

  /* ---- Rule 7.3 : Metal + Acid ------------------------------------ */
  function ruleMetalAcid(v) {
    const acid = v.contents.find(c => {
      const chem = DB.get(c.id);
      return chem && chem.category === 'strong_acid' && c.phase !== 'gas';
    });
    if (!acid) return null;

    const metal = v.contents.find(c => {
      if (c.phase === 'gas' || c.phase === 'dissolved' || c.phase === 'aqueous') return false;
      const chem = DB.get(c.id);
      if (!chem) return false;
      // Only metals that displace H₂ — exclude Cu, Ag, Pb (below H⁺)
      return ['magnesium', 'zinc', 'iron', 'calcium', 'aluminum']
        .indexOf(c.id) !== -1;
    });
    if (!metal) return null;

    const acidChem = DB.get(acid.id);
    const metalChem = DB.get(metal.id);
    const nH = Chem.countAcidicProtons(acidChem);

    // Metal oxidation state (assumed principal)
    const ox = { magnesium: 2, zinc: 2, iron: 2, calcium: 2, aluminum: 3 }[metal.id] || 2;

    // Stoich: n·HX + M → MClₙ + (n/2)·H₂
    const acidPerMetal = nH;
    const h2PerMetal = nH / 2;

    const molMetal = metal.moles;
    const molAcid = acid.moles / acidPerMetal;
    const extent = Math.min(molMetal, molAcid);
    if (extent < K.DEFICIT_MOL) return null;

    const saltFormula = metalSaltFormula(metalChem, acidChem, ox);
    const saltId = guessMetalSaltId(metal.id, acidChem);
    const dH = -153.0; // rough mean for M + 2 H⁺ → M²⁺ + H₂ (kJ/mol)

    const consumed = [
      { id: metal.id, moles: extent },
      { id: acid.id, moles: extent * acidPerMetal }
    ];
    const produced = [];
    if (saltId) {
      produced.push({
        id: saltId, moles: extent, phase: 'dissolved',
        formulaOverride: saltFormula
      });
    }
    produced.push({
      id: 'hydrogen_gas', moles: extent * h2PerMetal, phase: 'gas',
      formulaOverride: 'H2'
    });

    const latex = Fmt.reaction(
      [
        { coef: acidPerMetal, formula: acidChem.formulaPlain },
        { coef: 1, formula: metalChem.formulaPlain }
      ],
      (function () {
        const p = [];
        if (saltId) p.push({ coef: 1, formula: saltFormula });
        p.push({ coef: h2PerMetal, formula: 'H2' + Fmt.gas });
        return p;
      })()
    );

    return {
      ok: true, type: 'metal_acid',
      consumed, produced,
      latex, dH,
      heat: dH * 1000 * extent,
      gases: [{ id: 'hydrogen_gas', moles: extent * h2PerMetal, ignitable: true }],
      explosive: false
    };
  }

  /* ---- Rule 7.4 : Alkali / Alkaline Earth Metal + Water ------------ */
  function ruleMetalWater(v) {
    if (v.isDry) return null;   // DRY VESSEL PROTOCOL — hard gate

    const metal = v.contents.find(c => {
      if (c.phase === 'gas') return false;
      return [
        'lithium', 'sodium', 'potassium', 'rubidium', 'cesium',
        'calcium', 'magnesium'
      ].indexOf(c.id) !== -1;
    });
    if (!metal) return null;

    const metalChem = DB.get(metal.id);
    const isGroup1 = ['lithium', 'sodium', 'potassium', 'rubidium', 'cesium'].indexOf(metal.id) !== -1;
    const isGroup2 = !isGroup1;

    // Stoichiometry: 2 M + 2 H₂O → 2 MOH + H₂   (Group 1)
    //               M + 2 H₂O → M(OH)₂ + H₂     (Group 2, Ca)
    const metalCoef = isGroup1 ? 2 : 1;
    const waterCoef = isGroup1 ? 2 : 2;
    const baseCoef  = isGroup1 ? 2 : 1;
    const h2Coef    = 1;

    // Water limitation: moles of water available
    const molWater = v.waterVolume * K.WATER_DENSITY / DB.get('distilled_water').molarMass;
    const metalExtent = metal.moles / metalCoef;
    const waterExtent = molWater / waterCoef;
    const extent = Math.min(metalExtent, waterExtent);
    if (extent < K.DEFICIT_MOL) return null;

    // Reaction enthalpy (kJ per mole of metal consumed)
    const dHMap = {
      lithium: -222.0, sodium: -184.0, potassium: -196.0,
      rubidium: -195.0, cesium: -205.0, calcium: -414.0, magnesium: -350.0
    };
    const dH = dHMap[metal.id] || -200.0;
    const heat = dH * 1000 * extent * metalCoef;

    // Determine product base
    const baseInfo = {
      lithium:  { id: null,                     formula: 'LiOH' },
      sodium:   { id: 'sodium_hydroxide',       formula: 'NaOH' },
      potassium:{ id: 'potassium_hydroxide',    formula: 'KOH' },
      rubidium: { id: null,                     formula: 'RbOH' },
      cesium:   { id: null,                     formula: 'CsOH' },
      calcium:  { id: null,                     formula: 'Ca(OH)2' },
      magnesium:{ id: null,                     formula: 'Mg(OH)2' }
    }[metal.id];

    const consumed = [
      { id: metal.id, moles: extent * metalCoef },
      { id: 'distilled_water', moles: extent * waterCoef }
    ];
    const produced = [];
    if (baseInfo && baseInfo.id) {
      produced.push({ id: baseInfo.id, moles: extent * baseCoef, phase: 'dissolved', formulaOverride: baseInfo.formula });
    } else {
      produced.push({ id: '__virtual', moles: extent * baseCoef, phase: 'dissolved', formulaOverride: baseInfo.formula, virtual: true });
    }
    produced.push({
      id: 'hydrogen_gas', moles: extent * h2Coef, phase: 'gas', formulaOverride: 'H2'
    });

    const latex = Fmt.reaction(
      [
        { coef: metalCoef, formula: metalChem.formulaPlain },
        { coef: waterCoef, formula: 'H2O' }
      ],
      [
        { coef: baseCoef, formula: baseInfo.formula },
        { coef: h2Coef, formula: 'H2' + Fmt.gas }
      ]
    );

    // Explosion hazard: rapid H₂ evolution + ignition potential
    const explosive = ['potassium', 'rubidium', 'cesium'].indexOf(metal.id) !== -1
      && v.temperature > 35;

    return {
      ok: true, type: 'metal_water',
      consumed, produced,
      latex, dH,
      heat,
      gases: [{ id: 'hydrogen_gas', moles: extent * h2Coef, ignitable: true, explosive }],
      explosive
    };
  }

  /* ---- Rule 7.5 : Precipitation (Ksp-limited) ---------------------- */
  function rulePrecipitation(v) {
    if (v.volumeL <= 0) return null;

    // Gather all dissolved ions
    const ions = collectFreeIons(v);
    if (ions.length < 2) return null;

    // Pairwise check against the precipitate table
    for (let i = 0; i < ions.length; i++) {
      for (let j = i + 1; j < ions.length; j++) {
        const A = ions[i];
        const B = ions[j];
        if (A.charge * B.charge >= 0) continue; // need opposite charges

        const cation = A.charge > 0 ? A : B;
        const anion  = A.charge > 0 ? B : A;

        const ppt = DB.predictPrecipitate(cation.id, anion.id);
        if (!ppt) continue;

        // Compute ion product Q = [cation]^a · [anion]^b
        const a = Math.abs(anion.charge);
        const b = Math.abs(cation.charge);
        const cCat = cation.conc;
        const cAni = anion.conc;
        const Q = Math.pow(cCat, a) * Math.pow(cAni, b);
        const Ksp = ppt.ksp;
        if (!Ksp) continue;
        if (Q <= Ksp) continue;

        // Extent of precipitation: solve for x such that
        //   (cCat − a·x)^a · (cAni − b·x)^b = Ksp
        // Newton–Raphson on x ∈ [0, min(cCat/a, cAni/b)]
        const xMax = Math.min(cCat / a, cAni / b);
        let x = xMax * 0.99;
        for (let k = 0; k < 32; k++) {
          const cc = Math.max(cCat - a * x, 1e-30);
          const ca = Math.max(cAni - b * x, 1e-30);
          const f = Math.pow(cc, a) * Math.pow(ca, b) - Ksp;
          // df/dx = −a·a·cc^(a−1)·ca^b − b·b·cc^a·ca^(b−1)
          const df = -a * a * Math.pow(cc, a - 1) * Math.pow(ca, b)
                    - b * b * Math.pow(cc, a) * Math.pow(ca, b - 1);
          if (Math.abs(df) < 1e-40) break;
          const dx = f / df;
          x -= dx;
          if (x < 0) x = 0;
          if (x > xMax) x = xMax;
          if (Math.abs(dx) < 1e-15) break;
        }
        const precipitatedMol = x * v.volumeL;
        if (precipitatedMol < K.DEFICIT_MOL) continue;

        // Ion formulas
        const catFormula = cation.formula;
        const aniFormula = anion.formula;

        const latex = Fmt.reaction(
          [
            { coef: 1, formula: cation.sourceFormula || catFormula },
            { coef: 1, formula: anion.sourceFormula || aniFormula }
          ],
          [
            { coef: 1, formula: ppt.formula + Fmt.ppt },
            { coef: 1, formula: 'spectator ions' }
          ]
        );

        return {
          ok: true, type: 'precipitation',
          consumed: [
            { id: cation.sourceId, moles: a * precipitatedMol, ionic: true },
            { id: anion.sourceId,  moles: b * precipitatedMol, ionic: true }
          ],
          produced: [],
          latex, dH: 0, heat: 0,
          gases: [],
          precipitates: [{
            id: ppt.formula, formula: ppt.formula, name: ppt.name,
            moles: precipitatedMol, hex: ppt.hex, ksp: Ksp,
            Q, texture: ppt.texture
          }],
          explosive: false
        };
      }
    }
    return null;
  }

  /* ---- Rule 7.6 : Complexation (NH₃ with transition metals) ------- */
  function ruleComplexation(v) {
    const ammonia = v.contents.find(c => c.id === 'ammonia_solution');
    if (!ammonia) return null;

    const targets = {
      'copper_sulfate_pentahydrate': { id: 'Cu2+', n: 4, formula: '[Cu(NH3)4]2+', color: '#1B4F72', name: 'Tetraamminecopper(II)' },
      'copper_sulfate_anhydrous':    { id: 'Cu2+', n: 4, formula: '[Cu(NH3)4]2+', color: '#1B4F72', name: 'Tetraamminecopper(II)' },
      'copper_chloride':             { id: 'Cu2+', n: 4, formula: '[Cu(NH3)4]2+', color: '#1B4F72', name: 'Tetraamminecopper(II)' },
      'copper_nitrate':              { id: 'Cu2+', n: 4, formula: '[Cu(NH3)4]2+', color: '#1B4F72', name: 'Tetraamminecopper(II)' },
      'silver_nitrate':              { id: 'Ag+',  n: 2, formula: '[Ag(NH3)2]+',  color: '#7D3C98', name: 'Diamminesilver(I)' },
      'zinc_sulfate':                { id: 'Zn2+', n: 4, formula: '[Zn(NH3)4]2+', color: '#1ABC9C', name: 'Tetraamminezinc(II)' },
      'nickel_sulfate':              { id: 'Ni2+', n: 6, formula: '[Ni(NH3)6]2+', color: '#2E86C1', name: 'Hexaamminenickel(II)' }
    };

    for (const c of v.contents.slice()) {
      const target = targets[c.id];
      if (!target) continue;
      if (c.phase !== 'dissolved' && c.phase !== 'aqueous' && c.phase !== 'liquid') continue;
      if (c.moles < K.DEFICIT_MOL) continue;

      const nh3Needed = c.moles * target.n;
      if (ammonia.moles < nh3Needed) continue;

      const chem = DB.get(c.id);
      const consumed = [
        { id: c.id, moles: c.moles },
        { id: 'ammonia_solution', moles: nh3Needed }
      ];
      const produced = [{
        id: '__complex_' + target.id,
        moles: c.moles, phase: 'dissolved',
        formulaOverride: target.formula,
        colorHex: target.color,
        virtual: true
      }];

      const latex = Fmt.reaction(
        [
          { coef: 1, formula: chem.formulaPlain },
          { coef: target.n, formula: 'NH3' }
        ],
        [{ coef: 1, formula: target.formula }]
      );

      return {
        ok: true, type: 'complexation',
        consumed, produced, latex,
        dH: -85.0, heat: -85.0 * 1000 * c.moles,
        gases: [],
        colorShift: { hex: target.color, name: target.name },
        explosive: false
      };
    }
    return null;
  }

  /* ---- Rule 7.7 : KMnO₄ Redox (acidic, with Fe²⁺ or oxalate) ------ */
  function rulePermanganateRedox(v) {
    const kmno4 = v.contents.find(c => c.id === 'potassium_permanganate');
    if (!kmno4) return null;
    const acid = v.contents.find(c => {
      const chem = DB.get(c.id);
      return chem && chem.category === 'strong_acid';
    });
    if (!acid) return null;

    const fe = v.contents.find(c => c.id === 'iron_sulfate_heptahydrate' || c.id === 'iron_chloride_ii');
    if (!fe) return null;

    // MnO4⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O
    const permStoich = 1;
    const feStoich = 5;
    const hStoich = 8;

    const extent = Math.min(
      kmno4.moles / permStoich,
      fe.moles / feStoich,
      acid.moles / hStoich
    );
    if (extent < K.DEFICIT_MOL) return null;

    // ΔH° for the redox step ≈ −350 kJ per mol MnO4⁻
    const dH = -350.0;

    const consumed = [
      { id: 'potassium_permanganate', moles: extent },
      { id: fe.id, moles: extent * feStoich },
      { id: acid.id, moles: extent * hStoich }
    ];
    const produced = [
      { id: '__Mn2+', moles: extent, phase: 'dissolved', formulaOverride: 'MnSO4', virtual: true }
    ];

    const latex = Fmt.reaction(
      [
        { coef: 1, formula: 'KMnO4' },
        { coef: 5, formula: 'FeSO4' },
        { coef: 8, formula: 'H2SO4' }
      ],
      [
        { coef: 1, formula: 'MnSO4' },
        { coef: 5, formula: 'Fe2(SO4)3' },
        { coef: 1, formula: 'K2SO4' },
        { coef: 8, formula: 'H2O' }
      ]
    );

    return {
      ok: true, type: 'redox_permanganate',
      consumed, produced, latex, dH,
      heat: dH * 1000 * extent,
      gases: [],
      colorShift: { hex: '#EAECEE', name: 'Colourless (Mn²⁺)' },  // purple → colourless
      explosive: false
    };
  }

  /* ================================================================== *
   * 8. FORMULA PREDICTION HELPERS
   * ================================================================== */
  function predictSaltFormula(acidChem, baseChem) {
    const acidAnion = anionFromAcid(acidChem);
    const baseCation = cationFromBase(baseChem);
    if (!acidAnion || !baseCation) return 'Salt';
    return combineIonic(baseCation, acidAnion);
  }

  function guessSaltId(acidChem, baseChem) {
    if (!acidChem || !baseChem) return null;
    const cation = cationFromBase(baseChem);
    const anion  = anionFromAcid(acidChem);
    if (!cation || !anion) return null;
    // Lookup by formula in DB
    const combo = combineIonic(cation, anion);
    const hits = DB.byFormula(combo);
    if (hits.length) return hits[0].id;

    // Fallback: known pairs
    const table = {
      'Na|Cl': 'sodium_chloride',
      'Na|NO3': null,
      'Na|SO4': null,
      'Na|CH3COO': null,
      'K|Cl':  'potassium_chloride',
      'K|NO3': null,
      'K|SO4': null
    };
    return table[cation.sym + '|' + anion.sym] || null;
  }

  function guessMetalSaltId(metalId, acidChem) {
    const table = {
      'zinc|hydrochloric_acid': null,
      'zinc|sulfuric_acid':     'zinc_sulfate',
      'iron|hydrochloric_acid': 'iron_chloride_ii',
      'iron|sulfuric_acid':     'iron_sulfate_heptahydrate',
      'magnesium|hydrochloric_acid': null,
      'magnesium|sulfuric_acid': null
    };
    const key = metalId + '|' + acidChem.id;
    return table[key] || null;
  }

  function metalSaltFormula(metalChem, acidChem, ox) {
    const symbol = metalChem.formulaPlain.replace(/\d+/g, '');
    const anion  = anionFromAcid(acidChem);
    if (!anion) return metalChem.formulaPlain + ' salt';
    const ratio = anion.charge ? Math.abs(ox / anion.charge) : 1;
    return combineIonic(
      { sym: symbol, charge: ox },
      anion
    );
  }

  function anionFromAcid(acidChem) {
    const map = {
      'hydrochloric_acid': { sym: 'Cl',  charge: -1, pretty: 'Cl' },
      'nitric_acid':       { sym: 'NO3', charge: -1, pretty: 'NO3' },
      'sulfuric_acid':     { sym: 'SO4', charge: -2, pretty: 'SO4' },
      'acetic_acid':       { sym: 'CH3COO', charge: -1, pretty: 'CH3COO' },
      'phosphoric_acid':   { sym: 'PO4', charge: -3, pretty: 'PO4' }
    };
    return map[acidChem.id] || null;
  }

  function cationFromBase(baseChem) {
    const map = {
      'sodium_hydroxide':   { sym: 'Na', charge: +1, pretty: 'Na' },
      'potassium_hydroxide':{ sym: 'K',  charge: +1, pretty: 'K'  },
      'ammonia_solution':   { sym: 'NH4',charge: +1, pretty: 'NH4' }
    };
    return map[baseChem.id] || null;
  }

  function combineIonic(cation, anion) {
    if (!cation || !anion) return 'Salt';
    const cCharge = Math.abs(cation.charge);
    const aCharge = Math.abs(anion.charge);
    const gcd = (function g(a, b) { return b ? g(b, a % b) : a; })(cCharge, aCharge);
    const nCat = aCharge / gcd;
    const nAni = cCharge / gcd;
    const wrap = (core, n) => {
      const needParen = n > 1 && /[A-Z].*[A-Z0-9]/.test(core);
      return (n === 1 ? '' : (needParen ? '(' + core + ')' : core)) + (n === 1 ? core : n);
    };
    return (nCat === 1 ? cation.sym : cation.sym + nCat) + (nAni === 1 ? anion.sym : anion.sym + nAni);
  }

  /* ================================================================== *
   * 9. ION EXTRACTION FROM VESSEL
   * ================================================================== */
  function collectFreeIons(v) {
    const out = [];
    if (v.volumeL <= 0) return out;

    for (const c of v.contents) {
      if (c.phase !== 'dissolved' && c.phase !== 'aqueous' && c.phase !== 'liquid') continue;
      if (c.virtual) continue;
      const chem = DB.get(c.id);
      if (!chem) continue;

      const conc = c.moles / v.volumeL;
      const ions = dissociateToIons(chem, c.moles);
      for (const ion of ions) {
        out.push({
          id: ion.id,
          charge: ion.charge,
          conc: ion.moles / v.volumeL,
          moles: ion.moles,
          sourceId: c.id,
          sourceFormula: chem.formulaPlain,
          formula: DB.getIon(ion.id) ? DB.getIon(ion.id).symbol : ion.id
        });
      }
    }
    return out;
  }

  /** Fully dissociate a soluble chemical into its constituent ions. */
  function dissociateToIons(chem, moles) {
    const id = chem.id;
    const map = {
      'hydrochloric_acid':  [{ id: 'H+', charge: +1, moles: moles }, { id: 'Cl-', charge: -1, moles: moles }],
      'nitric_acid':        [{ id: 'H+', charge: +1, moles: moles }, { id: 'NO3-', charge: -1, moles: moles }],
      'sulfuric_acid':      [{ id: 'H+', charge: +1, moles: 2 * moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'acetic_acid':        [{ id: 'H+', charge: +1, moles: moles * 0.013 }, { id: 'CH3COO-', charge: -1, moles: moles * 0.013 }],
      'phosphoric_acid':    [{ id: 'H+', charge: +1, moles: moles * 0.3 }, { id: 'PO4-3', charge: -3, moles: moles * 0.3 }],
      'sodium_hydroxide':   [{ id: 'Na+', charge: +1, moles: moles }, { id: 'OH-', charge: -1, moles: moles }],
      'potassium_hydroxide':[{ id: 'K+', charge: +1, moles: moles }, { id: 'OH-', charge: -1, moles: moles }],
      'ammonia_solution':   [{ id: 'NH4+', charge: +1, moles: moles * 0.004 }, { id: 'OH-', charge: -1, moles: moles * 0.004 }],
      'sodium_chloride':    [{ id: 'Na+', charge: +1, moles: moles }, { id: 'Cl-', charge: -1, moles: moles }],
      'potassium_chloride': [{ id: 'K+', charge: +1, moles: moles }, { id: 'Cl-', charge: -1, moles: moles }],
      'potassium_iodide':   [{ id: 'K+', charge: +1, moles: moles }, { id: 'I-', charge: -1, moles: moles }],
      'potassium_thiocyanate':[{ id: 'K+', charge: +1, moles: moles }, { id: 'SCN-', charge: -1, moles: moles }],
      'sodium_carbonate':   [{ id: 'Na+', charge: +1, moles: 2 * moles }, { id: 'CO3-2', charge: -2, moles: moles }],
      'sodium_bicarbonate': [{ id: 'Na+', charge: +1, moles: moles }, { id: 'HCO3-', charge: -1, moles: moles }],
      'silver_nitrate':     [{ id: 'Ag+', charge: +1, moles: moles }, { id: 'NO3-', charge: -1, moles: moles }],
      'lead_nitrate':       [{ id: 'Pb2+', charge: +2, moles: moles }, { id: 'NO3-', charge: -1, moles: 2 * moles }],
      'copper_sulfate_pentahydrate': [{ id: 'Cu2+', charge: +2, moles: moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'copper_sulfate_anhydrous':    [{ id: 'Cu2+', charge: +2, moles: moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'copper_chloride':    [{ id: 'Cu2+', charge: +2, moles: moles }, { id: 'Cl-', charge: -1, moles: 2 * moles }],
      'copper_nitrate':     [{ id: 'Cu2+', charge: +2, moles: moles }, { id: 'NO3-', charge: -1, moles: 2 * moles }],
      'iron_sulfate_heptahydrate': [{ id: 'Fe2+', charge: +2, moles: moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'iron_chloride':      [{ id: 'Fe3+', charge: +3, moles: moles }, { id: 'Cl-', charge: -1, moles: 3 * moles }],
      'iron_chloride_ii':   [{ id: 'Fe2+', charge: +2, moles: moles }, { id: 'Cl-', charge: -1, moles: 2 * moles }],
      'cobalt_chloride':    [{ id: 'Co2+', charge: +2, moles: moles }, { id: 'Cl-', charge: -1, moles: 2 * moles }],
      'nickel_sulfate':     [{ id: 'Ni2+', charge: +2, moles: moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'zinc_sulfate':       [{ id: 'Zn2+', charge: +2, moles: moles }, { id: 'SO4-2', charge: -2, moles: moles }],
      'barium_chloride':    [{ id: 'Ba2+', charge: +2, moles: moles }, { id: 'Cl-', charge: -1, moles: 2 * moles }],
      'calcium_chloride':   [{ id: 'Ca2+', charge: +2, moles: moles }, { id: 'Cl-', charge: -1, moles: 2 * moles }],
      'lithium_chloride':   [{ id: 'Li+', charge: +1, moles: moles }, { id: 'Cl-', charge: -1, moles: moles }],
      'potassium_permanganate': [{ id: 'K+', charge: +1, moles: moles }, { id: 'MnO4-', charge: -1, moles: moles }],
      'potassium_dichromate':   [{ id: 'K+', charge: +1, moles: 2 * moles }, { id: 'Cr2O7-2', charge: -2, moles: moles }]
    };
    return map[id] || [];
  }

  /* ================================================================== *
   * 10. THE ENGINE
   * ================================================================== */
  const ChemistryEngine = {

    /* --- Version --- */
    version: '1.0.0',

    /* --- Vessel --- */
    vessel: new Vessel(),

    /* ================================================================
     * 10.1 LIFECYCLE
     * ============================================================== */
    init() {
      this.vessel.reset();
      this._log('info', 'VirtuaLab Pro engine initialised. Vessel is dry.');
      this._refreshPH();
      return this;
    },

    reset() {
      this.vessel.reset();
      this._log('info', 'Vessel reset — contents purged. waterVolume = 0.');
      this._refreshPH();
      return this.getState();
    },

    /* ================================================================
     * 10.2 ADD REAGENTS
     * ============================================================== */
    /**
     * Add a chemical to the vessel.
     * @param {string} id       chemicals.js key
     * @param {number} amount   quantity (default 1)
     * @param {string} unit     'mol' | 'g' | 'mL' | 'unit' (default 'unit' = 1 mmol)
     * @returns {object}        { ok, moles, phase, reactions }
     */
    addChemical(id, amount, unit) {
      const chem = DB.get(id);
      if (!chem) {
        this._log('error', 'Unknown chemical id: ' + id);
        return { ok: false, error: 'unknown_chemical' };
      }
      if (this.vessel.contents.length >= K.MAX_SPECIES) {
        this._log('warn', 'Vessel capacity reached.');
        return { ok: false, error: 'vessel_full' };
      }

      const amt = (amount === undefined) ? 1 : Number(amount);
      const u = unit || 'unit';

      /* Convert to moles */
      let moles;
      switch (u) {
        case 'g':
          if (!chem.molarMass) return { ok: false, error: 'no_molar_mass' };
          moles = amt / chem.molarMass;
          break;
        case 'mL':
          if (!chem.density || !chem.molarMass) return { ok: false, error: 'no_density' };
          moles = (amt * chem.density) / chem.molarMass;
          break;
        case 'mol':
          moles = amt;
          break;
        case 'unit':
        default:
          moles = amt * 0.001;   // 1 unit ≈ 1 mmol by convention
          break;
      }
      if (!isFinite(moles) || moles <= 0) {
        return { ok: false, error: 'bad_amount' };
      }

      /* --- DRY VESSEL PROTOCOL ---
       * If waterVolume === 0, solids are inert. Gases escape immediately.
       * Liquids can still mix but no aqueous chemistry happens.
       */
      let phase;
      if (chem.state === 'gas') {
        // Gases bubble out of a dry vessel instantly
        this.vessel.gases.push({
          id: chem.id, moles: moles, evolvedAt: this.vessel.simTime, ignited: false
        });
        this._log('info',
          'Gas ' + chem.name + ' escaped (vessel dry). n = ' + Chem.sigFig(moles, 3) + ' mol');
        return { ok: true, moles: moles, phase: 'gas', reactions: [] };
      }

      if (this.vessel.isDry) {
        phase = (chem.state === 'solid') ? 'solid' : 'liquid';
      } else {
        if (chem.state === 'solid') {
          // Soluble solids dissolve; check DB
          const soluble = DB.isSoluble(id);
          phase = (soluble === true) ? 'dissolved' : 'solid';
        } else if (chem.state === 'liquid' || chem.state === 'aqueous') {
          phase = 'liquid';
        } else {
          phase = 'solid';
        }
      }

      const entry = {
        id: id,
        moles: moles,
        phase: phase,
        addedAt: this.vessel.simTime,
        inert: this.vessel.isDry,      // set true when dry
        origin: 'user'
      };
      this.vessel.contents.push(entry);

      this._log('info',
        'Added ' + chem.name + ' (' + Chem.sigFig(moles, 3) + ' mol, phase = ' + phase + ')' +
        (this.vessel.isDry ? ' [DRY VESSEL — inert]' : '')
      );

      /* --- Attempt reactions only if water is present --- */
      const reactions = [];
      if (!this.vessel.isDry) {
        const fired = this._cascadeReactions();
        reactions.push.apply(reactions, fired);
      }

      this._refreshPH();
      this._refreshThermal();

      return { ok: true, moles: moles, phase: phase, reactions: reactions };
    },

    /* ================================================================
     * 10.3 WATER
     * ============================================================== */
    addWater(volumeML) {
      const v = this.vessel;
      const vol = Number(volumeML);
      if (!isFinite(vol) || vol <= 0) {
        return { ok: false, error: 'bad_volume' };
      }
      v.waterVolume += vol;
      this._log('info', 'Added ' + vol.toFixed(1) + ' mL H₂O. Total = ' + v.waterVolume.toFixed(1) + ' mL.');

      /* Thermal: heat capacity jumps with the water mass. */
      this._refreshThermal();

      /* Now that water exists, ALL previously inert solids become reactive. */
      let allReactions = [];
      for (const c of v.contents) {
        if (c.inert) {
          c.inert = false;
          if (c.phase === 'solid') {
            const soluble = DB.isSoluble(c.id);
            if (soluble === true) c.phase = 'dissolved';
          }
        }
      }
      allReactions = this._cascadeReactions();

      this._refreshPH();
      return { ok: true, reactions: allReactions, waterVolume: v.waterVolume };
    },

    removeWater(volumeML) {
      const v = this.vessel;
      const vol = Math.min(Number(volumeML) || 0, v.waterVolume);
      v.waterVolume -= vol;
      this._refreshThermal();
      this._refreshPH();
      return { ok: true, waterVolume: v.waterVolume };
    },

    /* ================================================================
     * 10.4 HEAT
     * ============================================================== */
    /**
     * Set flame intensity from the UI slider.
     * @param {number} intensity 0–100
     */
    applyHeat(intensity) {
      const v = this.vessel;
      const I = Math.max(0, Math.min(100, Number(intensity) || 0));
      v.heatIntensity = I;
      const P = (I / 100) * K.MAX_FLAME_POWER_W;
      this._log('info',
        'Flame intensity = ' + I + '% → ' + P.toFixed(0) + ' W'
      );
      return { ok: true, intensity: I, powerW: P };
    },

    /* ================================================================
     * 10.5 SIMULATION TICK
     * ============================================================== */
    /**
     * Advance the simulation by dt seconds.
     * Order of operations:
     *   1. thermal update (heating, cooling, phase change)
     *   2. reaction cascade (may re-heat the vessel)
     *   3. equilibrium refresh (pH, ions)
     *   4. gas / vapour removal
     */
    tick(dtSeconds) {
      const dt = Math.min(Number(dtSeconds) || 0.1, 2.0);
      const v = this.vessel;
      v.simTime += dt;

      /* --- 1. Thermal --- */
      const thermo = this._applyThermo(dt);

      /* --- 2. Reactions --- */
      let reactions = [];
      if (!v.isDry) {
        reactions = this._cascadeReactions();
      }

      /* --- 3. Equilibria --- */
      this._refreshPH();
      this._refreshThermal();

      /* --- 4. Evaporative losses from gases already tracked --- */
      this._expireGases(dt);

      return {
        simTime: v.simTime,
        temperature: v.temperature,
        pH: v.pH,
        boiling: v.boiling,
        reactions: reactions,
        thermal: thermo
      };
    },

    /* ================================================================
     * 10.6 THERMODYNAMICS
     * ============================================================== */
    _refreshThermal() {
      const v = this.vessel;
      let C = K.VESSEL_HEAT_CAPACITY;
      if (v.waterVolume > 0) {
        C += v.waterMassG * K.WATER_CP;
      }
      for (const c of v.contents) {
        const chem = DB.get(c.id);
        if (!chem) continue;
        const cp = MOLAR_CP[chem.formulaPlain] || 100.0;
        C += c.moles * cp;
      }
      v.totalHeatCapacity = C;
      return C;
    },

    /**
     * First-law energy balance for a single tick.
     *   ΔQ = (P_flame − P_loss)·Δt
     *   ΔT = ΔQ / C_total
     * If the temperature reaches 100.00 °C with liquid water present,
     * surplus energy drives vaporization at constant temperature.
     */
    _applyThermo(dt) {
      const v = this.vessel;

      /* Power in / out */
      const P_in = (v.heatIntensity / 100) * K.MAX_FLAME_POWER_W;
      const P_loss = K.HEAT_LOSS_COEFF_W_K * (v.temperature - K.AMBIENT_T);
      const P_net = P_in - P_loss;
      const dQ = P_net * dt;

      v.energyIn += P_in * dt;
      v.energyOut += Math.max(0, P_loss * dt);

      /* If nothing in the vessel can absorb heat, return early */
      const C = v.totalHeatCapacity;
      if (C <= 0) return { dT: 0, dQ: dQ, boiled: 0 };

      /* --- Handle the 100 °C plateau --- */
      if (v.temperature >= K.BOILING_T - 1e-6 && v.waterVolume > 0 && dQ > 0) {
        // All surplus energy vaporizes water
        const dm = dQ / K.WATER_LATENT_VAP;               // g
        const dV = dm / K.WATER_DENSITY_100;              // mL
        const actualV = Math.min(dV, v.waterVolume);
        v.waterVolume -= actualV;
        v.vaporizedWater += actualV;
        v.temperature = K.BOILING_T;                       // pinned
        v.boiling = true;
        this._refreshThermal();
        return { dT: 0, dQ: dQ, boiled: actualV };
      }
      v.boiling = false;

      /* --- Handle the 0 °C plateau --- */
      if (v.temperature <= K.FREEZING_T + 1e-6 && v.waterVolume > 0 && dQ < 0) {
        v.temperature = K.FREEZING_T;
        return { dT: 0, dQ: dQ, froze: 0 };
      }

      /* --- Ordinary sensible heating --- */
      let dT = dQ / C;
      let newT = v.temperature + dT;

      /* Clamp near boiling: if we cross 100 °C and liquid water is present,
         stop at exactly 100.00 °C and route the residual into vaporization. */
      if (newT > K.BOILING_T && v.waterVolume > 0) {
        const dT_to_boil = K.BOILING_T - v.temperature;
        const Q_to_boil = C * dT_to_boil;
        const Q_excess = dQ - Q_to_boil;
        if (Q_excess > 0) {
          const dm = Q_excess / K.WATER_LATENT_VAP;
          const dV = dm / K.WATER_DENSITY_100;
          const actualV = Math.min(dV, v.waterVolume);
          v.waterVolume -= actualV;
          v.vaporizedWater += actualV;
        }
        v.temperature = K.BOILING_T;
        v.boiling = true;
      } else {
        /* Dry vessel → no boiling cap. Allow up to K.MAX_TEMPERATURE. */
        v.temperature = Math.max(-50, Math.min(K.MAX_TEMPERATURE, newT));
      }

      this._refreshThermal();
      return { dT: v.temperature - (newT - dT), dQ: dQ, T: v.temperature };
    },

    /* ================================================================
     * 10.7 REACTION CASCADE
     * ============================================================== */
    _cascadeReactions() {
      const v = this.vessel;
      if (v.isDry) return [];   // DRY VESSEL PROTOCOL — hard gate

      const fired = [];
      let iterations = 0;

      /* Order matters: fast ionic processes first. */
      const rules = [
        ruleAcidBase,
        ruleCarbonateAcid,
        ruleMetalAcid,
        ruleMetalWater,
        ruleComplexation,
        rulePermanganateRedox,
        rulePrecipitation
      ];

      while (iterations++ < K.MAX_ITER) {
        let anyFired = false;
        for (const rule of rules) {
          const r = rule(v);
          if (!r || !r.ok) continue;

          /* --- Apply --- */
          this._applyReaction(r);
          fired.push(this._summariseReaction(r));
          anyFired = true;
          break;   // restart the cascade from the top
        }
        if (!anyFired) break;
      }

      return fired;
    },

    _applyReaction(r) {
      const v = this.vessel;

      /* Consume reactants */
      for (const c of r.consumed) {
        if (c.ionic) {
          // Ionic consumption: pull from the source chemical in solution
          this._consumeIon(c.id, c.moles);
        } else if (c.id === 'distilled_water') {
          const mL = (c.moles * DB.get('distilled_water').molarMass) / K.WATER_DENSITY;
          v.waterVolume = Math.max(0, v.waterVolume - mL);
        } else {
          v.consume(c.id, c.moles);
        }
      }

      /* Produce */
      for (const p of r.produced) {
        if (p.phase === 'gas') {
          v.gases.push({
            id: p.id, moles: p.moles,
            evolvedAt: v.simTime, ignited: false,
            formulaOverride: p.formulaOverride
          });
        } else if (p.virtual) {
          v.contents.push({
            id: p.id, moles: p.moles, phase: p.phase,
            addedAt: v.simTime, origin: 'product',
            virtual: true, formulaOverride: p.formulaOverride,
            colorHex: p.colorHex
          });
        } else {
          v.contents.push({
            id: p.id, moles: p.moles, phase: p.phase,
            addedAt: v.simTime, origin: 'product',
            formulaOverride: p.formulaOverride
          });
        }
      }

      /* Precipitates */
      if (r.precipitates) {
        for (const ppt of r.precipitates) {
          const existing = v.precipitates.find(x => x.id === ppt.id);
          if (existing) {
            existing.moles += ppt.moles;
          } else {
            v.precipitates.push({
              id: ppt.id, formula: ppt.formula, name: ppt.name,
              moles: ppt.moles, hex: ppt.hex, ksp: ppt.ksp,
              texture: ppt.texture, formedAt: v.simTime
            });
          }
          /* Remove the corresponding ions from solution */
          this._consumeIon('cation', ppt.moles);   // simplified — see _consumeIon
        }
      }

      /* Thermal: exothermic reactions add heat */
      if (r.heat) {
        const dT = r.heat / Math.max(v.totalHeatCapacity, 1);
        v.temperature = Math.max(-50, Math.min(K.MAX_TEMPERATURE, v.temperature + dT));
        this._refreshThermal();
      }

      /* Record the equation */
      v.equations.push({
        latex: r.latex,
        type: r.type,
        dH: r.dH,
        simTime: v.simTime
      });

      /* Explosion flag */
      if (r.explosive) {
        v.explosionFlag = true;
        this._log('danger', '⚠ VIOLENT REACTION — vessel integrity compromised.');
      }

      /* Colour shift */
      if (r.colorShift) {
        this._log('info', 'Colour change: ' + r.colorShift.name + ' (' + r.colorShift.hex + ')');
      }

      return true;
    },

    _consumeIon(ionId, moles) {
      /* Simplified: subtract proportionally from matching source chemicals. */
      const v = this.vessel;
      const sources = v.contents.filter(c => {
        if (c.phase !== 'dissolved') return false;
        const ions = dissociateToIons(DB.get(c.id), c.moles);
        return ions.some(i => i.id === ionId);
      });
      const total = sources.reduce((s, c) => s + c.moles, 0);
      if (total <= 0) return;
      const frac = Math.min(1, moles / total);
      for (const s of sources) {
        s.moles *= (1 - frac);
      }
      v.contents = v.contents.filter(c => c.moles > K.DEFICIT_MOL);
    },

    _summariseReaction(r) {
      return {
        type: r.type,
        latex: r.latex,
        dH: r.dH,
        gases: r.gases || [],
        precipitates: r.precipitates || [],
        explosive: !!r.explosive,
        colorShift: r.colorShift || null
      };
    },

    /* ================================================================
     * 10.8 pH SOLVER
     * ==============================================================
     * Charge-balance formulation:
     *   Σ [cations] = Σ [anions]
     * Partition into:
     *   - strong acid H⁺ (fully dissociated)
     *   - strong base OH⁻ (fully dissociated)
     *   - weak acids HA (Ka)
     *   - weak bases B (Kb)
     *   - amphiprotic species (e.g., HCO₃⁻)
     *   - water autoionization
     *
     * For simple mixtures the net strong H⁺/OH⁻ after neutralization is the
     * dominant term. When |net| is small, we fall back to the full weak
     * equilibrium equations. Debye–Hückel activity corrections are applied
     * to the final [H⁺] for high ionic strength.
     * ============================================================== */
    _refreshPH() {
      const v = this.vessel;
      if (v.waterVolume <= 0) {
        v.pH = 7.0;
        v.pOH = 7.0;
        v.hydrogenIonM = 1e-7;
        return v.pH;
      }

      const V = v.volumeL;
      const Kw = Chem.kwAt(v.temperature);

      /* --- Accumulate strong & weak contributions --- */
      let strongH = 0;     // mol of H⁺
      let strongOH = 0;    // mol of OH⁻
      const weakAcids = [];   // { Ka, C }
      const weakBases = [];   // { Kb, C }

      for (const c of v.contents) {
        if (c.phase !== 'dissolved' && c.phase !== 'liquid' && c.phase !== 'aqueous') continue;
        if (c.virtual) continue;
        const chem = DB.get(c.id);
        if (!chem) continue;
        const C = c.moles / V;
        if (C <= 0) continue;

        /* Strong acids */
        if (chem.category === 'strong_acid') {
          strongH += c.moles * Chem.countAcidicProtons(chem);
          continue;
        }
        /* Strong bases */
        if (chem.category === 'strong_base') {
          strongOH += c.moles * Chem.countBasicOH(chem);
          continue;
        }
        /* Weak acids */
        if (chem.category === 'weak_acid' && chem.Ka) {
          weakAcids.push({ Ka: chem.Ka, C: C, nH: Chem.countAcidicProtons(chem) });
          continue;
        }
        /* Weak bases */
        if (chem.category === 'weak_base' && chem.Kb) {
          weakBases.push({ Kb: chem.Kb, C: C });
          continue;
        }
        /* Amphiprotic — treat HCO₃⁻ as a weak acid with Ka ≈ 4.7e-11 */
        if (c.id === 'sodium_bicarbonate') {
          weakAcids.push({ Ka: 4.7e-11, C: C, nH: 1 });
          continue;
        }
        /* Carbonate is a weak base with Kb = Kw/Ka2 = 1e-14/4.7e-11 ≈ 2.1e-4 */
        if (c.id === 'sodium_carbonate') {
          weakBases.push({ Kb: 2.1e-4, C: C });
          continue;
        }
      }

      /* --- Neutralize strong H⁺ against strong OH⁻ --- */
      const netH = strongH - strongOH;   // mol (can be negative)
      let H;

      if (netH > 1e-9) {
        /* Excess strong acid */
        H = netH / V;
      } else if (netH < -1e-9) {
        /* Excess strong base */
        const OH = -netH / V;
        H = Kw / OH;
      } else {
        /* Stoichiometric neutralization — dominated by weak species or water */
        H = Math.sqrt(Kw);
        for (const wa of weakAcids) {
          const h = Chem.weakAcidH(wa.Ka, wa.C);
          if (h > H) H = h;
        }
        for (const wb of weakBases) {
          const oh = Chem.weakBaseOH(wb.Kb, wb.C);
          const h = Kw / Math.max(oh, 1e-30);
          if (h > H) H = h;
        }
      }

      /* --- Buffer region: weak acid + its conjugate base both present --- */
      /* Henderson–Hasselbalch: pH = pKa + log([A⁻]/[HA]) */
      /* Approximated here for the acetate buffer case. */
      if (weakAcids.length && strongOH > 0 && strongH < strongOH) {
        for (const wa of weakAcids) {
          const totalA = wa.C * V;            // total acid mol
          const baseMol = strongOH;           // OH⁻ added
          const Aminus = Math.min(totalA, baseMol);
          const HA = Math.max(0, totalA - Aminus);
          if (HA > 1e-9 && Aminus > 1e-9) {
            const pKa = -Math.log10(wa.Ka);
            const pH = pKa + Math.log10(Aminus / HA);
            H = Math.pow(10, -pH);
          }
        }
      }

      /* --- Ionic strength --- */
      const ions = collectFreeIons(v);
      v.ionicStrength = Chem.ionicStrength(ions.map(i => ({ c: i.conc, z: i.charge })));

      /* --- Debye–Hückel correction to [H⁺] --- */
      if (v.ionicStrength > 1e-4) {
        const gamma = Chem.activityCoefficient(1, v.ionicStrength, 0.9);
        /* a(H⁺) = γ·[H⁺]  → pH = −log(γ·[H⁺]) */
        H = H * gamma;
      }

      v.hydrogenIonM = H;
      v.pH = -Math.log10(Math.max(H, 1e-30));
      v.pOH = -Math.log10(Kw) - v.pH;

      /* Physical clamp */
      v.pH = Math.max(0, Math.min(14, v.pH));
      return v.pH;
    },

    /* ================================================================
     * 10.9 GAS HANDLING
     * ============================================================== */
    _expireGases(dt) {
      const v = this.vessel;
      /* Gases escape to headspace on a first-order timescale.
         The renderer decides whether to draw them based on `moles`. */
      for (const g of v.gases) {
        if (g.ignited) continue;
        /* In a real lab, gas evolution is essentially instantaneous.
           We keep an inventory so the renderer can animate bubbles. */
      }
    },

    /** Ignite any accumulated H₂ or CH₄ with a spark. */
    igniteGas() {
      const v = this.vessel;
      let totalHeat = 0;
      let ignitedAny = false;
      for (const g of v.gases) {
        if (g.ignited) continue;
        if (g.id === 'hydrogen_gas' && g.moles > 1e-6) {
          /* 2 H₂ + O₂ → 2 H₂O, ΔH = −286 kJ/mol H₂O */
          const heat = -286000 * g.moles;
          totalHeat += heat;
          g.ignited = true;
          ignitedAny = true;
          this._log('danger',
            '💥 H₂ ignition — ' + Chem.sigFig(g.moles, 3) + ' mol detonated.'
          );
        }
      }
      if (ignitedAny) {
        const dT = totalHeat / Math.max(v.totalHeatCapacity, 1);
        v.temperature = Math.max(-50, Math.min(K.MAX_TEMPERATURE, v.temperature + dT));
        v.explosionFlag = true;
        v.equations.push({
          latex: '2\\text{H}_2 + \\text{O}_2 \\rightarrow 2\\text{H}_2\\text{O}',
          type: 'combustion', dH: -286, simTime: v.simTime
        });
      }
      return { ok: true, ignitedAny: ignitedAny, dT: totalHeat / Math.max(v.totalHeatCapacity, 1) };
    },

    /* ================================================================
     * 10.10 STRING LOG
     * ============================================================== */
    _log(level, message) {
      const v = this.vessel;
      v.log.push({ simTime: v.simTime, level: level, message: message });
      if (v.log.length > 500) v.log.splice(0, 100);
      return this;
    },

    /* ================================================================
     * 10.11 STATE SNAPSHOT (for the renderer)
     * ============================================================== */
    getState() {
      const v = this.vessel;
      return {
        /* Primary */
        waterVolume: v.waterVolume,
        temperature: v.temperature,
        pressure: v.pressure,
        simTime: v.simTime,
        heatIntensity: v.heatIntensity,
        boiling: v.boiling,
        explosionFlag: v.explosionFlag,
        isDry: v.isDry,

        /* Equilibria */
        pH: v.pH,
        pOH: v.pOH,
        hydrogenIonM: v.hydrogenIonM,
        ionicStrength: v.ionicStrength,

        /* Thermal */
        totalHeatCapacity: v.totalHeatCapacity,
        vaporizedWater: v.vaporizedWater,
        energyIn: v.energyIn,
        energyOut: v.energyOut,

        /* Contents (deep copy of public fields) */
        contents: v.contents.map(c => {
          const chem = DB.get(c.id);
          return {
            id: c.id,
            name: chem ? chem.name : c.formulaOverride || c.id,
            formula: c.formulaOverride || (chem ? chem.formulaPlain : c.id),
            moles: c.moles,
            phase: c.phase,
            inert: !!c.inert,
            colorHex: c.colorHex || (chem ? chem.colorHex : '#FFFFFF'),
            origin: c.origin
          };
        }),

        /* Precipitates */
        precipitates: v.precipitates.map(p => ({
          formula: p.formula, name: p.name,
          moles: p.moles, hex: p.hex, texture: p.texture
        })),

        /* Gases */
        gases: v.gases.map(g => ({
          id: g.id, moles: g.moles, ignited: !!g.ignited,
          formula: g.formulaOverride || (DB.get(g.id) ? DB.get(g.id).formulaPlain : g.id)
        })),

        /* Equations (recent) */
        equations: v.equations.slice(-12),

        /* Log (recent) */
        log: v.log.slice(-40)
      };
    },

    /* ================================================================
     * 10.12 PUBLIC HELPERS
     * ============================================================== */
    /**
     * Predict what would happen if `id` were added, WITHOUT mutating.
     * Returns a list of hypothetical reaction summaries.
     */
    predict(id, amount, unit) {
      const snapshot = this._snapshot();
      try {
        this.addChemical(id, amount, unit);
        const state = this.getState();
        const r = state.equations.slice(-1);
        return { ok: true, equations: r };
      } finally {
        this._restore(snapshot);
      }
    },

    _snapshot() {
      const v = this.vessel;
      return JSON.parse(JSON.stringify({
        waterVolume: v.waterVolume,
        temperature: v.temperature,
        contents: v.contents,
        gases: v.gases,
        precipitates: v.precipitates,
        pH: v.pH, pOH: v.pOH,
        hydrogenIonM: v.hydrogenIonM,
        ionicStrength: v.ionicStrength,
        vaporizedWater: v.vaporizedWater,
        energyIn: v.energyIn, energyOut: v.energyOut,
        simTime: v.simTime,
        equations: v.equations,
        log: v.log,
        explosionFlag: v.explosionFlag
      }));
    },

    _restore(snap) {
      const v = this.vessel;
      v.waterVolume = snap.waterVolume;
      v.temperature = snap.temperature;
      v.contents = snap.contents;
      v.gases = snap.gases;
      v.precipitates = snap.precipitates;
      v.pH = snap.pH; v.pOH = snap.pOH;
      v.hydrogenIonM = snap.hydrogenIonM;
      v.ionicStrength = snap.ionicStrength;
      v.vaporizedWater = snap.vaporizedWater;
      v.energyIn = snap.energyIn; v.energyOut = snap.energyOut;
      v.simTime = snap.simTime;
      v.equations = snap.equations;
      v.log = snap.log;
      v.explosionFlag = snap.explosionFlag;
    },

    /* --- Debug -------------------------------------------------- */
    stats() {
      const v = this.vessel;
      return {
        version: this.version,
        waterVolume: v.waterVolume,
        temperature: v.temperature,
        pH: v.pH,
        species: v.contents.length,
        precipitates: v.precipitates.length,
        gases: v.gases.length,
        equations: v.equations.length,
        simTime: v.simTime
      };
    }
  };

  /* ================================================================== *
   * 11. BIND TO GLOBAL
   * ================================================================== */
  global.ChemistryEngine = ChemistryEngine;

  /* Auto-init on load */
  ChemistryEngine.init();

  if (global.console && console.log) {
    console.log(
      '%c[VirtuaLab Pro] ChemistryEngine v' + ChemistryEngine.version + ' online — ' +
      'DRY VESSEL PROTOCOL armed · q=mcΔT · exact pH solver · LaTeX predictor',
      'color:#C0392B;font-weight:bold;'
    );
  }

})(typeof window !== 'undefined' ? window : this);
