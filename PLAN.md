# Mahjong-App — Ausführlicher Projektplan

**Regelwerk der ersten Ausbaustufe:** Chinese Classical Mahjong nach A. D. Millington
("The Complete Book of Mah-Jongg"). Japanese Riichi und Hong Kong folgen später als
austauschbare Regelmodule.

**Technik:** Reines HTML/CSS/JavaScript (ES-Module), lauffähig ohne Server direkt im
Browser, responsiv für Handy und Desktop. Keine Frameworks für die Kernlogik.

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
11. Baustufen und Reihenfolge
12. Offene Entscheidungen

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
- Punktesystem-ID, Limit (Standard 1000 Punkte, Option 500), Blumen an/aus,
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

---

## 3. Scoring-Modul

Eigenständiges Modul mit Schnittstelle `score(hand, context, ruleSet) → ScoreSheet`.
Kontext: Gewinner, Selbstzug oder Abwurf, Abwerfender, Rundenwind, Sitzwind,
letzter Stein von der Wand / aus der toten Wand / Kong geraubt usw.

### 3.1 Grundpunkte (Millington)
- Mahjong: 20 Grundpunkte.
- Sätze: Pung einfache Steine offen 2 / verdeckt 4; Pung Endsteine (1, 9) oder Honours
  offen 4 / verdeckt 8; Kong einfach offen 8 / verdeckt 16; Kong Endsteine/Honours offen
  16 / verdeckt 32. Chows 0.
- Paar: Drachen 2, eigener Wind 2, Rundenwind 2 (beides: 4).
- Blumen/Jahreszeiten: je 4.
- Bonus: Selbstzug 2, Gewinn mit dem letzten Wandstein 2, mit einem Kong-Ersatzstein 2,
  Kong geraubt 2, Warten auf einen einzigen möglichen Stein (Edge/Closed/Pair-Wait) 2,
  Gewinn ohne Chow (All Pungs) laut Verdopplungen unten.

### 3.2 Verdopplungen (Gewinner)
- Pung/Kong der Drachen: 1 je Satz. Pung/Kong des eigenen Windes: 1. Rundenwind: 1.
- Eigene Blume / eigene Jahreszeit: 1; alle vier Blumen oder alle vier Jahreszeiten: 3 bzw. 1
  (nach Millington-Tabelle festlegen, im Lexikon dokumentieren).
- Keine Chows (All Pungs): 1. Verdeckte Hand (nur Selbstzug, keine offenen Sätze): 1.
- Eine Farbe mit Honours (Half Flush): 1. Reine Farbe (Full Flush): 3.
- Alle Honours und Endsteine: 1. Keine Punkte außer Mahjong (Chicken Hand) nach Option.
- Drei kleine Drachen: 1; drei kleine Winde: 1; drei große Winde: 2 (Tabelle
  vollständig im Lexikon).

### 3.3 Verdopplungen und Punkte für Verlierer
- Nach Millington zählen auch die Nicht-Gewinner ihre Hände (Sätze, Paare, Blumen,
  Verdopplungen). Die Differenzen werden zwischen allen Spielern paarweise beglichen.
- Ost zahlt und erhält doppelt.
- Der Abwerfende zahlt an den Gewinner allein den vollen Betrag; die anderen beiden zahlen
  ebenfalls (Millington: alle zahlen an den Gewinner, Abwerfender ohne Zuschlag —
  Option: Abwerfender zahlt für alle).

### 3.4 Limit
- Limit 1000 Punkte (Option 500). Sonderhände zählen als Limit. Reguläre Hände, die
  das Limit überschreiten, werden auf das Limit gekappt.
- Halb-Limit-Hände als Option.

### 3.5 Ausgabe
- `ScoreSheet` mit Zeilen (Beschreibung, Punkte / Verdopplung, Quelle) für jeden
  Spieler, Zwischensumme, Verdopplungen, Endsumme, Zahlungsmatrix.
- Diese Zeilen sind auch die Grundlage für die Erklärungen im UI und im Lexikon.

