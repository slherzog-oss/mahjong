import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_NAMES, kindOf, nameOf, kindByName, isHonour, isTerminal, isSimple, isMajor,
  suitOf, rankOf, windIndex, bonusOwner, parseKinds, formatKinds, countsFromIds,
  allTileIds, sortTiles,
} from '../src/core/tiles.js';

test('42 Arten, 136 (+8) Steine', () => {
  assert.equal(KIND_NAMES.length, 42);
  assert.equal(allTileIds().length, 136);
  assert.equal(allTileIds(true).length, 144);
  const counts = countsFromIds(allTileIds());
  assert.ok(counts.every((c) => c === 4));
});

test('kindOf / nameOf', () => {
  assert.equal(nameOf(0), '1b');
  assert.equal(nameOf(3), '1b');
  assert.equal(nameOf(4), '2b');
  assert.equal(nameOf(135), 'Wd');
  assert.equal(nameOf(136), 'F1');
  assert.equal(nameOf(143), 'S4');
  assert.equal(kindOf(140), 38);
});

test('Eigenschaften', () => {
  const k = kindByName;
  assert.ok(isTerminal(k('1b')) && isTerminal(k('9k')) && !isTerminal(k('5c')));
  assert.ok(isSimple(k('5c')) && !isSimple(k('E')));
  assert.ok(isHonour(k('Rd')) && isMajor(k('Rd')) && isMajor(k('9b')));
  assert.equal(suitOf(k('7c')), 1);
  assert.equal(rankOf(k('7c')), 7);
  assert.equal(windIndex(k('N')), 3);
  assert.equal(bonusOwner(k('F3')), 2);
  assert.equal(bonusOwner(k('S1')), 0);
});

test('Notation hin und zurück', () => {
  const kinds = parseKinds('123b 55c EEE rr F1');
  assert.equal(kinds.length, 11);
  assert.equal(formatKinds(kinds), '123b 55c EEE rr F1');
  assert.throws(() => parseKinds('1x'));
});

test('sortTiles nach Art', () => {
  assert.deepEqual(sortTiles([135, 0, 4, 1]), [0, 1, 4, 135]);
});
