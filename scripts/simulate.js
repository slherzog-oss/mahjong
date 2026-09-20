// KI-gegen-KI-Simulation zur Kalibrierung der Schwierigkeitsstufen.
// node scripts/simulate.js [Partien] [Stufe Sitz0] [Stufe Sitz1] [Stufe Sitz2] [Stufe Sitz3]
import { createGame, applyAction } from '../src/core/state.js';
import { createRuleSet } from '../src/core/rules.js';
import { createRngState } from '../src/core/rng.js';
import { runUntilHuman } from '../src/ai/runner.js';
import { scoreRound } from '../src/scoring/millington.js';

const games = Number(process.argv[2] ?? 200);
const levels = process.argv.slice(3, 7);
while (levels.length < 4) levels.push('medium');
const rng = createRngState('simulate');
const wins = [0, 0, 0, 0];
const net = [0, 0, 0, 0];
const dealIn = [0, 0, 0, 0];
let draws = 0;
const t0 = performance.now();
// Duplikat-Matches (wie Mortal): jede Wand wird viermal gespielt, die Stufen rotieren
// über die Sitze, damit Glück beim Geben herausgerechnet wird.
for (let g = 0; g < games; g++) {
  let s = createGame({ seed: `sim-${Math.floor(g / 4)}`, humanSeat: -1, ruleSet: createRuleSet({ rounds: 1 }) });
  s = applyAction(s, { type: 'startHand' });
  const rot = g % 4;
  s = runUntilHuman(s, { difficulty: (seat) => levels[(seat + rot) % 4], rng });
  const r = scoreRound(s);
  if (s.result.type === 'win') {
    wins[(s.result.winner + rot) % 4]++;
    if (s.result.from !== null) dealIn[(s.result.from + rot) % 4]++;
  } else draws++;
  for (let seat = 0; seat < 4; seat++) net[(seat + rot) % 4] += r.net[seat];
}
const ms = performance.now() - t0;
console.log(`${games} Hände in ${(ms / 1000).toFixed(1)} s (${(ms / games).toFixed(0)} ms je Hand), Unentschieden: ${draws}`);
for (let i = 0; i < 4; i++) {
  console.log(`  ${levels[i].padEnd(7)}  Gewinne ${String(wins[i]).padStart(4)} (${(100 * wins[i] / games).toFixed(1)} %)  Abwürfe ins Mahjong ${String(dealIn[i]).padStart(4)}  Bilanz ${String(Math.round(net[i] / games)).padStart(5)} je Hand`);
}
