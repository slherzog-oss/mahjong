// App: verbindet Store, Rendering und Ereignisse.
import { createStore } from '../store/store.js';
import { defaultAdapter, requestPersistentStorage } from '../store/persistence.js';
import { renderPlayIdle, renderPlay, bonusToastName } from './render.js';
import { renderTabBar } from './tabbar.js';
import { renderActionSheet, renderRoundEnd } from './overlay.js';
import { renderSettingsTab, GAME_SPEEDS } from './settings.js';
import { renderGuide } from './guide.js';
import { renderCalculator, newCalcState, calcMeldKinds, calcMeldOpen, scoreManualHand, usedCount } from './calculator.js';
import { analyzeGame } from '../replay/analyzer.js';
import { lexiconById } from '../lexicon/hands.js';
import { parseKinds, kindOf } from '../core/tiles.js';
import { adviseDiscard, adviseClaim, explainDiscard, explainClaim, explainHints, explainWhy } from '../advisor/index.js';
import { t, setLanguage, setOverrides } from '../i18n/index.js';
import { renderTutorial } from './tutorial.js';
import { setRedFives } from './tiles.js';
import { defaultPresetFor } from '../core/presets.js';
import { createRuleSet } from '../core/rules.js';
import { playSound } from './sound.js';
import { pwa, onPwaChange, registerServiceWorker, applyUpdate, promptInstall, keepAwake, vibrate, isStandalone } from './pwa.js';
import { isUnlocked, tryUnlock, renderLock } from './lock.js';

const root = document.getElementById('app');

// Worker für Monte-Carlo (Gewinnchance); fällt ohne Worker-Unterstützung still aus.
const mc = { worker: null, key: null, result: null, pending: null, id: 0 };
const noWorker = new URLSearchParams(location.search).has('noworker');
try {
  if (noWorker) throw new Error('worker deaktiviert');
  mc.worker = new Worker(new URL('../analysis/worker.js', import.meta.url), { type: 'module' });
  mc.worker.onmessage = (ev) => {
    const { id, type, result } = ev.data;
    if (type !== 'mc' || id !== mc.pending) return;
    mc.pending = null;
    mc.result = result;
    render(store.getSnapshot());
  };
  mc.worker.onerror = (e) => { console.warn('Worker', e.message); mc.worker = null; };
} catch (e) {
  mc.worker = null;
}

function requestMonteCarlo(snap) {
  const { state, humanSeat } = snap;
  if (!mc.worker || !state || humanSeat < 0 || !snap.settings.showChance) return;
  if (!['discard', 'draw', 'claiming'].includes(state.phase)) return;
  const key = `${state.seed}:${state.handNumber}:${state.log.length}`;
  if (mc.key === key) return;
  mc.key = key;
  mc.result = null;
  mc.pending = ++mc.id;
  const { rng, ...plain } = state;
  mc.worker.postMessage({ id: mc.pending, type: 'mc', state: plain, seat: humanSeat, runs: 200 });
}
const store = createStore({ persistence: defaultAdapter() });
function applySettingsToI18n(settings) {
  setLanguage(settings.language);
  setOverrides({ playerNames: [t('you'), ...settings.playerNames] });
}
applySettingsToI18n(store.settings);
store.checkSave();
const ui = {
  tab: 'play',
  selected: null,
  legal: [],
  advice: null,
  tutorial: null,
  riichiMode: false,
  lexicon: { query: '', category: 'all', open: null, variant: null },
  guide: { section: null },
  calc: newCalcState(),
  formsOpen: false,
  showKinds: null,
  practice: null,
  analysis: { games: [], current: false, record: null, result: null, hand: null, decision: null },
  roundEndOpen: new Set(),
  roundEndKey: null,
  lockError: false,
};
let lastPhaseKey = '';
let unlocked = isUnlocked();

function applyTheme(settings) {
  const root2 = document.documentElement;
  if (settings.theme === 'system') delete root2.dataset.theme;
  else root2.dataset.theme = settings.theme;
}

