// Spielzustand und Aktionen (Reducer-Modell).
//
// applyAction(state, action) → neuer Zustand (der alte bleibt unverändert).
// getLegalActions(state, seat) → Liste erlaubter Aktionen für einen Sitz.
//
// Sitze: 0..3, fest über das ganze Spiel. Sitzwind eines Spielers ergibt sich
// aus (seat - dealer + 4) % 4, 0 = Ost.
//
// Phasen:
//   'idle'      vor der ersten Hand oder nach endHand (nächste: startHand)
//   'draw'      aktueller Spieler muss ziehen
//   'discard'   aktueller Spieler hält 3n+2 und muss abwerfen (oder Kong / Mahjong)
//   'claiming'  ein Abwurf (oder Ergänzungs-Kong) liegt aus; die anderen melden
//               pass / chow / pung / kong / mahjong
//   'handOver'  Hand beendet (Gewinn oder Unentschieden), nächste: endHand
//   'gameOver'  alle Runden gespielt

import { kindOf, isBonus, isSuited, suitOf, rankOf, NUM_KINDS } from './tiles.js';
import { createRngState } from './rng.js';
import { buildWall, drawLiving, drawReplacement } from './wall.js';
import { isWinningHand } from './hand.js';
import { createRuleSet } from './rules.js';

export const PHASES = ['idle', 'draw', 'discard', 'claiming', 'handOver', 'gameOver'];

export class IllegalAction extends Error {
  constructor(msg, action) {
    super(msg);
    this.name = 'IllegalAction';
    this.action = action;
  }
}

// ---------- Erzeugung ----------

export function createGame({ seed = Date.now(), ruleSet = createRuleSet(), humanSeat = 0 } = {}) {
  return {
    version: 1,
    ruleSet,
    seed,
    rng: createRngState(seed),
    phase: 'idle',
    roundWind: 0, // 0 = Ost-Runde
    dealer: 0,
    handNumber: 0, // fortlaufend über das Spiel
    dealerRepeat: 0, // wie oft Ost hintereinander Ost blieb
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      human: seat === humanSeat,
      score: ruleSet.startScore,
      hand: [], // verdeckte Steine (IDs)
      melds: [], // { type, tiles: ids, kinds, open, from: seat|null }
      bonus: [], // Bonus-IDs
      discards: [], // IDs in Abwurfreihenfolge
    })),
    wall: { living: [], dead: [] },
    current: 0,
    turn: 0, // Zähler der Abwürfe in dieser Hand
    lastDraw: null, // { seat, tile, replacement: boolean }
    lastDiscard: null, // { seat, tile, claimed: boolean }
    pendingKong: null, // { seat, kind, meldIndex } bei Ergänzungs-Kong (Raub möglich)
    claims: {}, // seat -> action während 'claiming'
    firstDiscardDone: false, // für Earthly Hand
    result: null, // { type: 'win'|'draw', ... }
    log: [], // Protokoll (siehe logEvent)
  };
}

// ---------- Hilfsfunktionen ----------

export function seatWind(state, seat) {
  return (seat - state.dealer + 4) % 4;
}

export function nextSeat(seat) {
  return (seat + 1) % 4;
}

export function player(state, seat) {
  return state.players[seat];
}

function handKinds(p) {
  return p.hand.map(kindOf);
}

function meldsForHand(p) {
  return p.melds.map((m) => ({ type: m.type, kinds: m.kinds, open: m.open }));
}

function removeKinds(hand, kind, n) {
  const removed = [];
  for (let i = hand.length - 1; i >= 0 && removed.length < n; i--) {
    if (kindOf(hand[i]) === kind) removed.push(...hand.splice(i, 1));
  }
  if (removed.length !== n) throw new IllegalAction(`Nicht genug Steine der Art ${kind} in der Hand`);
  return removed;
}

function removeTileId(hand, id) {
  const i = hand.indexOf(id);
  if (i < 0) throw new IllegalAction(`Stein ${id} nicht in der Hand`);
  return hand.splice(i, 1)[0];
}

function logEvent(state, ev) {
  state.log.push({ n: state.log.length, hand: state.handNumber, ...ev });
}

function clone(state) {
  return structuredClone(state);
}

function wins(state, p, extraKind = null) {
  const kinds = handKinds(p);
  if (extraKind !== null) kinds.push(extraKind);
  return isWinningHand(kinds, meldsForHand(p), state.ruleSet);
}