### 3.6 Modultrennung
- Regel-Kern kennt nur "Hand ist gültig". Punkte kommen ausschließlich aus diesem Modul.
- Schnittstelle so gestaltet, dass ein Riichi- oder HK-Scoring dieselbe Signatur
  bedienen kann.

---

## 4. Analyse-Engine (Shanten / Ukeire)

Der technische Kern für Berater, KI und Post-Game-Analyse.

### 4.1 Shanten-Berechnung
- **Standardform:** klassischer Algorithmus (Sätze, Teilsätze, Paar) mit Beachtung
  bereits offener Sätze. Shanten = minimale Zahl an Steinwechseln bis zur Tenpai-Hand.
- **Thirteen Orphans:** eigene Formel (13 − einzigartige Endsteine/Honours − Paarbonus).
- **Seven Pairs:** eigene Formel (nur, wenn im Regelwerk aktiv).
- **Weitere Sonderhände:** Nine Gates, All Honours, Big Winds/Dragons als eigene
  Distanzfunktionen, da sie sich stark von der Standardform unterscheiden.
- Ergebnis: Shanten-Wert je Handform, Minimum als Gesamt-Shanten.

### 4.2 Ukeire (akzeptierte Steine)
- Für jeden möglichen Abwurf: Menge der Steine, die den Shanten senken, gewichtet mit
  der Anzahl noch verfügbarer Kopien (sichtbare Steine: eigene Hand, alle Abwürfe,
  offene Sätze werden abgezogen).
- Auch für Calls: "Welche Abwürfe der anderen könnte ich rufen?"

### 4.3 Wertbewertung (Chinese-Classical-spezifisch)
- Da Chows nichts zählen, muss die Bewertung Punktepotenzial einbeziehen: Erwarteter
  Wert = Wahrscheinlichkeit × erwartete Punkte der Zielform.
- Bewertung berücksichtigt: Pung- vs. Chow-Wege, Honours-Paare, Farbreinheit,
  Verdopplungspotenzial, Nähe zu Limit-Händen.
- Ausgabe pro Abwurf: Shanten danach, Ukeire-Anzahl, geschätzter Handwert, Gesamtscore.

### 4.4 Gefahrenbewertung (Defensive)
- Ohne Furiten gibt es kein sicheres "Suji"; stattdessen: Anzahl sichtbarer Kopien,
  Steine, die ein Gegner mit offenen Sätzen wahrscheinlich braucht (z. B. offene Pungs
  einer Farbe → Farbrein-Gefahr), Honours-Gefahr, späte Spielphase.
- Ergebnis: Gefahrenwert 0–1 pro Stein und Gegner.

### 4.5 Wahrscheinlichkeiten (Poker-Stil)
- **Erfolgswahrscheinlichkeit der eigenen Hand:** Chance, die Hand vor Ende der Wand
  fertigzustellen, gegeben Shanten, Ukeire, verbleibende Wandsteine und Zugzahl.
  Berechnung in zwei Stufen:
  - Schnell (jeder Zug, < 20 ms): analytische Näherung über Ziehwahrscheinlichkeiten
    der nützlichen Steine je verbleibendem Zug (hypergeometrisch, kettenweise über
    Shanten-Stufen).
  - Genau (auf Anfrage oder im Worker): Monte-Carlo-Simulation mit zufälligen
    Restwänden (z. B. 2000 Durchläufe) unter Beibehaltung der sichtbaren Steine.
- **Gewinnwahrscheinlichkeit gegen die Gegner:** Erfolgswahrscheinlichkeit verrechnet
  mit einer Schätzung des Gegner-Tempos (offene Sätze, Abwurfmuster, Spielphase),
  angezeigt als "Gewinnchance ca. 34 %" wie ein Poker-Equity-Wert.
