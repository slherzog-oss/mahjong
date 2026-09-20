// Scoring nach Millington (Chinese Classical). Siehe PLAN.md Abschnitt 3.
//
// scoreHand(input, ruleSet) → ScoreSheet für einen Spieler
// scoreRound(state, ruleSet?) → { sheets: ScoreSheet[4], payments: number[4][4] }
//
// Eingabe scoreHand:
//   concealed: Arten der verdeckten Hand (beim Gewinner inkl. Gewinnstein)
//   melds: [{ type, kinds, open }]
//   bonus: Arten der Bonussteine
//   seatWind: 0..3, roundWind: 0..3
//   winner: boolean; dazu bei Gewinner: winningKind, selfDraw, lastWallTile,
//   kongReplacement, robbedKong, heavenly, earthly, twofoldFortune

import {
  kindByName, isDragon, isWind, isMajor, isHonour, isFlower, isSeason, isSuited,
  bonusOwner, windIndex, countsFromKinds, NUM_KINDS,
} from '../core/tiles.js';
import { evaluateHand, waitingKinds, flushType, allTerminals, allHonours, allMajor } from '../core/hand.js';
import { SCORE_RULES } from './table.js';

const ALL_GREEN = new Set(['2b', '3b', '4b', '6b', '8b', 'Gd'].map(kindByName));

function line(id, extra = {}) {
  const r = SCORE_RULES[id];
  return { id, kind: r.kind, value: r.value, ...extra };
}

function setLine(type, kind, open) {
  const major = isMajor(kind) ? 'major' : 'simple';
  const vis = open ? 'open' : 'closed';
  return line(`${type}_${major}_${vis}`, { kinds: [kind] });
}

/** Punkte- und Verdopplungszeilen für Sätze und Paare (Gewinner wie Verlierer). */
function scoreSets(sets, pair, seatWind, roundWind) {
  const lines = [];
  for (const s of sets) {
    if (s.type === 'chow') continue;
    const k = s.kinds[0];
    lines.push(setLine(s.type, k, s.open));
    if (isDragon(k)) lines.push(line('dbl_pung_dragon', { kinds: [k] }));
    if (isWind(k)) {
      if (windIndex(k) === seatWind) lines.push(line('dbl_pung_own_wind', { kinds: [k] }));
      if (windIndex(k) === roundWind) lines.push(line('dbl_pung_round_wind', { kinds: [k] }));
    }
  }
  if (pair !== null && pair !== undefined) {
    if (isDragon(pair)) lines.push(line('pair_dragon', { kinds: [pair] }));
    if (isWind(pair)) {
      if (windIndex(pair) === seatWind) lines.push(line('pair_own_wind', { kinds: [pair] }));
      if (windIndex(pair) === roundWind) lines.push(line('pair_round_wind', { kinds: [pair] }));
    }
  }
  return lines;
}

function scoreBonus(bonus, seatWind) {
  const lines = [];
  let ownFlower = false, ownSeason = false, flowers = 0, seasons = 0;
  for (const b of bonus) {
    if (isFlower(b)) {
      flowers++;
      lines.push(line('flower', { kinds: [b] }));
      if (bonusOwner(b) === seatWind) ownFlower = true;
    } else if (isSeason(b)) {
      seasons++;
      lines.push(line('season', { kinds: [b] }));
      if (bonusOwner(b) === seatWind) ownSeason = true;
    }
  }
  if (ownFlower && ownSeason) lines.push(line('dbl_own_flower_season'));
  if (flowers === 4) lines.push(line('dbl_all_flowers'));
  if (seasons === 4) lines.push(line('dbl_all_seasons'));
  return lines;
}

function totals(lines, ruleSet) {
  let points = 0, doubles = 0, limits = 0;
  for (const l of lines) {
    if (l.kind === 'points') points += l.value;
    else if (l.kind === 'double') doubles += l.value;
    else if (l.kind === 'limit') limits = Math.max(limits, l.value);
  }
  let total = limits > 0 ? Math.round(ruleSet.limit * limits) : Math.min(points * 2 ** doubles, ruleSet.limit);
  return { points, doubles, limit: limits > 0, total };
}

// ---------- Verlierer ----------

function scoreLoser(input, ruleSet) {
  const { concealed, melds, bonus, seatWind, roundWind } = input;
  const counts = countsFromKinds(concealed);
  const sets = melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  const pairs = [];
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 3) sets.push({ type: 'pung', kinds: [k, k, k], open: false });
    else if (counts[k] === 2) pairs.push(k);
  }
  const lines = [];
  lines.push(...scoreSets(sets, null, seatWind, roundWind));
  for (const p of pairs) lines.push(...scoreSets([], p, seatWind, roundWind));
  lines.push(...scoreBonus(bonus, seatWind));
  if (ruleSet.loserHandDoubles) {
    const all = [...concealed, ...melds.flatMap((m) => m.kinds)];
    const ft = flushType(all);
    if (ft === 'full') lines.push(line('dbl_full_flush'));
    else if (ft === 'half') lines.push(line('dbl_half_flush'));
  }
  return { winner: false, lines, ...totals(lines, ruleSet) };
}