/** Zieht Steine für seat; Bonussteine werden sofort ausgelegt und ersetzt. */
function giveTile(state, seat, id, replacement = false) {
  const p = player(state, seat);
  while (id !== null && isBonus(kindOf(id))) {
    p.bonus.push(id);
    logEvent(state, { type: 'bonus', seat, tile: id });
    id = drawReplacement(state.wall, state.ruleSet);
    replacement = true;
  }
  if (id === null) return null;
  p.hand.push(id);
  return { tile: id, replacement };
}

// ---------- Legal Actions ----------

export function getLegalActions(state, seat) {
  const p = player(state, seat);
  const out = [];
  switch (state.phase) {
    case 'idle':
      if (seat === state.dealer) out.push({ type: 'startHand' });
      break;

    case 'draw':
      if (seat === state.current) out.push({ type: 'draw', seat });
      break;

    case 'discard': {
      if (seat !== state.current) break;
      if (wins(state, p)) out.push({ type: 'mahjong', seat });
      const counts = new Array(NUM_KINDS).fill(0);
      for (const id of p.hand) counts[kindOf(id)]++;
      for (let k = 0; k < NUM_KINDS; k++) {
        if (counts[k] === 4) out.push({ type: 'kong', seat, kind: k, variant: 'concealed' });
      }
      p.melds.forEach((m, meldIndex) => {
        if (m.type === 'pung' && counts[m.kinds[0]] === 1) {
          out.push({ type: 'kong', seat, kind: m.kinds[0], variant: 'extend', meldIndex });
        }
      });
      const seen = new Set();
      for (const id of p.hand) {
        // Ein Abwurf je Art reicht für KI/Berater; UI darf konkrete IDs wählen.
        const k = kindOf(id);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ type: 'discard', seat, tile: id });
      }
      break;
    }

    case 'claiming': {
      const src = state.pendingKong ? state.pendingKong : state.lastDiscard;
      if (seat === src.seat || state.claims[seat]) break;
      out.push({ type: 'pass', seat });
      const kind = state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile);
      if (wins(state, p, kind)) {
        if (!state.pendingKong || state.pendingKong.robbable) out.push({ type: 'mahjong', seat });
      }
      if (state.pendingKong) break; // beim Kong-Raub nur Mahjong oder pass
      const counts = new Array(NUM_KINDS).fill(0);
      for (const id of p.hand) counts[kindOf(id)]++;
      if (counts[kind] >= 2) out.push({ type: 'pung', seat });
      if (counts[kind] >= 3) out.push({ type: 'kong', seat, variant: 'open' });
      if (seat === nextSeat(src.seat) && isSuited(kind)) {
        const chows = p.melds.filter((m) => m.type === 'chow').length;
        if (chows < state.ruleSet.maxChows) {
          const r = rankOf(kind);
          const s = suitOf(kind);
          const has = (rr) => rr >= 1 && rr <= 9 && counts[s * 9 + rr - 1] > 0;
          for (const [a, b] of [[r - 2, r - 1], [r - 1, r + 1], [r + 1, r + 2]]) {
            if (has(a) && has(b)) {
              out.push({ type: 'chow', seat, kinds: [s * 9 + a - 1, s * 9 + b - 1] });
            }
          }
        }
      }
      break;
    }

    case 'handOver':
      if (seat === state.dealer) out.push({ type: 'endHand' });
      break;

    default:
      break;
  }
  return out;
}

/** Sitze, die in der aktuellen Phase handeln müssen. */
export function seatsToAct(state) {
  switch (state.phase) {
    case 'idle':
    case 'handOver':
      return [state.dealer];
    case 'draw':
    case 'discard':
      return [state.current];
    case 'claiming': {
      const src = state.pendingKong ? state.pendingKong.seat : state.lastDiscard.seat;
      return [0, 1, 2, 3].filter((s) => s !== src && !state.claims[s]);
    }
    default:
      return [];
  }
}

// ---------- Reducer ----------