function render(snap) {
  applySettingsToI18n(snap.settings);
  if (!unlocked) {
    applyTheme(snap.settings);
    root.innerHTML = renderLock(t, { error: ui.lockError });
    return;
  }
  const { state } = snap;
  document.body.classList.toggle('no-anim', !snap.settings.animations);
  applyTheme(snap.settings);
  ui.legal = state ? store.legalActions() : [];
  // Nichts zu entscheiden (nur Passen möglich): automatisch weiter, ohne Rückfrage.
  if (state && snap.humanToAct && state.phase === 'claiming' && ui.legal.length === 1 && ui.legal[0].type === 'pass' && ui.autoPassKey !== stateKey(state)) {
    ui.autoPassKey = stateKey(state);
    store.dispatch({ type: 'pass' });
    return;
  }
  // Auswahl und Empfehlung verfallen mit jedem Zug - vor der Anzeige/Auto-Empfehlung prüfen,
  // damit eine frische Empfehlung für den neuen Zug nicht sofort wieder verworfen wird.
  const phaseKey = state ? `${state.handNumber}:${state.turn}:${state.phase}:${state.log.length}` : '';
  if (phaseKey !== lastPhaseKey) {
    lastPhaseKey = phaseKey;
    if (!(state && state.phase === 'discard')) ui.selected = null;
    ui.advice = null;
    ui.riichiMode = false;
  }
  setRedFives(!!state && state.ruleSet.variant === 'riichi' && !!state.ruleSet.redFives);
  if (!ui.lexicon.variant) ui.lexicon.variant = snap.settings.rules.variant ?? 'classical';
  ui.pwa = { updateReady: pwa.updateReady, canInstall: !!pwa.installPrompt && !isStandalone(), version: pwa.version };

  let html;
  if (ui.tab === 'guide') html = renderGuide(ui, snap);
  else if (ui.tab === 'calculator') html = renderCalculator(ui, snap);
  else if (ui.tab === 'settings') html = renderSettingsTab(snap);
  else html = state ? renderPlay(snap, ui) : renderPlayIdle(snap);

  ui.mc = mc.key && state && mc.key === `${state.seed}:${state.handNumber}:${state.log.length}` ? mc.result : null;
  if (!Number.isInteger(ui.tutorial) && !snap.settings.tutorialDone && !state && ui.tab === 'play') ui.tutorial = 0;
  const tutorialOpen = Number.isInteger(ui.tutorial) && ui.tutorial >= 0;

  let overlay = '';
  if (ui.tab === 'play' && state) {
    if (state.phase === 'handOver' || state.phase === 'gameOver') {
      const reKey = `${state.handNumber}:${state.phase}:${state.log.length}`;
      if (ui.roundEndKey !== reKey) {
        ui.roundEndKey = reKey;
        ui.roundEndOpen = new Set();
        const winnerIdx = snap.lastScore?.sheets?.findIndex((s) => s?.winner) ?? -1;
        if (winnerIdx >= 0) ui.roundEndOpen.add(winnerIdx);
      }
      overlay = renderRoundEnd(snap, ui);
    } else if (snap.humanToAct && state.phase === 'claiming') {
      overlay = renderActionSheet(state, snap, ui.legal);
    }
  }

  // Aufgeklappte <details> (Erweiterte Regeln, FAQ, Mögliche Blätter) über den Neuaufbau hinweg offen halten
  const openDetails = [...root.querySelectorAll('details')].map((d) => d.open);
  root.innerHTML = renderBanner(ui.pwa) + '<div class="app-body">' + html + '</div>' + renderTabBar(ui.tab) + overlay + (tutorialOpen ? renderTutorial(ui.tutorial, snap.settings.rules.variant ?? 'classical') : '');
  root.querySelectorAll('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });
  requestMonteCarlo(snap);
  // Empfehlung automatisch nach jedem eigenen Zug, solange der Coach an ist
  if (snap.settings.assist && state && snap.humanToAct && ['discard', 'claiming'].includes(state.phase) && !ui.advice && ui.learnKey !== stateKey(state)) {
    ui.learnKey = stateKey(state);
    ui.formsOpen = true;
    advise();
  }
  const inHand = !!state && !['handOver', 'gameOver', 'idle'].includes(state.phase);
  pwa.wantAwake = inHand;
  keepAwake(inHand);
  if (state && snap.humanToAct && state.phase === 'claiming' && ui.lastVibrateKey !== stateKey(state)) {
    ui.lastVibrateKey = stateKey(state);
    if (snap.settings.haptics) vibrate(30);
    if (snap.settings.soundEffects) playSound('call');
  }
  if (state && ui.lastToastKey !== stateKey(state)) {
    ui.lastToastKey = stateKey(state);
    const last = state.log.at(-1);
    if (snap.settings.soundEffects) {
      if (last?.type === 'discard') playSound('discard');
      else if (last?.type === 'riichi') playSound('call');
      else if (last?.type === 'mahjong') playSound(last.seat === snap.humanSeat ? 'win' : 'lose');
      else if (['pung', 'chow', 'kong'].includes(last?.type)) playSound('claim');
    }
    if (last?.type === 'pung') showToast(t('toast.pung'));
    else if (last?.type === 'kong') showToast(t('toast.kong'));
    else if (last?.type === 'chow') showToast(t('toast.chow'));
    else if (last?.type === 'bonus') showToast(bonusToastName(kindOf(last.tile)));
    else if (last?.type === 'riichi') showToast(t('riichiDeclared'));
  }
  document.body.classList.toggle('in-game', !!state);
}

function stateKey(state) {
  return `${state.handNumber}:${state.log.length}`;
}

function renderBanner(p) {
  if (!p?.updateReady) return '';
  return `<div class="banner"><span>${t('updateReady')}</span><button class="btn small primary" data-action="apply-update">${t('reload')}</button></div>`;
}

store.subscribe(render);
onPwaChange(() => render(store.getSnapshot()));
registerServiceWorker();

async function attemptUnlock() {
  const input = root.querySelector('.lock-input');
  const ok = await tryUnlock(input?.value ?? '');
  if (ok) { unlocked = true; ui.lockError = false; }
  else { ui.lockError = true; if (input) input.value = ''; }
  render(store.getSnapshot());
}
root.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.closest('.lock-input')) attemptUnlock();
});