// ---------- Gewinner ----------

/**
 * Für den Gewinner werden alle Zerlegungen und alle Zuordnungen des Gewinnsteins
 * (Paar, Pung, Chow) bewertet; die höchste Wertung zählt.
 */
function scoreWinner(input, ruleSet) {
  const { concealed, melds, bonus, seatWind, roundWind, winningKind, selfDraw } = input;
  const ev = evaluateHand(concealed, melds, ruleSet);
  if (!ev.win) throw new Error('scoreWinner: Hand ist nicht vollständig');

  const allKinds = [...concealed, ...melds.flatMap((m) => m.kinds)];
  const before = concealed.slice();
  const wi = before.indexOf(winningKind);
  if (wi >= 0) before.splice(wi, 1);
  const waits = waitingKinds(before, melds, ruleSet);
  const onlyPossible = waits.length === 1;

  const common = [];
  common.push(line('mahjong'));
  if (selfDraw) common.push(line('win_self_draw'));
  if (input.lastWallTile) common.push(line('win_last_wall'));
  if (input.kongReplacement) common.push(line('win_kong_replacement'));
  if (input.robbedKong) common.push(line('win_rob_kong'));
  if (onlyPossible) common.push(line('win_only_possible'));
  common.push(...scoreBonus(bonus, seatWind));

  // Kontext-Limits (unabhängig von der Handform)
  const contextLimits = [];
  if (input.heavenly) contextLimits.push(line('lim_heavenly'));
  if (input.earthly) contextLimits.push(line('lim_earthly'));
  if (input.kongReplacement && winningKind === kindByName('5c')) contextLimits.push(line('lim_plum_blossom'));
  if (input.lastWallTile && selfDraw && winningKind === kindByName('1c')) contextLimits.push(line('lim_plucking_moon'));
  if (input.robbedKong && winningKind === kindByName('2b')) contextLimits.push(line('lim_scratching_pole'));
  if (input.twofoldFortune) contextLimits.push(line('lim_twofold_fortune'));
  if (ev.forms.includes('thirteen_orphans')) contextLimits.push(line('lim_thirteen_orphans'));
  if (ev.forms.includes('nine_gates')) contextLimits.push(line('lim_nine_gates'));
  if (ev.forms.includes('seven_pairs')) contextLimits.push(line('lim_seven_pairs'));

  const candidates = [];

  if (ev.forms.includes('standard')) {
    for (const d of ev.decompositions) {
      // Zuordnung des Gewinnsteins: Index der Gruppe (Paar = -1)
      const groups = [];
      if (d.pair === winningKind) groups.push(-1);
      d.sets.forEach((s, i) => {
        if (s.kinds.includes(winningKind)) groups.push(i);
      });
      if (groups.length === 0) groups.push(null); // Gewinnstein in offenem Satz (Kong-Raub o. Ä.)
      for (const g of groups) candidates.push(scoreStandard(d, g));
    }
  }
  if (candidates.length === 0) {
    // Nur Sonderform (z. B. Thirteen Orphans)
    candidates.push({ lines: [], sets: [], pair: null });
  }

  let best = null;
  for (const c of candidates) {
    const lines = [...common, ...contextLimits, ...c.lines];
    const t = totals(lines, ruleSet);
    if (!best || t.total > best.total) best = { winner: true, lines, sets: c.sets, pair: c.pair, ...t };
  }
  return best;

  function scoreStandard(d, winGroup) {
    const sets = d.sets.map((s, i) => ({
      type: s.type,
      kinds: s.kinds,
      // Verdeckter Pung, der mit dem Abwurf vervollständigt wurde, zählt als offen.
      open: !selfDraw && s.type === 'pung' && i === winGroup,
    }));
    const all = [...sets, ...melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }))];
    const lines = scoreSets(all, d.pair, seatWind, roundWind);

    if (winGroup === -1) lines.push(line(isMajor(d.pair) ? 'win_pair_wait_major' : 'win_pair_wait_simple', { kinds: [d.pair] }));

    const pungs = all.filter((s) => s.type !== 'chow');
    const chows = all.length - pungs.length;
    const concealedPungs = pungs.filter((s) => !s.open).length;
    const fullyConcealed = melds.every((m) => !m.open);

    if (chows === 0) lines.push(line('dbl_no_chow'));
    if (fullyConcealed && selfDraw) lines.push(line('dbl_concealed'));
    if (concealedPungs >= 3 && !(concealedPungs === 4 && selfDraw && fullyConcealed)) lines.push(line('dbl_three_concealed_pungs'));

    const ft = flushType(allKinds);
    if (ft === 'full') {
      if (fullyConcealed) lines.push(line('lim_concealed_full_flush'));
      else lines.push(line('dbl_full_flush'));
    } else if (ft === 'half') lines.push(line('dbl_half_flush'));

    if (allHonours(allKinds)) lines.push(line('lim_all_honours'));
    else if (allTerminals(allKinds)) lines.push(line('lim_heads_and_tails'));
    else if (allMajor(allKinds)) lines.push(line('dbl_terminals_honours'));

    const dragonPungs = pungs.filter((s) => isDragon(s.kinds[0])).length;
    const windPungs = pungs.filter((s) => isWind(s.kinds[0])).length;
    if (dragonPungs === 3) lines.push(line('lim_big_three_dragons'));
    else if (dragonPungs === 2 && isDragon(d.pair)) lines.push(line('dbl_little_three_dragons'));
    if (windPungs === 4) lines.push(line('lim_big_four_winds'));
    else if (windPungs === 3 && isWind(d.pair)) lines.push(line('dbl_little_four_winds'));

    if (all.filter((s) => s.type === 'kong').length === 4) lines.push(line('lim_four_kongs'));
    if (chows === 0 && concealedPungs === 4 && selfDraw && fullyConcealed) lines.push(line('lim_hidden_treasure'));
    if (allKinds.every((k) => ALL_GREEN.has(k))) lines.push(line('lim_all_green'));

    // Hühnerhand: keine Punkte aus Sätzen, Paar oder Bonus
    const setPoints = lines.some((l) => l.kind === 'points') || bonus.length > 0;
    if (!setPoints) lines.push(line('dbl_zero_point_hand'));

    return { lines, sets: all, pair: d.pair };
  }
}

