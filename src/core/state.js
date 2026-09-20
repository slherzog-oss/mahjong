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
import { createRngState, shuffle } from './rng.js';
import { buildWall, drawLiving, drawReplacement } from './wall.js';
import { isWinningHand, waitingKinds } from './hand.js';
import { createRuleSet } from './rules.js';
import { dangerousFor, dangerousKindsInHand } from './dangerous.js';
import { hasYaku, isTenpai } from '../scoring/riichi.js';
import { shanten } from '../analysis/shanten.js';
import { fanOf } from '../scoring/hongkong.js';

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
      target: null, // gewähltes Spielziel (Handform-ID) oder null
      riichi: null, // Riichi: { turn, double, ippatsu, safe: kinds } oder null
      furiten: false, // Riichi: vorübergehendes Furiten bis zum nächsten eigenen Zug
      riichiFuriten: false, // Riichi: dauerhaftes Furiten nach Riichi
    })),
    wall: { living: [], dead: [], indicators: [], ura: [] }, // Riichi: Dora-Anzeiger und Ura-Dora
    current: 0,
    turn: 0, // Zähler der Abwürfe in dieser Hand
    lastDraw: null, // { seat, tile, replacement: boolean }
    lastDiscard: null, // { seat, tile, claimed: boolean, dangerous?: seats, forced?: boolean }
    replacementChain: 0, // aufeinanderfolgende Kong-Ersatzsteine ohne Abwurf dazwischen (Twofold Fortune)
    pendingKong: null, // { seat, kind, meldIndex } bei Ergänzungs-Kong (Raub möglich)
    claims: {}, // seat -> action während 'claiming'
    firstDiscardDone: false, // für Earthly Hand
    callsThisHand: false, // Riichi: Ruf oder Kan in dieser Hand (Doppel-Riichi, Chiihou)
    honba: 0, // Riichi: Zähler für Wiederholungen (300/100 je Zähler)
    riichiSticks: 0, // Riichi: hinterlegte 1000-Punkte-Stäbchen
    doraRevealed: 1, // Riichi: aufgedeckte Dora-Anzeiger
    result: null, // { type: 'win'|'draw', ... }
    log: [], // Protokoll (siehe logEvent)
    actions: [], // alle angewandten Aktionen (Replay: createGame + actions)
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

function isRiichiVariant(state) {
  return state.ruleSet.variant === 'riichi';
}

/** Eingabe für die Gewinnprüfung der Scoring-Module (Riichi-Yaku, Hong-Kong-Fan). */
function winInput(state, p, kind, selfDraw) {
  const concealed = selfDraw ? handKinds(p) : [...handKinds(p), kind];
  const living = state.wall.living.length;
  const pk = state.pendingKong;
  return {
    concealed, melds: meldsForHand(p), bonus: p.bonus.map(kindOf),
    seatWind: seatWind(state, p.seat), roundWind: state.roundWind, winningKind: kind, selfDraw,
    riichi: !!p.riichi, doubleRiichi: !!p.riichi?.double, ippatsu: !!p.riichi?.ippatsu,
    rinshan: selfDraw && !!state.lastDraw?.replacement, kongReplacement: selfDraw && !!state.lastDraw?.replacement,
    chankan: !selfDraw && !!pk, robbedKong: !selfDraw && !!pk,
    haitei: selfDraw && living === 0, houtei: !selfDraw && !pk && living === 0, lastWallTile: living === 0 && !pk,
    tenhou: selfDraw && state.turn === 0 && p.seat === state.dealer, heavenly: selfDraw && state.turn === 0 && p.seat === state.dealer,
    chiihou: selfDraw && !state.callsThisHand && p.seat !== state.dealer && p.discards.length === 0 && !state.lastDraw?.replacement,
    earthly: !selfDraw && !state.firstDiscardDone && state.lastDiscard?.seat === state.dealer && state.turn === 1,
  };
}

