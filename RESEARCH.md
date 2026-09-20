# Recherche: Existierende Open-Source-Mahjong-Projekte

Stand: September 2026. Ziel der Recherche: Was lässt sich für eine Chinese-Classical-App
(Millington) direkt übernehmen, was dient als Referenz, was ist nicht brauchbar.

Bewertungsskala: **Übernehmen** (Code/Assets direkt nutzen), **Referenz** (Regeln,
Zahlen, Algorithmen abschreiben oder gegenprüfen), **Nicht relevant**.

---

## 1. Komplette Spiele mit Chinese Classical

### Pomax/mahjong — Referenz, ggf. Code-Teile übernehmen
- https://github.com/Pomax/mahjong
- Reines HTML/CSS/JS ohne Build-Schritt, läuft offline; genau der Technikansatz unseres
  Plans. 4-Spieler-Mahjong mit Autoplay-Bots, Tests per Node.
- Regelwerke: **Chinese Classical** und Cantonese. Struktur `src/js/core/scoring/`:
  `ruleset.js` (Basisklasse), `chinese-classical.js`, `cantonese.js`,
  `limit-hands.js`, `faan-laak-table.js`.
- Chinese-Classical-Implementierung (aus `chinese-classical.js`):
  - Startpunkte 2000, Limit 1000, "Ost verdoppelt", "Verlierer zahlen untereinander".
  - Pung: einfache 2/4 (offen/verdeckt), Endsteine und Honours 4/8; Kong doppelt so viel
    (8 bis 32). Drachen-Pung 1 Verdopplung, eigener Wind und Rundenwind je 1.
  - Paar aus Drachen / eigenem Wind / Rundenwind: 2 Punkte.
  - Verdopplungen: Chow-Hand, Half Flush, Full Flush (3), All Pungs, verdeckte Hand,
    letzter Stein. Limit-Hände: All Kongs, Three Great Scholars, Big Four Winds,
    All Green.
  - **Abweichung zu Millington:** nur 10 Punkte für Mahjong (Millington 20).
- Lizenz: im Repo nicht eindeutig ermittelbar (kein LICENSE im Root gefunden). Vor
  Code-Übernahme prüfen; sonst nur als Referenz für Struktur und Testfälle nutzen.
- Nützlich: Aufbau als Ruleset-Basisklasse mit austauschbaren Regelwerken bestätigt
  unser Modul-Design (Abschnitt 3.6 im Plan). Die Scoring-Unit-Tests eignen sich als
  Gegenprobe für unsere eigenen Tests.

### KDE Kajongg — Referenz (beste Regel-Datenbasis)
- https://github.com/KDE/kajongg, Python, GPL-2.
- Regelwerke als **Datenstruktur** (`src/predefined.py`): Basis "Classical Chinese"
  plus Varianten DMJL (Deutsche Mah-Jongg Liga) und BMJA (British Mah-Jong Association).
- Basis-Regeltabelle (weitgehend Millington-konform), vollständig in Abschnitt 3 dieses
  Dokuments übernommen. Sie ist unsere **primäre Referenz für die Scoring-Tabelle**.
- Enthält auch die Sonderhände mit Namen und Wertung (Nine Gates, Thirteen Orphans,
  Hidden Treasure, Heads and Tails, Fourfold Plenty, Three Great Scholars, Four Blessings,
  Imperial Jade, Gathering Plum Blossom, Plucking Moon, Scratching Pole, Twofold Fortune).
- Bestätigt außerdem: Kajongg nutzt Limit 500, Kong-Box 16, Bonussteine an.
  BMJA-Variante: Limit 1000, Kong-Box 14, max. 1 Chow, Pflicht zur Calling-Ansage.
- Code selbst (Python, KDE-gebunden) nicht übernehmbar; die Regeldaten sind es.

