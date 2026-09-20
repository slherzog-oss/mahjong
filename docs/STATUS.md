# Stand der Umsetzung

Abgleich mit PLAN.md (Baustufen in Abschnitt 12). Stand: September 2026.

| Stufe | Inhalt | Status |
|---|---|---|
| 1 | Regel-Kern, Scoring nach Millington, Shanten/Ukeire, KI Mittel, UI Handy + Desktop, Store mit Undo und Autosave (IndexedDB), Berater, PWA-Grundausstattung, GitHub-Pages-Deployment | fertig |
| 2 | Schwierigkeitsstufen Anfänger/Mittel/Schwer nach Stockfish-Prinzip (Zugauswahl-Rauschen, keine Informationsvorteile; Eigenschaftstest "schummelt nicht"), kalibriert per Duplikat-Selbstspiel (`scripts/simulate.js`: ≈ 5 / 26 / 39 % Gewinnrate), Recherchebericht `docs/AI-RESEARCH.md`; mobiler Feinschliff (Safe Areas, Wake Lock, Install-Knopf, Querformat, Export/Import) | fertig |
| 3 | Hand-Lexikon (alle Scoring-Zeilen, Beispiele, Tipps, Übungshände), Handform-Wahrscheinlichkeiten, Panel "Mögliche Blätter", Spielziel mit Berater im Zielmodus, Monte-Carlo-Gewinnchance im Worker | fertig |
| 4 | Post-Game-Analyse: Replay aus Aktionsliste, Fehlerklassen, Chancen-Kurve, Entscheidungsdetails, Archiv | fertig |
| 5 | Riichi- und Hong-Kong-Module | offen (Regelwerk-Objekt und Scoring-Schnittstelle sind vorbereitet) |

## Querschnitt

- Sprachen: Deutsch und Englisch (Oberfläche, Berater, Lexikon, Tutorial).
- Regelwerk-Voreinstellungen Millington, BMJA, DMJL und eigene Regeln mit allen
  Optionen aus PLAN.md Abschnitt 13.
- Einführung (Tutorial) beim ersten Start, Lernmodus mit automatischer Empfehlung,
  Übungshände aus dem Lexikon mit passendem Spielziel.
- Töne (WebAudio), Animationen mit Reduced-Motion-Unterstützung, Tastaturbedienung,
  ARIA-Labels und Live-Status.
- Tests: `npm test` (Node ≥ 20, keine Abhängigkeiten), 104 Tests inkl.
  Eigenschaftstests, Zufallspartien, Worker-Protokoll und KI-Fairness; CI auf
  GitHub Actions. Zusätzlich lokale Headless-Rauchtests (zufällige Klicks über
  mehrere Hände, alle Bildschirme).

## Bekannte Grenzen

- Headless-Chromium mit virtueller Zeit blockiert bei Service Worker und Web
  Worker; Screenshots im Repo-Workflow nutzen `?noworker`. Echte Offline- und
  Installationstests gehören auf Geräte (Android Chrome, iOS Safari, Desktop).
- Optionale BMJA-Sonderhände (Wriggling Snake, Knitting), halbes Limit und
  DMJL-Strafen sind nicht umgesetzt; "Twofold Fortune" wird von der Engine nicht
  verfolgt.
- Die Monte-Carlo-Gewinnchance modelliert Gegner als Hazard-Prozess, nicht mit
  echten Händen; Werte sind Schätzungen mit ~3 Prozentpunkten Standardfehler.
