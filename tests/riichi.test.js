import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, kindOf, formatKinds } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { createGame, applyAction, getLegalActions, applyPayments, replay, isFuriten } from '../src/core/state.js';
import { createRngState } from '../src/core/rng.js';
import { scoreHandRiichi, settleRiichi, notenPayments, riichiPoints, hasYaku, doraKindOf, RIICHI_YAKU } from '../src/scoring/riichi.js';
import { scoreRound } from '../src/scoring/index.js';
import { runUntilHuman } from '../src/ai/runner.js';
import { rigGame, tileOf, allPass } from './helpers.js';

const rules = createRuleSet({ variant: 'riichi', startScore: 25000 }); // klassische Punktebasis für die Regeltests
const meld = (type, n, open = true) => ({ type, kinds: parseKinds(n), open });
const ids = (sheet) => sheet.lines.map((l) => l.id);
const han = (sheet, id) => sheet.lines.find((l) => l.id === id)?.value;

function score(notation, extra = {}) {
  const concealed = extra.concealed ?? parseKinds(notation);
  return scoreHandRiichi({
    concealed, melds: [], seatWind: 1, roundWind: 0, winner: true,
    winningKind: parseKinds(extra.win ?? notation.split(' ').at(-1))[0], selfDraw: false, doraKinds: [], uraKinds: [], redFives: 0,
    ...extra,
  }, extra.rules ?? rules);
}

test('Riichi: Regelwerk und Tabellen', () => {
  assert.equal(rules.variant, 'riichi');
  assert.equal(createRuleSet({ variant: 'riichi' }).startScore, 0);
  assert.equal(rules.rounds, 2);
  assert.equal(rules.sevenPairs, true);
  for (const [id, y] of Object.entries(RIICHI_YAKU)) assert.ok(y.de && y.en, id);
  assert.equal(formatKinds([doraKindOf(parseKinds('9b')[0])]), '1b');
  assert.equal(formatKinds([doraKindOf(parseKinds('4c')[0])]), '5c');
  assert.equal(formatKinds([doraKindOf(parseKinds('N')[0])]), 'E');
  assert.equal(formatKinds([doraKindOf(parseKinds('w')[0])]), 'g');
  assert.equal(formatKinds([doraKindOf(parseKinds('g')[0])]), 'r');
  assert.equal(formatKinds([doraKindOf(parseKinds('r')[0])]), 'w');
});

test('Riichi: Pinfu, Tanyao, Riichi mit Fu und Punkten', () => {
  // 234b 567c 678k 345k 88c, Ron auf 3k (beidseitig 3k/6k? 345k mit 3k → Ryanmen)
  let s = score('234b 567c 678k 345k 88c', { win: '3k' });
  assert.ok(ids(s).includes('pinfu') && ids(s).includes('tanyao'));
  assert.equal(s.han, 2);
  assert.equal(s.fu, 30);
  assert.equal(s.basePoints, 30 * 2 ** 4);
  const ron = settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0 });
  assert.equal(ron[2][1], 2000);
  // Selbstzug: Pinfu 20 Fu + Menzen Tsumo
  s = score('234b 567c 678k 345k 88c', { win: '3k', selfDraw: true });
  assert.ok(ids(s).includes('menzen_tsumo'));
  assert.equal(s.han, 3);
  assert.equal(s.fu, 20);
  const tsumo = settleRiichi(s.basePoints, { winner: 1, discarder: null, dealer: 0 });
  assert.equal(tsumo[0][1], 1300); // Ost zahlt 2×640 → 1300
  assert.equal(tsumo[2][1], 700);
  assert.equal(tsumo[3][1], 700);
  // Riichi + Pinfu + Tanyao = 3 Han 30 Fu → 3900 (Nicht-Ost), 5800 (Ost)
  s = score('234b 567c 678k 345k 88c', { win: '3k', riichi: true });
  assert.equal(s.han, 3);
  assert.equal(settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0 })[2][1], 3900);
  assert.equal(settleRiichi(s.basePoints, { winner: 0, discarder: 2, dealer: 0 })[2][0], 5800);
  // Honba
  assert.equal(settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0, honba: 2 })[2][1], 4500);
});

