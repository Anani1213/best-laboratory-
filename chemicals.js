/* ============================================================================
 *  VirtuaLab Pro — chemicals.js
 *  Module: Chemical Database (window.ChemicalsDB)
 *  Build:  1.0.0
 *  Author: VirtuaLab Pro Core
 * ----------------------------------------------------------------------------
 *  GLOBAL DATA CONTRACT:
 *      window.ChemicalsDB   -> this module
 *      window.ChemistryEngine (step 2) consumes `ChemicalsDB`
 *      window.CanvasRenderer  (step 3) consumes `ChemicalsDB`
 * ----------------------------------------------------------------------------
 *  UNITS (SI / IUPAC convention, strictly enforced):
 *      molarMass          : g·mol⁻¹
 *      density            : g·cm⁻³   (=== g·mL⁻¹); gases at 273.15 K, 101.325 kPa
 *      enthalpyFormation  : kJ·mol⁻¹ (ΔfH°, 298.15 K, standard state of the
 *                           phase declared in `state`; null = not tabulated)
 *      solubility         : g per 100 g H2O unless `solubility.basis` says else
 *      temperature        : °C unless suffixed K
 *      wavelengthNm       : nm (emission line used for flame test)
 *
 *  DATA SOURCES (values reconciled to the following references):
 *      - CRC Handbook of Chemistry & Physics, 97th ed.
 *      - NIST Chemistry WebBook (SRD 69) — thermochemistry
 *      - IUPAC Solubility Data Series
 *      - Skoog, West, Holler, Crouch — Fundamentals of Analytical Chemistry
 *      - Greenwood & Earnshaw — Chemistry of the Elements
 *      - Vogel's Qualitative Inorganic Analysis (flame tests)
 * ==========================================================================*/

