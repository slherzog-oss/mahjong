# Mahjong-App — Ausführlicher Projektplan

**Regelwerk der ersten Ausbaustufe:** Chinese Classical Mahjong nach A. D. Millington
("The Complete Book of Mah-Jongg"). Japanese Riichi und Hong Kong folgen später als
austauschbare Regelmodule.

**Umsetzungsstand:** siehe `docs/STATUS.md` (Stufen 1 bis 5 umgesetzt: Chinese Classical, Hong Kong Old Style und Riichi).

**Technik:** Reines HTML/CSS/JavaScript (ES-Module), responsiv für Handy und Desktop,
von Anfang an als **Progressive Web App (PWA)** angelegt: installierbar auf dem
Homescreen, offline voll spielbar, alle Daten lokal. Keine Frameworks für die Kernlogik.

---

## Inhalt

1. Regelwerk-Festlegung (Chinese Classical nach Millington)
2. Spiel-Engine / Regel-Kern
3. Scoring-Modul
4. Analyse-Engine (Shanten / Ukeire)
5. KI-Gegner
6. UI und Interaktion
7. Zustandsverwaltung, Undo und Persistenz
8. Live-Berater
9. Hand-Lexikon und Lernhilfe
10. Post-Game-Analyse, Tests und Projekt-Infrastruktur
11. PWA: Installation, Offline, Updates
12. Baustufen und Reihenfolge
13. Offene Entscheidungen

---

## 1. Regelwerk-Festlegung (Chinese Classical nach Millington)

### 1.1 Material
- 136 Spielsteine: Bambus, Kreise, Zeichen (je 1–9, viermal), Winde (O/S/W/N, viermal),
  Drachen (Rot, Grün, Weiß, viermal).
- Blumen und Jahreszeiten (8 Steine) als **Option**, standardmäßig aus. Wenn aktiv:
  Bonussteine werden sofort ausgelegt und ersetzt, bringen Punkte (siehe 3.3).
- Würfel für Sitzplatz und Wandöffnung (in der App als Zufallsquelle mit Seed).

### 1.2 Spielablauf
- Vier Spieler, Sitzwinde Ost/Süd/West/Nord. Ost ist Geber, spielt und zahlt doppelt.
- Prävalenzwind (Rundenwind) wechselt Ost → Süd → West → Nord, wenn jeder Spieler einmal
  Ost war. Ein vollständiges Spiel: vier Runden. Optional: Kurzspiel mit einer Runde.
- Ost bleibt Ost, wenn Ost gewinnt oder bei Unentschieden (konfigurierbar).
- Wand: 17 Stapel × 2 pro Seite. Tote Wand (Kong-Box): 14 Steine am Ende der Wand, aus
  ihr werden Ersatzsteine für Kongs und Bonussteine gezogen. Wird sie aufgebraucht, wird
  sie nach Millington aufgefüllt (konfigurierbar: statisch 14 Steine).
- Verteilung: 13 Steine pro Spieler, Ost 14.
- Zug: Ziehen von der Wand oder Aufnahme eines Abwurfs per Call, danach Abwurf.
- Unentschieden (Goulash / Dead Hand), wenn die lebende Wand leer ist: keine Punkte,
  Ost bleibt (konfigurierbar).

### 1.3 Calls
- **Chow:** nur vom linken Nachbarn (dem Vorspieler), nur Abwurf, offen.
- **Pung:** von jedem Spieler, offen. Vorrang vor Chow.
- **Kong:** offen (aus Abwurf), verdeckt (vier aus der Hand), oder Ergänzung eines
  offenen Pungs mit dem vierten Stein aus der Hand. Nach Kong: Ersatzstein aus der toten
  Wand. Der vierte Stein eines Kongs kann nur bei Ergänzungs-Kong "geraubt" werden
  (Robbing the Kong), nicht bei verdecktem Kong (Ausnahme: Thirteen Orphans,
  konfigurierbar).
- **Mahjong (Out):** hat Vorrang vor allem. Mehrere Anspruchsteller: der nächste in
  Spielreihenfolge nach dem Abwerfenden gewinnt.
- Kein Riichi, keine Dora, kein Furiten. Kein Zwang zur "Ready"-Ansage.

### 1.4 Gültige Hände
- **Standardhand:** vier Sätze (Chow, Pung, Kong) plus ein Paar, insgesamt 14 Steine
  (Kongs zählen als Satz mit vier Steinen).
- **Sonderhände** (Limit-Hände, Auswahl nach Millington, im Lexikon vollständig):
  - Thirteen Orphans (Thirteen Unique Wonders)
  - Nine Gates (Gates of Heaven)
  - Heavenly Hand (Ost gewinnt mit den 14 gegebenen Steinen)
  - Earthly Hand (Gewinn mit Osts erstem Abwurf)
  - Four Kongs
  - All Honours, Big Four Winds, Big Three Dragons
  - Buried Treasure (alle Pungs verdeckt, eine Farbe/Honours, Selbstzug)
  - Seven Pairs (Millington kennt sie nicht als Standardhand; Option, standardmäßig aus)
  - Weitere Limit-Hände als Optionen ("Wriggling Snake", "Thirteen Orphans"-Varianten)
- Jede Sonderhand hat ein Flag "Standard nach Millington" oder "Option".

### 1.5 Konfigurationsobjekt
Alle Varianten werden in einem `RuleSet`-Objekt abgebildet, damit spätere Regelmodule
(Riichi, HK) dieselbe Engine nutzen können:
- Punktesystem-ID, Limit (Standard 500 Punkte, Option 1000), Blumen an/aus,
  Seven Pairs an/aus, Ost bleibt bei Unentschieden, Auffüllen der toten Wand,
  Startpunkte (Standard 2000), Anzahl Runden.

---

## 2. Spiel-Engine / Regel-Kern

