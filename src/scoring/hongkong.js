// Scoring Hong Kong Old Style (Fan-System). Gebräuchliche Tabelle, Limit 13 Fan.
//
// scoreHandHK(input, ruleSet) → { winner, variant: 'hongkong', lines, fan, total, limit }
//   lines: [{ id, kind: 'fan', value, kinds? }]; total = Grundwert nach Fan-Tabelle
// settleHK(values, { winner, discarder }, ruleSet) → Zahlungsmatrix
// scoreRoundHK(state) → { sheets, payments, net }
//
// Zahlung: Selbstzug: jeder Verlierer zahlt den Grundwert. Abwurf: nur der
// Abwerfende zahlt, "half" (半銃) das Doppelte, "full" (全銃) das Dreifache.

import {
  kindByName, isDragon, isWind, isMajor, isHonour, isFlower, isSeason, isSuited, isTerminal,
  bonusOwner, windIndex, kindOf,
} from '../core/tiles.js';
import { evaluateHand, flushType, allTerminals, allHonours, allMajor } from '../core/hand.js';

export const HK_FANS = Object.freeze({
  hk_chicken: { value: 0, de: 'Hühnerhand (kein Fan)', en: 'Chicken hand (no fan)' },
  hk_all_chows: { value: 1, de: 'Nur Chows (Ping Wu)', en: 'All chows (common hand)' },
  hk_all_pungs: { value: 3, de: 'Nur Pungs (Dui Dui Wu)', en: 'All pungs' },
  hk_half_flush: { value: 3, de: 'Eine Farbe mit Honours', en: 'Half flush' },
  hk_full_flush: { value: 7, de: 'Reine Farbe', en: 'Full flush' },
  hk_dragon_pung: { value: 1, de: 'Drachen-Pung', en: 'Dragon pung' },
  hk_seat_wind: { value: 1, de: 'Pung des eigenen Windes', en: 'Seat wind pung' },
  hk_prevailing_wind: { value: 1, de: 'Pung des Rundenwindes', en: 'Prevailing wind pung' },
  hk_little_three_dragons: { value: 5, de: 'Drei kleine Drachen', en: 'Little three dragons' },
  hk_big_three_dragons: { value: 8, de: 'Drei große Drachen', en: 'Big three dragons' },
  hk_little_four_winds: { value: 6, de: 'Vier kleine Winde', en: 'Little four winds' },
  hk_big_four_winds: { value: 13, de: 'Vier große Winde', en: 'Big four winds' },
  hk_all_honours: { value: 10, de: 'Nur Honours', en: 'All honours' },
  hk_all_terminals: { value: 10, de: 'Nur Endsteine', en: 'All terminals' },
  hk_mixed_terminals: { value: 4, de: 'Nur Endsteine und Honours', en: 'Mixed terminals and honours' },
  hk_four_concealed_pungs: { value: 8, de: 'Vier verdeckte Pungs (Selbstzug)', en: 'Four concealed pungs (self-draw)' },
  hk_thirteen_orphans: { value: 13, de: 'Dreizehn Waisen', en: 'Thirteen orphans' },
  hk_nine_gates: { value: 13, de: 'Neun Tore', en: 'Nine gates' },
  hk_four_kongs: { value: 13, de: 'Vier Kongs', en: 'Four kongs' },
  hk_heavenly: { value: 13, de: 'Himmlische Hand', en: 'Heavenly hand' },
  hk_earthly: { value: 13, de: 'Irdische Hand', en: 'Earthly hand' },
  hk_seven_pairs: { value: 4, de: 'Sieben Paare (Option)', en: 'Seven pairs (option)' },
  hk_self_draw: { value: 1, de: 'Selbstzug', en: 'Self-draw' },
  hk_concealed: { value: 1, de: 'Verdeckte Hand', en: 'Concealed hand' },
  hk_last_tile: { value: 1, de: 'Letzter Stein der Wand', en: 'Last tile of the wall' },
  hk_kong_replacement: { value: 1, de: 'Ersatzstein nach Kong', en: 'Kong replacement' },
  hk_robbing_kong: { value: 1, de: 'Kong-Raub', en: 'Robbing the kong' },
  hk_own_flower: { value: 1, de: 'Eigene Blume', en: 'Own flower' },
  hk_own_season: { value: 1, de: 'Eigene Jahreszeit', en: 'Own season' },
  hk_all_flowers: { value: 2, de: 'Alle vier Blumen', en: 'All four flowers' },
  hk_all_seasons: { value: 2, de: 'Alle vier Jahreszeiten', en: 'All four seasons' },
  hk_no_flowers: { value: 1, de: 'Keine Bonussteine', en: 'No bonus tiles' },
});

export const HK_LIMIT_FAN = 13;
/** Grundwert je Fan (0..13), "halb scharf" ab 4 Fan. */
export const HK_FAN_POINTS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];

