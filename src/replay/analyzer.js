// Post-Game-Analyse (PLAN.md 10.1): Replay einer Partie, Vergleich jeder
// menschlichen Entscheidung mit der Empfehlung, Fehlerklassen, Chance-Verlauf.
//
// analyzeGame({ seed, ruleSet, humanSeat, actions }) → {
//   hands: [{ hand, decisions: [...], curve: [...], result }],
//   summary: { decisions, ok, inaccuracies, mistakes, blunders, accuracy }
// }
//
// Entscheidung: { index, hand, turn, type, seat, chosen, best, chosenChance,
//   bestChance, delta, cls, kinds, melds, explanation }

import { createGame, applyAction, rigDeal, seatsToAct } from '../core/state.js';
import { kindOf } from '../core/tiles.js';
import { evaluateDiscards } from '../analysis/evaluate.js';
import { adviseClaim } from '../advisor/advisor.js';
import { visibleCounts, remainingCounts, ukeire } from '../analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../analysis/probability.js';

export const CLASSES = ['ok', 'inaccuracy', 'mistake', 'blunder'];
// Relativer Verlust an Fertigstellungschance (0..1) bzw. Score-Differenz
export const THRESHOLDS = { inaccuracy: 0.05, mistake: 0.15, blunder: 0.35 };

const worse = (a, b) => (CLASSES.indexOf(a) >= CLASSES.indexOf(b) ? a : b);

