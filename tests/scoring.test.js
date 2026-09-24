import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, kindOf } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { scoreHand, settle, settleDraw, netFromPayments, scoreRound } from '../src/scoring/millington.js';
import { SCORE_RULES } from '../src/scoring/table.js';
import { createGame, applyAction } from '../src/core/state.js';
import { createRngState } from '../src/core/rng.js';
import { rigGame, tileOf, playRandomHand } from './helpers.js';

const rules = createRuleSet();
const meld = (type, notation, open = true) => ({ type, kinds: parseKinds(notation), open });
const ids = (sheet) => sheet.lines.map((l) => l.id);
const count = (sheet, id) => sheet.lines.filter((l) => l.id === id).length;

function winner(notation, extra = {}) {
  return scoreHand({
    concealed: parseKinds(notation),
    melds: [],
    bonus: [],
    seatWind: 0,
    roundWind: 0,
    winner: true,
    winningKind: parseKinds(extra.win ?? notation.split(' ').at(-1))[0],
    selfDraw: true,
    ...extra,
  }, extra.rules ?? rules);
}

test('Tabelle: jede Zeile hat Art, Wert und Labels', () => {
  for (const [id, r] of Object.entries(SCORE_RULES)) {
    assert.ok(['points', 'double', 'limit'].includes(r.kind), id);
    assert.ok(typeof r.value === 'number' && r.de && r.en, id);
  }
});

test('Einfache Gewinnerhand, Selbstzug, Ost in Ostrunde', () => {
  // 123b 456c 789k EEE rr, Gewinnstein r vervollständigt das Paar
  const s = winner('123b 456c 789k EEE rr', { win: 'r' });
  assert.ok(s.winner);
  assert.equal(count(s, 'mahjong'), 1);
  assert.equal(count(s, 'win_self_draw'), 1);
  assert.equal(count(s, 'win_pair_wait_major'), 1);
  assert.equal(count(s, 'win_only_possible'), 1);
  assert.equal(count(s, 'pung_major_closed'), 1);
  assert.equal(count(s, 'pair_dragon'), 1);
  assert.equal(count(s, 'dbl_pung_own_wind'), 1);
  assert.equal(count(s, 'dbl_pung_round_wind'), 1);
  assert.equal(count(s, 'dbl_concealed'), 1);
  assert.equal(s.points, 20 + 2 + 4 + 2 + 8 + 2);
  assert.equal(s.doubles, 3);
  assert.equal(s.total, 38 * 8);
});

test('Hühnerhand: nur Chows, kein Paarwert → 1 Verdopplung', () => {
  const s = winner('123b 456c 789k 234k 55b', { win: '2k', selfDraw: false, seatWind: 1, roundWind: 0 });
  assert.equal(count(s, 'dbl_zero_point_hand'), 1);
  assert.equal(s.points, 20);
  assert.equal(s.total, 40);
});

test('Mit Abwurf vervollständigter Pung zählt als offen', () => {
  const s = winner('123b 456c 789k EEE 55k', { win: 'E', selfDraw: false, seatWind: 1, roundWind: 0 });
  assert.equal(count(s, 'pung_major_open'), 1);
  assert.equal(count(s, 'pung_major_closed'), 0);
  assert.equal(count(s, 'dbl_pung_round_wind'), 1);
  assert.equal(count(s, 'dbl_concealed'), 0);
  assert.equal(s.total, 24 * 2);
});

test('Günstigste Zuordnung des Gewinnsteins wird gewählt', () => {
  // 3b kann Chow 123b oder Pung 333b vervollständigen; Paar-Warten zählt nicht, Pung verdeckt zählt mehr.
  const s = winner('123b 333b 456c 789k 55k', { win: '3b', selfDraw: false });
  assert.equal(count(s, 'pung_simple_closed'), 1);
});

test('Kein Chow, drei verdeckte Pungs, Halb-Flush', () => {
  const s = winner('111b 222b 333b EEE 99b', { win: '9b' });
  assert.equal(count(s, 'dbl_no_chow'), 1);
  assert.equal(count(s, 'dbl_three_concealed_pungs'), 0); // vier verdeckte + Selbstzug → Buried Treasure
  assert.equal(count(s, 'lim_hidden_treasure'), 1);
  assert.equal(s.total, rules.limit);
  const s2 = winner('111b 222b 333b EEE 99b', { win: '9b', selfDraw: false });
  assert.equal(count(s2, 'dbl_three_concealed_pungs'), 1);
  assert.equal(count(s2, 'dbl_half_flush'), 1);
  assert.equal(count(s2, 'lim_hidden_treasure'), 0);
});

