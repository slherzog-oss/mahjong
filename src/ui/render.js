// Rendering: Zustand → HTML. Reine Funktionen, Ereignisse per Delegation in app.js.
import { kindOf, sortTiles, KIND_NAMES } from '../core/tiles.js';
import { seatWind, seatsToAct, isFuriten } from '../core/state.js';
import { tileHtml, tileHtmlById, backHtml } from './tiles.js';
import { t } from '../i18n/index.js';
import { scoreLabel } from '../scoring/index.js';
import { shanten } from '../analysis/shanten.js';
import { ukeire, visibleCounts, remainingCounts } from '../analysis/ukeire.js';
import { completionChance, drawsLeftFor } from '../analysis/probability.js';
import { analyzeForms, formKeepKinds } from '../analysis/forms.js';
import { renderFormsPanel, formName } from './lexicon.js';
import { RULE_PRESETS, VARIANT_FIELDS } from '../core/presets.js';
import { VARIANTS } from '../core/rules.js';
import { LANGUAGES, getLanguage } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderStart(snap) {
  const s = snap.settings;
  return `
  <section class="screen start">
    <h1>${t('appName')}</h1>
    <p class="muted">${t('variantSubtitle.' + (s.rules.variant ?? 'classical'))}</p>
    <div class="stack">
      <button class="btn primary" data-action="new-game">${t('newGame')}</button>
      ${snap.hasSave ? `<button class="btn" data-action="resume">${t('resume')}</button>` : ''}
      <button class="btn" data-action="lexicon">${t('lexicon')}</button>
      <button class="btn" data-action="practice-list">${t('practiceTitle')}</button>
      <button class="btn" data-action="analysis-list">${t('analysis')}</button>
      <div class="row">
        <button class="btn small" data-action="import">${t('importGame')}</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    </div>
    <details class="settings">
      <summary>${t('settings')}</summary>
      <label>${t('language')}
        <select data-setting="language">${LANGUAGES.map((l) => `<option value="${l.id}" ${s.language === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
      <label>${t('difficulty')}
        <select data-setting="difficulty">
          ${['easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${t('difficulties.' + d)}</option>`).join('')}
        </select></label>
      <p class="muted small">${t('aiFair')}</p>
      <label>${t('rounds')}
        <select data-setting="rounds">${[1, 2, 4].map((r) => `<option value="${r}" ${s.rounds === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>${t('aiDelay')}
        <select data-setting="aiDelayMs">${[0, 250, 450, 900].map((v) => `<option value="${v}" ${s.aiDelayMs === v ? 'selected' : ''}>${t('aiDelays.' + v)}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-setting="confirmDiscard" ${s.confirmDiscard ? 'checked' : ''}> ${t('confirmDiscard')}</label>
      <label><input type="checkbox" data-setting="showChance" ${s.showChance ? 'checked' : ''}> ${t('chance')} %</label>
      <label><input type="checkbox" data-setting="showForms" ${s.showForms ? 'checked' : ''}> ${t('forms.title')}</label>
      <label><input type="checkbox" data-setting="learnMode" ${s.learnMode ? 'checked' : ''}> ${t('learnMode')}</label>
      <p class="muted small">${t('learnModeHint')}</p>
      <label><input type="checkbox" data-setting="animations" ${s.animations ? 'checked' : ''}> ${t('animations')}</label>
      <label><input type="checkbox" data-setting="sounds" ${s.sounds ? 'checked' : ''}> ${t('sounds')}</label>
      <div class="names">
        <span>${t('playerNamesLabel')}</span>
        ${s.playerNames.map((n, i) => `<input type="text" maxlength="12" value="${esc(n)}" data-player-name="${i}" aria-label="${t('playerNamesLabel')} ${i + 1}">`).join('')}
      </div>
      <button class="btn small" data-action="tutorial-start">${t('tutorialAgain')}</button>
    </details>
    <details class="settings">
      <summary>${t('rules')}</summary>
      ${rulesPanel(s)}
    </details>
    ${snap.pwa?.canInstall ? `<p><button class="btn" data-action="install">${t('install')}</button></p>` : ''}
    <p class="muted small">${t('version')} ${snap.pwa?.version ? snap.pwa.version : '0.1'} · CC0-Steine von FluffyStuff</p>
  </section>`;
}

/** Regeloptionen je Variante (Felder aus VARIANT_FIELDS). */
function rulesPanel(s) {
  const variant = s.rules.variant ?? 'classical';
  const fields = VARIANT_FIELDS[variant] ?? VARIANT_FIELDS.classical;
  const label = (key) => (t('rule.' + key) !== 'rule.' + key ? t('rule.' + key) : t(key));
  const startScores = variant === 'riichi' ? [0, 25000, 30000] : variant === 'hongkong' ? [0, 500, 1000, 2000] : [0, 1000, 2000, 5000];
  const selects = { limit: [500, 1000], deadWallSize: [14, 16], maxChows: [1, 2, 4], startScore: startScores, minFan: [0, 1, 3], hkPayment: ['half', 'full'] };
  const optLabel = (key, v) => (key === 'hkPayment' ? t('hkPayments.' + v) : v);
  const row = (key) => {
    if (selects[key]) {
      return `<label>${label(key)}
        <select data-rule="${key}">${selects[key].map((v) => `<option value="${v}" ${String(s.rules[key]) === String(v) ? 'selected' : ''}>${optLabel(key, v)}</option>`).join('')}</select></label>`;
    }
    return `<label><input type="checkbox" data-rule="${key}" ${s.rules[key] ? 'checked' : ''}> ${label(key)}</label>`;
  };
  return `
      <label>${t('variant')}
        <select data-rule="variant">${VARIANTS.map((v) => `<option value="${v}" ${variant === v ? 'selected' : ''}>${t('variants.' + v)}</option>`).join('')}</select></label>
      <label>${t('preset')}
        <select data-action="preset">${[...Object.keys(RULE_PRESETS), 'custom'].filter((p) => p === 'custom' || (RULE_PRESETS[p].variant ?? 'classical') === variant).map((p) => `<option value="${p}" ${s.preset === p ? 'selected' : ''}>${t('presets.' + p)}</option>`).join('')}</select></label>
      ${fields.map(row).join('')}`;
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
      ${p.riichi ? `<span class="riichi-badge">${t('riichi')}</span>` : ''}
      <span class="score">${p.score}</span>
    </div>
    <div class="opp-hand">${p.hand.map(() => backHtml('small')).join('')}</div>
    <div class="opp-melds">${p.melds.map(meldHtml).join('')}${p.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
    <div class="discards">${p.discards.map((id) => tileHtmlById(id, { classes: 'small' + (id === last ? ' last' : '') + (p.riichi && id === p.riichi.tile ? ' riichi-tile' : '') })).join('')}</div>
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

function mcHtml(mc) {
  if (!mc) return `<span class="chance mc muted" title="${t('winChanceHint')}">${t('winChance')} …</span>`;
  return `<span class="chance mc" title="${t('winChanceHint')}"><b>${Math.round(mc.win * 100)}%</b> ${t('winChance')}</span>`;
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
  const riichiKinds = new Set(legal.filter((a) => a.type === 'riichi').map((a) => kindOf(a.tile)));
  const riichiMode = !!ui.riichiMode && riichiKinds.size > 0;
  const rs = state.ruleSet;
  const riichiVariant = rs.variant === 'riichi';
  const furiten = riichiVariant && me.hand.length > 0 && (me.hand.length - 1) % 3 === 0 && isFuriten(state, me);

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
      ui.advice?.kind === k ? 'advised' : '',
      ui.advice?.dangerKinds?.includes(k) ? 'dangerous' : '',
      keep ? (keep.has(k) ? 'keep' : 'expendable') : '',
    ].join(' ');
    return tileHtmlById(id, { classes: cls });
  };
  let formsHtml = '';
  if (snap.settings.showForms && me.hand.length > 0 && state.phase !== 'handOver') {
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
  return `
  <section class="screen game${riichiMode ? ' riichi-mode' : ''}">
    <header class="topbar">
      <button class="btn small" data-action="quit">${t('back')}</button>
      <span class="info">${t('round')} ${t('windShort')[state.roundWind]} · ${t('hand')} ${state.handNumber} · ${t('wall')} ${state.wall.living.length}${doraHtml}</span>
      <span class="topbar-right">
        <button class="btn small" data-action="lexicon" title="${t('lexicon')}" aria-label="${t('lexicon')}">?</button>
        <button class="btn small" data-action="undo" ${snap.canUndo ? '' : 'disabled'}>${t('undo')}</button>
      </span>
    </header>
    <div class="table">
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
          ${snap.settings.showChance && me.hand.length > 0 ? chanceHtml(state, humanSeat) + mcHtml(ui.mc) : ''}
        </div>
        <div class="me-discards">${me.discards.map((id) => tileHtmlById(id, { classes: 'small' + (me.riichi && id === me.riichi.tile ? ' riichi-tile' : '') })).join('')}</div>
        <div class="me-melds">${me.melds.map(meldHtml).join('')}${me.bonus.map((id) => tileHtmlById(id, { classes: 'small bonus' })).join('')}</div>
        <div class="hand" role="group" aria-label="${t('hand')}">
          ${handTiles.map(tileBtn).join('')}
          ${drawn !== null ? `<span class="drawn">${tileBtn(drawn)}</span>` : ''}
        </div>
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
    const riichis = legal.filter((a) => a.type === 'riichi');
    if (riichis.length) {
      if (ui.riichiMode) out.push(btn(t('riichiCancel'), 'data-action="riichi-cancel"'));
      else out.push(btn(t('riichi'), 'data-action="riichi"', 'riichi'));
    }
    if (snap.settings.confirmDiscard && !ui.riichiMode) out.push(btn(t('discard'), 'data-action="discard-selected"', ui.selected !== null ? 'primary' : ''));
    out.push(btn(t('advisor'), 'data-action="advise"'));
  }
  if (state.phase === 'claiming') out.push(btn(t('advisor'), 'data-action="advise"'));
  return out.join('');
}

/** Wertangabe einer Scoring-Zeile je Art. */
function lineValue(l) {
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

function sheetSummary(sh, variant, r) {
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

export function renderHandOver(snap) {
  const { state, humanSeat, lastScore } = snap;
  const r = state.result ?? {};
  const variant = state.ruleSet.variant ?? 'classical';
  let head;
  if (r.type === 'draw' || !r.type) head = `<p>${variant === 'riichi' ? t('drawGameRiichi') : t('drawGame')}</p>`;
  else {
    const w = playerName(state, r.winner, humanSeat);
    const how = r.selfDraw ? t('selfDraw') : `${t('fromDiscard')} ${playerName(state, r.from, humanSeat)}`;
    head = `<p><b>${esc(w)}</b> ${t('winBy')} ${esc(how)}.</p>`;
    if (r.dangerousGame) head += `<p class="warn">${esc(t('dangerousGame', { name: playerName(state, r.from, humanSeat) }))}</p>`;
  }
  if (variant === 'riichi' && lastScore?.doraKinds?.length) {
    const ura = r.type === 'win' && state.players[r.winner]?.riichi && lastScore.uraKinds?.length ? ` · Ura ${lastScore.uraKinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('')}` : '';
    head += `<p class="muted small">${t('dora')} ${lastScore.doraKinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('')}${ura}${r.honba ? ` · ${t('honba')} ${r.honba}` : ''}${r.riichiSticks ? ` · ${t('sticks')} ${r.riichiSticks}` : ''}</p>`;
  }
  const sheets = lastScore?.sheets;
  const rows = state.players.map((p, i) => {
    const sh = sheets?.[i];
    const lines = sh ? sh.lines.map((l) => `<li>${esc(scoreLabel(l.id, getLanguage()))}${l.kinds ? ' ' + l.kinds.map((k) => tileHtml(k, { classes: 'tiny' })).join('') : ''} <span class="muted">${lineValue(l)}</span></li>`).join('') : '';
    const hand = [...p.melds.flatMap((m) => m.tiles), ...sortTiles(p.hand)];
    return `
    <div class="sheet${sh?.winner ? ' winner' : ''}">
      <div class="sheet-head"><b>${esc(playerName(state, p.seat, humanSeat))}</b>
        <span>${sheetSummary(sh, variant, r)}</span>
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
      <button class="btn" data-action="analysis-current">${t('analyze')}</button>
      <button class="btn" data-action="export">${t('exportGame')}</button>
      <button class="btn" data-action="quit">${t('toStart')}</button>
    </div>
  </section>`;
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
    <div class="stack">
      <button class="btn primary" data-action="analysis-current">${t('analyze')}</button>
      <button class="btn" data-action="new-game">${t('newGame')}</button>
      <button class="btn" data-action="quit">${t('toStart')}</button>
    </div>
  </section>`;
}
