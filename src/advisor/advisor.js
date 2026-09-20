// Berater: Empfehlung auf Zuruf (PLAN.md Abschnitt 8).
// Reine Logik; Texte kommen aus explain.js.

import { kindOf, countsFromKinds } from '../core/tiles.js';
import { seatWind, getLegalActions } from '../core/state.js';
import { shanten } from '../analysis/shanten.js';
import { evaluateDiscards, valuePotential } from '../analysis/evaluate.js';

export { valuePotential };

/**
 * Empfehlung für den Abwurf. Liefert
 * { best, alternatives, options, chance, hints } mit Einträgen
 * { kind, shanten, total, danger, potential, chance, keepsPair }.
 */
export function adviseDiscard(state, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const { options, progress } = evaluateDiscards(state, seat);
  const best = options[0];
  const alternatives = options.slice(1, 3);
  const hints = specialHandHints(kinds, melds, state.ruleSet, seatWind(state, seat), state.roundWind);
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
