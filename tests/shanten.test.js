import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, countsFromKinds, NUM_KINDS, allTileIds, kindOf } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { isWinningHand, waitingKinds } from '../src/core/hand.js';
import { shanten, shantenStandard, shantenOrphans, shantenSevenPairs } from '../src/analysis/shanten.js';
import { ukeire, discardOptions, visibleCounts, remainingCounts } from '../src/analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../src/analysis/probability.js';
import { createRngState, shuffle } from '../src/core/rng.js';
import { startedGame } from './helpers.js';

const rules = createRuleSet();
const sp = createRuleSet({ sevenPairs: true });
const sh = (n, melds = 0, rs = rules) => shanten(parseKinds(n), melds, rs).min;

test('Shanten bekannter Hände', () => {
  assert.equal(sh('123b 456c 789k EEE rr'), -1);
  assert.equal(sh('123b 456c 789k EEE r'), 0);
  assert.equal(sh('123b 456c 789k EE 45k'), 0);
  assert.equal(sh('123b 456c 789k E 45k r'), 1);
  assert.equal(sh('123b 456c 78k EE 45k r'), 1);
  assert.equal(sh('12b 45c 78k EE 45k rgw'), 3);
  assert.equal(sh('1b 4c 7k E S W N r g w 2b 5c 8k'), 5);
  // Offene Sätze zählen als fertig
  assert.equal(sh('123b 456c 99k', 2), -1);
  assert.equal(sh('123b 45c 99k', 2), 0);
  assert.equal(sh('12b 45c 99k', 2), 1);
});

test('Teilsätze sind auf 4 - Sätze begrenzt', () => {
  // Sechs Teilsätze bringen nichts über vier hinaus
  assert.equal(shantenStandard(countsFromKinds(parseKinds('12b 45b 78b 12c 45c 78c 1k'))), 8 - 4);
});

test('Thirteen Orphans und Seven Pairs', () => {
  assert.equal(shantenOrphans(countsFromKinds(parseKinds('19b 19c 19k ESWN rgw'))), 0);
  assert.equal(shantenOrphans(countsFromKinds(parseKinds('19b 19c 19k ESWN rg 2b'))), 1);
  assert.equal(shantenOrphans(countsFromKinds(parseKinds('19b 19c 19k ESWN rgw E'))), -1);
  assert.equal(shantenOrphans(countsFromKinds(parseKinds('11b 19c 19k ESWN rg 2b'))), 1);
  assert.equal(sh('19b 19c 19k ESWN rgw'), 0);
  assert.equal(shanten(parseKinds('19b 19c 19k ESWN rgw')).form, 'thirteen_orphans');
  assert.equal(shantenSevenPairs(countsFromKinds(parseKinds('11b 22b 33c 44c 55k EE r'))), 0);
  assert.equal(shantenSevenPairs(countsFromKinds(parseKinds('11b 22b 33c 44c 55k EE rr'))), -1);
  assert.equal(shantenSevenPairs(countsFromKinds(parseKinds('1111b 2222b 33c 44c 5k'))), 6 - 4 + 2);
  assert.equal(sh('11b 22b 33c 44c 55k EE r'), 3); // ohne Option: Standardform (max. 4 Teilsätze)
  assert.equal(sh('11b 22b 33c 44c 55k EE r', 0, sp), 0);
});

test('Eigenschaft: Shanten 0 ⇔ wartend, -1 ⇔ fertig (zufällige Hände)', () => {
  const rng = createRngState('shanten-prop');
  for (let i = 0; i < 300; i++) {
    const ids = shuffle(rng, allTileIds());
    const hand13 = ids.slice(0, 13).map(kindOf);
    const s13 = shanten(hand13, 0, sp).min;
    const waits = waitingKinds(hand13, [], sp);
    assert.equal(s13 === 0, waits.length > 0, `13: ${hand13}`);
    assert.ok(s13 >= 0 && s13 <= 8);
    const hand14 = ids.slice(0, 14).map(kindOf);
    const s14 = shanten(hand14, 0, sp).min;
    assert.equal(s14 === -1, isWinningHand(hand14, [], sp), `14: ${hand14}`);
  }
});

