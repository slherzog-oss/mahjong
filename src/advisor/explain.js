// Klartext-Begründungen für den Berater (Deutsch über i18n).
import { KIND_NAMES, SUITS } from '../core/tiles.js';
import { t } from '../i18n/de.js';

const suitName = (s) => t('suitNames')[s] ?? SUITS[s];

/** Begründung für den besten Abwurf, als Liste kurzer Sätze. */
export function explainDiscard(advice) {
  const { best, alternatives, progress } = advice;
  const out = [];
  out.push(t('adv.best', { tile: KIND_NAMES[best.kind], shanten: best.shanten, ukeire: best.total, pct: Math.round(best.chance * 100) }));
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
  return out;
}

export function explainClaim(advice) {
  const { action, reason } = advice;
  const name = action.type === 'pass' ? t('pass') : t(action.type);
  switch (reason.key) {
    case 'mahjong': return [t('advisorMahjong')];
    case 'gain': return [t('adv.claimGain', { action: name, before: reason.before, after: reason.after }), ...(reason.opensHand ? [t('adv.opensHand')] : [])];
    case 'keepConcealed': return [t('adv.keepConcealed', { shanten: reason.before })];
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
