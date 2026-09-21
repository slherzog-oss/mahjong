import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, kindOf } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { createGame, applyAction, getLegalActions, applyPayments } from '../src/core/state.js';
import { createRngState } from '../src/core/rng.js';
import { scoreHandHK, settleHK, fanOf, HK_FANS, hkBasePoints } from '../src/scoring/hongkong.js';
import { scoreRound } from '../src/scoring/index.js';
import { runUntilHuman } from '../src/ai/runner.js';
import { rigGame, tileOf, playRandomHand } from './helpers.js';

const hk = createRuleSet({ variant: 'hongkong' });
const rules = createRuleSet({ variant: 'hongkong', bonusTiles: false });
const meld = (type, n, open = true) => ({ type, kinds: parseKinds(n), open });
const ids = (sheet) => sheet.lines.map((l) => l.id);

function winner(notation, extra = {}) {
  return scoreHandHK({
    concealed: parseKinds(notation), melds: [], bonus: [], seatWind: 0, roundWind: 0, winner: true,
    winningKind: parseKinds(extra.win ?? notation.split(' ').at(-1))[0], selfDraw: false, ...extra,
  }, extra.rules ?? rules);
}

test('Hong Kong: Regelwerk-Vorbelegung und Fan-Tabelle', () => {
  assert.equal(hk.variant, 'hongkong');
  assert.equal(hk.bonusTiles, true);
  assert.equal(hk.minFan, 3);
  assert.equal(hk.hkPayment, 'half');
  for (const [id, f] of Object.entries(HK_FANS)) assert.ok(typeof f.value === 'number' && f.de && f.en, id);
  assert.equal(hkBasePoints(0), 1);
  assert.equal(hkBasePoints(3), 8);
  assert.equal(hkBasePoints(13), 384);
  assert.equal(hkBasePoints(20), 384);
});

test('Hong Kong: Fan bekannter Hände', () => {
  let s = winner('123b 456c 789k 234k 55b', { win: '5b' });
  assert.deepEqual(ids(s).sort(), ['hk_all_chows', 'hk_concealed']);
  assert.equal(s.fan, 2);
  s = winner('rrr 123b 456c 789k 55c', { win: '5c', selfDraw: true });
  assert.ok(ids(s).includes('hk_dragon_pung') && ids(s).includes('hk_self_draw') && ids(s).includes('hk_concealed'));
  assert.equal(s.fan, 3);
  s = winner('111b 555c 999k EEE rr', { win: 'r' });
  assert.ok(ids(s).includes('hk_all_pungs') && ids(s).includes('hk_seat_wind') && ids(s).includes('hk_prevailing_wind'));
  assert.equal(s.fan, 3 + 1 + 1 + 1);
  s = winner('123b 456b 999b EEE rr', { win: 'r' });
  assert.ok(ids(s).includes('hk_half_flush'));
  s = winner('123b 456b 789b 234b 99b', { win: '9b' });
  assert.ok(ids(s).includes('hk_full_flush') && ids(s).includes('hk_all_chows'));
  assert.equal(s.fan, 7 + 1 + 1);
  s = winner('rrr ggg 123b 456c ww', { win: 'w' });
  assert.ok(ids(s).includes('hk_little_three_dragons'));
  assert.equal(s.lines.filter((l) => l.id === 'hk_dragon_pung').length, 0);
  assert.equal(s.fan, 5 + 1);
  s = winner('rrr ggg www 123b 55c', { win: '5c' });
  assert.ok(ids(s).includes('hk_big_three_dragons'));
  assert.equal(s.fan, 8 + 1);
  s = winner('EEE SSS WWW NNN 55c', { win: '5c' });
  assert.equal(s.fan, 13);
  assert.equal(s.limit, true);
  assert.equal(s.total, 384);
  s = winner('19b 19c 19k ESWN rgw E', { win: 'E' });
  assert.ok(ids(s).includes('hk_thirteen_orphans'));
  s = winner('111b 222b 333b EEE 99b', { win: '9b', selfDraw: true });
  assert.ok(ids(s).includes('hk_four_concealed_pungs'));
  s = winner('111b 222b 333b EEE 99b', { win: '9b', selfDraw: false });
  assert.ok(ids(s).includes('hk_all_pungs') && !ids(s).includes('hk_four_concealed_pungs'));
  // Hühnerhand: 0 Fan (offener Pung 999k, sonst Chows)
  s = winner('123b 456c 234k 55b', { win: '2k', melds: [meld('pung', '999k')], concealed: parseKinds('123b 456c 234k 55b') });
  assert.equal(s.fan, 0);
  assert.ok(ids(s).includes('hk_chicken'));
});

