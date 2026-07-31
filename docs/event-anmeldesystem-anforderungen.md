# Anforderungen: Event-Anmeldesystem (NewBuild Kollektiv)

> Letzte Aktualisierung: 2026-07-30
> Status: Bestätigungsmail + Sheet-Eintrag erfolgreich live getestet (Xavi, 2026-07-30). Offen: Erinnerungs-E-Mail-Automatisierung.

## Ausgangslage

Von Xavi am 2026-07-30 als Zusammenfassung (aus ChatGPT) geliefert, explizit als "nur lesen, nicht umsetzen" markiert. Wird nach seiner Pause gemeinsam angegangen.

## 1. Event-Detailseite

- Eigene Unterseite pro Event, Aufruf über "Anmelden"-Button
- Inhalte: Titel, Datum, Uhrzeit, Ort, Beschreibung, Referenten-Infos, Anmeldeformular

## 2. Anmeldeformular

- Felder: Vorname, Nachname, E-Mail, Unternehmen/Position (optional), Datenschutz-Zustimmung
- Verbindlicher Anmeldebutton, Erfolgsbestätigung nach Absenden

## 3. Google Sheets Anbindung

- **Entscheidung (2026-07-30, von Xavi bestätigt):** Pro Event ein eigenes, separates Google-Sheets-Dokument — NICHT eine zentrale Datei mit mehreren Tabellenblättern.
- Benennung des Dokuments nach dem jeweiligen Event
- Gespeicherte Felder: Name, E-Mail, Unternehmen, Position, Anmeldedatum/-zeit, Status (angemeldet/bestätigt/abgesagt)
- Ablage im NewBuild-Kollektiv-Google-Account

## 4. Automatische Bestätigungs-E-Mail

- Sofort nach Anmeldung, Absender request@newbuildkollektiv… (genaue Domain noch zu klären, siehe unten)
- Inhalt: Dank, Event-Name/Datum/Zeit/Ort, ggf. Kalenderlink, Kontakt bei Rückfragen/Absage

## 5. Automatisierte Erinnerungs-E-Mail

- Einige Tage vor dem Event, Empfänger aus dem jeweiligen Google Sheet
- Individueller Text pro Event, optional zweite Erinnerung am Veranstaltungstag

## 6. Verwaltung im Website-Backend

- Events selbstständig anlegen/bearbeiten (Referent, Bilder, Anmeldefrist, max. Teilnehmerzahl)
- Anmeldung schließen/Warteliste aktivieren
- Zugehöriges Google Sheet + E-Mail-Texte automatisch dem Event zuordnen

## Offene Punkte (vor Umsetzung zu klären)

1. ~~Exakte Absender-E-Mail-Adresse~~ **Geklärt (Ann, 2026-07-30):** `request@newbuild-kollektiv.com`
2. ~~Eine zentrale Datei vs. eine Datei pro Event~~ **Geklärt:** eine Datei pro Event.
3. ~~Technischer Ansatz~~ **Geklärt (Ann, 2026-07-30):** Google Apps Script, Xavi hat Zugriff auf den `newbuild kollektiv`-Google-Account und übernimmt das Deployment selbst (Anleitung liegt bereit).

## Umsetzungsstand (2026-07-30)

- Event-Detailseiten (automatisch aus `src/content/events.json` generiert) + Anmeldeformular: fertig, live
- Google Apps Script (`google-apps-script/Code.gs`): fertig, deployed, `REGISTRATION_ENDPOINT` in `src/event-form.ts` gesetzt — echter Testlauf von Xavi erfolgreich (Sheet entstanden, Eintrag korrekt, Bestätigungsmail angekommen)
- **Wichtiger Fund unterwegs behoben:** JSON-Content-Type löst im Browser einen CORS-Preflight aus, den Apps-Script-Web-Apps nicht beantworten — Formular sendet jetzt als `text/plain`, Skript liest den Body trotzdem als JSON
- **Ordnerstruktur (Ergänzung/Entscheidung Xavi, 2026-07-30):** Im Drive-Ordner "NewBuild Kollektiv — Event-Anmeldungen" gibt es jetzt einen Unterordner **"Events"** für alle einzelnen Session-Tabellen, und direkt im Hauptordner eine zusätzliche Tabelle **"History Anmeldungen"** — dort wird jede Person, die sich jemals für irgendein Event angemeldet hat, genau einmal gelistet (Dopplungen werden per E-Mail-Adresse erkannt; bei erneuter Anmeldung wird "Letztes Event" und "Anzahl Anmeldungen" aktualisiert statt einer neuen Zeile). Umgesetzt in `Code.gs`, Xavi muss die neue Skript-Version noch als neue Bereitstellung veröffentlichen (siehe README "Falls du später den Code änderst").
- **Bekannte Alt-Daten:** Die eine Test-Anmeldung von vor der Ordner-Umstrukturierung liegt noch direkt im Hauptordner statt im "Events"-Unterordner — kann bei Gelegenheit manuell per Drag&Drop verschoben werden, kein automatisches Migrationsskript.
- **Noch offen:** automatisierte Erinnerungs-E-Mail vor dem Event-Datum (Punkt 5 oben) — separater Trigger, noch nicht begonnen

## Technischer Hinweis (eigene Einschätzung, noch nicht mit Xavi abgestimmt)

NewBuild Kollektiv ist aktuell eine rein statische Website (Vite, kein eigener Server, siehe [[project_website_newbuild_kollektiv]]). Für die Google-Sheets-Eintragung und den E-Mail-Versand wird ein serverseitiger Baustein nötig sein (z. B. Cloudflare Worker oder Google Apps Script als Web-Endpunkt) — Google-Zugangsdaten dürfen nicht im Client-Code der Website landen.

**Why:** Diese Anforderungen kamen als fertige externe Vorgabe (ChatGPT-Zusammenfassung), nicht aus dem Code ableitbar — müssen vor der nächsten Session zum Thema als Ausgangspunkt vorliegen.
**How to apply:** Erst wenn Xavi das Startsignal gibt, mit der Umsetzung beginnen — nicht von sich aus loslegen, auch wenn diese Datei existiert.