### XMJ (Julian Bradfield) — Referenz für Regeltext
- https://mahjong.julianbradfield.org/, Mirror https://github.com/passcod/mah-jong
- C, Chinese Classical mit KI-Spieler (`mj-player`) und Netzwerkspiel. Seit Jahren nicht
  mehr entwickelt, Mirror 2024 archiviert. Enthält eine `rules.txt` mit vollständigem
  Chinese-Classical-Regeltext; als Gegenprobe für Randfälle (Kong-Raub, tote Wand,
  Goulash) heranziehen.

---

## 2. Shanten / Ukeire / Analyse

### mahjong-tile-efficiency (garyleung142857) — Übernehmen als Vorlage, MIT
- https://github.com/garyleung142857/mahjong-tile-efficiency (npm gleichen Namens)
- JavaScript, MIT. `tilesToHand()` + `RuleSet.calShanten()` / `calUkeire()`.
- Handformat: Zähl-Matrix je Farbe (`[man[9], pin[9], sou[9], honours[7]]`).
- Unterstützt Standardform, Seven Pairs, Thirteen Orphans, Knitted, HK-Sonderformen;
  Regelwerke Menzu, HK, Riichi, ZungJung, MCR, Taiwan, HKTW. Unterscheidet Zieh- und
  Abwurfphase (3n+1 / 3n+2), liefert beim Abwurf `normalDiscard` / `recedingDiscard`.
- Kein Chinese Classical, aber die Standardform-Shanten ist regelunabhängig. Plan:
  Zähl-Matrix-Format übernehmen, Algorithmus als Vorlage für unsere eigene
  Implementierung (wegen Wert-Bewertung und Sonderhände brauchen wir ohnehin Eigenes).
- Live-Rechner dazu: https://github.com/garyleung142857/cal-shanten-beta

### MahjongRepository/mahjong (Python) — Referenz
- https://github.com/MahjongRepository/mahjong — Riichi-Handrechner mit Shanten.
  Gut dokumentierter Referenzalgorithmus (rekursive Farbzerlegung mit Cache), zum
  Gegenprüfen unserer Shanten-Werte in Tests.

### "A Fast Algorithm for Computing the Deficiency Number of a Mahjong Hand" — Referenz
- arXiv 2108.06832. Beschreibt eine schnelle Shanten-Berechnung, regelunabhängig
  formuliert. Für die Tabellen-Vorberechnung (Plan 4.7) heranziehen.

---

## 3. KI und Wahrscheinlichkeiten

### AlphaJong (Jimboom7) — Referenz für Heuristik-Aufbau, GPL-3
- https://github.com/Jimboom7/AlphaJong — Browser-Userscript, reines JS ohne
  Bibliotheken, heuristische KI (keine ML), simuliert einige Züge voraus.
- Justierbare Konstanten für Handbewertung und Defensive, "Performance Mode" 0–4,
  Testfälle im "Nani Kiru?"-Format (Welchen Stein wirfst du?). Dieses Testformat
  übernehmen wir für Berater- und KI-Tests.
- GPL-3: kein Code kopieren, Struktur der Bewertungskonstanten als Vorbild.

### Akagi (shinkuan) — Referenz
- https://github.com/shinkuan/Akagi — Analysewerkzeug mit Shanten, Warten,
  Gewinnrate ("agari rate") und Risikomodell; zeigt, wie Live-Empfehlungen im UI
  dargestellt werden (Prozentbalken je Abwurf). Vorbild für unser Berater-Panel.

### Mortal / Libriichi, Mjai-Protokoll — Referenz
- Rust-Simulator und Trainingsframework für Riichi-KI, Mjai als JSON-Ereignisprotokoll.
  Für Chinese Classical nicht direkt nutzbar. Das **Mjai-Protokollformat** (eine
  JSON-Zeile je Ereignis: `tsumo`, `dahai`, `pon`, `chi`, `kan`, `hora`, `ryukyoku`)
  ist ein gutes Vorbild für unser `GameLog` (Plan 2.5).

