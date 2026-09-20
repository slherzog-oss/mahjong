// Regelwerk-Objekt (RuleSet). Vorbelegung: Chinese Classical nach Millington.
// Alle Varianten aus PLAN.md Abschnitt 1.5 und 13 sind hier als Felder abgebildet.

export const CHINESE_CLASSICAL = Object.freeze({
  id: 'chinese-classical-millington',
  name: 'Chinese Classical (Millington)',
  variant: 'classical', // 'classical' | 'hongkong' | 'riichi' (Scoring-Modul und Sonderregeln)

  // Material und Ablauf
  bonusTiles: false, // Blumen und Jahreszeiten
  deadWallSize: 14, // Kong-Box
  refillDeadWall: true, // tote Wand aus der lebenden Wand nachfüllen
  rounds: 4, // Anzahl Rundenwinde (1 = Kurzspiel)
  startScore: 2000,
  dealerKeepsOnWin: true,
  dealerKeepsOnDraw: true,
  maxChows: 4, // BMJA: 1

  // Hände
  sevenPairs: false,
  robKongForThirteenOrphans: false, // verdeckten Kong für Thirteen Orphans rauben
  optionalHands: false, // BMJA-Sonderhände: Wriggling Snake, Knitting, Triple Knitting, All Pair Honours

  // Scoring
  limit: 500, // Option 1000
  mahjongPoints: 20,
  discarderPaysAll: false, // Abwerfender zahlt für alle
  losersPayEachOther: true,
  eastDoubles: true,
  loserHandDoubles: false, // Handform-Verdopplungen auch für Verlierer (DMJL)
  penalties: false, // DMJL "Gefährliches Spiel": wer offensichtlich gefährlich abwirft, zahlt für alle
});

export function createRuleSet(overrides = {}) {
  return Object.freeze({ ...CHINESE_CLASSICAL, ...overrides });
}