function discard(tile) {
  ui.selected = null;
  ui.advice = null;
  store.dispatch({ type: 'discard', tile });
}

function advise() {
  const snap = store.getSnapshot();
  const { state, humanSeat } = snap;
  if (!state) return;
  const legal = store.legalActions();
  if (state.phase === 'discard' && !legal.some((a) => a.type === 'mahjong')) {
    const adv = adviseDiscard(state, humanSeat, { target: state.players[humanSeat].target ?? null });
    ui.advice = {
      kind: adv.best.kind,
      dangerKinds: adv.options.filter((o) => o.penalty || (o.danger > 0.6 && adv.progress > 0.4)).map((o) => o.kind),
      lines: explainDiscard(adv),
      hints: explainHints(adv.hints),
      alternatives: adv.alternatives,
      best: adv.best,
      why: explainWhy(state, humanSeat, adv, 'discard'),
    };
  } else if (state.phase === 'claiming' || legal.some((a) => a.type === 'mahjong')) {
    const adv = state.phase === 'claiming' ? adviseClaim(state, humanSeat) : { action: { type: 'mahjong' }, reason: { key: 'mahjong' } };
    ui.advice = { lines: explainClaim(adv), hints: [], action: adv.action.type, why: explainWhy(state, humanSeat, adv, 'claim') };
  }
  render(store.getSnapshot());
}

let toastTimer = null;
function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 1800);
}

function openAnalysisTab(snap) {
  ui.tab = 'guide';
  ui.guide.section = 'analysis-list';
  ui.analysis.current = !!snap.state && snap.state.actions.length > 0 && snap.humanSeat >= 0;
  store.listArchive().then((games) => { ui.analysis.games = games; render(store.getSnapshot()); });
  render(store.getSnapshot());
}

