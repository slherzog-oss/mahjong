// Zielformen: Distanz (Shanten-artig), nützliche Steine, Chance und erwarteter
// Wert je Handform (PLAN.md 4.2, 4.6, 8.3). Grundlage für das Panel
// "Mögliche Blätter", das Spielziel und die Lexikon-Hinweise.
import {
  NUM_KINDS, kindOf, kindByName, isSuited, isHonour, isDragon, isWind, isMajor, isTerminal,
  suitOf, countsFromKinds,
} from '../core/tiles.js';
import { seatWind } from '../core/state.js';
import { shantenStandard, shantenOrphans, shantenSevenPairs } from './shanten.js';
import { visibleCounts, remainingCounts } from './ukeire.js';
import { completionChance, drawsLeftFor } from './probability.js';

const GREEN = new Set(['2b', '3b', '4b', '6b', '8b', 'Gd'].map(kindByName));

/** Formen mit Anzeige-Reihenfolge, Wertschätzung (Punkte vor Kappung) und Lexikon-ID. */
export const FORMS = [
  { id: 'standard', lexicon: 'basics_sets', value: (rs) => 32 },
  { id: 'concealed', lexicon: 'dbl_concealed', value: (rs) => 40 * 2 },
  { id: 'all_pungs', lexicon: 'dbl_no_chow', value: (rs) => 56 * 2 },
  { id: 'half_flush', lexicon: 'dbl_half_flush', value: (rs) => 40 * 2 },
  { id: 'full_flush', lexicon: 'dbl_full_flush', value: (rs) => Math.min(rs.limit, 40 * 8) },
  { id: 'terminals_honours', lexicon: 'dbl_terminals_honours', value: (rs) => 64 * 2 },
  { id: 'dragons', lexicon: 'dbl_little_three_dragons', value: (rs) => rs.limit },
  { id: 'winds', lexicon: 'dbl_little_four_winds', value: (rs) => rs.limit },
  { id: 'all_pungs_concealed', lexicon: 'lim_hidden_treasure', value: (rs) => rs.limit },
  { id: 'full_flush_concealed', lexicon: 'lim_concealed_full_flush', value: (rs) => rs.limit },
  { id: 'all_honours', lexicon: 'lim_all_honours', value: (rs) => rs.limit },
  { id: 'terminals', lexicon: 'lim_heads_and_tails', value: (rs) => rs.limit },
  { id: 'all_green', lexicon: 'lim_all_green', value: (rs) => rs.limit },
  { id: 'nine_gates', lexicon: 'lim_nine_gates', value: (rs) => rs.limit },
  { id: 'thirteen_orphans', lexicon: 'lim_thirteen_orphans', value: (rs) => rs.limit },
  { id: 'seven_pairs', lexicon: 'lim_seven_pairs', value: (rs) => rs.limit, option: 'sevenPairs' },
];

export const FORM_IDS = FORMS.map((f) => f.id);

const openMelds = (melds) => melds.filter((m) => m.open).length;

function filterCounts(counts, keep) {
  const c = new Array(NUM_KINDS).fill(0);
  for (let k = 0; k < NUM_KINDS; k++) if (keep(k)) c[k] = counts[k];
  return c;
}

/** Shanten für Nur-Pung-Hände (Pungs + Paare, keine Chows). */
function shantenPungs(counts, meldCount) {
  let pungs = 0, pairs = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 3) pungs++;
    else if (counts[k] === 2) pairs++;
  }
  const M = Math.min(4, pungs + meldCount);
  const p = pairs > 0 ? 1 : 0;
  const t = Math.min(Math.max(0, pairs - p), 4 - M);
  return 8 - 2 * M - t - p;
}

