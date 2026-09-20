# Mahjong

Chinese Classical Mahjong (nach A. D. Millington) als Progressive Web App.
Reines HTML/CSS/JavaScript, kein Build-Schritt, offline spielbar.

- `PLAN.md` — ausführlicher Projektplan
- `RESEARCH.md` — Recherche zu bestehenden Open-Source-Projekten
- `src/core` — Regel-Kern (Steine, Wand, Zustand, Aktionen, Hand-Validierung), siehe `docs/ENGINE.md`
- `src/scoring` — Scoring nach Millington mit Zahlungsmatrix, siehe `docs/SCORING.md`
- `tests` — Unit-Tests (`npm test`, Node >= 20, keine Abhängigkeiten)

## Entwicklung

```sh
npm test          # alle Tests
npm run serve     # statischer Server auf http://localhost:8080
```