test('Reine Farbe: offen 3 Verdopplungen, verdeckt Limit', () => {
  const open = scoreHand({
    concealed: parseKinds('123b 456b 99b'), melds: [meld('pung', '777b'), meld('chow', '234b')],
    bonus: [], seatWind: 2, roundWind: 1, winner: true, winningKind: parseKinds('9b')[0], selfDraw: false,
  }, rules);
  assert.equal(count(open, 'dbl_full_flush'), 1);
  assert.equal(open.doubles, 3);
  const closed = winner('123b 456b 789b 234b 99b', { win: '9b' });
  assert.equal(count(closed, 'lim_concealed_full_flush'), 1);
  assert.equal(closed.total, rules.limit);
});

test('Limit-Hände', () => {
  assert.ok(ids(winner('19b 19c 19k ESWN rgw E', { win: 'E' })).includes('lim_thirteen_orphans'));
  assert.ok(ids(winner('1112345678999b 5b', { win: '5b' })).includes('lim_nine_gates'));
  assert.ok(ids(winner('rrr ggg www 123b 55c', { win: '5c' })).includes('lim_big_three_dragons'));
  assert.ok(ids(winner('EEE SSS WWW NNN 55c', { win: '5c' })).includes('lim_big_four_winds'));
  assert.ok(ids(winner('EEE SSS WWW rrr gg', { win: 'g' })).includes('lim_all_honours'));
  assert.ok(ids(winner('111b 999b 111c 999k 99c', { win: '9c' })).includes('lim_heads_and_tails'));
  assert.ok(ids(winner('222b 333b 444b 666b gg', { win: 'g' })).includes('lim_all_green'));
  assert.ok(ids(winner('123b 456c 789k EEE rr', { win: 'r', heavenly: true })).includes('lim_heavenly'));
  assert.ok(ids(winner('123b 456c 789k EEE rr', { win: 'r', earthly: true, selfDraw: false })).includes('lim_earthly'));
  assert.ok(ids(winner('123b 456c 789k EEE 55c', { win: '5c', kongReplacement: true })).includes('lim_plum_blossom'));
  assert.ok(ids(winner('123b 456c 789k EEE 11c', { win: '1c', lastWallTile: true })).includes('lim_plucking_moon'));
  assert.ok(ids(winner('234b 456c 789k EEE 55c', { win: '2b', robbedKong: true, selfDraw: false })).includes('lim_scratching_pole'));
  const fourKongs = scoreHand({
    concealed: parseKinds('55c'), melds: [meld('kong', '1111b'), meld('kong', '2222b', false), meld('kong', 'EEEE'), meld('kong', 'rrrr')],
    bonus: [], seatWind: 0, roundWind: 0, winner: true, winningKind: parseKinds('5c')[0], selfDraw: true,
  }, rules);
  assert.ok(ids(fourKongs).includes('lim_four_kongs'));
  assert.equal(fourKongs.total, rules.limit);
  assert.equal(winner('19b 19c 19k ESWN rgw E', { win: 'E' }).total, rules.limit);
  assert.equal(winner('19b 19c 19k ESWN rgw E', { win: 'E', rules: createRuleSet({ limit: 1000 }) }).total, 1000);
});

test('Kleine Drachen, kleine Winde, Endsteine und Honours', () => {
  const s = winner('rrr ggg 123b 456c ww', { win: 'w' });
  assert.equal(count(s, 'dbl_little_three_dragons'), 1);
  assert.equal(count(s, 'dbl_pung_dragon'), 2);
  const w = winner('EEE SSS WWW 123b NN', { win: 'N', seatWind: 3 });
  assert.equal(count(w, 'dbl_little_four_winds'), 1);
  const th = winner('111b 999c EEE rrr 99k', { win: '9k' });
  assert.equal(count(th, 'dbl_terminals_honours'), 1);
});

test('Reguläre Hand wird auf das Limit gekappt', () => {
  // 4 verdeckte Major-Pungs offen gewonnen: viele Punkte und Verdopplungen
  const s = winner('rrr ggg 111b 999b EE', { win: 'E', selfDraw: false, rules: createRuleSet({ limit: 100 }) });
  assert.ok(s.points * 2 ** s.doubles > 100);
  assert.equal(s.total, 100);
});

