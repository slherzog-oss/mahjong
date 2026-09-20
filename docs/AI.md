# KI-Gegner (`src/ai`)

`chooseAction(state, seat, { difficulty, rng })` → Aktion. Nutzt ausschließlich
`getLegalActions` und die Analyse-Engine; deterministisch bei gleichem
Zufallszustand. `stepAI`/`runUntilHuman` leiten den KI-Zufall aus Seed und
Zugnummer ab (`aiRngFor`), damit der Spielzufall unberührt bleibt und Replays
aus der Aktionsliste exakt sind.

## Stärkeregelung (nach Stockfish-Prinzip, siehe docs/AI-RESEARCH.md)

Die Stufen unterscheiden sich nicht in der Information (alle sehen nur eigene
Hand, Abwürfe, offene Sätze, Wandzähler; Eigenschaftstest "schummelt nicht"),
sondern in der Zugauswahl: `SKILL` in `player.js` streut die Wahl mit
zufälligem Bias über die besten `topN` Abwürfe (`skill` 1 = immer der beste).
Duplikat-Simulation (`node scripts/simulate.js 400 easy medium hard medium`):
Anfänger ≈ 5 %, Mittel ≈ 26 %, Schwer ≈ 39 % Gewinnrate je Hand.

## Stufen

| Stufe | Abwurf | Calls | Defensive |
|---|---|---|---|
| `easy` | zufällig aus Einzelsteinen | ruft jeden Kong/Pung/Chow | keine |
| `medium` (Vorbelegung) | bester Shanten, dann größtes Ukeire; spät im Spiel unter gleichwertigen Kandidaten der sicherste | nur bei Shanten-Gewinn; Chow nur bei Shanten ≤ 3 und nicht, wenn die Hand noch verdeckt und nahe (≤ 2) ist | Gefahrenwert aus Restkopien, Honours/Endsteinen und offenen Sätzen der Gegner |
| `hard` | Abwurfbewertung aus Chance, Wertpotenzial und Gefahr (`evaluateDiscards`), dazu Zweitordnungs-Ukeire für die drei besten Kandidaten; kein Rauschen | wie medium | stärker gewichtet |

Alle Stufen sagen Mahjong an, sobald es legal ist. Verdeckte und Ergänzungs-Kongs
werden genommen, wenn der Shanten dadurch nicht steigt. `medium` wirft mit
5 % Wahrscheinlichkeit den zweitbesten Stein (menschlicher Fehler).

Die Parameter stehen in `AI_PARAMS` (`player.js`) und sind der Ansatzpunkt für
Stufe 2 (Kalibrierung über KI-gegen-KI-Simulationen, Wertbewertung).

## Varianten

- **Riichi:** wartende Hände sagen Riichi an (`bestRiichi`: der Abwurf mit den
  meisten Wartesteinen). Rufe nur, wenn die Hand danach noch ein Yaku erreichen
  kann (`analysis/yaku.js`: Tanyao, Yakuhai, Honitsu/Chinitsu, Toitoi,
  Chanta). Gegen Riichi-Spieler gilt Tempo 1; ihre eigenen Abwürfe und alles
  seit dem Riichi Abgeworfene ist sicher (Furiten), Suji senkt die Gefahr,
  sonst steigt sie; die Abwurfbewertung verteidigt dann wie im späten Spiel.
- **Hong Kong:** mit Mindest-Fan ≥ 3 bewerten auch `medium` die Abwürfe mit
  höherem Wert-, Farb- und Honours-Gewicht; Rufe nur, wenn die Fan-Prognose
  (`fanPotentialHK`) die Mindest-Fan erreichbar hält.
- **DMJL-Strafen:** offensichtlich gefährliche Abwürfe werden gemieden, solange
  Alternativen bestehen.

## Zug-Schleife (`runner.js`)

- `stepAI(state, options)` führt genau eine KI-Aktion aus (erster KI-Sitz, der
  handeln muss) oder liefert `null`, wenn nur Menschen dran sind.
- `runUntilHuman(state, options)` spielt, bis ein Mensch handeln muss oder die
  Phase `handOver` / `gameOver` / `idle` erreicht ist. `options.difficulty` kann
  ein String oder eine Funktion `seat → Stufe` sein; `options.onStep` wird nach
  jedem Zug aufgerufen (für Animationen im UI).

Welche Sitze KI sind, entscheidet `players[seat].human` (oder `options.isAI`).

## Tests

- "Nani Kiru?"-Fixtures in `tests/nanikiru/*.json`: Hand + erwarteter Abwurf.
- Call-Entscheidungen, Kong-Annahme, Determinismus, ganze Partien mit
  gemischten Stufen, ein Vergleich gegen Zufallsspieler und der Test
  "schummelt nicht" (fremde Hände und Wand permutiert, Entscheidung identisch).
