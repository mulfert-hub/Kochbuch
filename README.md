# Kochbuch

Eine Progressive Web App für dein Handy: Screenshots von Rezepten hochladen, **Claude** (Anthropic) liest sie aus, und daraus wird ein durchblätterbares Kochbuch. Kein eigener Server, kein Tracking. Die Rezepte liegen im Browser-Speicher des Handys (IndexedDB), auf Wunsch zusätzlich in eurem Google Drive.

<p>
  <img src="docs/buch-titel.png" width="200" alt="Titelseite mit Inhaltsverzeichnis">
  <img src="docs/buch-rezept.png" width="200" alt="Rezeptseite im Buch">
  <img src="docs/buch-rezept-dunkel.png" width="200" alt="Rezeptseite im Dark Mode">
  <img src="docs/einkauf.png" width="200" alt="Einkaufsliste">
</p>

## Funktionen

- **Import**: mehrere Screenshots oder Fotos auf einmal per Dateiauswahl, Kamera, Drag & Drop, Einfügen (Strg+V) oder **Teilen → Kochbuch** (Android). Optional zuschneiden. Mehrere Bilder können **ein** Rezept ergeben. Alternativ Rezepttext einfügen oder ein Rezept von Hand anlegen.
- **Rezepterkennung mit Claude** (eigener API-Schlüssel, Einrichtung siehe unten): Claude Opus 5.5 liest Titel, Portionen, Zeit, Zutaten (Menge, Einheit, Name, Notiz, Zwischenüberschriften), Schritte und Tipps und schlägt eine Kategorie vor. Steht kein Rezeptname im Bild, bleibt der Titel leer zum selbst Eintragen. Das Originalbild bleibt am Rezept gespeichert.
- **Prüfbildschirm**: alle Felder editierbar, Original daneben (Handy: ausklappbar oben). Zutaten auch „als Text“ bearbeitbar.
- **Buchansicht**: eine Rezeptseite pro Ansicht, Titelseite mit Inhaltsverzeichnis, Blättern per Wischen, Pfeiltasten oder Buttons, mit Seiten-Animation. Beim Kochen Zutaten und Schritte antippen, um sie abzuhaken.
- **Liste + Detail**: Suche über Titel, Zutaten und Schritte (umlauttolerant: „kurbis“ findet „Kürbis“), Filter nach Kategorie. Am Handy Liste → Detail, am großen Bildschirm nebeneinander.
- **Inhaltsverzeichnis** nach Kategorien. Kategorien anlegen, umbenennen, sortieren, löschen. Mehrere Kategorien pro Rezept möglich.
- **Portionen umrechnen** mit +/–. Brüche bei EL, TL und Stück („1½“, „¾“), Dezimalzahlen mit Komma und sinnvoller Rundung bei g und ml („190 g“ statt „187,5 g“), Plural („1 Zehe“ → „2 Zehen“).
- **Einkaufsliste**: aus einem oder mehreren Rezepten (Rezeptliste → „Auswählen“). Gleiche Zutaten werden zusammengefasst und Einheiten umgerechnet (500 g + 1 kg = 1,5 kg). Abhaken, löschen, leeren, eigene Einträge.
- **Foto vom Gericht**: per Kamera oder aus der Mediathek, oder ein **Beispielfoto** aus freien Bilddatenbanken (Openverse) mit automatischem Bildnachweis.
- **Synchronisation** über ein gemeinsames Google-Konto (versteckter App-Ordner in Google Drive): Rezepte, Kategorien und Fotos auf mehreren Handys gleich halten. Einrichtung siehe unten.
- **Backup**: Export und Import aller Daten inklusive Bilder als eine JSON-Datei, zusammenführen oder ersetzen.
- **Offline** nach dem ersten Laden (Lesen, Blättern, Einkaufsliste, Bearbeiten; nur das Einlesen neuer Rezepte braucht Internet), installierbar auf dem Homescreen, Dark Mode passend zum System.

Beim ersten Start werden 8 Beispielrezepte angelegt. Unter **Mehr** kannst du sie löschen oder erneut hinzufügen.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev        # Entwicklungsserver, auch im WLAN erreichbar (Adresse steht in der Konsole)
```

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run build` | Produktions-Build nach `dist/` (mit Service Worker) |
| `npm run preview` | gebauten Stand lokal ausliefern (auch im WLAN) |
| `npm test` | Unit-Tests (Mengen, Zutaten-Parser, Rezept-Heuristik, Einkaufsliste, Seiten zusammenfügen, Spaltenerkennung) |
| `npm run test:claude` | Claude-Erkennung mit nachgebildeter Anthropic-API: Anfrage, Übernahme, Fehlerfälle (nach `build`) |
| `npm run test:sync` | Synchronisationstest mit zwei „Handys“ und nachgebildetem Google Drive (nach `build`) |
| `npm run test:app` | Funktionstest im Browser: Blättern, Portionen, Einkaufsliste, Suche, Backup, Offline (nach `build`) |

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
5. Unter **Mehr → Rezepterkennung mit Claude** den API-Schlüssel eintragen (siehe unten).

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

## Rezepterkennung mit Claude einrichten

