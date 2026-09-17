/* ============================================================================
 * VirtuaLab Pro — chemicals.js
 * ----------------------------------------------------------------------------
 * Scientific Chemical Database & Thermophysical Property Registry
 * Author: VirtuaLab Pro Computational Chemistry Core
 * ----------------------------------------------------------------------------
 * EXPORTS: window.ChemicalsDB
 *   .version
 *   .elements         { key -> element record }
 *   .chemicals        { id  -> chemical record }
 *   .categories       { id  -> { label, color, icon } }
 *   .activitySeries   ordered metal reactivity array
 *   .solubilityRules  qualitative solubility table
 *   .flameColors      emission tints for flame tests
 *   .indicatorRanges  pH transition data for indicators
 *   .gasProperties    volatility / fume color / density data
 *   .get(id)  .byFormula(f)  .search(q)  .list()  .listByCategory(c)
 * ----------------------------------------------------------------------------
 * UNITS: molarMass g/mol | density g/mL | solubility g/100mL @20C
 * ==========================================================================*/

(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  /* ==========================================================================
   * 1. CATEGORY TAXONOMY
   * ========================================================================*/
  const CATEGORIES = {
    water:        { label: 'Solvent',          color: '#38bdf8', icon: '💧' },
    alkali_metal: { label: 'Alkali Metal',     color: '#f97316', icon: '🔥' },
    metal:        { label: 'Metal / Solid',    color: '#94a3b8', icon: '🔩' },
    strong_acid:  { label: 'Strong Acid',      color: '#ef4444', icon: '🧪' },
    weak_acid:    { label: 'Weak Acid',        color: '#f59e0b', icon: '🧪' },
    strong_base:  { label: 'Strong Base',      color: '#8b5cf6', icon: '🧴' },
    weak_base:    { label: 'Weak Base',        color: '#a78bfa', icon: '🧴' },
    salt:         { label: 'Soluble Salt',     color: '#22d3ee', icon: '🧂' },
    insoluble:    { label: 'Insoluble Solid',  color: '#a8a29e', icon: '🪨' },
    indicator:    { label: 'Indicator',        color: '#ec4899', icon: '🎨' },
    gas:          { label: 'Gas / Volatile',   color: '#84cc16', icon: '💨' },
    oxidizer:     { label: 'Oxidizer',         color: '#facc15', icon: '⚡' },
    organic:      { label: 'Organic',          color: '#14b8a6', icon: '⛓️' }
  };

  /* ==========================================================================
   * 2. ELEMENT REFERENCE (atomic data for stoichiometry + flame tests)
   * ========================================================================*/
  const ELEMENTS = {
    H:  { Z: 1,  name: 'Hydrogen',  mass: 1.008,  group: 1  },
    Li: { Z: 3,  name: 'Lithium',   mass: 6.94,   group: 1  },
    C:  { Z: 6,  name: 'Carbon',    mass: 12.011, group: 14 },
    N:  { Z: 7,  name: 'Nitrogen',  mass: 14.007, group: 15 },
    O:  { Z: 8,  name: 'Oxygen',    mass: 15.999, group: 16 },
    F:  { Z: 9,  name: 'Fluorine',  mass: 18.998, group: 17 },
    Na: { Z: 11, name: 'Sodium',    mass: 22.990, group: 1  },
    Mg: { Z: 12, name: 'Magnesium', mass: 24.305, group: 2  },
    Al: { Z: 13, name: 'Aluminium', mass: 26.982, group: 13 },
    Si: { Z: 14, name: 'Silicon',   mass: 28.085, group: 14 },
    P:  { Z: 15, name: 'Phosphorus',mass: 30.974, group: 15 },
    S:  { Z: 16, name: 'Sulfur',    mass: 32.06,  group: 16 },
    Cl: { Z: 17, name: 'Chlorine',  mass: 35.45,  group: 17 },
    K:  { Z: 19, name: 'Potassium', mass: 39.098, group: 1  },
    Ca: { Z: 20, name: 'Calcium',   mass: 40.078, group: 2  },
    Mn: { Z: 25, name: 'Manganese', mass: 54.938, group: 7  },
    Fe: { Z: 26, name: 'Iron',      mass: 55.845, group: 8  },
    Cu: { Z: 29, name: 'Copper',    mass: 63.546, group: 11 },
    Zn: { Z: 30, name: 'Zinc',      mass: 65.38,  group: 12 },
    Br: { Z: 35, name: 'Bromine',   mass: 79.904, group: 17 },
    Ag: { Z: 47, name: 'Silver',    mass: 107.868,group: 11 },
    I:  { Z: 53, name: 'Iodine',    mass: 126.904,group: 17 },
    Ba: { Z: 56, name: 'Barium',    mass: 137.327,group: 2  },
    Pb: { Z: 82, name: 'Lead',      mass: 207.2,  group: 14 },
    Rb: { Z: 37, name: 'Rubidium',  mass: 85.468, group: 1  },
    Cs: { Z: 55, name: 'Caesium',   mass: 132.905,group: 1  }
  };

  /* ==========================================================================
   * 3. CHEMICAL SPECIES REGISTRY
   * --------------------------------------------------------------------------
   * SCHEMA:
   *   id             unique lowercase key
   *   name           display name
   *   formula        Hill-notation formula string
   *   molarMass      g/mol
   *   category       key into CATEGORIES
   *   defaultState   'solid' | 'liquid' | 'aqueous' | 'gas'
   *   density        g/mL (solid) or g/mL (neat liquid)
   *   solubility     g per 100 mL H2O @ 20 °C (Infinity for miscible)
   *   color          hex tint rendered when dissolved (aqueous chromophore)
   *   solidColor     hex tint for the crystalline / powder solid form
   *   opacity        alpha multiplier for the aqueous tint (0-1)
   *   ions           { ionSymbol: stoichiometricCount } upon full dissociation
   *   isAcid / isBase            boolean
   *   pKa / pKb                  dissociation constant (weak electrolytes only)
   *   protonCount / hydroxideCount  equivalents per formula unit
   *   hazardous                  bool (enables runaway / toxic gas paths)
   *   flameColor                 emission tint for flame test (metals/salts)
   *   gasOnRelease               gas id released on decomposition / reaction
   *   precipitateColor           hex of the insoluble product formed
   *   notes                      pedagogic remark shown in tooltips
   * ========================================================================*/
  const CHEMICALS = {

    /* ---------------------------------------------------------------------
     * SOLVENT
     * -------------------------------------------------------------------*/
    water: {
      id: 'water', name: 'Distilled Water', formula: 'H₂O',
      molarMass: 18.015, category: 'water', defaultState: 'liquid',
      density: 1.000, solubility: Infinity,
      color: '#7dd3fc', solidColor: '#e0f2fe', opacity: 0.28,
      ions: {}, isAcid: false, isBase: false,
      pKa: 15.7, pKb: null, protonCount: 0, hydroxideCount: 0,
      hazardous: false, flameColor: null, gasOnRelease: null,
      precipitateColor: null,
      notes: 'Amphiprotic solvent. Kw = 1.0e-14 at 25 C. Autoprotolysis supplies 1e-7 M H+ and OH-.'
    },

    /* ---------------------------------------------------------------------
     * ALKALI METALS  (Group 1 — violent with water, inert when dry)
     * -------------------------------------------------------------------*/
    li: {
      id: 'li', name: 'Lithium', formula: 'Li',
      molarMass: 6.94, category: 'alkali_metal', defaultState: 'solid',
      density: 0.534, solubility: 0,
      color: '#cbd5e1', solidColor: '#d8dee9', opacity: 1.0,
      ions: { 'Li+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#dc2626', gasOnRelease: 'h2',
      alkaliOrder: 1, waterReactivity: 'vigorous',
      notes: 'Li(s) + 2H2O -> 2LiOH(aq) + H2(g). Crimson flame. Least dense metal.'
    },
    na: {
      id: 'na', name: 'Sodium', formula: 'Na',
      molarMass: 22.990, category: 'alkali_metal', defaultState: 'solid',
      density: 0.968, solubility: 0,
      color: '#e2e8f0', solidColor: '#e6ebf2', opacity: 1.0,
      ions: { 'Na+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#facc15', gasOnRelease: 'h2',
      alkaliOrder: 2, waterReactivity: 'violent',
      notes: '2Na(s) + 2H2O -> 2NaOH(aq) + H2(g). Intense golden-yellow flame (589 nm D-line).'
    },
    k: {
      id: 'k', name: 'Potassium', formula: 'K',
      molarMass: 39.098, category: 'alkali_metal', defaultState: 'solid',
      density: 0.862, solubility: 0,
      color: '#e2e8f0', solidColor: '#e6ebf2', opacity: 1.0,
      ions: { 'K+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#c084fc', gasOnRelease: 'h2',
      alkaliOrder: 3, waterReactivity: 'explosive',
      notes: '2K(s) + 2H2O -> 2KOH(aq) + H2(g). Ignites evolved H2 — lilac flame. Superoxide crust.'
    },
    rb: {
      id: 'rb', name: 'Rubidium', formula: 'Rb',
      molarMass: 85.468, category: 'alkali_metal', defaultState: 'solid',
      density: 1.532, solubility: 0,
      color: '#e2e8f0', solidColor: '#e6ebf2', opacity: 1.0,
      ions: { 'Rb+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#f43f5e', gasOnRelease: 'h2',
      alkaliOrder: 4, waterReactivity: 'explosive',
      notes: '2Rb(s) + 2H2O -> 2RbOH(aq) + H2(g). Red-violet flame. Instantaneous ignition.'
    },
    cs: {
      id: 'cs', name: 'Caesium', formula: 'Cs',
      molarMass: 132.905, category: 'alkali_metal', defaultState: 'solid',
      density: 1.879, solubility: 0,
      color: '#e2e8f0', solidColor: '#e6ebf2', opacity: 1.0,
      ions: { 'Cs+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#3b82f6', gasOnRelease: 'h2',
      alkaliOrder: 5, waterReactivity: 'explosive',
      notes: '2Cs(s) + 2H2O -> 2CsOH(aq) + H2(g). Most electropositive stable element — detonates on contact.'
    },

    /* ---------------------------------------------------------------------
     * OTHER METALS (displacement / redox lab work)
     * -------------------------------------------------------------------*/
    mg: {
      id: 'mg', name: 'Magnesium Ribbon', formula: 'Mg',
      molarMass: 24.305, category: 'metal', defaultState: 'solid',
      density: 1.738, solubility: 0,
      color: '#cbd5e1', solidColor: '#d4d9e0', opacity: 1.0,
      ions: { 'Mg2+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#ffffff', gasOnRelease: 'h2',
      notes: 'Mg(s) + 2HCl(aq) -> MgCl2(aq) + H2(g). Burns brilliant white at 3100 C.'
    },
    al: {
      id: 'al', name: 'Aluminium Foil', formula: 'Al',
      molarMass: 26.982, category: 'metal', defaultState: 'solid',
      density: 2.70, solubility: 0,
      color: '#cbd5e1', solidColor: '#cfd6dd', opacity: 1.0,
      ions: { 'Al3+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#f8fafc', gasOnRelease: 'h2',
      notes: 'Amphoteric metal. 2Al + 6HCl -> 2AlCl3 + 3H2. Passivated by Al2O3 layer.'
    },
    zn: {
      id: 'zn', name: 'Zinc Granules', formula: 'Zn',
      molarMass: 65.38, category: 'metal', defaultState: 'solid',
      density: 7.14, solubility: 0,
      color: '#94a3b8', solidColor: '#a3adba', opacity: 1.0,
      ions: { 'Zn2+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#a7f3d0', gasOnRelease: 'h2',
      notes: 'Zn + 2HCl -> ZnCl2 + H2. Classic hydrogen-evolution displacement electrode.'
    },
    fe: {
      id: 'fe', name: 'Iron Filings', formula: 'Fe',
      molarMass: 55.845, category: 'metal', defaultState: 'solid',
      density: 7.874, solubility: 0,
      color: '#475569', solidColor: '#5b6472', opacity: 1.0,
      ions: { 'Fe2+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#fbbf24', gasOnRelease: 'h2',
      notes: 'Fe + 2HCl -> FeCl2 + H2. Fe2+ solutions oxidise to Fe3+ (rust-brown) in air.'
    },
    cu: {
      id: 'cu', name: 'Copper Turnings', formula: 'Cu',
      molarMass: 63.546, category: 'metal', defaultState: 'solid',
      density: 8.96, solubility: 0,
      color: '#b45309', solidColor: '#c2703a', opacity: 1.0,
      ions: { 'Cu2+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#10b981', gasOnRelease: null,
      notes: 'Below H in the EMF series — no reaction with dilute HCl. Emerald-green flame test.'
    },
    ag: {
      id: 'ag', name: 'Silver Foil', formula: 'Ag',
      molarMass: 107.868, category: 'metal', defaultState: 'solid',
      density: 10.49, solubility: 0,
      color: '#e2e8f0', solidColor: '#eef2f6', opacity: 1.0,
      ions: { 'Ag+': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      notes: 'Noble metal — inert to dilute HCl, dissolves in HNO3 to AgNO3.'
    },
    pb: {
      id: 'pb', name: 'Lead Shot', formula: 'Pb',
      molarMass: 207.2, category: 'metal', defaultState: 'solid',
      density: 11.34, solubility: 0,
      color: '#64748b', solidColor: '#71798a', opacity: 1.0,
      ions: { 'Pb2+': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#a3e635', gasOnRelease: null,
      notes: 'Toxic heavy metal. Gives yellow PbI2 precipitate with KI.'
    },

    /* ---------------------------------------------------------------------
     * STRONG ACIDS
     * -------------------------------------------------------------------*/
    hcl: {
      id: 'hcl', name: 'Hydrochloric Acid', formula: 'HCl',
      molarMass: 36.46, category: 'strong_acid', defaultState: 'aqueous',
      density: 1.18, solubility: Infinity,
      color: '#fef9c3', solidColor: null, opacity: 0.12,
      ions: { 'H+': 1, 'Cl-': 1 },
      isAcid: true, isBase: false,
      pKa: -6.3, pKb: null, protonCount: 1, hydroxideCount: 0,
      hazardous: true, flameColor: null, gasOnRelease: null,
      notes: 'Complete dissociation. Fully protonates water — [H+] = molarity.'
    },
    h2so4: {
      id: 'h2so4', name: 'Sulfuric Acid', formula: 'H₂SO₄',
      molarMass: 98.079, category: 'strong_acid', defaultState: 'aqueous',
      density: 1.84, solubility: Infinity,
      color: '#fde68a', solidColor: null, opacity: 0.16,
      ions: { 'H+': 2, 'SO4^2-': 1 },
      isAcid: true, isBase: false,
      pKa: -3.0, pKb: null, protonCount: 2, hydroxideCount: 0,
      hazardous: true, flameColor: null, gasOnRelease: null,
      notes: 'Diprotic. Generates 2 mol H+ per formula unit. Strong dehydrating agent.'
    },
    hno3: {
      id: 'hno3', name: 'Nitric Acid', formula: 'HNO₃',
      molarMass: 63.012, category: 'strong_acid', defaultState: 'aqueous',
      density: 1.51, solubility: Infinity,
      color: '#fef3c7', solidColor: null, opacity: 0.14,
      ions: { 'H+': 1, 'NO3-': 1 },
      isAcid: true, isBase: false,
      pKa: -1.4, pKb: null, protonCount: 1, hydroxideCount: 0,
      hazardous: true, flameColor: null, gasOnRelease: 'no2',
      notes: 'Strong oxidiser. Dissolves copper liberating brown NO2 fumes.'
    },

    /* ---------------------------------------------------------------------
     * WEAK ACIDS
     * -------------------------------------------------------------------*/
    ch3cooh: {
      id: 'ch3cooh', name: 'Acetic Acid', formula: 'CH₃COOH',
      molarMass: 60.052, category: 'weak_acid', defaultState: 'aqueous',
      density: 1.049, solubility: Infinity,
      color: '#fefce8', solidColor: null, opacity: 0.10,
      ions: { 'H+': 1, 'CH3COO-': 1 },
      isAcid: true, isBase: false,
      pKa: 4.76, pKb: null, protonCount: 1, hydroxideCount: 0,
      hazardous: false, flameColor: null, gasOnRelease: null,
      notes: 'Monoprotic weak acid. Ka = 1.8e-5. Partial dissociation — use ICE table for pH.'
    },
    h3po4: {
      id: 'h3po4', name: 'Phosphoric Acid', formula: 'H₃PO₄',
      molarMass: 97.994, category: 'weak_acid', defaultState: 'aqueous',
      density: 1.685, solubility: Infinity,
      color: '#fef9c3', solidColor: null, opacity: 0.10,
      ions: { 'H+': 3, 'PO4^3-': 1 },
      isAcid: true, isBase: false,
      pKa: 2.15, pKb: null, protonCount: 3, hydroxideCount: 0,
      hazardous: false, flameColor: null, gasOnRelease: null,
      notes: 'Triprotic. pKa1 = 2.15, pKa2 = 7.20, pKa3 = 12.35 — three distinct buffer plateaus.'
    },
    h2co3: {
      id: 'h2co3', name: 'Carbonic Acid', formula: 'H₂CO₃',
      molarMass: 62.03, category: 'weak_acid', defaultState: 'aqueous',
      density: 1.0, solubility: Infinity,
      color: '#ecfeff', solidColor: null, opacity: 0.08,
      ions: { 'H+': 2, 'CO3^2-': 1 },
      isAcid: true, isBase: false,
      pKa: 6.35, pKb: null, protonCount: 2, hydroxideCount: 0,
      hazardous: false, flameColor: null, gasOnRelease: 'co2',
      notes: 'Unstable — decomposes to CO2 + H2O. Governs the carbonate buffer system.'
    },

    /* ---------------------------------------------------------------------
     * STRONG BASES
     * -------------------------------------------------------------------*/
    naoh: {
      id: 'naoh', name: 'Sodium Hydroxide', formula: 'NaOH',
      molarMass: 40.00, category: 'strong_base', defaultState: 'aqueous',
      density: 2.13, solubility: 111,
      color: '#e9d5ff', solidColor: '#f3e8ff', opacity: 0.14,
      ions: { 'Na+': 1, 'OH-': 1 },
      isAcid: false, isBase: true,
      pKa: null, pKb: -0.56, protonCount: 0, hydroxideCount: 1,
      hazardous: true, flameColor: null, gasOnRelease: null,
      notes: 'Caustic alkali. Complete dissociation — pOH = -log[OH-].'
    },
    koh: {
      id: 'koh', name: 'Potassium Hydroxide', formula: 'KOH',
      molarMass: 56.106, category: 'strong_base', defaultState: 'aqueous',
      density: 2.044, solubility: 121,
      color: '#e9d5ff', solidColor: '#f3e8ff', opacity: 0.14,
      ions: { 'K+': 1, 'OH-': 1 },
      isAcid: false, isBase: true,
      pKa: null, pKb: -0.7, protonCount: 0, hydroxideCount: 1,
      hazardous: true, flameColor: null, gasOnRelease: null,
      notes: 'Caustic potash. Product of K + H2O. Lilac flame on the residue.'
    },
    caoh2: {
      id: 'caoh2', name: 'Calcium Hydroxide', formula: 'Ca(OH)₂',
      molarMass: 74.093, category: 'strong_base', defaultState: 'aqueous',
      density: 2.211, solubility: 0.173,
      color: '#f5f3ff', solidColor: '#ffffff', opacity: 0.18,
      ions: { 'Ca2+': 1, 'OH-': 2 },
      isAcid: false, isBase: true,
      pKa: null, pKb: -0.3, protonCount: 0, hydroxideCount: 2,
      hazardous: false, flameColor: '#fb923c', gasOnRelease: null,
      precipitateColor: '#ffffff',
      notes: 'Limewater. Sparingly soluble — CO2 turns it milky (CaCO3). Brick-red flame.'
    },
    nh3: {
      id: 'nh3', name: 'Ammonia Solution', formula: 'NH₃',
      molarMass: 17.031, category: 'weak_base', defaultState: 'aqueous',
      density: 0.91, solubility: Infinity,
      color: '#e0f2fe', solidColor: null, opacity: 0.10,
      ions: { 'NH4+': 1, 'OH-': 1 },
      isAcid: false, isBase: true,
      pKa: 9.25, pKb: 4.75, protonCount: 0, hydroxideCount: 1,
      hazardous: true, flameColor: null, gasOnRelease: 'nh3',
      notes: 'Weak base, Kb = 1.8e-5. Pungent. Gives brown Fe(OH)3 with Fe3+ solutions.'
    },

    /* ---------------------------------------------------------------------
     * SALTS & REAGENTS
     * -------------------------------------------------------------------*/
    nacl: {
      id: 'nacl', name: 'Sodium Chloride', formula: 'NaCl',
      molarMass: 58.44, category: 'salt', defaultState: 'solid',
      density: 2.165, solubility: 35.9,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.06,
      ions: { 'Na+': 1, 'Cl-': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#facc15', gasOnRelease: null,
      notes: 'Table salt. Neutral salt (Na+ from strong base, Cl- from strong acid). pH 7.'
    },
    kcl: {
      id: 'kcl', name: 'Potassium Chloride', formula: 'KCl',
      molarMass: 74.551, category: 'salt', defaultState: 'solid',
      density: 1.984, solubility: 34.0,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.06,
      ions: { 'K+': 1, 'Cl-': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#c084fc', gasOnRelease: null,
      notes: 'Neutral salt. Lilac flame test — classic potassium confirmation.'
    },
    ki: {
      id: 'ki', name: 'Potassium Iodide', formula: 'KI',
      molarMass: 166.003, category: 'salt', defaultState: 'solid',
      density: 3.13, solubility: 148,
      color: '#f8fafc', solidColor: '#ffffff', opacity: 0.06,
      ions: { 'K+': 1, 'I-': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#c084fc', gasOnRelease: null,
      precipitateColor: '#facc15',
      notes: 'Gives brilliant yellow PbI2 precipitate with lead(II) solutions.'
    },
    cuso4: {
      id: 'cuso4', name: 'Copper(II) Sulfate', formula: 'CuSO₄',
      molarMass: 159.609, category: 'salt', defaultState: 'solid',
      density: 3.60, solubility: 32.0,
      color: '#2563eb', solidColor: '#1d4ed8', opacity: 0.75,
      ions: { 'Cu2+': 1, 'SO4^2-': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#10b981', gasOnRelease: null,
      precipitateColor: '#93c5fd',
      notes: 'Blue pentahydrate. Emerald-green flame test. White anhydrous form turns blue on hydration.'
    },
    cucl2: {
      id: 'cucl2', name: 'Copper(II) Chloride', formula: 'CuCl₂',
      molarMass: 134.45, category: 'salt', defaultState: 'solid',
      density: 3.386, solubility: 70.6,
      color: '#0ea5e9', solidColor: '#0284c7', opacity: 0.70,
      ions: { 'Cu2+': 1, 'Cl-': 2 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#10b981', gasOnRelease: null,
      notes: 'Turquoise-green solution. Emerald-green flame test for Cu2+.'
    },
    agno3: {
      id: 'agno3', name: 'Silver Nitrate', formula: 'AgNO₃',
      molarMass: 169.873, category: 'salt', defaultState: 'solid',
      density: 4.35, solubility: 216,
      color: '#f8fafc', solidColor: '#ffffff', opacity: 0.04,
      ions: { 'Ag+': 1, 'NO3-': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: null, gasOnRelease: null,
      precipitateColor: '#f1f5f9',
      notes: 'Photosensitive. White AgCl curd precipitates on contact with any chloride source.'
    },
    pbno32: {
      id: 'pbno32', name: 'Lead(II) Nitrate', formula: 'Pb(NO₃)₂',
      molarMass: 331.2, category: 'salt', defaultState: 'solid',
      density: 4.53, solubility: 56.5,
      color: '#f8fafc', solidColor: '#ffffff', opacity: 0.04,
      ions: { 'Pb2+': 1, 'NO3-': 2 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: null, gasOnRelease: null,
      precipitateColor: '#facc15',
      notes: 'Toxic. Yellow PbI2 with KI, white PbCl2 with HCl — both classic qualitative tests.'
    },
    bacl2: {
      id: 'bacl2', name: 'Barium Chloride', formula: 'BaCl₂',
      molarMass: 208.23, category: 'salt', defaultState: 'solid',
      density: 3.856, solubility: 35.8,
      color: '#f8fafc', solidColor: '#ffffff', opacity: 0.04,
      ions: { 'Ba2+': 1, 'Cl-': 2 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#a3e635', gasOnRelease: null,
      precipitateColor: '#ffffff',
      notes: 'Toxic. White BaSO4 precipitate on contact with sulfates. Apple-green flame test.'
    },
    na2so4: {
      id: 'na2so4', name: 'Sodium Sulfate', formula: 'Na₂SO₄',
      molarMass: 142.04, category: 'salt', defaultState: 'solid',
      density: 2.664, solubility: 28.1,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.05,
      ions: { 'Na+': 2, 'SO4^2-': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#facc15', gasOnRelease: null,
      notes: 'Source of sulfate for BaSO4 gravimetric precipitation.'
    },
    na2co3: {
      id: 'na2co3', name: 'Sodium Carbonate', formula: 'Na₂CO₃',
      molarMass: 105.988, category: 'salt', defaultState: 'solid',
      density: 2.54, solubility: 22.0,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.08,
      ions: { 'Na+': 2, 'CO3^2-': 1 },
      isAcid: false, isBase: true,
      pKa: 10.33, pKb: 3.67, protonCount: 0, hydroxideCount: 0,
      hazardous: false, flameColor: '#facc15', gasOnRelease: 'co2',
      notes: 'Basic salt — CO3^2- hydrolyses to give pH ~11.5. Effervesces with acid.'
    },
    nahco3: {
      id: 'nahco3', name: 'Sodium Bicarbonate', formula: 'NaHCO₃',
      molarMass: 84.007, category: 'salt', defaultState: 'solid',
      density: 2.20, solubility: 9.6,
      color: '#f8fafc', solidColor: '#ffffff', opacity: 0.07,
      ions: { 'Na+': 1, 'HCO3-': 1 },
      isAcid: false, isBase: true,
      pKa: 6.35, pKb: 7.65, protonCount: 0, hydroxideCount: 0,
      hazardous: false, flameColor: '#facc15', gasOnRelease: 'co2',
      notes: 'Amphiprotic. Baking soda — vigorous CO2 effervescence with any acid.'
    },
    caco3: {
      id: 'caco3', name: 'Calcium Carbonate', formula: 'CaCO₃',
      molarMass: 100.086, category: 'insoluble', defaultState: 'solid',
      density: 2.711, solubility: 0.0013,
      color: '#f8fafc', solidColor: '#f8fafc', opacity: 0.85,
      ions: { 'Ca2+': 1, 'CO3^2-': 1 },
      isAcid: false, isBase: true,
      hazardous: false, flameColor: '#fb923c', gasOnRelease: 'co2',
      precipitateColor: '#ffffff',
      notes: 'Chalk / limestone. Insoluble — but dissolves in acid with CO2 release.'
    },
    fecl3: {
      id: 'fecl3', name: 'Iron(III) Chloride', formula: 'FeCl₃',
      molarMass: 162.204, category: 'salt', defaultState: 'solid',
      density: 2.898, solubility: 91.2,
      color: '#b45309', solidColor: '#78350f', opacity: 0.65,
      ions: { 'Fe3+': 1, 'Cl-': 3 },
      isAcid: true, isBase: false,
      pKa: 2.2, pKb: null, protonCount: 0, hydroxideCount: 0,
      hazardous: true, flameColor: null, gasOnRelease: null,
      precipitateColor: '#991b1b',
      notes: 'Acidic salt (Fe3+ hydrolysis). Amber-brown solution. Red-brown Fe(OH)3 with base.'
    },
    znso4: {
      id: 'znso4', name: 'Zinc Sulfate', formula: 'ZnSO₄',
      molarMass: 161.44, category: 'salt', defaultState: 'solid',
      density: 3.54, solubility: 57.0,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.05,
      ions: { 'Zn2+': 1, 'SO4^2-': 1 },
      isAcid: false, isBase: false,
      hazardous: false, flameColor: '#a7f3d0', gasOnRelease: null,
      precipitateColor: '#ffffff',
      notes: 'White Zn(OH)2 precipitate with NaOH — soluble in excess (amphoteric).'
    },
    kmno4: {
      id: 'kmno4', name: 'Potassium Permanganate', formula: 'KMnO₄',
      molarMass: 158.034, category: 'oxidizer', defaultState: 'solid',
      density: 2.703, solubility: 6.4,
      color: '#6b21a8', solidColor: '#4c1d95', opacity: 0.85,
      ions: { 'K+': 1, 'MnO4-': 1 },
      isAcid: false, isBase: false,
      hazardous: true, flameColor: '#c084fc', gasOnRelease: null,
      notes: 'Deep purple oxidiser. Decolourises on reduction (Mn7+ -> Mn2+).'
    },

    /* ---------------------------------------------------------------------
     * INDICATORS
     * -------------------------------------------------------------------*/
    phenolphthalein: {
      id: 'phenolphthalein', name: 'Phenolphthalein', formula: 'C₂₀H₁₄O₄',
      molarMass: 318.33, category: 'indicator', defaultState: 'aqueous',
      density: 1.30, solubility: 0.4,
      color: '#f1f5f9', solidColor: '#ffffff', opacity: 0.05,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      indicator: { low: '#f1f5f9', high: '#ec4899', rangeLow: 8.2, rangeHigh: 10.0 },
      notes: 'Colourless below pH 8.2, magenta above pH 10.0. Titration endpoint ~pH 9.'
    },
    methyl_orange: {
      id: 'methyl_orange', name: 'Methyl Orange', formula: 'C₁₄H₁₄N₃NaO₃S',
      molarMass: 327.33, category: 'indicator', defaultState: 'aqueous',
      density: 1.28, solubility: 5.0,
      color: '#f59e0b', solidColor: '#fb923c', opacity: 0.35,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      indicator: { low: '#dc2626', high: '#facc15', rangeLow: 3.1, rangeHigh: 4.4 },
      notes: 'Red below pH 3.1, yellow above pH 4.4. Ideal for strong acid / weak base titrations.'
    },
    bromothymol: {
      id: 'bromothymol', name: 'Bromothymol Blue', formula: 'C₂₇H₂₈Br₂O₅S',
      molarMass: 624.38, category: 'indicator', defaultState: 'aqueous',
      density: 1.25, solubility: 1.0,
      color: '#22d3ee', solidColor: '#0891b2', opacity: 0.35,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      indicator: { low: '#eab308', high: '#2563eb', rangeLow: 6.0, rangeHigh: 7.6 },
      notes: 'Yellow below pH 6.0, blue above pH 7.6. Green at neutrality.'
    },
    litmus: {
      id: 'litmus', name: 'Litmus Solution', formula: 'C₉H₁₀O₅N',
      molarMass: 212.0, category: 'indicator', defaultState: 'aqueous',
      density: 1.0, solubility: Infinity,
      color: '#a78bfa', solidColor: '#8b5cf6', opacity: 0.30,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      indicator: { low: '#dc2626', high: '#2563eb', rangeLow: 5.0, rangeHigh: 8.0 },
      notes: 'Red in acid (pH < 5), blue in base (pH > 8). Classic qualitative classifier.'
    },
    universal: {
      id: 'universal', name: 'Universal Indicator', formula: 'Mixed',
      molarMass: 300.0, category: 'indicator', defaultState: 'aqueous',
      density: 1.0, solubility: Infinity,
      color: '#22c55e', solidColor: '#16a34a', opacity: 0.35,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      indicator: { low: '#dc2626', high: '#6b21a8', rangeLow: 1.0, rangeHigh: 14.0, spectrum: true },
      notes: 'Full-range rainbow indicator: red (pH 1) -> orange -> yellow -> green -> blue -> violet (pH 14).'
    },

    /* ---------------------------------------------------------------------
     * GASES / VOLATILE SPECIES (engine-side bookkeeping + canvas fumes)
     * -------------------------------------------------------------------*/
    h2: {
      id: 'h2', name: 'Hydrogen Gas', formula: 'H₂',
      molarMass: 2.016, category: 'gas', defaultState: 'gas',
      density: 0.00009, solubility: 0.00016,
      color: '#e2e8f0', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: false, isBase: false,
      hazardous: true, flameColor: '#fef08a', gasOnRelease: null,
      gas: { bubbleColor: '#e2e8f0', fumeColor: null, densityRelAir: 0.07, flammable: true },
      notes: 'Lightest gas. Squeaky-pop test with a lit splint. Explosive 4-75% in air.'
    },
    o2: {
      id: 'o2', name: 'Oxygen Gas', formula: 'O₂',
      molarMass: 31.998, category: 'gas', defaultState: 'gas',
      density: 0.00143, solubility: 0.004,
      color: '#e0f2fe', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: '#bae6fd', gasOnRelease: null,
      gas: { bubbleColor: '#bae6fd', fumeColor: null, densityRelAir: 1.10, flammable: false },
      notes: 'Relights a glowing splint. Supports combustion.'
    },
    co2: {
      id: 'co2', name: 'Carbon Dioxide', formula: 'CO₂',
      molarMass: 44.009, category: 'gas', defaultState: 'gas',
      density: 0.00197, solubility: 0.15,
      color: '#e5e7eb', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: false, isBase: false,
      hazardous: false, flameColor: null, gasOnRelease: null,
      gas: { bubbleColor: '#f1f5f9', fumeColor: 'rgba(226,232,240,0.45)', densityRelAir: 1.52, flammable: false },
      notes: 'Turns limewater milky. Extinguishes a lit splint. Denser than air.'
    },
    no2: {
      id: 'no2', name: 'Nitrogen Dioxide', formula: 'NO₂',
      molarMass: 46.006, category: 'gas', defaultState: 'gas',
      density: 0.00205, solubility: 0.02,
      color: '#b45309', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: true, isBase: false,
      hazardous: true, flameColor: null, gasOnRelease: null,
      gas: { bubbleColor: '#92400e', fumeColor: '#b45309', densityRelAir: 1.59, flammable: false, toxic: true },
      notes: 'Brown/red toxic fumes. Dense volumetric smoke — never breathe.'
    },
    cl2: {
      id: 'cl2', name: 'Chlorine Gas', formula: 'Cl₂',
      molarMass: 70.90, category: 'gas', defaultState: 'gas',
      density: 0.00321, solubility: 0.73,
      color: '#bef264', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: false, isBase: false,
      hazardous: true, flameColor: null, gasOnRelease: null,
      gas: { bubbleColor: '#d9f99d', fumeColor: '#bef264', densityRelAir: 2.45, flammable: false, toxic: true },
      notes: 'Pale green toxic gas. Bleaches litmus. Heavier than air.'
    },
    so2: {
      id: 'so2', name: 'Sulfur Dioxide', formula: 'SO₂',
      molarMass: 64.066, category: 'gas', defaultState: 'gas',
      density: 0.00263, solubility: 9.4,
      color: '#fef08a', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: true, isBase: false,
      hazardous: true, flameColor: null, gasOnRelease: null,
      gas: { bubbleColor: '#fef08a', fumeColor: 'rgba(254,240,138,0.55)', densityRelAir: 2.21, flammable: false, toxic: true },
      notes: 'Acrid choking gas. Forms H2SO3 in water — acid rain precursor.'
    },
    nh3: {
      id: 'nh3', name: 'Ammonia Gas', formula: 'NH₃',
      molarMass: 17.031, category: 'gas', defaultState: 'gas',
      density: 0.00073, solubility: 47.0,
      color: '#e0f2fe', solidColor: null, opacity: 0.0,
      ions: {}, isAcid: false, isBase: true,
      hazardous: true, flameColor: null, gasOnRelease: null,
      gas: { bubbleColor: '#e0f2fe', fumeColor: 'rgba(224,242,254,0.5)', densityRelAir: 0.59, flammable: false, toxic: true },
      notes: 'Pungent alkaline gas. Damp red litmus turns blue. Highly soluble — fountain experiment.'
    }
  };

  /* ==========================================================================
   * 4. METAL REACTIVITY (ELECTROMOTIVE) SERIES
   * --------------------------------------------------------------------------
   * Ordered MOST -> LEAST reactive. A metal displaces any ion of a metal
   * BELOW it in this list from solution.
   * ========================================================================*/
  const ACTIVITY_SERIES = [
    { id: 'cs', symbol: 'Cs', name: 'Caesium',   reactivity: 100, E0: -2.92 },
    { id: 'rb', symbol: 'Rb', name: 'Rubidium',  reactivity: 98,  E0: -2.98 },
    { id: 'k',  symbol: 'K',  name: 'Potassium', reactivity: 95,  E0: -2.93 },
    { id: 'na', symbol: 'Na', name: 'Sodium',    reactivity: 90,  E0: -2.71 },
    { id: 'li', symbol: 'Li', name: 'Lithium',   reactivity: 88,  E0: -3.04 },
    { id: 'ba', symbol: 'Ba', name: 'Barium',    reactivity: 80,  E0: -2.91 },
    { id: 'ca', symbol: 'Ca', name: 'Calcium',   reactivity: 75,  E0: -2.87 },
    { id: 'mg', symbol: 'Mg', name: 'Magnesium', reactivity: 68,  E0: -2.37 },
    { id: 'al', symbol: 'Al', name: 'Aluminium', reactivity: 62,  E0: -1.66 },
    { id: 'zn', symbol: 'Zn', name: 'Zinc',      reactivity: 55,  E0: -0.76 },
    { id: 'fe', symbol: 'Fe', name: 'Iron',      reactivity: 48,  E0: -0.44 },
    { id: 'pb', symbol: 'Pb', name: 'Lead',      reactivity: 40,  E0: -0.13 },
    { id: 'h',  symbol: 'H',  name: 'Hydrogen',  reactivity: 30,  E0:  0.00 },
    { id: 'cu', symbol: 'Cu', name: 'Copper',    reactivity: 25,  E0: +0.34 },
    { id: 'ag', symbol: 'Ag', name: 'Silver',    reactivity: 15,  E0: +0.80 },
    { id: 'au', symbol: 'Au', name: 'Gold',      reactivity: 5,   E0: +1.50 }
  ];

  /* ==========================================================================
   * 5. SOLUBILITY RULES (qualitative, for precipitate prediction)
   * ========================================================================*/
  const SOLUBILITY_RULES = {
    alwaysSoluble: ['Na+', 'K+', 'NH4+', 'Li+', 'Rb+', 'Cs+', 'NO3-', 'CH3COO-', 'ClO4-'],
    halides: { exceptions: ['Ag+', 'Pb2+'], precipitates: { 'AgCl': '#f1f5f9', 'PbCl2': '#ffffff', 'PbI2': '#facc15' } },
    sulfates: { exceptions: ['Ba2+', 'Pb2+', 'Ca2+', 'Sr2+'], precipitates: { 'BaSO4': '#ffffff', 'PbSO4': '#f8fafc', 'CaSO4': '#f8fafc' } },
    carbonates: { solubleWith: ['Na+', 'K+', 'NH4+'], precipitates: { 'CaCO3': '#ffffff', 'CuCO3': '#4ade80', 'Ag2CO3': '#fef3c7', 'BaCO3': '#ffffff', 'PbCO3': '#ffffff' } },
    hydroxides: { solubleWith: ['Na+', 'K+', 'NH4+', 'Ba2+'], amphoteric: ['Al3+', 'Zn2+', 'Pb2+'], precipitates: { 'Cu(OH)2': '#93c5fd', 'Fe(OH)3': '#991b1b', 'Fe(OH)2': '#4ade80', 'Mg(OH)2': '#ffffff', 'Ca(OH)2': '#ffffff', 'Pb(OH)2': '#ffffff', 'Al(OH)3': '#ffffff', 'Zn(OH)2': '#ffffff' } },
    sulfides: { solubleWith: ['Na+', 'K+', 'NH4+', 'Ca2+', 'Ba2+'], precipitates: { 'CuS': '#0f172a', 'PbS': '#1e293b', 'ZnS': '#ffffff', 'FeS': '#1c1917' } }
  };

  /* ==========================================================================
   * 6. FLAME TEST EMISSION TABLE
   * ========================================================================*/
  const FLAME_COLORS = {
    'Li+': { color: '#dc2626', label: 'Crimson',        wavelength: '670.8 nm' },
    'Na+': { color: '#facc15', label: 'Golden Yellow',  wavelength: '589.0 nm' },
    'K+':  { color: '#c084fc', label: 'Lilac',          wavelength: '766.5 nm' },
    'Rb+': { color: '#f43f5e', label: 'Red-Violet',     wavelength: '780.0 nm' },
    'Cs+': { color: '#3b82f6', label: 'Blue',           wavelength: '455.5 nm' },
    'Ca2+':{ color: '#fb923c', label: 'Brick Red',      wavelength: '622.0 nm' },
    'Cu2+':{ color: '#10b981', label: 'Emerald Green',  wavelength: '524.5 nm' },
    'Ba2+':{ color: '#a3e635', label: 'Apple Green',    wavelength: '553.5 nm' },
    'Pb2+':{ color: '#a3e635', label: 'Pale Green',     wavelength: '405.8 nm' },
    'Mg2+':{ color: '#ffffff', label: 'Brilliant White',wavelength: '285.2 nm' }
  };

  /* ==========================================================================
   * 7. INDICATOR TRANSITION RANGES (fast lookup copy)
   * ========================================================================*/
  const INDICATOR_RANGES = Object.keys(CHEMICALS)
    .filter(k => CHEMICALS[k].category === 'indicator')
    .reduce((acc, k) => {
      const c = CHEMICALS[k];
      acc[k] = { ...c.indicator, name: c.name, id: k };
      return acc;
    }, {});

  /* ==========================================================================
   * 8. GAS PROPERTY LOOKUP
   * ========================================================================*/
  const GAS_PROPERTIES = Object.keys(CHEMICALS)
    .filter(k => CHEMICALS[k].gas)
    .reduce((acc, k) => {
      acc[k] = { id: k, name: CHEMICALS[k].name, formula: CHEMICALS[k].formula, ...CHEMICALS[k].gas };
      return acc;
    }, {});

  /* ==========================================================================
   * 9. UTILITY / QUERY API
   * ========================================================================*/
  const norm = s => String(s || '').toLowerCase().replace(/[\s\u2080-\u2089_()]/g, '');

  /**
   * Fetch a chemical by canonical id.
   * @param {string} id
   * @returns {object|null}
   */
  function get(id) {
    if (!id) return null;
    return CHEMICALS[String(id).toLowerCase()] || null;
  }

  /**
   * Fetch a chemical by its rendered formula (unicode subscripts tolerated).
   * @param {string} formula
   * @returns {object|null}
   */
  function byFormula(formula) {
    const target = norm(formula);
    return Object.values(CHEMICALS).find(c => norm(c.formula) === target) || null;
  }

  /**
   * Fuzzy search across name / formula / id.
   * @param {string} query
   * @returns {object[]}
   */
  function search(query) {
    const q = norm(query);
    if (!q) return list();
    return Object.values(CHEMICALS).filter(c =>
      norm(c.name).includes(q) ||
      norm(c.formula).includes(q) ||
      norm(c.id).includes(q)
    );
  }

  /** @returns {object[]} every registered chemical */
  function list() { return Object.values(CHEMICALS); }

  /** @returns {object[]} chemicals filtered by category key */
  function listByCategory(cat) { return list().filter(c => c.category === cat); }

  /**
   * Molar mass from an elemental composition object.
   * @param {Object<string,number>} composition e.g. { Na:1, Cl:1 }
   * @returns {number} g/mol
   */
  function molarMassFromComposition(composition) {
    let m = 0;
    for (const el in composition) {
      if (ELEMENTS[el]) m += ELEMENTS[el].mass * composition[el];
    }
    return m;
  }

  /**
   * Rank a metal in the activity series (0 = most reactive).
   * @param {string} id
   * @returns {number} index, or Infinity if unknown
   */
  function activityRank(id) {
    const i = ACTIVITY_SERIES.findIndex(m => m.id === id);
    return i === -1 ? Infinity : i;
  }

  /**
   * True if metal A can displace metal B from solution.
   */
  function canDisplace(aId, bId) {
    return activityRank(aId) < activityRank(bId);
  }

  /* ==========================================================================
   * 10. EXPORT
   * ========================================================================*/
  global.ChemicalsDB = Object.freeze({
    version: VERSION,
    elements: ELEMENTS,
    chemicals: CHEMICALS,
    categories: CATEGORIES,
    activitySeries: ACTIVITY_SERIES,
    solubilityRules: SOLUBILITY_RULES,
    flameColors: FLAME_COLORS,
    indicatorRanges: INDICATOR_RANGES,
    gasProperties: GAS_PROPERTIES,
    get,
    byFormula,
    search,
    list,
    listByCategory,
    molarMassFromComposition,
    activityRank,
    canDisplace,
    /* convenience predicates -------------------------------------------- */
    isAlkaliMetal: id => { const c = get(id); return !!c && c.category === 'alkali_metal'; },
    isGas:         id => { const c = get(id); return !!c && c.defaultState === 'gas'; },
    isIndicator:   id => { const c = get(id); return !!c && c.category === 'indicator'; },
    isAcid:        id => { const c = get(id); return !!c && c.isAcid === true; },
    isBase:        id => { const c = get(id); return !!c && c.isBase === true; }
  });

  /* ------------------------------------------------------------------------
   * Boot diagnostics (non-fatal, dev-console only)
   * ----------------------------------------------------------------------*/
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(
      `[ChemicalsDB v${VERSION}] Loaded ${Object.keys(CHEMICALS).length} species | ` +
      `${Object.keys(CATEGORIES).length} categories | ` +
      `${ACTIVITY_SERIES.length} activity entries | ` +
      `${Object.keys(GAS_PROPERTIES).length} gases | ` +
      `${Object.keys(INDICATOR_RANGES).length} indicators.`
    );
  }

})(typeof window !== 'undefined' ? window : globalThis);
