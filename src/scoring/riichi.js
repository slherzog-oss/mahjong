// Scoring Riichi (japanisch): Yaku, Han, Fu, Dora, Zahlungen.
//
// scoreHandRiichi(input, ruleSet) → { winner, variant: 'riichi', lines, han, fu, yakuman, basePoints, limitName, yaku }
//   input: concealed (Arten inkl. Gewinnstein), melds, seatWind, roundWind, winningKind,
//          selfDraw, riichi, doubleRiichi, ippatsu, rinshan, chankan, haitei, houtei,
//          tenhou, chiihou, doraKinds[], uraKinds[], redFives (Anzahl)
//   lines: [{ id, kind: 'han'|'yakuman'|'dora'|'fu', value, kinds? }]
// hasYaku(input, ruleSet) → boolean (mindestens ein Yaku ohne Dora)
// riichiPoints(han, fu, yakuman, ruleSet) → Grundpunkte (Mangan 2000 usw.)
// settleRiichi(basePoints, { winner, discarder, dealer, honba }) → Zahlungsmatrix
// scoreRoundRiichi(state) → { sheets, payments, net, bonus } (bonus: Riichi-Stäbchen an den Gewinner)

import {
  NUM_KINDS, kindByName, kindOf, isDragon, isWind, isMajor, isHonour, isSuited, isTerminal, isSimple,
  suitOf, rankOf, windIndex, countsFromKinds,
} from '../core/tiles.js';
import { evaluateHand, flushType, allTerminals, allHonours, waitingKinds } from '../core/hand.js';

// han: [verdeckt, offen]; offen null = nur verdeckt. yakuman: Anzahl Yakuman.
export const RIICHI_YAKU = Object.freeze({
  riichi: { han: [1, null], de: 'Riichi', en: 'Riichi' },
  double_riichi: { han: [2, null], de: 'Doppel-Riichi', en: 'Double riichi' },
  ippatsu: { han: [1, null], de: 'Ippatsu (sofort)', en: 'Ippatsu' },
  menzen_tsumo: { han: [1, null], de: 'Verdeckter Selbstzug (Menzen Tsumo)', en: 'Fully concealed self-draw' },
  pinfu: { han: [1, null], de: 'Pinfu (nur Chows, beidseitiges Warten)', en: 'Pinfu' },
  tanyao: { han: [1, 1], de: 'Tanyao (nur einfache Steine)', en: 'All simples (tanyao)' },
  iipeikou: { han: [1, null], de: 'Iipeikou (zwei gleiche Chows)', en: 'Pure double sequence' },
  yakuhai_dragon: { han: [1, 1], de: 'Yakuhai: Drachen-Pung', en: 'Yakuhai: dragon pung' },
  yakuhai_seat: { han: [1, 1], de: 'Yakuhai: eigener Wind', en: 'Yakuhai: seat wind' },
  yakuhai_round: { han: [1, 1], de: 'Yakuhai: Rundenwind', en: 'Yakuhai: prevailing wind' },
  rinshan: { han: [1, 1], de: 'Rinshan Kaihou (Ersatzstein nach Kan)', en: 'After a kan' },
  chankan: { han: [1, 1], de: 'Chankan (Kan-Raub)', en: 'Robbing a kan' },
  haitei: { han: [1, 1], de: 'Haitei (letzter Wandstein)', en: 'Last tile from the wall' },
  houtei: { han: [1, 1], de: 'Houtei (letzter Abwurf)', en: 'Last discard' },
  chiitoitsu: { han: [2, null], de: 'Chiitoitsu (sieben Paare)', en: 'Seven pairs' },
  sanshoku: { han: [2, 1], de: 'Sanshoku Doujun (drei gleiche Chows)', en: 'Mixed triple sequence' },
  ittsu: { han: [2, 1], de: 'Ittsu (123 456 789 einer Farbe)', en: 'Pure straight' },
  chanta: { han: [2, 1], de: 'Chanta (Endsteine/Honours in jedem Satz)', en: 'Half outside hand' },
  honroutou: { han: [2, 2], de: 'Honroutou (nur Endsteine und Honours)', en: 'All terminals and honours' },
  toitoi: { han: [2, 2], de: 'Toitoi (nur Pungs)', en: 'All triplets' },
  sanankou: { han: [2, 2], de: 'Sanankou (drei verdeckte Pungs)', en: 'Three concealed triplets' },
  sanshoku_doukou: { han: [2, 2], de: 'Sanshoku Doukou (drei gleiche Pungs)', en: 'Triple triplets' },
  sankantsu: { han: [2, 2], de: 'Sankantsu (drei Kans)', en: 'Three kans' },
  shousangen: { han: [2, 2], de: 'Shousangen (kleine drei Drachen)', en: 'Little three dragons' },
  honitsu: { han: [3, 2], de: 'Honitsu (eine Farbe mit Honours)', en: 'Half flush' },
  junchan: { han: [3, 2], de: 'Junchan (Endstein in jedem Satz)', en: 'Fully outside hand' },
  ryanpeikou: { han: [3, null], de: 'Ryanpeikou (zweimal zwei gleiche Chows)', en: 'Twice pure double sequence' },
  chinitsu: { han: [6, 5], de: 'Chinitsu (reine Farbe)', en: 'Full flush' },
  // Yakuman
  kokushi: { yakuman: 1, de: 'Kokushi Musou (dreizehn Waisen)', en: 'Thirteen orphans' },
  suuankou: { yakuman: 1, de: 'Suuankou (vier verdeckte Pungs)', en: 'Four concealed triplets' },
  daisangen: { yakuman: 1, de: 'Daisangen (große drei Drachen)', en: 'Big three dragons' },
  shousuushii: { yakuman: 1, de: 'Shousuushii (kleine vier Winde)', en: 'Little four winds' },
  daisuushii: { yakuman: 1, de: 'Daisuushii (große vier Winde)', en: 'Big four winds' },
  tsuuiisou: { yakuman: 1, de: 'Tsuuiisou (nur Honours)', en: 'All honours' },
  chinroutou: { yakuman: 1, de: 'Chinroutou (nur Endsteine)', en: 'All terminals' },
  ryuuiisou: { yakuman: 1, de: 'Ryuuiisou (nur Grün)', en: 'All green' },
  chuuren: { yakuman: 1, de: 'Chuuren Poutou (neun Tore)', en: 'Nine gates' },
  suukantsu: { yakuman: 1, de: 'Suukantsu (vier Kans)', en: 'Four kans' },
  tenhou: { yakuman: 1, de: 'Tenhou (himmlische Hand)', en: 'Heavenly hand' },
  chiihou: { yakuman: 1, de: 'Chiihou (irdische Hand)', en: 'Earthly hand' },
  // Dora und Fu (Anzeige)
  dora: { dora: true, de: 'Dora', en: 'Dora' },
  ura_dora: { dora: true, de: 'Ura-Dora', en: 'Ura dora' },
  aka_dora: { dora: true, de: 'Rote Fünfer (Aka-Dora)', en: 'Red fives' },
  fu: { de: 'Fu', en: 'Fu' },
});

