// Seedbarer Zufallsgenerator (sfc32) mit serialisierbarem Zustand.
// Der Zustand liegt als vier 32-Bit-Zahlen im Spielzustand, damit Replays
// und Undo exakt reproduzierbar sind.

function hashSeed(seed) {
  // Aus einem beliebigen String/Number vier 32-Bit-Werte ableiten (FNV-1a-Variante).
  const str = String(seed);
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f);
  }
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRngState(seed) {
  const s = hashSeed(seed);
  const state = { a: s[0], b: s[1], c: s[2], d: s[3] };
  // Einige Runden verwerfen, damit ähnliche Seeds auseinanderlaufen.
  for (let i = 0; i < 12; i++) nextUint32(state);
  return state;
}

/** Nächste 32-Bit-Zahl; verändert state in place. */
export function nextUint32(state) {
  let { a, b, c, d } = state;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  const r = (t + d) | 0;
  c = (c + r) | 0;
  state.a = a >>> 0;
  state.b = b >>> 0;
  state.c = c >>> 0;
  state.d = d >>> 0;
  return r >>> 0;
}

/** Gleichverteilte Zahl in [0, 1). */
export function nextFloat(state) {
  return nextUint32(state) / 4294967296;
}

/** Ganzzahl in [0, n). */
export function nextInt(state, n) {
  return Math.floor(nextFloat(state) * n);
}

/** Fisher-Yates in place. */
export function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(state, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