Reine Logik ohne DOM. Alle Funktionen deterministisch, Zufall nur über einen
seedbaren Generator. Grundlage für Tests, KI, Berater und Replay.

### 2.1 Datenmodell
- **Tile:** Kennung als kurzer String (`1b`…`9b`, `1c`…`9c`, `1k`…`9k`, `E S W N`,
  `Rd Gd Wd`, Blumen `F1–F4`, Jahreszeiten `S1–S4`). Jede physische Kopie hat zusätzlich
  eine eindeutige ID (0–135), damit Replays exakt sind.
- **Meld:** Typ (chow/pung/kong), Steine, offen/verdeckt, von wem gerufen.
- **Player:** Sitzwind, verdeckte Hand, ausgelegte Sätze, Bonussteine, Abwürfe,
  Punkte, Flag "menschlich/KI".
- **GameState:** Rundenwind, Geber, Wand (lebend + tot), aktueller Spieler, Phase,
  letzter Abwurf, wartende Call-Optionen, Zugzähler, Zufalls-Seed, Regelwerk.
- Zustand ist **unveränderlich**: jede Aktion erzeugt einen neuen Zustand
  (Grundlage für Undo, siehe 7).

### 2.2 Aktionen (Reducer-Modell)
`applyAction(state, action) → newState` mit Aktionen:
- `draw`, `discard`, `chow`, `pung`, `kong` (drei Varianten), `mahjong`, `pass`,
  `declareBonus`, `startHand`, `endHand`.
- Jede Aktion wird validiert; ungültige Aktionen werfen Fehler mit Grund.
- `getLegalActions(state, seat)` liefert alle erlaubten Aktionen für einen Spieler.
  Diese Funktion ist die einzige Wahrheit für UI, KI und Berater.

### 2.3 Phasen-Automat
- `dealing` → `draw` → `discard` → `claiming` (Warten auf Calls aller anderen) →
  zurück zu `draw` des nächsten Spielers, oder `handOver` → `scoring` → `nextHand`.
- Call-Auflösung mit Prioritäten: Mahjong > Pung/Kong > Chow; Tie-Break nach
  Spielreihenfolge.

### 2.4 Hand-Validierung
- Zerleger, der eine 14-Steine-Hand in alle möglichen Satz/Paar-Kombinationen
  aufteilt (für Scoring brauchen wir alle Zerlegungen, nicht nur eine).
- Sonderhand-Erkenner als Liste von Prädikaten mit Regelwerk-Flags.
- Prüfung "wartend" (welche Steine vervollständigen die Hand) als Nebenprodukt.

### 2.5 Protokoll
- Jede angewandte Aktion wird mit Zugnummer, Spieler und Zeitstempel in ein
  `GameLog` geschrieben. Zusammen mit dem Seed ist das Spiel vollständig reproduzierbar.
- Format angelehnt an das Mjai-Protokoll (eine JSON-Zeile je Ereignis: `start_hand`,
  `draw`, `discard`, `chow`, `pung`, `kong`, `mahjong`, `draw_game`, `end_hand`), damit
  Logs leicht exportierbar und von externen Werkzeugen lesbar sind.

---

## 3. Scoring-Modul

Eigenständiges Modul mit Schnittstelle `score(hand, context, ruleSet) → ScoreSheet`.
Kontext: Gewinner, Selbstzug oder Abwurf, Abwerfender, Rundenwind, Sitzwind,
letzter Stein von der Wand / aus der toten Wand / Kong geraubt usw.

Die Tabelle folgt Millington und ist mit der Kajongg-Basisregeltabelle "Classical
Chinese" abgeglichen (siehe RESEARCH.md). Jede Zeile bekommt im Code eine stabile ID,
die Lexikon, Berater und ScoreSheet gemeinsam nutzen.

### 3.1 Punkte (alle Spieler zählen ihre Hand)

| ID | Regel | Punkte |
|---|---|---|
| mahjong | Mahjong (nur Gewinner) | 20 |
| pung_simple_open / _closed | Pung einfache Steine 2–8 | 2 / 4 |
| pung_major_open / _closed | Pung Endsteine (1, 9) oder Honours | 4 / 8 |
| kong_simple_open / _closed | Kong einfache Steine | 8 / 16 |
| kong_major_open / _closed | Kong Endsteine oder Honours | 16 / 32 |
| pair_dragon | Paar Drachen | 2 |
| pair_own_wind | Paar eigener Wind | 2 |
| pair_round_wind | Paar Rundenwind (kumuliert mit eigenem Wind) | 2 |
| flower / season | je Blume oder Jahreszeit (wenn aktiv) | 4 |
| win_self_draw | Gewinn durch Selbstzug | 2 |
| win_last_wall | Gewinn mit dem letzten Stein der lebenden Wand | 2 |
| win_kong_replacement | Gewinn mit Ersatzstein nach Kong | 2 |
| win_rob_kong | Gewinn durch Kong-Raub | 2 |
| win_pair_wait_simple / _major | Letzter Stein vervollständigt das Paar | 2 / 4 |
| win_only_possible | Gewinn mit dem einzig möglichen Stein (Kantenwarten, Mittelwarten) | 2 |

Chows zählen 0. Ein Kong wird zur Gewinnerhand mit 4 Steinen gerechnet.

### 3.2 Verdopplungen (Gewinner)

