// Zug-Schleife: lässt KI-Sitze automatisch handeln, bis ein menschlicher Sitz
// dran ist oder die Hand/das Spiel endet.
import { applyAction, seatsToAct } from '../core/state.js';
import { chooseAction } from './player.js';

/**
 * Führt genau eine KI-Aktion aus (erster KI-Sitz, der handeln muss).
 * Liefert { state, action, seat } oder null, wenn kein KI-Sitz dran ist.
 */
export function stepAI(state, options = {}) {
  const isAI = options.isAI ?? ((seat) => !state.players[seat].human);
  for (const seat of seatsToAct(state)) {
    if (!isAI(seat)) continue;
    const difficulty = typeof options.difficulty === 'function' ? options.difficulty(seat) : options.difficulty;
    const action = chooseAction(state, seat, { difficulty, rng: options.rng });
    if (!action) continue;
    return { state: applyAction(state, action), action, seat };
  }
  return null;
}

/**
 * Lässt die KI spielen, bis ein menschlicher Sitz handeln muss oder die Phase
 * 'handOver' / 'gameOver' / 'idle' erreicht ist (diese Übergänge macht der Aufrufer).
 * options.onStep(state, action, seat) wird nach jedem Zug aufgerufen.
 */
export function runUntilHuman(state, options = {}) {
  let s = state;
  let guard = 0;
  while (true) {
    if (++guard > 10000) throw new Error('runUntilHuman: Endlosschleife');
    if (['handOver', 'gameOver', 'idle'].includes(s.phase)) return s;
    const r = stepAI(s, options);
    if (!r) return s; // Mensch ist dran
    s = r.state;
    options.onStep?.(s, r.action, r.seat);
  }
}
