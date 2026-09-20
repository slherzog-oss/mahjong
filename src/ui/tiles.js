// Steingrafiken: Kennung → Bildpfad. Blumen/Jahreszeiten als Blank mit Text.
import { KIND_NAMES, kindOf, isBonus } from '../core/tiles.js';

const BASE = new URL('./tiles/', import.meta.url).pathname;

export function tileSrc(kind) {
  if (isBonus(kind)) return `${BASE}Blank.svg`;
  return `${BASE}${KIND_NAMES[kind]}.svg`;
}

export const BACK_SRC = `${BASE}Back.svg`;

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
  return tileHtml(kindOf(id), { id, ...opts });
}
