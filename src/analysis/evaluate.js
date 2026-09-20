// Abwurfbewertung für Berater und KI (Stufe Schwer): Fertigstellungschance,
// Wertpotenzial und Gefahr je Kandidat, zu einem Gesamtscore verrechnet.
import { kindOf, isHonour, isDragon, isWind, isSuited, suitOf, windIndex, countsFromKinds, NUM_KINDS } from '../core/tiles.js';
import { seatWind } from '../core/state.js';
import { discardOptions, visibleCounts, remainingCounts } from './ukeire.js';
import { completionChance, drawsLeftFor } from './probability.js';
import { dangerOf } from './danger.js';
import { dangerousKindsInHand } from '../core/dangerous.js';

export const EVAL_DEFAULTS = {
  valueWeight: 0.08, // je erwartete Verdopplung
  flushWeight: 0.15,
  dangerWeight: 1.0, // × Spielfortschritt × Gefahr
  honourPairBonus: 0.03,
};

/**
 * Wertpotenzial einer Hand (grob): Verdopplungsquellen, die sich anbahnen.
 * Liefert { doubles, flush: null|'half'|'full', suit, suitShare, honourSets }.
 */
export function valuePotential(kinds, melds, seatW, roundW) {
  const all = [...kinds, ...melds.flatMap((m) => m.kinds)];
  const counts = countsFromKinds(all);
  let doubles = 0;
  let honourSets = 0;
  for (let k = 27; k < NUM_KINDS; k++) {
    if (counts[k] >= 2) {
      if (isDragon(k)) { doubles += 1; honourSets++; }
      else if (isWind(k)) {
        const w = windIndex(k);
        if (w === seatW || w === roundW) { doubles += (w === seatW ? 1 : 0) + (w === roundW ? 1 : 0); honourSets++; }
      }
    }
  }
  const suits = [0, 0, 0];
  let honours = 0;
  for (const k of all) {
    if (isSuited(k)) suits[suitOf(k)]++;
    else if (isHonour(k)) honours++;
  }
  const maxSuit = Math.max(...suits);
  const suit = suits.indexOf(maxSuit);
  let flush = null;
  if (maxSuit + honours === all.length && maxSuit >= 9) flush = honours ? 'half' : 'full';
  return { doubles, flush, suit, suitShare: maxSuit / Math.max(1, all.length), honourSets };
}

/** Spielfortschritt 0 (Anfang) .. 1 (Wand leer). */
export function progressOf(state) {
  return 1 - state.wall.living.length / Math.max(1, 136 - 53 - state.ruleSet.deadWallSize);
}

/**
 * Bewertet alle Abwürfe eines Sitzes mit 3n+2 Steinen.
 * Liefert sortierte Liste (bester zuerst) mit
 * { kind, shanten, total, tiles, danger, potential, chance, score, breaksPair, visibleCopies, honour }.
 */
export function evaluateDiscards(state, seat, weights = EVAL_DEFAULTS) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const rs = state.ruleSet;
  const seatW = seatWind(state, seat);
  const { visible, unseen } = visibleCounts(state, seat);
  const remaining = remainingCounts(visible);
  const drawsLeft = drawsLeftFor(state.wall.living.length);
  const anyRiichi = state.players.some((q) => q.seat !== seat && q.riichi);
  const progress = Math.max(progressOf(state), anyRiichi ? 0.85 : 0); // Riichi am Tisch: Defensive wie im späten Spiel
  const counts = countsFromKinds(kinds);
  // DMJL "Gefährliches Spiel": solche Abwürfe kosten die Zahlung für alle, außer die ganze Hand ist gefährlich
  const penal = rs.penalties ? dangerousKindsInHand(state, seat) : new Set();
  const forced = penal.size > 0 && penal.size === new Set(kinds).size;

  const options = discardOptions(kinds, melds.length, rs, remaining).map((o) => {
    const rest = kinds.slice();
    rest.splice(rest.indexOf(o.kind), 1);
    const potential = valuePotential(rest, melds, seatW, state.roundWind);
    const penalty = penal.has(o.kind) && !forced;
    const danger = penalty ? 1 : dangerOf(state, seat, o.kind, remaining);
    const chance = completionChance({ shanten: o.shanten, ukeireTotal: o.total, unseen, drawsLeft });
    return {
      ...o,
      danger,
      potential,
      chance,
      penalty,
      breaksPair: counts[o.kind] === 2,
      breaksPung: counts[o.kind] >= 3,
      visibleCopies: visible[o.kind],
      honour: isHonour(o.kind),
    };
  });
  const bestChance = Math.max(...options.map((o) => o.chance), 1e-9);
  for (const o of options) {
    o.score = o.chance / bestChance
      + weights.valueWeight * o.potential.doubles
      + (o.potential.flush ? weights.flushWeight : 0)
      + weights.honourPairBonus * o.potential.honourSets
      - weights.dangerWeight * progress * o.danger
      - (o.penalty ? 1.5 : 0);
  }
  options.sort((a, b) => a.shanten - b.shanten || b.score - a.score);
  return { options, progress, remaining, unseen };
}
