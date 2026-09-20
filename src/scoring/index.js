// Scoring-Einstieg: wählt das Modul nach ruleSet.variant.
export * from './table.js';
export { scoreHand, settle, netFromPayments } from './millington.js';
export { HK_FANS, HK_FAN_POINTS, HK_LIMIT_FAN, scoreHandHK, settleHK, fanOf } from './hongkong.js';
export { RIICHI_YAKU, scoreHandRiichi, settleRiichi, hasYaku, riichiPoints } from './riichi.js';
import { scoreRound as scoreRoundMillington } from './millington.js';
import { scoreRoundHK, HK_FANS } from './hongkong.js';
import { scoreRoundRiichi, RIICHI_YAKU } from './riichi.js';
import { SCORE_RULES } from './table.js';

/** Bewertung einer beendeten Hand nach der Variante des Regelwerks. */
export function scoreRound(state, ruleSet = state.ruleSet) {
  switch (ruleSet.variant) {
    case 'hongkong': return scoreRoundHK(state, ruleSet);
    case 'riichi': return scoreRoundRiichi(state, ruleSet);
    default: return scoreRoundMillington(state, ruleSet);
  }
}

/** Label einer Scoring-Zeile in allen Varianten. */
export function scoreLabel(id, lang = 'de') {
  const r = SCORE_RULES[id] ?? HK_FANS[id] ?? RIICHI_YAKU[id];
  return r?.[lang] ?? r?.de ?? id;
}