1. Auf [console.anthropic.com](https://console.anthropic.com) ein Konto anlegen, unter **Billing** Guthaben aufladen (z. B. 5 €) und unter **Limits** ein monatliches Ausgabenlimit setzen.
2. Unter **API Keys** einen Schlüssel erstellen (beginnt mit `sk-ant-`).
3. In der App: **Mehr → Rezepterkennung mit Claude** → Schlüssel einfügen → Speichern. Auf jedem Handy einzeln, der Schlüssel wird nicht synchronisiert.

**Kosten:** mit „Genau“ (Claude Opus 5.5) grob 3–6 Cent pro Rezept, je nach Bildgröße und Anzahl der Screenshots; mit „Günstig“ (Claude Haiku 5.5) unter 1 Cent. **Datenschutz:** Die Bilder werden zur Erkennung an Anthropic geschickt. Der Schlüssel liegt nur im Speicher des Handys.

## Synchronisation über Google Drive einrichten

Einmalig, etwa 10 Minuten, am besten am Computer. Alles mit dem **gemeinsamen Google-Konto** erledigen.

1. [console.cloud.google.com](https://console.cloud.google.com) öffnen und mit dem gemeinsamen Konto anmelden.
2. Oben auf die Projektauswahl tippen → **„Neues Projekt“** → Name „Kochbuch“ → **Erstellen**. Danach sicherstellen, dass oben „Kochbuch“ ausgewählt ist.
3. Menü ☰ → **„APIs und Dienste“ → „Bibliothek“** → nach **„Google Drive API“** suchen → **Aktivieren**.
4. Menü ☰ → **„Google Auth Platform“** (bzw. „APIs und Dienste → OAuth-Zustimmungsbildschirm“) → **„Jetzt starten“**:
   - App-Name: „Kochbuch“, Nutzersupport-E-Mail: euer Konto
   - Zielgruppe: **Extern**
   - Kontaktdaten: euer Konto → Zustimmen → **Erstellen**
5. Links **„Zielgruppe“** → bei „Testnutzer“ **„Nutzer hinzufügen“** → die E-Mail-Adresse des gemeinsamen Kontos eintragen → Speichern. Der Status „Testen“ kann so bleiben.
6. Links **„Clients“** → **„Client erstellen“**:
   - Anwendungstyp: **Webanwendung**, Name: „Kochbuch-App“
   - Autorisierte JavaScript-Quellen: `https://mulfert-hub.github.io`
   - Autorisierte Weiterleitungs-URIs: `https://mulfert-hub.github.io/Kochbuch/` (genau so, mit Schrägstrich am Ende)
   - **Erstellen** → die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`). Ein Client-Schlüssel („secret“) wird nicht gebraucht.
7. Client-ID in die App bringen, eine von zwei Möglichkeiten:
   - in der App unter **Mehr → Synchronisation** eintragen (auf jedem Handy), oder
   - einmalig im Repository unter **Settings → Secrets and variables → Actions → Variables** als `GOOGLE_CLIENT_ID` anlegen. Dann ist sie nach der nächsten Veröffentlichung auf allen Handys schon eingetragen.
8. Auf jedem Handy: **Mehr → Synchronisation → „Mit Google Drive verbinden“** → mit dem gemeinsamen Konto anmelden. Hinweis „Google hat diese App nicht überprüft“ → **„Weiter“** (es ist eure eigene App).

**So funktioniert es:** Die App speichert in einem versteckten App-Ordner in Google Drive (im Drive nicht sichtbar, die App sieht auch nichts anderes). Synchronisiert wird beim Öffnen der App und wenige Sekunden nach jeder Änderung. Pro Rezept gewinnt die neuere Änderung, gelöschte Rezepte bleiben gelöscht, gleiche Kategorien und doppelte Beispielrezepte werden zusammengelegt. Die Einkaufsliste bleibt pro Handy getrennt. Ohne Internet arbeitet die App normal weiter und gleicht später ab.

**Datenschutz:** Mit eingeschalteter Synchronisation liegen Rezepte und Fotos zusätzlich in eurem Google Drive. Unabhängig davon gehen eingelesene Bilder und Texte zur Erkennung an Anthropic (Claude) und bei Fotovorschlägen der Rezepttitel an Openverse.

## Technik

- **Vite + React + TypeScript**: Für das Blättern genügen Pointer-Events und CSS-3D-Transforms, es gibt keine Animationsbibliothek. Hash-Routing, damit GitHub Pages ohne Serverkonfiguration funktioniert.
- **Dexie** (IndexedDB) für Rezepte, Kategorien, Bilder (als Blob), Einkaufsliste und Einstellungen.
- **Claude** über das offizielle Anthropic-SDK (`@anthropic-ai/sdk`), direkt aus dem Browser mit dem Schlüssel des Nutzers; Antwort als strukturierte Ausgabe (Zod-Schema), Einheiten werden auf die App-Kurzformen normalisiert.
- **vite-plugin-pwa** (injectManifest) mit eigenem Service Worker `src/sw.ts`: Precache der App, Web Share Target (POST).
- Schriften (Fraunces, Instrument Sans) sind über `@fontsource` gebündelt und funktionieren offline.

### Projektstruktur

```
src/
  types.ts              Datenmodell
  db/                   Dexie-Schema, Repository-Funktionen, Beispieldaten, Backup
  ai/                   Rezepterkennung mit Claude
  sync/                 Google-Anmeldung, Drive-Client, Synchronisation
  lib/                  reine Logik (getestet): Mengen, Einheiten, Zutaten-Parser,
                        Einkaufsliste, Suche, Fotosuche, Zusammenführen beim Sync
  ocr/                  Import-Ablauf, Share Target
  components/           Rezeptdarstellung, Editor, Zuschneiden, Lightbox, Dialoge, Icons
  views/                Buch, Rezepte (Liste/Detail), Inhalt, Einkauf, Import, Prüfen, Bearbeiten, Mehr
  styles/               Designsystem (Farben, Typografie, Dark Mode) und Ansichten
  sw.ts                 Service Worker
tests/                  Unit-Tests (Vitest)
e2e/                    Browser-Tests (App, Claude mit nachgebildeter API, Synchronisation)
scripts/                Icons erzeugen, Playwright laden
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

Anthropic-SDK: MIT. Schriften Fraunces und Instrument Sans: SIL Open Font License.