| ID | Regel | Verdopplungen |
|---|---|---|
| dbl_pung_dragon | Pung/Kong eines Drachen (je Satz) | 1 |
| dbl_pung_own_wind | Pung/Kong des eigenen Windes | 1 |
| dbl_pung_round_wind | Pung/Kong des Rundenwindes (kumuliert) | 1 |
| dbl_own_flower_season | eigene Blume und eigene Jahreszeit | 1 |
| dbl_all_flowers / dbl_all_seasons | alle vier Blumen / alle vier Jahreszeiten | je 1 |
| dbl_no_chow | kein Chow (All Pungs) | 1 |
| dbl_concealed | nur verdeckte Sätze (Gewinn per Selbstzug) | 1 |
| dbl_three_concealed_pungs | drei verdeckte Pungs | 1 |
| dbl_half_flush | eine Farbe plus Honours | 1 |
| dbl_full_flush | reine Farbe | 3 |
| dbl_terminals_honours | nur Endsteine und Honours | 1 |
| dbl_all_honours | nur Honours (Millington: Limit; Kajongg-Basis: Limit; DMJL: 2 Verdopplungen) | Limit |
| dbl_little_three_dragons | zwei Drachen-Pungs plus Drachenpaar | 1 |
| dbl_little_four_winds | drei Wind-Pungs plus Windpaar | 1 |
| dbl_zero_point_hand | Hand ohne Punkte außer Mahjong (Chicken Hand) | 1 |
| dbl_last_tile_wall / dbl_last_discard | Gewinn mit letztem Wandstein / letztem Abwurf | Option (manuell, DMJL) |
| dbl_original_call | Original Call (Ready ab erstem Abwurf) | Option |

Die Verdopplungen der Verlierer: Drachen-, Wind- und Blumen-Verdopplungen zählen auch
für Nicht-Gewinner; Handform-Verdopplungen (Flush, All Pungs usw.) nur für den Gewinner
(Option: auch für Verlierer, wie bei Kajongg/DMJL). Vorbelegung: nur Satz-basierte
Verdopplungen für Verlierer.

### 3.3 Limit-Hände (Gewinner, Wertung = Limit)

| ID | Name (EN / DE) | Beschreibung | Status |
|---|---|---|---|
| lim_thirteen_orphans | Thirteen Orphans / Dreizehn Waisen | 1, 9 jeder Farbe, alle Honours, ein Paar davon | Standard |
| lim_nine_gates | Nine Gates / Neun Tore | 1112345678999 einer Farbe, verdeckt, plus ein beliebiger Stein der Farbe | Standard |
| lim_heavenly | Heavenly Hand / Himmlische Hand | Ost gewinnt mit der gegebenen Hand | Standard |
| lim_earthly | Earthly Hand / Irdische Hand | Gewinn mit Osts erstem Abwurf | Standard |
| lim_four_kongs | Fourfold Plenty / Vier Kongs | vier Kongs plus Paar | Standard |
| lim_all_honours | All Honours / Nur Honours | vier Honours-Pungs plus Honours-Paar | Standard |
| lim_big_four_winds | Four Blessings / Vier Segen | vier Wind-Pungs | Standard |
| lim_big_three_dragons | Three Great Scholars / Drei Gelehrte | drei Drachen-Pungs | Standard |
| lim_hidden_treasure | Buried Treasure / Verborgener Schatz | vier verdeckte Pungs, Selbstzug | Standard |
| lim_concealed_full_flush | Concealed Pure Flush | reine Farbe, vollständig verdeckt | Standard |
| lim_heads_and_tails | Heads and Tails | nur Pungs aus 1 und 9 | Standard |
| lim_all_green | Imperial Jade / Kaiserliche Jade | nur 2,3,4,6,8 Bambus und grüner Drache | Standard |
| lim_plum_blossom | Gathering Plum Blossom | Gewinn mit 5 Kreise als Ersatzstein nach Kong | Standard |
| lim_plucking_moon | Plucking the Moon | Gewinn mit 1 Kreise als letztem Wandstein | Standard |
| lim_scratching_pole | Scratching a Carrying Pole | Kong-Raub mit 2 Bambus | Standard |
| lim_twofold_fortune | Twofold Fortune | Gewinn mit Ersatzstein nach zwei Kongs hintereinander | Standard |
| lim_wriggling_snake | Wriggling Snake | 1–9 einer Farbe plus Wind-Paar und Winde (BMJA) | Option |
| lim_gates_of_heaven, lim_knitting, lim_triple_knitting | BMJA-Sonderhände | | Option, halbes Limit möglich |
| lim_seven_pairs | Seven Pairs | sieben Paare | Option (nicht Millington) |

Limit-Wert: Vorbelegung 500 (Millington-Standardtisch, Kajongg-Basis), Option 1000
(BMJA, Pomax). Reguläre Hände über dem Limit werden gekappt. Halbes Limit als Wert
für BMJA-Optionen.

### 3.4 Zahlungsabwicklung
1. Jeder Spieler berechnet seine Hand: Punkte summieren, dann 2^Verdopplungen, dann
   auf Limit kappen.
2. Gewinner erhält von jedem der drei anderen seinen Handwert. Selbstzug: jeder zahlt
   den vollen Betrag. Abwurf: Vorbelegung ebenfalls alle drei (Millington);
   Option "Abwerfender zahlt für alle".
3. Verlierer begleichen die Differenz ihrer Handwerte paarweise untereinander
   (Millington, Pomax "losers pay each other").
4. Ost zahlt und erhält doppelt, in jeder Transaktion, an der Ost beteiligt ist.
5. Ergebnis: 4×4-Zahlungsmatrix; Summe aller Transaktionen ist null (Invariante für
   Tests).
6. Optionale Strafen (DMJL): falsche Ansage Chow −50, Pung/Kong −100, falsches
   Mahjong −300. Vorbelegung aus.

### 3.5 Ausgabe
- `ScoreSheet` je Spieler: Zeilen `{id, label, points | doubles | limit, tiles}`,
  Punkte-Zwischensumme, Verdopplungen, gekappter Endwert, Zahlungsmatrix.
- Labels kommen aus dem Lexikon-Katalog (Abschnitt 9), keine doppelte Textpflege.

### 3.6 Modultrennung
- Regel-Kern kennt nur "Hand ist gültig". Punkte kommen ausschließlich aus diesem Modul.
- Vorbild: Pomax/mahjong (`ruleset.js` als Basisklasse, je Regelwerk eine Datei) und
  Kajongg (Regeln als Datentabelle). Wir kombinieren beides: Datentabelle für Werte,
  kleine Prädikatsfunktionen für die Erkennung.
