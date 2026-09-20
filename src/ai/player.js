// KI-Spieler: chooseAction(state, seat, options) → Aktion.
// Nutzt ausschließlich getLegalActions und die Analyse-Engine.
// Deterministisch bei gleichem rng-Zustand.
//
// Stufen (options.difficulty):
//   'easy'    zufällige Abwürfe aus nicht-paarigen Steinen, ruft jeden Pung, keine Defensive
//   'medium'  Shanten/Ukeire, ruft nur bei Shanten-Gewinn, einfache Defensive spät im Spiel
//   'hard'    wie medium mit stärkerer Defensive und Wertgewichtung (Ausbau in Stufe 2)

import { kindOf, countsFromKinds } from '../core/tiles.js';
import { getLegalActions } from '../core/state.js';
import { shanten } from '../analysis/shanten.js';
import { discardOptions, visibleCounts, remainingCounts } from '../analysis/ukeire.js';
import { evaluateDiscards } from '../analysis/evaluate.js';
import { dangerOf } from '../analysis/danger.js';
import { nextFloat, nextInt } from '../core/rng.js';

export { dangerOf };

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Justierbare Konstanten (Vorbild AlphaJong). */
export const AI_PARAMS = {
  medium: {
    chowMaxShanten: 3, // Chow nur, wenn Hand höchstens so weit entfernt ist
    keepConcealedUntil: 2, // ohne offene Sätze: bei Shanten ≤ x nicht für Chow öffnen
    dangerWeight: 0.6, // Gewicht der Gefahr gegen Ukeire (spätes Spiel)
    ukeireTolerance: 0.75, // Kandidaten mit mind. x·bestes Ukeire gelten als gleichwertig
    mistakeRate: 0.05, // Anteil bewusst zweitbester Abwürfe
  },
  hard: {
    chowMaxShanten: 3,
    keepConcealedUntil: 2,
    dangerWeight: 1.0,
    ukeireTolerance: 0.85,
    mistakeRate: 0,
    // Schwer bewertet Abwürfe über evaluateDiscards (Chance, Wert, Gefahr)
    evalWeights: { valueWeight: 0.08, flushWeight: 0.15, dangerWeight: 0.9, honourPairBonus: 0.03 },
  },
};

export function chooseAction(state, seat, options = {}) {
  const difficulty = options.difficulty ?? 'medium';
  const rng = options.rng ?? state.rng;
  const legal = getLegalActions(state, seat);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const mj = legal.find((a) => a.type === 'mahjong');
  if (mj) return mj;

  switch (state.phase) {
    case 'discard':
      return difficulty === 'easy' ? easyDiscard(state, seat, legal, rng) : smartDiscard(state, seat, legal, rng, difficulty);
    case 'claiming':
      return difficulty === 'easy' ? easyClaim(legal) : smartClaim(state, seat, legal, difficulty);
    default:
      return legal[0];
  }
}

// ---------- Hilfen ----------

function handKinds(state, seat) {
  return state.players[seat].hand.map(kindOf);
}

function meldCount(state, seat) {
  return state.players[seat].melds.length;
}

function discardActionFor(legal, kind) {
  return legal.find((a) => a.type === 'discard' && kindOf(a.tile) === kind);
}

/** Spielphase 0 (Anfang) .. 1 (Wand leer). */
function progress(state) {
  const total = 136 - 53 - state.ruleSet.deadWallSize;
  return 1 - state.wall.living.length / total;
}


// ---------- Anfänger ----------

function easyDiscard(state, seat, legal, rng) {
  const kinds = handKinds(state, seat);
  const counts = countsFromKinds(kinds);
  const singles = legal.filter((a) => a.type === 'discard' && counts[kindOf(a.tile)] === 1);
  const pool = singles.length ? singles : legal.filter((a) => a.type === 'discard');
  return pool[nextInt(rng, pool.length)];
}