test('Riichi: Fu-Berechnung mit Pungs, Yakuhai-Paar und Warten', () => {
  // EEE (eigener Wind = Süd? Sitzwind 1 = Süd; E ist Rundenwind) 111b 456c 789k 55c, Ron auf 5c (Tanki)
  const s = score('EEE 111b 456c 789k 55c', { win: '5c' });
  assert.ok(ids(s).includes('yakuhai_round'));
  // 20 + 10 (Menzen Ron) + 8 (EEE verdeckt) + 8 (111b verdeckt) + 2 (Tanki) = 48 → 50
  assert.equal(s.fu, 50);
  assert.equal(s.han, 1);
  assert.equal(settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0 })[2][1], 1600);
  // Ron auf 2b (Shanpon): der vervollständigte Pung zählt als offen (2 Fu statt 4) → 40; Tanki auf 5c → 50
  const s2 = score('222b 456c 789k EEE 55c', { win: '2b' });
  assert.equal(s2.fu, 40);
  assert.equal(score('222b 456c 789k EEE 55c', { win: '5c' }).fu, 50);
  // Kanchan-Warten, Drachenpaar
  const s3 = score('123b 456c 789k 234k rr', { win: '3k' });
  assert.equal(s3.fu, 40); // 20 + 10 + 2 (Paar) + 2 (Kanchan) = 34 → 40
});

test('Riichi: Chiitoitsu, Honroutou, Chinitsu, Iipeikou, Sanshoku, Ittsu, Chanta', () => {
  let s = score('11b 22b 33c 44c 55k EE rr', { win: 'r' });
  assert.ok(ids(s).includes('chiitoitsu'));
  assert.equal(s.fu, 25);
  assert.equal(settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0 })[2][1], 1600);
  s = score('11b 99b 11c 99k EE SS rr', { win: 'r' });
  assert.ok(ids(s).includes('honroutou') && ids(s).includes('chiitoitsu'));
  assert.equal(s.han, 4);
  s = score('123b 456b 789b 234b 99b', { win: '9b' });
  assert.ok(ids(s).includes('chinitsu') && ids(s).includes('ittsu') && ids(s).includes('pinfu'));
  assert.equal(s.han, 6 + 2 + 1);
  assert.equal(s.limitName, 'baiman');
  s = score('123b 123b 456c 789k 55c', { win: '5c' });
  assert.ok(ids(s).includes('iipeikou'));
  s = score('123b 123c 123k 456c 55c', { win: '5c' });
  assert.ok(ids(s).includes('sanshoku'));
  s = score('123b 456b 789b 234c 55c', { win: '5c' });
  assert.ok(ids(s).includes('ittsu'));
  s = score('123b 789c 999k EEE 11c', { win: '1c' });
  assert.ok(ids(s).includes('chanta'));
  s = score('123b 789c 999k 111k 11c', { win: '1c' });
  assert.ok(ids(s).includes('junchan'));
  s = score('123b 123b 456c 456c 55c', { win: '5c' });
  assert.ok(ids(s).includes('ryanpeikou') && !ids(s).includes('iipeikou'));
});