- Referenztests: je Zeile der Tabellen mindestens eine Beispielhand; zusätzlich die
  Unit-Tests aus Pomax `chinese-classical.js` als Gegenprobe (Abweichung Mahjong 10 vs.
  20 Punkte beachten).


---

## 4. Analyse-Engine (Shanten / Ukeire)

Der technische Kern für Berater, KI und Post-Game-Analyse. Eigene Implementierung,
Handformat und Algorithmusstruktur nach mahjong-tile-efficiency (MIT), Ergebnisse
gegen MahjongRepository/mahjong (Python) getestet. Siehe RESEARCH.md.

### 4.1 Handformat
- Zähl-Matrix `counts[4][9]`: Bambus, Kreise, Zeichen je 9, Honours 7 (E S W N Rd Gd Wd),
  Werte 0–4. Offene Sätze getrennt als Liste, Bonussteine getrennt.
- Alle Analysefunktionen arbeiten nur auf dieser Matrix plus einer "sichtbar"-Matrix
  (eigene Hand + alle Abwürfe + alle offenen Sätze), aus der die Restverfügbarkeit
  `remaining[tile] = 4 − visible[tile]` folgt.

### 4.2 Shanten-Berechnung
- **Standardform:** Farbweise Zerlegung. Für jede Farbe wird vorab eine Tabelle
  berechnet: für jede Zählkombination (0–4 je Rang, nur Summen ≤ 14) die besten
  Werte (Sätze, Teilsätze, Paar vorhanden). Handshanten = Kombination der vier
  Farbtabellen mit der Formel `8 − 2·Sätze − Teilsätze − Paar` (angepasst um die Zahl
  offener Sätze). Tabelle beim Start einmal gebaut (wenige ms) oder als JSON gebündelt.
- **Thirteen Orphans:** `13 − (Anzahl verschiedener Endsteine/Honours) − (1 wenn davon
  ein Paar)`.
- **Seven Pairs** (nur wenn aktiv): `6 − Paare` (+ Korrektur bei zu wenigen
  verschiedenen Steinen).
- **Weitere Zielformen** als Distanzfunktionen: Nine Gates (Abstand zur Muster-Zählung
  3111111113 einer Farbe), All Honours, Big Four Winds, Big Three Dragons, Heads and
  Tails, All Green, Full/Half Flush (Standardform mit Farbfilter), All Pungs
  (Standardform ohne Chows, eigene Tabelle).
- Ergebnis: `{ form: shanten }` für jede Form, Gesamt-Shanten = Minimum.

### 4.3 Ukeire (akzeptierte Steine)
- Für Hand mit 3n+1 Steinen: Menge der Steine, die den Shanten senken, gewichtet mit
  `remaining[tile]`. Für 3n+2: pro Abwurfkandidat die Ukeire der Resthand.
- Kandidaten-Filter: nur Abwürfe prüfen, die den Shanten nicht erhöhen
  ("normalDiscard"), plus optional die, die ihn um 1 erhöhen ("receding"), falls das
  den Wert stark hebt.
- Call-Ukeire: aus den Abwürfen der anderen, welche Steine ließen sich als Pung/Chow
  (Chow nur vom linken Nachbarn) rufen und senken den Shanten.

### 4.4 Wertbewertung (Chinese-Classical-spezifisch)
- Da Chows nichts zählen, bewertet die Engine jeden Abwurf nach erwartetem Wert:
  `EV = Σ_form P(form erreichen) × Punkte(form)`, Punkte über das Scoring-Modul mit
  einer "wahrscheinlichen Endhand" (Sätze wie bisher, fehlende Sätze als Pung oder
  Chow je nach Teilsatz).
- Gewichtungen (justierbare Konstanten wie bei AlphaJong): Pung- vs. Chow-Weg,
  Honours-Paar-Bonus, Farbreinheit, Verdopplungspotenzial, verdeckte Hand erhalten.
- Ausgabe pro Abwurf: Shanten danach, Ukeire (Anzahl Steine, gewichtet), EV,
  Gefahrenwert, Gesamtscore.

### 4.5 Gefahrenbewertung (Defensive)
- Ohne Furiten gibt es kein "sicheres Suji". Faktoren je Stein und Gegner:
  Restverfügbarkeit (Stein 3× sichtbar → fast sicher), Übereinstimmung mit den offenen
  Sätzen des Gegners (Farbe bei Half/Full-Flush-Verdacht, Honours bei
  Honours-Sammlern), Spielphase (Anteil der Wand verbraucht), Anzahl der Abwürfe
  des Gegners in dieser Farbe (viele Abwürfe einer Farbe → Gegner braucht sie nicht).
- Ergebnis: Gefahrenwert 0–1 pro Stein, kombiniert über Gegner gewichtet nach deren
  geschätztem Tempo.

### 4.6 Wahrscheinlichkeiten (Poker-Stil)
- **Fertigstellungschance (schnell, jeder Zug):** Kettenmodell über Shanten-Stufen.
  Mit `u_k` = gewichtete Ukeire auf Stufe k, `R` = Reststeine in der Wand und `T` =
  verbleibende eigene Züge: Wahrscheinlichkeit, in T Zügen alle Stufen zu durchlaufen,
  hypergeometrisch je Stufe, dynamisch programmiert über (Stufe, Zug). Laufzeit
  vernachlässigbar.
- **Fertigstellungschance (genau, Worker):** Monte-Carlo nach Mizukami/Tsuruoka:
  N Restwände zufällig aus den unsichtbaren Steinen ziehen, eigene Züge greedy nach
  Ukeire spielen, Gegner mit einfachem Modell (Abwürfe zufällig aus unsichtbaren
  Steinen, Gewinn mit stufenabhängiger Rate). N = 2000 als Vorbelegung, Ergebnis mit
  Konfidenzintervall.
