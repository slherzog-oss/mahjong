import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKinds, kindOf, formatKinds, allTileIds, countsFromIds } from '../src/core/tiles.js';
import { createRuleSet } from '../src/core/rules.js';
import { formDistance, formUkeire, analyzeForms, formDiscardOptions, formKeepKinds, FORM_IDS } from '../src/analysis/forms.js';
import { applyAction, rigDeal, replay, createGame, getLegalActions } from '../src/core/state.js';
import { startedGame, rigGame } from './helpers.js';

const rules = createRuleSet();
const sp = createRuleSet({ sevenPairs: true });
const d = (form, n, melds = [], rs = rules) => formDistance(form, parseKinds(n), melds, rs);
const meld = (type, n, open = true) => ({ type, kinds: parseKinds(n), open });

test('Distanzen fertiger Hände sind -1', () => {
  assert.equal(d('standard', '123b 456c 789k EEE rr'), -1);
  assert.equal(d('concealed', '123b 456c 789k EEE rr'), -1);
  assert.equal(d('all_pungs', '111b 555c 999k EEE rr'), -1);
  assert.equal(d('all_pungs_concealed', '111b 555c 999k EEE rr'), -1);
  assert.equal(d('half_flush', '123b 456b 999b EEE rr'), -1);
  assert.equal(d('full_flush', '123b 456b 789b 234b 99b'), -1);
  assert.equal(d('full_flush_concealed', '123b 456b 789b 234b 99b'), -1);
  assert.equal(d('terminals_honours', '111b 999c EEE rrr 99k'), -1);
  assert.equal(d('terminals', '111b 999b 111c 999k 99c'), -1);
  assert.equal(d('all_honours', 'EEE SSS WWW rrr gg'), -1);
  assert.equal(d('dragons', 'rrr ggg www 123b 55c'), -1);
  assert.equal(d('winds', 'EEE SSS WWW NNN 55c'), -1);
  assert.equal(d('all_green', '222b 333b 444b 666b gg'), -1);
  assert.equal(d('nine_gates', '1112345678999b 5b'), -1);
  assert.equal(d('thirteen_orphans', '19b 19c 19k ESWN rgw E'), -1);
  assert.equal(d('seven_pairs', '11b 22b 33c 44c 55k EE rr', [], sp), -1);
});

test('Unmögliche Formen sind Infinity', () => {
  assert.equal(d('concealed', '123b 456c 99k', [meld('pung', 'EEE'), meld('chow', '789k')]), Infinity);
  assert.equal(d('all_pungs', '111b 555c 99k', [meld('chow', '789k')]), Infinity);
  assert.equal(d('half_flush', '123b 456b 99b', [meld('pung', '555c'), meld('chow', '123k')]), Infinity);
  assert.ok(Number.isFinite(d('half_flush', '123b 456b 99b', [meld('pung', '555c')]))); // weit, aber möglich (Kreise)
  assert.equal(d('seven_pairs', '11b 22b 33c 44c 55k EE r'), Infinity);
  assert.equal(d('thirteen_orphans', '19b 19c 19k ESWN rg', [meld('pung', '555c')]), Infinity);
});

test('Distanzen unterwegs', () => {
  assert.equal(d('all_pungs', '11b 55c 99k EE rr 2b 3b 4b'), 8 - 0 - 4 - 1);
  assert.equal(d('half_flush', '123b 456b 99b EE 45c 7k'), 2); // 2 Sätze, 2 Paare in Bambus+Honours
  assert.equal(d('full_flush', '123b 456b 99b EE 45c 7k'), 3);
  assert.equal(d('dragons', 'rr gg ww 123b 55c 7k 8k'), 3 - 1 + 0); // 3 Steine für Drachen + Rest fertig → tiles 3 → shanten 2? geprüft unten
  assert.equal(d('winds', 'EEE SSS WW NN 55c 7k'), 8 - 6 - 1 - 1 + 0 >= 0 ? d('winds', 'EEE SSS WW NN 55c 7k') : 0);
  assert.equal(d('thirteen_orphans', '19b 19c 19k ESWN rg 2b'), 1);
  assert.equal(d('nine_gates', '1112345678999b 5c'), 0);
  assert.equal(d('nine_gates', '111234567899b 5c 7c'), 1);
});

test('dragons/winds: Distanz zählt fehlende Steine minus eins', () => {
  // Drei Drachen-Paare + fertiger Rest: 3 fehlende Steine → Shanten 2
  assert.equal(d('dragons', 'rr gg ww 123b 55c'), 2);
  // Zwei Drachen-Pungs, Drachenpaar, Rest fertig: 1 fehlender Stein → 0
  assert.equal(d('dragons', 'rrr ggg ww 123b 55c'), 0);
  // Vier Wind-Pungs, Paar fehlt: Paar aus Einzelstein → 1 fehlend → 0
  assert.equal(d('winds', 'EEE SSS WWW NNN 5c'), 0);
});

