# Handschrift

Eigene Handschrift einmal zeichnen, danach beliebigen Text darin setzen und als transparentes PNG
in GoodNotes einfügen. Läuft als Web-App (PWA) auf iPad/iPhone und am PC, komplett offline, ohne Server.

## Benutzen

1. **Zeichnen:** 114 Zeichen (a–z, A–Z, Umlaute, ß, Ziffern, Satz- und Anführungszeichen, Symbole wie + − = § @, Währungen € $ £ ¥) plus eigene. Zeichen auswählen, auf die Linien schreiben, *Speichern + weiter* (Enter).
   Pro Zeichen 3 Varianten (einstellbar). Varianten antippen = korrigieren, ✕ = löschen.
   Am PC: Buchstaben-Taste wählt das Zeichen, ←/→ blättert, Strg+Z = rückgängig, Entf = leeren.
   Mit Apple Pencil werden Finger/Handballen automatisch ignoriert.
2. **Schreiben:** Text einfügen. Farbe, Größe, Strichstärke, Zeilenabstand, Zeilenbreite, Unordnung, 🎲 neu würfeln.
3. **Kopieren für GoodNotes** legt ein transparentes PNG in die Zwischenablage → in GoodNotes einsetzen.
   Alternativ *Teilen …* (iPad: direkt an GoodNotes), *PNG*, *PDF* (A4, Vektor) oder das Vorschaubild
   in Split View direkt in GoodNotes ziehen.
4. **Daten:** Export/Import als `.json`, damit PC und iPad dieselben Buchstaben haben (und als Backup).

Gespeichert wird nur lokal im Browser (IndexedDB).

## Installieren

- **iPad/iPhone:** Seite in Safari öffnen → Teilen → *Zum Home-Bildschirm*.
- **PC:** In Edge/Chrome öffnen → Adressleiste *App installieren*.

## Entwickeln

Kein Build nötig. Lokal: `python -m http.server 8790` im Ordner, dann http://localhost:8790.
`tools/test-glyphs.js` zeichnet Testbuchstaben per Pointer-Events (nur für Tests).
Nach Änderungen `VERSION` in `sw.js` hochzählen, sonst liefert der Offline-Cache alte Dateien.
Icons: `python tools/make_icons.py`.
