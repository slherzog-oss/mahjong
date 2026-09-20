import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, opponentHazard } from '../src/analysis/montecarlo.js';
import { rigGame, startedGame } from './helpers.js';
import { createRngState } from '../src/core/rng.js';

test('Fertige Hand: Chance 1; Tenpai deutlich höher als weit entfernte Hand', () => {
  const done = rigGame({ hands: ['123b 456b 789b 55b 111k', null, null, null] });
  const r0 = simulate(done, 0, { runs: 50 });
  assert.equal(r0.complete, 1);
  const tenpai = rigGame({ hands: ['123b 456c 789k EE 45k 2b', null, null, null] });
  const far = rigGame({ hands: ['1b 4b 7b 1c 4c 7c 1k 4k 7k E S W N r', null, null, null] });
  const rt = simulate(tenpai, 0, { runs: 300, rng: createRngState('mc1') });
  const rf = simulate(far, 0, { runs: 300, rng: createRngState('mc2') });
  assert.ok(rt.complete > 0.5, `tenpai ${rt.complete}`);
  assert.ok(rf.complete < 0.2, `weit ${rf.complete}`);
  assert.ok(rt.win <= rt.complete && rt.win > 0.3);
  assert.ok(rt.stderr < 0.05);
  assert.ok(rt.meanTurns > 0);
});

test('Deterministisch bei gleichem Seed, Laufzeit akzeptabel', () => {
  const s = startedGame({ seed: 'mc-det' });
  const a = simulate(s, 0, { runs: 100, seed: 'x' });
  const b = simulate(s, 0, { runs: 100, seed: 'x' });
  assert.deepEqual(a, b);
  const t0 = performance.now();
  simulate(s, 0, { runs: 300, seed: 'y' });
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `${ms} ms`);
});

test('Hazard steigt mit Tempo und Fortschritt', () => {
  assert.ok(opponentHazard(0.2, 0.1) < opponentHazard(0.8, 0.1));
  assert.ok(opponentHazard(0.5, 0.2) < opponentHazard(0.5, 0.9));
});
