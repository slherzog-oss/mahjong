import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, getLegalActions, seatsToAct } from '../src/core/state.js';
import { createRuleSet } from '../src/core/rules.js';
import { createRngState, nextInt } from '../src/core/rng.js';
import { parseKinds, kindOf, formatKinds } from '../src/core/tiles.js';
import { chooseAction, dangerOf } from '../src/ai/player.js';
import { stepAI, runUntilHuman } from '../src/ai/runner.js';
import { scoreRound } from '../src/scoring/millington.js';
import { rigGame, tileOf } from './helpers.js';

const fixtures = JSON.parse(readFileSync(new URL('./nanikiru/basic.json', import.meta.url)));

function rigDiscard(hand) {
  return rigGame({ hands: [hand, null, null, null] });
}

test('Nani Kiru?: erwartete Abwürfe (hard, deterministisch)', () => {
  for (const f of fixtures) {
    const s = rigDiscard(f.hand);
    const a = chooseAction(s, 0, { difficulty: 'hard', rng: createRngState('nk') });
    assert.equal(a.type, 'discard', f.name);
    const got = formatKinds([kindOf(a.tile)]);
    const expected = f.discardOneOf ?? [f.discard];
    assert.ok(expected.includes(got), `${f.name}: erwartet ${expected}, bekommen ${got}`);
  }
});

test('Mahjong wird immer angesagt', () => {
  let s = rigDiscard('123b 456b 789b 55b 111k');
  for (const d of ['easy', 'medium', 'hard']) {
    assert.equal(chooseAction(s, 0, { difficulty: d, rng: createRngState('x') }).type, 'mahjong');
  }
});

test('Pung nur bei Shanten-Gewinn, Chow nicht bei verdeckter naher Hand', () => {
  let s = rigGame({
    hands: [
      '5b 123c 456c 789c EEE 9k',
      '55b 12c 44c 789k NN 7k 8k',      // 5b-Pung bringt keinen Shanten-Gewinn? prüfen wir per Vergleich
      '46k 123b 456b 789b SS',          // wartend (5k), verdeckt; Chow 4-5-6b möglich → hält verdeckt
      'WWW ggg www 6k 7k 8k 9k',
    ],
  });
  s = applyAction(s, { type: 'discard', seat: 0, tile: tileOf(s, 0, '5b') });
  const a1 = chooseAction(s, 1, { difficulty: 'medium', rng: createRngState('c') });
  const a2 = chooseAction(s, 2, { difficulty: 'medium', rng: createRngState('c') });
  // Sitz 2: verdeckt und wartend → hält verdeckt (keepConcealedUntil 2) → pass
  assert.equal(a2.type, 'pass');
  // Sitz 1: 55b 12c 44c 789k NN 78k → Shanten 2; nach Pung 55b+5b: 12c 44c 789k NN 78k mit 1 Satz → Shanten 1 → ruft
  assert.equal(a1.type, 'pung');
  const e = chooseAction(s, 1, { difficulty: 'easy', rng: createRngState('c') });
  assert.equal(e.type, 'pung');
});

test('Kong wird genommen, wenn der Shanten nicht steigt', () => {
  const s = rigDiscard('5555b 123c 456c EE 9k 8k');
  const a = chooseAction(s, 0, { difficulty: 'medium', rng: createRngState('k') });
  assert.equal(a.type, 'kong');
  assert.equal(a.variant, 'concealed');
});

test('dangerOf: sichtbare Kopien senken die Gefahr', () => {
  const s = rigDiscard('123b 456c 789k EE 45k r');
  const rem = new Array(34).fill(4);
  const k = parseKinds('5c')[0];
  const high = dangerOf(s, 0, k, rem);
  rem[k] = 1;
  const low = dangerOf(s, 0, k, rem);
  assert.ok(low < high);
  assert.ok(dangerOf(s, 0, parseKinds('E')[0], new Array(34).fill(4)) < high);
});

test('Deterministisch bei gleichem Seed', () => {
  const play = () => {
    let s = createGame({ seed: 'det', humanSeat: -1, ruleSet: createRuleSet({ rounds: 1 }) });
    s = applyAction(s, { type: 'startHand' });
    s = runUntilHuman(s, { difficulty: 'medium' });
    return s.log.map((e) => JSON.stringify(e)).join('\n');
  };
  assert.equal(play(), play());
});

test('runUntilHuman stoppt beim Menschen und am Handende', () => {
  let s = createGame({ seed: 'human', humanSeat: 0 });
  s = applyAction(s, { type: 'startHand' });
  // Ost (Mensch) muss abwerfen → KI tut nichts
  const r = stepAI(s, { difficulty: 'medium' });
  assert.equal(r, null);
  s = applyAction(s, { type: 'discard', seat: 0, tile: s.players[0].hand[0] });
  s = runUntilHuman(s, { difficulty: 'medium' });
  assert.ok(['claiming', 'discard', 'draw', 'handOver'].includes(s.phase));
  assert.ok(seatsToAct(s).includes(0) || s.phase === 'handOver');
});