test('Riichi: Yakuman und Grenzen', () => {
  let s = score('rrr ggg www 123b 55c', { win: '5c' });
  assert.ok(ids(s).includes('daisangen'));
  assert.equal(s.yakuman, 1);
  assert.equal(settleRiichi(s.basePoints, { winner: 1, discarder: 2, dealer: 0 })[2][1], 32000);
  assert.equal(settleRiichi(s.basePoints, { winner: 0, discarder: 2, dealer: 0 })[2][0], 48000);
  s = score('19b 19c 19k ESWN rgw E', { win: 'E' });
  assert.ok(ids(s).includes('kokushi'));
  s = score('111b 222b 333c EEE 55k', { win: '5k' });
  assert.ok(ids(s).includes('suuankou'));
  s = score('111b 222b 333c EEE 55k', { win: 'E' });
  assert.ok(!ids(s).includes('suuankou') && ids(s).includes('sanankou') && ids(s).includes('toitoi'));
  s = score('111b 222b 333c EEE 55k', { win: 'E', selfDraw: true });
  assert.ok(ids(s).includes('suuankou'));
  s = score('EEE SSS WWW rrr gg', { win: 'g' });
  assert.ok(ids(s).includes('tsuuiisou'));
  s = score('1112345678999b 5b', { win: '5b' });
  assert.ok(ids(s).includes('chuuren'));
  s = score('EEE SSS WWW NNN 55c', { win: '5c' });
  assert.ok(ids(s).includes('daisuushii'));
  s = score('123b 456c 789k EEE rr', { win: 'r', tenhou: true, selfDraw: true });
  assert.ok(ids(s).includes('tenhou'));
  assert.deepEqual(riichiPoints(5, 30), { base: 2000, limitName: 'mangan' });
  assert.deepEqual(riichiPoints(13, 30), { base: 8000, limitName: 'kazoe_yakuman' });
  assert.equal(riichiPoints(4, 30).base, 1920);
  assert.equal(riichiPoints(4, 30, 0, { kiriageMangan: true }).base, 2000);
  assert.equal(riichiPoints(4, 40).base, 2000);
});

test('Riichi: Dora zählen nur mit Yaku, Ura nur mit Riichi', () => {
  const dora = parseKinds('1b');
  let s = score('111b 456c 789k 234k 55c', { win: '5c', doraKinds: dora, uraKinds: parseKinds('5c'), selfDraw: true });
  assert.equal(han(s, 'dora'), 3);
  assert.equal(han(s, 'ura_dora'), undefined);
  assert.equal(s.han, 1 + 3);
  s = score('111b 456c 789k 234k 55c', { win: '5c', doraKinds: dora, uraKinds: parseKinds('5c'), selfDraw: true, riichi: true, redFives: 1 });
  assert.equal(han(s, 'ura_dora'), 3); // 55c und 456c
  assert.equal(han(s, 'aka_dora'), 1);
  assert.equal(s.han, 2 + 3 + 3 + 1);
  assert.equal(s.limitName, 'baiman');
});

test('Riichi: Yaku-Pflicht (hasYaku), Kuitan', () => {
  const open = { melds: [meld('chow', '123b')], concealed: parseKinds('456c 789k 234k 55c') };
  assert.equal(hasYaku({ ...open, seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: true }, rules), false);
  const yakuhai = { melds: [meld('pung', 'rrr')], concealed: parseKinds('456c 789k 234k 55c') };
  assert.equal(hasYaku({ ...yakuhai, seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: false }, rules), true);
  const tanyao = { melds: [meld('chow', '234b')], concealed: parseKinds('456c 678k 234k 55c') };
  assert.equal(hasYaku({ ...tanyao, seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: false }, rules), true);
  assert.equal(hasYaku({ ...tanyao, seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: false }, createRuleSet({ variant: 'riichi', kuitan: false })), false);
  // Verdeckte Hand hat per Selbstzug immer Menzen Tsumo
  assert.equal(hasYaku({ concealed: parseKinds('123b 456c 789k 234k 55c'), melds: [], seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: true }, rules), true);
  assert.equal(hasYaku({ concealed: parseKinds('123b 456c 789k 234k 55c'), melds: [], seatWind: 1, roundWind: 0, winningKind: parseKinds('5c')[0], selfDraw: false }, rules), false);
});

