/* ============================================================================
 * VirtuaLab Pro — chemicals.js
 * ----------------------------------------------------------------------------
 * Academic chemical species database for the VirtuaLab Pro simulation engine.
 *
 * GLOBAL NAMESPACE : window.ChemicalsDB
 * SCHEMA VERSION   : 1.0
 *
 * FIELD REFERENCE (per species)
 * ----------------------------------------------------------------------------
 *  id                : String   — unique key (also the object key)
 *  name              : String   — IUPAC / common name
 *  formula           : String   — Unicode display formula (with subscripts)
 *  category          : String   — key into ChemicalsDB.categories
 *  molarMass         : Number   — g/mol
 *  density           : Number   — g/cm³ for solid|liquid|aqueous
 *                                 g/L  for gas (at STP, 273.15 K, 101.325 kPa)
 *  state             : String   — "solid" | "liquid" | "gas" | "aqueous"
 *  meltingPoint      : Number   — Kelvin (null if decomposes / N/A)
 *  boilingPoint      : Number   — Kelvin (null if decomposes / N/A)
 *  pH                : Number   — pH of a 0.1 mol/L aqueous solution at 298 K
 *                                 (null for non-aqueous / insoluble species)
 *  pHNote            : String   — qualifier for the pH value
 *  acidity           : String   — "strong acid" | "weak acid" | "neutral"
 *                                 "weak base" | "strong base" | "amphoteric"
 *                                 | "non-aqueous"
 *  solubility        : Number   — g per 100 mL pure water at 293 K
 *                                 or String: "miscible" | "insoluble"
 *                                 | "reacts" | "decomposes"
 *  enthalpyFormation : Number   — ΔH°f, kJ/mol (standard state, 298 K)
 *  specificHeat      : Number   — Cp, J/(g·K)
 *  flameColor        : String|null — characteristic flame-test emission
 *  color             : String   — hex swatch used by the canvas renderer
 *  hazards           : String[] — GHS-style hazard tags
 *  notes             : String   — didactic remark
 * ==========================================================================*/

