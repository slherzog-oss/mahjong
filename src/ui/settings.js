// Einstellungen-Tab: Spiel, Punktesystem, Mehrspieler, Darstellung, Feedback,
// sowie unsere Extras (Sprache, KI, Coach/Lernmodus) unaufdringlich am Ende.
import { t, LANGUAGES } from '../i18n/index.js';
import { RULE_PRESETS, VARIANT_FIELDS } from '../core/presets.js';
import { VARIANTS } from '../core/rules.js';
import { esc } from './render.js';

const MAT_COLORS = { green: '#1e5b34', red: '#7a2020', blue: '#1d3b6b', black: '#1c1c1e', purple: '#4a2467', brown: '#4a3320' };
const TILE_COLORS = { yellow: '#f5efe0', blue: '#e3ecf7', gray: '#e6e6ea', green: '#e6f2e6', pink: '#f7e6ec', purple: '#ece0f5' };
export const GAME_SPEEDS = [
  { id: 'extraSlow', ms: 1200 }, { id: 'slow', ms: 700 }, { id: 'normal', ms: 450 }, { id: 'fast', ms: 200 }, { id: 'fastest', ms: 0 },
];

const toggleAttr = (attr, key, checked) => `<label class="toggle"><input type="checkbox" ${attr}="${key}" ${checked ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></label>`;
const toggle = (key, checked) => toggleAttr('data-setting', key, checked);
const ruleToggle = (key, checked) => toggleAttr('data-rule', key, checked);
const row = (label, control, hint = '') => `<div class="settings-row"><span class="s-label">${label}${hint ? `<span class="s-hint">${hint}</span>` : ''}</span>${control}</div>`;
const segmented = (settingKey, value, opts) => `<div class="segmented">${opts.map((o) => `<button type="button" class="${value === o.id ? 'active' : ''}" data-action="set-setting" data-setting="${settingKey}" data-value="${o.id}">${o.label}</button>`).join('')}</div>`;
const group = (title, cardHtml) => `<div class="settings-group"><h3>${title}</h3><div class="settings-card">${cardHtml}</div></div>`;

function speedRow(settings) {
  const cur = GAME_SPEEDS.find((s) => s.ms === settings.aiDelayMs)?.id ?? 'normal';
  const opts = GAME_SPEEDS.map((s) => ({ id: s.id, label: t('settings2.gameSpeeds')[s.id] }));
  return row(t('settings2.gameSpeed'), `<div class="segmented" data-speed>${opts.map((o) => `<button type="button" class="${cur === o.id ? 'active' : ''}" data-action="set-speed" data-value="${o.id}">${o.label}</button>`).join('')}</div>`);
}

function ruleSelect(key, values, s, labelFn) {
  return `<select data-rule="${key}">${values.map((v) => `<option value="${v}" ${String(s.rules[key]) === String(v) ? 'selected' : ''}>${labelFn(v)}</option>`).join('')}</select>`;
}

/** Erweiterte Regelfelder je Variante, die nicht schon prominent gezeigt werden. */
function advancedRuleFields(variant) {
  const prominent = { classical: ['roundUpBeforeDoubling', 'settleOnDraw'], hongkong: ['minFan', 'maxFan', 'hkConversion', 'hkDealerDouble'], riichi: [] };
  return (VARIANT_FIELDS[variant] ?? []).filter((k) => !(prominent[variant] ?? []).includes(k));
}

function advancedRuleRow(key, s) {
  const label = t('rule.' + key) !== 'rule.' + key ? t('rule.' + key) : t(key);
  const selects = { limit: [500, 1000], deadWallSize: [14, 16], maxChows: [1, 2, 4], startScore: startScoresFor(s.rules.variant), hkPayment: ['half', 'full'] };
  if (selects[key]) {
    const optLabel = (v) => (key === 'hkPayment' ? t('hkPayments.' + v) : v);
    return row(label, ruleSelect(key, selects[key], s, optLabel));
  }
  return row(label, ruleToggle(key, s.rules[key]));
}

