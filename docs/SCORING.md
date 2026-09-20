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

## Nicht umgesetzt (Optionen aus dem Plan)

BMJA-Sonderhände (Wriggling Snake, Knitting, Gates of Heaven), halbes Limit,
DMJL-Strafen, Original Call. `twofoldFortune` wird nur gewertet, wenn der
Aufrufer das Flag setzt; die Engine verfolgt es noch nicht.