test('Riichi: Noten-Bappu', () => {
  let p = notenPayments([true, false, false, false]);
  assert.equal(p[1][0] + p[2][0] + p[3][0], 3000);
  p = notenPayments([true, true, false, false]);
  assert.equal(p[2][0], 750);
  assert.equal(p[2][0] + p[2][1] + p[3][0] + p[3][1], 3000);
  p = notenPayments([true, true, true, false]);
  assert.equal(p[3][0], 1000);
  assert.deepEqual(notenPayments([true, true, true, true]).flat().reduce((a, b) => a + b, 0), 0);
});

// ---------- Regelkern ----------

test('Riichi-Engine: Wand mit Dora-Anzeigern, Riichi-Ansage und ihre Folgen', () => {
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: rules });
  assert.equal(s.wall.indicators.length, 5);
  assert.equal(s.wall.ura.length, 5);
  assert.equal(s.wall.dead.length, 4);
  assert.equal(s.doraRevealed, 1);
  const legal = getLegalActions(s, 0);
  const riichis = legal.filter((a) => a.type === 'riichi');
  assert.deepEqual(riichis.map((a) => formatKinds([kindOf(a.tile)])).sort(), ['3k', '6k', '9k']);
  assert.ok(legal.some((a) => a.type === 'discard'));
  s = applyAction(s, riichis.find((a) => kindOf(a.tile) === parseKinds('9k')[0]));
  assert.equal(s.players[0].score, 24000);
  assert.equal(s.riichiSticks, 1);
  assert.equal(s.players[0].riichi.double, true); // erster Abwurf ohne Rufe
  assert.equal(s.players[0].riichi.ippatsu, true);
  assert.equal(s.phase, 'claiming');
  assert.ok(s.log.some((e) => e.type === 'riichi'));
  s = allPass(s);
  // Riichi-Spieler darf nicht rufen
  for (let seat = 1; seat <= 3; seat++) {
    s = applyAction(s, { type: 'draw', seat });
    s = applyAction(s, { type: 'discard', seat, tile: s.players[seat].hand.at(-1) });
    assert.ok(getLegalActions(s, 0).every((a) => a.type === 'pass' || a.type === 'mahjong'));
    s = allPass(s);
  }
  s = applyAction(s, { type: 'draw', seat: 0 });
  const after = getLegalActions(s, 0);
  const discards = after.filter((a) => a.type === 'discard');
  assert.equal(discards.length, 1);
  assert.equal(discards[0].tile, s.lastDraw.tile); // nur Tsumogiri
  assert.ok(!after.some((a) => a.type === 'riichi'));
  assert.throws(() => applyAction(s, { type: 'discard', seat: 0, tile: s.players[0].hand[0] }));
});

test('Riichi-Engine: kein Riichi ohne Punkte, mit offener Hand oder bei fast leerer Wand', () => {
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: rules });
  s = structuredClone(s);
  s.players[0].score = 900;
  assert.ok(!getLegalActions(s, 0).some((a) => a.type === 'riichi'));
  s.players[0].score = 25000;
  s.wall.living = s.wall.living.slice(0, 3);
  assert.ok(!getLegalActions(s, 0).some((a) => a.type === 'riichi'));
});

