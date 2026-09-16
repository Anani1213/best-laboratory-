/* ============================================================================
 * VirtuaLab Pro — engine.js
 * ----------------------------------------------------------------------------
 * Thermodynamics, stoichiometry, acid-base, redox and precipitation engine.
 *
 * GLOBAL NAMESPACE : window.ChemistryEngine
 * DEPENDS ON       : window.ChemicalsDB
 *
 * CRITICAL BEHAVIOURS
 * ----------------------------------------------------------------------------
 *  • vessel.reset() completely purges the vessel:
 *        waterVolume  = 0
 *        soluteMoles  = {}
 *        solids       = []
 *        precipitates = []
 *        gases        = {}
 *    Because waterVolume === 0 after a reset, alkali metals (Li, Na, K, Rb, Cs)
 *    and alkaline-earth metals placed in a DRY vessel remain completely inert
 *    solid particles — no fizzing, no ignition, no explosion.
 *
 *  • addChemical(id, amount, unit) returns a complete reaction report:
 *        { ok, species, added, events[], equations[], warnings[], state }
 *    Each event carries a balanced equation with phase tags, a net-ionic form
 *    where meaningful, ΔH°, an EXOTHERMIC / ENDOTHERMIC flag, moles consumed
 *    and produced, evolved gas volume at STP, and precipitated mass.
 *
 *  • Real-time computation of:
 *        pH    = -log10[H+]      (strong + weak acids/bases, buffers)
 *        M     = n / V           (molarity of every dissolved species)
 *        q     = m · c · ΔT      (heat exchange with the solution)
 *        V_gas = n · 22.414 L    (STP molar volume, 273.15 K, 101.325 kPa)
 *        Ksp-driven precipitation via classic solubility rules.
 * ==========================================================================*/