export const RED_FIVE_IDS = [16, 52, 88]; // je die erste Kopie von 5b, 5c, 5k
const GREEN = new Set(['2b', '3b', '4b', '6b', '8b', 'Gd'].map(kindByName));

/** Dora-Art zu einem Anzeiger. */
export function doraKindOf(indicator) {
  if (isSuited(indicator)) {
    const s = suitOf(indicator), r = rankOf(indicator);
    return s * 9 + (r % 9); // 9 → 1
  }
  if (isWind(indicator)) return 27 + ((indicator - 27 + 1) % 4);
  // Drachen: Weiß → Grün → Rot → Weiß (Arten: Rd 31, Gd 32, Wd 33)
  return { 33: 32, 32: 31, 31: 33 }[indicator];
}

export const LIMITS = [
  { name: 'yakuman', base: 8000 }, { name: 'sanbaiman', base: 6000 }, { name: 'baiman', base: 4000 },
  { name: 'haneman', base: 3000 }, { name: 'mangan', base: 2000 },
];

/** Grundpunkte aus Han und Fu; Yakuman zählen 8000 je Yakuman. */
export function riichiPoints(han, fu, yakuman = 0, ruleSet = {}) {
  if (yakuman > 0) return { base: 8000 * yakuman, limitName: yakuman > 1 ? `yakuman×${yakuman}` : 'yakuman' };
  if (han >= 13) return { base: 8000, limitName: 'kazoe_yakuman' };
  if (han >= 11) return { base: 6000, limitName: 'sanbaiman' };
  if (han >= 8) return { base: 4000, limitName: 'baiman' };
  if (han >= 6) return { base: 3000, limitName: 'haneman' };
  if (han >= 5) return { base: 2000, limitName: 'mangan' };
  const base = fu * 2 ** (han + 2);
  if (base >= 2000) return { base: 2000, limitName: 'mangan' };
  if (ruleSet.kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) return { base: 2000, limitName: 'mangan' };
  return { base, limitName: null };
}

