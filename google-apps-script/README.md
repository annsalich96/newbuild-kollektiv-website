# Setup: Google Apps Script für die Event-Anmeldungen

> Letzte Aktualisierung: 2026-07-30

Kein Passwort nötig — du machst das kurz selbst über den Browser mit dem `newbuild kollektiv`-Google-Account, ich habe den Code schon fertig geschrieben.

## Schritt 1: "Senden als"-Alias einrichten (nur falls nötig)

Falls `request@newbuild-kollektiv.com` nicht die Haupt-Login-Adresse des Google-Accounts ist, sondern ein Alias:

1. In Gmail (eingeloggt als `newbuild kollektiv`-Account) → Zahnrad → **Alle Einstellungen ansehen**
2. Tab **Konten und Import** → Abschnitt "E-Mails senden als" → **Weitere E-Mail-Adresse hinzufügen**
3. `request@newbuild-kollektiv.com` eintragen, den Bestätigungsschritten folgen

Falls `request@newbuild-kollektiv.com` bereits die Haupt-Adresse des Accounts ist, diesen Schritt überspringen.

## Schritt 2: Apps-Script-Projekt anlegen

1. Im Browser, eingeloggt als `newbuild kollektiv`-Account: **script.google.com** öffnen
2. **Neues Projekt** klicken
3. Den vorhandenen Beispiel-Code im Editor komplett löschen
4. Den kompletten Inhalt der Datei `Code.gs` (liegt neben dieser Anleitung) einfügen
5. Oben links auf das Projekt klicken und umbenennen, z. B. "NewBuild Kollektiv — Event-Anmeldungen"
6. Speichern (Strg+S)

## Schritt 3: Als Web-App veröffentlichen

1. Oben rechts auf **Bereitstellen** → **Neue Bereitstellung**
2. Bei "Typ auswählen" (Zahnrad-Symbol) → **Web-App**
3. Einstellungen:
   - Ausführen als: **Ich** (dein Account)
   - Zugriff: **Jeder** (das Formular muss ohne eigenen Google-Login senden können)
4. **Bereitstellen** klicken
5. Google fragt nach Berechtigungen (Zugriff auf Drive/Gmail) — bestätigen. Falls eine Warnung "Diese App wurde nicht überprüft" erscheint: **Erweitert** → **Zu [Projektname] (unsicher) wechseln** — das ist normal bei eigenen, nicht veröffentlichten Skripten, keine Sorge.
6. Es erscheint eine **Web-App-URL** (endet auf `/exec`) — **diese URL brauche ich von dir zurück**, um sie im Formular einzutragen.

## Danach

Sobald ich die URL habe, trage ich sie im Code ein und mache einen Testlauf (eine echte Test-Anmeldung), um zu prüfen, ob:

- eine Google-Sheets-Datei im Ordner "NewBuild Kollektiv — Event-Anmeldungen" (in Google Drive) entsteht
- die Anmeldung dort korrekt eingetragen wird
- die Bestätigungsmail ankommt

## Falls du später den Code änderst

Bei jeder Code-Änderung im Skript-Editor muss erneut **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift-Symbol) → Neue Version → Bereitstellen** gemacht werden, sonst nutzt die Web-App weiter die alte Version.

## Update 2026-08-26: Benachrichtigungsmail bei neuer Anmeldung

`Code.gs` verschickt jetzt zusätzlich zur Bestätigungsmail an die anmeldende Person eine Benachrichtigungsmail an `request@newbuild-kollektiv.com` (Konstante `NOTIFY_EMAIL`), sobald sich jemand für ein Event einträgt (`sendAdminNotificationEmail`, aufgerufen in `doPost`).

Damit das live geht: den aktualisierten Inhalt von `Code.gs` im Apps-Script-Editor (script.google.com, eingeloggt als `newbuild kollektiv`-Account) einfügen und wie oben beschrieben neu bereitstellen (**Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version → Bereitstellen**).

## Update 2026-08-26: Alle Anmeldungen pro Event in einem Mail-Thread

Alle Benachrichtigungsmails zu einem Event landen jetzt in einem einzigen Gmail-Thread (Antwort statt neue Mail), damit sich Anmeldungen nicht in vielen Einzelmails verteilen. Dafür braucht das Skript jetzt `GmailApp.search()`, also einen größeren Berechtigungs-Scope als vorher (nicht mehr nur "E-Mails senden", sondern auch Mails lesen/durchsuchen). Beim nächsten Deploy erscheint deshalb voraussichtlich noch einmal die Google-Berechtigungsabfrage — normal bestätigen (ggf. wieder über "Erweitert" → "Zu [Projektname] (unsicher) wechseln", falls die Warnung erscheint).

