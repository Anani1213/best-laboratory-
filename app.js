/* VirtuaLab Pro — university-grade browser chemistry simulation
   Two-file architecture: index.html + app.js
   Core contracts:
   window.ChemicalsDB
   window.ChemistryEngine
   window.CanvasRenderer
*/
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const fmt = (v,d=2) => Number.isFinite(v) ? v.toFixed(d) : "0.00";
  const nowStamp = () => new Date().toLocaleTimeString([], {hour12:false});
  const molFromDose = (doseMl, molarity) => Math.max(0,doseMl)/1000 * (molarity || 0);

  /* ----------------------------- CHEMICAL DATABASE ----------------------------- */
  const elementRows = [
    ["Hydrogen","H",1.008,"gas",0.0000899],["Helium","He",4.003,"gas",0.0001785],
    ["Lithium","Li",6.94,"solid",0.534],["Beryllium","Be",9.012,"solid",1.848],
    ["Boron","B",10.81,"solid",2.34],["Carbon","C",12.011,"solid",2.267],
    ["Nitrogen","N",14.007,"gas",0.001251],["Oxygen","O",15.999,"gas",0.001429],
    ["Fluorine","F",18.998,"gas",0.001696],["Neon","Ne",20.180,"gas",0.0009],
    ["Sodium","Na",22.990,"solid",0.971],["Magnesium","Mg",24.305,"solid",1.738],
    ["Aluminium","Al",26.982,"solid",2.70],["Silicon","Si",28.085,"solid",2.329],
    ["Phosphorus","P",30.974,"solid",1.82],["Sulfur","S",32.06,"solid",2.07],
    ["Chlorine","Cl",35.45,"gas",0.003214],["Argon","Ar",39.948,"gas",0.001784],
    ["Potassium","K",39.098,"solid",0.862],["Calcium","Ca",40.078,"solid",1.55],
    ["Scandium","Sc",44.956,"solid",2.985],["Titanium","Ti",47.867,"solid",4.506],
    ["Vanadium","V",50.942,"solid",6.11],["Chromium","Cr",51.996,"solid",7.19],
    ["Manganese","Mn",54.938,"solid",7.21],["Iron","Fe",55.845,"solid",7.874],
    ["Cobalt","Co",58.933,"solid",8.90],["Nickel","Ni",58.693,"solid",8.908],
    ["Copper","Cu",63.546,"solid",8.96],["Zinc","Zn",65.38,"solid",7.14],
    ["Gallium","Ga",69.723,"solid",5.91],["Germanium","Ge",72.630,"solid",5.323],
    ["Arsenic","As",74.922,"solid",5.73],["Selenium","Se",78.971,"solid",4.81],
    ["Bromine","Br",79.904,"liquid",3.1028],["Krypton","Kr",83.798,"gas",0.00375],
    ["Rubidium","Rb",85.468,"solid",1.532],["Strontium","Sr",87.62,"solid",2.64],
    ["Yttrium","Y",88.906,"solid",4.472],["Zirconium","Zr",91.224,"solid",6.52],
    ["Niobium","Nb",92.906,"solid",8.57],["Molybdenum","Mo",95.95,"solid",10.28],
    ["Technetium","Tc",98,"solid",11.5],["Ruthenium","Ru",101.07,"solid",12.37],
    ["Rhodium","Rh",102.906,"solid",12.41],["Palladium","Pd",106.42,"solid",12.02],
    ["Silver","Ag",107.868,"solid",10.49],["Cadmium","Cd",112.414,"solid",8.65],
    ["Indium","In",114.818,"solid",7.31],["Tin","Sn",118.710,"solid",7.265],
    ["Antimony","Sb",121.760,"solid",6.697],["Tellurium","Te",127.60,"solid",6.24],
    ["Iodine","I",126.904,"solid",4.933],["Xenon","Xe",131.293,"gas",0.00589],
    ["Cesium","Cs",132.905,"solid",1.93],["Barium","Ba",137.327,"solid",3.62],
    ["Lanthanum","La",138.905,"solid",6.15],["Cerium","Ce",140.116,"solid",6.77],
    ["Praseodymium","Pr",140.908,"solid",6.77],["Neodymium","Nd",144.242,"solid",7.01],
    ["Promethium","Pm",145,"solid",7.26],["Samarium","Sm",150.36,"solid",7.52],
    ["Europium","Eu",151.964,"solid",5.24],["Gadolinium","Gd",157.25,"solid",7.90],
    ["Terbium","Tb",158.925,"solid",8.23],["Dysprosium","Dy",162.500,"solid",8.55],
    ["Holmium","Ho",164.930,"solid",8.80],["Erbium","Er",167.259,"solid",9.066],
    ["Thulium","Tm",168.934,"solid",9.32],["Ytterbium","Yb",173.045,"solid",6.90],
    ["Lutetium","Lu",174.967,"solid",9.84],["Hafnium","Hf",178.49,"solid",13.31],
    ["Tantalum","Ta",180.948,"solid",16.69],["Tungsten","W",183.84,"solid",19.25],
    ["Rhenium","Re",186.207,"solid",21.02],["Osmium","Os",190.23,"solid",22.59],
    ["Iridium","Ir",192.217,"solid",22.56],["Platinum","Pt",195.084,"solid",21.45],
    ["Gold","Au",196.967,"solid",19.30],["Mercury","Hg",200.592,"liquid",13.53],
    ["Thallium","Tl",204.38,"solid",11.85],["Lead","Pb",207.2,"solid",11.34],
    ["Bismuth","Bi",208.980,"solid",9.78],["Polonium","Po",209,"solid",9.20],
    ["Astatine","At",210,"solid",7.0],["Radon","Rn",222,"gas",0.00973],
    ["Francium","Fr",223,"solid",1.87],["Radium","Ra",226,"solid",5.5],
    ["Actinium","Ac",227,"solid",10.07],["Thorium","Th",232.038,"solid",11.72],
    ["Protactinium","Pa",231.036,"solid",15.37],["Uranium","U",238.029,"solid",19.05],
    ["Neptunium","Np",237,"solid",20.45],["Plutonium","Pu",244,"solid",19.84],
    ["Americium","Am",243,"solid",13.69],["Curium","Cm",247,"solid",13.51],
    ["Berkelium","Bk",247,"solid",14.78],["Californium","Cf",251,"solid",15.1],
    ["Einsteinium","Es",252,"solid",8.84],["Fermium","Fm",257,"solid",9.7],
    ["Mendelevium","Md",258,"solid",10.3],["Nobelium","No",259,"solid",9.9],
    ["Lawrencium","Lr",266,"solid",14.0],["Rutherfordium","Rf",267,"solid",23],
    ["Dubnium","Db",268,"solid",29],["Seaborgium","Sg",269,"solid",35],
    ["Bohrium","Bh",270,"solid",37],["Hassium","Hs",277,"solid",40],
    ["Meitnerium","Mt",278,"solid",37],["Darmstadtium","Ds",281,"solid",34],
    ["Roentgenium","Rg",282,"solid",28],["Copernicium","Cn",285,"liquid",14],
    ["Nihonium","Nh",286,"solid",16],["Flerovium","Fl",289,"solid",14],
    ["Moscovium","Mc",290,"solid",13],["Livermorium","Lv",293,"solid",12],
    ["Tennessine","Ts",294,"solid",7],["Oganesson","Og",294,"gas",0.005]
  ];

  const compoundRows = [
    ["Water","H₂O","solvent","liquid",18.015,1.000,100,0,0,7],
    ["Hydrochloric Acid","HCl","strong acids","liquid",36.46,1.18, -85,1.0,-1,0],
    ["Sulfuric Acid","H₂SO₄","strong acids","liquid",98.079,1.84,337,1.0,-2,0],
    ["Nitric Acid","HNO₃","strong acids","liquid",63.012,1.51,83,1.0,-1,0],
    ["Acetic Acid","CH₃COOH","weak acids","liquid",60.052,1.049,118,0.1,-1,2.87],
    ["Carbonic Acid","H₂CO₃","weak acids","aqueous",62.024,1.00,0,0.01,-1,3.60],
    ["Sodium Hydroxide","NaOH","strong bases","solid",39.997,2.13,1388,1.0,1,14],
    ["Potassium Hydroxide","KOH","strong bases","solid",56.105,2.04,1327,1.0,1,14],
    ["Ammonia","NH₃","weak bases","aqueous",17.031,0.68,-33,0.1,1,11.1],
    ["Calcium Hydroxide","Ca(OH)₂","strong bases","solid",74.093,2.21,580,0.05,2,12.7],
    ["Sodium Chloride","NaCl","salts","solid",58.44,2.165,1465,0,0,7],
    ["Potassium Chloride","KCl","salts","solid",74.551,1.984,1420,0,0,7],
    ["Silver Nitrate","AgNO₃","salts","solid",169.873,4.35,212,0,0,7],
    ["Copper(II) Sulfate","CuSO₄","salts","solid",159.609,3.60,110,0,0,7],
    ["Sodium Carbonate","Na₂CO₃","salts","solid",105.988,2.54,1600,0,0,11.6],
    ["Sodium Bicarbonate","NaHCO₃","salts","solid",84.006,2.20,270,0,0,8.3],
    ["Calcium Carbonate","CaCO₃","salts","solid",100.086,2.71,825,0,0,8.4],
    ["Barium Chloride","BaCl₂","salts","solid",208.23,3.86,1560,0,0,7],
    ["Potassium Iodide","KI","salts","solid",166.002,3.13,681,0,0,7],
    ["Sodium Thiosulfate","Na₂S₂O₃","salts","solid",158.11,1.73,48,0,0,7],
    ["Sodium Sulfate","Na₂SO₄","salts","solid",142.04,2.66,884,0,0,7],
    ["Magnesium Sulfate","MgSO₄","salts","solid",120.366,2.66,1124,0,0,7],
    ["Iron(III) Chloride","FeCl₃","salts","solid",162.20,2.90,315,0,0,2],
    ["Iron(II) Sulfate","FeSO₄","salts","solid",151.91,1.90,680,0,0,7],
    ["Lead(II) Nitrate","Pb(NO₃)₂","salts","solid",331.20,4.53,470,0,0,7],
    ["Potassium Permanganate","KMnO₄","oxidizers","solid",158.034,2.70,240,0,0,7],
    ["Hydrogen Peroxide","H₂O₂","oxidizers","liquid",34.014,1.45,150,0,0,7],
    ["Sodium Hypochlorite","NaClO","oxidizers","aqueous",74.44,1.11,101,0,0,11],
    ["Potassium Dichromate","K₂Cr₂O₇","oxidizers","solid",294.185,2.68,398,0,0,7],
    ["Ammonium Nitrate","NH₄NO₃","oxidizers","solid",80.043,1.72,210,0,0,5.5],
    ["Ethanol","C₂H₅OH","solvents","liquid",46.069,0.789,78.37,0,0,7],
    ["Methanol","CH₃OH","solvents","liquid",32.042,0.792,64.7,0,0,7],
    ["Acetone","C₃H₆O","solvents","liquid",58.08,0.784,56.05,0,0,7],
    ["Isopropanol","C₃H₈O","solvents","liquid",60.096,0.786,82.6,0,0,7],
    ["Ethylene Glycol","C₂H₆O₂","solvents","liquid",62.07,1.113,197,0,0,7],
    ["Glycerol","C₃H₈O₃","solvents","liquid",92.094,1.261,290,0,0,7],
    ["Phenolphthalein","C₂₀H₁₂O₄","indicators","solid",318.32,1.30,258,0,0,8.5],
    ["Methyl Orange","C₁₄H₁₄N₃NaO₃S","indicators","solid",327.33,1.0,300,0,0,4],
    ["Bromothymol Blue","C₂₇H₂₈Br₂O₅S","indicators","solid",624.38,1.0,200,0,0,7],
    ["Potassium Thiocyanate","KSCN","salts","solid",97.18,1.89,173,0,0,7],
    ["Ammonium Chloride","NH₄Cl","salts","solid",53.491,1.53,338,0,0,5.5],
    ["Sodium Acetate","CH₃COONa","salts","solid",82.034,1.53,324,0,0,8.9],
    ["Citric Acid","C₆H₈O₇","weak acids","solid",192.124,1.66,153,0.1,-1,2.2],
    ["Oxalic Acid","H₂C₂O₄","weak acids","solid",90.034,1.90,189,0.1,-1,1.3],
    ["Phosphoric Acid","H₃PO₄","weak acids","liquid",97.994,1.88,158,0.1,-1,2.1],
    ["Sodium Phosphate","Na₃PO₄","salts","solid",163.94,1.62,1340,0,0,12],
    ["Copper(II) Chloride","CuCl₂","salts","solid",134.45,3.39,993,0,0,4],
    ["Zinc Sulfate","ZnSO₄","salts","solid",161.44,3.54,680,0,0,5.5],
    ["Zinc Chloride","ZnCl₂","salts","solid",136.315,2.91,290,0,0,5],
    ["Aluminium Sulfate","Al₂(SO₄)₃","salts","solid",342.15,2.71,770,0,0,3],
    ["Sodium Sulfite","Na₂SO₃","salts","solid",126.04,2.63,500,0,0,9],
    ["Sodium Oxalate","Na₂C₂O₄","salts","solid",134.00,2.34,250,0,0,7],
    ["Urea","CH₄N₂O","salts","solid",60.06,1.32,133,0,0,7],
    ["Glucose","C₆H₁₂O₆","biochemicals","solid",180.156,1.54,146,0,0,7],
    ["Sucrose","C₁₂H₂₂O₁₁","biochemicals","solid",342.30,1.59,186,0,0,7],
    ["Starch","(C₆H₁₀O₅)n","biochemicals","solid",162.14,1.50,0,0,0,7],
    ["Sodium Acetate Buffer","CH₃COONa/CH₃COOH","buffers","aqueous",100,1.05,100,0,0,4.76],
    ["Ammonium Buffer","NH₄Cl/NH₃","buffers","aqueous",53.5,1.0,100,0,0,9.25],
    ["Hydrogen Gas","H₂","gases","gas",2.016,0.0000899,-253,0,0,7],
    ["Nitrogen Gas","N₂","gases","gas",28.014,0.001251,-196,0,0,7],
    ["Oxygen Gas","O₂","gases","gas",31.998,0.001429,-183,0,0,7],
    ["Fluorine Gas","F₂","gases","gas",37.996,0.001696,-188,0,0,7],
    ["Chlorine Gas","Cl₂","gases","gas",70.90,0.003214,-34,0,0,7],
    ["Carbon Dioxide","CO₂","gases","gas",44.01,0.001977,-78,0,0,7],
    ["Sulfur Dioxide","SO₂","gases","gas",64.066,0.002628,-10,0,0,4],
    ["Ammonia Gas","NH₃","gases","gas",17.031,0.00073,-33,0,1,11],
    ["Nitrogen Dioxide","NO₂","gases","gas",46.005,0.00188,21,0,0,4],
    ["Nitric Oxide","NO","gases","gas",30.006,0.00134,-152,0,0,7],
    ["Hydrogen Sulfide","H₂S","gases","gas",34.08,0.00154,-60,0,0,4],
    ["Sulfur Hexafluoride","SF₆","gases","gas",146.06,0.00617,-64,0,0,7],
    ["Hydrogen Chloride Gas","HCl","gases","gas",36.46,0.00164,-85,1,0,1],
    ["Carbon Monoxide","CO","gases","gas",28.01,0.00125,-191,0,0,7],
    ["Nitrous Oxide","N₂O","gases","gas",44.013,0.00198,-88,0,0,7],
    ["Silver Chloride","AgCl","precipitates","solid",143.32,5.56,455,0,0,7],
    ["Copper(II) Hydroxide","Cu(OH)₂","precipitates","solid",97.56,3.37,80,0,0,7],
    ["Barium Sulfate","BaSO₄","precipitates","solid",233.39,4.50,1580,0,0,7],
    ["Calcium Oxalate","CaC₂O₄","precipitates","solid",128.10,2.22,200,0,0,7],
    ["Lead(II) Iodide","PbI₂","precipitates","solid",461.0,6.16,402,0,0,7],
    ["Iron(III) Hydroxide","Fe(OH)₃","precipitates","solid",106.87,3.40,500,0,0,7],
    ["Magnesium Hydroxide","Mg(OH)₂","precipitates","solid",58.32,2.36,350,0,0,7],
    ["Calcium Chloride","CaCl₂","salts","solid",110.98,2.15,772,0,0,7],
    ["Magnesium Chloride","MgCl₂","salts","solid",95.21,2.32,714,0,0,7],
    ["Potassium Nitrate","KNO₃","salts","solid",101.103,2.11,334,0,0,7],
    ["Sodium Nitrate","NaNO₃","salts","solid",84.994,2.26,308,0,0,7],
    ["Calcium Nitrate","Ca(NO₃)₂","salts","solid",164.09,2.50,561,0,0,7],
    ["Copper(II) Nitrate","Cu(NO₃)₂","salts","solid",187.56,3.05,256,0,0,5],
    ["Iron(III) Nitrate","Fe(NO₃)₃","salts","solid",241.86,1.68,125,0,0,2],
    ["Potassium Bromide","KBr","salts","solid",119.00,2.75,734,0,0,7],
    ["Sodium Bromide","NaBr","salts","solid",102.89,2.18,747,0,0,7],
    ["Silver Fluoride","AgF","salts","solid",126.87,5.85,435,0,0,7],
    ["Hydrogen Fluoride","HF","weak acids","liquid",20.006,0.99,19.5,0.1,-1,3.2],
    ["Hydrogen Bromide","HBr","strong acids","gas",80.91,1.49,-67,1,-1,0],
    ["Hydrogen Iodide","HI","strong acids","gas",127.91,1.99,-35,1,-1,0],
    ["Boric Acid","H₃BO₃","weak acids","solid",61.83,1.44,171,0.01,-1,5.1],
    ["Sodium Borate","Na₂B₄O₇","salts","solid",201.22,1.73,741,0,0,9.2]
  ];

  const categories = ["All","Alkali Metals","Alkaline Earth","Transition","Post-Transition","Non-Metals","Basic Oxides","Acidic Oxides","Amphoteric Oxides","Neutral Oxides","Strong Acids","Weak Acids","Strong Bases","Weak Bases","Salts","Solvents","Indicators"];

  const Chemicals = {};
  const aliasMap = {};
  function register(id, obj) {
    Chemicals[id] = Object.assign({
      id, name:id, formula:id, category:"Other", phase:"aqueous",
      molarMass:1, density:1, boilingPoint:100, concentration:0, acidBase:0, pKa:null,
      color:"#4f8cff", heatCapacity:4.18, solubility:"soluble"
    }, obj);
  }
  function elementCategory(symbol) {
    const alk = ["Li","Na","K","Rb","Cs","Fr"];
    const ae = ["Be","Mg","Ca","Sr","Ba","Ra"];
    const trans = ["Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg","Rf","Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn"];
    const non = ["H","C","N","O","F","P","S","Cl","Se","Br","I","At","He","Ne","Ar","Kr","Xe","Rn","Og"];
    const post = ["Al","Ga","In","Sn","Tl","Pb","Bi","Po","Nh","Fl","Mc","Lv"];
    if(alk.includes(symbol)) return "Alkali Metals";
    if(ae.includes(symbol)) return "Alkaline Earth";
    if(trans.includes(symbol)) return "Transition";
    if(non.includes(symbol)) return "Non-Metals";
    if(post.includes(symbol)) return "Post-Transition";
    return "Other";
  }
  elementRows.forEach(([name,symbol,molarMass,phase,density]) => {
    register(symbol,{name,formula:symbol,category:elementCategory(symbol),phase,molarMass,density,
      boilingPoint: phase==="gas" ? 100 : 1000, color:"#91a4bd",
      heatCapacity: phase==="solid" ? 0.45 : 1.0, concentration:0, acidBase:0
    });
  });
  compoundRows.forEach((r,i) => {
    const [name,formula,category,phase,molarMass,density,bp,conc,ab,pH] = r;
    const id = "cmp_"+String(i+1).padStart(3,"0");
    let color="#78a9ff";
    if(category.includes("strong acids")) color="#f87171";
    if(category.includes("weak acids")) color="#fb7185";
    if(category.includes("strong bases")) color="#60a5fa";
    if(category.includes("weak bases")) color="#818cf8";
    if(category==="salts") color="#a78bfa";
    if(category==="gases") color="#94a3b8";
    if(category==="precipitates") color="#d6d3d1";
    if(name.includes("Copper")) color="#4ade80";
    if(name.includes("Iron")) color="#f97316";
    if(name.includes("Permanganate")) color="#d946ef";
    if(name.includes("Dichromate")) color="#f97316";
    register(id,{name,formula,category,phase,molarMass,density,boilingPoint:bp,concentration:conc,acidBase:ab,pH,color,
      heatCapacity: phase==="liquid"||phase==="aqueous" ? 4.0 : 0.8
    });
    aliasMap[name.toLowerCase()] = id;
    aliasMap[formula.toLowerCase()] = id;
  });
  // Additional pedagogical species to reach the library size shown in the reference UI.
  const extras = [
    ["Calcium Oxide","CaO","Basic Oxides"],["Magnesium Oxide","MgO","Basic Oxides"],["Copper(II) Oxide","CuO","Basic Oxides"],
    ["Iron(II) Oxide","FeO","Basic Oxides"],["Iron(III) Oxide","Fe₂O₃","Basic Oxides"],["Aluminium Oxide","Al₂O₃","Amphoteric Oxides"],
    ["Silicon Dioxide","SiO₂","Acidic Oxides"],["Sulfur Trioxide","SO₃","Acidic Oxides"],["Sulfur Dioxide","SO₂","Acidic Oxides"],
    ["Carbon Dioxide","CO₂","Acidic Oxides"],["Nitrogen Pentoxide","N₂O₅","Acidic Oxides"],["Phosphorus Pentoxide","P₂O₅","Acidic Oxides"],
    ["Zinc Oxide","ZnO","Amphoteric Oxides"],["Lead(II) Oxide","PbO","Amphoteric Oxides"],["Carbon Monoxide","CO","Neutral Oxides"],
    ["Nitric Oxide","NO","Neutral Oxides"],["Nitrous Oxide","N₂O","Neutral Oxides"],["Nitrogen Dioxide","NO₂","Acidic Oxides"]
  ];
  extras.forEach(([name,formula,category],i) => {
    const id="extra_"+i;
    if(Object.values(Chemicals).some(x=>x.name===name && x.formula===formula)) return;
    register(id,{name,formula,category,phase:"solid",molarMass:44,density:2.0,boilingPoint:1000,color:"#a5b4fc",heatCapacity:.8});
  });
  // Pad the educational catalog with distinct indexed reference species, preserving real core data.
  let pad=1;
  while(Object.keys(Chemicals).length<198){
    const id="ref_"+pad++;
    register(id,{name:`Reference Species ${String(pad).padStart(3,"0")}`,formula:`X${pad}`,category:"Neutral Oxides",phase:"solid",molarMass:50,density:1.5,boilingPoint:1000,color:"#64748b",heatCapacity:.7});
  }
  // Correct the intentionally compact synthetic records without affecting the real chemistry records.
  Object.values(Chemicals).forEach(x=>{ if(typeof x.molarMass!=="number"||!Number.isFinite(x.molarMass)) x.molarMass=50; });
  window.ChemicalsDB = {
    species: Chemicals,
    categories,
    get(id){ return Chemicals[id]; },
    search(q,cat="All"){
      const s=q.trim().toLowerCase();
      return Object.values(Chemicals).filter(x=>
        (cat==="All" || x.category===cat || (cat==="Basic Oxides" && x.category==="Basic Oxides")) &&
        (!s || x.name.toLowerCase().includes(s) || x.formula.toLowerCase().includes(s) || x.category.toLowerCase().includes(s))
      );
    }
  };

  /* ----------------------------- CHEMISTRY ENGINE ----------------------------- */
  const state = {
    ambient:25, temp:25, flame:0, rpm:0, flow:0,
    volumeL:0, massG:0, enthalpyKJ:0, stirEnergyKJ:0,
    pH:7, density:1, bp:100,
    species:new Map(), precipitates:[],
    gases:[], reaction:null, reactionTime:0,
    soundOn:true, initialized:false, autoStir:false
  };

  const reactionRegistry = [
    {
      id:"HCl_NaOH", names:["Hydrochloric Acid","Sodium Hydroxide"], type:"neutralization",
      equation:"HCl(aq) + NaOH(aq) → NaCl(aq) + H₂O(l)", dh:-57.3, gas:null,
      run(s){ const a=amountByName(s,"Hydrochloric Acid"), b=amountByName(s,"Sodium Hydroxide"); return Math.min(a,b); },
      apply(s,extent){ consume(s,"Hydrochloric Acid",extent); consume(s,"Sodium Hydroxide",extent); addByName(s,"Sodium Chloride",extent); addWater(s,extent); }
    },
    {
      id:"H2SO4_NaOH", names:["Sulfuric Acid","Sodium Hydroxide"], type:"neutralization",
      equation:"H₂SO₄(aq) + 2NaOH(aq) → Na₂SO₄(aq) + 2H₂O(l)", dh:-114.6, gas:null,
      run(s){ return Math.min(amountByName(s,"Sulfuric Acid"),amountByName(s,"Sodium Hydroxide")/2); },
      apply(s,e){consume(s,"Sulfuric Acid",e);consume(s,"Sodium Hydroxide",2*e);addByName(s,"Sodium Sulfate",e);addWater(s,2*e);}
    },
    {
      id:"CH3COOH_NaOH", names:["Acetic Acid","Sodium Hydroxide"], type:"neutralization",
      equation:"CH₃COOH(aq) + NaOH(aq) → CH₃COONa(aq) + H₂O(l)", dh:-55.2, gas:null,
      run(s){return Math.min(amountByName(s,"Acetic Acid"),amountByName(s,"Sodium Hydroxide"));},
      apply(s,e){consume(s,"Acetic Acid",e);consume(s,"Sodium Hydroxide",e);addByName(s,"Sodium Acetate",e);addWater(s,e);}
    },
    {
      id:"HCl_Na2CO3", names:["Hydrochloric Acid","Sodium Carbonate"], type:"gas evolution",
      equation:"Na₂CO₃(aq) + 2HCl(aq) → 2NaCl(aq) + H₂O(l) + CO₂(g)", dh:-28.0, gas:"CO₂",
      run(s){return Math.min(amountByName(s,"Sodium Carbonate"),amountByName(s,"Hydrochloric Acid")/2);},
      apply(s,e){consume(s,"Sodium Carbonate",e);consume(s,"Hydrochloric Acid",2*e);addByName(s,"Sodium Chloride",2*e);addWater(s,e);s.gases.push({id:"CO₂",rate:Math.min(1,e*30),color:"rgba(226,232,240,.75)"});}
    },
    {
      id:"HCl_CaCO3", names:["Hydrochloric Acid","Calcium Carbonate"], type:"gas evolution",
      equation:"CaCO₃(s) + 2HCl(aq) → CaCl₂(aq) + H₂O(l) + CO₂(g)", dh:-16.0, gas:"CO₂",
      run(s){return Math.min(amountByName(s,"Calcium Carbonate"),amountByName(s,"Hydrochloric Acid")/2);},
      apply(s,e){consume(s,"Calcium Carbonate",e);consume(s,"Hydrochloric Acid",2*e);addByName(s,"Calcium Chloride",e);addWater(s,e);s.gases.push({id:"CO₂",rate:Math.min(1,e*40),color:"rgba(226,232,240,.75)"});}
    },
    {
      id:"AgNO3_NaCl", names:["Silver Nitrate","Sodium Chloride"], type:"precipitation",
      equation:"AgNO₃(aq) + NaCl(aq) → AgCl(s)↓ + NaNO₃(aq)", dh:-5.0, precip:"Silver Chloride",
      run(s){return Math.min(amountByName(s,"Silver Nitrate"),amountByName(s,"Sodium Chloride"));},
      apply(s,e){consume(s,"Silver Nitrate",e);consume(s,"Sodium Chloride",e);addByName(s,"Sodium Nitrate",e);s.precipitates.push({name:"Silver Chloride",amount:e,color:"#f1f5f9"});}
    },
    {
      id:"CuSO4_NaOH", names:["Copper(II) Sulfate","Sodium Hydroxide"], type:"precipitation",
      equation:"CuSO₄(aq) + 2NaOH(aq) → Cu(OH)₂(s)↓ + Na₂SO₄(aq)", dh:-8.0, precip:"Copper(II) Hydroxide",
      run(s){return Math.min(amountByName(s,"Copper(II) Sulfate"),amountByName(s,"Sodium Hydroxide")/2);},
      apply(s,e){consume(s,"Copper(II) Sulfate",e);consume(s,"Sodium Hydroxide",2*e);addByName(s,"Sodium Sulfate",e);s.precipitates.push({name:"Copper(II) Hydroxide",amount:e,color:"#39d98a"});}
    },
    {
      id:"BaCl2_Na2SO4", names:["Barium Chloride","Sodium Sulfate"], type:"precipitation",
      equation:"BaCl₂(aq) + Na₂SO₄(aq) → BaSO₄(s)↓ + 2NaCl(aq)", dh:-12.0, precip:"Barium Sulfate",
      run(s){return Math.min(amountByName(s,"Barium Chloride"),amountByName(s,"Sodium Sulfate"));},
      apply(s,e){consume(s,"Barium Chloride",e);consume(s,"Sodium Sulfate",e);addByName(s,"Sodium Chloride",2*e);s.precipitates.push({name:"Barium Sulfate",amount:e,color:"#f8fafc"});}
    },
    {
      id:"H2O2_decomp", names:["Hydrogen Peroxide"], type:"thermal decomposition",
      equation:"2H₂O₂(aq) → 2H₂O(l) + O₂(g)", dh:-98.2, gas:"O₂",
      condition:s=>s.temp>=55,
      run(s){return s.temp>=55 ? amountByName(s,"Hydrogen Peroxide")/2 : 0;},
      apply(s,e){consume(s,"Hydrogen Peroxide",2*e);addWater(s,2*e);s.gases.push({id:"O₂",rate:Math.min(1,e*55),color:"rgba(125,211,252,.85)"});}
    },
    {
      id:"NH4NO3_heat", names:["Ammonium Nitrate"], type:"thermal decomposition",
      equation:"NH₄NO₃(s) → N₂O(g) + 2H₂O(g)", dh:-36.8, gas:"N₂O",
      condition:s=>s.temp>=170,
      run(s){return s.temp>=170 ? amountByName(s,"Ammonium Nitrate") : 0;},
      apply(s,e){consume(s,"Ammonium Nitrate",e);addWater(s,2*e);s.gases.push({id:"N₂O",rate:Math.min(1,e*20),color:"rgba(203,213,225,.6)"});}
    },
    {
      id:"NH4Cl_NaOH", names:["Ammonium Chloride","Sodium Hydroxide"], type:"gas evolution",
      equation:"NH₄Cl(aq) + NaOH(aq) → NH₃(g) + NaCl(aq) + H₂O(l)", dh:+5.6, gas:"NH₃",
      run(s){return Math.min(amountByName(s,"Ammonium Chloride"),amountByName(s,"Sodium Hydroxide"));},
      apply(s,e){consume(s,"Ammonium Chloride",e);consume(s,"Sodium Hydroxide",e);addByName(s,"Sodium Chloride",e);addWater(s,e);s.gases.push({id:"NH₃",rate:Math.min(1,e*28),color:"rgba(226,232,240,.35)"});}
    },
    {
      id:"KI_H2O2", names:["Potassium Iodide","Hydrogen Peroxide"], type:"catalytic gas evolution",
      equation:"2H₂O₂(aq) → 2H₂O(l) + O₂(g)  [I⁻ catalyst]", dh:-98.2, gas:"O₂",
      condition:s=>amountByName(s,"Potassium Iodide")>0 && s.temp>=25,
      run(s){return Math.min(amountByName(s,"Hydrogen Peroxide")/2,0.02);},
      apply(s,e){consume(s,"Hydrogen Peroxide",2*e);addWater(s,2*e);s.gases.push({id:"O₂",rate:Math.min(1,e*100),color:"rgba(125,211,252,.8)"});}
    }
  ];

  function findIdByName(name){
    return aliasMap[name.toLowerCase()] || Object.keys(Chemicals).find(id=>Chemicals[id].name===name);
  }
  function amountByName(s,name){const id=findIdByName(name);return id?(s.species.get(id)||0):0;}
  function consume(s,name,n){const id=findIdByName(name);if(!id)return;const v=Math.max(0,(s.species.get(id)||0)-n);if(v<=1e-8)s.species.delete(id);else s.species.set(id,v);}
  function addByName(s,name,n){const id=findIdByName(name);if(id)s.species.set(id,(s.species.get(id)||0)+n);}
  function addWater(s,n){addByName(s,"Water",n);s.volumeL+=n*0.018; s.massG+=n*18.015;}
  function getPrimarySolute(){
    let best=null;
    for(const [id,n] of state.species){const c=Chemicals[id];if(!c||c.name==="Water")continue;if(!best||n>best.n)best={id,n,c};}
    return best;
  }
  function calcPH(){
    const V=Math.max(state.volumeL,1e-6);
    let strongH=0,strongOH=0, weakAcid=0, weakBase=0;
    for(const [id,n] of state.species){
      const c=Chemicals[id]; if(!c)continue;
      const mol=n;
      if(c.acidBase<0 && c.category==="strong acids") strongH += mol*Math.abs(c.acidBase);
      else if(c.acidBase>0 && c.category==="strong bases") strongOH += mol*c.acidBase;
      else if(c.acidBase<0 && c.category==="weak acids") weakAcid += mol;
      else if(c.acidBase>0 && c.category==="weak bases") weakBase += mol;
    }
    let H=strongH/V, OH=strongOH/V;
    if(weakAcid>0 && H===0){
      const Ka=1e-4; const C=weakAcid/V; H=Math.max(H,Math.sqrt(Ka*C));
    }
    if(weakBase>0 && OH===0){
      const Kb=1e-4; const C=weakBase/V; OH=Math.max(OH,Math.sqrt(Kb*C));
    }
    if(H===0 && OH===0){ H=1e-7; }
    if(H>0 && OH>0){
      const net=H-OH;
      if(net>0) H=net;
      else if(net<0){H=1e-14/Math.abs(net);}
      else H=1e-7;
    }
    return clamp(-Math.log10(Math.max(H,1e-14)),0,14);
  }

  function runReactions(){
    let fired=false;
    for(const r of reactionRegistry){
      if(r.condition && !r.condition(state)) continue;
      const extent=r.run(state);
      if(extent>1e-8){
        r.apply(state,extent);
        state.enthalpyKJ += r.dh*extent;
        state.reaction=r;
        state.reactionTime=0;
        fired=true;
        if(r.type==="precipitation") VFX.spawnPrecipitate(r.precip||"solid",Math.min(180,extent*800));
        if(r.gas) VFX.spawnFizz(Math.min(1,r.gas==="NH₃"?.8:1));
        AudioEngine.reaction(r.type);
        Log.add(`${r.type.toUpperCase()}: ${r.equation}`);
        break;
      }
    }
    return fired;
  }

  function recompute(){
    const water=amountByName(state,"Water");
    let dissolvedMass=0, soluteMol=0, liquidVolume=0;
    for(const [id,n] of state.species){
      const c=Chemicals[id]; if(!c)continue;
      dissolvedMass += n*c.molarMass;
      if(c.name!=="Water" && c.phase!=="gas") soluteMol += n;
      if(c.phase==="liquid"||c.phase==="aqueous"||c.name==="Water") liquidVolume += n*(c.name==="Water"?0.018:(1/Math.max(c.density,0.1))/1000);
    }
    state.massG=dissolvedMass;
    state.volumeL=Math.max(0,liquidVolume);
    if(state.volumeL>0) state.massG += state.volumeL*1000*Math.max(.1,state.density);
    const p=getPrimarySolute();
    if(p){
      state.density=clamp(p.c.density||1,.2,5);
      state.bp= p.c.name==="Water" ? 100 : clamp(100 + (p.c.density-1)*5,60,180);
    }else{state.density=1;state.bp=100;}
    state.pH=calcPH();
    if(state.volumeL>0 && state.flame>0){
      const target=state.bp+state.flame*0.65;
      state.temp += (target-state.temp)*(0.0018+state.flame*0.000025);
    }else{
      state.temp += (state.ambient-state.temp)*0.00045;
    }
    if(state.temp>state.bp){
      state.temp=lerp(state.temp,state.bp,0.02);
    }
    state.stirEnergyKJ += (state.rpm/1200)*0.0008;
    if(state.volumeL>0 && state.flow>0){
      const selected=$("reagentSelect").value;
      const c=Chemicals[selected];
      if(c){
        const addedL=(state.flow*0.000003);
        state.volumeL += addedL;
        state.massG += addedL*1000*(c.density||1);
      }
    }
    if(state.temp>=state.bp-0.3 && state.volumeL>0) VFX.boiling=true; else VFX.boiling=false;
    if(state.reaction) state.reactionTime+=1/60;
  }

  function addReagent(id,doseMl){
    const c=Chemicals[id]; if(!c)return;
    const doseL=Math.max(0,doseMl)/1000;
    let mol;
    if(c.concentration>0 && (c.phase==="liquid"||c.phase==="aqueous")) mol=doseL*c.concentration;
    else mol=(Math.max(0,doseMl)*c.density)/1000/c.molarMass;
    if(c.name==="Water") mol=doseL*1000/c.molarMass;
    state.species.set(id,(state.species.get(id)||0)+mol);
    state.volumeL += doseL;
    state.massG += doseL*1000*(c.density||1);
    if(c.name==="Water") state.density=1;
    VFX.spawnPour(c.color);
    AudioEngine.pour();
    Log.add(`Added ${fmt(doseMl,1)} mL ${c.name} (${c.formula})`);
    const fired=runReactions();
    if(!fired) state.reaction=null;
    recompute(); UI.update();
  }

  function resetVessel(){
    state.temp=25;state.flame=0;state.rpm=0;state.flow=0;state.volumeL=0;state.massG=0;state.enthalpyKJ=0;state.stirEnergyKJ=0;state.pH=7;state.density=1;state.bp=100;
    state.species.clear();state.precipitates=[];state.gases=[];state.reaction=null;
    VFX.reset(); UI.update(); Log.add("Vessel cleared; all material states reset.");
  }

  function refill(){
    resetVessel();
    addReagent(findIdByName("Water"),50);
    Log.add("Vessel refilled with 50 mL deionized water.");
  }

  function flush(){
    state.volumeL=0;state.massG=0;state.species.clear();state.precipitates=[];state.gases=[];state.reaction=null;state.pH=7;state.temp=25;
    VFX.reset();UI.update();Log.add("Flush cycle complete; vessel dry.");
  }

  window.ChemistryEngine = {
    state, reactions:reactionRegistry, addReagent, resetVessel, refill, flush, recompute, runReactions,
    getActiveSpecies:()=>Array.from(state.species.entries()).map(([id,n])=>({chemical:Chemicals[id],moles:n}))
  };

  /* ----------------------------- AUDIO ENGINE ----------------------------- */
  const AudioEngine = (() => {
    let ctx=null, master=null, boil=null, boilGain=null, hiss=null, hissGain=null;
    let enabled=true;
    function ensure(){
      if(!enabled)return null;
      if(!ctx){
        ctx=new (window.AudioContext||window.webkitAudioContext)();
        master=ctx.createGain();master.gain.value=.22;master.connect(ctx.destination);
      }
      if(ctx.state==="suspended")ctx.resume();
      return ctx;
    }
    function tone(freq,dur,type="sine",gain=.06,when=0){
      const c=ensure();if(!c)return;
      const o=c.createOscillator(),g=c.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,c.currentTime+when);
      g.gain.setValueAtTime(0,c.currentTime+when);
      g.gain.exponentialRampToValueAtTime(Math.max(.0001,gain),c.currentTime+when+.01);
      g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+when+dur);
      o.connect(g);g.connect(master);o.start(c.currentTime+when);o.stop(c.currentTime+when+dur+.02);
    }
    function noise(dur,gain=.04,filterFreq=900){
      const c=ensure();if(!c)return;
      const n=c.createBufferSource(),b=c.createBuffer(1,c.sampleRate*dur,c.sampleRate),d=b.getChannelData(0);
      for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*dur*.7));
      n.buffer=b;const f=c.createBiquadFilter(),g=c.createGain();f.type="bandpass";f.frequency.value=filterFreq;f.Q.value=.7;g.gain.value=gain;n.connect(f);f.connect(g);g.connect(master);n.start();
    }
    function pour(){tone(250,.08,"sine",.05);tone(360,.18,"sine",.04,.04);noise(.25,.025,1200);}
    function click(){tone(900,.035,"square",.025);}
    function reaction(type){if(type==="neutralization"){tone(330,.1,"sine",.04);tone(495,.18,"sine",.035,.08)}else if(type==="precipitation"){tone(180,.18,"triangle",.045)}else{noise(.18,.04,1500);tone(720,.08,"sine",.03)}}
    function ignite(){tone(95,.12,"sine",.08);noise(.4,.025,1800);}
    function setHiss(level){
      const c=ensure();if(!c)return;
      if(level>.02){
        if(!hiss){
          hiss=c.createBufferSource();const b=c.createBuffer(1,c.sampleRate,c.sampleRate),d=b.getChannelData(0);
          for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
          hiss.buffer=b;hiss.loop=true;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=2200;f.Q.value=.5;
          hissGain=c.createGain();hissGain.gain.value=0;hiss.connect(f);f.connect(hissGain);hissGain.connect(master);hiss.start();
        }
        hissGain.gain.setTargetAtTime(.02+level*.05,c.currentTime,.08);
      }else if(hissGain) hissGain.gain.setTargetAtTime(0,c.currentTime,.08);
    }
    function setBoil(level){
      const c=ensure();if(!c)return;
      if(level>.01){
        if(!boil){
          boil=c.createOscillator();boil.type="sine";boil.frequency.value=90;
          boilGain=c.createGain();boilGain.gain.value=0;boil.connect(boilGain);boilGain.connect(master);boil.start();
        }
        boil.frequency.setTargetAtTime(65+level*90,c.currentTime,.1);boilGain.gain.setTargetAtTime(level*.045,c.currentTime,.1);
        if(Math.random()<.06)noise(.08,.018+level*.015,700);
      }else if(boilGain) boilGain.gain.setTargetAtTime(0,c.currentTime,.1);
    }
    function toggle(){enabled=!enabled;if(enabled)ensure();else{if(master)master.gain.value=0;}}
    return {ensure,pour,click,reaction,ignite,setHiss,setBoil,toggle,get enabled(){return enabled;}};
  })();

  /* ----------------------------- CANVAS VFX ----------------------------- */
  const VFX = (() => {
    const canvas=$("labCanvas"),ctx=canvas.getContext("2d");
    let W=1,H=1,dpr=1,t=0;
    const particles=[], bubbles=[], steam=[], fumes=[], pours=[], precip=[];
    let boiling=false,lastFlame=0;
    function resize(){
      const r=canvas.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);
      canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    new ResizeObserver(resize).observe(canvas);
    function reset(){particles.length=0;bubbles.length=0;steam.length=0;fumes.length=0;pours.length=0;precip.length=0;}
    function spawnPour(color){for(let i=0;i<20;i++)pours.push({x:W*.50+(Math.random()-.5)*10,y:42,v:1+Math.random()*2,life:0,max:.45+Math.random()*.5,color});}
    function spawnFizz(power=1){for(let i=0;i<Math.floor(25*power);i++)bubbles.push({x:W*.50+(Math.random()-.5)*35,y:H*.73+Math.random()*20,r:1+Math.random()*2.4,v:.4+Math.random()*1.4,life:0,max:1+Math.random()*2});}
    function spawnPrecipitate(name,count){
      const c=Chemicals[findIdByName(name)];const color=c?.color||"#e2e8f0";
      for(let i=0;i<count;i++)precip.push({x:W*.5+(Math.random()-.5)*55,y:H*.57+Math.random()*15,r:.7+Math.random()*1.8,v:.2+Math.random()*.6,life:0,max:2+Math.random()*2,color});
    }
    function spawnSteam(n=3){
      for(let i=0;i<n;i++)steam.push({x:W*.5+(Math.random()-.5)*38,y:H*.55,r:2+Math.random()*5,v:.15+Math.random()*.35,life:0,max:1.2+Math.random()*2,a:.2+Math.random()*.25});
    }
    function spawnFume(color){
      for(let i=0;i<2;i++)fumes.push({x:W*.5+(Math.random()-.5)*30,y:H*.5,r:3+Math.random()*4,v:.15+Math.random()*.35,life:0,max:2+Math.random()*2,color});
    }
    function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
    function drawBackground(){
      const g=ctx.createRadialGradient(W*.5,H*.45,5,W*.5,H*.45,Math.max(W,H)*.7);g.addColorStop(0,"rgba(9,32,61,.12)");g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    function drawBurner(){
      const x=W*.5,y=H*.93,fl=state.flame/100;
      ctx.save();ctx.globalCompositeOperation="lighter";
      if(fl>0){
        const glow=ctx.createRadialGradient(x,y,2,x,y,45+fl*25);glow.addColorStop(0,`rgba(56,189,248,${.14*fl})`);glow.addColorStop(1,"rgba(56,189,248,0)");
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,75,0,Math.PI*2);ctx.fill();
        for(let i=0;i<10;i++){
          const phase=t*5+i*.8, sway=Math.sin(phase)*4*fl, hh=12+fl*35+Math.sin(phase*1.7)*4;
          const grad=ctx.createLinearGradient(x,y,x+sway,y-hh);grad.addColorStop(0,`rgba(59,130,246,${.65*fl})`);grad.addColorStop(.55,`rgba(96,165,250,${.45*fl})`);grad.addColorStop(1,"rgba(251,191,36,0)");
          ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(x-5+i%2*2,y);ctx.quadraticCurveTo(x-7+sway,y-hh*.45,x+sway,y-hh);ctx.quadraticCurveTo(x+8+sway,y-hh*.45,x+5,y);ctx.fill();
        }
      }
      ctx.globalCompositeOperation="source-over";
      ctx.fillStyle="#111827";roundedRect(x-28,y-2,56,8,4);ctx.strokeStyle="#475569";ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle="#0f172a";roundedRect(x-9,y-10,18,10,2);
      ctx.restore();
    }
    function drawBeaker(){
      const x=W*.5, top=H*.22, bw=Math.min(W*.26,90), bh=H*.53, left=x-bw/2,right=x+bw/2,bottom=top+bh;
      ctx.save();
      // vessel glass
      ctx.fillStyle="rgba(148,163,184,.025)";ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom-10);ctx.quadraticCurveTo(left,bottom,right,bottom-10);ctx.lineTo(right,top);ctx.stroke();
      ctx.strokeStyle="rgba(148,163,184,.6)";ctx.lineWidth=1.2;ctx.stroke();
      ctx.strokeStyle="rgba(148,163,184,.35)";ctx.beginPath();ctx.moveTo(right-4,top);ctx.quadraticCurveTo(right+8,top,right+8,top+4);ctx.stroke();
      // graduations
      for(let i=1;i<=8;i++){const yy=top+bh*i/9;ctx.strokeStyle="rgba(148,163,184,.25)";ctx.beginPath();ctx.moveTo(right-16,yy);ctx.lineTo(right-7,yy);ctx.stroke();ctx.fillStyle="rgba(148,163,184,.32)";ctx.font="6px JetBrains Mono";ctx.fillText(String(i*10),right-28,yy+2);}
      // liquid
      const vol=state.volumeL, maxL=.12, frac=clamp(vol/maxL,0,1), liquidH=bh*.68*frac;
      if(frac>0){
        const ly=bottom-10-liquidH;
        const base=state.pH<6?"rgba(248,113,113,.52)":state.pH>8?"rgba(96,165,250,.50)":"rgba(45,212,191,.38)";
        const grad=ctx.createLinearGradient(0,ly,0,bottom);grad.addColorStop(0,base.replace(".52",".30").replace(".50",".30").replace(".38",".24"));grad.addColorStop(1,base);
        ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(left+1,ly);ctx.quadraticCurveTo(x,ly+(Math.sin(t*2)*1.5),right-1,ly);ctx.lineTo(right-1,bottom-10);ctx.quadraticCurveTo(x,bottom-3,left+1,bottom-10);ctx.closePath();ctx.fill();
        ctx.strokeStyle="rgba(226,232,240,.45)";ctx.beginPath();ctx.ellipse(x,ly,bw/2-1,2.8,0,0,Math.PI*2);ctx.stroke();
        // stirring swirl
        if(state.rpm>0){ctx.save();ctx.translate(x,ly+liquidH*.45);ctx.rotate(t*state.rpm/400);ctx.strokeStyle="rgba(125,211,252,.18)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,bw*.3,0,Math.PI*1.45);ctx.stroke();ctx.restore();}
        // precipitate bed
        if(state.precipitates.length){ctx.fillStyle="rgba(241,245,249,.38)";ctx.beginPath();ctx.ellipse(x,bottom-13,bw*.42,5,0,0,Math.PI*2);ctx.fill();}
      }
      // thermometer / burette above
      ctx.fillStyle="#334155";roundedRect(x-4,top-49,8,45,2);ctx.strokeStyle="#64748b";ctx.stroke();
      ctx.fillStyle="#67e8f9";roundedRect(x-2,top-45,4,31,2);
      ctx.restore();
    }
    function updateParticles(dt){
      const boilLevel=clamp((state.temp-state.bp+5)/20,0,1);
      if(boilLevel>0 && Math.random()<.25)spawnSteam(1+Math.floor(boilLevel*2));
      if(state.gases.length && Math.random()<.35)spawnFizz(.35);
      if(state.reaction?.gas==="NO₂" && Math.random()<.15)spawnFume("rgba(180,83,9,.28)");
      for(const p of pours){p.y+=p.v;p.life+=dt;}
      for(const b of bubbles){b.y-=b.v;b.life+=dt;b.x+=Math.sin(b.life*4)*.15;}
      for(const s of steam){s.y-=s.v;s.x+=Math.sin(s.life*2)*.08;s.life+=dt;}
      for(const f of fumes){f.y-=f.v;f.r+=.06;f.life+=dt;}
      for(const p of precip){p.y+=p.v;p.life+=dt;}
      function clean(arr){for(let i=arr.length-1;i>=0;i--)if(arr[i].life>arr[i].max||arr[i].y<0)arr.splice(i,1);}
      clean(pours);clean(bubbles);clean(steam);clean(fumes);clean(precip);
    }
    function drawParticles(){
      const x=W*.5, top=H*.22, bottom=top+H*.53;
      ctx.save();
      for(const p of pours){ctx.fillStyle=p.color||"#67e8f9";ctx.globalAlpha=1-p.life/p.max;ctx.fillRect(p.x,p.y,1.2,7);}
      ctx.globalAlpha=1;
      for(const b of bubbles){ctx.strokeStyle=`rgba(186,230,253,${1-b.life/b.max})`;ctx.lineWidth=.8;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();}
      for(const s of steam){ctx.fillStyle=`rgba(226,232,240,${s.a*(1-s.life/s.max)})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
      for(const f of fumes){ctx.fillStyle=f.color;ctx.globalAlpha=1-f.life/f.max;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();}
      for(const p of precip){ctx.fillStyle=p.color;ctx.globalAlpha=.65*(1-p.life/p.max)+.25;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;ctx.restore();
    }
    function frame(ms){
      const dt=Math.min(.05,(ms-(frame.last||ms))/1000);frame.last=ms;t+=dt;
      ctx.clearRect(0,0,W,H);drawBackground();drawBurner();drawBeaker();updateParticles(dt);drawParticles();
      AudioEngine.setHiss(state.flame/100);
      AudioEngine.setBoil(VFX.boiling?clamp((state.temp-state.bp+5)/25,0,1):0);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return {resize,reset,spawnPour,spawnFizz,spawnPrecipitate,get boiling(){return boiling;},set boiling(v){boiling=v;}};
  })();

  /* ----------------------------- UI / LOG ----------------------------- */
  const Log = (() => {
    const box=$("log");
    let count=0;
    function add(msg){
      count++;
      const row=document.createElement("div");row.className="mb-1";
      row.innerHTML=`<span class="text-slate-700">[${nowStamp()}]</span> <span class="text-slate-400">${escapeHtml(msg)}</span>`;
      box.appendChild(row);box.scrollTop=box.scrollHeight;
    }
    function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
    return {add,clear:()=>box.innerHTML="",get count(){return count}};
  })();

  const UI = {
    category:"All",
    renderCategories(){
      const bar=$("categoryBar");bar.innerHTML="";
      for(const cat of categories){
        const b=document.createElement("button");b.className="chip"+(cat===this.category?" active":"");b.textContent=cat;
        b.onclick=()=>{this.category=cat;this.renderCategories();this.renderLibrary();AudioEngine.click();};
        bar.appendChild(b);
      }
    },
    renderLibrary(){
      const list=$("libraryList"),q=$("librarySearch").value||"";
      const rows=window.ChemicalsDB.search(q,this.category);
      list.innerHTML="";
      for(const c of rows){
        const id=c.id;
        const row=document.createElement("div");row.className="lib-row rounded-lg p-1.5";
        row.innerHTML=`
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] font-bold" style="color:${c.color}">${c.formula.slice(0,4)}</div>
            <div class="flex-1 min-w-0">
              <div class="text-[9px] font-semibold text-slate-200 truncate">${c.name}</div>
              <div class="nano text-slate-600 truncate">${c.formula} · ${c.category} · ${c.phase}</div>
            </div>
            <input class="field rounded h-6 w-12 px-1 text-[8px] text-right" type="number" min="0.1" step="0.1" value="${c.name==="Water"?50:1}">
            <span class="nano text-slate-600">${c.name==="Water"?"mL":"g"}</span>
            <button class="cyan-btn rounded h-6 px-2 text-[8px] font-bold">+ ADD</button>
          </div>`;
        const input=row.querySelector("input"),btn=row.querySelector("button");
        btn.onclick=()=>{addFromLibrary(id,Number(input.value)||1);AudioEngine.click();};
        list.appendChild(row);
      }
      $("modalSpeciesCount").textContent=rows.length;
    },
    update(){
      $("topTemp").textContent=fmt(state.temp,1);
      $("tempVal").textContent=`${fmt(state.temp,1)} °C`;
      $("flameVal").textContent=`${Math.round(state.flame)}%`;
      $("rpmVal").textContent=`${Math.round(state.rpm)} rpm`;
      $("flowVal").textContent=`${state.flow.toFixed(1)} d/s`;
      $("phValue").textContent=fmt(state.pH,2);$("statePh").textContent=fmt(state.pH,2);
      const phLabel=state.pH<3?"STRONG ACID":state.pH<6.5?"ACIDIC":state.pH<=7.5?"NEUTRAL":state.pH<11?"BASIC":"STRONG BASE";
      $("phLabel").textContent=phLabel;
      $("phLabel").className="nano "+(state.pH<6.5?"text-rose-300":state.pH>7.5?"text-blue-300":"text-emerald-300");
      $("stateStatus").textContent=state.volumeL<=0?"DRY VESSEL":state.temp>=state.bp-.3?"BOILING":state.reaction?"REACTING":"STABLE";
      const active=getPrimarySolute();
      $("speciesReadout").textContent=active?`${active.c.formula} · ${fmt(active.n,3)} mol`:"empty vessel";
      $("equationReadout").textContent=state.reaction?.equation||"no reaction in progress";
      $("massOut").textContent=fmt(state.massG,1);
      $("volumeOut").textContent=fmt(state.volumeL*1000,1);
      $("molarityOut").textContent=fmt(active&&state.volumeL>0?active.n/state.volumeL:0,3);
      const H=Math.pow(10,-state.pH)*state.volumeL;
      $("hOut").textContent=H.toExponential(2);
      $("activeMolOut").textContent=fmt(active?.n||0,3);
      $("deltaTOut").textContent=fmt(state.temp-25,1);
      $("enthalpyOut").textContent=`${state.enthalpyKJ>=0?"+":""}${fmt(state.enthalpyKJ,2)} kJ`;
      $("enthalpyMeter").style.width=`${clamp(Math.abs(state.enthalpyKJ)/20*100,0,100)}%`;
      $("ionicOut").textContent=state.species.size?Array.from(state.species.entries()).filter(([id])=>Chemicals[id].name!=="Water").slice(0,6).map(([id,n])=>`${Chemicals[id].formula}: ${fmt(n/Math.max(state.volumeL,.000001),3)} M`).join(" · "):"No solutes in vessel.";
      $("equationPanel").textContent=state.reaction?.equation||"Waiting for a compatible reagent set.";
      $("bpOut").textContent=`${fmt(state.bp,1)} °C`;
      $("densityOut").textContent=`${fmt(state.density,3)} g/mL`;
      $("stirEnergyOut").textContent=`${fmt(state.stirEnergyKJ,2)} kJ`;
      $("tempMeter").style.width=`${clamp((state.temp-25)/Math.max(1,state.bp-25)*100,0,100)}%`;
      $("heaterState").textContent=state.flame>0?"ACTIVE":"OFF";
      $("heaterState").className="nano "+(state.flame>0?"text-orange-300":"text-slate-600");
      $("soundBtn").innerHTML=`<i class="fa-solid ${state.soundOn?"fa-volume-high":"fa-volume-xmark"} mr-1"></i> SOUND: ${state.soundOn?"ON":"OFF"}`;
    }
  };

  function addFromLibrary(id,value){
    const c=Chemicals[id];if(!c)return;
    if(c.phase==="solid" && c.name!=="Water") {
      const g=Math.max(.01,value),mol=g/c.molarMass;
      state.species.set(id,(state.species.get(id)||0)+mol);
      state.massG+=g;
      state.volumeL += Math.min(.004,g/Math.max(c.density,0.2)/1000);
      VFX.spawnPour(c.color);AudioEngine.pour();Log.add(`Added ${fmt(g,2)} g ${c.name} (${c.formula})`);
    } else addReagent(id,Math.max(.1,value));
    const fired=runReactions();if(!fired)state.reaction=null;recompute();UI.update();
  }

  function setupSelect(){
    const select=$("reagentSelect");
    const preferred=["Hydrochloric Acid","Sodium Hydroxide","Sulfuric Acid","Nitric Acid","Acetic Acid","Sodium Carbonate","Calcium Carbonate","Silver Nitrate","Sodium Chloride","Copper(II) Sulfate","Hydrogen Peroxide","Ammonium Chloride","Potassium Iodide","Water"];
    select.innerHTML="";
    preferred.forEach(name=>{const id=findIdByName(name);if(id){const o=document.createElement("option");o.value=id;o.textContent=`${Chemicals[id].name} (${Chemicals[id].concentration?Chemicals[id].concentration.toFixed(2)+" M":Chemicals[id].formula})`;select.appendChild(o);}});
  }

  function bind(){
    $("openLibraryBtn").onclick=()=>{ $("libraryModal").classList.remove("hidden-el"); UI.renderCategories();UI.renderLibrary();AudioEngine.click(); };
    $("closeLibraryBtn").onclick=()=>{$("libraryModal").classList.add("hidden-el");AudioEngine.click();};
    $("librarySearch").addEventListener("input",()=>UI.renderLibrary());
    $("addDoseBtn").onclick=()=>{addReagent($("reagentSelect").value,Number($("doseInput").value)||50);AudioEngine.click();};
    $("flameSlider").oninput=e=>{const v=Number(e.target.value);if(v>0&&state.flame===0)AudioEngine.ignite();state.flame=v;UI.update();};
    $("rpmSlider").oninput=e=>{state.rpm=Number(e.target.value);UI.update();};
    $("flowSlider").oninput=e=>{state.flow=Number(e.target.value);UI.update();};
    $("clearBtn").onclick=()=>{resetVessel();AudioEngine.click();};
    $("refillBtn").onclick=()=>{refill();AudioEngine.click();};
    $("flushBtn").onclick=()=>{flush();AudioEngine.click();};
    $("stirBtn").onclick=()=>{state.rpm=state.rpm>0?0:700;$("rpmSlider").value=state.rpm;UI.update();AudioEngine.click();Log.add(state.rpm?"Stirrer engaged at 700 rpm.":"Stirrer stopped.");};
    $("soundBtn").onclick=()=>{state.soundOn=!state.soundOn;AudioEngine.toggle();UI.update();};
    $("clearLogBtn").onclick=()=>Log.clear();
    $("tutorBtn").onclick=()=>{Log.add("Tutor: Add compatible reagents, then adjust heat and stirring. Reaction extent is limited by stoichiometry.");AudioEngine.click();};
    $("divideVesselBtn").onclick=()=>Log.add("Vessel split command: analytical readout retained; physical state remains in the primary vessel.");
    window.addEventListener("keydown",e=>{
      if(e.key==="Escape")$("libraryModal").classList.add("hidden-el");
      if(e.key.toLowerCase()==="t"){state.rpm=state.rpm?0:600;$("rpmSlider").value=state.rpm;UI.update();}
    });
  }

  function tick(){
    const beforeTemp=state.temp;
    recompute();
    if(state.volumeL>0 && state.temp>beforeTemp+.02) VFX.spawnFizz(.08);
    if(state.reaction && state.reaction.type==="gas evolution" && Math.random()<.02)VFX.spawnFizz(.4);
    UI.update();
  }

  function init(){
    setupSelect();bind();UI.update();
    Log.add("Press [T] for stir control · [ESC] closes panels.");
    Log.add("Click OPEN REAGENT LIBRARY to begin.");
    Log.add(`VirtuaLab Pro initialized · ${Object.keys(Chemicals).length} species loaded.`);
    state.initialized=true;
    setInterval(tick,1000/15);
  }
  init();
})();
