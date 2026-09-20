import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, countsFromKinds } from '../src/core/tiles.js';
import {
  decompose, evaluateHand, isWinningHand, waitingKinds, isThirteenOrphans,
  isNineGates, isSevenPairs, flushType,
} from '../src/core/hand.js';
import { createRuleSet } from '../src/core/rules.js';

const rules = createRuleSet();
const meld = (type, notation, open = true) => ({ type, kinds: parseKinds(notation), open });

test('Standardhand: 4 Sätze + Paar', () => {
  assert.ok(isWinningHand(parseKinds('123b 456c 789k EEE rr'), [], rules));
  assert.ok(isWinningHand(parseKinds('111b 222b 333b 444b 55c'), [], rules));
  assert.ok(!isWinningHand(parseKinds('123b 456c 789k EEE rg'), [], rules));
});

test('Mit offenen Sätzen', () => {
  const melds = [meld('pung', 'EEE'), meld('kong', 'rrrr')];
  assert.ok(isWinningHand(parseKinds('123b 456c 99k'), melds, rules));
  assert.ok(!isWinningHand(parseKinds('123b 456c 9k'), melds, rules));
});

test('Mehrere Zerlegungen werden gefunden', () => {
  // 111 222 333 kann als 3 Pungs oder 3 Chows gelesen werden.
  const d = decompose(countsFromKinds(parseKinds('111b 222b 333b 55c')));
  assert.equal(d.length, 2);
  const types = d.map((x) => x.sets.map((s) => s.type).join(',')).sort();
  assert.deepEqual(types, ['chow,chow,chow', 'pung,pung,pung']);
});

test('Honours bilden keine Chows', () => {
  assert.ok(!isWinningHand(parseKinds('ESW NNN 123b 456c 77k'), [], rules));
});

test('Thirteen Orphans', () => {
  const c = countsFromKinds(parseKinds('19b 19c 19k ESWN rgw E'));
  assert.ok(isThirteenOrphans(c, []));
  assert.ok(!isThirteenOrphans(countsFromKinds(parseKinds('19b 19c 19k ESWN rgw 2b')), []));
  const ev = evaluateHand(parseKinds('19b 19c 19k ESWN rgw E'), [], rules);
  assert.deepEqual(ev.forms, ['thirteen_orphans']);
});

test('Nine Gates', () => {
  assert.ok(isNineGates(countsFromKinds(parseKinds('1112345678999b 5b')), []));
  assert.ok(!isNineGates(countsFromKinds(parseKinds('1112345678999b 5c')), []));
  const ev = evaluateHand(parseKinds('1112345678999b 5b'), [], rules);
  assert.ok(ev.forms.includes('nine_gates') && ev.forms.includes('standard'));
});

test('Seven Pairs nur mit Option', () => {
  const hand = parseKinds('11b 22b 33c 44c 55k EE rr');
  assert.ok(isSevenPairs(countsFromKinds(hand), []));
  assert.ok(!isWinningHand(hand, [], rules));
  assert.ok(isWinningHand(hand, [], createRuleSet({ sevenPairs: true })));
});

test('Warten', () => {
  const w = waitingKinds(parseKinds('123b 456c 789k EEE r'), [], rules);
  assert.deepEqual(w, parseKinds('r'));
  const w2 = waitingKinds(parseKinds('123b 456c 789k EE 45k'), [], rules);
  assert.deepEqual(w2, parseKinds('36k'));
  const w13 = waitingKinds(parseKinds('19b 19c 19k ESWN rgw'), [], rules);
  assert.equal(w13.length, 13);
});

test('flushType', () => {
  assert.equal(flushType(parseKinds('123b 456b 789b 11b 22b')), 'full');
  assert.equal(flushType(parseKinds('123b 456b EEE rr 11b')), 'half');
  assert.equal(flushType(parseKinds('EEE SSS WWW NNN rr')), 'honours');
  assert.equal(flushType(parseKinds('123b 456c EEE rr 11b')), null);
});

test('BMJA-Sonderhände nur mit Option optionalHands', () => {
  const opt = createRuleSet({ optionalHands: true });
  const cases = {
    wriggling_snake: '11b 23456789b ESWN',
    knitting: '1234567b 1234567c',
    triple_knitting: '13579b 13579c 1357k',
    all_pair_honours: '11b 99b 11c 99k EE SS rr',
  };
  for (const [form, n] of Object.entries(cases)) {
    const hand = parseKinds(n);
    assert.equal(hand.length, 14, form);
    assert.ok(!isWinningHand(hand, [], rules), `${form} ohne Option`);
    const ev = evaluateHand(hand, [], opt);
    assert.ok(ev.forms.includes(form), `${form}: ${ev.forms}`);
  }
  // Gegenbeispiele
  assert.ok(!evaluateHand(parseKinds('11b 23456789b ESWr'), [], opt).forms.includes('wriggling_snake'));
  assert.ok(!evaluateHand(parseKinds('1234567b 123456c 7k'), [], opt).forms.includes('knitting'));
  assert.ok(!evaluateHand(parseKinds('13579b 13579c 1358k'), [], opt).forms.includes('triple_knitting'));
  assert.ok(!evaluateHand(parseKinds('11b 99b 11c 99k EE SS 55c'), [], opt).forms.includes('all_pair_honours'));
  // Warten: Schlange wartet auf den fehlenden Wind
  assert.deepEqual(waitingKinds(parseKinds('11b 23456789b ESW'), [], opt), parseKinds('N'));
});