test('Riichi-Engine: Yaku-Pflicht und Furiten beim Ron', () => {
  // Sitz 1 wartet offen (Chow 123b gerufen) auf 5c ohne Yaku → kein Ron; Sitz 2 verdeckt wartend, aber 5c selbst abgeworfen → Furiten
  const build = () => {
    let s = rigGame({
      hands: ['5c 123k 456k 789k EEE 9b', '123b 456c 789k 234k 5c', '234b 567c 678k 34c 88c', null],
      ruleSet: rules,
    });
    s = structuredClone(s);
    const p1 = s.players[1];
    const tiles = parseKinds('123b').map((k) => { const id = p1.hand.find((x) => kindOf(x) === k); p1.hand.splice(p1.hand.indexOf(id), 1); return id; });
    p1.melds.push({ type: 'chow', tiles, kinds: tiles.map(kindOf), open: true, from: 0 });
    s.turn = 8; s.firstDiscardDone = true; s.callsThisHand = true;
    return s;
  };
  let s = build();
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5c') });
  assert.ok(!getLegalActions(s, 1).some((a) => a.type === 'mahjong'), 'kein Yaku');
  assert.ok(getLegalActions(s, 2).some((a) => a.type === 'mahjong'), 'Sitz 2 darf Ron (Pinfu/Tanyao)');
  // Sitz 2 passt → vorübergehendes Furiten
  s = applyAction(s, { type: 'pass', seat: 1 });
  s = applyAction(s, { type: 'pass', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  assert.equal(s.players[2].furiten, true);
  assert.equal(isFuriten(s, s.players[2]), true);
  // Sitz 1 zieht und wirft erneut 5c: Sitz 2 ist furiten
  s = applyAction(s, { type: 'draw', seat: 1 });
  const five = s.players[1].hand.find((id) => kindOf(id) === parseKinds('5c')[0]) ?? null;
  if (five !== null) {
    s = applyAction(s, { type: 'discard', seat: 1, tile: five });
    assert.ok(!getLegalActions(s, 2).some((a) => a.type === 'mahjong'));
  }
  // Dauerhaftes Furiten durch eigenen Abwurf (eine Kopie von 2c aus Wand oder Füllhand in die eigenen Abwürfe)
  let f = build();
  f = structuredClone(f);
  const two = parseKinds('2c')[0];
  let copy = f.wall.living.find((id) => kindOf(id) === two);
  if (copy !== undefined) f.wall.living = f.wall.living.filter((id) => id !== copy);
  else { copy = f.players[3].hand.find((id) => kindOf(id) === two); f.players[3].hand = f.players[3].hand.filter((id) => id !== copy); }
  f.players[2].discards.push(copy);
  assert.equal(isFuriten(f, f.players[2]), true);
  f = applyAction(f, { type: 'discard', seat: 0, tile: tileOf(f, 0, '5c') });
  assert.ok(!getLegalActions(f, 2).some((a) => a.type === 'mahjong'));
});

test('Riichi-Engine: Ippatsu, Kan-Dora, Unentschieden mit Tenpai, Honba, Stäbchen', () => {
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: rules });
  s = applyAction(s, getLegalActions(s, 0).find((a) => a.type === 'riichi'));
  s = allPass(s);
  // Gegner ziehen und werfen ab; ein Pung unterbricht Ippatsu
  s = applyAction(s, { type: 'draw', seat: 1 });
  s = applyAction(s, { type: 'discard', seat: 1, tile: s.players[1].hand.at(-1) });
  assert.equal(s.players[0].riichi.ippatsu, true);
  s = allPass(s);
  s = applyAction(s, { type: 'draw', seat: 2 });
  s = applyAction(s, { type: 'discard', seat: 2, tile: s.players[2].hand.at(-1) });
  s = allPass(s);
  s = applyAction(s, { type: 'draw', seat: 3 });
  s = applyAction(s, { type: 'discard', seat: 3, tile: s.players[3].hand.at(-1) });
  s = allPass(s);
  s = applyAction(s, { type: 'draw', seat: 0 });
  s = applyAction(s, { type: 'discard', seat: 0, tile: s.lastDraw.tile });
  assert.equal(s.players[0].riichi.ippatsu, false);
  assert.equal(s.players[0].riichi.safe.length >= 3, true);
  // Unentschieden mit Tenpai-Prüfung: Wand leeren
  s = structuredClone(s);
  s = allPass(s);
  s.wall.living = [];
  s = applyAction(s, { type: 'draw', seat: 1 });
  assert.equal(s.phase, 'handOver');
  assert.equal(s.result.type, 'draw');
  assert.equal(s.result.tenpai[0], true);
  const r = scoreRound(s);
  assert.equal(r.sheets[0].tenpai, true);
  assert.equal(r.net.reduce((a, b) => a + b, 0), 0);
  assert.ok(r.net[0] > 0);
  s = applyPayments(s, r.payments, r.bonus);
  s = applyAction(s, { type: 'endHand' });
  assert.equal(s.dealer, 0); // Ost war wartend
  assert.equal(s.honba, 1);
  assert.equal(s.riichiSticks, 1); // bleibt liegen
  assert.equal(s.players.reduce((a, p) => a + p.score, 0) + 1000 * s.riichiSticks, 100000);
});

