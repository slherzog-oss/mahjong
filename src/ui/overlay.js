// Overlays: "Choose an action" (Beanspruchen) und das Rundenende (Mahjong!/Unentschieden).
import { kindOf, KIND_NAMES, sortTiles } from '../core/tiles.js';
import { tileHtml, tileHtmlById } from './tiles.js';
import { t } from '../i18n/index.js';
import { playerName, sheetSummary, lineListHtml, esc } from './render.js';

function optTilesHtml(kinds) {
  return `<span class="opt-tiles">${kinds.map((k) => tileHtml(k, { classes: 'small' })).join('')}</span>`;
}

/** "Choose an action"-Overlay für die Beanspruchen-Phase (Pung/Chow/Kong/Mahjong/Pass). */
export function renderActionSheet(state, snap, legal) {
  const src = state.pendingKong ? state.pendingKong.seat : state.lastDiscard?.seat;
  const claimKind = state.pendingKong ? state.pendingKong.kind : (state.lastDiscard ? kindOf(state.lastDiscard.tile) : null);
  const status = src !== undefined && claimKind !== null
    ? t('claimingHint', { name: playerName(state, src, snap.humanSeat), tile: KIND_NAMES[claimKind] })
    : '';
  const opts = [];
  for (const a of legal) {
    switch (a.type) {
      case 'mahjong':
        opts.push({ action: 'mahjong', label: t('mahjong'), tiles: claimKind !== null ? [claimKind] : [], primary: true });
        break;
      case 'pung':
        opts.push({ action: 'pung', label: t('pung'), tiles: claimKind !== null ? [claimKind, claimKind, claimKind] : [], primary: true });
        break;
      case 'kong':
        if (a.variant === 'open') opts.push({ action: 'kong', data: 'data-variant="open"', label: t('kong'), tiles: claimKind !== null ? [claimKind, claimKind, claimKind, claimKind] : [], primary: true });
        break;
      case 'chow':
        opts.push({ action: 'chow', data: `data-kinds="${a.kinds.join(',')}"`, label: t('chow'), tiles: a.kinds, primary: true });
        break;
      case 'pass':
        opts.push({ action: 'pass', label: t('pass') });
        break;
      default: break;
    }
  }
  const optHtml = (o) => `
    <button class="action-opt${o.primary ? ' primary' : ' pass'}" data-action="${o.action}" ${o.data ?? ''}>
      ${o.tiles?.length ? optTilesHtml(o.tiles) : ''}
      <span class="opt-label">${o.label}</span>
    </button>`;
  const advise = snap.settings.assist ? `<button class="action-opt" data-action="advise">${t('advisor')}</button>` : '';
  return `
  <div class="action-sheet-wrap">
    <div class="action-sheet" role="dialog" aria-modal="true">
      <h3>${t('actionOverlay.title')}</h3>
      <p class="status">${status}</p>
      <div class="action-opt-list">${opts.map(optHtml).join('')}${advise}</div>
    </div>
  </div>`;
}

function transferLines(payments, state, humanSeat) {
  const rows = [];
  for (let from = 0; from < 4; from++) {
    for (let to = 0; to < 4; to++) {
      const v = payments?.[from]?.[to] ?? 0;
      if (v > 0) rows.push({ from, to, v });
    }
  }
  if (!rows.length) return '';
  return `
  <div class="re-settlement">
    <h4>${t('roundEnd.settlement')}</h4>
    ${rows.map((r) => `
      <div class="re-transfer">
        <span>${esc(playerName(state, r.from, humanSeat))}</span>
        <span class="arrow">→</span>
        <span>${esc(playerName(state, r.to, humanSeat))}</span>
        <b>${r.v} ${t('roundEnd.pointsUnit')}</b>
      </div>`).join('')}
  </div>`;
}