export function hkBasePoints(fan) {
  return HK_FAN_POINTS[Math.max(0, Math.min(HK_LIMIT_FAN, fan))];
}

/** Grundwert bei reiner Verdopplung (Option "Uncapped"): 2^Fan, ohne die "halb scharfe" Verlangsamung. */
export function hkBasePointsUncapped(fan) {
  return 2 ** Math.max(0, fan);
}

/** Grundwert nach der gewählten Umrechnungstabelle (ruleSet.hkConversion). */
export function hkBaseValue(fan, ruleSet = {}) {
  return ruleSet.hkConversion === 'uncapped' ? hkBasePointsUncapped(fan) : hkBasePoints(fan);
}

function line(id, extra = {}) {
  return { id, kind: 'fan', value: HK_FANS[id].value, ...extra };
}

function bonusLines(bonus, seatWind, ruleSet) {
  const lines = [];
  let flowers = 0, seasons = 0;
  for (const b of bonus) {
    if (isFlower(b)) { flowers++; if (bonusOwner(b) === seatWind) lines.push(line('hk_own_flower', { kinds: [b] })); }
    else if (isSeason(b)) { seasons++; if (bonusOwner(b) === seatWind) lines.push(line('hk_own_season', { kinds: [b] })); }
  }
  if (flowers === 4) lines.push(line('hk_all_flowers'));
  if (seasons === 4) lines.push(line('hk_all_seasons'));
  if (ruleSet.bonusTiles && bonus.length === 0) lines.push(line('hk_no_flowers'));
  return lines;
}

/**
 * Fan-Bewertung einer fertigen Hand. Alle Zerlegungen werden geprüft; die
 * höchste Fan-Zahl zählt.
 */
export function scoreHandHK(input, ruleSet) {
  if (!input.winner) return { winner: false, variant: 'hongkong', lines: [], fan: 0, total: 0, limit: false };
  const { concealed, melds, bonus = [], seatWind, roundWind, winningKind, selfDraw } = input;
  const ev = evaluateHand(concealed, melds, ruleSet);
  if (!ev.win) throw new Error('scoreHandHK: Hand ist nicht vollständig');
  const allKinds = [...concealed, ...melds.flatMap((m) => m.kinds)];
  const fullyConcealed = melds.every((m) => !m.open);

  const common = [];
  if (selfDraw) common.push(line('hk_self_draw'));
  if (fullyConcealed) common.push(line('hk_concealed'));
  if (input.lastWallTile) common.push(line('hk_last_tile'));
  if (input.kongReplacement) common.push(line('hk_kong_replacement'));
  if (input.robbedKong) common.push(line('hk_robbing_kong'));
  common.push(...bonusLines(bonus, seatWind, ruleSet));

  const limits = [];
  if (input.heavenly) limits.push(line('hk_heavenly'));
  if (input.earthly) limits.push(line('hk_earthly'));
  if (ev.forms.includes('thirteen_orphans')) limits.push(line('hk_thirteen_orphans'));
  if (ev.forms.includes('nine_gates')) limits.push(line('hk_nine_gates'));

  const candidates = [];
  if (ev.forms.includes('standard')) {
    for (const d of ev.decompositions) {
      const groups = [];
      if (d.pair === winningKind) groups.push(-1);
      d.sets.forEach((s, i) => { if (s.kinds.includes(winningKind)) groups.push(i); });
      if (groups.length === 0) groups.push(null);
      for (const g of groups) candidates.push(scoreStandard(d, g));
    }
  }
  if (ev.forms.includes('seven_pairs')) candidates.push({ lines: [line('hk_seven_pairs')], sets: [], pair: null });
  if (candidates.length === 0) candidates.push({ lines: [], sets: [], pair: null });

  let best = null;
  for (const c of candidates) {
    const lines = [...limits, ...c.lines, ...common];
    const fan = lines.reduce((a, l) => a + l.value, 0);
    if (!best || fan > best.fan) best = { lines, fan, sets: c.sets, pair: c.pair };
  }
  if (best.lines.length === 0 || best.fan === 0) best.lines.unshift(line('hk_chicken'));
  const maxFan = ruleSet.maxFan ?? HK_LIMIT_FAN;
  const fan = Math.min(maxFan, best.fan);
  // Option "Simplified": Hände unter 3 Fan gewinnen die Runde, aber ohne Punktetausch.
  const zeroPoints = ruleSet.hkConversion === 'simplified' && fan < 3;
  const total = zeroPoints ? 0 : hkBaseValue(fan, ruleSet);
  return { winner: true, variant: 'hongkong', lines: best.lines, fan, total, limit: fan >= maxFan, zeroPoints, sets: best.sets, pair: best.pair };

  function scoreStandard(d, winGroup) {
    const sets = d.sets.map((s, i) => ({ type: s.type, kinds: s.kinds, open: !selfDraw && s.type === 'pung' && i === winGroup }));
    const all = [...sets, ...melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }))];
    const pungs = all.filter((s) => s.type !== 'chow');
    const chows = all.length - pungs.length;
    const lines = [];
    const dragonPungs = pungs.filter((s) => isDragon(s.kinds[0]));
    const windPungs = pungs.filter((s) => isWind(s.kinds[0]));

    // Drachen und Winde (große/kleine Sätze ersetzen die Einzelzeilen)
    if (dragonPungs.length === 3) lines.push(line('hk_big_three_dragons'));
    else if (dragonPungs.length === 2 && isDragon(d.pair)) lines.push(line('hk_little_three_dragons'));
    else for (const s of dragonPungs) lines.push(line('hk_dragon_pung', { kinds: [s.kinds[0]] }));
    if (windPungs.length === 4) lines.push(line('hk_big_four_winds'));
    else if (windPungs.length === 3 && isWind(d.pair)) lines.push(line('hk_little_four_winds'));
    else {
      for (const s of windPungs) {
        const w = windIndex(s.kinds[0]);
        if (w === seatWind) lines.push(line('hk_seat_wind', { kinds: [s.kinds[0]] }));
        if (w === roundWind) lines.push(line('hk_prevailing_wind', { kinds: [s.kinds[0]] }));
      }
    }

    if (allHonours(allKinds)) lines.push(line('hk_all_honours'));
    else if (allTerminals(allKinds)) lines.push(line('hk_all_terminals'));
    else if (allMajor(allKinds)) lines.push(line('hk_mixed_terminals'));

    if (all.filter((s) => s.type === 'kong').length === 4) lines.push(line('hk_four_kongs'));
    else if (chows === 0 && selfDraw && fullyConcealed && pungs.every((s) => !s.open)) lines.push(line('hk_four_concealed_pungs'));
    else if (chows === 0) lines.push(line('hk_all_pungs'));
    else if (pungs.length === 0) lines.push(line('hk_all_chows'));

    const ft = flushType(allKinds);
    if (ft === 'full') lines.push(line('hk_full_flush'));
    else if (ft === 'half') lines.push(line('hk_half_flush'));
    return { lines, sets: all, pair: d.pair };
  }
}

