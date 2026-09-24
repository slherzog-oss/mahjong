// Rendering: Zustand → HTML. Reine Funktionen, Ereignisse per Delegation in app.js.
import { kindOf, sortTiles, KIND_NAMES, isFlower, isSeason } from '../core/tiles.js';
import { seatWind, seatsToAct, isFuriten } from '../core/state.js';
import { tileHtml, tileHtmlById, backHtml } from './tiles.js';
import { t } from '../i18n/index.js';
import { scoreLabel } from '../scoring/index.js';
import { ukeire, visibleCounts, remainingCounts } from '../analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../analysis/probability.js';
import { analyzeForms, formKeepKinds } from '../analysis/forms.js';
import { renderFormsPanel } from './lexicon.js';
import { getLanguage } from '../i18n/index.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderPlayIdle(snap) {
  const s = snap.settings;
  return `
  <section class="screen play-idle">
    <h1>${t('appName')}</h1>
    <p class="subtitle">${t('variantSubtitle.' + (s.rules.variant ?? 'classical'))}</p>
    <div class="stack">
      <button class="btn primary" data-action="new-game">${t('newGame')}</button>
      ${snap.hasSave ? `<button class="btn" data-action="resume">${t('resume')}</button>` : ''}
      <div class="row">
        <button class="btn small" data-action="import">${t('importGame')}</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    </div>
  </section>`;
}

export function playerName(state, seat, humanSeat) {
  return seat === humanSeat ? t('you') : t('playerNames')[seat];
}

