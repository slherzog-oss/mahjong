// Analyse-Bildschirm: Partienliste, Zusammenfassung, Chancen-Kurve, Entscheidungen.
import { KIND_NAMES } from '../core/tiles.js';
import { tileHtml } from './tiles.js';
import { t, getLanguage } from '../i18n/index.js';
import { CLASSES } from '../replay/analyzer.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round((x ?? 0) * 100)} %`;
const fmtDate = (ms) => new Date(ms).toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function renderAnalysisList(ui) {
  const { games, current } = ui.analysis;
  const rows = (games ?? []).map((g) => `
    <button class="btn row-btn" data-action="analysis-open" data-id="${esc(g.id)}">
      <span>${fmtDate(g.finishedAt)} · ${g.hands} ${t('hand')}${g.hands === 1 ? '' : (getLanguage() === 'de' ? 'e' : 's')}</span>
      <span class="muted">${g.scores.map((s, i) => (i === g.humanSeat ? `<b>${s}</b>` : s)).join(' · ')}</span>
    </button>`).join('');
  return `
  <section class="screen analysis">
    <header class="topbar">
      <button class="btn small" data-action="analysis-close">${t('back')}</button>
      <h2>${t('ana.title')}</h2>
      <span></span>
    </header>
    <div class="ana-body">
      ${current ? `<button class="btn primary" data-action="analysis-current">${t('ana.current')}</button>` : ''}
      <h3>${t('ana.archive')}</h3>
      ${rows || `<p class="muted">${t('ana.empty')}</p>`}
    </div>
  </section>`;
}

function curveSvg(curve, decisions, selectedIndex) {
  if (!curve.length) return '';
  const w = 600, h = 120, padL = 28, padB = 18, padT = 8;
  const n = curve.length;
  const x = (i) => padL + (i / Math.max(1, n - 1)) * (w - padL - 8);
  const y = (c) => padT + (1 - c) * (h - padT - padB);
  const pts = curve.map((c, i) => `${x(i).toFixed(1)},${y(c.chance).toFixed(1)}`).join(' ');
  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const marks = curve.map((c, i) => {
    const d = byIndex.get(c.index);
    if (!d || d.cls === 'ok' || d.trivial) return '';
    return `<circle class="mark ${d.cls}${selectedIndex === d.index ? ' sel' : ''}" cx="${x(i).toFixed(1)}" cy="${y(c.chance).toFixed(1)}" r="5" data-action="analysis-decision" data-index="${d.index}"><title>${t('ana.cls.' + d.cls)}</title></circle>`;
  }).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => `<line x1="${padL}" x2="${w - 8}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="2" y="${y(g) + 4}" class="axis">${Math.round(g * 100)}</text>`).join('');
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('ana.curve')}">${grid}<polyline points="${pts}" class="line"/>${marks}</svg>`;
}

function decisionRow(d, selected) {
  const cls = d.trivial ? 'trivial' : d.cls;
  let what;
  if (d.type === 'claim') {
    what = `${t('ana.claim')}: ${t(d.chosen === 'pass' ? 'pass' : d.chosen)}${d.chosen !== d.best ? ` → ${t(d.best === 'pass' ? 'pass' : d.best)}` : ''}`;
  } else if (d.type === 'mahjong') {
    what = t('mahjong');
  } else if (d.type === 'kong') {
    what = `${t('kong')} ${KIND_NAMES[d.chosen]}`;
  } else {
    what = `${d.type === 'riichi' ? t('riichi') + ' ' : ''}${tileHtml(d.chosen, { classes: 'tiny' })}${d.chosen !== d.best ? ` → ${tileHtml(d.best, { classes: 'tiny' })}` : ''}`;
  }
  return `<button class="dec ${cls}${selected ? ' sel' : ''}" data-action="analysis-decision" data-index="${d.index}">
    <span class="dec-turn">${t('ana.turn')} ${d.turn}</span>
    <span class="dec-what">${what}</span>
    <span class="dec-cls">${d.trivial ? '' : t('ana.cls.' + d.cls)}</span>
  </button>`;
}