(function (global) {
  'use strict';

  const DB_VERSION = '1.0.0';

  /* ==========================================================================
   * SECTION 1 — SOLUBILITY RULE ENGINE
   * ==========================================================================
   * Canonical freshman-chemistry solubility rules, extended with the
   * quantitative exceptions a university lab actually needs.
   * ======================================================================== */
  const SOLUBILITY_RULES = Object.freeze({
    S1: {
      id: 'S1',
      statement: 'All salts of Group 1 cations (Li⁺, Na⁺, K⁺, Rb⁺, Cs⁺) and of ammonium (NH₄⁺) are soluble in water.',
      exceptions: []
    },
    S2: {
      id: 'S2',
      statement: 'All nitrate (NO₃⁻), nitrite, acetate (CH₃COO⁻), chlorate and perchlorate salts are soluble.',
      exceptions: []
    },
    S3: {
      id: 'S3',
      statement: 'All chloride (Cl⁻), bromide (Br⁻) and iodide (I⁻) salts are soluble.',
      exceptions: ['AgCl', 'AgBr', 'AgI', 'PbCl2', 'PbBr2', 'PbI2', 'Hg2Cl2', 'HgI2']
    },
    S4: {
      id: 'S4',
      statement: 'All sulfate (SO₄²⁻) salts are soluble.',
      exceptions: ['BaSO4', 'PbSO4', 'SrSO4', 'CaSO4', 'Ag2SO4']
    },
    S5: {
      id: 'S5',
      statement: 'All carbonate (CO₃²⁻), phosphate (PO₄³⁻), sulfite (SO₃²⁻), chromate and oxalate salts are INSOLUBLE.',
      exceptions: ['Na2CO3', 'K2CO3', 'Li2CO3', '(NH4)2CO3', 'Na3PO4', 'K3PO4']
    },
    S6: {
      id: 'S6',
      statement: 'All hydroxide (OH⁻) salts are INSOLUBLE.',
      exceptions: ['NaOH', 'KOH', 'LiOH', 'RbOH', 'CsOH', 'Ba(OH)2', 'Sr(OH)2', 'Ca(OH)2', 'NH4OH']
    },
    S7: {
      id: 'S7',
      statement: 'All sulfide (S²⁻) salts are INSOLUBLE.',
      exceptions: ['Na2S', 'K2S', 'Li2S', '(NH4)2S', 'MgS', 'CaS', 'BaS', 'SrS']
    },
    S8: {
      id: 'S8',
      statement: 'All alkali-metal and ammonium salts of weak acids are soluble; the parent weak acid may precipitate on acidification.',
      exceptions: []
    }
  });

  /* ==========================================================================
   * SECTION 2 — ION LIBRARY
   * ==========================================================================
   * Used by ChemistryEngine for stoichiometry, spectator-ion analysis and
   * net-ionic equation generation.
   * ======================================================================== */
  const COLORLESS = Object.freeze({ name: 'Colorless', hex: '#FFFFFF', alpha: 0.0, visible: false });

  const IONS = Object.freeze({
    /* ---- Cations ---- */
    'H+':     { symbol: 'H⁺',     charge: +1, molarMass: 1.008,   type: 'cation', solutionColor: COLORLESS, note: 'Hydronium, H₃O⁺ in aqueous media.' },
    'Li+':    { symbol: 'Li⁺',    charge: +1, molarMass: 6.94,    type: 'cation', solutionColor: COLORLESS },
    'Na+':    { symbol: 'Na⁺',    charge: +1, molarMass: 22.990,  type: 'cation', solutionColor: COLORLESS },
    'K+':     { symbol: 'K⁺',     charge: +1, molarMass: 39.098,  type: 'cation', solutionColor: COLORLESS },
    'Rb+':    { symbol: 'Rb⁺',    charge: +1, molarMass: 85.468,  type: 'cation', solutionColor: COLORLESS },
    'Cs+':    { symbol: 'Cs⁺',    charge: +1, molarMass: 132.905, type: 'cation', solutionColor: COLORLESS },
    'NH4+':   { symbol: 'NH₄⁺',   charge: +1, molarMass: 18.039,  type: 'cation', solutionColor: COLORLESS },
    'Mg2+':   { symbol: 'Mg²⁺',   charge: +2, molarMass: 24.305,  type: 'cation', solutionColor: COLORLESS },
    'Ca2+':   { symbol: 'Ca²⁺',   charge: +2, molarMass: 40.078,  type: 'cation', solutionColor: COLORLESS },
    'Ba2+':   { symbol: 'Ba²⁺',   charge: +2, molarMass: 137.327, type: 'cation', solutionColor: COLORLESS },
    'Al3+':   { symbol: 'Al³⁺',   charge: +3, molarMass: 26.982,  type: 'cation', solutionColor: COLORLESS },
    'Cu2+':   { symbol: 'Cu²⁺',   charge: +2, molarMass: 63.546,  type: 'cation',
                solutionColor: { name: 'Blue', hex: '#2E86C1', diluteHex: '#A9CCE3', visible: true,
                                 lambdaMaxNm: 800, note: '[Cu(H₂O)₆]²⁺ d–d transition, ε ≈ 11 M⁻¹cm⁻¹.' } },
    'Fe2+':   { symbol: 'Fe²⁺',   charge: +2, molarMass: 55.845,  type: 'cation',
                solutionColor: { name: 'Pale Green', hex: '#7DCEA0', diluteHex: '#D5F5E3', visible: true,
                                 lambdaMaxNm: 510, note: '[Fe(H₂O)₆]²⁺; readily oxidised to Fe³⁺ by air.' } },
    'Fe3+':   { symbol: 'Fe³⁺',   charge: +3, molarMass: 55.845,  type: 'cation',
                solutionColor: { name: 'Yellow-Brown', hex: '#B9770E', diluteHex: '#F0C36D', visible: true,
                                 lambdaMaxNm: 430, note: 'Hydrolysis gives [Fe(H₂O)₅OH]²⁺ and colloidal Fe(OH)₃.' } },
    'Co2+':   { symbol: 'Co²⁺',   charge: +2, molarMass: 58.933,  type: 'cation',
                solutionColor: { name: 'Pink', hex: '#E75480', diluteHex: '#F5B7C8', visible: true,
                                 lambdaMaxNm: 510, note: '[Co(H₂O)₆]²⁺; turns deep blue with excess Cl⁻.' } },
    'Ni2+':   { symbol: 'Ni²⁺',   charge: +2, molarMass: 58.693,  type: 'cation',
                solutionColor: { name: 'Green', hex: '#1E8449', diluteHex: '#A9DFBF', visible: true,
                                 lambdaMaxNm: 395, note: '[Ni(H₂O)₆]²⁺.' } },
    'Mn2+':   { symbol: 'Mn²⁺',   charge: +2, molarMass: 54.938,  type: 'cation',
                solutionColor: { name: 'Very Pale Pink', hex: '#F5D0DC', diluteHex: '#FDF2F6', visible: true,
                                 lambdaMaxNm: 525, note: 'Extremely weak d–d absorption; appears near-colourless when dilute.' } },
    'Zn2+':   { symbol: 'Zn²⁺',   charge: +2, molarMass: 65.38,   type: 'cation', solutionColor: COLORLESS, note: 'd¹⁰ — no d–d transitions.' },
    'Ag+':    { symbol: 'Ag⁺',    charge: +1, molarMass: 107.868, type: 'cation', solutionColor: COLORLESS, note: 'Photoreduced by light in presence of organics.' },
    'Pb2+':   { symbol: 'Pb²⁺',   charge: +2, molarMass: 207.2,   type: 'cation', solutionColor: COLORLESS },
    'Cr3+':   { symbol: 'Cr³⁺',   charge: +3, molarMass: 51.996,  type: 'cation',
                solutionColor: { name: 'Green / Violet', hex: '#27AE60', diluteHex: '#A9DFBF', visible: true,
                                 note: '[Cr(H₂O)₆]³⁺ violet; [CrCl₂(H₂O)₄]⁺ green. Equilibrium is slow.' } },

    /* ---- Anions ---- */
    'OH-':    { symbol: 'OH⁻',    charge: -1, molarMass: 17.007,  type: 'anion', solutionColor: COLORLESS },
    'Cl-':    { symbol: 'Cl⁻',    charge: -1, molarMass: 35.45,   type: 'anion', solutionColor: COLORLESS },
    'Br-':    { symbol: 'Br⁻',    charge: -1, molarMass: 79.904,  type: 'anion', solutionColor: COLORLESS },
    'I-':     { symbol: 'I⁻',     charge: -1, molarMass: 126.904, type: 'anion', solutionColor: COLORLESS, note: 'I₂ formed on oxidation is brown in water, violet in CCl₄.' },
    'NO3-':   { symbol: 'NO₃⁻',   charge: -1, molarMass: 62.004,  type: 'anion', solutionColor: COLORLESS },
    'SO4-2':  { symbol: 'SO₄²⁻',  charge: -2, molarMass: 96.06,   type: 'anion', solutionColor: COLORLESS },
    'CO3-2':  { symbol: 'CO₃²⁻',  charge: -2, molarMass: 60.009,  type: 'anion', solutionColor: COLORLESS },
    'HCO3-':  { symbol: 'HCO₃⁻',  charge: -1, molarMass: 61.017,  type: 'anion', solutionColor: COLORLESS },
    'CH3COO-':{ symbol: 'CH₃COO⁻',charge: -1, molarMass: 59.044,  type: 'anion', solutionColor: COLORLESS },
    'MnO4-':  { symbol: 'MnO₄⁻',  charge: -1, molarMass: 118.936, type: 'anion',
                solutionColor: { name: 'Deep Purple', hex: '#4B0082', diluteHex: '#9B59B6', visible: true,
                                 lambdaMaxNm: 525, note: 'Intense charge-transfer; ε ≈ 2300 M⁻¹cm⁻¹ at 525 nm.' } },
    'Cr2O7-2':{ symbol: 'Cr₂O₇²⁻',charge: -2, molarMass: 215.988, type: 'anion',
                solutionColor: { name: 'Orange', hex: '#E67E22', diluteHex: '#F5B041', visible: true,
                                 lambdaMaxNm: 350, note: 'Charge-transfer band tailing into the visible.' } },
    'CrO4-2': { symbol: 'CrO₄²⁻', charge: -2, molarMass: 115.994, type: 'anion',
                solutionColor: { name: 'Yellow', hex: '#F1C40F', diluteHex: '#FCF3CF', visible: true,
                                 note: 'Chromate/dichromate equilibrium: 2 CrO₄²⁻ + 2 H⁺ ⇌ Cr₂O₇²⁻ + H₂O.' } },
    'SCN-':   { symbol: 'SCN⁻',   charge: -1, molarMass: 58.08,   type: 'anion', solutionColor: COLORLESS,
                note: 'Forms blood-red [Fe(SCN)(H₂O)₅]²⁺ with Fe³⁺.' },
    'PO4-3':  { symbol: 'PO₄³⁻',  charge: -3, molarMass: 94.971,  type: 'anion', solutionColor: COLORLESS },
    'S-2':    { symbol: 'S²⁻',    charge: -2, molarMass: 32.06,   type: 'anion', solutionColor: COLORLESS }
  });

  /* ==========================================================================
   * SECTION 3 — QUALITATIVE ANALYSIS REFERENCE TABLES
   * ========================================================================== */

  /* --- Flame test emission lines (Vogel / CRC) --- */
  const FLAME_COLORS = Object.freeze({
    Li: { element: 'Li', name: 'Crimson Red',     hex: '#DC143C', wavelengthNm: 670.8, intensity: 'strong',  note: 'Sharp red doublet; masked by Na.' },
    Na: { element: 'Na', name: 'Golden Yellow',   hex: '#FFD400', wavelengthNm: 589.3, intensity: 'intense', note: 'Na D-line; persists at trace levels — common contaminant.' },
    K:  { element: 'K',  name: 'Lilac',           hex: '#C39BD3', wavelengthNm: 766.5, intensity: 'medium',  note: 'View through cobalt-blue glass to filter Na.' },
    Rb: { element: 'Rb', name: 'Red-Violet',      hex: '#A93226', wavelengthNm: 780.0, intensity: 'medium' },
    Cs: { element: 'Cs', name: 'Blue-Violet',     hex: '#5B2C6F', wavelengthNm: 455.5, intensity: 'weak' },
    Ca: { element: 'Ca', name: 'Brick Red',       hex: '#CB4335', wavelengthNm: 622.0, intensity: 'medium',  note: 'Orange-red; distinct from the Li crimson.' },
    Sr: { element: 'Sr', name: 'Crimson',         hex: '#E74C3C', wavelengthNm: 460.7, intensity: 'strong' },
    Ba: { element: 'Ba', name: 'Apple Green',     hex: '#7DCEA0', wavelengthNm: 524.2, intensity: 'medium',  note: 'Pale yellow-green; best seen with HCl-cleaned wire.' },
    Cu: { element: 'Cu', name: 'Emerald Green',   hex: '#00A86B', wavelengthNm: 524.0, intensity: 'strong',  note: 'Blue-green; CuCl₂ volatilises readily in the flame.' },
    Mg: { element: 'Mg', name: 'Brilliant White', hex: '#FDFEFE', wavelengthNm: null,  intensity: 'blinding', note: 'No characteristic line — incandescence of MgO.' },
    Zn: { element: 'Zn', name: 'Pale Blue-Green', hex: '#A3E4D7', wavelengthNm: 481.1, intensity: 'weak' },
    Pb: { element: 'Pb', name: 'Pale Blue-White', hex: '#D6EAF8', wavelengthNm: 405.8, intensity: 'weak' },
    Fe: { element: 'Fe', name: 'Golden Sparks',   hex: '#F0B27A', wavelengthNm: null,  intensity: 'weak',    note: 'No diagnostic flame colour; emits sparks.' }
  });

  /* --- Insoluble product colours (for precipitation reactions) --- */
  const PRECIPITATES = Object.freeze({
    'AgCl':    { formula: 'AgCl',    name: 'Silver Chloride',        color: 'White',          hex: '#FDFEFE', ksp: 1.77e-10, texture: 'curdy',            note: 'Darkens on exposure to light (photodecomposition).' },
    'AgBr':    { formula: 'AgBr',    name: 'Silver Bromide',         color: 'Cream',          hex: '#FCF3CF', ksp: 5.35e-13, texture: 'curdy' },
    'AgI':     { formula: 'AgI',     name: 'Silver Iodide',          color: 'Pale Yellow',    hex: '#F9E79F', ksp: 8.52e-17, texture: 'curdy' },
    'Ag2S':    { formula: 'Ag₂S',    name: 'Silver Sulfide',         color: 'Black',          hex: '#1C1C1C', ksp: 6.0e-51,  texture: 'powdery' },
    'BaSO4':   { formula: 'BaSO₄',   name: 'Barium Sulfate',         color: 'White',          hex: '#FDFEFE', ksp: 1.08e-10, texture: 'fine',             note: 'Acid-insoluble — confirms sulfate.' },
    'PbSO4':   { formula: 'PbSO₄',   name: 'Lead(II) Sulfate',       color: 'White',          hex: '#F4F6F7', ksp: 2.53e-8,  texture: 'fine' },
    'PbCl2':   { formula: 'PbCl₂',   name: 'Lead(II) Chloride',      color: 'White',          hex: '#FDFEFE', ksp: 1.7e-5,   texture: 'crystalline',      note: 'Solubility rises sharply in hot water.' },
    'PbI2':    { formula: 'PbI₂',    name: 'Lead(II) Iodide',        color: 'Golden Yellow',  hex: '#F4D03F', ksp: 9.8e-9,   texture: 'crystalline',      note: 'Dissolves in hot water, recrystallises as golden plates.' },
    'PbCrO4':  { formula: 'PbCrO₄',  name: 'Lead(II) Chromate',      color: 'Bright Yellow',  hex: '#F1C40F', ksp: 2.8e-13,  texture: 'fine' },
    'CaCO3':   { formula: 'CaCO₃',   name: 'Calcium Carbonate',      color: 'White',          hex: '#FDFEFE', ksp: 3.3e-9,   texture: 'chalky' },
    'BaCO3':   { formula: 'BaCO₃',   name: 'Barium Carbonate',       color: 'White',          hex: '#FDFEFE', ksp: 5.1e-9,   texture: 'powdery' },
    'CuCO3':   { formula: 'CuCO₃',   name: 'Copper(II) Carbonate',   color: 'Blue-Green',     hex: '#48C9B0', ksp: 1.4e-10,  texture: 'powdery' },
    'Cu(OH)2': { formula: 'Cu(OH)₂', name: 'Copper(II) Hydroxide',   color: 'Pale Blue',      hex: '#85C1E9', ksp: 2.2e-20,  texture: 'gelatinous' },
    'Fe(OH)2': { formula: 'Fe(OH)₂', name: 'Iron(II) Hydroxide',     color: 'Dirty Green',    hex: '#7DCEA0', ksp: 4.87e-17, texture: 'gelatinous',      note: 'Rapidly oxidises to brown Fe(OH)₃ in air.' },
    'Fe(OH)3': { formula: 'Fe(OH)₃', name: 'Iron(III) Hydroxide',    color: 'Reddish-Brown',  hex: '#8B4513', ksp: 2.79e-39, texture: 'gelatinous' },
    'Al(OH)3': { formula: 'Al(OH)₃', name: 'Aluminium Hydroxide',    color: 'White',          hex: '#FDFEFE', ksp: 3.0e-34,  texture: 'gelatinous',      note: 'Amphoteric — dissolves in excess NaOH.' },
    'Mg(OH)2': { formula: 'Mg(OH)₂', name: 'Magnesium Hydroxide',    color: 'White',          hex: '#FDFEFE', ksp: 5.61e-12, texture: 'gelatinous' },
    'Zn(OH)2': { formula: 'Zn(OH)₂', name: 'Zinc Hydroxide',         color: 'White',          hex: '#FDFEFE', ksp: 3.0e-17,  texture: 'gelatinous',      note: 'Amphoteric — dissolves in excess NaOH to zincate.' },
    'Ni(OH)2': { formula: 'Ni(OH)₂', name: 'Nickel(II) Hydroxide',   color: 'Apple Green',    hex: '#7DCEA0', ksp: 5.48e-16, texture: 'gelatinous' },
    'Co(OH)2': { formula: 'Co(OH)₂', name: 'Cobalt(II) Hydroxide',   color: 'Blue-Green',     hex: '#48C9B0', ksp: 5.92e-15, texture: 'gelatinous',      note: 'Turns brown on standing (Co(III)).' },
    'CuS':     { formula: 'CuS',     name: 'Copper(II) Sulfide',     color: 'Black',          hex: '#17202A', ksp: 6.3e-36,  texture: 'powdery' },
    'PbS':     { formula: 'PbS',     name: 'Lead(II) Sulfide',       color: 'Black',          hex: '#17202A', ksp: 3.0e-28,  texture: 'powdery' },
    'ZnS':     { formula: 'ZnS',     name: 'Zinc Sulfide',           color: 'White',          hex: '#FDFEFE', ksp: 2.0e-25,  texture: 'powdery' },
    'FeS':     { formula: 'FeS',     name: 'Iron(II) Sulfide',       color: 'Black',          hex: '#1C1C1C', ksp: 6.0e-19,  texture: 'powdery' },
    'S':       { formula: 'S',       name: 'Colloidal Sulfur',       color: 'Pale Yellow',    hex: '#F9E79F', ksp: null,     texture: 'colloidal',       note: 'From thiosulfate + acid; milky suspension.' },
    'CaSO4':   { formula: 'CaSO₄',   name: 'Calcium Sulfate',        color: 'White',          hex: '#F4F6F7', ksp: 2.4e-5,   texture: 'fine',            note: 'Slightly soluble; only precipitates from concentrated solutions.' }
  });

  /* ==========================================================================
   * SECTION 4 — CATEGORY TAXONOMY
   * ========================================================================== */
  const CATEGORIES = Object.freeze({
    alkali_metal:          { id: 'alkali_metal',          label: 'Alkali Metals',            color: '#E74C3C' },
    alkaline_earth_metal:  { id: 'alkaline_earth_metal',  label: 'Alkaline Earth Metals',    color: '#E67E22' },
    transition_metal:      { id: 'transition_metal',      label: 'Transition Metals',        color: '#8E44AD' },
    strong_acid:           { id: 'strong_acid',           label: 'Strong Acids',             color: '#C0392B' },
    weak_acid:             { id: 'weak_acid',             label: 'Weak Acids',               color: '#E74C3C' },
    strong_base:           { id: 'strong_base',           label: 'Strong Bases',             color: '#1F618D' },
    weak_base:             { id: 'weak_base',             label: 'Weak Bases',               color: '#2980B9' },
    transition_metal_salt: { id: 'transition_metal_salt', label: 'Transition Metal Salts',   color: '#16A085' },
    alkali_salt:           { id: 'alkali_salt',           label: 'Alkali Metal Salts',       color: '#27AE60' },
    alkaline_salt:         { id: 'alkaline_salt',         label: 'Alkaline Earth Salts',     color: '#2ECC71' },
    ammonium_salt:         { id: 'ammonium_salt',         label: 'Ammonium Salts',           color: '#F39C12' },
    indicator:             { id: 'indicator',             label: 'Indicators',               color: '#9B59B6' },
    solvent:               { id: 'solvent',               label: 'Solvents & Water',         color: '#3498DB' },
    oxidiser:              { id: 'oxidiser',              label: 'Oxidisers',                color: '#D35400' },
    gas:                   { id: 'gas',                   label: 'Gases',                    color: '#7F8C8D' },
    organic:               { id: 'organic',               label: 'Organic Reagents',         color: '#AF7AC5' },
    reagent:               { id: 'reagent',               label: 'General Reagents',         color: '#566573' }
  });

  /* ==========================================================================
   * SECTION 5 — THE CHEMICAL DATABASE
   * ==========================================================================
   * Keyed by immutable snake_case `id`.
   * ======================================================================== */
  const CHEMICALS = {

    /* ======================================================================
     * 5.1 — ALKALI METALS (Group 1)
     * ==================================================================== */
    lithium: {
      id: 'lithium', name: 'Lithium', formula: 'Li', formulaPlain: 'Li', iupac: 'lithium',
      category: 'alkali_metal', molarMass: 6.94, density: 0.534, state: 'solid',
      appearance: 'Soft silvery-white metal; body-centred cubic; tarnishes rapidly in air.',
      colorHex: '#C0C0C0',
      flameColor: FLAME_COLORS.Li,
      solutionColor: null,
      enthalpyFormation: 0,            // kJ/mol, ΔfH°(Li, s) = 0 by definition
      solubility: { water: 'reacts', products: ['LiOH', 'H2'], rate: 'vigorous', note: '2 Li + 2 H₂O → 2 LiOH + H₂↑ (slower than Na — higher E° requirement is offset by oxide layer).' },
      reactivity: { water: 'vigorous', air: 'tarnishes', acid: 'violent', storage: 'Under mineral oil or argon.', notes: 'E°(Li⁺/Li) = −3.04 V; lowest of the alkali metals due to high hydration enthalpy of Li⁺.' },
      hazards: { ghs: ['H260', 'H314'], nfpa: { health: 3, flammability: 4, reactivity: 2 }, signalWord: 'Danger' },
      tags: ['metal', 'group1', 'reducing-agent', 'water-sensitive']
    },

    sodium: {
      id: 'sodium', name: 'Sodium', formula: 'Na', formulaPlain: 'Na', iupac: 'sodium',
      category: 'alkali_metal', molarMass: 22.990, density: 0.968, state: 'solid',
      appearance: 'Soft silvery metal; freshly cut surface oxidises to white Na₂O within seconds.',
      colorHex: '#C0C0C0',
      flameColor: FLAME_COLORS.Na,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'reacts', products: ['NaOH', 'H2'], rate: 'violent', note: '2 Na + 2 H₂O → 2 NaOH + H₂↑, ΔH = −184 kJ·mol⁻¹. Often ignites the evolved H₂.' },
      reactivity: { water: 'violent (floats, melts, may ignite)', air: 'tarnishes', acid: 'explosive', storage: 'Under mineral oil.', notes: 'E°(Na⁺/Na) = −2.71 V.' },
      hazards: { ghs: ['H260', 'H314', 'EUH014'], nfpa: { health: 3, flammability: 4, reactivity: 2 }, signalWord: 'Danger' },
      tags: ['metal', 'group1', 'reducing-agent', 'water-sensitive']
    },

    potassium: {
      id: 'potassium', name: 'Potassium', formula: 'K', formulaPlain: 'K', iupac: 'potassium',
      category: 'alkali_metal', molarMass: 39.098, density: 0.862, state: 'solid',
      appearance: 'Soft silvery metal; bluish lustre when freshly cut; oxidises instantly.',
      colorHex: '#C0C0C0',
      flameColor: FLAME_COLORS.K,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'reacts', products: ['KOH', 'H2'], rate: 'violent — ignites', note: '2 K + 2 H₂O → 2 KOH + H₂↑; evolved H₂ ignites with lilac flame.' },
      reactivity: { water: 'violent ignition', air: 'tarnishes instantly', acid: 'explosive', storage: 'Under mineral oil or argon.', notes: 'E°(K⁺/K) = −2.93 V. Superoxide KO₂ forms on air exposure.' },
      hazards: { ghs: ['H260', 'H314', 'EUH014'], nfpa: { health: 3, flammability: 4, reactivity: 3 }, signalWord: 'Danger' },
      tags: ['metal', 'group1', 'reducing-agent', 'water-sensitive']
    },

    rubidium: {
      id: 'rubidium', name: 'Rubidium', formula: 'Rb', formulaPlain: 'Rb', iupac: 'rubidium',
      category: 'alkali_metal', molarMass: 85.468, density: 1.532, state: 'solid',
      appearance: 'Very soft silvery-white metal; melts at 39.3 °C (may be liquid in a warm lab).',
      colorHex: '#C0C0C0',
      flameColor: FLAME_COLORS.Rb,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'reacts explosively', products: ['RbOH', 'H2'], rate: 'explosive' },
      reactivity: { water: 'explosive', air: 'spontaneously ignites', acid: 'explosive', storage: 'Sealed ampoule under argon.', notes: 'E°(Rb⁺/Rb) = −2.98 V.' },
      hazards: { ghs: ['H260', 'H314', 'EUH014'], nfpa: { health: 3, flammability: 4, reactivity: 4 }, signalWord: 'Danger' },
      tags: ['metal', 'group1', 'water-sensitive', 'demo-only']
    },

    cesium: {
      id: 'cesium', name: 'Caesium', formula: 'Cs', formulaPlain: 'Cs', iupac: 'caesium',
      category: 'alkali_metal', molarMass: 132.905, density: 1.93, state: 'solid',
      appearance: 'Golden-tinted silvery metal; melts at 28.5 °C — liquid at body temperature.',
      colorHex: '#D4AF37',
      flameColor: FLAME_COLORS.Cs,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'reacts explosively', products: ['CsOH', 'H2'], rate: 'explosive' },
      reactivity: { water: 'explosive', air: 'spontaneously ignites', acid: 'explosive', storage: 'Sealed ampoule under argon.', notes: 'E°(Cs⁺/Cs) = −3.03 V; most electropositive stable element.' },
      hazards: { ghs: ['H260', 'H314', 'EUH014'], nfpa: { health: 3, flammability: 4, reactivity: 4 }, signalWord: 'Danger' },
      tags: ['metal', 'group1', 'water-sensitive', 'demo-only']
    },

    /* ======================================================================
     * 5.2 — ALKALINE EARTH METALS (Group 2)
     * ==================================================================== */
    magnesium: {
      id: 'magnesium', name: 'Magnesium', formula: 'Mg', formulaPlain: 'Mg', iupac: 'magnesium',
      category: 'alkaline_earth_metal', molarMass: 24.305, density: 1.738, state: 'solid',
      appearance: 'Silvery-white metal; ribbon or turnings; protected by a thin oxide film.',
      colorHex: '#D5D8DC',
      flameColor: FLAME_COLORS.Mg,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'very slow (surface film)', products: ['Mg(OH)2', 'H2'], rate: 'slow in cold water, vigorous in steam', note: 'Mg + 2 H₂O(g) → Mg(OH)₂ + H₂↑ at high temperature.' },
      reactivity: { water: 'slow / steam-reactive', air: 'burns with blinding white light', acid: 'rapid', storage: 'Dry, away from oxidisers.', notes: 'E°(Mg²⁺/Mg) = −2.37 V. Burns: 2 Mg + O₂ → 2 MgO.' },
      hazards: { ghs: ['H228', 'H251', 'H261'], nfpa: { health: 0, flammability: 3, reactivity: 2 }, signalWord: 'Danger' },
      tags: ['metal', 'group2', 'reducing-agent', 'pyrophoric-when-powdered']
    },

    calcium: {
      id: 'calcium', name: 'Calcium', formula: 'Ca', formulaPlain: 'Ca', iupac: 'calcium',
      category: 'alkaline_earth_metal', molarMass: 40.078, density: 1.55, state: 'solid',
      appearance: 'Dull silvery-white metal; rapidly coated with oxide/hydroxide.',
      colorHex: '#D5D8DC',
      flameColor: FLAME_COLORS.Ca,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'reacts', products: ['Ca(OH)2', 'H2'], rate: 'moderate', note: 'Ca + 2 H₂O → Ca(OH)₂ + H₂↑; Ca(OH)₂ is only sparingly soluble, so the metal becomes passivated.' },
      reactivity: { water: 'moderate', air: 'tarnishes', acid: 'rapid', storage: 'Under mineral oil.', notes: 'E°(Ca²⁺/Ca) = −2.87 V.' },
      hazards: { ghs: ['H261', 'H315'], nfpa: { health: 1, flammability: 3, reactivity: 2 }, signalWord: 'Danger' },
      tags: ['metal', 'group2', 'reducing-agent', 'water-sensitive']
    },

    /* ======================================================================
     * 5.3 — TRANSITION METALS
     * ==================================================================== */
    copper: {
      id: 'copper', name: 'Copper', formula: 'Cu', formulaPlain: 'Cu', iupac: 'copper',
      category: 'transition_metal', molarMass: 63.546, density: 8.96, state: 'solid',
      appearance: 'Reddish-orange metal; turnings, foil or wire; patinates to green basic carbonate.',
      colorHex: '#B87333',
      flameColor: FLAME_COLORS.Cu,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'insoluble', note: 'Cu(s) does not react with H₂O or with dilute HCl/H₂SO₄ — it lies below H⁺ in the activity series (E° = +0.34 V).' },
      reactivity: { water: 'none', air: 'slow patina (Cu₂(OH)₂CO₃)', acid: 'only with HNO₃ or hot conc. H₂SO₄', notes: 'Cu + 4 HNO₃(conc.) → Cu(NO₃)₂ + 2 NO₂↑ + 2 H₂O.' },
      hazards: { ghs: ['H228'], nfpa: { health: 1, flammability: 1, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['metal', 'transition', 'catalyst', 'electrode']
    },

    iron: {
      id: 'iron', name: 'Iron', formula: 'Fe', formulaPlain: 'Fe', iupac: 'iron',
      category: 'transition_metal', molarMass: 55.845, density: 7.874, state: 'solid',
      appearance: 'Grey-silver metal; filings or nails; rusts to hydrated Fe(III) oxide.',
      colorHex: '#717D7E',
      flameColor: FLAME_COLORS.Fe,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'insoluble', note: 'Reacts with dilute HCl/H₂SO₄ to give Fe²⁺ and H₂ (E° = −0.44 V).' },
      reactivity: { water: 'slow (rusting with O₂)', air: 'rusts', acid: 'dissolves in dilute mineral acids', notes: 'Fe + 2 HCl → FeCl₂ + H₂↑. With hot conc. H₂SO₄ gives Fe³⁺.' },
      hazards: { ghs: ['H228'], nfpa: { health: 0, flammability: 1, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['metal', 'transition', 'reducing-agent']
    },

    zinc: {
      id: 'zinc', name: 'Zinc', formula: 'Zn', formulaPlain: 'Zn', iupac: 'zinc',
      category: 'transition_metal', molarMass: 65.38, density: 7.14, state: 'solid',
      appearance: 'Bluish-white metal; granules or foil; dull surface film of basic carbonate.',
      colorHex: '#A9A9A9',
      flameColor: FLAME_COLORS.Zn,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'insoluble', note: 'Reacts with dilute acids: Zn + 2 HCl → ZnCl₂ + H₂↑ (E° = −0.76 V).' },
      reactivity: { water: 'none (hot steam → ZnO + H₂)', air: 'tarnishes', acid: 'vigorous', notes: 'Amphoteric: also dissolves in strong alkali to give [Zn(OH)₄]²⁻.' },
      hazards: { ghs: ['H228', 'H410'], nfpa: { health: 0, flammability: 3, reactivity: 1 }, signalWord: 'Danger' },
      tags: ['metal', 'transition', 'reducing-agent', 'hydrogen-generator']
    },

    /* ======================================================================
     * 5.4 — STRONG ACIDS
     * ==================================================================== */
    hydrochloric_acid: {
      id: 'hydrochloric_acid', name: 'Hydrochloric Acid', formula: 'HCl(aq)', formulaPlain: 'HCl',
      iupac: 'hydrochloric acid',
      category: 'strong_acid', molarMass: 36.461, density: 1.19, state: 'aqueous',
      densityNote: '37 % w/w aqueous solution (12.0 M), 20 °C.',
      appearance: 'Colourless fuming liquid with a pungent, irritating odour.',
      colorHex: '#EAF2F8',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -167.16,      // ΔfH° HCl(aq, ∞ dilution)
      enthalpyFormationNote: 'ΔfH°(HCl, g) = −92.31 kJ·mol⁻¹; ΔfH°(HCl, aq) = −167.16 kJ·mol⁻¹.',
      pKa: -6.3,
      solubility: { water: 'miscible in all proportions', note: 'Complete dissociation. Azeotrope: 20.2 % HCl, b.p. 108.6 °C.' },
      stockConcentration: { molarity: 12.0, percentWw: 37, label: '37 % w/w (conc.)' },
      reactivity: { water: 'exothermic dilution', base: 'violent neutralisation', metals: 'liberates H₂ from metals above H in the activity series', oxidisers: 'releases Cl₂ with KMnO₄ or MnO₂', storage: 'Borosilicate glass or PTFE; never metal.' },
      hazards: { ghs: ['H290', 'H314', 'H335'], nfpa: { health: 3, flammability: 0, reactivity: 1 }, signalWord: 'Danger' },
      tags: ['acid', 'strong', 'volatile', 'corrosive']
    },

    sulfuric_acid: {
      id: 'sulfuric_acid', name: 'Sulfuric Acid', formula: 'H₂SO₄', formulaPlain: 'H2SO4',
      iupac: 'sulfuric acid',
      category: 'strong_acid', molarMass: 98.079, density: 1.84, state: 'liquid',
      densityNote: '98 % w/w (18.4 M), 20 °C.',
      appearance: 'Colourless, odourless, viscous, strongly hygroscopic liquid.',
      colorHex: '#F2F4F4',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -814.0,       // ΔfH°(H2SO4, l)
      enthalpyFormationNote: 'ΔfH°(H₂SO₄, aq) = −909.27 kJ·mol⁻¹. Dilution is violently exothermic (ΔH_dil ≈ −88 kJ·mol⁻¹).',
      pKa: -3.0,                       // pKa1 (H2SO4); pKa2 = +1.99
      solubility: { water: 'miscible, highly exothermic', note: 'ALWAYS add acid to water — never water to acid.' },
      stockConcentration: { molarity: 18.4, percentWw: 98, label: '98 % w/w (conc.)' },
      reactivity: { water: 'violent exotherm', base: 'violent', metals: 'dilute → H₂ + sulfate; hot conc. → SO₂ (oxidising)', organics: 'dehydrates carbohydrates (charring)', storage: 'Glass or PTFE.' },
      hazards: { ghs: ['H290', 'H314'], nfpa: { health: 3, flammability: 0, reactivity: 2, special: 'W' }, signalWord: 'Danger' },
      tags: ['acid', 'strong', 'diprotic', 'dehydrating', 'corrosive']
    },

    nitric_acid: {
      id: 'nitric_acid', name: 'Nitric Acid', formula: 'HNO₃', formulaPlain: 'HNO3',
      iupac: 'nitric acid',
      category: 'strong_acid', molarMass: 63.012, density: 1.51, state: 'aqueous',
      densityNote: '68 % w/w azeotrope (15.2 M), 20 °C. Fuming HNO₃ ≈ 1.55 g·cm⁻³.',
      appearance: 'Colourless to pale-yellow fuming liquid; yellowing indicates dissolved NO₂.',
      colorHex: '#FEF9E7',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -174.1,       // ΔfH°(HNO3, l)
      enthalpyFormationNote: 'ΔfH°(HNO₃, aq) = −207.36 kJ·mol⁻¹.',
      pKa: -1.4,
      solubility: { water: 'miscible in all proportions' },
      stockConcentration: { molarity: 15.2, percentWw: 68, label: '68 % w/w (conc.)' },
      reactivity: { water: 'exothermic dilution', base: 'violent', metals: 'oxidising — Cu gives NO₂ (conc.) or NO (dilute); does NOT liberate H₂', organics: 'nitration, can be explosive', storage: 'Glass, dark, vented.' },
      hazards: { ghs: ['H272', 'H290', 'H314', 'H330'], nfpa: { health: 4, flammability: 0, reactivity: 3, special: 'OX' }, signalWord: 'Danger' },
      tags: ['acid', 'strong', 'oxidiser', 'monoprotic', 'corrosive']
    },

    /* ======================================================================
     * 5.5 — WEAK ACIDS
     * ==================================================================== */
    acetic_acid: {
      id: 'acetic_acid', name: 'Acetic Acid', formula: 'CH₃COOH', formulaPlain: 'CH3COOH',
      iupac: 'acetic acid / ethanoic acid',
      category: 'weak_acid', molarMass: 60.052, density: 1.049, state: 'liquid',
      densityNote: 'Glacial (≥ 99.5 %), 20 °C.',
      appearance: 'Colourless liquid with a sharp, sour, vinegar-like odour.',
      colorHex: '#FDFEFE',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -484.5,       // ΔfH°(CH3COOH, l)
      enthalpyFormationNote: 'ΔfH°(CH₃COOH, aq) = −485.76 kJ·mol⁻¹.',
      pKa: 4.76,
      Ka: 1.75e-5,
      solubility: { water: 'miscible in all proportions', note: 'Weak monoprotic acid: CH₃COOH ⇌ CH₃COO⁻ + H⁺.' },
      stockConcentration: { molarity: 17.4, percentWw: 99.7, label: 'Glacial' },
      reactivity: { water: 'miscible, mild exotherm', base: 'neutralisation', carbonates: 'liberates CO₂', alcohols: 'Fischer esterification (acid catalysis)', storage: 'Glass; avoid oxidisers and bases.' },
      hazards: { ghs: ['H226', 'H314'], nfpa: { health: 3, flammability: 2, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['acid', 'weak', 'monoprotic', 'buffer', 'volatile']
    },

    phosphoric_acid: {
      id: 'phosphoric_acid', name: 'Phosphoric Acid', formula: 'H₃PO₄', formulaPlain: 'H3PO4',
      iupac: 'phosphoric acid',
      category: 'weak_acid', molarMass: 97.994, density: 1.885, state: 'liquid',
      densityNote: 'Pure H₃PO₄ melts at 42.4 °C; 85 % w/w syrup, ρ = 1.685 g·cm⁻³.',
      appearance: 'Colourless, odourless, syrupy liquid (85 %) or deliquescent crystals.',
      colorHex: '#FBFCFC',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -1279.0,      // ΔfH°(H3PO4, s), 298 K
      enthalpyFormationNote: 'ΔfH°(H₃PO₄, aq) = −1288.3 kJ·mol⁻¹.',
      pKa: 2.15,
      pKaValues: [2.15, 7.20, 12.35],
      Ka: 7.1e-3,
      solubility: { water: 'very soluble (548 g/100 mL at 20 °C)', note: 'Triprotic; three buffer regions.' },
      stockConcentration: { molarity: 14.6, percentWw: 85, label: '85 % w/w' },
      reactivity: { water: 'miscible', base: 'neutralisation in three steps', metals: 'slow attack; non-oxidising', storage: 'Glass or HDPE.' },
      hazards: { ghs: ['H290', 'H314'], nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['acid', 'weak', 'triprotic', 'buffer', 'non-oxidising']
    },

    /* ======================================================================
     * 5.6 — STRONG BASES
     * ==================================================================== */
    sodium_hydroxide: {
      id: 'sodium_hydroxide', name: 'Sodium Hydroxide', formula: 'NaOH', formulaPlain: 'NaOH',
      iupac: 'sodium hydroxide',
      category: 'strong_base', molarMass: 39.997, density: 2.13, state: 'solid',
      appearance: 'White, opaque, deliquescent pellets or flakes; soapy feel.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Na,
      solutionColor: COLORLESS,
      enthalpyFormation: -425.6,       // ΔfH°(NaOH, s)
      enthalpyFormationNote: 'ΔfH°(NaOH, aq) = −470.11 kJ·mol⁻¹. Heat of solution ≈ −44.5 kJ·mol⁻¹.',
      pKa: 13.8,                       // pKa of conjugate acid H2O ≈ 15.7; "pKb" of OH- ≈ -0.6
      pKb: -0.56,
      solubility: { water: 'very soluble — 109 g/100 mL at 20 °C (exothermic)', note: 'Complete dissociation: NaOH → Na⁺ + OH⁻.' },
      stockConcentration: { molarity: 1.0, percentWw: 4.0, label: '1 M standard titrant (CO₂-free)' },
      reactivity: { water: 'exothermic dissolution', acid: 'violent neutralisation', amphoteric: 'dissolves Al, Zn, Pb, Sn to give aluminates/zincates', glass: 'attacks glass slowly (etches)', storage: 'HDPE; never glass stoppers.' },
      hazards: { ghs: ['H290', 'H314'], nfpa: { health: 3, flammability: 0, reactivity: 1 }, signalWord: 'Danger' },
      tags: ['base', 'strong', 'titrant', 'deliquescent', 'corrosive']
    },

    potassium_hydroxide: {
      id: 'potassium_hydroxide', name: 'Potassium Hydroxide', formula: 'KOH', formulaPlain: 'KOH',
      iupac: 'potassium hydroxide',
      category: 'strong_base', molarMass: 56.106, density: 2.044, state: 'solid',
      appearance: 'White deliquescent pellets or sticks; strongly caustic.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.K,
      solutionColor: COLORLESS,
      enthalpyFormation: -424.8,       // ΔfH°(KOH, s)
      enthalpyFormationNote: 'ΔfH°(KOH, aq) = −482.4 kJ·mol⁻¹.',
      pKb: -0.7,
      solubility: { water: 'very soluble — 121 g/100 mL at 25 °C (exothermic)' },
      stockConcentration: { molarity: 0.5, percentWw: 2.8, label: '0.5 M alcoholic or aqueous titrant' },
      reactivity: { water: 'exothermic', acid: 'violent', organics: 'saponifies esters; used in EtOH titration', storage: 'HDPE, desiccator.' },
      hazards: { ghs: ['H290', 'H314'], nfpa: { health: 3, flammability: 0, reactivity: 1 }, signalWord: 'Danger' },
      tags: ['base', 'strong', 'titrant', 'deliquescent', 'corrosive']
    },

    /* ======================================================================
     * 5.7 — WEAK BASE
     * ==================================================================== */
    ammonia_solution: {
      id: 'ammonia_solution', name: 'Ammonia Solution', formula: 'NH₃(aq)', formulaPlain: 'NH3',
      iupac: 'ammonia solution / ammonium hydroxide',
      category: 'weak_base', molarMass: 17.031, density: 0.90, state: 'aqueous',
      densityNote: '28 % w/w NH₃ (14.8 M), 25 °C.',
      appearance: 'Colourless liquid with a very pungent, suffocating odour.',
      colorHex: '#EBF5FB',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -80.29,       // ΔfH°(NH3, aq)
      enthalpyFormationNote: 'ΔfH°(NH₃, g) = −45.94 kJ·mol⁻¹. Solution is exothermic.',
      pKb: 4.75,
      Kb: 1.78e-5,
      solubility: { water: 'very soluble — 47 g/100 mL at 0 °C (702 vol/vol)', note: 'NH₃ + H₂O ⇌ NH₄⁺ + OH⁻ (Kb = 1.78 × 10⁻⁵).' },
      stockConcentration: { molarity: 14.8, percentWw: 28, label: '28 % w/w (conc.)' },
      reactivity: { acid: 'violent exothermic neutralisation → ammonium salts', transitionMetals: 'precipitates hydroxides; excess NH₃ dissolves Cu²⁺, Ni²⁺, Zn²⁺, Ag⁺ as ammine complexes', oxidisers: 'can form explosive NCl₃ with Cl₂', storage: 'Cool, vented, HDPE.' },
      hazards: { ghs: ['H314', 'H335', 'H400'], nfpa: { health: 3, flammability: 1, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['base', 'weak', 'ligand', 'volatile', 'pungent']
    },

    /* ======================================================================
     * 5.8 — ALKALI METAL SALTS
     * ==================================================================== */
    sodium_chloride: {
      id: 'sodium_chloride', name: 'Sodium Chloride', formula: 'NaCl', formulaPlain: 'NaCl',
      iupac: 'sodium chloride',
      category: 'alkali_salt', molarMass: 58.44, density: 2.165, state: 'solid',
      appearance: 'White cubic crystals; rock salt or fine powder.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Na,
      solutionColor: COLORLESS,
      enthalpyFormation: -411.15,      // ΔfH°(NaCl, s)
      enthalpyFormationNote: 'ΔfH°(NaCl, aq) = −407.27 kJ·mol⁻¹. Lattice enthalpy = +787 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 36.0 g/100 mL at 20 °C', rules: ['S1', 'S3'], note: 'Solubility nearly temperature-independent (35.7 → 39.1 g/100 mL from 0 → 100 °C).' },
      reactivity: { water: 'dissolves', acid: 'none (spectator)', oxidisers: 'gives Cl₂ with KMnO₄/H₂SO₄', storage: 'Any dry container.' },
      hazards: { ghs: [], nfpa: { health: 0, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['salt', 'ionic', 'spectator', 'standard']
    },

    potassium_chloride: {
      id: 'potassium_chloride', name: 'Potassium Chloride', formula: 'KCl', formulaPlain: 'KCl',
      iupac: 'potassium chloride',
      category: 'alkali_salt', molarMass: 74.551, density: 1.984, state: 'solid',
      appearance: 'White crystalline powder or colourless cubic crystals.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.K,
      solutionColor: COLORLESS,
      enthalpyFormation: -436.5,       // ΔfH°(KCl, s)
      enthalpyFormationNote: 'ΔfH°(KCl, aq) = −419.53 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 34.2 g/100 mL at 20 °C', rules: ['S1', 'S3'], note: 'Strongly temperature-dependent: 28.0 → 56.7 g/100 mL (0 → 100 °C).' },
      reactivity: { water: 'dissolves (endothermic, ΔH_sol = +17.2 kJ·mol⁻¹)', acid: 'none', oxidisers: 'Cl₂ with strong oxidisers', storage: 'Dry.' },
      hazards: { ghs: [], nfpa: { health: 0, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['salt', 'ionic', 'flame-test-standard']
    },

    lithium_chloride: {
      id: 'lithium_chloride', name: 'Lithium Chloride', formula: 'LiCl', formulaPlain: 'LiCl',
      iupac: 'lithium chloride',
      category: 'alkali_salt', molarMass: 42.394, density: 2.068, state: 'solid',
      appearance: 'White deliquescent cubic crystals.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Li,
      solutionColor: COLORLESS,
      enthalpyFormation: -408.6,       // ΔfH°(LiCl, s)
      enthalpyFormationNote: 'ΔfH°(LiCl, aq) = −445.6 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 83.5 g/100 mL at 20 °C', rules: ['S1', 'S3'], note: 'Dissolution is strongly exothermic.' },
      reactivity: { water: 'dissolves exothermically', acid: 'none', storage: 'Sealed, desiccated.' },
      hazards: { ghs: ['H302', 'H315', 'H319'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'ionic', 'hygroscopic', 'flame-test-standard']
    },

    potassium_iodide: {
      id: 'potassium_iodide', name: 'Potassium Iodide', formula: 'KI', formulaPlain: 'KI',
      iupac: 'potassium iodide',
      category: 'alkali_salt', molarMass: 166.003, density: 3.13, state: 'solid',
      appearance: 'White crystalline solid; turns slightly yellow on air/light exposure (I₂).',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.K,
      solutionColor: COLORLESS,
      enthalpyFormation: -327.9,       // ΔfH°(KI, s)
      enthalpyFormationNote: 'ΔfH°(KI, aq) = −307.5 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 144 g/100 mL at 20 °C', rules: ['S1', 'S3'] },
      reactivity: { water: 'dissolves', acid: 'none directly', oxidisers: 'liberates I₂ (starch → deep blue)', precipitation: 'gives PbI₂ (golden), AgI (pale yellow), HgI₂', storage: 'Dark, sealed.' },
      hazards: { ghs: ['H315', 'H319'], nfpa: { health: 1, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'ionic', 'reducing-agent', 'iodometry']
    },

    potassium_thiocyanate: {
      id: 'potassium_thiocyanate', name: 'Potassium Thiocyanate', formula: 'KSCN', formulaPlain: 'KSCN',
      iupac: 'potassium thiocyanate',
      category: 'alkali_salt', molarMass: 97.181, density: 1.886, state: 'solid',
      appearance: 'Colourless, deliquescent, rhombic crystals.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.K,
      solutionColor: COLORLESS,
      enthalpyFormation: -208.4,
      solubility: { water: 'very soluble — 217 g/100 mL at 20 °C', rules: ['S1', 'S8'] },
      reactivity: { water: 'dissolves (endothermic)', ironIII: 'Fe³⁺ + SCN⁻ → blood-red [Fe(SCN)(H₂O)₅]²⁺ (Kf ≈ 10²·¹)', acid: 'liberates HSCN', oxidisers: 'oxidised to sulfate', storage: 'Dry, sealed.' },
      hazards: { ghs: ['H302', 'H312', 'H332', 'H412'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'ligand', 'colorimetric', 'iron-detection']
    },

    /* ======================================================================
     * 5.9 — ALKALINE EARTH SALTS
     * ==================================================================== */
    calcium_chloride: {
      id: 'calcium_chloride', name: 'Calcium Chloride', formula: 'CaCl₂', formulaPlain: 'CaCl2',
      iupac: 'calcium chloride',
      category: 'alkaline_salt', molarMass: 110.98, density: 2.15, state: 'solid',
      appearance: 'White deliquescent granules or fused lumps (often the dihydrate).',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Ca,
      solutionColor: COLORLESS,
      enthalpyFormation: -795.8,       // ΔfH°(CaCl2, s)
      enthalpyFormationNote: 'ΔfH°(CaCl₂, aq) = −877.3 kJ·mol⁻¹. Heat of solution ≈ −82.8 kJ·mol⁻¹ (strongly exothermic).',
      solubility: { water: 'very soluble — 74.5 g/100 mL at 20 °C', rules: ['S3'], note: 'Dissolution is strongly exothermic — used in drying tubes and hot packs.' },
      reactivity: { water: 'dissolves exothermically', carbonate: 'precipitates CaCO₃', sulfate: 'no precipitate (CaSO₄ is sparingly soluble)', storage: 'Sealed — deliquescent.' },
      hazards: { ghs: ['H302', 'H315', 'H319'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'ionic', 'desiccant', 'exothermic-dissolution', 'flame-test-standard']
    },

    barium_chloride: {
      id: 'barium_chloride', name: 'Barium Chloride', formula: 'BaCl₂', formulaPlain: 'BaCl2',
      iupac: 'barium chloride',
      category: 'alkaline_salt', molarMass: 208.23, density: 3.856, state: 'solid',
      appearance: 'White crystalline solid (commonly the dihydrate, BaCl₂·2H₂O).',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Ba,
      solutionColor: COLORLESS,
      enthalpyFormation: -855.0,       // ΔfH°(BaCl2, s)
      enthalpyFormationNote: 'ΔfH°(BaCl₂, aq) = −871.5 kJ·mol⁻¹. Dihydrate: −1460.1 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 35.8 g/100 mL at 20 °C', rules: ['S3'], note: 'BaSO₄ formed with sulfate is acid-insoluble — definitive sulfate test.' },
      reactivity: { water: 'dissolves', sulfate: 'immediate white BaSO₄ precipitate (Ksp = 1.08 × 10⁻¹⁰)', carbonate: 'white BaCO₃', storage: 'Dry, sealed.' },
      hazards: { ghs: ['H301', 'H332', 'H319'], nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['salt', 'ionic', 'toxic', 'sulfate-test', 'flame-test-standard']
    },

    calcium_carbonate: {
      id: 'calcium_carbonate', name: 'Calcium Carbonate', formula: 'CaCO₃', formulaPlain: 'CaCO3',
      iupac: 'calcium carbonate',
      category: 'alkaline_salt', molarMass: 100.086, density: 2.711, state: 'solid',
      appearance: 'White powder (calcite) or crystalline marble/chalk chips.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Ca,
      solutionColor: null,
      enthalpyFormation: -1206.9,      // ΔfH°(CaCO3, calcite)
      enthalpyFormationNote: 'ΔfH°(CaCO₃, aragonite) = −1207.8 kJ·mol⁻¹.',
      solubility: { water: 'insoluble — Ksp = 3.3 × 10⁻⁹', rules: ['S5'], note: 'Solubility increases in CO₂-saturated water via formation of Ca(HCO₃)₂ (cave chemistry).' },
      reactivity: { water: 'insoluble', acid: 'dissolves vigorously with effervescence: CaCO₃ + 2 HCl → CaCl₂ + H₂O + CO₂↑', heat: 'CaCO₃ → CaO + CO₂↑ above 840 °C', storage: 'Dry.' },
      hazards: { ghs: [], nfpa: { health: 0, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['salt', 'insoluble', 'carbonate', 'antacid', 'CO2-source']
    },

    /* ======================================================================
     * 5.10 — TRANSITION METAL SALTS
     * ==================================================================== */
    copper_sulfate_pentahydrate: {
      id: 'copper_sulfate_pentahydrate', name: 'Copper(II) Sulfate Pentahydrate',
      formula: 'CuSO₄·5H₂O', formulaPlain: 'CuSO4.5H2O',
      iupac: 'copper(II) sulfate pentahydrate',
      category: 'transition_metal_salt', molarMass: 249.685, density: 2.286, state: 'solid',
      appearance: 'Bright blue triclinic crystals ("blue vitriol"); effloresces in dry air.',
      colorHex: '#1E6FD9',
      flameColor: FLAME_COLORS.Cu,
      solutionColor: IONS['Cu2+'].solutionColor,
      enthalpyFormation: -2279.7,      // ΔfH°(CuSO4·5H2O, s)
      enthalpyFormationNote: 'ΔfH°(CuSO₄, s) = −771.36 kJ·mol⁻¹. Dehydration: CuSO₄·5H₂O → CuSO₄ + 5 H₂O, ΔH = +299 kJ·mol⁻¹ (two steps at 110 °C and 250 °C).',
      solubility: { water: 'soluble — 31.6 g/100 mL at 20 °C (as anhydrous basis)', rules: ['S4'], note: 'Solutions are acidic (pH ≈ 4) due to [Cu(H₂O)₆]²⁺ hydrolysis.' },
      reactivity: { water: 'dissolves to a blue solution', ammonia: 'pale-blue Cu(OH)₂ → deep-blue [Cu(NH₃)₄(H₂O)₂]²⁺ in excess', iron: 'Fe + CuSO₄ → FeSO₄ + Cu (displacement)', heat: 'turns white on dehydration', storage: 'Sealed.' },
      hazards: { ghs: ['H302', 'H315', 'H319', 'H410'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'transition', 'hydrate', 'electrolyte', 'biuret-reagent', 'flame-test-standard']
    },

    copper_sulfate_anhydrous: {
      id: 'copper_sulfate_anhydrous', name: 'Copper(II) Sulfate (Anhydrous)',
      formula: 'CuSO₄', formulaPlain: 'CuSO4',
      iupac: 'copper(II) sulfate',
      category: 'transition_metal_salt', molarMass: 159.609, density: 3.60, state: 'solid',
      appearance: 'White to pale-grey powder; turns blue instantly on hydration.',
      colorHex: '#EAECEE',
      flameColor: FLAME_COLORS.Cu,
      solutionColor: IONS['Cu2+'].solutionColor,
      enthalpyFormation: -771.36,      // ΔfH°(CuSO4, s)
      solubility: { water: 'soluble — 20.3 g/100 mL at 20 °C', rules: ['S4'], note: 'Hydration to the pentahydrate is strongly exothermic (ΔH = −299 kJ·mol⁻¹).' },
      reactivity: { water: 'hydrates exothermically, turns blue', storage: 'Absolutely dry — used as a desiccant indicator.' },
      hazards: { ghs: ['H302', 'H315', 'H319', 'H410'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'transition', 'desiccant', 'water-test', 'anhydrous']
    },

    copper_chloride: {
      id: 'copper_chloride', name: 'Copper(II) Chloride', formula: 'CuCl₂', formulaPlain: 'CuCl2',
      iupac: 'copper(II) chloride',
      category: 'transition_metal_salt', molarMass: 134.452, density: 3.386, state: 'solid',
      appearance: 'Yellow-brown to green deliquescent powder (dihydrate is blue-green).',
      colorHex: '#48C9B0',
      flameColor: FLAME_COLORS.Cu,
      solutionColor: { name: 'Blue-Green (Teal)', hex: '#17A589', diluteHex: '#A2D9CE', visible: true,
                       note: 'Concentrated solutions are green due to [CuCl₄]²⁻; dilute solutions blue due to [Cu(H₂O)₆]²⁺.' },
      enthalpyFormation: -205.85,      // ΔfH°(CuCl2, s)
      enthalpyFormationNote: 'ΔfH°(CuCl₂·2H₂O, s) = −821.3 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 70.6 g/100 mL at 20 °C', rules: ['S3'] },
      reactivity: { water: 'dissolves to blue-green solution', ammonia: 'deep blue ammine complex', metals: 'Al, Zn displace Cu', storage: 'Sealed, dry.' },
      hazards: { ghs: ['H302', 'H315', 'H319', 'H410'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'transition', 'halide', 'flame-test-standard', 'hygroscopic']
    },

    copper_nitrate: {
      id: 'copper_nitrate', name: 'Copper(II) Nitrate', formula: 'Cu(NO₃)₂', formulaPlain: 'Cu(NO3)2',
      iupac: 'copper(II) nitrate',
      category: 'transition_metal_salt', molarMass: 187.556, density: 3.05, state: 'solid',
      appearance: 'Blue hygroscopic crystals (trihydrate); anhydrous form is blue-green.',
      colorHex: '#2E86C1',
      flameColor: FLAME_COLORS.Cu,
      solutionColor: IONS['Cu2+'].solutionColor,
      enthalpyFormation: -302.9,       // ΔfH°(Cu(NO3)2, s)
      enthalpyFormationNote: 'ΔfH°(Cu(NO₃)₂·3H₂O, s) = −1215.9 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 137 g/100 mL at 20 °C', rules: ['S2'] },
      reactivity: { water: 'dissolves', heat: 'decomposes: 2 Cu(NO₃)₂ → 2 CuO + 4 NO₂↑ + O₂↑', organics: 'oxidiser — can ignite on contact', storage: 'Sealed, away from organics.' },
      hazards: { ghs: ['H272', 'H302', 'H315', 'H319', 'H410'], nfpa: { health: 2, flammability: 0, reactivity: 2, special: 'OX' }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'oxidiser', 'hygroscopic']
    },

    iron_sulfate_heptahydrate: {
      id: 'iron_sulfate_heptahydrate', name: 'Iron(II) Sulfate Heptahydrate',
      formula: 'FeSO₄·7H₂O', formulaPlain: 'FeSO4.7H2O',
      iupac: 'iron(II) sulfate heptahydrate',
      category: 'transition_metal_salt', molarMass: 278.015, density: 1.895, state: 'solid',
      appearance: 'Pale blue-green monoclinic crystals ("green vitriol"); effloresces and oxidises to brown.',
      colorHex: '#7DCEA0',
      flameColor: FLAME_COLORS.Fe,
      solutionColor: IONS['Fe2+'].solutionColor,
      enthalpyFormation: -3014.0,      // ΔfH°(FeSO4·7H2O, s)
      enthalpyFormationNote: 'ΔfH°(FeSO₄, s) = −928.4 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 25.6 g/100 mL at 20 °C', rules: ['S4'], note: 'Solution is slightly acidic and oxidises on standing.' },
      reactivity: { water: 'dissolves to pale-green solution', air: '4 Fe²⁺ + O₂ + 4 H⁺ → 4 Fe³⁺ + 2 H₂O (slow)', alkali: 'dirty-green Fe(OH)₂ → brown Fe(OH)₃', oxidisers: 'KMnO₄ in acid medium: MnO₄⁻ + 5 Fe²⁺ + 8 H⁺ → Mn²⁺ + 5 Fe³⁺ + 4 H₂O', storage: 'Sealed; often kept with iron nail.' },
      hazards: { ghs: ['H302', 'H315', 'H319'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'transition', 'reducing-agent', 'hydrate', 'redox-titration']
    },

    iron_chloride: {
      id: 'iron_chloride', name: 'Iron(III) Chloride', formula: 'FeCl₃', formulaPlain: 'FeCl3',
      iupac: 'iron(III) chloride / ferric chloride',
      category: 'transition_metal_salt', molarMass: 162.204, density: 2.898, state: 'solid',
      appearance: 'Dark green-black deliquescent crystals (hexahydrate is yellow-brown).',
      colorHex: '#B9770E',
      flameColor: FLAME_COLORS.Fe,
      solutionColor: IONS['Fe3+'].solutionColor,
      enthalpyFormation: -399.4,       // ΔfH°(FeCl3, s)
      enthalpyFormationNote: 'ΔfH°(FeCl₃, aq) = −555.6 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 91.2 g/100 mL at 20 °C (strongly exothermic, acidic)', rules: ['S3'] },
      reactivity: { water: 'dissolves exothermically; pH ≈ 2', thiocyanate: 'Fe³⁺ + SCN⁻ → blood-red complex', hydroxide: 'reddish-brown gelatinous Fe(OH)₃', metals: 'corrodes Cu, Zn; etches stainless steel', storage: 'Sealed, dry.' },
      hazards: { ghs: ['H302', 'H315', 'H318', 'H317'], nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'lewis-acid', 'etchant', 'hygroscopic', 'phenol-test']
    },

    iron_chloride_ii: {
      id: 'iron_chloride_ii', name: 'Iron(II) Chloride', formula: 'FeCl₂', formulaPlain: 'FeCl2',
      iupac: 'iron(II) chloride',
      category: 'transition_metal_salt', molarMass: 126.751, density: 3.16, state: 'solid',
      appearance: 'Pale green to yellow hygroscopic crystals (tetrahydrate is green).',
      colorHex: '#A9DFBF',
      flameColor: FLAME_COLORS.Fe,
      solutionColor: IONS['Fe2+'].solutionColor,
      enthalpyFormation: -341.8,       // ΔfH°(FeCl2, s)
      enthalpyFormationNote: 'ΔfH°(FeCl₂·4H₂O, s) = −994.5 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 68.5 g/100 mL at 20 °C', rules: ['S3'] },
      reactivity: { water: 'dissolves to pale green solution', air: 'oxidises to Fe³⁺ (brown)', alkali: 'Fe(OH)₂ green → Fe(OH)₃ brown', storage: 'Sealed under inert gas.' },
      hazards: { ghs: ['H302', 'H315', 'H319'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'transition', 'reducing-agent', 'hygroscopic']
    },

    cobalt_chloride: {
      id: 'cobalt_chloride', name: 'Cobalt(II) Chloride', formula: 'CoCl₂', formulaPlain: 'CoCl2',
      iupac: 'cobalt(II) chloride',
      category: 'transition_metal_salt', molarMass: 129.839, density: 3.356, state: 'solid',
      appearance: 'Anhydrous: sky-blue. Hexahydrate: deep pink-red. Strongly hygroscopic.',
      colorHex: '#5DADE2',
      flameColor: null,
      solutionColor: IONS['Co2+'].solutionColor,
      enthalpyFormation: -312.5,       // ΔfH°(CoCl2, s)
      enthalpyFormationNote: 'ΔfH°(CoCl₂·6H₂O, s) = −2113.0 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 52.9 g/100 mL at 20 °C', rules: ['S3'], note: 'Pink in water; turns deep blue in conc. HCl or on heating (CoCl₄²⁻).' },
      reactivity: { water: 'dissolves pink', heat: 'CoCl₂·6H₂O → CoCl₂ + 6 H₂O (pink → blue)', ammonia: 'excess NH₃ gives yellow-brown [Co(NH₃)₆]²⁺ which oxidises to [Co(NH₃)₆]³⁺', storage: 'Sealed — humidity indicator.' },
      hazards: { ghs: ['H302', 'H317', 'H319', 'H334', 'H410'], nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'humidity-indicator', 'hygroscopic', 'sensitizer']
    },

    nickel_sulfate: {
      id: 'nickel_sulfate', name: 'Nickel(II) Sulfate', formula: 'NiSO₄', formulaPlain: 'NiSO4',
      iupac: 'nickel(II) sulfate',
      category: 'transition_metal_salt', molarMass: 154.753, density: 3.68, state: 'solid',
      appearance: 'Yellow anhydrous solid; the heptahydrate is blue-green; hexahydrate is blue.',
      colorHex: '#1E8449',
      flameColor: null,
      solutionColor: IONS['Ni2+'].solutionColor,
      enthalpyFormation: -872.9,       // ΔfH°(NiSO4, s)
      enthalpyFormationNote: 'ΔfH°(NiSO₄·7H₂O, s) = −2976.3 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 40.4 g/100 mL at 20 °C (as heptahydrate)', rules: ['S4'] },
      reactivity: { water: 'dissolves green', ammonia: 'excess NH₃ gives blue [Ni(NH₃)₆]²⁺', dimethylglyoxime: 'scarlet-red chelate precipitate (Ni detection)', storage: 'Sealed, dry.' },
      hazards: { ghs: ['H302', 'H315', 'H317', 'H332', 'H334', 'H341', 'H350', 'H360', 'H372', 'H410'],
                 nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'carcinogen', 'sensitizer', 'qualitative-analysis']
    },

    zinc_sulfate: {
      id: 'zinc_sulfate', name: 'Zinc Sulfate', formula: 'ZnSO₄', formulaPlain: 'ZnSO4',
      iupac: 'zinc(II) sulfate',
      category: 'transition_metal_salt', molarMass: 161.442, density: 3.54, state: 'solid',
      appearance: 'Colourless to white crystalline solid; heptahydrate ("white vitriol") is colourless.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Zn,
      solutionColor: COLORLESS,
      enthalpyFormation: -982.8,       // ΔfH°(ZnSO4, s)
      enthalpyFormationNote: 'ΔfH°(ZnSO₄·7H₂O, s) = −3077.8 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 54.4 g/100 mL at 20 °C', rules: ['S4'] },
      reactivity: { water: 'dissolves (colourless)', alkali: 'white Zn(OH)₂, soluble in excess to [Zn(OH)₄]²⁻', sulfide: 'white ZnS', carbonate: 'white basic zinc carbonate', storage: 'Dry.' },
      hazards: { ghs: ['H302', 'H315', 'H318', 'H410'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'colourless-ion', 'amphoteric-hydroxide']
    },

    silver_nitrate: {
      id: 'silver_nitrate', name: 'Silver Nitrate', formula: 'AgNO₃', formulaPlain: 'AgNO3',
      iupac: 'silver nitrate',
      category: 'transition_metal_salt', molarMass: 169.873, density: 4.35, state: 'solid',
      appearance: 'Colourless transparent crystals; darkens to grey/black on light exposure.',
      colorHex: '#FDFEFE',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -124.4,       // ΔfH°(AgNO3, s)
      enthalpyFormationNote: 'ΔfH°(AgNO₃, aq) = −101.8 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 216 g/100 mL at 20 °C', rules: ['S2'], note: 'Photosensitive; store in amber glass.' },
      reactivity: { water: 'dissolves', halides: 'AgCl (white), AgBr (cream), AgI (pale yellow) precipitates', hydroxide: 'brown Ag₂O precipitate', ammonia: 'gives [Ag(NH₃)₂]⁺ (Tollens’ reagent base)', organics: 'stains skin black (reduced Ag⁰)', storage: 'Amber glass, dark.' },
      hazards: { ghs: ['H272', 'H314', 'H410'], nfpa: { health: 3, flammability: 0, reactivity: 2, special: 'OX' }, signalWord: 'Danger' },
      tags: ['salt', 'transition', 'oxidiser', 'photosensitive', 'halide-test', 'titrant']
    },

    lead_nitrate: {
      id: 'lead_nitrate', name: 'Lead(II) Nitrate', formula: 'Pb(NO₃)₂', formulaPlain: 'Pb(NO3)2',
      iupac: 'lead(II) nitrate',
      category: 'transition_metal_salt', molarMass: 331.200, density: 4.53, state: 'solid',
      appearance: 'White cubic crystals; decrepitates on heating; toxic.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Pb,
      solutionColor: COLORLESS,
      enthalpyFormation: -451.7,       // ΔfH°(Pb(NO3)2, s)
      enthalpyFormationNote: 'ΔfH°(Pb(NO₃)₂, aq) = −414.2 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 56.5 g/100 mL at 20 °C', rules: ['S2'] },
      reactivity: { water: 'dissolves', iodide: 'brilliant golden-yellow PbI₂ precipitate', chloride: 'white PbCl₂ (dissolves in hot water)', sulfate: 'white PbSO₄', chromate: 'bright yellow PbCrO₄', sulfide: 'black PbS', heat: 'decomposes to PbO + NO₂ + O₂', storage: 'Sealed, labelled toxic.' },
      hazards: { ghs: ['H272', 'H302', 'H315', 'H319', 'H332', 'H360', 'H372', 'H373', 'H410'],
                 nfpa: { health: 3, flammability: 0, reactivity: 2, special: 'OX' }, signalWord: 'Danger' },
      tags: ['salt', 'toxic', 'heavy-metal', 'oxidiser', 'iodide-test']
    },

    potassium_permanganate: {
      id: 'potassium_permanganate', name: 'Potassium Permanganate',
      formula: 'KMnO₄', formulaPlain: 'KMnO4',
      iupac: 'potassium permanganate',
      category: 'oxidiser', molarMass: 158.034, density: 2.703, state: 'solid',
      appearance: 'Dark purple-black lustrous crystals; deep purple solutions; stains skin brown.',
      colorHex: '#4B0082',
      flameColor: FLAME_COLORS.K,
      solutionColor: IONS['MnO4-'].solutionColor,
      enthalpyFormation: -837.2,       // ΔfH°(KMnO4, s)
      enthalpyFormationNote: 'ΔfH°(KMnO₄, aq) = −837.2 kJ·mol⁻¹ (approximate).',
      solubility: { water: 'soluble — 6.4 g/100 mL at 20 °C', rules: ['S1'], note: 'Decomposes slowly in water; 4 MnO₄⁻ + 4 H⁺ → 4 MnO₂ + 3 O₂ + 2 H₂O (light-catalysed).' },
      stockConcentration: { molarity: 0.0200, percentWw: 0.32, label: '0.02 M standardised titrant' },
      reactivity: {
        water: 'dissolves (purple)',
        acidMedium: 'MnO₄⁻ + 8 H⁺ + 5 e⁻ → Mn²⁺ + 4 H₂O  (E° = +1.51 V, colourless Mn²⁺)',
        neutralMedium: 'MnO₄⁻ + 2 H₂O + 3 e⁻ → MnO₂ + 4 OH⁻  (E° = +1.23 V, brown MnO₂)',
        basicMedium: 'MnO₄⁻ + e⁻ → MnO₄²⁻  (E° = +0.56 V, green manganate)',
        organics: 'vigorously oxidises glycerol, ethanol, sugar — can self-ignite with glycerine',
        storage: 'Dark, sealed, away from organics.'
      },
      hazards: { ghs: ['H272', 'H302', 'H314', 'H361d', 'H373', 'H410'],
                 nfpa: { health: 3, flammability: 0, reactivity: 2, special: 'OX' }, signalWord: 'Danger' },
      tags: ['oxidiser', 'titrant', 'redox', 'indicator-free', 'staining']
    },

    potassium_dichromate: {
      id: 'potassium_dichromate', name: 'Potassium Dichromate',
      formula: 'K₂Cr₂O₇', formulaPlain: 'K2Cr2O7',
      iupac: 'potassium dichromate(VI)',
      category: 'oxidiser', molarMass: 294.185, density: 2.676, state: 'solid',
      appearance: 'Bright orange-red triclinic crystals; strongly coloured solutions.',
      colorHex: '#E67E22',
      flameColor: FLAME_COLORS.K,
      solutionColor: IONS['Cr2O7-2'].solutionColor,
      enthalpyFormation: -2061.0,      // ΔfH°(K2Cr2O7, s)
      enthalpyFormationNote: 'ΔfH°(K₂Cr₂O₇, aq) = −2071.5 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 12.3 g/100 mL at 20 °C', rules: ['S1'], note: 'Orange in acid; yellow chromate in base: Cr₂O₇²⁻ + 2 OH⁻ ⇌ 2 CrO₄²⁻ + H₂O.' },
      stockConcentration: { molarity: 0.0167, percentWw: 0.49, label: '0.0167 M (1/6 eq) primary-standard titrant' },
      reactivity: {
        water: 'dissolves orange',
        acidMedium: 'Cr₂O₇²⁻ + 14 H⁺ + 6 e⁻ → 2 Cr³⁺ + 7 H₂O  (E° = +1.33 V, green Cr³⁺)',
        alcohols: 'oxidises primary alcohols → aldehydes → acids; ethanol gives green Cr³⁺ (breathalyser)',
        organics: 'strong oxidiser — mixtures with organics can be explosive',
        storage: 'Sealed, away from combustibles.'
      },
      hazards: { ghs: ['H272', 'H301', 'H312', 'H314', 'H317', 'H330', 'H334', 'H340', 'H350', 'H360', 'H372', 'H410'],
                 nfpa: { health: 4, flammability: 0, reactivity: 3, special: 'OX' }, signalWord: 'Danger' },
      tags: ['oxidiser', 'titrant', 'carcinogen', 'chromium-VI', 'primary-standard']
    },

    /* ======================================================================
     * 5.11 — CARBONATES & BICARBONATES
     * ==================================================================== */
    sodium_carbonate: {
      id: 'sodium_carbonate', name: 'Sodium Carbonate', formula: 'Na₂CO₃', formulaPlain: 'Na2CO3',
      iupac: 'sodium carbonate',
      category: 'alkali_salt', molarMass: 105.988, density: 2.54, state: 'solid',
      appearance: 'White odourless powder (anhydrous) or large transparent crystals (decahydrate, washing soda).',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Na,
      solutionColor: COLORLESS,
      enthalpyFormation: -1130.7,      // ΔfH°(Na2CO3, s)
      enthalpyFormationNote: 'ΔfH°(Na₂CO₃, aq) = −1129.2 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 21.5 g/100 mL at 20 °C (exothermic)', rules: ['S1', 'S5'], note: 'Strongly alkaline: pH of 0.1 M ≈ 11.6 (CO₃²⁻ + H₂O ⇌ HCO₃⁻ + OH⁻).' },
      stockConcentration: { molarity: 0.1000, percentWw: 1.06, label: '0.1000 M primary-standard base (dried at 270 °C)' },
      reactivity: { water: 'dissolves alkaline', acid: 'effervesces vigorously: Na₂CO₃ + 2 HCl → 2 NaCl + H₂O + CO₂↑', hardness: 'precipitates Ca²⁺/Mg²⁺ carbonates (water softening)', heat: 'Na₂CO₃ melts at 851 °C; stable to ignition', storage: 'Dry.' },
      hazards: { ghs: ['H315', 'H319'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['salt', 'base', 'primary-standard', 'buffer', 'effervescent']
    },

    sodium_bicarbonate: {
      id: 'sodium_bicarbonate', name: 'Sodium Bicarbonate', formula: 'NaHCO₃', formulaPlain: 'NaHCO3',
      iupac: 'sodium hydrogen carbonate',
      category: 'alkali_salt', molarMass: 84.007, density: 2.20, state: 'solid',
      appearance: 'Fine white crystalline powder; mildly alkaline taste.',
      colorHex: '#FDFEFE',
      flameColor: FLAME_COLORS.Na,
      solutionColor: COLORLESS,
      enthalpyFormation: -950.8,       // ΔfH°(NaHCO3, s)
      enthalpyFormationNote: 'ΔfH°(NaHCO₃, aq) = −932.4 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 9.6 g/100 mL at 20 °C', rules: ['S1', 'S5'], note: 'pH of 0.1 M ≈ 8.3 — amphiprotic (HCO₃⁻ is both a weak acid and a weak base).' },
      reactivity: { water: 'dissolves mildly alkaline', acid: 'effervesces: NaHCO₃ + HCl → NaCl + H₂O + CO₂↑', heat: '2 NaHCO₃ → Na₂CO₃ + H₂O + CO₂↑ above 50 °C', storage: 'Dry, sealed.' },
      hazards: { ghs: [], nfpa: { health: 1, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['salt', 'amphiprotic', 'buffer', 'antacid', 'effervescent']
    },

    /* ======================================================================
     * 5.12 — INDICATORS
     * ==================================================================== */
    phenolphthalein: {
      id: 'phenolphthalein', name: 'Phenolphthalein', formula: 'C₂₀H₁₄O₄', formulaPlain: 'C20H14O4',
      iupac: '3,3-bis(4-hydroxyphenyl)-2-benzofuran-1(3H)-one',
      category: 'indicator', molarMass: 318.328, density: 1.277, state: 'liquid',
      densityNote: 'Supplied as a 1 % w/v solution in 60 % ethanol; the solid is a white powder (ρ = 1.277 g·cm⁻³).',
      appearance: 'Colourless solution (in dilute ethanol); the solid is a white to pale-yellow powder.',
      colorHex: '#FDFEFE',
      flameColor: null,
      solutionColor: { name: 'Colourless (acid) / Magenta (base)', hex: '#FFFFFF', alpha: 0.0, visible: false },
      enthalpyFormation: null,
      enthalpyFormationNote: 'ΔfH° not tabulated in standard inorganic thermochemical tables (complex organic solid). ΔfH°(c) estimated ≈ −900 kJ·mol⁻¹ by group additivity.',
      solubility: { water: 'practically insoluble — 0.04 g/100 mL', rules: ['S8'], note: 'Dissolved in 60–70 % ethanol for laboratory use. Also soluble in alkali (as the phenolate).' },
      indicator: {
        type: 'pH',
        transitionRange: [8.2, 10.0],
        pKa: 9.4,
        acidColor:  { name: 'Colourless', hex: '#FFFFFF', alpha: 0.0 },
        baseColor:  { name: 'Magenta / Pink', hex: '#E0218A', alpha: 0.85 },
        mechanism: 'Lactone (colourless, sp³ C) ⇌ ring-opened quinoid dianion (magenta, conjugated sp² system).',
        endpointNote: 'Sharp colour change over ~1.4 pH units; ideal for strong-acid / strong-base titrations and for weak-acid / strong-base.',
        recommendedFor: ['strong acid + strong base', 'weak acid + strong base'],
        notRecommendedFor: ['weak base + strong acid']
      },
      reactivity: { water: 'insoluble', base: 'turns magenta above pH 10', acid: 'reverts to colourless below pH 8.2', storage: 'Amber glass bottle.' },
      hazards: { ghs: ['H341', 'H350', 'H361'], nfpa: { health: 2, flammability: 1, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['indicator', 'pH', 'titration', 'organic', 'ethanol-solution']
    },

    methyl_orange: {
      id: 'methyl_orange', name: 'Methyl Orange', formula: 'C₁₄H₁₄N₃NaO₃S', formulaPlain: 'C14H14N3NaO3S',
      iupac: 'sodium 4-{[4-(dimethylamino)phenyl]diazenyl}benzenesulfonate',
      category: 'indicator', molarMass: 327.334, density: 1.28, state: 'liquid',
      densityNote: 'Supplied as a 0.1 % w/v aqueous solution; the solid is an orange-yellow powder.',
      appearance: 'Orange-yellow solution; the solid is an orange crystalline powder.',
      colorHex: '#F1C40F',
      flameColor: FLAME_COLORS.Na,
      solutionColor: { name: 'Red (acid) / Yellow (base)', hex: '#F1C40F', visible: true },
      enthalpyFormation: null,
      enthalpyFormationNote: 'Not tabulated in standard inorganic tables (organic azo dye, sodium salt).',
      solubility: { water: 'soluble — ~0.5 g/100 mL (as the sodium salt)', rules: ['S1', 'S8'], note: 'Insoluble in the free-acid (red) form, hence the colour change is coupled to protonation.' },
      indicator: {
        type: 'pH',
        transitionRange: [3.1, 4.4],
        pKa: 3.7,
        acidColor:  { name: 'Red', hex: '#E74C3C', alpha: 0.9 },
        baseColor:  { name: 'Yellow', hex: '#F1C40F', alpha: 0.9 },
        mechanism: 'Azo dye; protonation of the dimethylamino group extends conjugation and shifts λmax from 464 nm (yellow) to 508 nm (red).',
        endpointNote: 'Best for strong-acid / weak-base titrations (endpoint pH ≈ 4).',
        recommendedFor: ['strong acid + weak base', 'strong acid + strong base'],
        notRecommendedFor: ['weak acid + strong base']
      },
      reactivity: { water: 'soluble', acid: 'red below pH 3.1', base: 'yellow above pH 4.4', storage: 'Amber glass.' },
      hazards: { ghs: ['H302', 'H315', 'H319', 'H351'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['indicator', 'pH', 'titration', 'azo-dye', 'organic']
    },

    universal_indicator: {
      id: 'universal_indicator', name: 'Universal Indicator',
      formula: 'Mixture', formulaPlain: 'Mixture',
      iupac: 'universal pH indicator mixture',
      category: 'indicator', molarMass: null, density: 0.95, state: 'liquid',
      densityNote: 'Aqueous/ethanolic mixed-dye solution, ρ ≈ 0.95 g·cm⁻³.',
      appearance: 'Green solution at pH 7; yellow when acidic, blue-violet when basic.',
      colorHex: '#2ECC71',
      flameColor: null,
      solutionColor: { name: 'pH-dependent (see scale)', hex: '#2ECC71', visible: true },
      enthalpyFormation: null,
      enthalpyFormationNote: 'Mixture — thermochemical data not applicable.',
      solubility: { water: 'miscible', rules: [], note: 'Typical composition: thymol blue, methyl red, bromothymol blue, phenolphthalein and ethanol.' },
      indicator: {
        type: 'pH',
        transitionRange: [1.0, 14.0],
        continuous: true,
        phColorScale: [
          { ph: 0,  hex: '#B00020', name: 'Deep Red' },
          { ph: 1,  hex: '#C0392B', name: 'Red' },
          { ph: 2,  hex: '#E74C3C', name: 'Red-Orange' },
          { ph: 3,  hex: '#E67E22', name: 'Orange' },
          { ph: 4,  hex: '#F39C12', name: 'Orange-Yellow' },
          { ph: 5,  hex: '#F1C40F', name: 'Yellow' },
          { ph: 6,  hex: '#D4E157', name: 'Yellow-Green' },
          { ph: 7,  hex: '#2ECC71', name: 'Green' },
          { ph: 8,  hex: '#27AE60', name: 'Blue-Green' },
          { ph: 9,  hex: '#1ABC9C', name: 'Teal' },
          { ph: 10, hex: '#3498DB', name: 'Blue' },
          { ph: 11, hex: '#2471A3', name: 'Deep Blue' },
          { ph: 12, hex: '#5B2C6F', name: 'Violet' },
          { ph: 13, hex: '#4A235A', name: 'Dark Violet' },
          { ph: 14, hex: '#2E0A4F', name: 'Purple' }
        ],
        endpointNote: 'Continuous indicator — used for demonstrating pH, not for sharp titrimetric endpoints.',
        recommendedFor: ['pH demonstration', 'approximate pH estimation'],
        notRecommendedFor: ['quantitative titration']
      },
      reactivity: { water: 'miscible', acid: 'red-orange', base: 'blue-violet', storage: 'Amber glass.' },
      hazards: { ghs: ['H226', 'H319'], nfpa: { health: 2, flammability: 2, reactivity: 0 }, signalWord: 'Warning' },
      tags: ['indicator', 'pH', 'demonstration', 'mixture', 'flammable']
    },

    litmus: {
      id: 'litmus', name: 'Litmus Solution', formula: 'Mixture', formulaPlain: 'Mixture',
      iupac: 'litmus (natural dye mixture, mainly azolitmin)',
      category: 'indicator', molarMass: null, density: 1.0, state: 'liquid',
      densityNote: 'Aqueous solution, ρ ≈ 1.0 g·cm⁻³.',
      appearance: 'Blue-violet solution at neutral pH; red in acid.',
      colorHex: '#5B2C6F',
      flameColor: null,
      solutionColor: { name: 'Red (acid) / Blue (base)', hex: '#5B2C6F', visible: true },
      enthalpyFormation: null,
      enthalpyFormationNote: 'Natural mixture — thermochemical data not applicable.',
      solubility: { water: 'soluble', rules: [] },
      indicator: {
        type: 'pH',
        transitionRange: [4.5, 8.3],
        pKa: 6.5,
        acidColor: { name: 'Red', hex: '#E74C3C', alpha: 0.85 },
        baseColor: { name: 'Blue', hex: '#2E86C1', alpha: 0.85 },
        endpointNote: 'Broad range — used qualitatively, not for titrations.',
        recommendedFor: ['qualitative acid/base testing'],
        notRecommendedFor: ['quantitative titration']
      },
      reactivity: { water: 'miscible', acid: 'red', base: 'blue', storage: 'Amber glass.' },
      hazards: { ghs: [], nfpa: { health: 0, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['indicator', 'pH', 'qualitative', 'natural-dye']
    },

    /* ======================================================================
     * 5.13 — SOLVENTS & MISCELLANEOUS REAGENTS
     * ==================================================================== */
    distilled_water: {
      id: 'distilled_water', name: 'Distilled Water', formula: 'H₂O', formulaPlain: 'H2O',
      iupac: 'water (oxidane)',
      category: 'solvent', molarMass: 18.015, density: 0.99705, state: 'liquid',
      densityNote: 'At 25 °C; maximum density 0.99997 g·cm⁻³ at 3.98 °C.',
      appearance: 'Clear, colourless, odourless liquid.',
      colorHex: '#EBF5FB',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -285.83,      // ΔfH°(H2O, l)
      enthalpyFormationNote: 'ΔfH°(H₂O, g) = −241.82 kJ·mol⁻¹. ΔHvap = +40.65 kJ·mol⁻¹ at 100 °C.',
      pKw: 14.0,
      solubility: { water: 'self', note: 'Universal solvent; autoionisation 2 H₂O ⇌ H₃O⁺ + OH⁻, Kw = 1.00 × 10⁻¹⁴ at 25 °C.' },
      reactivity: { amphoteric: 'acts as both Brønsted acid and base', metals: 'reacts with Group 1/2 metals', oxides: 'forms acids with non-metal oxides, bases with metal oxides', storage: 'Any clean container.' },
      hazards: { ghs: [], nfpa: { health: 0, flammability: 0, reactivity: 0 }, signalWord: 'None' },
      tags: ['solvent', 'universal', 'amphiprotic', 'reference']
    },

    hydrogen_peroxide: {
      id: 'hydrogen_peroxide', name: 'Hydrogen Peroxide', formula: 'H₂O₂', formulaPlain: 'H2O2',
      iupac: 'hydrogen peroxide',
      category: 'oxidiser', molarMass: 34.014, density: 1.450, state: 'liquid',
      densityNote: '100 % H₂O₂, 20 °C. Common lab reagent: 30 % w/w, ρ = 1.11 g·cm⁻³ (9.8 M).',
      appearance: 'Colourless, slightly viscous liquid with a faint sharp odour.',
      colorHex: '#EBF5FB',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -187.8,       // ΔfH°(H2O2, l)
      enthalpyFormationNote: 'ΔfH°(H₂O₂, aq) = −191.2 kJ·mol⁻¹.',
      solubility: { water: 'miscible in all proportions' },
      stockConcentration: { molarity: 9.8, percentWw: 30, label: '30 % w/w ("Perhydrol")' },
      reactivity: {
        water: 'miscible',
        decomposition: '2 H₂O₂ → 2 H₂O + O₂↑ (catalysed by MnO₂, catalase, Fe³⁺, light, heat)',
        oxidising: 'H₂O₂ + 2 H⁺ + 2 e⁻ → 2 H₂O  (E° = +1.78 V, acid)',
        reducing: 'O₂ + 2 H⁺ + 2 e⁻ → H₂O₂  (E° = +0.68 V, so H₂O₂ can also act as a reductant)',
        metals: 'decomposes violently with MnO₂, Ag, Pt (catalytic)',
        storage: 'Cool, dark, vented HDPE; stabilised with stannate or phosphate.'
      },
      hazards: { ghs: ['H272', 'H302', 'H315', 'H318', 'H335', 'H412'],
                 nfpa: { health: 3, flammability: 0, reactivity: 3, special: 'OX' }, signalWord: 'Danger' },
      tags: ['oxidiser', 'reducing-agent', 'bleach', 'catalyst-sensitive', 'amphoteric-redox']
    },

    ethanol: {
      id: 'ethanol', name: 'Ethanol', formula: 'C₂H₅OH', formulaPlain: 'C2H5OH',
      iupac: 'ethanol',
      category: 'solvent', molarMass: 46.069, density: 0.7893, state: 'liquid',
      densityNote: 'Absolute ethanol, 20 °C.',
      appearance: 'Clear colourless liquid with a characteristic odour.',
      colorHex: '#FDFEFE',
      flameColor: null,
      solutionColor: COLORLESS,
      enthalpyFormation: -277.7,       // ΔfH°(C2H5OH, l)
      enthalpyFormationNote: 'ΔfH°(C₂H₅OH, g) = −234.8 kJ·mol⁻¹. ΔHcomb = −1366.8 kJ·mol⁻¹.',
      solubility: { water: 'miscible in all proportions (exothermic contraction)' },
      reactivity: { water: 'miscible', oxidisers: 'K₂Cr₂O₇/H⁺ → acetaldehyde → acetic acid (green Cr³⁺)', alkaliMetals: 'liberates H₂', esterification: 'with acetic acid (Fischer)', storage: 'Flameproof cabinet.' },
      hazards: { ghs: ['H225', 'H319', 'H335'], nfpa: { health: 2, flammability: 3, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['solvent', 'organic', 'flammable', 'fuel', 'polar-protic']
    },

    /* ======================================================================
     * 5.14 — GASES
     * ==================================================================== */
    hydrogen_gas: {
      id: 'hydrogen_gas', name: 'Hydrogen', formula: 'H₂', formulaPlain: 'H2',
      iupac: 'dihydrogen',
      category: 'gas', molarMass: 2.016, density: 0.00008988, state: 'gas',
      densityNote: '0.08988 g·L⁻¹ at 273.15 K, 101.325 kPa.',
      appearance: 'Colourless, odourless, tasteless gas — invisible flame.',
      colorHex: '#EAF2F8',
      flameColor: null,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'very slightly soluble — 0.00016 g/100 mL at 20 °C', note: 'Henry’s law constant ≈ 7.8 × 10⁻⁴ mol·L⁻¹·atm⁻¹.' },
      gasProperties: { molarVolumeL: 22.414, lighterThanAir: true, relativeDensityToAir: 0.0695, explosiveLimitsVolPercent: [4, 75] },
      reactivity: { oxygen: '2 H₂ + O₂ → 2 H₂O (ignites, ΔH = −572 kJ·mol⁻¹)', metals: 'forms hydrides with Na, Ca at elevated T', storage: 'Cylinder, non-sparking fittings.' },
      hazards: { ghs: ['H220', 'H280'], nfpa: { health: 0, flammability: 4, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['gas', 'fuel', 'reducing-agent', 'flammable', 'metal-acid-product']
    },

    oxygen_gas: {
      id: 'oxygen_gas', name: 'Oxygen', formula: 'O₂', formulaPlain: 'O2',
      iupac: 'dioxygen',
      category: 'gas', molarMass: 31.998, density: 0.001429, state: 'gas',
      densityNote: '1.429 g·L⁻¹ at 273.15 K, 101.325 kPa.',
      appearance: 'Colourless, odourless gas; pale blue as a liquid.',
      colorHex: '#D6EAF8',
      flameColor: null,
      solutionColor: null,
      enthalpyFormation: 0,
      solubility: { water: 'slightly soluble — 0.0043 g/100 mL at 20 °C', note: 'Dissolved O₂ (≈ 8.3 mg/L at 25 °C) drives aquatic corrosion and respiration.' },
      gasProperties: { molarVolumeL: 22.414, lighterThanAir: false, relativeDensityToAir: 1.105, supportsCombustion: true },
      reactivity: { metals: '4 Fe + 3 O₂ → 2 Fe₂O₃ (rusting)', nonmetals: 'S + O₂ → SO₂; C + O₂ → CO₂', organics: 'vigorous combustion', storage: 'Cylinder, oil-free fittings.' },
      hazards: { ghs: ['H270', 'H280'], nfpa: { health: 0, flammability: 0, reactivity: 0, special: 'OX' }, signalWord: 'Danger' },
      tags: ['gas', 'oxidiser', 'supports-combustion', 'decomposition-product']
    },

    carbon_dioxide: {
      id: 'carbon_dioxide', name: 'Carbon Dioxide', formula: 'CO₂', formulaPlain: 'CO2',
      iupac: 'carbon dioxide',
      category: 'gas', molarMass: 44.009, density: 0.001977, state: 'gas',
      densityNote: '1.977 g·L⁻¹ at 273.15 K, 101.325 kPa (sublimes at −78.5 °C).',
      appearance: 'Colourless, odourless gas; white "smoke" of dry ice in moist air.',
      colorHex: '#F4F6F7',
      flameColor: null,
      solutionColor: null,
      enthalpyFormation: -393.51,      // ΔfH°(CO2, g)
      enthalpyFormationNote: 'ΔfH°(CO₂, aq) = −413.8 kJ·mol⁻¹; ΔfH°(H₂CO₃, aq) = −699.65 kJ·mol⁻¹.',
      solubility: { water: 'moderately soluble — 0.145 g/100 mL at 25 °C', note: 'Forms carbonic acid: CO₂ + H₂O ⇌ H₂CO₃ (Ka1 = 4.3 × 10⁻⁷), giving pH ≈ 5.6 for air-equilibrated water.' },
      gasProperties: { molarVolumeL: 22.414, lighterThanAir: false, relativeDensityToAir: 1.53, extinguishesFlame: true },
      reactivity: { water: 'forms weak carbonic acid', bases: 'CO₂ + 2 OH⁻ → CO₃²⁻ + H₂O', limewater: 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O (milky)', storage: 'Cylinder.' },
      hazards: { ghs: ['H280', 'H331'], nfpa: { health: 2, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['gas', 'acidic-oxide', 'effervescence-product', 'combustion-product']
    },

    chlorine_gas: {
      id: 'chlorine_gas', name: 'Chlorine', formula: 'Cl₂', formulaPlain: 'Cl2',
      iupac: 'dichlorine',
      category: 'gas', molarMass: 70.90, density: 0.003214, state: 'gas',
      densityNote: '3.214 g·L⁻¹ at 273.15 K, 101.325 kPa.',
      appearance: 'Greenish-yellow gas with a characteristic irritating, suffocating odour.',
      colorHex: '#D4E157',
      flameColor: null,
      solutionColor: { name: 'Pale Yellow-Green', hex: '#D4E157', diluteHex: '#F0F8C8', visible: true,
                       note: 'Cl₂(aq) + H₂O ⇌ HCl + HOCl (disproportionation).' },
      enthalpyFormation: 0,            // ΔfH°(Cl2, g) = 0
      enthalpyFormationNote: 'ΔfH°(Cl⁻, aq) = −167.16 kJ·mol⁻¹.',
      solubility: { water: 'soluble — 0.63 g/100 mL at 20 °C (hydrolysis to HCl + HOCl)', note: 'Very soluble in alkali: Cl₂ + 2 NaOH → NaCl + NaOCl + H₂O.' },
      gasProperties: { molarVolumeL: 22.414, lighterThanAir: false, relativeDensityToAir: 2.48, toxic: true },
      reactivity: {
        water: 'disproportionates to HCl and HOCl',
        metals: '2 Na + Cl₂ → 2 NaCl; Fe + Cl₂ → FeCl₃ (with excess Cl₂)',
        hydrogen: 'H₂ + Cl₂ → 2 HCl (explosive in UV light)',
        organics: 'substitution and addition; forms explosive NCl₃ with NH₃',
        storage: 'Cylinder, dry, fume cupboard.'
      },
      hazards: { ghs: ['H270', 'H315', 'H319', 'H330', 'H335', 'H400'],
                 nfpa: { health: 4, flammability: 0, reactivity: 0, special: 'OX' }, signalWord: 'Danger' },
      tags: ['gas', 'oxidiser', 'toxic', 'halogen', 'disinfectant']
    },

    sulfur_dioxide: {
      id: 'sulfur_dioxide', name: 'Sulfur Dioxide', formula: 'SO₂', formulaPlain: 'SO2',
      iupac: 'sulfur dioxide',
      category: 'gas', molarMass: 64.066, density: 0.002628, state: 'gas',
      densityNote: '2.628 g·L⁻¹ at 273.15 K, 101.325 kPa.',
      appearance: 'Colourless gas with a sharp, choking, pungent odour.',
      colorHex: '#F9E79F',
      flameColor: null,
      solutionColor: null,
      enthalpyFormation: -296.81,      // ΔfH°(SO2, g)
      enthalpyFormationNote: 'ΔfH°(SO₂, aq) = −322.2 kJ·mol⁻¹.',
      solubility: { water: 'very soluble — 22.8 g/100 mL at 20 °C', note: 'Forms sulfurous acid: SO₂ + H₂O ⇌ H₂SO₃ (Ka1 = 1.4 × 10⁻²).' },
      gasProperties: { molarVolumeL: 22.414, lighterThanAir: false, relativeDensityToAir: 2.26, toxic: true },
      reactivity: { water: 'forms sulfurous acid', bases: 'SO₂ + 2 OH⁻ → SO₃²⁻ + H₂O', oxidisers: '2 SO₂ + O₂ ⇌ 2 SO₃ (V₂O₅ catalyst)', storage: 'Cylinder.' },
      hazards: { ghs: ['H314', 'H331', 'H335', 'H370', 'H400'],
                 nfpa: { health: 3, flammability: 0, reactivity: 0 }, signalWord: 'Danger' },
      tags: ['gas', 'acidic-oxide', 'reducing-agent', 'toxic', 'reducing-bleach']
    }
  };

  /* ==========================================================================
   * SECTION 6 — INDEXES & DERIVED LOOKUPS
   * ========================================================================== */
  const INDEX = {
    byId: {},
    byFormulaPlain: {},
    byCategory: {},
    byTag: {}
  };

  Object.keys(CHEMICALS).forEach(function (key) {
    const c = CHEMICALS[key];
    if (!c.id) { throw new Error('[ChemicalsDB] Chemical "' + key + '" missing id.'); }
    if (c.id !== key) { throw new Error('[ChemicalsDB] Key/id mismatch: "' + key + '" vs "' + c.id + '".'); }

    INDEX.byId[c.id] = c;

    if (c.formulaPlain) {
      const fk = c.formulaPlain.toUpperCase();
      if (!INDEX.byFormulaPlain[fk]) { INDEX.byFormulaPlain[fk] = []; }
      INDEX.byFormulaPlain[fk].push(c);
    }

    if (!INDEX.byCategory[c.category]) { INDEX.byCategory[c.category] = []; }
    INDEX.byCategory[c.category].push(c);

    (c.tags || []).forEach(function (t) {
      if (!INDEX.byTag[t]) { INDEX.byTag[t] = []; }
      INDEX.byTag[t].push(c);
    });
  });

  /* ==========================================================================
   * SECTION 7 — PUBLIC API
   * ========================================================================== */
  const API = {
    /* --- metadata --- */
    version: DB_VERSION,
    categories: CATEGORIES,
    solubilityRules: SOLUBILITY_RULES,
    ions: IONS,
    flameColors: FLAME_COLORS,
    precipitates: PRECIPITATES,
    chemicals: CHEMICALS,

    /* --------------------------------------------------------------------
     * get(id) -> chemical | undefined
     * ------------------------------------------------------------------ */
    get: function (id) {
      return INDEX.byId[id];
    },

    /* --------------------------------------------------------------------
     * has(id) -> boolean
     * ------------------------------------------------------------------ */
    has: function (id) {
      return Object.prototype.hasOwnProperty.call(INDEX.byId, id);
    },

    /* --------------------------------------------------------------------
     * all() -> chemical[]  (insertion order preserved)
     * ------------------------------------------------------------------ */
    all: function () {
      return Object.keys(INDEX.byId).map(function (k) { return INDEX.byId[k]; });
    },

    /* --------------------------------------------------------------------
     * byCategory(categoryId) -> chemical[]
     * ------------------------------------------------------------------ */
    byCategory: function (categoryId) {
      return INDEX.byCategory[categoryId] || [];
    },

    /* --------------------------------------------------------------------
     * byTag(tag) -> chemical[]
     * ------------------------------------------------------------------ */
    byTag: function (tag) {
      return INDEX.byTag[tag] || [];
    },

    /* --------------------------------------------------------------------
     * byFormula(formulaPlain) -> chemical[]   (case-insensitive)
     * ------------------------------------------------------------------ */
    byFormula: function (formulaPlain) {
      if (!formulaPlain) { return []; }
      return INDEX.byFormulaPlain[String(formulaPlain).toUpperCase()] || [];
    },

    /* --------------------------------------------------------------------
     * search(query) -> chemical[]
     * Free-text match over name, formula, formulaPlain, iupac, tags.
     * ------------------------------------------------------------------ */
    search: function (query) {
      if (!query) { return API.all(); }
      const q = String(query).trim().toLowerCase();
      return API.all().filter(function (c) {
        const haystack = [
          c.id, c.name, c.formula, c.formulaPlain, c.iupac,
          CATEGORIES[c.category] ? CATEGORIES[c.category].label : '',
          (c.tags || []).join(' ')
        ].join(' ').toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    },

    /* --------------------------------------------------------------------
     * getIon(symbol) -> ion | undefined
     * ------------------------------------------------------------------ */
    getIon: function (symbol) {
      return IONS[symbol];
    },

    /* --------------------------------------------------------------------
     * getIonColor(symbol) -> { name, hex, alpha?, ... } | null
     * ------------------------------------------------------------------ */
    getIonColor: function (symbol) {
      const ion = IONS[symbol];
      if (!ion || !ion.solutionColor || ion.solutionColor.visible === false) { return null; }
      return ion.solutionColor;
    },

    /* --------------------------------------------------------------------
     * getFlameColor(elementSymbol) -> flame color record | null
     * ------------------------------------------------------------------ */
    getFlameColor: function (elementSymbol) {
      if (!elementSymbol) { return null; }
      return FLAME_COLORS[elementSymbol] || null;
    },

    /* --------------------------------------------------------------------
     * getPrecipitate(formula) -> precipitate record | null
     * Accepts ASCII or pretty formula; normalises subscripts.
     * ------------------------------------------------------------------ */
    getPrecipitate: function (formula) {
      if (!formula) { return null; }
      if (PRECIPITATES[formula]) { return PRECIPITATES[formula]; }
      const normalised = API.normaliseFormula(formula);
      const keys = Object.keys(PRECIPITATES);
      for (let i = 0; i < keys.length; i++) {
        if (API.normaliseFormula(keys[i]) === normalised) { return PRECIPITATES[keys[i]]; }
      }
      return null;
    },

    /* --------------------------------------------------------------------
     * normaliseFormula(str)
     * 'CuSO4.5H2O' -> 'CUSO4.5H2O' ; strips pretty subscripts & whitespace.
     * ------------------------------------------------------------------ */
    normaliseFormula: function (str) {
      const SUBSCRIPTS = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9' };
      return String(str)
        .replace(/[₀-₉]/g, function (m) { return SUBSCRIPTS[m]; })
        .replace(/[·⋅∙•]/g, '.')
        .replace(/\s+/g, '')
        .toUpperCase();
    },

    /* --------------------------------------------------------------------
     * predictPrecipitate(cation, anion) -> precipitate record | null
     * Uses the rule set in SECTION 1 plus the Ksp table in SECTION 3.
     *   cation / anion: ion keys, e.g. 'Ag+', 'Cl-'
     * ------------------------------------------------------------------ */
    predictPrecipitate: function (cation, anion) {
      const A = IONS[cation];
      const B = IONS[anion];
      if (!A || !B) { return null; }

      /* Build the neutral formula by cross-multiplying charges. */
      const cCharge = Math.abs(A.charge);
      const aCharge = Math.abs(B.charge);
      const gcd = (function (x, y) { return y ? gcd(y, x % y) : x; })(cCharge, aCharge);
      const nCat = aCharge / gcd;
      const nAni = cCharge / gcd;

      const catCore = cation.replace(/[+-]\d*$/, '');
      const aniCore = anion.replace(/[+-]\d*$/, '');

      function wrap(core, n) {
        const needsParen = (core.length > 1 && /[A-Z].*[A-Z0-9]/.test(core)) || /[()]/.test(core);
        const body = n === 1 ? core : (needsParen ? '(' + core + ')' : core) + n;
        return body;
      }

      let formula = wrap(catCore, nCat) + wrap(aniCore, nAni);

      /* Direct hit on the precipitate table. */
      const direct = API.getPrecipitate(formula);
      if (direct) { return direct; }

      /* Chromate special case: CrO4^2- + Pb^2+ -> PbCrO4. */
      const alt = API.getPrecipitate(formula.replace('CRO4', 'CrO4'));
      if (alt) { return alt; }

      /* Hydroxide of a transition metal: prefer the M(OH)n form. */
      if (anion === 'OH-') {
        const hydrox = API.getPrecipitate(catCore + '(OH)' + (nAni > 1 ? nAni : ''));
        if (hydrox) { return hydrox; }
      }

      return null;
    },

    /* --------------------------------------------------------------------
     * isSoluble(id, temperatureC) -> boolean
     * Rule-based verdict for the DB entry; falls back to the rule text.
     * ------------------------------------------------------------------ */
    isSoluble: function (id) {
      const c = API.get(id);
      if (!c || !c.solubility) { return null; }
      const w = c.solubility.water;
      if (!w) { return null; }
      if (w === 'soluble' || w === 'very soluble' || w === 'miscible in all proportions' || w === 'miscible') { return true; }
      if (w === 'insoluble' || w === 'practically insoluble') { return false; }
      if (w === 'slightly soluble') { return false; }
      if (w === 'reacts' || w === 'reacts explosively' || w === 'very slow (surface film)') { return false; }
      return null;
    },

    /* --------------------------------------------------------------------
     * describeSolubility(id) -> human-readable string
     * ------------------------------------------------------------------ */
    describeSolubility: function (id) {
      const c = API.get(id);
      if (!c || !c.solubility) { return 'No solubility data.'; }
      const s = c.solubility;
      let out = 'Water: ' + s.water;
      if (s.gPer100mL) { out += ' (' + s.gPer100mL + ' g/100 mL'; }
      else if (s.gramsPer100mL) { out += ' (' + s.gramsPer100mL + ' g/100 mL'; }
      if (out.indexOf('(') !== -1) { out += ')'; }
      if (s.note) { out += ' — ' + s.note; }
      return out;
    },

    /* --------------------------------------------------------------------
     * ruleText(ruleId) -> string
     * ------------------------------------------------------------------ */
    ruleText: function (ruleId) {
      const r = SOLUBILITY_RULES[ruleId];
      return r ? r.statement : '';
    },

    /* --------------------------------------------------------------------
     * molarityToGramsPerLitre(id, M) -> g/L
     * ------------------------------------------------------------------ */
    molarityToGramsPerLitre: function (id, molarity) {
      const c = API.get(id);
      if (!c || !c.molarMass) { return null; }
      return c.molarMass * molarity;
    },

    /* --------------------------------------------------------------------
     * dilutionVolume(stockM, targetM, targetVolumeL) -> stock volume (L)
     * C1V1 = C2V2
     * ------------------------------------------------------------------ */
    dilutionVolume: function (stockM, targetM, targetVolumeL) {
      if (!stockM || !targetM || !targetVolumeL) { return null; }
      return (targetM * targetVolumeL) / stockM;
    },

    /* --------------------------------------------------------------------
     * dilutionDensity(id, stockM, targetM) -> density estimate (g/cm³)
     * Linear interpolation between pure solvent and the stock solution.
     * ------------------------------------------------------------------ */
    dilutionDensity: function (id, stockM, targetM) {
      const c = API.get(id);
      if (!c || !c.density) { return null; }
      const stock = (c.stockConcentration && c.stockConcentration.molarity) || stockM || 1;
      const frac = Math.max(0, Math.min(1, targetM / stock));
      const solventDensity = 0.99705; // water @ 25 °C
      return solventDensity + frac * (c.density - solventDensity);
    },

    /* --------------------------------------------------------------------
     * stats() -> summary counts
     * ------------------------------------------------------------------ */
    stats: function () {
      const byCat = {};
      Object.keys(INDEX.byCategory).forEach(function (k) { byCat[k] = INDEX.byCategory[k].length; });
      return {
        version: DB_VERSION,
        totalChemicals: API.all().length,
        totalIons: Object.keys(IONS).length,
        totalPrecipitates: Object.keys(PRECIPITATES).length,
        totalSolubilityRules: Object.keys(SOLUBILITY_RULES).length,
        byCategory: byCat
      };
    }
  };

  /* Freeze the deeply-nested public tables to enforce the data contract. */
  Object.freeze(IONS);
  Object.freeze(FLAME_COLORS);
  Object.freeze(PRECIPITATES);
  Object.freeze(SOLUBILITY_RULES);
  Object.freeze(CATEGORIES);

  /* ==========================================================================
   * SECTION 8 — BIND TO GLOBAL
   * ========================================================================== */
  global.ChemicalsDB = API;

  /* Boot log (silent in non-console environments). */
  if (global.console && console.log) {
    const s = API.stats();
    console.log(
      '%c[VirtuaLab Pro] ChemicalsDB v' + s.version + ' loaded — ' +
      s.totalChemicals + ' reagents, ' + s.totalIons + ' ions, ' +
      s.totalPrecipitates + ' precipitates, ' + s.totalSolubilityRules + ' solubility rules.',
      'color:#16A085;font-weight:bold;'
    );
  }

})(typeof window !== 'undefined' ? window : this);
