# Scoring-Modul (`src/scoring`)

Chinese Classical nach Millington, abgeglichen mit der Kajongg-Basistabelle
(siehe RESEARCH.md). Werte und Labels stehen in `table.js` (`SCORE_RULES`), die
Erkennung in `millington.js`.

## Schnittstelle

```js
import { scoreHand, scoreRound, settle } from './src/scoring/index.js';

// Eine Hand bewerten (Gewinner oder Verlierer)
const sheet = scoreHand({
  concealed, melds, bonus,        // Arten (Gewinner: inkl. Gewinnstein)
  seatWind, roundWind,            // 0..3
  winner: true, winningKind, selfDraw, lastWallTile, kongReplacement,
  robbedKong, heavenly, earthly, twofoldFortune,
}, ruleSet);
// sheet: { winner, lines: [{ id, kind, value, kinds? }], points, doubles, limit, total, sets, pair }

// Ganze Hand aus dem Spielzustand (Phase handOver, result.type === 'win')
const { sheets, payments, net } = scoreRound(state);
// payments[from][to], net[seat]; danach applyPayments(state, payments)
```

## Ablauf beim Gewinner

1. Alle Zerlegungen der Hand (aus `hand.js`) und alle Zuordnungen des
   Gewinnsteins (Paar, Pung, Chow) werden bewertet; die höchste zählt.
2. Ein verdeckter Pung, der mit einem Abwurf vervollständigt wurde, zählt als offen.
3. Kontext-Limits (Himmlische/Irdische Hand, Pflaumenblüte, Mond, Tragestange,
   Thirteen Orphans, Nine Gates) gelten unabhängig von der Zerlegung.
4. Punkte × 2^Verdopplungen, gekappt auf `ruleSet.limit`; Limit-Hände zählen
   genau das Limit.

## Verlierer

Zählen Pungs (verdeckte Drillinge in der Hand als verdeckter Pung), offene
Sätze, Paare aus Drachen/eigenem Wind/Rundenwind, Bonussteine und die
satzbezogenen Verdopplungen. Handform-Verdopplungen nur mit
`ruleSet.loserHandDoubles`.

## Zahlungen (`settle`)

- Gewinner erhält von jedem der drei anderen seinen Handwert
  (`discarderPaysAll`: nur der Abwerfende zahlt das Dreifache).
- `losersPayEachOther`: Verlierer begleichen paarweise die Differenz.
- `eastDoubles`: jede Transaktion mit Ost-Beteiligung wird verdoppelt.
- Invariante: Summe aller Nettowerte ist null.

## Optionen (Chinese Classical)

- `optionalHands` (BMJA): Wriggling Snake, Knitting, Triple Knitting, All Pair
  Honours; alle verdeckt, zählen das Limit (`lim_*` in `table.js`, Erkennung in
  `hand.js`, Distanzen in `shanten.js`/`forms.js`).
- `penalties` (DMJL "Gefährliches Spiel", `src/core/dangerous.js`): drei offene
  Sätze einer Farbe (Farbe und Honours gefährlich), zwei Drachen-Pungs (dritter
  Drache), drei Wind-Pungs (vierter Wind), drei offene Pungs aus
  Endsteinen/Honours. Ermöglicht ein solcher Abwurf das Mahjong, zahlt der
  Abwerfende für alle drei (`result.dangerousGame`), außer die ganze Hand
  bestand aus gefährlichen Steinen. Falsche Ansagen kann es in der App nicht
  geben; diese DMJL-Strafen entfallen.
- Twofold Fortune: der Regelkern zählt aufeinanderfolgende Kong-Ersatzsteine
  (`state.replacementChain`); Gewinn mit dem zweiten in Folge setzt
  `result.twofoldFortune`.

## Varianten (`ruleSet.variant`)

`src/scoring/index.js` wählt das Modul: `scoreRound(state)` und
`scoreLabel(id, lang)` funktionieren für alle Varianten. Punktezettel tragen
`variant` und Zeilen mit `kind` `points | double | limit` (klassisch),
`fan` (Hong Kong) bzw. `han | yakuman | dora | fu` (Riichi).

