// Regelwerk-Voreinstellungen (siehe RESEARCH.md: Millington, BMJA, DMJL) und
// die Varianten Hong Kong Old Style und Riichi.
import { HONG_KONG, RIICHI } from './rules.js';

const VARIANT_DEFAULTS = {
  minFan: 3, hkPayment: 'half', redFives: true, kuitan: true, kiriageMangan: false, bustEnds: true,
};

export const RULE_PRESETS = {
  millington: {
    variant: 'classical', limit: 500, deadWallSize: 14, refillDeadWall: true, maxChows: 4, bonusTiles: false, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: false, robKongForThirteenOrphans: false, startScore: 0,
    optionalHands: false, penalties: false,
  },
  bmja: {
    variant: 'classical', limit: 1000, deadWallSize: 14, refillDeadWall: false, maxChows: 1, bonusTiles: true, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: false, robKongForThirteenOrphans: true, startScore: 0,
    optionalHands: true, penalties: false,
  },
  dmjl: {
    variant: 'classical', limit: 500, deadWallSize: 16, refillDeadWall: false, maxChows: 4, bonusTiles: true, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: true, robKongForThirteenOrphans: false, startScore: 0,
    optionalHands: false, penalties: true,
  },
};
for (const p of Object.values(RULE_PRESETS)) Object.assign(p, VARIANT_DEFAULTS);
const pick = (rs) => Object.fromEntries(Object.keys(RULE_PRESETS.millington).map((k) => [k, rs[k]]));
RULE_PRESETS.hongkong = pick(HONG_KONG);
RULE_PRESETS.riichi = pick(RIICHI);

export const RULE_FIELDS = Object.keys(RULE_PRESETS.millington);

/** Felder, die in der jeweiligen Variante Wirkung haben (für die Einstellungen). */
export const VARIANT_FIELDS = {
  classical: ['limit', 'deadWallSize', 'maxChows', 'startScore', 'bonusTiles', 'sevenPairs', 'dealerKeepsOnWin', 'dealerKeepsOnDraw', 'discarderPaysAll', 'losersPayEachOther', 'eastDoubles', 'loserHandDoubles', 'refillDeadWall', 'robKongForThirteenOrphans', 'optionalHands', 'penalties'],
  hongkong: ['minFan', 'hkPayment', 'deadWallSize', 'startScore', 'bonusTiles', 'sevenPairs', 'dealerKeepsOnWin', 'dealerKeepsOnDraw', 'refillDeadWall'],
  riichi: ['redFives', 'kuitan', 'kiriageMangan', 'bustEnds', 'startScore', 'robKongForThirteenOrphans'],
};

/** Voreinstellung für eine Variante. */
export function defaultPresetFor(variant) {
  return variant === 'hongkong' ? 'hongkong' : variant === 'riichi' ? 'riichi' : 'millington';
}

/** Name der Voreinstellung, deren Werte exakt passen, sonst 'custom'. */
export function presetOf(rules) {
  for (const [name, p] of Object.entries(RULE_PRESETS)) {
    if (RULE_FIELDS.every((k) => p[k] === rules[k])) return name;
  }
  return 'custom';
}
