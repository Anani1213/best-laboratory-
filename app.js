/* ══════════════════════════════════════════════════════════════════════════
   VIRTUALAB PRO v9.0 — Chemistry Simulation Kernel
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── GEOMETRY ─────────────────────────── */
const W = 760, H = 680;
const BX = 290, BY = 140, BW = 180, BH = 230;
const INX = BX + 9, INY = BY + 8, INW = BW - 18, INH = BH - 16;
const BOT = INY + INH;
const CX  = BX + BW / 2;
const MAXVOL = 500;
const MAXLH  = 190;
const BURETTE_TOP = 25;
const BURETTE_BOT = 95;
const BURETTE_TIP_Y = BURETTE_BOT + 25;
const BURNER_BASE_Y = 372;

/* ─────────────────────── CATEGORIES ─────────────────────── */
const CATS = [
  'All','Alkali Metals','Alkaline Earth','Transition','Post-Transition','Non-Metals',
  'Basic Oxides','Acidic Oxides','Amphoteric Oxides','Neutral Oxides',
  'Strong Acids','Weak Acids','Strong Bases','Weak Bases',
  'Salts','Solvents','Indicators'
];

/* ──────────────────────── CHEMICAL DATABASE (162 species) ────────────────────────
   Fields:
   id (unique key), n (name), f (formula), c (category), st (state: s/l)
   mm (molar mass), dens (density g/mL for organics)
   M (molarity for liquid solutions, mol/L)
   max (max quantity), def (default quantity), rgb (color)
   ions (ionic contribution per mole), soluble/insoluble
   alkali (alkali metal), toxic, fuel (combustible), ign (ignition T °C), dhComb
   acidicOxide, basicOxide, amphoteric, neutral (oxide class)
   ind (indicator key), dhSol (dissolution enthalpy kJ/mol)
   flameColor (for flame test)
   ──────────────────────────────────────────────────────────────────────────── */
