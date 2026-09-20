// App: verbindet Store, Rendering und Ereignisse.
import { createStore } from '../store/store.js';
import { defaultAdapter, requestPersistentStorage } from '../store/persistence.js';
import { renderStart, renderGame, renderHandOver, renderGameOver } from './render.js';
import { kindOf, KIND_NAMES } from '../core/tiles.js';
import { adviseDiscard, adviseClaim, explainDiscard, explainClaim, explainHints } from '../advisor/index.js';
import { t } from '../i18n/de.js';
import { pwa, onPwaChange, registerServiceWorker, applyUpdate, promptInstall, keepAwake, vibrate, isStandalone } from './pwa.js';

const root = document.getElementById('app');
const store = createStore({ persistence: defaultAdapter() });
store.checkSave();
const ui = { selected: null, legal: [], advice: null };
let lastPhaseKey = '';

function render(snap) {
  const { state } = snap;
  ui.legal = state ? store.legalActions() : [];
  ui.pwa = { updateReady: pwa.updateReady, canInstall: !!pwa.installPrompt && !isStandalone(), version: pwa.version };
  let html;
  if (!state) html = renderStart({ ...snap, pwa: ui.pwa });
  else if (state.phase === 'gameOver') html = renderGameOver(snap);
  else if (state.phase === 'handOver') html = renderHandOver(snap);
  else html = renderGame(snap, ui);
  root.innerHTML = renderBanner(ui.pwa) + html;
  const inHand = !!state && !['handOver', 'gameOver', 'idle'].includes(state.phase);
  pwa.wantAwake = inHand;
  keepAwake(inHand);
  if (state && snap.humanToAct && state.phase === 'claiming' && ui.lastVibrateKey !== key(state)) {
    ui.lastVibrateKey = key(state);
    vibrate(30);
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

function key(state) {
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
    const adv = adviseDiscard(state, humanSeat);
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
    if (!snap.settings.confirmDiscard || ui.selected === id) {
      discard(id);
    } else {
      ui.selected = id;
      render(snap);
    }
    return;
  }
  if (!btn) return;
  const a = btn.dataset.action;
  try {
    switch (a) {
      case 'new-game': requestPersistentStorage(); store.newGame(); break;
      case 'resume': store.load(); break;
      case 'export': exportSave(); break;
      case 'import': root.querySelector('#import-file')?.click(); break;
      case 'quit': store.quit(); break;
      case 'undo': ui.selected = null; store.undo(); break;
      case 'next-hand': store.nextHand(); break;
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
      default: break;
    }
  } catch (e) {
    console.error(e);
  }
});

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

root.addEventListener('change', (ev) => {
  const file = ev.target.closest('#import-file');
  if (file && file.files?.[0]) {
    file.files[0].text().then((text) => store.importSave(text)).catch((e) => alert(e.message));
    return;
  }
  const el = ev.target.closest('[data-setting]');
  if (!el) return;
  const key = el.dataset.setting;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (['rounds', 'limit', 'aiDelayMs'].includes(key)) value = Number(value);
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