/** Riichi: Furiten (eigener Abwurf unter den Wartesteinen, vorübergehend oder nach Riichi). */
export function isFuriten(state, p) {
  if (p.furiten || p.riichiFuriten) return true;
  const waits = waitingKinds(handKinds(p), meldsForHand(p), state.ruleSet);
  if (!waits.length) return false;
  const own = new Set(p.discards.map(kindOf));
  return waits.some((k) => own.has(k));
}

/** Darf p mit `kind` gewinnen? Form, Furiten und Yaku (Riichi) bzw. Mindest-Fan (Hong Kong). */
function canWin(state, p, kind, selfDraw) {
  if (!wins(state, p, selfDraw ? null : kind)) return false;
  const v = state.ruleSet.variant;
  if (v === 'riichi') {
    if (!selfDraw && isFuriten(state, p)) return false;
    return hasYaku(winInput(state, p, kind, selfDraw), state.ruleSet);
  }
  if (v === 'hongkong') return fanOf(winInput(state, p, kind, selfDraw), state.ruleSet) >= (state.ruleSet.minFan ?? 0);
  return true;
}

function breakIppatsu(state) {
  for (const q of state.players) if (q.riichi) q.riichi.ippatsu = false;
}

function kongsOnTable(state) {
  return state.players.reduce((n, q) => n + q.melds.filter((m) => m.type === 'kong').length, 0);
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
      const riichi = isRiichiVariant(state);
      const drawn = state.lastDraw && state.lastDraw.seat === seat ? state.lastDraw.tile : null;
      const winKind = drawn !== null ? kindOf(drawn) : state.lastDiscard ? kindOf(state.lastDiscard.tile) : null;
      if ((!riichi || drawn !== null) && canWin(state, p, winKind, true)) out.push({ type: 'mahjong', seat });
      const counts = new Array(NUM_KINDS).fill(0);
      for (const id of p.hand) counts[kindOf(id)]++;
      const kongAllowed = !riichi || (state.wall.living.length > 0 && kongsOnTable(state) < 4);
      if (kongAllowed) {
        for (let k = 0; k < NUM_KINDS; k++) {
          if (counts[k] !== 4) continue;
          if (p.riichi) {
            // Nach Riichi nur ein verdecktes Kan mit dem gezogenen Stein, das das Warten nicht ändert
            if (drawn === null || kindOf(drawn) !== k) continue;
            const before = waitingKinds(handKinds(p).filter((x, i) => i !== p.hand.indexOf(drawn)), meldsForHand(p), state.ruleSet);
            const rest = handKinds(p).filter((x) => x !== k);
            const after = waitingKinds(rest, [...meldsForHand(p), { type: 'kong', kinds: [k, k, k, k], open: false }], state.ruleSet);
            if (before.join(',') !== after.join(',')) continue;
          }
          out.push({ type: 'kong', seat, kind: k, variant: 'concealed' });
        }
        if (!p.riichi) {
          p.melds.forEach((m, meldIndex) => {
            if (m.type === 'pung' && counts[m.kinds[0]] === 1) {
              out.push({ type: 'kong', seat, kind: m.kinds[0], variant: 'extend', meldIndex });
            }
          });
        }
      }
      if (p.riichi) {
        // Nach Riichi wird der gezogene Stein abgeworfen (Tsumogiri)
        if (drawn !== null) out.push({ type: 'discard', seat, tile: drawn });
        else out.push({ type: 'discard', seat, tile: p.hand[p.hand.length - 1] });
        break;
      }
      const seen = new Set();
      for (const id of p.hand) {
        // Ein Abwurf je Art reicht für KI/Berater; UI darf konkrete IDs wählen.
        const k = kindOf(id);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ type: 'discard', seat, tile: id });
      }
      // Riichi-Ansage: verdeckte Hand, mindestens 1000 Punkte, mindestens 4 Wandsteine, Abwurf lässt die Hand wartend
      if (riichi && drawn !== null && p.melds.every((m) => !m.open) && p.score >= 1000 && state.wall.living.length >= 4) {
        const kinds = handKinds(p);
        const mc = p.melds.length;
        // Schnelle Vorprüfung über Shanten (gecachte Farbtabellen), Tenpai genau dann bei Shanten 0
        if (shanten(kinds, mc, state.ruleSet).min <= 0) {
          const seenR = new Set();
          for (const id of p.hand) {
            const k = kindOf(id);
            if (seenR.has(k)) continue;
            seenR.add(k);
            const rest = kinds.slice();
            rest.splice(rest.indexOf(k), 1);
            if (shanten(rest, mc, state.ruleSet).min === 0) out.push({ type: 'riichi', seat, tile: id });
          }
        }
      }
      break;
    }

    case 'claiming': {
      const src = state.pendingKong ? state.pendingKong : state.lastDiscard;
      if (seat === src.seat || state.claims[seat]) break;
      out.push({ type: 'pass', seat });
      const kind = state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile);
      if (!state.pendingKong || state.pendingKong.robbable) {
        if (canWin(state, p, kind, false)) out.push({ type: 'mahjong', seat });
      }
      if (state.pendingKong) break; // beim Kong-Raub nur Mahjong oder pass
      if (p.riichi) break; // nach Riichi keine Rufe
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
  state.actions.push(action);

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
      state.replacementChain = 0;
      player(state, seat).furiten = false;
      logEvent(state, { type: 'draw', seat, tile: got.tile });
      state.phase = 'discard';
      break;
    }

    case 'discard': {
      requirePhase(state, 'discard', action);
      requireSeat(state, seat, state.current, action);
      const p = player(state, seat);
      if (p.riichi && !getLegalActions(state, seat).some((a) => a.type === 'discard' && a.tile === action.tile)) {
        throw new IllegalAction('Nach Riichi nur der gezogene Stein', action);
      }
      doDiscard(state, seat, action.tile);
      break;
    }

    case 'riichi': {
      requirePhase(state, 'discard', action);
      requireSeat(state, seat, state.current, action);
      const p = player(state, seat);
      const legal = getLegalActions(state, seat).some((a) => a.type === 'riichi' && kindOf(a.tile) === kindOf(action.tile));
      if (!legal || !p.hand.includes(action.tile)) throw new IllegalAction('Riichi hier nicht erlaubt', action);
      const double = !state.callsThisHand && p.discards.length === 0;
      doDiscard(state, seat, action.tile);
      p.riichi = { turn: state.turn, tile: action.tile, double, ippatsu: true, safe: [] };
      p.score -= 1000;
      state.riichiSticks++;
      logEvent(state, { type: 'riichi', seat, tile: action.tile, double });
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
        if (isRiichiVariant(state) && !getLegalActions(state, seat).some((a) => a.type === 'kong' && a.variant === 'concealed' && a.kind === action.kind)) {
          throw new IllegalAction('Kan hier nicht erlaubt', action);
        }
        const tiles = removeKinds(p.hand, action.kind, 4);
        p.melds.push({ type: 'kong', tiles, kinds: tiles.map(kindOf), open: false, from: null });
        state.callsThisHand = true;
        breakIppatsu(state);
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
        if (isRiichiVariant(state) && !getLegalActions(state, seat).some((a) => a.type === 'kong' && a.variant === 'extend' && a.kind === action.kind)) {
          throw new IllegalAction('Kan hier nicht erlaubt', action);
        }
        const [tile] = removeKinds(p.hand, action.kind, 1);
        meld.type = 'kong';
        meld.tiles.push(tile);
        meld.kinds.push(action.kind);
        state.callsThisHand = true;
        breakIppatsu(state);
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
        if (!getLegalActions(state, seat).some((a) => a.type === 'mahjong')) throw new IllegalAction('Hand ist nicht vollständig oder Gewinn nicht erlaubt', action);
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

    case 'setTarget': {
      // Spielziel eines Sitzes (Handform-ID oder null); nur Protokoll, keine Regelwirkung
      if (state.phase === 'gameOver') throw new IllegalAction('Spiel ist beendet', action);
      player(state, seat).target = action.form ?? null;
      logEvent(state, { type: 'set_target', seat, form: action.form ?? null });
      break;
    }

    default:
      throw new IllegalAction(`Unbekannte Aktion ${type}`, action);
  }
  return state;
}

