import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, getLegalActions, seatsToAct, seatWind, IllegalAction, viewFor, replay } from '../src/core/state.js';
import { kindOf, parseKinds, countsFromIds, allTileIds } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { createRngState } from '../src/core/rng.js';
import { startedGame, rigGame, tileOf, allPass, playRandomHand } from './helpers.js';

function allIds(state) {
  const ids = [...state.wall.living, ...state.wall.dead];
  for (const p of state.players) ids.push(...p.hand, ...p.discards, ...p.bonus, ...p.melds.flatMap((m) => m.tiles));
  return ids;
}

test('startHand verteilt 13/14 Steine, Wand stimmt', () => {
  const s = startedGame();
  assert.equal(s.phase, 'discard');
  assert.equal(s.current, 0);
  assert.equal(s.players[0].hand.length, 14);
  for (let i = 1; i < 4; i++) assert.equal(s.players[i].hand.length, 13);
  assert.equal(s.wall.dead.length, 14);
  assert.equal(s.wall.living.length, 136 - 53 - 14);
  assert.deepEqual(allIds(s).sort((a, b) => a - b), allTileIds());
});

test('Zustand ist unveränderlich', () => {
  const s = startedGame();
  const before = JSON.stringify(s);
  applyAction(s, { type: 'discard', seat: 0, tile: s.players[0].hand[0] });
  assert.equal(JSON.stringify(s), before);
});

test('Determinismus: gleicher Seed, gleiche Hände', () => {
  const a = startedGame({ seed: 'x' });
  const b = startedGame({ seed: 'x' });
  assert.deepEqual(a.players.map((p) => p.hand), b.players.map((p) => p.hand));
  const c = startedGame({ seed: 'y' });
  assert.notDeepEqual(a.players[0].hand, c.players[0].hand);
});

test('Abwurf → claiming → alle passen → nächster zieht', () => {
  let s = startedGame();
  const tile = s.players[0].hand[0];
  s = applyAction(s, { type: 'discard', seat: 0, tile });
  assert.equal(s.phase, 'claiming');
  assert.deepEqual(seatsToAct(s), [1, 2, 3]);
  assert.equal(s.players[0].discards[0], tile);
  s = allPass(s);
  assert.equal(s.phase, 'draw');
  assert.equal(s.current, 1);
  s = applyAction(s, { type: 'draw', seat: 1 });
  assert.equal(s.phase, 'discard');
  assert.equal(s.players[1].hand.length, 14);
});

test('Ungültige Aktionen werfen IllegalAction', () => {
  const s = startedGame();
  assert.throws(() => applyAction(s, { type: 'draw', seat: 0 }), IllegalAction);
  assert.throws(() => applyAction(s, { type: 'discard', seat: 1, tile: s.players[1].hand[0] }), IllegalAction);
  assert.throws(() => applyAction(s, { type: 'discard', seat: 0, tile: 999 }), IllegalAction);
});

test('Pung hat Vorrang vor Chow, Chow nur vom linken Nachbarn', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k', // Sitz 0 wirft 5b
      '46b 111c 222c 333c NN',    // Sitz 1 (rechts von 0) könnte Chow
      '55b 111k 222k 333k SS',       // Sitz 2 könnte Pung
      'WWW ggg www 6k 7k 8k 9k',     // Sitz 3
    ],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  const l1 = getLegalActions(s, 1).map((a) => a.type);
  const l2 = getLegalActions(s, 2).map((a) => a.type);
  const l3 = getLegalActions(s, 3).map((a) => a.type);
  assert.ok(l1.includes('chow') && !l1.includes('pung'));
  assert.ok(l2.includes('pung') && !l2.includes('chow'));
  assert.deepEqual(l3, ['pass']);
  const chow = getLegalActions(s, 1).find((a) => a.type === 'chow');
  s = applyAction(s, chow);
  s = applyAction(s, { type: 'pung', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  assert.equal(s.phase, 'discard');
  assert.equal(s.current, 2);
  assert.equal(s.players[2].melds.length, 1);
  assert.equal(s.players[2].melds[0].type, 'pung');
  assert.equal(s.players[2].hand.length, 11);
  assert.equal(s.players[0].discards.length, 0); // Abwurf wurde genommen
});