test('Eigenschaft: Ziehen senkt Shanten um höchstens 1, nie unter -1', () => {
  const rng = createRngState('shanten-step');
  for (let i = 0; i < 200; i++) {
    const ids = shuffle(rng, allTileIds());
    const hand = ids.slice(0, 13).map(kindOf);
    const s = shanten(hand, 0, rules).min;
    for (let k = 0; k < NUM_KINDS; k++) {
      const t = shanten([...hand, k], 0, rules).min;
      assert.ok(t >= s - 1 && t <= s, `${hand} + ${k}: ${s} → ${t}`);
    }
  }
});

test('Ukeire: nützliche Steine und Gewichtung', () => {
  const u = ukeire(parseKinds('123b 456c 789k EE 45k'), 0, rules);
  assert.equal(u.shanten, 0);
  const kinds = u.tiles.map((t) => t.kind).sort((a, b) => a - b);
  assert.deepEqual(kinds, parseKinds('36k'));
  assert.equal(u.total, 8);
  const rem = new Array(NUM_KINDS).fill(4);
  rem[parseKinds('3k')[0]] = 0;
  const u2 = ukeire(parseKinds('123b 456c 789k EE 45k'), 0, rules, rem);
  assert.equal(u2.total, 4);
});

test('discardOptions sortiert nach Shanten, dann Ukeire', () => {
  const opts = discardOptions(parseKinds('123b 456c 789k EE 45k r'), 0, rules);
  assert.equal(opts[0].kind, parseKinds('r')[0]);
  assert.equal(opts[0].shanten, 0);
  assert.ok(opts.every((o, i) => i === 0 || o.shanten > opts[i - 1].shanten || (o.shanten === opts[i - 1].shanten && o.total <= opts[i - 1].total)));
  assert.equal(opts.length, 13); // 13 verschiedene Arten
});

test('visibleCounts aus dem Spielzustand', () => {
  const s = startedGame();
  const { visible, unseen } = visibleCounts(s, 0);
  assert.equal(visible.reduce((a, b) => a + b, 0), 14);
  assert.equal(unseen, 136 - 14);
  const rem = remainingCounts(visible);
  assert.ok(rem.every((r) => r >= 0 && r <= 4));
});

test('completionChance: monoton und begrenzt', () => {
  assert.equal(completionChance({ shanten: -1, ukeireTotal: 0, unseen: 80, drawsLeft: 10 }), 1);
  assert.equal(completionChance({ shanten: 0, ukeireTotal: 0, unseen: 80, drawsLeft: 10 }), 0);
  assert.equal(completionChance({ shanten: 0, ukeireTotal: 8, unseen: 80, drawsLeft: 0 }), 0);
  const a = completionChance({ shanten: 0, ukeireTotal: 8, unseen: 80, drawsLeft: 10 });
  const b = completionChance({ shanten: 1, ukeireTotal: 8, unseen: 80, drawsLeft: 10 });
  const c = completionChance({ shanten: 0, ukeireTotal: 16, unseen: 80, drawsLeft: 10 });
  const d = completionChance({ shanten: 0, ukeireTotal: 8, unseen: 80, drawsLeft: 20 });
  assert.ok(a > b && c > a && d > a);
  assert.ok(a > 0 && a < 1);
  // Tenpai mit 8 Steinen, 10 Züge: grob 1 - Π(1 - 8/R_t)
  let q = 1;
  for (let t = 0, R = 80; t < 10; t++, R -= 4) q *= 1 - 8 / R;
  assert.ok(Math.abs(a - (1 - q)) < 1e-9);
  assert.equal(drawsLeftFor(83), 20);
});

test('Leistung: 200 Abwurfbewertungen unter 2 Sekunden', () => {
  const rng = createRngState('perf');
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    const ids = shuffle(rng, allTileIds());
    discardOptions(ids.slice(0, 14).map(kindOf), 0, sp);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms} ms`);
});