export function applyAction(prev, action) {
  const state = clone(prev);
  const { type } = action;
  const seat = action.seat;

  switch (type) {
    case 'startHand':
      requirePhase(state, 'idle', action);
      startHand(state);
      break;

    case 'draw': {
      requirePhase(state, 'draw', action);
      requireSeat(state, seat, state.current, action);
      const id = drawLiving(state.wall);
      if (id === null) {
        finishDraw(state);
        break;
      }
      const got = giveTile(state, seat, id, false);
      if (!got) {
        finishDraw(state);
        break;
      }
      state.lastDraw = { seat, tile: got.tile, replacement: got.replacement };
      logEvent(state, { type: 'draw', seat, tile: got.tile });
      state.phase = 'discard';
      break;
    }

    case 'discard': {
      requirePhase(state, 'discard', action);
      requireSeat(state, seat, state.current, action);
      const p = player(state, seat);
      removeTileId(p.hand, action.tile);
      p.discards.push(action.tile);
      state.lastDiscard = { seat, tile: action.tile, claimed: false };
      state.lastDraw = null;
      state.turn++;
      logEvent(state, { type: 'discard', seat, tile: action.tile });
      state.claims = {};
      state.phase = 'claiming';
      break;
    }

    case 'kong': {
      if (action.variant === 'open') {
        requirePhase(state, 'claiming', action);
        registerClaim(state, action);
        break;
      }
      requirePhase(state, 'discard', action);
      requireSeat(state, seat, state.current, action);
      const p = player(state, seat);
      if (action.variant === 'concealed') {
        const tiles = removeKinds(p.hand, action.kind, 4);
        p.melds.push({ type: 'kong', tiles, kinds: tiles.map(kindOf), open: false, from: null });
        logEvent(state, { type: 'kong', seat, variant: 'concealed', kind: action.kind });
        const robbable = state.ruleSet.robKongForThirteenOrphans;
        if (robbable && someoneCanRob(state, seat, action.kind, true)) {
          state.pendingKong = { seat, kind: action.kind, meldIndex: p.melds.length - 1, robbable: true, concealed: true };
          state.claims = {};
          state.phase = 'claiming';
        } else {
          kongReplacement(state, seat);
        }
      } else if (action.variant === 'extend') {
        const meld = p.melds[action.meldIndex];
        if (!meld || meld.type !== 'pung' || meld.kinds[0] !== action.kind) {
          throw new IllegalAction('Kein passender Pung für Ergänzungs-Kong', action);
        }
        const [tile] = removeKinds(p.hand, action.kind, 1);
        meld.type = 'kong';
        meld.tiles.push(tile);
        meld.kinds.push(action.kind);
        logEvent(state, { type: 'kong', seat, variant: 'extend', kind: action.kind });
        state.pendingKong = { seat, kind: action.kind, meldIndex: action.meldIndex, robbable: true, concealed: false };
        state.claims = {};
        state.phase = 'claiming';
      } else {
        throw new IllegalAction(`Unbekannte Kong-Variante ${action.variant}`, action);
      }
      break;
    }

    case 'mahjong': {
      if (state.phase === 'discard') {
        requireSeat(state, seat, state.current, action);
        const p = player(state, seat);
        if (!wins(state, p)) throw new IllegalAction('Hand ist nicht vollständig', action);
        finishWin(state, {
          winner: seat,
          from: null,
          winningTile: state.lastDraw?.tile ?? null,
          selfDraw: true,
          kongReplacement: !!state.lastDraw?.replacement,
          lastWallTile: state.wall.living.length === 0,
          robbedKong: false,
        });
      } else {
        requirePhase(state, 'claiming', action);
        registerClaim(state, action);
      }
      break;
    }

    case 'pass':
    case 'chow':
    case 'pung':
      requirePhase(state, 'claiming', action);
      registerClaim(state, action);
      break;

    case 'endHand':
      requirePhase(state, 'handOver', action);
      endHand(state);
      break;

    default:
      throw new IllegalAction(`Unbekannte Aktion ${type}`, action);
  }
  return state;
}

function requirePhase(state, phase, action) {
  if (state.phase !== phase) throw new IllegalAction(`Aktion ${action.type} nicht in Phase ${state.phase}`, action);
}

function requireSeat(state, seat, expected, action) {
  if (seat !== expected) throw new IllegalAction(`Sitz ${seat} ist nicht am Zug (${expected})`, action);
}

// ---------- Hand-Ablauf ----------

function startHand(state) {
  state.handNumber++;
  state.wall = buildWall(state.rng, state.ruleSet);
  for (const p of state.players) {
    p.hand = [];
    p.melds = [];
    p.bonus = [];
    p.discards = [];
  }
  state.turn = 0;
  state.lastDraw = null;
  state.lastDiscard = null;
  state.pendingKong = null;
  state.claims = {};
  state.firstDiscardDone = false;
  state.result = null;
  logEvent(state, { type: 'start_hand', dealer: state.dealer, roundWind: state.roundWind });

  // Verteilung: 4×4 reihum ab Ost, dann je 1, Ost bekommt einen 14. Stein.
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 4; i++) {
      const seat = (state.dealer + i) % 4;
      for (let j = 0; j < 4; j++) giveTile(state, seat, drawLiving(state.wall));
    }
  }
  for (let i = 0; i < 4; i++) giveTile(state, (state.dealer + i) % 4, drawLiving(state.wall));
  const extra = giveTile(state, state.dealer, drawLiving(state.wall));
  state.lastDraw = { seat: state.dealer, tile: extra.tile, replacement: false };
  logEvent(state, { type: 'deal', hands: state.players.map((p) => [...p.hand]) });
  state.current = state.dealer;
  state.phase = 'discard';
}

