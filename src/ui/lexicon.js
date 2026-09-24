// Lexikon-Bildschirm und Formen-Panel ("Mögliche Blätter").
import { parseKinds, KIND_NAMES } from '../core/tiles.js';
import { fullLexicon, categoriesFor, VARIANTS } from '../lexicon/hands.js';
import { SCORE_RULES } from '../scoring/table.js';
import { HK_FANS } from '../scoring/hongkong.js';
import { RIICHI_YAKU } from '../scoring/riichi.js';
import { tileHtml } from './tiles.js';
import { t, getLanguage } from '../i18n/index.js';

const L = (obj) => (obj ? (obj[getLanguage()] ?? obj.de ?? '') : '');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function worth(entry) {
  if (!entry.rule) return '';
  if (entry.variant === 'hongkong') {
    const f = HK_FANS[entry.rule];
    return f ? `${f.value} ${t('fan')}` : '';
  }
  if (entry.variant === 'riichi') {
    const y = RIICHI_YAKU[entry.rule];
    if (!y) return '';
    if (y.yakuman) return t('yakuman');
    if (y.dora) return `1 ${t('han')}`;
    return y.han[1] === null ? `${y.han[0]} ${t('han')}` : `${y.han[0]}/${y.han[1]} ${t('han')}`;
  }
  const r = SCORE_RULES[entry.rule];
  if (!r) return '';
  if (r.kind === 'points') return `${r.value} ${t('points')}`;
  if (r.kind === 'double') return `${r.value} × 2`;
  return t('limitHand');
}

/** Name einer Zielform in der jeweiligen Variante. */
export function formName(id, variant = 'classical') {
  const names = variant === 'riichi' ? t('forms.riichiNames') : variant === 'hongkong' ? t('forms.hongkongNames') : null;
  return (names && typeof names === 'object' && names[id]) || t('forms.names')[id] || id;
}

export function lexiconEntries({ query = '', category = 'all', variant = 'classical' } = {}) {
  const q = query.trim().toLowerCase();
  return fullLexicon(variant).filter((e) => (category === 'all' || e.category === category))
    .filter((e) => !q || [e.name.de, e.name.en, e.text.de, e.text.en ?? '', e.tip?.de ?? '', e.tip?.en ?? ''].join(' ').toLowerCase().includes(q));
}

export function renderLexicon(ui) {
  const variant = ui.lexicon.variant ?? 'classical';
  const entries = lexiconEntries({ ...ui.lexicon, variant });
  const cat = ui.lexicon.category;
  const variantChips = VARIANTS.map((v) => `<button class="chip${variant === v ? ' active' : ''}" data-action="lexicon-variant" data-variant="${v}">${t('variants.' + v)}</button>`).join('');
  const chips = ['all', ...categoriesFor(variant)].map((c) => `<button class="chip${cat === c ? ' active' : ''}" data-action="lexicon-filter" data-category="${c}">${t('lex.' + c)}</button>`).join('');
  const cards = entries.map((e) => {
    const open = ui.lexicon.open === e.id;
    const example = e.example ? `<div class="lex-example">${parseKinds(e.example).map((k) => tileHtml(k, { classes: 'small' })).join('')}</div>` : '';
    return `
    <article class="lex-card${open ? ' open' : ''}" data-id="${e.id}">
      <button class="lex-head" data-action="lexicon-toggle" data-id="${e.id}" aria-expanded="${open}">
        <span class="lex-name">${esc(L(e.name))} <span class="muted small">${esc(getLanguage() === 'de' ? e.name.en : e.name.de)}</span></span>
        <span class="lex-worth">${worth(e)}</span>
        <span class="lex-rarity" title="${t('lex.rarity')}">${'●'.repeat(e.rarity)}${'○'.repeat(5 - e.rarity)}</span>
      </button>
      ${open ? `<div class="lex-body">
        <p>${esc(L(e.text))}</p>
        ${example}
        ${e.tip ? `<p class="lex-tip"><b>${t('lex.tip')}:</b> ${esc(L(e.tip))}</p>` : ''}
        <p class="muted small">${e.standard ? (e.variant === 'classical' ? t('lex.standard') : t('lex.standardGeneric')) : t('lex.optional')}</p>
        ${e.example ? `<button class="btn small primary" data-action="practice" data-id="${e.id}">${t('lex.practice')}</button>` : ''}
      </div>` : ''}
    </article>`;
  }).join('');
  return `
  <section class="screen lexicon">
    <header class="topbar">
      <button class="btn small" data-action="lexicon-close">${t('back')}</button>
      <h2>${t('lex.title')}</h2>
      <span></span>
    </header>
    <div class="lex-tools">
      <input type="search" class="search" placeholder="${t('lex.search')}" value="${esc(ui.lexicon.query)}" data-action="lexicon-search" aria-label="${t('lex.search')}">
      <div class="chips variants">${variantChips}</div>
      <div class="chips">${chips}</div>
    </div>
    <div class="lex-list">${cards || `<p class="muted">${t('lex.empty')}</p>`}</div>
  </section>`;
}

/** Panel "Mögliche Blätter": Formen mit Chance, Wert, Erwartung, Zielwahl. */
export function renderFormsPanel(forms, { target, expanded, showKinds, variant = 'classical' }) {
  const lex = fullLexicon(variant);
  const rows = forms.slice(0, 7).sort((a, b) => b.chance - a.chance).map((f) => {
    const name = formName(f.form, variant);
    const active = target === f.form;
    const pct = Math.round(f.chance * 100);
    const dist = f.shanten < 0 ? t('complete') : f.shanten === 0 ? t('ready') : t('forms.away', { n: f.shanten + 1 });
    const entry = lex.find((e) => e.form === f.form && e.text) ?? lex.find((e) => e.id === f.lexicon);
    const desc = entry ? String(L(entry.text)).split(/(?<=[.!?])\s/)[0] : '';
    return `
    <div class="form-row${active ? ' active' : ''}${showKinds === f.form ? ' selected' : ''}" data-action="form-select" data-form="${f.form}">
      <div class="form-bar" style="--pct:${pct}%"></div>
      <span class="form-name">${esc(name)}</span>
      <span class="form-stats"><b>${pct} %</b> ${t('forms.chance')} · ${dist} · ${f.ukeire} ${t('forms.useful')} · ${t('forms.value')} ${f.value}</span>
      ${desc ? `<span class="form-desc">${esc(desc)}</span>` : ''}
      <button class="btn tiny${active ? ' primary' : ''}" data-action="${active ? 'clear-target' : 'set-target'}" data-form="${f.form}">${active ? t('forms.targetActive') : t('forms.target')}</button>
    </div>`;
  }).join('');
  return `
  <details class="forms" ${expanded ? 'open' : ''}>
    <summary>${t('forms.title')}${target ? ` · ${t('forms.targetActive')}: ${esc(formName(target, variant))}` : ''}</summary>
    <div class="form-list">${rows}</div>
    <p class="muted small">${t('forms.hint')}</p>
  </details>`;
}
