# OCR-Test: Wie gut liest die App Rezept-Screenshots?

Getestet wurde die komplette Pipeline im echten Browser (Chromium, gebaute App). Dazu gehören Bildvorverarbeitung, Tesseract.js (Deutsch, LSTM, `4.0.0_best_int`), die Zerlegung in Felder und das Zusammenfügen mehrerer Screenshots. Der Test lässt sich jederzeit wiederholen:

```bash
npm run build
npm run test:ocr      # Bericht: e2e/output/ocr-report.json + Screenshots der Prüfansicht
```

Die Testbilder liegen in `e2e/fixtures/`, die erwarteten Werte in `e2e/ground-truth.json`.

## Testbilder

| Bild | Beschreibung | Rolle |
|---|---|---|
| `app-hell-1…3.png` | Rezept-App, hell, Zutaten als Tabelle (Menge links), „Schritt 1…4“, halbtransparente Tab-Leiste überdeckt Text, **3 überlappende Screenshots** | Entwicklungsbild |
| `blog-dunkel-1…2.png` | Blog im **Dark Mode**, Serifenschrift, Aufzählungspunkte, Schritte als Absätze ohne Nummern, Tipp-Kasten, **2 Screenshots mit großer Überlappung** | Entwicklungsbild |
| `social-post.jpg` | Instagram-artiger Post: kleine Schrift, Emojis, JPEG-Kompression (Qualität 55), **Menge rechts** („Mozzarella … 1 Kugel“), Hashtags | Kontrollbild |
| `echt-chatgpt.jpg` | **Echter Screenshot** vom iPhone: ChatGPT-Antwort mit Rezept, Aufzählungspunkte, nummerierte Schritte **ohne** „Zubereitung“-Überschrift, Emojis, Eingabeleiste | Echtes Bild (Nutzer-Feedback) |
| `kochbuch-foto.jpg` | Simuliertes **Handyfoto einer Buchseite**: schräg (-2°), leicht unscharf, ungleichmäßig beleuchtet, **zweispaltig** (Zutaten links, Text rechts, Blocksatz mit Silbentrennung) | Kontrollbild |

Alle Bilder haben iPhone-Auflösung (1179 × 2556 px). Echte Fotos von Papier konnte ich hier nicht machen. Das „Kochbuch-Foto“ ist deshalb nur eine Annäherung.

## Ergebnisse (aktueller Stand)

| | Titel | Portionen | Zeit | Zutaten komplett richtig¹ | Schritte |
|---|---|---|---|---|---|
| App, 3 Screenshots | ✓ | ✓ | ✓ | **13 / 13** | 4 / 4, 100 % Text |
| Blog Dark Mode, 2 Screenshots | ✓ | ✓ | ✓ | **10 / 10** | 4 / 4, 100 % Text, Tipp → Notiz ✓ |
| Social-Media-Post | ✗ | ✓ | – | **6 / 6** | 4 / 4 (letzter mit „Guten Appetit!“) |
| Echter ChatGPT-Screenshot | ✓ | – | – | **4 / 4** | 4 / 4, Tipp → Notiz ✓ |
| Buchseite (Foto) | ✓ | ✓ | ✓ | **7 / 11** | 3 / 4 (zwei Absätze verschmolzen) |

¹ Menge, Einheit und Name stimmen alle.
Dauer im Desktop-Browser: 2,5 bis 5 s pro Rezept. Auf dem Handy rechne ich mit dem 2- bis 4-Fachen.

### Ehrlicher Hinweis zur Aussagekraft

- Die beiden **Entwicklungsbilder** habe ich während der Entwicklung immer wieder verwendet und die Heuristik daran nachgeschärft. 100 % ist dort also **kein unabhängiges Ergebnis**.
- Die beiden **Kontrollbilder** sind erst nach dem Tuning entstanden. Im **ersten Durchlauf** waren die Ergebnisse deutlich schlechter:
  - Social-Post: 2 von 6 Zutaten richtig, Schritte nur zu ~25 % richtig.
  - Buchseite: 0 von 11 Zutaten richtig, 0 Schritte, weil beide Spalten quer gelesen wurden.
- Danach habe ich **eine Runde allgemeine Verbesserungen** eingebaut: Spaltenerkennung über Wortpositionen, das „Zutat … Menge“-Layout und die Entfernung von OCR-Resten vor Überschriften. Damit sind auch die Kontrollbilder nicht mehr ganz unabhängig. Für eine wirklich neutrale Einschätzung braucht es deine echten Screenshots.

### Echter Screenshot (ChatGPT-Antwort)

Erster Durchlauf mit dem echten Bild: falscher Titel („Ja, natürlich! …“), Zutaten verklebt („309 g Hirse e Y% kleiner Apfel“), alle Schritte bei den Zutaten statt bei der Zubereitung. Danach behoben, allgemein und nicht nur für dieses Bild:

