/* ============================================================================
 * VirtuaLab Pro — app.js
 * ----------------------------------------------------------------------------
 * DOM Event Controller · Telemetry Binder · Web Audio Procedural Synth
 * Author: VirtuaLab Pro Frontend Interaction Core
 * ----------------------------------------------------------------------------
 * RESPONSIBILITIES
 *   • Wire every mandated DOM control to the ChemistryEngine + CanvasRenderer
 *   • Populate #reagentModal from window.ChemicalsDB dynamically
 *   • Bind #flameSlider / #stirrerSlider / #titrationSlider live
 *   • Render #tempDisplay / #phDisplay / #massDisplay / #volumeDisplay /
 *     #molarityDisplay / #formulaBanner / #activeSpeciesList / #logTerminal
 *   • Procedural Web Audio synth: click, burner hiss, boiling bubbles,
 *     gas fizz, explosive detonation, liquid pour, glass tap, indicator drip
 *
 * DEPENDS ON: window.ChemicalsDB, window.ChemistryEngine, window.CanvasRenderer
 * ==========================================================================*/

(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  /* ==========================================================================
   * 1. BOOT GUARD
   * ========================================================================*/
  if (typeof document === 'undefined') return;

  function ready(fn) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ==========================================================================
   * 2. WEB AUDIO PROCEDURAL SYNTH
   * ========================================================================*/
  const AudioEngine = (function () {
    let ctx = null;
    let master = null;
    let unlocked = false;
    const loops = {};

    function _ensure() {
      if (ctx) return true;
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        return true;
      } catch (e) {
        console.warn('[AudioEngine] init failed:', e);
        return false;
      }
    }

    function unlock() {
      if (!_ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    }

    /* ---------- fundamental voices ---------------------------------- */
    function click() {
      if (!_ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.06);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.08);
    }

    function waterPour(dur) {
      if (!_ensure()) return;
      dur = dur || 0.5;
      const t = ctx.currentTime;
      // filtered noise stream
      const buf = _noiseBuffer(dur);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 800;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(master);
      src.start(t); src.stop(t + dur);
    }

    function glassTap() {
      if (!_ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1650, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.14);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.18);
    }

    function indicatorDrip() {
      if (!_ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.22);
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.26);
    }

    function explosion() {
      if (!_ensure()) return;
      const t = ctx.currentTime;
      // low body thump
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.9);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 1.05);
      // noise blast
      const buf = _noiseBuffer(0.9);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      src.connect(hp).connect(ng).connect(master);
      src.start(t); src.stop(t + 0.9);
    }

    function gasFizz(dur) {
      if (!_ensure()) return;
      dur = dur || 1.5;
      const t = ctx.currentTime;
      const buf = _noiseBuffer(dur);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp).connect(g).connect(master);
      src.start(t); src.stop(t + dur);
    }

    /* ---------- sustained loops ------------------------------------- */
    function startBurnerHiss(intensity) {
      if (!_ensure()) return;
      stopBurnerHiss();
      const t = ctx.currentTime;
      const buf = _noiseBuffer(4, true);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      const g = ctx.createGain();
      const target = 0.02 + intensity * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(target, t + 0.2);
      src.connect(hp).connect(lp).connect(g).connect(master);
      src.start(t);
      loops.burner = { src, g, hp, lp };
    }

    function setBurnerIntensity(intensity) {
      if (!loops.burner) return;
      const t = ctx.currentTime;
      const target = 0.02 + Math.max(0, Math.min(1, intensity)) * 0.16;
      loops.burner.g.gain.cancelScheduledValues(t);
      loops.burner.g.gain.linearRampToValueAtTime(target, t + 0.15);
      loops.burner.hp.frequency.linearRampToValueAtTime(300 + intensity * 700, t + 0.15);
    }

    function stopBurnerHiss() {
      if (!loops.burner) return;
      try {
        const t = ctx.currentTime;
        loops.burner.g.gain.cancelScheduledValues(t);
        loops.burner.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        loops.burner.src.stop(t + 0.25);
      } catch (e) {}
      loops.burner = null;
    }

    function startBoilBubbles() {
      if (!_ensure() || loops.boil) return;
      const t = ctx.currentTime;
      const buf = _noiseBuffer(4, true);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 340;
      bp.Q.value = 1.0;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.6);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      loops.boil = { src, g, bp };
    }

    function stopBoilBubbles() {
      if (!loops.boil) return;
      try {
        const t = ctx.currentTime;
        loops.boil.g.gain.cancelScheduledValues(t);
        loops.boil.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        loops.boil.src.stop(t + 0.5);
      } catch (e) {}
      loops.boil = null;
    }

    function startStirWash(intensity) {
      if (!_ensure()) return;
      stopStirWash();
      const t = ctx.currentTime;
      const buf = _noiseBuffer(4, true);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500 + intensity * 900;
      const g = ctx.createGain();
      const target = 0.03 + intensity * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(target, t + 0.35);
      src.connect(lp).connect(g).connect(master);
      src.start(t);
      loops.stir = { src, g, lp };
    }

    function stopStirWash() {
      if (!loops.stir) return;
      try {
        const t = ctx.currentTime;
        loops.stir.g.gain.cancelScheduledValues(t);
        loops.stir.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        loops.stir.src.stop(t + 0.3);
      } catch (e) {}
      loops.stir = null;
    }

    /* ---------- noise buffer factory -------------------------------- */
    let _noiseCache = null;
    function _noiseBuffer(sec, cache) {
      if (cache && _noiseCache && _noiseCache.duration >= sec) {
        return _noiseCache;
      }
      const sr = ctx.sampleRate;
      const len = Math.max(1, Math.floor(sr * sec));
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      if (cache) _noiseCache = buf;
      return buf;
    }

    return {
      unlock, click, waterPour, glassTap, indicatorDrip,
      explosion, gasFizz,
      startBurnerHiss, setBurnerIntensity, stopBurnerHiss,
      startBoilBubbles, stopBoilBubbles,
      startStirWash, stopStirWash,
      get isUnlocked() { return unlocked; }
    };
  })();

  /* ==========================================================================
   * 3. DOM CACHE
   * ========================================================================*/
  const D = {};

  function cacheDom() {
    const ids = [
      'labCanvas',
      'openReagentModalBtn', 'closeReagentModalBtn', 'reagentModal',
      'clearVesselBtn', 'refillBtn', 'stirBtn', 'flushBtn',
      'addWaterBtn', 'waterInput',
      'flameSlider', 'stirrerSlider', 'titrationSlider',
      'formulaBanner', 'activeSpeciesList', 'logTerminal',
      'tempDisplay', 'phDisplay', 'massDisplay', 'volumeDisplay', 'molarityDisplay'
    ];
    for (const id of ids) D[id] = document.getElementById(id);
  }

  /* ==========================================================================
   * 4. LOG TERMINAL
   * ========================================================================*/
  const Log = (function () {
    const MAX_LINES = 200;
    const lines = [];
    let el = null;

    function init(terminalEl) {
      el = terminalEl;
      if (!el) return;
      info('VirtuaLab Pro v' + VERSION + ' online.');
      info('Bunsen burner, 500 mL beaker, full reagent shelf ready.');
    }

    function _write(level, msg) {
      const stamp = new Date().toLocaleTimeString([], { hour12: false });
      const entry = { level, stamp, msg };
      lines.push(entry);
      if (lines.length > MAX_LINES) lines.shift();
      if (!el) return;
      const cls = {
        info: 'text-slate-300',
        warn: 'text-amber-300',
        error: 'text-rose-400',
        success: 'text-emerald-300',
        reaction: 'text-cyan-300',
        heat: 'text-orange-300'
      }[level] || 'text-slate-300';
      const div = document.createElement('div');
      div.className = cls + ' leading-tight';
      div.innerHTML = `<span class="text-slate-500">[${stamp}]</span> ${escapeHtml(msg)}`;
      el.appendChild(div);
      while (el.childNodes.length > MAX_LINES) el.removeChild(el.firstChild);
      el.scrollTop = el.scrollHeight;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    return {
      init,
      info:    m => _write('info', m),
      warn:    m => _write('warn', m),
      error:   m => _write('error', m),
      success: m => _write('success', m),
      reaction:m => _write('reaction', m),
      heat:    m => _write('heat', m)
    };
  })();

  /* ==========================================================================
   * 5. TELEMETRY READOUT BINDING
   * ========================================================================*/
  const Telemetry = (function () {
    let lastPH = 7;

    function _phColor(pH) {
      if (pH < 3)  return 'text-rose-400';
      if (pH < 5)  return 'text-orange-400';
      if (pH < 6.5) return 'text-amber-300';
      if (pH < 7.5) return 'text-emerald-300';
      if (pH < 9)  return 'text-teal-300';
      if (pH < 11) return 'text-sky-400';
      return 'text-violet-400';
    }

    function _tempColor(T) {
      if (T < 30)  return 'text-sky-300';
      if (T < 60)  return 'text-emerald-300';
      if (T < 90)  return 'text-amber-300';
      if (T < 100) return 'text-orange-400';
      return 'text-rose-400';
    }

    function _setText(el, txt) {
      if (!el) return;
      if (el.textContent !== txt) el.textContent = txt;
    }

    function _setColor(el, cls) {
      if (!el) return;
      const colors = ['text-sky-300','text-emerald-300','text-amber-300',
                      'text-orange-400','text-rose-400','text-teal-300',
                      'text-violet-400'];
      for (const c of colors) el.classList.remove(c);
      el.classList.add(cls);
    }

    function update(engine) {
      if (!engine) return;
      const t = engine.getTelemetry();

      _setText(D.tempDisplay,     t.temperature.toFixed(1) + ' °C');
      _setColor(D.tempDisplay,    _tempColor(t.temperature));

      _setText(D.phDisplay,       t.pH.toFixed(2));
      _setColor(D.phDisplay,      _phColor(t.pH));

      _setText(D.massDisplay,     t.mass.toFixed(3) + ' g');
      _setText(D.volumeDisplay,   t.volume.toFixed(1) + ' mL');
      _setText(D.molarityDisplay, t.molarity.toFixed(4) + ' M');

      lastPH = t.pH;
    }

    function renderSpecies(engine) {
      const el = D.activeSpeciesList;
      if (!el) return;
      const species = engine.getActiveSpecies();
      if (!species.length) {
        el.innerHTML = '<li class="text-slate-500 italic text-xs">Vessel empty</li>';
        return;
      }
      const frag = document.createDocumentFragment();
      // sort by phase priority then moles desc
      const phaseOrder = { 'ion': 0, 'aq': 1, 'metal': 2, 'solid': 3,
                           'precipitate': 4, 'g': 5 };
      species.sort((a, b) => {
        const pa = phaseOrder[a.phase] ?? 9;
        const pb = phaseOrder[b.phase] ?? 9;
        if (pa !== pb) return pa - pb;
        return b.moles - a.moles;
      });
      for (const sp of species) {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-2 px-2 py-1 rounded ' +
                       'bg-slate-900/40 border border-slate-800 text-xs';
        const phaseLabel = {
          ion: 'aq·ion', aq: 'aq', metal: 's', solid: 's',
          precipitate: 'ppt', g: 'g'
        }[sp.phase] || sp.phase;
        const badge = {
          ion: 'bg-cyan-900/60 text-cyan-200',
          aq: 'bg-sky-900/60 text-sky-200',
          metal: 'bg-slate-700 text-slate-200',
          solid: 'bg-amber-900/60 text-amber-200',
          precipitate: 'bg-emerald-900/60 text-emerald-200',
          g: 'bg-fuchsia-900/60 text-fuchsia-200'
        }[sp.phase] || 'bg-slate-800 text-slate-300';
        li.innerHTML =
          `<span class="font-semibold text-slate-100">${escapeHtml(sp.formula)}</span>` +
          `<span class="ml-1 text-slate-400 text-[10px]">${sp.moles.toExponential(2)} mol</span>` +
          `<span class="ml-auto px-1.5 py-0.5 rounded ${badge} text-[10px] font-bold">${phaseLabel}</span>`;
        frag.appendChild(li);
      }
      el.innerHTML = '';
      el.appendChild(frag);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    function renderFormulaBanner(engine) {
      const el = D.formulaBanner;
      if (!el) return;
      const s = engine.state;
      // Priority: dominant species > last reaction > default
      if (s.lastReaction) {
        el.textContent = s.lastReaction;
        el.classList.add('text-cyan-200');
        return;
      }
      const parts = [];
      for (const [id, m] of Object.entries(s.molecular)) {
        if (m > 1e-8) {
          const sp = global.ChemicalsDB.get(id);
          if (sp) parts.push(sp.formula);
        }
      }
      for (const [ion, m] of Object.entries(s.ions)) {
        if (m > 1e-8) parts.push(ion);
      }
      if (s.waterVolume > 0 && parts.length === 0) {
        el.textContent = 'H₂O (pure solvent)';
      } else if (parts.length) {
        el.textContent = parts.slice(0, 4).join(' + ') +
                         (parts.length > 4 ? ' …' : '');
      } else {
        el.textContent = 'Vessel empty — add a reagent';
      }
    }

    return { update, renderSpecies, renderFormulaBanner };
  })();

  /* ==========================================================================
   * 6. REAGENT MODAL
   * ========================================================================*/
  const ReagentModal = (function () {
    let built = false;

    function build() {
      if (built || !D.reagentModal) return;
      const DB = global.ChemicalsDB;
      if (!DB) return;

      // Locate grid container inside modal
      const grid = D.reagentModal.querySelector('[data-reagent-grid]') ||
                   D.reagentModal.querySelector('.grid');
      if (!grid) {
        console.warn('[ReagentModal] no grid container found');
        return;
      }

      grid.innerHTML = '';

      // Group by category
      const groups = {};
      for (const sp of DB.list()) {
        if (sp.defaultState === 'gas') continue; // gases aren't a shelf reagent
        const cat = sp.category;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(sp);
      }

      const catOrder = ['water','strong_acid','weak_acid','strong_base','weak_base',
                        'salt','insoluble','alkali_metal','metal','oxidizer',
                        'indicator','organic'];
      const orderedCats = catOrder.filter(c => groups[c])
                        .concat(Object.keys(groups).filter(c => !catOrder.includes(c)));

      for (const cat of orderedCats) {
        const catMeta = DB.categories[cat] || { label: cat, color: '#64748b', icon: '•' };
        const hdr = document.createElement('div');
        hdr.className = 'col-span-full mt-2 mb-1 flex items-center gap-2 ' +
                        'text-[11px] uppercase tracking-wider font-bold ' +
                        'text-slate-400 border-b border-slate-800 pb-1';
        hdr.innerHTML = `<span style="color:${catMeta.color}">${catMeta.icon}</span>` +
                        `<span>${catMeta.label}</span>`;
        grid.appendChild(hdr);

        for (const sp of groups[cat]) {
          grid.appendChild(buildReagentCard(sp));
        }
      }

      built = true;
    }

    function buildReagentCard(sp) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className =
        'group flex flex-col items-start gap-1 p-2 rounded-lg border ' +
        'border-slate-700 bg-slate-800/60 hover:bg-slate-700/80 ' +
        'hover:border-cyan-500 transition-all text-left';
      card.dataset.reagentId = sp.id;

      const isSolid = sp.defaultState === 'solid' && !sp.ions;
      const unit = isSolid ? 'g' : 'mL';
      const defQty = isSolid ? (sp.molarMass > 100 ? 5 : 1) : 25;

      card.innerHTML =
        `<div class="flex items-center gap-2 w-full">` +
          `<span class="w-3 h-3 rounded-full flex-shrink-0 border border-slate-600" ` +
            `style="background:${sp.solidColor || sp.color || '#475569'}"></span>` +
          `<span class="text-xs font-bold text-slate-100 truncate">${escapeHtml(sp.formula)}</span>` +
        `</div>` +
        `<div class="text-[10px] text-slate-400 truncate w-full">${escapeHtml(sp.name)}</div>` +
        `<div class="flex items-center gap-1 w-full mt-1">` +
          `<input type="number" class="reagent-qty w-16 px-1 py-0.5 rounded ` +
            `bg-slate-800 text-slate-100 border border-slate-700 font-bold ` +
            `text-[10px] focus:outline-none focus:border-cyan-500" ` +
            `value="${defQty}" min="0.1" step="${isSolid ? 0.5 : 5}">` +
          `<span class="text-[10px] text-slate-400 font-mono">${unit}</span>` +
          `<span class="ml-auto text-[9px] text-cyan-500 opacity-0 ` +
            `group-hover:opacity-100 transition-opacity">+ ADD</span>` +
        `</div>`;

      // Click on card (not on input) adds reagent
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('reagent-qty')) return;
        const input = card.querySelector('.reagent-qty');
        const qty = parseFloat(input.value) || defQty;
        addReagent(sp.id, qty, unit);
      });

      // Enter in input triggers add
      const inp = card.querySelector('.reagent-qty');
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const qty = parseFloat(inp.value) || defQty;
          addReagent(sp.id, qty, unit);
        }
      });

      return card;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    function open() {
      build();
      if (!D.reagentModal) return;
      D.reagentModal.classList.remove('hidden');
      D.reagentModal.classList.add('flex');
      AudioEngine.click();
      Log.info('Reagent shelf opened.');
    }

    function close() {
      if (!D.reagentModal) return;
      D.reagentModal.classList.add('hidden');
      D.reagentModal.classList.remove('flex');
      AudioEngine.click();
    }

    return { build, open, close };
  })();

  /* ==========================================================================
   * 7. REAGENT DISPATCH
   * ========================================================================*/
  function addReagent(id, qty, unit) {
    const DB = global.ChemicalsDB;
    const engine = global.ChemistryEngine;
    if (!DB || !engine) return;

    const sp = DB.get(id);
    if (!sp) {
      Log.error('Unknown reagent: ' + id);
      return;
    }

    // Special handling before engine call — for logging + audio
    const prevWater = engine.state.waterVolume;
    const prevAlkali = engine.state.solids.filter(s =>
      DB.isAlkaliMetal(s.id) && s.moles > 1e-8).length;
    const prevGasCount = Object.keys(engine.state.gases).length;
    const prevBoil = engine.state.boiling;

    const result = engine.addChemical(id, qty);
    if (!result.ok) {
      Log.error('Add failed: ' + (result.error || 'unknown'));
      return;
    }

    // Audio feedback by reagent class
    if (sp.defaultState === 'liquid' || sp.defaultState === 'aqueous') {
      AudioEngine.waterPour(Math.min(0.8, 0.25 + qty / 100));
    } else if (sp.category === 'indicator') {
      AudioEngine.indicatorDrip();
    } else if (sp.category === 'alkali_metal') {
      AudioEngine.glassTap();
    } else {
      AudioEngine.glassTap();
    }

    // Log
    const unitLabel = result.unit || unit;
    Log.success(`Added ${qty} ${unitLabel} ${sp.name} (${sp.formula}) ` +
                `→ ${result.moles.toExponential(2)} mol.`);

    // Check for alkali runaway
    const postAlkaliInWater = engine.state.solids.filter(s =>
      DB.isAlkaliMetal(s.id) && s.moles > 1e-8).length;
    if (prevAlkali >= 0 && engine.state.waterVolume > 0 && sp.category === 'alkali_metal') {
      // Do nothing special here — engine.reaction events will fire
    }

    // New gas formed → fizz
    const postGasCount = Object.keys(engine.state.gases).length;
    if (postGasCount > prevGasCount) {
      AudioEngine.gasFizz(1.6);
    }

    // Boiling transition
    if (!prevBoil && engine.state.boiling) {
      AudioEngine.startBoilBubbles();
    }

    Telemetry.renderFormulaBanner(engine);
    Telemetry.renderSpecies(engine);
  }

  /* ==========================================================================
   * 8. TITRATION LOGIC (slider = volume of last-added acid/base)
   * ========================================================================*/
  const Titration = (function () {
    let lastReagentId = null;
    let lastApplied = 0;

    function setLastReagent(id) { lastReagentId = id; }

    function apply(ml) {
      const engine = global.ChemistryEngine;
      const DB = global.ChemicalsDB;
      if (!engine || !DB || !lastReagentId) return;

      const sp = DB.get(lastReagentId);
      if (!sp) return;

      const delta = ml - lastApplied;
      if (Math.abs(delta) < 0.05) return;

      if (delta > 0) {
        // add
        engine.addChemical(lastReagentId, delta);
        Log.info(`Titration: +${delta.toFixed(2)} mL ${sp.formula}`);
        AudioEngine.indicatorDrip();
      } else {
        // remove = subtract moles
        const add = -delta;
        const mass = add * (sp.density || 1);
        const moles = mass / sp.molarMass;
        // Subtract from ions/molecular
        if (sp.ions) {
          for (const [ion, n] of Object.entries(sp.ions)) {
            engine.state.ions[ion] = Math.max(0,
              (engine.state.ions[ion] || 0) - moles * n);
          }
        } else {
          engine.state.molecular[sp.id] = Math.max(0,
            (engine.state.molecular[sp.id] || 0) - moles);
        }
        Log.info(`Titration: −${add.toFixed(2)} mL ${sp.formula}`);
      }
      lastApplied = ml;
      engine.react();
    }

    function reset() {
      lastApplied = 0;
      if (D.titrationSlider) D.titrationSlider.value = 0;
    }

    return { setLastReagent, apply, reset };
  })();

  /* ==========================================================================
   * 9. EVENT WIRING
   * ========================================================================*/
  function wireEvents() {
    const engine = global.ChemistryEngine;
    const renderer = global.CanvasRenderer;

    /* ----- unlock audio on first interaction ----- */
    const unlockOnce = () => {
      AudioEngine.unlock();
      document.removeEventListener('pointerdown', unlockOnce);
    };
    document.addEventListener('pointerdown', unlockOnce);

    /* ----- reagent modal ----- */
    if (D.openReagentModalBtn) {
      D.openReagentModalBtn.addEventListener('click', () => {
        ReagentModal.open();
      });
    }
    if (D.closeReagentModalBtn) {
      D.closeReagentModalBtn.addEventListener('click', () => {
        ReagentModal.close();
      });
    }
    if (D.reagentModal) {
      // click on backdrop closes
      D.reagentModal.addEventListener('click', (e) => {
        if (e.target === D.reagentModal) ReagentModal.close();
      });
      // Esc closes
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' &&
            !D.reagentModal.classList.contains('hidden')) {
          ReagentModal.close();
        }
      });
    }

    /* ----- water input ----- */
    if (D.addWaterBtn) {
      D.addWaterBtn.addEventListener('click', () => {
        const ml = parseFloat(D.waterInput ? D.waterInput.value : '100') || 100;
        if (ml <= 0) { Log.warn('Water volume must be positive.'); return; }
        const prevBoil = engine.state.boiling;
        const res = engine.addWater(ml);
        if (!res.ok) { Log.error('Water add failed: ' + res.error); return; }
        AudioEngine.waterPour(Math.min(0.9, 0.2 + res.added / 200));
        Log.info(`Poured ${res.added.toFixed(1)} mL distilled water. ` +
                 `Vessel now ${engine.state.waterVolume.toFixed(1)} mL.`);
        if (!prevBoil && engine.state.boiling) AudioEngine.startBoilBubbles();
        Telemetry.renderFormulaBanner(engine);
        Telemetry.renderSpecies(engine);
      });
    }

    /* ----- clear / flush / refill ----- */
    if (D.clearVesselBtn) {
      D.clearVesselBtn.addEventListener('click', () => {
        AudioEngine.waterPour(0.5);
        AudioEngine.stopBoilBubbles();
        AudioEngine.stopBurnerHiss();
        AudioEngine.stopStirWash();
        engine.clearVessel();
        if (renderer) renderer.purgeParticles();
        Titration.reset();
        Log.warn('Vessel cleared — all contents purged.');
        Telemetry.renderFormulaBanner(engine);
        Telemetry.renderSpecies(engine);
        if (D.flameSlider) D.flameSlider.value = 0;
        if (D.stirrerSlider) D.stirrerSlider.value = 0;
      });
    }

    if (D.flushBtn) {
      D.flushBtn.addEventListener('click', () => {
        AudioEngine.waterPour(0.6);
        AudioEngine.stopBoilBubbles();
        AudioEngine.stopBurnerHiss();
        AudioEngine.stopStirWash();
        engine.flush();
        if (renderer) renderer.purgeParticles();
        Titration.reset();
        Log.warn('System flush — vessel returned to pure empty state.');
        Telemetry.renderFormulaBanner(engine);
        Telemetry.renderSpecies(engine);
        if (D.flameSlider) D.flameSlider.value = 0;
        if (D.stirrerSlider) D.stirrerSlider.value = 0;
      });
    }

    if (D.refillBtn) {
      D.refillBtn.addEventListener('click', () => {
        AudioEngine.waterPour(1.0);
        engine.refill();
        Log.info('Beaker refilled to 500 mL line.');
        Telemetry.renderFormulaBanner(engine);
        Telemetry.renderSpecies(engine);
      });
    }

    /* ----- stir button (momentary) ----- */
    if (D.stirBtn) {
      const stirHold = () => {
        engine.stir(1.0);
        AudioEngine.startStirWash(1.0);
        D.stirBtn.classList.add('ring-2', 'ring-cyan-400');
      };
      const stirRelease = () => {
        engine.stir(0);
        AudioEngine.stopStirWash();
        D.stirBtn.classList.remove('ring-2', 'ring-cyan-400');
      };
      D.stirBtn.addEventListener('pointerdown', stirHold);
      D.stirBtn.addEventListener('pointerup', stirRelease);
      D.stirBtn.addEventListener('pointerleave', stirRelease);
      D.stirBtn.addEventListener('pointercancel', stirRelease);
    }

    /* ----- flame slider ----- */
    if (D.flameSlider) {
      let lastLogged = -1;
      D.flameSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        engine.applyHeat(v);
        if (v > 0.02) {
          if (!AudioEngine.isUnlocked) return;
          // start or adjust burner hiss
          if (!window.__burnerActive) {
            AudioEngine.startBurnerHiss(v);
            window.__burnerActive = true;
          } else {
            AudioEngine.setBurnerIntensity(v);
          }
          // log transitions
          const band = Math.round(v * 4);
          if (band !== lastLogged) {
            const labels = ['off','gentle','medium','strong','roaring'];
            Log.heat(`Burner: ${labels[band]} (${(v*100).toFixed(0)}%).`);
            lastLogged = band;
          }
        } else {
          AudioEngine.stopBurnerHiss();
          window.__burnerActive = false;
          if (lastLogged !== 0) {
            Log.heat('Burner extinguished.');
            lastLogged = 0;
          }
        }
      });
    }

    /* ----- stirrer slider (continuous) ----- */
    if (D.stirrerSlider) {
      D.stirrerSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value) / 100;
        engine.stir(v);
        if (v > 0.02) AudioEngine.startStirWash(v);
        else AudioEngine.stopStirWash();
      });
    }

    /* ----- titration slider ----- */
    if (D.titrationSlider) {
      D.titrationSlider.addEventListener('input', (e) => {
        const ml = parseFloat(e.target.value);
        // Determine which reagent to titrate — highest-priority acid or base
        if (!Titration._lastReagent) {
          // pick the most concentrated acid/base currently in solution
          const s = engine.state;
          let best = null, bestMoles = 0;
          for (const [id, m] of Object.entries(s.molecular)) {
            const sp = global.ChemicalsDB.get(id);
            if (!sp) continue;
            if ((sp.isAcid || sp.isBase) && m > bestMoles) {
              bestMoles = m; best = id;
            }
          }
          for (const [ion, m] of Object.entries(s.ions)) {
            if ((ion === 'H+' || ion === 'OH-') && m > bestMoles) {
              bestMoles = m;
              best = ion === 'H+' ? 'hcl' : 'naoh';
            }
          }
          if (best) Titration.setLastReagent(best);
        }
        Titration.apply(ml);
        Telemetry.renderFormulaBanner(engine);
        Telemetry.renderSpecies(engine);
      });
    }

    /* ----- canvas click (tap beaker → subtle splash) ----- */
    if (D.labCanvas) {
      D.labCanvas.addEventListener('click', () => {
        AudioEngine.glassTap();
      });
    }
  }

  /* ==========================================================================
   * 10. ENGINE EVENT → UI HOOKS
   * ========================================================================*/
  function wireEngineEvents() {
    const engine = global.ChemistryEngine;
    const renderer = global.CanvasRenderer;
    if (!engine || !engine.on) return;

    engine.on((event, data) => {
      switch (event) {
        case 'reaction:alkali':
          AudioEngine.explosion();
          Log.reaction(`💥 Alkali metal detonation: ${data.metal.toUpperCase()}`);
          if (renderer) renderer.burstExplosion(undefined, undefined, '#fb923c');
          break;
        case 'reaction:precipitate':
          Log.reaction(`Precipitate formed: ${data.product} (${data.moles.toExponential(2)} mol)`);
          break;
        case 'reaction:neutralize':
          Log.reaction(`Neutralisation: H⁺ + OH⁻ → H₂O (ΔH = −57.3 kJ/mol)`);
          break;
        case 'reaction:metal-acid':
          Log.reaction(`Metal dissolution: ${data.metal.toUpperCase()} + H⁺ → H₂↑`);
          AudioEngine.gasFizz(1.4);
          break;
        case 'reaction:gas':
          Log.reaction(`Gas evolution: ${data.gas.toUpperCase()} (${data.moles.toExponential(2)} mol)`);
          AudioEngine.gasFizz(1.2);
          break;
        case 'reaction:displace':
          Log.reaction(`Single displacement: ${data.metal.toUpperCase()} + ${data.target}`);
          break;
        case 'vessel:cleared':
        case 'vessel:flushed':
          AudioEngine.stopBoilBubbles();
          break;
        case 'water:added':
          // triggered by addWater engine-side
          break;
        default:
          break;
      }
    });
  }

  /* ==========================================================================
   * 11. TICK LOOP (drives engine + telemetry)
   * ========================================================================*/
  let _tickHandle = null;
  let _boilingActive = false;
  let _lastReactionLog = '';
  let _reactionCooldown = 0;

  function startTick() {
    const engine = global.ChemistryEngine;
    if (!engine || _tickHandle) return;
    let last = performance.now();
    let telemetryAccum = 0;
    let speciesAccum = 0;
    const loop = (t) => {
      _tickHandle = requestAnimationFrame(loop);
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;

      engine.tick(dt);

      // Boiling transitions
      if (engine.state.boiling && !_boilingActive) {
        AudioEngine.startBoilBubbles();
        _boilingActive = true;
      } else if (!engine.state.boiling && _boilingActive) {
        AudioEngine.stopBoilBubbles();
        _boilingActive = false;
      }

      // Reaction log (throttled)
      _reactionCooldown -= dt;
      const lr = engine.state.lastReaction;
      if (lr && lr !== _lastReactionLog && _reactionCooldown <= 0) {
        // Only log interesting change
        _lastReactionLog = lr;
        _reactionCooldown = 1.2;
      }

      // Telemetry refresh ~10 Hz
      telemetryAccum += dt;
      if (telemetryAccum >= 0.1) {
        telemetryAccum = 0;
        Telemetry.update(engine);
      }

      // Species list refresh ~4 Hz
      speciesAccum += dt;
      if (speciesAccum >= 0.25) {
        speciesAccum = 0;
        Telemetry.renderSpecies(engine);
        Telemetry.renderFormulaBanner(engine);
      }
    };
    _tickHandle = requestAnimationFrame(loop);
  }

  /* ==========================================================================
   * 12. BOOT
   * ========================================================================*/
  ready(() => {
    cacheDom();

    // Log terminal
    Log.init(D.logTerminal);

    // Engine sanity
    if (!global.ChemicalsDB) {
      console.error('[app] ChemicalsDB missing');
      Log.error('Database failed to load — reagents unavailable.');
      return;
    }
    if (!global.ChemistryEngine) {
      console.error('[app] ChemistryEngine missing');
      Log.error('Engine failed to load.');
      return;
    }
    if (!global.CanvasRenderer) {
      console.warn('[app] CanvasRenderer missing');
      Log.warn('Canvas renderer unavailable.');
    }

    // Build reagent modal
    ReagentModal.build();

    // Wire everything
    wireEvents();
    wireEngineEvents();

    // Initial UI state
    Telemetry.update(global.ChemistryEngine);
    Telemetry.renderSpecies(global.ChemistryEngine);
    Telemetry.renderFormulaBanner(global.ChemistryEngine);

    // Start telemetry tick loop
    startTick();

    // Hide modal by default
    if (D.reagentModal) {
      D.reagentModal.classList.add('hidden');
      D.reagentModal.classList.remove('flex');
    }

    Log.success('VirtuaLab Pro ready. ' +
      `Loaded ${global.ChemicalsDB.list().length} reagent species.`);
  });

  /* ==========================================================================
   * 13. EXPORT (for debugging)
   * ========================================================================*/
  global.VirtuaLabApp = {
    VERSION,
    AudioEngine,
    Log,
    Telemetry,
    ReagentModal,
    Titration,
    addReagent
  };

  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[app v${VERSION}] Wire-up module loaded.`);
  }

})(typeof window !== 'undefined' ? window : globalThis);
