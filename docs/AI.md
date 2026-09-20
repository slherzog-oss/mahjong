# KI-Gegner (`src/ai`)

`chooseAction(state, seat, { difficulty, rng })` → Aktion. Nutzt ausschließlich
`getLegalActions` und die Analyse-Engine; deterministisch bei gleichem
Zufallszustand (Vorbelegung: `state.rng`).

## Stufen

| Stufe | Abwurf | Calls | Defensive |
|---|---|---|---|
| `easy` | zufällig aus Einzelsteinen | ruft jeden Kong/Pung/Chow | keine |
| `medium` (Vorbelegung) | bester Shanten, dann größtes Ukeire; spät im Spiel unter gleichwertigen Kandidaten der sicherste | nur bei Shanten-Gewinn; Chow nur bei Shanten ≤ 3 und nicht, wenn die Hand noch verdeckt und nahe (≤ 2) ist | Gefahrenwert aus Restkopien, Honours/Endsteinen und offenen Sätzen der Gegner |
| `hard` | wie medium, strengere Parameter, keine Fehlerinjektion | wie medium | stärker gewichtet |

Alle Stufen sagen Mahjong an, sobald es legal ist. Verdeckte und Ergänzungs-Kongs
werden genommen, wenn der Shanten dadurch nicht steigt. `medium` wirft mit
5 % Wahrscheinlichkeit den zweitbesten Stein (menschlicher Fehler).

Die Parameter stehen in `AI_PARAMS` (`player.js`) und sind der Ansatzpunkt für
Stufe 2 (Kalibrierung über KI-gegen-KI-Simulationen, Wertbewertung).

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
  gemischten Stufen, und ein Vergleich: `medium` gewinnt gegen drei
  Zufallsspieler praktisch jede entschiedene Hand (~30 ms je Hand).