function decisionDetail(d) {
  if (!d) return '';
  const hand = d.kinds.slice().sort((a, b) => a - b).map((k) => tileHtml(k, { classes: 'small' + (k === d.chosen ? ' chosen' : '') + (k === d.best && d.best !== d.chosen ? ' bestmark' : '') })).join('');
  const melds = d.melds.map((m) => `<span class="meld">${m.kinds.map((k) => tileHtml(k, { classes: 'small' })).join('')}</span>`).join('');
  let body = '';
  if (d.type === 'discard') {
    body = `
      <p>${t('ana.chosen')}: ${tileHtml(d.chosen, { classes: 'tiny' })} ${KIND_NAMES[d.chosen]} · ${t('shanten')} ${d.chosenShanten} · ${d.chosenUkeire} ${t('tilesLeft')} · ${pct(d.chosenChance)} · ${t('danger')} ${pct(d.chosenDanger)}</p>
      ${d.chosen !== d.best ? `<p>${t('ana.best')}: ${tileHtml(d.best, { classes: 'tiny' })} ${KIND_NAMES[d.best]} · ${t('shanten')} ${d.bestShanten} · ${d.bestUkeire} ${t('tilesLeft')} · ${pct(d.bestChance)} · ${t('danger')} ${pct(d.bestDanger)}</p>` : `<p class="ok">${t('ana.bestChoice')}</p>`}
      <p class="muted small">${t('ana.loss')}: ${pct(d.delta)}</p>`;
  } else if (d.type === 'claim') {
    body = `<p>${t('ana.called')}: ${tileHtml(d.calledKind, { classes: 'tiny' })} · ${t('ana.chosen')}: ${t(d.chosen === 'pass' ? 'pass' : d.chosen)} · ${t('ana.best')}: ${t(d.best === 'pass' ? 'pass' : d.best)} (${t('shanten')} ${d.before} → ${d.after})</p>`;
  } else {
    body = `<p>${t('ana.cls.ok')}</p>`;
  }
  return `<div class="dec-detail">
    <div class="sheet-hand">${melds}${hand}</div>
    ${body}
  </div>`;
}

export function renderAnalysis(ui) {
  const { result, hand: handNo, decision } = ui.analysis;
  const s = result.summary;
  const hands = result.hands;
  const h = hands.find((x) => x.hand === handNo) ?? hands[0];
  const sel = h?.decisions.find((d) => d.index === decision) ?? null;
  const tabs = hands.map((x) => {
    const r = x.result;
    const won = r?.type === 'win' && r.winner === result.seat;
    const lost = r?.type === 'win' && r.from === result.seat;
    return `<button class="chip${x.hand === h.hand ? ' active' : ''}${won ? ' won' : lost ? ' lost' : ''}" data-action="analysis-hand" data-hand="${x.hand}">${t('hand')} ${x.hand}</button>`;
  }).join('');
  const bars = CLASSES.map((c) => `<span class="stat ${c}"><b>${s[c]}</b> ${t('ana.cls.' + c)}</span>`).join('');
  return `
  <section class="screen analysis">
    <header class="topbar">
      <button class="btn small" data-action="analysis-list">${t('back')}</button>
      <h2>${t('ana.title')}</h2>
      <span></span>
    </header>
    <div class="ana-body">
      <div class="ana-summary">
        <div class="accuracy"><b>${pct(s.accuracy)}</b> ${t('ana.accuracy')}</div>
        <div class="stats">${bars}</div>
        <p class="muted small">${t('ana.summaryHint', { n: s.decisions, trivial: s.trivial })}</p>
      </div>
      <div class="chips">${tabs}</div>
      ${h ? `
        <p class="muted">${handResult(h, result.seat)}</p>
        ${curveSvg(h.curve, h.decisions, decision)}
        <div class="dec-list">${h.decisions.map((d) => decisionRow(d, d.index === decision)).join('')}</div>
        ${decisionDetail(sel)}
      ` : ''}
    </div>
  </section>`;
}

function handResult(h, seat) {
  const r = h.result;
  if (!r) return '';
  if (r.type === 'draw') return t('drawGame');
  if (r.winner === seat) return t('ana.youWon');
  if (r.from === seat) return t('ana.youDealtIn', { seat: t('playerNames')[r.winner] });
  return t('ana.otherWon', { seat: t('playerNames')[r.winner] });
}
