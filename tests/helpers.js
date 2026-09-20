// Testhelfer: Zustände mit vorgegebenen Händen bauen, Züge automatisch spielen.
import { createGame, applyAction, getLegalActions, seatsToAct } from '../src/core/state.js';
import { parseKinds, kindOf, allTileIds } from '../src/core/tiles.js';
import { nextInt } from '../src/core/rng.js';

/** Ein Spiel mit gestarteter Hand. */
export function startedGame(opts = {}) {
  let s = createGame({ seed: 'test', ...opts });
  s = applyAction(s, { type: 'startHand' });
  return s;
}

/**
 * Baut einen Zustand in Phase 'discard' oder 'draw' mit exakt vorgegebenen Händen.
 * hands: Array aus 4 Notationen (13 Steine; der aktuelle Spieler 14 in Phase 'discard').
 * Die Wand enthält die übrigen Steine in Reihenfolge `wallNotation` (optional).
 */
export function rigGame({ hands, dealer = 0, current = 0, phase = 'discard', wall = null, ruleSet, seed = 'rig' }) {
  let s = createGame({ seed, ...(ruleSet ? { ruleSet } : {}) });
  s = structuredClone(s);
  s.handNumber = 1;
  s.dealer = dealer;
  s.current = current;
  s.phase = phase;
  const pool = allTileIds(s.ruleSet.bonusTiles);
  const take = (kind) => {
    const i = pool.findIndex((id) => kindOf(id) === kind);
    if (i < 0) throw new Error(`Keine Kopie mehr von Art ${kind}`);
    return pool.splice(i, 1)[0];
  };
  const fillers = [];
  hands.forEach((notation, seat) => {
    const expected = phase === 'discard' && seat === current ? 14 : 13;
    if (notation === null || notation === undefined) {
      fillers.push([seat, expected]);
      return;
    }
    const kinds = parseKinds(notation);
    if (kinds.length !== expected) throw new Error(`Sitz ${seat}: ${kinds.length} Steine, erwartet ${expected}`);
    s.players[seat].hand = kinds.map(take);
  });
  // Füllhände (null): beliebige Steine aus dem Restpool, gleichmäßig über alle Arten verteilt.
  for (const [seat, n] of fillers) {
    const hand = [];
    for (let i = 0; i < n; i++) hand.push(pool.splice(Math.floor((pool.length * (i + 1)) / (n + 1)) - 1 - hand.length * 0, 1)[0]);
    s.players[seat].hand = hand;
  }
  const living = wall ? parseKinds(wall).map(take) : [];
  living.push(...pool);
  s.wall = { living, dead: living.splice(living.length - s.ruleSet.deadWallSize, s.ruleSet.deadWallSize) };
  if (phase === 'discard') s.lastDraw = { seat: current, tile: s.players[current].hand.at(-1), replacement: false };
  return s;
}

/** Stein-ID einer Art in der Hand eines Sitzes. */
export function tileOf(state, seat, notation) {
  const kind = parseKinds(notation)[0];
  const id = state.players[seat].hand.find((t) => kindOf(t) === kind);
  if (id === undefined) throw new Error(`Sitz ${seat} hat kein ${notation}`);
  return id;
}

/** Alle Sitze passen. */
export function allPass(state) {
  let s = state;
  for (const seat of seatsToAct(s)) s = applyAction(s, { type: 'pass', seat });
  return s;
}

/**
 * Spielt eine Hand mit zufälligen legalen Zügen zu Ende (Mahjong wird bevorzugt,
 * Abwürfe zufällig). Liefert den Endzustand in Phase 'handOver' oder 'gameOver'.
 */
export function playRandomHand(state, rng) {
  let s = state;
  let guard = 0;
  while (s.phase !== 'handOver' && s.phase !== 'gameOver' && s.phase !== 'idle') {
    if (++guard > 5000) throw new Error('Endlosschleife');
    for (const seat of seatsToAct(s)) {
      const legal = getLegalActions(s, seat);
      if (!legal.length) throw new Error(`Keine legale Aktion für Sitz ${seat} in ${s.phase}`);
      const mj = legal.find((a) => a.type === 'mahjong');
      const a = mj ?? legal[nextInt(rng, legal.length)];
      s = applyAction(s, a);
      if (s.phase !== state.phase) break;
    }
  }
  return s;
}