const ceil100 = (x) => Math.ceil(x / 100) * 100;

/**
 * Zahlungsmatrix: Ron zahlt der Abwerfende (4× bzw. 6× Grundwert für Ost),
 * Tsumo zahlen alle (Ost 2×, sonst 1×; Ost als Gewinner: alle 2×). Honba: 300
 * je Zähler beim Ron, 100 je Zähler von jedem beim Tsumo.
 */
export function settleRiichi(base, { winner, discarder, dealer, honba = 0 }) {
  const pay = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const dealerWins = winner === dealer;
  if (discarder === null || discarder === undefined) {
    for (let s = 0; s < 4; s++) {
      if (s === winner) continue;
      const mult = dealerWins || s === dealer ? 2 : 1;
      pay[s][winner] = ceil100(base * mult) + 100 * honba;
    }
  } else {
    pay[discarder][winner] = ceil100(base * (dealerWins ? 6 : 4)) + 300 * honba;
  }
  return pay;
}

/** Noten-Bappu bei Unentschieden: 3000 von den nicht Wartenden an die Wartenden. */
export function notenPayments(tenpai) {
  const pay = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const t = tenpai.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const n = tenpai.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (t.length === 0 || n.length === 0) return pay;
  const perNoten = 3000 / n.length;
  const perTenpai = perNoten / t.length;
  for (const a of n) for (const b of t) pay[a][b] = perTenpai;
  return pay;
}

function line(id, extra = {}) {
  const y = RIICHI_YAKU[id];
  if (y.yakuman) return { id, kind: 'yakuman', value: y.yakuman, ...extra };
  if (y.dora) return { id, kind: 'dora', value: extra.value ?? 1, ...extra };
  return { id, kind: 'han', value: extra.value ?? y.han[0], ...extra };
}

const ceil10 = (x) => Math.ceil(x / 10) * 10;

/** Wartetyp eines Chows [a, a+1, a+2] mit Gewinnstein w. */
function chowWait(kinds, w) {
  const [a, , c] = kinds;
  if (w === kinds[1]) return 'kanchan';
  if (w === a) return rankOf(c) === 9 ? 'penchan' : 'ryanmen';
  if (w === c) return rankOf(a) === 1 ? 'penchan' : 'ryanmen';
  return 'ryanmen';
}

function isYakuhaiPair(pair, seatWind, roundWind) {
  return isDragon(pair) || (isWind(pair) && (windIndex(pair) === seatWind || windIndex(pair) === roundWind));
}