/** Distanz für "Pungs bestimmter Arten + Paar": needed = fehlende Steine der Pflicht-Pungs. */
function shantenHonourPungs(counts, melds, required) {
  let needed = 0;
  const meldKinds = new Set(melds.map((m) => m.kinds[0]));
  for (const k of required) {
    if (meldKinds.has(k)) continue;
    needed += Math.max(0, 3 - counts[k]);
  }
  const rest = counts.slice();
  for (const k of required) rest[k] = 0;
  const restMelds = melds.filter((m) => !required.includes(m.kinds[0])).length;
  // Restliche Sätze: 4 - required.length, davon restMelds fertig
  const restSets = 4 - required.length - restMelds;
  let best = Infinity;
  if (restSets <= 0) {
    // Nur noch das Paar
    let pair = 0;
    for (let k = 0; k < NUM_KINDS; k++) if (rest[k] >= 2) pair = 1;
    best = needed + (pair ? 0 : 1) - 1;
  } else {
    // Standardformel auf dem Rest mit 4 - restSets bereits "fertigen" Sätzen
    best = needed + shantenStandard(rest, 4 - restSets);
  }
  return best;
}

function shantenNineGates(counts, melds) {
  if (melds.length > 0) return Infinity;
  let best = Infinity;
  for (let s = 0; s < 3; s++) {
    const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let missing = 0;
    let total = 0;
    for (let r = 0; r < 9; r++) {
      const c = counts[s * 9 + r];
      total += c;
      missing += Math.max(0, pattern[r] - c);
    }
    // Der 14. Stein ist beliebig aus der Farbe: fehlt er, ist ein weiterer Stein nötig
    const extra = total - (13 - missing);
    const need = missing + (extra >= 1 ? 0 : 1);
    best = Math.min(best, need - 1);
  }
  return best;
}

/**
 * Distanz einer Hand zu einer Form. Infinity = unmöglich (z. B. offene Sätze
 * bei verdeckten Formen).
 */
export function formDistance(formId, kinds, melds, rs) {
  const counts = countsFromKinds(kinds);
  const mc = melds.length;
  const open = openMelds(melds);
  const meldAll = (pred) => melds.every((m) => m.kinds.every(pred));
  const meldPungs = melds.every((m) => m.type !== 'chow');
  switch (formId) {
    case 'standard': return shantenStandard(counts, mc);
    case 'concealed': return open ? Infinity : shantenStandard(counts, mc);
    case 'all_pungs': return meldPungs ? shantenPungs(counts, mc) : Infinity;
    case 'all_pungs_concealed': return meldPungs && !open ? shantenPungs(counts, mc) : Infinity;
    case 'half_flush':
    case 'full_flush':
    case 'full_flush_concealed': {
      if (formId === 'full_flush_concealed' && open) return Infinity;
      const withHonours = formId === 'half_flush';
      let best = Infinity;
      for (let s = 0; s < 3; s++) {
        if (!meldAll((k) => (isSuited(k) && suitOf(k) === s) || (withHonours && isHonour(k)))) continue;
        const c = filterCounts(counts, (k) => (isSuited(k) && suitOf(k) === s) || (withHonours && isHonour(k)));
        best = Math.min(best, shantenStandard(c, mc));
      }
      return best;
    }
    case 'terminals_honours': return meldAll(isMajor) && meldPungs ? shantenPungs(filterCounts(counts, isMajor), mc) : Infinity;
    case 'terminals': return meldAll(isTerminal) && meldPungs ? shantenPungs(filterCounts(counts, isTerminal), mc) : Infinity;
    case 'all_honours': return meldAll(isHonour) && meldPungs ? shantenPungs(filterCounts(counts, isHonour), mc) : Infinity;
    case 'dragons': return meldAll((k) => true) ? shantenHonourPungs(counts, melds, [31, 32, 33]) : Infinity;
    case 'winds': return shantenHonourPungs(counts, melds, [27, 28, 29, 30]);
    case 'all_green': return meldAll((k) => GREEN.has(k)) ? shantenStandard(filterCounts(counts, (k) => GREEN.has(k)), mc) : Infinity;
    case 'nine_gates': return shantenNineGates(counts, melds);
    case 'thirteen_orphans': return shantenOrphans(counts, mc);
    case 'seven_pairs': return rs.sevenPairs ? shantenSevenPairs(counts, mc) : Infinity;
    default: return Infinity;
  }
}