function kongReplacement(state, seat) {
  const id = drawReplacement(state.wall, state.ruleSet);
  if (id === null) {
    finishDraw(state);
    return;
  }
  const got = giveTile(state, seat, id, true);
  if (!got) {
    finishDraw(state);
    return;
  }
  state.lastDraw = { seat, tile: got.tile, replacement: true };
  logEvent(state, { type: 'draw', seat, tile: got.tile, replacement: true });
  state.current = seat;
  state.phase = 'discard';
}

function someoneCanRob(state, seat, kind) {
  for (let s = 0; s < 4; s++) {
    if (s === seat) continue;
    if (wins(state, player(state, s), kind)) return true;
  }
  return false;
}

function registerClaim(state, action) {
  const src = state.pendingKong ? state.pendingKong.seat : state.lastDiscard.seat;
  const seat = action.seat;
  if (seat === src) throw new IllegalAction('Abwerfender kann nicht rufen', action);
  if (state.claims[seat]) throw new IllegalAction('Sitz hat bereits gemeldet', action);
  // Gültigkeit gegen getLegalActions prüfen (einfach und robust).
  const legal = getLegalActions(state, seat).some((a) => sameClaim(a, action));
  if (!legal) throw new IllegalAction(`Ungültiger Call ${action.type} für Sitz ${seat}`, action);
  state.claims[seat] = action;
  if (Object.keys(state.claims).length === 3) resolveClaims(state);
}

function sameClaim(a, b) {
  if (a.type !== b.type || a.seat !== b.seat) return false;
  if (a.type === 'chow') return a.kinds[0] === b.kinds?.[0] && a.kinds[1] === b.kinds?.[1];
  if (a.type === 'kong') return a.variant === b.variant;
  return true;
}

function resolveClaims(state) {
  const src = state.pendingKong ? state.pendingKong.seat : state.lastDiscard.seat;
  const claims = Object.values(state.claims);
  const order = (s) => (s - src + 4) % 4; // Nähe zum Abwerfenden

  // 1. Mahjong (nächster in Spielreihenfolge gewinnt)
  const mj = claims.filter((c) => c.type === 'mahjong').sort((a, b) => order(a.seat) - order(b.seat));
  if (mj.length) {
    const c = mj[0];
    const p = player(state, c.seat);
    if (state.pendingKong) {
      // Kong-Raub: Stein aus dem Kong des anderen nehmen
      const victim = player(state, src);
      const meld = victim.melds[state.pendingKong.meldIndex];
      const tile = meld.tiles.pop();
      meld.kinds.pop();
      if (state.pendingKong.concealed) {
        victim.melds.splice(state.pendingKong.meldIndex, 1);
        victim.hand.push(...meld.tiles);
      } else {
        meld.type = 'pung';
      }
      p.hand.push(tile);
      logEvent(state, { type: 'rob_kong', seat: c.seat, from: src, tile });
      finishWin(state, { winner: c.seat, from: src, winningTile: tile, selfDraw: false, kongReplacement: false, lastWallTile: false, robbedKong: true });
    } else {
      const tile = state.lastDiscard.tile;
      player(state, src).discards.pop();
      state.lastDiscard.claimed = true;
      p.hand.push(tile);
      finishWin(state, { winner: c.seat, from: src, winningTile: tile, selfDraw: false, kongReplacement: false, lastWallTile: state.wall.living.length === 0, robbedKong: false });
    }
    return;
  }

  if (state.pendingKong) {
    // Niemand raubt: Kong abschließen, Ersatzstein
    const seat = state.pendingKong.seat;
    state.pendingKong = null;
    state.claims = {};
    kongReplacement(state, seat);
    return;
  }

  // 2. Pung / Kong
  const tile = state.lastDiscard.tile;
  const kind = kindOf(tile);
  const pk = claims.find((c) => c.type === 'pung' || c.type === 'kong');
  if (pk) {
    const p = player(state, pk.seat);
    player(state, src).discards.pop();
    state.lastDiscard.claimed = true;
    if (pk.type === 'pung') {
      const tiles = [...removeKinds(p.hand, kind, 2), tile];
      p.melds.push({ type: 'pung', tiles, kinds: tiles.map(kindOf), open: true, from: src });
      logEvent(state, { type: 'pung', seat: pk.seat, from: src, tile });
      state.current = pk.seat;
      state.claims = {};
      state.lastDraw = null;
      state.phase = 'discard';
    } else {
      const tiles = [...removeKinds(p.hand, kind, 3), tile];
      p.melds.push({ type: 'kong', tiles, kinds: tiles.map(kindOf), open: true, from: src });
      logEvent(state, { type: 'kong', seat: pk.seat, variant: 'open', from: src, tile });
      state.claims = {};
      kongReplacement(state, pk.seat);
    }
    return;
  }

  // 3. Chow
  const ch = claims.find((c) => c.type === 'chow');
  if (ch) {
    const p = player(state, ch.seat);
    player(state, src).discards.pop();
    state.lastDiscard.claimed = true;
    const tiles = [removeKinds(p.hand, ch.kinds[0], 1)[0], removeKinds(p.hand, ch.kinds[1], 1)[0], tile];
    tiles.sort((a, b) => kindOf(a) - kindOf(b));
    p.melds.push({ type: 'chow', tiles, kinds: tiles.map(kindOf), open: true, from: src });
    logEvent(state, { type: 'chow', seat: ch.seat, from: src, tile });
    state.current = ch.seat;
    state.claims = {};
    state.lastDraw = null;
    state.phase = 'discard';
    return;
  }

  // 4. Alle passen
  state.firstDiscardDone = true;
  state.claims = {};
  state.current = nextSeat(src);
  state.phase = 'draw';
}

