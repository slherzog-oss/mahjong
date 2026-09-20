import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, kindOf, formatKinds } from '../src/core/tiles.js';
import { applyAction } from '../src/core/state.js';
import { adviseDiscard, adviseClaim, specialHandHints, valuePotential } from '../src/advisor/advisor.js';
import { explainDiscard, explainClaim, explainHints } from '../src/advisor/explain.js';
import { createRuleSet } from '../src/core/rules.js';
import { rigGame, tileOf } from './helpers.js';

const rigDiscard = (hand) => rigGame({ hands: [hand, null, null, null] });

test('adviseDiscard: bester Abwurf, Alternativen, Begründung', () => {
  const s = rigDiscard('123b 456c 789k EE 45k r');
  const adv = adviseDiscard(s, 0);
  assert.equal(formatKinds([adv.best.kind]), 'r');
  assert.equal(adv.best.shanten, 0);
  assert.equal(adv.alternatives.length, 2);
  assert.ok(adv.best.chance > 0 && adv.best.chance <= 1);
  const lines = explainDiscard(adv);
  assert.ok(lines.length >= 1);
  assert.ok(lines[0].includes('Rd'));
  assert.ok(lines[0].includes('Shanten 0'));
});

test('adviseDiscard wirft den Einzelstein mit den wenigsten Anschlüssen', () => {
  // 5k hat fünf Nachbar-Arten (3k..7k), 2c und 8b je vier → 5k behalten
  const s = rigDiscard('123b 456c 789k rr 5k 2c 8b');
  const adv = adviseDiscard(s, 0);
  assert.ok(['2c', '8b'].includes(formatKinds([adv.best.kind])), formatKinds([adv.best.kind]));
  assert.ok(adv.options.every((o) => formatKinds([o.kind]) !== 'r' || o.shanten >= adv.best.shanten));
});

test('valuePotential erkennt Drachenpaare und Farbtendenz', () => {
  const v = valuePotential(parseKinds('123b 456b 789b 11b rr'), [], 1, 0);
  assert.equal(v.doubles, 1);
  assert.equal(v.flush, 'half');
  const f = valuePotential(parseKinds('123b 456b 789b 11b 22b'), [], 1, 0);
  assert.equal(f.flush, 'full');
  const w = valuePotential(parseKinds('EE SS 123b 456c 789k'), [], 0, 1);
  assert.equal(w.doubles, 2); // E = eigener Wind, S = Rundenwind
});

test('Sonderhand-Hinweise', () => {
  const rs = createRuleSet({ sevenPairs: true });
  const h = specialHandHints(parseKinds('19b 19c 19k ESWN rg 2b'), [], rs, 0, 0);
  assert.ok(h.some((x) => x.form === 'thirteen_orphans' && x.shanten === 1));
  const txt = explainHints(h);
  assert.ok(txt.some((l) => l.includes('Dreizehn Waisen') && l.includes('2 Steine')));
  const p = specialHandHints(parseKinds('11b 22b 33c 44c 55k EE r'), [], rs, 0, 0);
  assert.ok(p.some((x) => x.form === 'seven_pairs'));
  const fl = specialHandHints(parseKinds('123b 456b 789b 12b EE'), [], rs, 0, 0);
  assert.ok(fl.some((x) => x.form === 'half_flush'));
});

test('adviseClaim: Ruf nur bei Shanten-Gewinn, sonst passen mit Grund', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k',
      '55b 12c 44c 789k NN 7k 8k',
      '46k 123b 456b 789b SS',
      'WWW ggg www 6k 7k 8k 9k',
    ],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  const a1 = adviseClaim(s, 1);
  assert.equal(a1.action.type, 'pung');
  assert.equal(a1.reason.key, 'gain');
  assert.ok(explainClaim(a1)[0].includes('Pung'));
  const a2 = adviseClaim(s, 2);
  assert.equal(a2.action.type, 'pass');
  assert.equal(a2.reason.key, 'keepConcealed');
});

test('adviseClaim empfiehlt Mahjong', () => {
  let s = rigGame({
    hands: ['5b 123c 456c 789c EEE 9k', '55b 111c 222c 333c NN', '123b 46b 789b 55c 111k', '1k 2k 3k 4k 6k 7k 8k 9k SSS WW'],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  const a = adviseClaim(s, 2);
  assert.equal(a.action.type, 'mahjong');
  assert.equal(explainClaim(a)[0], 'Mahjong ansagen!');
});