/** Nützliche Steine für eine Form (Hand mit 3n+1 Steinen). */
export function formUkeire(formId, kinds, melds, rs, remaining) {
  const base = formDistance(formId, kinds, melds, rs);
  if (!Number.isFinite(base)) return { shanten: Infinity, total: 0, tiles: [] };
  const counts = countsFromKinds(kinds);
  const tiles = [];
  let total = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (remaining[k] <= 0 || counts[k] >= 4) continue;
    const d = formDistance(formId, [...kinds, k], melds, rs);
    if (d < base) {
      tiles.push({ kind: k, count: remaining[k] });
      total += remaining[k];
    }
  }
  return { shanten: base, total, tiles };
}

/**
 * Analyse aller Formen für einen Sitz. Bei 3n+2 Steinen wird je Form der beste
 * Abwurf angenommen. Liefert Liste sortiert nach erwartetem Wert:
 * { form, shanten, ukeire, chance, value, ev, lexicon, discard }.
 */
export function analyzeForms(state, seat, { maxShanten = 6 } = {}) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const rs = state.ruleSet;
  const { visible, unseen } = visibleCounts(state, seat);
  const remaining = remainingCounts(visible);
  const drawsLeft = drawsLeftFor(state.wall.living.length);
  const mustDiscard = (kinds.length - 2) % 3 === 0;
  const out = [];
  for (const f of FORMS) {
    if (f.option && !rs[f.option]) continue;
    let best = null;
    if (mustDiscard) {
      const seen = new Set();
      for (const k of kinds) {
        if (seen.has(k)) continue;
        seen.add(k);
        const rest = kinds.slice();
        rest.splice(rest.indexOf(k), 1);
        const u = formUkeire(f.id, rest, melds, rs, remaining);
        if (!Number.isFinite(u.shanten)) continue;
        if (!best || u.shanten < best.shanten || (u.shanten === best.shanten && u.total > best.total)) best = { ...u, discard: k };
      }
    } else {
      const u = formUkeire(f.id, kinds, melds, rs, remaining);
      if (Number.isFinite(u.shanten)) best = { ...u, discard: null };
    }
    if (!best || best.shanten > maxShanten) continue;
    const chance = completionChance({ shanten: best.shanten, ukeireTotal: best.total, unseen, drawsLeft });
    const value = f.value(rs);
    out.push({ form: f.id, lexicon: f.lexicon, shanten: best.shanten, ukeire: best.total, tiles: best.tiles, chance, value, ev: chance * value, discard: best.discard });
  }
  out.sort((a, b) => b.ev - a.ev || a.shanten - b.shanten);
  return out;
}

/**
 * Abwurfoptionen für eine Zielform (Hand mit 3n+2): je Kandidat Distanz und
 * Ukeire der Form, sortiert. Für den Berater im Zielmodus.
 */
export function formDiscardOptions(state, seat, formId) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const melds = p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const rs = state.ruleSet;
  const { visible, unseen } = visibleCounts(state, seat);
  const remaining = remainingCounts(visible);
  const drawsLeft = drawsLeftFor(state.wall.living.length);
  const seen = new Set();
  const out = [];
  for (const k of kinds) {
    if (seen.has(k)) continue;
    seen.add(k);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(k), 1);
    const u = formUkeire(formId, rest, melds, rs, remaining);
    const chance = Number.isFinite(u.shanten) ? completionChance({ shanten: u.shanten, ukeireTotal: u.total, unseen, drawsLeft }) : 0;
    out.push({ kind: k, shanten: u.shanten, total: u.total, tiles: u.tiles, chance });
  }
  out.sort((a, b) => a.shanten - b.shanten || b.total - a.total);
  return out;
}

/** Steine, die für eine Zielform gehalten werden sollten (Teil einer besten Zerlegung). */
export function formKeepKinds(state, seat, formId) {
  const opts = formDiscardOptions(state, seat, formId);
  if (!opts.length || !Number.isFinite(opts[0].shanten)) return new Set();
  const best = opts[0].shanten;
  // Entbehrlich sind alle Arten, deren Abwurf die Distanz nicht verschlechtert
  const expendable = new Set(opts.filter((o) => o.shanten === best).map((o) => o.kind));
  const kinds = state.players[seat].hand.map(kindOf);
  return new Set(kinds.filter((k) => !expendable.has(k)));
}

export { seatWind };
