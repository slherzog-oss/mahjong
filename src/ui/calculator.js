// Score Calculator: Hand von Hand zusammenstellen und die Punktzahl berechnen.
import { t } from '../i18n/index.js';
import { NUM_KINDS, isSuited, rankOf } from '../core/tiles.js';
import { tileHtml } from './tiles.js';
import { scoreHand } from '../scoring/millington.js';
import { scoreHandHK } from '../scoring/hongkong.js';
import { scoreHandRiichi } from '../scoring/riichi.js';
import { sheetSummary, lineListHtml } from './render.js';

const MELD_TYPES = ['chow', 'pung', 'openKong', 'concealedKong'];

export function newCalcState() {
  return { concealed: [], melds: [], bonus: [], selfDraw: false, seatWind: 0, roundWind: 0, meldPicker: null, result: null, error: null };
}

export function usedCount(calc, kind) {
  let n = calc.concealed.filter((k) => k === kind).length;
  for (const m of calc.melds) n += m.kinds.filter((k) => k === kind).length;
  if (calc.bonus.includes(kind)) n += 1;
  return n;
}

export function scoreManualHand(calc, ruleSet) {
  const input = {
    concealed: calc.concealed, melds: calc.melds, bonus: calc.bonus,
    seatWind: calc.seatWind, roundWind: calc.roundWind,
    winner: true, winningKind: calc.concealed.at(-1) ?? null, selfDraw: calc.selfDraw,
  };
  if (ruleSet.variant === 'hongkong') return scoreHandHK(input, ruleSet);
  if (ruleSet.variant === 'riichi') return scoreHandRiichi(input, ruleSet);
  return scoreHand(input, ruleSet);
}

function tilePickerHtml(calc, { chowOnly = false } = {}) {
  const rows = [];
  for (let base = 0; base < 27; base += 9) {
    rows.push(`<div class="calc-picker-row">${Array.from({ length: 9 }, (_, i) => base + i).map((k) => pickerTile(calc, k, chowOnly)).join('')}</div>`);
  }
  rows.push(`<div class="calc-picker-row">${Array.from({ length: 7 }, (_, i) => 27 + i).map((k) => pickerTile(calc, k, chowOnly)).join('')}</div>`);
  return rows.join('');
}

function pickerTile(calc, kind, chowOnly) {
  const max = kind >= NUM_KINDS ? 1 : 4;
  const disabled = usedCount(calc, kind) >= max || (chowOnly && !(isSuited(kind) && rankOf(kind) <= 7));
  return `<button type="button" class="btn ghost" style="padding:0;border:0;min-height:0;background:none;${disabled ? 'opacity:.35;' : ''}" data-action="calc-pick" data-kind="${kind}" ${disabled ? 'disabled' : ''}>${tileHtml(kind)}</button>`;
}

function bonusPickerHtml(calc) {
  return `<div class="calc-picker-row">${Array.from({ length: 8 }, (_, i) => 34 + i).map((k) => pickerTile(calc, k, false)).join('')}</div>`;
}

function windSelect(dataAttr, value) {
  return `<select data-calc="${dataAttr}">${['E', 'S', 'W', 'N'].map((w, i) => `<option value="${i}" ${value === i ? 'selected' : ''}>${w}</option>`).join('')}</select>`;
}

export function renderCalculator(ui, snap) {
  const calc = ui.calc;
  const ruleSet = snap.state?.ruleSet ?? { ...snap.settings.rules };
  const meldTileCount = calc.melds.length * 3;
  const total = calc.concealed.length + meldTileCount;
  const canCalc = total === 14;

  const btnWrap = (inner, action, index) => `<button type="button" class="btn ghost" style="padding:0;border:0;min-height:0;background:none;" data-action="${action}" data-index="${index}">${inner}</button>`;
  const handHtml = `<div class="calc-hand">
    ${calc.concealed.map((k, i) => btnWrap(tileHtml(k), 'calc-remove', i)).join('')}
  </div>
  <div class="calc-melds">
    ${calc.melds.map((m, i) => btnWrap(`<span class="meld">${m.kinds.map((k) => tileHtml(k, { classes: 'small' })).join('')}</span>`, 'calc-remove-meld', i)).join('')}
  </div>
  <div class="calc-melds">
    ${calc.bonus.map((k, i) => btnWrap(tileHtml(k, { classes: 'small' }), 'calc-remove-bonus', i)).join('')}
  </div>`;

  const picker = calc.meldPicker
    ? `<div class="calc-picker">
        <p class="muted small">${t('calc.' + calc.meldPicker)}: ${t('calc.tapHint')}</p>
        ${tilePickerHtml(calc, { chowOnly: calc.meldPicker === 'chow' })}
        <button class="btn small" data-action="calc-meld-cancel">${t('back')}</button>
      </div>`
    : `<div class="calc-picker">
        ${tilePickerHtml(calc)}
        ${bonusPickerHtml(calc)}
      </div>`;

  const resultHtml = calc.result
    ? `<div class="calc-result">
        <div class="total">${calc.result.total}</div>
        ${sheetSummary(calc.result, ruleSet.variant ?? 'classical', { type: 'win' })}
        ${lineListHtml(calc.result)}
      </div>`
    : calc.error ? `<div class="calc-result muted">${calc.error}</div>` : '';

  return `
  <section class="screen calc-tab">
    <div class="calc-toolbar">
      <h2>${t('calc.title')}</h2>
      <button class="btn small" data-action="calc-clear">${t('calc.clear')}</button>
    </div>
    <div class="calc-hand-area">${handHtml}</div>
    <div class="calc-count${canCalc ? ' full' : ''}">${t('calc.tileCount', { n: total })}${canCalc ? '' : ' · ' + t('calc.requires14')}</div>
    <div class="calc-meld-btns">
      ${MELD_TYPES.map((mt) => `<button class="btn small" data-action="calc-meld-start" data-meld-type="${mt}">${t('calc.' + mt)}</button>`).join('')}
    </div>
    ${picker}
    <div class="calc-options">
      <label><input type="checkbox" data-calc="selfDraw" ${calc.selfDraw ? 'checked' : ''}> ${t('calc.selfDraw')}</label>
      <label>${t('calc.seatWind')} ${windSelect('seatWind', calc.seatWind)}</label>
      <label>${t('calc.roundWind')} ${windSelect('roundWind', calc.roundWind)}</label>
      <button class="btn small" data-action="calc-remove-last">${t('calc.removeLast')}</button>
    </div>
    <button class="btn primary" data-action="calc-calculate" ${canCalc ? '' : 'disabled'}>${t('calc.calculate')}</button>
    ${resultHtml}
  </section>`;
}

export function calcMeldKinds(type, kind) {
  if (type === 'chow') return [kind, kind + 1, kind + 2];
  return [kind, kind, kind];
}

export function calcMeldOpen(type) {
  return type !== 'concealedKong';
}

export { MELD_TYPES };