function runAnalysis(record) {
  try {
    const result = analyzeGame(record, { seat: record.humanSeat >= 0 ? record.humanSeat : 0 });
    ui.analysis.record = record;
    ui.analysis.result = result;
    ui.analysis.hand = result.hands.at(-1)?.hand ?? null;
    ui.analysis.decision = null;
    ui.tab = 'guide';
    ui.guide.section = 'analysis';
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
  render(store.getSnapshot());
}

function currentCalcRuleSet(snap) {
  if (snap.state) return snap.state.ruleSet;
  return createRuleSet({ ...snap.settings.rules, rounds: snap.settings.rounds });
}

root.addEventListener('click', (ev) => {
  const tile = ev.target.closest('.tile.clickable');
  const btn = ev.target.closest('[data-action]');
  const snap = store.getSnapshot();

  if (ui.tab === 'play' && tile && snap.state?.phase === 'discard' && snap.humanToAct) {
    const id = Number(tile.dataset.id);
    try {
      if (ui.riichiMode) {
        const ok = ui.legal.some((a) => a.type === 'riichi' && kindOf(a.tile) === kindOf(id));
        if (ok) { ui.riichiMode = false; ui.selected = null; ui.advice = null; store.dispatch({ type: 'riichi', tile: id }); }
        else showToast(t('riichiHint'));
        return;
      }
      if (ui.selected === id) discard(id);
      else { ui.selected = id; render(snap); }
    } catch (e) {
      console.error(e);
      showToast(e.message);
    }
    return;
  }
  if (!btn) return;
  const a = btn.dataset.action;
  try {
    switch (a) {
      case 'tab': ui.tab = btn.dataset.tab; render(snap); break;
      case 'new-game': requestPersistentStorage(); ui.practice = null; ui.showKinds = null; store.newGame(); break;
      case 'resume': store.load(); break;
      case 'export': exportSave(); break;
      case 'import': root.querySelector('#import-file')?.click(); break;
      case 'quit': ui.practice = null; ui.showKinds = null; store.quit(); break;
      case 'undo': ui.selected = null; store.undo(); break;
      case 'next-hand': ui.practice = null; ui.showKinds = null; store.nextHand(); break;
      case 'draw': store.dispatch({ type: 'draw' }); break;
      case 'mahjong': store.dispatch({ type: 'mahjong' }); break;
      case 'pass': store.dispatch({ type: 'pass' }); break;
      case 'pung': store.dispatch({ type: 'pung' }); break;
      case 'kong': {
        const variant = btn.dataset.variant;
        const action = { type: 'kong', variant };
        if (variant !== 'open') action.kind = Number(btn.dataset.kind);
        if (variant === 'extend') action.meldIndex = Number(btn.dataset.meld);
        store.dispatch(action);
        break;
      }
      case 'chow': store.dispatch({ type: 'chow', kinds: btn.dataset.kinds.split(',').map(Number) }); break;
      case 'riichi': {
        const withSelected = ui.selected !== null && ui.legal.some((x) => x.type === 'riichi' && kindOf(x.tile) === kindOf(ui.selected));
        if (withSelected) { const id = ui.selected; ui.selected = null; ui.advice = null; store.dispatch({ type: 'riichi', tile: id }); }
        else { ui.riichiMode = true; ui.selected = null; render(snap); }
        break;
      }
      case 'riichi-cancel': ui.riichiMode = false; render(snap); break;
      case 'advise': advise(); break;
      case 'advice-why': if (ui.advice) { ui.advice.showWhy = !ui.advice.showWhy; render(snap); } break;
      case 'toggle-assist': ui.advice = null; store.updateSettings({ assist: !store.settings.assist }); break;
      case 'unlock': attemptUnlock(); break;
      case 'apply-update': applyUpdate(); break;
      case 'install': promptInstall(); break;
      case 'set-setting': store.updateSettings({ [btn.dataset.setting]: btn.dataset.value }); break;
      case 'set-speed': { const s = GAME_SPEEDS.find((g) => g.id === btn.dataset.value); if (s) store.updateSettings({ aiDelayMs: s.ms }); break; }
      case 'tutorial-start': ui.tutorial = 0; render(snap); break;
      case 'tutorial-next': ui.tutorial = (ui.tutorial ?? 0) + 1; render(snap); break;
      case 'tutorial-skip': case 'tutorial-done': ui.tutorial = -1; store.updateSettings({ tutorialDone: true }); break;
      case 'guide-nav': ui.guide.section = btn.dataset.section; render(snap); break;
      case 'analysis-list': case 'analysis': openAnalysisTab(snap); break;
      case 'analysis-current': runAnalysis({ seed: snap.state.seed, ruleSet: snap.state.ruleSet, humanSeat: snap.humanSeat, actions: snap.state.actions }); break;
      case 'analysis-open': {
        const g = ui.analysis.games.find((x) => x.id === btn.dataset.id);
        if (g) runAnalysis(g);
        break;
      }
      case 'analysis-hand': ui.analysis.hand = Number(btn.dataset.hand); ui.analysis.decision = null; render(snap); break;
      case 'analysis-decision': ui.analysis.decision = Number(btn.dataset.index); render(snap); break;
      case 'analysis-close': ui.guide.section = null; render(snap); break;
      case 'lexicon-close': ui.guide.section = null; render(snap); break;
      case 'lexicon-filter': ui.lexicon.category = btn.dataset.category; render(snap); break;
      case 'lexicon-variant': ui.lexicon.variant = btn.dataset.variant; ui.lexicon.category = 'all'; ui.lexicon.open = null; render(snap); break;
      case 'lexicon-toggle': ui.lexicon.open = ui.lexicon.open === btn.dataset.id ? null : btn.dataset.id; render(snap); break;
      case 'practice-list': ui.tab = 'guide'; ui.guide.section = 'lexicon'; ui.lexicon.variant = store.settings.rules.variant ?? 'classical'; ui.lexicon.category = ui.lexicon.variant === 'classical' ? 'limit' : 'all'; ui.lexicon.query = ''; render(snap); break;
      case 'practice': {
        const entry = lexiconById(btn.dataset.id);
        if (!entry?.example) break;
        if (entry.variant && entry.variant !== (store.settings.rules.variant ?? 'classical')) store.applyPreset(defaultPresetFor(entry.variant));
        ui.tab = 'play';
        ui.practice = t('practiceHint', { name: entry.name[store.settings.language] ?? entry.name.de });
        ui.formsOpen = true;
        store.newPractice(parseKinds(entry.example), { target: entry.form ?? null });
        break;
      }
      case 'set-target': ui.showKinds = null; store.setTarget(btn.dataset.form); break;
      case 'clear-target': ui.showKinds = null; store.setTarget(null); break;
      case 'form-select': {
        if (ev.target.closest('[data-action="set-target"],[data-action="clear-target"]')) break;
        ui.showKinds = ui.showKinds === btn.dataset.form ? null : btn.dataset.form;
        ui.formsOpen = true;
        render(snap);
        break;
      }
      case 'round-end-toggle': {
        const seat = Number(btn.dataset.seat);
        if (ui.roundEndOpen.has(seat)) ui.roundEndOpen.delete(seat); else ui.roundEndOpen.add(seat);
        render(snap);
        break;
      }
      case 'calc-pick': {
        const kind = Number(btn.dataset.kind);
        if (ui.calc.meldPicker) {
          const type = ui.calc.meldPicker;
          const kinds = calcMeldKinds(type, kind);
          if (kinds.every((k) => k < 34 && usedCount(ui.calc, k) < 4)) {
            ui.calc.melds.push({ type: type === 'openKong' || type === 'concealedKong' ? 'kong' : type, kinds, open: calcMeldOpen(type) });
          }
          ui.calc.meldPicker = null;
        } else if (kind >= 34) {
          if (!ui.calc.bonus.includes(kind)) ui.calc.bonus.push(kind);
        } else if (usedCount(ui.calc, kind) < 4) {
          ui.calc.concealed.push(kind);
        }
        render(snap);
        break;
      }
      case 'calc-remove': ui.calc.concealed.splice(Number(btn.dataset.index), 1); render(snap); break;
      case 'calc-remove-meld': ui.calc.melds.splice(Number(btn.dataset.index), 1); render(snap); break;
      case 'calc-remove-bonus': ui.calc.bonus.splice(Number(btn.dataset.index), 1); render(snap); break;
      case 'calc-remove-last': ui.calc.concealed.pop(); render(snap); break;
      case 'calc-meld-start': ui.calc.meldPicker = btn.dataset.meldType; render(snap); break;
      case 'calc-meld-cancel': ui.calc.meldPicker = null; render(snap); break;
      case 'calc-clear': ui.calc = newCalcState(); render(snap); break;
      case 'calc-calculate': {
        try {
          ui.calc.result = scoreManualHand(ui.calc, currentCalcRuleSet(snap));
          ui.calc.error = null;
        } catch (e) {
          ui.calc.result = null;
          ui.calc.error = e.message;
        }
        render(snap);
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error(e);
  }
});

async function exportSave() {
  const text = store.exportSave();
  if (!text) return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mahjong-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-action="lexicon-search"]');
  if (!el) return;
  ui.lexicon.query = el.value;
  const pos = el.selectionStart;
  render(store.getSnapshot());
  const again = root.querySelector('[data-action="lexicon-search"]');
  if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* ignorieren */ } }
});
root.addEventListener('toggle', (ev) => {
  if (ev.target.classList?.contains('forms')) ui.formsOpen = ev.target.open;
}, true);