## Update 2026-08-30: Slug-basierte Tabellen · Erinnerungsmails · Signatur

Drei Änderungen an `Code.gs`:

### 1. Event-Tabelle wird über den Slug gefunden, nicht mehr über den Titel

Bisher hieß die Tabelle `"Session 01 — <Titel>"` und wurde über diesen Namen gesucht. Sobald der Titel im CMS geändert wurde, fand das Skript die alte Tabelle nicht mehr und legte eine **zweite** an. Jetzt merkt sich das Skript pro `eventSlug` die Datei-ID (in den Skript-Eigenschaften). Der Titel darf sich beliebig ändern — die Datei wird dann nur **umbenannt**, nie neu angelegt. Bestehende Tabellen werden beim nächsten Eingang automatisch übernommen (Fallback über den bisherigen Namen). Das Formular schickt `eventSlug` bereits mit — keine Website-Änderung nötig.

### 2. Automatische Erinnerungs-E-Mails

Neue Funktion `sendeErinnerungen()` + stündlicher Zeit-Trigger. Verschickt pro Anmeldung:

| Stufe | Zeitpunkt | Status-Spalte in der Tabelle |
| --- | --- | --- |
| 1 Woche vorher | Tag `Event−7`, ab 9 Uhr | `Erinnerung 1 Woche` |
| 1 Tag vorher | Tag `Event−1`, ab 9 Uhr | `Erinnerung 1 Tag` |
| ~3 Stunden vorher | Eventtag, < 3 h bis Beginn | `Erinnerung 3 Std` |
| 1 Tag danach (Nachfass) | Tag `Event+1`, ab 9 Uhr | `Nachfass E-Mail` |

Die Status-Spalten legt das Skript in jeder Event-Tabelle bei Bedarf selbst an. Eine Mail geht nie doppelt raus (Spalte bekommt einen Zeitstempel, sobald verschickt). Datum/Zeit/Ort/Referent zieht das Skript aus den jeweiligen Spalten (erster befüllter Wert). `Status`-Werte mit „abgemeldet" / „storniert" / „abgesagt" werden übersprungen.

**Inhalt je Stufe** (bewusst unterschiedlich, nicht überall dasselbe):

| Stufe | Was drin ist |
| --- | --- |
| Bestätigung (sofort) | Eventkarte (sonst Eckdaten-Box) + Maps-Link **+ `.ics`-Anhang** + Abmelde-Link (seit 08.10.2026) |
| 1 Woche vorher | Terminzeile + Eventkarte + Maps-Link **+ `.ics`-Anhang** + Abmelde-Link (seit 13.10.2026; vorher bewusst nur Terminzeile) |
| 1 Tag vorher | volle Eckdaten-Box **+ `.ics`-Anhang** mit „Aufbrechen"-Wecker |
| ~3 Std vorher | Termin + Ort + Maps-Link **+ `.ics`-Anhang**, keine volle Box |
| 1 Tag danach | nur Danke + Feedback-Hinweis |

Die `.ics`-Datei enthält einen DISPLAY-Wecker `AUFBRUCH_VORLAUF_MIN` Minuten vor Beginn (Standard **90**, Konstante oben in `Code.gs`).

**Nach dem Deploy einmalig:**

