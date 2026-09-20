// App: verbindet Store, Rendering und Ereignisse.
import { createStore } from '../store/store.js';
import { renderStart, renderGame, renderHandOver, renderGameOver } from './render.js';
import { kindOf, KIND_NAMES } from '../core/tiles.js';
import { chooseAction } from '../ai/player.js';
import { discardOptions, visibleCounts, remainingCounts } from '../analysis/ukeire.js';
import { t } from '../i18n/de.js';

const root = document.getElementById('app');
const store = createStore();
const ui = { selected: null, legal: [], advice: null };
let lastPhaseKey = '';

function render(snap) {
  const { state } = snap;
  ui.legal = state ? store.legalActions() : [];
  let html;
  if (!state) html = renderStart({ ...snap, hasSave: store.hasSave() });
  else if (state.phase === 'gameOver') html = renderGameOver(snap);
  else if (state.phase === 'handOver') html = renderHandOver(snap);
  else html = renderGame(snap, ui);
  root.innerHTML = html;
  const key = state ? `${state.handNumber}:${state.turn}:${state.phase}:${state.log.length}` : '';
  if (key !== lastPhaseKey) {
    lastPhaseKey = key;
    // Auswahl und Empfehlung verfallen mit jedem Zug
    if (!(state && state.phase === 'discard')) ui.selected = null;
    ui.advice = null;
  }
  document.body.classList.toggle('in-game', !!state);
}

store.subscribe(render);

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
  if (legal.some((a) => a.type === 'mahjong')) {
    ui.advice = { text: t('advisorMahjong') };
  } else if (state.phase === 'discard') {
    const p = state.players[humanSeat];
    const kinds = p.hand.map(kindOf);
    const { visible } = visibleCounts(state, humanSeat);
    const opts = discardOptions(kinds, p.melds.length, state.ruleSet, remainingCounts(visible));
    const best = opts[0];
    ui.advice = {
      kind: best.kind,
      text: t('advisorHint', { tile: KIND_NAMES[best.kind], reason: t('advisorReasonUkeire', { shanten: best.shanten, ukeire: best.total }) }),
    };
  } else if (state.phase === 'claiming') {
    const a = chooseAction(state, humanSeat, { difficulty: 'hard' });
    const label = a.type === 'pass' ? t('pass') : t(a.type);
    ui.advice = { text: t('advisorClaim', { action: label }) };
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
      case 'new-game': store.newGame(); break;
      case 'resume': store.load(); break;
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
      default: break;
    }
  } catch (e) {
    console.error(e);
  }
});

root.addEventListener('change', (ev) => {
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

window.__mahjong = { store, ui };

// Dev-Einstieg: index.html#new=seed startet sofort ein Spiel, #auto=seed nur mit KI-Sitzen
if (location.hash.startsWith('#new') || location.hash.startsWith('#auto')) {
  const seed = location.hash.split('=')[1] || Date.now();
  store.updateSettings({ aiDelayMs: location.hash.startsWith('#auto') ? 0 : store.settings.aiDelayMs });
  store.newGame({ seed, humanSeat: location.hash.startsWith('#auto') ? -1 : 0 });
}