export function meldHtml(m) {
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
      ${p.riichi ? `<span class="riichi-badge">${t('riichi')}</span>` : ''}
      <span class="score">${p.score}</span>
    </div>
    <div class="opp-hand">${p.hand.map(() => backHtml('small')).join('')}</div>
    <div class="opp-melds">${p.melds.map(meldHtml).join('')}${p.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
    <div class="discards">${p.discards.map((id) => tileHtmlById(id, { classes: 'small' + (id === last ? ' last' : '') + (p.riichi && id === p.riichi.tile ? ' riichi-tile' : '') })).join('')}</div>
  </div>`;
}

function chanceHtml(state, seat, canWin) {
  if (canWin) return fmtChance(-1, 0, 1);
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

function mcHtml(mc) {
  if (!mc) return `<span class="chance mc muted" title="${t('winChanceHint')}">${t('winChance')} …</span>`;
  return `<span class="chance mc" title="${t('winChanceHint')}"><b>${Math.round(mc.win * 100)}%</b> ${t('winChance')}</span>`;
}

function fmtChance(sh, uk, chance) {
  const label = sh < 0 ? t('complete') : sh === 0 ? t('ready') : `${t('shanten')} ${sh}`;
  const pct = sh < 0 ? 100 : Math.round(chance * 100);
  return `<span class="chance"><b>${pct}%</b> ${t('chance')} · ${label} · ${uk} ${t('tilesLeft')}</span>`;
}

function wallStrip(state, settings) {
  if (!settings.showWall) return '';
  const n = state.wall.living.length;
  const shown = Math.min(18, Math.ceil(n / 4));
  return `<div class="wall-row" aria-hidden="true">${backHtml('tiny').repeat(shown)}</div>`;
}

export function renderPlay(snap, ui) {
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
  const riichiKinds = new Set(legal.filter((a) => a.type === 'riichi').map((a) => kindOf(a.tile)));
  const riichiMode = !!ui.riichiMode && riichiKinds.size > 0;
  const rs = state.ruleSet;
  const riichiVariant = rs.variant === 'riichi';
  const furiten = riichiVariant && me.hand.length > 0 && (me.hand.length - 1) % 3 === 0 && isFuriten(state, me);
  const selectedKind = ui.selected !== null ? kindOf(ui.selected) : null;

  const target = me.target ?? null;
  const showForm = ui.showKinds ?? target;
  let keep = null;
  if (showForm && me.hand.length > 0 && (me.hand.length - 2) % 3 === 0) {
    try { keep = formKeepKinds(state, humanSeat, showForm); } catch { keep = null; }
  }
  const tileBtn = (id) => {
    const k = kindOf(id);
    const cls = [
      ui.selected === id ? 'selected' : '',
      acting && state.phase === 'discard' && (riichiMode ? riichiKinds.has(k) : discardable.has(k)) ? 'clickable' : '',
      riichiMode && riichiKinds.has(k) ? 'riichi-ok' : '',
      snap.settings.highlightMatchingTiles && selectedKind !== null && k === selectedKind && id !== ui.selected ? 'match-highlight' : '',
      ui.advice?.kind === k ? 'advised' : '',
      ui.advice?.dangerKinds?.includes(k) ? 'dangerous' : '',
      keep ? (keep.has(k) ? 'keep' : 'expendable') : '',
    ].join(' ');
    return tileHtmlById(id, { classes: cls });
  };
  let formsHtml = '';
  if (snap.settings.assist && snap.settings.showForms && me.hand.length > 0 && state.phase !== 'handOver') {
    try {
      const forms = cachedForms(state, humanSeat);
      formsHtml = renderFormsPanel(forms, { target, expanded: ui.formsOpen, showKinds: ui.showKinds, variant: rs.variant });
      if (target && !forms.some((f) => f.form === target && f.chance >= 0.02)) {
        const tf = forms.find((f) => f.form === target);
        formsHtml = `<div class="warn">${t('forms.targetLost', { pct: tf ? Math.round(tf.chance * 100) : 0 })} <button class="btn tiny" data-action="clear-target">${t('forms.free')}</button></div>` + formsHtml;
      }
    } catch (e) { console.warn(e); }
  }

  const doraHtml = riichiVariant
    ? `<span class="dora" title="${t('dora')}">${t('dora')} ${(state.wall.indicators ?? []).slice(0, state.doraRevealed ?? 1).map((id) => tileHtmlById(id, { classes: 'tiny' })).join('')}</span>`
      + `<span class="honba" title="${t('honba')} / ${t('sticks')}">${t('honba')} ${state.honba ?? 0}${state.riichiSticks ? ' ' + '<span class="stick"></span>'.repeat(Math.min(4, state.riichiSticks)) + (state.riichiSticks > 4 ? '×' + state.riichiSticks : '') : ''}</span>`
    : '';
  const showPrompt = acting && state.phase === 'discard' && !riichiMode;
  return `
  <section class="screen play-game${riichiMode ? ' riichi-mode' : ''}" data-tile-color="${snap.settings.tileColor}" data-tile-shape="${snap.settings.tileShape}" data-discard-size="${snap.settings.discardSize}" data-mat="${snap.settings.matColor}">
    <header class="topbar">
      <button class="btn small" data-action="quit">${t('back')}</button>
      <span class="info">${t('round')} ${t('windShort')[state.roundWind]} · ${t('hand')} ${state.handNumber} · ${t('wall')} ${state.wall.living.length}${doraHtml}</span>
      <span class="topbar-right">
        <button class="btn small${snap.settings.assist ? '' : ' assist-off'}" data-action="toggle-assist" title="${t('assist')}">${snap.settings.assist ? t('assistOn') : t('assistOff')}</button>
        <button class="btn small" data-action="undo" ${snap.canUndo ? '' : 'disabled'}>${t('undo')}</button>
      </span>
    </header>
    <div class="table">
      ${wallStrip(state, snap.settings)}
      <div class="opponents">${others.map((p) => opponentHtml(state, p, humanSeat, ui)).join('')}</div>
      <div class="center">
        <div class="status ${acting ? 'acting' : ''}" aria-live="polite">${riichiMode ? t('riichiHint') : status}</div>
        ${state.lastDiscard && !state.lastDiscard.claimed && state.phase === 'claiming' ? `<div class="last-discard">${tileHtmlById(state.lastDiscard.tile)}</div>` : ''}
      </div>
      <div class="me${acting ? ' acting' : ''}">
        <div class="me-head">
          <span class="wind">${t('windShort')[wind]}</span>
          <span class="name">${t('you')}${state.dealer === humanSeat ? ' · ' + t('dealer') : ''}</span>
          ${me.riichi ? `<span class="riichi-badge">${t('riichi')}</span>` : ''}
          ${furiten ? `<span class="furiten-badge" title="${t('furitenHint')}">${t('furiten')}</span>` : ''}
          <span class="score">${me.score}</span>
          ${snap.settings.assist && snap.settings.showChance && me.hand.length > 0 ? chanceHtml(state, humanSeat, legal.some((a) => a.type === 'mahjong')) + mcHtml(ui.mc) : ''}
        </div>
        <div class="me-discards">${me.discards.map((id) => tileHtmlById(id, { classes: 'small' + (me.riichi && id === me.riichi.tile ? ' riichi-tile' : '') })).join('')}</div>
        <div class="me-melds">${me.melds.map(meldHtml).join('')}${me.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
        <div class="hand" role="group" aria-label="${t('hand')}">
          ${handTiles.map(tileBtn).join('')}
          ${drawn !== null ? `<span class="drawn">${tileBtn(drawn)}</span>` : ''}
        </div>
        ${showPrompt ? `<div class="discard-prompt${ui.selected !== null ? ' armed' : ''}">${ui.selected !== null ? t('discardPrompt.again', { tile: KIND_NAMES[kindOf(ui.selected)] }) : t('discardPrompt.select')}</div>` : ''}
        <div class="actions">${actionsHtml(state, snap, legal, ui)}</div>
        ${ui.advice ? adviceHtml(ui.advice) : ''}
        ${ui.practice ? `<div class="practice">${esc(ui.practice)}</div>` : ''}
        ${formsHtml}
      </div>
    </div>
  </section>`;
}

const formsCache = { key: null, value: null };
function cachedForms(state, seat) {
  const key = `${state.seed}:${state.handNumber}:${state.log.length}:${seat}`;
  if (formsCache.key !== key) {
    formsCache.key = key;
    formsCache.value = analyzeForms(state, seat);
  }
  return formsCache.value;
}

function adviceHtml(adv) {
  const stat = (o) => `${tileHtml(o.kind, { classes: 'tiny' })} <span class="muted">${o.shanten < 0 ? t('complete') : `S${o.shanten}`} · ${o.total} · ${Math.round(o.chance * 100)}% · ${t('danger')} ${Math.round(o.danger * 100)}%</span>`;
  return `<div class="advice">
    ${(adv.lines ?? []).map((l) => `<p>${esc(l)}</p>`).join('')}
    ${adv.alternatives?.length ? `<p class="alts"><b>${t('alternatives')}:</b> ${adv.alternatives.map(stat).join(' &nbsp; ')}</p>` : ''}
    ${(adv.hints ?? []).map((h) => `<p class="hint">${esc(h)}</p>`).join('')}
    ${adv.why?.length ? `<p><button class="btn tiny" data-action="advice-why">${adv.showWhy ? t('whyLess') : t('why')}</button></p>` : ''}
    ${adv.showWhy ? adv.why.map((l) => `<p class="why">${esc(l)}</p>`).join('') : ''}
  </div>`;
}

function statusLine(state, snap, legal) {
  if (state.phase === 'handOver' || state.phase === 'gameOver') return '';
  const cur = seatsToAct(state);
  if (snap.humanToAct) {
    if (state.phase === 'draw') return t('yourDraw');
    if (state.phase === 'discard') return t('yourTurn');
    if (state.phase === 'claiming') {
      const src = state.pendingKong ? state.pendingKong.seat : state.lastDiscard.seat;
      return t('claimingHint', { name: playerName(state, src, snap.humanSeat), tile: KIND_NAMES[state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile)] });
    }
  }
  const names = cur.map((s) => playerName(state, s, snap.humanSeat)).join(', ');
  return `${t('waitFor')} ${esc(names)} …`;
}

/** Inline Aktionen für Ziehen/Abwerfen/Riichi/Berater. Beanspruchen (Pung/Chow/Kong/Mahjong/Pass) laufen über das Aktions-Overlay. */
function actionsHtml(state, snap, legal, ui) {
  if (!snap.humanToAct) return '';
  const btn = (label, data, cls = '') => `<button class="btn ${cls}" ${data}>${label}</button>`;
  const out = [];
  if (state.phase === 'claiming') {
    if (snap.settings.assist) out.push(btn(t('advisor'), 'data-action="advise"'));
    return out.join('');
  }
  for (const a of legal) {
    if (a.type === 'draw') out.push(btn(t('draw'), 'data-action="draw"', 'primary'));
    else if (a.type === 'mahjong') out.push(btn(t('mahjong'), 'data-action="mahjong"', 'primary'));
    else if (a.type === 'kong' && a.variant === 'concealed') out.push(btn(`${t('concealedKong')} ${KIND_NAMES[a.kind]}`, `data-action="kong" data-variant="concealed" data-kind="${a.kind}"`));
    else if (a.type === 'kong' && a.variant === 'extend') out.push(btn(`${t('extendKong')} ${KIND_NAMES[a.kind]}`, `data-action="kong" data-variant="extend" data-kind="${a.kind}" data-meld="${a.meldIndex}"`));
  }
  if (state.phase === 'discard' && legal.some((a) => a.type === 'discard')) {
    const riichis = legal.filter((a) => a.type === 'riichi');
    if (riichis.length) {
      if (ui.riichiMode) out.push(btn(t('riichiCancel'), 'data-action="riichi-cancel"'));
      else out.push(btn(t('riichi'), 'data-action="riichi"', 'riichi'));
    }
    if (snap.settings.assist) out.push(btn(t('advisor'), 'data-action="advise"'));
  }
  return out.join('');
}

/** Wertangabe einer Scoring-Zeile je Art. */
export function lineValue(l) {
  switch (l.kind) {
    case 'points': return l.value;
    case 'double': return '×2';
    case 'limit': return t('limitHand');
    case 'fan': return `${l.value} ${t('fan')}`;
    case 'han': return `${l.value} ${t('han')}`;
    case 'yakuman': return l.value > 1 ? `${t('yakuman')} ×${l.value}` : t('yakuman');
    case 'dora': return `${l.value} ${t('han')}`;
    case 'fu': return `${l.value} ${t('fu')}`;
    default: return l.value;
  }
}

export function sheetSummary(sh, variant, r) {
  if (!sh) return '';
  if (variant === 'hongkong') return sh.winner ? `${sh.fan} ${t('fan')} = <b>${sh.total}</b>` : '';
  if (variant === 'riichi') {
    if (r.type === 'draw') return `<span class="${sh.tenpai ? 'tenpai' : 'noten'}">${sh.tenpai ? t('tenpai') : t('noten')}</span>`;
    if (!sh.winner) return '';
    const size = sh.yakuman ? `${t('yakuman')}${sh.yakuman > 1 ? ' ×' + sh.yakuman : ''}` : `${sh.han} ${t('han')} ${sh.fu} ${t('fu')}`;
    return `${size}${sh.limitName && !sh.yakuman ? ' · ' + (t('limitNames.' + sh.limitName) !== 'limitNames.' + sh.limitName ? t('limitNames.' + sh.limitName) : sh.limitName) : ''} = <b>${sh.total}</b>`;
  }
  return `${sh.points} ${t('points')} · ${sh.doubles} ${t('doubles')}${sh.limit ? ' · ' + t('limitHand') : ''} = <b>${sh.total}</b>`;
}

export function lineListHtml(sh) {
  if (!sh) return '';
  const lines = sh.lines.map((l) => `<li>${esc(scoreLabel(l.id, getLanguage()))}${l.kinds ? ' ' + l.kinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('') : ''} <span class="muted">${lineValue(l)}</span></li>`).join('');
  return lines ? `<ul class="lines">${lines}</ul>` : '';
}

export function bonusToastName(kind) {
  if (isFlower(kind)) return t('toast.flowers')[kind - 34];
  if (isSeason(kind)) return t('toast.seasons')[kind - 38];
  return KIND_NAMES[kind];
}

export function renderGameOver(snap) {
  const { state, humanSeat } = snap;
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const over = state.log.findLast?.((e) => e.type === 'game_over') ?? null;
  return `
  <section class="screen gameover">
    <h2>${t('gameOver')}</h2>
    ${over?.bust ? `<p class="warn">${t('bust')}</p>` : ''}
    <ol class="ranking">${ranking.map((p) => `<li><span>${esc(playerName(state, p.seat, humanSeat))}</span><b>${p.score}</b></li>`).join('')}</ol>
  </section>`;
}
