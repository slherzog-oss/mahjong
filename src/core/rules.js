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

  // Hong Kong (variant 'hongkong')
  minFan: 3, // Mindest-Fan für Mahjong (0, 1, 3)
  hkPayment: 'half', // Abwurf: 'half' Abwerfender zahlt das Doppelte, 'full' das Dreifache

  // Riichi (variant 'riichi')
  redFives: true, // rote Fünfer als Dora
  kuitan: true, // Tanyao auch offen
  kiriageMangan: false, // 4 Han 30 Fu / 3 Han 60 Fu als Mangan
  bustEnds: true, // Spiel endet, wenn ein Spieler unter 0 fällt
});

/** Vorbelegungen je Variante (vollständige Regelwerke). */
export const HONG_KONG = Object.freeze({
  ...CHINESE_CLASSICAL,
  id: 'hong-kong-old-style',
  name: 'Hong Kong Old Style',
  variant: 'hongkong',
  bonusTiles: true,
  refillDeadWall: false,
  sevenPairs: false,
  optionalHands: false,
  penalties: false,
  eastDoubles: false,
  losersPayEachOther: false,
  discarderPaysAll: false,
  loserHandDoubles: false,
  startScore: 500,
});

export const RIICHI = Object.freeze({
  ...CHINESE_CLASSICAL,
  id: 'riichi',
  name: 'Riichi (Japanese)',
  variant: 'riichi',
  bonusTiles: false,
  deadWallSize: 14,
  refillDeadWall: true,
  rounds: 2, // Hanchan: Ost- und Südrunde
  startScore: 25000,
  dealerKeepsOnWin: true,
  dealerKeepsOnDraw: true, // nur wenn Ost wartend ist (Regelkern)
  maxChows: 4,
  sevenPairs: true,
  robKongForThirteenOrphans: false,
  optionalHands: false,
  penalties: false,
  eastDoubles: false,
  losersPayEachOther: false,
  discarderPaysAll: false,
  loserHandDoubles: false,
});

export const VARIANTS = ['classical', 'hongkong', 'riichi'];

export function baseRuleSetFor(variant) {
  return variant === 'hongkong' ? HONG_KONG : variant === 'riichi' ? RIICHI : CHINESE_CLASSICAL;
}

export function createRuleSet(overrides = {}) {
  return Object.freeze({ ...baseRuleSetFor(overrides.variant), ...overrides });
}
