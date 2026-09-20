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
import { memoryAdapter } from './persistence.js';

export const SAVE_KEY = 'current';
export const SAVE_VERSION = 1;
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

/**
 * @param storage  synchroner Speicher für Einstellungen (localStorage-artig) oder null
 * @param persistence  asynchroner Adapter aus persistence.js für Spielstände und Archiv
 */
export function createStore({ storage = safeLocalStorage(), persistence = memoryAdapter() } = {}) {
  const listeners = new Set();
  let settings = loadSettings();
  let state = null;
  let history = []; // Zustände vor menschlichen Entscheidungen
  let lastScore = null; // Ergebnis der letzten Hand (sheets, payments, net)
  let aiTimer = null;
  let hasSave = false;
  let writing = null; // laufender Schreibvorgang
  let dirty = false;

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

  /** Speichert asynchron; überlappende Aufrufe werden zusammengefasst. */
  function save() {
    dirty = true;
    if (writing) return writing;
    writing = (async () => {
      while (dirty) {
        dirty = false;
        try {
          if (!state) {
            await persistence.remove('saves', SAVE_KEY);
            hasSave = false;
          } else {
            await persistence.set('saves', SAVE_KEY, { version: SAVE_VERSION, savedAt: Date.now(), state, history, lastScore });
            hasSave = true;
          }
        } catch (e) {
          console.warn('Speichern fehlgeschlagen', e);
        }
      }
      writing = null;
    })();
    return writing;
  }

  async function archiveGame() {
    if (!state) return;
    try {
      const id = `${state.seed}-${Date.now()}`;
      await persistence.set('archive', id, {
        id,
        finishedAt: Date.now(),
        seed: state.seed,
        ruleSet: state.ruleSet,
        humanSeat: humanSeat(),
        scores: state.players.map((p) => p.score),
        hands: state.handNumber,
        log: state.log,
      });
    } catch (e) {
      console.warn('Archivieren fehlgeschlagen', e);
    }
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
    hasSave() { return hasSave; },
    /** Prüft, ob ein Spielstand existiert (für den Startbildschirm). */
    async checkSave() {
      try {
        const data = await persistence.get('saves', SAVE_KEY);
        hasSave = !!data && migrate(data) !== null;
      } catch {
        hasSave = false;
      }
      emit();
      return hasSave;
    },
    async load() {
      try {
        const data = migrate(await persistence.get('saves', SAVE_KEY));
        if (!data) return false;
        state = data.state;
        history = data.history ?? [];
        lastScore = data.lastScore ?? null;
        hasSave = true;
        emit();
        scheduleAI();
        return true;
      } catch {
        return false;
      }
    },
    /** Spielstand als JSON-Text (für Datei-Export). */
    exportSave() {
      if (!state) return null;
      return JSON.stringify({ version: SAVE_VERSION, exportedAt: Date.now(), state, history, lastScore });
    },
    /** JSON-Text laden (Datei-Import). */
    importSave(text) {
      const data = migrate(JSON.parse(text));
      if (!data) throw new Error('Ungültiger Spielstand');
      clearTimeout(aiTimer);
      state = data.state;
      history = data.history ?? [];
      lastScore = data.lastScore ?? null;
      save();
      emit();
      scheduleAI();
      return true;
    },
    async listArchive() {
      try {
        const rows = await persistence.list('archive');
        return rows.map((r) => r.value).sort((a, b) => b.finishedAt - a.finishedAt);
      } catch {
        return [];
      }
    },
    /** Wartet, bis ausstehende Schreibvorgänge fertig sind (Tests, Seitenwechsel). */
    flush() { return writing ?? Promise.resolve(); },
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
      if (s.phase === 'gameOver') archiveGame();
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
    return { state, settings, lastScore, canUndo: api.canUndo(), humanSeat: humanSeat(), humanToAct: humanToAct(), hasSave };
  }

  return api;
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Bringt ältere Spielstände auf das aktuelle Format; null = unbrauchbar. */
function migrate(data) {
  if (!data || typeof data !== 'object' || !data.state) return null;
  const v = data.version ?? 1;
  if (v > SAVE_VERSION) return null;
  if (data.state.version !== 1) return null;
  return data;
}

function sameAction(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'discard') return a.tile === b.tile || (b.tile === undefined);
  if (a.type === 'chow') return a.kinds[0] === b.kinds?.[0] && a.kinds[1] === b.kinds?.[1];
  if (a.type === 'kong') return a.variant === b.variant && (a.kind === undefined || a.kind === b.kind);
  return true;
}