1. Funktion **`zusatzspaltenJetztAnlegen`** ausführen — legt in jeder Event-Tabelle die Spalten **`Anrede`** (w/m, sonst „Hallo {Vorname}") und **`Referent`** (Name; ein Wert pro Tabelle reicht) an. Diese füllst du von Hand, bis das Formular sie mitschickt.
2. Funktion **`erinnerungenTriggerEinrichten`** ausführen — stündlicher Trigger. Kontrolle: **Trigger**-Menü (Wecker-Symbol links) → `sendeErinnerungen`, „Zeitgesteuert", „Stundentimer".

Projekt-Zeitzone muss auf **Europe/Berlin** stehen (Projekteinstellungen → Zahnrad).

Sendelimit: Consumer-Gmail 100 Mails/Tag, Workspace 1500/Tag. Bei großen Events verteilt sich eine Stufe automatisch über mehrere stündliche Läufe.

### 3. Signatur — kommt automatisch aus Gmail

Das Skript liest die **„Senden als"-Signatur** des Alias `request@newbuild-kollektiv.com` direkt aus den Gmail-Einstellungen des Kontos, unter dem es läuft (`gmailSignaturRoh_`, 1 h gecacht).

> [!important] Mehrere Signaturen angelegt → CEO muss die **Standard-Signatur für diese Adresse** sein
> Die Gmail-API kann Signaturen **nicht per Name** abrufen — sie liefert nur die eine, die für den Alias `request@newbuild-kollektiv.com` als Standard gesetzt ist. Also in **Gmail → Einstellungen → Allgemein → Signatur → „Standardeinstellungen für Signatur"**: für die Adresse `request@newbuild-kollektiv.com` unter *„FÜR NEUE E-MAILS VERWENDEN"* **und** *„BEI ANTWORTEN/WEITERLEITUNGEN VERWENDEN"* jeweils **CEO** auswählen. Dann liefert die API die CEO-Signatur.

**Dafür nötig:** im Apps-Script-Editor den erweiterten Dienst **Gmail API** hinzufügen — linke Leiste **Services** (`+`) → **Gmail API** → Hinzufügen (Kennung `Gmail`). Beim nächsten Deploy fragt Google zusätzlich die Berechtigung „Gmail-Einstellungen lesen" ab.

**Absicherung:** Falls die API nichts/das Falsche liefert, greift `SIGNATUR_HTML_FALLBACK` / `SIGNATUR_TEXT_FALLBACK` oben in `Code.gs`. Am besten dort einmal die echte CEO-Signatur als HTML einsetzen (eine NBK-Mail mit CEO-Signatur an sich selbst schicken und den Quelltext übernehmen).

Logo in der Signatur: nur als `<img src="https://…">` mit stabiler öffentlicher URL (Google-interne mail-sig-URLs laden extern teils nicht).

### Anrede

„Liebe/Lieber" statt „Hallo" kommt aus der Spalte **`Anrede`** (`w` / `m`), sonst „Hallo {Vorname}". Für bestehende Events von Hand füllen (Spalte via `zusatzspaltenJetztAnlegen`). Automatisch würde ein **Anrede-Feld im Anmeldeformular** gehen (`src/event-form.ts` + Template) — noch nicht gebaut.

### Website-Seite (mitgeliefert im selben Commit)

`src/event-form.ts` + `scripts/event-page.template.html` schicken jetzt auch **`eventSpeaker`** mit → ab dem nächsten Deploy landet der Referent bei jeder neuen Anmeldung automatisch in der Spalte `Referent`.

### Deploy

`Code.gs` komplett in den Editor kopieren → Gmail-API-Dienst hinzufügen (s. o.) → **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version → Bereitstellen**. Beim ersten Lauf fragt Google nach zusätzlichen Berechtigungen (Trigger anlegen, Tabellen schreiben, Gmail-Einstellungen lesen) — bestätigen. Danach `zusatzspaltenJetztAnlegen` und `erinnerungenTriggerEinrichten` je einmal ausführen.

## Update 2026-10-21: Mail-Texte in Google Docs (kein Code-Tausch mehr für Texte)

Die Texte aller automatischen Mails stehen pro Event in einem **Google Doc „Mail-Texte · <Event>“** (Drive: `NewBuild Kollektiv — Event-Anmeldungen/Mail-Texte`, freigegeben für salich@). Das Skript liest das Doc bei jedem Versand neu (`ausDoc_`) — Text ändern = Doc bearbeiten, fertig.

- Jede Mail = Abschnitt mit **Überschrift 1**: Bestätigung · 1 Woche vorher · 1 Tag vorher · 3 Stunden vorher · Rückblick – war da · Rückblick – nicht da. Erste Zeile `Betreff: …`.
- `[EVENTKARTE]` = Eventbild mit Datum/Ort/Maps. Kleine Schrift (≤ 10 pt) = kleine graue Schrift. Fett/kursiv/Links werden übernommen.
- Platzhalter `{Anrede} {Titel} {Kurztitel} {Datum} {Zeit} {Ort} {Referent} {Eventtag} {Minuten}`, Links `{Abmelde-Link: Text}` `{Feedback-Link: …}` `{Referent-Link: …}` `{Maps-Link: …}` `{Eventseite-Link: …}` `{Ich-war-da-Link: …}` (Absatz wird grauer Kasten).
- Fehlt Doc/Abschnitt oder ist er leer → Standardtext aus den `*Standard_`-Funktionen. `.ics` und Signatur kommen immer aus dem Code.
- Neue Docs legt `sendeErinnerungen` automatisch an (jedes CMS-Event, das höchstens 2 Tage zurückliegt), Info-Mail an salich@. Doc-ID in Skript-Eigenschaft `mailDoc_<slug>`.
- **Vorschau im Browser:** `newbuild-kollektiv.com/f/?do=mailvorschau&slug=<slug>` (Link steht oben im Doc) · **Testmail aller Mails an salich@:** `…/f/?do=mailtest&slug=<slug>`. Bewusst über die Website: direkte `script.google.com`-Links scheitern bei mehreren angemeldeten Google-Konten.

Einmalig nach dem Einspielen: `mailTexteDocsJetztAnlegen` ausführen (fragt die Google-Docs-Berechtigung ab) und neue Version bereitstellen (für die Vorschau-/Testmail-Links).

## Update 2026-10-24: Foto-/Video-Ordner und Media Contacts

- Drive-Ordner **BILDER_VIDEOS** (request@, ID in `MEDIEN_ORDNER_ID`): pro Event `"<Nummer>: <Kurztitel>"` mit `Photos` · `Photos_watermarked` · `Videos`. `sendeErinnerungen` legt ihn für jedes CMS-Event an (auch vergangene; Name bis zum ersten „:“ bzw. „ - “ des Titels); vorhandene, von Hand angelegte Ordner werden über den Namensanfang `"<Nummer>:"` gefunden und nur um fehlende Unterordner ergänzt. Ordner-ID in Skript-Eigenschaft `medienOrdner_<slug>`.
- Tabelle **Media Contacts** (im selben Ordner, freigegeben für salich@):
  - `Kontakte`: Name · Rolle (Foto/Video) · E-Mail · Priorität (A/B) · Aktiv · Credit im Wasserzeichen · Telefon · Honorar · Notizen
  - `Einsätze`: eine Zeile pro Event (legt das Skript an). Ann wählt **Fotograf:in** / **Videograf:in** per Dropdown → Person bekommt Bearbeitungszugriff auf `Photos` bzw. `Videos` (ohne Google-Benachrichtigung, Drive-API-Dienst) und, falls das Event höchstens 2 Tage zurückliegt, eine Mail mit Upload-Link. `Zugang Foto/Video` merkt, wer Zugang hat; Zugang wird nie automatisch entzogen.
- Noch nicht gebaut: Wasserzeichen (GitHub Actions), Foto-Mail an Anwesende (eigener Abschnitt im Mail-Texte-Doc, X Tage nach dem Event), A/B-Anfragelogik.

Einspielen: `Code.gs` in den Editor kopieren → Dienste **+ → Drive API (v3)** hinzufügen → `medienJetztEinrichten` einmal ausführen (Berechtigungen bestätigen). Keine neue Bereitstellung nötig (läuft nur im Zeit-Trigger).

### Anfragen an Fotograf:innen/Videograf:innen (A → B), seit 24.10.2026

- Für jedes **kommende** Event, bei dem in „Einsätze“ noch niemand für Foto bzw. Video steht, fragt `medienAnfragen_` sofort den aktiven Kontakt mit Priorität **A** an (Reihenfolge A → B → C, `MEDIEN_PRIORITAETEN`) (Mail mit Zusage-/Absage-Link, Honorar falls in „Kontakte“ eingetragen). Erinnerung nach 2 Tagen, nach 3 Tagen ohne Antwort oder bei Absage → **B**, dann **C**. Niemand mehr übrig → einmalige Mail an salich@.
- Links: `newbuild-kollektiv.com/f/?do=medien&t=<token>&a=ja|nein` (Seite mit Bestätigungs-Knopf, damit Link-Vorschauen nichts auslösen) → `doPost` action `medien` → `medienAntwortVerarbeiten_`. Zusage trägt den Namen in „Einsätze“ ein; der nächste Lauf gibt Zugang und schickt den Upload-Link. Späte Zusage, wenn die Rolle schon vergeben ist → Info an Ann statt Doppelbuchung. Absage nach Zusage → Name wird geleert, nächste Person angefragt (Ordnerzugriff bleibt, ggf. von Hand entziehen).
- Verlauf im Blatt **Anfragen** (Media Contacts). Texte (Anfrage, Erinnerung, Upload-Link) im Doc **„Mail-Texte · Fotograf:innen & Videograf:innen“** (Ordner Mail-Texte), Platzhalter siehe Doc.
- Einspielen: Code.gs kopieren → **neue Version bereitstellen** (doPost geändert) → `medienJetztEinrichten` einmal ausführen (legt Blatt „Anfragen“ und das Doc an).
