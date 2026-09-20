// App: verbindet Store, Rendering und Ereignisse.
import { createStore } from '../store/store.js';
import { defaultAdapter, requestPersistentStorage } from '../store/persistence.js';
import { renderStart, renderGame, renderHandOver, renderGameOver } from './render.js';
import { renderLexicon } from './lexicon.js';
import { renderAnalysisList, renderAnalysis } from './analysis.js';
import { analyzeGame } from '../replay/analyzer.js';
import { lexiconById } from '../lexicon/hands.js';
import { parseKinds } from '../core/tiles.js';
import { kindOf, KIND_NAMES } from '../core/tiles.js';
import { adviseDiscard, adviseClaim, explainDiscard, explainClaim, explainHints } from '../advisor/index.js';
import { t, setLanguage, setOverrides } from '../i18n/index.js';
import { renderTutorial } from './tutorial.js';
import { playSound } from './sound.js';
import { pwa, onPwaChange, registerServiceWorker, applyUpdate, promptInstall, keepAwake, vibrate, isStandalone } from './pwa.js';

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
const ui = { selected: null, legal: [], advice: null, screen: null, tutorial: null, lexicon: { query: '', category: 'all', open: null }, formsOpen: false, showKinds: null, practice: null, analysis: { games: [], current: false, record: null, result: null, hand: null, decision: null } };
let lastPhaseKey = '';

function render(snap) {
  const { state } = snap;
  applySettingsToI18n(snap.settings);
  document.body.classList.toggle('no-anim', !snap.settings.animations);
  ui.legal = state ? store.legalActions() : [];
  ui.pwa = { updateReady: pwa.updateReady, canInstall: !!pwa.installPrompt && !isStandalone(), version: pwa.version };
  let html;
  if (ui.screen === 'lexicon') html = renderLexicon(ui);
  else if (ui.screen === 'analysis-list') html = renderAnalysisList(ui);
  else if (ui.screen === 'analysis') html = renderAnalysis(ui);
  else if (!state) html = renderStart({ ...snap, pwa: ui.pwa });
  else if (state.phase === 'gameOver') html = renderGameOver(snap);
  else if (state.phase === 'handOver') html = renderHandOver(snap);
  else html = renderGame(snap, ui);
  ui.mc = mc.key && state && mc.key === `${state.seed}:${state.handNumber}:${state.log.length}` ? mc.result : null;
  if (!Number.isInteger(ui.tutorial) && !snap.settings.tutorialDone && !state && !ui.screen) ui.tutorial = 0;
  const tutorialOpen = Number.isInteger(ui.tutorial) && ui.tutorial >= 0;
  root.innerHTML = renderBanner(ui.pwa) + html + (tutorialOpen ? renderTutorial(ui.tutorial) : '');
  requestMonteCarlo(snap);
  // Lernmodus: Empfehlung automatisch nach jedem eigenen Zug
  if (snap.settings.learnMode && state && snap.humanToAct && ['discard', 'claiming'].includes(state.phase) && !ui.advice && ui.learnKey !== stateKey(state)) {
    ui.learnKey = stateKey(state);
    ui.formsOpen = true;
    advise();
  }
  const inHand = !!state && !['handOver', 'gameOver', 'idle'].includes(state.phase);
  pwa.wantAwake = inHand;
  keepAwake(inHand);
  if (state && snap.humanToAct && state.phase === 'claiming' && ui.lastVibrateKey !== stateKey(state)) {
    ui.lastVibrateKey = stateKey(state);
    vibrate(30);
    if (snap.settings.sounds) playSound('call');
  }
  if (state && snap.settings.sounds && ui.lastSoundKey !== stateKey(state)) {
    ui.lastSoundKey = stateKey(state);
    const last = state.log.at(-1);
    if (last?.type === 'discard') playSound('discard');
    else if (last?.type === 'mahjong') playSound(last.seat === snap.humanSeat ? 'win' : 'lose');
    else if (['pung', 'chow', 'kong'].includes(last?.type)) playSound('claim');
  }
  const key = state ? `${state.handNumber}:${state.turn}:${state.phase}:${state.log.length}` : '';
  if (key !== lastPhaseKey) {
    lastPhaseKey = key;
    // Auswahl und Empfehlung verfallen mit jedem Zug
    if (!(state && state.phase === 'discard')) ui.selected = null;
    ui.advice = null;
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
      dangerKinds: adv.options.filter((o) => o.danger > 0.6 && adv.progress > 0.4).map((o) => o.kind),
      lines: explainDiscard(adv),
      hints: explainHints(adv.hints),
      alternatives: adv.alternatives,
      best: adv.best,
    };
  } else if (state.phase === 'claiming' || legal.some((a) => a.type === 'mahjong')) {
    const adv = state.phase === 'claiming' ? adviseClaim(state, humanSeat) : { action: { type: 'mahjong' }, reason: { key: 'mahjong' } };
    ui.advice = { lines: explainClaim(adv), hints: [], action: adv.action.type };
  }
  render(store.getSnapshot());
}