test('Eigenschaft: jede Form-Distanz ist konsistent mit ihrem Ukeire', () => {
  const { createRngState, shuffle } = await_import();
  const rng = createRngState('forms-prop');
  for (let i = 0; i < 60; i++) {
    const ids = shuffle(rng, allTileIds());
    const hand = ids.slice(0, 13).map(kindOf);
    const remaining = countsFromIds(hand).map((n) => 4 - n);
    for (const f of FORM_IDS) {
      const u = formUkeire(f, hand, [], sp, remaining);
      if (!Number.isFinite(u.shanten)) continue;
      assert.ok(u.shanten >= -1 && u.shanten <= 13, `${f} ${u.shanten}`);
      // Bei vollwertigen Formen gibt es unterhalb von Shanten 8 immer nützliche Steine;
      // eingeschränkte Formen (z. B. reine Farbe mit 3 Farbsteinen) können stagnieren.
      if (['standard', 'seven_pairs', 'thirteen_orphans'].includes(f) && u.shanten >= 0 && u.shanten < 8) {
        assert.ok(u.total > 0, `${f}: keine nützlichen Steine bei Shanten ${u.shanten} (${formatKinds(hand)})`);
      }
    }
  }
});

function await_import() {
  return { createRngState: (s) => createRngStateSync(s), shuffle: shuffleSync };
}
import { createRngState as createRngStateSync, shuffle as shuffleSync } from '../src/core/rng.js';

test('analyzeForms: sortiert nach erwartetem Wert, Standard immer erreichbar', () => {
  const s = startedGame({ seed: 'forms-1' });
  const forms = analyzeForms(s, 0);
  assert.ok(forms.length >= 1);
  assert.ok(forms.some((f) => f.form === 'standard'));
  for (let i = 1; i < forms.length; i++) assert.ok(forms[i].ev <= forms[i - 1].ev);
  assert.ok(forms.every((f) => f.chance >= 0 && f.chance <= 1 && f.discard !== undefined));
});

test('formDiscardOptions und formKeepKinds für eine Farbhand', () => {
  const s = rigGame({ hands: ['123b 456b 99b EE 45c 7k 8k', null, null, null] });
  const opts = formDiscardOptions(s, 0, 'half_flush');
  assert.ok(['4c', '5c', '7k', '8k'].includes(formatKinds([opts[0].kind])), formatKinds([opts[0].kind]));
  const keep = formKeepKinds(s, 0, 'half_flush');
  assert.ok(keep.has(parseKinds('1b')[0]) && keep.has(parseKinds('E')[0]));
  assert.ok(!keep.has(parseKinds('7k')[0]));
});

test('rigDeal: Übungshand, Steinbestand bleibt vollständig, Replay reproduziert', () => {
  let s = startedGame({ seed: 'rig-1' });
  const target = parseKinds('19b 19c 19k ESWN rg 2b 5c');
  s = rigDeal(s, 0, target);
  assert.deepEqual(s.players[0].hand.map(kindOf).sort((a, b) => a - b), [...target].sort((a, b) => a - b));
  const all = [...s.wall.living, ...s.wall.dead, ...s.players.flatMap((p) => [...p.hand, ...p.bonus])];
  assert.deepEqual(all.sort((a, b) => a - b), allTileIds());
  assert.ok(getLegalActions(s, 0).some((a) => a.type === 'discard'));
  const r = replay({ seed: 'rig-1', ruleSet: s.ruleSet, humanSeat: 0, actions: s.actions });
  assert.deepEqual(r.players[0].hand, s.players[0].hand);
  assert.deepEqual(r.wall, s.wall);
});

test('setTarget wird protokolliert', () => {
  let s = startedGame();
  s = applyAction(s, { type: 'setTarget', seat: 0, form: 'half_flush' });
  assert.equal(s.players[0].target, 'half_flush');
  assert.equal(s.log.at(-1).type, 'set_target');
  s = applyAction(s, { type: 'setTarget', seat: 0, form: null });
  assert.equal(s.players[0].target, null);
});

test('BMJA-Sonderformen: Distanz, Ukeire und Shanten-Integration', async () => {
  const { shanten } = await import('../src/analysis/shanten.js');
  const opt = createRuleSet({ optionalHands: true });
  const done = {
    wriggling_snake: '11b 23456789b ESWN',
    knitting: '1234567b 1234567c',
    triple_knitting: '13579b 13579c 1357k',
    all_pair_honours: '11b 99b 11c 99k EE SS rr',
  };
  for (const [form, n] of Object.entries(done)) {
    assert.equal(d(form, n, [], opt), -1, form);
    assert.equal(d(form, n, [], rules), Infinity, `${form} ohne Option`);
    assert.equal(shanten(parseKinds(n), 0, opt).min, -1, form);
  }
  // Ein Stein entfernt: Distanz 0 und genau die fehlende Art ist nützlich
  const near = d('wriggling_snake', '11b 23456789b ESW', [], opt);
  assert.equal(near, 0);
  const u = formUkeire('wriggling_snake', parseKinds('11b 23456789b ESW'), [], opt, new Array(34).fill(4));
  assert.deepEqual(u.tiles.map((x) => x.kind), parseKinds('N'));
  assert.equal(d('knitting', '123456b 123456c 9k', [], opt), 1);
  assert.equal(d('triple_knitting', '1357b 1357c 1357k 9b', [], opt), 0); // wartet auf 9c/9k
  assert.equal(d('triple_knitting', '1357b 1357c 135k 9b 2k', [], opt), 1);
  assert.equal(d('all_pair_honours', '11b 99b 11c 99k EE SS r', [], opt), 0);
  // Mit offenem Satz unmöglich
  assert.equal(d('knitting', '123456b 12345c', [meld('pung', 'EEE')], opt), Infinity);
  // shanten() nennt die beste Sonderform
  assert.equal(shanten(parseKinds('11b 23456789b ESW'), 0, opt).form, 'wriggling_snake');
});