export function classify(delta) {
  if (delta >= THRESHOLDS.blunder) return 'blunder';
  if (delta >= THRESHOLDS.mistake) return 'mistake';
  if (delta >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  return 'ok';
}

/** Fertigstellungschance eines Sitzes im aktuellen Zustand (3n+1 oder 3n+2). */
export function chanceOf(state, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  if (kinds.length === 0) return 0;
  const { visible, unseen } = visibleCounts(state, seat);
  const rem = remainingCounts(visible);
  const drawsLeft = drawsLeftFor(state.wall.living.length);
  if ((kinds.length - 2) % 3 === 0) {
    const { options } = evaluateDiscards(state, seat);
    return options[0]?.chance ?? 0;
  }
  const u = ukeire(kinds, p.melds.length, state.ruleSet, rem);
  if (u.shanten < 0) return 1;
  return completionChance({ shanten: u.shanten, ukeireTotal: u.total, unseen, drawsLeft });
}

export function analyzeGame(record, { seat = record.humanSeat ?? 0, onProgress = null } = {}) {
  let s = createGame({ seed: record.seed, ruleSet: record.ruleSet, humanSeat: record.humanSeat ?? 0 });
  const hands = [];
  let current = null;
  const summary = { decisions: 0, trivial: 0, ok: 0, inaccuracy: 0, mistake: 0, blunder: 0, accuracy: 1 };

  const startHand = () => {
    current = { hand: s.handNumber, decisions: [], curve: [], result: null };
    hands.push(current);
  };

  record.actions.forEach((a, index) => {
    if (a.type === 'rigDeal') {
      s = rigDeal(s, a.seat, a.kinds);
      current.curve.push({ index, turn: s.turn, chance: chanceOf(s, seat) });
      return;
    }
    const before = s;
    let decision = null;
    if (a.seat === seat && before.phase === 'discard' && (a.type === 'discard' || a.type === 'mahjong' || a.type === 'kong')) {
      decision = analyzeDiscardDecision(before, a, seat);
    } else if (a.seat === seat && before.phase === 'claiming' && ['pass', 'chow', 'pung', 'kong', 'mahjong'].includes(a.type)) {
      decision = analyzeClaimDecision(before, a, seat);
    }
    s = applyAction(s, a);
    if (a.type === 'startHand') startHand();
    if (decision) {
      decision.index = index;
      decision.hand = current.hand;
      decision.turn = before.turn;
      current.decisions.push(decision);
      if (decision.trivial) summary.trivial++;
      else {
        summary.decisions++;
        summary[decision.cls]++;
      }
    }
    if (current && a.seat === seat && (a.type === 'discard' || a.type === 'draw' || decision)) {
      current.curve.push({ index, turn: s.turn, chance: chanceOf(s, seat) });
    }
    if (current && (s.phase === 'handOver') && !current.result) {
      current.result = s.result;
      current.scores = s.players.map((p) => p.score);
    }
    onProgress?.(index + 1, record.actions.length);
  });
  summary.accuracy = summary.decisions ? (summary.ok + 0.5 * summary.inaccuracy) / summary.decisions : 1;
  return { hands, summary, seat };
}

function analyzeDiscardDecision(state, action, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const base = { type: action.type, seat, kinds, melds, target: p.target ?? null };
  const { options } = evaluateDiscards(state, seat);
  const best = options[0];
  if (action.type === 'mahjong') {
    return { ...base, chosen: null, best: null, chosenChance: 1, bestChance: 1, delta: 0, cls: 'ok' };
  }
  if (action.type === 'kong') {
    // Kong-Entscheidung: neutral bewertet (Ersatzstein), außer die Hand war fertig
    return { ...base, chosen: action.kind, best: null, chosenChance: best?.chance ?? 0, bestChance: best?.chance ?? 0, delta: 0, cls: 'ok' };
  }
  const chosenKind = kindOf(action.tile);
  const chosen = options.find((o) => o.kind === chosenKind) ?? best;
  // Relativer Chancenverlust und Score-Differenz (Gefahr, Wert); Shanten-Verlust als Mindestklasse
  const rel = best.chance > 0 ? Math.max(0, (best.chance - chosen.chance) / best.chance) : 0;
  const scoreDelta = Math.max(0, (best.score ?? 0) - (chosen.score ?? 0));
  const delta = Math.min(1, Math.max(rel, scoreDelta));
  let cls = classify(delta);
  const shantenLoss = chosen.shanten - best.shanten;
  if (rel > 0 && shantenLoss >= 2) cls = worse(cls, 'blunder');
  else if (rel > 0 && shantenLoss === 1) cls = worse(cls, 'mistake');
  const missedWin = options.some((o) => o.shanten < 0) && chosen.shanten >= 0;
  return {
    ...base,
    chosen: chosenKind,
    best: best.kind,
    chosenChance: chosen.chance,
    bestChance: best.chance,
    chosenShanten: chosen.shanten,
    bestShanten: best.shanten,
    chosenUkeire: chosen.total,
    bestUkeire: best.total,
    chosenDanger: chosen.danger,
    bestDanger: best.danger,
    delta,
    cls: missedWin ? 'blunder' : cls,
    alternatives: options.slice(0, 3).map((o) => ({ kind: o.kind, chance: o.chance, shanten: o.shanten, total: o.total, danger: o.danger })),
  };
}

function analyzeClaimDecision(state, action, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const adv = adviseClaim(state, seat);
  const recommended = adv.action.type;
  const chosen = action.type;
  let delta = 0;
  let cls = 'ok';
  if (recommended === 'mahjong' && chosen !== 'mahjong') { delta = 1; cls = 'blunder'; }
  else if (recommended !== chosen) {
    const gain = Math.max(0, adv.before - adv.after);
    if (recommended !== 'pass' && chosen === 'pass') { delta = 0.05 * gain; cls = classify(delta); }
    else if (recommended === 'pass' && chosen !== 'pass') { delta = 0.04; cls = 'inaccuracy'; }
  }
  return {
    type: 'claim', seat, kinds, melds, target: p.target ?? null,
    chosen, best: recommended, reason: adv.reason, before: adv.before, after: adv.after,
    chosenChance: null, bestChance: null, delta, cls,
    trivial: recommended === 'pass' && chosen === 'pass',
    calledKind: state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile),
  };
}
