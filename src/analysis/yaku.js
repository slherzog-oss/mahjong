// Grobe Einschätzung, ob eine (offene) Hand in Riichi noch ein Yaku bzw. in
// Hong Kong genug Fan erreichen kann. Für KI-Rufentscheidungen und Berater.
import { isSuited, isHonour, isDragon, isWind, isSimple, isMajor, suitOf, windIndex, countsFromKinds, NUM_KINDS } from '../core/tiles.js';

/** Zählt Yakuhai-Quellen: fertige Pungs/Kongs plus Paare (mögliche Pungs). */
function yakuhaiSources(kinds, melds, seatW, roundW) {
  const counts = countsFromKinds(kinds);
  let sure = 0, possible = 0;
  const isYakuhai = (k) => isDragon(k) || (isWind(k) && (windIndex(k) === seatW || windIndex(k) === roundW));
  for (const m of melds) if (m.type !== 'chow' && isYakuhai(m.kinds[0])) sure += isWind(m.kinds[0]) && windIndex(m.kinds[0]) === seatW && windIndex(m.kinds[0]) === roundW ? 2 : 1;
  for (let k = 27; k < NUM_KINDS; k++) {
    if (!isYakuhai(k)) continue;
    if (counts[k] >= 3) sure++;
    else if (counts[k] === 2) possible++;
  }
  return { sure, possible };
}

function suitShare(kinds, melds) {
  const all = [...kinds, ...melds.flatMap((m) => m.kinds)];
  const suits = [0, 0, 0];
  let honours = 0;
  for (const k of all) {
    if (isSuited(k)) suits[suitOf(k)]++;
    else if (isHonour(k)) honours++;
  }
  const max = Math.max(...suits);
  return { flushShare: (max + honours) / Math.max(1, all.length), pureShare: max / Math.max(1, all.length), total: all.length };
}

/**
 * Riichi: kann die Hand mit den Sätzen `melds` (nach einem Ruf) noch ein Yaku
 * haben? kinds = verdeckte Steine nach dem Ruf.
 */
export function openYakuPossible(kinds, melds, seatW, roundW, rs) {
  const all = [...kinds, ...melds.flatMap((m) => m.kinds)];
  if (rs.kuitan !== false && all.every(isSimple)) return true; // Tanyao
  const y = yakuhaiSources(kinds, melds, seatW, roundW);
  if (y.sure >= 1 || y.possible >= 1) return true; // Yakuhai
  const { flushShare } = suitShare(kinds, melds);
  if (flushShare >= 0.75) return true; // Honitsu/Chinitsu
  const counts = countsFromKinds(kinds);
  const pairsOrPungs = counts.filter((c) => c >= 2).length;
  if (melds.every((m) => m.type !== 'chow') && pairsOrPungs >= 2) return true; // Toitoi
  const allMajorGroups = melds.every((m) => m.kinds.some(isMajor)) && kinds.every((k) => isMajor(k) || (isSuited(k) && ((k % 9) <= 2 || (k % 9) >= 6)));
  if (allMajorGroups) return true; // Chanta/Junchan/Honroutou
  return false;
}

/**
 * Hong Kong: grobe Fan-Prognose einer Hand (Pungs von Yakuhai, Farbe, Nur-Pungs,
 * Selbstzug/verdeckt nicht mitgezählt).
 */
export function fanPotentialHK(kinds, melds, seatW, roundW) {
  const y = yakuhaiSources(kinds, melds, seatW, roundW);
  let fan = y.sure + y.possible;
  const { flushShare, pureShare } = suitShare(kinds, melds);
  if (pureShare >= 0.8) fan += 7;
  else if (flushShare >= 0.75) fan += 3;
  const counts = countsFromKinds(kinds);
  const pairsOrPungs = counts.filter((c) => c >= 2).length;
  if (melds.every((m) => m.type !== 'chow') && pairsOrPungs + melds.length >= 3) fan += 3;
  return fan;
}

/** Darf/sollte ein Ruf erfolgen? Liefert { ok, reason } je Variante. */
export function callKeepsWinnable(state, seat, kindsAfter, meldsAfter) {
  const rs = state.ruleSet;
  const seatW = (seat - state.dealer + 4) % 4;
  if (rs.variant === 'riichi') {
    const ok = openYakuPossible(kindsAfter, meldsAfter, seatW, state.roundWind, rs);
    return { ok, reason: ok ? null : 'noYaku' };
  }
  if (rs.variant === 'hongkong' && (rs.minFan ?? 0) > 0) {
    const fan = fanPotentialHK(kindsAfter, meldsAfter, seatW, state.roundWind);
    const ok = fan + 1 >= rs.minFan; // Selbstzug kann ein Fan bringen
    return { ok, reason: ok ? null : 'lowFan' };
  }
  return { ok: true, reason: null };
}
