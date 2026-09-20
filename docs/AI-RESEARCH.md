# Recherche: Gute Computergegner für Mahjong

Frage: Wie baut man KI-Gegner für Mahjong (Chinese Classical, Riichi als
Referenz), die sich strikt an die Regeln halten, auf mehreren Schwierigkeitsgraden
spielen und menschlich wirken? Welche Stellschrauben gibt es, wie kalibriert man
sie, und was dürfen die Gegner beobachten?

Methode: fünf Suchachsen (Stand der Forschung, heuristische Bausteine,
Gegnermodellierung, Difficulty Scaling, faire Bots), Abruf der Quellen, dreifache
Gegenprüfung der Kernaussagen. Mehrere Sekundärquellen (arXiv, Wikipedia,
riichi.wiki, mahjong.guide, Maia-Blog, GameAIPro) waren über den Netzwerk-Proxy
nicht abrufbar; Aussagen daraus sind als "aus Suchtreffern" markiert und mit
geringerer Konfidenz versehen.

## 1. Was die Gegner sehen dürfen

**Befund (hoch, verifiziert):** Die stärksten offenen Mahjong-KIs arbeiten
ausschließlich mit öffentlicher Information plus eigener Hand. Mortals
Beobachtungs-Encoder (`libriichi/src/state/obs_repr.rs`) kodiert nur: eigene
Steine, eigene und fremde Abwurf-Historien (mit Metadaten wie Tedashi/Riichi),
offene Sätze, Dora-Anzeiger, gesehene Steine, Reststeine in der Wand, Punkte,
Winde. Keine fremden Hände, keine Wand [Mortal, Quellcode; dreifach bestätigt].
Kanachan füttert Steine, Sätze und Abwürfe als reine Tokens in ein
Transformer-Modell und lernt aus 65 Millionen menschlichen Runden; die
Regelkonformität sichert ein separater C++-Simulator [Kanachan README; bestätigt].
Mizukami/Tsuruoka zerlegen Gegnermodellierung in genau drei Vorhersagen aus
öffentlicher Information: Ist der Gegner wartend (Tenpai)? Auf welche Steine?
Mit welchem Punktwert? Diese Modelle werden aus Expertenpartien gelernt, nicht aus
verdeckter Information [CIG 2015; Abstract bestätigt, Volltext blockiert].

**Befund (mittel, Praxisquelle):** Spieler reagieren am schärfsten auf den bloßen
Verdacht, die KI schummele; Transparenz darüber, was die KI je Stufe sieht und
bekommt, ist das Gegenmittel (Soren Johnson, "Game AI & Our Cheatin' Hearts").
In symmetrischen Spielen ist die Versuchung zu schummeln groß, gerade deshalb
lohnt der Verzicht.

**Konsequenz für diese App:** Die KI liest nur `visibleCounts(state, seat)`
(eigene Hand, alle Abwürfe, alle Sätze) und öffentliche Zähler. Ein
Eigenschaftstest (`tests/ai.test.js`, "schummelt nicht") permutiert fremde Hände
und Wand und prüft, dass jede KI-Entscheidung identisch bleibt. Der
Einstellungsbildschirm erklärt das in einem Satz.

## 2. Bausteine einer regelkonformen, heuristischen KI

**Befund (hoch):** Heuristische Bots bauen auf drei Säulen: Shanten (Abstand zum
Warten) mit gecachter Farbzerlegung, Ukeire (Annahmebreite) für die Abwurfwahl
und eine Defensive aus öffentlicher Information (Suji/Kabe-Schlüsse in Riichi,
Gefahrenwert je Stein, Push/Fold nach Erwartungswert) [Kymi808/mahjong-ai;
MahjongRepository/mahjong, gegen 26 Millionen Tenhou-Hände validiert].
Rufbereitschaft ist ein eigener, regelwerkabhängiger Parameter (konservativ in
Riichi, liberal in MCR) [Kymi808].

**Befund (mittel, aus Suchtreffern):** Der MDP-Abstraktionsansatz (arXiv
1904.07491) und die Shanten-Herleitung (ezyang) bestätigen die Standardformel
`8 − 2·Sätze − Teilsätze − Paar`; Volltexte blockiert.

**Konsequenz:** Umgesetzt in `src/analysis` (Shanten mit Farbtabellen-Cache,
Ukeire, Abwurfbewertung aus Chance, Wertpotenzial, Gefahr) und `src/ai`.
Regelkonformität ist strukturell: die KI wählt nur aus `getLegalActions`.

## 3. Schwierigkeitsgrade: welche Stellschrauben

**Befund (hoch, Primärquelle FAQ):** Stockfish schwächt nicht die Suche, sondern
wählt bewusst zweitbeste Züge: mindestens vier Kandidaten (MultiPV), ein
zufälliger Bias auf die Bewertung schwächerer Kandidaten, gekoppelt an die
Suchtiefe (Skill Level 0 wählt bei Tiefe 1, Level 10 bei Tiefe 11). Die Skala ist
gegen gemessene Elo kalibriert (~1350 bis ~3200) und über ein Elo-Ziel
(UCI_Elo) bedienbar [Stockfish FAQ].