test('Riichi-Engine: Selbstzug mit Riichi, Ippatsu und Ura-Dora; Honba zurück auf null; Stäbchen an den Gewinner', () => {
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: rules, dealer: 1, current: 0 });
  // Sitz 0 ist nicht Ost (dealer 1): Chiihou-Bedingungen nicht erfüllt, da Sitz 0 nach Riichi zieht
  s = structuredClone(s);
  s.honba = 2; s.riichiSticks = 1; s.players[3].score -= 1000; s.turn = 4; s.firstDiscardDone = true;
  s = applyAction(s, getLegalActions(s, 0).find((a) => a.type === 'riichi'));
  s = allPass(s);
  for (const seat of [1, 2, 3]) {
    s = applyAction(s, { type: 'draw', seat });
    const safe = s.players[seat].hand.find((id) => !parseKinds('25k').includes(kindOf(id)));
    s = applyAction(s, { type: 'discard', seat, tile: safe });
    s = allPass(s);
  }
  // Gewinnstein 2k oder 5k an den Anfang der Wand legen
  s = structuredClone(s);
  const five = s.wall.living.find((id) => kindOf(id) === parseKinds('5k')[0]);
  s.wall.living = [five, ...s.wall.living.filter((id) => id !== five)];
  s = applyAction(s, { type: 'draw', seat: 0 });
  const mj = getLegalActions(s, 0).find((a) => a.type === 'mahjong');
  assert.ok(mj);
  s = applyAction(s, mj);
  const r = scoreRound(s);
  const sheet = r.sheets[0];
  // Erster Abwurf ohne Rufe → Doppel-Riichi
  assert.ok(ids(sheet).includes('double_riichi') && ids(sheet).includes('ippatsu') && ids(sheet).includes('menzen_tsumo') && ids(sheet).includes('pinfu'));
  assert.equal(r.bonus[0], 2000); // 1 altes + 1 eigenes Stäbchen
  assert.ok(r.payments[1][0] > r.payments[2][0]); // Ost zahlt doppelt
  s = applyPayments(s, r.payments, r.bonus);
  s = applyAction(s, { type: 'endHand' });
  assert.equal(s.honba, 0);
  assert.equal(s.riichiSticks, 0);
  assert.equal(s.dealer, 2);
  assert.equal(s.players.reduce((a, p) => a + p.score, 0), 100000);
});

test('Riichi-Engine: Kan nach Riichi nur mit gezogenem Stein bei gleichem Warten, Kan-Dora', () => {
  // Nach dem Riichi-Abwurf 9k wartet die Hand auf 3k (Penchan); das gezogene 5k bildet ein Kan, ohne das Warten zu ändern
  let s = rigGame({ hands: ['234b 567c 555k 88c 12k 9k', null, null, null], ruleSet: rules });
  s = applyAction(s, getLegalActions(s, 0).find((a) => a.type === 'riichi' && kindOf(a.tile) === parseKinds('9k')[0]));
  s = allPass(s);
  for (const seat of [1, 2, 3]) {
    s = applyAction(s, { type: 'draw', seat });
    s = applyAction(s, { type: 'discard', seat, tile: s.players[seat].hand.find((id) => kindOf(id) !== parseKinds('3k')[0]) });
    s = allPass(s);
  }
  s = structuredClone(s);
  const k5 = s.wall.living.find((id) => kindOf(id) === parseKinds('5k')[0]);
  s.wall.living = [k5, ...s.wall.living.filter((id) => id !== k5)];
  s = applyAction(s, { type: 'draw', seat: 0 });
  // 5k-Kan lässt das Warten (3k) unverändert → erlaubt
  const kan = getLegalActions(s, 0).find((a) => a.type === 'kong');
  assert.ok(kan);
  assert.equal(kan.variant, 'concealed');
  s = applyAction(s, kan);
  assert.equal(s.doraRevealed, 2);
  assert.equal(s.wall.dead.length, 4);
  assert.equal(s.players[0].riichi.ippatsu, false);
});

