// Store: hält den Spielzustand, Verlauf für Undo, Einstellungen und Autosave.
// Rein logisch (kein DOM); das UI abonniert Änderungen über subscribe().
//
// Undo-Modell: history ist eine Liste von Zuständen an menschlichen
// Entscheidungspunkten. undo() springt zum letzten Punkt, an dem der Mensch
// dran war (nicht nur einen KI-Zug zurück).

import { createGame, applyAction, applyPayments, seatsToAct, getLegalActions } from '../core/state.js';
import { createRuleSet } from '../core/rules.js';
import { stepAI } from '../ai/runner.js';
import { scoreRound } from '../scoring/millington.js';

export const SAVE_KEY = 'mahjong.save.v1';
export const SETTINGS_KEY = 'mahjong.settings.v1';

export const DEFAULT_SETTINGS = {
  difficulty: 'medium',
  rounds: 1,
  bonusTiles: false,
  sevenPairs: false,
  limit: 500,
  confirmDiscard: true,
  aiDelayMs: 450,
  showChance: true,
};

export function createStore({ storage = globalThis.localStorage ?? null } = {}) {
  const listeners = new Set();
  let settings = loadSettings();
  let state = null;
  let history = []; // Zustände vor menschlichen Entscheidungen
  let lastScore = null; // Ergebnis der letzten Hand (sheets, payments, net)
  let aiTimer = null;

  function loadSettings() {
    try {
      const raw = storage?.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignorieren */ }
  }

  function save() {
    try {
      if (!state) storage?.removeItem(SAVE_KEY);
      else storage?.setItem(SAVE_KEY, JSON.stringify({ state, history, lastScore }));
    } catch { /* Speicher voll oder gesperrt */ }
  }

  function emit() {
    for (const l of listeners) l(getSnapshot());
  }

  function set(next, { record = false } = {}) {
    if (record && state) history.push(state);
    if (history.length > 200) history.splice(0, history.length - 200);
    state = next;
    save();
    emit();
  }

  function humanSeat() {
    return state?.players.find((p) => p.human)?.seat ?? -1;
  }

  function humanToAct() {
    return !!state && seatsToAct(state).includes(humanSeat());
  }

  /** Lässt die KI ziehen, bis der Mensch dran ist; asynchron mit Verzögerung. */
  function scheduleAI() {
    clearTimeout(aiTimer);
    if (!state) return;
    if (['handOver', 'gameOver', 'idle'].includes(state.phase)) {
      if (state.phase === 'handOver' && !lastScore) settleHand();
      return;
    }
    if (humanToAct()) return;
    const delay = settings.aiDelayMs;
    const run = () => {
      const r = stepAI(state, { difficulty: settings.difficulty });
      if (!r) return;
      set(r.state);
      scheduleAI();
    };
    if (delay > 0) aiTimer = setTimeout(run, delay);
    else run();
  }

  function settleHand() {
    const result = scoreRound(state);
    lastScore = result;
    set(applyPayments(state, result.payments));
  }

  const api = {
    subscribe(fn) {
      listeners.add(fn);
      fn(getSnapshot());
      return () => listeners.delete(fn);
    },
    getSnapshot,
    get settings() { return settings; },
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      saveSettings();
      emit();
    },
    hasSave() {
      try { return !!storage?.getItem(SAVE_KEY); } catch { return false; }
    },
    load() {
      try {
        const raw = storage?.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data.state || data.state.version !== 1) return false;
        state = data.state;
        history = data.history ?? [];
        lastScore = data.lastScore ?? null;
        emit();
        scheduleAI();
        return true;
      } catch {
        return false;
      }
    },
    newGame({ seed = Date.now(), humanSeat = 0 } = {}) {
      const ruleSet = createRuleSet({
        rounds: settings.rounds,
        bonusTiles: settings.bonusTiles,
        sevenPairs: settings.sevenPairs,
        limit: settings.limit,
      });
      history = [];
      lastScore = null;
      state = createGame({ seed, ruleSet, humanSeat });
      set(applyAction(state, { type: 'startHand' }));
      scheduleAI();
    },
    /** Aktion des Menschen. */
    dispatch(action) {
      if (!state) return;
      const seat = humanSeat();
      if (action.seat === undefined && !['startHand', 'endHand'].includes(action.type)) action = { ...action, seat };
      const legal = getLegalActions(state, action.seat ?? seat);
      const ok = legal.some((a) => sameAction(a, action));
      if (!ok && !['startHand', 'endHand'].includes(action.type)) throw new Error(`Aktion nicht erlaubt: ${action.type}`);
      set(applyAction(state, action), { record: true });
      scheduleAI();
    },
    nextHand() {
      if (!state || state.phase !== 'handOver') return;
      lastScore = null;
      let s = applyAction(state, { type: 'endHand' });
      if (s.phase === 'idle') s = applyAction(s, { type: 'startHand' });
      history = [];
      set(s);
      scheduleAI();
    },
    canUndo() {
      return history.length > 0 && !!state && state.phase !== 'handOver' && state.phase !== 'gameOver';
    },
    undo() {
      if (!api.canUndo()) return false;
      clearTimeout(aiTimer);
      // Zum letzten Zustand zurück, in dem der Mensch dran war.
      let prev;
      do {
        prev = history.pop();
      } while (history.length && !seatsToAct(prev).includes(humanSeat()));
      lastScore = null;
      state = prev;
      save();
      emit();
      return true;
    },
    quit() {
      clearTimeout(aiTimer);
      state = null;
      history = [];
      lastScore = null;
      save();
      emit();
    },
    get lastScore() { return lastScore; },
    humanSeat,
    humanToAct,
    legalActions() {
      const seat = humanSeat();
      return state && seat >= 0 ? getLegalActions(state, seat) : [];
    },
  };

  function getSnapshot() {
    return { state, settings, lastScore, canUndo: api.canUndo(), humanSeat: humanSeat(), humanToAct: humanToAct() };
  }

  return api;
}

function sameAction(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'discard') return a.tile === b.tile || (b.tile === undefined);
  if (a.type === 'chow') return a.kinds[0] === b.kinds?.[0] && a.kinds[1] === b.kinds?.[1];
  if (a.type === 'kong') return a.variant === b.variant && (a.kind === undefined || a.kind === b.kind);
  return true;
}