window.ChemicalsDB = {

  version: "1.0.0",
  schema: "1.0",
  built: "2025-01-01",

  /* ------------------------------------------------------------------------
   * UNIT CONVENTIONS
   * ---------------------------------------------------------------------- */
  units: {
    molarMass: "g/mol",
    densityCondensed: "g/cm³",
    densityGas: "g/L @ STP",
    temperature: "K",
    pH: "0.1 M aqueous @ 298 K",
    solubility: "g/100 mL H₂O @ 293 K",
    enthalpyFormation: "kJ/mol",
    specificHeat: "J/(g·K)"
  },

  /* ------------------------------------------------------------------------
   * CATEGORY TAXONOMY
   * ---------------------------------------------------------------------- */
  categories: {
    element:    { label: "Elements",              icon: "⚛️",  accent: "#7dd3fc" },
    oxide:      { label: "Oxides",                icon: "🧱",  accent: "#fca5a5" },
    acid:       { label: "Acids",                 icon: "🧪",  accent: "#f87171" },
    base:       { label: "Bases & Hydroxides",    icon: "🧼",  accent: "#818cf8" },
    salt:       { label: "Salts",                 icon: "💎",  accent: "#a3e635" },
    solvent:    { label: "Solvents & Organics",   icon: "💧",  accent: "#38bdf8" },
    indicator:  { label: "Indicators",            icon: "🎨",  accent: "#c084fc" },
    catalyst:   { label: "Catalysts & Reagents",  icon: "⚗️",  accent: "#fbbf24" }
  },

  /* ========================================================================
   * SPECIES DATABASE
   * ====================================================================== */
  species: {

    /* ====================================================================
     * 1. ELEMENTS  (metals, non-metals, noble gases, halogens)
     * ==================================================================*/

    H2: {
      id: "H2", name: "Hydrogen", formula: "H₂", category: "element",
      molarMass: 2.016, density: 0.08988, state: "gas",
      meltingPoint: 13.99, boilingPoint: 20.27,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.00016, enthalpyFormation: 0, specificHeat: 14.31,
      flameColor: "pale blue (almost invisible in daylight)",
      color: "#e8f4ff", hazards: ["flammable", "asphyxiant"],
      notes: "Lightest element. Detonates with O₂ in a 2:1 ratio — the classic 'barking dog' demo."
    },

    O2: {
      id: "O2", name: "Oxygen", formula: "O₂", category: "element",
      molarMass: 31.998, density: 1.429, state: "gas",
      meltingPoint: 54.36, boilingPoint: 90.19,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.004, enthalpyFormation: 0, specificHeat: 0.918,
      flameColor: null,
      color: "#e6f7ff", hazards: ["oxidizer", "cryogenic as liquid"],
      notes: "Paramagnetic. Supports combustion but does not itself burn."
    },

    N2: {
      id: "N2", name: "Nitrogen", formula: "N₂", category: "element",
      molarMass: 28.014, density: 1.251, state: "gas",
      meltingPoint: 63.15, boilingPoint: 77.36,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.002, enthalpyFormation: 0, specificHeat: 1.040,
      flameColor: null,
      color: "#eef6ff", hazards: ["asphyxiant", "cryogenic as liquid"],
      notes: "Triple bond (941 kJ/mol) makes it kinetically inert despite being 78% of air."
    },

    Cl2: {
      id: "Cl2", name: "Chlorine", formula: "Cl₂", category: "element",
      molarMass: 70.906, density: 3.2, state: "gas",
      meltingPoint: 171.6, boilingPoint: 239.11,
      pH: 2.0, pHNote: "forms HCl/HOCl in water", acidity: "weak acid",
      solubility: 0.73, enthalpyFormation: 0, specificHeat: 0.479,
      flameColor: null,
      color: "#d9f26b", hazards: ["toxic", "oxidizer", "corrosive"],
      notes: "Yellow-green dense gas. Disproportionates in water: Cl₂ + H₂O ⇌ HCl + HOCl."
    },

    F2: {
      id: "F2", name: "Fluorine", formula: "F₂", category: "element",
      molarMass: 37.997, density: 1.696, state: "gas",
      meltingPoint: 53.53, boilingPoint: 85.03,
      pH: 1.5, pHNote: "forms HF in water", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.824,
      flameColor: null,
      color: "#f4f7a0", hazards: ["extremely toxic", "corrosive", "oxidizer"],
      notes: "Most electronegative element. Attacks glass, water and most metals on contact."
    },

    Br2: {
      id: "Br2", name: "Bromine", formula: "Br₂", category: "element",
      molarMass: 159.808, density: 3.1028, state: "liquid",
      meltingPoint: 265.8, boilingPoint: 332.0,
      pH: 2.5, pHNote: "forms HBr/HOBr in water", acidity: "weak acid",
      solubility: 3.41, enthalpyFormation: 0, specificHeat: 0.474,
      flameColor: null,
      color: "#8a2b1e", hazards: ["toxic", "corrosive", "volatile"],
      notes: "The only non-metal that is liquid at room temperature. Deep red-brown fuming liquid."
    },

    I2: {
      id: "I2", name: "Iodine", formula: "I₂", category: "element",
      molarMass: 253.809, density: 4.933, state: "solid",
      meltingPoint: 386.85, boilingPoint: 457.4,
      pH: null, pHNote: "non-aqueous solid", acidity: "neutral",
      solubility: 0.029, enthalpyFormation: 0, specificHeat: 0.214,
      flameColor: "violet vapour",
      color: "#4b0f4b", hazards: ["harmful", "staining"],
      notes: "Sublimes to a violet vapour; gives an intense blue-black complex with starch."
    },

    He: {
      id: "He", name: "Helium", formula: "He", category: "element",
      molarMass: 4.0026, density: 0.1786, state: "gas",
      meltingPoint: 0.95, boilingPoint: 4.22,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0009, enthalpyFormation: 0, specificHeat: 5.193,
      flameColor: "pale pink-white (discharge tube only)",
      color: "#f0f0ff", hazards: ["asphyxiant", "cryogenic as liquid"],
      notes: "Noble gas. Never solidifies at atmospheric pressure."
    },

    Ne: {
      id: "Ne", name: "Neon", formula: "Ne", category: "element",
      molarMass: 20.180, density: 0.9002, state: "gas",
      meltingPoint: 24.56, boilingPoint: 27.07,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0011, enthalpyFormation: 0, specificHeat: 1.030,
      flameColor: "orange-red (discharge tube only)",
      color: "#ff8c42", hazards: ["asphyxiant"],
      notes: "Glows characteristic orange-red in a low-pressure discharge tube."
    },

    Ar: {
      id: "Ar", name: "Argon", formula: "Ar", category: "element",
      molarMass: 39.948, density: 1.784, state: "gas",
      meltingPoint: 83.80, boilingPoint: 87.30,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0035, enthalpyFormation: 0, specificHeat: 0.520,
      flameColor: "lilac-violet (discharge tube only)",
      color: "#c8a2ff", hazards: ["asphyxiant", "cryogenic as liquid"],
      notes: "Most abundant noble gas in air (0.934%). Used as an inert blanket."
    },

    Kr: {
      id: "Kr", name: "Krypton", formula: "Kr", category: "element",
      molarMass: 83.798, density: 3.749, state: "gas",
      meltingPoint: 115.79, boilingPoint: 119.93,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.006, enthalpyFormation: 0, specificHeat: 0.248,
      flameColor: "greenish-yellow (discharge tube only)",
      color: "#d8ffe0", hazards: ["asphyxiant"],
      notes: "Forms a genuine (if unstable) compound with fluorine: KrF₂."
    },

    Xe: {
      id: "Xe", name: "Xenon", formula: "Xe", category: "element",
      molarMass: 131.293, density: 5.894, state: "gas",
      meltingPoint: 161.4, boilingPoint: 165.03,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.011, enthalpyFormation: 0, specificHeat: 0.158,
      flameColor: "blue-white (discharge tube only)",
      color: "#a0e0ff", hazards: ["asphyxiant"],
      notes: "Reacts with F₂ to give XeF₂, XeF₄ and XeF₆ — the classic noble-gas compounds."
    },

    Na: {
      id: "Na", name: "Sodium", formula: "Na", category: "element",
      molarMass: 22.990, density: 0.968, state: "solid",
      meltingPoint: 370.94, boilingPoint: 1156.0,
      pH: 14.0, pHNote: "forms NaOH on contact with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 1.228,
      flameColor: "intense golden yellow (589 nm D-line)",
      color: "#e8e8e8", hazards: ["water-reactive", "flammable", "corrosive"],
      notes: "Soft silvery metal stored under oil. Skitters and ignites on water."
    },

    K: {
      id: "K", name: "Potassium", formula: "K", category: "element",
      molarMass: 39.098, density: 0.862, state: "solid",
      meltingPoint: 336.53, boilingPoint: 1032.0,
      pH: 14.0, pHNote: "forms KOH on contact with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.757,
      flameColor: "lilac / pale violet",
      color: "#e0e0e0", hazards: ["water-reactive", "flammable", "corrosive"],
      notes: "More reactive than sodium — ignites immediately with a lilac flame."
    },

    Li: {
      id: "Li", name: "Lithium", formula: "Li", category: "element",
      molarMass: 6.94, density: 0.534, state: "solid",
      meltingPoint: 453.65, boilingPoint: 1615.0,
      pH: 13.5, pHNote: "forms LiOH on contact with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 3.582,
      flameColor: "crimson red",
      color: "#dcdcdc", hazards: ["water-reactive", "flammable", "corrosive"],
      notes: "Lightest metal; floats on water and fizzes steadily."
    },

    Rb: {
      id: "Rb", name: "Rubidium", formula: "Rb", category: "element",
      molarMass: 85.468, density: 1.532, state: "solid",
      meltingPoint: 312.46, boilingPoint: 961.0,
      pH: 14.0, pHNote: "forms RbOH on contact with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.363,
      flameColor: "red-violet",
      color: "#d8d8d8", hazards: ["water-reactive", "flammable", "corrosive"],
      notes: "Ignites spontaneously in air; reacts explosively with water."
    },

    Cs: {
      id: "Cs", name: "Caesium", formula: "Cs", category: "element",
      molarMass: 132.905, density: 1.93, state: "solid",
      meltingPoint: 301.59, boilingPoint: 944.0,
      pH: 14.0, pHNote: "forms CsOH on contact with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.242,
      flameColor: "blue-violet",
      color: "#d4d4d4", hazards: ["water-reactive", "pyrophoric", "corrosive"],
      notes: "Most reactive stable alkali metal; melts at 28.5 °C in the hand."
    },

    Ca: {
      id: "Ca", name: "Calcium", formula: "Ca", category: "element",
      molarMass: 40.078, density: 1.55, state: "solid",
      meltingPoint: 1115.0, boilingPoint: 1757.0,
      pH: 12.5, pHNote: "forms Ca(OH)₂ with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.647,
      flameColor: "brick red / orange-red",
      color: "#d0d0d0", hazards: ["water-reactive", "flammable"],
      notes: "Granules fizz in water producing H₂ and cloudy Ca(OH)₂."
    },

    Sr: {
      id: "Sr", name: "Strontium", formula: "Sr", category: "element",
      molarMass: 87.62, density: 2.64, state: "solid",
      meltingPoint: 1050.0, boilingPoint: 1655.0,
      pH: 12.5, pHNote: "forms Sr(OH)₂ with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.301,
      flameColor: "crimson scarlet",
      color: "#cccccc", hazards: ["water-reactive", "flammable"],
      notes: "The classic red firework colourant (SrCO₃ / Sr(NO₃)₂)."
    },

    Ba: {
      id: "Ba", name: "Barium", formula: "Ba", category: "element",
      molarMass: 137.327, density: 3.51, state: "solid",
      meltingPoint: 1000.0, boilingPoint: 2170.0,
      pH: 12.5, pHNote: "forms Ba(OH)₂ with water", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.204,
      flameColor: "apple green / pale green",
      color: "#c8c8c8", hazards: ["water-reactive", "toxic"],
      notes: "Soluble barium salts are toxic; BaSO₄ is safe due to insolubility."
    },

    Mg: {
      id: "Mg", name: "Magnesium", formula: "Mg", category: "element",
      molarMass: 24.305, density: 1.738, state: "solid",
      meltingPoint: 923.0, boilingPoint: 1363.0,
      pH: 10.5, pHNote: "forms Mg(OH)₂ slowly with water", acidity: "weak base",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 1.023,
      flameColor: "brilliant white (dazzling; UV-rich)",
      color: "#c4c4c4", hazards: ["flammable", "water-reactive (steam)"],
      notes: "Burns in air and even in CO₂. Never look directly at the flame."
    },

    Al: {
      id: "Al", name: "Aluminium", formula: "Al", category: "element",
      molarMass: 26.982, density: 2.70, state: "solid",
      meltingPoint: 933.47, boilingPoint: 2792.0,
      pH: 9.0, pHNote: "amphoteric oxide layer", acidity: "amphoteric",
      solubility: "reacts", enthalpyFormation: 0, specificHeat: 0.897,
      flameColor: "silvery-white sparks",
      color: "#c0c0c0", hazards: ["flammable powder"],
      notes: "Passivated by a tough Al₂O₃ layer — reacts with both acids and hot alkali."
    },

    Fe: {
      id: "Fe", name: "Iron", formula: "Fe", category: "element",
      molarMass: 55.845, density: 7.874, state: "solid",
      meltingPoint: 1811.0, boilingPoint: 3134.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.449,
      flameColor: "golden sparks",
      color: "#8c8c94", hazards: ["flammable dust"],
      notes: "Displaces copper from CuSO₄ solution; corrodes to rust in damp air."
    },

    Cu: {
      id: "Cu", name: "Copper", formula: "Cu", category: "element",
      molarMass: 63.546, density: 8.96, state: "solid",
      meltingPoint: 1357.77, boilingPoint: 2835.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.385,
      flameColor: "blue-green / emerald",
      color: "#b87333", hazards: ["harmful dust"],
      notes: "Only reacts with oxidising acids (HNO₃, hot conc. H₂SO₄)."
    },

    Zn: {
      id: "Zn", name: "Zinc", formula: "Zn", category: "element",
      molarMass: 65.38, density: 7.14, state: "solid",
      meltingPoint: 692.68, boilingPoint: 1180.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.388,
      flameColor: "pale blue-green",
      color: "#a8b0b8", hazards: ["flammable dust", "harmful fumes"],
      notes: "Amphoteric: dissolves in acid to Zn²⁺ and in alkali to [Zn(OH)₄]²⁻."
    },

    Pb: {
      id: "Pb", name: "Lead", formula: "Pb", category: "element",
      molarMass: 207.2, density: 11.34, state: "solid",
      meltingPoint: 600.61, boilingPoint: 2022.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.129,
      flameColor: "pale blue-white",
      color: "#6b6b73", hazards: ["toxic", "cumulative poison"],
      notes: "Dense, soft, low-melting. Forms a protective oxide patina."
    },

    Ag: {
      id: "Ag", name: "Silver", formula: "Ag", category: "element",
      molarMass: 107.868, density: 10.49, state: "solid",
      meltingPoint: 1234.93, boilingPoint: 2435.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.235,
      flameColor: null,
      color: "#c0c0c8", hazards: ["harmful dust"],
      notes: "Best electrical and thermal conductor of all metals."
    },

    Au: {
      id: "Au", name: "Gold", formula: "Au", category: "element",
      molarMass: 196.967, density: 19.30, state: "solid",
      meltingPoint: 1337.33, boilingPoint: 3129.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.129,
      flameColor: "gold",
      color: "#ffd700", hazards: ["harmful dust"],
      notes: "Noble metal; only dissolves in aqua regia (3 HCl : 1 HNO₃)."
    },

    Sn: {
      id: "Sn", name: "Tin", formula: "Sn", category: "element",
      molarMass: 118.710, density: 7.31, state: "solid",
      meltingPoint: 505.08, boilingPoint: 2875.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.228,
      flameColor: null,
      color: "#b0b0b8", hazards: ["harmful fumes"],
      notes: "Exhibits tin pest below 13.2 °C (white → grey allotrope)."
    },

    Ni: {
      id: "Ni", name: "Nickel", formula: "Ni", category: "element",
      molarMass: 58.693, density: 8.908, state: "solid",
      meltingPoint: 1728.0, boilingPoint: 3186.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.444,
      flameColor: null,
      color: "#9aa0a8", hazards: ["carcinogen", "sensitiser"],
      notes: "Hydrogenation catalyst and coinage metal."
    },

    Co: {
      id: "Co", name: "Cobalt", formula: "Co", category: "element",
      molarMass: 58.933, density: 8.90, state: "solid",
      meltingPoint: 1768.0, boilingPoint: 3200.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.421,
      flameColor: null,
      color: "#7a8a9a", hazards: ["carcinogen", "harmful"],
      notes: "Source of deep blue cobalt(II) silicate glass."
    },

    Mn: {
      id: "Mn", name: "Manganese", formula: "Mn", category: "element",
      molarMass: 54.938, density: 7.21, state: "solid",
      meltingPoint: 1519.0, boilingPoint: 2334.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.479,
      flameColor: "yellowish-green sparks",
      color: "#a0a0a8", hazards: ["harmful", "flammable dust"],
      notes: "Essential for steel desulfurisation; MnO₄⁻ is a powerful oxidant."
    },

    Cr: {
      id: "Cr", name: "Chromium", formula: "Cr", category: "element",
      molarMass: 51.996, density: 7.19, state: "solid",
      meltingPoint: 2180.0, boilingPoint: 2944.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.449,
      flameColor: null,
      color: "#b0b4bc", hazards: ["carcinogen (Cr VI)", "harmful"],
      notes: "Cr(VI) species are toxic and carcinogenic; Cr(III) is far safer."
    },

    Hg: {
      id: "Hg", name: "Mercury", formula: "Hg", category: "element",
      molarMass: 200.592, density: 13.534, state: "liquid",
      meltingPoint: 234.32, boilingPoint: 629.88,
      pH: null, pHNote: "non-aqueous liquid", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.140,
      flameColor: null,
      color: "#c8ccd4", hazards: ["neurotoxin", "volatile", "cumulative poison"],
      notes: "Only metal liquid at room temperature. Vapour is odourless and highly toxic."
    },

    Ti: {
      id: "Ti", name: "Titanium", formula: "Ti", category: "element",
      molarMass: 47.867, density: 4.506, state: "solid",
      meltingPoint: 1941.0, boilingPoint: 3560.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.523,
      flameColor: "bright white sparks",
      color: "#a8a8b0", hazards: ["flammable dust"],
      notes: "Excellent corrosion resistance from a passivating TiO₂ layer."
    },

    C_graphite: {
      id: "C_graphite", name: "Carbon (Graphite)", formula: "C", category: "element",
      molarMass: 12.011, density: 2.267, state: "solid",
      meltingPoint: 3823.0, boilingPoint: 4098.0,
      pH: null, pHNote: "insoluble solid", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.709,
      flameColor: "orange glow in excess O₂",
      color: "#1a1a1a", hazards: ["combustible dust"],
      notes: "Standard state of carbon. Conducts electricity along its layers."
    },

    S_rhombic: {
      id: "S_rhombic", name: "Sulfur (Rhombic)", formula: "S₈", category: "element",
      molarMass: 32.06, density: 2.07, state: "solid",
      meltingPoint: 388.36, boilingPoint: 717.8,
      pH: null, pHNote: "insoluble solid", acidity: "neutral",
      solubility: 0.00005, enthalpyFormation: 0, specificHeat: 0.710,
      flameColor: "blue, then bright yellow",
      color: "#e8d84a", hazards: ["irritant", "combustible"],
      notes: "Burns in air to SO₂; melts to a mobile yellow liquid then a viscous brown polymer."
    },

    P_red: {
      id: "P_red", name: "Phosphorus (Red)", formula: "P₄", category: "element",
      molarMass: 30.974, density: 2.34, state: "solid",
      meltingPoint: 862.15, boilingPoint: null,
      pH: null, pHNote: "insoluble solid", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: -17.6, specificHeat: 0.769,
      flameColor: "white (forms P₄O₁₀)",
      color: "#a02020", hazards: ["flammable", "irritant"],
      notes: "Safer allotrope than white phosphorus; used on matchbox striking surfaces."
    },

    Si: {
      id: "Si", name: "Silicon", formula: "Si", category: "element",
      molarMass: 28.085, density: 2.329, state: "solid",
      meltingPoint: 1687.0, boilingPoint: 3538.0,
      pH: null, pHNote: "insoluble solid", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.705,
      flameColor: null,
      color: "#5a5a66", hazards: ["irritant dust"],
      notes: "Semiconductor; forms a native SiO₂ layer in air."
    },

    B: {
      id: "B", name: "Boron", formula: "B", category: "element",
      molarMass: 10.81, density: 2.34, state: "solid",
      meltingPoint: 2349.0, boilingPoint: 4200.0,
      pH: null, pHNote: "insoluble solid", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 1.026,
      flameColor: "bright green",
      color: "#3a3a3a", hazards: ["irritant"],
      notes: "Green flame is diagnostic for boron compounds (e.g. borax bead test)."
    },

    /* ====================================================================
     * 2. OXIDES
     * ==================================================================*/

    Na2O: {
      id: "Na2O", name: "Sodium Oxide", formula: "Na₂O", category: "oxide",
      molarMass: 61.979, density: 2.27, state: "solid",
      meltingPoint: 1548.0, boilingPoint: null,
      pH: 14.0, pHNote: "forms NaOH quantitatively", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -414.2, specificHeat: 0.770,
      flameColor: "golden yellow (Na⁺)",
      color: "#f2f2f2", hazards: ["corrosive", "water-reactive"],
      notes: "Basic anhydride: Na₂O + H₂O → 2 NaOH, strongly exothermic."
    },

    MgO: {
      id: "MgO", name: "Magnesium Oxide", formula: "MgO", category: "oxide",
      molarMass: 40.304, density: 3.58, state: "solid",
      meltingPoint: 3125.0, boilingPoint: 3873.0,
      pH: 10.3, pHNote: "slightly soluble; forms Mg(OH)₂", acidity: "weak base",
      solubility: 0.0086, enthalpyFormation: -601.6, specificHeat: 0.923,
      flameColor: "brilliant white (Mg)",
      color: "#ffffff", hazards: ["irritant"],
      notes: "Refractory white powder; classic 'milk of magnesia' precursor."
    },

    Al2O3: {
      id: "Al2O3", name: "Aluminium Oxide", formula: "Al₂O₃", category: "oxide",
      molarMass: 101.961, density: 3.95, state: "solid",
      meltingPoint: 2345.0, boilingPoint: 3250.0,
      pH: 7.0, pHNote: "amphoteric; near-neutral slurry", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -1675.7, specificHeat: 0.779,
      flameColor: null,
      color: "#e8e8e8", hazards: ["irritant dust"],
      notes: "Corundum. Dissolves in both acid (Al³⁺) and base ([Al(OH)₄]⁻)."
    },

    SiO2: {
      id: "SiO2", name: "Silicon Dioxide (Silica)", formula: "SiO₂", category: "oxide",
      molarMass: 60.084, density: 2.648, state: "solid",
      meltingPoint: 1986.0, boilingPoint: 2950.0,
      pH: 6.5, pHNote: "essentially insoluble", acidity: "weak acid",
      solubility: "insoluble", enthalpyFormation: -910.9, specificHeat: 0.703,
      flameColor: null,
      color: "#e0e0e0", hazards: ["carcinogen (respirable dust)"],
      notes: "Acidic oxide; dissolves only in hot concentrated alkali or HF."
    },

    P4O10: {
      id: "P4O10", name: "Phosphorus Pentoxide", formula: "P₄O₁₀", category: "oxide",
      molarMass: 283.886, density: 2.39, state: "solid",
      meltingPoint: 613.0, boilingPoint: 633.0,
      pH: 1.5, pHNote: "forms H₃PO₄", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: -2984.0, specificHeat: 0.850,
      flameColor: null,
      color: "#f8f8f8", hazards: ["corrosive", "water-reactive", "desiccant"],
      notes: "Powerful dehydrating agent; hisses violently when added to water."
    },

    SO2: {
      id: "SO2", name: "Sulfur Dioxide", formula: "SO₂", category: "oxide",
      molarMass: 64.066, density: 2.628, state: "gas",
      meltingPoint: 197.69, boilingPoint: 263.13,
      pH: 2.9, pHNote: "forms H₂SO₃", acidity: "weak acid",
      solubility: 9.4, enthalpyFormation: -296.81, specificHeat: 0.640,
      flameColor: null,
      color: "#f0f0c0", hazards: ["toxic", "irritant", "corrosive to lungs"],
      notes: "Pungent, colourless gas. Primary cause of acid rain."
    },

    SO3: {
      id: "SO3", name: "Sulfur Trioxide", formula: "SO₃", category: "oxide",
      molarMass: 80.066, density: 1.92, state: "liquid",
      meltingPoint: 289.8, boilingPoint: 317.8,
      pH: 0.5, pHNote: "forms H₂SO₄", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: -395.7, specificHeat: 0.635,
      flameColor: null,
      color: "#f0f0e0", hazards: ["corrosive", "water-reactive", "toxic"],
      notes: "Contact-process intermediate; fumes in moist air to H₂SO₄ mist."
    },

    Cl2O7: {
      id: "Cl2O7", name: "Dichlorine Heptoxide", formula: "Cl₂O₇", category: "oxide",
      molarMass: 182.901, density: 1.90, state: "liquid",
      meltingPoint: 182.0, boilingPoint: 355.0,
      pH: 0.5, pHNote: "forms HClO₄", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: 272.0, specificHeat: 0.700,
      flameColor: null,
      color: "#f0f0e8", hazards: ["explosive", "strong oxidizer", "corrosive"],
      notes: "Anhydride of perchloric acid; dangerously shock-sensitive as a liquid."
    },

    CaO: {
      id: "CaO", name: "Calcium Oxide (Quicklime)", formula: "CaO", category: "oxide",
      molarMass: 56.077, density: 3.34, state: "solid",
      meltingPoint: 2886.0, boilingPoint: 3120.0,
      pH: 12.8, pHNote: "forms Ca(OH)₂", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -634.9, specificHeat: 0.750,
      flameColor: "brick red (Ca²⁺)",
      color: "#f4f4f4", hazards: ["corrosive", "water-reactive", "exothermic"],
      notes: "Slaking (CaO + H₂O → Ca(OH)₂) releases ~64 kJ/mol and can boil water."
    },

    Fe2O3: {
      id: "Fe2O3", name: "Iron(III) Oxide (Hematite)", formula: "Fe₂O₃", category: "oxide",
      molarMass: 159.688, density: 5.242, state: "solid",
      meltingPoint: 1838.0, boilingPoint: null,
      pH: 6.0, pHNote: "insoluble; slightly acidic surface", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -824.2, specificHeat: 0.650,
      flameColor: null,
      color: "#a03a20", hazards: ["irritant"],
      notes: "Red-brown rust. Amphoteric in strong alkali at high temperature."
    },

    Fe3O4: {
      id: "Fe3O4", name: "Iron(II,III) Oxide (Magnetite)", formula: "Fe₃O₄", category: "oxide",
      molarMass: 231.533, density: 5.17, state: "solid",
      meltingPoint: 1870.0, boilingPoint: null,
      pH: null, pHNote: "insoluble", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -1118.0, specificHeat: 0.670,
      flameColor: null,
      color: "#3a2a28", hazards: ["irritant"],
      notes: "Mixed-valence oxide; the only common strongly magnetic iron oxide."
    },

    CuO: {
      id: "CuO", name: "Copper(II) Oxide", formula: "CuO", category: "oxide",
      molarMass: 79.545, density: 6.315, state: "solid",
      meltingPoint: 1599.0, boilingPoint: null,
      pH: 7.5, pHNote: "insoluble; basic surface", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -157.3, specificHeat: 0.535,
      flameColor: "blue-green (Cu²⁺)",
      color: "#1a1a1a", hazards: ["harmful", "irritant"],
      notes: "Black powder; dissolves in dilute H₂SO₄ to give blue CuSO₄."
    },

    Cu2O: {
      id: "Cu2O", name: "Copper(I) Oxide", formula: "Cu₂O", category: "oxide",
      molarMass: 143.09, density: 6.0, state: "solid",
      meltingPoint: 1500.0, boilingPoint: null,
      pH: null, pHNote: "insoluble", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -170.7, specificHeat: 0.415,
      flameColor: "blue-green (Cu⁺)",
      color: "#b04020", hazards: ["harmful"],
      notes: "Red solid used in Fehling's test for reducing sugars."
    },

    ZnO: {
      id: "ZnO", name: "Zinc Oxide", formula: "ZnO", category: "oxide",
      molarMass: 81.38, density: 5.606, state: "solid",
      meltingPoint: 2247.0, boilingPoint: null,
      pH: 7.8, pHNote: "amphoteric, sparingly soluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -350.5, specificHeat: 0.494,
      flameColor: null,
      color: "#f8f8f0", hazards: ["irritant", "harmful fumes"],
      notes: "White powder; dissolves in acid AND alkali. Used in sunscreens."
    },

    PbO: {
      id: "PbO", name: "Lead(II) Oxide (Litharge)", formula: "PbO", category: "oxide",
      molarMass: 223.2, density: 9.53, state: "solid",
      meltingPoint: 1161.0, boilingPoint: null,
      pH: 8.5, pHNote: "slightly basic, sparingly soluble", acidity: "weak base",
      solubility: 0.0017, enthalpyFormation: -217.3, specificHeat: 0.210,
      flameColor: "pale blue-white (Pb²⁺)",
      color: "#c8a020", hazards: ["toxic", "cumulative poison"],
      notes: "Yellow-red oxide used in lead-acid battery plates and glazes."
    },

    PbO2: {
      id: "PbO2", name: "Lead(IV) Oxide", formula: "PbO₂", category: "oxide",
      molarMass: 239.198, density: 9.375, state: "solid",
      meltingPoint: 563.0, boilingPoint: null,
      pH: 6.0, pHNote: "amphoteric, insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -274.5, specificHeat: 0.280,
      flameColor: null,
      color: "#4a3020", hazards: ["toxic", "strong oxidizer"],
      notes: "Dark brown oxidant; the positive plate material in lead-acid cells."
    },

    Ag2O: {
      id: "Ag2O", name: "Silver(I) Oxide", formula: "Ag₂O", category: "oxide",
      molarMass: 231.735, density: 7.14, state: "solid",
      meltingPoint: 553.0, boilingPoint: null,
      pH: 10.5, pHNote: "slightly soluble, forms AgOH", acidity: "weak base",
      solubility: 0.0025, enthalpyFormation: -31.1, specificHeat: 0.310,
      flameColor: null,
      color: "#3a2a1a", hazards: ["oxidizer", "harmful", "light-sensitive"],
      notes: "Decomposes above 230 °C to metallic silver and O₂."
    },

    MnO2: {
      id: "MnO2", name: "Manganese(IV) Oxide (Pyrolusite)", formula: "MnO₂", category: "oxide",
      molarMass: 86.937, density: 5.026, state: "solid",
      meltingPoint: 808.0, boilingPoint: null,
      pH: null, pHNote: "insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -520.0, specificHeat: 0.545,
      flameColor: null,
      color: "#1a1a1a", hazards: ["harmful", "oxidizer", "neurotoxin (fumes)"],
      notes: "Classic catalyst for H₂O₂ decomposition and KClO₃ thermal decomposition."
    },

    Cr2O3: {
      id: "Cr2O3", name: "Chromium(III) Oxide", formula: "Cr₂O₃", category: "oxide",
      molarMass: 151.990, density: 5.22, state: "solid",
      meltingPoint: 2708.0, boilingPoint: null,
      pH: null, pHNote: "insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -1139.7, specificHeat: 0.600,
      flameColor: null,
      color: "#2a5a2a", hazards: ["harmful dust"],
      notes: "Green pigment 'chrome green'. Cr(III) is far less toxic than Cr(VI)."
    },

    TiO2: {
      id: "TiO2", name: "Titanium(IV) Oxide", formula: "TiO₂", category: "oxide",
      molarMass: 79.866, density: 4.23, state: "solid",
      meltingPoint: 2116.0, boilingPoint: null,
      pH: 6.8, pHNote: "insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -944.0, specificHeat: 0.690,
      flameColor: null,
      color: "#f8f8f8", hazards: ["nuisance dust"],
      notes: "Brilliant white pigment; photocatalytic under UV light."
    },

    CO: {
      id: "CO", name: "Carbon Monoxide", formula: "CO", category: "oxide",
      molarMass: 28.010, density: 1.145, state: "gas",
      meltingPoint: 68.15, boilingPoint: 81.65,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0028, enthalpyFormation: -110.53, specificHeat: 1.040,
      flameColor: "pale blue",
      color: "#e8e8e8", hazards: ["extremely toxic", "flammable", "odourless"],
      notes: "Binds haemoglobin ~240× more strongly than O₂ — silent killer."
    },

    CO2: {
      id: "CO2", name: "Carbon Dioxide", formula: "CO₂", category: "oxide",
      molarMass: 44.009, density: 1.977, state: "gas",
      meltingPoint: 216.55, boilingPoint: 194.7,
      pH: 3.9, pHNote: "forms H₂CO₃ in water", acidity: "weak acid",
      solubility: 0.145, enthalpyFormation: -393.51, specificHeat: 0.839,
      flameColor: null,
      color: "#e0e8e8", hazards: ["asphyxiant", "cryogenic as dry ice"],
      notes: "Sublimes at −78.5 °C. Turns limewater milky: Ca(OH)₂ + CO₂ → CaCO₃↓."
    },

    NO: {
      id: "NO", name: "Nitric Oxide", formula: "NO", category: "oxide",
      molarMass: 30.006, density: 1.340, state: "gas",
      meltingPoint: 109.66, boilingPoint: 121.40,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0056, enthalpyFormation: 90.29, specificHeat: 0.995,
      flameColor: null,
      color: "#d0d0d0", hazards: ["toxic", "oxidizer", "free radical"],
      notes: "Colourless radical; instantly oxidises in air to brown NO₂."
    },

    NO2: {
      id: "NO2", name: "Nitrogen Dioxide", formula: "NO₂", category: "oxide",
      molarMass: 46.006, density: 2.05, state: "gas",
      meltingPoint: 262.0, boilingPoint: 294.3,
      pH: 2.0, pHNote: "forms HNO₃/HNO₂", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: 33.18, specificHeat: 0.769,
      flameColor: null,
      color: "#b04020", hazards: ["toxic", "corrosive", "oxidizer"],
      notes: "Red-brown gas; dimerises reversibly to colourless N₂O₄."
    },

    N2O: {
      id: "N2O", name: "Nitrous Oxide (Laughing Gas)", formula: "N₂O", category: "oxide",
      molarMass: 44.013, density: 1.978, state: "gas",
      meltingPoint: 182.34, boilingPoint: 184.6,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.11, enthalpyFormation: 82.05, specificHeat: 0.879,
      flameColor: null,
      color: "#e0e0e0", hazards: ["oxidizer", "asphyxiant", "anaesthetic"],
      notes: "Supports combustion of a glowing splint almost as well as O₂."
    },

    N2O4: {
      id: "N2O4", name: "Dinitrogen Tetroxide", formula: "N₂O₄", category: "oxide",
      molarMass: 92.011, density: 1.443, state: "liquid",
      meltingPoint: 261.9, boilingPoint: 294.2,
      pH: 2.0, pHNote: "forms HNO₃/HNO₂", acidity: "strong acid",
      solubility: "reacts", enthalpyFormation: 9.16, specificHeat: 0.780,
      flameColor: null,
      color: "#c0a080", hazards: ["toxic", "corrosive", "oxidizer"],
      notes: "Colourless liquid in equilibrium with brown NO₂; rocket bipropellant oxidiser."
    },

    H2O2: {
      id: "H2O2", name: "Hydrogen Peroxide", formula: "H₂O₂", category: "oxide",
      molarMass: 34.014, density: 1.450, state: "liquid",
      meltingPoint: 272.74, boilingPoint: 423.35,
      pH: 5.0, pHNote: "weakly acidic (pKa 11.6)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -187.78, specificHeat: 2.629,
      flameColor: null,
      color: "#e0f0f0", hazards: ["oxidizer", "corrosive", "irritant"],
      notes: "Disproportionates: 2 H₂O₂ → 2 H₂O + O₂, catalysed by MnO₂, KI or catalase."
    },

    BaO: {
      id: "BaO", name: "Barium Oxide", formula: "BaO", category: "oxide",
      molarMass: 153.326, density: 5.72, state: "solid",
      meltingPoint: 2196.0, boilingPoint: null,
      pH: 13.0, pHNote: "forms Ba(OH)₂", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -548.0, specificHeat: 0.300,
      flameColor: "apple green (Ba²⁺)",
      color: "#f8f8f8", hazards: ["toxic", "corrosive", "water-reactive"],
      notes: "Used in the historic Brin process for producing oxygen from air."
    },

    SrO: {
      id: "SrO", name: "Strontium Oxide", formula: "SrO", category: "oxide",
      molarMass: 103.619, density: 4.70, state: "solid",
      meltingPoint: 2804.0, boilingPoint: null,
      pH: 12.8, pHNote: "forms Sr(OH)₂", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -592.0, specificHeat: 0.440,
      flameColor: "crimson scarlet (Sr²⁺)",
      color: "#f6f6f6", hazards: ["corrosive", "irritant"],
      notes: "Basic anhydride of strontium hydroxide."
    },

    Li2O: {
      id: "Li2O", name: "Lithium Oxide", formula: "Li₂O", category: "oxide",
      molarMass: 29.881, density: 2.013, state: "solid",
      meltingPoint: 1843.0, boilingPoint: null,
      pH: 13.5, pHNote: "forms LiOH", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -598.7, specificHeat: 1.810,
      flameColor: "crimson red (Li⁺)",
      color: "#f4f4f4", hazards: ["corrosive", "water-reactive"],
      notes: "Used in CO₂ scrubbers on spacecraft: Li₂O + CO₂ → Li₂CO₃."
    },

    K2O: {
      id: "K2O", name: "Potassium Oxide", formula: "K₂O", category: "oxide",
      molarMass: 94.196, density: 2.35, state: "solid",
      meltingPoint: 1013.0, boilingPoint: null,
      pH: 14.0, pHNote: "forms KOH", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -361.5, specificHeat: 0.870,
      flameColor: "lilac (K⁺)",
      color: "#f2f2f2", hazards: ["corrosive", "water-reactive"],
      notes: "Pale yellow solid; vigorous hydrolysis to KOH."
    },

    O3: {
      id: "O3", name: "Ozone", formula: "O₃", category: "oxide",
      molarMass: 47.998, density: 2.144, state: "gas",
      meltingPoint: 80.7, boilingPoint: 161.3,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.057, enthalpyFormation: 142.67, specificHeat: 0.820,
      flameColor: null,
      color: "#d0e8ff", hazards: ["toxic", "strong oxidizer", "explosive in liquid O₂"],
      notes: "Pale blue gas with a sharp smell; UV shield in the stratosphere."
    },

    /* ====================================================================
     * 3. ACIDS
     * ==================================================================*/

    HCl: {
      id: "HCl", name: "Hydrochloric Acid", formula: "HCl", category: "acid",
      molarMass: 36.461, density: 1.18, state: "aqueous",
      meltingPoint: 247.0, boilingPoint: 383.0,
      pH: 1.0, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -167.16, specificHeat: 3.470,
      flameColor: null,
      color: "#e8f4ff", hazards: ["corrosive", "toxic vapour", "irritant"],
      notes: "Strong monoprotic acid. Concentrated solution fumes in moist air."
    },

    HBr: {
      id: "HBr", name: "Hydrobromic Acid", formula: "HBr", category: "acid",
      molarMass: 80.912, density: 1.49, state: "aqueous",
      meltingPoint: 186.0, boilingPoint: 399.0,
      pH: 1.0, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -121.55, specificHeat: 0.900,
      flameColor: null,
      color: "#f0f0e8", hazards: ["corrosive", "toxic vapour"],
      notes: "Stronger reducing agent than HCl; readily oxidised to Br₂."
    },

    HI: {
      id: "HI", name: "Hydroiodic Acid", formula: "HI", category: "acid",
      molarMass: 127.904, density: 1.70, state: "aqueous",
      meltingPoint: 222.0, boilingPoint: 400.0,
      pH: 1.0, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -55.19, specificHeat: 0.230,
      flameColor: null,
      color: "#f4f0e0", hazards: ["corrosive", "toxic", "light-sensitive"],
      notes: "Strongest binary acid; powerful reducing agent (HI → I₂)."
    },

    HF: {
      id: "HF", name: "Hydrofluoric Acid", formula: "HF", category: "acid",
      molarMass: 20.006, density: 1.15, state: "aqueous",
      meltingPoint: 190.0, boilingPoint: 292.7,
      pH: 2.1, pHNote: "0.1 M, weak acid (pKa 3.17)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -335.35, specificHeat: 2.500,
      flameColor: null,
      color: "#eaf6ff", hazards: ["extremely corrosive", "systemic toxin", "etches glass"],
      notes: "Weak acid but viciously destructive — attacks glass and bone calcium."
    },

    H2SO4: {
      id: "H2SO4", name: "Sulfuric Acid", formula: "H₂SO₄", category: "acid",
      molarMass: 98.079, density: 1.84, state: "aqueous",
      meltingPoint: 283.5, boilingPoint: 610.0,
      pH: 0.5, pHNote: "0.1 M, fully dissociated (1st)", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -814.0, specificHeat: 1.340,
      flameColor: null,
      color: "#f2f0e0", hazards: ["corrosive", "dehydrating", "water-reactive"],
      notes: "Diprotic. Dilution is violently exothermic — ALWAYS add acid to water."
    },

    HNO3: {
      id: "HNO3", name: "Nitric Acid", formula: "HNO₃", category: "acid",
      molarMass: 63.012, density: 1.51, state: "aqueous",
      meltingPoint: 231.0, boilingPoint: 356.0,
      pH: 1.0, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -207.36, specificHeat: 1.720,
      flameColor: null,
      color: "#f8f4d0", hazards: ["corrosive", "strong oxidizer", "toxic fumes"],
      notes: "Oxidising acid. Concentrated HNO₃ passivates Al, Fe and Cr."
    },

    H3PO4: {
      id: "H3PO4", name: "Phosphoric Acid", formula: "H₃PO₄", category: "acid",
      molarMass: 97.994, density: 1.88, state: "aqueous",
      meltingPoint: 315.5, boilingPoint: 431.0,
      pH: 1.6, pHNote: "0.1 M, weak acid (pKa₁ 2.15)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -1284.4, specificHeat: 1.420,
      flameColor: null,
      color: "#f0f0e8", hazards: ["corrosive", "irritant"],
      notes: "Triprotic, non-oxidising. Key ingredient in cola and rust removers."
    },

    H2CO3: {
      id: "H2CO3", name: "Carbonic Acid", formula: "H₂CO₃", category: "acid",
      molarMass: 62.03, density: 1.0, state: "aqueous",
      meltingPoint: null, boilingPoint: null,
      pH: 4.5, pHNote: "saturated CO₂ solution", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -699.65, specificHeat: 2.000,
      flameColor: null,
      color: "#eef8ff", hazards: ["irritant"],
      notes: "Unstable; exists only in solution, decomposing to CO₂ + H₂O."
    },

    CH3COOH: {
      id: "CH3COOH", name: "Acetic Acid", formula: "CH₃COOH", category: "acid",
      molarMass: 60.052, density: 1.049, state: "liquid",
      meltingPoint: 289.8, boilingPoint: 391.2,
      pH: 2.9, pHNote: "0.1 M, weak acid (pKa 4.76)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -484.5, specificHeat: 2.050,
      flameColor: null,
      color: "#f4f8f0", hazards: ["corrosive (glacial)", "flammable", "irritant"],
      notes: "Glacial acetic acid freezes at 16.6 °C. Vinegar is ~5% v/v."
    },

    H2C2O4: {
      id: "H2C2O4", name: "Oxalic Acid", formula: "H₂C₂O₄", category: "acid",
      molarMass: 90.034, density: 1.90, state: "solid",
      meltingPoint: 462.0, boilingPoint: null,
      pH: 1.3, pHNote: "0.1 M, diprotic weak acid", acidity: "weak acid",
      solubility: 9.5, enthalpyFormation: -829.5, specificHeat: 1.280,
      flameColor: null,
      color: "#f8f8f8", hazards: ["toxic", "corrosive", "kidney toxin"],
      notes: "Dihydrate is the classic primary standard for NaOH titration."
    },

    HCOOH: {
      id: "HCOOH", name: "Formic Acid", formula: "HCOOH", category: "acid",
      molarMass: 46.025, density: 1.220, state: "liquid",
      meltingPoint: 281.4, boilingPoint: 374.0,
      pH: 2.4, pHNote: "0.1 M, weak acid (pKa 3.75)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -425.0, specificHeat: 2.150,
      flameColor: null,
      color: "#f6f6f0", hazards: ["corrosive", "toxic", "flammable"],
      notes: "The acid injected by ant stings. Also a useful reducing agent."
    },

    HClO4: {
      id: "HClO4", name: "Perchloric Acid", formula: "HClO₄", category: "acid",
      molarMass: 100.46, density: 1.768, state: "aqueous",
      meltingPoint: 229.0, boilingPoint: 476.0,
      pH: 0.3, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -40.6, specificHeat: 1.100,
      flameColor: null,
      color: "#f0f8f0", hazards: ["strong oxidizer", "explosive anhydrous", "corrosive"],
      notes: "Strongest common mineral acid; anhydrous form is shock-sensitive."
    },

    HClO3: {
      id: "HClO3", name: "Chloric Acid", formula: "HClO₃", category: "acid",
      molarMass: 84.46, density: 1.28, state: "aqueous",
      meltingPoint: null, boilingPoint: 313.0,
      pH: 0.7, pHNote: "0.1 M, fully dissociated", acidity: "strong acid",
      solubility: "miscible", enthalpyFormation: -96.0, specificHeat: 0.900,
      flameColor: null,
      color: "#f4f8e8", hazards: ["strong oxidizer", "explosive", "corrosive"],
      notes: "Unstable above 40 °C; disproportionates to HClO₄ and ClO₂."
    },

    HClO: {
      id: "HClO", name: "Hypochlorous Acid", formula: "HClO", category: "acid",
      molarMass: 52.46, density: 1.0, state: "aqueous",
      meltingPoint: null, boilingPoint: 398.0,
      pH: 4.5, pHNote: "0.1 M, weak acid (pKa 7.53)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -121.0, specificHeat: 1.000,
      flameColor: null,
      color: "#eefaf0", hazards: ["oxidizer", "irritant", "toxic with ammonia"],
      notes: "Active biocide in bleach solutions. NEVER mix bleach with ammonia."
    },

    H2S: {
      id: "H2S", name: "Hydrogen Sulfide", formula: "H₂S", category: "acid",
      molarMass: 34.08, density: 1.539, state: "gas",
      meltingPoint: 190.56, boilingPoint: 212.8,
      pH: 4.0, pHNote: "saturated aqueous solution", acidity: "weak acid",
      solubility: 0.4, enthalpyFormation: -20.6, specificHeat: 1.003,
      flameColor: "pale blue",
      color: "#e8f0e0", hazards: ["extremely toxic", "flammable", "olfactory fatigue"],
      notes: "Rotten-egg smell, but paralyzes the sense of smell above ~100 ppm."
    },

    HCN: {
      id: "HCN", name: "Hydrocyanic Acid", formula: "HCN", category: "acid",
      molarMass: 27.025, density: 0.687, state: "liquid",
      meltingPoint: 259.9, boilingPoint: 298.8,
      pH: 5.0, pHNote: "0.1 M, weak acid (pKa 9.21)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: 108.9, specificHeat: 1.330,
      flameColor: "pale blue",
      color: "#eef0e8", hazards: ["extremely toxic", "flammable", "cytochrome oxidase inhibitor"],
      notes: "Bitter-almond odour (not everyone can detect it). Blocks cellular respiration."
    },

    H2SO3: {
      id: "H2SO3", name: "Sulfurous Acid", formula: "H₂SO₃", category: "acid",
      molarMass: 82.07, density: 1.03, state: "aqueous",
      meltingPoint: null, boilingPoint: null,
      pH: 2.0, pHNote: "0.1 M, weak diprotic acid", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -608.8, specificHeat: 1.100,
      flameColor: null,
      color: "#f4f8e0", hazards: ["irritant", "toxic fumes"],
      notes: "Exists only in solution; a reducing agent and mild bleach."
    },

    HNO2: {
      id: "HNO2", name: "Nitrous Acid", formula: "HNO₂", category: "acid",
      molarMass: 47.013, density: 1.0, state: "aqueous",
      meltingPoint: 233.0, boilingPoint: null,
      pH: 2.2, pHNote: "0.1 M, weak acid (pKa 3.3)", acidity: "weak acid",
      solubility: "miscible", enthalpyFormation: -79.5, specificHeat: 1.000,
      flameColor: null,
      color: "#f8f4e0", hazards: ["oxidizer", "toxic", "unstable"],
      notes: "Generates nitrosyl ions; used in the diazotisation of aromatic amines."
    },

    H3BO3: {
      id: "H3BO3", name: "Boric Acid", formula: "H₃BO₃", category: "acid",
      molarMass: 61.83, density: 1.435, state: "solid",
      meltingPoint: 443.0, boilingPoint: null,
      pH: 5.1, pHNote: "0.1 M, very weak acid (pKa 9.24)", acidity: "weak acid",
      solubility: 5.7, enthalpyFormation: -1094.3, specificHeat: 1.090,
      flameColor: "bright green",
      color: "#ffffff", hazards: ["harmful", "reproductive toxin"],
      notes: "Antiseptic and buffering agent; green flame confirms boron."
    },

    C6H8O7: {
      id: "C6H8O7", name: "Citric Acid", formula: "C₆H₈O₇", category: "acid",
      molarMass: 192.124, density: 1.665, state: "solid",
      meltingPoint: 426.0, boilingPoint: null,
      pH: 2.2, pHNote: "0.1 M, triprotic weak acid", acidity: "weak acid",
      solubility: 59.2, enthalpyFormation: -1543.8, specificHeat: 1.100,
      flameColor: null,
      color: "#f8f8f0", hazards: ["irritant"],
      notes: "Triprotic; the sour taste of citrus fruit. Used as a buffer and chelator."
    },

    C4H6O6: {
      id: "C4H6O6", name: "Tartaric Acid", formula: "C₄H₆O₆", category: "acid",
      molarMass: 150.087, density: 1.79, state: "solid",
      meltingPoint: 444.0, boilingPoint: null,
      pH: 2.3, pHNote: "0.1 M, diprotic weak acid", acidity: "weak acid",
      solubility: 139.0, enthalpyFormation: -1300.0, specificHeat: 1.100,
      flameColor: null,
      color: "#f8f8f8", hazards: ["irritant"],
      notes: "Chiral; the two enantiomers are the classic resolution example."
    },

    H2SiO3: {
      id: "H2SiO3", name: "Silicic Acid", formula: "H₂SiO₃", category: "acid",
      molarMass: 78.10, density: 1.90, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 5.5, pHNote: "insoluble, weakly acidic", acidity: "weak acid",
      solubility: "insoluble", enthalpyFormation: -1188.0, specificHeat: 1.000,
      flameColor: null,
      color: "#f0f4f8", hazards: ["irritant"],
      notes: "Forms a gelatinous precipitate when acid is added to sodium silicate."
    },

    /* ====================================================================
     * 4. BASES & HYDROXIDES
     * ==================================================================*/

    NaOH: {
      id: "NaOH", name: "Sodium Hydroxide (Caustic Soda)", formula: "NaOH", category: "base",
      molarMass: 39.997, density: 2.13, state: "solid",
      meltingPoint: 591.0, boilingPoint: 1663.0,
      pH: 14.0, pHNote: "0.1 M, fully dissociated", acidity: "strong base",
      solubility: 109.0, enthalpyFormation: -425.6, specificHeat: 1.480,
      flameColor: "golden yellow (Na⁺)",
      color: "#f8f8f8", hazards: ["corrosive", "exothermic dissolution", "hygroscopic"],
      notes: "Deliquescent pellets. Dissolution is strongly exothermic — never add water to solid."
    },

    KOH: {
      id: "KOH", name: "Potassium Hydroxide (Caustic Potash)", formula: "KOH", category: "base",
      molarMass: 56.106, density: 2.12, state: "solid",
      meltingPoint: 406.0, boilingPoint: 1590.0,
      pH: 14.0, pHNote: "0.1 M, fully dissociated", acidity: "strong base",
      solubility: 121.0, enthalpyFormation: -424.8, specificHeat: 1.180,
      flameColor: "lilac (K⁺)",
      color: "#f6f6f6", hazards: ["corrosive", "hygroscopic"],
      notes: "Preferred over NaOH for ethanolic titrations (better solubility)."
    },

    LiOH: {
      id: "LiOH", name: "Lithium Hydroxide", formula: "LiOH", category: "base",
      molarMass: 23.95, density: 1.46, state: "solid",
      meltingPoint: 744.0, boilingPoint: 1626.0,
      pH: 13.8, pHNote: "0.1 M, fully dissociated", acidity: "strong base",
      solubility: 12.8, enthalpyFormation: -484.9, specificHeat: 2.070,
      flameColor: "crimson red (Li⁺)",
      color: "#f4f4f4", hazards: ["corrosive", "toxic"],
      notes: "Used in alkaline batteries and CO₂ scrubbers for spacecraft."
    },

    Ca_OH_2: {
      id: "Ca_OH_2", name: "Calcium Hydroxide (Slaked Lime)", formula: "Ca(OH)₂", category: "base",
      molarMass: 74.093, density: 2.211, state: "solid",
      meltingPoint: 853.0, boilingPoint: null,
      pH: 12.4, pHNote: "saturated solution (limewater)", acidity: "strong base",
      solubility: 0.173, enthalpyFormation: -986.1, specificHeat: 1.180,
      flameColor: "brick red (Ca²⁺)",
      color: "#fcfcfc", hazards: ["irritant", "corrosive to eyes"],
      notes: "Limewater turns milky with CO₂ — the classic test for carbon dioxide."
    },

    Mg_OH_2: {
      id: "Mg_OH_2", name: "Magnesium Hydroxide", formula: "Mg(OH)₂", category: "base",
      molarMass: 58.320, density: 2.344, state: "solid",
      meltingPoint: 623.0, boilingPoint: null,
      pH: 10.5, pHNote: "saturated solution", acidity: "weak base",
      solubility: 0.00064, enthalpyFormation: -924.5, specificHeat: 0.960,
      flameColor: null,
      color: "#fafafa", hazards: ["irritant"],
      notes: "Milk of magnesia. Low solubility makes it a gentle antacid and laxative."
    },

    Ba_OH_2: {
      id: "Ba_OH_2", name: "Barium Hydroxide", formula: "Ba(OH)₂", category: "base",
      molarMass: 171.342, density: 3.743, state: "solid",
      meltingPoint: 1058.0, boilingPoint: null,
      pH: 13.0, pHNote: "saturated solution", acidity: "strong base",
      solubility: 5.6, enthalpyFormation: -944.7, specificHeat: 0.850,
      flameColor: "apple green (Ba²⁺)",
      color: "#f8f8f8", hazards: ["toxic", "corrosive"],
      notes: "Octahydrate is a useful primary standard for weak-acid titrations."
    },

    Sr_OH_2: {
      id: "Sr_OH_2", name: "Strontium Hydroxide", formula: "Sr(OH)₂", category: "base",
      molarMass: 121.63, density: 3.625, state: "solid",
      meltingPoint: 808.0, boilingPoint: null,
      pH: 12.8, pHNote: "saturated solution", acidity: "strong base",
      solubility: 0.41, enthalpyFormation: -959.0, specificHeat: 0.700,
      flameColor: "crimson scarlet (Sr²⁺)",
      color: "#f6f6f6", hazards: ["corrosive", "irritant"],
      notes: "Solubility increases markedly with temperature — good recrystallisation demo."
    },

    Al_OH_3: {
      id: "Al_OH_3", name: "Aluminium Hydroxide", formula: "Al(OH)₃", category: "base",
      molarMass: 78.004, density: 2.42, state: "solid",
      meltingPoint: 573.0, boilingPoint: null,
      pH: 9.0, pHNote: "amphoteric, near-insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -1276.0, specificHeat: 0.900,
      flameColor: null,
      color: "#ffffff", hazards: ["irritant"],
      notes: "White gelatinous precipitate; dissolves in excess NaOH to form aluminate."
    },

    Fe_OH_3: {
      id: "Fe_OH_3", name: "Iron(III) Hydroxide", formula: "Fe(OH)₃", category: "base",
      molarMass: 106.867, density: 3.40, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 7.0, pHNote: "insoluble; Ksp ≈ 2.8×10⁻³⁹", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -823.0, specificHeat: 0.800,
      flameColor: null,
      color: "#7a3a10", hazards: ["irritant"],
      notes: "Red-brown gelatinous precipitate. Dehydrates on heating to Fe₂O₃."
    },

    Fe_OH_2: {
      id: "Fe_OH_2", name: "Iron(II) Hydroxide", formula: "Fe(OH)₂", category: "base",
      molarMass: 89.86, density: 3.40, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 8.0, pHNote: "insoluble; Ksp ≈ 8×10⁻¹⁶", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -569.0, specificHeat: 0.800,
      flameColor: null,
      color: "#3a6a3a", hazards: ["irritant", "air-sensitive"],
      notes: "Pale green precipitate that rapidly oxidises to brown Fe(OH)₃ in air."
    },

    Cu_OH_2: {
      id: "Cu_OH_2", name: "Copper(II) Hydroxide", formula: "Cu(OH)₂", category: "base",
      molarMass: 97.561, density: 3.368, state: "solid",
      meltingPoint: 353.0, boilingPoint: null,
      pH: 8.5, pHNote: "insoluble; Ksp ≈ 2.2×10⁻²⁰", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -449.8, specificHeat: 0.700,
      flameColor: "blue-green (Cu²⁺)",
      color: "#2a8aa8", hazards: ["harmful", "irritant"],
      notes: "Pale blue gelatinous precipitate; dissolves in excess ammonia to deep blue complex."
    },

    Zn_OH_2: {
      id: "Zn_OH_2", name: "Zinc Hydroxide", formula: "Zn(OH)₂", category: "base",
      molarMass: 99.398, density: 3.053, state: "solid",
      meltingPoint: 398.0, boilingPoint: null,
      pH: 8.0, pHNote: "amphoteric, insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -641.9, specificHeat: 0.700,
      flameColor: null,
      color: "#f4f4f4", hazards: ["irritant"],
      notes: "Dissolves in both acid and excess alkali — the classic amphoterism demo."
    },

    Ni_OH_2: {
      id: "Ni_OH_2", name: "Nickel(II) Hydroxide", formula: "Ni(OH)₂", category: "base",
      molarMass: 92.708, density: 4.10, state: "solid",
      meltingPoint: 503.0, boilingPoint: null,
      pH: 8.5, pHNote: "insoluble", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -538.0, specificHeat: 0.650,
      flameColor: null,
      color: "#5aa050", hazards: ["carcinogen", "sensitiser"],
      notes: "Apple-green precipitate; the active material in Ni-Cd battery cathodes."
    },

    Cr_OH_3: {
      id: "Cr_OH_3", name: "Chromium(III) Hydroxide", formula: "Cr(OH)₃", category: "base",
      molarMass: 103.02, density: 3.11, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 8.0, pHNote: "amphoteric, insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -1071.0, specificHeat: 0.700,
      flameColor: null,
      color: "#4a8a6a", hazards: ["irritant"],
      notes: "Grey-green precipitate; dissolves in excess NaOH to chromite [Cr(OH)₄]⁻."
    },

    Pb_OH_2: {
      id: "Pb_OH_2", name: "Lead(II) Hydroxide", formula: "Pb(OH)₂", category: "base",
      molarMass: 241.21, density: 7.41, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 8.5, pHNote: "amphoteric, insoluble", acidity: "amphoteric",
      solubility: "insoluble", enthalpyFormation: -515.0, specificHeat: 0.400,
      flameColor: "pale blue-white (Pb²⁺)",
      color: "#f0f0f0", hazards: ["toxic", "cumulative poison"],
      notes: "Dissolves in excess NaOH forming plumbite [Pb(OH)₄]²⁻."
    },

    Mn_OH_2: {
      id: "Mn_OH_2", name: "Manganese(II) Hydroxide", formula: "Mn(OH)₂", category: "base",
      molarMass: 88.95, density: 3.26, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 8.5, pHNote: "insoluble", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -695.0, specificHeat: 0.700,
      flameColor: null,
      color: "#d8c0a0", hazards: ["harmful"],
      notes: "Pale pink precipitate; darkens rapidly in air as Mn(III) forms."
    },

    AgOH: {
      id: "AgOH", name: "Silver Hydroxide", formula: "AgOH", category: "base",
      molarMass: 124.88, density: 3.60, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 9.5, pHNote: "unstable; decomposes to Ag₂O", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -124.0, specificHeat: 0.500,
      flameColor: null,
      color: "#e8e0c0", hazards: ["oxidizer", "harmful", "light-sensitive"],
      notes: "Not isolable as a pure solid; rapidly dehydrates to Ag₂O."
    },

    NH4OH: {
      id: "NH4OH", name: "Ammonium Hydroxide", formula: "NH₄OH", category: "base",
      molarMass: 35.046, density: 0.90, state: "aqueous",
      meltingPoint: 194.0, boilingPoint: 311.0,
      pH: 11.1, pHNote: "0.1 M, weak base (Kb 1.8×10⁻⁵)", acidity: "weak base",
      solubility: "miscible", enthalpyFormation: -366.1, specificHeat: 4.000,
      flameColor: null,
      color: "#eef8ff", hazards: ["corrosive", "toxic vapour", "irritant"],
      notes: "Actually a solution of NH₃ in water; the 'NH₄OH' species is largely notional."
    },

    NH3: {
      id: "NH3", name: "Ammonia", formula: "NH₃", category: "base",
      molarMass: 17.031, density: 0.769, state: "gas",
      meltingPoint: 195.4, boilingPoint: 239.8,
      pH: 11.1, pHNote: "aqueous solution, weak base", acidity: "weak base",
      solubility: 47.0, enthalpyFormation: -45.9, specificHeat: 2.060,
      flameColor: "pale yellow-green",
      color: "#e8f4e8", hazards: ["toxic", "corrosive", "flammable (limited)"],
      notes: "Very soluble in water (1 L water dissolves ~700 L NH₃ gas)."
    },

    /* ====================================================================
     * 5. SALTS
     * ==================================================================*/

    NaCl: {
      id: "NaCl", name: "Sodium Chloride", formula: "NaCl", category: "salt",
      molarMass: 58.443, density: 2.165, state: "solid",
      meltingPoint: 1074.0, boilingPoint: 1738.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 35.9, enthalpyFormation: -411.12, specificHeat: 0.864,
      flameColor: "intense golden yellow",
      color: "#f8f8f8", hazards: ["eye irritant"],
      notes: "Rock salt / table salt. Solubility barely changes with temperature."
    },

    KCl: {
      id: "KCl", name: "Potassium Chloride", formula: "KCl", category: "salt",
      molarMass: 74.551, density: 1.984, state: "solid",
      meltingPoint: 1046.0, boilingPoint: 1690.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 34.0, enthalpyFormation: -436.5, specificHeat: 0.690,
      flameColor: "lilac / pale violet",
      color: "#f6f6f6", hazards: ["irritant", "harmful in large doses"],
      notes: "Common pH-neutral salt bridge electrolyte and fertiliser (muriate of potash)."
    },

    KI: {
      id: "KI", name: "Potassium Iodide", formula: "KI", category: "salt",
      molarMass: 166.003, density: 3.13, state: "solid",
      meltingPoint: 954.0, boilingPoint: 1603.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 148.0, enthalpyFormation: -327.9, specificHeat: 0.402,
      flameColor: "violet (K⁺)",
      color: "#f4f4f4", hazards: ["irritant", "thyroid effects"],
      notes: "Gives a blue-black complex with starch — the iodometric titration indicator."
    },

    KBr: {
      id: "KBr", name: "Potassium Bromide", formula: "KBr", category: "salt",
      molarMass: 119.002, density: 2.74, state: "solid",
      meltingPoint: 1007.0, boilingPoint: 1670.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 67.8, enthalpyFormation: -393.8, specificHeat: 0.435,
      flameColor: "pale violet",
      color: "#f2f2f2", hazards: ["irritant"],
      notes: "Transparent in the IR; used for IR spectroscopy windows."
    },

    NaBr: {
      id: "NaBr", name: "Sodium Bromide", formula: "NaBr", category: "salt",
      molarMass: 102.894, density: 3.21, state: "solid",
      meltingPoint: 1020.0, boilingPoint: 1667.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 94.6, enthalpyFormation: -361.1, specificHeat: 0.500,
      flameColor: "golden yellow",
      color: "#f4f4f4", hazards: ["irritant"],
      notes: "Source of Br⁻ for the halogen displacement series (Cl₂ > Br₂ > I₂)."
    },

    NaF: {
      id: "NaF", name: "Sodium Fluoride", formula: "NaF", category: "salt",
      molarMass: 41.988, density: 2.558, state: "solid",
      meltingPoint: 1266.0, boilingPoint: 1973.0,
      pH: 8.0, pHNote: "hydrolyses to give basic solution", acidity: "weak base",
      solubility: 4.13, enthalpyFormation: -573.6, specificHeat: 1.110,
      flameColor: "golden yellow",
      color: "#f8f8f8", hazards: ["toxic", "corrosive"],
      notes: "Added to toothpaste (~0.1%) to harden tooth enamel via fluorapatite."
    },

    CaCl2: {
      id: "CaCl2", name: "Calcium Chloride", formula: "CaCl₂", category: "salt",
      molarMass: 110.98, density: 2.15, state: "solid",
      meltingPoint: 1045.0, boilingPoint: 2200.0,
      pH: 7.5, pHNote: "near-neutral", acidity: "neutral",
      solubility: 74.5, enthalpyFormation: -795.8, specificHeat: 0.687,
      flameColor: "brick red / orange-red",
      color: "#f8f8f8", hazards: ["irritant", "exothermic dissolution"],
      notes: "Strongly exothermic dissolution — the classic 'hot pack' salt."
    },

    MgCl2: {
      id: "MgCl2", name: "Magnesium Chloride", formula: "MgCl₂", category: "salt",
      molarMass: 95.211, density: 2.32, state: "solid",
      meltingPoint: 987.0, boilingPoint: 1685.0,
      pH: 7.0, pHNote: "slightly acidic in solution", acidity: "weak acid",
      solubility: 54.3, enthalpyFormation: -641.3, specificHeat: 0.844,
      flameColor: null,
      color: "#f8f8f8", hazards: ["irritant", "hygroscopic"],
      notes: "The deliquescent salt in road-salt and seawater. Dehydrates to MgOHCl on heating."
    },

    BaCl2: {
      id: "BaCl2", name: "Barium Chloride", formula: "BaCl₂", category: "salt",
      molarMass: 208.23, density: 3.856, state: "solid",
      meltingPoint: 1235.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 35.8, enthalpyFormation: -858.6, specificHeat: 0.455,
      flameColor: "pale green",
      color: "#f6f6f6", hazards: ["toxic", "harmful"],
      notes: "Reagent for the sulfate test: Ba²⁺ + SO₄²⁻ → BaSO₄↓ (white)."
    },

    AlCl3: {
      id: "AlCl3", name: "Aluminium Chloride", formula: "AlCl₃", category: "salt",
      molarMass: 133.34, density: 2.48, state: "solid",
      meltingPoint: 465.0, boilingPoint: 453.0,
      pH: 3.0, pHNote: "strongly acidic; hydrolyses", acidity: "weak acid",
      solubility: "reacts", enthalpyFormation: -704.2, specificHeat: 0.782,
      flameColor: null,
      color: "#e8e8f0", hazards: ["corrosive", "water-reactive", "fumes"],
      notes: "Sublimes at 180 °C. Powerful Lewis acid; Friedel-Crafts catalyst."
    },

    FeCl3: {
      id: "FeCl3", name: "Iron(III) Chloride", formula: "FeCl₃", category: "salt",
      molarMass: 162.204, density: 2.90, state: "solid",
      meltingPoint: 579.0, boilingPoint: 588.0,
      pH: 2.5, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 91.2, enthalpyFormation: -399.5, specificHeat: 0.670,
      flameColor: "golden sparks (Fe)",
      color: "#8a5a20", hazards: ["corrosive", "irritant", "staining"],
      notes: "Yellow-brown deliquescent solid. Gives a blood-red colour with thiocyanate."
    },

    FeCl2: {
      id: "FeCl2", name: "Iron(II) Chloride", formula: "FeCl₂", category: "salt",
      molarMass: 126.751, density: 3.16, state: "solid",
      meltingPoint: 950.0, boilingPoint: 1290.0,
      pH: 3.5, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 68.5, enthalpyFormation: -341.8, specificHeat: 0.650,
      flameColor: null,
      color: "#4a7a3a", hazards: ["irritant", "air-sensitive"],
      notes: "Pale green; oxidises readily in moist air to Fe(III)."
    },

    CuCl2: {
      id: "CuCl2", name: "Copper(II) Chloride", formula: "CuCl₂", category: "salt",
      molarMass: 134.45, density: 3.386, state: "solid",
      meltingPoint: 771.0, boilingPoint: null,
      pH: 3.5, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 75.5, enthalpyFormation: -205.9, specificHeat: 0.600,
      flameColor: "blue-green",
      color: "#2a8a6a", hazards: ["harmful", "irritant", "toxic to aquatic life"],
      notes: "Green anhydrous form, blue dihydrate. Catalyst in Wacker oxidation."
    },

    CuSO4: {
      id: "CuSO4", name: "Copper(II) Sulfate (Anhydrous)", formula: "CuSO₄", category: "salt",
      molarMass: 159.609, density: 3.60, state: "solid",
      meltingPoint: 833.0, boilingPoint: null,
      pH: 3.8, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 32.0, enthalpyFormation: -771.4, specificHeat: 0.630,
      flameColor: "blue-green",
      color: "#e8e8e8", hazards: ["harmful", "irritant", "toxic to aquatic life"],
      notes: "White anhydrous powder that turns bright blue on hydration — water test."
    },

    CuSO4_5H2O: {
      id: "CuSO4_5H2O", name: "Copper(II) Sulfate Pentahydrate (Blue Vitriol)", formula: "CuSO₄·5H₂O", category: "salt",
      molarMass: 249.685, density: 2.286, state: "solid",
      meltingPoint: 383.0, boilingPoint: null,
      pH: 3.8, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 31.6, enthalpyFormation: -2279.7, specificHeat: 0.800,
      flameColor: "blue-green",
      color: "#2050c0", hazards: ["harmful", "irritant", "toxic to aquatic life"],
      notes: "Loses water in four steps on heating; the iron displacement demo favourite."
    },

    FeSO4: {
      id: "FeSO4", name: "Iron(II) Sulfate (Green Vitriol)", formula: "FeSO₄", category: "salt",
      molarMass: 151.908, density: 3.65, state: "solid",
      meltingPoint: 680.0, boilingPoint: null,
      pH: 3.5, pHNote: "acidic due to hydrolysis", acidity: "weak acid",
      solubility: 25.6, enthalpyFormation: -928.4, specificHeat: 0.660,
      flameColor: null,
      color: "#7ab0c0", hazards: ["harmful", "irritant", "air-sensitive"],
      notes: "Pale blue-green; used in the classic 'ink' and photographic iron tests."
    },

    Fe2_SO4_3: {
      id: "Fe2_SO4_3", name: "Iron(III) Sulfate", formula: "Fe₂(SO₄)₃", category: "salt",
      molarMass: 399.88, density: 3.097, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 2.0, pHNote: "strongly acidic by hydrolysis", acidity: "weak acid",
      solubility: 44.0, enthalpyFormation: -2585.0, specificHeat: 0.700,
      flameColor: null,
      color: "#b87838", hazards: ["irritant", "corrosive in solution"],
      notes: "Used as a coagulant in water treatment."
    },

    ZnSO4: {
      id: "ZnSO4", name: "Zinc Sulfate", formula: "ZnSO₄", category: "salt",
      molarMass: 161.47, density: 3.54, state: "solid",
      meltingPoint: 953.0, boilingPoint: null,
      pH: 4.5, pHNote: "slightly acidic", acidity: "weak acid",
      solubility: 57.0, enthalpyFormation: -982.8, specificHeat: 0.650,
      flameColor: null,
      color: "#f4f4f4", hazards: ["harmful", "irritant", "toxic to aquatic life"],
      notes: "White vitriol. Used in the Daniell cell and as a zinc supplement."
    },

    MgSO4: {
      id: "MgSO4", name: "Magnesium Sulfate (Epsom Salt)", formula: "MgSO₄", category: "salt",
      molarMass: 120.366, density: 2.66, state: "solid",
      meltingPoint: 1397.0, boilingPoint: null,
      pH: 6.5, pHNote: "near-neutral", acidity: "neutral",
      solubility: 35.1, enthalpyFormation: -1284.9, specificHeat: 0.850,
      flameColor: null,
      color: "#fafafa", hazards: ["irritant"],
      notes: "Heptahydrate is Epsom salt. Exothermic hydration: MgSO₄ + 7H₂O → MgSO₄·7H₂O."
    },

    Na2SO4: {
      id: "Na2SO4", name: "Sodium Sulfate", formula: "Na₂SO₄", category: "salt",
      molarMass: 142.04, density: 2.664, state: "solid",
      meltingPoint: 1157.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 19.5, enthalpyFormation: -1387.1, specificHeat: 0.900,
      flameColor: "golden yellow",
      color: "#f8f8f8", hazards: ["irritant"],
      notes: "Glauber's salt (decahydrate) was used as a laxative and in solar storage."
    },

    K2SO4: {
      id: "K2SO4", name: "Potassium Sulfate", formula: "K₂SO₄", category: "salt",
      molarMass: 174.259, density: 2.66, state: "solid",
      meltingPoint: 1342.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 12.0, enthalpyFormation: -1437.8, specificHeat: 0.740,
      flameColor: "lilac",
      color: "#f6f6f6", hazards: ["irritant"],
      notes: "Sulfate of potash fertiliser; a good choice for chloride-sensitive crops."
    },

    CaSO4: {
      id: "CaSO4", name: "Calcium Sulfate (Gypsum)", formula: "CaSO₄", category: "salt",
      molarMass: 136.14, density: 2.96, state: "solid",
      meltingPoint: 1723.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral, sparingly soluble", acidity: "neutral",
      solubility: 0.24, enthalpyFormation: -1434.5, specificHeat: 0.730,
      flameColor: "brick red (Ca²⁺)",
      color: "#fcfcfc", hazards: ["irritant dust"],
      notes: "Dihydrate is gypsum; heating gives plaster of Paris (CaSO₄·½H₂O)."
    },

    BaSO4: {
      id: "BaSO4", name: "Barium Sulfate (Barite)", formula: "BaSO₄", category: "salt",
      molarMass: 233.39, density: 4.49, state: "solid",
      meltingPoint: 1853.0, boilingPoint: null,
      pH: 7.0, pHNote: "effectively insoluble; Ksp ≈ 1×10⁻¹⁰", acidity: "neutral",
      solubility: 0.00024, enthalpyFormation: -1473.2, specificHeat: 0.450,
      flameColor: "apple green (Ba²⁺)",
      color: "#fefefe", hazards: ["nuisance dust"],
      notes: "Insoluble, so non-toxic — used as a radiocontrast 'barium meal'."
    },

    PbSO4: {
      id: "PbSO4", name: "Lead(II) Sulfate", formula: "PbSO₄", category: "salt",
      molarMass: 303.26, density: 6.29, state: "solid",
      meltingPoint: 1350.0, boilingPoint: null,
      pH: 6.5, pHNote: "insoluble; Ksp ≈ 1.6×10⁻⁸", acidity: "neutral",
      solubility: 0.0041, enthalpyFormation: -919.9, specificHeat: 0.400,
      flameColor: null,
      color: "#f0f0e8", hazards: ["toxic", "cumulative poison"],
      notes: "White precipitate that coats lead-acid battery plates during discharge."
    },

    NH4_2SO4: {
      id: "NH4_2SO4", name: "Ammonium Sulfate", formula: "(NH₄)₂SO₄", category: "salt",
      molarMass: 132.14, density: 1.77, state: "solid",
      meltingPoint: 508.0, boilingPoint: null,
      pH: 5.5, pHNote: "slightly acidic", acidity: "weak acid",
      solubility: 76.4, enthalpyFormation: -1181.0, specificHeat: 1.400,
      flameColor: null,
      color: "#fafafa", hazards: ["irritant"],
      notes: "High-nitrogen fertiliser; classic salting-out agent for protein precipitation."
    },

    NaNO3: {
      id: "NaNO3", name: "Sodium Nitrate (Chile Saltpetre)", formula: "NaNO₃", category: "salt",
      molarMass: 84.995, density: 2.257, state: "solid",
      meltingPoint: 581.0, boilingPoint: 653.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 91.2, enthalpyFormation: -467.0, specificHeat: 0.930,
      flameColor: "intense golden yellow",
      color: "#f8f8f8", hazards: ["oxidizer", "irritant"],
      notes: "Molten NaNO₃/NANO₂ mixtures are used as heat-transfer fluids."
    },

    KNO3: {
      id: "KNO3", name: "Potassium Nitrate (Saltpetre)", formula: "KNO₃", category: "salt",
      molarMass: 101.103, density: 2.109, state: "solid",
      meltingPoint: 607.0, boilingPoint: 673.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 38.3, enthalpyFormation: -494.6, specificHeat: 0.950,
      flameColor: "lilac",
      color: "#f4f4f4", hazards: ["oxidizer", "irritant"],
      notes: "Classic oxidiser in black powder. Decomposes: 2 KNO₃ → 2 KNO₂ + O₂."
    },

    AgNO3: {
      id: "AgNO3", name: "Silver Nitrate (Lunar Caustic)", formula: "AgNO₃", category: "salt",
      molarMass: 169.87, density: 4.35, state: "solid",
      meltingPoint: 483.0, boilingPoint: 713.0,
      pH: 5.5, pHNote: "slightly acidic", acidity: "weak acid",
      solubility: 257.0, enthalpyFormation: -124.4, specificHeat: 0.600,
      flameColor: null,
      color: "#f4f4f4", hazards: ["corrosive", "oxidizer", "light-sensitive", "stains skin"],
      notes: "The standard reagent for halide tests (white AgCl, cream AgBr, yellow AgI)."
    },

    Pb_NO3_2: {
      id: "Pb_NO3_2", name: "Lead(II) Nitrate", formula: "Pb(NO₃)₂", category: "salt",
      molarMass: 331.2, density: 4.53, state: "solid",
      meltingPoint: 743.0, boilingPoint: null,
      pH: 4.5, pHNote: "acidic by hydrolysis", acidity: "weak acid",
      solubility: 56.5, enthalpyFormation: -451.7, specificHeat: 0.500,
      flameColor: null,
      color: "#f8f8f8", hazards: ["toxic", "oxidizer", "cumulative poison"],
      notes: "Water-soluble lead salt; used for the golden-rain precipitate with KI."
    },

    Cu_NO3_2: {
      id: "Cu_NO3_2", name: "Copper(II) Nitrate", formula: "Cu(NO₃)₂", category: "salt",
      molarMass: 187.556, density: 3.05, state: "solid",
      meltingPoint: 529.0, boilingPoint: null,
      pH: 3.5, pHNote: "acidic by hydrolysis", acidity: "weak acid",
      solubility: 145.0, enthalpyFormation: -302.9, specificHeat: 0.600,
      flameColor: "blue-green",
      color: "#2050c0", hazards: ["oxidizer", "harmful", "irritant"],
      notes: "Deep blue trihydrate; decomposes on heating to black CuO with brown NO₂ fumes."
    },

    Ca_NO3_2: {
      id: "Ca_NO3_2", name: "Calcium Nitrate", formula: "Ca(NO₃)₂", category: "salt",
      molarMass: 164.088, density: 2.50, state: "solid",
      meltingPoint: 834.0, boilingPoint: null,
      pH: 6.5, pHNote: "near-neutral", acidity: "neutral",
      solubility: 129.0, enthalpyFormation: -938.2, specificHeat: 0.800,
      flameColor: "brick red",
      color: "#f8f8f8", hazards: ["oxidizer", "irritant"],
      notes: "Highly soluble nitrate used in fertigation and as a concrete accelerator."
    },

    Ba_NO3_2: {
      id: "Ba_NO3_2", name: "Barium Nitrate", formula: "Ba(NO₃)₂", category: "salt",
      molarMass: 261.337, density: 3.24, state: "solid",
      meltingPoint: 863.0, boilingPoint: null,
      pH: 5.5, pHNote: "slightly acidic", acidity: "weak acid",
      solubility: 10.6, enthalpyFormation: -992.0, specificHeat: 0.500,
      flameColor: "apple green",
      color: "#f6f6f6", hazards: ["toxic", "oxidizer"],
      notes: "Green firework colourant; the oxidiser in 'green star' pyrotechnic compositions."
    },

    Na2CO3: {
      id: "Na2CO3", name: "Sodium Carbonate (Soda Ash)", formula: "Na₂CO₃", category: "salt",
      molarMass: 105.988, density: 2.54, state: "solid",
      meltingPoint: 1124.0, boilingPoint: null,
      pH: 11.5, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 21.5, enthalpyFormation: -1130.7, specificHeat: 1.100,
      flameColor: "golden yellow",
      color: "#fcfcfc", hazards: ["irritant", "corrosive to eyes"],
      notes: "Decahydrate is washing soda. Classic primary standard for acid titration."
    },

    K2CO3: {
      id: "K2CO3", name: "Potassium Carbonate (Potash)", formula: "K₂CO₃", category: "salt",
      molarMass: 138.205, density: 2.43, state: "solid",
      meltingPoint: 1174.0, boilingPoint: null,
      pH: 11.5, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 112.0, enthalpyFormation: -1151.0, specificHeat: 0.900,
      flameColor: "lilac",
      color: "#f8f8f8", hazards: ["irritant", "corrosive to eyes"],
      notes: "Very deliquescent; used in the historic 'potash' industry and in soaps."
    },

    CaCO3: {
      id: "CaCO3", name: "Calcium Carbonate (Limestone)", formula: "CaCO₃", category: "salt",
      molarMass: 100.086, density: 2.711, state: "solid",
      meltingPoint: 1173.0, boilingPoint: null,
      pH: 9.5, pHNote: "slurry; sparingly soluble", acidity: "weak base",
      solubility: 0.0013, enthalpyFormation: -1207.6, specificHeat: 0.830,
      flameColor: "brick red (Ca²⁺)",
      color: "#fcfcf8", hazards: ["nuisance dust"],
      notes: "Chalk, marble, calcite. Thermal decomposition: CaCO₃ → CaO + CO₂ (900 °C)."
    },

    NaHCO3: {
      id: "NaHCO3", name: "Sodium Bicarbonate (Baking Soda)", formula: "NaHCO₃", category: "salt",
      molarMass: 84.007, density: 2.20, state: "solid",
      meltingPoint: 333.0, boilingPoint: null,
      pH: 8.3, pHNote: "0.1 M, mildly basic", acidity: "amphoteric",
      solubility: 9.6, enthalpyFormation: -950.8, specificHeat: 0.880,
      flameColor: "golden yellow",
      color: "#fdfdfd", hazards: ["irritant"],
      notes: "Amphiprotic. Decomposes at 80 °C: 2 NaHCO₃ → Na₂CO₃ + H₂O + CO₂."
    },

    KHCO3: {
      id: "KHCO3", name: "Potassium Bicarbonate", formula: "KHCO₃", category: "salt",
      molarMass: 100.115, density: 2.17, state: "solid",
      meltingPoint: 373.0, boilingPoint: null,
      pH: 8.3, pHNote: "0.1 M, mildly basic", acidity: "amphoteric",
      solubility: 33.7, enthalpyFormation: -963.2, specificHeat: 0.900,
      flameColor: "lilac",
      color: "#fcfcfc", hazards: ["irritant"],
      notes: "Used in dialysis and as a CO₂ absorbent in breathing apparatus."
    },

    MgCO3: {
      id: "MgCO3", name: "Magnesium Carbonate (Magnesite)", formula: "MgCO₃", category: "salt",
      molarMass: 84.314, density: 2.958, state: "solid",
      meltingPoint: 623.0, boilingPoint: null,
      pH: 9.0, pHNote: "sparingly soluble, basic", acidity: "weak base",
      solubility: 0.039, enthalpyFormation: -1095.8, specificHeat: 0.890,
      flameColor: null,
      color: "#fafaf8", hazards: ["nuisance dust"],
      notes: "Decomposes at ~350 °C to MgO + CO₂."
    },

    BaCO3: {
      id: "BaCO3", name: "Barium Carbonate", formula: "BaCO₃", category: "salt",
      molarMass: 197.336, density: 4.286, state: "solid",
      meltingPoint: 1633.0, boilingPoint: null,
      pH: 8.5, pHNote: "nearly insoluble", acidity: "weak base",
      solubility: 0.0024, enthalpyFormation: -1216.3, specificHeat: 0.470,
      flameColor: "apple green",
      color: "#f8f8f4", hazards: ["toxic", "cumulative poison"],
      notes: "Used as a flux in glass and ceramics; toxic despite insolubility."
    },

    CuCO3: {
      id: "CuCO3", name: "Copper(II) Carbonate", formula: "CuCO₃", category: "salt",
      molarMass: 123.555, density: 3.90, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 1×10⁻¹⁰", acidity: "weak base",
      solubility: "insoluble", enthalpyFormation: -595.0, specificHeat: 0.600,
      flameColor: "blue-green",
      color: "#2a9a7a", hazards: ["harmful", "irritant"],
      notes: "Malachite (basic carbonate) turns black on heating to CuO."
    },

    Na3PO4: {
      id: "Na3PO4", name: "Trisodium Phosphate", formula: "Na₃PO₄", category: "salt",
      molarMass: 163.94, density: 2.536, state: "solid",
      meltingPoint: 1858.0, boilingPoint: null,
      pH: 12.0, pHNote: "0.1 M, strongly basic", acidity: "strong base",
      solubility: 12.1, enthalpyFormation: -1920.0, specificHeat: 0.800,
      flameColor: "golden yellow",
      color: "#fdfdfd", hazards: ["corrosive", "irritant", "eutrophication risk"],
      notes: "Heavy-duty cleaner and water softener; a serious aquatic pollutant."
    },

    Ca3_PO4_2: {
      id: "Ca3_PO4_2", name: "Calcium Phosphate", formula: "Ca₃(PO₄)₂", category: "salt",
      molarMass: 310.18, density: 3.14, state: "solid",
      meltingPoint: 1948.0, boilingPoint: null,
      pH: 7.5, pHNote: "insoluble; Ksp ≈ 2×10⁻²⁹", acidity: "weak base",
      solubility: 0.0002, enthalpyFormation: -4126.0, specificHeat: 0.700,
      flameColor: "brick red (Ca²⁺)",
      color: "#fdfdf8", hazards: ["nuisance dust"],
      notes: "The mineral component of bone and tooth enamel (as hydroxyapatite)."
    },

    KMnO4: {
      id: "KMnO4", name: "Potassium Permanganate", formula: "KMnO₄", category: "salt",
      molarMass: 158.034, density: 2.703, state: "solid",
      meltingPoint: 513.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral in pure water; purple solution", acidity: "neutral",
      solubility: 6.4, enthalpyFormation: -837.2, specificHeat: 0.720,
      flameColor: "violet (K⁺)",
      color: "#4a0a6a", hazards: ["strong oxidizer", "harmful", "stains skin"],
      notes: "Self-indicating redox titrant. Purple MnO₄⁻ → colourless Mn²⁺ in acid."
    },

    K2Cr2O7: {
      id: "K2Cr2O7", name: "Potassium Dichromate", formula: "K₂Cr₂O₇", category: "salt",
      molarMass: 294.185, density: 2.676, state: "solid",
      meltingPoint: 671.0, boilingPoint: null,
      pH: 4.0, pHNote: "acidic in solution", acidity: "weak acid",
      solubility: 12.5, enthalpyFormation: -2061.5, specificHeat: 0.700,
      flameColor: "lilac (K⁺)",
      color: "#e07020", hazards: ["carcinogen", "oxidizer", "toxic", "corrosive"],
      notes: "Primary standard oxidant. Cr(VI) is a confirmed human carcinogen."
    },

    K2CrO4: {
      id: "K2CrO4", name: "Potassium Chromate", formula: "K₂CrO₄", category: "salt",
      molarMass: 194.19, density: 2.732, state: "solid",
      meltingPoint: 1240.0, boilingPoint: null,
      pH: 9.0, pHNote: "basic by hydrolysis", acidity: "weak base",
      solubility: 62.9, enthalpyFormation: -1403.0, specificHeat: 0.700,
      flameColor: "lilac (K⁺)",
      color: "#f0d000", hazards: ["carcinogen", "oxidizer", "toxic"],
      notes: "Yellow chromate ⇌ orange dichromate equilibrium is pH-dependent."
    },

    Na2S2O3: {
      id: "Na2S2O3", name: "Sodium Thiosulfate", formula: "Na₂S₂O₃", category: "salt",
      molarMass: 158.11, density: 1.667, state: "solid",
      meltingPoint: 321.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 70.1, enthalpyFormation: -1124.4, specificHeat: 1.200,
      flameColor: "golden yellow",
      color: "#f8f8f8", hazards: ["irritant"],
      notes: "The classic iodine titrant: I₂ + 2 S₂O₃²⁻ → 2 I⁻ + S₄O₆²⁻. Also 'fixer' in photography."
    },

    KSCN: {
      id: "KSCN", name: "Potassium Thiocyanate", formula: "KSCN", category: "salt",
      molarMass: 97.181, density: 1.886, state: "solid",
      meltingPoint: 446.0, boilingPoint: 773.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 217.0, enthalpyFormation: -200.2, specificHeat: 0.900,
      flameColor: "lilac",
      color: "#f4f4f4", hazards: ["harmful", "irritant"],
      notes: "Blood-red colour with Fe³⁺ — the definitive iron(III) test."
    },

    Na2S: {
      id: "Na2S", name: "Sodium Sulfide", formula: "Na₂S", category: "salt",
      molarMass: 78.045, density: 1.856, state: "solid",
      meltingPoint: 1449.0, boilingPoint: null,
      pH: 12.5, pHNote: "0.1 M, strongly basic", acidity: "strong base",
      solubility: 18.6, enthalpyFormation: -373.2, specificHeat: 1.000,
      flameColor: "golden yellow",
      color: "#f0f0e8", hazards: ["corrosive", "toxic", "releases H₂S with acid"],
      notes: "Reacts with acids to release toxic H₂S — always work in a fume hood."
    },

    KCN: {
      id: "KCN", name: "Potassium Cyanide", formula: "KCN", category: "salt",
      molarMass: 65.116, density: 1.52, state: "solid",
      meltingPoint: 907.0, boilingPoint: null,
      pH: 11.0, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 71.6, enthalpyFormation: -113.0, specificHeat: 0.900,
      flameColor: null,
      color: "#f4f4f4", hazards: ["extremely toxic", "releases HCN with acid"],
      notes: "Lethal cytochrome oxidase inhibitor. NEVER acidify — HCN gas is generated."
    },

    CH3COONa: {
      id: "CH3COONa", name: "Sodium Acetate", formula: "CH₃COONa", category: "salt",
      molarMass: 82.034, density: 1.528, state: "solid",
      meltingPoint: 597.0, boilingPoint: null,
      pH: 8.9, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 123.0, enthalpyFormation: -708.8, specificHeat: 1.400,
      flameColor: "golden yellow",
      color: "#fafafa", hazards: ["irritant"],
      notes: "Sodium acetate trihydrate is the classic supercooling / heat-pack demo."
    },

    Na2C2O4: {
      id: "Na2C2O4", name: "Sodium Oxalate", formula: "Na₂C₂O₄", category: "salt",
      molarMass: 133.999, density: 2.27, state: "solid",
      meltingPoint: 523.0, boilingPoint: null,
      pH: 8.0, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 3.7, enthalpyFormation: -1313.0, specificHeat: 1.000,
      flameColor: "golden yellow",
      color: "#f8f8f8", hazards: ["toxic", "harmful"],
      notes: "Primary standard for permanganate standardisation."
    },

    AgCl: {
      id: "AgCl", name: "Silver Chloride", formula: "AgCl", category: "salt",
      molarMass: 143.32, density: 5.56, state: "solid",
      meltingPoint: 728.0, boilingPoint: 1827.0,
      pH: null, pHNote: "insoluble; Ksp ≈ 1.8×10⁻¹⁰", acidity: "neutral",
      solubility: 0.00019, enthalpyFormation: -127.0, specificHeat: 0.360,
      flameColor: null,
      color: "#fbfbfb", hazards: ["harmful", "light-sensitive"],
      notes: "White curdy precipitate; darkens to violet-grey in sunlight (photography)."
    },

    AgBr: {
      id: "AgBr", name: "Silver Bromide", formula: "AgBr", category: "salt",
      molarMass: 187.77, density: 6.473, state: "solid",
      meltingPoint: 700.0, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 5×10⁻¹³", acidity: "neutral",
      solubility: 0.000014, enthalpyFormation: -100.4, specificHeat: 0.300,
      flameColor: null,
      color: "#f2e8a8", hazards: ["harmful", "light-sensitive"],
      notes: "Cream-coloured precipitate; the primary light-sensitive agent in film."
    },

    AgI: {
      id: "AgI", name: "Silver Iodide", formula: "AgI", category: "salt",
      molarMass: 234.77, density: 5.675, state: "solid",
      meltingPoint: 831.0, boilingPoint: 1779.0,
      pH: null, pHNote: "insoluble; Ksp ≈ 8×10⁻¹⁷", acidity: "neutral",
      solubility: 0.0000003, enthalpyFormation: -61.8, specificHeat: 0.300,
      flameColor: null,
      color: "#f0e000", hazards: ["harmful", "light-sensitive"],
      notes: "Yellow precipitate; used in cloud seeding as an ice-nucleating agent."
    },

    NH4Cl: {
      id: "NH4Cl", name: "Ammonium Chloride (Sal Ammoniac)", formula: "NH₄Cl", category: "salt",
      molarMass: 53.491, density: 1.527, state: "solid",
      meltingPoint: 611.0, boilingPoint: null,
      pH: 5.5, pHNote: "0.1 M, acidic by hydrolysis", acidity: "weak acid",
      solubility: 29.7, enthalpyFormation: -314.4, specificHeat: 1.550,
      flameColor: null,
      color: "#fafafa", hazards: ["irritant", "harmful"],
      notes: "Sublimes/ dissociates into NH₃ + HCl on heating — endothermic, a cooling pack."
    },

    Na2SiO3: {
      id: "Na2SiO3", name: "Sodium Silicate (Water Glass)", formula: "Na₂SiO₃", category: "salt",
      molarMass: 122.06, density: 2.40, state: "solid",
      meltingPoint: 1361.0, boilingPoint: null,
      pH: 12.0, pHNote: "0.1 M, strongly basic", acidity: "strong base",
      solubility: 22.2, enthalpyFormation: -1561.0, specificHeat: 1.100,
      flameColor: "golden yellow",
      color: "#f0f4f8", hazards: ["corrosive", "irritant"],
      notes: "Added to acid gives the 'chemical garden' of silicate tubes."
    },

    K4_Fe_CN_6: {
      id: "K4_Fe_CN_6", name: "Potassium Hexacyanoferrate(II)", formula: "K₄[Fe(CN)₆]", category: "salt",
      molarMass: 368.35, density: 1.85, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 33.0, enthalpyFormation: -1060.0, specificHeat: 0.900,
      flameColor: "lilac",
      color: "#f0d000", hazards: ["irritant", "releases HCN with strong acid"],
      notes: "Yellow prussiate of potash. Gives Prussian blue with Fe³⁺."
    },

    Cu_CH3COO_2: {
      id: "Cu_CH3COO_2", name: "Copper(II) Acetate", formula: "Cu(CH₃COO)₂", category: "salt",
      molarMass: 181.63, density: 1.88, state: "solid",
      meltingPoint: 388.0, boilingPoint: null,
      pH: 5.0, pHNote: "slightly acidic", acidity: "weak acid",
      solubility: 7.2, enthalpyFormation: -880.0, specificHeat: 0.800,
      flameColor: "blue-green",
      color: "#1a5a5a", hazards: ["harmful", "irritant"],
      notes: "Dark green-blue 'verdigris'; the monohydrate dimer is a classic Cu-Cu bond example."
    },

    PbI2: {
      id: "PbI2", name: "Lead(II) Iodide", formula: "PbI₂", category: "salt",
      molarMass: 461.01, density: 6.16, state: "solid",
      meltingPoint: 675.0, boilingPoint: 1227.0,
      pH: null, pHNote: "insoluble; Ksp ≈ 7×10⁻⁹", acidity: "neutral",
      solubility: 0.0076, enthalpyFormation: -175.5, specificHeat: 0.400,
      flameColor: null,
      color: "#f0d000", hazards: ["toxic", "cumulative poison"],
      notes: "Brilliant yellow precipitate — the 'golden rain' demo. Recrystallises as golden plates."
    },

    PbCrO4: {
      id: "PbCrO4", name: "Lead(II) Chromate", formula: "PbCrO₄", category: "salt",
      molarMass: 323.19, density: 6.12, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 2×10⁻¹⁶", acidity: "neutral",
      solubility: 0.0000058, enthalpyFormation: -901.9, specificHeat: 0.400,
      flameColor: null,
      color: "#f0c000", hazards: ["carcinogen", "toxic", "oxidizer"],
      notes: "The pigment 'chrome yellow'; both ions are toxic."
    },

    BaCrO4: {
      id: "BaCrO4", name: "Barium Chromate", formula: "BaCrO₄", category: "salt",
      molarMass: 253.32, density: 4.50, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 1.2×10⁻¹⁰", acidity: "neutral",
      solubility: 0.00028, enthalpyFormation: -1348.0, specificHeat: 0.450,
      flameColor: "apple green",
      color: "#f0d000", hazards: ["carcinogen", "toxic", "oxidizer"],
      notes: "Lemon-yellow pigment; used in the classic chromate/dichromate equilibrium demo."
    },

    FeS: {
      id: "FeS", name: "Iron(II) Sulfide", formula: "FeS", category: "salt",
      molarMass: 87.91, density: 4.84, state: "solid",
      meltingPoint: 1466.0, boilingPoint: null,
      pH: null, pHNote: "insoluble", acidity: "weak base",
      solubility: 0.0006, enthalpyFormation: -100.0, specificHeat: 0.600,
      flameColor: null,
      color: "#2a2a2a", hazards: ["irritant", "releases H₂S with acid"],
      notes: "Black solid; the classic H₂S generator: FeS + 2 HCl → FeCl₂ + H₂S↑."
    },

    ZnS: {
      id: "ZnS", name: "Zinc Sulfide (Sphalerite)", formula: "ZnS", category: "salt",
      molarMass: 97.474, density: 4.09, state: "solid",
      meltingPoint: 1973.0, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 2×10⁻²⁵", acidity: "neutral",
      solubility: 0.00007, enthalpyFormation: -206.0, specificHeat: 0.500,
      flameColor: null,
      color: "#f8f8e0", hazards: ["irritant"],
      notes: "White precipitate in qualitative analysis; phosphorescent when doped with Ag or Cu."
    },

    CuS: {
      id: "CuS", name: "Copper(II) Sulfide (Covellite)", formula: "CuS", category: "salt",
      molarMass: 95.611, density: 4.60, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 6×10⁻³⁷", acidity: "neutral",
      solubility: 0.00003, enthalpyFormation: -53.1, specificHeat: 0.450,
      flameColor: null,
      color: "#161616", hazards: ["harmful", "irritant"],
      notes: "Black precipitate; insoluble even in dilute HCl, so it precipitates at low pH."
    },

    PbS: {
      id: "PbS", name: "Lead(II) Sulfide (Galena)", formula: "PbS", category: "salt",
      molarMass: 239.30, density: 7.60, state: "solid",
      meltingPoint: 1385.0, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 3×10⁻²⁸", acidity: "neutral",
      solubility: 0.00004, enthalpyFormation: -100.4, specificHeat: 0.400,
      flameColor: null,
      color: "#2a2a2a", hazards: ["toxic", "cumulative poison"],
      notes: "The principal ore of lead; a semiconductor with a narrow band gap."
    },

    Ag2S: {
      id: "Ag2S", name: "Silver(I) Sulfide (Argentite)", formula: "Ag₂S", category: "salt",
      molarMass: 247.80, density: 7.23, state: "solid",
      meltingPoint: 1113.0, boilingPoint: null,
      pH: null, pHNote: "insoluble; Ksp ≈ 6×10⁻⁵¹", acidity: "neutral",
      solubility: 0.0000006, enthalpyFormation: -32.6, specificHeat: 0.350,
      flameColor: null,
      color: "#1a1a1a", hazards: ["harmful", "irritant"],
      notes: "The black tarnish on silver exposed to H₂S."
    },

    CaC2: {
      id: "CaC2", name: "Calcium Carbide", formula: "CaC₂", category: "salt",
      molarMass: 64.099, density: 2.22, state: "solid",
      meltingPoint: 2160.0, boilingPoint: null,
      pH: 12.0, pHNote: "forms Ca(OH)₂ on hydrolysis", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -59.8, specificHeat: 0.700,
      flameColor: "brick red (Ca²⁺)",
      color: "#4a4a4a", hazards: ["water-reactive", "flammable gas evolved", "irritant"],
      notes: "CaC₂ + 2 H₂O → Ca(OH)₂ + C₂H₂↑. The classic carbide lamp reaction."
    },

    NaClO: {
      id: "NaClO", name: "Sodium Hypochlorite (Bleach)", formula: "NaClO", category: "salt",
      molarMass: 74.44, density: 1.11, state: "aqueous",
      meltingPoint: null, boilingPoint: 374.0,
      pH: 11.0, pHNote: "0.1 M, basic", acidity: "strong base",
      solubility: "miscible", enthalpyFormation: -347.1, specificHeat: 3.900,
      flameColor: "golden yellow",
      color: "#e8f8e0", hazards: ["corrosive", "oxidizer", "toxic with ammonia/acid"],
      notes: "Disproportionates in light and heat; never mix with acids or ammonia."
    },

    Ca_ClO_2: {
      id: "Ca_ClO_2", name: "Calcium Hypochlorite", formula: "Ca(ClO)₂", category: "salt",
      molarMass: 142.98, density: 2.35, state: "solid",
      meltingPoint: 373.0, boilingPoint: null,
      pH: 10.5, pHNote: "basic in solution", acidity: "strong base",
      solubility: 21.0, enthalpyFormation: -772.0, specificHeat: 1.000,
      flameColor: "brick red",
      color: "#f8f8e8", hazards: ["oxidizer", "corrosive", "flammable contact with organics"],
      notes: "Pool chlorine ('HTH'). Violent reactions with many organic materials."
    },

    Na2O2: {
      id: "Na2O2", name: "Sodium Peroxide", formula: "Na₂O₂", category: "salt",
      molarMass: 77.978, density: 2.805, state: "solid",
      meltingPoint: 948.0, boilingPoint: null,
      pH: 14.0, pHNote: "forms NaOH + H₂O₂ on hydrolysis", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -510.9, specificHeat: 0.900,
      flameColor: "golden yellow",
      color: "#f8f0e0", hazards: ["oxidizer", "corrosive", "water-reactive"],
      notes: "2 Na₂O₂ + 2 H₂O → 4 NaOH + O₂. Used in closed-circuit breathing apparatus."
    },

    KClO3: {
      id: "KClO3", name: "Potassium Chlorate", formula: "KClO₃", category: "salt",
      molarMass: 122.55, density: 2.32, state: "solid",
      meltingPoint: 629.0, boilingPoint: 673.0,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 8.6, enthalpyFormation: -397.7, specificHeat: 0.810,
      flameColor: "lilac",
      color: "#f4f4f4", hazards: ["strong oxidizer", "explosive with organics", "harmful"],
      notes: "Decomposes on heating with MnO₂ catalyst to give O₂ — the classic lab prep."
    },

    KIO3: {
      id: "KIO3", name: "Potassium Iodate", formula: "KIO₃", category: "salt",
      molarMass: 214.00, density: 3.89, state: "solid",
      meltingPoint: 833.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral salt", acidity: "neutral",
      solubility: 9.2, enthalpyFormation: -508.0, specificHeat: 0.700,
      flameColor: "lilac",
      color: "#f8f8f8", hazards: ["oxidizer", "irritant"],
      notes: "Primary standard oxidant for iodometric titrations; added to table salt."
    },

    Na2B4O7: {
      id: "Na2B4O7", name: "Sodium Tetraborate (Borax)", formula: "Na₂B₄O₇", category: "salt",
      molarMass: 381.37, density: 2.40, state: "solid",
      meltingPoint: 1015.0, boilingPoint: null,
      pH: 9.2, pHNote: "0.1 M, basic by hydrolysis", acidity: "weak base",
      solubility: 5.1, enthalpyFormation: -3291.0, specificHeat: 1.000,
      flameColor: "bright green (boron)",
      color: "#fcfcfc", hazards: ["reproductive toxin", "irritant"],
      notes: "Forms a borax bead that identifies metal ions by colour in the flame."
    },

    KAl_SO4_2_12H2O: {
      id: "KAl_SO4_2_12H2O", name: "Potassium Aluminium Sulfate (Alum)", formula: "KAl(SO₄)₂·12H₂O", category: "salt",
      molarMass: 474.39, density: 1.757, state: "solid",
      meltingPoint: 365.0, boilingPoint: null,
      pH: 3.5, pHNote: "0.1 M, acidic by hydrolysis", acidity: "weak acid",
      solubility: 14.0, enthalpyFormation: -6060.0, specificHeat: 1.200,
      flameColor: "lilac",
      color: "#fafafa", hazards: ["irritant"],
      notes: "Grows beautiful octahedral crystals; an astringent and mordant."
    },

    NH4_2Fe_SO4_2_6H2O: {
      id: "NH4_2Fe_SO4_2_6H2O", name: "Ammonium Iron(II) Sulfate (Mohr's Salt)", formula: "(NH₄)₂Fe(SO₄)₂·6H₂O", category: "salt",
      molarMass: 392.14, density: 1.86, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 4.0, pHNote: "0.1 M, acidic by hydrolysis", acidity: "weak acid",
      solubility: 26.9, enthalpyFormation: -3086.0, specificHeat: 1.100,
      flameColor: null,
      color: "#a8d0c0", hazards: ["irritant", "harmful"],
      notes: "Primary standard for KMnO₄. Far more resistant to air oxidation than FeSO₄."
    },

    /* ====================================================================
     * 6. SOLVENTS & ORGANICS
     * ==================================================================*/

    H2O: {
      id: "H2O", name: "Water (Distilled)", formula: "H₂O", category: "solvent",
      molarMass: 18.015, density: 0.9982, state: "liquid",
      meltingPoint: 273.15, boilingPoint: 373.15,
      pH: 7.0, pHNote: "neutral at 298 K", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -285.83, specificHeat: 4.184,
      flameColor: null,
      color: "#cfe8ff", hazards: [],
      notes: "The universal solvent. Anomalously high Cp, density maximum at 3.98 °C."
    },

    C2H5OH: {
      id: "C2H5OH", name: "Ethanol", formula: "C₂H₅OH", category: "solvent",
      molarMass: 46.068, density: 0.7893, state: "liquid",
      meltingPoint: 159.05, boilingPoint: 351.5,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -277.69, specificHeat: 2.440,
      flameColor: "pale blue",
      color: "#eef4ff", hazards: ["flammable", "harmful", "denaturant toxic"],
      notes: "95.6% azeotrope with water at 78.2 °C. Fermentation product."
    },

    CH3OH: {
      id: "CH3OH", name: "Methanol", formula: "CH₃OH", category: "solvent",
      molarMass: 32.042, density: 0.792, state: "liquid",
      meltingPoint: 175.5, boilingPoint: 337.8,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -239.1, specificHeat: 2.530,
      flameColor: "pale blue",
      color: "#f0f8ff", hazards: ["flammable", "toxic", "blindness risk"],
      notes: "Metabolises to formic acid — 30 mL can cause permanent blindness."
    },

    C3H8O: {
      id: "C3H8O", name: "Isopropanol (Propan-2-ol)", formula: "C₃H₈O", category: "solvent",
      molarMass: 60.096, density: 0.786, state: "liquid",
      meltingPoint: 184.5, boilingPoint: 355.5,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -318.1, specificHeat: 2.680,
      flameColor: "pale blue",
      color: "#eef6ff", hazards: ["flammable", "irritant", "harmful"],
      notes: "70% aqueous solution is the standard laboratory disinfectant."
    },

    C6H6: {
      id: "C6H6", name: "Benzene", formula: "C₆H₆", category: "solvent",
      molarMass: 78.11, density: 0.8765, state: "liquid",
      meltingPoint: 278.68, boilingPoint: 353.24,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.18, enthalpyFormation: 49.0, specificHeat: 1.740,
      flameColor: "sooty orange",
      color: "#f4f4e8", hazards: ["carcinogen", "flammable", "toxic", "mutagen"],
      notes: "Aromatic archetype. Confirmed leukaemogen — restricted in most labs."
    },

    C7H8: {
      id: "C7H8", name: "Toluene (Methylbenzene)", formula: "C₇H₈", category: "solvent",
      molarMass: 92.14, density: 0.867, state: "liquid",
      meltingPoint: 178.2, boilingPoint: 383.8,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.052, enthalpyFormation: 12.0, specificHeat: 1.710,
      flameColor: "sooty orange",
      color: "#f8f8f0", hazards: ["flammable", "harmful", "neurotoxic"],
      notes: "Safer aromatic solvent than benzene; used in the TNT synthesis chain."
    },

    C6H12: {
      id: "C6H12", name: "Cyclohexane", formula: "C₆H₁₂", category: "solvent",
      molarMass: 84.16, density: 0.779, state: "liquid",
      meltingPoint: 279.7, boilingPoint: 353.9,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.0055, enthalpyFormation: -156.4, specificHeat: 1.850,
      flameColor: "blue-orange",
      color: "#f4f8f0", hazards: ["flammable", "harmful", "aquatic toxin"],
      notes: "Exists in chair and boat conformations — the classic conformational analysis example."
    },

    C6H14: {
      id: "C6H14", name: "n-Hexane", formula: "C₆H₁₄", category: "solvent",
      molarMass: 86.18, density: 0.659, state: "liquid",
      meltingPoint: 177.8, boilingPoint: 341.9,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.0013, enthalpyFormation: -198.7, specificHeat: 2.260,
      flameColor: "blue-orange",
      color: "#f2f6e8", hazards: ["flammable", "neurotoxin", "aquatic toxin"],
      notes: "Common non-polar extraction solvent; chronic exposure causes peripheral neuropathy."
    },

    CHCl3: {
      id: "CHCl3", name: "Chloroform (Trichloromethane)", formula: "CHCl₃", category: "solvent",
      molarMass: 119.38, density: 1.489, state: "liquid",
      meltingPoint: 209.6, boilingPoint: 334.3,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.8, enthalpyFormation: -134.1, specificHeat: 0.960,
      flameColor: null,
      color: "#f0f4f0", hazards: ["carcinogen", "toxic", "anaesthetic", "ozone depleter"],
      notes: "Dense, non-flammable. Slowly forms toxic phosgene (COCl₂) in air and light."
    },

    CCl4: {
      id: "CCl4", name: "Carbon Tetrachloride", formula: "CCl₄", category: "solvent",
      molarMass: 153.82, density: 1.586, state: "liquid",
      meltingPoint: 250.2, boilingPoint: 349.9,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.08, enthalpyFormation: -135.4, specificHeat: 0.860,
      flameColor: null,
      color: "#f0f0f0", hazards: ["carcinogen", "hepatotoxin", "ozone depleter"],
      notes: "Non-flammable dense solvent; now banned in most jurisdictions."
    },

    CH2Cl2: {
      id: "CH2Cl2", name: "Dichloromethane", formula: "CH₂Cl₂", category: "solvent",
      molarMass: 84.93, density: 1.327, state: "liquid",
      meltingPoint: 178.0, boilingPoint: 313.0,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 1.3, enthalpyFormation: -124.2, specificHeat: 1.060,
      flameColor: null,
      color: "#f2f6f2", hazards: ["carcinogen suspect", "narcotic", "irritant"],
      notes: "Volatile, non-flammable. Used for caffeine extraction and in paint stripper."
    },

    CH3COCH3: {
      id: "CH3COCH3", name: "Acetone (Propanone)", formula: "CH₃COCH₃", category: "solvent",
      molarMass: 58.08, density: 0.7845, state: "liquid",
      meltingPoint: 178.5, boilingPoint: 329.2,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -248.1, specificHeat: 2.160,
      flameColor: "bright blue",
      color: "#f0f8f8", hazards: ["flammable", "irritant", "narcotic"],
      notes: "The simplest ketone and the standard keto–enol tautomerism example."
    },

    C2H5OC2H5: {
      id: "C2H5OC2H5", name: "Diethyl Ether", formula: "C₂H₅OC₂H₅", category: "solvent",
      molarMass: 74.12, density: 0.7134, state: "liquid",
      meltingPoint: 156.7, boilingPoint: 307.6,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 6.9, enthalpyFormation: -271.2, specificHeat: 2.210,
      flameColor: "blue-orange",
      color: "#f6f8f0", hazards: ["extremely flammable", "peroxide-forming", "narcotic"],
      notes: "Never distil to dryness — peroxides can detonate. Historic anaesthetic."
    },

    C6H5OH: {
      id: "C6H5OH", name: "Phenol (Carbolic Acid)", formula: "C₆H₅OH", category: "solvent",
      molarMass: 94.11, density: 1.07, state: "liquid",
      meltingPoint: 313.9, boilingPoint: 454.9,
      pH: 5.5, pHNote: "weakly acidic (pKa 9.95)", acidity: "weak acid",
      solubility: 8.3, enthalpyFormation: -165.0, specificHeat: 2.150,
      flameColor: "sooty orange",
      color: "#f4f0f8", hazards: ["toxic", "corrosive", "systemic poison"],
      notes: "Deliquescent crystals; the original surgical antiseptic (Lister, 1867)."
    },

    C6H5NH2: {
      id: "C6H5NH2", name: "Aniline (Phenylamine)", formula: "C₆H₅NH₂", category: "solvent",
      molarMass: 93.13, density: 1.0217, state: "liquid",
      meltingPoint: 267.13, boilingPoint: 457.6,
      pH: 8.8, pHNote: "weak base (Kb 4.3×10⁻¹⁰)", acidity: "weak base",
      solubility: 3.4, enthalpyFormation: 31.3, specificHeat: 2.180,
      flameColor: "sooty orange",
      color: "#f0e8e0", hazards: ["toxic", "carcinogen", "methaemoglobinaemia"],
      notes: "Oily, brownish liquid. Precursor to polyurethane and many dyes."
    },

    C6H12O6: {
      id: "C6H12O6", name: "Glucose (Dextrose)", formula: "C₆H₁₂O₆", category: "solvent",
      molarMass: 180.156, density: 1.54, state: "solid",
      meltingPoint: 419.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral solution", acidity: "neutral",
      solubility: 91.0, enthalpyFormation: -1274.4, specificHeat: 1.210,
      flameColor: null,
      color: "#fdfdf8", hazards: ["nuisance dust"],
      notes: "Reducing sugar; gives a brick-red precipitate with Fehling's or Benedict's."
    },

    C12H22O11: {
      id: "C12H22O11", name: "Sucrose (Table Sugar)", formula: "C₁₂H₂₂O₁₁", category: "solvent",
      molarMass: 342.30, density: 1.587, state: "solid",
      meltingPoint: 459.0, boilingPoint: null,
      pH: 7.0, pHNote: "neutral solution", acidity: "neutral",
      solubility: 200.0, enthalpyFormation: -2226.1, specificHeat: 1.240,
      flameColor: null,
      color: "#fdfdfd", hazards: ["nuisance dust"],
      notes: "Non-reducing disaccharide (glucose-α1↔2-fructose). Caramelises at ~170 °C."
    },

    C2H4: {
      id: "C2H4", name: "Ethene (Ethylene)", formula: "C₂H₄", category: "solvent",
      molarMass: 28.054, density: 1.178, state: "gas",
      meltingPoint: 104.0, boilingPoint: 169.4,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0131, enthalpyFormation: 52.4, specificHeat: 1.530,
      flameColor: "bright, slightly sooty",
      color: "#eef8ee", hazards: ["extremely flammable", "asphyxiant", "polymerisation risk"],
      notes: "The plant ripening hormone. Largest-volume organic petrochemical."
    },

    C2H2: {
      id: "C2H2", name: "Ethyne (Acetylene)", formula: "C₂H₂", category: "solvent",
      molarMass: 26.038, density: 1.097, state: "gas",
      meltingPoint: 192.4, boilingPoint: 189.0,
      pH: null, pHNote: "non-aqueous gas", acidity: "weak acid",
      solubility: 0.12, enthalpyFormation: 226.7, specificHeat: 1.690,
      flameColor: "brilliant white (oxy-acetylene ~3300 °C)",
      color: "#e8f4e8", hazards: ["extremely flammable", "explosive", "unstable above 15 bar"],
      notes: "Endothermic formation (ΔHf > 0) explains its spectacular flame temperature."
    },

    CH4: {
      id: "CH4", name: "Methane (Marsh Gas)", formula: "CH₄", category: "solvent",
      molarMass: 16.043, density: 0.657, state: "gas",
      meltingPoint: 90.7, boilingPoint: 111.7,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0022, enthalpyFormation: -74.6, specificHeat: 2.190,
      flameColor: "pale blue",
      color: "#eef6ee", hazards: ["extremely flammable", "asphyxiant", "greenhouse gas"],
      notes: "Natural gas. Ideal hydrocarbon for combustion enthalpy calculations."
    },

    C3H8: {
      id: "C3H8", name: "Propane", formula: "C₃H₈", category: "solvent",
      molarMass: 44.10, density: 1.882, state: "gas",
      meltingPoint: 85.5, boilingPoint: 231.1,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0062, enthalpyFormation: -104.7, specificHeat: 1.670,
      flameColor: "blue",
      color: "#f0f6ee", hazards: ["extremely flammable", "asphyxiant", "cryogenic as liquid"],
      notes: "LPG fuel; liquefies at only ~8 bar at room temperature."
    },

    C4H10: {
      id: "C4H10", name: "Butane", formula: "C₄H₁₀", category: "solvent",
      molarMass: 58.12, density: 2.48, state: "gas",
      meltingPoint: 134.7, boilingPoint: 272.7,
      pH: null, pHNote: "non-aqueous gas", acidity: "neutral",
      solubility: 0.0061, enthalpyFormation: -125.7, specificHeat: 1.710,
      flameColor: "blue",
      color: "#f2f8ee", hazards: ["extremely flammable", "asphyxiant"],
      notes: "Lighter fuel; boils at −0.5 °C so it escapes a lighter instantly."
    },

    C8H18: {
      id: "C8H18", name: "Octane", formula: "C₈H₁₈", category: "solvent",
      molarMass: 114.23, density: 0.703, state: "liquid",
      meltingPoint: 216.4, boilingPoint: 398.8,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: 0.0015, enthalpyFormation: -249.9, specificHeat: 2.230,
      flameColor: "orange-yellow",
      color: "#f6f8f2", hazards: ["flammable", "harmful", "aspiration hazard"],
      notes: "Defines the 100 point on the octane rating scale (iso-octane, 2,2,4-trimethylpentane)."
    },

    C2H6O2: {
      id: "C2H6O2", name: "Ethylene Glycol", formula: "C₂H₆O₂", category: "solvent",
      molarMass: 62.07, density: 1.1132, state: "liquid",
      meltingPoint: 260.2, boilingPoint: 470.2,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -455.0, specificHeat: 2.410,
      flameColor: "pale blue",
      color: "#f8f8f0", hazards: ["toxic", "nephrotoxin", "harmful"],
      notes: "Antifreeze. Metabolises to oxalic acid, which crystallises in the kidneys."
    },

    C3H8O3: {
      id: "C3H8O3", name: "Glycerol (Glycerine)", formula: "C₃H₈O₃", category: "solvent",
      molarMass: 92.09, density: 1.261, state: "liquid",
      meltingPoint: 291.3, boilingPoint: 563.0,
      pH: 7.0, pHNote: "neutral", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: -669.6, specificHeat: 2.430,
      flameColor: "pale yellow",
      color: "#fcfcf8", hazards: ["irritant"],
      notes: "Viscous, hygroscopic triol. By-product of soap saponification."
    },

    HCHO: {
      id: "HCHO", name: "Formaldehyde", formula: "HCHO", category: "solvent",
      molarMass: 30.026, density: 0.815, state: "gas",
      meltingPoint: 181.0, boilingPoint: 252.0,
      pH: 3.5, pHNote: "aqueous formalin (37%)", acidity: "weak acid",
      solubility: 55.0, enthalpyFormation: -108.6, specificHeat: 1.130,
      flameColor: null,
      color: "#eef8ee", hazards: ["carcinogen", "toxic", "irritant", "sensitiser"],
      notes: "'Formalin' is a 37% aqueous solution. Classic tissue fixative and a Group 1 carcinogen."
    },

    /* ====================================================================
     * 7. INDICATORS
     * ==================================================================*/

    Phenolphthalein: {
      id: "Phenolphthalein", name: "Phenolphthalein", formula: "C₂₀H₁₄O₄", category: "indicator",
      molarMass: 318.32, density: 1.30, state: "solid",
      meltingPoint: 536.0, boilingPoint: null,
      pH: 9.1, pHNote: "transition midpoint (range 8.2–10.0)", acidity: "weak acid",
      solubility: 0.0001, enthalpyFormation: -155.0, specificHeat: 1.100,
      flameColor: null,
      color: "#f4f0f4", hazards: ["irritant", "laxative at high dose"],
      notes: "COLOURLESS below pH 8.2 → MAGENTA above pH 10.0. Useless for weak bases."
    },

    MethylOrange: {
      id: "MethylOrange", name: "Methyl Orange", formula: "C₁₄H₁₄N₃NaO₃S", category: "indicator",
      molarMass: 327.33, density: 1.28, state: "solid",
      meltingPoint: 573.0, boilingPoint: null,
      pH: 3.7, pHNote: "transition midpoint (range 3.1–4.4)", acidity: "weak acid",
      solubility: 0.1, enthalpyFormation: -980.0, specificHeat: 1.000,
      flameColor: null,
      color: "#ff8c00", hazards: ["irritant", "harmful"],
      notes: "RED (acid) → YELLOW (base). Ideal for strong acid / strong base titrations."
    },

    MethylRed: {
      id: "MethylRed", name: "Methyl Red", formula: "C₁₅H₁₅N₃O₂", category: "indicator",
      molarMass: 269.30, density: 1.20, state: "solid",
      meltingPoint: 452.0, boilingPoint: null,
      pH: 5.1, pHNote: "transition midpoint (range 4.4–6.2)", acidity: "weak acid",
      solubility: 0.02, enthalpyFormation: -320.0, specificHeat: 1.000,
      flameColor: null,
      color: "#e00020", hazards: ["irritant", "harmful"],
      notes: "RED (acid) → YELLOW (base). Used for weak base / strong acid titrations."
    },

    BromothymolBlue: {
      id: "BromothymolBlue", name: "Bromothymol Blue", formula: "C₂₇H₂₈Br₂O₅S", category: "indicator",
      molarMass: 624.38, density: 1.25, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 6.8, pHNote: "transition midpoint (range 6.0–7.6)", acidity: "weak acid",
      solubility: 0.01, enthalpyFormation: -1420.0, specificHeat: 1.000,
      flameColor: null,
      color: "#1f6feb", hazards: ["irritant"],
      notes: "YELLOW (acid) → BLUE (base). Green at pH 7 — the classic neutral indicator."
    },

    Litmus: {
      id: "Litmus", name: "Litmus", formula: "C₁₈H₁₆N₂O₆S (approx.)", category: "indicator",
      molarMass: 330.0, density: 1.20, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 6.5, pHNote: "transition midpoint (range 4.5–8.3)", acidity: "weak acid",
      solubility: 0.01, enthalpyFormation: null, specificHeat: 1.000,
      flameColor: null,
      color: "#4a5ac8", hazards: ["irritant"],
      notes: "RED (acid) → BLUE (base). A natural dye extracted from lichens."
    },

    UniversalIndicator: {
      id: "UniversalIndicator", name: "Universal Indicator", formula: "Mixture", category: "indicator",
      molarMass: 400.0, density: 1.00, state: "aqueous",
      meltingPoint: 273.0, boilingPoint: 373.0,
      pH: 7.0, pHNote: "full-range indicator (pH 1–14)", acidity: "neutral",
      solubility: "miscible", enthalpyFormation: null, specificHeat: 4.000,
      flameColor: null,
      color: "#7ac143", hazards: ["flammable (ethanol-based)", "irritant"],
      notes: "RED → ORANGE → YELLOW → GREEN → BLUE → VIOLET across pH 1 to 14."
    },

    ThymolBlue: {
      id: "ThymolBlue", name: "Thymol Blue", formula: "C₂₇H₃₀O₅S", category: "indicator",
      molarMass: 466.59, density: 1.20, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 8.9, pHNote: "two ranges: 1.2–2.8 and 8.0–9.6", acidity: "weak acid",
      solubility: 0.01, enthalpyFormation: -1100.0, specificHeat: 1.000,
      flameColor: null,
      color: "#e08000", hazards: ["irritant"],
      notes: "RED → YELLOW (acid range) and YELLOW → BLUE (alkaline range). Dual-range indicator."
    },

    CongoRed: {
      id: "CongoRed", name: "Congo Red", formula: "C₃₂H₂₂N₆Na₂O₆S₂", category: "indicator",
      molarMass: 696.66, density: 1.30, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 5.2, pHNote: "transition midpoint (range 3.0–5.2)", acidity: "weak acid",
      solubility: 0.5, enthalpyFormation: -2050.0, specificHeat: 1.000,
      flameColor: null,
      color: "#e02020", hazards: ["carcinogen suspect", "irritant"],
      notes: "BLUE-VIOLET (acid) → RED (base). Also used as an amyloid stain in histology."
    },

    EriochromeBlackT: {
      id: "EriochromeBlackT", name: "Eriochrome Black T", formula: "C₂₀H₁₂N₃NaO₇S", category: "indicator",
      molarMass: 461.38, density: 1.40, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 10.0, pHNote: "used at pH 10 (ammonia buffer)", acidity: "weak acid",
      solubility: 0.05, enthalpyFormation: -1650.0, specificHeat: 1.000,
      flameColor: null,
      color: "#1a1a4a", hazards: ["irritant", "harmful"],
      notes: "Complexometric indicator for EDTA titrations of Ca²⁺/Mg²⁺. WINE RED → BLUE."
    },

    Starch: {
      id: "Starch", name: "Starch", formula: "(C₆H₁₀O₅)ₙ", category: "indicator",
      molarMass: 162.14, density: 1.50, state: "solid",
      meltingPoint: null, boilingPoint: null,
      pH: 6.5, pHNote: "neutral colloidal solution", acidity: "neutral",
      solubility: 0.1, enthalpyFormation: -970.0, specificHeat: 1.200,
      flameColor: null,
      color: "#fdfdf5", hazards: ["nuisance dust", "flammable dust"],
      notes: "Forms a deep blue-black complex with I₂ (amylose helix). Indicator in iodometry."
    },

    /* ====================================================================
     * 8. CATALYSTS & SPECIAL REAGENTS
     * ==================================================================*/

    Pt: {
      id: "Pt", name: "Platinum", formula: "Pt", category: "catalyst",
      molarMass: 195.084, density: 21.45, state: "solid",
      meltingPoint: 2041.4, boilingPoint: 4098.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.133,
      flameColor: null,
      color: "#d8d8e0", hazards: ["sensitiser (salts)"],
      notes: "Hydrogenation and oxidation catalyst. Inert to single mineral acids."
    },

    Pd: {
      id: "Pd", name: "Palladium", formula: "Pd", category: "catalyst",
      molarMass: 106.42, density: 12.023, state: "solid",
      meltingPoint: 1828.05, boilingPoint: 3236.0,
      pH: null, pHNote: "insoluble metal", acidity: "neutral",
      solubility: "insoluble", enthalpyFormation: 0, specificHeat: 0.246,
      flameColor: null,
      color: "#c8c8d0", hazards: ["sensitiser", "flammable powder"],
      notes: "Absorbs up to 900 times its own volume of H₂ — used in hydrogen purification."
    },

    V2O5: {
      id: "V2O5", name: "Vanadium(V) Oxide", formula: "V₂O₅", category: "catalyst",
      molarMass: 181.88, density: 3.357, state: "solid",
      meltingPoint: 963.0, boilingPoint: null,
      pH: 3.5, pHNote: "slightly acidic in water", acidity: "weak acid",
      solubility: 0.8, enthalpyFormation: -1551.0, specificHeat: 0.700,
      flameColor: null,
      color: "#e07020", hazards: ["toxic", "carcinogen suspect", "irritant"],
      notes: "Contact-process catalyst: 2 SO₂ + O₂ ⇌ 2 SO₃ at ~450 °C."
    },

    NaBH4: {
      id: "NaBH4", name: "Sodium Borohydride", formula: "NaBH₄", category: "catalyst",
      molarMass: 37.83, density: 1.074, state: "solid",
      meltingPoint: 673.0, boilingPoint: null,
      pH: 10.5, pHNote: "basic by hydrolysis", acidity: "strong base",
      solubility: 55.0, enthalpyFormation: -188.6, specificHeat: 1.100,
      flameColor: "golden yellow",
      color: "#f8f8f8", hazards: ["water-reactive", "flammable", "toxic (B₂H₆ impurity)"],
      notes: "Mild, chemoselective reducing agent for aldehydes and ketones."
    },

    NaH: {
      id: "NaH", name: "Sodium Hydride", formula: "NaH", category: "catalyst",
      molarMass: 24.00, density: 1.396, state: "solid",
      meltingPoint: 911.0, boilingPoint: null,
      pH: 14.0, pHNote: "forms NaOH on hydrolysis", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -56.3, specificHeat: 1.000,
      flameColor: "golden yellow",
      color: "#c8c8c8", hazards: ["water-reactive", "flammable", "corrosive"],
      notes: "60% dispersion in mineral oil is the safe handling form. Powerful base."
    },

    LiAlH4: {
      id: "LiAlH4", name: "Lithium Aluminium Hydride", formula: "LiAlH₄", category: "catalyst",
      molarMass: 37.95, density: 0.917, state: "solid",
      meltingPoint: 423.0, boilingPoint: null,
      pH: 14.0, pHNote: "violent hydrolysis to LiOH", acidity: "strong base",
      solubility: "reacts", enthalpyFormation: -116.0, specificHeat: 1.200,
      flameColor: "crimson red",
      color: "#e0e0e0", hazards: ["water-reactive", "pyrophoric", "corrosive"],
      notes: "Reduces esters, acids and amides to alcohols/amines. Handle under inert gas only."
    }
  }
};

