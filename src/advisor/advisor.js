// Berater: Empfehlung auf Zuruf (PLAN.md Abschnitt 8).
// Reine Logik; Texte kommen aus explain.js.

import { kindOf, countsFromKinds } from '../core/tiles.js';
import { seatWind, getLegalActions } from '../core/state.js';
import { shanten } from '../analysis/shanten.js';
import { evaluateDiscards, valuePotential } from '../analysis/evaluate.js';
import { formDiscardOptions, formKeepKinds } from '../analysis/forms.js';
import { callKeepsWinnable } from '../analysis/yaku.js';
import { isFuriten } from '../core/state.js';
import { ukeire, visibleCounts, remainingCounts } from '../analysis/ukeire.js';

export { valuePotential };

/**
 * Empfehlung für den Abwurf. Liefert
 * { best, alternatives, options, chance, hints } mit Einträgen
 * { kind, shanten, total, danger, potential, chance, keepsPair }.
 */
export function adviseDiscard(state, seat, { target = null } = {}) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const { options, progress } = evaluateDiscards(state, seat);
  const hints = specialHandHints(kinds, melds, state.ruleSet, seatWind(state, seat), state.roundWind);
  const free = options[0];
  const riichi = riichiAdvice(state, seat, free);
  const furiten = state.ruleSet.variant === 'riichi' && free.shanten <= 0 && isFuriten(state, { ...p, hand: p.hand.filter((id) => kindOf(id) !== free.kind || p.hand.indexOf(id) !== p.hand.findIndex((x) => kindOf(x) === free.kind)) });
  if (!target) return { best: free, alternatives: options.slice(1, 3), options, hints, progress, target: null, riichi, furiten };

  // Zielmodus: Distanz und Ukeire der Zielform entscheiden, Gefahr/Wert aus der freien Bewertung
  const byKind = new Map(options.map((o) => [o.kind, o]));
  const targetOpts = formDiscardOptions(state, seat, target).map((o) => ({
    ...byKind.get(o.kind),
    kind: o.kind,
    shanten: o.shanten,
    total: o.total,
    tiles: o.tiles,
    chance: o.chance,
  }));
  const reachable = targetOpts.length && Number.isFinite(targetOpts[0].shanten);
  const best = reachable ? targetOpts[0] : free;
  return {
    best,
    alternatives: (reachable ? targetOpts : options).slice(1, 3),
    options: reachable ? targetOpts : options,
    hints,
    progress,
    target,
    targetReachable: !!reachable,
    freeBest: free,
    keep: reachable ? formKeepKinds(state, seat, target) : new Set(),
    riichi,
    furiten,
  };
}

/** Riichi: Empfehlung zur Ansage, wenn der beste Abwurf die Hand wartend lässt. */
function riichiAdvice(state, seat, best) {
  if (state.ruleSet.variant !== 'riichi') return null;
  const legal = getLegalActions(state, seat);
  const option = legal.find((a) => a.type === 'riichi' && kindOf(a.tile) === best.kind) ?? legal.find((a) => a.type === 'riichi');
  if (!option) return null;
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const rest = kinds.slice();
  rest.splice(rest.indexOf(kindOf(option.tile)), 1);
  const { visible } = visibleCounts(state, seat);
  const u = ukeire(rest, p.melds.length, state.ruleSet, remainingCounts(visible));
  return { tile: option.tile, kind: kindOf(option.tile), waits: u.tiles.map((t) => t.kind), total: u.total };
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
  let blocked = null;
  for (const a of legal) {
    if (a.type === 'pass') continue;
    const rest = kinds.slice();
    const remove = a.type === 'pung' ? [calledKind, calledKind] : a.type === 'kong' ? [calledKind, calledKind, calledKind] : a.type === 'chow' ? a.kinds : null;
    if (!remove) continue;
    for (const k of remove) rest.splice(rest.indexOf(k), 1);
    const after = shanten(rest, meldCount + 1, rs).min;
    if (after < bestAfter) {
      const meldsAfter = [...p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open })), { type: a.type === 'chow' ? 'chow' : a.type, kinds: a.type === 'chow' ? [...a.kinds, calledKind] : [calledKind, calledKind, calledKind], open: true }];
      const w = callKeepsWinnable(state, seat, rest, meldsAfter);
      if (!w.ok) { blocked = w.reason; continue; }
      best = a;
      bestAfter = after;
      reason = { key: 'gain', before, after, opensHand: meldCount === 0 };
    }
  }
  if (best.type === 'pass' && blocked) reason = { key: blocked, before };
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