function easyClaim(legal) {
  return legal.find((a) => a.type === 'kong') ?? legal.find((a) => a.type === 'pung') ?? legal.find((a) => a.type === 'chow') ?? legal.find((a) => a.type === 'pass');
}

// ---------- Mittel / Schwer ----------

function smartDiscard(state, seat, legal, rng, difficulty) {
  const P = AI_PARAMS[difficulty] ?? AI_PARAMS.medium;
  const kinds = handKinds(state, seat);
  const melds = meldCount(state, seat);
  const rs = state.ruleSet;
  const { visible } = visibleCounts(state, seat);
  const remaining = remainingCounts(visible);
  const current = shanten(kinds, melds, rs).min;

  // Kongs: verdeckt nehmen, wenn der Shanten nicht steigt; Ergänzung ebenso.
  for (const a of legal) {
    if (a.type !== 'kong') continue;
    const rest = kinds.slice();
    const n = a.variant === 'concealed' ? 4 : 1;
    for (let i = 0; i < n; i++) rest.splice(rest.indexOf(a.kind), 1);
    const after = shanten(rest, a.variant === 'concealed' ? melds + 1 : melds, rs).min;
    if (after <= current) return a;
  }

  if (P.evalWeights) {
    const { options } = evaluateDiscards(state, seat, P.evalWeights);
    return discardActionFor(legal, options[0].kind) ?? legal.find((a) => a.type === 'discard');
  }

  const opts = discardOptions(kinds, melds, rs, remaining);
  const best = opts[0];
  const prog = progress(state);
  const candidates = opts.filter((o) => o.shanten === best.shanten && o.total >= best.total * P.ukeireTolerance);

  let pick = candidates[0];
  if (candidates.length > 1 && prog > 0.4) {
    // Spät im Spiel: unter gleichwertigen Kandidaten den sichersten wählen
    let bestScore = -Infinity;
    for (const c of candidates) {
      const d = dangerOf(state, seat, c.kind, remaining);
      const score = c.total / Math.max(1, best.total) - P.dangerWeight * prog * d;
      if (score > bestScore) { bestScore = score; pick = c; }
    }
  }
  if (P.mistakeRate > 0 && opts.length > 1 && nextFloat(rng) < P.mistakeRate) {
    pick = opts[1];
  }
  return discardActionFor(legal, pick.kind) ?? legal.find((a) => a.type === 'discard');
}

function smartClaim(state, seat, legal, difficulty) {
  const P = AI_PARAMS[difficulty] ?? AI_PARAMS.medium;
  const pass = legal.find((a) => a.type === 'pass');
  const kinds = handKinds(state, seat);
  const melds = meldCount(state, seat);
  const rs = state.ruleSet;
  const current = shanten(kinds, melds, rs).min;
  const calledKind = state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile);

  // Shanten nach dem Ruf: eigene Steine entfernen, ein Satz mehr, dann bester Abwurf.
  const afterClaim = (removeKinds) => {
    const rest = kinds.slice();
    for (const k of removeKinds) rest.splice(rest.indexOf(k), 1);
    // rest hat 3n+1 Steine mit melds+1 → Shanten direkt vergleichbar
    return shanten(rest, melds + 1, rs).min;
  };

  let best = pass;
  let bestGain = 0;
  for (const a of legal) {
    if (a.type === 'pass') continue;
    let after;
    if (a.type === 'pung') after = afterClaim([calledKind, calledKind]);
    else if (a.type === 'kong') after = afterClaim([calledKind, calledKind, calledKind]);
    else if (a.type === 'chow') {
      if (current > P.chowMaxShanten) continue;
      if (melds === 0 && current <= P.keepConcealedUntil) continue;
      after = afterClaim(a.kinds);
    } else continue;
    const gain = current - after;
    if (gain > bestGain || (gain === bestGain && gain > 0 && a.type === 'kong')) {
      bestGain = gain;
      best = a;
    }
  }
  return best;
}