### Hong Kong Old Style (`hongkong.js`)

Gebräuchliche Fan-Tabelle (`HK_FANS`): Nur Chows 1, Nur Pungs 3, eine Farbe mit
Honours 3, reine Farbe 7, Drachen-/Wind-Pungs 1, kleine/große drei Drachen 5/8,
kleine/große vier Winde 6/13, Nur Honours 10, Nur Endsteine 10, Endsteine und
Honours 4, vier verdeckte Pungs (Selbstzug) 8, Dreizehn Waisen / Neun Tore /
vier Kongs / Himmlische / Irdische Hand 13 (Limit), Selbstzug 1, verdeckt 1,
letzter Stein / Ersatzstein / Kong-Raub 1, eigene Blume/Jahreszeit 1, alle vier
2, keine Bonussteine 1, Sieben Paare 4 (Option). Grundwert je Fan
(`HK_FAN_POINTS`, "halb scharf"): 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192,
256, 384. `minFan` (0/1/3) ist Gewinnbedingung (`getLegalActions` prüft
`fanOf`). Zahlung: Selbstzug zahlt jeder den Grundwert; Abwurf zahlt nur der
Abwerfende, `hkPayment` `half` das Doppelte, `full` das Dreifache. Nur der
Gewinner zählt.

### Riichi (`riichi.js`)

- Yaku (`RIICHI_YAKU`, Han verdeckt/offen): Riichi 1, Doppel-Riichi 2, Ippatsu
  1, Menzen Tsumo 1, Pinfu 1, Tanyao 1 (offen mit `kuitan`), Iipeikou 1,
  Yakuhai 1 je Pung, Rinshan/Chankan/Haitei/Houtei 1, Chiitoitsu 2 (25 Fu),
  Sanshoku 2/1, Ittsu 2/1, Chanta 2/1, Honroutou 2, Toitoi 2, Sanankou 2,
  Sanshoku Doukou 2, Sankantsu 2, Shousangen 2, Honitsu 3/2, Junchan 3/2,
  Ryanpeikou 3, Chinitsu 6/5. Yakuman (je 8000 Grundpunkte, addierbar): Kokushi,
  Suuankou, Daisangen, Shousuushii, Daisuushii, Tsuuiisou, Chinroutou,
  Ryuuiisou, Chuuren, Suukantsu, Tenhou, Chiihou. Dora, Ura-Dora (nur mit
  Riichi) und rote Fünfer (`redFives`) zählen je 1 Han, sind aber kein Yaku;
  `hasYaku` ist Gewinnbedingung.
- Fu: 20 Grund, +10 verdeckter Ron, +2 Tsumo, Pungs 2/4/8 (offen/verdeckt,
  Endstein/Honour doppelt, Kong vierfach), Yakuhai-Paar +2 je Eigenschaft,
  Tanki/Kanchan/Penchan +2, Pinfu 20/30, offene Hand mindestens 30, Aufrundung
  auf 10. Die Zerlegung mit den meisten Punkten zählt.
- Punkte: Fu × 2^(Han+2), gedeckelt (Mangan 2000, Haneman 3000, Baiman 4000,
  Sanbaiman 6000, Yakuman 8000, Kazoe-Yakuman ab 13 Han; `kiriageMangan`
  optional). Ron: Abwerfender zahlt 4× (Ost 6×); Tsumo: alle zahlen (Ost 2×,
  Ost als Gewinner 2× von allen); Aufrundung auf 100; Honba 300 je Zähler beim
  Ron, 100 je Zähler von jedem beim Tsumo. Riichi-Stäbchen gehen als `bonus` an
  den Gewinner (`applyPayments(state, payments, bonus)`).
- Unentschieden: `notenPayments` verteilt 3000 von den Nicht-Wartenden an die
  Wartenden.