test('Verlierer zählen Sätze, Paare und Bonussteine', () => {
  const s = scoreHand({
    concealed: parseKinds('111b 55c rr 23k 4k 9k'), melds: [meld('pung', 'EEE')],
    bonus: parseKinds('F1 S1'), seatWind: 0, roundWind: 1, winner: false,
  }, createRuleSet({ bonusTiles: true }));
  assert.ok(!s.winner);
  assert.equal(count(s, 'pung_major_closed'), 1); // 111b
  assert.equal(count(s, 'pung_major_open'), 1); // EEE
  assert.equal(count(s, 'dbl_pung_own_wind'), 1);
  assert.equal(count(s, 'pair_dragon'), 1);
  assert.equal(count(s, 'flower'), 1);
  assert.equal(count(s, 'season'), 1);
  assert.equal(count(s, 'dbl_own_flower_season'), 1);
  assert.equal(count(s, 'dbl_half_flush'), 0); // Handform-Verdopplungen nur mit Option
  assert.equal(s.points, 8 + 4 + 2 + 4 + 4);
  assert.equal(s.doubles, 2);
  assert.equal(s.total, 22 * 4);
});

test('Zahlungsmatrix: Ost doppelt, Verlierer untereinander, Summe null', () => {
  const values = [304, 10, 0, 20];
  const pay = settle(values, { winner: 0, discarder: 2, dealer: 0 }, rules);
  assert.equal(pay[1][0], 608);
  assert.equal(pay[2][0], 608);
  assert.equal(pay[3][0], 608);
  assert.equal(pay[2][1], 10);
  assert.equal(pay[1][3], 10);
  assert.equal(pay[2][3], 20);
  const net = netFromPayments(pay);
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
  assert.equal(net[0], 3 * 608);
  assert.equal(net[1], -608);
  assert.equal(net[2], -608 - 30);
  assert.equal(net[3], -608 + 30);
});

test('Zahlungsmatrix: Abwerfender zahlt für alle, Ost als Verlierer zahlt doppelt', () => {
  const pay = settle([0, 100, 0, 0], { winner: 1, discarder: 3, dealer: 0 }, createRuleSet({ discarderPaysAll: true, losersPayEachOther: false }));
  assert.equal(pay[3][1], 300);
  assert.equal(pay[0][1], 0);
  const pay2 = settle([0, 100, 0, 0], { winner: 1, discarder: 3, dealer: 0 }, createRuleSet({ losersPayEachOther: false }));
  assert.equal(pay2[0][1], 200);
  assert.equal(pay2[2][1], 100);
});

test('scoreRound aus dem Spielzustand', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k',
      '55b 111c 222c 333c NN',
      '123b 46b 789b 55c 111k',
      '1k 2k 3k 4k 6k 7k 8k 9k SSS WW',
    ],
  });
  // Gewinn auf Osts ersten Abwurf wäre eine Irdische Hand; hier eine spätere Situation simulieren.
  s = structuredClone(s);
  s.firstDiscardDone = true;
  s.turn = 5;
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  s = applyAction(s, { type: 'pass', seat: 1 });
  s = applyAction(s, { type: 'mahjong', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  const { sheets, payments, net } = scoreRound(s);
  assert.equal(count(sheets[2], 'lim_earthly'), 0);
  assert.ok(sheets[2].winner);
  assert.equal(sheets[2].lines[0].id, 'mahjong');
  // Sitz 2 (Westwind in Ostrunde): 111k verdeckt 8, Hühnerhand nein; nur mögliche Stein 5b → +2
  assert.equal(count(sheets[2], 'pung_major_closed'), 1);
  assert.equal(count(sheets[2], 'win_only_possible'), 1);
  assert.equal(sheets[2].total, (20 + 8 + 2) * 1);
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
  assert.equal(payments[0][2], 30 * 2); // Ost zahlt doppelt
  assert.equal(net[2], 30 * 4);
});

test('Zufällige Partien: Scoring wirft nie, Zahlungen summieren zu null', () => {
  const rng = createRngState('score-fuzz');
  let scored = 0;
  for (let g = 0; g < 60; g++) {
    let s = createGame({ seed: `sf-${g}`, ruleSet: createRuleSet({ rounds: 1, bonusTiles: g % 3 === 0 }) });
    s = applyAction(s, { type: 'startHand' });
    s = playRandomHand(s, rng);
    const { sheets, net } = scoreRound(s);
    assert.equal(net.reduce((a, b) => a + b, 0), 0);
    if (s.result.type === 'win') {
      scored++;
      assert.ok(sheets[s.result.winner].total >= 20);
      assert.ok(sheets.every((sh) => sh.total <= s.ruleSet.limit));
      assert.ok(net[s.result.winner] > 0);
    }
  }
  assert.ok(scored > 0);
});

