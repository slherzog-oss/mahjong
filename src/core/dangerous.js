// DMJL "Gefährliches Spiel" (Option penalties): Wer einen Stein abwirft, der
// gegenüber einem Gegner mit offensichtlich starker Auslage gefährlich ist, und
// damit dessen Mahjong ermöglicht, zahlt für alle drei Verlierer. Keine Strafe,
// wenn die ganze Hand nur aus gefährlichen Steinen besteht.
import { NUM_KINDS, isSuited, suitOf, isHonour, isDragon, isWind, isMajor, kindOf } from './tiles.js';

/** Menge der Arten, die gegenüber Spieler p gefährlich sind (nur offene Sätze zählen). */
export function dangerousKindsFor(p) {
  const out = new Set();
  const exposed = p.melds.filter((m) => m.open);
  if (exposed.length === 0) return out;
  const pungs = exposed.filter((m) => m.type !== 'chow');
  if (exposed.length >= 3) {
    const suits = new Set(exposed.flatMap((m) => m.kinds).filter(isSuited).map(suitOf));
    // Drei offene Sätze einer Farbe (Honours erlaubt): die ganze Farbe und alle Honours
    if (suits.size === 1) {
      const s = [...suits][0];
      for (let k = 0; k < NUM_KINDS; k++) if ((isSuited(k) && suitOf(k) === s) || isHonour(k)) out.add(k);
    }
    // Drei offene Sätze nur aus Honours: alle Honours
    if (suits.size === 0) for (let k = 27; k < NUM_KINDS; k++) out.add(k);
    // Drei offene Pungs aus Endsteinen/Honours ohne Chow: alle Endsteine und Honours
    if (pungs.length >= 3 && pungs.length === exposed.length && pungs.every((m) => isMajor(m.kinds[0]))) {
      for (let k = 0; k < NUM_KINDS; k++) if (isMajor(k)) out.add(k);
    }
  }
  // Zwei Drachen-Pungs: der dritte Drache
  const dragons = pungs.filter((m) => isDragon(m.kinds[0])).map((m) => m.kinds[0]);
  if (dragons.length === 2) for (let k = 31; k < 34; k++) if (!dragons.includes(k)) out.add(k);
  // Drei Wind-Pungs: der vierte Wind
  const winds = pungs.filter((m) => isWind(m.kinds[0])).map((m) => m.kinds[0]);
  if (winds.length === 3) for (let k = 27; k < 31; k++) if (!winds.includes(k)) out.add(k);
  return out;
}

/** Sitze, für die ein Abwurf von `kind` durch `seat` gefährlich wäre. */
export function dangerousFor(state, seat, kind) {
  const out = [];
  for (const p of state.players) {
    if (p.seat === seat) continue;
    if (dangerousKindsFor(p).has(kind)) out.push(p.seat);
  }
  return out;
}

/** Alle Arten in der Hand eines Sitzes, die gefährlich wären. */
export function dangerousKindsInHand(state, seat) {
  const sets = state.players.filter((p) => p.seat !== seat).map(dangerousKindsFor);
  const out = new Set();
  for (const id of state.players[seat].hand) {
    const k = kindOf(id);
    if (sets.some((s) => s.has(k))) out.add(k);
  }
  return out;
}
