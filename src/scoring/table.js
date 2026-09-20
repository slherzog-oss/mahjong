// Scoring-Tabelle: stabile IDs, Labels (DE/EN) und Werte.
// Wird von Scoring, Lexikon und Berater gemeinsam genutzt (PLAN.md Abschnitt 3).
//
// kind: 'points' | 'double' | 'limit'
// scope: 'all' (auch Verlierer) | 'winner'

export const SCORE_RULES = Object.freeze({
  // --- Punkte ---
  mahjong: { kind: 'points', scope: 'winner', value: 20, de: 'Mahjong', en: 'Mahjong' },
  pung_simple_open: { kind: 'points', scope: 'all', value: 2, de: 'Pung einfache Steine, offen', en: 'Pung of simples, exposed' },
  pung_simple_closed: { kind: 'points', scope: 'all', value: 4, de: 'Pung einfache Steine, verdeckt', en: 'Pung of simples, concealed' },
  pung_major_open: { kind: 'points', scope: 'all', value: 4, de: 'Pung Endsteine/Honours, offen', en: 'Pung of terminals/honours, exposed' },
  pung_major_closed: { kind: 'points', scope: 'all', value: 8, de: 'Pung Endsteine/Honours, verdeckt', en: 'Pung of terminals/honours, concealed' },
  kong_simple_open: { kind: 'points', scope: 'all', value: 8, de: 'Kong einfache Steine, offen', en: 'Kong of simples, exposed' },
  kong_simple_closed: { kind: 'points', scope: 'all', value: 16, de: 'Kong einfache Steine, verdeckt', en: 'Kong of simples, concealed' },
  kong_major_open: { kind: 'points', scope: 'all', value: 16, de: 'Kong Endsteine/Honours, offen', en: 'Kong of terminals/honours, exposed' },
  kong_major_closed: { kind: 'points', scope: 'all', value: 32, de: 'Kong Endsteine/Honours, verdeckt', en: 'Kong of terminals/honours, concealed' },
  pair_dragon: { kind: 'points', scope: 'all', value: 2, de: 'Paar Drachen', en: 'Pair of dragons' },
  pair_own_wind: { kind: 'points', scope: 'all', value: 2, de: 'Paar eigener Wind', en: 'Pair of own wind' },
  pair_round_wind: { kind: 'points', scope: 'all', value: 2, de: 'Paar Rundenwind', en: 'Pair of prevailing wind' },
  flower: { kind: 'points', scope: 'all', value: 4, de: 'Blume', en: 'Flower' },
  season: { kind: 'points', scope: 'all', value: 4, de: 'Jahreszeit', en: 'Season' },
  win_self_draw: { kind: 'points', scope: 'winner', value: 2, de: 'Gewinn durch Selbstzug', en: 'Winning by self-draw' },
  win_last_wall: { kind: 'points', scope: 'winner', value: 2, de: 'Gewinn mit letztem Wandstein', en: 'Winning with the last wall tile' },
  win_kong_replacement: { kind: 'points', scope: 'winner', value: 2, de: 'Gewinn mit Ersatzstein nach Kong', en: 'Winning with kong replacement tile' },
  win_rob_kong: { kind: 'points', scope: 'winner', value: 2, de: 'Gewinn durch Kong-Raub', en: 'Winning by robbing a kong' },
  win_pair_wait_simple: { kind: 'points', scope: 'winner', value: 2, de: 'Letzter Stein vervollständigt Paar (einfach)', en: 'Winning tile completes the pair (simple)' },
  win_pair_wait_major: { kind: 'points', scope: 'winner', value: 4, de: 'Letzter Stein vervollständigt Paar (Endstein/Honour)', en: 'Winning tile completes the pair (major)' },
  win_only_possible: { kind: 'points', scope: 'winner', value: 2, de: 'Gewinn mit dem einzig möglichen Stein', en: 'Winning with the only possible tile' },

  // --- Verdopplungen ---
  dbl_pung_dragon: { kind: 'double', scope: 'all', value: 1, de: 'Pung/Kong eines Drachen', en: 'Pung/kong of a dragon' },
  dbl_pung_own_wind: { kind: 'double', scope: 'all', value: 1, de: 'Pung/Kong des eigenen Windes', en: 'Pung/kong of own wind' },
  dbl_pung_round_wind: { kind: 'double', scope: 'all', value: 1, de: 'Pung/Kong des Rundenwindes', en: 'Pung/kong of prevailing wind' },
  dbl_own_flower_season: { kind: 'double', scope: 'all', value: 1, de: 'Eigene Blume und eigene Jahreszeit', en: 'Own flower and own season' },
  dbl_all_flowers: { kind: 'double', scope: 'all', value: 1, de: 'Alle vier Blumen', en: 'All four flowers' },
  dbl_all_seasons: { kind: 'double', scope: 'all', value: 1, de: 'Alle vier Jahreszeiten', en: 'All four seasons' },
  dbl_no_chow: { kind: 'double', scope: 'winner', value: 1, de: 'Kein Chow (nur Pungs)', en: 'No chows (all pungs)' },
  dbl_concealed: { kind: 'double', scope: 'winner', value: 1, de: 'Verdeckte Hand, Selbstzug', en: 'Fully concealed hand, self-drawn' },
  dbl_three_concealed_pungs: { kind: 'double', scope: 'winner', value: 1, de: 'Drei verdeckte Pungs', en: 'Three concealed pungs' },
  dbl_half_flush: { kind: 'double', scope: 'winner', value: 1, de: 'Eine Farbe mit Honours', en: 'Half flush' },
  dbl_full_flush: { kind: 'double', scope: 'winner', value: 3, de: 'Reine Farbe', en: 'Full flush' },
  dbl_terminals_honours: { kind: 'double', scope: 'winner', value: 1, de: 'Nur Endsteine und Honours', en: 'All terminals and honours' },
  dbl_little_three_dragons: { kind: 'double', scope: 'winner', value: 1, de: 'Drei kleine Drachen', en: 'Little three dragons' },
  dbl_little_four_winds: { kind: 'double', scope: 'winner', value: 1, de: 'Vier kleine Winde', en: 'Little four winds' },
  dbl_zero_point_hand: { kind: 'double', scope: 'winner', value: 1, de: 'Hand ohne Punkte (Hühnerhand)', en: 'Zero point hand' },

  // --- Limit-Hände ---
  lim_thirteen_orphans: { kind: 'limit', scope: 'winner', value: 1, de: 'Dreizehn Waisen', en: 'Thirteen Orphans' },
  lim_nine_gates: { kind: 'limit', scope: 'winner', value: 1, de: 'Neun Tore', en: 'Nine Gates' },
  lim_heavenly: { kind: 'limit', scope: 'winner', value: 1, de: 'Himmlische Hand', en: 'Heavenly Hand' },
  lim_earthly: { kind: 'limit', scope: 'winner', value: 1, de: 'Irdische Hand', en: 'Earthly Hand' },
  lim_four_kongs: { kind: 'limit', scope: 'winner', value: 1, de: 'Vier Kongs', en: 'Fourfold Plenty' },
  lim_all_honours: { kind: 'limit', scope: 'winner', value: 1, de: 'Nur Honours', en: 'All Honours' },
  lim_big_four_winds: { kind: 'limit', scope: 'winner', value: 1, de: 'Vier große Winde', en: 'Big Four Winds' },
  lim_big_three_dragons: { kind: 'limit', scope: 'winner', value: 1, de: 'Drei große Drachen', en: 'Big Three Dragons' },
  lim_hidden_treasure: { kind: 'limit', scope: 'winner', value: 1, de: 'Verborgener Schatz', en: 'Buried Treasure' },
  lim_concealed_full_flush: { kind: 'limit', scope: 'winner', value: 1, de: 'Verdeckte reine Farbe', en: 'Concealed Full Flush' },
  lim_heads_and_tails: { kind: 'limit', scope: 'winner', value: 1, de: 'Nur Endsteine', en: 'Heads and Tails' },
  lim_all_green: { kind: 'limit', scope: 'winner', value: 1, de: 'Kaiserliche Jade', en: 'Imperial Jade' },
  lim_plum_blossom: { kind: 'limit', scope: 'winner', value: 1, de: 'Pflaumenblüte vom Dach', en: 'Gathering Plum Blossom from the Roof' },
  lim_plucking_moon: { kind: 'limit', scope: 'winner', value: 1, de: 'Mond vom Meeresgrund', en: 'Plucking the Moon from the Sea' },
  lim_scratching_pole: { kind: 'limit', scope: 'winner', value: 1, de: 'Tragestange kratzen', en: 'Scratching a Carrying Pole' },
  lim_twofold_fortune: { kind: 'limit', scope: 'winner', value: 1, de: 'Doppeltes Glück', en: 'Twofold Fortune' },
  lim_seven_pairs: { kind: 'limit', scope: 'winner', value: 1, de: 'Sieben Paare', en: 'Seven Pairs' },
});

export function ruleLabel(id, lang = 'de') {
  return SCORE_RULES[id]?.[lang] ?? id;
}