- **Handform-Wahrscheinlichkeiten:** Für jede erreichbare Handform (Standardhand
  mit Verdopplungen wie All Pungs, Half Flush, Full Flush, verdeckte Hand; Limit-Hände
  wie Thirteen Orphans, All Honours, Big Three Dragons; Optionen wie Seven Pairs) die
  Wahrscheinlichkeit, sie noch zu erreichen, sowie ihr Punktwert und der erwartete
  Wert (Wahrscheinlichkeit × Punkte). Ausgabe sortiert nach erwartetem Wert.
- Alle Wahrscheinlichkeiten hängen vom gewählten Abwurf ab; das Modul liefert sie pro
  Abwurfkandidat, damit der Berater "wenn du X wirfst, sinkt Full Flush auf 8 %" sagen
  kann.

### 4.6 Leistung
- Tabellenbasierte Vorberechnung für Farbmuster (0–9 Steine je Farbe) zur Beschleunigung.
- Ziel: vollständige Bewertung aller Abwürfe einer Hand unter 20 ms auf einem
  Mittelklasse-Handy, damit KI und Berater nicht spürbar verzögern.
- Optional Web Worker für Post-Game-Analyse ganzer Partien.

---

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
- SVG-Steinset (eigene Zeichnungen oder freie Lizenz), skalierbar, Dark/Light.
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
- Laufendes Spiel automatisch in `localStorage` (Seed + Log + Regelwerk reicht).
- Abgeschlossene Partien im Archiv (IndexedDB, wenn Größe wächst) für Analyse.
- Export/Import als JSON-Datei.

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
  (mit Beispielhänden aus Millington als Referenz), Shanten-Werte bekannter Hände,
  Call-Prioritäten, Undo-Konsistenz, Determinismus (gleicher Seed → gleiches Log).
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
index.html
PLAN.md
```
- ES-Module ohne Build-Schritt für den Start; Vite optional später für Bundling und
  Dev-Server. Deployment als statische Seite (GitHub Pages).
- PWA-Manifest und Service Worker für Offline-Nutzung auf dem Handy (nach Stufe 1).

### 10.4 Qualität
- ESLint + Prettier, CI-Workflow (Tests + Lint) auf GitHub Actions.
- Architekturregel: `core`, `scoring`, `analysis`, `ai` importieren nie aus `ui`.

---

## 11. Baustufen und Reihenfolge

### Stufe 1 — Chinese Classical komplett spielbar
1. Projektgerüst, Steine, Wand, Zufall mit Seed, Tests.
2. GameState, Aktionen, Phasen-Automat, `getLegalActions`, Protokoll.
3. Hand-Zerleger und Sonderhand-Erkenner (Millington-Standardliste).
4. Scoring nach Millington inkl. Verlierer-Wertung, Ost doppelt, Limit; Referenztests.
5. Shanten/Ukeire für Standardform + Thirteen Orphans (Minimalversion),
   Fertigstellungschance als Schnellrechnung.
6. KI "Mittel" als einzige Stufe.
7. UI: Tisch, Hand, Calls, Rundenende mit Punkteerklärung, Handy + Desktop.
8. Store, Undo, Autosave.
9. Einfacher Berater (bester Abwurf + ein Satz Begründung), Prozentanzeige
   Fertigstellungschance über der Hand.

### Stufe 2 — Schwierigkeitsgrade
- Wertbewertung und Gefahrenbewertung ausbauen, Stufen Anfänger/Mittel/Schwer,
  Fehlerinjektion, KI-gegen-KI-Simulationen zur Kalibrierung.

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

## 12. Offene Entscheidungen

Diese Punkte sind mit Standardwerten vorbelegt und lassen sich später umstellen:

| Thema | Vorbelegung | Alternative |
|---|---|---|
| Limit | 1000 | 500 |
| Blumen/Jahreszeiten | aus | an |
| Seven Pairs | aus (nicht Millington) | an als Option |
| Ost bleibt bei Unentschieden | ja | nein |
| Abwerfender zahlt für alle | nein (Millington) | ja |
| Startpunkte | 2000 | frei |
| Spiellänge | 4 Runden | 1 Runde |
| Steingrafiken | eigenes SVG-Set | freies Set unter offener Lizenz |
| Build | ohne Build-Schritt | Vite |
