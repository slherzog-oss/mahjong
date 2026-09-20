// Berater: Empfehlung auf Zuruf (PLAN.md Abschnitt 8).
// Reine Logik; Texte kommen aus explain.js.

import { kindOf, isHonour, isDragon, isWind, isSuited, suitOf, windIndex, countsFromKinds, NUM_KINDS } from '../core/tiles.js';
import { seatWind } from '../core/state.js';
import { shanten } from '../analysis/shanten.js';
import { discardOptions, visibleCounts, remainingCounts, ukeire } from '../analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../analysis/probability.js';
import { dangerOf, AI_PARAMS } from '../ai/player.js';
import { getLegalActions } from '../core/state.js';

/**
 * Wertpotenzial einer Hand (grob): zählt Verdopplungsquellen, die sich anbahnen.
 * Liefert { doubles, flush: null|'half'|'full', suit, honourSets }.
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

/**
 * Empfehlung für den Abwurf. Liefert
 * { best, alternatives, options, chance, hints } mit Einträgen
 * { kind, shanten, total, danger, potential, chance, keepsPair }.
 */
export function adviseDiscard(state, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const rs = state.ruleSet;
  const seatW = seatWind(state, seat);
  const { visible, unseen } = visibleCounts(state, seat);
  const remaining = remainingCounts(visible);
  const drawsLeft = drawsLeftFor(state.wall.living.length);
  const progress = 1 - state.wall.living.length / (136 - 53 - rs.deadWallSize);
  const P = AI_PARAMS.hard;
  const counts = countsFromKinds(kinds);

  const options = discardOptions(kinds, melds.length, rs, remaining).map((o) => {
    const rest = kinds.slice();
    rest.splice(rest.indexOf(o.kind), 1);
    const potential = valuePotential(rest, melds, seatW, state.roundWind);
    const danger = dangerOf(state, seat, o.kind, remaining);
    const chance = completionChance({ shanten: o.shanten, ukeireTotal: o.total, unseen, drawsLeft });
    return {
      ...o,
      danger,
      potential,
      chance,
      breaksPair: counts[o.kind] === 2,
      breaksPung: counts[o.kind] >= 3,
      visibleCopies: visible[o.kind],
      honour: isHonour(o.kind),
    };
  });

  // Gesamtscore: Fertigstellungschance, Wertpotenzial, Gefahr (spät gewichtet)
  const bestChance = Math.max(...options.map((o) => o.chance), 1e-9);
  for (const o of options) {
    o.score = o.chance / bestChance + 0.08 * o.potential.doubles + (o.potential.flush ? 0.15 : 0) - P.dangerWeight * progress * o.danger;
  }
  options.sort((a, b) => a.shanten - b.shanten || b.score - a.score);
  const best = options[0];
  const alternatives = options.slice(1, 3);

  const hints = specialHandHints(kinds, melds, rs, seatW, state.roundWind);
  return { best, alternatives, options, hints, progress };
}

/** Empfehlung bei Call-Angebot: { action, reason: {…}, before, after }. */
export function adviseClaim(state, seat) {
  const legal = getLegalActions(state, seat);
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const meldCount = p.melds.length;
  const rs = state.ruleSet;
  const before = shanten(kinds, meldCount, rs).min;
  const calledKind = state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile);
  const mj = legal.find((a) => a.type === 'mahjong');
  if (mj) return { action: mj, reason: { key: 'mahjong' }, before, after: -1 };

  let best = legal.find((a) => a.type === 'pass');
  let bestAfter = before;
  let reason = { key: 'noGain' };
  for (const a of legal) {
    if (a.type === 'pass') continue;
    const rest = kinds.slice();
    const remove = a.type === 'pung' ? [calledKind, calledKind] : a.type === 'kong' ? [calledKind, calledKind, calledKind] : a.type === 'chow' ? a.kinds : null;
    if (!remove) continue;
    for (const k of remove) rest.splice(rest.indexOf(k), 1);
    const after = shanten(rest, meldCount + 1, rs).min;
    if (after < bestAfter) {
      best = a;
      bestAfter = after;
      reason = { key: 'gain', before, after, opensHand: meldCount === 0 };
    }
  }
  if (best.type === 'pass' && meldCount === 0 && before <= 2) reason = { key: 'keepConcealed', before };
  return { action: best, reason, before, after: bestAfter };
}

/** Hinweise auf erreichbare Sonderhände. */
export function specialHandHints(kinds, melds, rs, seatW, roundW) {
  const hints = [];
  const sh = shanten(kinds, melds.length, rs);
  if (melds.length === 0 && sh.orphans <= 3) hints.push({ form: 'thirteen_orphans', shanten: sh.orphans });
  if (melds.length === 0 && rs.sevenPairs && sh.sevenPairs <= 2 && sh.sevenPairs < sh.standard) hints.push({ form: 'seven_pairs', shanten: sh.sevenPairs });
  const pot = valuePotential(kinds, melds, seatW, roundW);
  if (pot.flush) hints.push({ form: pot.flush === 'full' ? 'full_flush' : 'half_flush', suit: pot.suit });
  else if (pot.suitShare >= 0.6) hints.push({ form: 'flush_possible', suit: pot.suit });
  const allPungs = kinds.length > 0 && melds.every((m) => m.type !== 'chow') && countsFromKinds(kinds).filter((c) => c >= 2).length >= 3;
  if (allPungs) hints.push({ form: 'all_pungs' });
  return hints;
}
