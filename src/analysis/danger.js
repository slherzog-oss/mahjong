// Gefahrenbewertung (Defensive, PLAN.md 4.5). Kein Furiten in Chinese Classical,
// daher Heuristik aus Restkopien, Steinart, offenen Sätzen und Abwurfmustern.
import { isHonour, isTerminal, isSuited, suitOf, kindOf } from '../core/tiles.js';

/** Geschätztes Tempo eines Gegners 0..1 (nahe am Gewinn?). */
export function opponentTempo(state, seat) {
  const p = state.players[seat];
  const progress = 1 - state.wall.living.length / Math.max(1, 136 - 53 - state.ruleSet.deadWallSize);
  let t = 0.15 + 0.2 * p.melds.length + 0.35 * progress;
  // Späte Abwürfe von Mittelsteinen (4-6) deuten auf eine fertige Hand hin
  const recent = p.discards.slice(-3).map(kindOf);
  if (recent.length === 3 && recent.every((k) => isSuited(k) && (k % 9) >= 3 && (k % 9) <= 5)) t += 0.15;
  return Math.min(1, t);
}

/**
 * Gefahr 0..1 eines Abwurfs von `kind` aus Sicht von `seat`.
 * remaining: Restverfügbarkeit je Art (4 - sichtbar).
 */
export function dangerOf(state, seat, kind, remaining) {
  let d = remaining[kind] / 4; // 0 = alle Kopien sichtbar → sicher
  if (isHonour(kind)) d *= 0.5;
  else if (isTerminal(kind)) d *= 0.8;
  for (const p of state.players) {
    if (p.seat === seat) continue;
    const tempo = opponentTempo(state, p.seat);
    // Ein Stein, den der Gegner selbst schon abgeworfen hat, ist gegen ihn sicherer
    if (p.discards.some((id) => kindOf(id) === kind)) d -= 0.15 * tempo;
    if (p.melds.length >= 2 && isSuited(kind)) {
      const suits = new Set(p.melds.flatMap((m) => m.kinds).filter((k) => k < 27).map(suitOf));
      if (suits.size === 1 && suits.has(suitOf(kind))) d += 0.3 * tempo;
      if (p.melds.every((m) => m.kinds[0] >= 27) ) d += 0.05; // Honours-Sammler: Farbsteine eher sicher
    }
    d += 0.12 * p.melds.length * tempo;
  }
  return Math.max(0, Math.min(1, d));
}
