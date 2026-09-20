// Hand-Validierung: Zerlegung in Sätze + Paar, Sonderhände, Warten.
// Arbeitet auf Zählvektoren (34 Arten) und Meld-Listen; kennt keine Stein-IDs.
//
// Meld-Format: { type: 'chow'|'pung'|'kong', kinds: number[], open: boolean }

import {
  NUM_KINDS,
  isSuited,
  isHonour,
  isMajor,
  suitOf,
  rankOf,
  countsFromKinds,
} from './tiles.js';

/** Alle 13 Arten für Thirteen Orphans: 1/9 jeder Farbe, 4 Winde, 3 Drachen. */
export const ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function total(counts) {
  let n = 0;
  for (let i = 0; i < NUM_KINDS; i++) n += counts[i];
  return n;
}

/**
 * Alle Zerlegungen des verdeckten Teils (counts, 3n+2 Steine) in n Sätze und ein
 * Paar. Liefert Liste von { pair: kind, sets: [{type:'chow'|'pung', kinds}] }.
 * Für Scoring brauchen wir alle Varianten, nicht nur eine.
 */
export function decompose(counts) {
  const n = total(counts);
  if (n % 3 !== 2) return [];
  const results = [];
  const c = counts.slice();

  for (let p = 0; p < NUM_KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const sets = [];
    decomposeSets(c, 0, sets, (found) => results.push({ pair: p, sets: found.slice() }));
    c[p] += 2;
  }
  return results;
}

// Rekursiv: nimmt an Position i den kleinsten verbleibenden Stein und versucht
// Pung oder Chow damit. Reihenfolge ist damit kanonisch, keine Duplikate.
function decomposeSets(c, i, sets, done) {
  while (i < NUM_KINDS && c[i] === 0) i++;
  if (i >= NUM_KINDS) {
    done(sets);
    return;
  }
  // Pung
  if (c[i] >= 3) {
    c[i] -= 3;
    sets.push({ type: 'pung', kinds: [i, i, i] });
    decomposeSets(c, i, sets, done);
    sets.pop();
    c[i] += 3;
  }
  // Chow (nur Farbsteine, Rang <= 7)
  if (isSuited(i) && rankOf(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    sets.push({ type: 'chow', kinds: [i, i + 1, i + 2] });
    decomposeSets(c, i, sets, done);
    sets.pop();
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

/** Thirteen Orphans: alle 13 Arten je einmal plus ein Paar aus einer davon. */
export function isThirteenOrphans(counts, melds) {
  if (melds.length > 0 || total(counts) !== 14) return false;
  let pairs = 0;
  for (const k of ORPHAN_KINDS) {
    if (counts[k] === 0) return false;
    if (counts[k] === 2) pairs++;
    if (counts[k] > 2) return false;
  }
  return pairs === 1;
}

/** Seven Pairs: sieben verschiedene Paare (Option). */
export function isSevenPairs(counts, melds) {
  if (melds.length > 0 || total(counts) !== 14) return false;
  let pairs = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] === 2) pairs++;
    else if (counts[k] !== 0) return false;
  }
  return pairs === 7;
}

/**
 * Nine Gates: 1112345678999 einer Farbe (verdeckt) plus ein weiterer Stein
 * dieser Farbe. Gilt nach Millington nur mit vollständig verdeckter Hand.
 */
export function isNineGates(counts, melds) {
  if (melds.length > 0 || total(counts) !== 14) return false;
  let suit = -1;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] === 0) continue;
    if (!isSuited(k)) return false;
    const s = suitOf(k);
    if (suit === -1) suit = s;
    else if (suit !== s) return false;
  }
  if (suit === -1) return false;
  const base = suit * 9;
  const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  let extra = 0;
  for (let r = 0; r < 9; r++) {
    const diff = counts[base + r] - pattern[r];
    if (diff < 0 || diff > 1) return false;
    extra += diff;
  }
  return extra === 1;
}

/**
 * Prüft eine vollständige Hand (verdeckte Steine als Arten + Melds).
 * Liefert { win: boolean, forms: string[], decompositions } mit Formen
 * 'standard', 'thirteen_orphans', 'seven_pairs', 'nine_gates'.
 */
export function evaluateHand(concealedKinds, melds, ruleSet) {
  const counts = countsFromKinds(concealedKinds);
  const forms = [];
  let decompositions = [];

  const expected = 14 - 3 * melds.length; // Kongs zählen als 3 für die Handgröße
  if (total(counts) === expected) {
    decompositions = decompose(counts);
    if (decompositions.length > 0) forms.push('standard');
  }
  if (isThirteenOrphans(counts, melds)) forms.push('thirteen_orphans');
  if (isNineGates(counts, melds)) forms.push('nine_gates');
  if (ruleSet?.sevenPairs && isSevenPairs(counts, melds)) forms.push('seven_pairs');

  return { win: forms.length > 0, forms, decompositions };
}

export function isWinningHand(concealedKinds, melds, ruleSet) {
  return evaluateHand(concealedKinds, melds, ruleSet).win;
}

/**
 * Warten: welche Arten vervollständigen eine Hand mit 13 - 3·melds Steinen?
 * Liefert sortierte Liste von Arten (leer = nicht wartend).
 */
export function waitingKinds(concealedKinds, melds, ruleSet) {
  const counts = countsFromKinds(concealedKinds);
  const out = [];
  if (total(counts) !== 13 - 3 * melds.length) return out;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 4) continue;
    if (isWinningHand([...concealedKinds, k], melds, ruleSet)) out.push(k);
  }
  return out;
}

// --- Eigenschaften einer fertigen Hand (für Scoring und Berater) ---

/** Alle Arten der Hand inkl. Melds. */
export function allKinds(concealedKinds, melds) {
  const out = [...concealedKinds];
  for (const m of melds) out.push(...m.kinds);
  return out;
}

export function handSuits(kinds) {
  const suits = new Set();
  let honours = false;
  for (const k of kinds) {
    if (isSuited(k)) suits.add(suitOf(k));
    else if (isHonour(k)) honours = true;
  }
  return { suits: [...suits], honours };
}

/** 'full' = reine Farbe, 'half' = eine Farbe + Honours, 'honours' = nur Honours, null sonst. */
export function flushType(kinds) {
  const { suits, honours } = handSuits(kinds);
  if (suits.length === 1) return honours ? 'half' : 'full';
  if (suits.length === 0 && honours) return 'honours';
  return null;
}

export function allMajor(kinds) {
  return kinds.every(isMajor);
}

export function allTerminals(kinds) {
  return kinds.every((k) => isSuited(k) && (rankOf(k) === 1 || rankOf(k) === 9));
}

export function allHonours(kinds) {
  return kinds.every(isHonour);
}
