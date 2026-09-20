# PWA (Installation, Offline, Updates)

- `manifest.webmanifest`: Name, Standalone-Anzeige, Farben, Icons (192, 512,
  maskable, SVG), Shortcuts (`?action=new|resume|lexicon`).
- `icons/`: `icon.svg` und `maskable.svg` sind die Quellen; die PNGs wurden per
  Headless-Chromium gerendert (512) und mit `scripts`-freiem Python-Resampler
  auf 192/180 verkleinert. Bei Änderung am SVG die PNGs neu erzeugen.
- `sw.js`: Precache aller Dateien aus `sw-manifest.js`, Cache First, Navigation
  immer aus dem Cache (Offline-Start), versionierte Caches (`mahjong-<hash>`),
  alte Caches werden beim Aktivieren gelöscht. `skipWaiting` per Nachricht.
- `sw-manifest.js` wird von `npm run build:sw` erzeugt (Hash über alle Dateien).
  Der Pages-Workflow erzeugt sie bei jedem Deploy neu; im Repo liegt eine
  Fassung für die lokale Entwicklung.
- `src/ui/pwa.js`: Registrierung (nur https oder localhost), Update-Erkennung
  (Banner "Update bereit" → Neu laden), Prüfung bei Sichtbarwerden,
  `beforeinstallprompt` → Knopf "App installieren" auf dem Startbildschirm,
  Wake Lock während einer laufenden Hand, Vibration bei Call-Angeboten.
- Deployment: `.github/workflows/pages.yml` baut nach `main`-Push die Seite
  (Tests, Precache-Liste, statische Dateien) und veröffentlicht sie auf GitHub
  Pages. In den Repo-Einstellungen muss Pages auf "GitHub Actions" stehen.
- Alle Pfade sind relativ, die App läuft auch unter einem Unterpfad.

## Grenzen der lokalen Prüfung

Headless-Chromium blockiert bei `serviceWorker.getRegistration()` unter
virtueller Zeit; die Registrierung wurde daher über Syntaxprüfung und
Erreichbarkeit aller Precache-Dateien abgesichert. Ein echter Offline-Test
gehört in die manuelle Checkliste (Android Chrome, iOS Safari, Desktop).
