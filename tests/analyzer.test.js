import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, seatsToAct, getLegalActions } from '../src/core/state.js';
import { createRuleSet } from '../src/core/rules.js';
import { createRngState, nextInt } from '../src/core/rng.js';
import { chooseAction } from '../src/ai/player.js';
import { analyzeGame, classify, CLASSES } from '../src/replay/analyzer.js';
import { evaluateDiscards } from '../src/analysis/evaluate.js';
import { kindOf } from '../src/core/tiles.js';

/** Spielt eine Partie: Sitz 0 nach Strategie fn, andere KI medium. */
function playGame(seed, fn, rounds = 1) {
  const rng = createRngState(seed + '-rng');
  let s = createGame({ seed, humanSeat: 0, ruleSet: createRuleSet({ rounds }) });
  while (s.phase !== 'gameOver') {
    s = applyAction(s, { type: 'startHand' });
    let guard = 0;
    while (s.phase !== 'handOver') {
      if (++guard > 5000) throw new Error('Endlos');
      for (const seat of seatsToAct(s)) {
        const a = seat === 0 ? fn(s, rng) : chooseAction(s, seat, { difficulty: 'medium', rng });
        s = applyAction(s, a);
        if (s.phase === 'handOver') break;
      }
    }
    s = applyAction(s, { type: 'endHand' });
  }
  return s;
}

const bestPlay = (s) => chooseAction(s, 0, { difficulty: 'hard' });
const worstPlay = (s, rng) => {
  const legal = getLegalActions(s, 0);
  const mj = legal.find((a) => a.type === 'mahjong');
  if (mj) return mj;
  if (s.phase === 'discard') {
    const { options } = evaluateDiscards(s, 0);
    const worst = options[options.length - 1];
    return legal.find((a) => a.type === 'discard' && kindOf(a.tile) === worst.kind) ?? legal[0];
  }
  return legal.find((a) => a.type === 'pass') ?? legal[nextInt(rng, legal.length)];
};

test('classify: Schwellen', () => {
  assert.equal(classify(0), 'ok');
  assert.equal(classify(0.08), 'inaccuracy');
  assert.equal(classify(0.2), 'mistake');
  assert.equal(classify(0.5), 'blunder');
  assert.deepEqual(CLASSES, ['ok', 'inaccuracy', 'mistake', 'blunder']);
});

test('analyzeGame: gute Züge werden hoch bewertet, schlechte niedrig', () => {
  const good = playGame('an-good', bestPlay);
  const bad = playGame('an-bad', worstPlay);
  const ag = analyzeGame({ seed: good.seed, ruleSet: good.ruleSet, humanSeat: 0, actions: good.actions });
  const ab = analyzeGame({ seed: bad.seed, ruleSet: bad.ruleSet, humanSeat: 0, actions: bad.actions });
  assert.ok(ag.summary.decisions > 0 && ab.summary.decisions > 0);
  assert.ok(ag.summary.accuracy > 0.9, `gut: ${ag.summary.accuracy}`);
  assert.ok(ab.summary.accuracy < 0.6, `schlecht: ${ab.summary.accuracy}`);
  assert.ok(ab.summary.blunder + ab.summary.mistake > 0);
  assert.equal(ag.hands.length, good.handNumber);
  for (const h of ag.hands) {
    assert.ok(h.curve.length > 0);
    assert.ok(h.curve.every((c) => c.chance >= 0 && c.chance <= 1));
    assert.ok(h.result);
  }
  const d = ab.hands[0].decisions.find((x) => x.type === 'discard');
  assert.ok(d && d.alternatives.length >= 1 && d.best !== undefined && d.chosen !== undefined);
});

test('analyzeGame: Fortschritt wird gemeldet, Sitz wählbar', () => {
  const g = playGame('an-prog', bestPlay);
  let calls = 0;
  const a = analyzeGame({ seed: g.seed, ruleSet: g.ruleSet, humanSeat: 0, actions: g.actions }, { seat: 1, onProgress: () => calls++ });
  assert.equal(calls, g.actions.length);
  assert.equal(a.seat, 1);
  assert.ok(a.summary.decisions > 0);
});