- **Gewinnchance gegen die Gegner:** `P(win) ≈ P(fertig bis Zug t) × Π_gegner
  (1 − P(gegner fertig bis t))`, Gegner-Tempo geschätzt aus offenen Sätzen, Zahl der
  Abwürfe und Spielphase (Tabelle aus KI-gegen-KI-Simulationen kalibriert).
- **Handform-Wahrscheinlichkeiten:** pro Zielform dieselbe Kettenrechnung mit deren
  Shanten und Ukeire; Ausgabe `P`, Punkte, `EV = P × Punkte`, sortiert nach EV.
- Alle Werte pro Abwurfkandidat, damit der Berater "wenn du X wirfst, sinkt Full
  Flush auf 8 %" sagen kann.

### 4.7 Leistung
- Zielwerte: Standard-Shanten < 0,1 ms, vollständige Bewertung aller Abwürfe einer
  Hand inkl. Schnellrechnung < 20 ms auf einem Mittelklasse-Handy.
- Monte-Carlo und Post-Game-Analyse in einem Web Worker, Fortschrittsanzeige.
- Benchmark-Datei wie bei mahjong-tile-efficiency (`benchmark.js`) im Repo.

## 5. KI-Gegner

### 5.1 Architektur
- `chooseAction(state, seat, difficulty, rng) → action`, nutzt ausschließlich
  `getLegalActions` und die Analyse-Engine.
- Deterministisch bei gleichem Seed (wichtig für Tests und Replays).

### 5.2 Schwierigkeitsgrade
- **Anfänger:** wirft zufällig aus den nicht-paarigen Steinen, ruft jeden Pung, keine
  Defensive.
- **Mittel:** wählt Abwurf nach Shanten/Ukeire, ruft Sätze, wenn Shanten sinkt, einfache
  Gefahrenvermeidung ab Spielmitte.
- **Schwer:** Bewertung nach erwartetem Wert (4.3), Abwägung Angriff/Defensive je nach
  Punktestand und Gegner-Tempo, bewusstes Anstreben von Verdopplungen und Sonderhänden,
  Verzicht auf schlechte Calls.
- **Optional "Stil":** aggressiv / defensiv / Sonderhand-Sammler für Abwechslung.

### 5.3 Call-Entscheidungen
- Pung/Chow nur, wenn Shanten sinkt und Handwert nicht kollabiert (verdeckte Hand
  bringt Verdopplung).
- Kong: verdeckt fast immer, offen nur bei sicherer Hand.
- Mahjong immer, außer Option "Mindestwert" ist aktiv.

### 5.4 Fehlerinjektion
- Niedrigere Stufen bekommen kontrollierte Zufallsfehler (z. B. mit 30 % zweitbeste
  Wahl), damit sie menschlich wirken statt nur "dumm".

---

## 6. UI und Interaktion

### 6.1 Layout
- Spieltisch als zentrale Ansicht: eigene Hand unten (groß, antippbar), drei Gegner mit
  offenen Sätzen und Abwürfen, Abwurfzone in der Mitte, Wandanzeige (Reststeine),
  Rundenwind, Sitzwinde, Punktestand.
- **Handy (Hochformat):** Gegner kompakt oben/seitlich, Hand als scrollbare/kompakte
  Reihe, Aktionsleiste über der Hand (Chow/Pung/Kong/Mahjong/Pass/Berater/Undo).
- **Desktop:** klassischer Tisch, Seitenpanel für Berater, Log und Lexikon.
- CSS Grid + Flexbox, Breakpoints, `touch-action`, große Trefferflächen (min. 44 px).

### 6.2 Steine
- SVG-Steinset FluffyStuff/riichi-mahjong-tiles (CC0), Variante "Regular"; Blumen,
  Jahreszeiten und Rückseite im gleichen Stil ergänzen. Skalierbar, Dark/Light.
- Zustände: normal, ausgewählt, empfohlen (Berater), gefährlich (Berater), verdeckt.

### 6.3 Interaktionen
- Abwurf: Tippen zum Auswählen, zweites Tippen oder Bestätigungsknopf (Einstellung).
- Calls: Modales Overlay mit den möglichen Optionen und Vorschau der Sätze; Zeitlimit
  abschaltbar.
- Hand automatisch sortieren (Einstellung).
- Animationen: Ziehen, Abwurf, Call, kurz und abschaltbar.

### 6.4 Screens
- Startbildschirm (Neues Spiel, Fortsetzen, Lexikon, Einstellungen, Analyse).
- Spiel. Rundenende mit Punktetabelle und Erklärung (aus `ScoreSheet`).
- Spielende mit Gesamtwertung. Einstellungen (Regeloptionen, Schwierigkeit, Anzeige).
- Lexikon (siehe 9). Analyse (siehe 10).

### 6.5 Barrierefreiheit und Sprache
- Tastaturbedienung auf Desktop, ARIA-Labels für Steine, ausreichender Kontrast.
- Texte in einer Sprachdatei (Deutsch zuerst, Englisch vorbereitet).

---

## 7. Zustandsverwaltung, Undo und Persistenz

### 7.1 Store
- Ein zentraler Store hält `GameState`, `GameLog`, UI-Zustand und Einstellungen.
- Änderungen nur über Aktionen (siehe 2.2). UI abonniert Änderungen und rendert neu.

### 7.2 Undo
- Zustands-Stack aller Zustände seit Handbeginn (unveränderliche Objekte, strukturelles
  Teilen hält Speicher klein) oder Neuberechnung aus Log + Seed.
- "Zurück" springt zum letzten eigenen Entscheidungspunkt (nicht nur einen KI-Zug).
- Redo optional. Undo im Analyse-/Lernmodus frei; im "ehrlichen Modus" abschaltbar oder
  gezählt (für spätere Statistik).
