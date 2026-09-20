# Mahjong

Mahjong als Progressive Web App: Chinese Classical (nach A. D. Millington),
Hong Kong Old Style und Riichi auf einem gemeinsamen Regelkern. Reines
HTML/CSS/JavaScript, kein Build-Schritt, offline spielbar.

## Funktionen

- Spiel gegen drei KI-Gegner in drei Stufen; Regelwerke Chinese Classical
  (Voreinstellungen Millington, BMJA mit Sonderhänden, DMJL mit Strafen),
  Hong Kong Old Style (Fan, Mindest-Fan, Zahlungsschemata) und Riichi (Riichi,
  Furiten, Yaku, Dora, Honba) mit allen Regeloptionen
- Live-Berater mit Begründung, Fertigstellungs- und Gewinnchance (Monte-Carlo),
  Panel "Mögliche Blätter" mit wählbarem Spielziel
- Hand-Lexikon mit Beispielen, Tipps und Übungshänden; Einführung und Lernmodus
- Undo, Autosave (IndexedDB), Export/Import, Archiv und Post-Game-Analyse mit
  Fehlerklassen und Chancen-Kurve
- Deutsch und Englisch, Handy und Desktop, installierbar, offline

Stand der Umsetzung: `docs/STATUS.md`.

- `PLAN.md` — ausführlicher Projektplan
- `RESEARCH.md` — Recherche zu bestehenden Open-Source-Projekten
- `src/core` — Regel-Kern (Steine, Wand, Zustand, Aktionen, Hand-Validierung), siehe `docs/ENGINE.md`
- `src/scoring` — Scoring nach Millington, Hong Kong (Fan) und Riichi (Yaku/Han/Fu) mit Zahlungsmatrix, siehe `docs/SCORING.md`
- `src/analysis` — Shanten, Ukeire, Fertigstellungschance, siehe `docs/ANALYSIS.md`
- `src/ai` — KI-Gegner (easy/medium/hard) und Zug-Schleife, siehe `docs/AI.md`
- `src/ui`, `src/store` — Oberfläche, Store mit Undo und Autosave, siehe `docs/UI.md`
- `manifest.webmanifest`, `sw.js`, `src/ui/pwa.js` — installierbare PWA, siehe `docs/PWA.md`
- `src/advisor` — Berater mit Begründungen und Zielmodus
- `src/lexicon` — Hand-Lexikon (Daten), `src/replay` — Post-Game-Analyse
- `scripts/simulate.js` — KI-gegen-KI-Simulation zur Kalibrierung
- `tests` — Unit-Tests (`npm test`, Node >= 20, keine Abhängigkeiten)

## Entwicklung

```sh
npm test          # alle Tests
npm run serve     # statischer Server auf http://localhost:8080
npm run build:sw  # Precache-Liste für den Service Worker neu erzeugen
```
