// Shanten-Berechnung (Abstand zur wartenden Hand).
//  -1 = fertig, 0 = wartend (tenpai), 1 = ein Stein davon entfernt usw.
//
// Standardform: 4 Sätze + Paar. Formel: 8 - 2·Sätze - Teilsätze - Paar,
// mit Sätze + Teilsätze ≤ 4 (offene Sätze zählen als fertige Sätze).
// Je Farbe werden alle Zerlegungen in (Sätze, Teilsätze, Paar) aufgezählt und
// über einen Cache wiederverwendet; die vier Gruppen werden dann kombiniert.

import { NUM_KINDS, countsFromKinds } from '../core/tiles.js';
import { ORPHAN_KINDS } from '../core/hand.js';

const suitCache = new Map();
const honourCache = new Map();

/** Pareto-Menge von {m, t, p} für eine Farbe (9 Zähler). */
function suitOptions(c) {
  const key = c.join('');
  let res = suitCache.get(key);
  if (res) return res;
  const found = new Map();
  const arr = c.slice();
  const rec = (i, m, t, p) => {
    while (i < 9 && arr[i] === 0) i++;
    if (i >= 9) {
      const k = m * 16 + t * 2 + p;
      if (!found.has(k)) found.set(k, { m, t, p });
      return;
    }
    // Stein isoliert lassen
    arr[i]--;
    rec(i, m, t, p);
    arr[i]++;
    // Pung
    if (arr[i] >= 3) {
      arr[i] -= 3;
      rec(i, m + 1, t, p);
      arr[i] += 3;
    }
    // Chow
    if (i <= 6 && arr[i + 1] > 0 && arr[i + 2] > 0) {
      arr[i]--; arr[i + 1]--; arr[i + 2]--;
      rec(i, m + 1, t, p);
      arr[i]++; arr[i + 1]++; arr[i + 2]++;
    }
    // Paar: als Kopf (p) oder als Teilsatz (t)
    if (arr[i] >= 2) {
      arr[i] -= 2;
      if (p === 0) rec(i, m, t, 1);
      rec(i, m, t + 1, p);
      arr[i] += 2;
    }
    // Zweier-Teilsätze: benachbart und mit Lücke
    if (i <= 7 && arr[i + 1] > 0) {
      arr[i]--; arr[i + 1]--;
      rec(i, m, t + 1, p);
      arr[i]++; arr[i + 1]++;
    }
    if (i <= 6 && arr[i + 2] > 0) {
      arr[i]--; arr[i + 2]--;
      rec(i, m, t + 1, p);
      arr[i]++; arr[i + 2]++;
    }
  };
  rec(0, 0, 0, 0);
  res = pareto([...found.values()]);
  suitCache.set(key, res);
  return res;
}

/** Honours: nur Pungs und Paare. */
function honourOptions(c) {
  const key = c.join('');
  let res = honourCache.get(key);
  if (res) return res;
  let m = 0, pairs = 0;
  for (const n of c) {
    if (n >= 3) m++;
    else if (n === 2) pairs++;
  }
  const opts = [];
  for (let head = 0; head <= Math.min(1, pairs); head++) {
    opts.push({ m, t: pairs - head, p: head });
  }
  res = pareto(opts);
  honourCache.set(key, res);
  return res;
}

function pareto(opts) {
  return opts.filter((a) => !opts.some((b) => b !== a && b.m >= a.m && b.t >= a.t && b.p >= a.p && (b.m > a.m || b.t > a.t || b.p > a.p)));
}

/**
 * Standard-Shanten aus Zählvektor (34) und Anzahl offener Sätze.
 * Gültig für 13 - 3·melds (+1) Steine.
 */
export function shantenStandard(counts, meldCount = 0) {
  const groups = [
    suitOptions(counts.slice(0, 9)),
    suitOptions(counts.slice(9, 18)),
    suitOptions(counts.slice(18, 27)),
    honourOptions(counts.slice(27, 34)),
  ];
  let best = 8;
  const combine = (gi, m, t, p) => {
    if (gi === 4) {
      const M = m + meldCount;
      const T = Math.min(t, 4 - M);
      const s = 8 - 2 * M - T - p;
      if (s < best) best = s;
      return;
    }
    for (const o of groups[gi]) {
      combine(gi + 1, m + o.m, t + o.t, Math.min(1, p + o.p));
    }
  };
  combine(0, 0, 0, 0);
  return best;
}

/** Thirteen Orphans: nur ohne offene Sätze. */
export function shantenOrphans(counts, meldCount = 0) {
  if (meldCount > 0) return Infinity;
  let unique = 0, pair = 0;
  for (const k of ORPHAN_KINDS) {
    if (counts[k] > 0) unique++;
    if (counts[k] >= 2) pair = 1;
  }
  return 13 - unique - pair;
}

/** Seven Pairs: nur ohne offene Sätze, verschiedene Paare. */
export function shantenSevenPairs(counts, meldCount = 0) {
  if (meldCount > 0) return Infinity;
  let pairs = 0, unique = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 2) pairs++;
    if (counts[k] >= 1) unique++;
  }
  return 6 - pairs + Math.max(0, 7 - unique);
}

/**
 * Shanten aller Formen. Liefert { standard, orphans, sevenPairs, min, form }.
 * concealedKinds: Arten der verdeckten Hand (3n+1 oder 3n+2 Steine).
 */
export function shanten(concealedKinds, meldCount = 0, ruleSet = null) {
  const counts = Array.isArray(concealedKinds) && concealedKinds.length === NUM_KINDS && concealedKinds.every((x) => x <= 4)
    ? concealedKinds
    : countsFromKinds(concealedKinds);
  const standard = shantenStandard(counts, meldCount);
  const orphans = shantenOrphans(counts, meldCount);
  const sevenPairs = ruleSet?.sevenPairs ? shantenSevenPairs(counts, meldCount) : Infinity;
  let min = standard, form = 'standard';
  if (orphans < min) { min = orphans; form = 'thirteen_orphans'; }
  if (sevenPairs < min) { min = sevenPairs; form = 'seven_pairs'; }
  return { standard, orphans, sevenPairs, min, form };
}