export function scoreHand(input, ruleSet) {
  return input.winner ? scoreWinner(input, ruleSet) : scoreLoser(input, ruleSet);
}

// ---------- Zahlungen ----------

/**
 * Zahlungsmatrix payments[from][to] aus den Handwerten.
 * values: number[4], winner: seat, discarder: seat|null, dealer: seat
 */
export function settle(values, { winner, discarder, dealer }, ruleSet) {
  const pay = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const factor = (a, b) => (ruleSet.eastDoubles && (a === dealer || b === dealer) ? 2 : 1);

  for (let s = 0; s < 4; s++) {
    if (s === winner) continue;
    if (ruleSet.discarderPaysAll && discarder !== null) {
      if (s === discarder) pay[s][winner] += 3 * values[winner] * factor(s, winner);
    } else {
      pay[s][winner] += values[winner] * factor(s, winner);
    }
  }
  if (ruleSet.losersPayEachOther) {
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        if (a === winner || b === winner) continue;
        const diff = values[a] - values[b];
        if (diff > 0) pay[b][a] += diff * factor(a, b);
        else if (diff < 0) pay[a][b] += -diff * factor(a, b);
      }
    }
  }
  return pay;
}

/** Nettowerte je Sitz aus einer Zahlungsmatrix. */
export function netFromPayments(pay) {
  const net = [0, 0, 0, 0];
  for (let f = 0; f < 4; f++) for (let t = 0; t < 4; t++) {
    net[f] -= pay[f][t];
    net[t] += pay[f][t];
  }
  return net;
}

// ---------- Anbindung an den Spielzustand ----------

import { kindOf } from '../core/tiles.js';
import { seatWind } from '../core/state.js';

export function scoreRound(state, ruleSet = state.ruleSet) {
  const r = state.result;
  if (!r || r.type !== 'win') {
    const zero = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    return { sheets: null, payments: zero, net: [0, 0, 0, 0] };
  }
  const sheets = state.players.map((p) => {
    const base = {
      concealed: p.hand.map(kindOf),
      melds: p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open })),
      bonus: p.bonus.map(kindOf),
      seatWind: seatWind(state, p.seat),
      roundWind: state.roundWind,
      winner: p.seat === r.winner,
    };
    if (base.winner) {
      Object.assign(base, {
        winningKind: kindOf(r.winningTile),
        selfDraw: r.selfDraw,
        lastWallTile: r.lastWallTile,
        kongReplacement: r.kongReplacement,
        robbedKong: r.robbedKong,
        heavenly: r.heavenly,
        earthly: r.earthly,
        twofoldFortune: !!r.twofoldFortune,
      });
    }
    return scoreHand(base, ruleSet);
  });
  const payments = settle(sheets.map((s) => s.total), { winner: r.winner, discarder: r.from, dealer: state.dealer }, ruleSet);
  return { sheets, payments, net: netFromPayments(payments) };
}
