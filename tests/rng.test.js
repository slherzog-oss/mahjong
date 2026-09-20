import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRngState, nextUint32, nextInt, shuffle } from '../src/core/rng.js';

test('deterministisch bei gleichem Seed', () => {
  const a = createRngState('abc');
  const b = createRngState('abc');
  for (let i = 0; i < 100; i++) assert.equal(nextUint32(a), nextUint32(b));
});

test('verschiedene Seeds, verschiedene Folgen', () => {
  const a = createRngState('abc');
  const b = createRngState('abd');
  const seqA = Array.from({ length: 10 }, () => nextUint32(a));
  const seqB = Array.from({ length: 10 }, () => nextUint32(b));
  assert.notDeepEqual(seqA, seqB);
});

test('nextInt im Bereich, shuffle ist Permutation', () => {
  const s = createRngState(42);
  for (let i = 0; i < 1000; i++) {
    const v = nextInt(s, 7);
    assert.ok(v >= 0 && v < 7);
  }
  const arr = shuffle(s, Array.from({ length: 50 }, (_, i) => i));
  assert.deepEqual([...arr].sort((x, y) => x - y), Array.from({ length: 50 }, (_, i) => i));
});