const CHEMS = [
  /* ─── ALKALI METALS (5) ─── */
  {id:'li', n:'Lithium',         f:'Li',  c:'Alkali Metals', st:'s', mm:6.94,  max:5, def:0.5, rgb:[200,205,215], alkali:true, dhSol:-190, flameColor:[255,70,100]},
  {id:'na', n:'Sodium',          f:'Na',  c:'Alkali Metals', st:'s', mm:22.99, max:5, def:1,   rgb:[205,210,220], alkali:true, dhSol:-184, flameColor:[255,190,40]},
  {id:'k',  n:'Potassium',       f:'K',   c:'Alkali Metals', st:'s', mm:39.10, max:5, def:1,   rgb:[205,210,220], alkali:true, dhSol:-196, flameColor:[190,130,255]},
  {id:'rb', n:'Rubidium',        f:'Rb',  c:'Alkali Metals', st:'s', mm:85.47, max:5, def:1,   rgb:[200,205,215], alkali:true, dhSol:-200, flameColor:[255,60,60]},
  {id:'cs', n:'Caesium',         f:'Cs',  c:'Alkali Metals', st:'s', mm:132.9, max:5, def:1,   rgb:[200,205,215], alkali:true, dhSol:-210, flameColor:[100,140,255]},

  /* ─── ALKALINE EARTH (5) ─── */
  {id:'be', n:'Beryllium',       f:'Be',  c:'Alkaline Earth', st:'s', mm:9.01,  max:5, def:1,   rgb:[200,210,215], toxic:true},
  {id:'mg', n:'Magnesium',       f:'Mg',  c:'Alkaline Earth', st:'s', mm:24.31, max:10,def:1,   rgb:[200,200,205]},
  {id:'ca', n:'Calcium',         f:'Ca',  c:'Alkaline Earth', st:'s', mm:40.08, max:10,def:2,   rgb:[190,190,185], dhSol:-230, flameColor:[255,110,70]},
  {id:'sr', n:'Strontium',       f:'Sr',  c:'Alkaline Earth', st:'s', mm:87.62, max:10,def:2,   rgb:[195,195,190], flameColor:[255,40,60]},
  {id:'ba', n:'Barium',          f:'Ba',  c:'Alkaline Earth', st:'s', mm:137.33,max:10,def:2,   rgb:[190,190,185], toxic:true, flameColor:[180,255,150]},

  /* ─── TRANSITION METALS (15) ─── */
  {id:'sc', n:'Scandium',        f:'Sc',  c:'Transition', st:'s', mm:44.96, max:15,def:2, rgb:[190,195,200]},
  {id:'ti', n:'Titanium',        f:'Ti',  c:'Transition', st:'s', mm:47.87, max:15,def:2, rgb:[180,180,185]},
  {id:'v',  n:'Vanadium',        f:'V',   c:'Transition', st:'s', mm:50.94, max:15,def:2, rgb:[160,165,175], toxic:true},
  {id:'cr', n:'Chromium',        f:'Cr',  c:'Transition', st:'s', mm:52.00, max:15,def:2, rgb:[160,160,170]},
  {id:'mn', n:'Manganese',       f:'Mn',  c:'Transition', st:'s', mm:54.94, max:15,def:2, rgb:[150,150,155]},
  {id:'fe', n:'Iron',            f:'Fe',  c:'Transition', st:'s', mm:55.85, max:20,def:3, rgb:[90,90,95]},
  {id:'co', n:'Cobalt',          f:'Co',  c:'Transition', st:'s', mm:58.93, max:15,def:2, rgb:[110,120,140]},
  {id:'ni', n:'Nickel',          f:'Ni',  c:'Transition', st:'s', mm:58.69, max:15,def:2, rgb:[180,190,180]},
  {id:'cu', n:'Copper',          f:'Cu',  c:'Transition', st:'s', mm:63.55, max:20,def:3, rgb:[190,110,60]},
  {id:'zn', n:'Zinc',            f:'Zn',  c:'Transition', st:'s', mm:65.38, max:20,def:3, rgb:[170,175,185]},
  {id:'mo', n:'Molybdenum',      f:'Mo',  c:'Transition', st:'s', mm:95.95, max:15,def:2, rgb:[130,135,145]},
  {id:'ag', n:'Silver',          f:'Ag',  c:'Transition', st:'s', mm:107.87,max:10,def:1, rgb:[230,230,235]},
  {id:'cd', n:'Cadmium',         f:'Cd',  c:'Transition', st:'s', mm:112.41,max:10,def:1, rgb:[190,195,200], toxic:true},
  {id:'w',  n:'Tungsten',        f:'W',   c:'Transition', st:'s', mm:183.84,max:10,def:1, rgb:[140,140,150]},
  {id:'pt', n:'Platinum',        f:'Pt',  c:'Transition', st:'s', mm:195.08,max:10,def:1, rgb:[210,210,215]},
  {id:'au', n:'Gold',            f:'Au',  c:'Transition', st:'s', mm:196.97,max:10,def:1, rgb:[230,190,60]},
  {id:'hg', n:'Mercury',         f:'Hg',  c:'Transition', st:'l', mm:200.59,max:10,def:1, rgb:[210,215,220], toxic:true},

  /* ─── POST-TRANSITION (5) ─── */
  {id:'al', n:'Aluminium',       f:'Al',  c:'Post-Transition', st:'s', mm:26.98, max:20,def:2, rgb:[210,210,215]},
  {id:'ga', n:'Gallium',         f:'Ga',  c:'Post-Transition', st:'s', mm:69.72, max:15,def:2, rgb:[200,205,210]},
  {id:'sn', n:'Tin',             f:'Sn',  c:'Post-Transition', st:'s', mm:118.71,max:15,def:2, rgb:[200,205,210]},
  {id:'pb', n:'Lead',            f:'Pb',  c:'Post-Transition', st:'s', mm:207.2, max:15,def:2, rgb:[95,95,105], toxic:true},
  {id:'bi', n:'Bismuth',         f:'Bi',  c:'Post-Transition', st:'s', mm:208.98,max:15,def:2, rgb:[215,200,180]},

  /* ─── NON-METALS (15) ─── */
  {id:'h2', n:'Hydrogen Gas',    f:'H₂',  c:'Non-Metals', st:'g', M:0.045, max:50, def:10, rgb:[240,245,250]},
  {id:'n2', n:'Nitrogen Gas',    f:'N₂',  c:'Non-Metals', st:'g', M:0.045, max:50, def:10, rgb:[240,245,250]},
  {id:'o2', n:'Oxygen Gas',      f:'O₂',  c:'Non-Metals', st:'g', M:0.045, max:50, def:10, rgb:[240,245,250]},
  {id:'f2', n:'Fluorine Gas',    f:'F₂',  c:'Non-Metals', st:'g', M:0.045, max:50, def:10, rgb:[200,240,180], toxic:true},
  {id:'cl2',n:'Chlorine Gas',    f:'Cl₂', c:'Non-Metals', st:'g', M:0.045, max:50, def:10, rgb:[210,230,150], toxic:true},
  {id:'br2',n:'Bromine',         f:'Br₂', c:'Non-Metals', st:'l', mm:159.8, dens:3.10, max:10,def:2, rgb:[170,50,40], toxic:true},
  {id:'i2', n:'Iodine',          f:'I₂',  c:'Non-Metals', st:'s', mm:253.8, max:10,def:1, rgb:[90,40,120]},
  {id:'b',  n:'Boron',           f:'B',   c:'Non-Metals', st:'s', mm:10.81, max:10,def:1, rgb:[140,120,90]},
  {id:'c',  n:'Carbon',          f:'C',   c:'Non-Metals', st:'s', mm:12.01, max:10,def:1, rgb:[35,35,40]},
  {id:'si', n:'Silicon',         f:'Si',  c:'Non-Metals', st:'s', mm:28.09, max:10,def:1, rgb:[80,80,90]},
  {id:'p',  n:'Phosphorus',      f:'P',   c:'Non-Metals', st:'s', mm:30.97, max:10,def:1, rgb:[205,80,60]},
  {id:'s',  n:'Sulfur',          f:'S',   c:'Non-Metals', st:'s', mm:32.06, max:10,def:1, rgb:[230,220,60]},
  {id:'as', n:'Arsenic',         f:'As',  c:'Non-Metals', st:'s', mm:74.92, max:10,def:1, rgb:[160,160,165], toxic:true},
  {id:'se', n:'Selenium',        f:'Se',  c:'Non-Metals', st:'s', mm:78.97, max:10,def:1, rgb:[180,60,50], toxic:true},
  {id:'te', n:'Tellurium',       f:'Te',  c:'Non-Metals', st:'s', mm:127.6, max:10,def:1, rgb:[190,190,180]},

  /* ─── BASIC OXIDES (10) ─── */
  {id:'li2o',n:'Lithium Oxide',  f:'Li₂O',c:'Basic Oxides', st:'s', mm:29.88, max:20,def:2, rgb:[245,240,235], basicOxide:true, ions:{'Li+':2,'OH-':2}},
  {id:'na2o',n:'Sodium Oxide',   f:'Na₂O',c:'Basic Oxides', st:'s', mm:61.98, max:20,def:2, rgb:[245,240,235], basicOxide:true, ions:{'Na+':2,'OH-':2}},
  {id:'k2o', n:'Potassium Oxide',f:'K₂O', c:'Basic Oxides', st:'s', mm:94.20, max:20,def:2, rgb:[245,240,235], basicOxide:true, ions:{'K+':2,'OH-':2}},
  {id:'mgo', n:'Magnesium Oxide',f:'MgO', c:'Basic Oxides', st:'s', mm:40.30, max:20,def:2, rgb:[245,245,245], basicOxide:true, ions:{'Mg2+':1,'OH-':2}},
  {id:'cao', n:'Calcium Oxide',  f:'CaO', c:'Basic Oxides', st:'s', mm:56.08, max:20,def:5, rgb:[235,235,230], basicOxide:true},
  {id:'sro', n:'Strontium Oxide',f:'SrO', c:'Basic Oxides', st:'s', mm:103.62,max:20,def:2, rgb:[245,240,235], basicOxide:true, ions:{'Sr2+':1,'OH-':2}},
  {id:'bao', n:'Barium Oxide',   f:'BaO', c:'Basic Oxides', st:'s', mm:153.33,max:20,def:2, rgb:[240,240,235], basicOxide:true, ions:{'Ba2+':1,'OH-':2}},
  {id:'feo', n:'Iron(II) Oxide', f:'FeO', c:'Basic Oxides', st:'s', mm:71.84, max:20,def:2, rgb:[35,35,40], basicOxide:true},
  {id:'cuo', n:'Copper(II) Oxide',f:'CuO',c:'Basic Oxides', st:'s', mm:79.55, max:20,def:2, rgb:[25,25,30], basicOxide:true},
  {id:'ago', n:'Silver Oxide',   f:'Ag₂O',c:'Basic Oxides', st:'s', mm:231.74,max:20,def:2, rgb:[60,60,65], basicOxide:true},

  /* ─── ACIDIC OXIDES (9) ─── */
  {id:'co2',  n:'Carbon Dioxide',      f:'CO₂',   c:'Acidic Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,250,245], acidicOxide:true, ions:{'H+':1,'HCO3-':1}},
  {id:'so2',  n:'Sulfur Dioxide',      f:'SO₂',   c:'Acidic Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,250,240], acidicOxide:true, toxic:true, ions:{'H+':2,'SO3^2-':1}},
  {id:'so3',  n:'Sulfur Trioxide',     f:'SO₃',   c:'Acidic Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,250,240], acidicOxide:true, toxic:true, ions:{'H+':2,'SO4^2-':1}},
  {id:'no2',  n:'Nitrogen Dioxide',    f:'NO₂',   c:'Acidic Oxides', st:'g', M:0.045,max:50,def:10, rgb:[200,110,70], acidicOxide:true, toxic:true, ions:{'H+':1,'NO3-':1}},
  {id:'n2o5', n:'Dinitrogen Pentoxide',f:'N₂O₅',  c:'Acidic Oxides', st:'s', mm:108.01,max:20,def:2, rgb:[240,245,250], acidicOxide:true, ions:{'H+':2,'NO3-':2}},
  {id:'p4o10',n:'Phosphorus Pentoxide',f:'P₄O₁₀',c:'Acidic Oxides', st:'s', mm:283.89,max:10,def:1, rgb:[245,245,240], acidicOxide:true, ions:{'H+':12,'PO4^3-':4}},
  {id:'cl2o7',n:'Dichlorine Heptoxide',f:'Cl₂O₇',c:'Acidic Oxides', st:'l', M:0.05, max:50,def:10, rgb:[240,250,240], acidicOxide:true, toxic:true, ions:{'H+':2,'ClO4-':2}},
  {id:'sio2', n:'Silicon Dioxide',     f:'SiO₂',  c:'Acidic Oxides', st:'s', mm:60.08, max:20,def:2, rgb:[240,240,240], acidicOxide:true},
  {id:'mno2', n:'Manganese Dioxide',   f:'MnO₂',  c:'Acidic Oxides', st:'s', mm:86.94, max:20,def:2, rgb:[35,30,30], amphoteric:true},

  /* ─── AMPHOTERIC OXIDES (6) ─── */
  {id:'al2o3',n:'Aluminium Oxide',f:'Al₂O₃',c:'Amphoteric Oxides', st:'s', mm:101.96,max:20,def:2, rgb:[240,240,245], amphoteric:true},
  {id:'zno',  n:'Zinc Oxide',     f:'ZnO',  c:'Amphoteric Oxides', st:'s', mm:81.38, max:20,def:2, rgb:[245,245,240], amphoteric:true},
  {id:'sno2', n:'Tin(IV) Oxide',  f:'SnO₂', c:'Amphoteric Oxides', st:'s', mm:150.71,max:20,def:2, rgb:[240,240,240], amphoteric:true},
  {id:'cr2o3',n:'Chromium(III) Oxide',f:'Cr₂O₃',c:'Amphoteric Oxides', st:'s', mm:151.99,max:20,def:2, rgb:[40,90,60], amphoteric:true},
  {id:'beo',  n:'Beryllium Oxide',f:'BeO',  c:'Amphoteric Oxides', st:'s', mm:25.01, max:20,def:2, rgb:[245,245,245], amphoteric:true, toxic:true},
  {id:'fe2o3',n:'Iron(III) Oxide',f:'Fe₂O₃',c:'Amphoteric Oxides', st:'s', mm:159.69,max:20,def:2, rgb:[160,60,40], amphoteric:true},
  {id:'pbo',  n:'Lead(II) Oxide', f:'PbO',  c:'Amphoteric Oxides', st:'s', mm:223.2, max:20,def:2, rgb:[240,235,60], amphoteric:true, toxic:true},

  /* ─── NEUTRAL OXIDES (3) ─── */
  {id:'co', n:'Carbon Monoxide', f:'CO', c:'Neutral Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,245,245], neutral:true, toxic:true},
  {id:'no', n:'Nitric Oxide',    f:'NO', c:'Neutral Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,245,245], neutral:true, toxic:true},
  {id:'n2o',n:'Nitrous Oxide',   f:'N₂O',c:'Neutral Oxides', st:'g', M:0.045,max:50,def:10, rgb:[240,245,245], neutral:true},

  /* ─── STRONG ACIDS (7) ─── */
  {id:'hcl',   n:'Hydrochloric Acid',f:'HCl',    c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[235,245,255], ions:{'H+':1,'Cl-':1},   dhSol:-75},
  {id:'hbr',   n:'Hydrobromic Acid', f:'HBr',    c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[235,245,255], ions:{'H+':1,'Br-':1},   dhSol:-85},
  {id:'hi',    n:'Hydroiodic Acid',  f:'HI',     c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[235,245,255], ions:{'H+':1,'I-':1},    dhSol:-56},
  {id:'h2so4', n:'Sulfuric Acid',    f:'H₂SO₄',  c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,255], ions:{'H+':2,'SO4^2-':1},dhSol:-88},
  {id:'hno3',  n:'Nitric Acid',      f:'HNO₃',   c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,255], ions:{'H+':1,'NO3-':1},  dhSol:-80},
  {id:'hclo4', n:'Perchloric Acid',  f:'HClO₄',  c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,255], ions:{'H+':1,'ClO4-':1}, dhSol:-88},
  {id:'hclo3', n:'Chloric Acid',     f:'HClO₃',  c:'Strong Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,255], ions:{'H+':1,'ClO3-':1}, dhSol:-80},

  /* ─── WEAK ACIDS (10) ─── */
  {id:'hf',     n:'Hydrofluoric Acid',f:'HF',     c:'Weak Acids', st:'l', M:1.0, max:50,def:10, rgb:[240,245,255], weakAcid:true, toxic:true, dhSol:-15},
  {id:'h3po4',  n:'Phosphoric Acid',  f:'H₃PO₄',  c:'Weak Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,255], weakAcid:true, dhSol:-40},
  {id:'ch3cooh',n:'Acetic Acid',      f:'CH₃COOH',c:'Weak Acids', st:'l', M:1.0, max:100,def:20, rgb:[240,245,250], weakAcid:true, dhSol:-10},
  {id:'h2co3',  n:'Carbonic Acid',    f:'H₂CO₃',  c:'Weak Acids', st:'l', M:0.5, max:100,def:20, rgb:[240,245,255], weakAcid:true, dhSol:-20},
  {id:'h2c2o4', n:'Oxalic Acid',      f:'H₂C₂O₄', c:'Weak Acids', st:'s', mm:90.03,max:20,def:2, rgb:[245,245,245], weakAcid:true},
  {id:'h2s',    n:'Hydrosulfuric Acid',f:'H₂S',   c:'Weak Acids', st:'l', M:0.1, max:50,def:10, rgb:[240,245,250], weakAcid:true, toxic:true},
  {id:'hcn',    n:'Hydrocyanic Acid', f:'HCN',    c:'Weak Acids', st:'l', M:0.1, max:50,def:10, rgb:[240,245,250], weakAcid:true, toxic:true},
  {id:'hno2',   n:'Nitrous Acid',     f:'HNO₂',   c:'Weak Acids', st:'l', M:0.5, max:50,def:10, rgb:[240,245,255], weakAcid:true},
  {id:'h2so3',  n:'Sulfurous Acid',   f:'H₂SO₃',  c:'Weak Acids', st:'l', M:0.5, max:50,def:10, rgb:[240,245,255], weakAcid:true},
  {id:'h3bo3',  n:'Boric Acid',       f:'H₃BO₃',  c:'Weak Acids', st:'s', mm:61.83,max:20,def:3, rgb:[245,245,245], weakAcid:true},

  /* ─── STRONG BASES (8) ─── */
  {id:'lioh',  n:'Lithium Hydroxide', f:'LiOH',   c:'Strong Bases', st:'l', M:1.0, max:100,def:20, rgb:[240,250,255], ions:{'Li+':1,'OH-':1}, dhSol:-51},
  {id:'naoh',  n:'Sodium Hydroxide',  f:'NaOH',   c:'Strong Bases', st:'l', M:1.0, max:100,def:20, rgb:[240,250,255], ions:{'Na+':1,'OH-':1}, dhSol:-44},
  {id:'koh',   n:'Potassium Hydroxide',f:'KOH',   c:'Strong Bases', st:'l', M:1.0, max:100,def:20, rgb:[240,250,255], ions:{'K+':1,'OH-':1},  dhSol:-57},
  {id:'rboh',  n:'Rubidium Hydroxide',f:'RbOH',   c:'Strong Bases', st:'l', M:1.0, max:100,def:20, rgb:[240,250,255], ions:{'Rb+':1,'OH-':1}, dhSol:-63},
  {id:'csoh',  n:'Caesium Hydroxide', f:'CsOH',   c:'Strong Bases', st:'l', M:1.0, max:100,def:20, rgb:[240,250,255], ions:{'Cs+':1,'OH-':1}, dhSol:-72},
  {id:'caoh2', n:'Calcium Hydroxide', f:'Ca(OH)₂',c:'Strong Bases', st:'l', M:0.02,max:100,def:30, rgb:[240,250,250], ions:{'Ca2+':1,'OH-':2}},
  {id:'sroh2', n:'Strontium Hydroxide',f:'Sr(OH)₂',c:'Strong Bases', st:'l', M:0.05,max:100,def:30, rgb:[240,250,250], ions:{'Sr2+':1,'OH-':2}},
  {id:'baoh2', n:'Barium Hydroxide',  f:'Ba(OH)₂',c:'Strong Bases', st:'l', M:0.1, max:100,def:30, rgb:[240,250,255], ions:{'Ba2+':1,'OH-':2}},

  /* ─── WEAK BASES (6) ─── */
  {id:'nh3',   n:'Ammonia Solution',  f:'NH₃(aq)',c:'Weak Bases', st:'l', M:1.0, max:100,def:20, rgb:[235,245,250], weakBase:true, dhSol:-30},
  {id:'mgoh2', n:'Magnesium Hydroxide',f:'Mg(OH)₂',c:'Weak Bases', st:'s', mm:58.32,max:20,def:3,  rgb:[245,245,245], insoluble:true, ions:{'Mg2+':1,'OH-':2}},
  {id:'feoh3', n:'Iron(III) Hydroxide',f:'Fe(OH)₃',c:'Weak Bases', st:'s', mm:106.87,max:20,def:3, rgb:[140,60,40], insoluble:true},
  {id:'aloh3', n:'Aluminium Hydroxide',f:'Al(OH)₃',c:'Weak Bases', st:'s', mm:78.00,max:20,def:3, rgb:[240,245,245], insoluble:true, amphoteric:true},
  {id:'cuoh2', n:'Copper(II) Hydroxide',f:'Cu(OH)₂',c:'Weak Bases', st:'s', mm:97.56,max:20,def:3, rgb:[120,190,240], insoluble:true},
  {id:'znoh2', n:'Zinc Hydroxide',    f:'Zn(OH)₂', c:'Weak Bases', st:'s', mm:99.42,max:20,def:3, rgb:[240,240,245], insoluble:true, amphoteric:true},

  /* ─── SALTS: CHLORIDES (14) ─── */
  {id:'nacl', n:'Sodium Chloride',    f:'NaCl',   c:'Salts', st:'s', mm:58.44, max:50,def:5, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'Cl-':1}},
  {id:'kcl',  n:'Potassium Chloride', f:'KCl',    c:'Salts', st:'s', mm:74.55, max:50,def:5, rgb:[245,245,245], soluble:true, ions:{'K+':1,'Cl-':1}},
  {id:'licl', n:'Lithium Chloride',   f:'LiCl',   c:'Salts', st:'s', mm:42.39, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Li+':1,'Cl-':1}},
  {id:'cacl2',n:'Calcium Chloride',   f:'CaCl₂',  c:'Salts', st:'s', mm:110.98,max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Ca2+':1,'Cl-':2}},
  {id:'mgcl2',n:'Magnesium Chloride', f:'MgCl₂',  c:'Salts', st:'s', mm:95.21, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Mg2+':1,'Cl-':2}},
  {id:'bacl2',n:'Barium Chloride',    f:'BaCl₂',  c:'Salts', st:'s', mm:208.23,max:20,def:3, rgb:[245,245,245], soluble:true, toxic:true, ions:{'Ba2+':1,'Cl-':2}},
  {id:'fecl2',n:'Iron(II) Chloride',  f:'FeCl₂',  c:'Salts', st:'s', mm:126.75,max:20,def:3, rgb:[150,180,140], soluble:true, ions:{'Fe2+':1,'Cl-':2}},
  {id:'fecl3',n:'Iron(III) Chloride', f:'FeCl₃',  c:'Salts', st:'s', mm:162.2, max:20,def:2, rgb:[200,140,60], soluble:true, ions:{'Fe3+':1,'Cl-':3}},
  {id:'cucl2',n:'Copper(II) Chloride',f:'CuCl₂',  c:'Salts', st:'s', mm:134.45,max:20,def:2, rgb:[60,140,200], soluble:true, ions:{'Cu2+':1,'Cl-':2}},
  {id:'zncl2',n:'Zinc Chloride',      f:'ZnCl₂',  c:'Salts', st:'s', mm:136.29,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Zn2+':1,'Cl-':2}},
  {id:'alcl3',n:'Aluminium Chloride', f:'AlCl₃',  c:'Salts', st:'s', mm:133.34,max:20,def:2, rgb:[240,240,245], soluble:true, ions:{'Al3+':1,'Cl-':3}},
  {id:'nh4cl',n:'Ammonium Chloride',  f:'NH₄Cl',  c:'Salts', st:'s', mm:53.49, max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'NH4+':1,'Cl-':1}},
  {id:'agcl', n:'Silver Chloride',    f:'AgCl',   c:'Salts', st:'s', mm:143.32,max:20,def:2, rgb:[248,248,250], insoluble:true},
  {id:'pbcl2',n:'Lead(II) Chloride',  f:'PbCl₂',  c:'Salts', st:'s', mm:278.1, max:20,def:2, rgb:[245,245,245], insoluble:true, toxic:true},

  /* ─── SALTS: BROMIDES (3) ─── */
  {id:'nabr', n:'Sodium Bromide',     f:'NaBr',   c:'Salts', st:'s', mm:102.89,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'Br-':1}},
  {id:'kbr',  n:'Potassium Bromide',  f:'KBr',    c:'Salts', st:'s', mm:119.0, max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'K+':1,'Br-':1}},
  {id:'agbr', n:'Silver Bromide',     f:'AgBr',   c:'Salts', st:'s', mm:187.77,max:20,def:2, rgb:[245,235,200], insoluble:true},

  /* ─── SALTS: IODIDES (4) ─── */
  {id:'nai',  n:'Sodium Iodide',      f:'NaI',    c:'Salts', st:'s', mm:149.89,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'I-':1}},
  {id:'ki',   n:'Potassium Iodide',   f:'KI',     c:'Salts', st:'s', mm:166.0, max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'K+':1,'I-':1}},
  {id:'agi',  n:'Silver Iodide',      f:'AgI',    c:'Salts', st:'s', mm:234.77,max:20,def:2, rgb:[250,240,120], insoluble:true},
  {id:'pbi2', n:'Lead(II) Iodide',    f:'PbI₂',   c:'Salts', st:'s', mm:461.0, max:20,def:2, rgb:[250,208,40], insoluble:true, toxic:true},

  /* ─── SALTS: NITRATES (8) ─── */
  {id:'nano3',n:'Sodium Nitrate',     f:'NaNO₃',  c:'Salts', st:'s', mm:84.99, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'NO3-':1}},
  {id:'kno3', n:'Potassium Nitrate',  f:'KNO₃',   c:'Salts', st:'s', mm:101.1, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'K+':1,'NO3-':1}},
  {id:'agno3',n:'Silver Nitrate',     f:'AgNO₃',  c:'Salts', st:'s', mm:169.87,max:20,def:2, rgb:[240,240,245], soluble:true, ions:{'Ag+':1,'NO3-':1}},
  {id:'pbno32',n:'Lead(II) Nitrate',  f:'Pb(NO₃)₂',c:'Salts',st:'s', mm:331.2, max:20,def:2, rgb:[240,240,245], soluble:true, toxic:true, ions:{'Pb2+':1,'NO3-':2}},
  {id:'cuno32',n:'Copper(II) Nitrate',f:'Cu(NO₃)₂',c:'Salts', st:'s', mm:187.56,max:20,def:2, rgb:[40,110,220], soluble:true, ions:{'Cu2+':1,'NO3-':2}},
  {id:'cano32',n:'Calcium Nitrate',   f:'Ca(NO₃)₂',c:'Salts', st:'s', mm:164.09,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Ca2+':1,'NO3-':2}},
  {id:'nh4no3',n:'Ammonium Nitrate',  f:'NH₄NO₃', c:'Salts', st:'s', mm:80.04, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'NH4+':1,'NO3-':1}},
  {id:'feno33',n:'Iron(III) Nitrate', f:'Fe(NO₃)₃',c:'Salts', st:'s', mm:241.86,max:20,def:2, rgb:[190,125,45], soluble:true, ions:{'Fe3+':1,'NO3-':3}},

  /* ─── SALTS: SULFATES (12) ─── */
  {id:'na2so4',n:'Sodium Sulfate',    f:'Na₂SO₄', c:'Salts', st:'s', mm:142.04,max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Na+':2,'SO4^2-':1}},
  {id:'k2so4', n:'Potassium Sulfate', f:'K₂SO₄',  c:'Salts', st:'s', mm:174.26,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'K+':2,'SO4^2-':1}},
  {id:'mgso4', n:'Magnesium Sulfate', f:'MgSO₄',  c:'Salts', st:'s', mm:120.37,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Mg2+':1,'SO4^2-':1}},
  {id:'cuso4', n:'Copper(II) Sulfate',f:'CuSO₄',  c:'Salts', st:'s', mm:159.6, max:30,def:5, rgb:[40,110,220], soluble:true, ions:{'Cu2+':1,'SO4^2-':1}},
  {id:'feso4', n:'Iron(II) Sulfate',  f:'FeSO₄',  c:'Salts', st:'s', mm:151.91,max:20,def:3, rgb:[110,160,120], soluble:true, ions:{'Fe2+':1,'SO4^2-':1}},
  {id:'znso4', n:'Zinc Sulfate',      f:'ZnSO₄',  c:'Salts', st:'s', mm:161.44,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Zn2+':1,'SO4^2-':1}},
  {id:'baso4', n:'Barium Sulfate',    f:'BaSO₄',  c:'Salts', st:'s', mm:233.39,max:20,def:2, rgb:[250,250,250], insoluble:true},
  {id:'pbso4', n:'Lead(II) Sulfate',  f:'PbSO₄',  c:'Salts', st:'s', mm:303.26,max:20,def:2, rgb:[250,250,250], insoluble:true, toxic:true},
  {id:'caso4', n:'Calcium Sulfate',   f:'CaSO₄',  c:'Salts', st:'s', mm:136.14,max:20,def:3, rgb:[245,245,245], insoluble:true},
  {id:'al2so43',n:'Aluminium Sulfate',f:'Al₂(SO₄)₃',c:'Salts',st:'s', mm:342.15,max:20,def:2, rgb:[245,245,245], soluble:true, ions:{'Al3+':2,'SO4^2-':3}},
  {id:'feso47',n:'Iron(II) Sulfate Heptahydrate',f:'FeSO₄·7H₂O',c:'Salts',st:'s', mm:278.01,max:20,def:3, rgb:[110,160,120], soluble:true, ions:{'Fe2+':1,'SO4^2-':1}},
  {id:'mgso47',n:'Epsom Salt',        f:'MgSO₄·7H₂O',c:'Salts',st:'s',mm:246.47,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Mg2+':1,'SO4^2-':1}},

  /* ─── SALTS: CARBONATES (8) ─── */
  {id:'na2co3',n:'Sodium Carbonate',  f:'Na₂CO₃', c:'Salts', st:'s', mm:105.99,max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Na+':2,'CO3^2-':1}},
  {id:'k2co3', n:'Potassium Carbonate',f:'K₂CO₃', c:'Salts', st:'s', mm:138.21,max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'K+':2,'CO3^2-':1}},
  {id:'nahco3',n:'Sodium Bicarbonate',f:'NaHCO₃', c:'Salts', st:'s', mm:84.01, max:30,def:5, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'HCO3-':1}},
  {id:'caco3', n:'Calcium Carbonate', f:'CaCO₃',  c:'Salts', st:'s', mm:100.09,max:30,def:5, rgb:[240,240,235], insoluble:true},
  {id:'mgco3', n:'Magnesium Carbonate',f:'MgCO₃', c:'Salts', st:'s', mm:84.31, max:20,def:3, rgb:[245,245,245], insoluble:true},
  {id:'baco3', n:'Barium Carbonate',  f:'BaCO₃',  c:'Salts', st:'s', mm:197.34,max:20,def:2, rgb:[250,250,248], insoluble:true, toxic:true},
  {id:'cu2oh2co3',n:'Basic Copper Carbonate',f:'Cu₂(OH)₂CO₃',c:'Salts',st:'s',mm:221.12,max:20,def:2,rgb:[80,150,140], insoluble:true},
  {id:'li2co3',n:'Lithium Carbonate', f:'Li₂CO₃', c:'Salts', st:'s', mm:73.89, max:20,def:3, rgb:[245,245,245], insoluble:true},

  /* ─── SALTS: MISCELLANEOUS (14) ─── */
  {id:'kmno4',n:'Potassium Permanganate',f:'KMnO₄',c:'Salts',st:'s', mm:158.03,max:10,def:1, rgb:[130,10,90], soluble:true, ions:{'K+':1,'MnO4-':1}},
  {id:'k2cr2o7',n:'Potassium Dichromate',f:'K₂Cr₂O₇',c:'Salts',st:'s', mm:294.19,max:10,def:1, rgb:[220,120,30], soluble:true, toxic:true, ions:{'K+':2,'Cr2O7^2-':1}},
  {id:'kscn', n:'Potassium Thiocyanate',f:'KSCN', c:'Salts', st:'s', mm:97.18, max:20,def:2, rgb:[245,245,245], soluble:true, ions:{'K+':1,'SCN-':1}},
  {id:'nascn',n:'Sodium Thiocyanate', f:'NaSCN',  c:'Salts', st:'s', mm:81.07, max:20,def:2, rgb:[245,245,245], soluble:true, ions:{'Na+':1,'SCN-':1}},
  {id:'nh4scn',n:'Ammonium Thiocyanate',f:'NH₄SCN',c:'Salts',st:'s', mm:76.12, max:20,def:2, rgb:[245,245,245], soluble:true, ions:{'NH4+':1,'SCN-':1}},
  {id:'na2s', n:'Sodium Sulfide',     f:'Na₂S',   c:'Salts', st:'s', mm:78.05, max:20,def:3, rgb:[240,240,240], soluble:true, toxic:true, ions:{'Na+':2,'S2-':1}},
  {id:'na3po4',n:'Sodium Phosphate',  f:'Na₃PO₄', c:'Salts', st:'s', mm:163.94,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'Na+':3,'PO4^3-':1}},
  {id:'k3po4',n:'Potassium Phosphate',f:'K₃PO₄',  c:'Salts', st:'s', mm:212.27,max:20,def:3, rgb:[245,245,245], soluble:true, ions:{'K+':3,'PO4^3-':1}},
  {id:'mg3po42',n:'Magnesium Phosphate',f:'Mg₃(PO₄)₂',c:'Salts',st:'s',mm:262.86,max:20,def:2,rgb:[245,245,245], insoluble:true},
  {id:'naf',  n:'Sodium Fluoride',    f:'NaF',    c:'Salts', st:'s', mm:41.99, max:20,def:3, rgb:[245,245,245], soluble:true, toxic:true, ions:{'Na+':1,'F-':1}},
  {id:'kf',   n:'Potassium Fluoride', f:'KF',     c:'Salts', st:'s', mm:58.10, max:20,def:3, rgb:[245,245,245], soluble:true, toxic:true, ions:{'K+':1,'F-':1}},
  {id:'caf2', n:'Calcium Fluoride',   f:'CaF₂',   c:'Salts', st:'s', mm:78.07, max:20,def:2, rgb:[245,245,245], insoluble:true},
  {id:'feoh2',n:'Iron(II) Hydroxide', f:'Fe(OH)₂',c:'Salts', st:'s', mm:89.86, max:20,def:2, rgb:[110,160,110], insoluble:true},
  {id:'cu2o', n:'Copper(I) Oxide',    f:'Cu₂O',   c:'Salts', st:'s', mm:143.09,max:20,def:2, rgb:[180,60,40], insoluble:true},

  /* ─── SOLVENTS (20) ─── */
  {id:'h2o',   n:'Distilled Water',  f:'H₂O',    c:'Solvents', st:'l', M:0.0, max:500,def:50, rgb:[230,240,250]},
  {id:'h2o2',  n:'Hydrogen Peroxide',f:'H₂O₂',   c:'Solvents', st:'l', M:1.0, max:100,def:20, rgb:[240,248,255]},
  {id:'etoh',  n:'Ethanol',          f:'C₂H₅OH', c:'Solvents', st:'l', mm:46.07,dens:0.789, max:100,def:20, rgb:[245,250,255], fuel:true, ign:300, dhComb:1367, co2:2},
  {id:'meoh',  n:'Methanol',         f:'CH₃OH',  c:'Solvents', st:'l', mm:32.04,dens:0.792, max:100,def:20, rgb:[245,250,255], fuel:true, ign:280, dhComb:726,  co2:1},
  {id:'acetone',n:'Acetone',         f:'C₃H₆O',  c:'Solvents', st:'l', mm:58.08,dens:0.784, max:100,def:20, rgb:[245,250,255], fuel:true, ign:290, dhComb:1790, co2:3},
  {id:'hexane',n:'Hexane',           f:'C₆H₁₄',  c:'Solvents', st:'l', mm:86.18,dens:0.659, max:100,def:20, rgb:[245,248,255], fuel:true, ign:225, dhComb:4163, co2:6},
  {id:'benzene',n:'Benzene',         f:'C₆H₆',   c:'Solvents', st:'l', mm:78.11,dens:0.876, max:100,def:20, rgb:[245,250,255], fuel:true, ign:498, dhComb:3268, co2:6, toxic:true},
  {id:'toluene',n:'Toluene',         f:'C₇H₈',   c:'Solvents', st:'l', mm:92.14,dens:0.867, max:100,def:20, rgb:[245,250,255], fuel:true, ign:480, dhComb:3910, co2:7},
  {id:'chcl3',n:'Chloroform',        f:'CHCl₃',  c:'Solvents', st:'l', mm:119.38,dens:1.489,max:100,def:20, rgb:[245,250,255], toxic:true},
  {id:'dmso', n:'Dimethyl Sulfoxide',f:'DMSO',   c:'Solvents', st:'l', mm:78.13,dens:1.100, max:100,def:20, rgb:[245,250,255]},
  {id:'thf',  n:'Tetrahydrofuran',   f:'THF',    c:'Solvents', st:'l', mm:72.11,dens:0.889, max:100,def:20, rgb:[245,250,255], fuel:true, ign:321, dhComb:2500, co2:4},
  {id:'ch4',  n:'Methane',           f:'CH₄',    c:'Solvents', st:'g', mm:16.04,dens:0.423, max:100,def:20, rgb:[245,250,255], fuel:true, ign:537, dhComb:890, co2:1},
  {id:'c2h6', n:'Ethane',            f:'C₂H₆',   c:'Solvents', st:'g', mm:30.07,dens:0.356, max:100,def:20, rgb:[245,250,255], fuel:true, ign:472, dhComb:1560, co2:2},
  {id:'c3h8', n:'Propane',           f:'C₃H₈',   c:'Solvents', st:'g', mm:44.10,dens:0.493, max:100,def:20, rgb:[245,250,255], fuel:true, ign:450, dhComb:2220, co2:3},
  {id:'c4h10',n:'Butane',            f:'C₄H₁₀',  c:'Solvents', st:'g', mm:58.12,dens:0.573, max:100,def:20, rgb:[245,250,255], fuel:true, ign:405, dhComb:2877, co2:4},
  {id:'c8h18',n:'Octane',            f:'C₈H₁₈',  c:'Solvents', st:'l', mm:114.23,dens:0.703,max:100,def:20, rgb:[245,250,255], fuel:true, ign:220, dhComb:5470, co2:8},
  {id:'c2h4', n:'Ethylene',          f:'C₂H₄',   c:'Solvents', st:'g', mm:28.05,dens:0.567, max:100,def:20, rgb:[245,250,255], fuel:true, ign:490, dhComb:1411, co2:2},
  {id:'c2h2', n:'Acetylene',         f:'C₂H₂',   c:'Solvents', st:'g', mm:26.04,dens:0.620, max:100,def:20, rgb:[245,250,255], fuel:true, ign:305, dhComb:1300, co2:2},
  {id:'glycerin',n:'Glycerin',       f:'C₃H₈O₃', c:'Solvents', st:'l', mm:92.09,dens:1.261, max:100,def:20, rgb:[248,250,255]},
  {id:'pyridine',n:'Pyridine',       f:'C₅H₅N',  c:'Solvents', st:'l', mm:79.10,dens:0.982, max:100,def:20, rgb:[245,250,255], toxic:true},

  /* ─── INDICATORS (8) ─── */
  {id:'ui',    n:'Universal Indicator',f:'UI',    c:'Indicators', st:'l', ind:'ui',  max:10,def:1, rgb:[180,200,120]},
  {id:'phph',  n:'Phenolphthalein',    f:'C₂₀H₁₄O₄',c:'Indicators',st:'l', ind:'phph',max:10,def:1, rgb:[250,240,250]},
  {id:'btb',   n:'Bromothymol Blue',   f:'BTB',   c:'Indicators', st:'l', ind:'btb',  max:10,def:1, rgb:[220,200,90]},
  {id:'mor',   n:'Methyl Orange',      f:'MO',    c:'Indicators', st:'l', ind:'mor',  max:10,def:1, rgb:[240,170,60]},
  {id:'litmus',n:'Litmus Solution',    f:'Lit',   c:'Indicators', st:'l', ind:'lit',  max:10,def:1, rgb:[150,110,190]},
  {id:'bcg',   n:'Bromocresol Green',  f:'BCG',   c:'Indicators', st:'l', ind:'bcg',  max:10,def:1, rgb:[110,180,130]},
  {id:'mr',    n:'Methyl Red',         f:'MR',    c:'Indicators', st:'l', ind:'mr',   max:10,def:1, rgb:[220,60,40]},
  {id:'tb',    n:'Thymol Blue',        f:'TB',    c:'Indicators', st:'l', ind:'tb',   max:10,def:1, rgb:[200,180,80]},
];

/* ─── ION COLOURS ─── */
const ION_COLORS = {
  'Cu2+': [ 34,118,225],'Fe2+': [110,165,120],'Fe3+': [190,125, 45],
  'MnO4-':[150, 15,115],'I2':   [165,115, 35],'I-':   [225,225,205],
  'Ni2+': [ 60,180,120],'Co2+': [220,110,170],'Cr3+': [ 90,140, 70],
  'Cr2O7^2-':[220,120,30],'SCN-': [225,225,205],'Br2': [170,50,40],
  'Au3+': [230,190,60], 'Sn2+': [200,205,210],'Pb2+': [230,230,235],
  'Fe(SCN)2+': [200,60,40],'Cu(NH3)4^2+': [ 40, 90,180],
};

/* ─── PRECIPITATION RULES ─── */
const PRECIP_RULES = [
  { a:'Ag+', b:'Cl-',    ra:1,rb:1,prod:'AgCl',   col:[248,248,250], name:'Silver Chloride' },
  { a:'Ag+', b:'Br-',    ra:1,rb:1,prod:'AgBr',   col:[245,235,200], name:'Silver Bromide' },
  { a:'Ag+', b:'I-',     ra:1,rb:1,prod:'AgI',    col:[250,240,120], name:'Silver Iodide' },
  { a:'Ag+', b:'OH-',    ra:1,rb:1,prod:'AgOH',   col:[230,225,215], name:'Silver Hydroxide' },
  { a:'Ag+', b:'SCN-',   ra:1,rb:1,prod:'AgSCN',  col:[245,245,245], name:'Silver Thiocyanate' },
  { a:'Pb2+',b:'I-',     ra:1,rb:2,prod:'PbI2',   col:[250,208, 40], name:'Lead(II) Iodide' },
  { a:'Pb2+',b:'SO4^2-', ra:1,rb:1,prod:'PbSO4',  col:[250,250,250], name:'Lead(II) Sulfate' },
  { a:'Pb2+',b:'Cl-',    ra:1,rb:2,prod:'PbCl2',  col:[245,245,245], name:'Lead(II) Chloride' },
  { a:'Pb2+',b:'OH-',    ra:1,rb:2,prod:'Pb(OH)2',col:[245,245,245], name:'Lead(II) Hydroxide' },
  { a:'Ba2+',b:'SO4^2-', ra:1,rb:1,prod:'BaSO4',  col:[250,250,250], name:'Barium Sulfate' },
  { a:'Ba2+',b:'CO3^2-', ra:1,rb:1,prod:'BaCO3',  col:[250,250,248], name:'Barium Carbonate' },
  { a:'Cu2+',b:'OH-',    ra:1,rb:2,prod:'Cu(OH)2',col:[120,190,240], name:'Copper(II) Hydroxide' },
  { a:'Cu2+',b:'CO3^2-', ra:1,rb:1,prod:'CuCO3',  col:[ 90,170,180], name:'Copper(II) Carbonate' },
  { a:'Cu2+',b:'S2-',    ra:1,rb:1,prod:'CuS',    col:[20,20,20],    name:'Copper(II) Sulfide' },
  { a:'Fe3+',b:'OH-',    ra:1,rb:3,prod:'Fe(OH)3',col:[150, 80, 40], name:'Iron(III) Hydroxide' },
  { a:'Fe2+',b:'OH-',    ra:1,rb:2,prod:'Fe(OH)2',col:[110,160,110], name:'Iron(II) Hydroxide' },
  { a:'Fe3+',b:'SCN-',   ra:1,rb:1,prod:'Fe(SCN)2+',col:[200,60,40], name:'Iron(III) Thiocyanate' },
  { a:'Ca2+',b:'CO3^2-', ra:1,rb:1,prod:'CaCO3',  col:[245,245,240], name:'Calcium Carbonate' },
  { a:'Ca2+',b:'SO4^2-', ra:1,rb:1,prod:'CaSO4',  col:[245,245,245], name:'Calcium Sulfate' },
  { a:'Ca2+',b:'F-',     ra:1,rb:2,prod:'CaF2',   col:[245,245,245], name:'Calcium Fluoride' },
  { a:'Mg2+',b:'OH-',    ra:1,rb:2,prod:'Mg(OH)2',col:[248,248,248], name:'Magnesium Hydroxide' },
  { a:'Mg2+',b:'CO3^2-', ra:1,rb:1,prod:'MgCO3',  col:[245,245,245], name:'Magnesium Carbonate' },
  { a:'Zn2+',b:'OH-',    ra:1,rb:2,prod:'Zn(OH)2',col:[240,240,245], name:'Zinc Hydroxide' },
  { a:'Zn2+',b:'S2-',    ra:1,rb:1,prod:'ZnS',    col:[245,245,245], name:'Zinc Sulfide' },
  { a:'Al3+',b:'OH-',    ra:1,rb:3,prod:'Al(OH)3',col:[240,245,245], name:'Aluminium Hydroxide' },
  { a:'Li+', b:'CO3^2-', ra:2,rb:1,prod:'Li2CO3', col:[245,245,245], name:'Lithium Carbonate' },
];

/* ══════════════════════════════════════════════════════════════════════════
   AUDIO ENGINE — Web Audio API Synthesis
   ══════════════════════════════════════════════════════════════════════════ */
const LabAudio = {
  ctx:null, master:null, ready:false, enabled:true,
  fizzGain:null, hissGain:null, boilGain:null, boilOsc:null, boilLfo:null,

  init(){
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.30;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    const fs = this.ctx.createBufferSource(); fs.buffer = buf; fs.loop = true;
    const ff = this.ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 4800; ff.Q.value = 0.7;
    this.fizzGain = this.ctx.createGain(); this.fizzGain.gain.value = 0;
    fs.connect(ff).connect(this.fizzGain).connect(this.master); fs.start();

    const hs = this.ctx.createBufferSource(); hs.buffer = buf; hs.loop = true;
    const hf = this.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 1800;
    this.hissGain = this.ctx.createGain(); this.hissGain.gain.value = 0;
    hs.connect(hf).connect(this.hissGain).connect(this.master); hs.start();

    this.boilOsc = this.ctx.createOscillator(); this.boilOsc.type = 'sine'; this.boilOsc.frequency.value = 78;
    const bfilt = this.ctx.createBiquadFilter(); bfilt.type = 'lowpass'; bfilt.frequency.value = 420;
    this.boilGain = this.ctx.createGain(); this.boilGain.gain.value = 0;
    this.boilLfo = this.ctx.createOscillator(); this.boilLfo.type = 'sine'; this.boilLfo.frequency.value = 5.5;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.45;
    this.boilLfo.connect(lfoGain).connect(this.boilGain.gain);
    this.boilOsc.connect(bfilt).connect(this.boilGain).connect(this.master);
    this.boilOsc.start(); this.boilLfo.start();

    this.ready = true;
  },

  resume(){ if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setFizz(v){ if (this.ready) this.fizzGain.gain.setTargetAtTime(this.enabled ? Math.min(v, 0.5) : 0, this.ctx.currentTime, 0.08); },
  setHiss(v){ if (this.ready) this.hissGain.gain.setTargetAtTime(this.enabled ? Math.min(v, 0.4) : 0, this.ctx.currentTime, 0.08); },
  setBoil(v){ if (this.ready) this.boilGain.gain.setTargetAtTime(this.enabled ? Math.min(v, 0.35) : 0, this.ctx.currentTime, 0.1); },

  pop(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    const f0 = 180 + Math.random() * 480;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.13);
  },

  click(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(2400 + Math.random() * 900, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.07);
  },

  whirr(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(160, t + 0.25);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.55);
  },

  explode(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.65);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.85);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.9);
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1300;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
    n.connect(nf).connect(ng).connect(this.master); n.start(t); n.stop(t + 0.6);
  },

  shatter(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(11000, t + 0.32);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.6);
    n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 0.65);
    for (let i = 0; i < 7; i++) {
      const to = this.ctx.createOscillator(); to.type = 'triangle';
      const tt = t + i * 0.035;
      to.frequency.setValueAtTime(3200 + Math.random() * 4200, tt);
      const tg = this.ctx.createGain();
      tg.gain.setValueAtTime(0.07, tt);
      tg.gain.exponentialRampToValueAtTime(0.0004, tt + 0.2);
      to.connect(tg).connect(this.master); to.start(tt); to.stop(tt + 0.22);
    }
  },

  warn(){
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++){
      const tt = t + i * 0.18;
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(880, tt);
      o.frequency.exponentialRampToValueAtTime(440, tt + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06, tt);
      g.gain.exponentialRampToValueAtTime(0.0003, tt + 0.15);
      o.connect(g).connect(this.master); o.start(tt); o.stop(tt + 0.17);
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   VESSEL STATE MODEL — single source of truth
   ══════════════════════════════════════════════════════════════════════════ */
const vessel = {
  /* ─── Composition ─── */
  contents: [],          // array of {id, chem, moles, phase} for full tracking
  waterVolume: 0,        // mL of solvent (water / acid / base solutions)
  otherSolventVolume: 0, // mL of non-aqueous solvent
  solids: [],            // [{id, chem, moles}] undissolved
  gases: {},             // {formula: moles}
  ions: {},              // {ion: moles}
  precipitates: {},      // {formula: moles}
  fuels: {},             // {id: moles}
  indicators: {},        // {key: mL added}

  /* ─── Physical ─── */
  temperature: 25.0,     // °C
  mass: 0,               // g total
  pH: 7.0,
  dH: 0,                 // cumulative enthalpy kJ

  /* ─── Reaction bookkeeping ─── */
  lastEquation: '',
  lastReactionType: 'READY',
  lastDeltaH_kJmol: 0,
  eqHistory: new Set(),
  metalPresent: {},      // track metals for flame tests

  /* ─── Engine flags ─── */
  shattered: false,
  paused: false,
  buretteFrac: 1,
  buretteChem: 'naoh',
};

/* ─── Additional simulation state (particles, animation) ─── */
const sim = {
  fluidColor: [200, 225, 240],
  bubbles: [], steam: [], smoke: [], precipParticles: [], drops: [], ripples: [],
  flash: 0, shake: 0, gasRate: 0, steamRate: 0, stirPhase: 0, tick: 0,
  flame: 0, stir: 0, drip: 0,
};

let pendingAddition = null;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let ACTIVE_CAT = 'All';
const QTY = {};

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════ */
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const getIon = k => vessel.ions[k] || 0;
const setIon = (k,v) => { vessel.ions[k] = Math.max(0, v); if (vessel.ions[k] < 1e-13) delete vessel.ions[k]; };
const addIon = (k,v) => setIon(k, getIon(k) + v);

function kFactor(Ea_kJ, tempC){
  const T = tempC + 273.15, T0 = 298.15;
  const R = 8.314e-3;
  return Math.exp(-(Ea_kJ / R) * (1 / T - 1 / T0));
}
function heatCapacity(){ return 4.18 * Math.max(0, vessel.waterVolume + vessel.otherSolventVolume) + 82; }
function addHeat(joules){ vessel.temperature += joules / heatCapacity(); }
function nowStamp(){ return new Date().toTimeString().slice(0,8); }

function computeMoles(chem, qty){
  if (chem.st === 's') return qty / chem.mm;
  if (chem.M) return (qty / 1000) * chem.M;
  if (chem.dens) return (qty * chem.dens) / chem.mm;
  return 0;
}

/** Total liquid volume (mL) — used for molarity calculations */
function totalLiquidVolume(){
  return vessel.waterVolume + vessel.otherSolventVolume;
}

/** Check if the vessel has any liquid solvent present — used for dry reactivity */
function hasLiquidSolvent(){
  return totalLiquidVolume() > 0.1;
}

/* ══════════════════════════════════════════════════════════════════════════
   HAZARD INTERCEPT ENGINE
   ══════════════════════════════════════════════════════════════════════════ */
function detectHazard(chem, qty){
  const hazards = [];
  const moles = computeMoles(chem, qty);
  const V = Math.max(0.0005, totalLiquidVolume() / 1000);

  /* 1. Alkali metal + water — CRITICAL, but ONLY if liquid solvent present */
  if (chem.alkali && hasLiquidSolvent() && moles > 0.03){
    hazards.push({
      icons:['💥','🔥','☣️'], level:'CRITICAL',
      title:'EXTREME EXOTHERMIC REACTION',
      desc:`${chem.f} + H₂O → rapid hydrogen evolution, ignition & thermal runaway.`,
      detail:`Detected: ${(moles*1000).toFixed(1)} mmol ${chem.f} into ${totalLiquidVolume().toFixed(0)} mL liquid. Reaction may shatter vessel.`
    });
  }

  /* 2. Concentrated acid + base */
  if (chem.ions && moles > 0.05 && V > 0.005){
    const addsH  = !!chem.ions['H+'] && !chem.weakAcid;
    const addsOH = !!chem.ions['OH-'];
    const existingOH = getIon('OH-') / V;
    const existingH  = getIon('H+') / V;
    if (addsH && existingOH > 0.5 && (chem.M || 1) >= 1.0){
      hazards.push({
        icons:['🔥','☣️'], level:'HIGH',
        title:'VIOLENT NEUTRALISATION',
        desc:'Concentrated strong acid + strong base → intense exotherm, spatter & burn risk.',
        detail:`Detected: adding ${moles.toFixed(3)} mol H⁺ to a solution with [OH⁻] ≈ ${existingOH.toFixed(2)} M.`
      });
    }
    if (addsOH && existingH > 0.5 && (chem.M || 1) >= 1.0){
      hazards.push({
        icons:['🔥','☣️'], level:'HIGH',
        title:'VIOLENT NEUTRALISATION',
        desc:'Concentrated strong base + strong acid → intense exotherm, spatter & burn risk.',
        detail:`Detected: adding ${moles.toFixed(3)} mol OH⁻ to a solution with [H⁺] ≈ ${existingH.toFixed(2)} M.`
      });
    }
  }

  /* 3. Acidic oxide hydrolysis */
  if (chem.acidicOxide && hasLiquidSolvent()){
    const isP = chem.id === 'p4o10';
    hazards.push({
      icons:['☣️','🔥'], level: isP ? 'HIGH' : 'MODERATE',
      title: isP ? 'PHOSPHORUS PENTOXIDE HYDROLYSIS' : 'ACIDIC OXIDE HYDROLYSIS',
      desc: isP ? 'P₄O₁₀ + 6H₂O → 4H₃PO₄ — strongly exothermic, corrosive acid mist.'
                : `${chem.n} + H₂O → corrosive acid formation, exothermic.`,
      detail:'Fume hood recommended. Vessel may heat rapidly.'
    });
  }

  /* 4. Lime slaking */
  if (chem.id === 'cao' && hasLiquidSolvent()){
    hazards.push({
      icons:['🔥','☣️'], level:'HIGH',
      title:'LIME SLAKING — INTENSE EXOTHERM',
      desc:'CaO + H₂O → Ca(OH)₂, ΔH = −350 kJ·mol⁻¹. Rapid boiling & spatter.',
      detail:'Thermal burn & caustic splash risk. Do not add rapidly.'
    });
  }

  /* 5. Toxic gas */
  if (chem.toxic){
    hazards.push({
      icons:['☣️'], level:'CRITICAL',
      title:'TOXIC GAS RELEASE',
      desc: chem.id === 'co' ? 'Carbon monoxide — odourless, lethal, binds haemoglobin irreversibly.'
          : chem.id === 'no' ? 'Nitric oxide — toxic, oxidises to NO₂ in air; pulmonary oedema risk.'
          : chem.id === 'no2' ? 'Nitrogen dioxide — deep lung irritant, pulmonary oedema risk.'
          : chem.id === 'cl2' ? 'Chlorine gas — severe respiratory & mucous membrane damage.'
          : chem.id === 'f2' ? 'Fluorine gas — extremely corrosive, attacks all tissues.'
          : chem.id === 'hf' ? 'Hydrogen fluoride — penetrates skin, systemic fluoride toxicity.'
          : chem.id === 'hcn' ? 'Hydrogen cyanide — blocks cytochrome c oxidase, lethal within minutes.'
          : chem.id === 'h2s' ? 'Hydrogen sulfide — olfactory paralysis, respiratory failure.'
          : chem.id === 'as' ? 'Arsenic — systemic poison; may evolve arsine gas in acid.'
          : chem.id === 'br2' ? 'Bromine — severe burns, respiratory damage from vapour.'
          : chem.id === 'hg' ? 'Mercury — neurotoxin; vapour hazardous at room temperature.'
          : chem.id === 'cd' ? 'Cadmium — nephrotoxin; vapour exposure hazardous.'
          : `${chem.n} — respiratory & mucosal irritant.`,
      detail:'Fume hood required. Do not inhale vapours.'
    });
  }

  return hazards.length ? hazards : null;
}

function showHazardModal(chem, qty, hazards){
  const modal = document.getElementById('safetyModal');
  const top = hazards[0];
  const unit = chem.st === 's' ? 'g' : 'mL';

  const badge = document.getElementById('hazardLevelBadge');
  const levelColors = {
    CRITICAL: 'bg-red-700 text-white border-red-500',
    HIGH:     'bg-orange-700 text-white border-orange-500',
    MODERATE: 'bg-amber-700 text-white border-amber-500'
  };
  badge.textContent = top.level;
  badge.className = 'px-2.5 py-1 rounded text-[9px] font-black tracking-wider border ' + (levelColors[top.level] || levelColors.HIGH);

  const iconsWrap = document.getElementById('hazardIcons');
  const iconMap = { '💥': { c:'text-orange-300' }, '🔥': { c:'text-red-400' }, '☣️': { c:'text-lime-400' }, '⚠️': { c:'text-amber-300' } };
  const allIcons = [...new Set(hazards.flatMap(h => h.icons))];
  iconsWrap.innerHTML = allIcons.map(i => `<span class="hazard-icon hazard-blink ${iconMap[i] ? iconMap[i].c : 'text-red-300'}">${i}</span>`).join('');

  document.getElementById('hazardTitle').textContent = top.title;
  document.getElementById('hazardDesc').textContent  = top.desc;
  document.getElementById('hazardDetail').innerHTML  = hazards.map(h => `<div>• ${h.detail}</div>`).join('');
  document.getElementById('hazardPending').textContent = `${qty.toFixed(1)} ${unit} of ${chem.f} (${chem.n})`;

  modal.classList.remove('hidden');
  LabAudio.warn();
  log('🛡️ SAFETY INTERLOCK — hazard detected, engine paused.', 'warn');
  hazards.forEach(h => log(`   ${h.icons.join(' ')} ${h.title}`, 'danger'));
}

function hideHazardModal(){ document.getElementById('safetyModal').classList.add('hidden'); }

/* ══════════════════════════════════════════════════════════════════════════
   LOG & EQUATION
   ══════════════════════════════════════════════════════════════════════════ */
function log(msg, type){
  const el = document.getElementById('log');
  const colors = { info:'#7dd3fc', warn:'#fbbf24', danger:'#f87171', good:'#6ee7b7', react:'#c4b5fd' };
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="text-slate-600">[${nowStamp()}]</span> <span style="color:${colors[type]||'#94a3b8'}">${msg}</span>`;
  el.insertBefore(div, el.firstChild);
  while (el.children.length > 250) el.removeChild(el.lastChild);
  const lc = document.getElementById('logCount');
  if (lc) lc.textContent = el.children.length;
}
function clearLog(){
  document.getElementById('log').innerHTML = '';
  const lc = document.getElementById('logCount');
  if (lc) lc.textContent = '0';
}

function eqAdd(str, type){
  const key = str + '|' + (type||'');
  if (vessel.eqHistory.has(key)) return;
  vessel.eqHistory.add(key);
  const el = document.getElementById('eqList');
  if (el.querySelector('.italic')) el.innerHTML = '';

  const typeColors = {
    'NEUTRALIZATION': 'bg-emerald-700 text-emerald-100',
    'PRECIPITATION':  'bg-cyan-700 text-cyan-100',
    'REDOX':          'bg-violet-700 text-violet-100',
    'SINGLE DISPL.':  'bg-amber-700 text-amber-100',
    'DOUBLE DISPL.':  'bg-blue-700 text-blue-100',
    'DECOMPOSITION':  'bg-rose-700 text-rose-100',
    'COMBUSTION':     'bg-orange-700 text-orange-100',
    'GAS EVOLUTION':  'bg-teal-700 text-teal-100',
    'ACID-BASE':      'bg-emerald-700 text-emerald-100',
    'HYDROLYSIS':     'bg-lime-700 text-lime-100',
    'COMPLEXATION':   'bg-purple-700 text-purple-100',
  };
  const chip = type ? `<span class="eq-type ${typeColors[type]||'bg-slate-700 text-slate-200'}">${type}</span>` : '';

  const d = document.createElement('div');
  d.className = 'eq-item text-amber-200/90 fade-in';
  d.innerHTML = chip ? `<div class="mb-0.5">${chip}</div><div>${str}</div>` : `<div>${str}</div>`;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 30) el.removeChild(el.lastChild);

  /* Update the live banner equation too */
  vessel.lastEquation = str;
  vessel.lastReactionType = type || 'REACTION';
  updateBanner();
}

/* ══════════════════════════════════════════════════════════════════════════
   REAGENT MODAL
   ══════════════════════════════════════════════════════════════════════════ */
function openReagentModal(){
  document.getElementById('reagentModal').classList.remove('hidden');
  LabAudio.click();
}
function closeReagentModal(){
  document.getElementById('reagentModal').classList.add('hidden');
  LabAudio.click();
}

function buildTabs(){
  const wrap = document.getElementById('catTabs');
  wrap.innerHTML = '';
  CATS.forEach(c => {
    const b = document.createElement('div');
    b.className = 'cat-tab' + (c === ACTIVE_CAT ? ' active' : '');
    b.textContent = c;
    b.onclick = () => { ACTIVE_CAT = c; buildTabs(); buildShelf(); };
    wrap.appendChild(b);
  });
}

function buildShelf(){
  const shelf = document.getElementById('shelf');
  shelf.innerHTML = '';
  const list = CHEMS.filter(c => ACTIVE_CAT === 'All' || c.c === ACTIVE_CAT);
  document.getElementById('reagentCount').textContent = list.length + ' species';
  document.getElementById('libraryCountLbl').textContent = CHEMS.length + ' species · ' + CATS.length + ' categories';

  list.forEach(c => {
    if (QTY[c.id] === undefined) QTY[c.id] = c.def;
    const unit = c.st === 's' ? 'g' : 'mL';
    const row = document.createElement('div');
    row.className = 'reagent-row';
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="text-[11px] font-semibold text-slate-100 truncate leading-tight">${c.n}</div>
        <div class="text-[9px] text-slate-500 font-mono truncate leading-tight">${c.f}</div>
      </div>
      <input type="number" inputmode="decimal" min="0.1" max="${c.max}" step="0.1"
             value="${QTY[c.id]}" data-qty="${c.id}"
             class="w-12 shrink-0 bg-[#0a111e] border border-slate-700 rounded px-1.5 py-[2px] text-[10px] font-mono text-cyan-300 outline-none focus:border-cyan-500 text-right">
      <span class="text-[9px] text-slate-500 w-[16px] shrink-0 font-mono">${unit}</span>
      <button class="vl-add shrink-0" data-add="${c.id}">+ ADD</button>`;
    shelf.appendChild(row);
  });

  shelf.querySelectorAll('[data-qty]').forEach(inp => {
    inp.addEventListener('input', e => {
      const id = e.target.dataset.qty;
      const v = parseFloat(e.target.value);
      QTY[id] = isNaN(v) ? 0 : v;
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter'){
        const id = e.target.dataset.qty;
        const chem = CHEMS.find(x => x.id === id);
        if (QTY[id] > 0){ addChemical(chem, QTY[id]); LabAudio.click(); }
      }
    });
  });

  shelf.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.add;
      const chem = CHEMS.find(x => x.id === id);
      const q = QTY[id];
      if (!q || q <= 0){ log('Enter a valid quantity first', 'warn'); return; }
      addChemical(chem, q);
      LabAudio.click();
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   BURETTE SELECTOR
   ══════════════════════════════════════════════════════════════════════════ */