/** Abwurf ausführen (auch Teil der Riichi-Ansage). */
function doDiscard(state, seat, tile) {
  const p = player(state, seat);
  const kind = kindOf(tile);
  const dangerous = state.ruleSet.penalties ? dangerousFor(state, seat, kind) : [];
  const forced = dangerous.length > 0 && dangerousKindsInHand(state, seat).size === new Set(p.hand.map(kindOf)).size;
  removeTileId(p.hand, tile);
  p.discards.push(tile);
  if (p.riichi) p.riichi.ippatsu = false;
  for (const q of state.players) if (q.riichi && q.seat !== seat) q.riichi.safe.push(kind);
  state.lastDiscard = { seat, tile, claimed: false, dangerous, forced };
  state.lastDraw = null;
  state.replacementChain = 0;
  state.turn++;
  logEvent(state, { type: 'discard', seat, tile });
  state.claims = {};
  state.phase = 'claiming';
}

function requirePhase(state, phase, action) {
  if (state.phase !== phase) throw new IllegalAction(`Aktion ${action.type} nicht in Phase ${state.phase}`, action);
}

function requireSeat(state, seat, expected, action) {
  if (seat !== expected) throw new IllegalAction(`Sitz ${seat} ist nicht am Zug (${expected})`, action);
}

