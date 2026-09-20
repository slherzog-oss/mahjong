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

## Gefahr (`danger.js`)

`opponentTempo(state, seat)` schätzt aus offenen Sätzen, Spielfortschritt und
späten Mittelstein-Abwürfen, wie nahe ein Gegner am Gewinn ist.
`dangerOf(state, seat, kind, remaining)` liefert 0…1 aus Restkopien, Steinart
(Honours/Endsteine sicherer), eigenen Abwürfen des Gegners (sicherer gegen ihn)
und Farbverdacht bei offenen Sätzen.

## Abwurfbewertung (`evaluate.js`)

`evaluateDiscards(state, seat, weights)` kombiniert je Kandidat
Fertigstellungschance (relativ zum besten), Wertpotenzial (`valuePotential`:
Drachen-/Windpaare, Farbtendenz) und Gefahr (gewichtet mit dem Fortschritt) zu
einem Score. Berater und KI-Stufe Schwer nutzen dieselbe Funktion.

## Zielformen (`forms.js`)

`formDistance(form, kinds, melds, rs)` liefert Shanten-artige Distanzen für 16
Formen (Standard, verdeckt, nur Pungs, Half/Full Flush, Endsteine/Honours,
Drachen, Winde, Verborgener Schatz, verdeckte reine Farbe, nur Honours, nur
Endsteine, Kaiserliche Jade, Neun Tore, Dreizehn Waisen, Sieben Paare);
`Infinity` = unmöglich (z. B. offene Sätze bei verdeckten Formen).
`analyzeForms(state, seat)` bewertet alle Formen mit Chance, Wert und
erwartetem Wert (Panel "Mögliche Blätter"); `formDiscardOptions` und
`formKeepKinds` treiben den Berater im Zielmodus.

## Monte-Carlo (`montecarlo.js`, `worker.js`)

`simulate(state, seat, { runs })`: zufällige Restwände aus den unbekannten
Steinen; eigene Züge greedy (nützliche oder anschlussfähige Steine aufnehmen,
besten Abwurf wählen); Pung-Rufe und Chow-Rufe vom linken Nachbarn bei
Shanten-Gewinn; Gegner als Hazard-Modell aus `opponentTempo`. Ergebnis:
`complete` (fertig vor Wandende), `win` (fertig vor allen Gegnern),
mittlere Zugzahl, Standardfehler. 200 Läufe ≈ 0,7–1 s; läuft im Web Worker
(`worker.js`, Nachricht `mc`) und erscheint als "Gewinnchance" über der Hand.
Kalibrierung: frische Hand ≈ 80 % fertig, ≈ 30 % Gewinn (entspricht den
KI-gegen-KI-Simulationen mit ~30 % Gewinnrate je Sitz).