/* ============================================================================
 * NAMESPACE HELPERS
 * ----------------------------------------------------------------------------
 * Small utility layer so engine.js / app.js never need to touch the raw map.
 * ==========================================================================*/

(function (DB) {
  "use strict";

  /**
   * Fetch a single species record.
   * @param {string} id
   * @returns {Object|null}
   */
  DB.get = function (id) {
    if (!id) return null;
    return Object.prototype.hasOwnProperty.call(DB.species, id)
      ? DB.species[id]
      : null;
  };

  /**
   * All species belonging to a category key.
   * @param {string} category
   * @returns {Object[]}
   */
  DB.byCategory = function (category) {
    const out = [];
    for (const key in DB.species) {
      if (DB.species[key].category === category) out.push(DB.species[key]);
    }
    return out;
  };

  /**
   * Species filtered by physical state.
   * @param {string} state — "solid" | "liquid" | "gas" | "aqueous"
   * @returns {Object[]}
   */
  DB.byState = function (state) {
    const out = [];
    for (const key in DB.species) {
      if (DB.species[key].state === state) out.push(DB.species[key]);
    }
    return out;
  };

  /**
   * Fuzzy search across id, name, formula and notes.
   * @param {string} query
   * @returns {Object[]}
   */
  DB.search = function (query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return DB.list();
    const out = [];
    for (const key in DB.species) {
      const s = DB.species[key];
      if (
        s.id.toLowerCase().indexOf(q) !== -1 ||
        s.name.toLowerCase().indexOf(q) !== -1 ||
        String(s.formula).toLowerCase().indexOf(q) !== -1 ||
        String(s.notes).toLowerCase().indexOf(q) !== -1
      ) {
        out.push(s);
      }
    }
    return out;
  };

  /**
   * Flat array of every species record.
   * @returns {Object[]}
   */
  DB.list = function () {
    const out = [];
    for (const key in DB.species) out.push(DB.species[key]);
    return out;
  };

  /**
   * Total number of registered species.
   * @returns {number}
   */
  DB.count = function () {
    return Object.keys(DB.species).length;
  };

  /**
   * Species that emit a visible flame colour (useful for flame tests).
   * @returns {Object[]}
   */
  DB.flameTestSpecies = function () {
    const out = [];
    for (const key in DB.species) {
      if (DB.species[key].flameColor) out.push(DB.species[key]);
    }
    return out;
  };

  /**
   * Species that are hazardous to mix with water (engine safety rules).
   * @returns {Object[]}
   */
  DB.waterReactive = function () {
    const out = [];
    for (const key in DB.species) {
      const s = DB.species[key];
      if (s.solubility === "reacts" || (s.hazards || []).indexOf("water-reactive") !== -1) {
        out.push(s);
      }
    }
    return out;
  };

  /**
   * Resolve a species id from a free-text formula string (e.g. "h2so4" → "H2SO4").
   * @param {string} formulaText
   * @returns {Object|null}
   */
  DB.resolveFormula = function (formulaText) {
    if (!formulaText) return null;
    const norm = String(formulaText)
      .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, function (ch) {
        return "₀₁₂₃₄₅₆₇₈₉".indexOf(ch);
      })
      .replace(/[\s·\-_]/g, "")
      .toLowerCase();
    for (const key in DB.species) {
      const s = DB.species[key];
      const candidate = String(s.formula)
        .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, function (ch) {
          return "₀₁₂₃₄₅₆₇₈₉".indexOf(ch);
        })
        .replace(/[\s·\-_]/g, "")
        .toLowerCase();
      if (candidate === norm || s.id.toLowerCase() === norm) return s;
    }
    return null;
  };

  /**
   * Quick acid/base character lookup used by the titration engine.
   * @param {string} id
   * @returns {number} -1 acid, 0 neutral, +1 base, NaN unknown
   */
  DB.proticity = function (id) {
    const s = DB.get(id);
    if (!s) return NaN;
    switch (s.acidity) {
      case "strong acid":
      case "weak acid":
        return -1;
      case "strong base":
      case "weak base":
        return 1;
      case "amphoteric":
      case "neutral":
      case "non-aqueous":
        return 0;
      default:
        return NaN;
    }
  };

  /* ---- Freeze the registry to prevent accidental runtime mutation ---- */
  Object.freeze(DB.categories);
  Object.freeze(DB.units);

  /* ---- Console banner so the devtools confirm successful load ---- */
  if (typeof console !== "undefined" && console.log) {
    console.log(
      "%c VirtuaLab Pro %c ChemicalsDB v" + DB.version +
      " — " + DB.count() + " species registered.",
      "background:#0b7285;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
      "background:#e3fafc;color:#0b7285;padding:2px 6px;border-radius:0 3px 3px 0"
    );
  }

})(window.ChemicalsDB);