test('KI spielt ganze Partien fehlerfrei (alle Stufen gemischt)', () => {
  const rng = createRngState('ai-fuzz');
  const diffs = ['easy', 'medium', 'hard'];
  let hands = 0;
  for (let g = 0; g < 12; g++) {
    let s = createGame({ seed: `ai-${g}`, humanSeat: -1, ruleSet: createRuleSet({ rounds: 1, bonusTiles: g % 2 === 0 }) });
    while (s.phase !== 'gameOver') {
      s = applyAction(s, { type: 'startHand' });
      s = runUntilHuman(s, { difficulty: (seat) => diffs[(seat + g) % 3], rng });
      assert.equal(s.phase, 'handOver');
      const { net } = scoreRound(s);
      assert.equal(net.reduce((a, b) => a + b, 0), 0);
      s = applyAction(s, { type: 'endHand' });
      hands++;
    }
  }
  assert.ok(hands >= 12 * 4);
});

test('Mittel gewinnt deutlich öfter als Zufallsspieler', () => {
  const rng = createRngState('ai-vs-random');
  const games = 120;
  let aiWins = 0, wins = 0;
  for (let g = 0; g < games; g++) {
    let s = createGame({ seed: `vs-${g}`, humanSeat: -1, ruleSet: createRuleSet({ rounds: 1 }) });
    s = applyAction(s, { type: 'startHand' });
    let guard = 0;
    while (s.phase !== 'handOver') {
      if (++guard > 5000) throw new Error('Endlos');
      for (const seat of seatsToAct(s)) {
        let a;
        if (seat === 0) a = chooseAction(s, 0, { difficulty: 'medium', rng });
        else {
          const legal = getLegalActions(s, seat);
          a = legal.find((x) => x.type === 'mahjong') ?? legal[nextInt(rng, legal.length)];
        }
        s = applyAction(s, a);
        if (s.phase === 'handOver') break;
      }
    }
    if (s.result.type === 'win') {
      wins++;
      if (s.result.winner === 0) aiWins++;
    }
  }
  assert.ok(wins > 0);
  // Fairer Anteil wäre 25 %; die KI soll klar darüber liegen.
  assert.ok(aiWins / wins > 0.45, `KI-Anteil an Gewinnen: ${aiWins}/${wins}`);
});

test('KI schummelt nicht: Entscheidungen hängen nicht von fremden Händen oder der Wand ab', () => {
  const rng = createRngState('nocheat');
  let mismatches = 0, checks = 0;
  for (let g = 0; g < 6; g++) {
    let s = createGame({ seed: `nc-${g}`, humanSeat: -1, ruleSet: createRuleSet({ rounds: 1 }) });
    s = applyAction(s, { type: 'startHand' });
    let guard = 0;
    while (s.phase !== 'handOver' && ++guard < 400) {
      for (const seat of seatsToAct(s)) {
        const diff = ['easy', 'medium', 'hard'][(seat + g) % 3];
        // Verdeckte Information permutieren: fremde Hände und Wand untereinander mischen
        const alt = structuredClone(s);
        const hidden = [];
        for (const p of alt.players) if (p.seat !== seat) { hidden.push(...p.hand); p.hand = []; }
        hidden.push(...alt.wall.living, ...alt.wall.dead);
        const shuffled = hidden.slice().reverse();
        for (const p of alt.players) if (p.seat !== seat) p.hand = shuffled.splice(0, s.players[p.seat].hand.length);
        alt.wall.living = shuffled.splice(0, s.wall.living.length);
        alt.wall.dead = shuffled;
        const rngA = { ...rng }, rngB = { ...rng };
        const a = chooseAction(s, seat, { difficulty: diff, rng: rngA });
        const b = chooseAction(alt, seat, { difficulty: diff, rng: rngB });
        checks++;
        if (JSON.stringify({ ...a, tile: a.tile === undefined ? undefined : kindOf(a.tile) }) !== JSON.stringify({ ...b, tile: b.tile === undefined ? undefined : kindOf(b.tile) })) mismatches++;
        s = applyAction(s, a);
        nextInt(rng, 2);
        if (s.phase === 'handOver') break;
      }
    }
  }
  assert.ok(checks > 100);
  assert.equal(mismatches, 0, `${mismatches} von ${checks} Entscheidungen hingen von verdeckter Information ab`);
});

test('DMJL-Strafen: KI und Berater meiden offensichtlich gefährliche Abwürfe', async () => {
  const { adviseDiscard } = await import('../src/advisor/advisor.js');
  const { explainDiscard } = await import('../src/advisor/explain.js');
  let s = rigGame({ hands: ['6b 7b 123c 456c 789c 99k S', '111b 222b 333b 45b EE', null, null], ruleSet: createRuleSet({ penalties: true }) });
  s = structuredClone(s);
  const p = s.players[1];
  for (const k of parseKinds('123b')) {
    const tiles = p.hand.filter((id) => kindOf(id) === k);
    p.hand = p.hand.filter((id) => kindOf(id) !== k);
    p.melds.push({ type: 'pung', tiles, kinds: tiles.map(kindOf), open: true, from: 2 });
  }
  for (const d of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < 5; i++) {
      const a = chooseAction(s, 0, { difficulty: d, rng: createRngState(`p-${d}-${i}`) });
      assert.equal(a.type, 'discard');
      assert.ok(!['6b', '7b'].includes(formatKinds([kindOf(a.tile)])), `${d}: ${formatKinds([kindOf(a.tile)])}`);
    }
  }
  const adv = adviseDiscard(s, 0);
  assert.ok(!['6b', '7b'].includes(formatKinds([adv.best.kind])));
  // 6b, 7b und der Wind S sind gegenüber drei offenen Bambus-Sätzen gefährlich
  assert.equal(adv.options.filter((o) => o.penalty).length, 3);
  assert.ok(explainDiscard(adv).some((l) => l.includes('DMJL')));
});
