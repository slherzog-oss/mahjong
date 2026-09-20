# Regel-Kern (`src/core`)

Reine Logik ohne DOM. Alle Funktionen deterministisch; Zufall nur über den
seedbaren Generator im Zustand.

## Module

| Datei | Inhalt |
|---|---|
| `tiles.js` | Steinarten (Index 0..33, Bonus 34..41), Stein-IDs (0..135, Bonus 136..143), Eigenschaften, Notation (`parseKinds`, `formatKinds`) |
| `rng.js` | sfc32-Generator mit serialisierbarem Zustand, `shuffle` |
| `rules.js` | `RuleSet`-Objekt, Vorbelegung Chinese Classical (Millington) |
| `wall.js` | Wand bauen, ziehen, Ersatzstein aus der toten Wand |
| `hand.js` | Zerlegung in Sätze + Paar (alle Varianten), Sonderhände, Warten, Handeigenschaften |
| `state.js` | Spielzustand, `applyAction`, `getLegalActions`, Phasen, Call-Auflösung, Protokoll |

## Zustand

`createGame({ seed, ruleSet, humanSeat })` erzeugt den Zustand. Sitze 0..3 sind
fest; der Sitzwind ergibt sich aus `seatWind(state, seat)`. Der Zustand wird nie
mutiert: `applyAction` liefert eine Kopie.

Phasen: `idle → discard (Ost nach Verteilung) → claiming → draw → discard → … →
handOver → idle | gameOver`.

## Aktionen

| Aktion | Phase | Felder |
|---|---|---|
| `startHand` | idle | – |
| `draw` | draw | `seat` |
| `discard` | discard | `seat`, `tile` (ID) |
| `kong` (concealed / extend) | discard | `seat`, `kind`, `variant`, `meldIndex` (extend) |
| `mahjong` | discard (Selbstzug) / claiming | `seat` |
| `pass`, `pung`, `kong` (open), `chow` | claiming | `seat`, `kinds` (chow: die zwei eigenen Arten) |
| `endHand` | handOver | – |
| `setTarget` | jede außer gameOver | `seat`, `form` (Handform-ID oder null); nur Protokoll |

Außerdem: `rigDeal(state, seat, kinds)` (Übungsverteilung direkt nach `startHand`,
wird als Aktion `rigDeal` protokolliert) und `replay({ seed, ruleSet, humanSeat,
actions })`, das ein Spiel aus `state.actions` exakt nachspielt.

In `claiming` melden alle drei Nicht-Abwerfer; sobald drei Meldungen vorliegen,
wird aufgelöst: Mahjong (nächster in Spielreihenfolge) > Pung/Kong > Chow > alle
passen. Ein Ergänzungs-Kong geht ebenfalls durch `claiming` (Kong-Raub möglich).

`getLegalActions(state, seat)` ist die einzige Wahrheit für UI, KI und Berater.
`seatsToAct(state)` nennt die Sitze, die gerade handeln müssen.

Bonussteine (wenn aktiv) werden beim Ziehen und Verteilen automatisch ausgelegt
und ersetzt; es gibt dafür keine eigene Aktion, nur ein Log-Ereignis `bonus`.

## Ergebnis

Nach Gewinn steht in `state.result`: `winner`, `from` (Abwerfender oder `null`
bei Selbstzug), `winningTile`, `selfDraw`, `kongReplacement`, `lastWallTile`,
`robbedKong`, `heavenly`, `earthly`. Das Scoring-Modul liest diese Felder.
`applyPayments(state, matrix)` verbucht die Zahlungsmatrix.

## Protokoll

`state.log` enthält je Ereignis `{ n, hand, type, … }`: `start_hand`, `deal`,
`draw`, `discard`, `chow`, `pung`, `kong`, `rob_kong`, `bonus`, `mahjong`,
`draw_game`, `end_hand`, `payments`, `game_over`. Zusammen mit `seed` ist jede
Partie vollständig reproduzierbar.

## Tests

`npm test` (Node ≥ 20, keine Abhängigkeiten). `tests/helpers.js` bietet
`rigGame` für Zustände mit vorgegebenen Händen in Kurznotation.