- KI-Züge nach Undo sind bei gleichem Seed identisch (kein "Würfeln bis es passt"), es
  sei denn Einstellung "KI neu würfeln" ist aktiv.

### 7.3 Persistenz
- Alles lokal im Browser, kein Server, kein Konto. Grundlage für den Offline-Betrieb
  als PWA (Abschnitt 11).
- Laufendes Spiel nach jeder Aktion speichern (Seed + Log + Regelwerk + Spielziel
  reicht zur Wiederherstellung). Kleine Daten in `localStorage`, Partien-Archiv und
  Analysen von Anfang an in **IndexedDB** (kleiner Wrapper, keine Bibliothek).
- Wiederaufnahme nach App-Neustart: Startbildschirm bietet "Fortsetzen" an, Zustand
  wird aus dem Log rekonstruiert (Determinismus, Abschnitt 2.5).
- Speicherschutz: `navigator.storage.persist()` anfordern, damit das System die Daten
  nicht bei Platzmangel löscht; Belegung im Einstellungs-Screen anzeigen.
- Export/Import als JSON-Datei (Web Share API auf dem Handy, Download auf dem Desktop),
  damit Partien zwischen Geräten wandern können. Kein Cloud-Sync in den ersten Stufen.

---

## 8. Live-Berater

### 8.1 Auslösung
- Knopf "Empfehlung" (auf Zuruf, nicht automatisch), optional Dauer-Anzeige im Lernmodus.

### 8.2 Inhalt einer Empfehlung
- Bester Abwurf plus zwei Alternativen mit: Shanten danach, Anzahl nützlicher Steine,
  geschätzter Handwert, Gefahrenwert.
- Kurze Begründung in Klartext ("Behalte das Paar Rote Drachen für eine Verdopplung",
  "Dieser Stein ist dreimal sichtbar, nutzlos für dich und sicher").
- Bei Call-Angebot: Empfehlung rufen/passen mit Grund (Verlust der verdeckten Hand,
  Shanten-Gewinn).
- Hinweis auf Sonderhand-Nähe: "Du bist 3 Steine von Thirteen Orphans entfernt".

### 8.3 Wahrscheinlichkeitsanzeige (immer sichtbar, Einstellung)
- Kopfzeile über der Hand: **Fertigstellungschance** und **Gewinnchance** in Prozent,
  aktualisiert nach jedem Zug (Schnellrechnung), mit Trend-Pfeil zum Vorzug.
- Panel "Mögliche Blätter": Liste der erreichbaren Handformen mit Prozent, Punktwert
  und erwartetem Wert, Balkenanzeige. Beispiel:
  - Standardhand (All Pungs) 41 % · 2 Verdopplungen
  - Half Flush 18 % · 1 Verdopplung
  - Full Flush 6 % · 3 Verdopplungen
  - Thirteen Orphans 0,4 % · Limit
- Antippen einer Zeile zeigt, welche Steine dafür zu halten und welche zu werfen sind.

### 8.4 Spielziel wählen ("Ich versuche X zu spielen")
- Aus dem Panel "Mögliche Blätter" lässt sich eine Handform als **Ziel** festlegen.
- Wirkung:
  - Berater bewertet Abwürfe und Calls dann nach dieser Zielform (Shanten und Ukeire
    für genau diese Form, nicht mehr nach bestem erwarteten Wert insgesamt).
  - Steine in der Hand werden markiert: "für das Ziel behalten" / "entbehrlich".
  - Die Zielzeile bleibt oben, mit laufender Prozentanzeige; fällt sie unter eine
    Schwelle oder wird sie unmöglich (nötige Steine vollständig sichtbar), warnt der
    Berater und schlägt die beste Alternative vor.
  - Ziel jederzeit änderbar oder aufhebbar ("frei spielen").
- Das Ziel wird im Protokoll gespeichert, damit die Post-Game-Analyse unterscheiden
  kann zwischen "Fehler gegenüber dem eigenen Ziel" und "Ziel war objektiv schlecht".

### 8.5 Darstellung
- Markierung der Steine in der Hand (grün empfohlen, rot gefährlich), Detailpanel
  ausklappbar.
- Berater-Nutzung wird im Log vermerkt (für Post-Game-Statistik).

---

## 9. Hand-Lexikon und Lernhilfe

### 9.1 Inhalt
- Datenbasierter Katalog (JSON): Name (DE/EN), Kategorie (Standard / Verdopplung /
  Limit / Option), Beschreibung, Beispielhand als Steinliste, Punkte / Verdopplungen,
  Seltenheit, Millington-Standard oder Option, Tipps zum Aufbau.
- Grundlagen: Sätze, Paare, Grundpunkte, Verdopplungsprinzip, Zahlungsregeln, Ost-Rolle.
- Der Katalog ist dieselbe Quelle, die das Scoring für Beschreibungen nutzt (keine
  doppelte Pflege).

### 9.2 Verknüpfung mit dem Spiel
- Im Spiel: "Wohin kann sich meine Hand entwickeln?" zeigt die 3–5 nächstliegenden
  Handformen mit Shanten-Abstand und Punktepotenzial, Link ins Lexikon.
- Aus dem Lexikon: "Beispiel laden" startet eine Übungshand, die nahe an der Handform ist.

### 9.3 Darstellung
- Suchbar, filterbar nach Kategorie und Punktwert, Steine als Grafiken.

---

## 10. Post-Game-Analyse, Tests und Projekt-Infrastruktur

### 10.1 Post-Game-Analyse
- Replay einer Partie aus Seed + Log, Zug für Zug, vor/zurück, Sprung zu Fehlern.
- Für jeden eigenen Entscheidungspunkt: tatsächliche Wahl vs. beste Wahl der
  Analyse-Engine (Schwer-Stufe), Bewertungsdifferenz.
