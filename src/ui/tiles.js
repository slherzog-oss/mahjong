// Steingrafiken: Kennung → Bildpfad. Blumen/Jahreszeiten als Blank mit Text.
import { KIND_NAMES, kindOf, isBonus } from '../core/tiles.js';

const BASE = new URL('./tiles/', import.meta.url).pathname;

export function tileSrc(kind) {
  if (isBonus(kind)) return `${BASE}Blank.svg`;
  return `${BASE}${KIND_NAMES[kind]}.svg`;
}

export const BACK_SRC = `${BASE}Back.svg`;

// Riichi: rote Fünfer (je erste Kopie von 5b, 5c, 5k) hervorheben
const RED_FIVE_IDS = new Set([16, 52, 88]);
let redFivesOn = false;
export function setRedFives(on) { redFivesOn = !!on; }
export function isRedFive(id) { return redFivesOn && RED_FIVE_IDS.has(id); }

/** HTML eines Steins (Vorderseite). id optional für Klick-Ziel. */
export function tileHtml(kind, { id = null, classes = '', label = null } = {}) {
  const name = KIND_NAMES[kind];
  const bonus = isBonus(kind) ? `<span class="tile-bonus">${name}</span>` : '';
  const attrs = id !== null ? ` data-id="${id}" data-kind="${kind}"` : ` data-kind="${kind}"`;
  return `<span class="tile ${classes}"${attrs} title="${label ?? name}"><img src="${tileSrc(kind)}" alt="${name}" draggable="false">${bonus}</span>`;
}

export function backHtml(classes = '') {
  return `<span class="tile tile-back ${classes}"><img src="${BACK_SRC}" alt="" draggable="false"></span>`;
}

export function tileHtmlById(id, opts = {}) {
  const classes = isRedFive(id) ? `${opts.classes ?? ''} red` : opts.classes;
  return tileHtml(kindOf(id), { id, ...opts, classes });
}
