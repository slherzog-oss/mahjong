import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store/store.js';
import { seatsToAct } from '../src/core/state.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('newGame, KI spielt sofort bis zum Menschen (Verzögerung 0)', () => {
  const store = createStore({ storage: memStorage() });
  store.updateSettings({ aiDelayMs: 0 });
  store.newGame({ seed: 'store-1' });
  const snap = store.getSnapshot();
  assert.ok(snap.state);
  assert.equal(snap.humanSeat, 0);
  assert.ok(snap.humanToAct); // Ost (Mensch) beginnt mit dem Abwurf
  assert.ok(store.legalActions().some((a) => a.type === 'discard'));
});

test('dispatch validiert, Undo springt zum letzten eigenen Entscheidungspunkt', () => {
  const storage = memStorage();
  const store = createStore({ storage });
  store.updateSettings({ aiDelayMs: 0 });
  store.newGame({ seed: 'store-2' });
  assert.throws(() => store.dispatch({ type: 'draw' }));
  const before = store.getSnapshot().state;
  const tile = before.players[0].hand[0];
  store.dispatch({ type: 'discard', tile });
  let snap = store.getSnapshot();
  // Nach dem Abwurf spielt die KI, bis Sitz 0 wieder dran ist (oder die Hand endet)
  assert.ok(snap.humanToAct || snap.state.phase === 'handOver');
  assert.ok(snap.canUndo || snap.state.phase === 'handOver');
  if (snap.canUndo) {
    assert.ok(store.undo());
    snap = store.getSnapshot();
    assert.deepEqual(snap.state.players[0].hand, before.players[0].hand);
    assert.ok(seatsToAct(snap.state).includes(0));
    assert.equal(snap.canUndo, false);
  }
});

test('Autosave und Laden', () => {
  const storage = memStorage();
  const store = createStore({ storage });
  store.updateSettings({ aiDelayMs: 0 });
  store.newGame({ seed: 'store-3' });
  const s1 = store.getSnapshot().state;
  const store2 = createStore({ storage });
  assert.ok(store2.hasSave());
  assert.ok(store2.load());
  assert.deepEqual(store2.getSnapshot().state.players[0].hand, s1.players[0].hand);
  store2.quit();
  assert.equal(store2.hasSave(), false);
});

test('Handende wird abgerechnet, nextHand startet die nächste Hand', () => {
  const store = createStore({ storage: memStorage() });
  store.updateSettings({ aiDelayMs: 0, rounds: 1 });
  store.newGame({ seed: 'store-4', humanSeat: -1 }); // nur KI
  const snap = store.getSnapshot();
  assert.equal(snap.state.phase, 'handOver');
  assert.ok(snap.lastScore);
  const total = snap.state.players.reduce((a, p) => a + p.score, 0);
  assert.equal(total, 4 * snap.state.ruleSet.startScore);
  store.nextHand();
  const s2 = store.getSnapshot().state;
  assert.ok(s2.handNumber === 2 || s2.phase === 'gameOver');
});