root.addEventListener('click', (ev) => {
  const tile = ev.target.closest('.tile.clickable');
  const btn = ev.target.closest('[data-action]');
  const snap = store.getSnapshot();

  if (tile && snap.state?.phase === 'discard' && snap.humanToAct) {
    const id = Number(tile.dataset.id);
    try {
      if (!snap.settings.confirmDiscard || ui.selected === id) {
        discard(id);
      } else {
        ui.selected = id;
        render(snap);
      }
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
      case 'new-game': requestPersistentStorage(); ui.practice = null; ui.showKinds = null; store.newGame(); break;
      case 'resume': store.load(); break;
      case 'export': exportSave(); break;
      case 'import': root.querySelector('#import-file')?.click(); break;
      case 'quit': ui.practice = null; ui.showKinds = null; ui.screen = null; store.quit(); break;
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
      case 'discard-selected': if (ui.selected !== null) discard(ui.selected); break;
      case 'advise': advise(); break;
      case 'apply-update': applyUpdate(); break;
      case 'install': promptInstall(); break;
      case 'lexicon': ui.screen = 'lexicon'; render(snap); break;
      case 'tutorial-start': ui.tutorial = 0; render(snap); break;
      case 'tutorial-next': ui.tutorial = (ui.tutorial ?? 0) + 1; render(snap); break;
      case 'tutorial-skip': case 'tutorial-done': ui.tutorial = -1; store.updateSettings({ tutorialDone: true }); break;
      case 'analysis-list': case 'analysis': openAnalysisList(snap); break;
      case 'analysis-close': ui.screen = null; render(snap); break;
      case 'analysis-current': runAnalysis({ seed: snap.state.seed, ruleSet: snap.state.ruleSet, humanSeat: snap.humanSeat, actions: snap.state.actions }); break;
      case 'analysis-open': {
        const g = ui.analysis.games.find((x) => x.id === btn.dataset.id);
        if (g) runAnalysis(g);
        break;
      }
      case 'analysis-hand': ui.analysis.hand = Number(btn.dataset.hand); ui.analysis.decision = null; render(snap); break;
      case 'analysis-decision': ui.analysis.decision = Number(btn.dataset.index); render(snap); break;
      case 'lexicon-close': ui.screen = null; render(snap); break;
      case 'lexicon-filter': ui.lexicon.category = btn.dataset.category; render(snap); break;
      case 'lexicon-toggle': ui.lexicon.open = ui.lexicon.open === btn.dataset.id ? null : btn.dataset.id; render(snap); break;
      case 'practice': {
        const entry = lexiconById(btn.dataset.id);
        if (!entry?.example) break;
        ui.screen = null;
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
      default: break;
    }
  } catch (e) {
    console.error(e);
  }
});

async function openAnalysisList(snap) {
  ui.screen = 'analysis-list';
  ui.analysis.current = !!snap.state && snap.state.actions.length > 0 && snap.humanSeat >= 0;
  ui.analysis.games = await store.listArchive();
  render(store.getSnapshot());
}

function runAnalysis(record) {
  try {
    const result = analyzeGame(record, { seat: record.humanSeat >= 0 ? record.humanSeat : 0 });
    ui.analysis.record = record;
    ui.analysis.result = result;
    ui.analysis.hand = result.hands.at(-1)?.hand ?? null;
    ui.analysis.decision = null;
    ui.screen = 'analysis';
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
  render(store.getSnapshot());
}

function exportSave() {
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
    if (['limit', 'deadWallSize', 'maxChows', 'startScore'].includes(rule.dataset.rule)) value = Number(value);
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
  const el = ev.target.closest('[data-setting]');
  if (!el) return;
  const key = el.dataset.setting;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (['rounds', 'aiDelayMs'].includes(key)) value = Number(value);
  store.updateSettings({ [key]: value });
});

// Tastatur (Desktop): Pfeile wählen, Enter wirft ab, U = Undo, H = Empfehlung
document.addEventListener('keydown', (ev) => {
  const snap = store.getSnapshot();
  if (!snap.state || snap.state.phase !== 'discard' || !snap.humanToAct) return;
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

// Manifest-Shortcuts: ?action=new | resume
const startAction = new URLSearchParams(location.search).get('action');
if (startAction === 'new') store.newGame();
else if (startAction === 'resume') store.checkSave().then((ok) => ok && store.load());
