// Regelwerk-Voreinstellungen (siehe RESEARCH.md: Millington, BMJA, DMJL).
export const RULE_PRESETS = {
  millington: {
    limit: 500, deadWallSize: 14, refillDeadWall: true, maxChows: 4, bonusTiles: false, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: false, robKongForThirteenOrphans: false, startScore: 2000,
    optionalHands: false, penalties: false,
  },
  bmja: {
    limit: 1000, deadWallSize: 14, refillDeadWall: false, maxChows: 1, bonusTiles: true, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: false, robKongForThirteenOrphans: true, startScore: 2000,
    optionalHands: true, penalties: false,
  },
  dmjl: {
    limit: 500, deadWallSize: 16, refillDeadWall: false, maxChows: 4, bonusTiles: true, sevenPairs: false,
    dealerKeepsOnWin: true, dealerKeepsOnDraw: true, discarderPaysAll: false, losersPayEachOther: true,
    eastDoubles: true, loserHandDoubles: true, robKongForThirteenOrphans: false, startScore: 2000,
    optionalHands: false, penalties: true,
  },
};

export const RULE_FIELDS = Object.keys(RULE_PRESETS.millington);

/** Name der Voreinstellung, deren Werte exakt passen, sonst 'custom'. */
export function presetOf(rules) {
  for (const [name, p] of Object.entries(RULE_PRESETS)) {
    if (RULE_FIELDS.every((k) => p[k] === rules[k])) return name;
  }
  return 'custom';
}
