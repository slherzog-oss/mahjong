# UI und Store (`src/ui`, `src/store`, `src/i18n`)

Reines HTML/CSS/JS ohne Build-Schritt. `index.html` lädt `src/ui/app.js` als
ES-Modul. Start: `npm run serve` und http://localhost:8080/ öffnen.

## Store (`src/store/store.js`)

`createStore({ storage })` hält Spielzustand, Verlauf, Einstellungen und das
letzte Abrechnungsergebnis; das UI abonniert über `subscribe(fn)`.

- `newGame({ seed, humanSeat })`, `dispatch(action)` (validiert gegen
  `getLegalActions`), `nextHand()`, `undo()`, `quit()`, `load()`, `hasSave()`.
- Nach jeder menschlichen Aktion spielt die KI per `stepAI` mit Verzögerung
  (`settings.aiDelayMs`, 0 = sofort) weiter, bis der Mensch dran ist.
- Bei `handOver` wird die Hand automatisch abgerechnet (`scoreRound` +
  `applyPayments`); `lastScore` enthält Punktezettel, Zahlungsmatrix und Bilanz.
- Undo springt zum letzten Zustand, in dem der Mensch handeln musste (nicht nur
  einen KI-Zug zurück). Verlauf wird pro Hand geleert.
- Autosave nach jeder Änderung über einen asynchronen Persistenz-Adapter
  (`src/store/persistence.js`): IndexedDB (Datenbank `mahjong`, Stores `saves`
  und `archive`), Fallback localStorage, dann Speicher. Überlappende
  Schreibvorgänge werden zusammengefasst; `flush()` wartet auf den letzten.
  Einstellungen liegen synchron in `localStorage` (`mahjong.settings.v1`).
- Spielstand-Format mit `version`; `migrate()` im Store ist die Stelle für
  spätere Formatänderungen. `checkSave()` prüft beim Start asynchron, ob ein
  Spielstand existiert ("Fortsetzen").
- Beendete Partien wandern ins Archiv (`archive`): Seed, Regelwerk, Sitz,
  Endstände, vollständiges Protokoll. `listArchive()` liefert sie sortiert;
  Grundlage für die Post-Game-Analyse.
- Export/Import: `exportSave()` liefert JSON (Download-Knopf im
  Abrechnungsbildschirm), `importSave(text)` lädt eine Datei (Startbildschirm).
- Beim ersten "Neues Spiel" fragt die App `navigator.storage.persist()` an,
  damit der Browser die Daten nicht bei Platzmangel räumt.

## Rendering (`src/ui/render.js`)

Reine Funktionen Zustand → HTML: Startbildschirm mit Einstellungen, Spieltisch,
Abrechnung, Spielende. Ereignisse per Delegation in `app.js` (`data-action`).
Steine als `<img>` aus `src/ui/tiles/*.svg` (FluffyStuff, CC0), Rückseite
`Back.svg`, Bonussteine als `Blank.svg` mit Text.

Spieltisch: drei Gegner oben (rechts, gegenüber, links vom Menschen), Status in
der Mitte, unten eigene Abwürfe, Sätze, Hand (gezogener Stein abgesetzt) und
Aktionsleiste. Über der Hand die Fertigstellungschance, Shanten und Ukeire.

Bedienung: Stein antippen wählt, zweites Antippen oder "Abwerfen" wirft ab
(Einstellung "Abwurf bestätigen"). Tastatur: Pfeile, Enter, `u` Undo,
`h` Empfehlung. Empfehlung: bester Abwurf nach Shanten/Ukeire, bei Calls die
Entscheidung der Stufe "Schwer".

## Dev-Einstiege

- `index.html#new=SEED` startet sofort ein Spiel mit Seed.
- `index.html#auto=SEED` lässt nur KI-Sitze spielen (Abrechnung sofort sichtbar).
- `window.__mahjong` bietet `store` und `ui` in der Konsole.

Rauchtest ohne Playwright-Paket: vorinstalliertes Chromium headless mit
`--screenshot` gegen den Dev-Server (Hinweis: Headless erzwingt mindestens
500 px Breite; echte Handybreite braucht Geräteemulation).

## Weitere Bildschirme

- **Lexikon** (`src/ui/lexicon.js`, Daten in `src/lexicon/hands.js`): Suche,
  Filter nach Kategorie, aufklappbare Karten mit Beispielhand, Tipp, Wert und
  Seltenheit; "Üben" startet eine Übungshand (`store.newPractice`) nahe an der
  Form, mit passendem Spielziel.
- **Mögliche Blätter** (im Spiel, `renderFormsPanel`): Formen mit Chance, Wert
  und erwartetem Wert; "Ziel" setzt das Spielziel (`store.setTarget`, Aktion
  `setTarget` im Protokoll), der Berater bewertet dann nach dieser Form und
  markiert Steine als halten/entbehrlich; Warnung, wenn das Ziel unter 2 % fällt.
- **Analyse** (`src/ui/analysis.js`, Logik in `src/replay/analyzer.js`): Liste
  (aktuelle Partie, Archiv), Genauigkeit und Fehlerklassen, Chancen-Kurve als
  SVG mit Markern, Entscheidungsliste, Detail mit gespieltem und besserem Stein.
- **Gewinnchance**: Monte-Carlo im Worker (`src/analysis/worker.js`), Anzeige
  neben der Fertigstellungschance, neu berechnet je Entscheidungspunkt.

## Dev-Server

`scripts/serve.js` liefert zusätzlich `/__delay?ms=N` (verzögerte Antwort), um
in Headless-Tests das `load`-Ereignis zu halten, bis asynchrone Ergebnisse
(Worker, IndexedDB) vorliegen.
