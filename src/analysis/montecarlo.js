// Monte-Carlo-Simulation (PLAN.md 4.6, nach Mizukami/Tsuruoka): zufällige
// Restwände aus den unbekannten Steinen, eigene Züge greedy nach Ukeire,
// Rufe (Pung, Chow vom linken Nachbarn) bei Shanten-Gewinn, Gegner als
// Hazard-Modell aus ihrem geschätzten Tempo.
//
// simulate(state, seat, { runs, rng }) →
//   { complete, win, meanTurns, runs, stderr }
//   complete: P(eigene Hand fertig, bevor die Wand leer ist)
//   win:      P(eigene Hand fertig, bevor ein Gegner gewinnt)

import { NUM_KINDS, kindOf, isSuited, suitOf, rankOf, countsFromKinds } from '../core/tiles.js';
import { createRngState, nextFloat, shuffle } from '../core/rng.js';
import { shanten } from './shanten.js';
import { ukeire, discardOptions, visibleCounts } from './ukeire.js';
import { opponentTempo } from './danger.js';

/** Hazard je Gegnerzug aus Tempo und Spielfortschritt. */
export function opponentHazard(tempo, progress) {
  // Kalibriert an KI-gegen-KI-Simulationen: ein Gegner mittleren Tempos vollendet
  // in ~60 % der Hände innerhalb von ~17 Zügen (≈ 0,05 je Zug), schnellere öfter.
  return 0.02 + 0.06 * tempo + 0.02 * progress;
}

export function simulate(state, seat, { runs = 300, rng = null, seed = 'mc', allowCalls = true } = {}) {
  const p = state.players[seat];
  const rs = state.ruleSet;
  const melds0 = p.melds.length;
  const chows0 = p.melds.filter((m) => m.type === 'chow').length;
  const hand0 = p.hand.map(kindOf);
  const mustDiscard = (hand0.length - 2) % 3 === 0;
  const { visible } = visibleCounts(state, seat);
  const pool = [];
  for (let k = 0; k < NUM_KINDS; k++) for (let i = visible[k]; i < 4; i++) pool.push(k);
  const wallLeft = state.wall.living.length;
  const rounds = Math.floor(wallLeft / 4);
  const totalLiving = 136 - 53 - rs.deadWallSize;
  const others = [1, 2, 3].map((d) => state.players[(seat + d) % 4]); // rechts, gegenüber, links
  const tempos = others.map((q) => opponentTempo(state, q.seat));
  const r = rng ?? createRngState(seed);

  if (shanten(hand0, melds0, rs).min < 0) {
    return { complete: 1, win: 1, meanTurns: 0, runs, stderr: 0 };
  }

  let complete = 0, win = 0, turnsSum = 0;
  for (let run = 0; run < runs; run++) {
    const wall = shuffle(r, pool.slice());
    let hand = hand0.slice();
    let melds = melds0;
    let chows = chows0;
    let wi = 0;
    if (mustDiscard) hand = greedyDiscard(hand, melds, rs);
    let acc = acceptance(hand, melds, rs);
    let done = false;
    let oppTurn = null;
    let turns = 0;

    for (let t = 0; t < rounds && !done; t++) {
      const progress = 1 - (wallLeft - 4 * t) / totalLiving;
      // Drei Gegnerzüge: Hazard (Gewinn) und Abwurf aus dem Pool
      for (let o = 0; o < 3 && !done; o++) {
        if (oppTurn === null && nextFloat(r) < opponentHazard(tempos[o], progress)) oppTurn = turns;
        if (wi >= wall.length) break;
        const d = wall[wi++];
        if (acc.win.has(d)) { done = true; break; } // Gewinn auf Abwurf
        if (!allowCalls) continue;
        // Pung: Paar in der Hand und Shanten-Gewinn
        const cnt = count(hand, d);
        if (cnt >= 2 && acc.shanten > 0) {
          const rest = removeKinds(hand, [d, d]);
          if (shanten(rest, melds + 1, rs).min < acc.shanten) {
            hand = greedyDiscard(rest, melds + 1, rs);
            melds++;
            acc = acceptance(hand, melds, rs);
            continue;
          }
        }
        // Chow nur vom linken Nachbarn (o === 2) und nur, wenn die Hand schon offen ist oder nahe
        if (o === 2 && isSuited(d) && acc.shanten > 0 && acc.shanten <= 3 && chows < rs.maxChows && (melds > 0 || acc.shanten <= 2)) {
          const opt = chowPartners(hand, d);
          if (opt) {
            const rest = removeKinds(hand, opt);
            if (shanten(rest, melds + 1, rs).min < acc.shanten) {
              hand = greedyDiscard(rest, melds + 1, rs);
              melds++;
              chows++;
              acc = acceptance(hand, melds, rs);
            }
          }
        }
      }
      if (done || wi >= wall.length) break;
      // Eigener Zug
      const drawn = wall[wi++];
      turns++;
      if (acc.win.has(drawn)) { done = true; break; }
      if (acc.useful.has(drawn) || connected(hand, drawn)) {
        hand.push(drawn);
        hand = greedyDiscard(hand, melds, rs);
        acc = acceptance(hand, melds, rs);
        if (acc.shanten < 0) { done = true; break; }
      }
    }
    if (done) {
      complete++;
      turnsSum += turns;
      if (oppTurn === null || turns <= oppTurn) win++;
    }
  }
  const pc = complete / runs;
  return {
    complete: pc,
    win: win / runs,
    meanTurns: complete ? turnsSum / complete : null,
    runs,
    stderr: Math.sqrt(pc * (1 - pc) / runs),
  };
}

function count(hand, k) {
  let n = 0;
  for (const h of hand) if (h === k) n++;
  return n;
}

function removeKinds(hand, kinds) {
  const out = hand.slice();
  for (const k of kinds) out.splice(out.indexOf(k), 1);
  return out;
}

/** Zwei Handsteine, die mit d ein Chow bilden (bevorzugt beidseitiges Warten). */
function chowPartners(hand, d) {
  const s = suitOf(d);
  const rk = rankOf(d);
  const has = (rr) => rr >= 1 && rr <= 9 && hand.includes(s * 9 + rr - 1);
  for (const [a, b] of [[rk - 1, rk + 1], [rk - 2, rk - 1], [rk + 1, rk + 2]]) {
    if (has(a) && has(b)) return [s * 9 + a - 1, s * 9 + b - 1];
  }
  return null;
}

/** Stein hängt mit der Hand zusammen (gleiche Art oder Nachbar in der Farbe). */
function connected(hand, k) {
  for (const h of hand) {
    if (h === k) return true;
    if (isSuited(k) && isSuited(h) && suitOf(h) === suitOf(k) && Math.abs(h - k) <= 2) return true;
  }
  return false;
}

/** Bester Abwurf nach Shanten, dann Ukeire. */
function greedyDiscard(hand, melds, rs) {
  const opts = discardOptions(hand, melds, rs, null);
  const best = opts[0];
  const out = hand.slice();
  out.splice(out.indexOf(best.kind), 1);
  return out;
}

/** Nützliche Arten (senken Shanten) und Gewinn-Arten für eine 3n+1-Hand. */
function acceptance(hand, melds, rs) {
  const u = ukeire(hand, melds, rs, null);
  const useful = new Set(u.tiles.map((t) => t.kind));
  const win = new Set();
  if (u.shanten === 0) for (const k of useful) win.add(k);
  return { shanten: u.shanten, useful, win };
}

export { shanten, countsFromKinds };
