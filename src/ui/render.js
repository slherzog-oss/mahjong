// Rendering: Zustand → HTML. Reine Funktionen, Ereignisse per Delegation in app.js.
import { kindOf, sortTiles, KIND_NAMES } from '../core/tiles.js';
import { seatWind, seatsToAct } from '../core/state.js';
import { tileHtml, tileHtmlById, backHtml } from './tiles.js';
import { t } from '../i18n/de.js';
import { ruleLabel } from '../scoring/table.js';
import { shanten } from '../analysis/shanten.js';
import { ukeire, visibleCounts, remainingCounts } from '../analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../analysis/probability.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderStart(snap) {
  const s = snap.settings;
  return `
  <section class="screen start">
    <h1>${t('appName')}</h1>
    <p class="muted">${t('subtitle')}</p>
    <div class="stack">
      <button class="btn primary" data-action="new-game">${t('newGame')}</button>
      ${snap.hasSave ? `<button class="btn" data-action="resume">${t('resume')}</button>` : ''}
      <div class="row">
        <button class="btn small" data-action="import">${t('importGame')}</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    </div>
    <details class="settings">
      <summary>${t('settings')}</summary>
      <label>${t('difficulty')}
        <select data-setting="difficulty">
          ${['easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${t('difficulties.' + d)}</option>`).join('')}
        </select></label>
      <label>${t('rounds')}
        <select data-setting="rounds">${[1, 2, 4].map((r) => `<option value="${r}" ${s.rounds === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>${t('limit')}
        <select data-setting="limit">${[500, 1000].map((r) => `<option value="${r}" ${s.limit === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-setting="bonusTiles" ${s.bonusTiles ? 'checked' : ''}> ${t('bonusTiles')}</label>
      <label><input type="checkbox" data-setting="sevenPairs" ${s.sevenPairs ? 'checked' : ''}> ${t('sevenPairs')}</label>
      <label><input type="checkbox" data-setting="confirmDiscard" ${s.confirmDiscard ? 'checked' : ''}> ${t('confirmDiscard')}</label>
      <label><input type="checkbox" data-setting="showChance" ${s.showChance ? 'checked' : ''}> ${t('chance')} %</label>
    </details>
    <p class="muted small">${t('version')} 0.1 · CC0-Steine von FluffyStuff</p>
  </section>`;
}

function playerName(state, seat, humanSeat) {
  return seat === humanSeat ? t('you') : t('playerNames')[seat];
}

function meldHtml(m) {
  const tiles = m.type === 'kong' && !m.open
    ? [backHtml(), tileHtmlById(m.tiles[1]), tileHtmlById(m.tiles[2]), backHtml()].join('')
    : m.tiles.map((id) => tileHtmlById(id)).join('');
  return `<span class="meld meld-${m.type}${m.open ? '' : ' concealed'}">${tiles}</span>`;
}

function opponentHtml(state, p, humanSeat, ui) {
  const acting = seatsToAct(state).includes(p.seat);
  const wind = seatWind(state, p.seat);
  const isDealer = state.dealer === p.seat;
  const last = state.lastDiscard && state.lastDiscard.seat === p.seat && !state.lastDiscard.claimed ? state.lastDiscard.tile : null;
  return `
  <div class="opponent seat-${p.seat}${acting ? ' acting' : ''}" data-seat="${p.seat}">
    <div class="opp-head">
      <span class="wind">${t('windShort')[wind]}</span>
      <span class="name">${esc(playerName(state, p.seat, humanSeat))}${isDealer ? ' ·' + t('dealer') : ''}</span>
      <span class="score">${p.score}</span>
    </div>
    <div class="opp-hand">${p.hand.map(() => backHtml('small')).join('')}</div>
    <div class="opp-melds">${p.melds.map(meldHtml).join('')}${p.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
    <div class="discards">${p.discards.map((id) => tileHtmlById(id, { classes: 'small' + (id === last ? ' last' : '') })).join('')}</div>
  </div>`;
}

function chanceHtml(state, seat) {
  const p = state.players[seat];
  const kinds = p.hand.map(kindOf);
  const n = kinds.length;
  const melds = p.melds.length;
  // Bei 3n+2 (nach dem Ziehen) den besten Abwurf annehmen
  let sh, uk;
  if ((n - 2) % 3 === 0) {
    const { visible, unseen } = visibleCounts(state, seat);
    const rem = remainingCounts(visible);
    let best = null;
    const seen = new Set();
    for (const k of kinds) {
      if (seen.has(k)) continue;
      seen.add(k);
      const rest = kinds.slice();
      rest.splice(rest.indexOf(k), 1);
      const u = ukeire(rest, melds, state.ruleSet, rem);
      if (!best || u.shanten < best.shanten || (u.shanten === best.shanten && u.total > best.total)) best = u;
    }
    sh = best.shanten; uk = best.total;
    const chance = completionChance({ shanten: sh, ukeireTotal: uk, unseen, drawsLeft: drawsLeftFor(state.wall.living.length) });
    return fmtChance(sh, uk, chance);
  }
  const { visible, unseen } = visibleCounts(state, seat);
  const u = ukeire(kinds, melds, state.ruleSet, remainingCounts(visible));
  const chance = completionChance({ shanten: u.shanten, ukeireTotal: u.total, unseen, drawsLeft: drawsLeftFor(state.wall.living.length) });
  return fmtChance(u.shanten, u.total, chance);
}

function fmtChance(sh, uk, chance) {
  const label = sh < 0 ? t('complete') : sh === 0 ? t('ready') : `${t('shanten')} ${sh}`;
  const pct = sh < 0 ? 100 : Math.round(chance * 100);
  return `<span class="chance"><b>${pct}%</b> ${t('chance')} · ${label} · ${uk} ${t('tilesLeft')}</span>`;
}

export function renderGame(snap, ui) {
  const { state } = snap;
  const humanSeat = snap.humanSeat >= 0 ? snap.humanSeat : 0; // ohne Mensch: Zuschauer auf Sitz 0
  const me = state.players[humanSeat];
  const others = [1, 2, 3].map((d) => state.players[(humanSeat + d) % 4]); // rechts, gegenüber, links
  const legal = ui.legal;
  const acting = snap.humanToAct;
  const wind = seatWind(state, humanSeat);
  const status = statusLine(state, snap, legal);
  const hand = sortTiles(me.hand);
  const drawn = state.lastDraw && state.lastDraw.seat === humanSeat && state.phase === 'discard' ? state.lastDraw.tile : null;
  const handTiles = hand.filter((id) => id !== drawn);
  const discardable = new Set(legal.filter((a) => a.type === 'discard').map((a) => kindOf(a.tile)));

  const tileBtn = (id) => {
    const k = kindOf(id);
    const cls = [
      ui.selected === id ? 'selected' : '',
      acting && state.phase === 'discard' && discardable.has(k) ? 'clickable' : '',
      ui.advice?.kind === k ? 'advised' : '',
      ui.advice?.dangerKinds?.includes(k) ? 'dangerous' : '',
    ].join(' ');
    return tileHtmlById(id, { classes: cls });
  };

  return `
  <section class="screen game">
    <header class="topbar">
      <button class="btn small" data-action="quit">${t('back')}</button>
      <span class="info">${t('round')} ${t('windShort')[state.roundWind]} · ${t('hand')} ${state.handNumber} · ${t('wall')} ${state.wall.living.length}</span>
      <button class="btn small" data-action="undo" ${snap.canUndo ? '' : 'disabled'}>${t('undo')}</button>
    </header>
    <div class="table">
      <div class="opponents">${others.map((p) => opponentHtml(state, p, humanSeat, ui)).join('')}</div>
      <div class="center">
        <div class="status ${acting ? 'acting' : ''}">${status}</div>
        ${state.lastDiscard && !state.lastDiscard.claimed && state.phase === 'claiming' ? `<div class="last-discard">${tileHtmlById(state.lastDiscard.tile)}</div>` : ''}
      </div>
      <div class="me${acting ? ' acting' : ''}">
        <div class="me-head">
          <span class="wind">${t('windShort')[wind]}</span>
          <span class="name">${t('you')}${state.dealer === humanSeat ? ' · ' + t('dealer') : ''}</span>
          <span class="score">${me.score}</span>
          ${snap.settings.showChance && me.hand.length > 0 ? chanceHtml(state, humanSeat) : ''}
        </div>
        <div class="me-discards">${me.discards.map((id) => tileHtmlById(id, { classes: 'small' })).join('')}</div>
        <div class="me-melds">${me.melds.map(meldHtml).join('')}${me.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
        <div class="hand">
          ${handTiles.map(tileBtn).join('')}
          ${drawn !== null ? `<span class="drawn">${tileBtn(drawn)}</span>` : ''}
        </div>
        <div class="actions">${actionsHtml(state, snap, legal, ui)}</div>
        ${ui.advice ? adviceHtml(ui.advice) : ''}
      </div>
    </div>
  </section>`;
}

function adviceHtml(adv) {
  const stat = (o) => `${tileHtml(o.kind, { classes: 'tiny' })} <span class="muted">${o.shanten < 0 ? t('complete') : `S${o.shanten}`} · ${o.total} · ${Math.round(o.chance * 100)}% · ${t('danger')} ${Math.round(o.danger * 100)}%</span>`;
  return `<div class="advice">
    ${(adv.lines ?? []).map((l) => `<p>${esc(l)}</p>`).join('')}
    ${adv.alternatives?.length ? `<p class="alts"><b>${t('alternatives')}:</b> ${adv.alternatives.map(stat).join(' &nbsp; ')}</p>` : ''}
    ${(adv.hints ?? []).map((h) => `<p class="hint">${esc(h)}</p>`).join('')}
  </div>`;
}

function statusLine(state, snap, legal) {
  if (state.phase === 'handOver') return '';
  const cur = seatsToAct(state);
  if (snap.humanToAct) {
    if (state.phase === 'draw') return t('yourDraw');
    if (state.phase === 'discard') return t('yourTurn');
    if (state.phase === 'claiming') return t('claiming');
  }
  const names = cur.map((s) => playerName(state, s, snap.humanSeat)).join(', ');
  return `${t('waitFor')} ${esc(names)} …`;
}

function actionsHtml(state, snap, legal, ui) {
  if (!snap.humanToAct) return '';
  const btn = (label, data, cls = '') => `<button class="btn ${cls}" ${data}>${label}</button>`;
  const out = [];
  for (const a of legal) {
    switch (a.type) {
      case 'draw': out.push(btn(t('draw'), 'data-action="draw"', 'primary')); break;
      case 'mahjong': out.push(btn(t('mahjong'), 'data-action="mahjong"', 'primary')); break;
      case 'pass': out.push(btn(t('pass'), 'data-action="pass"')); break;
      case 'pung': out.push(btn(t('pung'), 'data-action="pung"', 'primary')); break;
      case 'kong':
        if (a.variant === 'open') out.push(btn(t('kong'), 'data-action="kong" data-variant="open"', 'primary'));
        else if (a.variant === 'concealed') out.push(btn(`${t('concealedKong')} ${KIND_NAMES[a.kind]}`, `data-action="kong" data-variant="concealed" data-kind="${a.kind}"`));
        else out.push(btn(`${t('extendKong')} ${KIND_NAMES[a.kind]}`, `data-action="kong" data-variant="extend" data-kind="${a.kind}" data-meld="${a.meldIndex}"`));
        break;
      case 'chow':
        out.push(btn(`${t('chow')} ${a.kinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('')}`, `data-action="chow" data-kinds="${a.kinds.join(',')}"`, 'primary'));
        break;
      default: break;
    }
  }
  if (state.phase === 'discard' && legal.some((a) => a.type === 'discard')) {
    if (snap.settings.confirmDiscard) out.push(btn(t('discard'), 'data-action="discard-selected"', ui.selected !== null ? 'primary' : ''));
    out.push(btn(t('advisor'), 'data-action="advise"'));
  }
  if (state.phase === 'claiming') out.push(btn(t('advisor'), 'data-action="advise"'));
  return out.join('');
}

export function renderHandOver(snap) {
  const { state, humanSeat, lastScore } = snap;
  const r = state.result ?? {};
  let head;
  if (r.type === 'draw' || !r.type) head = `<p>${t('drawGame')}</p>`;
  else {
    const w = playerName(state, r.winner, humanSeat);
    const how = r.selfDraw ? t('selfDraw') : `${t('fromDiscard')} ${playerName(state, r.from, humanSeat)}`;
    head = `<p><b>${esc(w)}</b> ${t('winBy')} ${esc(how)}.</p>`;
  }
  const sheets = lastScore?.sheets;
  const rows = state.players.map((p, i) => {
    const sh = sheets?.[i];
    const lines = sh ? sh.lines.map((l) => `<li>${esc(ruleLabel(l.id))}${l.kinds ? ' ' + l.kinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('') : ''} <span class="muted">${l.kind === 'points' ? l.value : l.kind === 'double' ? '×2' : t('limitHand')}</span></li>`).join('') : '';
    const hand = [...p.melds.flatMap((m) => m.tiles), ...sortTiles(p.hand)];
    return `
    <div class="sheet${sh?.winner ? ' winner' : ''}">
      <div class="sheet-head"><b>${esc(playerName(state, p.seat, humanSeat))}</b>
        <span>${sh ? `${sh.points} ${t('points')} · ${sh.doubles} ${t('doubles')}${sh.limit ? ' · ' + t('limitHand') : ''} = <b>${sh.total}</b>` : ''}</span>
        <span class="net ${(lastScore?.net?.[i] ?? 0) >= 0 ? 'pos' : 'neg'}">${lastScore ? (lastScore.net[i] >= 0 ? '+' : '') + lastScore.net[i] : ''}</span>
        <span class="score">${p.score}</span></div>
      <div class="sheet-hand">${hand.map((id) => tileHtmlById(id, { classes: 'small' })).join('')}</div>
      ${lines ? `<ul class="lines">${lines}</ul>` : ''}
    </div>`;
  }).join('');
  const over = state.phase === 'gameOver' || (state.roundWind >= state.ruleSet.rounds && false);
  return `
  <section class="screen handover">
    <h2>${t('hand')} ${state.handNumber}</h2>
    ${head}
    ${rows}
    <div class="stack">
      <button class="btn primary" data-action="next-hand">${t('nextHand')}</button>
      <button class="btn" data-action="export">${t('exportGame')}</button>
      <button class="btn" data-action="quit">${t('toStart')}</button>
    </div>
  </section>`;
}

export function renderGameOver(snap) {
  const { state, humanSeat } = snap;
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  return `
  <section class="screen gameover">
    <h2>${t('gameOver')}</h2>
    <ol class="ranking">${ranking.map((p) => `<li><span>${esc(playerName(state, p.seat, humanSeat))}</span><b>${p.score}</b></li>`).join('')}</ol>
    <div class="stack">
      <button class="btn primary" data-action="new-game">${t('newGame')}</button>
      <button class="btn" data-action="quit">${t('toStart')}</button>
    </div>
  </section>`;
}