- Verlaufskurve der Fertigstellungs- und Gewinnchance über die ganze Hand (wie die
  Bewertungskurve bei Schach), mit Markierung der Züge, an denen sie einbrach.
- Bewertung des gewählten Spielziels: War es zum Zeitpunkt der Wahl die beste Option,
  wann hätte man umschwenken sollen.
- Fehlerklassen: kleine Ungenauigkeit / Fehler / grober Fehler (Schwellen an
  Bewertungsdifferenz), farbliche Markierung in einer Zugleiste wie bei Schach-Engines.
- Zusammenfassung: Genauigkeit in Prozent, Anzahl Fehler je Klasse, häufigste
  Fehlertypen (zu viele Calls, Gefahrensteine, Sonderhand verpasst).
- Berechnung im Web Worker, Fortschrittsanzeige.

### 10.2 Tests
- Unit-Tests für: Steinlogik, Hand-Zerleger, Sonderhand-Erkenner, alle Scoring-Zeilen
  (mit Beispielhänden aus Millington als Referenz, Gegenprobe mit Pomax-Tests),
  Shanten-Werte bekannter Hände (Gegenprobe mit MahjongRepository/mahjong),
  Call-Prioritäten, Undo-Konsistenz, Determinismus (gleicher Seed → gleiches Log).
- "Nani Kiru?"-Tests für Berater und KI: Hand + sichtbare Steine + erwarteter Abwurf
  (Format wie bei AlphaJong), als JSON-Dateien unter `/tests/nanikiru/`.
- Eigenschaftstests: zufällige Partien mit KI gegen KI, Prüfung auf Invarianten
  (136 Steine gesamt, keine ungültigen Aktionen, Punktesumme konstant).
- Testrunner: Node-eigener Runner (`node --test`) oder Vitest; keine Browser-Abhängigkeit
  für die Kernlogik.

### 10.3 Projektstruktur
```
/src
  /core      tiles, wall, state, actions, rules (Regel-Kern)
  /scoring   millington.js, scoresheet.js (Scoring-Modul)
  /analysis  shanten.js, ukeire.js, value.js, danger.js
  /ai        player.js, difficulty.js
  /advisor   advisor.js, explain.js
  /lexicon   hands.json, lexicon.js
  /replay    analyzer.js, worker.js
  /store     store.js, undo.js, persistence.js
  /ui        components, screens, styles, tiles (SVG)
  /i18n      de.json, en.json
/tests
/docs        Regelreferenz, Scoring-Tabelle, Architektur
/icons       App-Icons (192, 512, maskable), Apple-Touch-Icon
index.html
manifest.webmanifest
sw.js        Service Worker (siehe Abschnitt 11)
PLAN.md
```
- ES-Module ohne Build-Schritt für den Start; Vite optional später für Bundling und
  Dev-Server. Deployment als statische Seite (GitHub Pages).

### 10.4 Qualität
- ESLint + Prettier, CI-Workflow (Tests + Lint) auf GitHub Actions.
- Architekturregel: `core`, `scoring`, `analysis`, `ai` importieren nie aus `ui`.

---

## 11. PWA: Installation, Offline, Updates

Die App bleibt eine statische Website; die PWA-Schicht kommt ohne Framework und ohne
Build-Schritt aus. Alle Spielfunktionen laufen offline, weil nichts einen Server braucht.

### 11.1 Manifest
- `manifest.webmanifest` mit Name, Kurzname, `start_url` (`./?source=pwa`),
  `display: standalone`, `orientation: any` (Spieltisch funktioniert in beiden Lagen),
  Farben für Theme und Hintergrund, Icons 192 und 512 px plus `maskable`-Variante,
  Screenshots für den Install-Dialog auf Android/Desktop.
- Shortcuts im Manifest: "Neues Spiel", "Fortsetzen", "Lexikon".
- iOS-Besonderheiten: `apple-touch-icon`, `apple-mobile-web-app-capable`,
  Statusleisten-Farbe, Splash über Theme-Farbe. Installation auf iOS nur über
  "Zum Home-Bildschirm" in Safari; die App zeigt dafür einen kurzen Hinweis.

### 11.2 Service Worker
- Strategie **Precache + Cache First** für alle App-Dateien (HTML, CSS, JS, SVG-Steine,
  Lexikon-JSON, Fonts). Die Dateiliste wird beim Installieren vollständig geladen, danach
  ist die App ohne Netz nutzbar.
- Versionierung über eine Cache-Kennung (`mahjong-v12`); beim Aktivieren einer neuen
  Version werden alte Caches gelöscht.
- Kein Netzwerk zur Laufzeit nötig, daher keine Runtime-Caching-Regeln für externe
  Ressourcen. Alles wird lokal ausgeliefert, keine CDN-Abhängigkeit.
- Ohne Bundler wird die Precache-Liste aus einem kleinen Skript generiert
  (`scripts/build-sw-manifest.js`), das die Dateien unter `/src` und `/icons` mit
  Hash aufzählt. Später bei Vite: `vite-plugin-pwa` als Ersatz.

### 11.3 Update-Fluss
- Service Worker prüft beim Start auf eine neue Version. Liegt eine vor, wird sie im
  Hintergrund geladen; die App zeigt einen unaufdringlichen Hinweis "Update bereit,
  neu laden". Kein erzwungener Reload mitten in einer Hand.
- Beim Neuladen bleibt das laufende Spiel erhalten (Persistenz aus 7.3), auch wenn sich
  das Datenformat ändert: Log-Format bekommt eine Versionsnummer und Migrationen.
- Versionsanzeige und "Auf Updates prüfen" im Einstellungs-Screen.

### 11.4 Installations-Erlebnis
- `beforeinstallprompt` abfangen und einen eigenen "Installieren"-Knopf nach der ersten
  abgeschlossenen Hand anbieten, nicht sofort beim ersten Besuch.
- Erkennung, ob die App installiert läuft (`display-mode: standalone`), um Browser-Chrome
  bezogene Hinweise auszublenden.