function startScoresFor(variant) {
  return variant === 'riichi' ? [0, 25000, 30000] : variant === 'hongkong' ? [0, 500, 1000, 2000] : [0, 1000, 2000, 5000];
}

function scoringSystemGroup(s) {
  const variant = s.rules.variant ?? 'classical';
  const presetOpts = [...Object.keys(RULE_PRESETS), 'custom'].filter((p) => p === 'custom' || (RULE_PRESETS[p].variant ?? 'classical') === variant);
  let card = row(t('variant'), `<select data-rule="variant">${VARIANTS.map((v) => `<option value="${v}" ${variant === v ? 'selected' : ''}>${t('variants.' + v)}</option>`).join('')}</select>`);
  card += row(t('preset'), `<select data-action="preset">${presetOpts.map((p) => `<option value="${p}" ${s.preset === p ? 'selected' : ''}>${t('presets.' + p)}</option>`).join('')}</select>`);
  card += row(t('settings2.disablePointTracking'), toggle('disablePointTracking', s.disablePointTracking), t('settings2.disablePointTrackingHint'));
  let out = group(t('settings2.scoringSystem'), card);

  if (variant === 'hongkong') {
    let hk = row(t('settings2.faanMinimum'), ruleSelect('minFan', [0, 1, 3], s, (v) => t('settings2.faanMinimumOpts')[v] ?? v));
    hk += row(t('settings2.faanLimit'), ruleSelect('maxFan', [5, 8, 10, 13], s, (v) => v));
    hk += row(t('settings2.conversionTable'), ruleSelect('hkConversion', ['simplified', 'standard', 'uncapped'], s, (v) => t('settings2.conversionOpts')[v]), t('settings2.conversionHint')[s.rules.hkConversion] ?? '');
    hk += row(t('settings2.dealerPaysEarnsDouble'), ruleToggle('hkDealerDouble', s.rules.hkDealerDouble), t('settings2.dealerPaysEarnsDoubleHint'));
    out += group(t('settings2.hongkongSettings'), hk);
  } else if (variant === 'classical') {
    let cc = row(t('settings2.roundUpBeforeDoubling'), ruleToggle('roundUpBeforeDoubling', s.rules.roundUpBeforeDoubling), t('settings2.roundUpBeforeDoublingHint'));
    cc += row(t('settings2.settleOnDraw'), ruleToggle('settleOnDraw', s.rules.settleOnDraw), t('settings2.settleOnDrawHint'));
    out += group(t('settings2.classicalSettings'), cc);
  }

  const advanced = advancedRuleFields(variant);
  if (advanced.length) {
    out += `<div class="settings-group"><details class="settings-card"><summary style="cursor:pointer;padding:12px 14px;">${t('rules')}</summary>${advanced.map((k) => advancedRuleRow(k, s)).join('')}</details></div>`;
  }
  return out;
}

function appearanceGroup(s) {
  let card = row(t('settings2.theme'), segmented('theme', s.theme, ['system', 'light', 'dark'].map((id) => ({ id, label: t('settings2.themes')[id] }))));
  card += `<div class="settings-row stacked"><span class="s-label">${t('settings2.matColor')}</span><div class="swatches">${Object.entries(MAT_COLORS).map(([id, color]) => `<button type="button" class="swatch${s.matColor === id ? ' active' : ''}" style="background:${color}" data-action="set-setting" data-setting="matColor" data-value="${id}" title="${t('settings2.matColors')[id]}"></button>`).join('')}</div></div>`;
  card += `<div class="settings-row stacked"><span class="s-label">${t('settings2.tileAppearance')}</span><div class="swatches">${Object.entries(TILE_COLORS).map(([id, color]) => `<button type="button" class="swatch${s.tileColor === id ? ' active' : ''}" style="background:${color};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2)" data-action="set-setting" data-setting="tileColor" data-value="${id}" title="${t('settings2.tileColors')[id]}"></button>`).join('')}</div></div>`;
  card += row('', segmented('tileShape', s.tileShape, ['round', 'sharp'].map((id) => ({ id, label: t('settings2.tileShapes')[id] }))));
  card += row(t('settings2.numeralsLabel'), segmented('numerals', s.numerals, ['arabic', 'chinese'].map((id) => ({ id, label: t('settings2.numeralsOpts')[id] }))));
  card += row(t('settings2.discardSizeLabel'), segmented('discardSize', s.discardSize, ['normal', 'large'].map((id) => ({ id, label: t('settings2.discardSizes')[id] }))));
  card += row(t('settings2.showWall'), toggle('showWall', s.showWall));
  card += row(t('settings2.showOpponentConcealed'), toggle('showOpponentConcealed', s.showOpponentConcealed), t('settings2.showOpponentConcealedHint'));
  return group(t('settings2.appearance'), card);
}

