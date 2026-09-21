import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, SETTINGS_KEY } from '../src/store/store.js';
import { memoryAdapter } from '../src/store/persistence.js';
import { RULE_PRESETS, presetOf, RULE_FIELDS } from '../src/core/presets.js';
import { t, setLanguage, setOverrides, getLanguage } from '../src/i18n/index.js';
import { de } from '../src/i18n/de.js';
import { en } from '../src/i18n/en.js';
import { fullLexicon, LEXICON } from '../src/lexicon/hands.js';
import { SCORE_RULES } from '../src/scoring/table.js';
import { parseKinds } from '../src/core/tiles.js';
import { FORM_IDS } from '../src/analysis/forms.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('Alte Einstellungen werden migriert, Voreinstellung wird angewendet', () => {
  const old = { difficulty: 'hard', bonusTiles: true, sevenPairs: true, limit: 1000 };
  const s1 = createStore({ storage: memStorage({ [SETTINGS_KEY]: JSON.stringify(old) }), persistence: memoryAdapter() });
  assert.equal(s1.settings.difficulty, 'hard');
  assert.equal(s1.settings.rules.bonusTiles, true);
  assert.equal(s1.settings.rules.sevenPairs, true);
  assert.equal(s1.settings.rules.limit, 1000);
  assert.equal(s1.settings.bonusTiles, undefined);
  const s2 = createStore({ storage: memStorage({ [SETTINGS_KEY]: JSON.stringify({ preset: 'bmja' }) }), persistence: memoryAdapter() });
  assert.equal(s2.settings.rules.maxChows, 1);
  assert.equal(s2.settings.rules.limit, 1000);
});

test('setRule wechselt auf custom, applyPreset zurück; neues Spiel nutzt die Regeln', () => {
  const store = createStore({ storage: memStorage(), persistence: memoryAdapter() });
  store.updateSettings({ aiDelayMs: 0 });
  assert.equal(store.settings.preset, 'millington');
  store.setRule('limit', 1000);
  assert.equal(store.settings.preset, 'custom');
  store.setRule('limit', 500);
  assert.equal(store.settings.preset, 'millington');
  store.applyPreset('dmjl');
  assert.equal(store.settings.rules.deadWallSize, 16);
  assert.equal(presetOf(store.settings.rules), 'dmjl');
  store.newGame({ seed: 'rules-1' });
  assert.equal(store.getSnapshot().state.ruleSet.deadWallSize, 16);
  assert.equal(store.getSnapshot().state.ruleSet.loserHandDoubles, true);
  // DMJL füllt die Kong-Box nicht auf; Bonussteine beim Geben verkleinern sie
  assert.ok(store.getSnapshot().state.wall.dead.length <= 16);
});

test('Voreinstellungen haben alle Felder', () => {
  for (const p of Object.values(RULE_PRESETS)) for (const k of RULE_FIELDS) assert.notEqual(p[k], undefined, k);
});

test('i18n: Sprachwechsel, Fallback, Überschreibungen, gleiche Schlüssel', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('newGame'), 'New game');
  setOverrides({ playerNames: ['You', 'A', 'B', 'C'] });
  assert.deepEqual(t('playerNames'), ['You', 'A', 'B', 'C']);
  setOverrides({});
  setLanguage('de');
  assert.equal(getLanguage(), 'de');
  assert.equal(t('newGame'), 'Neues Spiel');
  setLanguage('xx'); // unbekannter Code fällt auf Englisch zurück (Standardsprache)
  assert.equal(getLanguage(), 'en');
  assert.equal(t('newGame'), 'New game');
  assert.equal(t('missing.key'), 'missing.key');
  assert.equal(t('adv.best', { tile: '1b', shanten: 1, ukeire: 8, pct: 40 }).includes('1b'), true);
  const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
  const dk = new Set(keys(de));
  const ek = new Set(keys(en));
  const missingEn = [...dk].filter((k) => !ek.has(k));
  const missingDe = [...ek].filter((k) => !dk.has(k));
  assert.deepEqual(missingEn, [], `fehlt in en: ${missingEn}`);
  assert.deepEqual(missingDe, [], `fehlt in de: ${missingDe}`);
});

test('Lexikon: jede Scoring-Zeile hat einen Eintrag, Beispiele sind gültig, Formen bekannt', () => {
  const all = fullLexicon();
  const byRule = new Set(all.map((e) => e.rule).filter(Boolean));
  for (const id of Object.keys(SCORE_RULES)) if (id !== 'mahjong') assert.ok(byRule.has(id), id);
  for (const e of LEXICON) {
    assert.ok(e.name.de && e.name.en && e.text.de && e.text.en, e.id);
    if (e.example) assert.equal(parseKinds(e.example).length, 14, e.id);
    if (e.form) assert.ok(FORM_IDS.includes(e.form), `${e.id}: ${e.form}`);
  }
  const ids = all.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('Lexikon je Variante: jede Fan-/Yaku-Zeile hat einen Eintrag, Beispiele gültig, Formen bekannt', async () => {
  const { HK_FANS } = await import('../src/scoring/hongkong.js');
  const { RIICHI_YAKU } = await import('../src/scoring/riichi.js');
  const { categoriesFor, lexiconById } = await import('../src/lexicon/hands.js');
  const hk = fullLexicon('hongkong');
  const hkRules = new Set(hk.map((e) => e.rule).filter(Boolean));
  for (const id of Object.keys(HK_FANS)) assert.ok(hkRules.has(id), id);
  const ri = fullLexicon('riichi');
  const riRules = new Set(ri.map((e) => e.rule).filter(Boolean));
  for (const id of Object.keys(RIICHI_YAKU)) if (id !== 'fu') assert.ok(riRules.has(id), id);
  for (const e of [...hk, ...ri]) {
    assert.ok(e.name.de && e.name.en && e.text.de && e.text.en, e.id);
    assert.ok(categoriesFor(e.variant).includes(e.category), `${e.id}: ${e.category}`);
    if (e.example) assert.equal(parseKinds(e.example).length, 14, e.id);
    if (e.form) assert.ok(FORM_IDS.includes(e.form), `${e.id}: ${e.form}`);
  }
  const ids = [...hk, ...ri, ...fullLexicon()].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(lexiconById('ri_pinfu')?.variant, 'riichi');
  assert.equal(lexiconById('lex_hk_full_flush')?.variant, 'hongkong');
});

test('Voreinstellungen je Variante und Variantenwechsel im Store', () => {
  assert.equal(RULE_PRESETS.riichi.variant, 'riichi');
  assert.equal(RULE_PRESETS.hongkong.variant, 'hongkong');
  assert.equal(presetOf(RULE_PRESETS.riichi), 'riichi');
  const store = createStore({ storage: memStorage(), persistence: memoryAdapter() });
  store.setRule('variant', 'riichi');
  assert.equal(store.settings.preset, 'riichi');
  assert.equal(store.settings.rules.startScore, 0);
  store.setRule('redFives', false);
  assert.equal(store.settings.preset, 'custom');
  store.updateSettings({ aiDelayMs: 0 });
  store.newGame({ seed: 'variant-1' });
  const st = store.getSnapshot().state;
  assert.equal(st.ruleSet.variant, 'riichi');
  assert.equal(st.wall.indicators.length, 5);
});