test('Hong Kong: Bonussteine', () => {
  let s = winner('123b 456c 789k 234k 55b', { win: '5b', bonus: parseKinds('F1 S1 F2'), rules: hk });
  assert.equal(s.lines.filter((l) => l.id === 'hk_own_flower').length, 1);
  assert.equal(s.lines.filter((l) => l.id === 'hk_own_season').length, 1);
  s = winner('123b 456c 789k 234k 55b', { win: '5b', bonus: parseKinds('F1 F2 F3 F4'), rules: hk });
  assert.ok(ids(s).includes('hk_all_flowers'));
  s = winner('123b 456c 789k 234k 55b', { win: '5b', bonus: [], rules: hk });
  assert.ok(ids(s).includes('hk_no_flowers'));
});

test('Hong Kong: Zahlungen halb/voll, Selbstzug', () => {
  const half = settleHK([0, 8, 0, 0], { winner: 1, discarder: 3 }, rules);
  assert.equal(half[3][1], 16);
  assert.equal(half[0][1] + half[2][1], 0);
  const full = settleHK([0, 8, 0, 0], { winner: 1, discarder: 3 }, createRuleSet({ variant: 'hongkong', hkPayment: 'full' }));
  assert.equal(full[3][1], 24);
  const tsumo = settleHK([0, 8, 0, 0], { winner: 1, discarder: null }, rules);
  assert.equal(tsumo[0][1] + tsumo[2][1] + tsumo[3][1], 24);
});

