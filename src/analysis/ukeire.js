// Ukeire: welche Steine verbessern die Hand, gewichtet mit der Restverfügbarkeit.
import { NUM_KINDS, countsFromKinds, kindOf } from '../core/tiles.js';
import { shanten } from './shanten.js';

/**
 * Sichtbare Steine aus Sicht eines Sitzes: eigene Hand, alle Abwürfe,
 * alle offenen/verdeckten Sätze (Kongs verdeckt gelten als bekannt). Liefert
 * Zählvektor (34) und die Zahl der noch unbekannten Steine.
 */
export function visibleCounts(state, seat) {
  const v = new Array(NUM_KINDS).fill(0);
  let seen = 0;
  const add = (id) => {
    const k = kindOf(id);
    if (k < NUM_KINDS) { v[k]++; seen++; }
  };
  for (const p of state.players) {
    if (p.seat === seat) p.hand.forEach(add);
    p.discards.forEach(add);
    p.melds.forEach((m) => m.tiles.forEach(add));
  }
  return { visible: v, unseen: 136 - seen };
}

/** Restverfügbarkeit je Art. */
export function remainingCounts(visible) {
  return visible.map((n) => Math.max(0, 4 - n));
}

/**
 * Ukeire einer Hand mit 3n+1 Steinen.
 * Liefert { shanten, form, tiles: [{ kind, count }], total }.
 * remaining: Restverfügbarkeit (34), Standard 4 - eigene Hand.
 */
export function ukeire(concealedKinds, meldCount = 0, ruleSet = null, remaining = null) {
  const counts = countsFromKinds(concealedKinds);
  const rem = remaining ?? counts.map((n) => 4 - n);
  const base = shanten(counts, meldCount, ruleSet);
  const tiles = [];
  let total = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (rem[k] <= 0 || counts[k] >= 4) continue;
    counts[k]++;
    const s = shanten(counts, meldCount, ruleSet).min;
    counts[k]--;
    if (s < base.min) {
      tiles.push({ kind: k, count: rem[k] });
      total += rem[k];
    }
  }
  return { shanten: base.min, form: base.form, tiles, total };
}

/**
 * Bewertung aller Abwürfe einer Hand mit 3n+2 Steinen.
 * Liefert sortierte Liste { kind, shanten, form, tiles, total }:
 * zuerst kleinster Shanten, dann größtes Ukeire.
 */
export function discardOptions(concealedKinds, meldCount = 0, ruleSet = null, remaining = null) {
  const counts = countsFromKinds(concealedKinds);
  const out = [];
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] === 0) continue;
    counts[k]--;
    const rest = [];
    for (let j = 0; j < NUM_KINDS; j++) for (let n = 0; n < counts[j]; n++) rest.push(j);
    const u = ukeire(rest, meldCount, ruleSet, remaining);
    counts[k]++;
    out.push({ kind: k, ...u });
  }
  out.sort((a, b) => a.shanten - b.shanten || b.total - a.total);
  return out;
}

/**
 * Zweitordnungs-Ukeire für eine Hand mit 3n+1 Steinen: Summe über alle nützlichen
 * Steine k (gewichtet mit Restverfügbarkeit) des besten Ukeire nach Aufnahme von k
 * und bestem Abwurf. Maß für die Breite auf der nächsten Stufe.
 */
export function ukeire2(concealedKinds, meldCount = 0, ruleSet = null, remaining = null) {
  const u = ukeire(concealedKinds, meldCount, ruleSet, remaining);
  let total = 0;
  for (const tile of u.tiles) {
    const next = discardOptions([...concealedKinds, tile.kind], meldCount, ruleSet, remaining);
    total += tile.count * (next[0]?.total ?? 0);
  }
  return { shanten: u.shanten, first: u.total, second: total };
}