test('Mahjong auf Abwurf hat Vorrang, nächster in Reihenfolge gewinnt', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k',
      '55b 111c 222c 333c NN',     // Pung möglich
      '123b 46b 789b 55c 111k',       // wartet auf 5b (Chow-Mitte) — Mahjong
      '46b 456k 789k SSS WW',         // wartet ebenfalls auf 5b
    ],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  assert.ok(getLegalActions(s, 2).some((a) => a.type === 'mahjong'));
  s = applyAction(s, { type: 'pung', seat: 1 });
  s = applyAction(s, { type: 'mahjong', seat: 2 });
  s = applyAction(s, { type: 'mahjong', seat: 3 });
  assert.equal(s.phase, 'handOver');
  assert.equal(s.result.type, 'win');
  assert.equal(s.result.winner, 2);
  assert.equal(s.result.from, 0);
  assert.equal(s.result.selfDraw, false);
});

test('Selbstzug-Mahjong', () => {
  let s = rigGame({
    hands: ['123b 456b 789b 5b 111k 5k', '1b 2b 3b 4b 6b 7b 8b 9b 1c 2c 3c 4c 6c', '1k 2k 3k 4k 6k 7k 8k 9k 1c 2c 3c 4c 6c', 'ESWN rgw ESWN rg'],
  });
  const legal = getLegalActions(s, 0).map((a) => a.type);
  assert.ok(!legal.includes('mahjong'));
  let s2 = rigGame({ hands: ['123b 456b 789b 55b 111k', '1b 2b 3b 4b 6b 7b 8b 9b 1c 2c 3c 4c 6c', '1k 2k 3k 4k 6k 7k 8k 9k 1c 2c 3c 4c 6c', 'ESWN rgw ESWN rg'] });
  assert.ok(getLegalActions(s2, 0).some((a) => a.type === 'mahjong'));
  s2 = applyAction(s2, { type: 'mahjong', seat: 0 });
  assert.equal(s2.result.selfDraw, true);
  assert.equal(s2.result.winner, 0);
  assert.equal(s2.result.heavenly, true); // Ost, kein Abwurf bisher
});

test('Verdeckter Kong zieht Ersatzstein aus der toten Wand', () => {
  let s = rigGame({ hands: ['5555b 123c 456c EE 9k 8k', '1b 2b 3b 4b 6b 7b 8b 9b 1c 2c 3c 4c 6c', '1k 2k 3k 4k 6k 7k 8k 9k 1c 2c 3c 4c 6c', 'ESWN rgw ESWN rg'] });
  const kong = getLegalActions(s, 0).find((a) => a.type === 'kong');
  assert.equal(kong.variant, 'concealed');
  const deadBefore = s.wall.dead.length;
  const livingBefore = s.wall.living.length;
  s = applyAction(s, kong);
  assert.equal(s.phase, 'discard');
  assert.equal(s.players[0].melds[0].type, 'kong');
  assert.equal(s.players[0].melds[0].open, false);
  assert.equal(s.players[0].hand.length, 11);
  assert.equal(s.wall.dead.length, deadBefore); // aufgefüllt
  assert.equal(s.wall.living.length, livingBefore - 1);
  assert.equal(s.lastDraw.replacement, true);
});