- Nummerierte Schritte („1. Hirse …“) beenden die Zutatenliste, auch ohne Überschrift „Zubereitung“.
- Titel aus Einleitungssätzen wie „So bereitest du den … zu:“ oder „Rezept für …“.
- OCR-Fehler: „Y%“ → ½, Aufzählungspunkt als „e“ vor einem Bruch, „309g“ (doppelt gelesenes g) → „30 g“.
- Emoji-Reste („&“), Icon-Leisten und Chat-Eingabezeilen („ChatGPT fragen“) werden entfernt.

Der Rohtext ist als Unit-Test hinterlegt (`tests/real-chatgpt.test.ts`).

## Was gut funktioniert

- **Die Texterkennung an sich** ist bei Screenshots, also scharfer Bildschirmschrift, sehr gut. Selbst Umlaute, ß, °C und „½“ werden meist korrekt gelesen.
- **Dark-Mode-Screenshots**: Sie werden automatisch invertiert, das funktioniert einwandfrei.
- **Mehrere Screenshots eines Rezepts**: Überlappungen beim Scrollen werden erkannt und entfernt. Das gilt auch dann, wenn die Randzeile auf einem Bild angeschnitten ist; die besser lesbare Fassung gewinnt. Status- und Tab-Leisten, die auf jedem Bild stehen, werden entfernt.
- **Typische Layouts**: Überschriften wie „Zutaten“, „Zubereitung“ oder „So geht's“, nummerierte Schritte („1.“, „Schritt 1“), Aufzählungspunkte, Silbentrennung am Zeilenende, Zwischenüberschriften („Für den Teig:“), Mengen in Tabellen- oder Spaltenform.
- **Mengen**: „1½“, „½“, „1,5“, „2–3“, „200g“ (ohne Leerzeichen), Langformen wie „Esslöffel“ und „Päckchen“.

## Wo die Erkennung Fehler macht

1. **Titel bei Social-Media-Posts**: Der Titel steht dort mitten in der Bildunterschrift hinter dem Benutzernamen. Die App nimmt dann den Benutzernamen („kochliebe_anna“). → Titel im Prüfbildschirm korrigieren.
2. **Unscharfe Fotos**: Einzelne Ziffern werden falsch gelesen, zum Beispiel „2“ als „e“ oder „1“ als „;“. Die Zeile verliert dann ihre Menge oder wird an die vorige Zutat angehängt („2 Gewürzgurken e Zwiebeln“).
3. **Umbrochene Zutaten**: „2 EL mittelscharfer / Senf“ über zwei Zeilen wird zu zwei Zutaten, weil „Senf“ großgeschrieben ist und wie eine eigene Zutat ohne Menge aussieht (etwa „Salz“).
4. **Brüche in kleiner Schrift**: „½“ wird manchmal als „Y%“, „%“ oder „Vz“ gelesen. „%“ und „Vz“ korrigiert die App, „Y%“ nicht.
5. **Absätze ohne Nummerierung**: Bei Blocksatz oder schräg fotografierten Seiten erkennt die App nicht immer, wo ein Schritt endet. Dann werden zwei Schritte zu einem. → Im Editor gibt es „Mit vorherigem zusammenführen“; zum Trennen einen neuen Schritt anlegen und den Text verschieben.
6. **Emojis und Icons** erscheinen als Zeichensalat („@#&“) oder fehlen ganz.
7. **Portionen ohne Schlüsselwort**: Ein nacktes „4“ zwischen „−“ und „+“ wird nur erkannt, wenn irgendwo „Portionen“ oder „Personen“ steht.
8. **Zubereitungszeit** wird nur übernommen, wenn sie oben im Rezept steht (etwa „30 Min.“, „1 Std. 15 Min.“, „Zubereitungszeit: …“).
9. **Fotos aus Büchern** (Wölbung, Schatten, Schrägstand über ~5°): ungetestet mit echten Fotos. Hier ist mit deutlich mehr Fehlern zu rechnen. Tesseract ist für Bildschirmschrift und gerade Scans am besten. Zuschneiden hilft.

## Tipps für beste Ergebnisse

- Screenshots in Originalauflösung verwenden, nicht verkleinert weitergeleitet (Messenger komprimieren!).
- Fotos, Werbung und Menüleisten mit **Zuschneiden** entfernen.
- Lange Rezepte: alle Screenshots auf einmal auswählen und **„Ein Rezept“** wählen.
- Bei schwierigen Vorlagen: **„Als Text“** im Zutatenbereich öffnen und die Liste in einem Rutsch korrigieren, oder den Rohtext unten bearbeiten und **„Aus Text neu auswerten“** tippen.
