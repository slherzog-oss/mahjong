// Steine: Kennungen, Indizes und Hilfsfunktionen.
//
// Jede Steinart ("kind") hat einen Index 0..33 (Bonussteine 34..41):
//   0- 8  Bambus 1-9      (1b..9b)
//   9-17  Kreise 1-9      (1c..9c)
//  18-26  Zeichen 1-9     (1k..9k)
//  27-30  Winde E S W N
//  31-33  Drachen Rd Gd Wd (rot, grün, weiß)
//  34-37  Blumen F1..F4
//  38-41  Jahreszeiten S1..S4
//
// Jede physische Kopie hat eine eindeutige ID 0..135 (Bonus 136..143).
// kindOf(id) liefert den Art-Index, KIND_NAMES[kind] die Kennung.

export const SUITS = ['b', 'c', 'k'];
export const WINDS = ['E', 'S', 'W', 'N'];
export const DRAGONS = ['Rd', 'Gd', 'Wd'];
export const FLOWERS = ['F1', 'F2', 'F3', 'F4'];
export const SEASONS = ['S1', 'S2', 'S3', 'S4'];

export const KIND_NAMES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${r}b`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${r}c`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${r}k`),
  ...WINDS,
  ...DRAGONS,
  ...FLOWERS,
  ...SEASONS,
];

export const NUM_KINDS = 34; // ohne Bonussteine
export const NUM_BONUS_KINDS = 8;
export const NUM_TILES = 136;
export const NUM_BONUS_TILES = 8;

export const KIND_INDEX = Object.fromEntries(KIND_NAMES.map((n, i) => [n, i]));

export function kindOf(id) {
  return id < NUM_TILES ? Math.floor(id / 4) : NUM_KINDS + (id - NUM_TILES);
}

export function nameOf(id) {
  return KIND_NAMES[kindOf(id)];
}

export function kindByName(name) {
  const k = KIND_INDEX[name];
  if (k === undefined) throw new Error(`Unbekannte Steinart: ${name}`);
  return k;
}

export function isSuited(kind) {
  return kind >= 0 && kind < 27;
}
export function isHonour(kind) {
  return kind >= 27 && kind < 34;
}
export function isWind(kind) {
  return kind >= 27 && kind < 31;
}
export function isDragon(kind) {
  return kind >= 31 && kind < 34;
}
export function isBonus(kind) {
  return kind >= 34;
}
export function isFlower(kind) {
  return kind >= 34 && kind < 38;
}
export function isSeason(kind) {
  return kind >= 38 && kind < 42;
}
export function suitOf(kind) {
  return isSuited(kind) ? Math.floor(kind / 9) : -1;
}
export function rankOf(kind) {
  return isSuited(kind) ? (kind % 9) + 1 : 0;
}
export function isTerminal(kind) {
  const r = rankOf(kind);
  return r === 1 || r === 9;
}
export function isSimple(kind) {
  const r = rankOf(kind);
  return r >= 2 && r <= 8;
}
/** Endstein oder Honour ("major" nach Millington). */
export function isMajor(kind) {
  return isTerminal(kind) || isHonour(kind);
}
/** Windindex 0..3 (E S W N) für einen Wind-Stein, sonst -1. */
export function windIndex(kind) {
  return isWind(kind) ? kind - 27 : -1;
}
export function windKind(windIdx) {
  return 27 + windIdx;
}
/** Blume/Jahreszeit gehört zu Sitzwind 0..3 (F1/S1 = Ost usw.). */
export function bonusOwner(kind) {
  if (isFlower(kind)) return kind - 34;
  if (isSeason(kind)) return kind - 38;
  return -1;
}

/** Alle Stein-IDs des Satzes (136, optional plus 8 Bonussteine). */
export function allTileIds(withBonus = false) {
  const n = withBonus ? NUM_TILES + NUM_BONUS_TILES : NUM_TILES;
  return Array.from({ length: n }, (_, i) => i);
}

/** Sortierreihenfolge: nach Art, dann nach ID. */
export function sortTiles(ids) {
  return [...ids].sort((a, b) => kindOf(a) - kindOf(b) || a - b);
}

/** Zählvektor über 34 Arten aus einer Liste von IDs oder Arten. */
export function countsFromIds(ids) {
  const c = new Array(NUM_KINDS).fill(0);
  for (const id of ids) {
    const k = kindOf(id);
    if (k < NUM_KINDS) c[k]++;
  }
  return c;
}

export function countsFromKinds(kinds) {
  const c = new Array(NUM_KINDS).fill(0);
  for (const k of kinds) if (k < NUM_KINDS) c[k]++;
  return c;
}

/**
 * Kurznotation für Tests und Lexikon:
 *  "123b 55c EEE rr" → Arten. Ziffern mit Farbsuffix, Winde E S W N,
 *  Drachen r g w (klein), Bonus F1..F4 / S1..S4.
 */
export function parseKinds(notation) {
  const out = [];
  for (const token of notation.trim().split(/\s+/)) {
    if (!token) continue;
    const m = token.match(/^([1-9]+)([bck])$/);
    if (m) {
      for (const d of m[1]) out.push(kindByName(`${d}${m[2]}`));
      continue;
    }
    if (/^[FS][1-4]$/.test(token)) {
      out.push(kindByName(token));
      continue;
    }
    for (const ch of token) {
      const map = { E: 'E', S: 'S', W: 'W', N: 'N', r: 'Rd', g: 'Gd', w: 'Wd' };
      if (!map[ch]) throw new Error(`Unbekanntes Zeichen in Notation: ${ch}`);
      out.push(kindByName(map[ch]));
    }
  }
  return out;
}

/** Arten → Notation (gruppiert nach Farbe, sortiert). */
export function formatKinds(kinds) {
  const sorted = [...kinds].sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < sorted.length) {
    const k = sorted[i];
    if (isSuited(k)) {
      const s = suitOf(k);
      let digits = '';
      while (i < sorted.length && suitOf(sorted[i]) === s) {
        digits += rankOf(sorted[i]);
        i++;
      }
      parts.push(digits + SUITS[s]);
    } else if (isWind(k)) {
      let str = '';
      while (i < sorted.length && isWind(sorted[i])) str += KIND_NAMES[sorted[i++]];
      parts.push(str);
    } else if (isDragon(k)) {
      let str = '';
      while (i < sorted.length && isDragon(sorted[i])) str += KIND_NAMES[sorted[i++]][0].toLowerCase();
      parts.push(str);
    } else {
      parts.push(KIND_NAMES[k]);
      i++;
    }
  }
  return parts.join(' ');
}