// ---------- Hand-Ablauf ----------

/** Wand einsetzen; bei Riichi wird die tote Wand in Ersatzsteine, Dora- und Ura-Anzeiger geteilt. */
export function installWall(state, living, dead) {
  if (isRiichiVariant(state) && dead.length >= 14) {
    state.wall = { living, dead: dead.slice(0, 4), indicators: dead.slice(4, 9), ura: dead.slice(9, 14) };
  } else {
    state.wall = { living, dead, indicators: [], ura: [] };
  }
  state.doraRevealed = 1;
}

function startHand(state) {
  state.handNumber++;
  const w = buildWall(state.rng, state.ruleSet);
  installWall(state, w.living, w.dead);
  for (const p of state.players) {
    p.hand = [];
    p.melds = [];
    p.bonus = [];
    p.discards = [];
    p.target = null;
    p.riichi = null;
    p.furiten = false;
    p.riichiFuriten = false;
  }
  state.callsThisHand = false;
  state.turn = 0;
  state.lastDraw = null;
  state.lastDiscard = null;
  state.pendingKong = null;
  state.claims = {};
  state.firstDiscardDone = false;
  state.replacementChain = 0;
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
  state.replacementChain++;
  if (isRiichiVariant(state)) state.doraRevealed = Math.min(state.wall.indicators.length, state.doraRevealed + 1);
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

  if (isRiichiVariant(state)) {
    // Furiten: wer einen Stein passieren lässt, der seine Hand vervollständigt hätte
    const kind = state.pendingKong ? state.pendingKong.kind : kindOf(state.lastDiscard.tile);
    for (const q of state.players) {
      if (q.seat === src || state.claims[q.seat]?.type === 'mahjong') continue;
      if (wins(state, q, kind)) {
        q.furiten = true;
        if (q.riichi) q.riichiFuriten = true;
      }
    }
  }

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
    state.callsThisHand = true;
    breakIppatsu(state);
    p.furiten = false;
    if (pk.type === 'pung') {
      const tiles = [...removeKinds(p.hand, kind, 2), tile];
      p.melds.push({ type: 'pung', tiles, kinds: tiles.map(kindOf), open: true, from: src });
      logEvent(state, { type: 'pung', seat: pk.seat, from: src, tile });
      state.current = pk.seat;
      state.claims = {};
      state.lastDraw = null;
      state.replacementChain = 0;
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
    state.callsThisHand = true;
    breakIppatsu(state);
    p.furiten = false;
    p.melds.push({ type: 'chow', tiles, kinds: tiles.map(kindOf), open: true, from: src });
    logEvent(state, { type: 'chow', seat: ch.seat, from: src, tile });
    state.current = ch.seat;
    state.claims = {};
    state.lastDraw = null;
    state.replacementChain = 0;
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
  // Twofold Fortune: Gewinn mit dem Ersatzstein des zweiten unmittelbar aufeinanderfolgenden Kongs
  const twofoldFortune = !!info.kongReplacement && state.replacementChain >= 2;
  // DMJL: Abwurf war offensichtlich gefährlich für den Gewinner (und nicht erzwungen)
  const ld = state.lastDiscard;
  const dangerousGame = !info.selfDraw && !info.robbedKong && !!ld && ld.tile === info.winningTile && !ld.forced && (ld.dangerous ?? []).includes(info.winner);
  const wp = player(state, info.winner);
  const chiihou = info.selfDraw && !state.callsThisHand && info.winner !== state.dealer && wp.discards.length === 0 && !info.kongReplacement;
  state.result = {
    type: 'win',
    ...info,
    heavenly,
    earthly,
    chiihou,
    twofoldFortune,
    dangerousGame,
    riichi: !!wp.riichi,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    roundWind: state.roundWind,
    dealer: state.dealer,
  };
  logEvent(state, { type: 'mahjong', seat: info.winner, from: info.from, tile: info.winningTile });
  if (dangerousGame) logEvent(state, { type: 'dangerous_game', seat: info.from, winner: info.winner, tile: info.winningTile });
  state.pendingKong = null;
  state.claims = {};
  state.phase = 'handOver';
}

function finishDraw(state) {
  state.result = { type: 'draw', roundWind: state.roundWind, dealer: state.dealer, honba: state.honba, riichiSticks: state.riichiSticks };
  if (isRiichiVariant(state)) {
    state.result.tenpai = state.players.map((p) => isTenpai(handKinds(p), meldsForHand(p), state.ruleSet));
  }
  logEvent(state, { type: 'draw_game', tenpai: state.result.tenpai ?? null });
  state.pendingKong = null;
  state.claims = {};
  state.phase = 'handOver';
}

function endHand(state) {
  const r = state.result;
  const rs = state.ruleSet;
  let dealerKeeps = false;
  if (isRiichiVariant(state)) {
    if (r.type === 'win') {
      dealerKeeps = rs.dealerKeepsOnWin && r.winner === state.dealer;
      state.honba = dealerKeeps ? state.honba + 1 : 0;
      state.riichiSticks = 0;
    } else {
      dealerKeeps = rs.dealerKeepsOnDraw && !!r.tenpai?.[state.dealer];
      state.honba++;
    }
  } else if (r.type === 'win') dealerKeeps = rs.dealerKeepsOnWin && r.winner === state.dealer;
  else dealerKeeps = rs.dealerKeepsOnDraw;

  logEvent(state, { type: 'end_hand', result: r.type, winner: r.winner ?? null, dealerKeeps, honba: state.honba });
  if (dealerKeeps) {
    state.dealerRepeat++;
  } else {
    state.dealerRepeat = 0;
    state.dealer = nextSeat(state.dealer);
    if (state.dealer === 0) state.roundWind++;
  }
  state.result = null;
  const bust = isRiichiVariant(state) && rs.bustEnds && state.players.some((p) => p.score < 0);
  state.phase = state.roundWind >= rs.rounds || bust ? 'gameOver' : 'idle';
  if (state.phase === 'gameOver') {
    if (state.riichiSticks > 0) {
      // Verbliebene Stäbchen gehen an den Führenden
      const leader = [...state.players].sort((a, b) => b.score - a.score)[0];
      leader.score += 1000 * state.riichiSticks;
      logEvent(state, { type: 'sticks_to_leader', seat: leader.seat, sticks: state.riichiSticks });
      state.riichiSticks = 0;
    }
    logEvent(state, { type: 'game_over', scores: state.players.map((p) => p.score), bust });
  }
}

/**
 * Übungsverteilung: gibt einem Sitz eine vorgegebene Hand (Arten) direkt nach
 * startHand und verteilt die übrigen Steine neu (deterministisch über state.rng).
 * hand: 13 Arten (oder 14 für den Geber). Liefert neuen Zustand.
 */
export function rigDeal(prev, seat, kinds) {
  const state = clone(prev);
  if (state.phase !== 'discard' || state.turn !== 0) throw new IllegalAction('rigDeal nur direkt nach startHand', { type: 'rigDeal' });
  const expected = seat === state.dealer ? 14 : 13;
  if (kinds.length !== expected) throw new IllegalAction(`rigDeal: ${kinds.length} Steine, erwartet ${expected}`, { type: 'rigDeal' });
  const pool = allTileIdsFor(state.ruleSet);
  const take = (kind) => {
    const i = pool.findIndex((id) => kindOf(id) === kind);
    if (i < 0) throw new IllegalAction(`rigDeal: keine Kopie von Art ${kind}`, { type: 'rigDeal' });
    return pool.splice(i, 1)[0];
  };
  const hand = kinds.map(take);
  shuffle(state.rng, pool);
  for (const p of state.players) {
    p.melds = [];
    p.bonus = [];
    p.discards = [];
    p.riichi = null;
    p.furiten = false;
    p.riichiFuriten = false;
    if (p.seat === seat) p.hand = hand;
    else p.hand = pool.splice(0, p.seat === state.dealer ? 14 : 13);
  }
  // Bonussteine in fremden Händen sofort auslegen (wie beim Geben)
  for (const p of state.players) {
    if (p.seat === seat) continue;
    for (let i = p.hand.length - 1; i >= 0; i--) {
      if (isBonus(kindOf(p.hand[i]))) {
        p.bonus.push(p.hand.splice(i, 1)[0]);
        p.hand.push(pool.shift());
      }
    }
  }
  const deadTiles = pool.splice(pool.length - state.ruleSet.deadWallSize, state.ruleSet.deadWallSize);
  installWall(state, pool, deadTiles);
  const dealer = player(state, state.dealer);
  state.lastDraw = { seat: state.dealer, tile: dealer.hand[dealer.hand.length - 1], replacement: false };
  state.log = state.log.filter((e) => e.type !== 'deal');
  logEvent(state, { type: 'deal', hands: state.players.map((p) => [...p.hand]), practice: seat });
  state.actions.push({ type: 'rigDeal', seat, kinds });
  return state;
}

function allTileIdsFor(ruleSet) {
  const n = ruleSet.bonusTiles ? 144 : 136;
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Replay: wendet eine Aktionsliste auf ein frisches Spiel an.
 * onStep(state, action, index) wird nach jeder Aktion aufgerufen.
 */
export function replay({ seed, ruleSet, humanSeat = 0, actions }, onStep = null) {
  let s = createGame({ seed, ruleSet, humanSeat });
  actions.forEach((a, i) => {
    s = a.type === 'rigDeal' ? rigDeal(s, a.seat, a.kinds) : applyAction(s, a);
    onStep?.(s, a, i);
  });
  return s;
}

/** Punkte nach einer Hand verbuchen (Zahlungsmatrix aus dem Scoring-Modul; bonus: Beträge vom Tisch, z. B. Riichi-Stäbchen). */
export function applyPayments(prev, payments, bonus = null) {
  const state = clone(prev);
  for (let from = 0; from < 4; from++) {
    for (let to = 0; to < 4; to++) {
      const v = payments[from][to] || 0;
      state.players[from].score -= v;
      state.players[to].score += v;
    }
  }
  if (bonus) for (let s = 0; s < 4; s++) state.players[s].score += bonus[s] || 0;
  logEvent(state, { type: 'payments', payments, bonus: bonus ?? null });
  return state;
}

// ---------- Sichten ----------

/** Was ein Sitz sehen darf (für UI und KI): fremde Hände verborgen. */
export function viewFor(state, seat) {
  return {
    ...state,
    rng: undefined,
    wall: {
      livingCount: state.wall.living.length,
      deadCount: state.wall.dead.length + (state.wall.indicators?.length ?? 0) + (state.wall.ura?.length ?? 0),
      indicators: (state.wall.indicators ?? []).slice(0, state.doraRevealed ?? 0),
    },
    players: state.players.map((p) =>
      p.seat === seat || state.phase === 'handOver' || state.phase === 'gameOver'
        ? p
        : { ...p, hand: p.hand.map(() => null), handCount: p.hand.length },
    ),
  };
}
