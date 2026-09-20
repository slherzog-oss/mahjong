# Analyse-Engine (`src/analysis`)

Grundlage für Berater, KI und Post-Game-Analyse (PLAN.md Abschnitt 4).

## Shanten (`shanten.js`)

`shanten(concealedKinds, meldCount, ruleSet)` → `{ standard, orphans, sevenPairs, min, form }`

- Standardform: je Farbe werden alle Zerlegungen in (Sätze, Teilsätze, Paar)
  aufgezählt (Pareto-Menge, gecacht), die vier Gruppen kombiniert und
  `8 − 2·Sätze − min(Teilsätze, 4 − Sätze) − Paar` gebildet. Offene Sätze
  zählen als fertige Sätze.
- Thirteen Orphans: `13 − verschiedene Waisen − Paar`, nur ohne offene Sätze.
- Seven Pairs (Option): `6 − Paare + max(0, 7 − verschiedene Arten)`.
- Werte: −1 fertig, 0 wartend, 1…8.

Eigenschaften, die Tests absichern: Shanten 0 genau dann, wenn `waitingKinds`
nicht leer ist; −1 genau dann, wenn `isWinningHand`; ein gezogener Stein senkt
den Shanten um höchstens 1.

## Ukeire (`ukeire.js`)

- `visibleCounts(state, seat)` → sichtbare Steine (eigene Hand, Abwürfe, Sätze)
  und Zahl der unbekannten Steine.
- `ukeire(concealedKinds, meldCount, ruleSet, remaining)` für 3n+1 Steine:
  Arten, die den Shanten senken, gewichtet mit der Restverfügbarkeit.
- `discardOptions(concealedKinds, …)` für 3n+2 Steine: je Abwurfkandidat der
  Shanten danach und das Ukeire; sortiert nach Shanten, dann Ukeire.

Leistung: eine vollständige Abwurfbewertung (bis 14 Kandidaten × 34 Arten)
liegt bei etwa 0,7 ms in Node.

## Fertigstellungschance (`probability.js`)

`completionChance({ shanten, ukeireTotal, unseen, drawsLeft })` → 0…1

Kettenmodell: die Hand braucht `shanten + 1` Verbesserungen. Nützliche Steine
je Stufe werden vom aktuellen Ukeire linear auf ein typisches Warten von 5
Steinen interpoliert; je eigenem Zug gilt Trefferchance `u_j / R_t`, wobei die
unbekannten Steine pro Runde um 4 abnehmen. Näherung für die Anzeige nach jedem
Zug; die Monte-Carlo-Rechnung kommt in Stufe 3.

## Noch offen

Wertbewertung (erwartete Punkte je Abwurf), Gefahrenbewertung, Distanzen zu
weiteren Zielformen (Flush, All Pungs, Nine Gates), Gewinnchance gegen Gegner.