### Monte-Carlo-Ansätze — Referenz
- Mizukami/Tsuruoka, "Building a Computer Mahjong Player Based on Monte Carlo
  Simulation and Opponent Models" (CIG 2015): Gewinnwahrscheinlichkeit und
  erwarteter Wert per Simulation der Restwand, Gegner per einfachem Modell. Genau der
  Ansatz für unsere "genaue" Prozentrechnung (Plan 4.6).
- MahjongSoul-Analyzer (FishHeadswg): gewichtete Wahrscheinlichkeiten möglicher
  Gewinnhände; entspricht unserem Panel "Mögliche Blätter".
- Kymi808/mahjong-ai: Wettbewerbs-KI für Riichi und MCR, nützlich als Beispiel für
  eine regelwerk-übergreifende KI-Architektur.

---

## 4. Steingrafiken

| Projekt | Lizenz | Inhalt | Bewertung |
|---|---|---|---|
| FluffyStuff/riichi-mahjong-tiles | CC0 | SVG + PNG, Varianten "Regular" und "Black", 582 Sterne | **Übernehmen** (Standardwahl) |
| tempai-dev/riichi-mahjong-tiles-svg | MIT oder Public Domain | zwei nachgezeichnete SVG-Sets, unfertig | Alternative |
| rutopio/mahjong-font | MIT / SIL OFL | Font, Notation → Inline-SVG | Für Lexikon-Texte und Handbeispiele im Fließtext |
| ArtemNikolaev/mahjong-tiles-svg, taksuyu/tile-art | prüfen | SVG-Sets | Alternative |

- Alle Sets sind Riichi-orientiert, decken aber die 34 Grundsteine (3 Farben, Winde,
  Drachen) ab. **Blumen und Jahreszeiten** und Rückseiten müssen ggf. selbst ergänzt
  werden; FluffyStuff enthält nach Repo-Beschreibung die Standardsteine, Blumen vor
  Nutzung prüfen.
- Entscheidung: FluffyStuff (CC0) als Basis, eigene Ergänzungen für Blumen/Jahreszeiten
  und Rückseite im gleichen Stil.

---

## 5. Sonstige Treffer, nicht relevant
- Mahjong-Solitaire-Projekte (ffalt/mah, ScriptRaccoon) — anderes Spiel.
- pauls-gh/mahjong (American Mahjong, Phaser) — anderes Regelwerk, Framework-Abhängig.
- JMHC — MCR (Chinese Official), nicht Chinese Classical.
- Mahjax, Kanachan, Phoenix — RL-Forschung, für uns zu schwer und Riichi-spezifisch.

---

## 6. Konsequenzen für den Plan

1. **Scoring-Tabelle** aus Kajongg-Basis "Classical Chinese" übernehmen, mit Millington
   gegenprüfen, Abweichungen als Optionen führen (siehe PLAN.md Abschnitt 3).
   Wichtige Abweichungen zwischen Quellen: Mahjong-Grundpunkte 20 (Millington, Kajongg)
   vs. 10 (Pomax); Limit 500 (Kajongg, Millington-Standardtisch) vs. 1000 (BMJA, Pomax);
   Kong-Box 16 (Kajongg) vs. 14 (BMJA).
2. **Shanten-Engine** selbst schreiben, Handformat und Algorithmusstruktur von
   mahjong-tile-efficiency (MIT) übernehmen, Ergebnisse gegen MahjongRepository/mahjong
   testen.
3. **Steine**: FluffyStuff CC0.
4. **Protokollformat**: an Mjai angelehnt (JSON-Zeilen), damit Replays und externe
   Analyse einfach bleiben.
5. **Testformat "Nani Kiru?"** (Hand + Sichtbares → erwarteter Abwurf) für Berater und
   KI übernehmen.
6. **Kein Framework, kein Build** bestätigt sich als gangbar (Pomax läuft so seit Jahren
   mit guter Performance).