test('Riichi-Engine: Bust beendet das Spiel', () => {
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: rules });
  s = structuredClone(s);
  s.players[1].score = -500;
  s.phase = 'handOver';
  s.result = { type: 'draw', tenpai: [false, false, false, false] };
  s = applyAction(s, { type: 'endHand' });
  assert.equal(s.phase, 'gameOver');
});

test('Riichi-Engine: zufällige KI-Partien halten die Invarianten', () => {
  let wins = 0, riichis = 0;
  for (let g = 0; g < 8; g++) {
    let s = createGame({ seed: `ri-${g}`, humanSeat: -1, ruleSet: createRuleSet({ variant: 'riichi', rounds: 1, startScore: 25000 }) });
    s = applyAction(s, { type: 'startHand' });
    let hands = 0;
    while (s.phase !== 'gameOver' && hands < 6) {
      s = runUntilHuman(s, { difficulty: ['easy', 'medium', 'hard'][g % 3] });
      assert.equal(s.phase, 'handOver');
      hands++;
      const r = scoreRound(s);
      if (s.result.type === 'win') {
        wins++;
        // Dora-Arten stammen aus den Anzeigern (IDs → Art → nächste Art)
        assert.deepEqual(r.doraKinds, s.wall.indicators.slice(0, s.doraRevealed).map((id) => doraKindOf(kindOf(id))));
        assert.ok(r.doraKinds.every((k) => k >= 0 && k < 34));
        const sheet = r.sheets[s.result.winner];
        assert.ok(sheet.yakuman > 0 || sheet.hanYaku > 0, 'Gewinn ohne Yaku');
        assert.ok(r.net[s.result.winner] > 0);
      } else {
        assert.equal(r.tenpai.length, 4);
      }
      riichis += s.players.filter((p) => p.riichi).length;
      assert.equal(r.net.reduce((a, b) => a + b, 0), r.bonus.reduce((a, b) => a + b, 0));
      s = applyPayments(s, r.payments, r.bonus);
      s = applyAction(s, { type: 'endHand' });
      // Nach dem Abschluss der Hand: Punkte plus liegende Stäbchen sind konstant
      assert.equal(s.players.reduce((a, p) => a + p.score, 0) + 1000 * s.riichiSticks, 100000);
      if (s.phase === 'idle') s = applyAction(s, { type: 'startHand' });
    }
    // Replay aus der Aktionsliste reproduziert die Punktestände
    const r = replay({ seed: s.seed, ruleSet: s.ruleSet, humanSeat: -1, actions: s.actions });
    assert.deepEqual(r.players.map((p) => p.hand), s.players.map((p) => p.hand));
    assert.equal(r.riichiSticks, s.riichiSticks);
  }
  assert.ok(wins > 0);
});

test('Riichi mit 0 Startpunkten: Riichi erlaubt, kein Bankrott', () => {
  const zero = createRuleSet({ variant: 'riichi', startScore: 0 });
  let s = rigGame({ hands: ['234b 567c 678k 34k 88c 9k', null, null, null], ruleSet: zero });
  s = structuredClone(s);
  s.players.forEach((p) => { p.score = 0; });
  assert.ok(getLegalActions(s, 0).some((a) => a.type === 'riichi'));
  s.players[1].score = -3000;
  s.phase = 'handOver';
  s.result = { type: 'draw', tenpai: [false, false, false, false] };
  s = applyAction(s, { type: 'endHand' });
  assert.equal(s.phase, 'idle');
});