root.addEventListener('change', (ev) => {
  const file = ev.target.closest('#import-file');
  if (file && file.files?.[0]) {
    file.files[0].text().then((text) => store.importSave(text)).catch((e) => alert(e.message));
    return;
  }
  const preset = ev.target.closest('[data-action="preset"]');
  if (preset) { if (preset.value !== 'custom') store.applyPreset(preset.value); return; }
  const rule = ev.target.closest('[data-rule]');
  if (rule) {
    let value = rule.type === 'checkbox' ? rule.checked : rule.value;
    if (['limit', 'deadWallSize', 'maxChows', 'startScore', 'minFan', 'maxFan'].includes(rule.dataset.rule)) value = Number(value);
    store.setRule(rule.dataset.rule, value);
    return;
  }
  const nameEl = ev.target.closest('[data-player-name]');
  if (nameEl) {
    const names = [...store.settings.playerNames];
    names[Number(nameEl.dataset.playerName)] = nameEl.value.trim() || names[Number(nameEl.dataset.playerName)];
    store.updateSettings({ playerNames: names });
    return;
  }
  const calcEl = ev.target.closest('[data-calc]');
  if (calcEl) {
    const key = calcEl.dataset.calc;
    ui.calc[key] = key === 'selfDraw' ? calcEl.checked : Number(calcEl.value);
    render(store.getSnapshot());
    return;
  }
  const el = ev.target.closest('[data-setting]');
  if (!el) return;
  const key = el.dataset.setting;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (['rounds'].includes(key)) value = Number(value);
  store.updateSettings({ [key]: value });
});

