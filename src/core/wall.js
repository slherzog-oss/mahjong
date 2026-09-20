// Wand: Mischen, Verteilen, Ziehen. Reine Funktionen auf dem Zustand.
import { allTileIds } from './tiles.js';
import { shuffle } from './rng.js';

/**
 * Baut eine gemischte Wand. Liefert { living, dead }:
 * living: Ziehstapel (Index 0 wird als nächstes gezogen),
 * dead: Kong-Box (Ersatzsteine, Index 0 wird als nächstes gezogen).
 */
export function buildWall(rngState, ruleSet) {
  const ids = shuffle(rngState, allTileIds(ruleSet.bonusTiles));
  const dead = ids.splice(ids.length - ruleSet.deadWallSize, ruleSet.deadWallSize);
  return { living: ids, dead };
}

/** Zieht den nächsten Stein der lebenden Wand (mutiert wall). */
export function drawLiving(wall) {
  if (wall.living.length === 0) return null;
  return wall.living.shift();
}

/**
 * Zieht einen Ersatzstein aus der toten Wand. Ist refill aktiv, wird die tote
 * Wand danach vom Ende der lebenden Wand aufgefüllt.
 */
export function drawReplacement(wall, ruleSet) {
  if (wall.dead.length === 0) return null;
  const id = wall.dead.shift();
  if (ruleSet.refillDeadWall && wall.living.length > 0) {
    wall.dead.push(wall.living.pop());
  }
  return id;
}

export function livingCount(wall) {
  return wall.living.length;
}