function buildBuretteSel(){
  const sel = document.getElementById('buretteSel');
  sel.innerHTML = '';
  CHEMS.filter(c => c.st === 'l' && (c.ions || c.weakAcid || c.weakBase) && c.id !== 'h2o').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = `${c.n} (${c.M ? c.M.toFixed(2) + ' M' : '—'})`;
    sel.appendChild(o);
  });
  sel.value = 'naoh';
  sel.onchange = () => {
    vessel.buretteChem = sel.value;
    vessel.buretteFrac = 1;
    log(`Burette charged with ${CHEMS.find(c => c.id === sel.value).n}`, 'info');
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   CHEMICAL INTRODUCTION
   ══════════════════════════════════════════════════════════════════════════ */
function addChemical(chem, qty, skipHazardCheck){
  if (vessel.shattered) { log('Vessel compromised — flush before adding reagents.', 'danger'); return; }
  if (qty <= 0) return;

  if (!skipHazardCheck){
    const hazards = detectHazard(chem, qty);
    if (hazards){
      pendingAddition = { chem, qty };
      vessel.paused = true;
      showHazardModal(chem, qty, hazards);
      return;
    }
  }

  const moles = computeMoles(chem, qty);

  /* Track in contents array */
  const isLiquid = chem.st === 'l';
  const phase = chem.ind ? 'indicator' : chem.fuel ? 'fuel' : isLiquid ? 'liquid' : 'solid';
  vessel.contents.push({ id: chem.id, chem, moles, phase, qty, unit: isLiquid ? 'mL' : 'g' });

  /* Indicators */
  if (chem.ind){
    vessel.indicators[chem.ind] = (vessel.indicators[chem.ind] || 0) + qty;
    vessel.waterVolume += qty; vessel.mass += qty;
    log(`Added ${qty.toFixed(2)} mL ${chem.n}`, 'info');
    updateBanner(); updateTutor();
    return;
  }

  /* Fuels */
  if (chem.fuel){
    vessel.fuels[chem.id] = (vessel.fuels[chem.id] || 0) + moles;
    vessel.otherSolventVolume += qty; vessel.mass += qty;
    log(`Added ${qty.toFixed(1)} mL ${chem.n} (${moles.toFixed(4)} mol)`, 'info');
    updateBanner(); updateTutor();
    return;
  }

  /* Distinguish solvent vs solute */
  if (chem.id === 'h2o' || chem.id === 'h2o2'){
    vessel.waterVolume += qty; vessel.mass += qty;
    log(`Added ${qty.toFixed(1)} mL ${chem.n}`, 'info');
    updateBanner(); updateTutor();
    return;
  }
  if (chem.st === 'l' && (chem.ions || chem.weakAcid || chem.weakBase)){
    /* Aqueous acid/base — counts as water solvent */
    vessel.waterVolume += qty; vessel.mass += qty;
  } else if (chem.st === 'l'){
    vessel.otherSolventVolume += qty; vessel.mass += qty;
  } else {
    vessel.mass += qty;
    vessel.waterVolume += qty * 0.35; // slight displacement if solid
  }

  /* Track metal ions for flame tests */
  if (chem.ions){
    for (const k of Object.keys(chem.ions)){
      if (/^(Na|K|Li|Ca|Sr|Ba|Cu|Rb|Cs)\d*\+$/.test(k)){
        vessel.metalPresent[k] = (vessel.metalPresent[k] || 0) + moles;
      }
    }
  }

  /* Ionic contribution */
  let reacted = false;
  if (chem.ions){
    for (const [k, v] of Object.entries(chem.ions)) addIon(k, v * moles);
    reacted = true;
  }
  if (chem.weakAcid) addIon('CH3COOH', moles);
  if (chem.weakBase) addIon('NH3', moles);

  /* Insoluble solid */
  if (chem.st === 's' && !chem.soluble){
    vessel.solids.push({ id: chem.id, chem, moles });
    reacted = true;
  }

  /* Dissolution enthalpy */
  if (chem.dhSol && reacted){
    addHeat(-chem.dhSol * moles * 1000);
    vessel.dH += chem.dhSol * moles;
  }

  const unit = isLiquid ? 'mL' : 'g';
  log(`Added ${qty.toFixed(1)} ${unit} ${chem.n} → ${moles.toFixed(4)} mol`, 'info');

  /* Alkali runaway — ONLY if liquid solvent is present */
  if (chem.alkali && hasLiquidSolvent() && moles > 0.055){
    setTimeout(() => triggerExplosion(`${chem.n} + H₂O runaway`), 220);
  }

  updateBanner(); updateTutor();
}

/* ══════════════════════════════════════════════════════════════════════════
   THERMODYNAMIC KERNEL
   ══════════════════════════════════════════════════════════════════════════ */
function updateThermo(dt){
  const s = sim, v = vessel;
  const flameTemp = (s.flame / 100) * 1500;
  const flamePower = (s.flame / 100) * 4500;

  let P = 0;
  if (s.flame > 0 && v.temperature < flameTemp){
    P += flamePower * (1 - 0.45 * (v.temperature / Math.max(1, flameTemp)));
  }
  P -= (v.temperature - 25) * 0.95;

  const C = heatCapacity();
  v.temperature += (P * dt) / C;

  /* Boiling: evaporation */
  if (v.temperature > 100 && v.waterVolume > 0.01){
    const excessJ = (v.temperature - 100) * C;
    v.temperature = 100;
    const evapG = excessJ / 700;
    const evap = Math.min(evapG, v.waterVolume);
    v.waterVolume -= evap;
    v.mass -= evap;
    s.steamRate += evap * 4;
  }

  if (v.temperature < 0) v.temperature = 0;

  if (v.temperature > 1200 && !v.shattered){
    triggerShatter('Thermal shock — borosilicate limit exceeded (T > 1200 °C)');
  }

  const boilLevel = v.temperature >= 99.5 && v.waterVolume > 0 ? clamp((v.temperature - 99) / 3, 0, 1) : 0;
  LabAudio.setBoil(boilLevel * 0.9);
  LabAudio.setHiss(s.flame / 100 * 0.55);
  LabAudio.setFizz(clamp(s.gasRate * 0.04, 0, 0.5));
}

/* ══════════════════════════════════════════════════════════════════════════
   REACTION KERNEL
   ══════════════════════════════════════════════════════════════════════════ */
function react(dt){
  const v = vessel, s = sim;
  if (v.shattered) return;
  const T = v.temperature;
  const V = Math.max(0.0005, totalLiquidVolume() / 1000);

  /* ─── 1. ACID-BASE NEUTRALIZATION ─── */
  {
    const h = getIon('H+'), oh = getIon('OH-');
    const n = Math.min(h, oh);
    if (n > 1e-12){
      const amt = n * Math.min(1, dt * 25);
      setIon('H+', h - amt);
      setIon('OH-', oh - amt);
      addHeat(57300 * amt);
      v.dH -= 57.3 * amt;
      v.lastDeltaH_kJmol = -57.3;
      eqAdd('H⁺(aq) + OH⁻(aq) → H₂O(l)      ΔH = −57.3 kJ·mol⁻¹', 'NEUTRALIZATION');
      if (!v.eqHistory.has('nlog')){ v.eqHistory.add('nlog'); log('Neutralisation: H⁺ + OH⁻ → H₂O (exothermic)', 'react'); }
    }
  }

  /* ─── 2. ALKALI METAL + WATER — DRY-GUARDED ─── */
  if (hasLiquidSolvent()){
    for (const m of ['li','na','k','rb','cs']){
      const entry = v.solids.find(x => x.id === m);
      if (!entry || entry.moles <= 1e-9) continue;
      const rate = 1.8 * kFactor(30, T) * dt;
      const amt = Math.min(entry.moles * rate, v.waterVolume / 18.0 * 0.15);
      if (amt > 1e-12){
        entry.moles -= amt;
        const ionKey = m.charAt(0).toUpperCase() + m.slice(1) + '+';
        addIon(ionKey, amt); addIon('OH-', amt);
        addHeat(184000 * amt);
        v.dH -= 184 * amt;
        v.gases['H2'] = (v.gases['H2'] || 0) + amt;
        v.lastDeltaH_kJmol = -184;
        s.gasRate += amt * 900;
        spawnBubbles(Math.min(14, amt * 900), [255,255,255]);
        if (!v.eqHistory.has('alk_' + m)){
          v.eqHistory.add('alk_' + m);
          const sym = m.charAt(0).toUpperCase() + m.slice(1);
          eqAdd(`2${sym}(s) + 2H₂O(l) → 2${sym}OH(aq) + H₂(g)↑    ΔH = −184 kJ·mol⁻¹`, 'REDOX');
          log(`${sym} + H₂O → violent reaction, H₂ evolved`, 'danger');
        }
      }
    }
  }

  /* ─── 3. ALKALINE EARTH + WATER ─── */
  if (hasLiquidSolvent()){
    for (const m of ['ca','sr','ba']){
      const entry = v.solids.find(x => x.id === m);
      if (!entry || entry.moles <= 1e-9) continue;
      const rate = 0.28 * kFactor(38, T) * dt;
      const amt = Math.min(entry.moles * rate, v.waterVolume / 36.0 * 0.2);
      if (amt > 1e-12){
        entry.moles -= amt;
        const ionKey = m.charAt(0).toUpperCase() + m.slice(1) + '2+';
        addIon(ionKey, amt); addIon('OH-', 2 * amt);
        addHeat(230000 * amt);
        v.dH -= 230 * amt;
        v.gases['H2'] = (v.gases['H2'] || 0) + amt;
        v.lastDeltaH_kJmol = -230;
        s.gasRate += amt * 500;
        spawnBubbles(Math.min(8, amt * 600), [255,255,255]);
        if (!v.eqHistory.has('earth_' + m)){
          v.eqHistory.add('earth_' + m);
          const sym = m.charAt(0).toUpperCase() + m.slice(1);
          eqAdd(`${sym}(s) + 2H₂O(l) → ${sym}(OH)₂(aq) + H₂(g)↑      ΔH = −230 kJ·mol⁻¹`, 'REDOX');
          log(`${sym} reacting with water, H₂ evolved`, 'react');
        }
      }
    }
  }

  /* ─── 4. METAL + ACID ─── */
  const hMol = getIon('H+');
  const hConc = hMol / V;
  if (hMol > 1e-9 && hasLiquidSolvent()){
    const activeMetals = ['zn','fe','mg','al','ni','co','mn','cr'];
    for (const m of activeMetals){
      const entry = v.solids.find(x => x.id === m);
      if (!entry || entry.moles <= 1e-9) continue;
      const k = 0.22 * kFactor(45, T) * clamp(hConc, 0, 2);
      const amt = Math.min(entry.moles * k * dt, hMol / 2, entry.moles);
      if (amt > 1e-12){
        entry.moles -= amt;
        let ionKey = 'Zn2+';
        if (m === 'zn') ionKey = 'Zn2+';
        else if (m === 'fe') ionKey = 'Fe2+';
        else if (m === 'mg') ionKey = 'Mg2+';
        else if (m === 'al') ionKey = 'Al3+';
        else if (m === 'ni') ionKey = 'Ni2+';
        else if (m === 'co') ionKey = 'Co2+';
        else if (m === 'mn') ionKey = 'Mn2+';
        else if (m === 'cr') ionKey = 'Cr3+';
        addIon(ionKey, amt);
        setIon('H+', hMol - 2 * amt);
        addHeat(150000 * amt);
        v.dH -= 150 * amt;
        v.gases['H2'] = (v.gases['H2'] || 0) + amt;
        v.lastDeltaH_kJmol = -150;
        s.gasRate += amt * 1200;
        spawnBubbles(Math.min(18, amt * 1400), [230,245,255]);
        if (!v.eqHistory.has('m_' + m)){
          v.eqHistory.add('m_' + m);
          const sym = m.charAt(0).toUpperCase() + m.slice(1);
          eqAdd(`${sym}(s) + 2HCl(aq) → ${sym}Cl₂(aq) + H₂(g)↑      ΔH = −150 kJ·mol⁻¹`, 'SINGLE DISPL.');
          log(`${sym} dissolving in acid — H₂ effervescence`, 'react');
        }
      }
    }
  }

  /* ─── 5. CARBONATE + ACID ─── */
  {
    const co3 = getIon('CO3^2-'), hco3 = getIon('HCO3-'), h = getIon('H+');
    if (co3 > 1e-12 && h > 1e-12){
      const amt = Math.min(co3, h / 2) * Math.min(1, dt * 6);
      setIon('CO3^2-', co3 - amt);
      setIon('H+', h - 2 * amt);
      addHeat(20000 * amt);
      v.dH -= 20 * amt;
      v.gases['CO2'] = (v.gases['CO2'] || 0) + amt;
      v.lastDeltaH_kJmol = -20;
      s.gasRate += amt * 1600;
      spawnBubbles(Math.min(22, amt * 2000), [225,240,250]);
      if (!v.eqHistory.has('carb')){
        v.eqHistory.add('carb');
        eqAdd('CO₃²⁻(aq) + 2H⁺(aq) → H₂O(l) + CO₂(g)↑      ΔH = −20 kJ·mol⁻¹', 'GAS EVOLUTION');
        log('Carbonate + acid → CO₂ effervescence', 'react');
      }
    }
    if (hco3 > 1e-12 && h > 1e-12){
      const amt = Math.min(hco3, h) * Math.min(1, dt * 6);
      setIon('HCO3-', hco3 - amt);
      setIon('H+', h - amt);
      addHeat(15000 * amt);
      v.gases['CO2'] = (v.gases['CO2'] || 0) + amt;
      s.gasRate += amt * 1600;
      spawnBubbles(Math.min(20, amt * 2000), [225,240,250]);
      if (!v.eqHistory.has('bicarb')){
        v.eqHistory.add('bicarb');
        eqAdd('HCO₃⁻(aq) + H⁺(aq) → H₂O(l) + CO₂(g)↑', 'GAS EVOLUTION');
        log('Bicarbonate + acid → CO₂ effervescence', 'react');
      }
    }
    /* Solid CaCO3 */
    const sc = v.solids.find(x => x.id === 'caco3');
    const h2 = getIon('H+');
    if (sc && sc.moles > 1e-9 && h2 > 1e-9){
      const amt = Math.min(sc.moles * 0.35 * kFactor(42, T) * dt, h2 / 2, sc.moles);
      if (amt > 1e-12){
        sc.moles -= amt;
        setIon('H+', h2 - 2 * amt);
        addIon('Ca2+', amt);
        addHeat(15000 * amt);
        v.gases['CO2'] = (v.gases['CO2'] || 0) + amt;
        v.lastDeltaH_kJmol = -15;
        s.gasRate += amt * 1600;
        spawnBubbles(Math.min(22, amt * 2200), [225,240,250]);
        if (!v.eqHistory.has('caco3')){
          v.eqHistory.add('caco3');
          eqAdd('CaCO₃(s) + 2HCl(aq) → CaCl₂(aq) + H₂O(l) + CO₂(g)↑', 'GAS EVOLUTION');
          log('Marble chips fizzing vigorously in acid', 'react');
        }
      }
    }
  }

  /* ─── 6. METAL OXIDE + ACID + BASIC OXIDE HYDROLYSIS ─── */
  {
    const cuoEntry = v.solids.find(x => x.id === 'cuo');
    const h = getIon('H+');
    if (cuoEntry && cuoEntry.moles > 1e-9 && h > 1e-9){
      const amt = Math.min(cuoEntry.moles * 0.4 * kFactor(50, T) * dt, h / 2, cuoEntry.moles);
      if (amt > 1e-12){
        cuoEntry.moles -= amt;
        setIon('H+', h - 2 * amt);
        addIon('Cu2+', amt);
        addHeat(50000 * amt);
        v.dH -= 50 * amt;
        v.lastDeltaH_kJmol = -50;
        if (!v.eqHistory.has('cuo')){
          v.eqHistory.add('cuo');
          eqAdd('CuO(s) + 2H⁺(aq) → Cu²⁺(aq) + H₂O(l)      ΔH = −50 kJ·mol⁻¹', 'ACID-BASE');
          log('Black CuO dissolving → blue Cu²⁺ solution', 'react');
        }
      }
    }
    /* CaO slaking */
    const caoEntry = v.solids.find(x => x.id === 'cao');
    if (caoEntry && caoEntry.moles > 1e-9 && hasLiquidSolvent()){
      const amt = Math.min(caoEntry.moles * 0.8 * dt, caoEntry.moles, v.waterVolume / 18.0 * 0.3);
      if (amt > 1e-12){
        caoEntry.moles -= amt;
        addIon('Ca2+', amt); addIon('OH-', 2 * amt);
        addHeat(350000 * amt);
        v.dH -= 350 * amt;
        v.lastDeltaH_kJmol = -350;
        s.steamRate += amt * 260;
        if (!v.eqHistory.has('cao')){
          v.eqHistory.add('cao');
          eqAdd('CaO(s) + H₂O(l) → Ca(OH)₂(aq)      ΔH = −350 kJ·mol⁻¹', 'HYDROLYSIS');
          log('Lime slaking — intense exotherm, steam released', 'warn');
        }
      }
    }
    /* Basic oxide hydrolyses */
    for (const ox of ['na2o','k2o','li2o','mgo','bao','sro']){
      const entry = v.solids.find(x => x.id === ox);
      if (!entry || entry.moles <= 1e-9) continue;
      if (!hasLiquidSolvent()) continue;
      const amt = Math.min(entry.moles * 0.9 * dt, entry.moles, v.waterVolume / 18.0 * 0.3);
      if (amt > 1e-12){
        entry.moles -= amt;
        const chem = CHEMS.find(c => c.id === ox);
        if (chem && chem.ions){
          for (const [k, val] of Object.entries(chem.ions)) addIon(k, val * amt);
        }
        addHeat(200000 * amt);
        v.dH -= 200 * amt;
        if (!v.eqHistory.has('ox_' + ox)){
          v.eqHistory.add('ox_' + ox);
          eqAdd(`${chem.f}(s) + H₂O(l) → 2${chem.f.charAt(0)}OH(aq)      ΔH < 0`, 'HYDROLYSIS');
          log(`${chem.n} hydrolyses — basic solution formed`, 'react');
        }
      }
    }
  }

  /* ─── 7. PRECIPITATION ─── */
  for (const r of PRECIP_RULES){
    const a = getIon(r.a), b = getIon(r.b);
    if (a > 1e-12 && b > 1e-12){
      const amt = Math.min(a / r.ra, b / r.rb);
      const consumed = amt * Math.min(1, dt * 14);
      if (consumed > 1e-13){
        setIon(r.a, a - consumed * r.ra);
        setIon(r.b, b - consumed * r.rb);
        vessel.precipitates[r.prod] = (vessel.precipitates[r.prod] || 0) + consumed;
        addHeat(-30000 * consumed);
        v.dH += 30 * consumed;
        v.lastDeltaH_kJmol = +30;
        spawnPrecip(Math.min(24, consumed * 4000), r.col);
        if (!v.eqHistory.has('p_' + r.prod)){
          v.eqHistory.add('p_' + r.prod);
          eqAdd(`${r.a.replace('^','')} + ${r.b.replace('^','')} → ${r.prod}↓      ΔH = +30 kJ·mol⁻¹  (${r.name})`, 'PRECIPITATION');
          log(`Precipitate formed: ${r.name} (${r.prod})`, 'good');
        }
      }
    }
  }

  /* ─── 8. COMBUSTION ─── */
  for (const [id, mol] of Object.entries(v.fuels)){
    if (mol <= 1e-9) continue;
    const fuel = CHEMS.find(c => c.id === id);
    if (!fuel || !fuel.fuel) continue;
    if (T > fuel.ign && s.flame > 0){
      const amt = Math.min(mol, mol * 0.10 * kFactor(60, T) * dt);
      if (amt > 1e-12){
        v.fuels[id] = mol - amt;
        addHeat(fuel.dhComb * 1000 * amt);
        v.dH += fuel.dhComb * amt;
        v.gases['CO2'] = (v.gases['CO2'] || 0) + amt * (fuel.co2 || 1);
        v.lastDeltaH_kJmol = -fuel.dhComb;
        v.waterVolume = Math.max(0, v.waterVolume - amt * 0.5);
        spawnSmoke(Math.min(10, amt * 5000));
        if (!v.eqHistory.has('comb_' + id)){
          v.eqHistory.add('comb_' + id);
          const eqn = id === 'ch4'  ? 'CH₄ + 2O₂ → CO₂ + 2H₂O'
                    : id === 'c2h6' ? '2C₂H₆ + 7O₂ → 4CO₂ + 6H₂O'
                    : id === 'c3h8' ? 'C₃H₈ + 5O₂ → 3CO₂ + 4H₂O'
                    : id === 'c4h10'? '2C₄H₁₀ + 13O₂ → 8CO₂ + 10H₂O'
                    : id === 'c8h18'? '2C₈H₁₈ + 25O₂ → 16CO₂ + 18H₂O'
                    : id === 'c2h4' ? 'C₂H₄ + 3O₂ → 2CO₂ + 2H₂O'
                    : id === 'c2h2' ? '2C₂H₂ + 5O₂ → 4CO₂ + 2H₂O'
                    : id === 'etoh' ? 'C₂H₅OH + 3O₂ → 2CO₂ + 3H₂O'
                    : id === 'meoh' ? '2CH₃OH + 3O₂ → 2CO₂ + 4H₂O'
                    : id === 'acetone' ? 'C₃H₆O + 4O₂ → 3CO₂ + 3H₂O'
                    : id === 'benzene' ? '2C₆H₆ + 15O₂ → 12CO₂ + 6H₂O'
                    : id === 'toluene' ? 'C₇H₈ + 9O₂ → 7CO₂ + 4H₂O'
                    : '2C₆H₁₄ + 19O₂ → 12CO₂ + 14H₂O';
          eqAdd(eqn + `      ΔH = −${fuel.dhComb} kJ·mol⁻¹`, 'COMBUSTION');
          log(`🔥 ${fuel.n} ignited — combustion underway`, 'danger');
        }
      }
    }
  }

  /* ─── 9. H₂O₂ decomposition ─── */
  {
    const h2o2 = v.contents.find(c => c.id === 'h2o2');
    if (h2o2 && h2o2.moles > 1e-9 && v.temperature > 40){
      const amt = Math.min(h2o2.moles * 0.05 * dt, h2o2.moles);
      if (amt > 1e-12){
        h2o2.moles -= amt;
        v.gases['O2'] = (v.gases['O2'] || 0) + amt * 0.5;
        s.gasRate += amt * 800;
        addHeat(98000 * amt);
        spawnBubbles(Math.min(20, amt * 2000), [220,240,255]);
        if (!v.eqHistory.has('h2o2')){
          v.eqHistory.add('h2o2');
          eqAdd('2H₂O₂(aq) → 2H₂O(l) + O₂(g)↑      ΔH = −98 kJ·mol⁻¹', 'DECOMPOSITION');
          log('Hydrogen peroxide decomposing — O₂ evolved', 'react');
        }
      }
    }
  }

  /* Decay rates */
  s.gasRate *= Math.pow(0.35, dt);
  s.steamRate *= Math.pow(0.5, dt);

  /* Boiling bubbles */
  if (v.temperature >= 99.5 && v.waterVolume > 1){
    const n = clamp((v.temperature - 99) * 3, 0, 8) * dt * 60;
    spawnBubbles(n * 0.35, [255, 255, 255]);
    if (Math.random() < 0.14) LabAudio.pop();
  }

  if (s.gasRate > 5 && Math.random() < 0.5) LabAudio.pop();
}

/* ══════════════════════════════════════════════════════════════════════════
   pH COMPUTATION
   ══════════════════════════════════════════════════════════════════════════ */
function computePH(){
  const v = vessel;
  const V = Math.max(0.0005, totalLiquidVolume() / 1000);

  /* Dry vessel */
  if (!hasLiquidSolvent()){
    v.pH = 7.0;
    return;
  }

  const hM = getIon('H+'), ohM = getIon('OH-');
  const net = hM - ohM;
  let hConc;

  const cw = getIon('CH3COOH') / V;
  const cb = getIon('NH3') / V;
  const Ka = 1.8e-5, Kb = 1.8e-5;

  if (net > 1e-13){
    hConc = net / V;
    if (cw > 0){
      const x = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * (cw + hConc))) / 2;
      hConc += x;
    }
  } else if (net < -1e-13){
    let ohConc = -net / V;
    if (cb > 0){
      const x = (-Kb + Math.sqrt(Kb * Kb + 4 * Kb * (cb + ohConc))) / 2;
      ohConc += x;
    }
    hConc = 1e-14 / ohConc;
  } else {
    hConc = 1e-7;
    if (cw > 0){
      const x = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * cw)) / 2;
      hConc = Math.max(hConc, x);
    }
    if (cb > 0){
      const x = (-Kb + Math.sqrt(Kb * Kb + 4 * Kb * cb)) / 2;
      hConc = Math.max(hConc, 1e-14 / x);
    }
  }
  v.pH = clamp(-Math.log10(Math.max(hConc, 1e-14)), 0, 14);
}