/** Fan-Zahl einer Hand (für die Mindest-Fan-Prüfung im Regelkern). */
export function fanOf(input, ruleSet) {
  return scoreHandHK({ ...input, winner: true }, ruleSet).fan;
}

/**
 * Zahlungsmatrix: values = Grundwerte je Sitz (nur der Gewinner hat einen).
 * dealer: Sitz des Gebers; mit ruleSet.hkDealerDouble zahlt/erhält der Geber doppelt.
 */
export function settleHK(values, { winner, discarder, dealer }, ruleSet) {
  const pay = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const base = values[winner];
  const dealerFactor = ruleSet.hkDealerDouble && (winner === dealer || discarder === dealer) ? 2 : 1;
  if (discarder === null || discarder === undefined) {
    for (let s = 0; s < 4; s++) if (s !== winner) pay[s][winner] = base * dealerFactor;
  } else {
    pay[discarder][winner] = base * (ruleSet.hkPayment === 'full' ? 3 : 2) * dealerFactor;
  }
  return pay;
}

export function netFromPaymentsHK(pay) {
  const net = [0, 0, 0, 0];
  for (let f = 0; f < 4; f++) for (let t = 0; t < 4; t++) { net[f] -= pay[f][t]; net[t] += pay[f][t]; }
  return net;
}

export function scoreRoundHK(state, ruleSet = state.ruleSet) {
  const r = state.result;
  const zero = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  if (!r || r.type !== 'win') return { sheets: null, payments: zero, net: [0, 0, 0, 0] };
  const sheets = state.players.map((p) => {
    const seatW = (p.seat - state.dealer + 4) % 4;
    const base = {
      concealed: p.hand.map(kindOf),
      melds: p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open })),
      bonus: p.bonus.map(kindOf),
      seatWind: seatW,
      roundWind: state.roundWind,
      winner: p.seat === r.winner,
    };
    if (base.winner) {
      Object.assign(base, {
        winningKind: kindOf(r.winningTile), selfDraw: r.selfDraw, lastWallTile: r.lastWallTile,
        kongReplacement: r.kongReplacement, robbedKong: r.robbedKong, heavenly: r.heavenly, earthly: r.earthly,
      });
    }
    return scoreHandHK(base, ruleSet);
  });
  const payments = settleHK(sheets.map((s) => s.total), { winner: r.winner, discarder: r.from, dealer: state.dealer }, ruleSet);
  return { sheets, payments, net: netFromPaymentsHK(payments) };
}

export { isSuited, isTerminal, isHonour, isMajor, kindByName };