window.ChemistryEngine = (function () {
  "use strict";

  /* ==========================================================================
   * 0. DEPENDENCY GUARD
   * ========================================================================*/

  var DB = window.ChemicalsDB;
  if (!DB || !DB.species) {
    console.error("[ChemistryEngine] FATAL: window.ChemicalsDB is not loaded.");
    return { Vessel: null, Engine: null, utils: {} };
  }

  /* ==========================================================================
   * 1. PHYSICAL CONSTANTS
   * ========================================================================*/

  var K = {
    R:                8.314462,      // J / (mol·K)
    MOLAR_VOLUME_STP: 22.4136,       // L / mol  (273.15 K, 101.325 kPa)
    T_STP:            273.15,        // K
    P_STP:            101.325,       // kPa
    T_AMBIENT:        298.15,        // K
    WATER_CP:         4.184,         // J / (g·K)
    WATER_DENSITY:    1000,          // g / L
    KW:               1.0e-14,       // ionic product of water at 298 K
    GAS_CONST_LATM:   0.082057,      // L·atm / (mol·K)
    DEFAULT_CP_SOLN:  3.90,          // J / (g·K) — fallback for ionic solutions
    FLAME_WATTS_MAX:  240,           // W delivered at flamePower = 1.0
    COOLING_K:        0.42           // W/K Newtonian cooling coefficient
  };

  /* ==========================================================================
   * 2. ION LIBRARY
   * ========================================================================*/

  var CATIONS = {
    H:    { name: "hydrogen",        charge: 1, display: "H"    },
    Li:   { name: "lithium",         charge: 1, display: "Li"   },
    Na:   { name: "sodium",          charge: 1, display: "Na"   },
    K:    { name: "potassium",       charge: 1, display: "K"    },
    Rb:   { name: "rubidium",        charge: 1, display: "Rb"   },
    Cs:   { name: "caesium",         charge: 1, display: "Cs"   },
    NH4:  { name: "ammonium",        charge: 1, display: "NH₄"  },
    Ag:   { name: "silver",          charge: 1, display: "Ag"   },
    Cu1:  { name: "copper(I)",       charge: 1, display: "Cu"   },
    Mg:   { name: "magnesium",       charge: 2, display: "Mg"   },
    Ca:   { name: "calcium",         charge: 2, display: "Ca"   },
    Sr:   { name: "strontium",       charge: 2, display: "Sr"   },
    Ba:   { name: "barium",          charge: 2, display: "Ba"   },
    Fe2:  { name: "iron(II)",        charge: 2, display: "Fe"   },
    Cu:   { name: "copper(II)",      charge: 2, display: "Cu"   },
    Zn:   { name: "zinc",            charge: 2, display: "Zn"   },
    Pb:   { name: "lead(II)",        charge: 2, display: "Pb"   },
    Mn2:  { name: "manganese(II)",   charge: 2, display: "Mn"   },
    Ni:   { name: "nickel(II)",      charge: 2, display: "Ni"   },
    Sn:   { name: "tin(II)",         charge: 2, display: "Sn"   },
    Al:   { name: "aluminium",       charge: 3, display: "Al"   },
    Fe3:  { name: "iron(III)",       charge: 3, display: "Fe"   },
    Cr3:  { name: "chromium(III)",   charge: 3, display: "Cr"   },
    Ti:   { name: "titanium(IV)",    charge: 4, display: "Ti"   }
  };

  var ANIONS = {
    F:       { name: "fluoride",          charge: 1, display: "F"        },
    Cl:      { name: "chloride",          charge: 1, display: "Cl"       },
    Br:      { name: "bromide",           charge: 1, display: "Br"       },
    I:       { name: "iodide",            charge: 1, display: "I"        },
    OH:      { name: "hydroxide",         charge: 1, display: "OH"       },
    NO3:     { name: "nitrate",           charge: 1, display: "NO₃"      },
    NO2:     { name: "nitrite",           charge: 1, display: "NO₂"      },
    ClO:     { name: "hypochlorite",      charge: 1, display: "ClO"      },
    ClO3:    { name: "chlorate",          charge: 1, display: "ClO₃"     },
    ClO4:    { name: "perchlorate",       charge: 1, display: "ClO₄"     },
    HCO3:    { name: "hydrogencarbonate", charge: 1, display: "HCO₃"     },
    HSO4:    { name: "hydrogensulfate",   charge: 1, display: "HSO₄"     },
    CH3COO:  { name: "acetate",           charge: 1, display: "CH₃COO"   },
    HCOO:    { name: "formate",           charge: 1, display: "HCOO"     },
    MnO4:    { name: "permanganate",      charge: 1, display: "MnO₄"     },
    IO3:     { name: "iodate",            charge: 1, display: "IO₃"      },
    SCN:     { name: "thiocyanate",       charge: 1, display: "SCN"      },
    CN:      { name: "cyanide",           charge: 1, display: "CN"       },
    BO3:     { name: "borate",            charge: 1, display: "BO₃"      },
    CO3:     { name: "carbonate",         charge: 2, display: "CO₃"      },
    SO4:     { name: "sulfate",           charge: 2, display: "SO₄"      },
    SO3:     { name: "sulfite",           charge: 2, display: "SO₃"      },
    S:       { name: "sulfide",           charge: 2, display: "S"        },
    S2O3:    { name: "thiosulfate",       charge: 2, display: "S₂O₃"     },
    CrO4:    { name: "chromate",          charge: 2, display: "CrO₄"     },
    Cr2O7:   { name: "dichromate",        charge: 2, display: "Cr₂O₇"    },
    C2O4:    { name: "oxalate",           charge: 2, display: "C₂O₄"     },
    SiO3:    { name: "silicate",          charge: 2, display: "SiO₃"     },
    O:       { name: "oxide",             charge: 2, display: "O"        },
    B4O7:    { name: "tetraborate",       charge: 2, display: "B₄O₇"     },
    C4H4O6:  { name: "tartrate",          charge: 2, display: "C₄H₄O₆"   },
    PO4:     { name: "phosphate",         charge: 3, display: "PO₄"      },
    C6H5O7:  { name: "citrate",           charge: 3, display: "C₆H₅O₇"   }
  };

  /* ==========================================================================
   * 3. SPECIES → ION DECOMPOSITION TABLE
   * --------------------------------------------------------------------------
   * Each entry lists the ions released by one formula unit in aqueous solution.
   * Only species that genuinely dissociate are listed. Molecular species
   * (sugars, alcohols, hydrocarbons) are deliberately omitted.
   * ========================================================================*/

  var IONIC = {
    /* ---- acids ---- */
    HCl:      ["H", "Cl"],
    HBr:      ["H", "Br"],
    HI:       ["H", "I"],
    HF:       ["H", "F"],
    HNO3:     ["H", "NO3"],
    HNO2:     ["H", "NO2"],
    HClO4:    ["H", "ClO4"],
    HClO3:    ["H", "ClO3"],
    HClO:     ["H", "ClO"],
    H2SO4:    ["H", "H", "SO4"],
    H2SO3:    ["H", "H", "SO3"],
    H2CO3:    ["H", "H", "CO3"],
    H2C2O4:   ["H", "H", "C2O4"],
    H3PO4:    ["H", "H", "H", "PO4"],
    H2S:      ["H", "H", "S"],
    HCN:      ["H", "CN"],
    H2SiO3:   ["H", "H", "SiO3"],
    H3BO3:    ["H", "H", "H", "BO3"],
    CH3COOH:  ["H", "CH3COO"],
    HCOOH:    ["H", "HCOO"],
    C6H8O7:   ["H", "H", "H", "C6H5O7"],
    C4H6O6:   ["H", "H", "C4H4O6"],

    /* ---- bases & hydroxides ---- */
    NaOH:     ["Na", "OH"],
    KOH:      ["K", "OH"],
    LiOH:     ["Li", "OH"],
    Ca_OH_2:  ["Ca", "OH", "OH"],
    Ba_OH_2:  ["Ba", "OH", "OH"],
    Sr_OH_2:  ["Sr", "OH", "OH"],
    Mg_OH_2:  ["Mg", "OH", "OH"],
    NH4OH:    ["NH4", "OH"],
    NH3:      ["NH4", "OH"],

    /* ---- salts ---- */
    NaCl:     ["Na", "Cl"],
    KCl:      ["K", "Cl"],
    KI:       ["K", "I"],
    KBr:      ["K", "Br"],
    NaBr:     ["Na", "Br"],
    NaF:      ["Na", "F"],
    CaCl2:    ["Ca", "Cl", "Cl"],
    MgCl2:    ["Mg", "Cl", "Cl"],
    BaCl2:    ["Ba", "Cl", "Cl"],
    AlCl3:    ["Al", "Cl", "Cl", "Cl"],
    FeCl3:    ["Fe3", "Cl", "Cl", "Cl"],
    FeCl2:    ["Fe2", "Cl", "Cl"],
    CuCl2:    ["Cu", "Cl", "Cl"],
    CuSO4:    ["Cu", "SO4"],
    CuSO4_5H2O: ["Cu", "SO4"],
    FeSO4:    ["Fe2", "SO4"],
    Fe2_SO4_3: ["Fe3", "Fe3", "SO4", "SO4", "SO4"],
    ZnSO4:    ["Zn", "SO4"],
    MgSO4:    ["Mg", "SO4"],
    Na2SO4:   ["Na", "Na", "SO4"],
    K2SO4:    ["K", "K", "SO4"],
    CaSO4:    ["Ca", "SO4"],
    BaSO4:    ["Ba", "SO4"],
    PbSO4:    ["Pb", "SO4"],
    NH4_2SO4: ["NH4", "NH4", "SO4"],
    NaNO3:    ["Na", "NO3"],
    KNO3:     ["K", "NO3"],
    AgNO3:    ["Ag", "NO3"],
    Pb_NO3_2: ["Pb", "NO3", "NO3"],
    Cu_NO3_2: ["Cu", "NO3", "NO3"],
    Ca_NO3_2: ["Ca", "NO3", "NO3"],
    Ba_NO3_2: ["Ba", "NO3", "NO3"],
    Na2CO3:   ["Na", "Na", "CO3"],
    K2CO3:    ["K", "K", "CO3"],
    CaCO3:    ["Ca", "CO3"],
    NaHCO3:   ["Na", "HCO3"],
    KHCO3:    ["K", "HCO3"],
    MgCO3:    ["Mg", "CO3"],
    BaCO3:    ["Ba", "CO3"],
    CuCO3:    ["Cu", "CO3"],
    Na3PO4:   ["Na", "Na", "Na", "PO4"],
    Ca3_PO4_2: ["Ca", "Ca", "Ca", "PO4", "PO4"],
    KMnO4:    ["K", "MnO4"],
    K2Cr2O7:  ["K", "K", "Cr2O7"],
    K2CrO4:   ["K", "K", "CrO4"],
    Na2S2O3:  ["Na", "Na", "S2O3"],
    KSCN:     ["K", "SCN"],
    Na2S:     ["Na", "Na", "S"],
    KCN:      ["K", "CN"],
    CH3COONa: ["Na", "CH3COO"],
    Na2C2O4:  ["Na", "Na", "C2O4"],
    AgCl:     ["Ag", "Cl"],
    AgBr:     ["Ag", "Br"],
    AgI:      ["Ag", "I"],
    NH4Cl:    ["NH4", "Cl"],
    Na2SiO3:  ["Na", "Na", "SiO3"],
    Cu_CH3COO_2: ["Cu", "CH3COO", "CH3COO"],
    PbI2:     ["Pb", "I", "I"],
    PbCrO4:   ["Pb", "CrO4"],
    BaCrO4:   ["Ba", "CrO4"],
    FeS:      ["Fe2", "S"],
    ZnS:      ["Zn", "S"],
    CuS:      ["Cu", "S"],
    PbS:      ["Pb", "S"],
    Ag2S:     ["Ag", "Ag", "S"],
    NaClO:    ["Na", "ClO"],
    Ca_ClO_2: ["Ca", "ClO", "ClO"],
    KClO3:    ["K", "ClO3"],
    KIO3:     ["K", "IO3"],
    Na2B4O7:  ["Na", "Na", "B4O7"],
    KAl_SO4_2_12H2O: ["K", "Al", "SO4", "SO4"],
    NH4_2Fe_SO4_2_6H2O: ["NH4", "NH4", "Fe2", "SO4", "SO4"],
    Na2O:     ["Na", "Na", "O"],
    MgO:      ["Mg", "O"],
    Al2O3:    ["Al", "Al", "O", "O", "O"],
    CaO:      ["Ca", "O"],
    BaO:      ["Ba", "O"],
    SrO:      ["Sr", "O"],
    Li2O:     ["Li", "Li", "O"],
    K2O:      ["K", "K", "O"],
    CuO:      ["Cu", "O"],
    Cu2O:     ["Cu1", "Cu1", "O"],
    ZnO:      ["Zn", "O"],
    PbO:      ["Pb", "O"],
    PbO2:     ["Pb", "O", "O"],
    Ag2O:     ["Ag", "Ag", "O"],
    MnO2:     ["Mn2", "O", "O"],
    Cr2O3:    ["Cr3", "Cr3", "O", "O", "O"],
    TiO2:     ["Ti", "O", "O"],
    Fe2O3:    ["Fe3", "Fe3", "O", "O", "O"],
    Fe3O4:    ["Fe2", "Fe3", "Fe3", "O", "O", "O", "O"],
    Al_OH_3:  ["Al", "OH", "OH", "OH"],
    Fe_OH_3:  ["Fe3", "OH", "OH", "OH"],
    Fe_OH_2:  ["Fe2", "OH", "OH"],
    Cu_OH_2:  ["Cu", "OH", "OH"],
    Zn_OH_2:  ["Zn", "OH", "OH"],
    Ni_OH_2:  ["Ni", "OH", "OH"],
    Cr_OH_3:  ["Cr3", "OH", "OH", "OH"],
    Pb_OH_2:  ["Pb", "OH", "OH"],
    Mn_OH_2:  ["Mn2", "OH", "OH"],
    AgOH:     ["Ag", "OH"]
  };

  /* ==========================================================================
   * 4. ACID / BASE METADATA
   * ========================================================================*/

  var ACID_INFO = {
    HCl:      { anion: "Cl",      protons: 1 },
    HBr:      { anion: "Br",      protons: 1 },
    HI:       { anion: "I",       protons: 1 },
    HF:       { anion: "F",       protons: 1 },
    HNO3:     { anion: "NO3",     protons: 1 },
    HNO2:     { anion: "NO2",     protons: 1 },
    HClO4:    { anion: "ClO4",    protons: 1 },
    HClO3:    { anion: "ClO3",    protons: 1 },
    HClO:     { anion: "ClO",     protons: 1 },
    H2SO4:    { anion: "SO4",     protons: 2 },
    H2SO3:    { anion: "SO3",     protons: 2 },
    H2CO3:    { anion: "CO3",     protons: 2 },
    H2C2O4:   { anion: "C2O4",    protons: 2 },
    H3PO4:    { anion: "PO4",     protons: 3 },
    H2S:      { anion: "S",       protons: 2 },
    HCN:      { anion: "CN",      protons: 1 },
    H2SiO3:   { anion: "SiO3",    protons: 2 },
    H3BO3:    { anion: "BO3",     protons: 1 },
    CH3COOH:  { anion: "CH3COO",  protons: 1 },
    HCOOH:    { anion: "HCOO",    protons: 1 },
    C6H8O7:   { anion: "C6H5O7",  protons: 3 },
    C4H6O6:   { anion: "C4H4O6",  protons: 2 }
  };

  var BASE_INFO = {
    NaOH:     { cation: "Na",  oh: 1 },
    KOH:      { cation: "K",   oh: 1 },
    LiOH:     { cation: "Li",  oh: 1 },
    Ca_OH_2:  { cation: "Ca",  oh: 2 },
    Ba_OH_2:  { cation: "Ba",  oh: 2 },
    Sr_OH_2:  { cation: "Sr",  oh: 2 },
    Mg_OH_2:  { cation: "Mg",  oh: 2 },
    NH4OH:    { cation: "NH4", oh: 1 },
    NH3:      { cation: "NH4", oh: 1 }
  };

  /* ---- metals that react with cold water ---- */
  var ALKALI_METALS        = ["Li", "Na", "K", "Rb", "Cs"];
  var ALKALINE_EARTH_METALS = ["Ca", "Sr", "Ba"];          // vigorous with cold water
  var SLOW_WATER_METALS    = ["Mg"];                        // needs steam / very slow

  /* ---- metals that displace H2 from dilute acid ---- */
  var ACID_ACTIVE_METALS   = ["Mg", "Al", "Zn", "Fe", "Ca", "Mn", "Ni", "Sn", "Pb"];

  /* ---- catalysts for H2O2 decomposition ---- */
  var PEROXIDE_CATALYSTS   = ["MnO2", "KI", "KMnO4", "FeCl3"];

  /* ---- fuels that can undergo combustion ---- */
  var FUELS = {
    H2:    { co2: 0, h2o: 1, formula: "H₂",       state: "g", dh: -285.83 },
    CH4:   { co2: 1, h2o: 2, formula: "CH₄",      state: "g", dh: -890.3  },
    C2H2:  { co2: 2, h2o: 1, formula: "C₂H₂",     state: "g", dh: -1300.0 },
    C2H4:  { co2: 2, h2o: 2, formula: "C₂H₄",     state: "g", dh: -1411.0 },
    C2H5OH:{ co2: 2, h2o: 3, formula: "C₂H₅OH",   state: "l", dh: -1366.8 },
    C3H8:  { co2: 3, h2o: 4, formula: "C₃H₈",     state: "g", dh: -2219.2 },
    C4H10: { co2: 4, h2o: 5, formula: "C₄H₁₀",    state: "g", dh: -2877.5 },
    C8H18: { co2: 8, h2o: 9, formula: "C₈H₁₈",    state: "l", dh: -5470.0 },
    C6H6:  { co2: 6, h2o: 3, formula: "C₆H₆",     state: "l", dh: -3267.6 },
    C6H12: { co2: 6, h2o: 6, formula: "C₆H₁₂",    state: "l", dh: -3919.9 },
    C6H14: { co2: 6, h2o: 7, formula: "C₆H₁₄",    state: "l", dh: -4163.0 },
    CH3OH: { co2: 1, h2o: 2, formula: "CH₃OH",    state: "l", dh: -726.1  },
    CH3COCH3:{co2: 3, h2o: 3, formula: "CH₃COCH₃",state: "l", dh: -1790.0 }
  };

  /* ==========================================================================
   * 5. SALT LOOKUP BY ION PAIR
   * ========================================================================*/

  var SALT_BY_IONS = (function () {
    var map = {};
    for (var id in IONIC) {
      if (!Object.prototype.hasOwnProperty.call(IONIC, id)) continue;
      var sp = DB.get(id);
      if (!sp || sp.category !== "salt") continue;
      var parts = IONIC[id];
      var cats = [], ans = [];
      for (var i = 0; i < parts.length; i++) {
        if (CATIONS[parts[i]]) cats.push(parts[i]);
        else if (ANIONS[parts[i]]) ans.push(parts[i]);
      }
      if (!cats.length || !ans.length) continue;
      var cSet = {}, aSet = {};
      for (var a = 0; a < cats.length; a++) cSet[cats[a]] = true;
      for (var b = 0; b < ans.length; b++)  aSet[ans[b]]  = true;
      var cKeys = Object.keys(cSet), aKeys = Object.keys(aSet);
      if (cKeys.length === 1 && aKeys.length === 1) {
        map[cKeys[0] + "|" + aKeys[0]] = id;
      }
    }
    return map;
  })();

  /* ==========================================================================
   * 6. SOLUBILITY RULES  (classic qualitative-analysis scheme)
   * ========================================================================*/

  var GROUP1 = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, NH4: 1 };

  /**
   * @returns {boolean|"slight"} true = soluble, false = insoluble/precipitate
   */
  function isSoluble(cation, anion) {
    /* Everything with an alkali metal or ammonium counter-ion is soluble */
    if (GROUP1[cation]) return true;

    /* Nitrates, acetates, chlorates, perchlorates, permanganates — always soluble */
    if (anion === "NO3" || anion === "NO2" || anion === "CH3COO" ||
        anion === "HCOO" || anion === "ClO3" || anion === "ClO4" ||
        anion === "MnO4" || anion === "IO3" || anion === "SCN") {
      /* ...except a few iodates/permanganates of heavy metals (approximate) */
      if (anion === "IO3" && (cation === "Ag" || cation === "Pb" || cation === "Ba")) return "slight";
      return true;
    }

    /* Halides: soluble except Ag+, Pb2+, Cu+, Hg2+ */
    if (anion === "Cl" || anion === "Br" || anion === "I") {
      if (cation === "Ag" || cation === "Pb" || cation === "Cu1") return false;
      if (anion === "I" && cation === "Cu") return "slight";
      return true;
    }

    /* Fluorides: insoluble for Group 2 and Pb */
    if (anion === "F") {
      if (cation === "Mg" || cation === "Ca" || cation === "Sr" ||
          cation === "Ba" || cation === "Pb") return false;
      return true;
    }

    /* Sulfates: BaSO4, PbSO4, SrSO4 insoluble; CaSO4, Ag2SO4 slightly */
    if (anion === "SO4") {
      if (cation === "Ba" || cation === "Pb" || cation === "Sr") return false;
      if (cation === "Ca" || cation === "Ag") return "slight";
      return true;
    }

    /* Hydroxides: Ba(OH)2, Sr(OH)2 soluble; Ca(OH)2 slightly; rest insoluble */
    if (anion === "OH") {
      if (cation === "Ba" || cation === "Sr") return true;
      if (cation === "Ca") return "slight";
      return false;
    }

    /* Carbonates, phosphates, sulfides, sulfites, silicates, oxalates,
       chromates, borates — insoluble except with Group 1 / NH4+ (handled above) */
    if (anion === "CO3" || anion === "PO4" || anion === "SO3" ||
        anion === "SiO3" || anion === "C2O4" || anion === "B4O7" ||
        anion === "C4H4O6" || anion === "C6H5O7") {
      return false;
    }

    /* Chromates: MgCrO4 and CaCrO4 are soluble; most others insoluble */
    if (anion === "CrO4") {
      if (cation === "Mg") return true;
      if (cation === "Ca") return "slight";
      return false;
    }

    /* Sulfides: Group 1 / NH4+ soluble (handled); Group 2 hydrolyse; rest insoluble */
    if (anion === "S") {
      if (cation === "Mg" || cation === "Ca" || cation === "Sr" || cation === "Ba") return "slight";
      return false;
    }

    /* Dichromates, thiosulfates, cyanides, oxides: mostly soluble / reactive */
    if (anion === "Cr2O7" || anion === "S2O3") return true;

    /* Oxides are never "dissolved ions" in this model */
    if (anion === "O") return false;

    return true;
  }

  /* ==========================================================================
   * 7. SMALL MATH / STRING UTILITIES
   * ========================================================================*/

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }

  var SUBSCRIPT_MAP = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉" };

  function sub(n) {
    return String(n).split("").map(function (d) { return SUBSCRIPT_MAP[d] || d; }).join("");
  }

  function fmt(n, dp) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    if (dp === undefined) dp = 4;
    var a = Math.abs(n);
    if (a !== 0 && (a < 1e-4 || a >= 1e6)) return n.toExponential(3);
    return Number(n.toFixed(dp)).toString();
  }

  /** Build a Unicode formula for a salt from its ions. */
  function buildSaltFormula(cation, anion) {
    var c = CATIONS[cation], a = ANIONS[anion];
    if (!c || !a) return (cation || "") + (anion || "");
    var g = gcd(c.charge, a.charge);
    var nC = a.charge / g;
    var nA = c.charge / g;
    var cPart = c.display + (nC > 1 ? sub(nC) : "");
    var aPart;
    if (nA > 1) aPart = "(" + a.display + ")" + sub(nA);
    else         aPart = a.display;
    return cPart + aPart;
  }

  /** Phase tag for a species record. */
  function phaseTag(sp) {
    if (!sp) return "aq";
    switch (sp.state) {
      case "solid":   return "s";
      case "liquid":  return "l";
      case "gas":     return "g";
      case "aqueous": return "aq";
      default:        return "aq";
    }
  }

  /** Render one term of an equation, e.g. "2H₂O(l)". */
  function eqTerm(coef, formula, state) {
    var c = (coef && coef !== 1) ? String(coef) : "";
    return c + formula + "(" + state + ")";
  }

  /** Render a full equation string. */
  function renderEquation(reactants, products) {
    var lhs = reactants.map(function (t) { return eqTerm(t.coef, t.formula, t.state); }).join(" + ");
    var rhs = products.map(function (t) { return eqTerm(t.coef, t.formula, t.state); }).join(" + ");
    return lhs + " → " + rhs;
  }

  /**
   * Compute ΔH°rxn from formation enthalpies.
   * @param {Array} reactants [{id, coef}]
   * @param {Array} products  [{id, coef}]
   * @returns {number|null} kJ per reaction as written
   */
  function reactionEnthalpy(reactants, products) {
    var h = 0, ok = false;
    for (var i = 0; i < products.length; i++) {
      var sp = DB.get(products[i].id);
      if (sp && sp.enthalpyFormation !== null && sp.enthalpyFormation !== undefined) {
        h += products[i].coef * sp.enthalpyFormation;
        ok = true;
      }
    }
    for (var j = 0; j < reactants.length; j++) {
      var sr = DB.get(reactants[j].id);
      if (sr && sr.enthalpyFormation !== null && sr.enthalpyFormation !== undefined) {
        h -= reactants[j].coef * sr.enthalpyFormation;
        ok = true;
      }
    }
    return ok ? h : null;
  }

  function enthalpyFlag(dh) {
    if (dh === null || dh === undefined || isNaN(dh)) return "UNKNOWN";
    if (dh < -0.5) return "EXOTHERMIC";
    if (dh >  0.5) return "ENDOTHERMIC";
    return "THERMONEUTRAL";
  }

  /** Estimate Ka of a weak acid from its tabulated 0.1 M pH. */
  function estimateKa(sp) {
    if (!sp || sp.pH === null || sp.pH === undefined) return 1.0e-5;
    var h = Math.pow(10, -sp.pH);
    var c = 0.1;
    if (h >= c) return 1.0e-3;
    return (h * h) / (c - h);
  }

  /** Estimate Kb of a weak base from its tabulated 0.1 M pH. */
  function estimateKb(sp) {
    if (!sp || sp.pH === null || sp.pH === undefined) return 1.0e-5;
    var pOH = 14 - sp.pH;
    var oh = Math.pow(10, -pOH);
    var c = 0.1;
    if (oh >= c) return 1.0e-3;
    return (oh * oh) / (c - oh);
  }

  /* ==========================================================================
   * 8. VESSEL
   * ========================================================================*/

  function Vessel() {
    this.reset();
    /* Persistent instrumentation (NOT cleared by reset) */
    this.stirring  = false;
    this.stirRate  = 0;        // 0..1
    this.flamePower = 0;       // 0..1
    this.elapsed   = 0;        // seconds since creation
  }

  /**
   * Purge every trace of contents.
   * After this call waterVolume === 0, so any subsequent addition of an alkali
   * metal lands in a DRY vessel and stays completely inert.
   */
  Vessel.prototype.reset = function () {
    /* ---- contents ---- */
    this.waterVolume   = 0;        // litres of free water
    this.soluteMoles   = {};       // speciesId -> mol dissolved in the aqueous phase
    this.solids        = [];       // [{id, moles, mass, origin}]
    this.precipitates  = [];       // [{id, moles, mass, formula, color}]
    this.gases         = {};       // speciesId -> mol in headspace
    this.indicators    = {};       // speciesId -> mol (subset of soluteMoles, tracked for colour)

    /* ---- thermodynamics ---- */
    this.temperature   = K.T_AMBIENT;   // K
    this.pressure      = K.P_STP;       // kPa
    this.heatExchanged = 0;             // J, signed (+ = absorbed by solution)

    /* ---- presentation ---- */
    this.turbidity     = 0;             // 0..1
    this.colour        = "#cfe8ff";
    this.opacity       = 0.35;

    /* ---- bookkeeping ---- */
    this.reactionCount = 0;
    this.lastEvents    = [];
    this.dirty         = true;
    return this;
  };

  /** True if there is any liquid water present. */
  Vessel.prototype.hasWater = function () {
    return this.waterVolume > 0;
  };

  /** Total number of moles of a species currently dissolved. */
  Vessel.prototype.molesOf = function (id) {
    return this.soluteMoles[id] || 0;
  };

  /** Total moles of a species present as undissolved solid. */
  Vessel.prototype.solidMolesOf = function (id) {
    var t = 0;
    for (var i = 0; i < this.solids.length; i++) {
      if (this.solids[i].id === id) t += this.solids[i].moles;
    }
    return t;
  };

  /** Add moles of a solid to the undissolved pool (merging duplicates). */
  Vessel.prototype.pushSolid = function (id, moles, origin) {
    if (!(moles > 0)) return;
    var sp = DB.get(id);
    var mass = sp ? moles * sp.molarMass : 0;
    for (var i = 0; i < this.solids.length; i++) {
      if (this.solids[i].id === id && this.solids[i].origin === (origin || "added")) {
        this.solids[i].moles += moles;
        this.solids[i].mass  += mass;
        return;
      }
    }
    this.solids.push({ id: id, moles: moles, mass: mass, origin: origin || "added" });
  };

  /** Remove moles of a solid from the undissolved pool. Returns moles removed. */
  Vessel.prototype.consumeSolid = function (id, moles) {
    var remaining = moles;
    for (var i = this.solids.length - 1; i >= 0 && remaining > 0; i--) {
      var s = this.solids[i];
      if (s.id !== id) continue;
      var take = Math.min(s.moles, remaining);
      s.moles -= take;
      var sp = DB.get(id);
      s.mass = sp ? s.moles * sp.molarMass : 0;
      remaining -= take;
      if (s.moles <= 1e-12) this.solids.splice(i, 1);
    }
    return moles - remaining;
  };

  /** Add a precipitate to the settled-solid list. */
  Vessel.prototype.pushPrecipitate = function (id, moles) {
    if (!(moles > 0)) return;
    var sp = DB.get(id);
    var mass = sp ? moles * sp.molarMass : 0;
    for (var i = 0; i < this.precipitates.length; i++) {
      if (this.precipitates[i].id === id) {
        this.precipitates[i].moles += moles;
        this.precipitates[i].mass  += mass;
        return;
      }
    }
    this.precipitates.push({
      id: id,
      moles: moles,
      mass: mass,
      formula: sp ? sp.formula : id,
      color: sp ? sp.color : "#e8e8e8"
    });
  };

  /** Add moles of a gas to the headspace. */
  Vessel.prototype.pushGas = function (id, moles) {
    if (!(moles > 0)) return;
    this.gases[id] = (this.gases[id] || 0) + moles;
  };

  /** Total mass of the liquid phase, grams. */
  Vessel.prototype.solutionMass = function () {
    var m = this.waterVolume * K.WATER_DENSITY;
    for (var id in this.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(this.soluteMoles, id)) continue;
      var sp = DB.get(id);
      if (sp) m += this.soluteMoles[id] * sp.molarMass;
    }
    return m;
  };

  /** Mass-weighted specific heat of the liquid phase, J/(g·K). */
  Vessel.prototype.solutionCp = function () {
    var total = 0, weighted = 0;
    var waterMass = this.waterVolume * K.WATER_DENSITY;
    if (waterMass > 0) {
      total += waterMass;
      weighted += waterMass * K.WATER_CP;
    }
    for (var id in this.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(this.soluteMoles, id)) continue;
      var sp = DB.get(id);
      if (!sp) continue;
      var m = this.soluteMoles[id] * sp.molarMass;
      var cp = (sp.specificHeat && sp.specificHeat > 0.1) ? sp.specificHeat : K.DEFAULT_CP_SOLN;
      total += m;
      weighted += m * cp;
    }
    if (total <= 0) return K.DEFAULT_CP_SOLN;
    return weighted / total;
  };

  /* ==========================================================================
   * 9. ENGINE
   * ========================================================================*/

  function Engine(vessel) {
    this.vessel  = vessel || new Vessel();
    this.history = [];
    this._busy   = false;
  }

  /* ------------------------------------------------------------------------
   * 9.1 UNIT CONVERSION
   * ---------------------------------------------------------------------- */

  Engine.prototype.toMoles = function (sp, amount, unit) {
    if (!sp || !(amount > 0)) return 0;
    switch (unit) {
      case "mol":     return amount;
      case "mmol":    return amount / 1000;
      case "µmol":
      case "umol":    return amount / 1e6;
      case "g":       return amount / sp.molarMass;
      case "mg":      return amount / (sp.molarMass * 1000);
      case "kg":      return (amount * 1000) / sp.molarMass;
      case "mL":
        if (sp.state === "gas") return (amount / 1000) / K.MOLAR_VOLUME_STP;
        return (amount * sp.density) / sp.molarMass;
      case "L":
        if (sp.state === "gas") return amount / K.MOLAR_VOLUME_STP;
        return (amount * 1000 * sp.density) / sp.molarMass;
      case "drops":   return (amount * 0.05 * sp.density) / sp.molarMass;
      case "spatula": return (amount * 0.5) / sp.molarMass;
      case "pieces":  return (amount * 0.10) / sp.molarMass;
      case "grains":  return (amount * 0.0648) / sp.molarMass;
      default:        return amount / sp.molarMass;
    }
  };

  Engine.prototype.toLitres = function (sp, amount, unit) {
    if (!sp || !(amount > 0)) return 0;
    switch (unit) {
      case "L":       return amount;
      case "mL":      return amount / 1000;
      case "drops":   return (amount * 0.05) / 1000;
      case "µL":
      case "uL":      return amount / 1e6;
      case "mol":     return (amount * sp.molarMass) / 1000;
      case "mmol":    return ((amount / 1000) * sp.molarMass) / 1000;
      case "g":       return amount / 1000;                 // assume 1 g/mL
      case "mg":      return amount / 1e6;
      case "kg":      return amount;                        // 1 kg ≈ 1 L
      default:        return amount / 1000;
    }
  };

  /* ------------------------------------------------------------------------
   * 9.2 PUBLIC API — addChemical
   * ---------------------------------------------------------------------- */

  /**
   * Add a chemical to the vessel and resolve every reaction that follows.
   *
   * @param {string} id      Species key in window.ChemicalsDB.species
   * @param {number} amount  Numeric quantity
   * @param {string} unit    "mol" | "mmol" | "g" | "mg" | "mL" | "L" |
   *                         "drops" | "spatula" | "pieces" | "kg"
   * @returns {Object} Complete reaction report
   */
  Engine.prototype.addChemical = function (id, amount, unit) {
    var v = this.vessel;

    var report = {
      ok:          false,
      id:          id,
      amount:      amount,
      unit:        unit,
      species:     null,
      added:       null,
      events:      [],
      equations:   [],
      warnings:    [],
      state:       null,
      timestamp:   Date.now()
    };

    /* ---- validate species ---- */
    var sp = DB.get(id);
    if (!sp) {
      report.warnings.push("Unknown species identifier: '" + id + "'.");
      report.state = this.snapshot();
      return report;
    }
    report.species = sp;

    /* ---- validate amount ---- */
    var moles = this.toMoles(sp, amount, unit);
    if (!(moles > 0) || !isFinite(moles)) {
      report.warnings.push("Amount must be a positive number.");
      report.state = this.snapshot();
      return report;
    }

    report.added = {
      id:    id,
      moles: moles,
      mass:  moles * sp.molarMass,
      unit:  unit
    };

    /* ---- dispatch into the vessel by physical role ---- */
    this._introduce(v, sp, moles, amount, unit, report);

    /* ---- dissolution pass ---- */
    this._dissolve(v, report);

    /* ---- reaction cascade ---- */
    this._react(v, report);

    /* ---- post-processing ---- */
    this._recompute(v, report);

    report.ok = true;
    report.state = this.snapshot();
    v.lastEvents = report.events;
    this.history.push(report);
    if (this.history.length > 200) this.history.shift();
    return report;
  };

  /* ------------------------------------------------------------------------
   * 9.3 INTERNAL — introduce the species into the vessel
   * ---------------------------------------------------------------------- */

  Engine.prototype._introduce = function (v, sp, moles, amount, unit, report) {
    var id = sp.id;

    /* ---------- WATER ---------- */
    if (id === "H2O") {
      var litres = this.toLitres(sp, amount, unit);
      v.waterVolume += litres;
      report.events.push({
        type: "addition",
        message: "Added " + fmt(litres, 4) + " L of water (" +
                 fmt(litres * 1000, 2) + " mL).",
        waterVolume: v.waterVolume
      });
      return;
    }

    /* ---------- AQUEOUS SOLUTION ---------- */
    if (sp.state === "aqueous") {
      v.soluteMoles[id] = (v.soluteMoles[id] || 0) + moles;
      if (sp.category === "indicator") {
        v.indicators[id] = (v.indicators[id] || 0) + moles;
      }
      /* carrier water */
      var carrier;
      if (unit === "mL" || unit === "L" || unit === "drops" || unit === "µL" || unit === "uL") {
        carrier = this.toLitres(sp, amount, unit);
      } else {
        carrier = (moles * sp.molarMass) / 1000;   // assume ~1 g/mL
      }
      v.waterVolume += carrier;
      report.events.push({
        type: "addition",
        message: "Poured " + fmt(moles, 4) + " mol of " + sp.name +
                 " solution (" + fmt(carrier * 1000, 2) + " mL carrier water).",
        waterVolume: v.waterVolume
      });
      return;
    }

    /* ---------- GAS ---------- */
    if (sp.state === "gas") {
      v.gases[id] = (v.gases[id] || 0) + moles;
      report.events.push({
        type: "addition",
        message: "Injected " + fmt(moles, 4) + " mol of " + sp.name +
                 " gas (" + fmt(moles * K.MOLAR_VOLUME_STP, 3) + " L at STP)."
      });
      return;
    }

    /* ---------- NON-WATER LIQUID ---------- */
    if (sp.state === "liquid") {
      var miscible = (sp.solubility === "miscible");
      if (miscible && v.waterVolume > 0) {
        v.soluteMoles[id] = (v.soluteMoles[id] || 0) + moles;
        report.events.push({
          type: "addition",
          message: "Added " + fmt(moles, 4) + " mol of " + sp.name +
                   " — miscible, dissolved into the aqueous phase."
        });
      } else if (miscible && v.waterVolume === 0) {
        /* miscible solvent with no water present: treat as its own liquid pool */
        v.soluteMoles[id] = (v.soluteMoles[id] || 0) + moles;
        report.events.push({
          type: "addition",
          message: "Added " + fmt(moles, 4) + " mol of " + sp.name + " (neat liquid)."
        });
      } else {
        /* immiscible liquid — floats/sinks as a separate layer, still reactive */
        v.pushSolid(id, moles, "liquid-layer");
        report.events.push({
          type: "addition",
          message: "Added " + fmt(moles, 4) + " mol of " + sp.name +
                   " — immiscible, forms a separate layer."
        });
      }
      return;
    }

    /* ---------- SOLID ---------- */
    v.pushSolid(id, moles, "added");
    report.events.push({
      type: "addition",
      message: "Added " + fmt(moles, 4) + " mol (" + fmt(moles * sp.molarMass, 3) +
               " g) of solid " + sp.name + "."
    });
  };

  /* ------------------------------------------------------------------------
   * 9.4 INTERNAL — dissolution pass
   * ---------------------------------------------------------------------- */

  Engine.prototype._dissolve = function (v, report) {
    if (v.waterVolume <= 0) return;

    var V = v.waterVolume;                        // litres
    var keep = [];

    for (var i = 0; i < v.solids.length; i++) {
      var chunk = v.solids[i];
      var sp = DB.get(chunk.id);

      if (!sp) { keep.push(chunk); continue; }

      /* Liquids already handled; only solids dissolve here */
      if (sp.state !== "solid" && sp.state !== "liquid") { keep.push(chunk); continue; }

      /* Species that chemically react with water are left for the reaction pass */
      if (sp.solubility === "reacts" || sp.solubility === "decomposes") {
        keep.push(chunk);
        continue;
      }

      /* --- infinite / miscible solubility --- */
      if (sp.solubility === "miscible") {
        v.soluteMoles[chunk.id] = (v.soluteMoles[chunk.id] || 0) + chunk.moles;
        report.events.push({
          type: "dissolution",
          message: sp.name + " is fully miscible — dissolved completely."
        });
        continue;
      }

      /* --- genuinely insoluble --- */
      if (sp.solubility === "insoluble" || sp.solubility <= 0) {
        keep.push(chunk);
        continue;
      }

      /* --- finite solubility (g / 100 mL) --- */
      var maxGrams = (sp.solubility / 100) * (V * 1000);      // g dissolvable in V litres
      var massG    = chunk.moles * sp.molarMass;

      if (massG <= maxGrams) {
        v.soluteMoles[chunk.id] = (v.soluteMoles[chunk.id] || 0) + chunk.moles;
        report.events.push({
          type: "dissolution",
          message: sp.name + " dissolved completely (" +
                   fmt(sp.solubility, 4) + " g/100 mL at 293 K)."
        });
      } else {
        var dissolvedMoles = maxGrams / sp.molarMass;
        var leftoverMoles  = chunk.moles - dissolvedMoles;
        if (dissolvedMoles > 1e-9) {
          v.soluteMoles[chunk.id] = (v.soluteMoles[chunk.id] || 0) + dissolvedMoles;
        }
        keep.push({
          id: chunk.id,
          moles: leftoverMoles,
          mass: leftoverMoles * sp.molarMass,
          origin: chunk.origin
        });
        report.events.push({
          type: "dissolution",
          message: "Saturated! " + fmt(dissolvedMoles, 4) + " mol of " + sp.name +
                   " dissolved; " + fmt(leftoverMoles, 4) + " mol remains undissolved."
        });
      }
    }

    v.solids = keep;
  };

  /* ------------------------------------------------------------------------
   * 9.5 INTERNAL — reaction cascade
   * ---------------------------------------------------------------------- */

  Engine.prototype._react = function (v, report) {
    var MAX_PASSES = 14;
    var pass = 0;
    var firedAny = true;

    while (firedAny && pass < MAX_PASSES) {
      firedAny = false;
      pass++;

      if (this._ruleCombustion(v, report))             { firedAny = true; continue; }
      if (this._ruleAlkaliMetalWater(v, report))       { firedAny = true; continue; }
      if (this._ruleAlkalineEarthWater(v, report))     { firedAny = true; continue; }
      if (this._ruleMetalAcid(v, report))              { firedAny = true; continue; }
      if (this._ruleMetalOxideAcid(v, report))         { firedAny = true; continue; }
      if (this._ruleCarbonateAcid(v, report))          { firedAny = true; continue; }
      if (this._ruleSulfideAcid(v, report))            { firedAny = true; continue; }
      if (this._ruleSulfiteAcid(v, report))            { firedAny = true; continue; }
      if (this._ruleAmmoniumBase(v, report))           { firedAny = true; continue; }
      if (this._ruleNonMetalOxideBase(v, report))      { firedAny = true; continue; }
      if (this._rulePeroxideDecomposition(v, report))  { firedAny = true; continue; }
      if (this._ruleHalogenDisplacement(v, report))    { firedAny = true; continue; }
      if (this._ruleMetalDisplacement(v, report))      { firedAny = true; continue; }
      if (this._ruleNeutralisation(v, report))         { firedAny = true; continue; }
      if (this._ruleDoubleDisplacement(v, report))     { firedAny = true; continue; }
    }

    if (pass >= MAX_PASSES) {
      report.warnings.push("Reaction cascade reached the iteration limit — some equilibria may be incomplete.");
    }
  };

  /* ========================================================================
   * 9.6 REACTION RULES
   * ======================================================================*/

  /* ---- helper: locate the strongest acid currently in solution ---- */
  function strongestAcid(v) {
    var best = null, bestStrength = -1;
    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      if (!(v.soluteMoles[id] > 0)) continue;
      if (!ACID_INFO[id]) continue;
      var sp = DB.get(id);
      if (!sp) continue;
      var strength = (sp.acidity === "strong acid") ? 2 : 1;
      if (strength > bestStrength) { bestStrength = strength; best = id; }
    }
    return best;
  }

  /* ---- helper: locate the strongest base currently in solution ---- */
  function strongestBase(v) {
    var best = null, bestStrength = -1;
    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      if (!(v.soluteMoles[id] > 0)) continue;
      if (!BASE_INFO[id]) continue;
      var sp = DB.get(id);
      if (!sp) continue;
      var strength = (sp.acidity === "strong base") ? 2 : 1;
      if (strength > bestStrength) { bestStrength = strength; best = id; }
    }
    return best;
  }

  /* ---- helper: find a solid species in the vessel ---- */
  function findSolid(v, ids) {
    for (var i = 0; i < v.solids.length; i++) {
      for (var j = 0; j < ids.length; j++) {
        if (v.solids[i].id === ids[j] && v.solids[i].moles > 1e-12) return v.solids[i].id;
      }
    }
    return null;
  }

  /* ---- helper: find a solute species in the vessel ---- */
  function findSolute(v, ids) {
    for (var j = 0; j < ids.length; j++) {
      if (v.soluteMoles[ids[j]] > 1e-12) return ids[j];
    }
    return null;
  }

  /* ---- helper: register an event with an equation ---- */
  function emit(report, event) {
    report.events.push(event);
    if (event.equation) report.equations.push(event.equation);
  }

  /* ---- helper: apply thermal energy to the vessel ---- */
  function applyHeat(v, joules) {
    var mass = v.solutionMass();
    if (mass <= 0) {
      /* Dry vessel — apply to the solid charge with a nominal Cp */
      var solidMass = 0;
      for (var i = 0; i < v.solids.length; i++) solidMass += v.solids[i].mass;
      if (solidMass <= 0) return 0;
      mass = solidMass;
    }
    var cp = v.solutionCp();
    if (!(cp > 0)) cp = K.DEFAULT_CP_SOLN;
    var dT = joules / (mass * cp);
    v.temperature += dT;
    v.heatExchanged += joules;
    return dT;
  }

  /* ======================================================================
   * RULE 1 — COMBUSTION
   * ====================================================================*/

  Engine.prototype._ruleCombustion = function (v, report) {
    if (v.flamePower <= 0) return false;

    var o2 = v.gases.O2 || 0;
    if (o2 <= 0) return false;

    /* find a fuel in the gas phase or dissolved */
    var fuelId = null, fuelMoles = 0;
    for (var id in FUELS) {
      if (!Object.prototype.hasOwnProperty.call(FUELS, id)) continue;
      var g = v.gases[id] || 0;
      var s = v.soluteMoles[id] || 0;
      var total = g + s;
      if (total > 1e-12) { fuelId = id; fuelMoles = total; break; }
    }
    if (!fuelId) return false;

    var F = FUELS[fuelId];
    var needO2 = F.co2 + F.h2o / 2 - (fuelId === "H2" ? 0 : 0);
    /* General hydrocarbon: CxHy + (x + y/4) O2 -> x CO2 + (y/2) H2O */
    if (fuelId === "H2")      needO2 = 0.5;
    else if (fuelId === "CH4") needO2 = 2;
    else if (fuelId === "C2H2") needO2 = 2.5;
    else if (fuelId === "C2H4") needO2 = 3;
    else if (fuelId === "C2H5OH") needO2 = 3;
    else if (fuelId === "C3H8") needO2 = 5;
    else if (fuelId === "C4H10") needO2 = 6.5;
    else if (fuelId === "C8H18") needO2 = 12.5;
    else if (fuelId === "C6H6") needO2 = 7.5;
    else if (fuelId === "C6H12") needO2 = 9;
    else if (fuelId === "C6H14") needO2 = 9.5;
    else if (fuelId === "CH3OH") needO2 = 1.5;
    else if (fuelId === "CH3COCH3") needO2 = 4;

    var limiting = Math.min(fuelMoles, o2 / needO2);
    if (!(limiting > 1e-9)) return false;

    var co2Moles = F.co2 * limiting;
    var h2oMoles = F.h2o * limiting;

    /* consume */
    var fromGas = Math.min(v.gases[fuelId] || 0, limiting);
    if (fromGas > 0) v.gases[fuelId] -= fromGas;
    var fromSolute = limiting - fromGas;
    if (fromSolute > 0) v.soluteMoles[fuelId] = Math.max(0, (v.soluteMoles[fuelId] || 0) - fromSolute);
    v.gases.O2 -= needO2 * limiting;
    if (v.gases.O2 < 1e-12) delete v.gases.O2;
    if ((v.gases[fuelId] || 0) < 1e-12) delete v.gases[fuelId];

    /* produce */
    v.pushGas("CO2", co2Moles);
    if (v.waterVolume > 0) {
      v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + h2oMoles;
    } else {
      v.waterVolume += h2oMoles * 18.015 / 1000;   // condenses
    }

    /* ---- thermodynamics ---- */
    var dh = F.dh * limiting;                     // kJ for the actual extent
    var joules = dh * 1000;
    var dT = applyHeat(v, joules);

    /* ---- balanced equation ---- */
    var sp = DB.get(fuelId);
    var reactants = [
      { coef: 1, formula: sp ? sp.formula : F.formula, state: F.state },
      { coef: needO2, formula: "O₂", state: "g" }
    ];
    var products = [];
    if (F.co2 > 0) products.push({ coef: F.co2, formula: "CO₂", state: "g" });
    if (F.h2o > 0) products.push({ coef: F.h2o, formula: "H₂O", state: "l" });

    emit(report, {
      type: "combustion",
      equation: renderEquation(reactants, products),
      deltaH: F.dh,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      flameColor: sp ? sp.flameColor : null,
      molesConsumed: { fuelId: limiting, O2: needO2 * limiting },
      molesProduced: { CO2: co2Moles, H2O: h2oMoles },
      gasVolumeL: co2Moles * K.MOLAR_VOLUME_STP,
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Combustion of " + (sp ? sp.name : fuelId) + " — " +
               fmt(Math.abs(F.dh * limiting), 1) + " kJ released. ΔT = " +
               fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 2 — ALKALI METAL + WATER
   * ----------------------------------------------------------------------
   * *** THE CRITICAL "FALSE WATER" GUARD ***
   * If v.waterVolume === 0 (e.g. immediately after vessel.reset()) this rule
   * returns false without touching the metal. Sodium in a dry vessel is a
   * completely inert shiny lump.
   * ====================================================================*/

  Engine.prototype._ruleAlkaliMetalWater = function (v, report) {
    /* -------- DRY VESSEL GUARD -------- */
    if (!(v.waterVolume > 0)) return false;

    var metalId = findSolid(v, ALKALI_METALS);
    if (!metalId) return false;

    var availableMetal = v.solidMolesOf(metalId);
    if (!(availableMetal > 1e-9)) return false;

    var metal = DB.get(metalId);
    var hydroxideId = ({ Li: "LiOH", Na: "NaOH", K: "KOH", Rb: "KOH", Cs: "KOH" })[metalId] || "NaOH";
    var hydroxide = DB.get(hydroxideId);

    /* 2 M  +  2 H₂O  →  2 MOH  +  H₂ */
    var waterAvailable = v.waterVolume * 1000 / 18.015;     // mol of H2O
    var maxByWater = waterAvailable / 1;                     // 1 H2O per M
    var extent = Math.min(availableMetal, maxByWater) / 1;   // per 2 M stoichiometry below

    /* Convert to per-2-metal extent */
    var molesM = Math.min(availableMetal, waterAvailable);
    if (!(molesM > 1e-9)) return false;

    var molesH2 = molesM / 2;

    /* ---- consume ---- */
    v.consumeSolid(metalId, molesM);
    v.waterVolume -= (molesM * 18.015) / 1000;
    if (v.waterVolume < 0) v.waterVolume = 0;

    /* ---- produce ---- */
    if (hydroxide) {
      v.soluteMoles[hydroxideId] = (v.soluteMoles[hydroxideId] || 0) + molesM;
    }
    v.pushGas("H2", molesH2);

    /* ---- thermodynamics ---- */
    var reactants = [
      { id: metalId, coef: 2 },
      { id: "H2O",    coef: 2 }
    ];
    var products = [
      { id: hydroxideId, coef: 2 },
      { id: "H2",        coef: 1 }
    ];
    var dhPer2 = reactionEnthalpy(reactants, products);
    /* fall back to literature values if the DB lookup failed */
    if (dhPer2 === null) {
      dhPer2 = ({ Li: -398.0, Na: -368.4, K: -392.2, Rb: -390.0, Cs: -400.0 })[metalId] || -368.4;
    }
    var dhActual = dhPer2 * (molesM / 2);       // kJ for the real extent
    var joules = dhActual * 1000;
    var dT = applyHeat(v, joules);

    /* ---- ignition check ---- */
    var ignition = (metalId === "K" || metalId === "Rb" || metalId === "Cs" ||
                    v.temperature > 340 || molesM > 0.05);

    emit(report, {
      type: "reaction",
      subtype: "alkali-metal-water",
      equation: renderEquation(
        [{ coef: 2, formula: metal.formula, state: "s" },
         { coef: 2, formula: "H₂O", state: "l" }],
        [{ coef: 2, formula: hydroxide ? hydroxide.formula : hydroxideId, state: "aq" },
         { coef: 1, formula: "H₂", state: "g" }]
      ),
      netIonic: "2" + (metal.formula) + "(s) + 2H₂O(l) → 2" +
                (metalId) + "⁺(aq) + 2OH⁻(aq) + H₂(g)",
      deltaH: dhPer2,
      totalHeatJ: joules,
      enthalpyFlag: enthalpyFlag(dhPer2),
      molesConsumed: (function () { var o = {}; o[metalId] = molesM; o.H2O = molesM; return o; })(),
      molesProduced: (function () {
        var o = {}; o[hydroxideId] = molesM; o.H2 = molesH2; return o;
      })(),
      gasVolumeL: molesH2 * K.MOLAR_VOLUME_STP,
      flameColor: ignition ? (metal.flameColor || "bright orange") : null,
      ignition: ignition,
      temperatureK: v.temperature,
      deltaT: dT,
      color: metal.color,
      message: (metal.name) + " reacts violently with water: " +
               fmt(molesH2 * K.MOLAR_VOLUME_STP, 3) + " L of H₂ evolved at STP. " +
               (ignition ? "The metal IGNITES — " + (metal.flameColor || "orange") + " flame!" :
                           "Vigorous fizzing, no ignition.") +
               " ΔT = " + fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 3 — ALKALINE EARTH METAL + WATER
   * ====================================================================*/

  Engine.prototype._ruleAlkalineEarthWater = function (v, report) {
    if (!(v.waterVolume > 0)) return false;

    var metalId = findSolid(v, ALKALINE_EARTH_METALS);
    if (!metalId) return false;

    var availableMetal = v.solidMolesOf(metalId);
    if (!(availableMetal > 1e-9)) return false;

    var metal = DB.get(metalId);
    var hydroxideId = ({ Ca: "Ca_OH_2", Sr: "Sr_OH_2", Ba: "Ba_OH_2" })[metalId];
    var hydroxide = DB.get(hydroxideId);
    if (!hydroxide) return false;

    /* M + 2 H₂O → M(OH)₂ + H₂ */
    var waterAvailable = v.waterVolume * 1000 / 18.015;
    var molesM = Math.min(availableMetal, waterAvailable / 2);
    if (!(molesM > 1e-9)) return false;

    var molesH2 = molesM;

    v.consumeSolid(metalId, molesM);
    v.waterVolume -= (molesM * 2 * 18.015) / 1000;
    if (v.waterVolume < 0) v.waterVolume = 0;
    v.soluteMoles[hydroxideId] = (v.soluteMoles[hydroxideId] || 0) + molesM;
    v.pushGas("H2", molesH2);

    var reactants = [{ id: metalId, coef: 1 }, { id: "H2O", coef: 2 }];
    var products  = [{ id: hydroxideId, coef: 1 }, { id: "H2", coef: 1 }];
    var dhPer1 = reactionEnthalpy(reactants, products);
    if (dhPer1 === null) dhPer1 = ({ Ca: -414.0, Sr: -430.0, Ba: -430.0 })[metalId] || -414.0;

    var joules = dhPer1 * molesM * 1000;
    var dT = applyHeat(v, joules);

    emit(report, {
      type: "reaction",
      subtype: "alkaline-earth-water",
      equation: renderEquation(
        [{ coef: 1, formula: metal.formula, state: "s" },
         { coef: 2, formula: "H₂O", state: "l" }],
        [{ coef: 1, formula: hydroxide.formula, state: "aq" },
         { coef: 1, formula: "H₂", state: "g" }]
      ),
      deltaH: dhPer1,
      totalHeatJ: joules,
      enthalpyFlag: enthalpyFlag(dhPer1),
      molesConsumed: (function () { var o = {}; o[metalId] = molesM; o.H2O = molesM * 2; return o; })(),
      molesProduced: (function () { var o = {}; o[hydroxideId] = molesM; o.H2 = molesH2; return o; })(),
      gasVolumeL: molesH2 * K.MOLAR_VOLUME_STP,
      flameColor: metal.flameColor,
      temperatureK: v.temperature,
      deltaT: dT,
      message: metal.name + " fizzes steadily in water — " +
               fmt(molesH2 * K.MOLAR_VOLUME_STP, 3) + " L H₂ at STP. ΔT = " + fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 4 — ACTIVE METAL + DILUTE ACID  →  salt + H₂
   * ====================================================================*/

  Engine.prototype._ruleMetalAcid = function (v, report) {
    var acidId = strongestAcid(v);
    if (!acidId) return false;
    var acidInfo = ACID_INFO[acidId];
    if (!acidInfo) return false;

    /* HNO3 is an oxidising acid — it does NOT give H2 with most metals */
    if (acidId === "HNO3" || acidId === "H2SO4") {
      /* Concentrated H2SO4 is also oxidising; approximate by allowing only dilute behaviour */
    }

    var metalId = findSolid(v, ACID_ACTIVE_METALS);
    if (!metalId) return false;

    var metal = DB.get(metalId);
    var availMetal = v.solidMolesOf(metalId);
    var availAcid  = v.soluteMoles[acidId] || 0;
    if (!(availMetal > 1e-9) || !(availAcid > 1e-9)) return false;

    var cationKey = ({ Mg: "Mg", Al: "Al", Zn: "Zn", Fe: "Fe2",
                       Ca: "Ca", Mn: "Mn2", Ni: "Ni",
                       Sn: "Sn", Pb: "Pb" })[metalId];
    if (!cationKey) return false;
    var cCharge = CATIONS[cationKey].charge;
    var aCharge = ANIONS[acidInfo.anion].charge;
    var g = gcd(cCharge, aCharge);
    var nMetal = aCharge / g;      // metal atoms per salt formula unit
    var nAcid  = cCharge / g;      // acid molecules per salt formula unit

    var saltId = SALT_BY_IONS[cationKey + "|" + acidInfo.anion] || null;
    var salt = saltId ? DB.get(saltId) : null;

    /* M + n HX → MXₙ + (n/2) H₂ */
    var extent = Math.min(availMetal / nMetal, availAcid / nAcid);
    if (!(extent > 1e-9)) return false;

    var h2Moles = extent * nAcid / 2;
    if (h2Moles < 0) h2Moles = 0;

    /* consume */
    v.consumeSolid(metalId, extent * nMetal);
    v.soluteMoles[acidId] -= extent * nAcid;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];

    /* produce */
    if (saltId) {
      v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + extent;
      var sol = isSoluble(cationKey, acidInfo.anion);
      if (sol !== true && salt) {
        v.soluteMoles[saltId] -= extent;
        if (v.soluteMoles[saltId] < 1e-12) delete v.soluteMoles[saltId];
        v.pushPrecipitate(saltId, extent);
      }
    }
    v.pushGas("H2", h2Moles);

    /* thermodynamics */
    var saltFormula = salt ? salt.formula : buildSaltFormula(cationKey, acidInfo.anion);
    var dh = (metalId === "Zn" ? -153.9 :
              metalId === "Mg" ? -462.0 :
              metalId === "Fe" ? -87.9  :
              metalId === "Al" ? -531.0 : -150.0) * extent;

    var joules = dh * 1000;
    var dT = applyHeat(v, joules);

    var acidSp = DB.get(acidId);
    emit(report, {
      type: "reaction",
      subtype: "metal-acid",
      equation: renderEquation(
        [{ coef: nMetal, formula: metal.formula, state: "s" },
         { coef: nAcid, formula: acidSp ? acidSp.formula : acidId, state: "aq" }],
        [{ coef: 1, formula: saltFormula, state: "aq" },
         { coef: nAcid / 2, formula: "H₂", state: "g" }]
      ),
      netIonic: nMetal + metal.formula + "(s) + " + nAcid + "H⁺(aq) → " +
                nMetal + CATIONS[cationKey].display + (cCharge > 1 ? "(" + cCharge + "+)" : "⁺") +
                "(aq) + " + (nAcid / 2) + "H₂(g)",
      deltaH: extent > 0 ? dh / extent : null,
      totalHeatJ: joules,
      enthalpyFlag: enthalpyFlag(dh),
      molesConsumed: (function () { var o = {}; o[metalId] = extent * nMetal; o[acidId] = extent * nAcid; return o; })(),
      molesProduced: (function () { var o = {}; if (saltId) o[saltId] = extent; o.H2 = h2Moles; return o; })(),
      gasVolumeL: h2Moles * K.MOLAR_VOLUME_STP,
      temperatureK: v.temperature,
      deltaT: dT,
      message: metal.name + " dissolves in " + (acidSp ? acidSp.name : acidId) +
               " — " + fmt(h2Moles * K.MOLAR_VOLUME_STP, 3) + " L H₂ at STP. ΔT = " +
               fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 5 — METAL OXIDE + ACID  →  salt + water
   * ====================================================================*/

  Engine.prototype._ruleMetalOxideAcid = function (v, report) {
    var acidId = strongestAcid(v);
    if (!acidId) return false;
    var acidInfo = ACID_INFO[acidId];
    if (!acidInfo) return false;

    var oxideIds = ["CuO", "Cu2O", "ZnO", "MgO", "CaO", "BaO", "SrO",
                    "Na2O", "Li2O", "K2O", "PbO", "PbO2", "Ag2O",
                    "MnO2", "Fe2O3", "Fe3O4", "TiO2", "Cr2O3", "Al2O3"];
    var oxideId = findSolid(v, oxideIds);
    if (!oxideId) return false;

    var decomp = decomposeSpecies(oxideId);
    if (!decomp || !decomp.cation || !decomp.anion) return false;
    if (decomp.anion !== "O") return false;

    var cationKey = decomp.cation;
    var cCharge = CATIONS[cationKey].charge;
    var aCharge = ANIONS[acidInfo.anion].charge;
    var g = gcd(cCharge, aCharge);
    var nMetal = aCharge / g;
    var nAcid  = cCharge / g;

    var availOxide = v.solidMolesOf(oxideId);
    var availAcid  = v.soluteMoles[acidId] || 0;
    if (!(availOxide > 1e-9) || !(availAcid > 1e-9)) return false;

    var extent = Math.min(availOxide / 1, availAcid / (nAcid * 2));
    if (!(extent > 1e-9)) return false;

    var saltId = SALT_BY_IONS[cationKey + "|" + acidInfo.anion] || null;
    var salt = saltId ? DB.get(saltId) : null;

    v.consumeSolid(oxideId, extent);
    v.soluteMoles[acidId] -= extent * nAcid * 2;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];

    if (saltId) v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + extent * nMetal;
    if (v.waterVolume > 0) v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + extent;

    var dh = -55.0 * extent;                 // approximate
    var joules = dh * 1000;
    var dT = applyHeat(v, joules);

    var oxideSp = DB.get(oxideId);
    var acidSp  = DB.get(acidId);
    var saltFormula = salt ? salt.formula : buildSaltFormula(cationKey, acidInfo.anion);

    emit(report, {
      type: "reaction",
      subtype: "metal-oxide-acid",
      equation: renderEquation(
        [{ coef: 1, formula: oxideSp.formula, state: "s" },
         { coef: nAcid * 2, formula: acidSp.formula, state: "aq" }],
        [{ coef: nMetal, formula: saltFormula, state: "aq" },
         { coef: nMetal * nAcid * 2 / 2, formula: "H₂O", state: "l" }]
      ),
      deltaH: -55.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[oxideId] = extent; o[acidId] = extent * nAcid * 2; return o; })(),
      molesProduced: (function () { var o = {}; if (saltId) o[saltId] = extent * nMetal; o.H2O = extent; return o; })(),
      temperatureK: v.temperature,
      deltaT: dT,
      message: oxideSp.name + " dissolves in " + acidSp.name +
               " — the solution warms noticeably. ΔT = " + fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 6 — CARBONATE / BICARBONATE + ACID  →  salt + H₂O + CO₂
   * ====================================================================*/

  Engine.prototype._ruleCarbonateAcid = function (v, report) {
    var acidId = strongestAcid(v);
    if (!acidId) return false;
    var acidInfo = ACID_INFO[acidId];
    if (!acidInfo) return false;

    /* ---- carbonate ---- */
    var carbIds = ["CaCO3", "Na2CO3", "K2CO3", "MgCO3", "BaCO3", "CuCO3"];
    var carbId = findSolute(v, carbIds) || findSolid(v, carbIds);
    var isBicarb = false;

    if (!carbId) {
      var bicarbIds = ["NaHCO3", "KHCO3"];
      carbId = findSolute(v, bicarbIds) || findSolid(v, bicarbIds);
      if (carbId) isBicarb = true;
    }
    if (!carbId) return false;

    var decomp = decomposeSpecies(carbId);
    if (!decomp || !decomp.cation) return false;
    var cationKey = decomp.cation;
    var cCharge = CATIONS[cationKey].charge;
    var aCharge = ANIONS[acidInfo.anion].charge;
    var g = gcd(cCharge, aCharge);
    var nMetal = aCharge / g;
    var nAcid  = cCharge / g;

    /* stoichiometry: 1 CO3²⁻ consumes 2 H⁺; 1 HCO3⁻ consumes 1 H⁺ */
    var protonsPerCarbonate = isBicarb ? 1 : 2;
    var totalAcidNeeded = nAcid * protonsPerCarbonate;

    var availCarb = (v.soluteMoles[carbId] || 0) + v.solidMolesOf(carbId);
    var availAcid = v.soluteMoles[acidId] || 0;
    if (!(availCarb > 1e-9) || !(availAcid > 1e-9)) return false;

    var extent = Math.min(availCarb, availAcid / totalAcidNeeded);
    if (!(extent > 1e-9)) return false;

    var co2Moles = extent;

    /* consume (prefer dissolved carbonate, then solid) */
    var fromSolute = Math.min(v.soluteMoles[carbId] || 0, extent);
    if (fromSolute > 0) {
      v.soluteMoles[carbId] -= fromSolute;
      if (v.soluteMoles[carbId] < 1e-12) delete v.soluteMoles[carbId];
    }
    var fromSolid = extent - fromSolute;
    if (fromSolid > 0) v.consumeSolid(carbId, fromSolid);

    v.soluteMoles[acidId] -= extent * totalAcidNeeded;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];

    /* produce */
    var saltId = SALT_BY_IONS[cationKey + "|" + acidInfo.anion] || null;
    var salt = saltId ? DB.get(saltId) : null;
    if (saltId) v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + extent * nMetal;

    var h2oMoles = isBicarb ? 1 : 1;
    if (v.waterVolume > 0) v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + extent * h2oMoles;

    v.pushGas("CO2", co2Moles);

    /* thermodynamics */
    var dhPer = isBicarb ? -42.0 : -92.0;
    var joules = dhPer * extent * 1000;
    var dT = applyHeat(v, joules);

    var carbSp = DB.get(carbId);
    var acidSp = DB.get(acidId);
    var saltFormula = salt ? salt.formula : buildSaltFormula(cationKey, acidInfo.anion);

    emit(report, {
      type: "reaction",
      subtype: isBicarb ? "bicarbonate-acid" : "carbonate-acid",
      equation: renderEquation(
        [{ coef: 1, formula: carbSp.formula, state: carbSp.state === "solid" ? "s" : "aq" },
         { coef: totalAcidNeeded, formula: acidSp.formula, state: "aq" }],
        [{ coef: nMetal, formula: saltFormula, state: "aq" },
         { coef: h2oMoles, formula: "H₂O", state: "l" },
         { coef: 1, formula: "CO₂", state: "g" }]
      ),
      deltaH: dhPer,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[carbId] = extent; o[acidId] = extent * totalAcidNeeded; return o; })(),
      molesProduced: (function () {
        var o = {}; if (saltId) o[saltId] = extent * nMetal;
        o.H2O = extent * h2oMoles; o.CO2 = co2Moles; return o;
      })(),
      gasVolumeL: co2Moles * K.MOLAR_VOLUME_STP,
      effervescence: true,
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Brisk effervescence! " + fmt(co2Moles * K.MOLAR_VOLUME_STP, 3) +
               " L of CO₂ evolved at STP. ΔT = " + fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 7 — SULFIDE + ACID  →  salt + H₂S↑
   * ====================================================================*/

  Engine.prototype._ruleSulfideAcid = function (v, report) {
    var acidId = strongestAcid(v);
    if (!acidId) return false;
    var acidInfo = ACID_INFO[acidId];
    if (!acidInfo) return false;

    var sulfIds = ["FeS", "ZnS", "Na2S", "CuS", "PbS", "Ag2S"];
    var sulfId = findSolute(v, sulfIds) || findSolid(v, sulfIds);
    if (!sulfId) return false;
    /* CuS, PbS, Ag2S are too insoluble to react with dilute acid */
    if (sulfId === "CuS" || sulfId === "PbS" || sulfId === "Ag2S") return false;

    var decomp = decomposeSpecies(sulfId);
    if (!decomp || !decomp.cation) return false;
    var cationKey = decomp.cation;
    var cCharge = CATIONS[cationKey].charge;
    var aCharge = ANIONS[acidInfo.anion].charge;
    var g = gcd(cCharge, aCharge);
    var nMetal = aCharge / g;
    var nAcid  = cCharge / g;

    var availSulf = (v.soluteMoles[sulfId] || 0) + v.solidMolesOf(sulfId);
    var availAcid = v.soluteMoles[acidId] || 0;
    var extent = Math.min(availSulf, availAcid / (nAcid * 2));
    if (!(extent > 1e-9)) return false;

    var fromSolute = Math.min(v.soluteMoles[sulfId] || 0, extent);
    if (fromSolute > 0) {
      v.soluteMoles[sulfId] -= fromSolute;
      if (v.soluteMoles[sulfId] < 1e-12) delete v.soluteMoles[sulfId];
    }
    if (extent - fromSolute > 0) v.consumeSolid(sulfId, extent - fromSolute);

    v.soluteMoles[acidId] -= extent * nAcid * 2;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];

    var saltId = SALT_BY_IONS[cationKey + "|" + acidInfo.anion] || null;
    var salt = saltId ? DB.get(saltId) : null;
    if (saltId) v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + extent * nMetal;

    v.pushGas("H2S", extent);

    var joules = -35.0 * extent * 1000;
    var dT = applyHeat(v, joules);

    var sulfSp = DB.get(sulfId);
    var acidSp = DB.get(acidId);
    var saltFormula = salt ? salt.formula : buildSaltFormula(cationKey, acidInfo.anion);

    emit(report, {
      type: "reaction",
      subtype: "sulfide-acid",
      equation: renderEquation(
        [{ coef: 1, formula: sulfSp.formula, state: sulfSp.state === "solid" ? "s" : "aq" },
         { coef: nAcid * 2, formula: acidSp.formula, state: "aq" }],
        [{ coef: nMetal, formula: saltFormula, state: "aq" },
         { coef: 1, formula: "H₂S", state: "g" }]
      ),
      deltaH: -35.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[sulfId] = extent; o[acidId] = extent * nAcid * 2; return o; })(),
      molesProduced: (function () { var o = {}; if (saltId) o[saltId] = extent * nMetal; o.H2S = extent; return o; })(),
      gasVolumeL: extent * K.MOLAR_VOLUME_STP,
      toxicGas: "H₂S",
      temperatureK: v.temperature,
      deltaT: dT,
      message: "⚠ Rotten-egg smell! " + fmt(extent * K.MOLAR_VOLUME_STP, 3) +
               " L of toxic H₂S released. Work in a fume hood!"
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 8 — SULFITE + ACID  →  salt + H₂O + SO₂↑
   * ====================================================================*/

  Engine.prototype._ruleSulfiteAcid = function (v, report) {
    var acidId = strongestAcid(v);
    if (!acidId) return false;
    var acidInfo = ACID_INFO[acidId];
    if (!acidInfo) return false;

    /* H2SO3 present in solution behaves like dissolved SO2 */
    var sulfiteId = findSolute(v, ["H2SO3"]) || findSolid(v, ["Na2SO3"]);
    if (!sulfiteId) return false;

    var availSulfite = (v.soluteMoles[sulfiteId] || 0) + v.solidMolesOf(sulfiteId);
    var availAcid = v.soluteMoles[acidId] || 0;
    var extent = Math.min(availSulfite, availAcid);
    if (!(extent > 1e-9)) return false;

    var fromSolute = Math.min(v.soluteMoles[sulfiteId] || 0, extent);
    if (fromSolute > 0) {
      v.soluteMoles[sulfiteId] -= fromSolute;
      if (v.soluteMoles[sulfiteId] < 1e-12) delete v.soluteMoles[sulfiteId];
    }
    if (extent - fromSolute > 0) v.consumeSolid(sulfiteId, extent - fromSolute);

    v.soluteMoles[acidId] -= extent;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];

    v.pushGas("SO2", extent);
    var joules = -40.0 * extent * 1000;
    var dT = applyHeat(v, joules);

    emit(report, {
      type: "reaction",
      subtype: "sulfite-acid",
      equation: "H₂SO₃(aq) → H₂O(l) + SO₂(g)",
      deltaH: -40.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[sulfiteId] = extent; o[acidId] = extent; return o; })(),
      molesProduced: { SO2: extent },
      gasVolumeL: extent * K.MOLAR_VOLUME_STP,
      toxicGas: "SO₂",
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Pungent SO₂ evolved — " + fmt(extent * K.MOLAR_VOLUME_STP, 3) +
               " L at STP. This gas is a serious respiratory irritant."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 9 — AMMONIUM SALT + STRONG BASE  →  salt + H₂O + NH₃↑
   * ====================================================================*/

  Engine.prototype._ruleAmmoniumBase = function (v, report) {
    var baseId = strongestBase(v);
    if (!baseId) return false;
    var baseInfo = BASE_INFO[baseId];
    if (!baseInfo) return false;
    var baseSp = DB.get(baseId);
    if (!sp_isStrongBase(baseSp)) return false;

    var ammIds = ["NH4Cl", "NH4OH", "NH4_2SO4", "NH4_2Fe_SO4_2_6H2O", "NH3"];
    var ammId = findSolute(v, ammIds);
    if (!ammId) return false;

    var availAmm  = v.soluteMoles[ammId] || 0;
    var availBase = v.soluteMoles[baseId] || 0;
    var extent = Math.min(availAmm, availBase);
    if (!(extent > 1e-9)) return false;

    v.soluteMoles[ammId] -= extent;
    if (v.soluteMoles[ammId] < 1e-12) delete v.soluteMoles[ammId];
    v.soluteMoles[baseId] -= extent;
    if (v.soluteMoles[baseId] < 1e-12) delete v.soluteMoles[baseId];

    v.pushGas("NH3", extent);
    if (v.waterVolume > 0) v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + extent;

    var joules = -52.0 * extent * 1000;
    var dT = applyHeat(v, joules);

    emit(report, {
      type: "reaction",
      subtype: "ammonium-base",
      equation: "NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)",
      netIonic: "NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)",
      deltaH: -52.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[ammId] = extent; o[baseId] = extent; return o; })(),
      molesProduced: { NH3: extent, H2O: extent },
      gasVolumeL: extent * K.MOLAR_VOLUME_STP,
      pungentGas: "NH₃",
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Sharp ammonia smell — " + fmt(extent * K.MOLAR_VOLUME_STP, 3) +
               " L of NH₃ liberated at STP."
    });

    v.reactionCount++;
    return true;
  };

  function sp_isStrongBase(sp) {
    return sp && (sp.acidity === "strong base");
  }

  /* ======================================================================
   * RULE 10 — NON-METAL OXIDE + BASE  →  salt + H₂O
   * ====================================================================*/

  Engine.prototype._ruleNonMetalOxideBase = function (v, report) {
    var baseId = strongestBase(v);
    if (!baseId) return false;

    /* CO2 and SO2 dissolve to acidic species which then neutralise the base */
    var oxideId = null, acidProductId = null;
    if ((v.gases.CO2 || 0) > 1e-9)      { oxideId = "CO2"; acidProductId = "Na2CO3"; }
    else if ((v.gases.SO2 || 0) > 1e-9) { oxideId = "SO2"; acidProductId = "Na2SO3"; }
    if (!oxideId) return false;

    var baseSp = DB.get(baseId);
    var baseInfo = BASE_INFO[baseId];
    if (!baseInfo) return false;

    /* CO2 + 2 OH⁻ → CO3²⁻ + H2O ; SO2 + 2 OH⁻ → SO3²⁻ + H2O */
    var baseMoles = v.soluteMoles[baseId] || 0;
    var oxideMoles = v.gases[oxideId] || 0;
    var extent = Math.min(oxideMoles, baseMoles / 2);
    if (!(extent > 1e-9)) return false;

    /* Build the carbonate/sulfite salt of the base cation */
    var anionKey = (oxideId === "CO2") ? "CO3" : "SO3";
    var saltId = SALT_BY_IONS[baseInfo.cation + "|" + anionKey] || null;
    var saltSp = saltId ? DB.get(saltId) : null;

    v.gases[oxideId] -= extent;
    if (v.gases[oxideId] < 1e-12) delete v.gases[oxideId];
    v.soluteMoles[baseId] -= extent * 2;
    if (v.soluteMoles[baseId] < 1e-12) delete v.soluteMoles[baseId];

    if (saltId) {
      var sol = isSoluble(baseInfo.cation, anionKey);
      if (sol === true) {
        v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + extent;
      } else {
        v.pushPrecipitate(saltId, extent);
      }
    }
    if (v.waterVolume > 0) v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + extent;

    var joules = -110.0 * extent * 1000;
    var dT = applyHeat(v, joules);

    var saltFormula = saltSp ? saltSp.formula : buildSaltFormula(baseInfo.cation, anionKey);
    var oxideFormula = oxideId === "CO2" ? "CO₂" : "SO₂";

    emit(report, {
      type: "reaction",
      subtype: "nonmetal-oxide-base",
      equation: renderEquation(
        [{ coef: 1, formula: oxideFormula, state: "g" },
         { coef: 2, formula: baseSp.formula, state: "aq" }],
        [{ coef: 1, formula: saltFormula, state: "aq" },
         { coef: 1, formula: "H₂O", state: "l" }]
      ),
      deltaH: -110.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: (function () { var o = {}; o[oxideId] = extent; o[baseId] = extent * 2; return o; })(),
      molesProduced: (function () { var o = {}; if (saltId) o[saltId] = extent; o.H2O = extent; return o; })(),
      temperatureK: v.temperature,
      deltaT: dT,
      message: oxideFormula + " is absorbed by the alkali — a carbonate/sulfite salt forms. ΔT = " +
               fmt(dT, 2) + " K."
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 11 — CATALYTIC DECOMPOSITION OF HYDROGEN PEROXIDE
   * ====================================================================*/

  Engine.prototype._rulePeroxideDecomposition = function (v, report) {
    if (!(v.waterVolume > 0)) return false;
    var h2o2 = v.soluteMoles.H2O2 || 0;
    if (!(h2o2 > 1e-9)) return false;

    var catId = findSolute(v, PEROXIDE_CATALYSTS) || findSolid(v, PEROXIDE_CATALYSTS);
    if (!catId) return false;
    if (catId === "KI") {
      /* KI is catalytic only at low concentration; approximate as catalytic */
    }

    var catSp = DB.get(catId);

    /* 2 H₂O₂ → 2 H₂O + O₂ */
    var extent = h2o2 / 2;
    v.soluteMoles.H2O2 -= 2 * extent;
    if (v.soluteMoles.H2O2 < 1e-12) delete v.soluteMoles.H2O2;
    v.pushGas("O2", extent);

    var dh = -98.0 * extent * 2;        // ≈ -196 kJ per 2 mol H2O2
    var joules = -98.0 * 2 * extent * 1000;
    var dT = applyHeat(v, joules);

    emit(report, {
      type: "reaction",
      subtype: "catalytic-decomposition",
      equation: "2H₂O₂(aq) → 2H₂O(l) + O₂(g)",
      catalyst: catSp ? catSp.name : catId,
      deltaH: -196.0,
      totalHeatJ: joules,
      enthalpyFlag: "EXOTHERMIC",
      molesConsumed: { H2O2: 2 * extent },
      molesProduced: { H2O: 2 * extent, O2: extent },
      gasVolumeL: extent * K.MOLAR_VOLUME_STP,
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Catalytic decomposition by " + (catSp ? catSp.name : catId) +
               " — " + fmt(extent * K.MOLAR_VOLUME_STP, 3) +
               " L of O₂ gas evolved at STP. The glowing splint test would relight!"
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 12 — HALOGEN DISPLACEMENT
   * ====================================================================*/

  Engine.prototype._ruleHalogenDisplacement = function (v, report) {
    /* Cl2 + 2 KI → 2 KCl + I2 ; Br2 + 2 KI → 2 KBr + I2 */
    var halogenId = null;
    if ((v.gases.Cl2 || 0) > 1e-9)      halogenId = "Cl2";
    else if ((v.soluteMoles.Br2 || 0) > 1e-9) halogenId = "Br2";
    else if ((v.soluteMoles.Cl2 || 0) > 1e-9) halogenId = "Cl2";
    if (!halogenId) return false;

    var halSp = DB.get(halogenId);
    var displacedId = (halogenId === "Cl2") ? "I" : "I";
    var halPower = (halogenId === "Cl2") ? 2 : 1;

    /* find a soluble iodide or bromide */
    var targets = [
      { id: "KI",    cation: "K",  anion: "I" },
      { id: "NaBr",  cation: "Na", anion: "Br" },
      { id: "KBr",   cation: "K",  anion: "Br" },
      { id: "NaF",   cation: "Na", anion: "F"  }
    ];

    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var nMoles = v.soluteMoles[t.id] || 0;
      if (!(nMoles > 1e-9)) continue;

      /* Fluoride cannot be displaced by Cl2 or Br2 */
      if (t.anion === "F") continue;
      /* Br2 cannot displace Br-; Cl2 cannot displace Cl- */
      if (halogenId === "Br2" && t.anion === "Br") continue;

      var oxidiserMoles;
      if (halogenId === "Cl2") oxidiserMoles = (v.gases.Cl2 || 0) + (v.soluteMoles.Cl2 || 0);
      else                     oxidiserMoles = v.soluteMoles.Br2 || 0;

      var extent = Math.min(nMoles / 2, oxidiserMoles);
      if (!(extent > 1e-9)) continue;

      /* consume halogen */
      if (halogenId === "Cl2") {
        var fromGas = Math.min(v.gases.Cl2 || 0, extent);
        v.gases.Cl2 = (v.gases.Cl2 || 0) - fromGas;
        if (v.gases.Cl2 < 1e-12) delete v.gases.Cl2;
        var rest = extent - fromGas;
        if (rest > 0) {
          v.soluteMoles.Cl2 = Math.max(0, (v.soluteMoles.Cl2 || 0) - rest);
          if (v.soluteMoles.Cl2 < 1e-12) delete v.soluteMoles.Cl2;
        }
      } else {
        v.soluteMoles.Br2 -= extent;
        if (v.soluteMoles.Br2 < 1e-12) delete v.soluteMoles.Br2;
      }

      /* consume the halide salt */
      v.soluteMoles[t.id] -= 2 * extent;
      if (v.soluteMoles[t.id] < 1e-12) delete v.soluteMoles[t.id];

      /* produce the new halide salt + elemental halogen */
      var productSaltId = null;
      if (halogenId === "Cl2") {
        productSaltId = (t.cation + "|Cl" in SALT_BY_IONS) ? SALT_BY_IONS[t.cation + "|Cl"] : null;
      } else {
        productSaltId = SALT_BY_IONS[t.cation + "|Br"] || null;
      }
      if (productSaltId) v.soluteMoles[productSaltId] = (v.soluteMoles[productSaltId] || 0) + 2 * extent;

      var freeHalogenId = (halogenId === "Cl2") ? "I2" : "I2";
      v.pushSolid(freeHalogenId, extent, "product");
      /* I2 is only sparingly soluble — most precipitates */
      v.pushPrecipitate(freeHalogenId, extent);

      var joules = -105.0 * extent * 1000;
      var dT = applyHeat(v, joules);

      var productSaltSp = productSaltId ? DB.get(productSaltId) : null;
      var productHalogenSp = DB.get(freeHalogenId);

      emit(report, {
        type: "reaction",
        subtype: "halogen-displacement",
        equation: renderEquation(
          [{ coef: 1, formula: halSp.formula, state: halSp.state },
           { coef: 2, formula: DB.get(t.id).formula, state: "aq" }],
          [{ coef: 2, formula: productSaltSp ? productSaltSp.formula : (t.cation + "Cl"), state: "aq" },
           { coef: 1, formula: productHalogenSp.formula, state: "s" }]
        ),
        deltaH: -105.0,
        totalHeatJ: joules,
        enthalpyFlag: "EXOTHERMIC",
        molesConsumed: (function () { var o = {}; o[halogenId] = extent; o[t.id] = 2 * extent; return o; })(),
        molesProduced: (function () {
          var o = {}; if (productSaltId) o[productSaltId] = 2 * extent;
          o[freeHalogenId] = extent; return o;
        })(),
        precipitateMassG: extent * (productHalogenSp ? productHalogenSp.molarMass : 253.8),
        temperatureK: v.temperature,
        deltaT: dT,
        message: halSp.name + " displaces " + t.anion + "⁻ — a dark precipitate of " +
                 (productHalogenSp ? productHalogenSp.name : freeHalogenId) + " forms."
      });

      v.reactionCount++;
      return true;
    }
    return false;
  };

  /* ======================================================================
   * RULE 13 — METAL DISPLACEMENT FROM SALT SOLUTION
   * ====================================================================*/

  Engine.prototype._ruleMetalDisplacement = function (v, report) {
    if (!(v.waterVolume > 0)) return false;

    var reactive = ["Mg", "Al", "Zn", "Fe", "Ni", "Sn", "Pb"];
    var metalId = findSolid(v, reactive);
    if (!metalId) return false;

    var metalSp = DB.get(metalId);
    var metalCation = ({ Mg: "Mg", Al: "Al", Zn: "Zn",
                         Fe: "Fe2", Ni: "Ni", Sn: "Sn", Pb: "Pb" })[metalId];
    if (!metalCation) return false;

    /* Find a salt whose cation is LESS reactive than the metal */
    var displaceable = {
      "CuSO4":    { cation: "Cu",  metal: "Cu" },
      "CuSO4_5H2O":{ cation: "Cu", metal: "Cu" },
      "CuCl2":    { cation: "Cu",  metal: "Cu" },
      "Cu_NO3_2": { cation: "Cu",  metal: "Cu" },
      "AgNO3":    { cation: "Ag",  metal: "Ag" },
      "Pb_NO3_2": { cation: "Pb",  metal: "Pb" },
      "Cu_CH3COO_2": { cation: "Cu", metal: "Cu" }
    };

    var order = { Mg: 0, Al: 1, Zn: 2, Fe: 3, Ni: 4, Sn: 5, Pb: 6, Cu: 7, Ag: 8 };

    for (var saltId in displaceable) {
      if (!Object.prototype.hasOwnProperty.call(displaceable, saltId)) continue;
      var entry = displaceable[saltId];
      var nMoles = v.soluteMoles[saltId] || 0;
      if (!(nMoles > 1e-9)) continue;
      if (!(order[metalId] < order[entry.metal])) continue;

      var availMetal = v.solidMolesOf(metalId);
      var cChargeMetal = CATIONS[metalCation].charge;
      var cChargeTarget = CATIONS[entry.cation].charge;
      var g = gcd(cChargeMetal, cChargeTarget);
      var nMetal  = cChargeTarget / g;
      var nTarget = cChargeMetal / g;

      var extent = Math.min(nMoles / nTarget, availMetal / nMetal);
      if (!(extent > 1e-9)) continue;

      v.consumeSolid(metalId, extent * nMetal);
      v.soluteMoles[saltId] -= extent * nTarget;
      if (v.soluteMoles[saltId] < 1e-12) delete v.soluteMoles[saltId];

      var newSaltId = SALT_BY_IONS[metalCation + "|" + (decomposeSpecies(saltId) || {}).anion];
      if (newSaltId) v.soluteMoles[newSaltId] = (v.soluteMoles[newSaltId] || 0) + extent * nMetal;

      v.pushSolid(entry.metal, extent, "product");

      var joules = -150.0 * extent * 1000;
      var dT = applyHeat(v, joules);

      var targetSp = DB.get(entry.metal);
      var newSaltSp = newSaltId ? DB.get(newSaltId) : null;

      emit(report, {
        type: "reaction",
        subtype: "metal-displacement",
        equation: renderEquation(
          [{ coef: nMetal, formula: metalSp.formula, state: "s" },
           { coef: nTarget, formula: DB.get(saltId).formula, state: "aq" }],
          [{ coef: nMetal, formula: newSaltSp ? newSaltSp.formula : metalCation, state: "aq" },
           { coef: 1, formula: targetSp.formula, state: "s" }]
        ),
        deltaH: -150.0,
        totalHeatJ: joules,
        enthalpyFlag: "EXOTHERMIC",
        molesConsumed: (function () { var o = {}; o[metalId] = extent * nMetal; o[saltId] = extent * nTarget; return o; })(),
        molesProduced: (function () { var o = {}; if (newSaltId) o[newSaltId] = extent * nMetal; o[entry.metal] = extent; return o; })(),
        deposit: entry.metal,
        temperatureK: v.temperature,
        deltaT: dT,
        message: metalSp.name + " displaces " + targetSp.name +
                 " from solution — a " + (targetSp.color === "#b87333" ? "reddish-brown" : "grey") +
                 " deposit coats the metal surface."
      });

      v.reactionCount++;
      return true;
    }
    return false;
  };

  /* ======================================================================
   * RULE 14 — ACID–BASE NEUTRALISATION
   * ====================================================================*/

  Engine.prototype._ruleNeutralisation = function (v, report) {
    var acidId = strongestAcid(v);
    var baseId = strongestBase(v);
    if (!acidId || !baseId) return false;

    var acidInfo = ACID_INFO[acidId];
    var baseInfo = BASE_INFO[baseId];
    if (!acidInfo || !baseInfo) return false;

    var acidSp = DB.get(acidId);
    var baseSp = DB.get(baseId);

    var acidMoles = v.soluteMoles[acidId] || 0;
    var baseMoles = v.soluteMoles[baseId] || 0;
    if (!(acidMoles > 1e-9) || !(baseMoles > 1e-9)) return false;

    /* H+ + OH- → H2O.  1 mol of OH- neutralises 1 mol of H+. */
    var hAvailable = acidMoles * acidInfo.protons;
    var ohAvailable = baseMoles * baseInfo.oh;

    var extent = Math.min(hAvailable, ohAvailable);
    if (!(extent > 1e-9)) return false;

    var acidConsumed = extent / acidInfo.protons;
    var baseConsumed = extent / baseInfo.oh;

    /* Consume */
    v.soluteMoles[acidId] -= acidConsumed;
    if (v.soluteMoles[acidId] < 1e-12) delete v.soluteMoles[acidId];
    v.soluteMoles[baseId] -= baseConsumed;
    if (v.soluteMoles[baseId] < 1e-12) delete v.soluteMoles[baseId];

    /* Produce the salt from the remaining counter-ions */
    var saltId = SALT_BY_IONS[baseInfo.cation + "|" + acidInfo.anion] || null;
    var saltSp = saltId ? DB.get(saltId) : null;
    var saltFormula = saltSp ? saltSp.formula : buildSaltFormula(baseInfo.cation, acidInfo.anion);
    var saltMoles = extent / Math.max(1, CATIONS[baseInfo.cation].charge * ANIONS[acidInfo.anion].charge / gcd(CATIONS[baseInfo.cation].charge, ANIONS[acidInfo.anion].charge));

    /* Determine the amount of salt produced */
    var cCharge = CATIONS[baseInfo.cation].charge;
    var aCharge = ANIONS[acidInfo.anion].charge;
    var g = gcd(cCharge, aCharge);
    var nCation = aCharge / g;
    var nAnion  = cCharge / g;
    var saltProduced = extent / (nCation * cCharge) * nCation;  // = extent / cCharge
    saltProduced = extent / cCharge;

    if (saltId) {
      var sol = isSoluble(baseInfo.cation, acidInfo.anion);
      if (sol === true) {
        v.soluteMoles[saltId] = (v.soluteMoles[saltId] || 0) + saltProduced;
      } else {
        v.pushPrecipitate(saltId, saltProduced);
      }
    }

    /* Water produced */
    var waterProduced = extent;
    if (v.waterVolume > 0) v.soluteMoles.H2O = (v.soluteMoles.H2O || 0) + waterProduced;

    /* ---- enthalpy of neutralisation ---- */
    var isStrongStrong = (acidSp.acidity === "strong acid") && (baseSp.acidity === "strong base");
    var dhPerMol = isStrongStrong ? -57.3 :
                   (acidSp.acidity === "weak acid" && baseSp.acidity === "strong base") ? -55.0 :
                   (acidSp.acidity === "strong acid" && baseSp.acidity === "weak base") ? -52.0 : -50.0;
    var dh = dhPerMol * extent;
    var joules = dh * 1000;
    var dT = applyHeat(v, joules);

    /* Equation */
    var coefAcid = acidInfo.protons;
    var coefBase = baseInfo.oh;
    var lcm = coefAcid * coefBase / gcd(coefAcid, coefBase);
    var aC = lcm / coefAcid;
    var bC = lcm / coefBase;
    var wC = lcm;

    emit(report, {
      type: "reaction",
      subtype: "neutralisation",
      equation: renderEquation(
        [{ coef: aC, formula: acidSp.formula, state: "aq" },
         { coef: bC, formula: baseSp.formula, state: "aq" }],
        [{ coef: aC * nCation / Math.max(1, bC), formula: saltFormula, state: "aq" },
         { coef: wC, formula: "H₂O", state: "l" }]
      ),
      netIonic: "H⁺(aq) + OH⁻(aq) → H₂O(l)",
      deltaH: dhPerMol,
      totalHeatJ: joules,
      enthalpyFlag: enthalpyFlag(dhPerMol),
      molesConsumed: (function () { var o = {}; o[acidId] = acidConsumed; o[baseId] = baseConsumed; return o; })(),
      molesProduced: (function () { var o = {}; if (saltId) o[saltId] = saltProduced; o.H2O = waterProduced; return o; })(),
      precipitateMassG: (saltId && isSoluble(baseInfo.cation, acidInfo.anion) !== true)
        ? saltProduced * (saltSp ? saltSp.molarMass : 100) : 0,
      temperatureK: v.temperature,
      deltaT: dT,
      message: "Neutralisation: " + fmt(extent, 4) + " mol of water formed. " +
               fmt(Math.abs(dh), 2) + " kJ released — the vessel warms by " +
               fmt(dT, 2) + " K." + (isStrongStrong ? " (Strong acid + strong base: ΔH°n ≈ −57.3 kJ/mol.)" : "")
    });

    v.reactionCount++;
    return true;
  };

  /* ======================================================================
   * RULE 15 — DOUBLE DISPLACEMENT / PRECIPITATION
   * ====================================================================*/

  Engine.prototype._ruleDoubleDisplacement = function (v, report) {
    if (!(v.waterVolume > 0)) return false;

    /* Collect soluble species that can be decomposed into a cation + anion */
    var soluble = [];
    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      if (!(v.soluteMoles[id] > 1e-9)) continue;
      var d = decomposeSpecies(id);
      if (!d || !d.cation || !d.anion) continue;
      if (d.cation === "H" || d.anion === "OH") continue;    // handled by neutralisation
      if (d.anion === "O") continue;                          // oxides handled elsewhere
      soluble.push({ id: id, cation: d.cation, anion: d.anion, moles: v.soluteMoles[id] });
    }

    if (soluble.length < 2) return false;

    for (var i = 0; i < soluble.length; i++) {
      for (var j = i + 1; j < soluble.length; j++) {
        var A = soluble[i];
        var B = soluble[j];

        /* --- Case 1: A's cation + B's anion forms an insoluble salt --- */
        var precip = null, coCation = null, coAnion = null;

        var solAB = isSoluble(A.cation, B.anion);
        var solBA = isSoluble(B.cation, A.anion);

        if (solAB === false && !(A.cation === B.cation && A.anion === B.anion)) {
          precip   = { cation: A.cation, anion: B.anion };
          coCation = B.cation;
          coAnion  = A.anion;
        } else if (solBA === false && !(A.cation === B.cation && A.anion === B.anion)) {
          precip   = { cation: B.cation, anion: A.anion };
          coCation = A.cation;
          coAnion  = B.anion;
        } else {
          continue;
        }

        /* Sanity: don't re-precipitate something already solid */
        var precipId = SALT_BY_IONS[precip.cation + "|" + precip.anion];
        if (!precipId) continue;

        /* ---- Stoichiometry ---- */
        var cChargeA = CATIONS[A.cation].charge;
        var aChargeA = ANIONS[A.anion].charge;
        var cChargeB = CATIONS[B.cation].charge;
        var aChargeB = ANIONS[B.anion].charge;

        var gP = gcd(cChargeA, aChargeB);
        var xP = aChargeB / gP;            // A-cations per precipitate formula unit
        var yP = cChargeA / gP;            // B-anions per precipitate formula unit

        var catPerA = aChargeA / gcd(cChargeA, aChargeA);
        var anPerB  = cChargeB / gcd(cChargeB, aChargeB);

        var stoichA = xP / catPerA;        // mol of A per mol of precipitate
        var stoichB = yP / anPerB;         // mol of B per mol of precipitate

        var maxByA = A.moles / stoichA;
        var maxByB = B.moles / stoichB;
        var extent = Math.min(maxByA, maxByB);
        if (!(extent > 1e-9)) continue;

        /* ---- Consume ---- */
        v.soluteMoles[A.id] -= extent * stoichA;
        if (v.soluteMoles[A.id] < 1e-12) delete v.soluteMoles[A.id];
        v.soluteMoles[B.id] -= extent * stoichB;
        if (v.soluteMoles[B.id] < 1e-12) delete v.soluteMoles[B.id];

        /* ---- Produce precipitate ---- */
        var precipSp = DB.get(precipId);
        v.pushPrecipitate(precipId, extent);

        /* ---- Produce the co-salt that remains in solution ---- */
        var coSaltId = SALT_BY_IONS[coCation + "|" + coAnion] || null;
        var coSaltSp = coSaltId ? DB.get(coSaltId) : null;
        var coFormula = coSaltSp ? coSaltSp.formula : buildSaltFormula(coCation, coAnion);

        var coCatPerSalt = aChargeA >= 0 ? 1 : 1;
        /* moles of co-salt = extent * (cations released per precipitate) / (cations per co-salt) */
        var cChargeCo = CATIONS[coCation].charge;
        var aChargeCo = ANIONS[coAnion].charge;
        var gCo = gcd(cChargeCo, aChargeCo);
        var nCoCat = aChargeCo / gCo;
        var nCoAn  = cChargeCo / gCo;

        var cationsReleased = extent * stoichB * anPerB;   // = extent * yP
        var anionsReleased  = extent * stoichA * catPerA;  // = extent * xP
        var coMoles = Math.min(cationsReleased / nCoCat, anionsReleased / nCoAn);
        if (coMoles < 0) coMoles = 0;

        if (coSaltId && isSoluble(coCation, coAnion) === true) {
          v.soluteMoles[coSaltId] = (v.soluteMoles[coSaltId] || 0) + coMoles;
        } else if (coSaltId) {
          v.pushPrecipitate(coSaltId, coMoles);
        }

        /* ---- Thermodynamics ---- */
        var reactants = [{ id: A.id, coef: stoichA }, { id: B.id, coef: stoichB }];
        var products  = [{ id: precipId, coef: 1 }];
        if (coSaltId) products.push({ id: coSaltId, coef: coMoles / extent });
        var dhPer = reactionEnthalpy(reactants, products);
        if (dhPer === null) dhPer = -12.0;
        var dh = dhPer * extent;
        var joules = dh * 1000;
        var dT = applyHeat(v, joules);

        /* ---- Equation ---- */
        var aSp = DB.get(A.id);
        var bSp = DB.get(B.id);

        var eqReactants = [
          { coef: stoichA, formula: aSp.formula, state: "aq" },
          { coef: stoichB, formula: bSp.formula, state: "aq" }
        ];
        var eqProducts = [
          { coef: 1, formula: precipSp ? precipSp.formula : buildSaltFormula(precip.cation, precip.anion), state: "s" }
        ];
        if (coSaltId) {
          eqProducts.push({ coef: coMoles / extent, formula: coFormula, state: "aq" });
        }

        var precipMass = extent * (precipSp ? precipSp.molarMass : 100);

        emit(report, {
          type: "reaction",
          subtype: "precipitation",
          equation: renderEquation(eqReactants, eqProducts),
          netIonic: buildSaltFormula(precip.cation, precip.anion) + "(s)  ⇌  " +
                    CATIONS[precip.cation].display + "ⁿ⁺(aq) + " +
                    ANIONS[precip.anion].display + "ᵐ⁻(aq)",
          deltaH: dhPer,
          totalHeatJ: joules,
          enthalpyFlag: enthalpyFlag(dhPer),
          molesConsumed: (function () { var o = {}; o[A.id] = extent * stoichA; o[B.id] = extent * stoichB; return o; })(),
          molesProduced: (function () {
            var o = {}; o[precipId] = extent; if (coSaltId) o[coSaltId] = coMoles; return o;
          })(),
          precipitateMassG: precipMass,
          precipitateId: precipId,
          precipitateColor: precipSp ? precipSp.color : "#e8e8e8",
          temperatureK: v.temperature,
          deltaT: dT,
          message: "Precipitation of " + (precipSp ? precipSp.name : precipId) +
                   " — " + fmt(precipMass, 4) + " g of " +
                   (precipSp ? precipSp.color === "#f0d000" ? "bright yellow" :
                               precipSp.color === "#161616" ? "black" :
                               precipSp.color === "#fbfbfb" ? "white" :
                               precipSp.color === "#2a8aa8" ? "pale blue" :
                               "coloured" : "coloured") +
                   " solid settles out."
        });

        v.reactionCount++;
        return true;
      }
    }
    return false;
  };

  /* ======================================================================
   * SPECIES DECOMPOSITION HELPER
   * ====================================================================*/

  function decomposeSpecies(id) {
    var parts = IONIC[id];
    if (!parts) return null;
    var cats = [], ans = [];
    for (var i = 0; i < parts.length; i++) {
      if (CATIONS[parts[i]]) cats.push(parts[i]);
      else if (ANIONS[parts[i]]) ans.push(parts[i]);
    }
    if (!cats.length || !ans.length) return null;
    var cSet = {}, aSet = {};
    for (var a = 0; a < cats.length; a++) cSet[cats[a]] = true;
    for (var b = 0; b < ans.length; b++)  aSet[ans[b]]  = true;
    var cKeys = Object.keys(cSet), aKeys = Object.keys(aSet);
    if (cKeys.length !== 1 || aKeys.length !== 1) return null;
    return {
      cation: cKeys[0],
      anion:  aKeys[0],
      cationCount: cats.length,
      anionCount:  ans.length
    };
  }

  /* ------------------------------------------------------------------------
   * 9.7 INTERNAL — recompute derived state (pH, molarity, colour, turbidity)
   * ---------------------------------------------------------------------- */

  Engine.prototype._recompute = function (v, report) {
    /* ---- temperature sanity ---- */
    if (v.temperature < 1)   v.temperature = 1;
    if (v.temperature > 3500) v.temperature = 3500;

    /* ---- pH ---- */
    v.pH = computePH(v);

    /* ---- molarities ---- */
    v.molarity = {};
    if (v.waterVolume > 0) {
      for (var id in v.soluteMoles) {
        if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
        v.molarity[id] = v.soluteMoles[id] / v.waterVolume;
      }
    }

    /* ---- turbidity from precipitates and undissolved solids ---- */
    var solidMass = 0;
    for (var i = 0; i < v.precipitates.length; i++) solidMass += v.precipitates[i].mass;
    for (var j = 0; j < v.solids.length; j++)       solidMass += v.solids[j].mass;
    v.turbidity = clamp(solidMass / 25, 0, 1);

    /* ---- indicator-driven colour ---- */
    v.colour = computeColour(v, report);

    /* ---- gas totals ---- */
    v.totalGasMoles = 0;
    for (var g in v.gases) {
      if (!Object.prototype.hasOwnProperty.call(v.gases, g)) continue;
      v.totalGasMoles += v.gases[g];
    }

    v.dirty = false;
  };

  /* ========================================================================
   * 10. pH MODEL
   * ======================================================================*/

  function computePH(v) {
    if (!(v.waterVolume > 0)) return null;
    var V = v.waterVolume;

    var strongH = 0, strongOH = 0;
    var weakAcids = [];   // {n, Ka, id}
    var weakBases = [];   // {n, Kb, id}

    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      var n = v.soluteMoles[id];
      if (!(n > 1e-12)) continue;
      var sp = DB.get(id);
      if (!sp) continue;

      switch (sp.acidity) {
        case "strong acid": {
          var ai = ACID_INFO[id];
          var protons = ai ? ai.protons : 1;
          strongH += n * protons;
          break;
        }
        case "strong base": {
          var bi = BASE_INFO[id];
          var oh = bi ? bi.oh : 1;
          strongOH += n * oh;
          break;
        }
        case "weak acid":
          weakAcids.push({ n: n, Ka: estimateKa(sp), id: id });
          break;
        case "weak base":
          weakBases.push({ n: n, Kb: estimateKb(sp), id: id });
          break;
        case "amphoteric":
          /* treat amphoteric species as mildly acidic if their tabulated pH < 7 */
          if (sp.pH !== null && sp.pH < 7) weakAcids.push({ n: n, Ka: estimateKa(sp), id: id });
          else if (sp.pH !== null && sp.pH > 7) weakBases.push({ n: n, Kb: estimateKb(sp), id: id });
          break;
        default:
          break;
      }
    }

    /* H2O autoionisation floor */
    var netH = strongH - strongOH;

    /* ---- Case A: strong acid in excess ---- */
    if (netH > 1e-12) {
      /* strong acid protonates weak bases fully */
      for (var wb = 0; wb < weakBases.length; wb++) {
        var consume = Math.min(netH, weakBases[wb].n);
        netH -= consume;
        weakBases[wb].n -= consume;
      }
      if (netH > 1e-12) {
        var H = netH / V;
        /* suppress weak acid dissociation by the common-ion effect */
        var weakContrib = 0;
        for (var wa = 0; wa < weakAcids.length; wa++) {
          if (!(weakAcids[wa].n > 0)) continue;
          var C = weakAcids[wa].n / V;
          var Ka = weakAcids[wa].Ka;
          var approx = (Ka * C) / (Ka + H);
          weakContrib += approx;
        }
        var totalH = H + weakContrib + 1e-7;
        return clamp(-Math.log10(totalH), 0, 14);
      }
    }

    /* ---- Case B: strong base in excess ---- */
    if (netH < -1e-12) {
      var netOH = -netH;
      /* strong base deprotonates weak acids, forming a buffer */
      var bufferA = 0, bufferHA = 0, bufferKa = null;
      for (var wa2 = 0; wa2 < weakAcids.length; wa2++) {
        if (!(weakAcids[wa2].n > 0)) continue;
        var take = Math.min(netOH, weakAcids[wa2].n);
        netOH -= take;
        weakAcids[wa2].n -= take;
        if (bufferKa === null) bufferKa = weakAcids[wa2].Ka;
        bufferA += take;
        bufferHA += weakAcids[wa2].n;
        if (netOH <= 1e-12) break;
      }

      if (bufferA > 1e-12 && bufferHA > 1e-12 && bufferKa !== null) {
        /* Henderson–Hasselbalch */
        var pHbuf = -Math.log10(bufferKa) + Math.log10(bufferA / bufferHA);
        return clamp(pHbuf, 0, 14);
      }

      if (netOH > 1e-12) {
        var OH = netOH / V;
        /* weak base contribution alongside the strong base */
        var weakOH = 0;
        for (var wb2 = 0; wb2 < weakBases.length; wb2++) {
          if (!(weakBases[wb2].n > 0)) continue;
          var Cb = weakBases[wb2].n / V;
          var Kb = weakBases[wb2].Kb;
          weakOH += (Kb * Cb) / (Kb + OH);
        }
        var totalOH = OH + weakOH + 1e-7;
        return clamp(14 + Math.log10(totalOH), 0, 14);
      }

      /* All strong base consumed by weak acid, no excess: use the buffer result if available */
      if (bufferA > 1e-12) {
        var KbConj = 1e-14 / (bufferKa || 1e-5);
        var Cc = bufferA / V;
        var ohConc = Math.sqrt(KbConj * Cc);
        return clamp(14 + Math.log10(ohConc + 1e-7), 0, 14);
      }
    }

    /* ---- Case C: neutral — pure weak acid / weak base equilibria ---- */
    var hTotal = 1e-7;
    var ohTotal = 1e-7;

    for (var k = 0; k < weakAcids.length; k++) {
      var w = weakAcids[k];
      if (!(w.n > 0)) continue;
      var Ca = w.n / V;
      var Kaa = w.Ka;
      if (!(Ca > 0)) continue;
      var disc = Kaa * Kaa + 4 * Kaa * Ca;
      hTotal += (-Kaa + Math.sqrt(disc)) / 2;
    }
    for (var m = 0; m < weakBases.length; m++) {
      var wb3 = weakBases[m];
      if (!(wb3.n > 0)) continue;
      var Cbb = wb3.n / V;
      var Kbb = wb3.Kb;
      if (!(Cbb > 0)) continue;
      var disc2 = Kbb * Kbb + 4 * Kbb * Cbb;
      ohTotal += (-Kbb + Math.sqrt(disc2)) / 2;
    }

    if (hTotal > ohTotal) return clamp(-Math.log10(hTotal), 0, 14);
    if (ohTotal > hTotal) return clamp(14 + Math.log10(ohTotal), 0, 14);
    return 7;
  }

  /* ========================================================================
   * 11. COLOUR MODEL
   * ======================================================================*/

  function computeColour(v, report) {
    var pH = v.pH;

    /* ---- indicator overrides ---- */
    if (v.indicators) {
      for (var indId in v.indicators) {
        if (!Object.prototype.hasOwnProperty.call(v.indicators, indId)) continue;
        if (!(v.indicators[indId] > 0)) continue;

        if (indId === "Phenolphthalein" && pH !== null) {
          if (pH < 8.2) return "#eaf4ff";
          if (pH > 10.0) return "#e0218a";
          return "#f0a0d0";
        }
        if (indId === "MethylOrange" && pH !== null) {
          if (pH < 3.1) return "#e8402a";
          if (pH > 4.4) return "#f5c518";
          return "#f08030";
        }
        if (indId === "MethylRed" && pH !== null) {
          if (pH < 4.4) return "#d01828";
          if (pH > 6.2) return "#f0e030";
          return "#e07030";
        }
        if (indId === "BromothymolBlue" && pH !== null) {
          if (pH < 6.0) return "#f5e04a";
          if (pH > 7.6) return "#1f6feb";
          return "#3aaa7a";
        }
        if (indId === "Litmus" && pH !== null) {
          if (pH < 4.5) return "#d02020";
          if (pH > 8.3) return "#2a4ac8";
          return "#7a5ac8";
        }
        if (indId === "UniversalIndicator" && pH !== null) {
          var stops = [
            { p: 1,  c: "#d02020" }, { p: 3,  c: "#e06020" },
            { p: 5,  c: "#f0c020" }, { p: 6,  c: "#d8e020" },
            { p: 7,  c: "#40b040" }, { p: 8,  c: "#20a0a0" },
            { p: 10, c: "#2050c0" }, { p: 12, c: "#4020a0" },
            { p: 14, c: "#6020a0" }
          ];
          for (var s = 0; s < stops.length - 1; s++) {
            if (pH >= stops[s].p && pH <= stops[s+1].p) {
              var f = (pH - stops[s].p) / (stops[s+1].p - stops[s].p);
              return mixHex(stops[s].c, stops[s+1].c, f);
            }
          }
          return pH < 1 ? "#d02020" : "#6020a0";
        }
        if (indId === "ThymolBlue" && pH !== null) {
          if (pH < 1.2) return "#d02020";
          if (pH < 2.8) return "#f0a020";
          if (pH < 8.0) return "#f5e030";
          if (pH < 9.6) return "#40b0a0";
          return "#2040c0";
        }
        if (indId === "CongoRed" && pH !== null) {
          if (pH < 3.0) return "#2040c0";
          if (pH > 5.2) return "#e02020";
          return "#8030a0";
        }
      }
    }

    /* ---- precipitate colour dominates ---- */
    if (v.precipitates && v.precipitates.length) {
      var totalMass = 0, rSum = 0, gSum = 0, bSum = 0;
      for (var i = 0; i < v.precipitates.length; i++) {
        var p = v.precipitates[i];
        var rgb = hexToRgb(p.color);
        totalMass += p.mass;
        rSum += rgb.r * p.mass; gSum += rgb.g * p.mass; bSum += rgb.b * p.mass;
      }
      if (totalMass > 0.001 && v.turbidity > 0.05) {
        var pr = Math.round(rSum / totalMass);
        var pg = Math.round(gSum / totalMass);
        var pb = Math.round(bSum / totalMass);
        return rgbToHex(pr, pg, pb);
      }
    }

    /* ---- solution colour from dissolved transition-metal ions ---- */
    var ionColours = {
      Cu:    { c: "#1a7ac8", w: 1.0 },   // Cu²⁺ blue
      Cu1:   { c: "#40a060", w: 0.7 },
      Fe3:   { c: "#c08020", w: 0.8 },   // Fe³⁺ yellow-brown
      Fe2:   { c: "#a8d0c0", w: 0.4 },   // Fe²⁺ pale green
      Mn2:   { c: "#f0c8d8", w: 0.3 },   // Mn²⁺ pale pink
      Ni:    { c: "#40a050", w: 0.6 },   // Ni²⁺ green
      Cr3:   { c: "#2a6a3a", w: 0.5 },   // Cr³⁺ green
      CrO4:  { c: "#f0d000", w: 0.8 },   // CrO4²⁻ yellow
      Cr2O7: { c: "#e07020", w: 0.8 },   // Cr2O7²⁻ orange
      MnO4:  { c: "#4a0a6a", w: 1.0 },   // MnO4⁻ deep purple
      IO3:   { c: "#f0f0f0", w: 0.1 }
    };

    var totalW = 0, rAcc = 207, gAcc = 232, bAcc = 255;    // base = pale water blue
    var baseW = 0.6;

    for (var sid in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, sid)) continue;
      var mm = v.soluteMoles[sid];
      if (!(mm > 1e-9)) continue;
      var conc = mm / Math.max(0.001, v.waterVolume);      // mol/L
      var d = decomposeSpecies(sid);
      if (!d) continue;
      var ic = ionColours[d.cation];
      if (!ic) ic = ionColours[d.anion];
      if (!ic) continue;
      var w = ic.w * clamp(Math.log10(conc * 10 + 1) / 1.2, 0, 1.5);
      if (w <= 0) continue;
      var irgb = hexToRgb(ic.c);
      rAcc = (rAcc * baseW + irgb.r * w) / (baseW + w);
      gAcc = (gAcc * baseW + irgb.g * w) / (baseW + w);
      bAcc = (bAcc * baseW + irgb.b * w) / (baseW + w);
      baseW += w;
      totalW += w;
    }

    /* Iodine / starch blue-black */
    if ((v.soluteMoles.I2 || 0) > 1e-9 && (v.soluteMoles.Starch || 0) > 1e-9) {
      return "#1a1a5a";
    }
    /* Bromine / iodine tint */
    if ((v.soluteMoles.I2 || 0) > 1e-6) return "#6a4a20";
    if ((v.soluteMoles.Br2 || 0) > 1e-6) return "#a04020";

    return rgbToHex(Math.round(rAcc), Math.round(gAcc), Math.round(bAcc));
  }

  function hexToRgb(hex) {
    if (!hex || hex[0] !== "#") return { r: 200, g: 200, b: 200 };
    var h = hex.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    r = clamp(r, 0, 255) | 0;
    g = clamp(g, 0, 255) | 0;
    b = clamp(b, 0, 255) | 0;
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function mixHex(a, b, f) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(
      Math.round(ca.r + (cb.r - ca.r) * f),
      Math.round(ca.g + (cb.g - ca.g) * f),
      Math.round(ca.b + (cb.b - ca.b) * f)
    );
  }

  /* ========================================================================
   * 12. STATE SNAPSHOT
   * ======================================================================*/

  Engine.prototype.snapshot = function () {
    var v = this.vessel;
    var solutes = [];
    for (var id in v.soluteMoles) {
      if (!Object.prototype.hasOwnProperty.call(v.soluteMoles, id)) continue;
      var n = v.soluteMoles[id];
      if (n <= 1e-12) continue;
      var sp = DB.get(id);
      solutes.push({
        id: id,
        name: sp ? sp.name : id,
        formula: sp ? sp.formula : id,
        moles: n,
        molarity: v.waterVolume > 0 ? n / v.waterVolume : 0,
        mass: sp ? n * sp.molarMass : 0,
        color: sp ? sp.color : "#cccccc"
      });
    }

    var solids = [];
    for (var i = 0; i < v.solids.length; i++) {
      var s = v.solids[i];
      var sSp = DB.get(s.id);
      solids.push({
        id: s.id,
        name: sSp ? sSp.name : s.id,
        formula: sSp ? sSp.formula : s.id,
        moles: s.moles,
        mass: s.mass,
        origin: s.origin,
        color: sSp ? sSp.color : "#cccccc"
      });
    }

    var precipitates = [];
    for (var j = 0; j < v.precipitates.length; j++) {
      var p = v.precipitates[j];
      var pSp = DB.get(p.id);
      precipitates.push({
        id: p.id,
        name: pSp ? pSp.name : p.id,
        formula: p.formula,
        moles: p.moles,
        mass: p.mass,
        color: p.color
      });
    }

    var gases = [];
    for (var g in v.gases) {
      if (!Object.prototype.hasOwnProperty.call(v.gases, g)) continue;
      var gm = v.gases[g];
      if (gm <= 1e-12) continue;
      var gSp = DB.get(g);
      gases.push({
        id: g,
        name: gSp ? gSp.name : g,
        formula: gSp ? gSp.formula : g,
        moles: gm,
        volumeL: gm * K.MOLAR_VOLUME_STP,
        mass: gSp ? gm * gSp.molarMass : 0
      });
    }

    return {
      waterVolume: v.waterVolume,
      hasWater: v.waterVolume > 0,
      waterMassG: v.waterVolume * K.WATER_DENSITY,
      solutes: solutes,
      solids: solids,
      precipitates: precipitates,
      gases: gases,
      pH: v.pH,
      temperature: v.temperature,
      temperatureC: v.temperature - 273.15,
      pressure: v.pressure,
      molarity: v.molarity || {},
      turbidity: v.turbidity,
      colour: v.colour,
      solutionMassG: v.solutionMass(),
      solutionCp: v.solutionCp(),
      heatExchangedJ: v.heatExchanged,
      reactionCount: v.reactionCount,
      totalGasMoles: v.totalGasMoles || 0,
      totalGasVolumeL: (v.totalGasMoles || 0) * K.MOLAR_VOLUME_STP,
      totalPrecipitateMassG: precipitates.reduce(function (a, b) { return a + b.mass; }, 0),
      totalSoluteMoles: solutes.reduce(function (a, b) { return a + b.moles; }, 0),
      elapsed: v.elapsed,
      stirring: v.stirring,
      stirRate: v.stirRate,
      flamePower: v.flamePower
    };
  };

  /* ========================================================================
   * 13. TEMPERATURE / FLAME / STIRRING CONTROL
   * ======================================================================*/

  Engine.prototype.setFlame = function (power) {
    this.vessel.flamePower = clamp(power, 0, 1);
    return this.vessel.flamePower;
  };

  Engine.prototype.setStirrer = function (rate) {
    this.vessel.stirRate = clamp(rate, 0, 1);
    this.vessel.stirring = this.vessel.stirRate > 0.01;
    return this.vessel.stirRate;
  };

  /**
   * Advance the simulation by dt seconds.
   * Applies flame heating, Newtonian cooling and stirring-enhanced mixing.
   */
  Engine.prototype.step = function (dt) {
    if (!(dt > 0)) return;
    var v = this.vessel;
    v.elapsed += dt;

    /* ---- flame heat input ---- */
    if (v.flamePower > 0) {
      var watts = v.flamePower * K.FLAME_WATTS_MAX;
      applyHeat(v, watts * dt);
    }

    /* ---- Newtonian cooling toward ambient ---- */
    var mass = v.solutionMass();
    if (!(mass > 0)) mass = 200;
    var cp = v.solutionCp();
    if (!(cp > 0)) cp = K.DEFAULT_CP_SOLN;
    var heatCapacity = mass * cp;                       // J/K
    var dT = v.temperature - K.T_AMBIENT;
    var coolingPower = K.COOLING_K * dT;                // W
    var coolJoules = -coolingPower * dt;
    v.temperature += coolJoules / heatCapacity;

    /* Stirring multiplies the effective cooling coefficient slightly */
    if (v.stirring) {
      v.temperature += (coolJoules * 0.35) / heatCapacity;
    }

    if (v.temperature < K.T_AMBIENT - 40) v.temperature = K.T_AMBIENT - 40;

    v.pH = computePH(v);
    v.colour = computeColour(v, { events: [] });
    return this.snapshot();
  };

  /* ========================================================================
   * 14. CONVENIENCE METHODS
   * ======================================================================*/

  /** Add pure water in millilitres. */
  Engine.prototype.addWater = function (millilitres) {
    var v = this.vessel;
    var litres = Math.max(0, millilitres) / 1000;
    v.waterVolume += litres;
    var report = {
      ok: true,
      events: [{
        type: "addition",
        message: "Added " + fmt(millilitres, 2) + " mL of water. Total volume: " +
                 fmt(v.waterVolume * 1000, 1) + " mL."
      }],
      equations: [],
      warnings: [],
      state: null
    };
    this._react(v, report);
    this._recompute(v, report);
    report.state = this.snapshot();
    return report;
  };

  /** Completely empty the vessel. */
  Engine.prototype.clear = function () {
    this.vessel.reset();
    return this.snapshot();
  };

  /** Flush — alias for clear, but retains the stirring/flame instrumentation. */
  Engine.prototype.flush = function () {
    var stir = this.vessel.stirring;
    var rate = this.vessel.stirRate;
    var flame = this.vessel.flamePower;
    this.vessel.reset();
    this.vessel.stirring = stir;
    this.vessel.stirRate = rate;
    this.vessel.flamePower = flame;
    return this.snapshot();
  };

  /** Refill to a given volume with pure water. */
  Engine.prototype.refill = function (millilitres) {
    this.vessel.reset();
    this.vessel.waterVolume = Math.max(0, millilitres) / 1000;
    this.vessel.pH = computePH(this.vessel);
    this.vessel.colour = computeColour(this.vessel, { events: [] });
    return this.snapshot();
  };

  /** Full reset including instrumentation. */
  Engine.prototype.hardReset = function () {
    this.vessel.reset();
    this.vessel.stirring = false;
    this.vessel.stirRate = 0;
    this.vessel.flamePower = 0;
    this.vessel.elapsed = 0;
    this.history = [];
    return this.snapshot();
  };

  /** Toggle the stirrer at a default rate. */
  Engine.prototype.toggleStir = function () {
    var v = this.vessel;
    v.stirring = !v.stirring;
    v.stirRate = v.stirring ? 0.6 : 0;
    return v.stirring;
  };

  /** Simulated titration: dispense `mL` of a stock titrant. */
  Engine.prototype.titrate = function (titrantId, millilitres, stockMolarity) {
    if (!(millilitres > 0)) return null;
    var moles = (millilitres / 1000) * (stockMolarity || 0.1);
    var report = this.addChemical(titrantId, moles, "mol");
    report.titrantVolumeML = millilitres;
    report.titrantMolarity = stockMolarity || 0.1;
    return report;
  };

  /** Read the current pH. */
  Engine.prototype.getPH = function () {
    return computePH(this.vessel);
  };

  /** Read the molarity of one species. */
  Engine.prototype.getMolarity = function (id) {
    if (!(this.vessel.waterVolume > 0)) return 0;
    return (this.vessel.soluteMoles[id] || 0) / this.vessel.waterVolume;
  };

  /** Total moles of gas currently in the headspace, and the STP volume. */
  Engine.prototype.getGasTotals = function () {
    var mol = 0;
    for (var g in this.vessel.gases) {
      if (!Object.prototype.hasOwnProperty.call(this.vessel.gases, g)) continue;
      mol += this.vessel.gases[g];
    }
    return { moles: mol, litresAtSTP: mol * K.MOLAR_VOLUME_STP };
  };

  /** Current solution temperature in °C. */
  Engine.prototype.getTemperatureC = function () {
    return this.vessel.temperature - 273.15;
  };

  /** Every species currently present, with its location and amount. */
  Engine.prototype.inventory = function () {
    var s = this.snapshot();
    return {
      water:    s.waterVolume,
      solutes:  s.solutes,
      solids:   s.solids,
      precip:   s.precipitates,
      gases:    s.gases
    };
  };

  /* ========================================================================
   * 15. PUBLIC NAMESPACE
   * ======================================================================*/

  var API = {
    Vessel:  Vessel,
    Engine:  Engine,

    /* ---- constants ---- */
    constants: K,

    /* ---- ion tables ---- */
    ions: {
      cations: CATIONS,
      anions:  ANIONS,
      ionic:   IONIC
    },

    /* ---- pure utility functions ---- */
    utils: {
      isSoluble:        isSoluble,
      decomposeSpecies: decomposeSpecies,
      buildSaltFormula: buildSaltFormula,
      reactionEnthalpy: reactionEnthalpy,
      enthalpyFlag:     enthalpyFlag,
      computePH:        computePH,
      computeColour:    computeColour,
      estimateKa:       estimateKa,
      estimateKb:       estimateKb,
      formatNumber:     fmt,
      subscript:        sub,
      renderEquation:   renderEquation,
      saltByIons:       SALT_BY_IONS,
      mixHex:           mixHex,
      hexToRgb:         hexToRgb,
      rgbToHex:         rgbToHex
    },

    /* ---- reference data ---- */
    reference: {
      alkaliMetals:        ALKALI_METALS,
      alkalineEarthMetals: ALKALINE_EARTH_METALS,
      acidActiveMetals:    ACID_ACTIVE_METALS,
      peroxideCatalysts:   PEROXIDE_CATALYSTS,
      fuels:               FUELS,
      acidInfo:            ACID_INFO,
      baseInfo:            BASE_INFO
    },

    /* ---- one-shot factory ---- */
    createEngine: function () {
      return new Engine(new Vessel());
    }
  };

  /* ---- console banner ---- */
  if (typeof console !== "undefined" && console.log) {
    console.log(
      "%c VirtuaLab Pro %c ChemistryEngine ready — " +
      Object.keys(IONIC).length + " ionic species, " +
      Object.keys(SALT_BY_IONS).length + " salt ion-pairs indexed.",
      "background:#0b7285;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
      "background:#e3fafc;color:#0b7285;padding:2px 6px;border-radius:0 3px 3px 0"
    );
  }

  return API;

})();