function finishWin(state, info) {
  const heavenly = info.selfDraw && state.turn === 0 && info.winner === state.dealer;
  const earthly = !info.selfDraw && !state.firstDiscardDone && info.from === state.dealer && state.turn === 1;
  state.result = {
    type: 'win',
    ...info,
    heavenly,
    earthly,
    roundWind: state.roundWind,
    dealer: state.dealer,
  };
  logEvent(state, { type: 'mahjong', seat: info.winner, from: info.from, tile: info.winningTile });
  state.pendingKong = null;
  state.claims = {};
  state.phase = 'handOver';
}

function finishDraw(state) {
  state.result = { type: 'draw', roundWind: state.roundWind, dealer: state.dealer };
  logEvent(state, { type: 'draw_game' });
  state.pendingKong = null;
  state.claims = {};
  state.phase = 'handOver';
}

function endHand(state) {
  const r = state.result;
  const rs = state.ruleSet;
  let dealerKeeps = false;
  if (r.type === 'win') dealerKeeps = rs.dealerKeepsOnWin && r.winner === state.dealer;
  else dealerKeeps = rs.dealerKeepsOnDraw;

  logEvent(state, { type: 'end_hand', result: r.type, winner: r.winner ?? null, dealerKeeps });
  if (dealerKeeps) {
    state.dealerRepeat++;
  } else {
    state.dealerRepeat = 0;
    state.dealer = nextSeat(state.dealer);
    if (state.dealer === 0) state.roundWind++;
  }
  state.result = null;
  state.phase = state.roundWind >= rs.rounds ? 'gameOver' : 'idle';
  if (state.phase === 'gameOver') logEvent(state, { type: 'game_over', scores: state.players.map((p) => p.score) });
}

/** Punkte nach einer Hand verbuchen (Zahlungsmatrix aus dem Scoring-Modul). */
export function applyPayments(prev, payments) {
  const state = clone(prev);
  for (let from = 0; from < 4; from++) {
    for (let to = 0; to < 4; to++) {
      const v = payments[from][to] || 0;
      state.players[from].score -= v;
      state.players[to].score += v;
    }
  }
  logEvent(state, { type: 'payments', payments });
  return state;
}

// ---------- Sichten ----------

/** Was ein Sitz sehen darf (für UI und KI): fremde Hände verborgen. */
export function viewFor(state, seat) {
  return {
    ...state,
    rng: undefined,
    wall: { livingCount: state.wall.living.length, deadCount: state.wall.dead.length },
    players: state.players.map((p) =>
      p.seat === seat || state.phase === 'handOver' || state.phase === 'gameOver'
        ? p
        : { ...p, hand: p.hand.map(() => null), handCount: p.hand.length },
    ),
  };
}