/** Rundenende (Mahjong!/Unentschieden) als Akkordeon-Overlay über dem Tisch. */
export function renderRoundEnd(snap, ui) {
  const { state, humanSeat, lastScore } = snap;
  const r = state.result ?? {};
  const variant = state.ruleSet.variant ?? 'classical';
  const isDraw = r.type === 'draw' || !r.type;
  const gameOver = state.phase === 'gameOver';

  let sub = '';
  if (isDraw) sub = variant === 'riichi' ? t('drawGameRiichi') : t('drawGame');
  else {
    const w = playerName(state, r.winner, humanSeat);
    const how = r.selfDraw ? t('selfDraw') : `${t('fromDiscard')} ${playerName(state, r.from, humanSeat)}`;
    sub = t('roundEnd.winsSuffix', { name: w }) + ` (${how})`;
  }

  let warn = '';
  if (r.dangerousGame) warn = `<p class="round-end-warn">${esc(t('dangerousGame', { name: playerName(state, r.from, humanSeat) }))}</p>`;
  if (variant === 'riichi' && lastScore?.doraKinds?.length) {
    const ura = r.type === 'win' && state.players[r.winner]?.riichi && lastScore.uraKinds?.length ? ` · Ura ${lastScore.uraKinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('')}` : '';
    warn += `<p class="round-end-warn">${t('dora')} ${lastScore.doraKinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('')}${ura}${r.honba ? ` · ${t('honba')} ${r.honba}` : ''}${r.riichiSticks ? ` · ${t('sticks')} ${r.riichiSticks}` : ''}</p>`;
  }
  const note = snap.settings.disablePointTracking ? `<p class="re-note">${t('roundEnd.noTrackingNote')}</p>` : '';

  const sheets = lastScore?.sheets;
  const openSet = ui.roundEndOpen instanceof Set ? ui.roundEndOpen : new Set();
  const rows = state.players.map((p, i) => {
    const sh = sheets?.[i];
    const open = openSet.has(i);
    const hand = [...p.melds.flatMap((m) => m.tiles), ...sortTiles(p.hand)];
    const net = lastScore?.net?.[i] ?? 0;
    return `
    <div class="re-row${sh?.winner ? ' winner' : ''}">
      <button class="re-row-head" data-action="round-end-toggle" data-seat="${i}">
        <span class="rname">${esc(playerName(state, p.seat, humanSeat))}</span>
        <span>${sheetSummary(sh, variant, r)}</span>
        <span class="rscore-net ${net >= 0 ? 'pos' : 'neg'}">${lastScore ? (net >= 0 ? '+' : '') + net : ''}</span>
        <span class="rscore-total">${p.score}</span>
        <span class="chev">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="re-row-body">
        <div class="sheet-hand">${hand.map((id) => tileHtmlById(id, { classes: 'small' })).join('')}</div>
        ${lineListHtml(sh)}
      </div>` : ''}
    </div>`;
  }).join('');

  const settlement = transferLines(lastScore?.payments, state, humanSeat);

  return `
  <div class="round-end-wrap">
    <div class="round-end" role="dialog" aria-modal="true">
      <div class="round-end-head">
        <h2>${isDraw ? t('roundEnd.drawTitle') : t('roundEnd.mahjongTitle')}</h2>
        <p class="sub">${esc(sub)}</p>
      </div>
      ${warn}
      ${note}
      <div class="re-players">${rows}</div>
      ${settlement}
      ${gameOver ? `<ol class="ranking">${[...state.players].sort((a, b) => b.score - a.score).map((p) => `<li><span>${esc(playerName(state, p.seat, humanSeat))}</span><b>${p.score}</b></li>`).join('')}</ol>` : ''}
      <div class="stack">
        ${gameOver
          ? `<button class="btn primary" data-action="analysis-current">${t('analyze')}</button>`
          : `<button class="btn primary" data-action="next-hand">${t('roundEnd.continueBtn')}</button>`}
        <button class="btn" data-action="quit">${t('roundEnd.saveExit')}</button>
      </div>
    </div>
  </div>`;
}
