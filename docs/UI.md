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
- Autosave nach jeder Änderung in `localStorage` (`mahjong.save.v1`),
  Einstellungen in `mahjong.settings.v1`. Umstellung auf IndexedDB folgt in
  Schritt 8.

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
