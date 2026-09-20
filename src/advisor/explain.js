// Klartext-Begründungen für den Berater (Deutsch über i18n).
import { KIND_NAMES, SUITS } from '../core/tiles.js';
import { t } from '../i18n/index.js';

const suitName = (s) => t('suitNames')[s] ?? SUITS[s];

/** Begründung für den besten Abwurf, als Liste kurzer Sätze. */
export function explainDiscard(advice) {
  const { best, alternatives, progress } = advice;
  const out = [];
  if (advice.target) {
    const name = t('forms.names')[advice.target] ?? advice.target;
    if (advice.targetReachable && best.shanten <= 4) {
      out.push(t('adv.target', { name, tile: KIND_NAMES[best.kind], shanten: best.shanten, ukeire: best.total, pct: Math.round(best.chance * 100) }));
    } else {
      out.push(t('adv.targetFar', { name, shanten: Number.isFinite(best.shanten) ? best.shanten : '∞', tile: KIND_NAMES[advice.freeBest.kind] }));
    }
    return out;
  }
  if (advice.riichi && advice.riichi.kind === best.kind) {
    out.push(t('adv.riichi', { tile: KIND_NAMES[best.kind], n: advice.riichi.total, waits: advice.riichi.waits.map((k) => KIND_NAMES[k]).join(' ') }));
  } else if (advice.riichi) {
    out.push(t('adv.best', { tile: KIND_NAMES[best.kind], shanten: best.shanten, ukeire: best.total, pct: Math.round(best.chance * 100) }));
    out.push(t('adv.riichiAlt', { tile: KIND_NAMES[advice.riichi.kind], n: advice.riichi.total }));
  } else {
    out.push(t('adv.best', { tile: KIND_NAMES[best.kind], shanten: best.shanten, ukeire: best.total, pct: Math.round(best.chance * 100) }));
  }
  if (advice.furiten) out.push(t('adv.furiten'));
  if (best.visibleCopies >= 3) out.push(t('adv.safe', { tile: KIND_NAMES[best.kind] }));
  else if (best.honour && best.visibleCopies >= 2) out.push(t('adv.honourSeen', { tile: KIND_NAMES[best.kind] }));
  if (best.breaksPair) out.push(t('adv.breaksPair'));
  const alt = alternatives[0];
  if (alt) {
    if (alt.shanten === best.shanten && alt.total >= best.total && alt.danger > best.danger + 0.2 && progress > 0.4) {
      out.push(t('adv.altDanger', { tile: KIND_NAMES[alt.kind] }));
    } else if (alt.shanten === best.shanten && alt.potential.doubles < best.potential.doubles) {
      out.push(t('adv.altValue', { tile: KIND_NAMES[alt.kind] }));
    } else if (alt.shanten > best.shanten) {
      out.push(t('adv.altWorse', { tile: KIND_NAMES[alt.kind] }));
    }
  }
  if (progress > 0.7 && best.danger > 0.6) out.push(t('adv.lateDanger'));
  const penal = advice.options.filter((o) => o.penalty);
  if (penal.length) out.push(t('adv.dangerousGame', { tiles: penal.map((o) => KIND_NAMES[o.kind]).join(', ') }));
  return out;
}

export function explainClaim(advice) {
  const { action, reason } = advice;
  const name = action.type === 'pass' ? t('pass') : t(action.type);
  switch (reason.key) {
    case 'mahjong': return [t('advisorMahjong')];
    case 'gain': return [t('adv.claimGain', { action: name, before: reason.before, after: reason.after }), ...(reason.opensHand ? [t('adv.opensHand')] : [])];
    case 'keepConcealed': return [t('adv.keepConcealed', { shanten: reason.before })];
    case 'noYaku': return [t('adv.noYaku')];
    case 'lowFan': return [t('adv.lowFan')];
    default: return [t('adv.claimNoGain')];
  }
}

export function explainHints(hints) {
  return hints.map((h) => {
    switch (h.form) {
      case 'thirteen_orphans': return t('adv.hintOrphans', { n: h.shanten + 1 });
      case 'seven_pairs': return t('adv.hintSevenPairs', { n: h.shanten + 1 });
      case 'full_flush': return t('adv.hintFullFlush', { suit: suitName(h.suit) });
      case 'half_flush': return t('adv.hintHalfFlush', { suit: suitName(h.suit) });
      case 'flush_possible': return t('adv.hintFlushPossible', { suit: suitName(h.suit) });
      case 'all_pungs': return t('adv.hintAllPungs');
      default: return '';
    }
  }).filter(Boolean);
}

/** Ausführliche Begründung ("Warum?"): Begriffe und alle Kandidaten mit Zahlen. */
export function explainWhy(advice, kind) {
  const out = [];
  if (kind === 'claim') {
    out.push(t('adv.why.claim'));
    const r = advice.reason ?? {};
    if (r.key === 'gain') out.push(t('adv.why.gain', { before: r.before, after: r.after }));
    if (r.key === 'keepConcealed') out.push(t('adv.why.concealed'));
    if (r.key === 'noGain') out.push(t('adv.why.noGain', { before: advice.before, after: advice.after }));
    if (r.key === 'noYaku') out.push(t('adv.noYaku'));
    if (r.key === 'lowFan') out.push(t('adv.lowFan'));
    return out;
  }
  out.push(t('adv.why.discard'));
  out.push(t('adv.why.terms'));
  const rows = (advice.options ?? []).slice(0, 5).map((o) => t('adv.why.row', {
    tile: KIND_NAMES[o.kind], shanten: o.shanten, ukeire: o.total, pct: Math.round((o.chance ?? 0) * 100), danger: Math.round((o.danger ?? 0) * 100),
  }));
  out.push(...rows);
  return out;
}