function extrasGroup(s) {
  let card = row(t('assist'), toggle('assist', s.assist));
  card += row(t('forms.chance'), toggle('showChance', s.showChance));
  card += row(t('forms.title'), toggle('showForms', s.showForms));
  card += row(t('learnMode'), toggle('learnMode', s.learnMode), t('learnModeHint'));
  card += row(t('animations'), toggle('animations', s.animations));
  return group(t('assist'), card);
}

function playersGroup(s) {
  let card = row(t('language'), `<select data-setting="language">${LANGUAGES.map((l) => `<option value="${l.id}" ${s.language === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`);
  card += row(t('difficulty'), `<select data-setting="difficulty">${['easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${t('difficulties.' + d)}</option>`).join('')}</select>`);
  card += row(t('rounds'), `<select data-setting="rounds">${[1, 2, 4].map((r) => `<option value="${r}" ${s.rounds === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`);
  card += `<div class="settings-row stacked"><span class="s-label">${t('playerNamesLabel')}</span><div class="re-names">${s.playerNames.map((n, i) => `<input type="text" maxlength="12" value="${esc(n)}" data-player-name="${i}" aria-label="${t('playerNamesLabel')} ${i + 1}">`).join('')}</div></div>`;
  card += `<p class="s-hint" style="padding:0 14px 12px;margin:0;">${t('aiFair')}</p>`;
  return group(t('language'), card);
}

function aboutGroup(snap) {
  let card = `<div class="settings-row"><button class="btn small" data-action="tutorial-start">${t('tutorialAgain')}</button></div>`;
  card += `<div class="settings-row"><button class="btn small" data-action="export">${t('exportGame')}</button><button class="btn small" data-action="import">${t('importGame')}</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>`;
  if (snap.pwa?.canInstall) card += `<div class="settings-row"><button class="btn small" data-action="install">${t('install')}</button></div>`;
  card += row(t('version'), `<span class="muted">${snap.pwa?.version ? snap.pwa.version : '0.1'}</span>`);
  return group(t('settings'), card);
}

export function renderSettingsTab(snap) {
  const s = snap.settings;
  let gameplay = speedRow(s);
  gameplay += row(t('settings2.skipDealAnimation'), toggle('skipDealAnimation', s.skipDealAnimation));
  gameplay += row(t('settings2.highlightMatchingTiles'), toggle('highlightMatchingTiles', s.highlightMatchingTiles));
  const html = `
  <section class="screen settings-tab">
    <div class="guide-header"><h2>${t('settings')}</h2></div>
    ${group(t('settings2.gameplay'), gameplay)}
    ${scoringSystemGroup(s)}
    ${group(t('settings2.multiplayer'), row(t('settings2.allowReconnect'), toggle('allowReconnectAfterAIReplacement', s.allowReconnectAfterAIReplacement), t('settings2.allowReconnectHint')))}
    ${appearanceGroup(s)}
    ${group(t('settings2.feedback'), row(t('settings2.haptics'), toggle('haptics', s.haptics)) + row(t('settings2.soundEffects'), toggle('soundEffects', s.soundEffects)))}
    ${extrasGroup(s)}
    ${playersGroup(s)}
    ${aboutGroup(snap)}
  </section>`;
  return html;
}