test('Hong Kong: Mindest-Fan entscheidet über die Mahjong-Erlaubnis', () => {
  // Sitz 1 wartet auf 5b mit einer Hühnerhand (nur Chows, offen)
  const hands = ['5k 123c 456c 789c EEE 9b', '234b 678c 234k 46k 88b', null, null];
  const build = (minFan) => {
    let s = rigGame({ hands, ruleSet: createRuleSet({ variant: 'hongkong', minFan, bonusTiles: false }) });
    s = structuredClone(s);
    const p = s.players[1];
    const tiles = parseKinds('234b').map((k) => { const id = p.hand.find((x) => kindOf(x) === k); p.hand.splice(p.hand.indexOf(id), 1); return id; });
    p.melds.push({ type: 'chow', tiles, kinds: tiles.map(kindOf), open: true, from: 0 });
    s.turn = 5; s.firstDiscardDone = true;
    return applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5k') });
  };
  let s = build(3);
  assert.ok(!getLegalActions(s, 1).some((a) => a.type === 'mahjong'));
  assert.ok(getLegalActions(s, 1).some((a) => a.type === 'chow') || getLegalActions(s, 1).some((a) => a.type === 'pass'));
  s = build(0);
  assert.ok(getLegalActions(s, 1).some((a) => a.type === 'mahjong'));
  s = applyAction(s, { type: 'mahjong', seat: 1 });
  s = applyAction(s, { type: 'pass', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  const { sheets, payments, net } = scoreRound(s);
  assert.equal(sheets[1].variant, 'hongkong');
  assert.ok(sheets[1].fan >= 0);
  // Abwerfender (Sitz 0) ist zugleich Geber: "halbe Verantwortung" (×2) UND Geber-Verdopplung (×2)
  assert.equal(payments[0][1], 4 * sheets[1].total);
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
  assert.equal(fanOf({ concealed: parseKinds('123b 456c 789k 234k 55b'), melds: [], bonus: [], seatWind: 1, roundWind: 0, winningKind: parseKinds('5b')[0], selfDraw: false }, rules), 2); // Nur Chows + verdeckt
});

test('Hong Kong: zufällige Partien halten die Invarianten', () => {
  const rng = createRngState('hk-fuzz');
  let wins = 0;
  for (let g = 0; g < 12; g++) {
    let s = createGame({ seed: `hk-${g}`, humanSeat: -1, ruleSet: createRuleSet({ variant: 'hongkong', rounds: 1, minFan: g % 2 ? 0 : 3 }) });
    s = applyAction(s, { type: 'startHand' });
    s = g % 3 === 0 ? playRandomHand(s, rng) : runUntilHuman(s, { difficulty: ['easy', 'medium', 'hard'][g % 3] });
    const r = scoreRound(s);
    assert.equal(r.net.reduce((a, b) => a + b, 0), 0);
    if (s.result.type === 'win') {
      wins++;
      assert.ok(r.sheets[s.result.winner].fan >= s.ruleSet.minFan);
    }
    s = applyPayments(s, r.payments);
    assert.equal(s.players.reduce((a, p) => a + p.score, 0), 4 * s.ruleSet.startScore);
  }
  assert.ok(wins > 0);
});

test('Hong Kong: Fan-Limit, Umrechnungstabellen (Uncapped/Simplified) und Geber-Verdopplung', () => {
  // Faan Limit 10 statt 13: eine Hand mit 13 Fan wird auf 10 gedeckelt
  const s13 = winner('EEE SSS WWW NNN 55c', { win: '5c' });
  assert.equal(s13.fan, 13);
  const s10 = winner('EEE SSS WWW NNN 55c', { win: '5c', rules: createRuleSet({ variant: 'hongkong', maxFan: 10 }) });
  assert.equal(s10.fan, 10);
  assert.equal(s10.limit, true);
  assert.equal(s10.total, hkBasePoints(10));

  // Uncapped: reine Verdopplung 2^Fan statt der "halb scharfen" Tabelle
  const uncapped = createRuleSet({ variant: 'hongkong', hkConversion: 'uncapped', bonusTiles: false });
  const su = winner('123b 456c 789k 234k 55b', { win: '5b', rules: uncapped }); // Nur Chows + verdeckt = 2 Fan
  assert.equal(su.fan, 2);
  assert.equal(su.total, 4); // 2^2, Tabelle wäre 4 (zufällig gleich hier)
  const su7 = winner('123b 456b 789b 234b 99b', { win: '9b', rules: uncapped }); // Reine Farbe + Nur Chows + verdeckt = 9 Fan
  assert.equal(su7.fan, 9);
  assert.equal(su7.total, 512); // 2^9, nicht die Tabelle (96)

  // Simplified: unter 3 Fan gewinnt die Hand, aber ohne Punktetausch
  const simplified = createRuleSet({ variant: 'hongkong', hkConversion: 'simplified', minFan: 0, bonusTiles: false });
  const chicken = winner('123b 456c 789k 234k 55b', { win: '5b', rules: simplified });
  assert.equal(chicken.fan, 2);
  assert.equal(chicken.total, 0);
  assert.equal(chicken.zeroPoints, true);
  const strong = winner('rrr ggg 123b 456c ww', { win: 'w', rules: simplified }); // Little Three Dragons, 6 Fan
  assert.ok(strong.fan >= 3);
  assert.equal(strong.zeroPoints, false);
  assert.ok(strong.total > 0);

  // Geber-Verdopplung: Selbstzug, Gewinner ist Geber → alle zahlen doppelt
  const dbl = settleHK([0, 8, 0, 0], { winner: 1, discarder: null, dealer: 1 }, rules);
  assert.equal(dbl[0][1] + dbl[2][1] + dbl[3][1], 8 * 2 * 3);
  const noDbl = settleHK([0, 8, 0, 0], { winner: 1, discarder: null, dealer: 2 }, rules);
  assert.equal(noDbl[0][1] + noDbl[2][1] + noDbl[3][1], 8 * 3);
  const off = settleHK([0, 8, 0, 0], { winner: 1, discarder: null, dealer: 1 }, createRuleSet({ variant: 'hongkong', hkDealerDouble: false }));
  assert.equal(off[0][1] + off[2][1] + off[3][1], 8 * 3);
});