test('Irdische Hand: Gewinn auf Osts ersten Abwurf', () => {
  let s = rigGame({
    hands: ['5b 123c 456c 789c EEE 9k', '55b 111c 222c 333c NN', '123b 46b 789b 55c 111k', '1k 2k 3k 4k 6k 7k 8k 9k SSS WW'],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  s = applyAction(s, { type: 'pass', seat: 1 });
  s = applyAction(s, { type: 'mahjong', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  const { sheets } = scoreRound(s);
  assert.equal(count(sheets[2], 'lim_earthly'), 1);
  assert.equal(sheets[2].total, rules.limit);
});

test('BMJA-Sonderhände zählen das Limit (Option optionalHands)', () => {
  const opt = createRuleSet({ optionalHands: true, limit: 1000 });
  const cases = [
    ['11b 23456789b ESWN', 'N', 'lim_wriggling_snake'],
    ['1234567b 1234567c', '7c', 'lim_knitting'],
    ['13579b 13579c 1357k', '7k', 'lim_triple_knitting'],
    ['11b 99b 11c 99k EE SS rr', 'r', 'lim_all_pair_honours'],
  ];
  for (const [n, win, id] of cases) {
    const s = winner(n, { win, rules: opt, selfDraw: false });
    assert.ok(ids(s).includes(id), id);
    assert.equal(s.total, 1000, id);
  }
});

test('Gefährliches Spiel (DMJL): Abwerfender zahlt für alle', () => {
  const pay = settle([0, 100, 0, 0], { winner: 1, discarder: 3, dealer: 0, dangerousGame: true }, createRuleSet({ losersPayEachOther: false }));
  assert.equal(pay[3][1], 300);
  assert.equal(pay[0][1], 0);
  assert.equal(pay[2][1], 0);
});

test('Hausregel: Grundpunkte vor der Verdopplung auf 10 aufrunden', () => {
  const rs = createRuleSet({ roundUpBeforeDoubling: true });
  // 123b 456c 789k EEE rr, Gewinnstein r: Punkte 20+2+4+2+8+2 = 38 (siehe erster Test), nicht durch 10 teilbar
  const s = winner('123b 456c 789k EEE rr', { win: 'r', rules: rs });
  assert.equal(s.points, 38);
  const expectedBase = Math.ceil(s.points / 10) * 10;
  assert.equal(expectedBase, 40);
  assert.equal(s.total, Math.min(expectedBase * 2 ** s.doubles, rs.limit));
  const off = winner('123b 456c 789k EEE rr', { win: 'r' }); // ohne die Option: Standardregel
  assert.equal(off.total, Math.min(off.points * 2 ** off.doubles, rules.limit));
  assert.notEqual(off.total, s.total);
  // Limit-Hände runden nicht: es zählt genau das Limit
  const lim = winner('19b 19c 19k ESWN rgw E', { win: 'E', rules: rs });
  assert.equal(lim.total, rs.limit);
});

test('Unentschieden mit settleOnDraw: alle zählen ihre Hand und rechnen untereinander ab', () => {
  const rs = createRuleSet({ rounds: 1, settleOnDraw: true });
  let s = rigGame({
    hands: ['999b 22b 456c 789k EEE', '55c 66c 77c 88c 99c 1k 2k 3k', '123b 456b 678b 234k 5k', '19b 19c 19k ESWN rgw'],
    ruleSet: rs,
  });
  s = structuredClone(s);
  s.result = { type: 'draw', roundWind: 0, dealer: 0 };
  const { sheets, payments, net } = scoreRound(s, rs);
  assert.equal(sheets.length, 4);
  assert.ok(sheets.every((sh) => !sh.winner));
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
  // Ost (Sitz 0) ist am reichsten (Pung Ost verdeckt): zahlt/erhält nichts Negatives insgesamt möglich, aber Summe bleibt 0
  assert.ok(payments.some((row) => row.some((v) => v > 0)));
  // Ohne die Option bleibt ein Unentschieden punktelos
  const plain = createRuleSet({ rounds: 1 });
  const zero = scoreRound(s, plain);
  assert.equal(zero.sheets, null);
  assert.deepEqual(zero.net, [0, 0, 0, 0]);
});

test('settleDraw: Ost-Verdopplung, Nullsummenspiel', () => {
  const rs = createRuleSet({ eastDoubles: true });
  const pay = settleDraw([40, 20, 0, 10], { dealer: 0 }, rs);
  assert.equal(pay[1][0], 40); // Sitz 1 zahlt an Ost (0): Differenz 20, ×2 wegen Ost
  assert.equal(pay[2][0], 80); // Differenz 40, ×2
  assert.equal(pay[2][3], 10); // Sitz 2 zahlt an Sitz 3: Differenz 10, kein Ost beteiligt
  const net = netFromPayments(pay);
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
});