// Tastatur (Desktop): Pfeile wählen, Enter wirft ab, U = Undo, H = Empfehlung
document.addEventListener('keydown', (ev) => {
  const snap = store.getSnapshot();
  if (ui.tab !== 'play' || !snap.state || snap.state.phase !== 'discard' || !snap.humanToAct) return;
  const tiles = [...root.querySelectorAll('.hand .tile.clickable')].map((el) => Number(el.dataset.id));
  if (!tiles.length) return;
  const idx = tiles.indexOf(ui.selected);
  if (ev.key === 'ArrowRight') { ui.selected = tiles[(idx + 1 + tiles.length) % tiles.length]; render(snap); }
  else if (ev.key === 'ArrowLeft') { ui.selected = tiles[(idx - 1 + tiles.length) % tiles.length]; render(snap); }
  else if (ev.key === 'Enter' && ui.selected !== null) discard(ui.selected);
  else if (ev.key === 'u') store.undo();
  else if (ev.key === 'h') advise();
});

window.addEventListener('pagehide', () => store.flush());
window.__mahjong = { store, ui };

// Dev-Einstieg: index.html#new=seed startet sofort ein Spiel, #auto=seed nur mit KI-Sitzen
if (location.hash.startsWith('#new') || location.hash.startsWith('#auto')) {
  const seed = location.hash.split('=')[1] || Date.now();
  store.updateSettings({ aiDelayMs: location.hash.startsWith('#auto') ? 0 : store.settings.aiDelayMs });
  store.newGame({ seed, humanSeat: location.hash.startsWith('#auto') ? -1 : 0 });
}

// Manifest-Shortcuts: ?action=new | resume | guide
const startAction = new URLSearchParams(location.search).get('action');
if (startAction === 'new') store.newGame();
else if (startAction === 'resume') store.checkSave().then((ok) => ok && store.load());
else if (startAction === 'guide') { ui.tab = 'guide'; render(store.getSnapshot()); }