/* ══════════════════════════════════════════════════════════════════════════
   FLUID COLOUR SYNTHESIS
   ══════════════════════════════════════════════════════════════════════════ */
function mix(a, b, t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

function uiColor(pH){
  const stops = [
    [0, [215,30,40]], [2, [230,90,30]], [4, [240,200,40]],
    [6, [200,220,60]], [7, [60,190,90]], [8, [40,190,170]],
    [10, [50,110,220]], [12, [90,60,200]], [14, [130,30,160]],
  ];
  for (let i = 0; i < stops.length - 1; i++){
    const [p0, c0] = stops[i], [p1, c1] = stops[i+1];
    if (pH >= p0 && pH <= p1) return mix(c0, c1, (pH - p0) / (p1 - p0));
  }
  return stops[stops.length-1][1];
}

function computeFluidColor(){
  const v = vessel;
  const V = Math.max(0.0005, totalLiquidVolume() / 1000);
  let col = [198, 224, 240];

  for (const [ion, rgb] of Object.entries(ION_COLORS)){
    const c = getIon(ion) / V;
    if (c > 1e-6){
      const alpha = 1 - Math.exp(-c * 9);
      col = mix(col, rgb, clamp(alpha, 0, 0.95));
    }
  }

  const totalPrecip = Object.values(v.precipitates).reduce((a,b)=>a+b, 0);
  if (totalPrecip > 1e-6){
    const turb = clamp(totalPrecip / V * 0.06, 0, 0.55);
    col = mix(col, [235, 235, 232], turb);
  }

  const indStrength = k => clamp((v.indicators[k] || 0) / 2.0, 0, 1);
  const uiA = indStrength('ui');
  if (uiA > 0.01) col = mix(col, uiColor(v.pH), clamp(uiA * 0.92, 0, 0.92));
  const phA = indStrength('phph');
  if (phA > 0.01){
    let t = 0;
    if (v.pH >= 8.2 && v.pH <= 10) t = (v.pH - 8.2) / 1.8;
    else if (v.pH > 10) t = 1;
    if (t > 0) col = mix(col, [230, 20, 130], clamp(t * phA * 0.95, 0, 0.95));
  }
  const btbA = indStrength('btb');
  if (btbA > 0.01){
    let c;
    if (v.pH < 6) c = [230, 215, 45];
    else if (v.pH > 7.6) c = [30, 90, 215];
    else c = mix([230,215,45],[30,90,215], (v.pH - 6) / 1.6);
    col = mix(col, c, clamp(btbA * 0.9, 0, 0.9));
  }
  const moA = indStrength('mor');
  if (moA > 0.01){
    let c;
    if (v.pH < 3.1) c = [225, 55, 40];
    else if (v.pH > 4.4) c = [240, 195, 60];
    else c = mix([225,55,40],[240,195,60], (v.pH - 3.1) / 1.3);
    col = mix(col, c, clamp(moA * 0.9, 0, 0.9));
  }
  const litA = indStrength('lit');
  if (litA > 0.01){
    const c = v.pH < 7 ? [210, 60, 70] : [60, 100, 210];
    col = mix(col, c, clamp(litA * 0.75, 0, 0.75));
  }
  const bcgA = indStrength('bcg');
  if (bcgA > 0.01){
    let c;
    if (v.pH < 3.8) c = [230, 200, 50];
    else if (v.pH > 5.4) c = [ 60,130,210];
    else c = mix([230,200,50],[60,130,210], (v.pH - 3.8) / 1.6);
    col = mix(col, c, clamp(bcgA * 0.9, 0, 0.9));
  }
  sim.fluidColor = col;
}

/* ══════════════════════════════════════════════════════════════════════════
   PARTICLE SYSTEMS
   ══════════════════════════════════════════════════════════════════════════ */
function liquidTop(){
  const lh = Math.min(MAXLH, (vessel.waterVolume / MAXVOL) * MAXLH);
  return BOT - lh;
}

function spawnBubbles(n, col){
  const top = liquidTop();
  const count = Math.min(4, Math.floor(n));
  for (let i = 0; i < count; i++){
    if (sim.bubbles.length > 260) break;
    sim.bubbles.push({
      x: INX + 8 + Math.random() * (INW - 16),
      y: BOT - 6 - Math.random() * 18,
      r: 1.4 + Math.random() * 3.6,
      vy: 0.5 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.5,
      wob: Math.random() * Math.PI * 2,
      col: col || [255,255,255], top
    });
  }
}

function spawnPrecip(n, col){
  const count = Math.min(10, Math.floor(n));
  for (let i = 0; i < count; i++){
    if (sim.precipParticles.length > 700) break;
    sim.precipParticles.push({
      x: INX + 10 + Math.random() * (INW - 20),
      y: liquidTop() + 12 + Math.random() * Math.max(10, (BOT - liquidTop() - 20)),
      r: 0.9 + Math.random() * 2.1,
      vy: 0.15 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      col: col || [240,240,240],
      floor: BOT - 3 - Math.random() * 22
    });
  }
}

function spawnSteam(n){
  for (let i = 0; i < Math.min(3, n); i++){
    if (sim.steam.length > 160) break;
    sim.steam.push({
      x: INX + 16 + Math.random() * (INW - 32),
      y: liquidTop() - 4,
      r: 5 + Math.random() * 9,
      vy: -(18 + Math.random() * 30) / 60,
      vx: (Math.random() - 0.5) * 0.35,
      life: 1
    });
  }
}

function spawnSmoke(n, tint){
  tint = tint || [45,45,50];
  for (let i = 0; i < Math.min(3, n); i++){
    if (sim.smoke.length > 150) break;
    sim.smoke.push({
      x: INX + 20 + Math.random() * (INW - 40),
      y: liquidTop() - 8,
      r: 6 + Math.random() * 12,
      vy: -(22 + Math.random() * 34) / 60,
      vx: (Math.random() - 0.5) * 0.6,
      life: 1,
      tint
    });
  }
}

function updateParticles(dt){
  const s = sim;
  const top = liquidTop();

  for (let i = s.bubbles.length - 1; i >= 0; i--){
    const b = s.bubbles[i];
    b.wob += dt * 7;
    b.vy += 0.06; b.vy *= 0.97;
    b.y -= b.vy * dt * 60;
    b.x += Math.sin(b.wob) * 0.5 + b.vx;
    b.vx *= 0.98;
    if (b.y - b.r < top + 4){
      s.bubbles.splice(i, 1);
      if (Math.random() < 0.28) LabAudio.pop();
      continue;
    }
    if (b.x < INX + 4) b.x = INX + 4;
    if (b.x > INX + INW - 4) b.x = INX + INW - 4;
  }

  if (s.steamRate > 0.4) spawnSteam(s.steamRate * 0.35);
  for (let i = s.steam.length - 1; i >= 0; i--){
    const p = s.steam[i];
    p.y += p.vy * dt * 60;
    p.x += p.vx;
    p.r += dt * 8;
    p.life -= dt * 0.55;
    if (p.life <= 0 || p.y < -30) s.steam.splice(i, 1);
  }

  for (let i = s.smoke.length - 1; i >= 0; i--){
    const p = s.smoke[i];
    p.y += p.vy * dt * 60;
    p.x += p.vx;
    p.r += dt * 11;
    p.life -= dt * 0.36;
    if (p.life <= 0 || p.y < -40) s.smoke.splice(i, 1);
  }

  const stirring = s.stir > 12;
  for (const p of s.precipParticles){
    if (stirring){
      p.vx += (Math.random() - 0.5) * 0.55;
      p.vy -= Math.random() * 0.5;
      p.vx = clamp(p.vx, -2.4, 2.4);
      p.vy = clamp(p.vy, -2.4, 2.0);
    }
    p.vy += 0.035; p.vy *= 0.94; p.vx *= 0.95;
    p.y += p.vy; p.x += p.vx;
    if (p.x < INX + 4) { p.x = INX + 4; p.vx *= -0.4; }
    if (p.x > INX + INW - 4) { p.x = INX + INW - 4; p.vx *= -0.4; }
    const lim = stirring ? BOT - 4 : p.floor;
    if (p.y > lim){ p.y = lim; p.vy = 0; p.vx *= 0.85; }
    if (p.y < top + 6) { p.y = top + 6; p.vy = Math.abs(p.vy) * 0.4; }
  }

  for (let i = s.drops.length - 1; i >= 0; i--){
    const d = s.drops[i];
    d.vy += 0.55;
    d.y += d.vy;
    if (d.y > top + 6){ s.drops.splice(i, 1); spawnRipple(d.x); }
  }

  for (let i = s.ripples.length - 1; i >= 0; i--){
    const r = s.ripples[i];
    r.r += dt * 42;
    r.a -= dt * 1.8;
    if (r.a <= 0) s.ripples.splice(i, 1);
  }

  s.flash = Math.max(0, s.flash - dt * 2.2);
  s.shake = Math.max(0, s.shake - dt * 3.5);
}

function spawnRipple(x){
  sim.ripples.push({ x, r: 2, a: 0.7, y: liquidTop() + 4 });
}

/* ══════════════════════════════════════════════════════════════════════════
   TITRATION BURETTE
   ══════════════════════════════════════════════════════════════════════════ */
let dropAccumulator = 0;
function updateBurette(dt){
  const v = vessel, s = sim;
  if (v.shattered || s.drip <= 0) return;
  if (v.buretteFrac <= 0){
    if (Math.random() < 0.01) log('Burette empty — refill required.', 'warn');
    return;
  }

  dropAccumulator += s.drip * dt;
  while (dropAccumulator >= 1){
    dropAccumulator -= 1;
    if (v.buretteFrac <= 0) break;

    const dropVol = 0.10;
    const chem = CHEMS.find(c => c.id === v.buretteChem);
    if (!chem) break;

    v.buretteFrac = Math.max(0, v.buretteFrac - dropVol / 50);
    s.drops.push({ x: CX + (Math.random() - 0.5) * 2, y: BURETTE_TIP_Y, vy: 0.6 });

    const moles = (dropVol / 1000) * (chem.M || 1);
    v.waterVolume += dropVol;
    v.mass += dropVol;
    if (chem.ions) for (const [k, val] of Object.entries(chem.ions)) addIon(k, val * moles);
    if (chem.weakAcid) addIon('CH3COOH', moles);
    if (chem.weakBase) addIon('NH3', moles);

    if (Math.random() < 0.08) LabAudio.click();
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   HAZARD EVENTS
   ══════════════════════════════════════════════════════════════════════════ */
function triggerShatter(reason){
  if (vessel.shattered) return;
  vessel.shattered = true;
  sim.flame = 0; sim.stir = 0; sim.drip = 0;
  document.getElementById('flameSlider').value = 0;
  document.getElementById('stirSlider').value = 0;
  document.getElementById('dripSlider').value = 0;
  LabAudio.shatter();
  LabAudio.setBoil(0); LabAudio.setFizz(0); LabAudio.setHiss(0);
  sim.flash = 1;
  sim.shake = 1;
  log('⚠️ GLASS SHATTER — ' + reason, 'danger');
  document.getElementById('hazardMsg').textContent = reason;
  document.getElementById('hazard').classList.remove('hidden');
}

function triggerExplosion(reason){
  if (vessel.shattered) return;
  LabAudio.explode();
  sim.flash = 1;
  sim.shake = 1.4;
  vessel.temperature += 420;
  sim.steamRate += 60;
  spawnSmoke(10);
  spawnSteam(14);
  log('💥 EXPLOSIVE REACTION — ' + reason, 'danger');
  triggerShatter(reason);
}

function emergencyFlush(){
  flushVessel();
  document.getElementById('hazard').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════
   VESSEL PURGE — FIXES THE FALSE WATER PRESENCE BUG
   ══════════════════════════════════════════════════════════════════════════ */
function purgeVesselState(){
  /* Composition — completely wiped */
  vessel.contents = [];
  vessel.waterVolume = 0;
  vessel.otherSolventVolume = 0;
  vessel.solids = [];
  vessel.gases = {};
  vessel.ions = {};
  vessel.precipitates = {};
  vessel.fuels = {};
  vessel.indicators = {};

  /* Physical state reset */
  vessel.temperature = 25.0;
  vessel.mass = 0;
  vessel.pH = 7.0;
  vessel.dH = 0;

  /* Reaction bookkeeping */
  vessel.lastEquation = '';
  vessel.lastReactionType = 'READY';
  vessel.lastDeltaH_kJmol = 0;
  vessel.eqHistory.clear();
  vessel.metalPresent = {};

  /* Engine flags */
  vessel.shattered = false;
  vessel.paused = false;
  sim.bubbles = []; sim.steam = []; sim.smoke = [];
  sim.precipParticles = []; sim.drops = []; sim.ripples = [];
  sim.gasRate = 0; sim.steamRate = 0;
  sim.flame = 0; sim.stir = 0; sim.drip = 0;
  sim.fluidColor = [220, 232, 245];

  /* UI sync */
  const flameSlider = document.getElementById('flameSlider');
  const stirSlider = document.getElementById('stirSlider');
  const dripSlider = document.getElementById('dripSlider');
  if (flameSlider){ flameSlider.value = 0; document.getElementById('flameLbl').textContent = '0 °C'; }
  if (stirSlider){ stirSlider.value = 0; document.getElementById('stirLbl').textContent = '0 rpm'; }
  if (dripSlider){ dripSlider.value = 0; document.getElementById('dripLbl').textContent = '0.0 d/s'; }

  document.getElementById('eqList').innerHTML = '<div class="text-[8.5px] text-slate-600 font-mono italic">awaiting reaction…</div>';
  LabAudio.setBoil(0); LabAudio.setFizz(0); LabAudio.setHiss(0);
}

function clearVessel(){
  purgeVesselState();
  vessel.buretteFrac = 1;
  log('🗑️ VESSEL CLEARED — 0 mL liquid, no ions, no solids, pH reset to 7.00, T reset to 25 °C.', 'good');
  LabAudio.click();
  updateBanner();
  updateTutor();
}

function flushVessel(){
  purgeVesselState();
  /* Flush adds fresh distilled water back */
  vessel.waterVolume = 250;
  vessel.mass = 250;
  vessel.buretteFrac = 1;
  log('⚗️ System purged. Fresh 250 mL distilled H₂O charged, 25 °C.', 'good');
  updateBanner();
  updateTutor();
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDERING
   ══════════════════════════════════════════════════════════════════════════ */
function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);

  const VX0 = 120, VY0 = 0, VX1 = 640, VY1 = 450;
  const VW = VX1 - VX0, VH = VY1 - VY0;

  const s = Math.min(rect.width / VW, rect.height / VH);
  const ox = ((rect.width - VW * s) / 2 - VX0 * s) * dpr;
  const oy = ((rect.height - VH * s) / 2 - VY0 * s) * dpr;

  ctx.setTransform(dpr * s, 0, 0, dpr * s, ox, oy);
}

function beakerInnerPath(){
  const x = INX, y = INY, w = INW, h = INH, r = 14;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h - r);
  ctx.quadraticCurveTo(x, y + h, x + r, y + h);
  ctx.lineTo(x + w - r, y + h);
  ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  ctx.lineTo(x + w, y);
  ctx.closePath();
}

function roundRect(x, y, w, h, r){
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

function drawBackdrop(){
  const g = ctx.createRadialGradient(CX, 250, 30, CX, 250, 400);
  g.addColorStop(0, '#0d1727');
  g.addColorStop(1, '#050a14');
  ctx.fillStyle = g;
  ctx.fillRect(-1400, -1400, W + 2800, H + 2800);

  const bg = ctx.createLinearGradient(0, 430, 0, 500);
  bg.addColorStop(0, '#101a28');
  bg.addColorStop(1, '#050a14');
  ctx.fillStyle = bg;
  ctx.fillRect(-1400, 430, W + 2800, 200);

  ctx.strokeStyle = 'rgba(56,189,248,0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-1400, 430.5); ctx.lineTo(W + 1400, 430.5); ctx.stroke();

  ctx.strokeStyle = 'rgba(56,189,248,0.03)';
  for (let x = -1400; x < W + 1400; x += 34){
    ctx.beginPath(); ctx.moveTo(x, -400); ctx.lineTo(x, 430); ctx.stroke();
  }
  for (let y = -400; y < 430; y += 34){
    ctx.beginPath(); ctx.moveTo(-1400, y); ctx.lineTo(W + 1400, y); ctx.stroke();
  }
}

function flameTint(){
  if (vessel.temperature < 250) return null;
  const mp = vessel.metalPresent;
  if (getIon('Na+') > 1e-6 || mp['Na+'] > 0) return [255, 190, 40];
  if (getIon('K+')  > 1e-6 || mp['K+']  > 0) return [190, 130, 255];
  if (getIon('Li+') > 1e-6 || mp['Li+'] > 0) return [255, 70, 100];
  if (getIon('Cu2+') > 1e-6 || mp['Cu2+'] > 0) return [70, 235, 160];
  if (getIon('Ca2+') > 1e-6 || mp['Ca2+'] > 0) return [255, 110, 70];
  if (getIon('Sr2+') > 1e-6 || mp['Sr2+'] > 0) return [255, 40, 60];
  if (getIon('Ba2+') > 1e-6 || mp['Ba2+'] > 0) return [180, 255, 150];
  if (getIon('Rb+')  > 1e-6) return [255, 60, 60];
  if (getIon('Cs+')  > 1e-6) return [100, 140, 255];
  return null;
}

function drawBurner(){
  ctx.fillStyle = '#1b2534';
  roundRect(CX - 18, 372, 36, 46, 5); ctx.fill();
  ctx.fillStyle = '#243044';
  roundRect(CX - 18, 372, 36, 7, 3); ctx.fill();
  ctx.fillStyle = '#334155';
  roundRect(CX - 22, 364, 44, 12, 4); ctx.fill();
  ctx.fillStyle = '#151e2b';
  roundRect(CX - 48, 414, 96, 12, 5); ctx.fill();

  if (sim.flame <= 0 || vessel.shattered) return;

  const inten = sim.flame / 100;
  const fh = 30 + inten * 80;
  const fw = 11 + inten * 12;
  const baseY = BURNER_BASE_Y;
  const tipY = baseY - fh;
  const tint = flameTint();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const og = ctx.createRadialGradient(CX, baseY - fh * 0.35, 4, CX, baseY - fh * 0.35, fw * 4 + 16);
  og.addColorStop(0, 'rgba(255,150,40,0.35)');
  og.addColorStop(0.5, 'rgba(255,110,20,0.12)');
  og.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = og;
  ctx.beginPath();
  ctx.ellipse(CX, baseY - fh * 0.35, fw * 4 + 16, fh * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  const og2 = ctx.createLinearGradient(0, baseY, 0, tipY);
  if (tint){
    og2.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.9)`);
    og2.addColorStop(0.55, `rgba(${tint[0]*0.85|0},${tint[1]*0.55|0},${tint[2]*0.4|0},0.65)`);
    og2.addColorStop(1, 'rgba(255,80,20,0.02)');
  } else {
    og2.addColorStop(0, 'rgba(255,170,60,0.9)');
    og2.addColorStop(0.5, 'rgba(255,120,30,0.55)');
    og2.addColorStop(1, 'rgba(255,60,10,0.02)');
  }
  ctx.fillStyle = og2;
  ctx.beginPath();
  ctx.moveTo(CX - fw, baseY);
  ctx.quadraticCurveTo(CX - fw * 1.25, baseY - fh * 0.5, CX, tipY);
  ctx.quadraticCurveTo(CX + fw * 1.25, baseY - fh * 0.5, CX + fw, baseY);
  ctx.closePath();
  ctx.fill();

  const ig = ctx.createLinearGradient(0, baseY, 0, baseY - fh * 0.55);
  ig.addColorStop(0, 'rgba(120,200,255,0.75)');
  ig.addColorStop(0.6, 'rgba(90,160,255,0.32)');
  ig.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.moveTo(CX - fw * 0.45, baseY);
  ctx.quadraticCurveTo(CX - fw * 0.5, baseY - fh * 0.35, CX, baseY - fh * 0.58);
  ctx.quadraticCurveTo(CX + fw * 0.5, baseY - fh * 0.35, CX + fw * 0.45, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBeakerBack(){
  ctx.save();
  const g = ctx.createLinearGradient(BX, 0, BX + BW, 0);
  g.addColorStop(0, 'rgba(160,220,245,0.12)');
  g.addColorStop(0.22, 'rgba(200,240,255,0.05)');
  g.addColorStop(0.75, 'rgba(140,200,230,0.04)');
  g.addColorStop(1, 'rgba(160,220,245,0.13)');
  ctx.fillStyle = g;
  beakerInnerPath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(180,225,245,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++){
    const y = BOT - (i / 5) * MAXLH;
    const len = i % 5 === 0 ? 24 : 14;
    ctx.beginPath();
    ctx.moveTo(INX + INW - len, y);
    ctx.lineTo(INX + INW - 3, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,230,250,0.55)';
    ctx.font = 'bold 7px ui-monospace, monospace';
    ctx.fillText(`${i * 100}`, INX + INW - len - 22, y + 2.5);
  }
  ctx.fillStyle = 'rgba(190,230,250,0.55)';
  ctx.font = 'bold 7px ui-monospace, monospace';
  ctx.fillText('mL', INX + INW - 30, BY + 14);
  ctx.restore();
}

function drawLiquid(){
  const v = vessel, s = sim;
  if (v.waterVolume <= 0.2 && v.otherSolventVolume <= 0.2) return;

  const col = s.fluidColor.map(v => clamp(Math.round(v), 0, 255));
  const base  = `rgb(${col[0]},${col[1]},${col[2]})`;
  const light = `rgb(${clamp(col[0]+38,0,255)},${clamp(col[1]+34,0,255)},${clamp(col[2]+28,0,255)})`;
  const dark  = `rgb(${(col[0]*0.42)|0},${(col[1]*0.44)|0},${(col[2]*0.5)|0})`;

  const top = liquidTop();
  const meniscusDepth = 6;

  ctx.save();
  beakerInnerPath();
  ctx.clip();

  const g = ctx.createLinearGradient(0, top, 0, BOT);
  g.addColorStop(0, light);
  g.addColorStop(0.10, base);
  g.addColorStop(0.72, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(INX - 4, top);
  ctx.quadraticCurveTo(CX, top + meniscusDepth, INX + INW + 4, top);
  ctx.lineTo(INX + INW + 4, BOT + 30);
  ctx.lineTo(INX - 4, BOT + 30);
  ctx.closePath();
  ctx.fill();

  const rf = ctx.createLinearGradient(INX, 0, INX + INW, 0);
  rf.addColorStop(0, 'rgba(255,255,255,0.10)');
  rf.addColorStop(0.12, 'rgba(255,255,255,0.02)');
  rf.addColorStop(0.85, 'rgba(255,255,255,0.0)');
  rf.addColorStop(1, 'rgba(255,255,255,0.09)');
  ctx.fillStyle = rf;
  ctx.fillRect(INX - 4, top, INW + 8, BOT - top + 20);

  const shaft = ctx.createLinearGradient(INX + 18, 0, INX + 46, 0);
  shaft.addColorStop(0, 'rgba(255,255,255,0)');
  shaft.addColorStop(0.5, 'rgba(255,255,255,0.11)');
  shaft.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shaft;
  ctx.fillRect(INX + 18, top, 30, BOT - top);

  for (const r of s.ripples){
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r, r.r * 0.22, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${r.a * 0.45})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  for (const p of s.precipParticles){
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.85)`;
    ctx.fill();
  }

  for (const b of s.bubbles){
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.32, b.r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(INX - 4, top);
  ctx.quadraticCurveTo(CX, top + meniscusDepth, INX + INW + 4, top);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(INX - 4, top + 2.4);
  ctx.quadraticCurveTo(CX, top + meniscusDepth + 2.4, INX + INW + 4, top + 2.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  if (s.stir > 8){
    const amp = (s.stir / 100) * 6;
    ctx.beginPath();
    ctx.moveTo(INX + 6, top + 1);
    for (let x = INX + 6; x <= INX + INW - 6; x += 5){
      const y = top + 1 + Math.sin((x * 0.06) + s.stirPhase * 0.12) * amp;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  ctx.restore();

  if (s.stir > 2){
    const spin = s.stirPhase * 0.16 * (s.stir / 100);
    const barW = 52, barH = 7;
    const squash = Math.abs(Math.cos(spin));
    ctx.save();
    ctx.translate(CX, BOT - 8);
    ctx.beginPath();
    ctx.ellipse(0, 0, (barW / 2) * (0.35 + 0.65 * squash), barH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,41,59,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSolidResidue(){
  /* Draw solid undissolved material at the bottom of the beaker */
  const solidsInVessel = vessel.solids.filter(s => s.moles > 1e-9);
  if (solidsInVessel.length === 0) return;

  const totalMoles = solidsInVessel.reduce((a,b)=>a+b.moles, 0);
  const height = Math.min(30, totalMoles * 400);

  ctx.save();
  beakerInnerPath();
  ctx.clip();

  ctx.fillStyle = 'rgba(120,110,100,0.75)';
  ctx.beginPath();
  ctx.moveTo(INX, BOT);
  ctx.lineTo(INX + INW, BOT);
  ctx.lineTo(INX + INW, BOT - height);
  ctx.quadraticCurveTo(CX, BOT - height - 3, INX, BOT - height);
  ctx.closePath();
  ctx.fill();

  /* Speckles */
  for (let i = 0; i < Math.min(40, solidsInVessel.length * 8); i++){
    const x = INX + Math.random() * INW;
    const y = BOT - Math.random() * height;
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + Math.random() * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60,55,50,0.7)';
    ctx.fill();
  }

  ctx.restore();
}

function drawBeakerFront(){
  ctx.save();
  const x = BX, y = BY, w = BW, h = BH, r = 20;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h - r);
  ctx.quadraticCurveTo(x, y + h, x + r, y + h);
  ctx.lineTo(x + w - r, y + h);
  ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  ctx.lineTo(x + w, y);
  ctx.strokeStyle = 'rgba(170,220,245,0.7)';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  beakerInnerPath();
  ctx.strokeStyle = 'rgba(190,235,255,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x + w + 8, y);
  ctx.strokeStyle = 'rgba(200,240,255,0.85)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w + 3, y - 2.5);
  ctx.quadraticCurveTo(x + w + 13, y - 1.5, x + w + 15, y + 7);
  ctx.strokeStyle = 'rgba(200,240,255,0.7)';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  const hl = ctx.createLinearGradient(x + 12, 0, x + 30, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x + 12, y + 18, 18, h - 55);

  const hl2 = ctx.createLinearGradient(x + 26, 0, x + 36, 0);
  hl2.addColorStop(0, 'rgba(255,255,255,0)');
  hl2.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  hl2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl2;
  ctx.fillRect(x + 26, y + 34, 10, h - 100);

  if (vessel.shattered){
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.3;
    const cracks = [
      [[CX, BOT-15],[CX-55, 260],[CX-25, 210]],
      [[CX, BOT-15],[CX+60, 280],[CX+35, 220]],
      [[CX-25, 210],[CX-80, 220]],
      [[CX+35, 220],[CX+88, 250]],
      [[CX-55, 260],[CX-95, 320]],
      [[CX+60, 280],[CX+98, 330]],
      [[CX-25,210],[CX+8,255],[CX+35,220]],
    ];
    cracks.forEach(path => {
      ctx.beginPath();
      path.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawVapours(){
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const p of sim.steam){
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(220,240,255,${0.24 * p.life})`);
    g.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  for (const p of sim.smoke){
    const tint = p.tint || [45,45,50];
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.55 * p.life})`);
    g.addColorStop(1, `rgba(${tint[0]*0.6|0},${tint[1]*0.6|0},${tint[2]*0.6|0},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBurette(){
  const v = vessel, s = sim;
  const x = CX - 12, w = 24, top = BURETTE_TOP, bot = BURETTE_BOT;

  ctx.save();
  roundRect(x, top, w, bot - top, 6);
  ctx.fillStyle = 'rgba(170,215,240,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,225,250,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const chem = CHEMS.find(c => c.id === v.buretteChem);
  const lvl = v.buretteFrac;
  const ly = top + (1 - lvl) * (bot - top - 7);
  if (lvl > 0.01){
    let lc = [190, 235, 255];
    if (chem && chem.rgb) lc = chem.rgb;
    ctx.save();
    roundRect(x + 2.5, ly, w - 5, bot - ly - 3, 4);
    ctx.fillStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},0.55)`;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(x + 2.5, ly + 2.5);
    ctx.quadraticCurveTo(CX, ly + 7.5, x + w - 2.5, ly + 2.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(190,230,250,0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++){
    const gy = top + 6 + (i / 8) * (bot - top - 12);
    const len = i % 4 === 0 ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(x + w - 2.5, gy);
    ctx.lineTo(x + w - 2.5 - len, gy);
    ctx.stroke();
  }

  ctx.fillStyle = '#334155';
  roundRect(CX - 8, bot, 16, 10, 3); ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.beginPath(); ctx.arc(CX, bot + 5, 6, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(CX - 4, bot + 10);
  ctx.lineTo(CX + 4, bot + 10);
  ctx.lineTo(CX + 1.4, bot + 22);
  ctx.lineTo(CX - 1.4, bot + 22);
  ctx.closePath();
  ctx.fillStyle = 'rgba(170,215,240,0.30)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,225,250,0.65)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  for (const d of s.drops){
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, 2.2, 3.2, 0, 0, Math.PI * 2);
    const lc = chem && chem.rgb ? chem.rgb : [190,235,255];
    ctx.fillStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},0.9)`;
    ctx.fill();
  }

  ctx.font = 'bold 8px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.textAlign = 'center';
  ctx.fillText(chem ? chem.f : '—', CX, top - 6);
  ctx.textAlign = 'left';
}

function drawOverlays(){
  if (sim.flash > 0){
    ctx.fillStyle = `rgba(255,220,180,${sim.flash * 0.45})`;
    ctx.fillRect(-1400, -1400, W + 2800, H + 2800);
  }
  if (vessel.temperature > 250){
    const a = clamp((vessel.temperature - 250) / 950, 0, 0.45);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(CX, 260, 50, CX, 260, 260);
    g.addColorStop(0, `rgba(255,110,40,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1400, -1400, W + 2800, H + 2800);
    ctx.restore();
  }
}

function render(){
  ctx.save();
  ctx.fillStyle = '#050a14';
  ctx.fillRect(-6000, -6000, 12000, 12000);
  ctx.restore();

  ctx.save();
  if (sim.shake > 0){
    ctx.translate((Math.random() - 0.5) * sim.shake * 12, (Math.random() - 0.5) * sim.shake * 12);
  }
  drawBackdrop();
  drawBurner();
  drawBeakerBack();
  drawLiquid();
  drawSolidResidue();
  drawBeakerFront();
  drawVapours();
  drawBurette();
  drawOverlays();
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════
   LIVE BANNER UPDATE
   ══════════════════════════════════════════════════════════════════════════ */
function updateBanner(){
  /* 1. Species list with physical states */
  const speciesEl = document.getElementById('bannerSpecies');
  const chips = [];

  /* Metal ions in solution */
  for (const [ion, mol] of Object.entries(vessel.ions)){
    if (mol <= 1e-7) continue;
    chips.push({ text: `${ion}(aq)`, cls: 'aqueous' });
  }

  /* Solids (undissolved) */
  for (const s of vessel.solids){
    if (s.moles <= 1e-9) continue;
    chips.push({ text: `${s.chem.f}(s)`, cls: 'solid' });
  }

  /* Precipitates */
  for (const [p, mol] of Object.entries(vessel.precipitates)){
    if (mol <= 1e-9) continue;
    chips.push({ text: `${p}↓`, cls: 'precip' });
  }

  /* Water / solvent */
  if (vessel.waterVolume > 0.1) chips.push({ text: `H₂O(l)`, cls: 'liquid' });
  if (vessel.otherSolventVolume > 0.1) chips.push({ text: `Solvent(l)`, cls: 'liquid' });

  /* Gases */
  for (const [g, mol] of Object.entries(vessel.gases)){
    if (mol <= 1e-9) continue;
    chips.push({ text: `${g}(g)↑`, cls: 'gas' });
  }

  if (chips.length === 0){
    speciesEl.innerHTML = '<span class="text-[8.5px] text-slate-600 font-mono italic">empty vessel</span>';
  } else {
    speciesEl.innerHTML = chips.slice(0, 20).map(c =>
      `<span class="species-chip ${c.cls}">${c.text}</span>`
    ).join('');
  }

  /* 2. Active equation */
  const eqEl = document.getElementById('bannerEquation');
  if (vessel.lastEquation){
    eqEl.innerHTML = `<div class="text-[9.5px] font-mono text-amber-200 leading-relaxed">${vessel.lastEquation}</div>`;
  } else {
    eqEl.innerHTML = '<div class="text-[9px] font-mono text-slate-500 italic">no reaction in progress</div>';
  }

  /* 3. pH + status */
  document.getElementById('bannerPH').textContent = vessel.pH.toFixed(2);

  let status = 'DRY SOLID', statusCls = 'text-slate-400';
  if (vessel.waterVolume < 0.1 && vessel.otherSolventVolume < 0.1){
    status = 'DRY VESSEL'; statusCls = 'text-slate-400';
  } else if (vessel.pH < 3){
    status = 'STRONG ACID'; statusCls = 'text-red-400';
  } else if (vessel.pH < 6.5){
    status = 'ACIDIC'; statusCls = 'text-orange-400';
  } else if (vessel.pH <= 7.5){
    status = 'NEUTRAL'; statusCls = 'text-emerald-400';
  } else if (vessel.pH <= 10){
    status = 'BASIC'; statusCls = 'text-teal-400';
  } else {
    status = 'STRONG BASE'; statusCls = 'text-violet-400';
  }
  const statusEl = document.getElementById('bannerStatus');
  statusEl.textContent = status;
  statusEl.className = `text-[8.5px] font-bold tracking-wider ${statusCls} mt-0.5`;

  /* Phase chip */
  const phaseEl = document.getElementById('bannerPhase');
  if (vessel.shattered){
    phaseEl.textContent = 'BREACHED';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-red-500 bg-red-900/60 text-red-200 hazard-blink';
  } else if (vessel.paused){
    phaseEl.textContent = 'PAUSED';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-amber-600 bg-amber-950/60 text-amber-300';
  } else if (vessel.waterVolume < 0.1 && vessel.otherSolventVolume < 0.1){
    phaseEl.textContent = 'DRY VESSEL';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-slate-700 bg-slate-950/60 text-slate-400';
  } else if (vessel.temperature > 99.5){
    phaseEl.textContent = 'BOILING';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-red-700 bg-red-950/60 text-red-300';
  } else if (vessel.temperature > 40){
    phaseEl.textContent = 'WARM';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-orange-700 bg-orange-950/60 text-orange-300';
  } else {
    phaseEl.textContent = 'AQUEOUS';
    phaseEl.className = 'text-[8px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-cyan-800 bg-cyan-950/60 text-cyan-300';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   AI TUTOR
   ══════════════════════════════════════════════════════════════════════════ */
const TUTOR_DB = {
  'NEUTRALIZATION': {
    icon:'fa-flask-vial', color:'emerald',
    title:'Acid–Base Neutralization',
    summary:'Strong acid + strong base → salt + water.',
    formula:'H⁺(aq) + OH⁻(aq) → H₂O(l)      ΔH = −57.3 kJ·mol⁻¹',
    detail:'When a strong acid meets a strong base, the net ionic reaction is simply the combination of H⁺ and OH⁻ to form water. Because the O–H bond that forms is much stronger than the ion-solvent interactions that break, the reaction is exothermic by ~57.3 kJ per mole of water formed. This value is essentially constant for any strong acid–strong base pair — a consequence of the net ionic equation being identical.'
  },
  'PRECIPITATION': {
    icon:'fa-snowflake', color:'cyan',
    title:'Precipitation Reaction',
    summary:'Two soluble salts combine to form an insoluble solid.',
    formula:'Ag⁺(aq) + Cl⁻(aq) → AgCl(s)↓',
    detail:'A precipitate forms when the product of the ion concentrations exceeds the solubility product constant (Ksp) for that salt. The solid nucleates from solution as tiny crystallites, which then agglomerate into visible particles that slowly settle at the bottom under gravity. The sign of ΔH depends on the relative lattice energy vs. hydration energies — for AgCl it is slightly endothermic.'
  },
  'REDOX': {
    icon:'fa-bolt', color:'violet',
    title:'Redox Reaction',
    summary:'Electron transfer between an oxidized and a reduced species.',
    formula:'2Na(s) + 2H₂O(l) → 2NaOH(aq) + H₂(g)↑',
    detail:'Alkali metals react violently with water. Na is oxidized (Na → Na⁺ + e⁻) and water is reduced (2H₂O + 2e⁻ → H₂ + 2OH⁻). The reaction is intensely exothermic (~184 kJ/mol) because the electron transfer and subsequent hydration of Na⁺ release large amounts of energy. In practice this can ignite the evolved H₂ — hence the safety interlock.'
  },
  'SINGLE DISPL.': {
    icon:'fa-arrow-right-arrow-left', color:'amber',
    title:'Single Displacement',
    summary:'A more reactive metal displaces a less reactive ion.',
    formula:'Zn(s) + 2HCl(aq) → ZnCl₂(aq) + H₂(g)↑',
    detail:'The activity series tells us which metals can displace which ions. Zinc sits above hydrogen, so it reduces H⁺ to H₂ while itself being oxidized to Zn²⁺. The reaction rate increases with temperature (Arrhenius) and acid concentration. Each mole of Zn produces one mole of H₂ gas.'
  },
  'GAS EVOLUTION': {
    icon:'fa-wind', color:'teal',
    title:'Gas Evolution',
    summary:'A gaseous product escapes as bubbles.',
    formula:'CO₃²⁻(aq) + 2H⁺(aq) → H₂O(l) + CO₂(g)↑',
    detail:'Carbonates react with acids to produce CO₂ gas. The bubbles you see are CO₂ nucleating at the container walls. Using the ideal gas law at STP (0°C, 1 atm), 1 mole of CO₂ occupies 22.4 L — a useful conversion for stoichiometry problems. The reaction is mildly exothermic because the formation of H₂O from H⁺ and OH⁻ dominates the enthalpy balance.'
  },
  'COMBUSTION': {
    icon:'fa-fire', color:'orange',
    title:'Combustion',
    summary:'Rapid oxidation with heat and light release.',
    formula:'C₂H₅OH + 3O₂ → 2CO₂ + 3H₂O      ΔH ≈ −1367 kJ·mol⁻¹',
    detail:'Combustion requires three things: fuel, oxygen, and an ignition source that exceeds the autoignition temperature. Once ignited, the reaction is a radical chain reaction that proceeds very rapidly. The highly negative ΔH reflects the formation of strong C=O and O–H bonds in the products.'
  },
  'HYDROLYSIS': {
    icon:'fa-droplet', color:'lime',
    title:'Hydrolysis',
    summary:'Water splits the reactant into new species.',
    formula:'CaO(s) + H₂O(l) → Ca(OH)₂(aq)      ΔH = −350 kJ·mol⁻¹',
    detail:'Lime slaking — the reaction of quicklime (CaO) with water — is intensely exothermic. It releases enough heat to boil the water locally, producing steam. Industrially this reaction is used to make slaked lime for mortar and cement, but in the lab it must be done in small portions with good ventilation to prevent spatter.'
  },
  'ACID-BASE': {
    icon:'fa-scale-balanced', color:'amber',
    title:'Metal Oxide + Acid',
    summary:'A basic oxide neutralizes an acid to form a salt.',
    formula:'CuO(s) + 2H⁺(aq) → Cu²⁺(aq) + H₂O(l)',
    detail:'Metal oxides are basic — they accept protons from strong acids. The reaction is often slow at room temperature because the oxide must first dissolve, exposing fresh surface. Heating accelerates it via Arrhenius kinetics. CuO is a good example: its black color disappears as blue Cu²⁺ ions enter solution.'
  },
  'DECOMPOSITION': {
    icon:'fa-arrow-down', color:'rose',
    title:'Decomposition',
    summary:'A compound breaks into simpler products.',
    formula:'2H₂O₂(aq) → 2H₂O(l) + O₂(g)↑      ΔH = −98 kJ·mol⁻¹',
    detail:'Hydrogen peroxide is thermodynamically unstable and decomposes slowly even at room temperature. Catalysts dramatically accelerate this via a lower-energy pathway. The reaction is exothermic and produces oxygen gas, which is why peroxide bubbles when applied to a wound (catalase in blood).'
  },
  'READY': {
    icon:'fa-lightbulb', color:'cyan',
    title:'Ready for Experimentation',
    summary:'The vessel is empty and ready.',
    formula:'Vessel empty · 25.0 °C · pH 7.00 · 0 mL liquid',
    detail:'Click the large blue button above to open the Reagent Library and add chemicals. Alkali metals will remain completely inert if no liquid solvent is present. The simulator will automatically detect dangerous combinations and pause for your authorization.'
  }
};

function toggleTutor(){
  const d = document.getElementById('tutorDrawer');
  const hidden = d.classList.contains('translate-x-full');
  if (hidden){
    d.classList.remove('translate-x-full');
    updateTutor();
  } else {
    d.classList.add('translate-x-full');
  }
}

function updateTutor(){
  const body = document.getElementById('tutorBody');
  const type = vessel.lastReactionType;
  const entry = TUTOR_DB[type] || TUTOR_DB['READY'];

  const colorMap = {
    emerald: 'from-emerald-500 to-green-700',
    cyan:    'from-cyan-500 to-blue-700',
    violet:  'from-violet-500 to-purple-700',
    amber:   'from-amber-500 to-orange-700',
    teal:    'from-teal-500 to-cyan-700',
    orange:  'from-orange-500 to-red-700',
    lime:    'from-lime-500 to-green-700',
    rose:    'from-rose-500 to-red-700',
  };

  const totalMoles = Object.values(vessel.ions).reduce((a,b)=>a+b,0)
                   + vessel.solids.reduce((a,b)=>a+b.moles,0)
                   + Object.values(vessel.precipitates).reduce((a,b)=>a+b,0);

  const isEmpty = totalMoles < 1e-9 && vessel.waterVolume < 0.1 && vessel.otherSolventVolume < 0.1;

  body.innerHTML = `
    <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${colorMap[entry.color]||'from-cyan-500 to-blue-700'} grid place-items-center shrink-0">
        <i class="fa-solid ${entry.icon} text-white text-[16px]"></i>
      </div>
      <div class="min-w-0">
        <div class="text-[13px] font-bold text-slate-100 leading-tight">${entry.title}</div>
        <div class="text-[10px] text-slate-400 leading-tight">${entry.summary}</div>
      </div>
    </div>

    <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
      <div class="text-[8.5px] font-bold tracking-widest text-cyan-400 mb-1.5">
        <i class="fa-solid fa-flask mr-1"></i>KEY EQUATION
      </div>
      <div class="text-[11px] font-mono text-amber-200 bg-[#131c2b] border border-slate-800 rounded px-2.5 py-2 leading-relaxed">
        ${entry.formula}
      </div>
    </div>

    <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
      <div class="text-[8.5px] font-bold tracking-widest text-emerald-400 mb-1.5">
        <i class="fa-solid fa-book-open mr-1"></i>SCIENTIFIC EXPLANATION
      </div>
      <div class="text-[11px] text-slate-300 leading-relaxed">
        ${entry.detail}
      </div>
    </div>

    <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
      <div class="text-[8.5px] font-bold tracking-widest text-violet-400 mb-1.5">
        <i class="fa-solid fa-chart-simple mr-1"></i>CURRENT VESSEL STATE
      </div>
      <div class="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
        <div class="flex justify-between"><span class="text-slate-500">Liquid</span><span class="text-blue-300">${totalLiquidVolume().toFixed(1)} mL</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Temp</span><span class="text-orange-300">${vessel.temperature.toFixed(1)} °C</span></div>
        <div class="flex justify-between"><span class="text-slate-500">pH</span><span class="text-emerald-300">${vessel.pH.toFixed(2)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Σn solute</span><span class="text-violet-300">${(totalMoles*1000).toFixed(2)} mmol</span></div>
      </div>
    </div>

    <div class="bg-cyan-950/40 border border-cyan-900/70 rounded-lg p-3 text-[10.5px] text-cyan-200/90 leading-relaxed">
      <i class="fa-solid fa-circle-info mr-1.5 text-cyan-400"></i>
      ${isEmpty
        ? 'The vessel is completely empty and dry. Alkali metals will remain inert until a liquid solvent is added.'
        : `Most recent reaction class: <span class="font-bold text-cyan-100">${entry.title}</span>. Continue adding reagents to explore related chemistry.`}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════════════════
   HUD + THERMO UPDATE
   ══════════════════════════════════════════════════════════════════════════ */
let hudTimer = 0;
let tutorTimer = 0;

function fmtSci(v){
  if (v <= 0) return '0';
  return v.toExponential(2);
}

function updateHUD(dt){
  hudTimer += dt;
  tutorTimer += dt;

  if (tutorTimer > 0.5){
    tutorTimer = 0;
    if (!document.getElementById('tutorDrawer').classList.contains('translate-x-full')){
      updateTutor();
    }
  }

  if (hudTimer < 0.08) return;
  hudTimer = 0;

  const v = vessel, s = sim;

  document.getElementById('tempC').textContent = v.temperature.toFixed(1);

  let stateName = 'AMBIENT', stateCls = 'border-cyan-800 bg-cyan-950/70 text-cyan-300';
  if (v.paused)              { stateName = 'PAUSED';     stateCls = 'border-red-500 bg-red-900/60 text-red-200 hazard-blink'; }
  else if (v.temperature < 5){ stateName = 'CRYOGENIC';   stateCls = 'border-blue-700 bg-blue-950/60 text-blue-300'; }
  else if (v.temperature < 18){ stateName = 'COLD';        stateCls = 'border-sky-700 bg-sky-950/60 text-sky-300'; }
  else if (v.temperature < 40){ stateName = 'AMBIENT';     stateCls = 'border-cyan-800 bg-cyan-950/70 text-cyan-300'; }
  else if (v.temperature < 65){ stateName = 'WARM';        stateCls = 'border-amber-700 bg-amber-950/60 text-amber-300'; }
  else if (v.temperature < 99){ stateName = 'HOT';         stateCls = 'border-orange-700 bg-orange-950/60 text-orange-300'; }
  else if (v.temperature < 110){ stateName = 'BOILING';     stateCls = 'border-red-700 bg-red-950/60 text-red-300'; }
  else if (v.temperature < 400){ stateName = 'VERY HOT';    stateCls = 'border-red-600 bg-red-900/60 text-red-200'; }
  else                        { stateName = 'INCANDESCENT';stateCls = 'border-red-500 bg-red-800/70 text-red-100 hazard-blink'; }

  const ts = document.getElementById('thermalState');
  ts.textContent = stateName;
  ts.className = `text-[8px] font-bold tracking-wider px-2 py-1 rounded-full border ${stateCls} backdrop-blur-sm`;

  document.getElementById('hudFlame').textContent = s.flame.toFixed(0) + '%';
  document.getElementById('hudStir').textContent = (s.stir * 12).toFixed(0);
  document.getElementById('hudDrip').textContent = s.drip.toFixed(1);

  document.getElementById('phValue').textContent = v.pH.toFixed(2);
  document.getElementById('phMarker').style.left = `calc(${(v.pH / 14) * 100}% - 1.5px)`;

  let phTxt = 'NEUTRAL', phCol = 'text-emerald-400';
  if (v.pH < 3)       { phTxt = 'STRONG ACID'; phCol = 'text-red-400'; }
  else if (v.pH < 6)  { phTxt = 'ACIDIC';      phCol = 'text-orange-400'; }
  else if (v.pH < 6.8){ phTxt = 'SLIGHT ACID'; phCol = 'text-amber-400'; }
  else if (v.pH <= 7.2){ phTxt = 'NEUTRAL';    phCol = 'text-emerald-400'; }
  else if (v.pH <= 8.5){ phTxt = 'SLIGHT BASE';phCol = 'text-teal-400'; }
  else if (v.pH <= 11) { phTxt = 'BASIC';      phCol = 'text-blue-400'; }
  else                 { phTxt = 'STRONG BASE';phCol = 'text-violet-400'; }
  const pl = document.getElementById('phLabel');
  pl.textContent = phTxt; pl.className = `text-[8px] font-bold tracking-wider ${phCol}`;

  const phSl = document.getElementById('phSliderLbl');
  if (phSl) phSl.textContent = v.pH.toFixed(2);

  /* Thermodynamics */
  const V_L = Math.max(0.0005, totalLiquidVolume() / 1000);
  const cWater = 4.184;
  const dT = v.temperature - 25;
  const q = v.mass * cWater * dT;

  const gm = v.gases;
  const nGas = Object.values(gm).reduce((a,b)=>a+b,0);
  const V_STP = nGas * 22.4;

  const totalMoles = Object.values(v.ions).reduce((a,b)=>a+b,0)
                   + v.solids.reduce((a,b)=>a+b.moles,0)
                   + Object.values(v.precipitates).reduce((a,b)=>a+b,0);
  const M = totalMoles / V_L;

  document.getElementById('mMass').textContent = v.mass.toFixed(1);
  document.getElementById('mVol').textContent = totalLiquidVolume().toFixed(1);
  document.getElementById('mMol').textContent = M.toFixed(3);
  document.getElementById('mDH').textContent = v.lastDeltaH_kJmol.toFixed(1);
  document.getElementById('mQ').textContent = q.toFixed(1);
  document.getElementById('mVstp').textContent = V_STP.toFixed(3);
  document.getElementById('mNgas').textContent = nGas.toFixed(4);
  document.getElementById('mDT').textContent = dT.toFixed(1);

  const dHBar = document.getElementById('dHBar');
  const dHPct = clamp(Math.abs(v.dH) / 400 * 50, 0, 50);
  if (v.dH < 0){
    dHBar.style.right = '50%'; dHBar.style.left = 'auto';
    dHBar.style.width = dHPct + '%';
    dHBar.style.background = 'linear-gradient(90deg,#fb7185,#f43f5e)';
  } else if (v.dH > 0){
    dHBar.style.left = '50%'; dHBar.style.right = 'auto';
    dHBar.style.width = dHPct + '%';
    dHBar.style.background = 'linear-gradient(90deg,#34d399,#10b981)';
  } else {
    dHBar.style.width = '0%';
  }
  document.getElementById('mDHCumul').textContent = (v.dH >= 0 ? '+' : '') + v.dH.toFixed(2) + ' kJ';

  /* Species list */
  const sp = document.getElementById('speciesList');
  const entries = Object.entries(v.ions).filter(([k,val]) => val > 1e-9)
    .sort((a,b) => b[1] - a[1]).slice(0, 16);
  if (entries.length === 0){
    sp.innerHTML = '<span class="text-[8.5px] text-slate-600 font-mono italic">no solutes in vessel</span>';
  } else {
    sp.innerHTML = entries.map(([k,val]) => {
      const conc = val / V_L;
      return `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#131c2b] border border-slate-800 text-cyan-300">[${k}] = <span class="text-slate-400">${fmtSci(conc)}</span> M</span>`;
    }).join('');
  }

  document.getElementById('fps').textContent = Math.round(1 / Math.max(dt, 1e-4));

  /* Also refresh live banner */
  updateBanner();
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN LOOP
   ══════════════════════════════════════════════════════════════════════════ */
let lastT = performance.now();

function loop(now){
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  const v = vessel, s = sim;
  s.tick++;
  s.stirPhase += dt * 60 * (s.stir / 100) * 3;

  if (!v.shattered && !v.paused){
    updateThermo(dt);
    react(dt);
    updateBurette(dt);

    if (v.temperature > 60 && v.temperature < 100 && v.waterVolume > 1){
      if (Math.random() < (v.temperature - 60) / 400) spawnSteam(1);
    }
  }

  computePH();
  computeFluidColor();
  updateParticles(dt);
  updateHUD(dt);
  render();
}

/* ══════════════════════════════════════════════════════════════════════════
   WIRE CONTROLS
   ══════════════════════════════════════════════════════════════════════════ */
function wireControls(){
  const flame = document.getElementById('flameSlider');
  const stir  = document.getElementById('stirSlider');
  const drip  = document.getElementById('dripSlider');
  const phSl  = document.getElementById('phSlider');

  flame.addEventListener('input', e => {
    sim.flame = parseFloat(e.target.value);
    document.getElementById('flameLbl').textContent = ((sim.flame / 100) * 1500).toFixed(0) + ' °C';
    LabAudio.init(); LabAudio.resume();
  });

  stir.addEventListener('input', e => {
    sim.stir = parseFloat(e.target.value);
    document.getElementById('stirLbl').textContent = (sim.stir * 12).toFixed(0) + ' rpm';
    if (sim.stir > 0 && Math.random() < 0.4) LabAudio.whirr();
  });

  drip.addEventListener('input', e => {
    sim.drip = parseFloat(e.target.value);
    document.getElementById('dripLbl').textContent = sim.drip.toFixed(1) + ' d/s';
  });

  if (phSl){
    phSl.addEventListener('input', e => {
      document.getElementById('phSliderLbl').textContent = parseFloat(e.target.value).toFixed(2);
    });
  }

  document.getElementById('btnOpenLibrary').onclick = openReagentModal;

  document.getElementById('btnWater').onclick = () => {
    const inp = document.getElementById('water-vol');
    const qty = parseFloat(inp.value);
    if (!qty || qty <= 0){ log('Enter a valid water volume.', 'warn'); return; }
    vessel.waterVolume += qty;
    vessel.mass += qty;
    log(`Added ${qty.toFixed(1)} mL distilled H₂O (dilution)`, 'info');
    LabAudio.click();
    updateBanner();
  };

  document.getElementById('btnClearVessel').onclick = () => {
    clearVessel();
    document.getElementById('hazard').classList.add('hidden');
  };

  document.getElementById('btnRefill').onclick = () => {
    vessel.buretteFrac = 1;
    log('Burette refilled to 50.00 mL mark', 'good');
    LabAudio.click();
  };

  document.getElementById('btnStirPulse').onclick = () => {
    LabAudio.init(); LabAudio.resume();
    LabAudio.whirr();
    let t = 0;
    const iv = setInterval(() => {
      t += 0.05;
      sim.stirPhase += 14;
      if (t > 0.55){ clearInterval(iv); }
    }, 30);
    log('Manual stir pulse applied', 'info');
  };

  document.getElementById('btnFlush').onclick = () => {
    flushVessel();
    document.getElementById('hazard').classList.add('hidden');
  };

  document.getElementById('btnSound').onclick = () => {
    LabAudio.init(); LabAudio.resume();
    LabAudio.enabled = !LabAudio.enabled;
    document.getElementById('soundLbl').textContent = 'SOUND: ' + (LabAudio.enabled ? 'ON' : 'OFF');
    if (!LabAudio.enabled){
      LabAudio.setFizz(0); LabAudio.setHiss(0); LabAudio.setBoil(0);
    }
    log('Audio ' + (LabAudio.enabled ? 'enabled' : 'muted'), 'info');
  };

  document.getElementById('btnHazardAllow').onclick = () => {
    const pending = pendingAddition;
    hideHazardModal();
    vessel.paused = false;
    pendingAddition = null;
    if (pending){
      log('⚠️ SAFETY OVERRIDE — hazard procedure authorized by operator.', 'danger');
      addChemical(pending.chem, pending.qty, true);
    }
  };

  document.getElementById('btnHazardCancel').onclick = () => {
    hideHazardModal();
    vessel.paused = false;
    if (pendingAddition){
      log(`🛑 ABORTED — ${pendingAddition.qty.toFixed(1)} ${pendingAddition.chem.st === 's' ? 'g' : 'mL'} of ${pendingAddition.chem.f} rejected. Vessel unchanged.`, 'warn');
    }
    pendingAddition = null;
  };

  document.addEventListener('keydown', e => {
    if (vessel.paused){
      if (e.key === 'Escape'){ document.getElementById('btnHazardCancel').click(); }
      else if (e.key === 'Enter'){ document.getElementById('btnHazardAllow').click(); }
    } else if (e.key === 't' || e.key === 'T'){
      toggleTutor();
    } else if (e.key === 'Escape'){
      document.getElementById('tutorDrawer').classList.add('translate-x-full');
      document.getElementById('reagentModal').classList.add('hidden');
    }
  });

  const unlock = () => { LabAudio.init(); LabAudio.resume(); document.removeEventListener('click', unlock); };
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════════ */
function boot(){
  buildTabs();
  buildShelf();
  buildBuretteSel();
  wireControls();
  resizeCanvas();

  if (window.ResizeObserver){
    try { new ResizeObserver(resizeCanvas).observe(canvas.parentElement); } catch(e){}
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 100);

  /* Initialize vessel in clean, empty state — no false water presence */
  purgeVesselState();

  log('VirtuaLab Pro v9.0 initialised. ' + CHEMS.length + ' species loaded.', 'good');
  log('Vessel empty and dry. Add reagents from the library.', 'info');
  log('Click [OPEN REAGENT LIBRARY] to begin.', 'info');
  log('Press [T] for AI Lab Tutor · [ESC] closes panels.', 'info');

  updateBanner();
  updateTutor();
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