test('Ergänzungs-Kong kann geraubt werden', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k',
      '55b 111c 222c 333c NN',
      '123b 46b 789b 55c 111k',       // wartet auf 5b
      '1k 2k 3k 4k 6k 7k 8k 9k SSS WW',
    ],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  // Sitz 2 ruft nicht Mahjong sondern passt; Sitz 1 pungt.
  s = applyAction(s, { type: 'pung', seat: 1 });
  s = applyAction(s, { type: 'pass', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  assert.equal(s.current, 1);
  // Sitz 1 wirft ab, alle passen, ... wir geben Sitz 1 später die vierte 5b über die Wand.
  s = applyAction(s, { type: 'discard', seat: 1, tile: tileOf(s, 1, 'N') });
  s = allPass(s);
  // Jetzt Sitz 2 zieht; wir manipulieren die Wand so, dass Sitz 1 beim nächsten Zug 5b zieht.
  const inPlay = new Set(s.players.flatMap((p) => [...p.hand, ...p.discards, ...p.melds.flatMap((m) => m.tiles)]));
  const fourth = allTileIds().find((id) => kindOf(id) === parseKinds('5b')[0] && !inPlay.has(id));
  s = structuredClone(s);
  s.wall.living = s.wall.living.filter((id) => id !== fourth);
  s.wall.living.splice(3, 0, fourth); // Positionen: Sitz2 zieht [0], Sitz3 [1], Sitz0 [2], Sitz1 [3]
  for (const seat of [2, 3, 0]) {
    s = applyAction(s, { type: 'draw', seat });
    s = applyAction(s, { type: 'discard', seat, tile: s.players[seat].hand.find((t) => kindOf(t) !== parseKinds('5b')[0]) });
    s = allPass(s);
  }
  s = applyAction(s, { type: 'draw', seat: 1 });
  const ext = getLegalActions(s, 1).find((a) => a.type === 'kong' && a.variant === 'extend');
  assert.ok(ext, 'Ergänzungs-Kong verfügbar');
  s = applyAction(s, ext);
  assert.equal(s.phase, 'claiming');
  assert.ok(s.pendingKong);
  const l2 = getLegalActions(s, 2).map((a) => a.type).sort();
  assert.deepEqual(l2, ['mahjong', 'pass']);
  s = applyAction(s, { type: 'pass', seat: 0 });
  s = applyAction(s, { type: 'mahjong', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  assert.equal(s.result.type, 'win');
  assert.equal(s.result.robbedKong, true);
  assert.equal(s.result.winner, 2);
  assert.equal(s.players[1].melds[0].type, 'pung');
  assert.equal(s.players[1].melds[0].tiles.length, 3);
});

test('Unentschieden bei leerer Wand, Ost bleibt', () => {
  let s = rigGame({ hands: ['1b 2b 3b 4b 6b 7b 8b 9b 1c 2c 3c 4c 6c 7c', 'ESWN rgw ESWN rg', '1k 2k 3k 4k 6k 7k 8k 9k 1c 2c 3c 4c 6c', '5555b 5555c 5555k 9k'] });
  s = structuredClone(s);
  s.wall.living = [];
  s = applyAction(s, { type: 'discard', seat: 0, tile: s.players[0].hand[0] });
  s = allPass(s);
  s = applyAction(s, { type: 'draw', seat: 1 });
  assert.equal(s.phase, 'handOver');
  assert.equal(s.result.type, 'draw');
  s = applyAction(s, { type: 'endHand' });
  assert.equal(s.dealer, 0);
  assert.equal(s.phase, 'idle');
});

test('Geber wechselt, Rundenwind nach vier Gebern, Spielende nach vier Runden', () => {
  let s = rigGame({ hands: ['1b 2b 3b 4b 6b 7b 8b 9b 1c 2c 3c 4c 6c 7c', 'ESWN rgw ESWN rg', '1k 2k 3k 4k 6k 7k 8k 9k 1c 2c 3c 4c 6c', '5555b 5555c 5555k 9k'], ruleSet: createRuleSet({ dealerKeepsOnDraw: false, rounds: 1 }) });
  for (let i = 0; i < 4; i++) {
    s = structuredClone(s);
    s.phase = 'handOver';
    s.result = { type: 'draw' };
    s = applyAction(s, { type: 'endHand' });
    if (i < 3) {
      assert.equal(s.dealer, i + 1);
      assert.equal(s.phase, 'idle');
      assert.equal(seatWind(s, 0), (4 - s.dealer) % 4);
    }
  }
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.roundWind, 1);
});

test('viewFor verbirgt fremde Hände', () => {
  const s = startedGame();
  const v = viewFor(s, 0);
  assert.equal(v.players[0].hand.length, 14);
  assert.ok(v.players[1].hand.every((t) => t === null));
  assert.equal(v.players[1].handCount, 13);
  assert.equal(v.wall.livingCount, s.wall.living.length);
});

test('Zufällige Partien: Invarianten halten (136 Steine, keine illegale Aktion)', () => {
  const rng = createRngState('fuzz');
  let wins = 0, draws = 0;
  for (let g = 0; g < 40; g++) {
    let s = createGame({ seed: `fuzz-${g}`, ruleSet: createRuleSet({ rounds: 1, bonusTiles: g % 2 === 0 }) });
    s = applyAction(s, { type: 'startHand' });
    s = playRandomHand(s, rng);
    assert.equal(s.phase, 'handOver');
    const ids = allIds(s).sort((a, b) => a - b);
    assert.deepEqual(ids, allTileIds(s.ruleSet.bonusTiles));
    if (s.result.type === 'win') {
      wins++;
      const w = s.players[s.result.winner];
      assert.equal(w.hand.length + 3 * w.melds.length, 14);
    } else draws++;
    const counts = countsFromIds(ids);
    assert.ok(counts.every((c) => c === 4));
  }
  assert.ok(wins + draws === 40);
});

test('Komplette Partien über mehrere Hände bis gameOver', () => {
  const rng = createRngState('full');
  for (let g = 0; g < 5; g++) {
    let s = createGame({ seed: `full-${g}`, ruleSet: createRuleSet({ rounds: 1, dealerKeepsOnDraw: false, dealerKeepsOnWin: false }) });
    let hands = 0;
    while (s.phase !== 'gameOver') {
      s = applyAction(s, { type: 'startHand' });
      s = playRandomHand(s, rng);
      s = applyAction(s, { type: 'endHand' });
      hands++;
      assert.ok(hands <= 4);
    }
    assert.equal(hands, 4);
    assert.equal(s.log.at(-1).type, 'game_over');
    // Log enthält für jede Hand start_hand und end_hand
    assert.equal(s.log.filter((e) => e.type === 'start_hand').length, 4);
    assert.equal(s.log.filter((e) => e.type === 'end_hand').length, 4);
  }
});

test('Replay aus Seed und Aktionsliste reproduziert den Zustand', () => {
  const rng = createRngState('replay');
  let s = createGame({ seed: 'replay-1', ruleSet: createRuleSet({ rounds: 1 }) });
  s = applyAction(s, { type: 'startHand' });
  s = playRandomHand(s, rng);
  const r = replay({ seed: 'replay-1', ruleSet: s.ruleSet, humanSeat: 0, actions: s.actions });
  assert.deepEqual(r.players, s.players);
  assert.deepEqual(r.log, s.log);
  assert.equal(r.phase, s.phase);
});

test('Twofold Fortune: Gewinn mit dem Ersatzstein des zweiten Kongs in Folge', async () => {
  const { scoreRound } = await import('../src/scoring/millington.js');
  let s = rigGame({ hands: ['5555b 6666b 123c EE 9k', null, null, null] });
  s = structuredClone(s);
  // Zwei 9k an den Anfang der Kong-Box legen
  const nine = parseKinds('9k')[0];
  const pool = [...s.wall.living, ...s.wall.dead];
  const nines = pool.filter((id) => kindOf(id) === nine).slice(0, 2);
  const rest = pool.filter((id) => !nines.includes(id));
  s.wall = { living: rest.slice(0, rest.length - 12), dead: [...nines, ...rest.slice(rest.length - 12)] };
  s = applyAction(s, getLegalActions(s, 0).find((a) => a.type === 'kong' && a.kind === parseKinds('5b')[0]));
  assert.equal(s.replacementChain, 1);
  s = applyAction(s, getLegalActions(s, 0).find((a) => a.type === 'kong' && a.kind === parseKinds('6b')[0]));
  assert.equal(s.replacementChain, 2);
  const mj = getLegalActions(s, 0).find((a) => a.type === 'mahjong');
  assert.ok(mj);
  s = applyAction(s, mj);
  assert.equal(s.result.twofoldFortune, true);
  assert.equal(s.result.kongReplacement, true);
  const { sheets } = scoreRound(s);
  assert.ok(sheets[0].lines.some((l) => l.id === 'lim_twofold_fortune'));
  assert.equal(sheets[0].total, s.ruleSet.limit);
  // Nach einem Abwurf beginnt die Kette neu
  let s2 = rigGame({ hands: ['5555b 123c 456c EE 9k 8k', null, null, null] });
  s2 = applyAction(s2, getLegalActions(s2, 0).find((a) => a.type === 'kong'));
  assert.equal(s2.replacementChain, 1);
  s2 = applyAction(s2, getLegalActions(s2, 0).find((a) => a.type === 'discard'));
  assert.equal(s2.replacementChain, 0);
});

test('Gefährliches Spiel (DMJL): drei offene Sätze einer Farbe, Abwurf dieser Farbe gibt Mahjong', async () => {
  const { scoreRound } = await import('../src/scoring/millington.js');
  const { dangerousFor } = await import('../src/core/dangerous.js');
  const build = (hand0) => {
    let s = rigGame({ hands: [hand0, '111b 222b 333b 45b EE', null, null], ruleSet: createRuleSet({ penalties: true }) });
    s = structuredClone(s);
    const p = s.players[1];
    for (const k of parseKinds('123b')) {
      const tiles = p.hand.filter((id) => kindOf(id) === k);
      p.hand = p.hand.filter((id) => kindOf(id) !== k);
      p.melds.push({ type: 'pung', tiles, kinds: tiles.map(kindOf), open: true, from: 2 });
    }
    assert.equal(p.hand.length, 4);
    return s;
  };
  let s = build('6b 123c 456c 789c 99k SS');
  assert.deepEqual(dangerousFor(s, 0, parseKinds('6b')[0]), [1]);
  assert.deepEqual(dangerousFor(s, 0, parseKinds('9k')[0]), []);
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '6b') });
  assert.deepEqual(s.lastDiscard.dangerous, [1]);
  assert.equal(s.lastDiscard.forced, false);
  s = applyAction(s, { type: 'mahjong', seat: 1 });
  s = applyAction(s, { type: 'pass', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  assert.equal(s.result.dangerousGame, true);
  assert.ok(s.log.some((e) => e.type === 'dangerous_game'));
  const { payments } = scoreRound(s);
  assert.ok(payments[0][1] > 0);
  assert.equal(payments[2][1], 0);
  assert.equal(payments[3][1], 0);
  // Erzwungen: die ganze Hand besteht aus gefährlichen Steinen → keine Strafe
  let f = build('6b 123b 456b 789b 99b SS');
  f = applyAction(f, { type: 'discard', seat: 0, tile: tileOf(f, 0, '6b') });
  assert.equal(f.lastDiscard.forced, true);
  f = applyAction(f, { type: 'mahjong', seat: 1 });
  f = applyAction(f, { type: 'pass', seat: 2 });
  f = applyAction(f, { type: 'pass', seat: 3 });
  assert.equal(f.result.dangerousGame, false);
  // Ohne Option keine Markierung
  let n = rigGame({ hands: ['6b 123c 456c 789c 99k SS', null, null, null] });
  n = applyAction(n, { type: 'discard', seat: 0, tile: tileOf(n, 0, '6b') });
  assert.deepEqual(n.lastDiscard.dangerous, []);
});
