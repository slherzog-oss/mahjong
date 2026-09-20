// Sprachverwaltung: t(key, vars) liest aus dem aktiven Wörterbuch,
// fehlende Schlüssel fallen auf Deutsch zurück.
import { de } from './de.js';
import { en } from './en.js';

const DICTS = { de, en };
export const LANGUAGES = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
];

let current = 'de';
let overrides = {};

/** Laufzeit-Überschreibungen (z. B. Spielernamen aus den Einstellungen). */
export function setOverrides(o) {
  overrides = o ?? {};
}

export function getLanguage() {
  return current;
}

export function setLanguage(lang) {
  current = DICTS[lang] ? lang : 'de';
  try { document.documentElement.lang = current; } catch { /* kein DOM */ }
  return current;
}

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

export function t(key, vars = {}) {
  let s = lookup(overrides, key);
  if (s === undefined) s = lookup(DICTS[current], key);
  if (s === undefined) s = lookup(de, key);
  if (s === undefined) return key;
  if (typeof s !== 'string') return s;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export { de, en };
