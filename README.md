# Kochbuch

Eine Progressive Web App für dein Handy: Screenshots von Rezepten hochladen, die App liest den Text **direkt auf dem Gerät** (Tesseract.js, Deutsch) und macht daraus ein durchblätterbares Kochbuch. Kein Konto, kein Server, keine Cloud, kein Tracking. Alles bleibt in deinem Browser (IndexedDB).

<p>
  <img src="docs/buch-titel.png" width="200" alt="Titelseite mit Inhaltsverzeichnis">
  <img src="docs/buch-rezept.png" width="200" alt="Rezeptseite im Buch">
  <img src="docs/buch-rezept-dunkel.png" width="200" alt="Rezeptseite im Dark Mode">
  <img src="docs/einkauf.png" width="200" alt="Einkaufsliste">
</p>

## Funktionen

- **Import**: mehrere Screenshots auf einmal per Dateiauswahl, Drag & Drop, Einfügen (Strg+V) oder **Teilen → Kochbuch** (Android). Optional zuschneiden. Mehrere Bilder können **ein** Rezept ergeben, Überlappungen werden entfernt. Alternativ Text einfügen oder ein Rezept von Hand anlegen.
- **Bildaufbereitung**: Skalieren, Graustufen, automatische Umkehrung von Dark-Mode-Screenshots, Kontrastanpassung. Über das ✨-Symbol siehst du, was die Texterkennung zu sehen bekommt.
- **Automatische Zerlegung** in Titel, Portionen, Zeit, Zutaten (Menge, Einheit, Name, Notiz, Zwischenüberschriften) und Schritte. Das Originalbild bleibt am Rezept gespeichert.
- **Prüfbildschirm**: alle Felder editierbar, Original daneben (Handy: ausklappbar oben). Zutaten auch „als Text“ bearbeitbar. Rohtext ansehen und neu auswerten.
- **Buchansicht**: eine Rezeptseite pro Ansicht, Titelseite mit Inhaltsverzeichnis, Blättern per Wischen, Pfeiltasten oder Buttons, mit Seiten-Animation. Beim Kochen Zutaten und Schritte antippen, um sie abzuhaken.
- **Liste + Detail**: Suche über Titel, Zutaten und Schritte (umlauttolerant: „kurbis“ findet „Kürbis“), Filter nach Kategorie. Am Handy Liste → Detail, am großen Bildschirm nebeneinander.
- **Inhaltsverzeichnis** nach Kategorien. Kategorien anlegen, umbenennen, sortieren, löschen. Mehrere Kategorien pro Rezept möglich.
- **Portionen umrechnen** mit +/–. Brüche bei EL, TL und Stück („1½“, „¾“), Dezimalzahlen mit Komma und sinnvoller Rundung bei g und ml („190 g“ statt „187,5 g“), Plural („1 Zehe“ → „2 Zehen“).
- **Einkaufsliste**: aus einem oder mehreren Rezepten (Rezeptliste → „Auswählen“). Gleiche Zutaten werden zusammengefasst und Einheiten umgerechnet (500 g + 1 kg = 1,5 kg). Abhaken, löschen, leeren, eigene Einträge.
- **Backup**: Export und Import aller Daten inklusive Bilder als eine JSON-Datei, zusammenführen oder ersetzen.
- **Offline** nach dem ersten Laden, installierbar auf dem Homescreen, Dark Mode passend zum System.

Beim ersten Start werden 8 Beispielrezepte angelegt. Unter **Mehr** kannst du sie löschen oder erneut hinzufügen.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install        # kopiert dabei auch Tesseract-Dateien + deutsche Sprachdaten nach public/tesseract
npm run dev        # Entwicklungsserver, auch im WLAN erreichbar (Adresse steht in der Konsole)
```

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run build` | Produktions-Build nach `dist/` (mit Service Worker) |
| `npm run preview` | gebauten Stand lokal ausliefern (auch im WLAN) |
| `npm test` | Unit-Tests (Mengen, Zutaten-Parser, Rezept-Heuristik, Einkaufsliste, Seiten zusammenfügen, Spaltenerkennung) |
| `npm run test:app` | Funktionstest im Browser: Blättern, Portionen, Einkaufsliste, Suche, Backup, Offline (nach `build`) |
| `npm run test:ocr` | OCR-Test mit Beispiel-Screenshots, siehe [docs/OCR-TEST.md](docs/OCR-TEST.md) (nach `build`) |
| `npm run fixtures` | Beispiel-Screenshots für den OCR-Test neu erzeugen |

Die Browser-Tests nutzen Playwright mit Chromium. Falls das nicht installiert ist: `npm i -D playwright && npx playwright install chromium`.

## Auf dem Handy installieren

Eine PWA braucht **HTTPS**, damit Service Worker (Offline-Betrieb) und Installation funktionieren. Ausnahme ist `localhost`.

### Variante A: GitHub Pages (empfohlen, kostenlos)

1. Den Code auf GitHub in den Branch `main` bringen.
2. Im Repository **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht bei jedem Push automatisch. Die Adresse lautet `https://<benutzername>.github.io/<repo-name>/`.
4. Die Adresse auf dem Handy öffnen:
   - **iPhone (Safari)**: Teilen-Symbol → **„Zum Home-Bildschirm“**.
   - **Android (Chrome)**: Menü ⋮ → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“.