**Befund (mittel, aus Suchtreffern):** Maia (Toronto) zeigt die Alternative zu
"Rauschen auf starkem Modell": neun Modelle, je auf menschliche Partien einer
Elo-Stufe trainiert, treffen menschliche Züge deutlich häufiger als eine
abgeschwächte starke Engine. Dynamic Difficulty Adjustment (Zohaib 2018) passt
Stärke laufend an Leistung an, mit dem Risiko, dass Spieler die Anpassung
bemerken.

**Stellschrauben in der Praxis (Synthese):**
1. Zugauswahl-Rauschen (Stockfish-Prinzip): Top-N Kandidaten, Bias skaliert mit
   der Stufe.
2. Rechen- oder Suchbudget: Tiefe, Anzahl Simulationen, Zweitordnungs-Ukeire nur
   auf hohen Stufen.
3. Bewertungsgewichte: Wert vs. Tempo, Gefahrgewicht, Rufbereitschaft
   (Chow-Schwelle, "verdeckt halten bis Shanten x").
4. Wissensumfang statt Information: schwächere Stufen ignorieren Gegnermodelle
   (Tempo, Gefahrenmuster), stärkere nutzen sie. Nie: mehr Information.
5. Fehlerinjektion mit menschlichem Muster: schwache Stufen werfen Einzelsteine
   zufällig, rufen zu viel, verteidigen nicht; nicht "zufällig absurd".

**Konsequenz:** `AI_PARAMS` (Gewichte, Rufschwellen) und `SKILL` (Top-N,
Rauschen) in `src/ai/player.js`; Schwer bekommt Zweitordnungs-Ukeire und
Gefahrgewichtung, Mittel Rauschen über die drei besten Abwürfe, Anfänger
zufällige Einzelsteine und maximale Rufbereitschaft.

## 4. Kalibrierung

**Befund (hoch, verifiziert):** Mortal misst Stärke über 1-gegen-3-Duplikat-
Mahjong: vier Partien mit identischem Seed (gleiche Wände und Hände), der
Herausforderer rotiert über die Sitze; Kennzahlen sind mittlerer Rang und
Rangpunkte ([90, 45, 0, −135]); typische Werte: ~21 % Gewinnrate, 11–13 %
Abwurf ins Mahjong. Millionen Selbstspiel-Partien dienen als Regressionstest
zwischen Versionen [Mortal-Doku, dreifach bestätigt]. Suphx wurde gegen eine
große menschliche Population (Tenhou-Rang über 99,99 % der Spieler) validiert,
nicht nur im Selbstspiel [arXiv 2003.13590, bestätigt].

**Konsequenz:** `scripts/simulate.js` spielt Duplikat-Matches (jede Wand viermal,
Stufen rotieren) und meldet Gewinnrate, Abwürfe ins Mahjong und Bilanz je Hand.
Die Post-Game-Analyse liefert die Spielerseite: Genauigkeit und Fehlerklassen,
mit denen sich später eine adaptive Stufenempfehlung ableiten lässt.

## 5. Menschlich wirken

**Synthese (mittel):** Menschliche Wirkung entsteht aus (a) plausiblen Fehlern
(Maia-Idee: Fehler, die Menschen dieser Stufe machen: zu langes Festhalten an
Paaren, späte Defensive, zu viele Chows), (b) sichtbarer Bedenkzeit (KI-Tempo
als Einstellung), (c) Stil-Varianten (aggressiv/defensiv) statt einer einzigen
optimalen Linie, (d) Verzicht auf Allwissenheit. Zu effiziente
Wahrscheinlichkeitsschätzung wirkt unmenschlich (arXiv 2505.20011, aus
Suchtreffern).

## Quellen

Verifiziert (Primärquelle abgerufen oder Abstract dreifach bestätigt):
- Li et al., Suphx: Mastering Mahjong with Deep Reinforcement Learning, arXiv 2003.13590 (2020).
- Equim-chan/Mortal, `libriichi/src/state/obs_repr.rs` und `docs/src/perf/strength.md`.
- Cryolite/kanachan, README.
- Mizukami, Tsuruoka: Building a Computer Mahjong Player Based on Monte Carlo Simulation and Opponent Models, IEEE CIG 2015 (Abstract).
- Kymi808/mahjong-ai, README; MahjongRepository/mahjong, README.
- Stockfish FAQ (Skill Level, UCI_Elo).
- Soren Johnson, Game AI & Our Cheatin' Hearts (Game Developer).

Nur aus Suchtreffern (Volltext blockiert): arXiv 1904.07491 (MDP-Abstraktion),
ezyang: Calculating Shanten, riichi.wiki Defense, mahjong.guide Defense, Maia
(csslab Toronto), Zohaib 2018 DDA Review, arXiv 2310.16581 (Hybrid
Minimax-MCTS), GameAIPro 3 Kap. 4, arXiv 2505.20011.