### 11.5 Mobile Verhalten in der installierten App
- Safe-Area-Ränder (`env(safe-area-inset-*)`) für Notch und Home-Indikator.
- `viewport-fit=cover`, kein Pinch-Zoom auf dem Spieltisch, Doppeltipp-Zoom aus.
- Wake Lock API während einer laufenden Hand, damit der Bildschirm nicht ausgeht.
- Vibrations-Feedback bei Call-Angeboten (abschaltbar), Systemschrift für schnelle
  Darstellung, Dark Mode nach Systemeinstellung.
- Speicher- und Akku-Rücksicht: Monte-Carlo im Worker mit begrenzter Laufzeit, keine
  Berechnung im Hintergrund, wenn die App nicht sichtbar ist (`visibilitychange`).

### 11.6 Hosting und Auslieferung
- PWA setzt HTTPS voraus. GitHub Pages erfüllt das ohne Kosten; alternativ jeder
  statische Host (Netlify, Cloudflare Pages).
- Deployment per GitHub Actions: Tests laufen, dann Precache-Liste generieren, dann
  auf den `gh-pages`-Branch veröffentlichen.
- Relative Pfade überall, damit die App unter einem Unterpfad (`/mahjong/`) läuft.

### 11.7 Tests für die PWA-Schicht
- Lighthouse-PWA-Prüfung in CI (Installierbarkeit, Offline-Start, Manifest).
- Playwright-Test: Seite laden, Netzwerk abschalten, neu laden, Spiel starten.
- Manuelle Checkliste je Release: Android Chrome, iOS Safari, Desktop Chrome/Edge.

### 11.8 Später möglich (nicht in den ersten Stufen)
- Store-Verpackung ohne Neuentwicklung: Android über Trusted Web Activity (PWABuilder),
  iOS über einen minimalen Wrapper. Die Web-App bleibt die eine Codebasis.
- Optionaler Cloud-Sync der Partien über ein eigenes Konto, Push-Erinnerungen.
- Web Share Target, um exportierte Partien anderer Spieler direkt in die App zu
  übernehmen.

---

## 12. Baustufen und Reihenfolge

### Stufe 1 — Chinese Classical komplett spielbar
1. Projektgerüst, Steine, Wand, Zufall mit Seed, Tests.
2. GameState, Aktionen, Phasen-Automat, `getLegalActions`, Protokoll.
3. Hand-Zerleger und Sonderhand-Erkenner (Millington-Standardliste).
4. Scoring nach Millington inkl. Verlierer-Wertung, Ost doppelt, Limit; Referenztests.
5. Shanten/Ukeire für Standardform + Thirteen Orphans (Minimalversion),
   Fertigstellungschance als Schnellrechnung.
6. KI "Mittel" als einzige Stufe.
7. UI: Tisch, Hand, Calls, Rundenende mit Punkteerklärung, Handy + Desktop.
8. Store, Undo, Autosave in IndexedDB, Fortsetzen nach Neustart.
9. Einfacher Berater (bester Abwurf + ein Satz Begründung), Prozentanzeige
   Fertigstellungschance über der Hand.
10. PWA-Grundausstattung: Manifest, Icons, Service Worker mit Precache, Offline-Start,
    Update-Hinweis, Deployment auf GitHub Pages. Ab hier ist die App installierbar.

### Stufe 2 — Schwierigkeitsgrade und mobile Feinschliff
- Wertbewertung und Gefahrenbewertung ausbauen, Stufen Anfänger/Mittel/Schwer,
  Fehlerinjektion, KI-gegen-KI-Simulationen zur Kalibrierung.
- PWA-Feinschliff: Safe Areas, Wake Lock, Install-Knopf, Lighthouse in CI,
  Export/Import per Web Share.

### Stufe 3 — Hand-Lexikon, Wahrscheinlichkeiten und Spielziel
- Katalog vervollständigen (alle Millington-Hände + Optionen), Lexikon-Screen,
  Übungshände.
- Handform-Wahrscheinlichkeiten, Gewinnchance gegen Gegner, Monte-Carlo im Worker.
- Panel "Mögliche Blätter" und wählbares Spielziel mit zielgerichtetem Berater.

### Stufe 4 — Post-Game-Analyse
- Replay-Ansicht, Fehlerklassifikation, Zusammenfassung, Archiv, Export/Import,
  Web Worker.

### Stufe 5 — Weitere Regelmodule (optional)
- Riichi (Riichi-Call, Dora, Furiten, Yaku/Han/Fu-Scoring) und Hong Kong (Fan-Scoring)
  als eigene `RuleSet`- und Scoring-Module; Regel-Kern bleibt gemeinsam.

---

## 13. Offene Entscheidungen

Diese Punkte sind mit Standardwerten vorbelegt und lassen sich später umstellen:

| Thema | Vorbelegung | Alternative |
|---|---|---|
| Limit | 500 (Millington-Standardtisch, Kajongg) | 1000 (BMJA, Pomax) |
| Blumen/Jahreszeiten | aus | an |
| Seven Pairs | aus (nicht Millington) | an als Option |
| Ost bleibt bei Unentschieden | ja | nein |
| Abwerfender zahlt für alle | nein (Millington) | ja |
| Startpunkte | 2000 | frei |
| Spiellänge | 4 Runden | 1 Runde |
| Steingrafiken | eigenes SVG-Set | freies Set unter offener Lizenz |
| Kong-Box (tote Wand) | 14 Steine | 16 (Kajongg) |
| Verlierer-Verdopplungen | nur Satz-basiert | auch Handform (DMJL) |
| Build | ohne Build-Schritt, Precache-Liste per Skript | Vite mit vite-plugin-pwa |
| Hosting | GitHub Pages | Netlify / Cloudflare Pages |
| Store-Verpackung | keine | TWA (Android), Wrapper (iOS) später |