export function scoreHandRiichi(input, ruleSet) {
  if (!input.winner && input.winner !== undefined) return { winner: false, variant: 'riichi', lines: [], han: 0, fu: 0, yakuman: 0, basePoints: 0, total: 0 };
  const { concealed, melds, seatWind, roundWind, winningKind, selfDraw } = input;
  const ctx = {
    riichi: !!input.riichi, doubleRiichi: !!input.doubleRiichi, ippatsu: !!input.ippatsu,
    rinshan: !!input.rinshan, chankan: !!input.chankan, haitei: !!input.haitei, houtei: !!input.houtei,
    tenhou: !!input.tenhou, chiihou: !!input.chiihou,
  };
  const ev = evaluateHand(concealed, melds, ruleSet);
  if (!ev.win) throw new Error('scoreHandRiichi: Hand ist nicht vollständig');
  const allKinds = [...concealed, ...melds.flatMap((m) => m.kinds)];
  const menzen = melds.every((m) => !m.open);
  const counts = countsFromKinds(allKinds);

  // Dora zählen (Kong = vier Steine)
  const doraLines = [];
  const doraCount = (list) => list.reduce((n, k) => n + counts[k], 0);
  const dora = doraCount(input.doraKinds ?? []);
  if (dora > 0) doraLines.push(line('dora', { value: dora }));
  if (ctx.riichi) {
    const ura = doraCount(input.uraKinds ?? []);
    if (ura > 0) doraLines.push(line('ura_dora', { value: ura }));
  }
  if (input.redFives > 0) doraLines.push(line('aka_dora', { value: input.redFives }));

  const contextLines = [];
  if (ctx.tenhou) contextLines.push(line('tenhou'));
  if (ctx.chiihou) contextLines.push(line('chiihou'));
  const situational = [];
  if (menzen) {
    if (ctx.doubleRiichi) situational.push(line('double_riichi'));
    else if (ctx.riichi) situational.push(line('riichi'));
    if (ctx.riichi && ctx.ippatsu) situational.push(line('ippatsu'));
    if (selfDraw) situational.push(line('menzen_tsumo'));
  }
  if (ctx.rinshan) situational.push(line('rinshan'));
  if (ctx.chankan) situational.push(line('chankan'));
  if (ctx.haitei) situational.push(line('haitei'));
  if (ctx.houtei) situational.push(line('houtei'));

  const candidates = [];
  if (ev.forms.includes('standard')) {
    for (const d of ev.decompositions) {
      const groups = [];
      if (d.pair === winningKind) groups.push(-1);
      d.sets.forEach((s, i) => { if (s.kinds.includes(winningKind)) groups.push(i); });
      if (groups.length === 0) groups.push(null);
      for (const g of groups) candidates.push(standard(d, g));
    }
  }
  if (ev.forms.includes('seven_pairs')) candidates.push(chiitoi());
  if (ev.forms.includes('thirteen_orphans')) candidates.push({ lines: [line('kokushi')], fu: 30, sets: [], pair: null });

  let best = null;
  for (const c of candidates) {
    const lines = [...contextLines, ...c.lines, ...situational];
    const yakuman = lines.filter((l) => l.kind === 'yakuman').reduce((a, l) => a + l.value, 0);
    let hanYaku = 0;
    if (yakuman === 0) hanYaku = lines.filter((l) => l.kind === 'han').reduce((a, l) => a + l.value, 0);
    const withDora = yakuman === 0 && hanYaku > 0 ? [...lines, ...doraLines] : lines;
    const han = yakuman === 0 ? withDora.reduce((a, l) => (l.kind === 'han' || l.kind === 'dora' ? a + l.value : a), 0) : 0;
    const fu = c.fu;
    const pts = hanYaku > 0 || yakuman > 0 ? riichiPoints(han, fu, yakuman, ruleSet) : { base: 0, limitName: null };
    const cand = { winner: true, variant: 'riichi', lines: yakuman > 0 ? withDora.filter((l) => l.kind === 'yakuman') : [...withDora, { id: 'fu', kind: 'fu', value: fu }], han, fu, yakuman, hanYaku, basePoints: pts.base, limitName: pts.limitName, sets: c.sets, pair: c.pair, total: pts.base };
    if (!best || cand.basePoints > best.basePoints || (cand.basePoints === best.basePoints && cand.han > best.han)) best = cand;
  }
  return best;

  function standard(d, winGroup) {
    const sets = d.sets.map((s, i) => ({ type: s.type, kinds: s.kinds, open: !selfDraw && s.type === 'pung' && i === winGroup, concealedPart: true }));
    const all = [...sets, ...melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }))];
    const pungs = all.filter((s) => s.type !== 'chow');
    const chows = all.filter((s) => s.type === 'chow');
    const kongs = all.filter((s) => s.type === 'kong');
    const pair = d.pair;
    let wait = 'ryanmen';
    if (winGroup === -1) wait = 'tanki';
    else if (winGroup !== null && d.sets[winGroup].type === 'pung') wait = 'shanpon';
    else if (winGroup !== null) wait = chowWait(d.sets[winGroup].kinds, winningKind);

    const lines = [];
    const yakuman = [];
    // Yakuman
    const concealedPungs = pungs.filter((s) => !s.open).length;
    if (concealedPungs === 4 && menzen) yakuman.push(line('suuankou'));
    const dragonPungs = pungs.filter((s) => isDragon(s.kinds[0])).length;
    const windPungs = pungs.filter((s) => isWind(s.kinds[0])).length;
    if (dragonPungs === 3) yakuman.push(line('daisangen'));
    if (windPungs === 4) yakuman.push(line('daisuushii'));
    else if (windPungs === 3 && isWind(pair)) yakuman.push(line('shousuushii'));
    if (allHonours(allKinds)) yakuman.push(line('tsuuiisou'));
    if (allTerminals(allKinds)) yakuman.push(line('chinroutou'));
    if (allKinds.every((k) => GREEN.has(k))) yakuman.push(line('ryuuiisou'));
    if (ev.forms.includes('nine_gates') && menzen) yakuman.push(line('chuuren'));
    if (kongs.length === 4) yakuman.push(line('suukantsu'));
    if (yakuman.length) return { lines: yakuman, fu: 0, sets: all, pair };

    // Normale Yaku
    const h = (id) => { const v = RIICHI_YAKU[id].han[menzen ? 0 : 1]; if (v !== null && v !== undefined) lines.push(line(id, { value: v })); };
    const pinfu = menzen && chows.length === 4 && !isYakuhaiPair(pair, seatWind, roundWind) && wait === 'ryanmen';
    if (pinfu) h('pinfu');
    if (allKinds.every(isSimple) && (menzen || ruleSet.kuitan)) h('tanyao');
    // Gleiche Chows
    const chowKeys = chows.map((c) => c.kinds.join(','));
    const dup = new Map();
    for (const k of chowKeys) dup.set(k, (dup.get(k) ?? 0) + 1);
    const pairsOfChows = [...dup.values()].reduce((a, n) => a + Math.floor(n / 2), 0);
    if (menzen && pairsOfChows === 2) h('ryanpeikou');
    else if (menzen && pairsOfChows === 1) h('iipeikou');
    // Yakuhai
    for (const s of pungs) {
      const k = s.kinds[0];
      if (isDragon(k)) lines.push(line('yakuhai_dragon', { value: 1, kinds: [k] }));
      if (isWind(k)) {
        if (windIndex(k) === seatWind) lines.push(line('yakuhai_seat', { value: 1, kinds: [k] }));
        if (windIndex(k) === roundWind) lines.push(line('yakuhai_round', { value: 1, kinds: [k] }));
      }
    }
    // Sanshoku, Ittsu
    const chowStarts = chows.map((c) => c.kinds[0]);
    for (let r = 0; r < 7; r++) {
      if ([0, 1, 2].every((s) => chowStarts.includes(s * 9 + r))) { h('sanshoku'); break; }
    }
    for (let s = 0; s < 3; s++) {
      if ([0, 3, 6].every((r) => chowStarts.includes(s * 9 + r))) { h('ittsu'); break; }
    }
    // Chanta / Junchan / Honroutou
    const groupsAll = [...all.map((s) => s.kinds), [pair]];
    const everyGroupMajor = groupsAll.every((g) => g.some(isMajor));
    const everyGroupTerminal = groupsAll.every((g) => g.some(isTerminal));
    const anyHonour = allKinds.some(isHonour);
    if (allKinds.every(isMajor) && chows.length === 0) h('honroutou');
    else if (everyGroupTerminal && !anyHonour && chows.length > 0) h('junchan');
    else if (everyGroupMajor && chows.length > 0 && anyHonour) h('chanta');
    // Pungs
    if (chows.length === 0) h('toitoi');
    if (concealedPungs === 3) h('sanankou');
    for (let r = 0; r < 9; r++) {
      if ([0, 1, 2].every((s) => pungs.some((p) => p.kinds[0] === s * 9 + r))) { h('sanshoku_doukou'); break; }
    }
    if (kongs.length === 3) h('sankantsu');
    if (dragonPungs === 2 && isDragon(pair)) h('shousangen');
    const ft = flushType(allKinds);
    if (ft === 'full') h('chinitsu');
    else if (ft === 'half') h('honitsu');

    // Fu
    let fu;
    if (pinfu) fu = selfDraw ? 20 : 30;
    else {
      fu = 20;
      if (menzen && !selfDraw) fu += 10;
      if (selfDraw) fu += 2;
      for (const s of pungs) {
        let f = isMajor(s.kinds[0]) ? 4 : 2;
        if (!s.open) f *= 2;
        if (s.type === 'kong') f *= 4;
        fu += f;
      }
      if (isDragon(pair)) fu += 2;
      if (isWind(pair)) {
        if (windIndex(pair) === seatWind) fu += 2;
        if (windIndex(pair) === roundWind) fu += 2;
      }
      if (wait === 'tanki' || wait === 'kanchan' || wait === 'penchan') fu += 2;
      if (!menzen && fu === 20) fu = 30;
      fu = ceil10(fu);
    }
    return { lines, fu, sets: all, pair, wait };
  }

  function chiitoi() {
    const lines = [];
    if (allHonours(allKinds)) return { lines: [line('tsuuiisou')], fu: 25, sets: [], pair: null };
    lines.push(line('chiitoitsu', { value: 2 }));
    if (allKinds.every(isSimple)) lines.push(line('tanyao', { value: 1 }));
    if (allKinds.every(isMajor)) lines.push(line('honroutou', { value: 2 }));
    const ft = flushType(allKinds);
    if (ft === 'full') lines.push(line('chinitsu', { value: 6 }));
    else if (ft === 'half') lines.push(line('honitsu', { value: 3 }));
    return { lines, fu: 25, sets: [], pair: null };
  }
}

