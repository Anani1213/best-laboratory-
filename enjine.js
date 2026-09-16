/* ============================================================================
 * VirtuaLab Pro — engine.js
 * ----------------------------------------------------------------------------
 * Computational chemistry simulation core.
 *
 * Exposes  window.ChemistryEngine  and  window.ChemistryEngine.VesselState
 *
 * Public API
 *   ChemistryEngine.addChemical(id, amount, unit)
 *   ChemistryEngine.heatVessel(heatLevel)         // 0..10 Bunsen burner
 *   ChemistryEngine.resetVessel()
 *   ChemistryEngine.getTelemetry()
 *   ChemistryEngine.getVessel()
 *   ChemistryEngine.listChemicals()
 *   ChemistryEngine.findChemical(query)
 *   ChemistryEngine.createVessel()
 *
 * Interoperates with an optional  window.ChemicalsDB  (chemicals.js).
 * Every field that chemicals.js supplies overrides the internal fallback
 * record, so the engine keeps working even if chemicals.js is absent.
 * ========================================================================== */

(function (global) {
  'use strict';

  /* ==========================================================================
   * SECTION 1 — PHYSICAL CONSTANTS
   * ========================================================================== */

  const VERSION = '1.0.0';

  const C_WATER          = 4.184;      // J · g⁻¹ · K⁻¹  (specific heat capacity)
  const C_SOLID          = 0.85;       // J · g⁻¹ · K⁻¹  (average solid)
  const WATER_DENSITY    = 1.0;        // g / mL
  const WATER_MM         = 18.015;     // g / mol
  const MOLAR_GAS_VOL    = 22.4;       // L / mol at STP
  const LATENT_VAP       = 2257;       // J / g  (water vaporisation)
  const NEUTRALISATION_H = 57.3;       // kJ / mol  (H⁺ + OH⁻ → H₂O)
  const AMBIENT_T        = 25.0;       // °C
  const MAX_TEMP         = 1500.0;     // °C hard ceiling
  const MIN_TEMP         = -50.0;      // °C hard floor
  const EPS              = 1e-12;
  const KW               = 1.0e-14;    // water auto-ionisation at 25 °C

  /* ==========================================================================
   * SECTION 2 — SMALL UTILITIES
   * ========================================================================== */

  const SUB_DIGITS = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };

  function sub(n) {
    return String(n).split('').map(function (c) {
      return SUB_DIGITS[c] || c;
    }).join('');
  }

  function clamp(x, lo, hi) {
    if (!isFinite(x)) return lo;
    return x < lo ? lo : (x > hi ? hi : x);
  }

  function num(x, fallback) {
    const v = Number(x);
    return isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
  }

  function round(x, dp) {
    const f = Math.pow(10, dp === undefined ? 4 : dp);
    return Math.round(x * f) / f;
  }

  function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepCopy);
    const out = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepCopy(obj[k]);
    }
    return out;
  }

  /* ==========================================================================
   * SECTION 3 — SPECIES REGISTRY (aqueous ions & molecules)
   * ========================================================================== */

  const SPECIES_DB = {
    /* ---- strong acid / strong base ions ---- */
    'H+':      { display: 'H⁺',      name: 'Hydrogen ion',   charge: +1, molarMass: 1.008,  kind: 'strong-acid' },
    'OH-':     { display: 'OH⁻',     name: 'Hydroxide',      charge: -1, molarMass: 17.007, kind: 'strong-base' },

    /* ---- alkali / alkaline earth cations ---- */
    'Li+':     { display: 'Li⁺',     name: 'Lithium ion',    charge: +1, molarMass: 6.94 },
    'Na+':     { display: 'Na⁺',     name: 'Sodium ion',     charge: +1, molarMass: 22.990 },
    'K+':      { display: 'K⁺',      name: 'Potassium ion',  charge: +1, molarMass: 39.098 },
    'Rb+':     { display: 'Rb⁺',     name: 'Rubidium ion',   charge: +1, molarMass: 85.468 },
    'Cs+':     { display: 'Cs⁺',     name: 'Caesium ion',    charge: +1, molarMass: 132.905 },
    'Ca2+':    { display: 'Ca²⁺',    name: 'Calcium ion',    charge: +2, molarMass: 40.078 },
    'Mg2+':    { display: 'Mg²⁺',    name: 'Magnesium ion',  charge: +2, molarMass: 24.305 },
    'Sr2+':    { display: 'Sr²⁺',    name: 'Strontium ion',  charge: +2, molarMass: 87.620 },
    'Ba2+':    { display: 'Ba²⁺',    name: 'Barium ion',     charge: +2, molarMass: 137.327 },

    /* ---- transition / post-transition cations ---- */
    'Al3+':    { display: 'Al³⁺',    name: 'Aluminium ion',  charge: +3, molarMass: 26.982 },
    'Zn2+':    { display: 'Zn²⁺',    name: 'Zinc ion',       charge: +2, molarMass: 65.380 },
    'Fe2+':    { display: 'Fe²⁺',    name: 'Iron(II) ion',   charge: +2, molarMass: 55.845 },
    'Fe3+':    { display: 'Fe³⁺',    name: 'Iron(III) ion',  charge: +3, molarMass: 55.845 },
    'Cu2+':    { display: 'Cu²⁺',    name: 'Copper(II) ion', charge: +2, molarMass: 63.546 },
    'Pb2+':    { display: 'Pb²⁺',    name: 'Lead(II) ion',   charge: +2, molarMass: 207.200 },
    'Ag+':     { display: 'Ag⁺',     name: 'Silver ion',     charge: +1, molarMass: 107.868 },
    'Mn2+':    { display: 'Mn²⁺',    name: 'Manganese(II)',  charge: +2, molarMass: 54.938 },
    'Ni2+':    { display: 'Ni²⁺',    name: 'Nickel(II) ion', charge: +2, molarMass: 58.693 },
    'Sn2+':    { display: 'Sn²⁺',    name: 'Tin(II) ion',    charge: +2, molarMass: 118.710 },

    /* ---- anions ---- */
    'Cl-':     { display: 'Cl⁻',     name: 'Chloride',       charge: -1, molarMass: 35.450 },
    'Br-':     { display: 'Br⁻',     name: 'Bromide',        charge: -1, molarMass: 79.904 },
    'I-':      { display: 'I⁻',      name: 'Iodide',         charge: -1, molarMass: 126.904 },
    'F-':      { display: 'F⁻',      name: 'Fluoride',       charge: -1, molarMass: 18.998 },
    'NO3-':    { display: 'NO₃⁻',    name: 'Nitrate',        charge: -1, molarMass: 62.004 },
    'NO2-':    { display: 'NO₂⁻',    name: 'Nitrite',        charge: -1, molarMass: 46.005 },
    'SO4^2-':  { display: 'SO₄²⁻',   name: 'Sulfate',        charge: -2, molarMass: 96.060 },
    'HSO4-':   { display: 'HSO₄⁻',   name: 'Hydrogensulfate',charge: -1, molarMass: 97.068, ka: 1.2e-2, conjugateBase: 'SO4^2-' },
    'CO3^2-':  { display: 'CO₃²⁻',   name: 'Carbonate',      charge: -2, molarMass: 60.009, kb: 2.1e-4, conjugateAcid: 'HCO3-' },
    'HCO3-':   { display: 'HCO₃⁻',   name: 'Hydrogencarbonate', charge: -1, molarMass: 61.017, ka: 4.7e-11, kb: 2.3e-8, conjugateAcid: 'H2CO3', conjugateBase: 'CO3^2-' },
    'ClO3-':   { display: 'ClO₃⁻',   name: 'Chlorate',       charge: -1, molarMass: 83.451 },
    'MnO4-':   { display: 'MnO₄⁻',   name: 'Permanganate',   charge: -1, molarMass: 118.936 },
    'CrO4^2-': { display: 'CrO₄²⁻',  name: 'Chromate',       charge: -2, molarMass: 115.994 },
    'PO4^3-':  { display: 'PO₄³⁻',   name: 'Phosphate',      charge: -3, molarMass: 94.971, kb: 2.4e-2, conjugateAcid: 'HPO4^2-' },
    'HPO4^2-': { display: 'HPO₄²⁻',  name: 'Hydrogenphosphate', charge: -2, molarMass: 95.979, ka: 4.8e-13, kb: 1.6e-7, conjugateAcid: 'H2PO4-', conjugateBase: 'PO4^3-' },
    'H2PO4-':  { display: 'H₂PO₄⁻',  name: 'Dihydrogenphosphate', charge: -1, molarMass: 96.987, ka: 6.2e-8, conjugateBase: 'HPO4^2-' },
    'CH3COO-': { display: 'CH₃COO⁻', name: 'Acetate',        charge: -1, molarMass: 59.044, kb: 5.6e-10, conjugateAcid: 'CH3COOH' },
    'HS-':     { display: 'HS⁻',     name: 'Hydrogensulfide',charge: -1, molarMass: 33.072, ka: 1.0e-19, kb: 1.0e-7, conjugateAcid: 'H2S', conjugateBase: 'S^2-' },
    'S^2-':    { display: 'S²⁻',     name: 'Sulfide',        charge: -2, molarMass: 32.065, kb: 1.0e-1, conjugateAcid: 'HS-' },
    'HSO3-':   { display: 'HSO₃⁻',   name: 'Hydrogensulfite',charge: -1, molarMass: 81.072, ka: 6.3e-8, conjugateBase: 'SO3^2-' },
    'SO3^2-':  { display: 'SO₃²⁻',   name: 'Sulfite',        charge: -2, molarMass: 80.064, kb: 1.6e-7, conjugateAcid: 'HSO3-' },

    /* ---- weak molecular acids / bases ---- */
    'CH3COOH': { display: 'CH₃COOH', name: 'Acetic acid',    charge: 0, molarMass: 60.052, ka: 1.8e-5, conjugateBase: 'CH3COO-', kind: 'weak-acid' },
    'H2CO3':   { display: 'H₂CO₃',   name: 'Carbonic acid',  charge: 0, molarMass: 62.024, ka: 4.3e-7, conjugateBase: 'HCO3-', kind: 'weak-acid' },
    'H2SO3':   { display: 'H₂SO₃',   name: 'Sulfurous acid', charge: 0, molarMass: 82.070, ka: 1.5e-2, conjugateBase: 'HSO3-', kind: 'weak-acid' },
    'H3PO4':   { display: 'H₃PO₄',   name: 'Phosphoric acid',charge: 0, molarMass: 97.994, ka: 7.1e-3, conjugateBase: 'H2PO4-', kind: 'weak-acid' },
    'H2S':     { display: 'H₂S',     name: 'Hydrogen sulfide', charge: 0, molarMass: 34.081, ka: 1.0e-7, conjugateBase: 'HS-', kind: 'weak-acid' },
    'NH3':     { display: 'NH₃',     name: 'Ammonia',        charge: 0, molarMass: 17.031, kb: 1.8e-5, conjugateAcid: 'NH4+', kind: 'weak-base' },
    'NH4+':    { display: 'NH₄⁺',    name: 'Ammonium',       charge: +1, molarMass: 18.039, ka: 5.6e-10, conjugateBase: 'NH3', kind: 'weak-acid' },
    'HNO2':    { display: 'HNO₂',    name: 'Nitrous acid',   charge: 0, molarMass: 47.013, ka: 7.2e-4, conjugateBase: 'NO2-', kind: 'weak-acid' }
  };

  function getSpecies(sp) {
    if (SPECIES_DB[sp]) return SPECIES_DB[sp];
    return { display: sp, name: sp, charge: 0, molarMass: 50, kind: 'spectator' };
  }

  function fmtSpecies(sp) {
    return getSpecies(sp).display;
  }

  function isWeakAcid(sp) {
    const s = SPECIES_DB[sp];
    return !!(s && s.ka);
  }

  function isWeakBase(sp) {
    const s = SPECIES_DB[sp];
    return !!(s && s.kb);
  }

  /* ==========================================================================
   * SECTION 4 — SOLUBILITY PRODUCT TABLE (Ksp)
   * ========================================================================== */

  const KSP_TABLE = [
    { id: 'silver-chloride',   name: 'Silver chloride',    formula: 'AgCl',    cation: { sp: 'Ag+',    n: 1 }, anion: { sp: 'Cl-',    n: 1 }, ksp: 1.77e-10, molarMass: 143.321, dH: -65.5 },
    { id: 'silver-bromide',    name: 'Silver bromide',     formula: 'AgBr',    cation: { sp: 'Ag+',    n: 1 }, anion: { sp: 'Br-',    n: 1 }, ksp: 5.35e-13, molarMass: 187.772, dH: -84.4 },
    { id: 'silver-iodide',     name: 'Silver iodide',      formula: 'AgI',     cation: { sp: 'Ag+',    n: 1 }, anion: { sp: 'I-',     n: 1 }, ksp: 8.52e-17, molarMass: 234.773, dH: -111.0 },
    { id: 'silver-carbonate',  name: 'Silver carbonate',   formula: 'Ag₂CO₃',  cation: { sp: 'Ag+',    n: 2 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 8.46e-12, molarMass: 275.745, dH: -40.0 },
    { id: 'silver-sulfate',    name: 'Silver sulfate',     formula: 'Ag₂SO₄',  cation: { sp: 'Ag+',    n: 2 }, anion: { sp: 'SO4^2-', n: 1 }, ksp: 1.20e-5,  molarMass: 311.799, dH: -20.0 },
    { id: 'silver-hydroxide',  name: 'Silver hydroxide',   formula: 'AgOH',    cation: { sp: 'Ag+',    n: 1 }, anion: { sp: 'OH-',    n: 1 }, ksp: 2.00e-8,  molarMass: 124.875, dH: -30.0 },
    { id: 'lead-iodide',       name: 'Lead(II) iodide',    formula: 'PbI₂',    cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'I-',     n: 2 }, ksp: 9.80e-9,  molarMass: 461.009, dH: -50.0 },
    { id: 'lead-chloride',     name: 'Lead(II) chloride',  formula: 'PbCl₂',   cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'Cl-',    n: 2 }, ksp: 1.70e-5,  molarMass: 278.106, dH: -25.0 },
    { id: 'lead-sulfate',      name: 'Lead(II) sulfate',   formula: 'PbSO₄',   cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'SO4^2-', n: 1 }, ksp: 2.53e-8,  molarMass: 303.256, dH: -30.0 },
    { id: 'lead-carbonate',    name: 'Lead(II) carbonate', formula: 'PbCO₃',   cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 7.40e-14, molarMass: 267.209, dH: -30.0 },
    { id: 'lead-hydroxide',    name: 'Lead(II) hydroxide', formula: 'Pb(OH)₂', cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 1.43e-20, molarMass: 241.215, dH: -40.0 },
    { id: 'lead-chromate',     name: 'Lead(II) chromate',  formula: 'PbCrO₄',  cation: { sp: 'Pb2+',   n: 1 }, anion: { sp: 'CrO4^2-',n: 1 }, ksp: 2.80e-13, molarMass: 323.194, dH: -40.0 },
    { id: 'barium-sulfate',    name: 'Barium sulfate',     formula: 'BaSO₄',   cation: { sp: 'Ba2+',   n: 1 }, anion: { sp: 'SO4^2-', n: 1 }, ksp: 1.08e-10, molarMass: 233.390, dH: -45.0 },
    { id: 'barium-carbonate',  name: 'Barium carbonate',   formula: 'BaCO₃',   cation: { sp: 'Ba2+',   n: 1 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 5.10e-9,  molarMass: 197.336, dH: -30.0 },
    { id: 'calcium-carbonate', name: 'Calcium carbonate',  formula: 'CaCO₃',   cation: { sp: 'Ca2+',   n: 1 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 3.36e-9,  molarMass: 100.087, dH: -25.0 },
    { id: 'calcium-sulfate',   name: 'Calcium sulfate',    formula: 'CaSO₄',   cation: { sp: 'Ca2+',   n: 1 }, anion: { sp: 'SO4^2-', n: 1 }, ksp: 4.93e-5,  molarMass: 136.141, dH: -18.0 },
    { id: 'calcium-hydroxide', name: 'Calcium hydroxide',  formula: 'Ca(OH)₂', cation: { sp: 'Ca2+',   n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 5.50e-6,  molarMass: 74.093,  dH: -18.0 },
    { id: 'magnesium-hydroxide', name: 'Magnesium hydroxide', formula: 'Mg(OH)₂', cation: { sp: 'Mg2+', n: 1 }, anion: { sp: 'OH-',  n: 2 }, ksp: 5.61e-12, molarMass: 58.320,  dH: -35.0 },
    { id: 'copper-hydroxide',  name: 'Copper(II) hydroxide', formula: 'Cu(OH)₂', cation: { sp: 'Cu2+', n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 2.20e-20, molarMass: 97.561,  dH: -40.0 },
    { id: 'copper-carbonate',  name: 'Copper(II) carbonate', formula: 'CuCO₃',  cation: { sp: 'Cu2+',   n: 1 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 1.40e-10, molarMass: 123.555, dH: -30.0 },
    { id: 'iron-hydroxide',    name: 'Iron(III) hydroxide', formula: 'Fe(OH)₃', cation: { sp: 'Fe3+',  n: 1 }, anion: { sp: 'OH-',    n: 3 }, ksp: 2.79e-39, molarMass: 106.867, dH: -50.0 },
    { id: 'iron2-hydroxide',   name: 'Iron(II) hydroxide', formula: 'Fe(OH)₂', cation: { sp: 'Fe2+',   n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 4.87e-17, molarMass: 89.859,  dH: -45.0 },
    { id: 'aluminium-hydroxide', name: 'Aluminium hydroxide', formula: 'Al(OH)₃', cation: { sp: 'Al3+', n: 1 }, anion: { sp: 'OH-',   n: 3 }, ksp: 1.30e-33, molarMass: 78.004,  dH: -50.0 },
    { id: 'zinc-hydroxide',    name: 'Zinc hydroxide',     formula: 'Zn(OH)₂', cation: { sp: 'Zn2+',   n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 3.00e-17, molarMass: 99.424,  dH: -40.0 },
    { id: 'zinc-carbonate',    name: 'Zinc carbonate',     formula: 'ZnCO₃',   cation: { sp: 'Zn2+',   n: 1 }, anion: { sp: 'CO3^2-', n: 1 }, ksp: 1.46e-10, molarMass: 125.418, dH: -30.0 },
    { id: 'nickel-hydroxide',  name: 'Nickel(II) hydroxide', formula: 'Ni(OH)₂', cation: { sp: 'Ni2+', n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 5.48e-16, molarMass: 92.708,  dH: -40.0 },
    { id: 'manganese-hydroxide', name: 'Manganese(II) hydroxide', formula: 'Mn(OH)₂', cation: { sp: 'Mn2+', n: 1 }, anion: { sp: 'OH-', n: 2 }, ksp: 1.90e-13, molarMass: 88.952, dH: -40.0 },
    { id: 'barium-hydroxide',  name: 'Barium hydroxide',   formula: 'Ba(OH)₂', cation: { sp: 'Ba2+',   n: 1 }, anion: { sp: 'OH-',    n: 2 }, ksp: 5.00e-3,  molarMass: 171.342, dH: -15.0 },
    { id: 'strontium-sulfate', name: 'Strontium sulfate',  formula: 'SrSO₄',   cation: { sp: 'Sr2+',   n: 1 }, anion: { sp: 'SO4^2-', n: 1 }, ksp: 3.44e-7,  molarMass: 183.680, dH: -25.0 }
  ];

  /* ==========================================================================
   * SECTION 5 — INTERNAL FALLBACK CHEMICAL DATABASE
   * --------------------------------------------------------------------------
   * Every record carries the physical data the engine needs.  If
   * window.ChemicalsDB provides the same id, its fields override these.
   * ========================================================================== */

  const FALLBACK_DB = {

    /* ------------------------------ SOLVENTS ------------------------------ */
    'water': {
      id: 'water', name: 'Water', formula: 'H₂O', plainFormula: 'H2O',
      state: 'l', category: 'solvent', molarMass: 18.015, density: 1.0,
      soluble: true, solvent: true, aliases: ['h2o', 'aqua', 'dihydrogen monoxide']
    },
    'ethanol': {
      id: 'ethanol', name: 'Ethanol', formula: 'C₂H₅OH', plainFormula: 'C2H5OH',
      state: 'l', category: 'solvent', molarMass: 46.068, density: 0.789,
      soluble: true, aliases: ['ethyl alcohol', 'c2h5oh']
    },

    /* --------------------------- ALKALI METALS ---------------------------- */
    'lithium': {
      id: 'lithium', name: 'Lithium', formula: 'Li', state: 's',
      category: 'alkali-metal', molarMass: 6.94, density: 0.534,
      ion: 'Li+', charge: 1, hydroxideFormula: 'LiOH',
      enthalpyWater: -222.0, hazard: 'moderate', flameColor: '#DC143C',
      aliases: ['li']
    },
    'sodium': {
      id: 'sodium', name: 'Sodium', formula: 'Na', state: 's',
      category: 'alkali-metal', molarMass: 22.990, density: 0.968,
      ion: 'Na+', charge: 1, hydroxideFormula: 'NaOH',
      enthalpyWater: -184.0, hazard: 'high', flameColor: '#FFD700',
      aliases: ['na']
    },
    'potassium': {
      id: 'potassium', name: 'Potassium', formula: 'K', state: 's',
      category: 'alkali-metal', molarMass: 39.098, density: 0.862,
      ion: 'K+', charge: 1, hydroxideFormula: 'KOH',
      enthalpyWater: -196.0, hazard: 'high', flameColor: '#C77DFF',
      aliases: ['k']
    },
    'rubidium': {
      id: 'rubidium', name: 'Rubidium', formula: 'Rb', state: 's',
      category: 'alkali-metal', molarMass: 85.468, density: 1.532,
      ion: 'Rb+', charge: 1, hydroxideFormula: 'RbOH',
      enthalpyWater: -195.0, hazard: 'explosive', flameColor: '#FF2D55',
      aliases: ['rb']
    },
    'caesium': {
      id: 'caesium', name: 'Caesium', formula: 'Cs', state: 's',
      category: 'alkali-metal', molarMass: 132.905, density: 1.879,
      ion: 'Cs+', charge: 1, hydroxideFormula: 'CsOH',
      enthalpyWater: -205.0, hazard: 'explosive', flameColor: '#4169E1',
      aliases: ['cesium', 'cs']
    },

    /* ------------------------- ALKALINE EARTH METALS ---------------------- */
    'calcium': {
      id: 'calcium', name: 'Calcium', formula: 'Ca', state: 's',
      category: 'alkaline-earth-metal', molarMass: 40.078, density: 1.55,
      ion: 'Ca2+', charge: 2, hydroxideFormula: 'Ca(OH)₂',
      enthalpyWater: -414.0, enthalpyAcid: -543.0,
      flameColor: '#FF6B35', minWaterTemp: 0, aliases: ['ca']
    },
    'magnesium': {
      id: 'magnesium', name: 'Magnesium', formula: 'Mg', state: 's',
      category: 'alkaline-earth-metal', molarMass: 24.305, density: 1.738,
      ion: 'Mg2+', charge: 2, hydroxideFormula: 'Mg(OH)₂',
      enthalpyWater: -353.0, enthalpyAcid: -462.0,
      minWaterTemp: 60, aliases: ['mg']
    },
    'strontium': {
      id: 'strontium', name: 'Strontium', formula: 'Sr', state: 's',
      category: 'alkaline-earth-metal', molarMass: 87.620, density: 2.64,
      ion: 'Sr2+', charge: 2, hydroxideFormula: 'Sr(OH)₂',
      enthalpyWater: -432.0, enthalpyAcid: -560.0,
      flameColor: '#FF2400', minWaterTemp: 0, aliases: ['sr']
    },
    'barium': {
      id: 'barium', name: 'Barium', formula: 'Ba', state: 's',
      category: 'alkaline-earth-metal', molarMass: 137.327, density: 3.51,
      ion: 'Ba2+', charge: 2, hydroxideFormula: 'Ba(OH)₂',
      enthalpyWater: -470.0, enthalpyAcid: -590.0,
      flameColor: '#7FFF00', minWaterTemp: 0, aliases: ['ba']
    },

    /* ---------------------------- OTHER METALS ---------------------------- */
    'aluminium': {
      id: 'aluminium', name: 'Aluminium', formula: 'Al', state: 's',
      category: 'metal', molarMass: 26.982, density: 2.70,
      ion: 'Al3+', charge: 3, enthalpyAcid: -531.0,
      acidReaction: { hConsumed: 3, products: { 'Al3+': 1 }, gas: { id: 'H2', moles: 1.5 }, dH: -531.0 },
      aliases: ['aluminum', 'al']
    },
    'zinc': {
      id: 'zinc', name: 'Zinc', formula: 'Zn', state: 's',
      category: 'metal', molarMass: 65.380, density: 7.14,
      ion: 'Zn2+', charge: 2, enthalpyAcid: -153.0,
      acidReaction: { hConsumed: 2, products: { 'Zn2+': 1 }, gas: { id: 'H2', moles: 1 }, dH: -153.0 },
      aliases: ['zn']
    },
    'iron': {
      id: 'iron', name: 'Iron', formula: 'Fe', state: 's',
      category: 'metal', molarMass: 55.845, density: 7.874,
      ion: 'Fe2+', charge: 2, enthalpyAcid: -87.0,
      acidReaction: { hConsumed: 2, products: { 'Fe2+': 1 }, gas: { id: 'H2', moles: 1 }, dH: -87.0 },
      aliases: ['fe']
    },
    'copper': {
      id: 'copper', name: 'Copper', formula: 'Cu', state: 's',
      category: 'metal', molarMass: 63.546, density: 8.96,
      ion: 'Cu2+', charge: 2, nobleMetal: true, flameColor: '#00E5C0',
      aliases: ['cu']
    },
    'manganese': {
      id: 'manganese', name: 'Manganese', formula: 'Mn', state: 's',
      category: 'metal', molarMass: 54.938, density: 7.21,
      ion: 'Mn2+', charge: 2, enthalpyAcid: -221.0,
      acidReaction: { hConsumed: 2, products: { 'Mn2+': 1 }, gas: { id: 'H2', moles: 1 }, dH: -221.0 },
      aliases: ['mn']
    },
    'nickel': {
      id: 'nickel', name: 'Nickel', formula: 'Ni', state: 's',
      category: 'metal', molarMass: 58.693, density: 8.908,
      ion: 'Ni2+', charge: 2, enthalpyAcid: -110.0,
      acidReaction: { hConsumed: 2, products: { 'Ni2+': 1 }, gas: { id: 'H2', moles: 1 }, dH: -110.0 },
      aliases: ['ni']
    },
    'lead': {
      id: 'lead', name: 'Lead', formula: 'Pb', state: 's',
      category: 'metal', molarMass: 207.200, density: 11.34,
      ion: 'Pb2+', charge: 2, nobleMetal: true, flameColor: '#9AC0FF',
      aliases: ['pb']
    },
    'silver': {
      id: 'silver', name: 'Silver', formula: 'Ag', state: 's',
      category: 'metal', molarMass: 107.868, density: 10.49,
      ion: 'Ag+', charge: 1, nobleMetal: true,
      aliases: ['ag']
    },
    'tin': {
      id: 'tin', name: 'Tin', formula: 'Sn', state: 's',
      category: 'metal', molarMass: 118.710, density: 7.31,
      ion: 'Sn2+', charge: 2, nobleMetal: true, aliases: ['sn']
    },

    /* ------------------------------- ACIDS -------------------------------- */
    'hydrochloric-acid': {
      id: 'hydrochloric-acid', name: 'Hydrochloric acid', formula: 'HCl', plainFormula: 'HCl',
      state: 'aq', category: 'acid', molarMass: 36.461, density: 1.18,
      ions: { 'H+': 1, 'Cl-': 1 }, strong: true,
      heatOfSolution: -75.0, soluble: true,
      acidReaction: { hConsumed: 1 },
      aliases: ['hcl', 'muriatic acid', 'hydrogen chloride']
    },
    'sulfuric-acid': {
      id: 'sulfuric-acid', name: 'Sulfuric acid', formula: 'H₂SO₄', plainFormula: 'H2SO4',
      state: 'aq', category: 'acid', molarMass: 98.079, density: 1.84,
      ions: { 'H+': 2, 'SO4^2-': 1 }, strong: true,
      heatOfSolution: -88.0, soluble: true,
      acidReaction: { hConsumed: 2 },
      aliases: ['h2so4', 'oil of vitriol']
    },
    'nitric-acid': {
      id: 'nitric-acid', name: 'Nitric acid', formula: 'HNO₃', plainFormula: 'HNO3',
      state: 'aq', category: 'acid', molarMass: 63.012, density: 1.51,
      ions: { 'H+': 1, 'NO3-': 1 }, strong: true, oxidising: true,
      heatOfSolution: -33.0, soluble: true,
      acidReaction: { hConsumed: 1 },
      aliases: ['hno3', 'aqua fortis']
    },
    'acetic-acid': {
      id: 'acetic-acid', name: 'Acetic acid', formula: 'CH₃COOH', plainFormula: 'CH3COOH',
      state: 'aq', category: 'acid', molarMass: 60.052, density: 1.049,
      ions: { 'CH3COOH': 1 }, strong: false, weakSpecies: 'CH3COOH',
      heatOfSolution: -1.5, soluble: true,
      acidReaction: { hConsumed: 1, weak: true },
      aliases: ['ch3cooh', 'ethanoic acid', 'vinegar']
    },
    'phosphoric-acid': {
      id: 'phosphoric-acid', name: 'Phosphoric acid', formula: 'H₃PO₄', plainFormula: 'H3PO4',
      state: 'aq', category: 'acid', molarMass: 97.994, density: 1.685,
      ions: { 'H3PO4': 1 }, strong: false, weakSpecies: 'H3PO4',
      heatOfSolution: -12.0, soluble: true,
      acidReaction: { hConsumed: 3, weak: true },
      aliases: ['h3po4']
    },

    /* ------------------------------- BASES -------------------------------- */
    'sodium-hydroxide': {
      id: 'sodium-hydroxide', name: 'Sodium hydroxide', formula: 'NaOH',
      state: 's', category: 'base', molarMass: 39.997, density: 2.13,
      ions: { 'Na+': 1, 'OH-': 1 }, strong: true, soluble: true,
      heatOfSolution: -44.5,
      aliases: ['naoh', 'caustic soda', 'lye']
    },
    'potassium-hydroxide': {
      id: 'potassium-hydroxide', name: 'Potassium hydroxide', formula: 'KOH',
      state: 's', category: 'base', molarMass: 56.106, density: 2.044,
      ions: { 'K+': 1, 'OH-': 1 }, strong: true, soluble: true,
      heatOfSolution: -57.6,
      aliases: ['koh', 'caustic potash']
    },
    'lithium-hydroxide': {
      id: 'lithium-hydroxide', name: 'Lithium hydroxide', formula: 'LiOH',
      state: 's', category: 'base', molarMass: 23.948, density: 1.46,
      ions: { 'Li+': 1, 'OH-': 1 }, strong: true, soluble: true,
      heatOfSolution: -23.6, aliases: ['lioh']
    },
    'calcium-hydroxide': {
      id: 'calcium-hydroxide', name: 'Calcium hydroxide', formula: 'Ca(OH)₂',
      state: 's', category: 'base', molarMass: 74.093, density: 2.211,
      ions: { 'Ca2+': 1, 'OH-': 2 }, strong: true, soluble: true,
      heatOfSolution: -16.2, aliases: ['ca(oh)2', 'slaked lime', 'portlandite']
    },
    'barium-hydroxide': {
      id: 'barium-hydroxide', name: 'Barium hydroxide', formula: 'Ba(OH)₂',
      state: 's', category: 'base', molarMass: 171.342, density: 3.743,
      ions: { 'Ba2+': 1, 'OH-': 2 }, strong: true, soluble: true,
      heatOfSolution: -52.0, aliases: ['ba(oh)2', 'baryta']
    },
    'ammonia': {
      id: 'ammonia', name: 'Ammonia', formula: 'NH₃', plainFormula: 'NH3',
      state: 'aq', category: 'base', molarMass: 17.031, density: 0.90,
      ions: { 'NH3': 1 }, strong: false, weakSpecies: 'NH3', soluble: true,
      heatOfSolution: -30.5, gasForm: true,
      aliases: ['nh3', 'ammonium hydroxide', 'azane']
    },

    /* ------------------------------- SALTS -------------------------------- */
    'sodium-chloride': {
      id: 'sodium-chloride', name: 'Sodium chloride', formula: 'NaCl',
      state: 's', category: 'salt', molarMass: 58.443, density: 2.165,
      ions: { 'Na+': 1, 'Cl-': 1 }, soluble: true, heatOfSolution: 3.9,
      flameColor: '#FFD700',
      aliases: ['nacl', 'table salt', 'halite']
    },
    'potassium-chloride': {
      id: 'potassium-chloride', name: 'Potassium chloride', formula: 'KCl',
      state: 's', category: 'salt', molarMass: 74.551, density: 1.984,
      ions: { 'K+': 1, 'Cl-': 1 }, soluble: true, heatOfSolution: 17.2,
      flameColor: '#C77DFF', aliases: ['kcl', 'sylvite']
    },
    'silver-nitrate': {
      id: 'silver-nitrate', name: 'Silver nitrate', formula: 'AgNO₃',
      state: 's', category: 'salt', molarMass: 169.872, density: 4.35,
      ions: { 'Ag+': 1, 'NO3-': 1 }, soluble: true, heatOfSolution: 22.6,
      lightSensitive: true, aliases: ['agno3', 'lunar caustic']
    },
    'potassium-iodide': {
      id: 'potassium-iodide', name: 'Potassium iodide', formula: 'KI',
      state: 's', category: 'salt', molarMass: 166.003, density: 3.13,
      ions: { 'K+': 1, 'I-': 1 }, soluble: true, heatOfSolution: 20.3,
      aliases: ['ki']
    },
    'lead-nitrate': {
      id: 'lead-nitrate', name: 'Lead(II) nitrate', formula: 'Pb(NO₃)₂',
      state: 's', category: 'salt', molarMass: 331.200, density: 4.53,
      ions: { 'Pb2+': 1, 'NO3-': 2 }, soluble: true, heatOfSolution: 5.0,
      aliases: ['pb(no3)2']
    },
    'copper-sulfate': {
      id: 'copper-sulfate', name: 'Copper(II) sulfate', formula: 'CuSO₄',
      state: 's', category: 'salt', molarMass: 159.609, density: 3.60,
      ions: { 'Cu2+': 1, 'SO4^2-': 1 }, soluble: true, heatOfSolution: -73.3,
      flameColor: '#00E5C0', colour: '#1E90FF',
      aliases: ['cuso4', 'blue vitriol']
    },
    'calcium-chloride': {
      id: 'calcium-chloride', name: 'Calcium chloride', formula: 'CaCl₂',
      state: 's', category: 'salt', molarMass: 110.984, density: 2.15,
      ions: { 'Ca2+': 1, 'Cl-': 2 }, soluble: true, heatOfSolution: -82.8,
      aliases: ['cacl2']
    },
    'sodium-carbonate': {
      id: 'sodium-carbonate', name: 'Sodium carbonate', formula: 'Na₂CO₃',
      state: 's', category: 'salt', molarMass: 105.988, density: 2.54,
      ions: { 'Na+': 2, 'CO3^2-': 1 }, soluble: true, heatOfSolution: -26.7,
      flameColor: '#FFD700', aliases: ['na2co3', 'washing soda', 'soda ash']
    },
    'sodium-bicarbonate': {
      id: 'sodium-bicarbonate', name: 'Sodium bicarbonate', formula: 'NaHCO₃',
      state: 's', category: 'salt', molarMass: 84.007, density: 2.20,
      ions: { 'Na+': 1, 'HCO3-': 1 }, soluble: true, heatOfSolution: 18.4,
      flameColor: '#FFD700', aliases: ['nahco3', 'baking soda', 'bicarbonate of soda']
    },
    'barium-chloride': {
      id: 'barium-chloride', name: 'Barium chloride', formula: 'BaCl₂',
      state: 's', category: 'salt', molarMass: 208.233, density: 3.856,
      ions: { 'Ba2+': 1, 'Cl-': 2 }, soluble: true, heatOfSolution: -13.2,
      flameColor: '#7FFF00', aliases: ['bacl2']
    },
    'sodium-sulfate': {
      id: 'sodium-sulfate', name: 'Sodium sulfate', formula: 'Na₂SO₄',
      state: 's', category: 'salt', molarMass: 142.042, density: 2.664,
      ions: { 'Na+': 2, 'SO4^2-': 1 }, soluble: true, heatOfSolution: -24.8,
      flameColor: '#FFD700', aliases: ['na2so4', "glauber's salt"]
    },
    'potassium-permanganate': {
      id: 'potassium-permanganate', name: 'Potassium permanganate', formula: 'KMnO₄',
      state: 's', category: 'salt', molarMass: 158.034, density: 2.703,
      ions: { 'K+': 1, 'MnO4-': 1 }, soluble: true, heatOfSolution: 43.6,
      colour: '#4B0082', oxidiser: true, aliases: ['kmno4']
    },
    'potassium-chlorate': {
      id: 'potassium-chlorate', name: 'Potassium chlorate', formula: 'KClO₃',
      state: 's', category: 'salt', molarMass: 122.549, density: 2.32,
      ions: { 'K+': 1, 'ClO3-': 1 }, soluble: true, heatOfSolution: 41.4,
      oxidiser: true, aliases: ['kclo3']
    },
    'ammonium-nitrate': {
      id: 'ammonium-nitrate', name: 'Ammonium nitrate', formula: 'NH₄NO₃',
      state: 's', category: 'salt', molarMass: 80.043, density: 1.725,
      ions: { 'NH4+': 1, 'NO3-': 1 }, soluble: true, heatOfSolution: 25.7,
      oxidiser: true, aliases: ['nh4no3']
    },
    'ammonium-chloride': {
      id: 'ammonium-chloride', name: 'Ammonium chloride', formula: 'NH₄Cl',
      state: 's', category: 'salt', molarMass: 53.491, density: 1.527,
      ions: { 'NH4+': 1, 'Cl-': 1 }, soluble: true, heatOfSolution: 14.8,
      aliases: ['nh4cl', 'sal ammoniac']
    },
    'sodium-acetate': {
      id: 'sodium-acetate', name: 'Sodium acetate', formula: 'CH₃COONa',
      state: 's', category: 'salt', molarMass: 82.034, density: 1.528,
      ions: { 'Na+': 1, 'CH3COO-': 1 }, soluble: true, heatOfSolution: -17.0,
      aliases: ['ch3coona', 'sodium ethanoate']
    },
    'potassium-nitrate': {
      id: 'potassium-nitrate', name: 'Potassium nitrate', formula: 'KNO₃',
      state: 's', category: 'salt', molarMass: 101.103, density: 2.109,
      ions: { 'K+': 1, 'NO3-': 1 }, soluble: true, heatOfSolution: 34.9,
      flameColor: '#C77DFF', aliases: ['kno3', 'saltpetre']
    },
    'sodium-nitrate': {
      id: 'sodium-nitrate', name: 'Sodium nitrate', formula: 'NaNO₃',
      state: 's', category: 'salt', molarMass: 84.995, density: 2.257,
      ions: { 'Na+': 1, 'NO3-': 1 }, soluble: true, heatOfSolution: 20.5,
      flameColor: '#FFD700', aliases: ['nano3', 'chile saltpetre']
    },

    /* --------------------- INSOLUBLE SALTS (precursors) ------------------- */
    'calcium-carbonate': {
      id: 'calcium-carbonate', name: 'Calcium carbonate', formula: 'CaCO₃',
      state: 's', category: 'carbonate', molarMass: 100.087, density: 2.71,
      ions: { 'Ca2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Ca2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -15.0 },
      aliases: ['caco3', 'limestone', 'calcite', 'marble', 'chalk']
    },
    'barium-carbonate': {
      id: 'barium-carbonate', name: 'Barium carbonate', formula: 'BaCO₃',
      state: 's', category: 'carbonate', molarMass: 197.336, density: 4.286,
      ions: { 'Ba2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Ba2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -20.0 },
      aliases: ['baco3', 'witherite']
    },
    'copper-carbonate': {
      id: 'copper-carbonate', name: 'Copper(II) carbonate', formula: 'CuCO₃',
      state: 's', category: 'carbonate', molarMass: 123.555, density: 3.90,
      ions: { 'Cu2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Cu2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -25.0 },
      colour: '#2E8B57', aliases: ['cuco3', 'malachite']
    },
    'magnesium-carbonate': {
      id: 'magnesium-carbonate', name: 'Magnesium carbonate', formula: 'MgCO₃',
      state: 's', category: 'carbonate', molarMass: 84.314, density: 2.96,
      ions: { 'Mg2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Mg2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -22.0 },
      aliases: ['mgco3', 'magnesite']
    },
    'zinc-carbonate': {
      id: 'zinc-carbonate', name: 'Zinc carbonate', formula: 'ZnCO₃',
      state: 's', category: 'carbonate', molarMass: 125.418, density: 4.398,
      ions: { 'Zn2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Zn2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -22.0 },
      aliases: ['znco3', 'smithsonite']
    },
    'lead-carbonate': {
      id: 'lead-carbonate', name: 'Lead(II) carbonate', formula: 'PbCO₃',
      state: 's', category: 'carbonate', molarMass: 267.209, density: 6.582,
      ions: { 'Pb2+': 1, 'CO3^2-': 1 }, soluble: false,
      acidReaction: { hConsumed: 2, products: { 'Pb2+': 1 }, gas: { id: 'CO2', moles: 1 }, water: 1, dH: -20.0 },
      aliases: ['pbco3', 'cerussite']
    },
    'copper-hydroxide': {
      id: 'copper-hydroxide', name: 'Copper(II) hydroxide', formula: 'Cu(OH)₂',
      state: 's', category: 'hydroxide', molarMass: 97.561, density: 3.368,
      ions: { 'Cu2+': 1, 'OH-': 2 }, soluble: false, colour: '#3AA8E0',
      acidReaction: { hConsumed: 2, products: { 'Cu2+': 1 }, water: 2, dH: -50.0 },
      aliases: ['cu(oh)2']
    },
    'iron3-hydroxide': {
      id: 'iron3-hydroxide', name: 'Iron(III) hydroxide', formula: 'Fe(OH)₃',
      state: 's', category: 'hydroxide', molarMass: 106.867, density: 3.4,
      ions: { 'Fe3+': 1, 'OH-': 3 }, soluble: false, colour: '#8B3A2F',
      acidReaction: { hConsumed: 3, products: { 'Fe3+': 1 }, water: 3, dH: -60.0 },
      aliases: ['fe(oh)3']
    },
    'magnesium-hydroxide': {
      id: 'magnesium-hydroxide', name: 'Magnesium hydroxide', formula: 'Mg(OH)₂',
      state: 's', category: 'hydroxide', molarMass: 58.320, density: 2.344,
      ions: { 'Mg2+': 1, 'OH-': 2 }, soluble: false, colour: '#FFFFFF',
      acidReaction: { hConsumed: 2, products: { 'Mg2+': 1 }, water: 2, dH: -55.0 },
      aliases: ['mg(oh)2', 'milk of magnesia', 'brucite']
    },
    'aluminium-hydroxide': {
      id: 'aluminium-hydroxide', name: 'Aluminium hydroxide', formula: 'Al(OH)₃',
      state: 's', category: 'hydroxide', molarMass: 78.004, density: 2.42,
      ions: { 'Al3+': 1, 'OH-': 3 }, soluble: false, colour: '#F0F8FF',
      acidReaction: { hConsumed: 3, products: { 'Al3+': 1 }, water: 3, dH: -60.0 },
      aliases: ['al(oh)3', 'gibbsite']
    },
    'zinc-hydroxide': {
      id: 'zinc-hydroxide', name: 'Zinc hydroxide', formula: 'Zn(OH)₂',
      state: 's', category: 'hydroxide', molarMass: 99.424, density: 3.053,
      ions: { 'Zn2+': 1, 'OH-': 2 }, soluble: false, colour: '#FFFFFF',
      acidReaction: { hConsumed: 2, products: { 'Zn2+': 1 }, water: 2, dH: -50.0 },
      aliases: ['zn(oh)2']
    },

    /* ------------------------------ OXIDES -------------------------------- */
    'calcium-oxide': {
      id: 'calcium-oxide', name: 'Calcium oxide', formula: 'CaO',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 56.077,
      density: 3.34, products: { 'Ca2+': 1, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -63.7,
      acidReaction: { hConsumed: 2, products: { 'Ca2+': 1 }, water: 1, dH: -193.0 },
      aliases: ['cao', 'quicklime', 'burnt lime']
    },
    'magnesium-oxide': {
      id: 'magnesium-oxide', name: 'Magnesium oxide', formula: 'MgO',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 40.304,
      density: 3.58, products: { 'Mg2+': 1, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -37.0,
      acidReaction: { hConsumed: 2, products: { 'Mg2+': 1 }, water: 1, dH: -150.0 },
      aliases: ['mgo', 'magnesia', 'periclase']
    },
    'sodium-oxide': {
      id: 'sodium-oxide', name: 'Sodium oxide', formula: 'Na₂O',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 61.979,
      density: 2.27, products: { 'Na+': 2, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -238.4,
      acidReaction: { hConsumed: 2, products: { 'Na+': 2 }, water: 1, dH: -250.0 },
      aliases: ['na2o']
    },
    'potassium-oxide': {
      id: 'potassium-oxide', name: 'Potassium oxide', formula: 'K₂O',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 94.196,
      density: 2.35, products: { 'K+': 2, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -315.0,
      acidReaction: { hConsumed: 2, products: { 'K+': 2 }, water: 1, dH: -320.0 },
      aliases: ['k2o']
    },
    'lithium-oxide': {
      id: 'lithium-oxide', name: 'Lithium oxide', formula: 'Li₂O',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 29.881,
      density: 2.013, products: { 'Li+': 2, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -260.0,
      acidReaction: { hConsumed: 2, products: { 'Li+': 2 }, water: 1, dH: -270.0 },
      aliases: ['li2o']
    },
    'barium-oxide': {
      id: 'barium-oxide', name: 'Barium oxide', formula: 'BaO',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 153.326,
      density: 5.72, products: { 'Ba2+': 1, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -100.0,
      acidReaction: { hConsumed: 2, products: { 'Ba2+': 1 }, water: 1, dH: -200.0 },
      aliases: ['bao', 'baryta']
    },
    'copper-oxide': {
      id: 'copper-oxide', name: 'Copper(II) oxide', formula: 'CuO',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 79.545,
      density: 6.315, products: { 'Cu2+': 1, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -20.0, insoluble: true, colour: '#1C1C1C',
      acidReaction: { hConsumed: 2, products: { 'Cu2+': 1 }, water: 1, dH: -60.0 },
      aliases: ['cuo', 'cupric oxide']
    },
    'zinc-oxide': {
      id: 'zinc-oxide', name: 'Zinc oxide', formula: 'ZnO',
      state: 's', category: 'oxide', oxideType: 'amphoteric', molarMass: 81.380,
      density: 5.606, products: { 'Zn2+': 1, 'OH-': 2 }, waterPerOxide: 1,
      enthalpyHydration: -25.0, insoluble: true, colour: '#FAFAFA',
      acidReaction: { hConsumed: 2, products: { 'Zn2+': 1 }, water: 1, dH: -70.0 },
      aliases: ['zno', 'zinc white']
    },
    'iron3-oxide': {
      id: 'iron3-oxide', name: 'Iron(III) oxide', formula: 'Fe₂O₃',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 159.688,
      density: 5.242, insoluble: true, colour: '#A0522D',
      acidReaction: { hConsumed: 6, products: { 'Fe3+': 2 }, water: 3, dH: -130.0 },
      aliases: ['fe2o3', 'hematite', 'rust']
    },
    'carbon-dioxide': {
      id: 'carbon-dioxide', name: 'Carbon dioxide', formula: 'CO₂', plainFormula: 'CO2',
      state: 'g', category: 'oxide', oxideType: 'acidic', molarMass: 44.009,
      products: { 'H2CO3': 1 }, waterPerOxide: 1, enthalpyHydration: -20.3,
      colourless: true, aliases: ['co2', 'carbonic anhydride']
    },
    'sulfur-dioxide': {
      id: 'sulfur-dioxide', name: 'Sulfur dioxide', formula: 'SO₂', plainFormula: 'SO2',
      state: 'g', category: 'oxide', oxideType: 'acidic', molarMass: 64.066,
      products: { 'H2SO3': 1 }, waterPerOxide: 1, enthalpyHydration: -32.0,
      pungent: true, aliases: ['so2', 'sulfurous anhydride']
    },
    'sulfur-trioxide': {
      id: 'sulfur-trioxide', name: 'Sulfur trioxide', formula: 'SO₃', plainFormula: 'SO3',
      state: 'g', category: 'oxide', oxideType: 'acidic', molarMass: 80.064,
      products: { 'H+': 2, 'SO4^2-': 1 }, waterPerOxide: 1, enthalpyHydration: -227.7,
      pungent: true, aliases: ['so3', 'sulfuric anhydride']
    },
    'phosphorus-pentoxide': {
      id: 'phosphorus-pentoxide', name: 'Phosphorus pentoxide', formula: 'P₄O₁₀', plainFormula: 'P4O10',
      state: 's', category: 'oxide', oxideType: 'acidic', molarMass: 283.886,
      products: { 'H3PO4': 4 }, waterPerOxide: 6, enthalpyHydration: -400.0,
      deliquescent: true, aliases: ['p4o10', 'phosphoric anhydride']
    },

    /* ------------------------------ GASES --------------------------------- */
    'hydrogen': {
      id: 'hydrogen', name: 'Hydrogen', formula: 'H₂', plainFormula: 'H2',
      state: 'g', category: 'gas', molarMass: 2.016, flammable: true,
      aliases: ['h2', 'dihydrogen']
    },
    'oxygen': {
      id: 'oxygen', name: 'Oxygen', formula: 'O₂', plainFormula: 'O2',
      state: 'g', category: 'gas', molarMass: 31.998, oxidiser: true,
      aliases: ['o2', 'dioxygen']
    },
    'nitrogen-dioxide': {
      id: 'nitrogen-dioxide', name: 'Nitrogen dioxide', formula: 'NO₂', plainFormula: 'NO2',
      state: 'g', category: 'gas', molarMass: 46.005, toxic: true,
      colour: '#B22222', aliases: ['no2']
    },
    'ammonia-gas': {
      id: 'ammonia-gas', name: 'Ammonia gas', formula: 'NH₃', plainFormula: 'NH3',
      state: 'g', category: 'gas', molarMass: 17.031, pungent: true, toxic: true,
      aliases: ['nh3 gas']
    },

    /* --------------------------- MISC SOLIDS ------------------------------ */
    'copper-sulfate-pentahydrate': {
      id: 'copper-sulfate-pentahydrate', name: 'Copper(II) sulfate pentahydrate',
      formula: 'CuSO₄·5H₂O', plainFormula: 'CuSO4.5H2O',
      state: 's', category: 'salt', molarMass: 249.685, density: 2.286,
      ions: { 'Cu2+': 1, 'SO4^2-': 1 }, soluble: true, heatOfSolution: 11.5,
      colour: '#1E90FF', aliases: ['cuso4.5h2o', 'blue vitriol']
    },
    'mercury-oxide': {
      id: 'mercury-oxide', name: 'Mercury(II) oxide', formula: 'HgO',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 216.589,
      density: 11.14, insoluble: true, colour: '#E34234',
      acidReaction: { hConsumed: 2, products: {}, water: 1, dH: -40.0 },
      aliases: ['hgo', 'mercuric oxide']
    },
    'silver-oxide': {
      id: 'silver-oxide', name: 'Silver(I) oxide', formula: 'Ag₂O',
      state: 's', category: 'oxide', oxideType: 'basic', molarMass: 231.735,
      density: 7.14, insoluble: true, colour: '#4B3621',
      acidReaction: { hConsumed: 2, products: { 'Ag+': 2 }, water: 1, dH: -50.0 },
      aliases: ['ag2o']
    },
    'hydrogen-peroxide': {
      id: 'hydrogen-peroxide', name: 'Hydrogen peroxide', formula: 'H₂O₂', plainFormula: 'H2O2',
      state: 'aq', category: 'oxidiser', molarMass: 34.014, density: 1.11,
      soluble: true, aliases: ['h2o2', 'peroxide']
    },
    'manganese-dioxide': {
      id: 'manganese-dioxide', name: 'Manganese dioxide', formula: 'MnO₂',
      state: 's', category: 'catalyst', molarMass: 86.937, density: 5.026,
      insoluble: true, colour: '#1C1C1C', catalyst: true,
      aliases: ['mno2', 'pyrolusite']
    },

    /* ------------------- PRECIPITATE PRODUCT RECORDS ---------------------- */
    'silver-chloride': {
      id: 'silver-chloride', name: 'Silver chloride', formula: 'AgCl',
      state: 's', category: 'precipitate', molarMass: 143.321, density: 5.56,
      ions: { 'Ag+': 1, 'Cl-': 1 }, soluble: false, colour: '#F5F5F5',
      aliases: ['agcl']
    },
    'silver-iodide': {
      id: 'silver-iodide', name: 'Silver iodide', formula: 'AgI',
      state: 's', category: 'precipitate', molarMass: 234.773, density: 5.675,
      ions: { 'Ag+': 1, 'I-': 1 }, soluble: false, colour: '#FFFACD',
      aliases: ['agi']
    },
    'lead-iodide': {
      id: 'lead-iodide', name: 'Lead(II) iodide', formula: 'PbI₂',
      state: 's', category: 'precipitate', molarMass: 461.009, density: 6.16,
      ions: { 'Pb2+': 1, 'I-': 2 }, soluble: false, colour: '#FFD700',
      aliases: ['pbi2']
    },
    'barium-sulfate': {
      id: 'barium-sulfate', name: 'Barium sulfate', formula: 'BaSO₄',
      state: 's', category: 'precipitate', molarMass: 233.390, density: 4.49,
      ions: { 'Ba2+': 1, 'SO4^2-': 1 }, soluble: false, colour: '#FFFFFF',
      aliases: ['baso4', 'barite']
    }
  };

  /* --------------------------------------------------------------------------
   * Alias index – maps lower-cased id / name / formula / alias → canonical id
   * ------------------------------------------------------------------------ */
  const ALIAS_INDEX = (function () {
    const idx = {};
    for (const key in FALLBACK_DB) {
      if (!Object.prototype.hasOwnProperty.call(FALLBACK_DB, key)) continue;
      const rec = FALLBACK_DB[key];
      idx[key] = rec.id;
      if (rec.name) idx[rec.name.toLowerCase()] = rec.id;
      if (rec.formula) idx[rec.formula.toLowerCase()] = rec.id;
      if (rec.plainFormula) idx[rec.plainFormula.toLowerCase()] = rec.id;
      if (Array.isArray(rec.aliases)) {
        for (const a of rec.aliases) idx[String(a).toLowerCase()] = rec.id;
      }
    }
    return idx;
  })();

  /* ==========================================================================
   * SECTION 6 — EXTERNAL chemicals.js BRIDGE
   * ========================================================================== */

  function lookupExternal(rawId) {
    const db = global.ChemicalsDB;
    if (!db) return null;
    const key = String(rawId).toLowerCase().trim();

    function matches(rec) {
      if (!rec || typeof rec !== 'object') return false;
      const candidates = [rec.id, rec.key, rec.name, rec.formula, rec.plainFormula];
      if (Array.isArray(rec.aliases)) candidates.push.apply(candidates, rec.aliases);
      for (const c of candidates) {
        if (c && String(c).toLowerCase().trim() === key) return true;
      }
      return false;
    }

    try {
      if (Array.isArray(db)) {
        for (const rec of db) if (matches(rec)) return rec;
      } else if (typeof db === 'object') {
        if (db[key]) return db[key];
        if (db.chemicals) {
          if (Array.isArray(db.chemicals)) {
            for (const rec of db.chemicals) if (matches(rec)) return rec;
          } else if (typeof db.chemicals === 'object') {
            if (db.chemicals[key]) return db.chemicals[key];
            for (const k in db.chemicals) {
              if (matches(db.chemicals[k])) return db.chemicals[k];
            }
          }
        }
        if (typeof db.get === 'function') {
          const r = db.get(key);
          if (r) return r;
        }
        if (typeof db.find === 'function') {
          const r = db.find(key);
          if (r) return r;
        }
        for (const k in db) {
          if (matches(db[k])) return db[k];
        }
      }
    } catch (e) {
      /* defensive: never let an external DB break the engine */
    }
    return null;
  }

  const RESOLVE_CACHE = {};

  function resolveChemical(rawId) {
    if (rawId === undefined || rawId === null) return null;
    const key = String(rawId).toLowerCase().trim();
    if (!key) return null;
    if (RESOLVE_CACHE[key]) return RESOLVE_CACHE[key];

    const canonical = ALIAS_INDEX[key] || key;
    const base = FALLBACK_DB[canonical] || null;
    const ext = lookupExternal(key) || lookupExternal(canonical);

    let merged = null;
    if (base) merged = Object.assign({}, base);
    if (ext) {
      const extCopy = Object.assign({}, ext);
      /* normalise a few possible external field spellings */
      if (!extCopy.plainFormula && extCopy.formula) {
        extCopy.plainFormula = String(extCopy.formula).replace(/[₀-₉]/g, function (c) {
          const map = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
          return map[c] || c;
        });
      }
      if (!extCopy.molarMass && extCopy.molecularWeight) extCopy.molarMass = extCopy.molecularWeight;
      if (!extCopy.molarMass && extCopy.molar_mass) extCopy.molarMass = extCopy.molar_mass;
      if (!extCopy.category && extCopy.type) extCopy.category = extCopy.type;
      merged = merged ? Object.assign(merged, extCopy) : extCopy;
    }
    if (!merged) return null;

    if (!merged.id) merged.id = canonical;
    if (!merged.name) merged.name = merged.id;
    if (!merged.formula) merged.formula = merged.plainFormula || merged.id;
    if (!merged.plainFormula) merged.plainFormula = merged.formula;
    if (!merged.state) merged.state = 's';
    if (!merged.category) merged.category = 'unknown';
    if (!isFinite(merged.molarMass) || merged.molarMass <= 0) merged.molarMass = 100;
    if (!isFinite(merged.density) || merged.density <= 0) merged.density = 1;

    RESOLVE_CACHE[key] = merged;
    RESOLVE_CACHE[merged.id] = merged;
    return merged;
  }

  function invalidateResolveCache() {
    for (const k in RESOLVE_CACHE) delete RESOLVE_CACHE[k];
  }

  /* ==========================================================================
   * SECTION 7 — UNIT CONVERSION
   * ========================================================================== */

  const UNIT_ALIASES = {
    'g': 'g', 'gram': 'g', 'grams': 'g', 'gramme': 'g', 'grammes': 'g',
    'mg': 'mg', 'milligram': 'mg', 'milligrams': 'mg',
    'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'mol': 'mol', 'mole': 'mol', 'moles': 'mol',
    'mmol': 'mmol', 'millimole': 'mmol', 'millimoles': 'mmol',
    'umol': 'umol', 'µmol': 'umol', 'micromole': 'umol',
    'ml': 'mL', 'mL': 'mL', 'millilitre': 'mL', 'milliliter': 'mL',
    'millilitres': 'mL', 'milliliters': 'mL',
    'l': 'L', 'L': 'L', 'litre': 'L', 'liter': 'L', 'litres': 'L', 'liters': 'L',
    'drop': 'drop', 'drops': 'drop',
    'spatula': 'spatula', 'spatulas': 'spatula', 'scoop': 'spatula',
    'pinch': 'pinch'
  };

  function normaliseUnit(u) {
    if (!u) return 'g';
    const key = String(u).trim();
    return UNIT_ALIASES[key] || UNIT_ALIASES[key.toLowerCase()] || 'g';
  }

  function unitToVolume(amount, unit) {
    switch (normaliseUnit(unit)) {
      case 'mL': return amount;
      case 'L': return amount * 1000;
      case 'drop': return amount * 0.05;
      case 'spatula': return amount * 0.5;
      case 'pinch': return amount * 0.25;
      case 'g': return amount / WATER_DENSITY;
      case 'mg': return (amount / 1000) / WATER_DENSITY;
      case 'kg': return (amount * 1000) / WATER_DENSITY;
      case 'mol': return (amount * WATER_MM) / WATER_DENSITY;
      case 'mmol': return (amount / 1000 * WATER_MM) / WATER_DENSITY;
      case 'umol': return (amount / 1e6 * WATER_MM) / WATER_DENSITY;
      default: return amount;
    }
  }

  function toMoles(chem, amount, unit) {
    const u = normaliseUnit(unit);
    const mm = chem.molarMass || 100;
    const rho = chem.density || 1;
    switch (u) {
      case 'g':    return amount / mm;
      case 'mg':   return (amount / 1000) / mm;
      case 'kg':   return (amount * 1000) / mm;
      case 'mol':  return amount;
      case 'mmol': return amount / 1000;
      case 'umol': return amount / 1e6;
      case 'mL':   return (amount * rho) / mm;
      case 'L':    return (amount * 1000 * rho) / mm;
      case 'drop': return (amount * 0.05 * rho) / mm;
      case 'spatula': return (amount * 0.5) / mm;
      case 'pinch': return (amount * 0.25) / mm;
      default:     return amount / mm;
    }
  }

  /* ==========================================================================
   * SECTION 8 — VESSEL STATE
   * ========================================================================== */

  function VesselState() {
    this.reset();
  }

  VesselState.prototype.reset = function () {
    /** Solvent volume in millilitres. 0 ⇒ dry vessel. */
    this.waterVolume = 0;

    /** Temperature in degrees Celsius. */
    this.temperature = AMBIENT_T;

    /** Logarithmic acidity / basicity. */
    this.pH = 7.00;
    this.pOH = 7.00;

    /** Dissolved species (ions + neutral molecules) in moles. */
    this.solutes = {};

    /** Undissolved solids: [{ id, name, formula, moles, mass, molarMass }] */
    this.solids = [];

    /** Evolved gases: [{ id, name, formula, moles, volume(L) }] */
    this.gases = [];

    /** Total mass of vessel contents in grams. */
    this.totalMass = 0;

    /** Internal bookkeeping */
    this.pendingHeat = 0;      // kJ awaiting conversion to ΔT
    this.heatAccumulator = 0;  // kJ released during the current operation
    this.burnerLevel = 0;
    this.stirring = false;
    this.flameColor = null;
    this.isExplosive = false;
    this.lastEquation = null;
    this.lastLatex = null;
    this.reactionLog = [];
    this.addedHistory = [];
    this.operationCount = 0;
    this.createdAt = Date.now();

    return this;
  };

  /* ------------------------------ MUTATORS ------------------------------- */

  VesselState.prototype.addWater = function (mL) {
    this.waterVolume = Math.max(0, this.waterVolume + mL);
  };

  VesselState.prototype.addIon = function (species, moles) {
    if (!species || !isFinite(moles) || moles === 0) return;
    const current = this.solutes[species] || 0;
    const next = current + moles;
    if (next <= 1e-15) {
      delete this.solutes[species];
    } else {
      this.solutes[species] = next;
    }
  };

  VesselState.prototype.takeIon = function (species, moles) {
    if (!species || !isFinite(moles) || moles <= 0) return 0;
    const have = this.solutes[species] || 0;
    const take = Math.min(have, moles);
    if (take <= 0) return 0;
    const next = have - take;
    if (next <= 1e-15) {
      delete this.solutes[species];
    } else {
      this.solutes[species] = next;
    }
    return take;
  };

  VesselState.prototype.addSolid = function (id, moles, molarMass, formula, name) {
    if (!id || !isFinite(moles) || moles <= 0) return null;
    let rec = null;
    for (let i = 0; i < this.solids.length; i++) {
      if (this.solids[i].id === id) { rec = this.solids[i]; break; }
    }
    if (!rec) {
      rec = {
        id: id,
        name: name || id,
        formula: formula || id,
        molarMass: (isFinite(molarMass) && molarMass > 0) ? molarMass : 100,
        moles: 0,
        mass: 0
      };
      this.solids.push(rec);
    }
    rec.moles += moles;
    rec.mass = rec.moles * rec.molarMass;
    return rec;
  };

  VesselState.prototype.takeSolid = function (id, moles) {
    if (!id || !isFinite(moles) || moles <= 0) return 0;
    for (let i = 0; i < this.solids.length; i++) {
      const rec = this.solids[i];
      if (rec.id !== id) continue;
      const take = Math.min(rec.moles, moles);
      rec.moles -= take;
      rec.mass = rec.moles * rec.molarMass;
      if (rec.moles <= 1e-12) this.solids.splice(i, 1);
      return take;
    }
    return 0;
  };

  VesselState.prototype.findSolid = function (id) {
    for (let i = 0; i < this.solids.length; i++) {
      if (this.solids[i].id === id) return this.solids[i];
    }
    return null;
  };

  VesselState.prototype.addGas = function (id, moles, formula, name) {
    if (!id || !isFinite(moles) || moles <= 0) return null;
    let rec = null;
    for (let i = 0; i < this.gases.length; i++) {
      if (this.gases[i].id === id) { rec = this.gases[i]; break; }
    }
    if (!rec) {
      rec = { id: id, name: name || id, formula: formula || id, moles: 0, volume: 0 };
      this.gases.push(rec);
    }
    rec.moles += moles;
    rec.volume = rec.moles * MOLAR_GAS_VOL;
    return rec;
  };

  VesselState.prototype.addHeat = function (kJ) {
    if (!isFinite(kJ) || kJ === 0) return;
    this.pendingHeat += kJ;
    this.heatAccumulator += kJ;
  };

  /* ------------------------------ DERIVED -------------------------------- */

  VesselState.prototype.computeMass = function () {
    let m = this.waterVolume * WATER_DENSITY;
    for (const sp in this.solutes) {
      if (!Object.prototype.hasOwnProperty.call(this.solutes, sp)) continue;
      m += (this.solutes[sp] || 0) * getSpecies(sp).molarMass;
    }
    for (let i = 0; i < this.solids.length; i++) m += this.solids[i].mass;
    if (!isFinite(m) || m < 0) m = 0;
    this.totalMass = m;
    return m;
  };

  VesselState.prototype.molarity = function (species) {
    const V = this.waterVolume / 1000;
    if (V <= 1e-9) return 0;
    return (this.solutes[species] || 0) / V;
  };

  VesselState.prototype.molarities = function () {
    const V = this.waterVolume / 1000;
    const out = {};
    if (V <= 1e-9) return out;
    for (const sp in this.solutes) {
      if (!Object.prototype.hasOwnProperty.call(this.solutes, sp)) continue;
      out[sp] = this.solutes[sp] / V;
    }
    return out;
  };

  VesselState.prototype.activeSpecies = function () {
    const out = [];
    for (const sp in this.solutes) {
      if (!Object.prototype.hasOwnProperty.call(this.solutes, sp)) continue;
      if (this.solutes[sp] > 1e-9) out.push(fmtSpecies(sp) + '(aq)');
    }
    for (let i = 0; i < this.solids.length; i++) {
      if (this.solids[i].moles > 1e-9) out.push((this.solids[i].formula || this.solids[i].id) + '(s)');
    }
    for (let i = 0; i < this.gases.length; i++) {
      if (this.gases[i].moles > 1e-9) out.push((this.gases[i].formula || this.gases[i].id) + '(g)');
    }
    return out;
  };

  VesselState.prototype.hasLiquid = function () {
    return this.waterVolume > 1e-9;
  };

  VesselState.prototype.clearGases = function () {
    this.gases = [];
  };

  VesselState.prototype.logReaction = function (entry) {
    this.reactionLog.push(entry);
    if (this.reactionLog.length > 200) this.reactionLog.shift();
  };

  /* ==========================================================================
   * SECTION 9 — REPORT / RESULT PLUMBING
   * ========================================================================== */

  function newReport() {
    return {
      equations: [],        // { equation, latex, dH, type }
      gasEvents: [],        // { id, formula, moles, volume }
      precipitates: [],     // { id, formula, moles, mass }
      notes: [],
      neutralisationMoles: 0,
      decompositionEvents: [],
      dissolutionEvents: [],
      heatReleased: 0,
      isExplosive: false,
      flameColor: null,
      error: null
    };
  }

  function mergeEquation(report, equation, latex, dH, type) {
    if (!equation) return;
    report.equations.push({
      equation: equation,
      latex: latex || equation,
      dH: isFinite(dH) ? dH : 0,
      type: type || 'reaction'
    });
  }

  /* ==========================================================================
   * SECTION 10 — pH ENGINE
   * ========================================================================== */

  function computePH(vessel) {
    const V = vessel.waterVolume / 1000;

    if (V <= 1e-9) {
      vessel.pH = 7.00;
      vessel.pOH = 7.00;
      return;
    }

    const nH = vessel.solutes['H+'] || 0;
    const nOH = vessel.solutes['OH-'] || 0;

    let cH = nH / V;
    let cOH = nOH / V;

    /* strong–strong residual */
    if (cH > cOH) {
      cH -= cOH;
      cOH = 0;
    } else {
      cOH -= cH;
      cH = 0;
    }

    /* Weak acid / weak base contributions when the strong residuals are gone */
    if (cH < 1e-7 && cOH < 1e-7) {
      for (const sp in vessel.solutes) {
        if (!Object.prototype.hasOwnProperty.call(vessel.solutes, sp)) continue;
        const n = vessel.solutes[sp];
        if (n <= 0) continue;
        const info = SPECIES_DB[sp];
        if (!info) continue;

        if (info.ka) {
          const C = n / V;
          const ka = info.ka;
          /* solve x² + Ka·x − Ka·C = 0 */
          const disc = ka * ka + 4 * ka * C;
          if (disc > 0) {
            const x = (-ka + Math.sqrt(disc)) / 2;
            if (x > 0) cH += x;
          }
        }
        if (info.kb) {
          const C = n / V;
          const kb = info.kb;
          const disc = kb * kb + 4 * kb * C;
          if (disc > 0) {
            const x = (-kb + Math.sqrt(disc)) / 2;
            if (x > 0) cOH += x;
          }
        }
      }
    }

    /* combine */
    if (cH > 0 && cOH > 0) {
      if (cH >= cOH) { cH -= cOH; cOH = 0; }
      else { cOH -= cH; cH = 0; }
    }

    if (cH <= 0 && cOH <= 0) {
      vessel.pH = 7.00;
      vessel.pOH = 7.00;
      return;
    }

    if (cH > 0) {
      if (cH < 1e-7) cH = 1e-7;              /* water auto-ionisation floor */
      vessel.pH = clamp(-Math.log10(cH), 0, 14);
      vessel.pOH = 14 - vessel.pH;
    } else {
      if (cOH < 1e-7) cOH = 1e-7;
      vessel.pOH = clamp(-Math.log10(cOH), 0, 14);
      vessel.pH = clamp(14 - vessel.pOH, 0, 14);
    }

    vessel.pH = Math.round(vessel.pH * 100) / 100;
    vessel.pOH = Math.round((14 - vessel.pH) * 100) / 100;
  }

  /* ==========================================================================
   * SECTION 11 — THERMAL ENGINE
   * ========================================================================== */

  /**
   * raiseTemperature(vessel, kJ)
   * Adds `kJ` kilojoules of energy to the vessel.  While liquid water is
   * present the temperature is pinned at 100 °C and excess energy is spent
   * vaporising solvent (latent heat 2257 J/g).
   */
  function raiseTemperature(vessel, kJ) {
    if (!isFinite(kJ) || kJ === 0) return;

    vessel.computeMass();

    let energyJ = kJ * 1000;

    /* ---- heating with liquid present: boiling plateau ---- */
    if (energyJ > 0 && vessel.waterVolume > 1e-9) {
      const cap = vessel.totalMass * C_WATER;
      const need = Math.max(0, 100 - vessel.temperature) * cap;

      if (energyJ < need) {
        vessel.temperature += energyJ / Math.max(cap, 1e-6);
        vessel.temperature = clamp(vessel.temperature, MIN_TEMP, MAX_TEMP);
        return;
      }

      vessel.temperature = 100;
      energyJ -= need;

      const evapGrams = energyJ / LATENT_VAP;
      const evapVol = Math.min(evapGrams, vessel.waterVolume);
      vessel.waterVolume -= evapVol;
      if (vessel.waterVolume < 1e-9) vessel.waterVolume = 0;
      energyJ -= evapVol * LATENT_VAP;

      vessel.computeMass();
    }

    /* ---- sensible heat on whatever remains ---- */
    const heatCap = Math.max(vessel.totalMass, 1) * C_WATER;
    if (energyJ !== 0) {
      vessel.temperature += energyJ / heatCap;
    }

    vessel.temperature = clamp(vessel.temperature, MIN_TEMP, MAX_TEMP);
  }

  /**
   * applyPendingHeat — converts accumulated kJ into a temperature change.
   */
  function applyPendingHeat(vessel) {
    if (Math.abs(vessel.pendingHeat) < 1e-12) {
      vessel.pendingHeat = 0;
      return;
    }
    const kJ = vessel.pendingHeat;
    vessel.pendingHeat = 0;
    raiseTemperature(vessel, kJ);
  }

  /* ==========================================================================
   * SECTION 12 — FLAME TEST
   * ========================================================================== */

  const FLAME_COLORS = {
    'Li+': '#DC143C', 'lithium': '#DC143C', 'lithium-chloride': '#DC143C', 'lithium-hydroxide': '#DC143C',
    'Na+': '#FFD700', 'sodium': '#FFD700', 'sodium-chloride': '#FFD700', 'sodium-hydroxide': '#FFD700',
    'sodium-carbonate': '#FFD700', 'sodium-sulfate': '#FFD700', 'sodium-nitrate': '#FFD700',
    'sodium-bicarbonate': '#FFD700', 'sodium-acetate': '#FFD700',
    'K+': '#C77DFF', 'potassium': '#C77DFF', 'potassium-chloride': '#C77DFF',
    'potassium-hydroxide': '#C77DFF', 'potassium-nitrate': '#C77DFF', 'potassium-iodide': '#C77DFF',
    'Rb+': '#FF2D55', 'rubidium': '#FF2D55',
    'Cs+': '#4169E1', 'caesium': '#4169E1', 'cesium': '#4169E1',
    'Ca2+': '#FF6B35', 'calcium': '#FF6B35', 'calcium-chloride': '#FF6B35', 'calcium-oxide': '#FF6B35',
    'Sr2+': '#FF2400', 'strontium': '#FF2400',
    'Ba2+': '#7FFF00', 'barium': '#7FFF00', 'barium-chloride': '#7FFF00',
    'Cu2+': '#00E5C0', 'copper': '#00E5C0', 'copper-sulfate': '#00E5C0', 'copper-oxide': '#00E5C0',
    'Pb2+': '#9AC0FF', 'lead': '#9AC0FF',
    'Zn2+': '#B7FFB7', 'zinc': '#B7FFB7',
    'Fe3+': '#FFB347', 'iron': '#FFB347'
  };

  function updateFlame(vessel, report) {
    if (vessel.burnerLevel <= 0) {
      vessel.flameColor = null;
      report.flameColor = null;
      return;
    }
    let color = null;
    for (const sp in vessel.solutes) {
      if (!Object.prototype.hasOwnProperty.call(vessel.solutes, sp)) continue;
      if (vessel.solutes[sp] <= 1e-7) continue;
      if (FLAME_COLORS[sp]) { color = FLAME_COLORS[sp]; break; }
    }
    if (!color) {
      for (let i = 0; i < vessel.solids.length; i++) {
        const s = vessel.solids[i];
        if (FLAME_COLORS[s.id]) { color = FLAME_COLORS[s.id]; break; }
      }
    }
    vessel.flameColor = color;
    report.flameColor = color;
  }

  /* ==========================================================================
   * SECTION 13 — REACTION HANDLERS
   * --------------------------------------------------------------------------
   * Each handler has the signature:
   *     handler(vessel, chem, availableMoles, report) -> molesConsumed
   * It mutates the vessel and returns how many moles of the ADDED chemical
   * it consumed. Handlers are tried in order until the added chemical is
   * exhausted.
   * ========================================================================== */

  /* --------------------------------------------------------------------------
   * 13.1  Alkali metal + water
   *       2M(s) + 2H₂O(l) → 2MOH(aq) + H₂(g)↑
   * ------------------------------------------------------------------------ */
  function hAlkaliMetalWater(vessel, chem, moles, report) {
    if (chem.category !== 'alkali-metal') return 0;

    /* ---- DRY STATE PROTECTION -------------------------------------------------
     * An alkali metal dropped into a vessel with no water simply sits there as
     * an inert lump. No explosion, no acid–base chemistry, no flame.
     * ------------------------------------------------------------------------ */
    if (vessel.waterVolume <= 1e-9) return 0;

    const waterMoles = vessel.waterVolume / WATER_MM;      /* 1 mL ≡ 1 g */
    const n = Math.min(moles, waterMoles);
    if (n <= EPS) return 0;

    /* ---- stoichiometry ---- */
    vessel.waterVolume -= n * WATER_MM;
    if (vessel.waterVolume < 1e-9) vessel.waterVolume = 0;

    vessel.addIon(chem.ion, n);
    vessel.addIon('OH-', n);

    const nH2 = n / 2;
    vessel.addGas('H2', nH2, 'H₂', 'Hydrogen');

    /* ---- thermochemistry (ΔH given per mole of metal) ---- */
    const dH = isFinite(chem.enthalpyWater) ? chem.enthalpyWater : -184.0;
    vessel.addHeat(-dH * n);

    /* ---- hazard assessment ---- */
    const explosive = chem.hazard === 'explosive' ||
                      (chem.hazard === 'high' && n > 0.1) ||
                      (n / Math.max(vessel.waterVolume + n * WATER_MM, 1) > 0.35);
    if (explosive) {
      vessel.isExplosive = true;
      report.isExplosive = true;
      report.notes.push('⚠ VIOLENT REACTION — alkali metal ignites on contact with water.');
    }

    /* ---- report ---- */
    const eq = '2' + chem.formula + '(s) + 2H₂O(l) → 2' + (chem.hydroxideFormula || (chem.formula + 'OH')) +
               '(aq) + H₂(g)↑';
    const latex = '2\\text{' + chem.plainFormula + '}(s) + 2\\text{H}_2\\text{O}(l) \\rightarrow ' +
                  '2\\text{' + (chem.hydroxideFormula || (chem.formula + 'OH')) + '}(aq) + ' +
                  '\\text{H}_2(g)\\uparrow';
    mergeEquation(report, eq, latex, dH, 'alkali-metal-water');

    report.gasEvents.push({
      id: 'H2', formula: 'H₂', name: 'Hydrogen',
      moles: nH2, volume: nH2 * MOLAR_GAS_VOL
    });

    report.notes.push(
      chem.name + ' reacted vigorously with water, releasing hydrogen gas (' +
      round(nH2 * MOLAR_GAS_VOL, 3) + ' L at STP).'
    );

    vessel.logReaction({
      type: 'alkali-metal-water', species: chem.id, moles: n,
      dH: dH, equation: eq, t: Date.now()
    });

    return n;
  }

  /* --------------------------------------------------------------------------
   * 13.2  Alkaline earth metal + water
   *       M(s) + 2H₂O(l) → M(OH)₂(aq/s) + H₂(g)↑
   *       Magnesium needs hot water / steam (minWaterTemp).
   * ------------------------------------------------------------------------ */
  function hAlkalineEarthWater(vessel, chem, moles, report) {
    if (chem.category !== 'alkaline-earth-metal') return 0;
    if (vessel.waterVolume <= 1e-9) return 0;

    const minT = isFinite(chem.minWaterTemp) ? chem.minWaterTemp : 0;
    if (vessel.temperature < minT) {
      report.notes.push(
        chem.name + ' requires a temperature of at least ' + minT +
        ' °C to react with water (current: ' + round(vessel.temperature, 1) + ' °C).'
      );
      return 0;
    }

    const waterMoles = vessel.waterVolume / WATER_MM;
    const n = Math.min(moles, waterMoles / 2);
    if (n <= EPS) return 0;

    vessel.waterVolume -= n * 2 * WATER_MM;
    if (vessel.waterVolume < 1e-9) vessel.waterVolume = 0;

    vessel.addIon(chem.ion, n);
    vessel.addIon('OH-', 2 * n);

    const nH2 = n;
    vessel.addGas('H2', nH2, 'H₂', 'Hydrogen');

    const dH = isFinite(chem.enthalpyWater) ? chem.enthalpyWater : -400.0;
    vessel.addHeat(-dH * n);

    const eq = chem.formula + '(s) + 2H₂O(l) → ' + (chem.hydroxideFormula || (chem.formula + '(OH)₂')) +
               '(aq) + H₂(g)↑';
    const latex = '\\text{' + chem.plainFormula + '}(s) + 2\\text{H}_2\\text{O}(l) \\rightarrow ' +
                  '\\text{' + (chem.hydroxideFormula || (chem.formula + '(OH)2')) +
                  '}(aq) + \\text{H}_2(g)\\uparrow';
    mergeEquation(report, eq, latex, dH, 'alkaline-earth-water');

    report.gasEvents.push({
      id: 'H2', formula: 'H₂', name: 'Hydrogen',
      moles: nH2, volume: nH2 * MOLAR_GAS_VOL
    });

    report.notes.push(chem.name + ' reacted with water producing hydrogen gas.');

    vessel.logReaction({
      type: 'alkaline-earth-water', species: chem.id, moles: n,
      dH: dH, equation: eq, t: Date.now()
    });

    return n;
  }

  /* --------------------------------------------------------------------------
   * 13.3  Metal + acid (single displacement)
   *       M(s) + nH⁺(aq) → Mⁿ⁺(aq) + (n/2)H₂(g)↑
   *       Copper / silver / lead are "noble" and require nitric acid.
   * ------------------------------------------------------------------------ */
  function hMetalAcid(vessel, chem, moles, report) {
    if (chem.category !== 'metal') return 0;
    if (vessel.waterVolume <= 1e-9) return 0;

    const nH = vessel.solutes['H+'] || 0;
    if (nH <= EPS) return 0;

    /* ---- noble metals: only oxidising acid (HNO₃) attacks them ---- */
    if (chem.nobleMetal) {
      const nNO3 = vessel.solutes['NO3-'] || 0;
      if (nNO3 <= EPS) {
        report.notes.push(
          chem.name + ' does not react with non-oxidising acids. ' +
          'Try nitric acid (HNO₃).'
        );
        return 0;
      }
      /* Cu + 4HNO₃ → Cu(NO₃)₂ + 2NO₂↑ + 2H₂O   (concentrated) */
      const n = Math.min(moles, Math.min(nH / 4, nNO3 / 2));
      if (n <= EPS) return 0;

      vessel.takeIon('H+', n * 4);
      vessel.takeIon('NO3-', n * 2);
      vessel.addIon(chem.ion, n);
      vessel.addGas('NO2', n * 2, 'NO₂', 'Nitrogen dioxide');
      vessel.addHeat(250.0 * n);   /* roughly -250 kJ/mol (very exothermic) */

      const eq = chem.formula + '(s) + 4HNO₃(aq) → ' +
                 chem.formula + '(NO₃)' + (chem.charge === 2 ? '₂' : '') +
                 '(aq) + 2NO₂(g)↑ + 2H₂O(l)';
      mergeEquation(report, eq, '', -250.0, 'metal-acid');

      report.gasEvents.push({
        id: 'NO2', formula: 'NO₂', name: 'Nitrogen dioxide',
        moles: n * 2, volume: n * 2 * MOLAR_GAS_VOL
      });
      report.notes.push('Brown NO₂ fumes evolved — copper dissolved in nitric acid.');

      vessel.logReaction({
        type: 'metal-acid', species: chem.id, moles: n, dH: -250.0,
        equation: eq, t: Date.now()
      });
      return n;
    }

    /* ---- ordinary metals ---- */
    const z = isFinite(chem.charge) && chem.charge > 0 ? chem.charge : 2;
    const n = Math.min(moles, nH / z);
    if (n <= EPS) return 0;

    vessel.takeIon('H+', n * z);
    vessel.addIon(chem.ion, n);

    const nH2 = n * z / 2;
    vessel.addGas('H2', nH2, 'H₂', 'Hydrogen');

    const dH = isFinite(chem.enthalpyAcid) ? chem.enthalpyAcid : -150.0;
    vessel.addHeat(-dH * n);

    const anionPart = z === 1 ? '' : (z === 3 ? '₃' : '₂');
    const eq = chem.formula + '(s) + ' + z + 'H⁺(aq) → ' + chem.formula + (z > 1 ? '' : '') +
               (z === 1 ? '⁺' : (z === 2 ? '²⁺' : '³⁺')) +
               '(aq) + ' + (nH2 === 1 ? '' : (nH2 === 1.5 ? '1½' : String(nH2))) + 'H₂(g)↑';
    const latex = '\\text{' + chem.plainFormula + '}(s) + ' + z + '\\text{H}^+(aq) \\rightarrow ' +
                  '\\text{' + chem.plainFormula + '}^{' + z + '+}(aq) + ' +
                  (nH2 === 1 ? '' : (nH2 === 1.5 ? '\\tfrac{3}{2}' : String(nH2))) +
                  '\\text{H}_2(g)\\uparrow';
    mergeEquation(report, eq, latex, dH, 'metal-acid');

    report.gasEvents.push({
      id: 'H2', formula: 'H₂', name: 'Hydrogen',
      moles: nH2, volume: nH2 * MOLAR_GAS_VOL
    });

    report.notes.push(
      chem.name + ' displaced hydrogen from the acid (' +
      round(nH2 * MOLAR_GAS_VOL, 3) + ' L H₂ at STP).'
    );

    vessel.logReaction({
      type: 'metal-acid', species: chem.id, moles: n, dH: dH,
      equation: eq, t: Date.now()
    });

    return n;
  }

  /* --------------------------------------------------------------------------
   * 13.4  Oxide hydration
   *       Basic oxide:   M₂O + H₂O → 2MOH        (or MO + H₂O → M(OH)₂)
   *       Acidic oxide:  CO₂ + H₂O → H₂CO₃       (etc.)
   * ------------------------------------------------------------------------ */
  function hOxideHydration(vessel, chem, moles, report) {
    if (chem.category !== 'oxide') return 0;
    if (vessel.waterVolume <= 1e-9) return 0;

    const type = chem.oxideType;
    if (type !== 'basic' && type !== 'acidic' && type !== 'amphoteric') return 0;

    /* ---- basic & amphoteric oxides ---- */
    if (type === 'basic' || type === 'amphoteric') {
      if (chem.insoluble && type === 'basic' && chem.id !== 'calcium-oxide' && chem.id !== 'barium-oxide') {
        /* e.g. CuO does not react with plain water */
        return 0;
      }
      const perOxide = isFinite(chem.waterPerOxide) ? chem.waterPerOxide : 1;
      const availWater = vessel.waterVolume / WATER_MM;
      const n = Math.min(moles, availWater / perOxide);
      if (n <= EPS) return 0;

      vessel.waterVolume -= n * perOxide * WATER_MM;
      if (vessel.waterVolume < 1e-9) vessel.waterVolume = 0;

      const products = chem.products || {};
      for (const sp in products) {
        if (!Object.prototype.hasOwnProperty.call(products, sp)) continue;
        vessel.addIon(sp, n * products[sp]);
      }

      const dH = isFinite(chem.enthalpyHydration) ? chem.enthalpyHydration : -100.0;
      vessel.addHeat(-dH * n);

      const eq = chem.formula + '(s) + ' + perOxide + 'H₂O(l) → ' +
                 (chem.hydroxideFormula || 'hydroxide') + '(aq)';
      mergeEquation(report, eq, '', dH, 'oxide-hydration');
      report.notes.push(chem.name + ' hydrated exothermically.');

      vessel.logReaction({
        type: 'oxide-hydration', species: chem.id, moles: n, dH: dH,
        equation: eq, t: Date.now()
      });
      return n;
    }

    /* ---- acidic oxides ---- */
    const perOxide = isFinite(chem.waterPerOxide) ? chem.waterPerOxide : 1;
    const availWater = vessel.waterVolume / WATER_MM;
    const n = Math.min(moles, availWater / perOxide);
    if (n <= EPS) return 0;

    vessel.waterVolume -= n * perOxide * WATER_MM;
    if (vessel.waterVolume < 1e-9) vessel.waterVolume = 0;

    const products = chem.products || {};
    for (const sp in products) {
      if (!Object.prototype.hasOwnProperty.call(products, sp)) continue;
      vessel.addIon(sp, n * products[sp]);
    }

    const dH = isFinite(chem.enthalpyHydration) ? chem.enthalpyHydration : -30.0;
    vessel.addHeat(-dH * n);

    const eq = chem.formula + '(g) + ' + perOxide + 'H₂O(l) → acid(aq)';
    mergeEquation(report, eq, '', dH, 'oxide-hydration');

    vessel.logReaction({
      type: 'oxide-hydration', species: chem.id, moles: n, dH: dH,
      equation: eq, t: Date.now()
    });
    return n;
  }

  /* --------------------------------------------------------------------------
   * 13.5  Acid addition  (dissolution + immediate digestion of reactive solids)
   * ------------------------------------------------------------------------ */
  function hAcidAddition(vessel, chem, moles, report) {
    if (chem.category !== 'acid') return 0;
    if (vessel.waterVolume <= 1e-9) return 0;   /* handled by deposit() as a residue */

    const ions = chem.ions || {};
    for (const sp in ions) {
      if (!Object.prototype.hasOwnProperty.call(ions, sp)) continue;
      vessel.addIon(sp, moles * ions[sp]);
    }

    const dHsol = isFinite(chem.heatOfSolution) ? chem.heatOfSolution : 0;
    vessel.addHeat(-dHsol * moles);

    report.dissolutionEvents.push({
      id: chem.id, name: chem.name, moles: moles, dH: dHsol
    });

    return moles;
  }

  /* --------------------------------------------------------------------------
   * 13.6  Base addition (dissolution of solid bases)
   * ------------------------------------------------------------------------ */
  function hBaseAddition(vessel, chem, moles, report) {
    if (chem.category !== 'base') return 0;
    if (vessel.waterVolume <= 1e-9) return 0;

    const ions = chem.ions || {};
    for (const sp in ions) {
      if (!Object.prototype.hasOwnProperty.call(ions, sp)) continue;
      vessel.addIon(sp, moles * ions[sp]);
    }

    const dHsol = isFinite(chem.heatOfSolution) ? chem.heatOfSolution : 0;
    vessel.addHeat(-dHsol * moles);

    report.dissolutionEvents.push({
      id: chem.id, name: chem.name, moles: moles, dH: dHsol
    });

    return moles;
  }

  const HANDLERS = [
    hAlkaliMetalWater,
    hAlkalineEarthWater,
    hMetalAcid,
    hOxideHydration,
    hAcidAddition,
    hBaseAddition
  ];

  /* ==========================================================================
   * SECTION 14 — DEPOSITION (things that did not react)
   * ========================================================================== */

  function deposit(vessel, chem, moles, report) {
    const hasWater = vessel.waterVolume > 1e-9;
    const ions = chem.ions || {};
    const hasIons = Object.keys(ions).length > 0;
    const soluble = chem.soluble !== false;

    if (hasWater && hasIons && soluble) {
      for (const sp in ions) {
        if (!Object.prototype.hasOwnProperty.call(ions, sp)) continue;
        vessel.addIon(sp, moles * ions[sp]);
      }
      const dHsol = isFinite(chem.heatOfSolution) ? chem.heatOfSolution : 0;
      vessel.addHeat(-dHsol * moles);
      report.dissolutionEvents.push({
        id: chem.id, name: chem.name, moles: moles, dH: dHsol
      });
      report.notes.push(chem.name + ' dissolved into the solution.');
      return;
    }

    if (hasWater && hasIons && !soluble) {
      vessel.addSolid(chem.id, moles, chem.molarMass, chem.formula, chem.name);
      report.notes.push(chem.name + ' is insoluble — it settled as a solid.');
      return;
    }

    vessel.addSolid(chem.id, moles, chem.molarMass, chem.formula, chem.name);
    if (!hasWater) {
      report.notes.push(chem.name + ' added to a dry vessel — stored as a solid.');
    } else {
      report.notes.push(chem.name + ' added as a solid.');
    }
  }

  /* ==========================================================================
   * SECTION 15 — SOLUTION PHASE CHEMISTRY
   * ========================================================================== */

  /**
   * solutionPass — converts dissolved carbonate / sulfite / sulfide into
   * their volatile oxides when acid is available.
   */
  function solutionPass(vessel, report) {
    if (vessel.waterVolume <= 1e-9) return;

    let nH = vessel.solutes['H+'] || 0;
    if (nH <= EPS) return;

    /* ---- carbonate → CO₂ ---- */
    let nCO3 = vessel.solutes['CO3^2-'] || 0;
    if (nCO3 > EPS) {
      const t = Math.min(nCO3, nH / 2);
      if (t > EPS) {
        vessel.takeIon('CO3^2-', t);
        vessel.takeIon('H+', 2 * t);
        vessel.addGas('CO2', t, 'CO₂', 'Carbon dioxide');
        vessel.addHeat(15.0 * t);
        nH -= 2 * t;
        report.gasEvents.push({
          id: 'CO2', formula: 'CO₂', name: 'Carbon dioxide',
          moles: t, volume: t * MOLAR_GAS_VOL
        });
        mergeEquation(
          report,
          'CO₃²⁻(aq) + 2H⁺(aq) → H₂O(l) + CO₂(g)↑',
          '\\text{CO}_3^{2-}(aq) + 2\\text{H}^+(aq) \\rightarrow \\text{H}_2\\text{O}(l) + \\text{CO}_2(g)\\uparrow',
          -15.0, 'carbonate-acid'
        );
        report.notes.push('Effervescence — carbon dioxide evolved.');
      }
    }

    /* ---- hydrogencarbonate → CO₂ ---- */
    let nHCO3 = vessel.solutes['HCO3-'] || 0;
    if (nHCO3 > EPS && nH > EPS) {
      const t = Math.min(nHCO3, nH);
      if (t > EPS) {
        vessel.takeIon('HCO3-', t);
        vessel.takeIon('H+', t);
        vessel.addGas('CO2', t, 'CO₂', 'Carbon dioxide');
        vessel.addHeat(12.0 * t);
        nH -= t;
        report.gasEvents.push({
          id: 'CO2', formula: 'CO₂', name: 'Carbon dioxide',
          moles: t, volume: t * MOLAR_GAS_VOL
        });
        mergeEquation(
          report,
          'HCO₃⁻(aq) + H⁺(aq) → H₂O(l) + CO₂(g)↑',
          '\\text{HCO}_3^-(aq) + \\text{H}^+(aq) \\rightarrow \\text{H}_2\\text{O}(l) + \\text{CO}_2(g)\\uparrow',
          -12.0, 'carbonate-acid'
        );
        report.notes.push('Effervescence — carbon dioxide evolved.');
      }
    }

    /* ---- sulfite → SO₂ ---- */
    let nSO3 = vessel.solutes['SO3^2-'] || 0;
    if (nSO3 > EPS && nH > EPS) {
      const t = Math.min(nSO3, nH / 2);
      if (t > EPS) {
        vessel.takeIon('SO3^2-', t);
        vessel.takeIon('H+', 2 * t);
        vessel.addGas('SO2', t, 'SO₂', 'Sulfur dioxide');
        vessel.addHeat(20.0 * t);
        report.gasEvents.push({
          id: 'SO2', formula: 'SO₂', name: 'Sulfur dioxide',
          moles: t, volume: t * MOLAR_GAS_VOL
        });
        mergeEquation(
          report,
          'SO₃²⁻(aq) + 2H⁺(aq) → H₂O(l) + SO₂(g)↑',
          '\\text{SO}_3^{2-}(aq) + 2\\text{H}^+(aq) \\rightarrow \\text{H}_2\\text{O}(l) + \\text{SO}_2(g)\\uparrow',
          -20.0, 'sulfite-acid'
        );
      }
    }

    /* ---- sulfide → H₂S ---- */
    let nS = vessel.solutes['S^2-'] || 0;
    if (nS > EPS && nH > EPS) {
      const t = Math.min(nS, nH / 2);
      if (t > EPS) {
        vessel.takeIon('S^2-', t);
        vessel.takeIon('H+', 2 * t);
        vessel.addGas('H2S', t, 'H₂S', 'Hydrogen sulfide');
        vessel.addHeat(20.0 * t);
        report.gasEvents.push({
          id: 'H2S', formula: 'H₂S', name: 'Hydrogen sulfide',
          moles: t, volume: t * MOLAR_GAS_VOL
        });
        report.notes.push('Rotten-egg odour — hydrogen sulfide evolved.');
      }
    }
  }

  /**
   * acidDigestPass — solid phases reacting with available H⁺.
   * Works for carbonates, hydroxides, oxides and reactive metals already
   * sitting in the vessel.
   */
  function acidDigestPass(vessel, report) {
    if (vessel.waterVolume <= 1e-9) return;
    if (vessel.solids.length === 0) return;

    let guard = 0;
    let changed = true;

    while (changed && guard++ < 8) {
      changed = false;

      let nH = vessel.solutes['H+'] || 0;
      if (nH <= EPS) break;

      for (let i = 0; i < vessel.solids.length; i++) {
        const solid = vessel.solids[i];
        if (solid.moles <= EPS) continue;

        const chem = resolveChemical(solid.id);
        if (!chem || !chem.acidReaction) continue;

        const rx = chem.acidReaction;
        const hPerUnit = isFinite(rx.hConsumed) ? rx.hConsumed : 2;
        if (hPerUnit <= 0) continue;

        const n = Math.min(solid.moles, nH / hPerUnit);
        if (n <= EPS) continue;

        vessel.takeIon('H+', n * hPerUnit);
        vessel.takeSolid(solid.id, n);

        if (rx.products) {
          for (const sp in rx.products) {
            if (!Object.prototype.hasOwnProperty.call(rx.products, sp)) continue;
            vessel.addIon(sp, n * rx.products[sp]);
          }
        }
        if (rx.gas) {
          const gid = rx.gas.id;
          const gmoles = n * (rx.gas.moles || 1);
          const gformula = gid === 'CO2' ? 'CO₂' : (gid === 'H2' ? 'H₂' : (gid === 'SO2' ? 'SO₂' : gid));
          const gname = gid === 'CO2' ? 'Carbon dioxide' : (gid === 'H2' ? 'Hydrogen' : (gid === 'SO2' ? 'Sulfur dioxide' : gid));
          vessel.addGas(gid, gmoles, gformula, gname);
          report.gasEvents.push({
            id: gid, formula: gformula, name: gname,
            moles: gmoles, volume: gmoles * MOLAR_GAS_VOL
          });
        }
        if (rx.water) {
          vessel.waterVolume += n * rx.water * WATER_MM;
        }

        const dH = isFinite(rx.dH) ? rx.dH : -30.0;
        vessel.addHeat(-dH * n);

        const eq = (chem.formula || solid.id) + '(s) + ' + hPerUnit + 'H⁺(aq) → ' +
                   (rx.gas ? 'products + ' + rx.gas.id + '(g)↑' : 'products');
        mergeEquation(report, eq, '', dH, 'acid-digestion');
        report.notes.push((chem.name || solid.id) + ' dissolved in the acid.');

        vessel.logReaction({
          type: 'acid-digestion', species: solid.id, moles: n, dH: dH,
          equation: eq, t: Date.now()
        });

        changed = true;
        break;  /* solids array mutated — restart the scan */
      }
    }
  }

  /* ==========================================================================
   * SECTION 16 — PRECIPITATION (Ksp)
   * ========================================================================== */

  function solvePrecipitation(cA, cB, a, b, ksp) {
    /* Solve  (cA − a·x)^a · (cB − b·x)^b = ksp  for x ∈ [0, xMax] */
    let hi = Math.min(cA / a, cB / b);
    if (!(hi > 0)) return 0;

    function f(x) {
      const ca = Math.max(cA - a * x, 0);
      const cb = Math.max(cB - b * x, 0);
      return Math.pow(ca, a) * Math.pow(cb, b) - ksp;
    }

    if (f(0) <= 0) return 0;
    if (f(hi) > 0) return hi;

    let lo = 0;
    for (let i = 0; i < 120; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function precipitationPass(vessel, report) {
    const V = vessel.waterVolume / 1000;
    if (V <= 1e-9) return;

    let guard = 0;
    let changed = true;

    while (changed && guard++ < 6) {
      changed = false;

      for (let i = 0; i < KSP_TABLE.length; i++) {
        const entry = KSP_TABLE[i];
        const nA = vessel.solutes[entry.cation.sp] || 0;
        const nB = vessel.solutes[entry.anion.sp] || 0;
        if (nA <= EPS || nB <= EPS) continue;

        const a = entry.cation.n;
        const b = entry.anion.n;
        const cA = nA / V;
        const cB = nB / V;

        const Q = Math.pow(cA, a) * Math.pow(cB, b);
        if (Q <= entry.ksp) continue;

        const x = solvePrecipitation(cA, cB, a, b, entry.ksp);
        const molPrecip = x * V;
        if (molPrecip <= 1e-12) continue;

        const takenA = vessel.takeIon(entry.cation.sp, molPrecip * a);
        const takenB = vessel.takeIon(entry.anion.sp, molPrecip * b);
        const actual = Math.min(takenA / a, takenB / b);
        if (actual <= 1e-12) continue;

        /* Give back any overshoot */
        const excessA = takenA - actual * a;
        const excessB = takenB - actual * b;
        if (excessA > EPS) vessel.addIon(entry.cation.sp, excessA);
        if (excessB > EPS) vessel.addIon(entry.anion.sp, excessB);

        vessel.addSolid(entry.id, actual, entry.molarMass, entry.formula, entry.name);

        const dH = isFinite(entry.dH) ? entry.dH : -30.0;
        vessel.addHeat(-dH * actual);

        report.precipitates.push({
          id: entry.id,
          name: entry.name,
          formula: entry.formula,
          moles: actual,
          mass: actual * entry.molarMass,
          colour: (FALLBACK_DB[entry.id] && FALLBACK_DB[entry.id].colour) || '#FFFFFF'
        });

        const netEq = fmtSpecies(entry.cation.sp) + '(aq) + ' +
                      (b > 1 ? b : '') + fmtSpecies(entry.anion.sp) + '(aq) → ' +
                      entry.formula + '(s)↓';
        const netLatex = '\\text{' + entry.cation.sp.replace('^', '') + '}^{' + a + '+}(aq) + ' +
                         (b > 1 ? b : '') + '\\text{' + entry.anion.sp.replace('^', '') +
                         '}^{' + b + '-}(aq) \\rightarrow \\text{' + entry.formula + '}(s)\\downarrow';
        mergeEquation(report, netEq, netLatex, dH, 'precipitation');

        report.notes.push(entry.name + ' precipitated (' + round(actual * entry.molarMass, 4) + ' g).');

        vessel.logReaction({
          type: 'precipitation', species: entry.id, moles: actual, dH: dH,
          equation: netEq, t: Date.now()
        });

        changed = true;
      }
    }
  }

  /* ==========================================================================
   * SECTION 17 — EQUILIBRATION
   * ========================================================================== */

  function equilibrate(vessel, report) {
    if (vessel.waterVolume <= 1e-9) {
      /* Dry vessel — no aqueous chemistry at all. */
      computePH(vessel);
      vessel.computeMass();
      applyPendingHeat(vessel);
      return;
    }

    /* 1. Digest acid-reactive solids */
    acidDigestPass(vessel, report);

    /* 2. Volatile-oxide evolution from dissolved anions */
    solutionPass(vessel, report);

    /* 3. Strong acid ↔ strong base neutralisation */
    let nH = vessel.solutes['H+'] || 0;
    let nOH = vessel.solutes['OH-'] || 0;
    const nNeut = Math.min(nH, nOH);
    if (nNeut > EPS) {
      vessel.takeIon('H+', nNeut);
      vessel.takeIon('OH-', nNeut);
      vessel.addHeat(nNeut * NEUTRALISATION_H);
      report.neutralisationMoles += nNeut;

      mergeEquation(
        report,
        'H⁺(aq) + OH⁻(aq) → H₂O(l)',
        '\\text{H}^+(aq) + \\text{OH}^-(aq) \\rightarrow \\text{H}_2\\text{O}(l)',
        -NEUTRALISATION_H, 'neutralisation'
      );
      report.notes.push('Acid–base neutralisation: ' + round(nNeut * NEUTRALISATION_H, 3) + ' kJ released.');
    }

    /* 4. Proton transfer with weak acids / weak bases */
    protonTransferPass(vessel, report);

    /* 5. Precipitation */
    precipitationPass(vessel, report);

    /* 6. pH */
    computePH(vessel);

    /* 7. Mass & temperature */
    vessel.computeMass();
    applyPendingHeat(vessel);
  }

  function protonTransferPass(vessel, report) {
    const V = vessel.waterVolume / 1000;
    if (V <= 1e-9) return;

    /* ---- H⁺ attacking weak bases ---- */
    let nH = vessel.solutes['H+'] || 0;
    if (nH > EPS) {
      let guard = 0;
      let progressed = true;
      while (progressed && guard++ < 12 && nH > EPS) {
        progressed = false;
        const keys = Object.keys(vessel.solutes);
        for (let i = 0; i < keys.length; i++) {
          const sp = keys[i];
          if (sp === 'H+') continue;
          const info = SPECIES_DB[sp];
          if (!info || !info.kb || !info.conjugateAcid) continue;
          const nB = vessel.solutes[sp] || 0;
          if (nB <= EPS) continue;

          const t = Math.min(nH, nB);
          if (t <= EPS) continue;

          vessel.takeIon(sp, t);
          vessel.addIon(info.conjugateAcid, t);
          vessel.takeIon('H+', t);
          nH -= t;

          /* weak base neutralisation enthalpy ≈ −52 kJ/mol */
          vessel.addHeat(t * 52.0);
          report.neutralisationMoles += t;

          mergeEquation(
            report,
            fmtSpecies(sp) + '(aq) + H⁺(aq) → ' + fmtSpecies(info.conjugateAcid) + '(aq)',
            '', -52.0, 'weak-base-protonation'
          );

          progressed = true;
        }
      }
    }

    /* ---- OH⁻ attacking weak acids ---- */
    let nOH = vessel.solutes['OH-'] || 0;
    if (nOH > EPS) {
      let guard = 0;
      let progressed = true;
      while (progressed && guard++ < 12 && nOH > EPS) {
        progressed = false;
        const keys = Object.keys(vessel.solutes);
        for (let i = 0; i < keys.length; i++) {
          const sp = keys[i];
          if (sp === 'OH-') continue;
          const info = SPECIES_DB[sp];
          if (!info || !info.ka || !info.conjugateBase) continue;
          const nA = vessel.solutes[sp] || 0;
          if (nA <= EPS) continue;

          const t = Math.min(nOH, nA);
          if (t <= EPS) continue;

          vessel.takeIon(sp, t);
          vessel.addIon(info.conjugateBase, t);
          vessel.takeIon('OH-', t);
          nOH -= t;

          vessel.addHeat(t * 55.0);
          report.neutralisationMoles += t;

          mergeEquation(
            report,
            fmtSpecies(sp) + '(aq) + OH⁻(aq) → ' + fmtSpecies(info.conjugateBase) + '(aq) + H₂O(l)',
            '', -55.0, 'weak-acid-deprotonation'
          );

          progressed = true;
        }
      }
    }
  }

  /* ==========================================================================
   * SECTION 18 — THERMAL DECOMPOSITION
   * ========================================================================== */

  const DECOMPOSITIONS = [
    {
      reactant: 'copper-hydroxide', minT: 80,
      equation: 'Cu(OH)₂(s) → CuO(s) + H₂O(g)↑',
      latex: '\\text{Cu(OH)}_2(s) \\rightarrow \\text{CuO}(s) + \\text{H}_2\\text{O}(g)\\uparrow',
      dH: 40.0,
      products: {
        solids: [{ id: 'copper-oxide', moles: 1, molarMass: 79.545, formula: 'CuO', name: 'Copper(II) oxide' }],
        gases: [{ id: 'H2O', moles: 1, formula: 'H₂O', name: 'Water vapour' }]
      }
    },
    {
      reactant: 'sodium-bicarbonate', minT: 100,
      equation: '2NaHCO₃(s) → Na₂CO₃(s) + H₂O(g)↑ + CO₂(g)↑',
      latex: '2\\text{NaHCO}_3(s) \\rightarrow \\text{Na}_2\\text{CO}_3(s) + \\text{H}_2\\text{O}(g)\\uparrow + \\text{CO}_2(g)\\uparrow',
      dH: 129.0,
      products: {
        solids: [{ id: 'sodium-carbonate', moles: 0.5, molarMass: 105.988, formula: 'Na₂CO₃', name: 'Sodium carbonate' }],
        gases: [
          { id: 'H2O', moles: 0.5, formula: 'H₂O', name: 'Water vapour' },
          { id: 'CO2', moles: 0.5, formula: 'CO₂', name: 'Carbon dioxide' }
        ]
      }
    },
    {
      reactant: 'copper-carbonate', minT: 200,
      equation: 'CuCO₃(s) → CuO(s) + CO₂(g)↑',
      latex: '\\text{CuCO}_3(s) \\rightarrow \\text{CuO}(s) + \\text{CO}_2(g)\\uparrow',
      dH: 85.0,
      products: {
        solids: [{ id: 'copper-oxide', moles: 1, molarMass: 79.545, formula: 'CuO', name: 'Copper(II) oxide' }],
        gases: [{ id: 'CO2', moles: 1, formula: 'CO₂', name: 'Carbon dioxide' }]
      }
    },
    {
      reactant: 'potassium-permanganate', minT: 240,
      equation: '2KMnO₄(s) → K₂MnO₄(s) + MnO₂(s) + O₂(g)↑',
      latex: '2\\text{KMnO}_4(s) \\rightarrow \\text{K}_2\\text{MnO}_4(s) + \\text{MnO}_2(s) + \\text{O}_2(g)\\uparrow',
      dH: 120.0,
      products: {
        solids: [
          { id: 'potassium-manganate', moles: 0.5, molarMass: 197.132, formula: 'K₂MnO₄', name: 'Potassium manganate' },
          { id: 'manganese-dioxide', moles: 0.5, molarMass: 86.937, formula: 'MnO₂', name: 'Manganese dioxide' }
        ],
        gases: [{ id: 'O2', moles: 0.5, formula: 'O₂', name: 'Oxygen' }]
      }
    },
    {
      reactant: 'aluminium-hydroxide', minT: 300,
      equation: '2Al(OH)₃(s) → Al₂O₃(s) + 3H₂O(g)↑',
      latex: '2\\text{Al(OH)}_3(s) \\rightarrow \\text{Al}_2\\text{O}_3(s) + 3\\text{H}_2\\text{O}(g)\\uparrow',
      dH: 90.0,
      products: {
        solids: [{ id: 'aluminium-oxide', moles: 0.5, molarMass: 101.961, formula: 'Al₂O₃', name: 'Aluminium oxide' }],
        gases: [{ id: 'H2O', moles: 1.5, formula: 'H₂O', name: 'Water vapour' }]
      }
    },
    {
      reactant: 'ammonium-chloride', minT: 337,
      equation: 'NH₄Cl(s) → NH₃(g)↑ + HCl(g)↑',
      latex: '\\text{NH}_4\\text{Cl}(s) \\rightarrow \\text{NH}_3(g)\\uparrow + \\text{HCl}(g)\\uparrow',
      dH: 176.0,
      products: {
        solids: [],
        gases: [
          { id: 'NH3', moles: 1, formula: 'NH₃', name: 'Ammonia' },
          { id: 'HCl', moles: 1, formula: 'HCl', name: 'Hydrogen chloride' }
        ]
      }
    },
    {
      reactant: 'magnesium-hydroxide', minT: 350,
      equation: 'Mg(OH)₂(s) → MgO(s) + H₂O(g)↑',
      latex: '\\text{Mg(OH)}_2(s) \\rightarrow \\text{MgO}(s) + \\text{H}_2\\text{O}(g)\\uparrow',
      dH: 81.0,
      products: {
        solids: [{ id: 'magnesium-oxide', moles: 1, molarMass: 40.304, formula: 'MgO', name: 'Magnesium oxide' }],
        gases: [{ id: 'H2O', moles: 1, formula: 'H₂O', name: 'Water vapour' }]
      }
    },
    {
      reactant: 'magnesium-carbonate', minT: 350,
      equation: 'MgCO₃(s) → MgO(s) + CO₂(g)↑',
      latex: '\\text{MgCO}_3(s) \\rightarrow \\text{MgO}(s) + \\text{CO}_2(g)\\uparrow',
      dH: 118.0,
      products: {
        solids: [{ id: 'magnesium-oxide', moles: 1, molarMass: 40.304, formula: 'MgO', name: 'Magnesium oxide' }],
        gases: [{ id: 'CO2', moles: 1, formula: 'CO₂', name: 'Carbon dioxide' }]
      }
    },
    {
      reactant: 'sodium-nitrate', minT: 380,
      equation: '2NaNO₃(s) → 2NaNO₂(s) + O₂(g)↑',
      latex: '2\\text{NaNO}_3(s) \\rightarrow 2\\text{NaNO}_2(s) + \\text{O}_2(g)\\uparrow',
      dH: 110.0,
      products: {
        solids: [{ id: 'sodium-nitrite', moles: 1, molarMass: 68.995, formula: 'NaNO₂', name: 'Sodium nitrite' }],
        gases: [{ id: 'O2', moles: 0.5, formula: 'O₂', name: 'Oxygen' }]
      }
    },
    {
      reactant: 'potassium-chlorate', minT: 400,
      equation: '2KClO₃(s) → 2KCl(s) + 3O₂(g)↑',
      latex: '2\\text{KClO}_3(s) \\rightarrow 2\\text{KCl}(s) + 3\\text{O}_2(g)\\uparrow',
      dH: -89.0,
      products: {
        solids: [{ id: 'potassium-chloride', moles: 1, molarMass: 74.551, formula: 'KCl', name: 'Potassium chloride' }],
        gases: [{ id: 'O2', moles: 1.5, formula: 'O₂', name: 'Oxygen' }]
      }
    },
    {
      reactant: 'zinc-carbonate', minT: 400,
      equation: 'ZnCO₃(s) → ZnO(s) + CO₂(g)↑',
      latex: '\\text{ZnCO}_3(s) \\rightarrow \\text{ZnO}(s) + \\text{CO}_2(g)\\uparrow',
      dH: 110.0,
      products: {
        solids: [{ id: 'zinc-oxide', moles: 1, molarMass: 81.380, formula: 'ZnO', name: 'Zinc oxide' }],
        gases: [{ id: 'CO2', moles: 1, formula: 'CO₂', name: 'Carbon dioxide' }]
      }
    },
    {
      reactant: 'iron3-hydroxide', minT: 500,
      equation: '2Fe(OH)₃(s) → Fe₂O₃(s) + 3H₂O(g)↑',
      latex: '2\\text{Fe(OH)}_3(s) \\rightarrow \\text{Fe}_2\\text{O}_3(s) + 3\\text{H}_2\\text{O}(g)\\uparrow',
      dH: 100.0,
      products: {
        solids: [{ id: 'iron3-oxide', moles: 0.5, molarMass: 159.688, formula: 'Fe₂O₃', name: 'Iron(III) oxide' }],
        gases: [{ id: 'H2O', moles: 1.5, formula: 'H₂O', name: 'Water vapour' }]
      }
    },
    {
      reactant: 'mercury-oxide', minT: 500,
      equation: '2HgO(s) → 2Hg(l) + O₂(g)↑',
      latex: '2\\text{HgO}(s) \\rightarrow 2\\text{Hg}(l) + \\text{O}_2(g)\\uparrow',
      dH: 182.0,
      products: {
        solids: [{ id: 'mercury', moles: 1, molarMass: 200.592, formula: 'Hg', name: 'Mercury' }],
        gases: [{ id: 'O2', moles: 0.5, formula: 'O₂', name: 'Oxygen' }]
      }
    },
    {
      reactant: 'silver-oxide', minT: 300,
      equation: '2Ag₂O(s) → 4Ag(s) + O₂(g)↑',
      latex: '2\\text{Ag}_2\\text{O}(s) \\rightarrow 4\\text{Ag}(s) + \\text{O}_2(g)\\uparrow',
      dH: 62.0,
      products: {
        solids: [{ id: 'silver', moles: 2, molarMass: 107.868, formula: 'Ag', name: 'Silver' }],
        gases: [{ id: 'O2', moles: 0.5, formula: 'O₂', name: 'Oxygen' }]
      }
    },
    {
      reactant: 'calcium-carbonate', minT: 840,
      equation: 'CaCO₃(s) → CaO(s) + CO₂(g)↑',
      latex: '\\text{CaCO}_3(s) \\rightarrow \\text{CaO}(s) + \\text{CO}_2(g)\\uparrow',
      dH: 178.0,
      products: {
        solids: [{ id: 'calcium-oxide', moles: 1, molarMass: 56.077, formula: 'CaO', name: 'Calcium oxide' }],
        gases: [{ id: 'CO2', moles: 1, formula: 'CO₂', name: 'Carbon dioxide' }]
      }
    },
    {
      reactant: 'calcium-hydroxide', minT: 580,
      equation: 'Ca(OH)₂(s) → CaO(s) + H₂O(g)↑',
      latex: '\\text{Ca(OH)}_2(s) \\rightarrow \\text{CaO}(s) + \\text{H}_2\\text{O}(g)\\uparrow',
      dH: 109.0,
      products: {
        solids: [{ id: 'calcium-oxide', moles: 1, molarMass: 56.077, formula: 'CaO', name: 'Calcium oxide' }],
        gases: [{ id: 'H2O', moles: 1, formula: 'H₂O', name: 'Water vapour' }]
      }
    }
  ];

  function decompositionPass(vessel, report) {
    if (vessel.solids.length === 0) return;

    let guard = 0;
    let changed = true;

    while (changed && guard++ < 6) {
      changed = false;

      for (let i = 0; i < DECOMPOSITIONS.length; i++) {
        const rule = DECOMPOSITIONS[i];
        if (vessel.temperature < rule.minT) continue;

        const solid = vessel.findSolid(rule.reactant);
        if (!solid || solid.moles <= EPS) continue;

        const n = solid.moles;
        vessel.takeSolid(rule.reactant, n);

        const prods = rule.products || {};
        if (prods.solids) {
          for (let k = 0; k < prods.solids.length; k++) {
            const p = prods.solids[k];
            vessel.addSolid(p.id, p.moles * n, p.molarMass, p.formula, p.name);
          }
        }
        if (prods.gases) {
          for (let k = 0; k < prods.gases.length; k++) {
            const p = prods.gases[k];
            const gm = p.moles * n;
            vessel.addGas(p.id, gm, p.formula, p.name);
            report.gasEvents.push({
              id: p.id, formula: p.formula, name: p.name,
              moles: gm, volume: gm * MOLAR_GAS_VOL
            });
          }
        }

        /* dH > 0 ⇒ endothermic ⇒ vessel cools */
        vessel.addHeat(-rule.dH * n);

        mergeEquation(report, rule.equation, rule.latex, rule.dH, 'decomposition');
        report.decompositionEvents.push({
          reactant: rule.reactant, moles: n, minT: rule.minT, dH: rule.dH
        });
        report.notes.push(
          rule.reactant.replace(/-/g, ' ') + ' decomposed at ' + rule.minT + ' °C.'
        );

        vessel.logReaction({
          type: 'decomposition', species: rule.reactant, moles: n,
          dH: rule.dH, equation: rule.equation, t: Date.now()
        });

        changed = true;
        break;
      }
    }
  }

  /* ==========================================================================
   * SECTION 19 — REDISSOLUTION WHEN WATER IS ADDED
   * ========================================================================== */

  function redissolveSolids(vessel, report) {
    if (vessel.waterVolume <= 1e-9) return;

    const snapshot = vessel.solids.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const s = snapshot[i];
      if (s.moles <= EPS) continue;

      const chem = resolveChemical(s.id);
      if (!chem) continue;
      if (chem.soluble === false) continue;
      const ions = chem.ions || {};
      if (Object.keys(ions).length === 0) continue;

      const taken = vessel.takeSolid(s.id, s.moles);
      if (taken <= EPS) continue;

      for (const sp in ions) {
        if (!Object.prototype.hasOwnProperty.call(ions, sp)) continue;
        vessel.addIon(sp, taken * ions[sp]);
      }
      const dHsol = isFinite(chem.heatOfSolution) ? chem.heatOfSolution : 0;
      vessel.addHeat(-dHsol * taken);
      report.notes.push(chem.name + ' dissolved as water was added.');
      report.dissolutionEvents.push({ id: chem.id, name: chem.name, moles: taken, dH: dHsol });
    }
  }

  /* ==========================================================================
   * SECTION 20 — ENGINE INSTANCE / SINGLETON STATE
   * ========================================================================== */

  const vessel = new VesselState();

  /* ==========================================================================
   * SECTION 21 — PUBLIC API
   * ========================================================================== */

  function finaliseResult(report, vesselRef, context) {
    vesselRef.computeMass();
    computePH(vesselRef);

    const eqList = report.equations;
    const primary = eqList.length ? eqList[0] : null;

    vesselRef.lastEquation = primary ? primary.equation : null;
    vesselRef.lastLatex = primary ? primary.latex : null;

    const result = {
      ok: !report.error,
      error: report.error || null,
      version: VERSION,

      /* --- reaction description --- */
      balancedEquation: primary ? primary.equation : null,
      balancedEquationLatex: primary ? primary.latex : null,
      equations: eqList.map(function (e) {
        return { equation: e.equation, latex: e.latex, dH: e.dH, type: e.type };
      }),

      /* --- state snapshot --- */
      activeSpecies: vesselRef.activeSpecies(),
      waterVolume: round(vesselRef.waterVolume, 4),
      temperature: round(vesselRef.temperature, 3),
      pH: round(vesselRef.pH, 2),
      pOH: round(vesselRef.pOH, 2),
      totalMass: round(vesselRef.totalMass, 4),
      molarities: (function () {
        const m = vesselRef.molarities();
        const out = {};
        for (const k in m) out[k] = round(m[k], 6);
        return out;
      })(),

      /* --- energy & hazards --- */
      heatReleased: round(report.heatReleased, 4),
      isExplosive: !!report.isExplosive,
      flameColor: report.flameColor || vesselRef.flameColor || null,

      /* --- products --- */
      gasEvolved: report.gasEvents.map(function (g) {
        return {
          id: g.id, formula: g.formula, name: g.name,
          moles: round(g.moles, 6), volume: round(g.volume, 4)
        };
      }),
      precipitates: report.precipitates.map(function (p) {
        return {
          id: p.id, name: p.name, formula: p.formula,
          moles: round(p.moles, 6), mass: round(p.mass, 4),
          colour: p.colour || '#FFFFFF'
        };
      }),
      decompositionEvents: report.decompositionEvents,
      dissolutionEvents: report.dissolutionEvents,

      /* --- narrative --- */
      notes: report.notes.slice(),
      context: context || null,
      timestamp: Date.now()
    };

    if (context && context.chemical) {
      result.chemical = context.chemical;
      result.amount = context.amount;
      result.unit = context.unit;
      result.moles = round(context.moles, 8);
      result.mass = round(context.mass, 6);
    }

    return result;
  }

  function addChemical(id, amount, unit) {
    const chem = resolveChemical(id);
    if (!chem) {
      return {
        ok: false,
        error: 'Unknown chemical identifier: "' + id + '"',
        balancedEquation: null,
        activeSpecies: vessel.activeSpecies(),
        notes: []
      };
    }

    const qty = Number(amount);
    if (!isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: 'Invalid amount supplied for ' + chem.name + '.',
        balancedEquation: null,
        activeSpecies: vessel.activeSpecies(),
        notes: []
      };
    }

    const moles = toMoles(chem, qty, unit);
    const mass = moles * (chem.molarMass || 1);
    const report = newReport();

    vessel.heatAccumulator = 0;
    vessel.isExplosive = false;
    vessel.operationCount++;

    /* ---------------- WATER ---------------- */
    if (chem.id === 'water' || chem.solvent === true) {
      const mL = unitToVolume(qty, unit);
      vessel.addWater(mL);
      report.notes.push('Added ' + round(mL, 3) + ' mL of ' + chem.name + '.');
      redissolveSolids(vessel, report);
      equilibrate(vessel, report);
      report.heatReleased = vessel.heatAccumulator;
      return finaliseResult(report, vessel, {
        chemical: { id: chem.id, name: chem.name, formula: chem.formula },
        amount: qty, unit: normaliseUnit(unit), moles: moles, mass: mass
      });
    }

    /* ---------------- GASEOUS REAGENTS ---------------- */
    if (chem.state === 'g' && chem.category === 'oxide' && vessel.waterVolume > 1e-9) {
      const used = hOxideHydration(vessel, chem, moles, report);
      if (used < moles - EPS) {
        /* Gas that does not dissolve simply bubbles through and escapes. */
        const leftover = moles - used;
        vessel.addGas(chem.id, leftover, chem.formula, chem.name);
        report.notes.push(
          round(leftover * MOLAR_GAS_VOL, 3) + ' L of ' + chem.name +
          ' passed through the vessel without dissolving.'
        );
      }
      equilibrate(vessel, report);
      report.heatReleased = vessel.heatAccumulator;
      return finaliseResult(report, vessel, {
        chemical: { id: chem.id, name: chem.name, formula: chem.formula },
        amount: qty, unit: normaliseUnit(unit), moles: moles, mass: mass
      });
    }

    /* ---------------- GENERAL PATH ---------------- */
    let remaining = moles;

    for (let i = 0; i < HANDLERS.length; i++) {
      if (remaining <= EPS) break;
      let used = 0;
      try {
        used = HANDLERS[i](vessel, chem, remaining, report) || 0;
      } catch (err) {
        used = 0;
      }
      if (used > EPS) {
        remaining -= Math.min(used, remaining);
      }
    }

    if (remaining > EPS) {
      deposit(vessel, chem, remaining, report);
    }

    /* ---------------- DRY-STATE SAFETY NETS ---------------- */
    if (vessel.waterVolume <= 1e-9 && chem.category === 'alkali-metal') {
      report.notes.push(
        'DRY STATE PROTECTION: ' + chem.name +
        ' remains inert — no water present, no reaction, no explosion.'
      );
      report.isExplosive = false;
      vessel.isExplosive = false;
    }

    equilibrate(vessel, report);
    report.heatReleased = vessel.heatAccumulator;

    /* Register this addition in the vessel history */
    vessel.addedHistory.push({
      id: chem.id, name: chem.name, formula: chem.formula,
      moles: moles, mass: mass, unit: normaliseUnit(unit),
      amount: qty, t: Date.now()
    });
    if (vessel.addedHistory.length > 100) vessel.addedHistory.shift();

    return finaliseResult(report, vessel, {
      chemical: { id: chem.id, name: chem.name, formula: chem.formula },
      amount: qty, unit: normaliseUnit(unit), moles: moles, mass: mass
    });
  }

  /* --------------------------------------------------------------------------
   * heatVessel(heatLevel)
   * ------------------------------------------------------------------------ */
  function heatVessel(heatLevel) {
    const level = clamp(num(heatLevel, 0), 0, 10);
    const report = newReport();

    vessel.heatAccumulator = 0;
    vessel.operationCount++;

    const T0 = vessel.temperature;
    vessel.burnerLevel = level;

    if (level <= 0) {
      /* Burner off — Newtonian cooling toward ambient */
      const delta = (vessel.temperature - AMBIENT_T) * 0.15;
      vessel.temperature = Math.max(AMBIENT_T, vessel.temperature - delta);
      if (Math.abs(vessel.temperature - AMBIENT_T) < 0.01) vessel.temperature = AMBIENT_T;
      report.notes.push('Bunsen burner off — vessel cooling toward ambient temperature.');
    } else {
      /* Energy input: level 10 ≈ 30 kJ per call */
      const kJ = level * 3.0;
      raiseTemperature(vessel, kJ);
      report.notes.push('Bunsen burner set to level ' + level + ' (' + round(kJ, 2) + ' kJ delivered).');

      /* Thermal decomposition sweep */
      decompositionPass(vessel, report);

      /* Catalytic peroxide decomposition at moderate heat */
      if (vessel.temperature >= 60 && (vessel.solutes['H2O2'] || 0) > EPS) {
        const n = vessel.solutes['H2O2'];
        vessel.takeIon('H2O2', n);
        vessel.addGas('O2', n / 2, 'O₂', 'Oxygen');
        vessel.waterVolume += n * WATER_MM;
        vessel.addHeat(98.0 * n);
        report.gasEvents.push({
          id: 'O2', formula: 'O₂', name: 'Oxygen',
          moles: n / 2, volume: (n / 2) * MOLAR_GAS_VOL
        });
        mergeEquation(
          report,
          '2H₂O₂(aq) → 2H₂O(l) + O₂(g)↑',
          '2\\text{H}_2\\text{O}_2(aq) \\rightarrow 2\\text{H}_2\\text{O}(l) + \\text{O}_2(g)\\uparrow',
          -98.0, 'catalytic-decomposition'
        );
        report.notes.push('Hydrogen peroxide decomposed, releasing oxygen.');
      }

      /* Dry solid boiling-point effects are handled inside raiseTemperature */
    }

    if (vessel.waterVolume <= 1e-9 && vessel.waterVolume > 0) vessel.waterVolume = 0;

    updateFlame(vessel, report);
    equilibrate(vessel, report);
    report.heatReleased = vessel.heatAccumulator;

    const result = finaliseResult(report, vessel, null);
    result.heatLevel = level;
    result.temperatureChange = round(vessel.temperature - T0, 3);
    result.burnerLevel = vessel.burnerLevel;
    return result;
  }

  /* --------------------------------------------------------------------------
   * resetVessel()
   * ------------------------------------------------------------------------ */
  function resetVessel() {
    vessel.reset();
    computePH(vessel);
    vessel.computeMass();

    return {
      ok: true,
      message: 'Vessel purged and reset to standard conditions.',
      waterVolume: vessel.waterVolume,
      temperature: vessel.temperature,
      pH: vessel.pH,
      pOH: vessel.pOH,
      solutes: {},
      solids: [],
      gases: [],
      totalMass: vessel.totalMass,
      activeSpecies: [],
      balancedEquation: null,
      heatReleased: 0,
      isExplosive: false,
      flameColor: null,
      notes: [
        'Vessel content purged.',
        'waterVolume → 0 mL',
        'solutes → {}',
        'solids → []',
        'gases → []',
        'temperature → 25.0 °C',
        'pH → 7.00'
      ],
      timestamp: Date.now()
    };
  }

  /* --------------------------------------------------------------------------
   * getTelemetry()
   * ------------------------------------------------------------------------ */
  function getTelemetry() {
    vessel.computeMass();

    const molarities = {};
    const raw = vessel.molarities();
    for (const k in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) molarities[k] = round(raw[k], 6);
    }

    return {
      ok: true,
      version: VERSION,
      timestamp: Date.now(),

      /* core state */
      waterVolume: round(vessel.waterVolume, 4),
      temperature: round(vessel.temperature, 3),
      pH: round(vessel.pH, 2),
      pOH: round(vessel.pOH, 2),
      totalMass: round(vessel.totalMass, 4),

      /* species */
      solutes: deepCopy(vessel.solutes),
      molarities: molarities,
      solids: vessel.solids.map(function (s) {
        return {
          id: s.id, name: s.name, formula: s.formula,
          moles: round(s.moles, 8), mass: round(s.mass, 5),
          molarMass: s.molarMass
        };
      }),
      gases: vessel.gases.map(function (g) {
        return {
          id: g.id, name: g.name, formula: g.formula,
          moles: round(g.moles, 8), volume: round(g.volume, 5)
        };
      }),
      activeSpecies: vessel.activeSpecies(),

      /* environment */
      burnerLevel: vessel.burnerLevel,
      flameColor: vessel.flameColor,
      isExplosive: vessel.isExplosive,
      stirring: vessel.stirring,
      isDry: vessel.waterVolume <= 1e-9,

      /* history */
      lastEquation: vessel.lastEquation,
      lastLatex: vessel.lastLatex,
      reactionLog: vessel.reactionLog.slice(-25),
      addedHistory: vessel.addedHistory.slice(-25),
      operationCount: vessel.operationCount,

      /* derived chemistry readouts */
      isAcidic: vessel.pH < 6.99,
      isBasic: vessel.pH > 7.01,
      isNeutral: Math.abs(vessel.pH - 7) <= 0.01,
      isBoiling: vessel.waterVolume > 1e-9 && vessel.temperature >= 99.5,
      hasPrecipitate: vessel.solids.length > 0
    };
  }

  /* --------------------------------------------------------------------------
   * Auxiliary public helpers
   * ------------------------------------------------------------------------ */
  function listChemicals() {
    const out = [];
    for (const key in FALLBACK_DB) {
      if (!Object.prototype.hasOwnProperty.call(FALLBACK_DB, key)) continue;
      const rec = FALLBACK_DB[key];
      out.push({
        id: rec.id,
        name: rec.name,
        formula: rec.formula,
        state: rec.state,
        category: rec.category,
        molarMass: rec.molarMass
      });
    }
    return out;
  }

  function findChemical(query) {
    return resolveChemical(query);
  }

  function createVessel() {
    return new VesselState();
  }

  function addWater(amount, unit) {
    return addChemical('water', amount, unit || 'mL');
  }

  function clearGases() {
    vessel.clearGases();
    return getTelemetry();
  }

  function setStirring(on) {
    vessel.stirring = !!on;
    return vessel.stirring;
  }

  function invalidateCache() {
    invalidateResolveCache();
    return true;
  }

  /* ==========================================================================
   * SECTION 22 — EXPORT
   * ========================================================================== */

  const ChemistryEngine = {
    VERSION: VERSION,
    VesselState: VesselState,

    /* ---- primary API ---- */
    addChemical: addChemical,
    heatVessel: heatVessel,
    resetVessel: resetVessel,
    getTelemetry: getTelemetry,

    /* ---- secondary API ---- */
    getVessel: function () { return vessel; },
    createVessel: createVessel,
    addWater: addWater,
    clearGases: clearGases,
    setStirring: setStirring,
    listChemicals: listChemicals,
    findChemical: findChemical,
    invalidateCache: invalidateCache,

    /* ---- live references ---- */
    vessel: vessel,

    /* ---- chemistry tables (read-only introspection) ---- */
    speciesTable: SPECIES_DB,
    kspTable: KSP_TABLE,
    decompositionTable: DECOMPOSITIONS,
    flameColours: FLAME_COLORS,

    /* ---- constants ---- */
    constants: {
      C_WATER: C_WATER,
      WATER_DENSITY: WATER_DENSITY,
      WATER_MOLAR_MASS: WATER_MM,
      MOLAR_GAS_VOLUME: MOLAR_GAS_VOL,
      LATENT_HEAT_VAPORISATION: LATENT_VAP,
      NEUTRALISATION_ENTHALPY: NEUTRALISATION_H,
      AMBIENT_TEMPERATURE: AMBIENT_T,
      KW: KW
    }
  };

  /* Freeze the public surface so downstream code cannot accidentally clobber it */
  try { Object.freeze(ChemistryEngine.constants); } catch (e) { /* ignore */ }

  global.ChemistryEngine = ChemistryEngine;

  /* Convenience aliases used by some UI layers */
  if (!global.VirtuaLab) global.VirtuaLab = {};
  global.VirtuaLab.ChemistryEngine = ChemistryEngine;
  global.VirtuaLab.VesselState = VesselState;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