5. Einmal **Mehr → Texterkennung offline → Jetzt laden** tippen (ca. 5 MB, am besten im WLAN). Danach funktioniert alles auch im Flugmodus.

Die Rezepte liegen nur auf deinem Handy, nicht auf GitHub. GitHub liefert nur die App-Dateien aus.

### Variante B: lokal im WLAN

```bash
npm run build && npm run preview     # zeigt z. B. http://192.168.178.20:4173
```

Die Adresse auf dem Handy (im selben WLAN) öffnen. Über `http://192.168…` funktioniert die App zum Ausprobieren, **ohne HTTPS aber kein Offline-Betrieb und keine echte Installation**. Für dauerhafte Nutzung im WLAN brauchst du ein lokales Zertifikat (z. B. mit [@vitejs/plugin-basic-ssl](https://github.com/vitejs/vite-plugin-basic-ssl) bzw. [mkcert](https://github.com/FiloSottile/mkcert) in der Vite-Konfiguration) oder einen Tunnel mit HTTPS. Einfacher ist Variante A.

### Teilen-Funktion (Share Target)

- **Android**: Nach der Installation erscheint „Kochbuch“ im Teilen-Menü der Galerie. Geteilte Screenshots landen direkt im Import.
- **iPhone**: Safari unterstützt Share Targets für Web-Apps nicht. Nutze im Import „Screenshots auswählen“, dort kannst du direkt aus Fotos wählen.

### Daten sicher halten

- Die Daten liegen im Browser-Speicher des Geräts. **Mach regelmäßig ein Backup** (Mehr → Backup exportieren) und speichere die Datei z. B. in iCloud Drive oder Google Drive.
- iOS kann Speicher von Webseiten, die lange nicht geöffnet wurden, löschen. Als **installierte App** auf dem Homescreen ist das deutlich unwahrscheinlicher. Die App bittet dann um „dauerhaften Speicher“ (Status unter Mehr → Speicher).
- Wichtig: Safari und die Homescreen-App haben auf dem iPhone **getrennte Speicher**. Nutze die App immer über das Homescreen-Symbol.

## Technik

- **Vite + React + TypeScript**: Für das Blättern genügen Pointer-Events und CSS-3D-Transforms, es gibt keine Animationsbibliothek. Hash-Routing, damit GitHub Pages ohne Serverkonfiguration funktioniert.
- **Dexie** (IndexedDB) für Rezepte, Kategorien, Bilder (als Blob), Einkaufsliste und Einstellungen.
- **Tesseract.js** mit selbst ausgelieferten Dateien (`public/tesseract/`: Worker, WASM-Kern in SIMD- und Basis-Variante, `deu.traineddata`). Es werden **keine** CDN-Dateien geladen. Die OCR-Dateien cacht der Service Worker beim ersten Gebrauch.
- **vite-plugin-pwa** (injectManifest) mit eigenem Service Worker `src/sw.ts`: Precache der App, Laufzeit-Cache der OCR-Dateien, Web Share Target (POST).
- Schriften (Fraunces, Instrument Sans) sind über `@fontsource` gebündelt und funktionieren offline.

### Projektstruktur

```
src/
  types.ts              Datenmodell
  db/                   Dexie-Schema, Repository-Funktionen, Beispieldaten, Backup
  lib/                  reine Logik (getestet): Mengen, Einheiten, Zutaten-Parser,
                        Rezept-Heuristik, Spaltenerkennung, Screenshots zusammenfügen,
                        Einkaufsliste, Suche
  ocr/                  Bildvorverarbeitung (Canvas), Tesseract-Wrapper, Import-Ablauf, Share Target
  components/           Rezeptdarstellung, Editor, Zuschneiden, Lightbox, Dialoge, Icons
  views/                Buch, Rezepte (Liste/Detail), Inhalt, Einkauf, Import, Prüfen, Bearbeiten, Mehr
  styles/               Designsystem (Farben, Typografie, Dark Mode) und Ansichten
  sw.ts                 Service Worker
tests/                  Unit-Tests (Vitest)
e2e/                    Browser-Tests, OCR-Test, Beispiel-Screenshots + erwartete Ergebnisse
scripts/                Tesseract-Dateien kopieren, Icons erzeugen
```

### Datenmodell

```ts
Recipe      { id, title, servings, servingsLabel, categoryIds[], ingredients[], steps[], notes,
              timeMinutes, imageIds[], ocrText, createdAt, updatedAt }
Ingredient  { id, quantity, quantityMax, unit, name, note, group }
Category    { id, name, order }
StoredImage { id, recipeId, blob, type, createdAt }
ShoppingItem{ id, name, unit, quantity, checked, sources[{recipeId, title}], order }
```

Mengen werden als Zahl gespeichert („½“ → 0.5) und erst bei der Anzeige formatiert. Die Einkaufsliste speichert intern in g bzw. ml und rechnet bei der Anzeige zurück.

## Lizenzen

Tesseract.js und tesseract.js-core: Apache-2.0. Sprachdaten (tessdata): Apache-2.0. Schriften Fraunces und Instrument Sans: SIL Open Font License.