/** Hat die Hand mindestens ein Yaku (ohne Dora)? Für die Gewinnprüfung im Regelkern. */
export function hasYaku(input, ruleSet) {
  const s = scoreHandRiichi({ ...input, winner: true, doraKinds: [], uraKinds: [], redFives: 0 }, ruleSet);
  return s.yakuman > 0 || s.hanYaku > 0;
}

/** Wartend (Tenpai) ohne Rücksicht auf Yaku oder Furiten. */
export function isTenpai(concealedKinds, melds, ruleSet) {
  return waitingKinds(concealedKinds, melds, ruleSet).length > 0;
}

export function netFromPaymentsRiichi(pay, bonus = [0, 0, 0, 0]) {
  const net = bonus.slice();
  for (let f = 0; f < 4; f++) for (let t = 0; t < 4; t++) { net[f] -= pay[f][t]; net[t] += pay[f][t]; }
  return net;
}

/** Bewertung aus dem Spielzustand (Gewinn oder Unentschieden mit Noten-Bappu). */
export function scoreRoundRiichi(state, ruleSet = state.ruleSet) {
  const r = state.result;
  const zero = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  if (!r) return { sheets: null, payments: zero, net: [0, 0, 0, 0], bonus: [0, 0, 0, 0] };
  const kinds = (p) => p.hand.map(kindOf);
  const meldsOf = (p) => p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
  if (r.type === 'draw') {
    const tenpai = r.tenpai ?? state.players.map((p) => isTenpai(kinds(p), meldsOf(p), ruleSet));
    const payments = notenPayments(tenpai);
    const sheets = state.players.map((p, i) => ({ winner: false, variant: 'riichi', tenpai: tenpai[i], lines: [], total: 0, han: 0, fu: 0, yakuman: 0 }));
    return { sheets, payments, net: netFromPaymentsRiichi(payments), bonus: [0, 0, 0, 0], tenpai };
  }
  // Anzeiger liegen als Stein-IDs in der Wand; der Dora ist die nächste Art
  const doraKinds = (state.wall.indicators ?? []).slice(0, state.doraRevealed ?? 1).map((id) => doraKindOf(kindOf(id)));
  const uraKinds = (state.wall.ura ?? []).slice(0, state.doraRevealed ?? 1).map((id) => doraKindOf(kindOf(id)));
  const sheets = state.players.map((p) => {
    if (p.seat !== r.winner) return { winner: false, variant: 'riichi', lines: [], total: 0, han: 0, fu: 0, yakuman: 0 };
    const seatW = (p.seat - state.dealer + 4) % 4;
    const tiles = [...p.hand, ...p.melds.flatMap((m) => m.tiles)];
    const redFives = ruleSet.redFives ? tiles.filter((id) => RED_FIVE_IDS.includes(id)).length : 0;
    return scoreHandRiichi({
      concealed: kinds(p), melds: meldsOf(p), seatWind: seatW, roundWind: state.roundWind, winner: true,
      winningKind: kindOf(r.winningTile), selfDraw: r.selfDraw,
      riichi: !!p.riichi, doubleRiichi: !!p.riichi?.double, ippatsu: !!p.riichi?.ippatsu,
      rinshan: !!r.kongReplacement, chankan: !!r.robbedKong,
      haitei: !!r.selfDraw && !!r.lastWallTile, houtei: !r.selfDraw && !!r.lastWallTile,
      tenhou: !!r.heavenly, chiihou: !!r.chiihou,
      doraKinds, uraKinds, redFives,
    }, ruleSet);
  });
  const payments = settleRiichi(sheets[r.winner].basePoints, { winner: r.winner, discarder: r.from, dealer: state.dealer, honba: state.honba ?? 0 });
  const bonus = [0, 0, 0, 0];
  bonus[r.winner] = 1000 * (state.riichiSticks ?? 0);
  const net = netFromPaymentsRiichi(payments, bonus);
  sheets[r.winner].total = net[r.winner];
  return { sheets, payments, net, bonus, doraKinds, uraKinds };
}
