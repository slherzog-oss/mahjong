import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../src/core/state.js';
import { createRuleSet } from '../src/core/rules.js';
import { runUntilHuman } from '../src/ai/runner.js';

// Der Worker nutzt die Worker-Globals self.onmessage / self.postMessage.
// Hier werden sie nachgebildet, um das Nachrichtenprotokoll zu prüfen.

async function loadWorker() {
  const posted = [];
  globalThis.self = { postMessage: (m) => posted.push(m) };
  await import('../src/analysis/worker.js?' + Date.now());
  return { posted, send: (data) => globalThis.self.onmessage({ data }) };
}

test('Worker: Monte-Carlo-Nachricht liefert Ergebnis mit derselben ID', async () => {
  const { posted, send } = await loadWorker();
  let s = createGame({ seed: 'wk-1' });
  s = applyAction(s, { type: 'startHand' });
  const { rng, ...plain } = s;
  send({ id: 7, type: 'mc', state: plain, seat: 0, runs: 40 });
  const msg = posted.find((m) => m.id === 7 && m.type === 'mc');
  assert.ok(msg && msg.result);
  assert.ok(msg.result.complete >= 0 && msg.result.complete <= 1);
  assert.equal(msg.result.runs, 40);
});

test('Worker: Analyse-Nachricht meldet Fortschritt und Ergebnis; Fehler werden gemeldet', async () => {
  const { posted, send } = await loadWorker();
  let s = createGame({ seed: 'wk-2', humanSeat: -1, ruleSet: createRuleSet({ rounds: 1 }) });
  s = applyAction(s, { type: 'startHand' });
  s = runUntilHuman(s, { difficulty: 'medium' });
  send({ id: 3, type: 'analyze', record: { seed: s.seed, ruleSet: s.ruleSet, humanSeat: -1, actions: s.actions }, seat: 0 });
  assert.ok(posted.some((m) => m.id === 3 && m.type === 'progress'));
  const done = posted.find((m) => m.id === 3 && m.type === 'analyze');
  assert.ok(done && done.result.summary);
  send({ id: 4, type: 'mc', state: null, seat: 0, runs: 10 });
  const err = posted.find((m) => m.id === 4);
  assert.ok(err && err.error);
});
